"""POST /summarize"""

from fastapi import APIRouter, Depends, Request

from app.auth import require_service_token
from app.config import get_settings
from app.models.schemas import SummarizeRequest, SummarizeResponse
from app.services.summarizer import summarize as run_summarize

router = APIRouter(tags=["summarization"], dependencies=[Depends(require_service_token)])


@router.post("/summarize", response_model=SummarizeResponse, response_model_by_alias=True)
async def summarize(body: SummarizeRequest, request: Request) -> SummarizeResponse:
    """Always 200. Check the `degraded` flag, not the status code."""
    return await run_summarize(
        req=body,
        settings=get_settings(),
        client=request.app.state.http,
    )
