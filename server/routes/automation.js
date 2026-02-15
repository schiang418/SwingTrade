const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const { eq, and } = require('drizzle-orm');
const { getDb, getEasternDate } = require('../db');
const { chartListUpdates, rankingResults, emaScanResults, emaAnalysis } = require('../schema');
const { parseExcelForTickers } = require('../../src/excel');
const { runAnalysis } = require('./analysis');
const { analyzeScanResults } = require('../gemini');

const router = express.Router();

// Trigger check and download (Excel + EMA scanner)
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

    // Run Python automation (downloads Excel + extracts SC info)
    const result = await runAutomation(userid, password, leadingDate, hotDate);

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Automation failed' });
    }

    const processed = { leading_stocks: null, hot_stocks: null };
    const today = getEasternDate();

    // Process Leading Stocks if new
    if (result.leading_stocks.is_new && result.leading_stocks.file_path) {
      console.log('Processing new Leading Stocks file...');
      processed.leading_stocks = await processDownloadedFile(
        db, 'leading_stocks', result.leading_stocks.file_path, result.leading_stocks.date_on_page, today
      );
    }

    // Process Hot Stocks if new
    if (result.hot_stocks.is_new && result.hot_stocks.file_path) {
      console.log('Processing new Hot Stocks file...');
      processed.hot_stocks = await processDownloadedFile(
        db, 'hot_stocks', result.hot_stocks.file_path, result.hot_stocks.date_on_page, today
      );
    }

    // Run EMA scanner if SC info is available
    let emaResult = null;
    const scEmail = process.env.STOCKCHARTS_EMAIL;
    const scPassword = process.env.STOCKCHARTS_PASSWORD;
    const leadingScUrl = result.leading_stocks.sc_url;
    const leadingScPwd = result.leading_stocks.sc_password;
    const hotScUrl = result.hot_stocks.sc_url;
    const hotScPwd = result.hot_stocks.sc_password;

    if (scEmail && scPassword && (leadingScUrl || hotScUrl)) {
      console.log('Running EMA scanner...');
      try {
        emaResult = await runEmaScanner(scEmail, scPassword, leadingScUrl, leadingScPwd, hotScUrl, hotScPwd);

        if (emaResult && emaResult.success) {
          // Process EMA results and run Gemini analysis
          const emaProcessed = {};
          for (const listKey of ['leading_stocks', 'hot_stocks']) {
            const scanData = emaResult[listKey];
            if (scanData && scanData.stock_count > 0) {
              console.log(`Processing EMA results for ${listKey}: ${scanData.stock_count} stocks`);
              emaProcessed[listKey] = await processEmaResults(
                db, listKey, scanData, today
              );
            }
          }
          emaResult.processed = emaProcessed;
        }
      } catch (emaErr) {
        console.error('EMA scanner error:', emaErr.message);
        emaResult = { error: emaErr.message };
      }
    } else {
      console.log('StockCharts credentials or SC URLs not available, skipping EMA scanner');
    }

    res.json({
      success: true,
      automation: result,
      processed,
      ema: emaResult,
    });
  } catch (err) {
    console.error('Automation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Trigger EMA scanner independently
router.post('/run-ema-scanner', async (req, res) => {
  try {
    const scEmail = process.env.STOCKCHARTS_EMAIL;
    const scPassword = process.env.STOCKCHARTS_PASSWORD;

    if (!scEmail || !scPassword) {
      return res.status(400).json({ error: 'StockCharts credentials not configured' });
    }

    const { leadingUrl, leadingPassword, hotUrl, hotPassword } = req.body;

    if (!leadingUrl && !hotUrl) {
      return res.status(400).json({ error: 'At least one StockCharts URL is required' });
    }

    const emaResult = await runEmaScanner(
      scEmail, scPassword, leadingUrl, leadingPassword, hotUrl, hotPassword
    );

    if (!emaResult || !emaResult.success) {
      return res.status(500).json({ error: emaResult?.error || 'EMA scanner failed' });
    }

    const db = getDb();
    const today = getEasternDate();
    const processed = {};

    for (const listKey of ['leading_stocks', 'hot_stocks']) {
      const scanData = emaResult[listKey];
      if (scanData && scanData.stock_count > 0) {
        processed[listKey] = await processEmaResults(db, listKey, scanData, today);
      }
    }

    res.json({ success: true, ema: emaResult, processed });
  } catch (err) {
    console.error('EMA scanner error:', err);
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

function runEmaScanner(scEmail, scPassword, leadingUrl, leadingPwd, hotUrl, hotPwd) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '../../automation/ema_scanner.py');
    const dataDir = process.env.DATA_DIR || '/data';

    const args = [
      scriptPath,
      '--sc-email', scEmail,
      '--sc-password', scPassword,
      '--data-dir', dataDir,
    ];

    if (leadingUrl) {
      args.push('--leading-url', leadingUrl);
      args.push('--leading-password', leadingPwd || '');
    }
    if (hotUrl) {
      args.push('--hot-url', hotUrl);
      args.push('--hot-password', hotPwd || '');
    }

    console.log('Starting EMA scanner...');
    const proc = spawn('python3', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300000, // 5 minutes for full scan workflow
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      console.log('[EMA Scanner]', data.toString().trim());
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error('EMA scanner exited with code:', code);
        console.error('stderr:', stderr);
      }
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse EMA scanner output: ${stdout}\nStderr: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start EMA scanner: ${err.message}`));
    });
  });
}

async function processDownloadedFile(db, listName, filePath, updateDate, today) {
  try {
    // Parse Excel file
    const stocks = parseExcelForTickers(filePath);
    console.log(`Parsed ${stocks.length} tickers from ${listName}`);

    // Run analysis
    const analysis = await runAnalysis(stocks);

    // Upsert ranking result (most recent data wins for same day + list)
    const [existingRanking] = await db
      .select()
      .from(rankingResults)
      .where(and(
        eq(rankingResults.listName, listName),
        eq(rankingResults.analysisDate, today)
      ));

    let result;
    if (existingRanking) {
      [result] = await db
        .update(rankingResults)
        .set({
          listUpdateDate: updateDate,
          resultsJson: JSON.stringify(analysis.results),
          spyDataJson: JSON.stringify(analysis.spyData),
          stockCount: analysis.results.length,
          analyzedAt: new Date(),
        })
        .where(eq(rankingResults.id, existingRanking.id))
        .returning();
      console.log(`Updated existing ranking for ${listName} on ${today}`);
    } else {
      [result] = await db
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
    }

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

async function processEmaResults(db, listName, scanData, today) {
  try {
    const symbols = scanData.symbols || [];
    const stockCount = scanData.stock_count || symbols.length;

    // Upsert scan result (most recent data wins for same day + list)
    const [existingScan] = await db
      .select()
      .from(emaScanResults)
      .where(and(
        eq(emaScanResults.listName, listName),
        eq(emaScanResults.scanDate, today)
      ));

    let scanResult;
    if (existingScan) {
      [scanResult] = await db
        .update(emaScanResults)
        .set({
          chartlistName: scanData.chartlist_name,
          stockSymbols: JSON.stringify(symbols),
          stockCount,
          csvPath: scanData.csv_path,
          imagePath: scanData.image_path,
          scannedAt: new Date(),
        })
        .where(eq(emaScanResults.id, existingScan.id))
        .returning();
      console.log(`Updated existing EMA scan for ${listName} on ${today}`);
    } else {
      [scanResult] = await db
        .insert(emaScanResults)
        .values({
          listName,
          scanDate: today,
          chartlistName: scanData.chartlist_name,
          stockSymbols: JSON.stringify(symbols),
          stockCount,
          csvPath: scanData.csv_path,
          imagePath: scanData.image_path,
        })
        .returning();
    }

    // Run Gemini AI analysis if we have both CSV and image
    let analysisResult = null;
    if (scanData.csv_path && scanData.image_path && process.env.GEMINI_API_KEY) {
      console.log(`Running Gemini analysis for ${listName}...`);
      try {
        const analysis = await analyzeScanResults(scanData.csv_path, scanData.image_path, listName);

        // Upsert analysis (most recent data wins for same day + list)
        const [existingAnalysis] = await db
          .select()
          .from(emaAnalysis)
          .where(and(
            eq(emaAnalysis.listName, listName),
            eq(emaAnalysis.analysisDate, today)
          ));

        if (existingAnalysis) {
          await db
            .update(emaAnalysis)
            .set({
              scanResultId: scanResult.id,
              categorySummary: JSON.stringify(analysis.categorization_summary),
              stockAnalysis: JSON.stringify(analysis.stock_analysis),
              rawResponse: JSON.stringify(analysis),
              updatedAt: new Date(),
            })
            .where(eq(emaAnalysis.id, existingAnalysis.id));
          console.log(`Updated existing EMA analysis for ${listName} on ${today}`);
        } else {
          await db
            .insert(emaAnalysis)
            .values({
              scanResultId: scanResult.id,
              listName,
              analysisDate: today,
              categorySummary: JSON.stringify(analysis.categorization_summary),
              stockAnalysis: JSON.stringify(analysis.stock_analysis),
              rawResponse: JSON.stringify(analysis),
            });
        }

        analysisResult = {
          stocksAnalyzed: analysis.stock_analysis.length,
          buckets: analysis.categorization_summary.map(b => ({
            name: b.bucket_name,
            count: b.symbols.length,
          })),
        };

        // Save analysis JSON to data directory
        const fs = require('fs');
        const dataDir = path.dirname(scanData.csv_path);
        const jsonPath = path.join(dataDir, `${listName}_ai_analysis.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(analysis, null, 2));
        console.log(`Saved AI analysis JSON: ${jsonPath}`);
      } catch (aiErr) {
        console.error(`Gemini analysis failed for ${listName}:`, aiErr.message);
        analysisResult = { error: aiErr.message };
      }
    } else if (!process.env.GEMINI_API_KEY) {
      console.log('GEMINI_API_KEY not configured, skipping AI analysis');
    }

    return {
      scanResultId: scanResult.id,
      stockCount,
      symbols,
      analysis: analysisResult,
    };
  } catch (err) {
    console.error(`Error processing EMA results for ${listName}:`, err);
    return { error: err.message };
  }
}

module.exports = router;
