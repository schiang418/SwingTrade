# Option Income Strategy — Reference Files & Implementation Guide

## How to Use These Reference Files

This directory contains reference code from the **SwingTrade** project. Study these files to understand the patterns, conventions, and architecture, then build the OptionStrategy app using the same approach.

### Step 1: Fetch this branch from the SwingTrade repo
```bash
git clone https://github.com/schiang418/SwingTrade.git /tmp/swing-reference
cd /tmp/swing-reference
git checkout claude/option-strategy-reference-lmugL
```
Or from within your OptionStrategy repo:
```bash
git remote add swing-ref https://github.com/schiang418/SwingTrade.git
git fetch swing-ref claude/option-strategy-reference-lmugL
git checkout swing-ref/claude/option-strategy-reference-lmugL -- option-strategy-reference/
```

### Step 2: Study the reference files (DO NOT copy them directly — adapt the patterns)

---

## Reference File Map

```
option-strategy-reference/
├── README.md                          ← You are here (full task spec + instructions)
├── backend/
│   ├── index.js                       ← Express server entry, cron jobs, static serving, DB table creation
│   ├── db.js                          ← Drizzle ORM init, getEasternDate() utility
│   ├── schema.js                      ← Drizzle table definitions (pgTable, serial, varchar, numeric, etc.)
│   ├── routes-automation.js           ← Orchestration: subprocess → process results → create portfolios
│   ├── routes-portfolios.js           ← Portfolio CRUD, price updates, snapshot upsert, holdings
│   └── routes-rankings.js             ← Date-based data queries with date navigation
├── api/
│   └── polygon.js                     ← Polygon.io API client with rate limiting (250ms delays)
├── frontend/
│   ├── App.tsx                        ← Main component: tabs, date nav, toast, data fetching
│   ├── api.ts                         ← Typed API client with TypeScript interfaces
│   ├── main.tsx                       ← React entry point
│   ├── index.html                     ← HTML template with dark theme body class
│   ├── index.css                      ← Tailwind imports + CSS variables + scrollbar styling
│   ├── tsconfig.json                  ← TypeScript config
│   ├── RankingTable.tsx               ← Sortable data table with color-coded scores
│   ├── PortfolioSection.tsx           ← Portfolio cards with creation actions
│   ├── PortfolioDialog.tsx            ← Modal with holdings table, recharts line chart, summary cards
│   └── PerformanceComparison.tsx      ← Multi-strategy comparison with LineChart + BarChart
└── config/
    ├── Dockerfile                     ← Node 22 + Python 3 + Chromium container
    ├── package.json                   ← All dependencies (Express, React, Drizzle, Recharts, etc.)
    ├── vite.config.js                 ← Vite build config, /api proxy, path aliases
    ├── tailwind.config.js             ← Dark theme colors (surface, edge, dim, accent)
    ├── drizzle.config.js              ← Drizzle ORM config for PostgreSQL
    └── postcss.config.js              ← PostCSS with Tailwind + Autoprefixer
```

---

## What to Study in Each File

### `backend/index.js` — Server Setup Pattern
- Express app with CORS, JSON parsing
- Route mounting pattern (`app.use('/api/...', router)`)
- Static file serving for React build (`dist/`)
- Database table creation on startup (raw SQL `CREATE TABLE IF NOT EXISTS`)
- Cron job setup with `node-cron` — self-calling via localhost fetch
- Health check endpoint

### `backend/db.js` — Database Pattern
- Singleton Drizzle ORM connection with `getDb()`
- SSL config for production
- `getEasternDate()` — Eastern Time date formatting (use this exact pattern)

### `backend/schema.js` — Schema Pattern
- Drizzle `pgTable()` definitions
- Column types: `serial`, `varchar`, `text`, `integer`, `numeric`, `timestamp`, `boolean`
- Numeric precision patterns (12,2 for money, 8,4 for percentages)
- Module exports pattern

### `backend/routes-automation.js` — Orchestration Pattern (MOST IMPORTANT)
- Monday workflow: check existing data → run automation → create portfolios
- Idempotency: check if today's data exists before running
- Tuesday fallback logic (you don't need this — Option Samurai always available)
- Python subprocess spawning with `spawn()`, JSON stdout parsing
- Process results: parse → upsert to DB → create portfolios
- Portfolio creation via internal API call

### `backend/routes-portfolios.js` — Portfolio Pattern
- Create portfolio: top-5 selection, equal-weight $100K allocation
- Fetch current prices from Polygon, rate limiting with 300ms delays
- Holdings insertion loop
- Price update: fetch new prices → calculate P&L → upsert daily snapshot
- Auto-close on expiration (30-day hold → adapt for option expiration dates)

### `backend/routes-rankings.js` — Query Pattern
- Date-based data retrieval with optional date parameter
- JSON parsing from TEXT columns
- Date navigation endpoint (list all dates)

### `api/polygon.js` — API Client Pattern
- Rate limiting with configurable delay
- Error handling for Polygon API responses
- `fetchDailyBars()` and `fetchMultipleTickers()` patterns
- Adapt for option snapshots and stock prices (different endpoints, different API keys)

### `frontend/App.tsx` — Main App Pattern
- State management: loading, error, data, toast
- Tab navigation, date picker with prev/next
- `useCallback` + `useEffect` for data fetching
- Toast notification system
- Component composition pattern

### `frontend/api.ts` — API Client Pattern
- TypeScript interfaces for all data types
- Typed fetch functions with error handling
- Export pattern for types and functions

### `frontend/PortfolioDialog.tsx` — Modal + Chart Pattern
- Recharts `LineChart` with dark theme styling
- Summary cards grid (2x2 or 4-column)
- Holdings table with P&L color coding
- Modal overlay with Escape key handler

### `frontend/RankingTable.tsx` — Data Table Pattern
- Sortable columns with sort state
- Color-coded values (green/red for profit/loss)
- Score bar visualization
- Responsive overflow handling

### `frontend/PerformanceComparison.tsx` — Advanced Chart Pattern
- Multi-series `LineChart` + `BarChart` with `recharts`
- Strategy comparison with cumulative growth
- Legend, tooltip customization with dark theme

### `config/Dockerfile` — Container Pattern
- Node 22-slim + Python 3 + Chromium + ChromeDriver
- `npm ci` for deterministic installs
- `npm run build` for React frontend
- `/data` directory for scan output

### `config/package.json` — Dependencies
- All the packages you need (adapt versions as needed)
- Script patterns for dev, build, db operations

### `config/tailwind.config.js` — Theme Pattern
- Custom dark theme color palette
- Content paths for client files

---

## Task: Implement Option Income Strategy App

Build a standalone web app for automated option income strategy tracking. This app scrapes Option Samurai for credit put spread scans, creates portfolios, and tracks P&L through expiration.

### Stack
- **Backend:** Express.js, PostgreSQL, Drizzle ORM, node-cron
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS (dark theme, bg-[#0f1117])
- **Scraping:** Puppeteer (headless Chromium)
- **Deployment:** Railway (Dockerfile with Node 20, Python 3, Chromium, ChromeDriver)

### Environment Variables
- `DATABASE_URL` — PostgreSQL connection string
- `OPTION_SAMURAI_EMAIL` / `OPTION_SAMURAI_PASSWORD` — Option Samurai login credentials
- `MASSIVE_API_KEY` — Polygon.io API key for option snapshot data
- `MASSIVE_STOCK_API_KEY` — Polygon.io API key for stock price data
- `PORT` (default 3000), `NODE_ENV`, `DATA_DIR` (default /data)

### Option Samurai Scraper (Puppeteer — NOT Python/Selenium)
- Login at https://app.optionsamurai.com/login (email + password fields, submit button)
- Navigate to Scans page, find saved scan named "bi-weekly income all"
- Parse the scan results table — each row is a credit put spread with columns:
  - Ticker, Company Name, Price, Price Change, IV Rank, IV Percentile
  - Strike (format like "385/380" for sell/buy strikes), Moneyness
  - Exp Date (format like "Feb 21 '25"), Days to Exp
  - Total Opt Vol, Prob Max Profit (percentage), Max Profit, Max Loss, Return %
- All monetary values on the page are displayed as integers (cents or whole dollars depending on context)
- Store results in `option_scan_results` table with `scan_name` and `scan_date`

### Database Schema (4 tables)
Reference: `backend/schema.js` for Drizzle ORM patterns

**option_scan_results** — raw scan data from Option Samurai
- ticker, company_name, price, price_change, iv_rank, iv_percentile
- strike (VARCHAR, the "385/380" string), moneyness, exp_date, days_to_exp
- total_opt_vol, prob_max_profit, max_profit, max_loss, return_percent
- scan_name, scan_date, created_at, updated_at
- Use custom enum types: option_portfolio_type, option_portfolio_status, option_trade_status

**option_portfolios** — two per scan (top_return, top_probability)
- type (enum: 'top_return' | 'top_probability')
- scan_date, scan_name (default 'bi-weekly income all')
- status (enum: 'active' | 'closed')
- initial_capital (default 100000), total_premium_collected, current_value, net_pnl
- last_updated, created_at, updated_at

**option_portfolio_trades** — individual spreads in each portfolio
- portfolio_id (FK), ticker, stock_price_at_entry
- sell_strike, buy_strike, expiration_date
- contracts (default 4), premium_collected, spread_width, max_loss_per_contract
- current_spread_value, current_stock_price, current_pnl
- status (enum: 'open' | 'expired_profit' | 'expired_loss'), is_itm
- created_at, updated_at

**option_portfolio_value_history** — daily snapshots for charting
- portfolio_id (FK), date, portfolio_value, net_pnl, created_at

### Portfolio Creation Logic
When scan results are saved, auto-create two portfolios from the top 5 results:
1. **Top Return** — sort by `return_percent` descending, take top 5
2. **Top Probability** — sort by `prob_max_profit` descending, take top 5

For each trade:
- Parse strike string "385/380" into sell_strike=385, buy_strike=380
- contracts = 4 per trade
- premium_collected = max_profit from scan (already per-contract) × contracts
- spread_width = sell_strike - buy_strike
- max_loss_per_contract = (spread_width × 100) - premium_per_contract
- Get stock entry price from Polygon API

Reference: `backend/routes-automation.js` for portfolio creation pattern

### Polygon.io Integration
Reference: `api/polygon.js` for API client pattern and rate limiting

Two separate API keys for two data types:

**Option snapshots** (MASSIVE_API_KEY):
- `GET /v3/snapshot/options/{underlying}/{optionTicker}`
- Option ticker format: `O:AAPL260227P00385000` = `O:{TICKER}{YYMMDD}{P/C}{STRIKE×1000 padded to 8}`
- Returns bid, ask, midpoint, underlyingPrice

**Stock prices** (MASSIVE_STOCK_API_KEY):
- `GET /v1/open-close/{ticker}/{date}?adjusted=true` (daily close)
- `GET /v2/aggs/ticker/{ticker}/range/1/day/{date}/{date}?adjusted=true` (fallback)
- `GET /v2/snapshot/locale/us/markets/stocks/tickers/{ticker}` (real-time)

### Credit Put Spread P&L Calculation
- **Spread value** = (sell put midpoint - buy put midpoint) × 100
- **Current P&L** = premium_collected - (current_spread_value × contracts)
- **At expiration:**
  - Stock >= sell strike → max profit (keep all premium)
  - Stock <= buy strike → max loss = (spread_width × 100 - premium) × contracts
  - Between strikes → partial loss based on intrinsic value

### Cron Jobs
Reference: `backend/index.js` for cron setup pattern

1. **Monday 9:30 AM ET** (cron: `30 14 * * 1-5`): Run scan workflow — scrape Option Samurai, save results, create portfolios. See "Market Holiday Handling" below for fallback logic.
2. **Daily 5:15 PM ET Mon-Fri** (cron: `15 22 * * 1-5`): Update P&L — get current option spread values and stock prices, check expirations, record value history. Also skips market holidays.

### Market Holiday Handling
The Monday scan cron should actually run Mon-Fri at 9:30 AM ET, but with logic to determine which day to actually execute:

**How to check if the market is open:**
- Use the Polygon.io market status endpoint: `GET https://api.polygon.io/v1/marketstatus/now?apiKey={MASSIVE_STOCK_API_KEY}`
- Response includes `market: "open" | "closed" | "extended-hours"` and `exchanges.nyse: "open" | "closed"` and `exchanges.nasdaq: "open" | "closed"`
- If `market === "closed"` and it's a weekday, it's a market holiday — skip the workflow

**Workflow logic:**
1. Cron fires Mon-Fri at 9:30 AM ET (`30 14 * * 1-5`)
2. Check if today is Monday (or the first trading day of the week):
   - Call Polygon market status API
   - If market is closed (holiday), log it and skip
   - If market is open, check if we already have a scan for this week (any scan in the last 7 days)
   - If no scan exists for this week, run the full workflow
3. This naturally handles Monday holidays: the cron fires Tuesday, sees no scan for the week, and runs
4. For non-Monday weekdays, if a scan already exists for the current week, skip (idempotent)

**Same for the P&L update cron:**
- Before updating prices, call Polygon market status
- If market is closed (holiday), skip the update (no new prices anyway)

**Fallback approach (simpler alternative):**
If you don't want to use the Polygon market status API, you can hardcode US market holidays for the current year:
```javascript
const US_MARKET_HOLIDAYS_2025 = [
  '2025-01-01', // New Year's Day
  '2025-01-20', // MLK Day
  '2025-02-17', // Presidents' Day
  '2025-04-18', // Good Friday
  '2025-05-26', // Memorial Day
  '2025-06-19', // Juneteenth
  '2025-07-04', // Independence Day
  '2025-09-01', // Labor Day
  '2025-11-27', // Thanksgiving
  '2025-12-25', // Christmas
];
```
But the Polygon API approach is preferred as it's always accurate and doesn't need yearly updates.

### API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| POST | /api/option-automation/scan | Run Option Samurai scan, save results |
| POST | /api/option-automation/test-login | Test Option Samurai credentials |
| POST | /api/option-automation/monday-workflow | Full workflow: scan + create portfolios |
| GET | /api/option-scans/dates | List scan dates |
| GET | /api/option-scans/:date | Get scan results for a date |
| GET | /api/option-portfolios | List all portfolios |
| GET | /api/option-portfolios/:id | Portfolio detail with trades |
| POST | /api/option-portfolios/update-pnl | Update all active portfolios |
| GET | /api/option-portfolios/:id/history | Value history for charts |
| DELETE | /api/option-scans/:date | Delete scan data and associated portfolios |

### Frontend Pages
Reference: `frontend/App.tsx` for layout; `frontend/*.tsx` for component patterns

Single page app with these sections:

1. **Header** — "Option Income Strategy" with scan trigger button and last scan date
2. **Scan Results Panel** — Date navigation, table showing all scan results for selected date
3. **Portfolio Cards** — Show both portfolios (Top Return / Top Probability) side by side with:
   - Status badge (active/closed), total premium, current P&L, P&L %
   - Trade table: ticker, strikes, expiration, contracts, premium, current value, P&L, status
   - Color coding: green for profit, red for loss, yellow for ITM warning
4. **Performance Chart** — Line chart showing portfolio value over time (use recharts)
5. **All Trades Table** — Filterable/sortable view of all trades across portfolios

### Expiration Date Parsing
Handle multiple formats from Option Samurai:
- `"Feb 21 '25"` → parse month abbrev + day + 2-digit year
- `"2025-02-21"` → ISO format
- `"2/21/2025"` → US date format
- `"Feb 21, 2025"` → long format
- All dates should resolve to 4:00 PM ET (market close)

### Important Notes
- Date handling uses Eastern Time throughout — reference `backend/db.js` for `getEasternDate()`
- Add rate limiting delays (200ms) between Polygon API calls — reference `api/polygon.js`
- The scan workflow should be idempotent — check if today's scan already exists before running
- Portfolio creation should check if portfolios already exist for the scan date
- Manual trigger via POST endpoint should work any day, not just Monday
