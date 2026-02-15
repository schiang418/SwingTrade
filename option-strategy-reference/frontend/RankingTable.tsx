import React, { useState, useMemo } from 'react';
import type { StockResult } from '../api';

interface Props {
  results: StockResult[];
  onSelectStock: (stock: StockResult) => void;
}

type SortKey = 'rank' | 'ticker' | 'sector' | 'industry' | 'finalScore' | 'rsScore' | 'trendScore' | 'pullbackScore' | 'volatilityScore';

function scoreClass(score: number) {
  if (score >= 85) return 'bg-green-500/10 text-green-500';
  if (score >= 70) return 'bg-blue-500/10 text-blue-400';
  if (score >= 55) return 'bg-yellow-500/10 text-yellow-500';
  return 'bg-red-500/10 text-red-500';
}

function scoreBarColor(score: number) {
  if (score >= 85) return '#22c55e';
  if (score >= 70) return '#4f8ff7';
  if (score >= 55) return '#eab308';
  return '#ef4444';
}

function signal(score: number) {
  if (score >= 85) return 'PRIME ENTRY';
  if (score >= 70) return 'WATCHLIST';
  if (score >= 55) return 'CAUTION';
  return 'AVOID';
}

function fmtPct(val: number | null) {
  if (val == null) return '-';
  return `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`;
}

function fmtVol(vol: number | null) {
  if (vol == null) return '-';
  if (vol >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
  if (vol >= 1000) return `${(vol / 1000).toFixed(0)}K`;
  return vol.toFixed(0);
}

export default function RankingTable({ results, onSelectStock }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'rank', dir: 'asc' });

  const sorted = useMemo(() => {
    return [...results].sort((a, b) => {
      let va: any = (a as any)[sort.key];
      let vb: any = (b as any)[sort.key];
      if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
      if (va < vb) return sort.dir === 'asc' ? -1 : 1;
      if (va > vb) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [results, sort]);

  const handleSort = (key: SortKey) => {
    if (sort.key === key) {
      setSort({ key, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
    } else {
      setSort({ key, dir: key === 'rank' ? 'asc' : 'desc' });
    }
  };

  const SortHeader = ({ label, sortKey, sub }: { label: string; sortKey: SortKey; sub?: string }) => (
    <th
      onClick={() => handleSort(sortKey)}
      className="px-3 py-3 text-left text-xs font-semibold text-[#8b8fa3] uppercase tracking-wide
        cursor-pointer hover:text-[#4f8ff7] whitespace-nowrap border-b border-[#2a2e3a] select-none"
    >
      {label}
      {sort.key === sortKey && (sort.dir === 'asc' ? ' \u25B2' : ' \u25BC')}
      {sub && <span className="block font-normal normal-case tracking-normal opacity-70">{sub}</span>}
    </th>
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-[#2a2e3a] mb-6">
      <table className="w-full text-[13px] border-collapse">
        <thead className="bg-[#1a1d27] sticky top-0 z-10">
          <tr>
            <SortHeader label="Rank" sortKey="rank" />
            <SortHeader label="Ticker" sortKey="ticker" />
            <SortHeader label="Sector" sortKey="sector" />
            <SortHeader label="Final Score" sortKey="finalScore" />
            <SortHeader label="RS Score" sortKey="rsScore" sub="(40%)" />
            <SortHeader label="Trend" sortKey="trendScore" sub="(25%)" />
            <SortHeader label="Pullback" sortKey="pullbackScore" sub="(20%)" />
            <SortHeader label="Volatility" sortKey="volatilityScore" sub="(15%)" />
            <th className="px-3 py-3 text-left text-xs font-semibold text-[#8b8fa3] uppercase border-b border-[#2a2e3a]">Price</th>
            <th className="px-3 py-3 text-left text-xs font-semibold text-[#8b8fa3] uppercase border-b border-[#2a2e3a]">RSI</th>
            <th className="px-3 py-3 text-left text-xs font-semibold text-[#8b8fa3] uppercase border-b border-[#2a2e3a]">1M</th>
            <th className="px-3 py-3 text-left text-xs font-semibold text-[#8b8fa3] uppercase border-b border-[#2a2e3a]">3M</th>
            <th className="px-3 py-3 text-left text-xs font-semibold text-[#8b8fa3] uppercase border-b border-[#2a2e3a]">Signal</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((stock) => {
            const ind = stock.indicators || {} as any;
            return (
              <tr
                key={stock.ticker}
                onClick={() => onSelectStock(stock)}
                className="cursor-pointer hover:bg-[#242836] transition-colors border-b border-[#2a2e3a]/50"
              >
                <td className="px-3 py-2 font-bold text-[#8b8fa3]">{stock.rank}</td>
                <td className="px-3 py-2 font-bold font-mono text-sm">{stock.ticker}</td>
                <td className="px-3 py-2 text-[#8b8fa3] text-xs max-w-[120px] truncate">{stock.sector}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block px-2.5 py-0.5 rounded font-bold text-[13px] ${scoreClass(stock.finalScore)}`}>
                    {stock.finalScore.toFixed(1)}
                  </span>
                </td>
                {[stock.rsScore, stock.trendScore, stock.pullbackScore, stock.volatilityScore].map((score, i) => (
                  <td key={i} className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="w-8 text-right">{score.toFixed(0)}</span>
                      <div className="flex-1 h-1.5 bg-[#2a2e3a] rounded-full min-w-[40px]">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min(score, 100)}%`, background: scoreBarColor(score) }}
                        />
                      </div>
                    </div>
                  </td>
                ))}
                <td className="px-3 py-2">${ind.close?.toFixed(2) ?? '-'}</td>
                <td className={`px-3 py-2 ${ind.rsi14 != null && ind.rsi14 >= 70 ? 'text-red-400' : ind.rsi14 != null && ind.rsi14 <= 30 ? 'text-green-400' : ''}`}>
                  {ind.rsi14?.toFixed(1) ?? '-'}
                </td>
                <td className={`px-3 py-2 ${(ind.return1m ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {fmtPct(ind.return1m)}
                </td>
                <td className={`px-3 py-2 ${(ind.return3m ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {fmtPct(ind.return3m)}
                </td>
                <td className="px-3 py-2">
                  <span className={`text-xs font-semibold ${scoreClass(stock.finalScore).split(' ')[1]}`}>
                    {signal(stock.finalScore)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
