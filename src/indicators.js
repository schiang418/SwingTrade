/**
 * Technical indicator calculations from raw OHLCV data.
 * All functions expect bars sorted ascending by date.
 */

/** Simple Moving Average over the last `period` close prices. */
function sma(closes, period) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / period;
}

/** SMA at a specific offset from the end (0 = latest). */
function smaAt(closes, period, offset) {
  if (closes.length < period + offset) return null;
  const end = closes.length - offset;
  const slice = closes.slice(end - period, end);
  return slice.reduce((sum, v) => sum + v, 0) / period;
}

/** Exponential Moving Average over the last N values. */
function ema(closes, period) {
  if (closes.length < period) return null;
  const multiplier = 2 / (period + 1);

  // Seed with SMA of first `period` values
  let emaVal = closes.slice(0, period).reduce((s, v) => s + v, 0) / period;

  for (let i = period; i < closes.length; i++) {
    emaVal = (closes[i] - emaVal) * multiplier + emaVal;
  }
  return emaVal;
}

/**
 * Relative Strength Index.
 * Uses Wilder's smoothing method (exponential-like).
 */
function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;

  const changes = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  // First average
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  // Smooth the rest
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Average True Range.
 * Uses Wilder's smoothing (same as RSI).
 */
function atr(bars, period) {
  if (bars.length < period + 1) return null;

  // Calculate True Range series
  const trSeries = [];
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].h;
    const low = bars[i].l;
    const prevClose = bars[i - 1].c;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trSeries.push(tr);
  }

  if (trSeries.length < period) return null;

  // First ATR is simple average
  let atrVal = trSeries.slice(0, period).reduce((s, v) => s + v, 0) / period;

  // Wilder's smoothing for the rest
  for (let i = period; i < trSeries.length; i++) {
    atrVal = (atrVal * (period - 1) + trSeries[i]) / period;
  }

  return atrVal;
}

/** Average volume over the last N bars. */
function avgVolume(bars, period) {
  if (bars.length < period) return null;
  const slice = bars.slice(-period);
  return slice.reduce((sum, b) => sum + b.v, 0) / period;
}

/** Percentage return over the last N trading days. */
function returnPct(closes, tradingDays) {
  if (closes.length < tradingDays + 1) return null;
  const current = closes[closes.length - 1];
  const past = closes[closes.length - 1 - tradingDays];
  return ((current - past) / past) * 100;
}

/**
 * Compute all needed indicators from raw OHLCV bars.
 * Returns an object with all indicator values needed for scoring.
 */
function computeIndicators(bars) {
  if (!bars || bars.length < 80) {
    return { error: 'Insufficient data (need at least 80 trading days)' };
  }

  const closes = bars.map(b => b.c);
  const close = closes[closes.length - 1];

  const ema20 = ema(closes, 20);
  const sma50 = sma(closes, 50);
  const sma50_20ago = smaAt(closes, 50, 20);
  const rsi14 = rsi(closes, 14);
  const atr5 = atr(bars, 5);
  const atr14 = atr(bars, 14);
  const atr20 = atr(bars, 20);
  const avgVol20 = avgVolume(bars, 20);

  // ~21 trading days ≈ 1 month, ~63 trading days ≈ 3 months
  const return1m = returnPct(closes, 21);
  const return3m = returnPct(closes, 63);

  return {
    close,
    ema20,
    sma50,
    sma50_20ago,
    rsi14,
    atr5,
    atr14,
    atr20,
    avgVol20,
    return1m,
    return3m,
  };
}

module.exports = {
  sma, smaAt, ema, rsi, atr, avgVolume, returnPct, computeIndicators,
};
