const API_BASE = 'https://api.polygon.io';

function getApiKey() {
  const key = process.env.MASSIVE_STOCK_API_KEY;
  if (!key) throw new Error('MASSIVE_STOCK_API_KEY environment variable is not set');
  return key;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch daily OHLCV bars for a ticker over a date range.
 * Returns array of { t, o, h, l, c, v } sorted ascending by date.
 */
async function fetchDailyBars(ticker, fromDate, toDate) {
  const apiKey = getApiKey();
  const url = `${API_BASE}/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=5000&apiKey=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Polygon API error for ${ticker}: ${res.status} ${text}`);
  }

  const data = await res.json();
  if (data.status === 'ERROR') {
    throw new Error(`Polygon API error for ${ticker}: ${data.error}`);
  }

  return (data.results || []).map(bar => ({
    t: bar.t,
    date: new Date(bar.t).toISOString().slice(0, 10),
    o: bar.o,
    h: bar.h,
    l: bar.l,
    c: bar.c,
    v: bar.v,
  }));
}

/**
 * Fetch daily bars for multiple tickers with rate-limiting.
 * Polygon free tier allows 5 requests/minute. Adjust delay as needed.
 */
async function fetchMultipleTickers(tickers, fromDate, toDate, delayMs = 250) {
  const results = {};
  const errors = {};

  for (const ticker of tickers) {
    try {
      results[ticker] = await fetchDailyBars(ticker, fromDate, toDate);
    } catch (err) {
      console.error(`Error fetching ${ticker}: ${err.message}`);
      errors[ticker] = err.message;
    }
    if (delayMs > 0) await sleep(delayMs);
  }

  return { results, errors };
}

module.exports = { fetchDailyBars, fetchMultipleTickers };
