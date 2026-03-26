"""
תחזית סטטיסטית בסיסית מנרות שעתיות (Binance) — לא ייעוץ השקעות.
"""
from __future__ import annotations

import statistics
from dataclasses import dataclass
from enum import Enum
from typing import Any

import httpx

BINANCE_KLINES = "https://api.binance.com/api/v3/klines"


class Direction(str, Enum):
    UP = "up"
    DOWN = "down"
    NEUTRAL = "neutral"


@dataclass(frozen=True)
class HorizonForecast:
    horizon: str  # "1h" | "24h"
    direction: Direction
    confidence: int  # 0–100
    score: float  # -1 .. 1
    summary: str


def _mean(xs: list[float]) -> float:
    return statistics.mean(xs) if xs else 0.0


def _rsi(closes: list[float], period: int = 14) -> float:
    if len(closes) < period + 1:
        return 50.0
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    if len(deltas) < period:
        return 50.0
    window = deltas[-period:]
    gains = [d if d > 0 else 0.0 for d in window]
    losses = [-d if d < 0 else 0.0 for d in window]
    avg_g = sum(gains) / period
    avg_l = sum(losses) / period
    if avg_l < 1e-12:
        return 100.0 if avg_g > 0 else 50.0
    rs = avg_g / avg_l
    return 100.0 - (100.0 / (1.0 + rs))


def _score_to_direction(score: float, neutral_band: float = 0.12) -> Direction:
    if score > neutral_band:
        return Direction.UP
    if score < -neutral_band:
        return Direction.DOWN
    return Direction.NEUTRAL


def _confidence_from_score(score: float) -> int:
    a = min(1.0, abs(score))
    return int(min(100, max(15, round(35 + a * 65))))


def _build_summary(horizon: str, direction: Direction, confidence: int, price: float) -> str:
    d_he = {"up": "עלייה", "down": "ירידה", "neutral": "ניטרלי"}[direction.value]
    if horizon == "1h":
        return f"מגמה קצרת־טווח: {d_he} (ביטחון ~{confidence}%). מחיר נוכחי ~${price:,.0f}."
    return f"מגמת יום: {d_he} (ביטחון ~{confidence}%). מחיר נוכחי ~${price:,.0f}."


def compute_horizons(closes: list[float]) -> tuple[HorizonForecast, HorizonForecast, float]:
    """
    closes: סגירות לפי סדר זמן (שעתי).
    """
    if len(closes) < 30:
        price = closes[-1] if closes else 0.0
        neutral = HorizonForecast(
            horizon="1h",
            direction=Direction.NEUTRAL,
            confidence=20,
            score=0.0,
            summary="לא מספיק נתונים לתחזית אמינה.",
        )
        return neutral, neutral, price

    price = closes[-1]
    sma_6 = _mean(closes[-6:])
    sma_12 = _mean(closes[-12:])
    sma_48 = _mean(closes[-48:]) if len(closes) >= 48 else _mean(closes)

    ret_6 = (closes[-1] - closes[-7]) / closes[-7] if len(closes) > 7 and closes[-7] else 0.0
    ret_24 = (closes[-1] - closes[-25]) / closes[-25] if len(closes) > 25 and closes[-25] else 0.0
    rsi_v = _rsi(closes)

    rsi_bias = (50.0 - rsi_v) / 50.0  # מעל 50 = לחץ יורד ל-score (overbought)

    # שעה קרובה: מומנטום קצר ו-SMA מהיר
    score_hour = (
        max(-1.0, min(1.0, ret_6 * 25.0))
        + (0.35 if closes[-1] > sma_6 else -0.35)
        + (0.2 if closes[-1] > sma_12 else -0.2)
        + 0.25 * rsi_bias
    )
    score_hour = max(-1.0, min(1.0, score_hour))

    # יום קרוב: מגמה איטית יותר
    score_day = (
        max(-1.0, min(1.0, ret_24 * 18.0))
        + (0.45 if sma_12 > sma_48 else -0.45)
        + 0.2 * rsi_bias
    )
    score_day = max(-1.0, min(1.0, score_day))

    d_h = _score_to_direction(score_hour)
    d_d = _score_to_direction(score_day)
    c_h = _confidence_from_score(score_hour)
    c_d = _confidence_from_score(score_day)

    hf = HorizonForecast(
        horizon="1h",
        direction=d_h,
        confidence=c_h,
        score=round(score_hour, 4),
        summary=_build_summary("1h", d_h, c_h, price),
    )
    df = HorizonForecast(
        horizon="24h",
        direction=d_d,
        confidence=c_d,
        score=round(score_day, 4),
        summary=_build_summary("24h", d_d, c_d, price),
    )
    return hf, df, price


async def fetch_hourly_closes(limit: int = 168) -> list[float]:
    """נרות שעתיים אחרונים (BTC/USDT)."""
    params = {"symbol": "BTCUSDT", "interval": "1h", "limit": limit}
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(BINANCE_KLINES, params=params)
        r.raise_for_status()
        data: list[Any] = r.json()
    # index 4 = close
    return [float(row[4]) for row in data]


async def run_forecast() -> dict[str, Any]:
    closes = await fetch_hourly_closes()
    h1, h24, price = compute_horizons(closes)
    return {
        "asset": "BTC",
        "quote": "USDT",
        "price_usd_approx": price,
        "source": "binance_spot_1h",
        "hour_ahead": {
            "direction": h1.direction.value,
            "confidence": h1.confidence,
            "score": h1.score,
            "summary": h1.summary,
        },
        "day_ahead": {
            "direction": h24.direction.value,
            "confidence": h24.confidence,
            "score": h24.score,
            "summary": h24.summary,
        },
    }
