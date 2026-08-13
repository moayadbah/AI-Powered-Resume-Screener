"""Embedding model: load once, encode in batches.

Loaded in the FastAPI lifespan handler, not at import time - import-time loading
breaks test collection and makes every pytest run pay for it.

See docs/04-AI-SERVICE.md section Model loading.
"""

import logging
import threading

import numpy as np

from app.config import Settings
from app.errors import ErrorCode, ServiceError

log = logging.getLogger(__name__)


class Embedder:
    """Wraps SentenceTransformer. One instance, held on app.state."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._model = None
        self._lock = threading.Lock()

    @property
    def ready(self) -> bool:
        return self._model is not None

    def load(self) -> None:
        """Blocking. Called from the lifespan handler at startup."""
        # Imported here, not at module scope: torch takes ~10 s to import and we
        # do not want that cost on every test collection.
        from sentence_transformers import SentenceTransformer

        log.info(
            "loading embedding model %s@%s",
            self._settings.embedding_model,
            self._settings.embedding_revision[:7],
        )
        model = SentenceTransformer(
            self._settings.embedding_model,
            revision=self._settings.embedding_revision,
            # Explicit: Docker Desktop has no GPU passthrough on macOS, and
            # auto-detection would behave differently inside and outside a
            # container. Scores must not depend on where the container runs.
            device="cpu",
        )
        self._model = model
        log.info(
            "model ready: %d dimensions, max_seq_length %d",
            self.dimensions,
            self.max_sequence_length,
        )

    def _require(self):
        if self._model is None:
            raise ServiceError(
                ErrorCode.MODEL_NOT_READY,
                "Embedding model is still loading. Retry shortly.",
            )
        return self._model

    @property
    def dimensions(self) -> int:
        model = self._require()
        # Renamed in sentence-transformers 5.x. Support both so the pin can move
        # without this breaking.
        getter = getattr(model, "get_embedding_dimension", None) or (
            model.get_sentence_embedding_dimension
        )
        return int(getter())

    @property
    def max_sequence_length(self) -> int:
        return int(self._require().max_seq_length)

    def encode(self, texts: list[str]) -> np.ndarray:
        """Encode in one batched call and return L2-normalised vectors.

        Batching is the difference between a 50-resume screen taking about a
        second and taking thirty. Never call this in a loop over resumes.

        Normalised vectors mean cosine similarity is a plain dot product.
        """
        model = self._require()
        if not texts:
            return np.empty((0, self.dimensions), dtype=np.float32)

        # SentenceTransformer is not safe to call concurrently from multiple
        # threads on the same instance. One uvicorn worker plus this lock keeps
        # it simple; if throughput ever matters, add workers, not threads.
        with self._lock:
            vectors = model.encode(
                texts,
                batch_size=32,
                convert_to_numpy=True,
                normalize_embeddings=True,
                show_progress_bar=False,
            )
        return np.asarray(vectors, dtype=np.float32)


def cosine_against(query: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    """Cosine similarity of one normalised vector against normalised rows.

    Both sides are already unit length, so this is just a dot product.
    """
    if matrix.size == 0:
        return np.empty((0,), dtype=np.float32)
    return matrix @ query
