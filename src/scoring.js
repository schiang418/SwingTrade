const { computeIndicators } = require('./indicators');

/**
 * Linear interpolation between breakpoints.
 * breakpoints: array of [value, score] pairs, sorted by value ascending.
 * Values below the first breakpoint clamp to its score; above the last clamp to its score.
 */
function gradientScore(value, breakpoints) {
  if (breakpoints.length === 0) return 0;
  if (value <= breakpoints[0][0]) return breakpoints[0][1];
  if (value >= breakpoints[breakpoints.length - 1][0]) return breakpoints[breakpoints.length - 1][1];

  for (let i = 1; i < breakpoints.length; i++) {
    if (value <= breakpoints[i][0]) {
      const [x0, y0] = breakpoints[i - 1];
      const [x1, y1] = breakpoints[i];
      const t = (value - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return breakpoints[breakpoints.length - 1][1];
}

/**
 * Calculate percentile rank of a value within an array.
 * Returns a value between 0 and 1.
 */
function percentileRank(value, allValues) {
  const sorted = [...allValues].sort((a, b) => a - b);
  let count = 0;
  for (const v of sorted) {
    if (v < value) count++;
    else if (v === value) count += 0.5;
  }
  return count / sorted.length;
}

/**
 * 1. Relative Strength Score (40% weight)
 * RS_1M = Stock_1M_Return - SPY_1M_Return
 * RS_3M = Stock_3M_Return - SPY_3M_Return
 * RS_Composite = 0.6 * RS_3M + 0.4 * RS_1M
 * RS_Score = PercentileRank(RS_Composite) * 100
 */
function calcRSComposite(stockIndicators, spyIndicators) {
  const rs1m = stockIndicators.return1m - spyIndicators.return1m;
  const rs3m = stockIndicators.return3m - spyIndicators.return3m;
  return 0.6 * rs3m + 0.4 * rs1m;
}

function calcRSScores(allStockIndicators, spyIndicators) {
  // Calculate RS composite for each stock
  const composites = {};
  for (const [ticker, ind] of Object.entries(allStockIndicators)) {
    if (ind.error || ind.return1m == null || ind.return3m == null) {
      composites[ticker] = null;
      continue;
    }
    composites[ticker] = calcRSComposite(ind, spyIndicators);
  }

  // Get all valid composites for percentile ranking
  const validValues = Object.values(composites).filter(v => v !== null);

  const scores = {};
  for (const [ticker, comp] of Object.entries(composites)) {
    if (comp === null) {
      scores[ticker] = 0;
      continue;
    }
    scores[ticker] = percentileRank(comp, validValues) * 100;
  }

  return { scores, composites };
}

/**
 * 2. Trend Structure Score (25% weight)
 * Gradient scoring based on distances rather than binary checks:
 *   T1: Close vs EMA20 — distance as % of EMA20, scaled -5% → 0, 0% → 0.5, +5% → 1
 *   T2: Close vs SMA50 — distance as % of SMA50, scaled -5% → 0, 0% → 0.5, +5% → 1
 *   T3: EMA20 vs SMA50 — distance as % of SMA50, scaled -3% → 0, 0% → 0.5, +3% → 1
 *   T4: SMA50 slope — % change over 20 days, scaled -3% → 0, 0% → 0.5, +3% → 1
 * Trend_Score = (T1+T2+T3+T4)/4 * 100
 */
function calcTrendScore(ind) {
  if (ind.error || ind.ema20 == null || ind.sma50 == null || ind.sma50_20ago == null) {
    return 0;
  }

  const distCloseEma20 = ((ind.close - ind.ema20) / ind.ema20) * 100;
  const t1 = gradientScore(distCloseEma20, [[-5, 0], [0, 0.5], [5, 1]]);

  const distCloseSma50 = ((ind.close - ind.sma50) / ind.sma50) * 100;
  const t2 = gradientScore(distCloseSma50, [[-5, 0], [0, 0.5], [5, 1]]);

  const distEmaSma = ((ind.ema20 - ind.sma50) / ind.sma50) * 100;
  const t3 = gradientScore(distEmaSma, [[-3, 0], [0, 0.5], [3, 1]]);

  const smaSlope = ((ind.sma50 - ind.sma50_20ago) / ind.sma50_20ago) * 100;
  const t4 = gradientScore(smaSlope, [[-3, 0], [0, 0.5], [3, 1]]);

  return ((t1 + t2 + t3 + t4) / 4) * 100;
}

/**
 * 3. Pullback / Setup Score (20% weight)
 * Dist20 = (Close - EMA20) / EMA20 * 100
 *
 * Gradient scoring with smooth interpolation:
 *   dist20 < -3%  → 0     (well below EMA20, broken trend)
 *   dist20  -3%   → 0     (approaching from below)
 *   dist20   0%   → 80    (right at EMA20, decent pullback)
 *   dist20  +1.5% → 100   (sweet spot, just above EMA20)
 *   dist20  +3%   → 90    (still good, slightly extended)
 *   dist20  +6%   → 60    (getting extended)
 *   dist20 +10%   → 20    (overextended)
 *   dist20 +15%   → 0     (way too extended)
 *
 * RSI bonus: gradient bell curve peaking at RSI 55 (max +10)
 */
function calcPullbackScore(ind) {
  if (ind.error || ind.ema20 == null || ind.sma50 == null) {
    return 0;
  }

  const dist20 = ((ind.close - ind.ema20) / ind.ema20) * 100;

  let score = gradientScore(dist20, [
    [-3, 0], [0, 80], [1.5, 100], [3, 90],
    [6, 60], [10, 20], [15, 0],
  ]);

  // Penalty if below SMA50: scale down proportionally
  const dist50 = ((ind.close - ind.sma50) / ind.sma50) * 100;
  if (dist50 < 0) {
    // At 0% below → full score, at -5% below → 0
    const sma50Factor = gradientScore(dist50, [[-5, 0], [0, 1]]);
    score *= sma50Factor;
  }

  // RSI bonus: bell curve centered at 55, max +10, fading at 35 and 75
  if (ind.rsi14 != null) {
    const rsiBonus = gradientScore(ind.rsi14, [
      [35, 0], [45, 5], [55, 10], [65, 5], [75, 0],
    ]);
    score += rsiBonus;
  }

  return Math.min(Math.max(score, 0), 100);
}

/**
 * 4. Volatility & Liquidity Score (15% weight)
 * ATRpct = ATR14 / Close * 100
 *
 * Gradient bell curve centered on optimal ATR% of 3%:
 *   0%   → 10  (too quiet, no opportunity)
 *   1%   → 50
 *   2%   → 90
 *   3%   → 100  (sweet spot)
 *   4%   → 90
 *   6%   → 60
 *   8%   → 30
 *   10%+ → 10  (too volatile)
 *
 * Volume penalty: smooth ramp from 0 at 500k+ to -40 at 0 vol
 */
function calcVolatilityScore(ind) {
  if (ind.error || ind.atr14 == null) {
    return 0;
  }

  const atrPct = (ind.atr14 / ind.close) * 100;

  let score = gradientScore(atrPct, [
    [0, 10], [1, 50], [2, 90], [3, 100],
    [4, 90], [6, 60], [8, 30], [10, 10],
  ]);

  // Smooth volume penalty: 0 vol → -40, 200k → -20, 500k+ → 0
  if (ind.avgVol20 != null && ind.avgVol20 < 500000) {
    const penalty = gradientScore(ind.avgVol20, [
      [0, -40], [200000, -20], [500000, 0],
    ]);
    score += penalty;
  }

  return Math.max(score, 0);
}

/**
 * Calculate final swing trade score for all stocks.
 * Final_Score = 0.40 * RS_Score + 0.25 * Trend_Score + 0.20 * Pullback_Score + 0.15 * Volatility_Score
 */
function calculateAllScores(allStockBars, spyBars) {
  // Compute indicators for all stocks and SPY
  const spyIndicators = computeIndicators(spyBars);
  if (spyIndicators.error) {
    throw new Error(`SPY data error: ${spyIndicators.error}`);
  }

  const allIndicators = {};
  for (const [ticker, bars] of Object.entries(allStockBars)) {
    allIndicators[ticker] = computeIndicators(bars);
  }

  // Calculate RS scores (needs all stocks for percentile ranking)
  const { scores: rsScores, composites: rsComposites } = calcRSScores(allIndicators, spyIndicators);

  // Calculate individual scores and final score
  const results = [];
  for (const [ticker, ind] of Object.entries(allIndicators)) {
    if (ind.error) {
      results.push({
        ticker,
        error: ind.error,
        finalScore: 0,
        rsScore: 0,
        trendScore: 0,
        pullbackScore: 0,
        volatilityScore: 0,
      });
      continue;
    }

    const rsScore = rsScores[ticker] || 0;
    const trendScore = calcTrendScore(ind);
    const pullbackScore = calcPullbackScore(ind);
    const volatilityScore = calcVolatilityScore(ind);

    const finalScore =
      0.40 * rsScore +
      0.25 * trendScore +
      0.20 * pullbackScore +
      0.15 * volatilityScore;

    const dist20 = ind.ema20 ? ((ind.close - ind.ema20) / ind.ema20) * 100 : null;
    const dist50 = ind.sma50 ? ((ind.close - ind.sma50) / ind.sma50) * 100 : null;
    const atrPct = ind.atr14 ? (ind.atr14 / ind.close) * 100 : null;

    results.push({
      ticker,
      finalScore: Math.round(finalScore * 100) / 100,
      rsScore: Math.round(rsScore * 100) / 100,
      rsComposite: rsComposites[ticker] != null ? Math.round(rsComposites[ticker] * 100) / 100 : null,
      trendScore: Math.round(trendScore * 100) / 100,
      pullbackScore: Math.round(pullbackScore * 100) / 100,
      volatilityScore: Math.round(volatilityScore * 100) / 100,
      indicators: {
        close: Math.round(ind.close * 100) / 100,
        ema20: ind.ema20 != null ? Math.round(ind.ema20 * 100) / 100 : null,
        sma50: ind.sma50 != null ? Math.round(ind.sma50 * 100) / 100 : null,
        rsi14: ind.rsi14 != null ? Math.round(ind.rsi14 * 100) / 100 : null,
        atr14: ind.atr14 != null ? Math.round(ind.atr14 * 100) / 100 : null,
        atrPct: atrPct != null ? Math.round(atrPct * 100) / 100 : null,
        dist20: dist20 != null ? Math.round(dist20 * 100) / 100 : null,
        dist50: dist50 != null ? Math.round(dist50 * 100) / 100 : null,
        return1m: ind.return1m != null ? Math.round(ind.return1m * 100) / 100 : null,
        return3m: ind.return3m != null ? Math.round(ind.return3m * 100) / 100 : null,
        avgVol20: ind.avgVol20 != null ? Math.round(ind.avgVol20) : null,
      },
    });
  }

  // Sort by final score descending
  results.sort((a, b) => b.finalScore - a.finalScore);

  // Add rank
  results.forEach((r, i) => {
    r.rank = i + 1;
  });

  return {
    results,
    spyData: {
      return1m: Math.round(spyIndicators.return1m * 100) / 100,
      return3m: Math.round(spyIndicators.return3m * 100) / 100,
    },
    analyzedAt: new Date().toISOString(),
  };
}

module.exports = { calculateAllScores };
