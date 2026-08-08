FROM python:3.12-slim AS base
WORKDIR /app
RUN pip install --no-cache-dir uv

FROM base AS deps
COPY pipeline/data-pipeline/pyproject.toml ./
RUN uv sync --no-install-project

FROM base AS runtime
ENV PYTHONUNBUFFERED=1
COPY --from=deps /app/.venv ./.venv
COPY pipeline/data-pipeline .
RUN uv sync --no-dev
ENV PATH="/app/.venv/bin:$PATH"
CMD ["python", "-m", "data_pipeline.main"]
