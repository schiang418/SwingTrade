const { pgTable, serial, varchar, text, integer, numeric, timestamp, boolean } = require('drizzle-orm/pg-core');

const chartListUpdates = pgTable('chart_list_updates', {
  id: serial('id').primaryKey(),
  listName: varchar('list_name', { length: 100 }).notNull().unique(),
  lastUpdateDate: varchar('last_update_date', { length: 20 }).notNull(),
  lastCheckedAt: timestamp('last_checked_at').defaultNow().notNull(),
  lastDownloadedAt: timestamp('last_downloaded_at'),
});

const rankingResults = pgTable('ranking_results', {
  id: serial('id').primaryKey(),
  listName: varchar('list_name', { length: 100 }).notNull(),
  analysisDate: varchar('analysis_date', { length: 10 }).notNull(),
  listUpdateDate: varchar('list_update_date', { length: 20 }),
  resultsJson: text('results_json').notNull(),
  spyDataJson: text('spy_data_json'),
  stockCount: integer('stock_count').notNull(),
  analyzedAt: timestamp('analyzed_at').defaultNow().notNull(),
  portfolioId: integer('portfolio_id'),
  portfolioStatus: varchar('portfolio_status', { length: 20 }).default('none'),
});

const portfolios = pgTable('portfolios', {
  id: serial('id').primaryKey(),
  rankingResultId: integer('ranking_result_id').notNull(),
  listName: varchar('list_name', { length: 100 }).notNull(),
  status: varchar('status', { length: 20 }).default('active').notNull(),
  initialCapital: numeric('initial_capital', { precision: 12, scale: 2 }).default('100000').notNull(),
  currentValue: numeric('current_value', { precision: 12, scale: 2 }),
  totalGainLoss: numeric('total_gain_loss', { precision: 12, scale: 2 }).default('0'),
  totalGainLossPct: numeric('total_gain_loss_pct', { precision: 8, scale: 4 }).default('0'),
  purchaseDate: varchar('purchase_date', { length: 10 }).notNull(),
  closeDate: varchar('close_date', { length: 10 }),
  holdingDays: integer('holding_days').default(30),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastUpdatedAt: timestamp('last_updated_at').defaultNow().notNull(),
});

const portfolioHoldings = pgTable('portfolio_holdings', {
  id: serial('id').primaryKey(),
  portfolioId: integer('portfolio_id').notNull(),
  symbol: varchar('symbol', { length: 20 }).notNull(),
  shares: numeric('shares', { precision: 12, scale: 4 }).notNull(),
  entryPrice: numeric('entry_price', { precision: 12, scale: 2 }).notNull(),
  currentPrice: numeric('current_price', { precision: 12, scale: 2 }),
  gainLoss: numeric('gain_loss', { precision: 12, scale: 2 }).default('0'),
  gainLossPct: numeric('gain_loss_pct', { precision: 8, scale: 4 }).default('0'),
  lastUpdatedAt: timestamp('last_updated_at').defaultNow().notNull(),
});

const portfolioSnapshots = pgTable('portfolio_snapshots', {
  id: serial('id').primaryKey(),
  portfolioId: integer('portfolio_id').notNull(),
  snapshotDate: varchar('snapshot_date', { length: 10 }).notNull(),
  totalValue: numeric('total_value', { precision: 12, scale: 2 }).notNull(),
  totalGainLoss: numeric('total_gain_loss', { precision: 12, scale: 2 }).notNull(),
  totalGainLossPct: numeric('total_gain_loss_pct', { precision: 8, scale: 4 }).notNull(),
  holdingsJson: text('holdings_json'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

module.exports = {
  chartListUpdates,
  rankingResults,
  portfolios,
  portfolioHoldings,
  portfolioSnapshots,
};
