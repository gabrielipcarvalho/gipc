# syntax=docker/dockerfile:1
# Context = REPO ROOT (the corpus sources live outside services/ai). Sibling Dockerfile.dockerignore
# allow-lists the context. Multi-stage: uv-resolved venv + baked ONNX model + SANITIZED corpus → slim
# non-root runtime. The runtime copies corpus from the BUILDER only (never raw from context) — the
# sanitization strip below must be impossible to bypass.
FROM python:3.12-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY services/ai/pyproject.toml services/ai/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY services/ai/app ./app
# corpus: copy sources, then STRIP private fields from the baked artifact (phone/private/meta —
# never rendered on the site, never shipped in the image)
COPY resume/resume.json corpus/resume.json
COPY apps/web/data/projects.json corpus/projects.json
COPY services/ai/corpus/site.md corpus/site.md
RUN python -c "import json; d=json.load(open('corpus/resume.json')); d['basics'].pop('phone',None); d['basics'].pop('private',None); d.pop('meta',None); json.dump(d, open('corpus/resume.json','w'))"
# bake the embedding model — runtime must be fully offline
ENV FASTEMBED_CACHE_PATH=/opt/fastembed
RUN .venv/bin/python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5')"
# self-aware code corpus: excerpt the site's own curated source (AFTER the model bake so source
# edits never invalidate that layer). app.code_corpus is stdlib-only — system python suffices.
COPY apps/web/app repo/apps/web/app
COPY apps/web/data repo/apps/web/data
COPY packages/tokens/tokens.css repo/packages/tokens/tokens.css
COPY infra/k8s repo/infra/k8s
COPY services/ai/app repo/services/ai/app
COPY services/ai/corpus/code-manifest.json corpus/code-manifest.json
RUN python -m app.code_corpus repo corpus/code-manifest.json corpus/code.json \
    && rm -rf repo app/__pycache__

FROM python:3.12-slim
ARG GIT_SHA=dev
RUN useradd -u 65532 -m ai
WORKDIR /app
COPY --from=builder /app /app
COPY --from=builder /opt/fastembed /opt/fastembed
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    FASTEMBED_CACHE_PATH=/opt/fastembed \
    CORPUS_DIR=/app/corpus \
    GIT_SHA=${GIT_SHA}
USER ai
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
