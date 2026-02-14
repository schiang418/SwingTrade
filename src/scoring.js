const { computeIndicators } = require('./indicators');

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
 * T1 = Close > EMA20 ? 1 : 0
 * T2 = Close > SMA50 ? 1 : 0
 * T3 = EMA20 > SMA50 ? 1 : 0
 * T4 = SMA50 > SMA50_20daysAgo ? 1 : 0
 * Trend_Score = (T1+T2+T3+T4)/4 * 100
 */
function calcTrendScore(ind) {
  if (ind.error || ind.ema20 == null || ind.sma50 == null || ind.sma50_20ago == null) {
    return 0;
  }
  const t1 = ind.close > ind.ema20 ? 1 : 0;
  const t2 = ind.close > ind.sma50 ? 1 : 0;
  const t3 = ind.ema20 > ind.sma50 ? 1 : 0;
  const t4 = ind.sma50 > ind.sma50_20ago ? 1 : 0;
  return ((t1 + t2 + t3 + t4) / 4) * 100;
}

/**
 * 3. Pullback / Setup Score (20% weight)
 * Dist20 = (Close - EMA20) / EMA20 * 100
 * Dist50 = (Close - SMA50) / SMA50 * 100
 *
 * Scoring table:
 *   Dist20 0-3%  → 100
 *   Dist20 3-6%  → 80
 *   Dist50 0-5%  → 75
 *   Extended >10% → 20
 *   Below SMA50  → 0
 *
 * Bonus: +10 if RSI between 45 and 65 (cap at 100)
 */
function calcPullbackScore(ind) {
  if (ind.error || ind.ema20 == null || ind.sma50 == null) {
    return 0;
  }

  const dist20 = ((ind.close - ind.ema20) / ind.ema20) * 100;
  const dist50 = ((ind.close - ind.sma50) / ind.sma50) * 100;

  let score;

  if (ind.close < ind.sma50) {
    // Below SMA50
    score = 0;
  } else if (dist20 >= 0 && dist20 <= 3) {
    score = 100;
  } else if (dist20 > 3 && dist20 <= 6) {
    score = 80;
  } else if (dist50 >= 0 && dist50 <= 5) {
    score = 75;
  } else if (dist20 > 10 || dist50 > 10) {
    score = 20;
  } else {
    // Dist20 6-10% range, not covered explicitly → interpolate
    score = 60;
  }

  // RSI bonus
  if (ind.rsi14 != null && ind.rsi14 >= 45 && ind.rsi14 <= 65) {
    score += 10;
  }

  return Math.min(score, 100);
}

/**
 * 4. Volatility & Liquidity Score (15% weight)
 * ATRpct = ATR14 / Close * 100
 *
 * ATR% Score:
 *   2-4%  → 100
 *   4-6%  → 80
 *   1-2%  → 60
 *   >7%   → 40
 *   <1%   → 20
 *
 * Penalty if low volume (avg vol < 500k → -20, < 200k → -40)
 */
function calcVolatilityScore(ind) {
  if (ind.error || ind.atr14 == null) {
    return 0;
  }

  const atrPct = (ind.atr14 / ind.close) * 100;

  let score;
  if (atrPct >= 2 && atrPct <= 4) {
    score = 100;
  } else if (atrPct > 4 && atrPct <= 6) {
    score = 80;
  } else if (atrPct >= 1 && atrPct < 2) {
    score = 60;
  } else if (atrPct > 7) {
    score = 40;
  } else if (atrPct > 6 && atrPct <= 7) {
    score = 60; // Interpolation between 80 and 40
  } else {
    // < 1%
    score = 20;
  }

  // Volume penalty
  if (ind.avgVol20 != null) {
    if (ind.avgVol20 < 200000) {
      score -= 40;
    } else if (ind.avgVol20 < 500000) {
      score -= 20;
    }
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
