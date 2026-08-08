FROM python:3.12-slim AS base
WORKDIR /app
RUN pip install --no-cache-dir uv

FROM base AS deps
COPY services/ml-prediction/pyproject.toml ./
RUN uv sync --no-install-project

FROM base AS runtime
ENV PYTHONUNBUFFERED=1
COPY --from=deps /app/.venv ./.venv
COPY services/ml-prediction .
RUN uv sync --no-dev
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
