"""FastAPI application.

Every failure leaves here in the envelope from docs/03-API-CONTRACT.md - the
handlers below are the only place error bodies are built.
"""

import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.errors import ErrorCode, ServiceError, envelope, new_trace_id
from app.routers import ops, scoring, summarize
from app.services.embeddings import Embedder

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()

    app.state.http = httpx.AsyncClient()
    app.state.embedder = Embedder(settings)

    # Blocking, ~10-20 s. Requests arriving before this finishes get a 503
    # MODEL_NOT_READY rather than a hang.
    app.state.embedder.load()

    log.info("ai-service ready (model %s)", settings.model_version)
    try:
        yield
    finally:
        await app.state.http.aclose()


app = FastAPI(
    title="Resume Screener AI Service",
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(ops.router)
app.include_router(scoring.router)
app.include_router(summarize.router)


@app.exception_handler(ServiceError)
async def handle_service_error(request: Request, exc: ServiceError) -> JSONResponse:
    trace_id = new_trace_id()
    log.warning("%s: %s [trace=%s]", exc.code, exc.message, trace_id)
    return JSONResponse(
        status_code=exc.status_code,
        content=envelope(exc.code, exc.message, trace_id, exc.details),
    )


@app.exception_handler(RequestValidationError)
async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    trace_id = new_trace_id()

    details: dict[str, str] = {}
    malformed = False
    for err in exc.errors():
        if err.get("type") == "json_invalid":
            malformed = True
        # Drop the leading "body" element - the caller does not care.
        field = ".".join(str(p) for p in err.get("loc", ())[1:]) or "body"
        details[field] = err.get("msg", "invalid")

    code = ErrorCode.MALFORMED_JSON if malformed else ErrorCode.VALIDATION_FAILED
    message = "Request body is not valid JSON." if malformed else "Request validation failed"
    log.warning("%s: %s [trace=%s]", code, details, trace_id)
    return JSONResponse(
        status_code=400,
        content=envelope(code, message, trace_id, details or None),
    )


@app.exception_handler(Exception)
async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
    """Log the traceback, return a generic message.

    Internal paths and stack frames must not go over the wire.
    """
    trace_id = new_trace_id()
    log.exception("unhandled error on %s [trace=%s]", request.url.path, trace_id)
    return JSONResponse(
        status_code=500,
        content=envelope(
            ErrorCode.INTERNAL_ERROR,
            "An internal error occurred.",
            trace_id,
        ),
    )
