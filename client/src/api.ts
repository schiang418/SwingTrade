const BASE = '/api';

export interface StockResult {
  rank: number;
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  finalScore: number;
  rsScore: number;
  rsComposite: number | null;
  trendScore: number;
  pullbackScore: number;
  volatilityScore: number;
  indicators: {
    close: number;
    ema20: number | null;
    sma50: number | null;
    rsi14: number | null;
    atr14: number | null;
    atrPct: number | null;
    dist20: number | null;
    dist50: number | null;
    return1m: number | null;
    return3m: number | null;
    avgVol20: number | null;
  };
  error?: string;
}

export interface RankingData {
  found: boolean;
  id: number;
  listName: string;
  analysisDate: string;
  listUpdateDate: string | null;
  results: StockResult[];
  spyData: { return1m: number; return3m: number } | null;
  stockCount: number;
  analyzedAt: string;
  portfolioId: number | null;
  portfolioStatus: string;
}

export interface DateEntry {
  analysisDate: string;
  listUpdateDate: string | null;
  id: number;
}

export interface Holding {
  id: number;
  portfolioId: number;
  symbol: string;
  shares: string;
  entryPrice: string;
  currentPrice: string | null;
  gainLoss: string;
  gainLossPct: string;
  lastUpdatedAt: string;
}

export interface Snapshot {
  id: number;
  portfolioId: number;
  snapshotDate: string;
  totalValue: string;
  totalGainLoss: string;
  totalGainLossPct: string;
}

export interface PortfolioData {
  id: number;
  rankingResultId: number;
  listName: string;
  status: string;
  initialCapital: number;
  currentValue: number;
  totalGainLoss: number;
  totalGainLossPct: number;
  purchaseDate: string;
  closeDate: string | null;
  holdingDays: number;
  daysRemaining: number;
  holdings: Holding[];
  snapshots: Snapshot[];
}

export async function fetchRanking(listName: string, date?: string): Promise<RankingData> {
  const url = date
    ? `${BASE}/rankings/${listName}?date=${date}`
    : `${BASE}/rankings/${listName}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch ranking');
  return res.json();
}

export async function fetchDates(listName: string): Promise<DateEntry[]> {
  const res = await fetch(`${BASE}/rankings/${listName}/dates`);
  if (!res.ok) throw new Error('Failed to fetch dates');
  return res.json();
}

export async function fetchPortfolio(id: number): Promise<PortfolioData> {
  const res = await fetch(`${BASE}/portfolios/${id}`);
  if (!res.ok) throw new Error('Failed to fetch portfolio');
  return res.json();
}

export async function createPortfolio(rankingResultId: number): Promise<any> {
  const res = await fetch(`${BASE}/portfolios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rankingResultId }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to create portfolio');
  }
  return res.json();
}

export async function updatePortfolioPrices(id: number): Promise<any> {
  const res = await fetch(`${BASE}/portfolios/${id}/update-prices`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to update prices');
  return res.json();
}

export async function triggerCheckAndDownload(): Promise<any> {
  const res = await fetch(`${BASE}/automation/check-and-download`, { method: 'POST' });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Automation failed');
  }
  return res.json();
}

export async function triggerForceAnalysis(): Promise<any> {
  const res = await fetch(`${BASE}/automation/check-and-download?force=true`, { method: 'POST' });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Force analysis failed');
  }
  return res.json();
}

export async function fetchAutomationStatus(): Promise<any[]> {
  const res = await fetch(`${BASE}/automation/status`);
  if (!res.ok) throw new Error('Failed to fetch status');
  return res.json();
}

// EMA Analysis types
export interface EmaStockAnalysis {
  symbol: string;
  company_name: string;
  company_description: string;
  star_rating?: number;
  ranking_formatted: string;
  bucket: string;
  analysis: string;
  swing_setup: string;
}

export interface EmaCategorySummary {
  bucket_name: string;
  strategy: string;
  symbols: string[];
}

export interface EmaAnalysisData {
  found: boolean;
  id: number;
  listName: string;
  analysisDate: string;
  categorySummary: EmaCategorySummary[];
  stockAnalysis: EmaStockAnalysis[];
  portfolioId: number | null;
  portfolioStatus: string;
  scanResult: {
    stockCount: number;
    symbols: string[];
    chartlistName: string;
  } | null;
}

export async function fetchEmaAnalysis(listName: string, date?: string): Promise<EmaAnalysisData> {
  const url = date
    ? `${BASE}/ema-analysis/${listName}?date=${date}`
    : `${BASE}/ema-analysis/${listName}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch EMA analysis');
  return res.json();
}

export async function fetchEmaDates(listName: string): Promise<{ analysisDate: string; id: number }[]> {
  const res = await fetch(`${BASE}/ema-analysis/${listName}/dates`);
  if (!res.ok) throw new Error('Failed to fetch EMA dates');
  return res.json();
}

export async function createEmaPortfolio(emaAnalysisId: number): Promise<any> {
  const res = await fetch(`${BASE}/portfolios/ema`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emaAnalysisId }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to create EMA portfolio');
  }
  return res.json();
}

export async function uploadAndAnalyze(file: File, listName: string): Promise<any> {
  // Upload file
  const formData = new FormData();
  formData.append('file', file);
  const uploadRes = await fetch(`${BASE}/upload`, { method: 'POST', body: formData });
  if (!uploadRes.ok) throw new Error('Upload failed');
  const { stocks } = await uploadRes.json();

  // Run analysis
  const analyzeRes = await fetch(`${BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stocks }),
  });
  if (!analyzeRes.ok) throw new Error('Analysis failed');
  return analyzeRes.json();
}
