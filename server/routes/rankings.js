const express = require('express');
const { eq, desc, and, asc } = require('drizzle-orm');
const { getDb, getEasternDate } = require('../db');
const { rankingResults } = require('../schema');

const router = express.Router();

// Get ranking for a specific list and date (or latest)
router.get('/:listName', async (req, res) => {
  try {
    const db = getDb();
    const { listName } = req.params;
    const { date } = req.query;

    let result;
    if (date) {
      [result] = await db
        .select()
        .from(rankingResults)
        .where(and(eq(rankingResults.listName, listName), eq(rankingResults.analysisDate, date)))
        .limit(1);
    } else {
      [result] = await db
        .select()
        .from(rankingResults)
        .where(eq(rankingResults.listName, listName))
        .orderBy(desc(rankingResults.analysisDate))
        .limit(1);
    }

    if (!result) {
      return res.json({ found: false, listName, date: date || null });
    }

    res.json({
      found: true,
      id: result.id,
      listName: result.listName,
      analysisDate: result.analysisDate,
      listUpdateDate: result.listUpdateDate,
      results: JSON.parse(result.resultsJson),
      spyData: result.spyDataJson ? JSON.parse(result.spyDataJson) : null,
      stockCount: result.stockCount,
      analyzedAt: result.analyzedAt,
      portfolioId: result.portfolioId,
      portfolioStatus: result.portfolioStatus,
    });
  } catch (err) {
    console.error('Error fetching ranking:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all available dates for a list (for date navigation)
router.get('/:listName/dates', async (req, res) => {
  try {
    const db = getDb();
    const { listName } = req.params;

    const results = await db
      .select({
        analysisDate: rankingResults.analysisDate,
        listUpdateDate: rankingResults.listUpdateDate,
        id: rankingResults.id,
      })
      .from(rankingResults)
      .where(eq(rankingResults.listName, listName))
      .orderBy(desc(rankingResults.analysisDate));

    res.json(results);
  } catch (err) {
    console.error('Error fetching dates:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
