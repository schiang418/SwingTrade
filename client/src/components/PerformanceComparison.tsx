import React, { useState, useEffect } from 'react';
import { X, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { fetchPortfolioComparison, ComparisonPortfolio } from '../api';

interface Props {
  onClose: () => void;
}

const STRATEGY_CONFIG: Record<string, { label: string; color: string; shortLabel: string }> = {
  leading_stocks: { label: 'Leading Stocks - Ranking Algorithm', color: '#4f8ff7', shortLabel: 'LS Ranking' },
  leading_stocks_ema: { label: 'Leading Stocks - 20d EMA Pullback', color: '#22d3ee', shortLabel: 'LS 20d EMA' },
  hot_stocks: { label: 'Hot Stocks - Ranking Algorithm', color: '#f59e0b', shortLabel: 'HS Ranking' },
  hot_stocks_ema: { label: 'Hot Stocks - 20d EMA Pullback', color: '#ef4444', shortLabel: 'HS 20d EMA' },
};

function fmtMoney(val: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

function fmtPct(val: number) {
  return `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
}

interface StrategyStats {
  key: string;
  label: string;
  color: string;
  portfolioCount: number;
  closedCount: number;
  avgRoi: number;
  cumulativeRoi: number;
  cumulativeValue: number;
  bestRoi: number;
  worstRoi: number;
  winRate: number;
}

export default function PerformanceComparison({ onClose }: Props) {
  const [portfolios, setPortfolios] = useState<ComparisonPortfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchPortfolioComparison();
        setPortfolios(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Group portfolios by strategy
  const grouped: Record<string, ComparisonPortfolio[]> = {};
  for (const p of portfolios) {
    if (!grouped[p.listName]) grouped[p.listName] = [];
    grouped[p.listName].push(p);
  }

  // Calculate stats per strategy
  const stats: StrategyStats[] = Object.keys(STRATEGY_CONFIG).map(key => {
    const list = grouped[key] || [];
    const closed = list.filter(p => p.status === 'closed');
    const rois = list.map(p => p.totalGainLossPct);
    const wins = rois.filter(r => r > 0).length;

    // Cumulative growth: compound each portfolio's return
    let cumulativeValue = 100000;
    for (const p of list) {
      cumulativeValue *= (1 + p.totalGainLossPct / 100);
    }
    const cumulativeRoi = ((cumulativeValue - 100000) / 100000) * 100;

    return {
      key,
      label: STRATEGY_CONFIG[key].label,
      color: STRATEGY_CONFIG[key].color,
      portfolioCount: list.length,
      closedCount: closed.length,
      avgRoi: rois.length > 0 ? rois.reduce((a, b) => a + b, 0) / rois.length : 0,
      cumulativeRoi,
      cumulativeValue,
      bestRoi: rois.length > 0 ? Math.max(...rois) : 0,
      worstRoi: rois.length > 0 ? Math.min(...rois) : 0,
      winRate: rois.length > 0 ? (wins / rois.length) * 100 : 0,
    };
  }).filter(s => s.portfolioCount > 0);

  // Build cumulative growth chart data
  // For each strategy, create data points at each portfolio's close/current date
  const growthData: { date: string; [key: string]: number | string }[] = [];
  const dateSet = new Set<string>();

  // Collect all relevant dates and compute cumulative values at each point
  const strategyTimelines: Record<string, { date: string; value: number }[]> = {};

  for (const key of Object.keys(STRATEGY_CONFIG)) {
    const list = grouped[key] || [];
    if (list.length === 0) continue;

    const timeline: { date: string; value: number }[] = [];
    let cumValue = 100000;

    // Add starting point
    const firstDate = list[0].purchaseDate;
    timeline.push({ date: firstDate, value: cumValue });
    dateSet.add(firstDate);

    for (const p of list) {
      // Add daily snapshots for this portfolio
      for (const snap of p.snapshots) {
        const dayValue = cumValue * (snap.totalValue / p.initialCapital);
        timeline.push({ date: snap.date, value: dayValue });
        dateSet.add(snap.date);
      }

      // After this portfolio, compound the return
      cumValue *= (1 + p.totalGainLossPct / 100);
      const endDate = p.closeDate || p.snapshots[p.snapshots.length - 1]?.date || p.purchaseDate;
      timeline.push({ date: endDate, value: cumValue });
      dateSet.add(endDate);
    }

    strategyTimelines[key] = timeline;
  }

  // Build unified chart data from all dates
  const sortedDates = Array.from(dateSet).sort();
  for (const date of sortedDates) {
    const point: { date: string; [key: string]: number | string } = { date };
    for (const key of Object.keys(strategyTimelines)) {
      // Find the latest value at or before this date
      const timeline = strategyTimelines[key];
      let val: number | undefined;
      for (let i = timeline.length - 1; i >= 0; i--) {
        if (timeline[i].date <= date) {
          val = timeline[i].value;
          break;
        }
      }
      if (val !== undefined) {
        point[key] = Math.round(val);
      }
    }
    growthData.push(point);
  }

  // Build per-portfolio ROI bar chart data
  const barData: { name: string; date: string; [key: string]: number | string }[] = [];

  // Collect all portfolios with their dates, sorted chronologically
  const allWithStrategy = portfolios.map(p => ({
    ...p,
    strategyKey: p.listName,
  })).sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));

  // Group by purchase date for side-by-side comparison
  const byDate: Record<string, ComparisonPortfolio[]> = {};
  for (const p of allWithStrategy) {
    const dateKey = p.closeDate || p.purchaseDate;
    if (!byDate[dateKey]) byDate[dateKey] = [];
    byDate[dateKey].push(p);
  }

  for (const [date, ps] of Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b))) {
    const point: { name: string; date: string; [key: string]: number | string } = {
      name: date.slice(5), // MM-DD
      date,
    };
    for (const p of ps) {
      point[p.listName] = parseFloat(p.totalGainLossPct.toFixed(2));
    }
    barData.push(point);
  }

  const hasData = portfolios.length > 0;
  const activeStrategies = Object.keys(STRATEGY_CONFIG).filter(k => grouped[k]?.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative bg-[#0f1117] border border-[#2a2e3a] rounded-2xl p-6
        max-w-[1100px] w-[95%] max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-[#8b8fa3] hover:text-white z-10">
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold mb-1">Strategy Performance Comparison</h2>
        <p className="text-sm text-[#8b8fa3] mb-6">
          Comparing 2 lists x 2 strategies: Ranking Algorithm vs 20d EMA Pullback
        </p>

        {loading && (
          <div className="text-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-[#4f8ff7] mx-auto mb-3" />
            <p className="text-[#8b8fa3]">Loading portfolio data...</p>
          </div>
        )}

        {error && (
          <div className="text-center py-16 text-red-400">
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && !hasData && (
          <div className="text-center py-16">
            <TrendingUp className="w-12 h-12 text-[#2a2e3a] mx-auto mb-4" />
            <p className="text-[#8b8fa3] mb-2">No portfolio data available yet</p>
            <p className="text-[#8b8fa3] text-sm">
              Create portfolios from ranking or EMA analysis results to start tracking performance
            </p>
          </div>
        )}

        {!loading && !error && hasData && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {stats.map(s => {
                const isPos = s.cumulativeRoi >= 0;
                return (
                  <div key={s.key} className="bg-[#1a1d27] border border-[#2a2e3a] rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                      <div className="text-xs text-[#8b8fa3] font-semibold">{STRATEGY_CONFIG[s.key].shortLabel}</div>
                    </div>
                    <div className={`text-lg font-bold ${isPos ? 'text-green-400' : 'text-red-400'}`}>
                      {fmtPct(s.cumulativeRoi)}
                    </div>
                    <div className="text-xs text-[#8b8fa3] mt-1">
                      {s.portfolioCount} portfolio{s.portfolioCount !== 1 ? 's' : ''}
                      {' | '}Win: {s.winRate.toFixed(0)}%
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Cumulative Growth Chart */}
            {growthData.length > 1 && (
              <div className="bg-[#1a1d27] border border-[#2a2e3a] rounded-lg p-4 mb-6">
                <h3 className="text-sm font-semibold text-[#8b8fa3] mb-3">
                  Cumulative Portfolio Growth (starting at $100K)
                </h3>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={growthData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2e3a" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: '#8b8fa3', fontSize: 10 }}
                      tickFormatter={(v: string) => v.slice(5)}
                    />
                    <YAxis
                      tick={{ fill: '#8b8fa3', fontSize: 11 }}
                      domain={['auto', 'auto']}
                      tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`}
                    />
                    <Tooltip
                      contentStyle={{ background: '#1a1d27', border: '1px solid #2a2e3a', borderRadius: 8 }}
                      labelStyle={{ color: '#8b8fa3' }}
                      formatter={(value: number, name: string) => [
                        fmtMoney(value),
                        STRATEGY_CONFIG[name]?.shortLabel || name,
                      ]}
                    />
                    <Legend
                      formatter={(value: string) => STRATEGY_CONFIG[value]?.shortLabel || value}
                      wrapperStyle={{ fontSize: 12 }}
                    />
                    {activeStrategies.map(key => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stroke={STRATEGY_CONFIG[key].color}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Per-Portfolio ROI Bar Chart */}
            {barData.length > 0 && (
              <div className="bg-[#1a1d27] border border-[#2a2e3a] rounded-lg p-4 mb-6">
                <h3 className="text-sm font-semibold text-[#8b8fa3] mb-3">
                  Individual Portfolio ROI (%)
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2e3a" />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: '#8b8fa3', fontSize: 10 }}
                    />
                    <YAxis
                      tick={{ fill: '#8b8fa3', fontSize: 11 }}
                      tickFormatter={(v: number) => `${v}%`}
                    />
                    <Tooltip
                      contentStyle={{ background: '#1a1d27', border: '1px solid #2a2e3a', borderRadius: 8 }}
                      labelStyle={{ color: '#8b8fa3' }}
                      labelFormatter={(label: string, payload: any[]) => {
                        const item = payload?.[0]?.payload;
                        return item?.date || label;
                      }}
                      formatter={(value: number, name: string) => [
                        `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`,
                        STRATEGY_CONFIG[name]?.shortLabel || name,
                      ]}
                    />
                    <Legend
                      formatter={(value: string) => STRATEGY_CONFIG[value]?.shortLabel || value}
                      wrapperStyle={{ fontSize: 12 }}
                    />
                    {activeStrategies.map(key => (
                      <Bar
                        key={key}
                        dataKey={key}
                        fill={STRATEGY_CONFIG[key].color}
                        radius={[3, 3, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Detailed Stats Table */}
            <div className="bg-[#1a1d27] border border-[#2a2e3a] rounded-lg overflow-hidden">
              <h3 className="text-sm font-semibold text-[#8b8fa3] p-4 pb-2">Detailed Statistics</h3>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[#2a2e3a]">
                    <th className="px-4 py-2 text-left text-xs text-[#8b8fa3] font-semibold">Strategy</th>
                    <th className="px-4 py-2 text-right text-xs text-[#8b8fa3] font-semibold">Portfolios</th>
                    <th className="px-4 py-2 text-right text-xs text-[#8b8fa3] font-semibold">Avg ROI</th>
                    <th className="px-4 py-2 text-right text-xs text-[#8b8fa3] font-semibold">Cumulative</th>
                    <th className="px-4 py-2 text-right text-xs text-[#8b8fa3] font-semibold">Best</th>
                    <th className="px-4 py-2 text-right text-xs text-[#8b8fa3] font-semibold">Worst</th>
                    <th className="px-4 py-2 text-right text-xs text-[#8b8fa3] font-semibold">Win Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map(s => (
                    <tr key={s.key} className="border-b border-[#2a2e3a]/50 hover:bg-[#242836]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                          <span className="font-semibold">{s.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {s.portfolioCount}
                        {s.closedCount < s.portfolioCount && (
                          <span className="text-xs text-[#8b8fa3] ml-1">
                            ({s.portfolioCount - s.closedCount} active)
                          </span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${s.avgRoi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {fmtPct(s.avgRoi)}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${s.cumulativeRoi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {fmtPct(s.cumulativeRoi)}
                      </td>
                      <td className={`px-4 py-3 text-right ${s.bestRoi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {fmtPct(s.bestRoi)}
                      </td>
                      <td className={`px-4 py-3 text-right ${s.worstRoi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {fmtPct(s.worstRoi)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={s.winRate >= 50 ? 'text-green-400' : 'text-red-400'}>
                          {s.winRate.toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
