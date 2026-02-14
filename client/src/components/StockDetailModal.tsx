import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import type { StockResult } from '../api';

interface Props {
  stock: StockResult;
  onClose: () => void;
}

function scoreClass(score: number) {
  if (score >= 85) return 'text-green-500';
  if (score >= 70) return 'text-blue-400';
  if (score >= 55) return 'text-yellow-500';
  return 'text-red-500';
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

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-[#2a2e3a] last:border-b-0 text-[13px]">
      <span className="text-[#8b8fa3]">{label}</span>
      <span className={className}>{value}</span>
    </div>
  );
}

export default function StockDetailModal({ stock, onClose }: Props) {
  const ind = stock.indicators || {} as any;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[#1a1d27] border border-[#2a2e3a] rounded-2xl p-6
        max-w-[640px] w-[90%] max-h-[80vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-[#8b8fa3] hover:text-white">
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold mb-5">
          {stock.ticker}{stock.name ? ` - ${stock.name}` : ''}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Final Score */}
          <div className="bg-[#0f1117] border border-[#2a2e3a] rounded-xl p-4">
            <h4 className="text-xs text-[#8b8fa3] uppercase tracking-wide mb-2">Final Score</h4>
            <div className={`text-3xl font-bold ${scoreClass(stock.finalScore)}`}>
              {stock.finalScore.toFixed(1)}
            </div>
            <p className={`text-sm mt-1 font-semibold ${scoreClass(stock.finalScore)}`}>
              {signal(stock.finalScore)}
            </p>
            <div className="text-xs text-[#8b8fa3] mt-2">
              {stock.sector}{stock.industry ? ` / ${stock.industry}` : ''}
            </div>
          </div>

          {/* Price & Trend */}
          <div className="bg-[#0f1117] border border-[#2a2e3a] rounded-xl p-4">
            <h4 className="text-xs text-[#8b8fa3] uppercase tracking-wide mb-2">Price & Trend</h4>
            <Row label="Close" value={`$${ind.close?.toFixed(2) ?? '-'}`} />
            <Row label="EMA(20)" value={`$${ind.ema20?.toFixed(2) ?? '-'}`} />
            <Row label="SMA(50)" value={`$${ind.sma50?.toFixed(2) ?? '-'}`} />
            <Row label="Dist from EMA20" value={ind.dist20 != null ? `${ind.dist20.toFixed(2)}%` : '-'} />
            <Row label="Dist from SMA50" value={ind.dist50 != null ? `${ind.dist50.toFixed(2)}%` : '-'} />
          </div>

          {/* Category Scores */}
          <div className="bg-[#0f1117] border border-[#2a2e3a] rounded-xl p-4">
            <h4 className="text-xs text-[#8b8fa3] uppercase tracking-wide mb-2">Category Scores</h4>
            <Row label="Relative Strength (40%)" value={stock.rsScore.toFixed(1)} />
            <Row label="RS Composite" value={stock.rsComposite != null ? stock.rsComposite.toFixed(2) : '-'} />
            <Row label="Trend Structure (25%)" value={stock.trendScore.toFixed(1)} />
            <Row label="Pullback Setup (20%)" value={stock.pullbackScore.toFixed(1)} />
            <Row label="Volatility (15%)" value={stock.volatilityScore.toFixed(1)} />
          </div>

          {/* Momentum & Volatility */}
          <div className="bg-[#0f1117] border border-[#2a2e3a] rounded-xl p-4">
            <h4 className="text-xs text-[#8b8fa3] uppercase tracking-wide mb-2">Momentum & Volatility</h4>
            <Row label="RSI(14)" value={ind.rsi14?.toFixed(1) ?? '-'} />
            <Row label="ATR(14)" value={ind.atr14 != null ? `$${ind.atr14.toFixed(2)}` : '-'} />
            <Row label="ATR %" value={ind.atrPct != null ? `${ind.atrPct.toFixed(2)}%` : '-'} />
            <Row
              label="1M Return"
              value={fmtPct(ind.return1m)}
              className={(ind.return1m ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}
            />
            <Row
              label="3M Return"
              value={fmtPct(ind.return3m)}
              className={(ind.return3m ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}
            />
            <Row label="Avg Vol (20d)" value={fmtVol(ind.avgVol20)} />
          </div>
        </div>
      </div>
    </div>
  );
}
