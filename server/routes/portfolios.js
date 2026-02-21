const express = require('express');
const { eq, and, desc } = require('drizzle-orm');
const { getDb, getEasternDate } = require('../db');
const { portfolios, portfolioHoldings, portfolioSnapshots, rankingResults, emaAnalysis } = require('../schema');
const { fetchDailyBars } = require('../../src/polygon');

const router = express.Router();

// --- Service functions (callable from cron jobs without HTTP) ---

async function createPortfolioFromRanking(rankingResultId) {
  const db = getDb();

  const [ranking] = await db
    .select()
    .from(rankingResults)
    .where(eq(rankingResults.id, rankingResultId));

  if (!ranking) {
    throw new Error('Ranking result not found');
  }
  if (ranking.portfolioStatus === 'active') {
    throw new Error('Portfolio already exists for this ranking');
  }

  const results = JSON.parse(ranking.resultsJson);
  const top5 = results.slice(0, 5);
  if (top5.length === 0) {
    throw new Error('No stocks to create portfolio from');
  }

  const today = getEasternDate();
  const initialCapital = 100000;
  const perStock = initialCapital / top5.length;

  const toDate = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const holdingsList = [];
  for (const stock of top5) {
    try {
      const bars = await fetchDailyBars(stock.ticker, fromDate, toDate);
      const price = bars && bars.length > 0 ? bars[bars.length - 1].c : stock.indicators?.close;
      if (!price) continue;

      const shares = Math.floor((perStock / price) * 10000) / 10000;
      holdingsList.push({
        symbol: stock.ticker,
        shares: shares.toString(),
        entryPrice: price.toFixed(2),
        currentPrice: price.toFixed(2),
        gainLoss: '0',
        gainLossPct: '0',
      });
    } catch (err) {
      console.error(`Error fetching price for ${stock.ticker}:`, err.message);
      const price = stock.indicators?.close;
      if (price) {
        const shares = Math.floor((perStock / price) * 10000) / 10000;
        holdingsList.push({
          symbol: stock.ticker,
          shares: shares.toString(),
          entryPrice: price.toFixed(2),
          currentPrice: price.toFixed(2),
          gainLoss: '0',
          gainLossPct: '0',
        });
      }
    }
    await new Promise(r => setTimeout(r, 300));
  }

  if (holdingsList.length === 0) {
    throw new Error('Could not get prices for any stocks');
  }

  const [portfolio] = await db
    .insert(portfolios)
    .values({
      rankingResultId,
      listName: ranking.listName,
      status: 'active',
      initialCapital: initialCapital.toFixed(2),
      currentValue: initialCapital.toFixed(2),
      totalGainLoss: '0',
      totalGainLossPct: '0',
      purchaseDate: today,
      holdingDays: 30,
    })
    .returning();

  for (const h of holdingsList) {
    await db.insert(portfolioHoldings).values({
      portfolioId: portfolio.id,
      ...h,
    });
  }

  await db.insert(portfolioSnapshots).values({
    portfolioId: portfolio.id,
    snapshotDate: today,
    totalValue: initialCapital.toFixed(2),
    totalGainLoss: '0',
    totalGainLossPct: '0',
    holdingsJson: JSON.stringify(holdingsList),
  });

  await db
    .update(rankingResults)
    .set({ portfolioId: portfolio.id, portfolioStatus: 'active' })
    .where(eq(rankingResults.id, rankingResultId));

  return { success: true, portfolio: { ...portfolio, holdings: holdingsList } };
}

async function createEmaPortfolioFromAnalysis(emaAnalysisId) {
  const db = getDb();

  const [analysis] = await db
    .select()
    .from(emaAnalysis)
    .where(eq(emaAnalysis.id, emaAnalysisId));

  if (!analysis) {
    throw new Error('EMA analysis not found');
  }
  if (analysis.portfolioStatus === 'active') {
    throw new Error('EMA portfolio already exists for this analysis');
  }

  const stockAnalysisArr = JSON.parse(analysis.stockAnalysis);

  const sorted = stockAnalysisArr
    .map(s => ({
      ...s,
      star_rating: s.star_rating || _parseStarRating(s.ranking_formatted),
    }))
    .sort((a, b) => (b.star_rating || 0) - (a.star_rating || 0));

  const top5 = sorted.slice(0, 5);
  if (top5.length === 0) {
    throw new Error('No stocks to create EMA portfolio from');
  }

  const today = getEasternDate();
  const initialCapital = 100000;
  const perStock = initialCapital / top5.length;

  const toDate = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const holdingsList = [];
  for (const stock of top5) {
    try {
      const bars = await fetchDailyBars(stock.symbol, fromDate, toDate);
      const price = bars && bars.length > 0 ? bars[bars.length - 1].c : null;
      if (!price) continue;

      const shares = Math.floor((perStock / price) * 10000) / 10000;
      holdingsList.push({
        symbol: stock.symbol,
        shares: shares.toString(),
        entryPrice: price.toFixed(2),
        currentPrice: price.toFixed(2),
        gainLoss: '0',
        gainLossPct: '0',
      });
    } catch (err) {
      console.error(`Error fetching price for ${stock.symbol}:`, err.message);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  if (holdingsList.length === 0) {
    throw new Error('Could not get prices for any EMA stocks');
  }

  const [portfolio] = await db
    .insert(portfolios)
    .values({
      rankingResultId: analysis.scanResultId,
      listName: `${analysis.listName}_ema`,
      status: 'active',
      initialCapital: initialCapital.toFixed(2),
      currentValue: initialCapital.toFixed(2),
      totalGainLoss: '0',
      totalGainLossPct: '0',
      purchaseDate: today,
      holdingDays: 30,
    })
    .returning();

  for (const h of holdingsList) {
    await db.insert(portfolioHoldings).values({
      portfolioId: portfolio.id,
      ...h,
    });
  }

  await db.insert(portfolioSnapshots).values({
    portfolioId: portfolio.id,
    snapshotDate: today,
    totalValue: initialCapital.toFixed(2),
    totalGainLoss: '0',
    totalGainLossPct: '0',
    holdingsJson: JSON.stringify(holdingsList),
  });

  await db
    .update(emaAnalysis)
    .set({ portfolioId: portfolio.id, portfolioStatus: 'active' })
    .where(eq(emaAnalysis.id, emaAnalysisId));

  return { success: true, portfolio: { ...portfolio, holdings: holdingsList } };
}

async function updatePortfolioPricesService(portfolioId) {
  const db = getDb();

  const [portfolio] = await db
    .select()
    .from(portfolios)
    .where(eq(portfolios.id, portfolioId));

  if (!portfolio) {
    throw new Error('Portfolio not found');
  }

  const holdingsRows = await db
    .select()
    .from(portfolioHoldings)
    .where(eq(portfolioHoldings.portfolioId, portfolioId));

  const toDate = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  let totalValue = 0;
  const updatedHoldings = [];

  for (const holding of holdingsRows) {
    try {
      const bars = await fetchDailyBars(holding.symbol, fromDate, toDate);
      const currentPrice = bars && bars.length > 0 ? bars[bars.length - 1].c : parseFloat(holding.currentPrice);

      const entryPrice = parseFloat(holding.entryPrice);
      const shares = parseFloat(holding.shares);
      const holdingValue = shares * currentPrice;
      const gainLoss = holdingValue - (shares * entryPrice);
      const gainLossPct = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;

      totalValue += holdingValue;

      await db
        .update(portfolioHoldings)
        .set({
          currentPrice: currentPrice.toFixed(2),
          gainLoss: gainLoss.toFixed(2),
          gainLossPct: gainLossPct.toFixed(4),
          lastUpdatedAt: new Date(),
        })
        .where(eq(portfolioHoldings.id, holding.id));

      updatedHoldings.push({
        ...holding,
        currentPrice: currentPrice.toFixed(2),
        gainLoss: gainLoss.toFixed(2),
        gainLossPct: gainLossPct.toFixed(4),
      });
    } catch (err) {
      console.error(`Error updating price for ${holding.symbol}:`, err.message);
      totalValue += parseFloat(holding.shares) * parseFloat(holding.currentPrice);
      updatedHoldings.push(holding);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  const initialCapital = parseFloat(portfolio.initialCapital);
  const totalGainLoss = totalValue - initialCapital;
  const totalGainLossPct = initialCapital > 0 ? (totalGainLoss / initialCapital) * 100 : 0;

  const purchaseDate = new Date(portfolio.purchaseDate + 'T00:00:00-05:00');
  const closeTarget = new Date(purchaseDate);
  closeTarget.setDate(closeTarget.getDate() + (portfolio.holdingDays || 30));
  const shouldClose = new Date() >= closeTarget;

  const newStatus = shouldClose ? 'closed' : 'active';
  const today = getEasternDate();

  await db
    .update(portfolios)
    .set({
      currentValue: totalValue.toFixed(2),
      totalGainLoss: totalGainLoss.toFixed(2),
      totalGainLossPct: totalGainLossPct.toFixed(4),
      status: newStatus,
      closeDate: shouldClose ? today : null,
      lastUpdatedAt: new Date(),
    })
    .where(eq(portfolios.id, portfolioId));

  const [existingSnapshot] = await db
    .select()
    .from(portfolioSnapshots)
    .where(and(
      eq(portfolioSnapshots.portfolioId, portfolioId),
      eq(portfolioSnapshots.snapshotDate, today)
    ));

  if (existingSnapshot) {
    await db
      .update(portfolioSnapshots)
      .set({
        totalValue: totalValue.toFixed(2),
        totalGainLoss: totalGainLoss.toFixed(2),
        totalGainLossPct: totalGainLossPct.toFixed(4),
        holdingsJson: JSON.stringify(updatedHoldings),
      })
      .where(eq(portfolioSnapshots.id, existingSnapshot.id));
  } else {
    await db.insert(portfolioSnapshots).values({
      portfolioId,
      snapshotDate: today,
      totalValue: totalValue.toFixed(2),
      totalGainLoss: totalGainLoss.toFixed(2),
      totalGainLossPct: totalGainLossPct.toFixed(4),
      holdingsJson: JSON.stringify(updatedHoldings),
    });
  }

  if (shouldClose) {
    await db
      .update(rankingResults)
      .set({ portfolioStatus: 'closed' })
      .where(eq(rankingResults.portfolioId, portfolioId));
  }

  const snapshots = await db
    .select()
    .from(portfolioSnapshots)
    .where(eq(portfolioSnapshots.portfolioId, portfolioId))
    .orderBy(portfolioSnapshots.snapshotDate);

  return {
    success: true,
    portfolio: {
      ...portfolio,
      currentValue: totalValue.toFixed(2),
      totalGainLoss: totalGainLoss.toFixed(2),
      totalGainLossPct: totalGainLossPct.toFixed(4),
      status: newStatus,
    },
    holdings: updatedHoldings,
    snapshots,
  };
}

// --- Route handlers (thin wrappers around service functions) ---

// Create portfolio from top 5 stocks of a ranking result
router.post('/', async (req, res) => {
  try {
    const result = await createPortfolioFromRanking(req.body.rankingResultId);
    res.json(result);
  } catch (err) {
    console.error('Error creating portfolio:', err);
    const status = err.message.includes('not found') ? 404 : err.message.includes('already exists') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

// Create EMA portfolio from top 5 stocks by Gemini star rating
router.post('/ema', async (req, res) => {
  try {
    const result = await createEmaPortfolioFromAnalysis(req.body.emaAnalysisId);
    res.json(result);
  } catch (err) {
    console.error('Error creating EMA portfolio:', err);
    const status = err.message.includes('not found') ? 404 : err.message.includes('already exists') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

function _parseStarRating(formatted) {
  if (!formatted) return 0;
  const stars = (formatted.match(/★/g) || []).length;
  return stars || 0;
}

// Get portfolio comparison data (all portfolios with snapshots, grouped by strategy)
// NOTE: Must be defined BEFORE /:id to avoid Express matching "comparison" as an id
router.get('/comparison', async (req, res) => {
  try {
    const db = getDb();

    // Get all portfolios ordered by purchase date
    const allPortfolios = await db
      .select()
      .from(portfolios)
      .orderBy(portfolios.purchaseDate);

    // Get all snapshots for all portfolios
    const allSnapshots = await db
      .select()
      .from(portfolioSnapshots)
      .orderBy(portfolioSnapshots.snapshotDate);

    // Group snapshots by portfolioId
    const snapshotsByPortfolio = {};
    for (const s of allSnapshots) {
      if (!snapshotsByPortfolio[s.portfolioId]) {
        snapshotsByPortfolio[s.portfolioId] = [];
      }
      snapshotsByPortfolio[s.portfolioId].push({
        date: s.snapshotDate,
        totalValue: parseFloat(s.totalValue),
        totalGainLoss: parseFloat(s.totalGainLoss),
        totalGainLossPct: parseFloat(s.totalGainLossPct),
      });
    }

    // Build portfolio list with parsed numeric fields and snapshots
    const result = allPortfolios.map(p => ({
      id: p.id,
      listName: p.listName,
      status: p.status,
      initialCapital: parseFloat(p.initialCapital),
      currentValue: parseFloat(p.currentValue),
      totalGainLoss: parseFloat(p.totalGainLoss),
      totalGainLossPct: parseFloat(p.totalGainLossPct),
      purchaseDate: p.purchaseDate,
      closeDate: p.closeDate,
      holdingDays: p.holdingDays,
      snapshots: snapshotsByPortfolio[p.id] || [],
    }));

    res.json(result);
  } catch (err) {
    console.error('Error fetching portfolio comparison:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get portfolio details
router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const portfolioId = parseInt(req.params.id);

    const [portfolio] = await db
      .select()
      .from(portfolios)
      .where(eq(portfolios.id, portfolioId));

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    const holdings = await db
      .select()
      .from(portfolioHoldings)
      .where(eq(portfolioHoldings.portfolioId, portfolioId));

    const snapshots = await db
      .select()
      .from(portfolioSnapshots)
      .where(eq(portfolioSnapshots.portfolioId, portfolioId))
      .orderBy(portfolioSnapshots.snapshotDate);

    // Calculate days remaining
    const purchaseDate = new Date(portfolio.purchaseDate + 'T00:00:00-05:00');
    const closeTarget = new Date(purchaseDate);
    closeTarget.setDate(closeTarget.getDate() + (portfolio.holdingDays || 30));
    const now = new Date();
    const daysRemaining = Math.max(0, Math.ceil((closeTarget - now) / (1000 * 60 * 60 * 24)));

    res.json({
      ...portfolio,
      holdings,
      snapshots,
      daysRemaining,
      initialCapital: parseFloat(portfolio.initialCapital),
      currentValue: parseFloat(portfolio.currentValue),
      totalGainLoss: parseFloat(portfolio.totalGainLoss),
      totalGainLossPct: parseFloat(portfolio.totalGainLossPct),
    });
  } catch (err) {
    console.error('Error fetching portfolio:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update prices for a portfolio
router.post('/:id/update-prices', async (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const result = await updatePortfolioPricesService(portfolioId);
    res.json(result);
  } catch (err) {
    console.error('Error updating prices:', err);
    const status = err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

// Get all active portfolios
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const results = await db
      .select()
      .from(portfolios)
      .orderBy(desc(portfolios.createdAt));
    res.json(results);
  } catch (err) {
    console.error('Error fetching portfolios:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = {
  router,
  createPortfolioFromRanking,
  createEmaPortfolioFromAnalysis,
  updatePortfolioPricesService,
};
