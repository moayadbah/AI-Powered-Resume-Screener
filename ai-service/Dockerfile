# Two stages: download the model in the builder, copy the cache into a slim
# runtime. See docs/04-AI-SERVICE.md.

FROM python:3.11-slim AS builder

WORKDIR /build

# CPU-only torch. The default index pulls roughly 2 GB of CUDA wheels for
# hardware the container does not have - this is not optional.
RUN pip install --no-cache-dir torch==2.2.2 \
    --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
# torch is already installed above from the CPU index; installing it again from
# PyPI would pull the default build over the top.
RUN grep -v '^torch==' requirements.txt > /tmp/rest.txt \
    && pip install --no-cache-dir -r /tmp/rest.txt

# Bake the model into the image so containers never download at boot. A
# container that fetches 90 MB on start is one that fails a demo on bad wifi.
ARG EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
ARG EMBEDDING_MODEL_REVISION=1110a243fdf4706b3f48f1d95db1a4f5529b4d41
RUN python -c "\
from sentence_transformers import SentenceTransformer; \
SentenceTransformer('${EMBEDDING_MODEL}', revision='${EMBEDDING_MODEL_REVISION}', \
cache_folder='/opt/models')"


FROM python:3.11-slim

WORKDIR /app

ENV HF_HOME=/opt/models \
    SENTENCE_TRANSFORMERS_HOME=/opt/models \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    # Fail loudly at review time if something tries to fetch from the hub at
    # runtime, instead of silently hanging in production.
    HF_HUB_OFFLINE=1

RUN useradd --create-home --uid 10001 appuser

COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin/uvicorn /usr/local/bin/uvicorn

# --chown on the COPY, not a later RUN chown. `chown -R` rewrites every file
# into a new layer, which duplicated the whole 88 MB model cache.
COPY --from=builder --chown=appuser /opt/models /opt/models

COPY --chown=appuser app/ ./app/

USER appuser

EXPOSE 8000

# One worker. The model is not safe to share carelessly across threads, and
# multiple workers would each load their own copy of the weights.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
