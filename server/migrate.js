/**
 * Simple migration script that creates tables if they don't exist.
 * Run with: node server/migrate.js
 */
require('dotenv').config();
const { Pool } = require('pg');

async function migrate() {
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
    `);
    console.log('Migration completed successfully');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
