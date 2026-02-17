require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const { getDb } = require('./db');
const { isTradingDayToday, scheduleEastern } = require('./trading-calendar');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Import routes
const { router: analysisRouter } = require('./routes/analysis');
const rankingsRouter = require('./routes/rankings');
const portfoliosRouter = require('./routes/portfolios');
const automationRouter = require('./routes/automation');
const emaAnalysisRouter = require('./routes/ema-analysis');

// API routes
app.use('/api', analysisRouter);
app.use('/api/rankings', rankingsRouter);
app.use('/api/portfolios', portfoliosRouter);
app.use('/api/automation', automationRouter);
app.use('/api/ema-analysis', emaAnalysisRouter);

// Serve EMA scan data files (images, CSVs) from data directory
const dataDir = process.env.DATA_DIR || '/data';
app.use('/api/scan-data', express.static(dataDir));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    apiKeySet: !!process.env.MASSIVE_STOCK_API_KEY,
    dbSet: !!process.env.DATABASE_URL,
    geminiKeySet: !!process.env.GEMINI_API_KEY,
    stockchartsSet: !!(process.env.STOCKCHARTS_USERNAME && process.env.STOCKCHARTS_PASSWORD),
  });
});

// Serve React build in production
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(distPath, 'index.html'));
  }
});

// Initialize DB and start server
async function start() {
  try {
    // Run migrations on startup
    if (process.env.DATABASE_URL) {
      const { Pool } = require('pg');
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      });
      const client = await pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS chart_list_updates (
            id SERIAL PRIMARY KEY,
            list_name VARCHAR(100) NOT NULL UNIQUE,
            last_update_date VARCHAR(20) NOT NULL,
            last_checked_at TIMESTAMP DEFAULT NOW() NOT NULL,
            last_downloaded_at TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS ranking_results (
            id SERIAL PRIMARY KEY,
            list_name VARCHAR(100) NOT NULL,
            analysis_date VARCHAR(10) NOT NULL,
            list_update_date VARCHAR(20),
            results_json TEXT NOT NULL,
            spy_data_json TEXT,
            stock_count INTEGER NOT NULL,
            analyzed_at TIMESTAMP DEFAULT NOW() NOT NULL,
            portfolio_id INTEGER,
            portfolio_status VARCHAR(20) DEFAULT 'none'
          );
          CREATE TABLE IF NOT EXISTS portfolios (
            id SERIAL PRIMARY KEY,
            ranking_result_id INTEGER NOT NULL,
            list_name VARCHAR(100) NOT NULL,
            status VARCHAR(20) DEFAULT 'active' NOT NULL,
            initial_capital NUMERIC(12,2) DEFAULT 100000 NOT NULL,
            current_value NUMERIC(12,2),
            total_gain_loss NUMERIC(12,2) DEFAULT 0,
            total_gain_loss_pct NUMERIC(8,4) DEFAULT 0,
            purchase_date VARCHAR(10) NOT NULL,
            close_date VARCHAR(10),
            holding_days INTEGER DEFAULT 30,
            created_at TIMESTAMP DEFAULT NOW() NOT NULL,
            last_updated_at TIMESTAMP DEFAULT NOW() NOT NULL
          );
          CREATE TABLE IF NOT EXISTS portfolio_holdings (
            id SERIAL PRIMARY KEY,
            portfolio_id INTEGER NOT NULL,
            symbol VARCHAR(20) NOT NULL,
            shares NUMERIC(12,4) NOT NULL,
            entry_price NUMERIC(12,2) NOT NULL,
            current_price NUMERIC(12,2),
            gain_loss NUMERIC(12,2) DEFAULT 0,
            gain_loss_pct NUMERIC(8,4) DEFAULT 0,
            last_updated_at TIMESTAMP DEFAULT NOW() NOT NULL
          );
          CREATE TABLE IF NOT EXISTS portfolio_snapshots (
            id SERIAL PRIMARY KEY,
            portfolio_id INTEGER NOT NULL,
            snapshot_date VARCHAR(10) NOT NULL,
            total_value NUMERIC(12,2) NOT NULL,
            total_gain_loss NUMERIC(12,2) NOT NULL,
            total_gain_loss_pct NUMERIC(8,4) NOT NULL,
            holdings_json TEXT,
            created_at TIMESTAMP DEFAULT NOW() NOT NULL
          );
          CREATE TABLE IF NOT EXISTS ema_scan_results (
            id SERIAL PRIMARY KEY,
            list_name VARCHAR(100) NOT NULL,
            scan_date VARCHAR(10) NOT NULL,
            chartlist_name TEXT,
            stock_symbols TEXT NOT NULL,
            stock_count INTEGER NOT NULL,
            csv_path TEXT,
            image_path TEXT,
            scanned_at TIMESTAMP DEFAULT NOW() NOT NULL
          );
          CREATE TABLE IF NOT EXISTS ema_analysis (
            id SERIAL PRIMARY KEY,
            scan_result_id INTEGER NOT NULL,
            list_name VARCHAR(100) NOT NULL,
            analysis_date VARCHAR(10) NOT NULL,
            category_summary TEXT NOT NULL,
            stock_analysis TEXT NOT NULL,
            raw_response TEXT,
            portfolio_id INTEGER,
            portfolio_status VARCHAR(20) DEFAULT 'none',
            created_at TIMESTAMP DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW() NOT NULL
          );
        `);
        console.log('Database tables ensured');
      } finally {
        client.release();
        await pool.end();
      }
    }

    app.listen(PORT, () => {
      console.log(`Swing Trade Ranking server running on port ${PORT}`);
    });

    // ----- DST-aware, trading-day-guarded cron schedules -----
    // scheduleEastern() converts Eastern times to UTC and auto-reschedules on DST transitions.
    // Each handler skips execution on market holidays.

    // Daily check at 9:30 AM Eastern (Mon-Fri, trading days only)
    scheduleEastern(cron, 9, 30, '1-5', async () => {
      if (!isTradingDayToday()) {
        console.log('Skipping scheduled check-and-download: market is closed today (holiday)');
        return;
      }
      console.log('Running scheduled check-and-download...');
      try {
        const fetch = globalThis.fetch || (await import('node-fetch')).default;
        await fetch(`http://localhost:${PORT}/api/automation/check-and-download`, {
          method: 'POST',
        });
        console.log('Scheduled check completed');
      } catch (err) {
        console.error('Scheduled check failed:', err.message);
      }
    }, 'Daily check-and-download (9:30 AM ET)');

    // Weekly auto-portfolio workflow at 5:30 PM Eastern (Mon-Fri, trading days only)
    // Fires every weekday but the route handler only proceeds on the 1st or 2nd
    // trading day of the week, replacing the old Mon+Tue hardcoded schedule.
    scheduleEastern(cron, 17, 30, '1-5', async () => {
      if (!isTradingDayToday()) {
        console.log('Skipping weekly workflow: market is closed today (holiday)');
        return;
      }
      console.log('Running weekly auto-portfolio workflow...');
      try {
        const fetch = globalThis.fetch || (await import('node-fetch')).default;
        const response = await fetch(`http://localhost:${PORT}/api/automation/monday-workflow`, {
          method: 'POST',
        });
        const result = await response.json();
        if (result.skipped) {
          console.log('Weekly workflow skipped:', result.message);
        } else {
          console.log(`Weekly workflow complete. Portfolios created: ${result.portfoliosCreated?.length || 0}`);
        }
      } catch (err) {
        console.error('Weekly workflow failed:', err.message);
      }
    }, 'Weekly portfolio workflow (5:30 PM ET)');

    // Daily price update at 5:00 PM Eastern (Mon-Fri, trading days only)
    scheduleEastern(cron, 17, 0, '1-5', async () => {
      if (!isTradingDayToday()) {
        console.log('Skipping scheduled price update: market is closed today (holiday)');
        return;
      }
      console.log('Running scheduled price update...');
      try {
        const db = getDb();
        const { portfolios: portfoliosTable } = require('./schema');
        const { eq } = require('drizzle-orm');
        const activePortfolios = await db
          .select()
          .from(portfoliosTable)
          .where(eq(portfoliosTable.status, 'active'));

        for (const p of activePortfolios) {
          try {
            const fetch = globalThis.fetch || (await import('node-fetch')).default;
            await fetch(`http://localhost:${PORT}/api/portfolios/${p.id}/update-prices`, {
              method: 'POST',
            });
            console.log(`Updated prices for portfolio ${p.id}`);
          } catch (err) {
            console.error(`Failed to update portfolio ${p.id}:`, err.message);
          }
        }
      } catch (err) {
        console.error('Scheduled price update failed:', err.message);
      }
    }, 'Daily price update (5:00 PM ET)');

  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
