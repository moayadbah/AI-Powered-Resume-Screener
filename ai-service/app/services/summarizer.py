"""Ollama summarization.

Off the scoring path and allowed to fail softly: every failure returns a
degraded result rather than raising. If this breaks, recruiters lose the prose
but keep the ranking.

See docs/04-AI-SERVICE.md section Summarization.
"""

import json
import logging
import re

import httpx

from app.config import Settings
from app.models.schemas import SummarizeRequest, SummarizeResponse

log = logging.getLogger(__name__)

# Bump this when the template below changes. It is recorded on every screening,
# and it is how we explain why last week's summaries read differently.
PROMPT_VERSION = "v1"

MAX_RESUME_CHARS = 4000
MAX_SUMMARY_CHARS = 600
MAX_BULLETS = 3
MAX_BULLET_CHARS = 120

PROMPT_TEMPLATE = """You are helping a recruiter review a candidate. Be factual and concise.
Only use information present in the resume. Do not speculate about the
candidate's background, and do not infer anything about age, gender,
nationality, or personal circumstances.

JOB DESCRIPTION:
{job_description}

SKILLS THE CANDIDATE HAS: {matched_skills}
SKILLS NOT FOUND IN THE RESUME: {missing_skills}

RESUME:
{resume_text}

Respond with JSON only, matching this shape exactly:
{{
  "summary": "<2-3 sentences on how this candidate's experience relates to the role>",
  "strengths": ["<short phrase>", "..."],
  "concerns": ["<short phrase>", "..."]
}}

Rules:
- summary: at most {max_summary} characters.
- strengths: at most {max_bullets} items, each at most {max_bullet} characters.
- concerns: at most {max_bullets} items, each at most {max_bullet} characters. Concerns must be
  about skills or experience relevant to this job, never about the person.
- If the resume is too short or unclear to judge, say so in the summary.
"""

_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.IGNORECASE)


def build_prompt(req: SummarizeRequest) -> str:
    return PROMPT_TEMPLATE.format(
        job_description=req.job_description,
        matched_skills=", ".join(req.matched_skills) or "none identified",
        missing_skills=", ".join(req.missing_skills) or "none identified",
        # A 3B model cannot use a whole resume, and long inputs are what make
        # generation slow.
        resume_text=req.resume_text[:MAX_RESUME_CHARS],
        max_summary=MAX_SUMMARY_CHARS,
        max_bullets=MAX_BULLETS,
        max_bullet=MAX_BULLET_CHARS,
    )


def extract_json(raw: str) -> dict | None:
    """Pull a JSON object out of a model response.

    Even in JSON mode a small model sometimes wraps output in prose or a code
    fence, so take the outermost {...} rather than trusting the whole string.
    """
    if not raw or not raw.strip():
        return None

    candidate = _FENCE_RE.sub("", raw.strip())
    try:
        parsed = json.loads(candidate)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        pass

    start = candidate.find("{")
    end = candidate.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        parsed = json.loads(candidate[start : end + 1])
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


def _clean_bullets(value) -> list[str] | None:
    if not isinstance(value, list):
        return None
    out = [str(item).strip()[:MAX_BULLET_CHARS] for item in value if str(item).strip()]
    return out[:MAX_BULLETS]


def _degraded(req: SummarizeRequest, settings: Settings, reason: str) -> SummarizeResponse:
    return SummarizeResponse(
        resume_id=req.resume_id,
        summary=None,
        strengths=None,
        concerns=None,
        degraded=True,
        degraded_reason=reason,
        prompt_version=PROMPT_VERSION,
        model=settings.ollama_model,
    )


async def summarize(
    req: SummarizeRequest,
    settings: Settings,
    client: httpx.AsyncClient,
) -> SummarizeResponse:
    """Always returns a response. Never raises."""
    if not settings.summary_enabled:
        return _degraded(req, settings, "disabled")

    payload = {
        "model": settings.ollama_model,
        "prompt": build_prompt(req),
        "stream": False,
        "format": "json",
        "options": {
            # Low: we want description, not invention.
            "temperature": 0.2,
            # Caps the response so a rambling model cannot blow the timeout.
            "num_predict": 300,
        },
    }

    raw, reason = await _generate(payload, settings, client)
    if raw is None:
        return _degraded(req, settings, reason or "ollama_unreachable")

    parsed = extract_json(raw)
    if parsed is None:
        # One retry is worth it for a formatting slip; a second is not.
        log.warning("unparseable response for %s, retrying once", req.resume_id)
        raw, reason = await _generate(payload, settings, client)
        parsed = extract_json(raw) if raw is not None else None

    if parsed is None or not str(parsed.get("summary", "")).strip():
        return _degraded(req, settings, "invalid_json")

    # Enforce the caps in code. The model does not reliably respect limits it
    # was asked to respect, and api-service and the UI are sized for these.
    return SummarizeResponse(
        resume_id=req.resume_id,
        summary=str(parsed["summary"]).strip()[:MAX_SUMMARY_CHARS],
        strengths=_clean_bullets(parsed.get("strengths")),
        concerns=_clean_bullets(parsed.get("concerns")),
        degraded=False,
        degraded_reason=None,
        prompt_version=PROMPT_VERSION,
        model=settings.ollama_model,
    )


async def _generate(
    payload: dict,
    settings: Settings,
    client: httpx.AsyncClient,
) -> tuple[str | None, str | None]:
    """POST to Ollama.

    Returns (response_text, None) on success and (None, reason) on failure. The
    reason is returned rather than stored anywhere: concurrent requests would
    otherwise overwrite each other's failure reason.
    """
    url = f"{settings.ollama_base_url.rstrip('/')}/api/generate"
    try:
        response = await client.post(url, json=payload, timeout=settings.ollama_timeout_seconds)
        response.raise_for_status()
        return response.json().get("response", ""), None
    except (httpx.ConnectError, httpx.ConnectTimeout):
        log.warning("ollama unreachable at %s", url)
        return None, "ollama_unreachable"
    except (httpx.ReadTimeout, httpx.WriteTimeout, httpx.PoolTimeout):
        log.warning("ollama timed out after %ss", settings.ollama_timeout_seconds)
        return None, "ollama_timeout"
    except httpx.HTTPStatusError as exc:
        log.warning("ollama returned HTTP %s", exc.response.status_code)
        return None, "invalid_json"
    except (json.JSONDecodeError, ValueError):
        log.warning("ollama response body was not JSON")
        return None, "invalid_json"
