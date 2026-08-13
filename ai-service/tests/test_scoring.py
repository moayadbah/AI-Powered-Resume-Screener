"""Scoring tests.

Assert ordering and bands, never exact floats. Embedding output shifts with
torch and sentence-transformers versions and with hardware, so `score == 82`
passes here and fails in CI for reasons unrelated to any change.

See docs/08-TESTING.md.
"""

import pytest

from app.models.schemas import ResumeInput
from app.services.scoring import score_batch


@pytest.fixture(scope="module")
def score_all(embedder, settings, jobs, resumes):
    def run(job_name: str, names: list[str]) -> dict:
        job = jobs[job_name]
        results = score_batch(
            embedder=embedder,
            settings=settings,
            job_description=job["description"],
            required_skills=[s.lower() for s in job["requiredSkills"]],
            resumes=[ResumeInput(resume_id=n, text=resumes[n]) for n in names],
        )
        return {r.resume_id: r for r in results}

    return run


ALL = ["strong-backend", "partial-backend", "career-changer", "unrelated-designer"]


def test_relevant_resume_outranks_unrelated(score_all):
    r = score_all("backend-engineer", ["strong-backend", "unrelated-designer"])
    assert r["strong-backend"].score > r["unrelated-designer"].score


def test_documented_ordering_holds(score_all):
    """The ordering docs/fixtures/README.md promises."""
    r = score_all("backend-engineer", ALL)
    ranked = sorted(ALL, key=lambda n: r[n].score, reverse=True)
    assert ranked == [
        "strong-backend",
        "partial-backend",
        "career-changer",
        "unrelated-designer",
    ], {n: r[n].score for n in ALL}


def test_designer_ranks_last_on_both_jobs(score_all):
    for job in ["backend-engineer", "data-analyst"]:
        r = score_all(job, ALL)
        worst = min(ALL, key=lambda n: r[n].score)
        assert worst == "unrelated-designer", job


def test_strong_match_lands_in_a_high_band(score_all):
    assert score_all("backend-engineer", ["strong-backend"])["strong-backend"].score >= 60


def test_unrelated_lands_in_a_low_band(score_all):
    r = score_all("backend-engineer", ["unrelated-designer"])["unrelated-designer"]
    assert r.score <= 45


# Determinism is a guarantee we make in the architecture doc, not an accident.
def test_scoring_is_deterministic(score_all):
    first = score_all("backend-engineer", ALL)
    second = score_all("backend-engineer", ALL)
    assert [first[n].score for n in ALL] == [second[n].score for n in ALL]
    assert [first[n].semantic_score for n in ALL] == [second[n].semantic_score for n in ALL]


def test_scores_are_ints_in_range(score_all):
    for result in score_all("backend-engineer", ALL).values():
        assert isinstance(result.score, int)
        assert 0 <= result.score <= 100
        assert 0.0 <= result.semantic_score <= 1.0
        assert 0.0 <= result.skill_score <= 1.0


def test_matched_and_missing_partition_required_skills(score_all, jobs):
    required = [s.lower() for s in jobs["backend-engineer"]["requiredSkills"]]
    for result in score_all("backend-engineer", ALL).values():
        assert sorted(result.matched_skills + result.missing_skills) == sorted(required)


# Max-pool, not mean: a long irrelevant section must not dilute a strong match.
def test_irrelevant_padding_does_not_collapse_the_score(embedder, settings, jobs, resumes):
    job = jobs["backend-engineer"]
    hobbies = "\n\nINTERESTS\nI enjoy hiking, baking sourdough and vintage cameras. " * 8

    def run(text):
        return score_batch(
            embedder=embedder,
            settings=settings,
            job_description=job["description"],
            required_skills=[s.lower() for s in job["requiredSkills"]],
            resumes=[ResumeInput(resume_id="x", text=text)],
        )[0]

    base = run(resumes["strong-backend"]).score
    padded = run(resumes["strong-backend"] + hobbies).score
    assert padded >= base - 5, f"base={base} padded={padded}"


def test_short_resume_still_scores(score_all):
    r = score_all("backend-engineer", ["minimal"])["minimal"]
    assert r.score > 0


def test_empty_required_skills_gives_purely_semantic_score(embedder, settings, jobs, resumes):
    job = jobs["backend-engineer"]
    result = score_batch(
        embedder=embedder,
        settings=settings,
        job_description=job["description"],
        required_skills=[],
        resumes=[ResumeInput(resume_id="a", text=resumes["strong-backend"])],
    )[0]
    assert result.skill_score == 0.0
    assert result.matched_skills == []
    assert result.missing_skills == []
    # Capped at the semantic weight, so lower absolute numbers - as documented.
    assert result.score <= round(100 * settings.semantic_weight)


# One bad resume must not fail the batch.
def test_batch_survives_a_resume_that_cannot_be_sectioned(
    embedder, settings, jobs, resumes, monkeypatch
):
    import app.services.scoring as scoring_mod

    real = scoring_mod.split_sections

    def explode(text: str):
        if "BOOM" in text:
            raise RuntimeError("simulated sectioning failure")
        return real(text)

    monkeypatch.setattr(scoring_mod, "split_sections", explode)

    job = jobs["backend-engineer"]
    results = score_batch(
        embedder=embedder,
        settings=settings,
        job_description=job["description"],
        required_skills=[s.lower() for s in job["requiredSkills"]],
        resumes=[
            ResumeInput(resume_id="good", text=resumes["strong-backend"]),
            ResumeInput(resume_id="bad", text="BOOM"),
        ],
    )

    assert len(results) == 2
    by_id = {r.resume_id: r for r in results}
    assert by_id["good"].score > 0
    assert by_id["bad"].score == 0
    assert by_id["bad"].matched_skills == []


def test_results_preserve_request_order(embedder, settings, jobs, resumes):
    job = jobs["backend-engineer"]
    order = ["unrelated-designer", "strong-backend", "minimal"]
    results = score_batch(
        embedder=embedder,
        settings=settings,
        job_description=job["description"],
        required_skills=[],
        resumes=[ResumeInput(resume_id=n, text=resumes[n]) for n in order],
    )
    assert [r.resume_id for r in results] == order
