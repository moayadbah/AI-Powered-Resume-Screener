"""Summarizer tests.

Ollama is always stubbed. Hitting a real model would be slow and its output
changes, which makes tests flaky in the way that teaches people to ignore
failures.

The contract point being defended here: every failure path returns 200 with
nulls and a reason. This endpoint never raises.
"""

import httpx
import pytest
import respx

from app.models.schemas import SummarizeRequest
from app.services.summarizer import (
    MAX_BULLETS,
    MAX_SUMMARY_CHARS,
    PROMPT_VERSION,
    build_prompt,
    extract_json,
    summarize,
)

GENERATE = "http://127.0.0.1:1/api/generate"


@pytest.fixture
def req(resumes, jobs):
    return SummarizeRequest(
        resume_id="strong-backend",
        resume_text=resumes["strong-backend"],
        job_description=jobs["backend-engineer"]["description"],
        matched_skills=["java", "spring boot"],
        missing_skills=["rest api"],
    )


def ollama_says(payload: str) -> httpx.Response:
    return httpx.Response(200, json={"response": payload})


# --------------------------------------------------------------------------
# JSON extraction - small models wrap their output in all sorts of things
# --------------------------------------------------------------------------


def test_extract_plain_json():
    assert extract_json('{"summary": "ok"}') == {"summary": "ok"}


def test_extract_from_code_fence():
    assert extract_json('```json\n{"summary": "ok"}\n```') == {"summary": "ok"}


def test_extract_from_surrounding_prose():
    raw = 'Sure! Here is the JSON:\n{"summary": "ok"}\nHope that helps.'
    assert extract_json(raw) == {"summary": "ok"}


def test_extract_returns_none_for_garbage():
    assert extract_json("no json here") is None
    assert extract_json("") is None
    assert extract_json("[1, 2, 3]") is None


# --------------------------------------------------------------------------
# Degradation - the whole point of this module
# --------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "failure,expected",
    [
        (httpx.ConnectError("refused"), "ollama_unreachable"),
        (httpx.ReadTimeout("too slow"), "ollama_timeout"),
    ],
)
async def test_degrades_without_raising(req, settings, failure, expected):
    async with httpx.AsyncClient() as client:
        with respx.mock:
            respx.post(GENERATE).mock(side_effect=failure)
            result = await summarize(req, settings, client)

    assert result.degraded is True
    assert result.degraded_reason == expected
    assert result.summary is None
    assert result.strengths is None
    assert result.concerns is None
    # Still reports which prompt and model it would have used.
    assert result.prompt_version == PROMPT_VERSION


@pytest.mark.asyncio
async def test_unparseable_response_degrades_after_one_retry(req, settings):
    async with httpx.AsyncClient() as client:
        with respx.mock:
            route = respx.post(GENERATE).mock(
                return_value=ollama_says("I'm afraid I can't do that")
            )
            result = await summarize(req, settings, client)

    assert result.degraded is True
    assert result.degraded_reason == "invalid_json"
    # Retried exactly once, not repeatedly.
    assert route.call_count == 2


@pytest.mark.asyncio
async def test_retry_recovers_from_a_formatting_slip(req, settings):
    async with httpx.AsyncClient() as client:
        with respx.mock:
            respx.post(GENERATE).mock(
                side_effect=[
                    ollama_says("not json at all"),
                    ollama_says(
                        '{"summary": "Solid backend match.", "strengths": [], "concerns": []}'
                    ),
                ]
            )
            result = await summarize(req, settings, client)

    assert result.degraded is False
    assert result.summary == "Solid backend match."


@pytest.mark.asyncio
async def test_http_error_degrades(req, settings):
    async with httpx.AsyncClient() as client:
        with respx.mock:
            respx.post(GENERATE).mock(return_value=httpx.Response(500))
            result = await summarize(req, settings, client)

    assert result.degraded is True
    assert result.degraded_reason == "invalid_json"


@pytest.mark.asyncio
async def test_empty_summary_counts_as_degraded(req, settings):
    async with httpx.AsyncClient() as client:
        with respx.mock:
            respx.post(GENERATE).mock(return_value=ollama_says('{"summary": "  "}'))
            result = await summarize(req, settings, client)

    assert result.degraded is True


@pytest.mark.asyncio
async def test_disabled_short_circuits_without_calling_ollama(req, settings):
    disabled = settings.model_copy(update={"summary_enabled": False})
    async with httpx.AsyncClient() as client:
        with respx.mock:
            route = respx.post(GENERATE).mock(return_value=ollama_says("{}"))
            result = await summarize(req, disabled, client)

    assert result.degraded is True
    assert result.degraded_reason == "disabled"
    assert route.call_count == 0


# --------------------------------------------------------------------------
# Success path and the caps
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_success(req, settings):
    body = {
        "summary": "Strong Java backend background with four years on Spring Boot.",
        "strengths": ["4 years Spring Boot", "Owns containerized deploys"],
        "concerns": ["No explicit API design ownership"],
    }
    async with httpx.AsyncClient() as client:
        with respx.mock:
            respx.post(GENERATE).mock(return_value=ollama_says(__import__("json").dumps(body)))
            result = await summarize(req, settings, client)

    assert result.degraded is False
    assert result.degraded_reason is None
    assert result.summary == body["summary"]
    assert result.strengths == body["strengths"]
    assert result.concerns == body["concerns"]
    assert result.resume_id == "strong-backend"


# The model does not reliably respect limits it was asked to respect, so the
# caps are enforced in code - api-service and the UI are sized for them.
@pytest.mark.asyncio
async def test_caps_are_enforced_in_code(req, settings):
    body = {
        "summary": "x" * 2000,
        "strengths": [f"strength {i}" for i in range(10)],
        "concerns": ["y" * 400],
    }
    async with httpx.AsyncClient() as client:
        with respx.mock:
            respx.post(GENERATE).mock(return_value=ollama_says(__import__("json").dumps(body)))
            result = await summarize(req, settings, client)

    assert len(result.summary) == MAX_SUMMARY_CHARS
    assert len(result.strengths) == MAX_BULLETS
    assert all(len(c) <= 120 for c in result.concerns)


# --------------------------------------------------------------------------
# Prompt
# --------------------------------------------------------------------------


def test_prompt_truncates_long_resumes(req):
    long_req = req.model_copy(update={"resume_text": "word " * 50_000})
    prompt = build_prompt(long_req)
    assert len(prompt) < 20_000


def test_prompt_carries_the_no_inference_instruction(req):
    prompt = build_prompt(req).lower()
    # Load-bearing, not decoration: a small model will comment on a career gap
    # or a name if you let it.
    assert "do not infer" in prompt
    assert "nationality" in prompt


def test_prompt_includes_the_skill_lists(req):
    prompt = build_prompt(req)
    assert "java" in prompt
    assert "rest api" in prompt
