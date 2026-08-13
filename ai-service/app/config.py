"""Settings, read from the environment once at startup.

Nothing else in the service calls os.getenv - if you need a value, add it here.
"""

from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PLACEHOLDER_TOKENS = {
    "replace-me-with-a-shared-internal-token",
    "changeme",
    "",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        # SERVICE_TOKEN -> service_token
        case_sensitive=False,
    )

    service_token: str = Field(..., alias="SERVICE_TOKEN")

    embedding_model: str = Field("sentence-transformers/all-MiniLM-L6-v2", alias="EMBEDDING_MODEL")

    # NOT a secret, despite looking like one to entropy-based scanners: this is
    # the public Hugging Face commit SHA of the model repo, pinned so the model
    # cannot change under us. Verify it with:
    #   curl -s https://huggingface.co/api/models/sentence-transformers/all-MiniLM-L6-v2 | jq -r .sha
    embedding_revision: str = Field(
        "1110a243fdf4706b3f48f1d95db1a4f5529b4d41", alias="EMBEDDING_MODEL_REVISION"
    )

    semantic_weight: float = Field(0.7, alias="SEMANTIC_WEIGHT", ge=0.0, le=1.0)
    skill_weight: float = Field(0.3, alias="SKILL_WEIGHT", ge=0.0, le=1.0)

    ollama_base_url: str = Field("http://host.docker.internal:11434", alias="OLLAMA_BASE_URL")
    ollama_model: str = Field("llama3.2:3b", alias="OLLAMA_MODEL")
    ollama_timeout_seconds: float = Field(60.0, alias="OLLAMA_TIMEOUT_SECONDS", gt=0)
    summary_enabled: bool = Field(True, alias="SUMMARY_ENABLED")

    @model_validator(mode="after")
    def _check(self) -> "Settings":
        if self.service_token.strip().lower() in PLACEHOLDER_TOKENS:
            raise ValueError(
                "SERVICE_TOKEN is unset or still the placeholder from .env.example. "
                "Set a real value - api-service must send the same one."
            )
        total = self.semantic_weight + self.skill_weight
        # Floating point: 0.7 + 0.3 is not exactly 1.0.
        if abs(total - 1.0) > 1e-6:
            raise ValueError(
                f"SEMANTIC_WEIGHT + SKILL_WEIGHT must sum to 1.0, got {total}. "
                "Otherwise scores can exceed 100."
            )
        return self

    @property
    def model_version(self) -> str:
        """Short identifier stored on every screening, e.g. all-MiniLM-L6-v2@1110a24."""
        name = self.embedding_model.rsplit("/", 1)[-1]
        return f"{name}@{self.embedding_revision[:7]}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
