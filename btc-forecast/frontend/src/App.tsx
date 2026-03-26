import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { fetchForecast, type ForecastResponse } from "./api";

const DIR_HOUR: Record<string, string> = {
  up: "עלייה צפויה (מגמה קצרה)",
  down: "ירידה צפויה (מגמה קצרה)",
  neutral: "ניטרלי",
};

const DIR_DAY: Record<string, string> = {
  up: "עלייה צפויה (מגמה יומית)",
  down: "ירידה צפויה (מגמה יומית)",
  neutral: "ניטרלי",
};

function directionClass(d: string): string {
  if (d === "up") return "up";
  if (d === "down") return "down";
  return "neutral";
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("he-IL", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function App() {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const f = await fetchForecast();
      setData(f);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה לא ידועה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <div className="app">
      <header className="header">
        <h1>תחזית ביטקוין</h1>
        <p>
          שעה קרובה ויום קרוב — מבוסס נרות שעתיים מ-Binance. התראה כשהכיוון או
          רמת הביטחון משתנים משמעותית (בהשוואה לריצה הקודמת).
        </p>
      </header>

      {loading && !data && <p className="refresh">טוען…</p>}
      {err && <div className="error">לא ניתן לטעון תחזית: {err}</div>}

      {data && (
        <>
          {data.prediction_changed &&
            data.previous_snapshot_at &&
            data.change_reasons.length > 0 && (
            <div className="alert" role="status">
              <strong>עדכון בתחזית</strong>
              <ul>
                {data.change_reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="meta">
            <div>
              מחיר משוער (USDT): <span>${data.price_usd_approx.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
            </div>
            <div>עודכן: {formatTime(data.computed_at)}</div>
            {data.previous_snapshot_at && (
              <div>השוואה מול: {formatTime(data.previous_snapshot_at)}</div>
            )}
          </div>

          <div className="grid">
            <section className="card">
              <h2>שעה קרובה</h2>
              <div className={`direction ${directionClass(data.hour_ahead.direction)}`}>
                {DIR_HOUR[data.hour_ahead.direction] ?? data.hour_ahead.direction}
              </div>
              <div className="confidence">ביטחון משוער: {data.hour_ahead.confidence}%</div>
              <p className="summary">{data.hour_ahead.summary}</p>
            </section>

            <section className="card">
              <h2>יום קרוב</h2>
              <div className={`direction ${directionClass(data.day_ahead.direction)}`}>
                {DIR_DAY[data.day_ahead.direction] ?? data.day_ahead.direction}
              </div>
              <div className="confidence">ביטחון משוער: {data.day_ahead.confidence}%</div>
              <p className="summary">{data.day_ahead.summary}</p>
            </section>
          </div>

          <p className="footer">
            זו תחזית סטטיסטית לדוגמה בלבד — לא ייעוץ פיננסי. בשלב הבא אפשר לחבר
            בורסה ומסחר רק אחרי בדיקות ובקרות סיכון.
          </p>
          <p className="refresh">רענון אוטומטי כל 60 שניות.</p>
        </>
      )}
    </div>
  );
}
