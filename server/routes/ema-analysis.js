const express = require('express');
const { eq, and, desc } = require('drizzle-orm');
const { getDb, getEasternDate } = require('../db');
const { emaScanResults, emaAnalysis } = require('../schema');

const router = express.Router();

// Get latest EMA analysis for a list
router.get('/:listName', async (req, res) => {
  try {
    const db = getDb();
    const { listName } = req.params;
    const { date } = req.query;

    let query = db
      .select()
      .from(emaAnalysis)
      .where(eq(emaAnalysis.listName, listName))
      .orderBy(desc(emaAnalysis.analysisDate))
      .limit(1);

    if (date) {
      query = db
        .select()
        .from(emaAnalysis)
        .where(and(
          eq(emaAnalysis.listName, listName),
          eq(emaAnalysis.analysisDate, date)
        ))
        .limit(1);
    }

    const results = await query;

    if (results.length === 0) {
      return res.json({ found: false });
    }

    const analysis = results[0];

    // Get associated scan result
    const [scanResult] = await db
      .select()
      .from(emaScanResults)
      .where(eq(emaScanResults.id, analysis.scanResultId));

    // Convert absolute image path to URL path
    // e.g. /data/2026-02-15/leading_stocks_candleglance.png -> /api/scan-data/2026-02-15/leading_stocks_candleglance.png
    const dataDir = process.env.DATA_DIR || '/data';
    let imageUrl = null;
    if (scanResult?.imagePath) {
      const relativePath = scanResult.imagePath.startsWith(dataDir)
        ? scanResult.imagePath.slice(dataDir.length)
        : scanResult.imagePath;
      imageUrl = `/api/scan-data${relativePath.startsWith('/') ? '' : '/'}${relativePath}`;
    }

    res.json({
      found: true,
      id: analysis.id,
      listName: analysis.listName,
      analysisDate: analysis.analysisDate,
      categorySummary: JSON.parse(analysis.categorySummary),
      stockAnalysis: JSON.parse(analysis.stockAnalysis),
      portfolioId: analysis.portfolioId,
      portfolioStatus: analysis.portfolioStatus,
      scanResult: scanResult ? {
        stockCount: scanResult.stockCount,
        symbols: JSON.parse(scanResult.stockSymbols),
        chartlistName: scanResult.chartlistName,
        imageUrl,
      } : null,
    });
  } catch (err) {
    console.error('Error fetching EMA analysis:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get available EMA analysis dates for a list
router.get('/:listName/dates', async (req, res) => {
  try {
    const db = getDb();
    const { listName } = req.params;

    const results = await db
      .select({
        analysisDate: emaAnalysis.analysisDate,
        id: emaAnalysis.id,
      })
      .from(emaAnalysis)
      .where(eq(emaAnalysis.listName, listName))
      .orderBy(desc(emaAnalysis.analysisDate));

    res.json(results);
  } catch (err) {
    console.error('Error fetching EMA dates:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
