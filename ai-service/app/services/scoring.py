"""Compose the final score.

Deterministic: the same request always produces the same numbers for a given
model version and weight configuration. No language model is involved - that is
what makes the ranking reproducible and the tests meaningful.

See docs/04-AI-SERVICE.md sections 4-6.
"""

import logging

from app.config import Settings
from app.models.schemas import ResumeInput, ScoreResult
from app.services.embeddings import Embedder, cosine_against
from app.services.sectioning import split_sections
from app.services.skills import match_skills, skill_score

log = logging.getLogger(__name__)


def score_batch(
    embedder: Embedder,
    settings: Settings,
    job_description: str,
    required_skills: list[str],
    resumes: list[ResumeInput],
) -> list[ScoreResult]:
    """Score every resume against one job description. Order is preserved."""
    normalized_skills = [s.strip().lower() for s in required_skills if s.strip()]

    # Chunk everything first so the whole batch goes through the model in one
    # call - the job description included.
    per_resume_chunks: list[list[str]] = []
    for resume in resumes:
        try:
            per_resume_chunks.append(split_sections(resume.text))
        except Exception:
            log.exception("sectioning failed for resume %s", resume.resume_id)
            per_resume_chunks.append([])

    flat: list[str] = [job_description]
    spans: list[tuple[int, int]] = []
    for chunks in per_resume_chunks:
        start = len(flat)
        flat.extend(chunks)
        spans.append((start, len(flat)))

    vectors = embedder.encode(flat)
    job_vector = vectors[0]

    results: list[ScoreResult] = []
    for resume, (start, end) in zip(resumes, spans, strict=True):
        try:
            results.append(
                _score_one(
                    settings=settings,
                    resume=resume,
                    chunk_vectors=vectors[start:end],
                    job_vector=job_vector,
                    required_skills=normalized_skills,
                )
            )
        except Exception:
            # One bad resume must not fail the batch - the other 49 results are
            # still worth returning.
            log.exception("scoring failed for resume %s", resume.resume_id)
            results.append(_zero_result(resume.resume_id, normalized_skills))

    return results


def _score_one(
    settings: Settings,
    resume: ResumeInput,
    chunk_vectors,
    job_vector,
    required_skills: list[str],
) -> ScoreResult:
    if chunk_vectors.size == 0:
        return _zero_result(resume.resume_id, required_skills)

    sims = cosine_against(job_vector, chunk_vectors)

    # Max-pool, not mean. A strong experience section should not be diluted by a
    # long hobbies section, and mean-pooling would reward short resumes.
    semantic = float(sims.max())

    # Cosine can go slightly negative; a negative score is nonsense to display.
    semantic = min(1.0, max(0.0, semantic))

    matched, missing = match_skills(resume.text, required_skills)
    skills = skill_score(matched, required_skills)

    combined = settings.semantic_weight * semantic + settings.skill_weight * skills
    score = int(round(100 * combined))

    return ScoreResult(
        resume_id=resume.resume_id,
        score=max(0, min(100, score)),
        semantic_score=round(semantic, 4),
        skill_score=round(skills, 4),
        matched_skills=matched,
        missing_skills=missing,
    )


def _zero_result(resume_id: str, required_skills: list[str]) -> ScoreResult:
    """What a resume we could not process looks like.

    Everything is reported as missing rather than unknown, so the recruiter sees
    a real row instead of a gap.
    """
    return ScoreResult(
        resume_id=resume_id,
        score=0,
        semantic_score=0.0,
        skill_score=0.0,
        matched_skills=[],
        missing_skills=list(required_skills),
    )
