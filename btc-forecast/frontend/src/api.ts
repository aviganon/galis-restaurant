export type Direction = "up" | "down" | "neutral";

export type HorizonBlock = {
  direction: Direction;
  confidence: number;
  score: number;
  summary: string;
};

export type ForecastResponse = {
  asset: string;
  quote: string;
  price_usd_approx: number;
  source: string;
  computed_at: string;
  hour_ahead: HorizonBlock;
  day_ahead: HorizonBlock;
  prediction_changed: boolean;
  change_reasons: string[];
  hour_changed: boolean;
  day_changed: boolean;
  previous_snapshot_at: string | null;
};

export async function fetchForecast(): Promise<ForecastResponse> {
  const r = await fetch("/api/forecast");
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || `HTTP ${r.status}`);
  }
  return r.json() as Promise<ForecastResponse>;
}
