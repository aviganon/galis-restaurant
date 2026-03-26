"""
שמירת תחזית קודמת לזיהוי שינוי (התראה כשהכיוון או רמת הביטחון משתנים משמעותית).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

# ליד backend/app — תיקיית data
STATE_PATH = Path(__file__).resolve().parent.parent / "data" / "forecast_state.json"

CHANGE_CONF_THRESHOLD = 12  # הפרש ביטחון מינימלי לשינוי "משמעותי"


def _ensure_parent() -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)


def load_state() -> dict[str, Any] | None:
    if not STATE_PATH.is_file():
        return None
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def save_state(payload: dict[str, Any]) -> None:
    _ensure_parent()
    STATE_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def detect_change(
    prev: dict[str, Any] | None,
    current: dict[str, Any],
) -> dict[str, Any]:
    """
    מחזיר שדות: prediction_changed, change_reasons (רשימה), hour_changed, day_changed
    """
    if prev is None:
        return {
            "prediction_changed": True,
            "change_reasons": ["ריצה ראשונה — אין השוואה קודמת."],
            "hour_changed": True,
            "day_changed": True,
        }

    reasons: list[str] = []
    hour_changed = False
    day_changed = False

    ph = prev.get("hour_ahead") or {}
    pd_ = prev.get("day_ahead") or {}
    ch = current.get("hour_ahead") or {}
    cd = current.get("day_ahead") or {}

    if ph.get("direction") != ch.get("direction"):
        hour_changed = True
        reasons.append(
            f"כיוון שעה: {ph.get('direction')} → {ch.get('direction')}"
        )
    elif abs(int(ph.get("confidence") or 0) - int(ch.get("confidence") or 0)) >= CHANGE_CONF_THRESHOLD:
        hour_changed = True
        reasons.append("שינוי משמעותי בביטחון (שעה).")

    if pd_.get("direction") != cd.get("direction"):
        day_changed = True
        reasons.append(
            f"כיוון יום: {pd_.get('direction')} → {cd.get('direction')}"
        )
    elif abs(int(pd_.get("confidence") or 0) - int(cd.get("confidence") or 0)) >= CHANGE_CONF_THRESHOLD:
        day_changed = True
        reasons.append("שינוי משמעותי בביטחון (יום).")

    prediction_changed = hour_changed or day_changed
    if prediction_changed and not reasons:
        reasons.append("עדכון תחזית.")

    return {
        "prediction_changed": prediction_changed,
        "change_reasons": reasons,
        "hour_changed": hour_changed,
        "day_changed": day_changed,
    }


def merge_snapshot(forecast: dict[str, Any]) -> dict[str, Any]:
    """משווה לתחזית השמורה, שומר את הנוכחית, מחזיר תשובה מלאה ללקוח."""
    prev = load_state()
    change = detect_change(prev, forecast)
    save_state(forecast)
    return {
        **forecast,
        **change,
        "previous_snapshot_at": prev.get("computed_at") if prev else None,
    }
