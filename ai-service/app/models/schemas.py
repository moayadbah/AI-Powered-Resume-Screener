"""Request/response models.

The wire is camelCase, Python is snake_case. The alias generator handles the
conversion in one place - do not rename fields to work around it.

Shapes come from docs/03-API-CONTRACT.md. Changing one is a contract change.
"""

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class WireModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
    )


class Weights(WireModel):
    semantic: float
    skill: float


# --------------------------------------------------------------------------
# POST /score
# --------------------------------------------------------------------------


class ResumeInput(WireModel):
    resume_id: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1, max_length=100_000)


class ScoreRequest(WireModel):
    job_description: str = Field(..., min_length=50, max_length=20_000)
    required_skills: list[str] = Field(default_factory=list, max_length=50)
    resumes: list[ResumeInput] = Field(..., min_length=1, max_length=50)


class ScoreResult(WireModel):
    resume_id: str
    score: int = Field(..., ge=0, le=100)
    semantic_score: float = Field(..., ge=0.0, le=1.0)
    skill_score: float = Field(..., ge=0.0, le=1.0)
    matched_skills: list[str]
    missing_skills: list[str]


class ScoreResponse(WireModel):
    results: list[ScoreResult]
    model_version: str
    weights: Weights
    duration_ms: int


# --------------------------------------------------------------------------
# POST /summarize
# --------------------------------------------------------------------------


class SummarizeRequest(WireModel):
    resume_id: str = Field(..., min_length=1)
    resume_text: str = Field(..., min_length=1, max_length=100_000)
    job_description: str = Field(..., min_length=50, max_length=20_000)
    matched_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)


class SummarizeResponse(WireModel):
    resume_id: str
    summary: str | None
    strengths: list[str] | None
    concerns: list[str] | None
    degraded: bool
    degraded_reason: str | None = None
    prompt_version: str
    model: str


# --------------------------------------------------------------------------
# ops
# --------------------------------------------------------------------------


class HealthResponse(WireModel):
    status: str
    model_loaded: bool
    ollama_reachable: bool


class ModelInfoResponse(WireModel):
    embedding_model: str
    embedding_revision: str
    model_version: str
    dimensions: int
    max_sequence_length: int
    ollama_model: str
    prompt_version: str
    weights: Weights
