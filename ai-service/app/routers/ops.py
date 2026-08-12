"""GET /health and GET /model-info"""

import logging

import httpx
from fastapi import APIRouter, Depends, Request

from app.auth import require_service_token
from app.config import get_settings
from app.models.schemas import HealthResponse, ModelInfoResponse, Weights
from app.services.summarizer import PROMPT_VERSION

log = logging.getLogger(__name__)

router = APIRouter(tags=["ops"])


@router.get("/health", response_model=HealthResponse, response_model_by_alias=True)
async def health(request: Request) -> HealthResponse:
    """Unauthenticated.

    ollamaReachable being false does NOT make this unhealthy - scoring still
    works and summaries degrade. Compose must not restart the container over it.
    """
    settings = get_settings()
    embedder = request.app.state.embedder

    reachable = False
    try:
        response = await request.app.state.http.get(
            f"{settings.ollama_base_url.rstrip('/')}/api/tags", timeout=2.0
        )
        reachable = response.status_code == 200
    except httpx.HTTPError:
        # Expected whenever Ollama is not running. Not worth a log line on every
        # health check.
        reachable = False

    return HealthResponse(
        status="ok" if embedder.ready else "loading",
        model_loaded=embedder.ready,
        ollama_reachable=reachable,
    )


@router.get(
    "/model-info",
    response_model=ModelInfoResponse,
    response_model_by_alias=True,
    dependencies=[Depends(require_service_token)],
)
async def model_info(request: Request) -> ModelInfoResponse:
    """Reports what is actually loaded, not hardcoded strings.

    api-service calls this once at startup and logs it, so every run records
    what produced its scores.
    """
    settings = get_settings()
    embedder = request.app.state.embedder

    return ModelInfoResponse(
        embedding_model=settings.embedding_model,
        embedding_revision=settings.embedding_revision,
        model_version=settings.model_version,
        dimensions=embedder.dimensions,
        max_sequence_length=embedder.max_sequence_length,
        ollama_model=settings.ollama_model,
        prompt_version=PROMPT_VERSION,
        weights=Weights(semantic=settings.semantic_weight, skill=settings.skill_weight),
    )
