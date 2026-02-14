const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parseExcelForTickers } = require('../../src/excel');
const { fetchDailyBars, fetchMultipleTickers } = require('../../src/polygon');
const { calculateAllScores } = require('../../src/scoring');

const router = express.Router();

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx, .xls, and .csv files are allowed'));
    }
  },
});

// Upload Excel and extract tickers
router.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const stocks = parseExcelForTickers(req.file.path);
    fs.unlink(req.file.path, () => {});
    res.json({ stocks, count: stocks.length });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(400).json({ error: err.message });
  }
});

// Analyze stocks: fetch data from Polygon and calculate scores
router.post('/analyze', async (req, res) => {
  try {
    const { stocks } = req.body;
    if (!stocks || !Array.isArray(stocks) || stocks.length === 0) {
      return res.status(400).json({ error: 'No stocks provided' });
    }
    if (stocks.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 tickers allowed per analysis' });
    }

    const analysis = await runAnalysis(stocks);
    res.json(analysis);
  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Core analysis function - reusable by both manual and automated flows.
 */
async function runAnalysis(stocks) {
  const tickers = stocks.map(s => s.ticker);
  const metaMap = {};
  for (const s of stocks) {
    metaMap[s.ticker] = { name: s.name, sector: s.sector, industry: s.industry };
  }

  const toDate = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(Date.now() - 300 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  console.log('Fetching SPY benchmark data...');
  const spyBars = await fetchDailyBars('SPY', fromDate, toDate);
  if (!spyBars || spyBars.length < 80) {
    throw new Error('Could not fetch sufficient SPY benchmark data');
  }

  console.log(`Fetching data for ${tickers.length} tickers...`);
  const { results: allBars, errors } = await fetchMultipleTickers(tickers, fromDate, toDate, 250);

  const validBars = {};
  const fetchErrors = [];
  for (const ticker of tickers) {
    if (errors[ticker]) {
      fetchErrors.push({ ticker, error: errors[ticker] });
    } else if (!allBars[ticker] || allBars[ticker].length < 80) {
      fetchErrors.push({ ticker, error: 'Insufficient historical data' });
    } else {
      validBars[ticker] = allBars[ticker];
    }
  }

  if (Object.keys(validBars).length === 0) {
    throw new Error('No valid stock data could be retrieved');
  }

  const analysis = calculateAllScores(validBars, spyBars);

  for (const r of analysis.results) {
    const meta = metaMap[r.ticker] || {};
    r.name = meta.name || '';
    r.sector = meta.sector || '';
    r.industry = meta.industry || '';
  }

  analysis.fetchErrors = fetchErrors;
  return analysis;
}

module.exports = { router, runAnalysis };
