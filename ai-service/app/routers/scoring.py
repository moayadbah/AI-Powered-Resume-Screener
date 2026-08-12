"""POST /score"""

import time

from fastapi import APIRouter, Depends, Request

from app.auth import require_service_token
from app.config import get_settings
from app.models.schemas import ScoreRequest, ScoreResponse, Weights
from app.services.scoring import score_batch

router = APIRouter(tags=["scoring"], dependencies=[Depends(require_service_token)])


@router.post("/score", response_model=ScoreResponse, response_model_by_alias=True)
async def score(body: ScoreRequest, request: Request) -> ScoreResponse:
    settings = get_settings()
    started = time.perf_counter()

    results = score_batch(
        embedder=request.app.state.embedder,
        settings=settings,
        job_description=body.job_description,
        required_skills=body.required_skills,
        resumes=body.resumes,
    )

    return ScoreResponse(
        results=results,
        model_version=settings.model_version,
        weights=Weights(semantic=settings.semantic_weight, skill=settings.skill_weight),
        duration_ms=int((time.perf_counter() - started) * 1000),
    )
