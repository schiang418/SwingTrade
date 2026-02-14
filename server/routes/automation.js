const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const { eq } = require('drizzle-orm');
const { getDb, getEasternDate } = require('../db');
const { chartListUpdates, rankingResults } = require('../schema');
const { parseExcelForTickers } = require('../../src/excel');
const { runAnalysis } = require('./analysis');

const router = express.Router();

// Trigger check and download
router.post('/check-and-download', async (req, res) => {
  try {
    const db = getDb();
    const userid = process.env.EARNINGSBEATS_USERID;
    const password = process.env.EARNINGSBEATS_PASSWORD;

    if (!userid || !password) {
      return res.status(400).json({ error: 'EarningsBeats credentials not configured' });
    }

    // Get known dates from DB
    const knownDates = {};
    const storedUpdates = await db.select().from(chartListUpdates);
    for (const row of storedUpdates) {
      knownDates[row.listName] = row.lastUpdateDate;
    }

    const leadingDate = knownDates['leading_stocks'] || 'none';
    const hotDate = knownDates['hot_stocks'] || 'none';

    console.log(`Known dates - Leading: ${leadingDate}, Hot: ${hotDate}`);

    // Run Python automation
    const result = await runAutomation(userid, password, leadingDate, hotDate);

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Automation failed' });
    }

    const processed = { leading_stocks: null, hot_stocks: null };

    // Process Leading Stocks if new
    if (result.leading_stocks.is_new && result.leading_stocks.file_path) {
      console.log('Processing new Leading Stocks file...');
      processed.leading_stocks = await processDownloadedFile(
        db, 'leading_stocks', result.leading_stocks.file_path, result.leading_stocks.date_on_page
      );
    }

    // Process Hot Stocks if new
    if (result.hot_stocks.is_new && result.hot_stocks.file_path) {
      console.log('Processing new Hot Stocks file...');
      processed.hot_stocks = await processDownloadedFile(
        db, 'hot_stocks', result.hot_stocks.file_path, result.hot_stocks.date_on_page
      );
    }

    res.json({
      success: true,
      automation: result,
      processed,
    });
  } catch (err) {
    console.error('Automation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get automation status (last check dates)
router.get('/status', async (req, res) => {
  try {
    const db = getDb();
    const updates = await db.select().from(chartListUpdates);
    res.json(updates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function runAutomation(userid, password, leadingDate, hotDate) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '../../automation/earningsbeats.py');
    const downloadDir = path.join(__dirname, '../../downloads');

    const args = [
      scriptPath,
      '--userid', userid,
      '--password', password,
      '--leading-date', leadingDate,
      '--hot-date', hotDate,
      '--download-dir', downloadDir,
    ];

    console.log('Starting automation...');
    const proc = spawn('python3', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      console.log('[Python]', data.toString().trim());
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error('Automation exited with code:', code);
        console.error('stderr:', stderr);
      }
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse automation output: ${stdout}\nStderr: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start automation: ${err.message}`));
    });
  });
}

async function processDownloadedFile(db, listName, filePath, updateDate) {
  try {
    // Parse Excel file
    const stocks = parseExcelForTickers(filePath);
    console.log(`Parsed ${stocks.length} tickers from ${listName}`);

    // Run analysis
    const analysis = await runAnalysis(stocks);
    const today = getEasternDate();

    // Store ranking result
    const [result] = await db
      .insert(rankingResults)
      .values({
        listName,
        analysisDate: today,
        listUpdateDate: updateDate,
        resultsJson: JSON.stringify(analysis.results),
        spyDataJson: JSON.stringify(analysis.spyData),
        stockCount: analysis.results.length,
      })
      .returning();

    // Update chart list tracking
    const [existing] = await db
      .select()
      .from(chartListUpdates)
      .where(eq(chartListUpdates.listName, listName));

    if (existing) {
      await db
        .update(chartListUpdates)
        .set({
          lastUpdateDate: updateDate,
          lastCheckedAt: new Date(),
          lastDownloadedAt: new Date(),
        })
        .where(eq(chartListUpdates.listName, listName));
    } else {
      await db.insert(chartListUpdates).values({
        listName,
        lastUpdateDate: updateDate,
        lastCheckedAt: new Date(),
        lastDownloadedAt: new Date(),
      });
    }

    console.log(`Saved ranking for ${listName} with ${analysis.results.length} stocks`);
    return { rankingId: result.id, stockCount: analysis.results.length };
  } catch (err) {
    console.error(`Error processing ${listName}:`, err);
    return { error: err.message };
  }
}

module.exports = router;
