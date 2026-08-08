from fastapi import FastAPI

app = FastAPI(title="ml-prediction")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ml-prediction"}
