from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.forecast_engine import run_forecast
from app.forecast_state import merge_snapshot

app = FastAPI(title="BTC Forecast API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/forecast")
async def get_forecast() -> dict:
    try:
        data = await run_forecast()
        data["computed_at"] = datetime.now(timezone.utc).isoformat()
        return merge_snapshot(data)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"forecast_failed: {e!s}") from e
