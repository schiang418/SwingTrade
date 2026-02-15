import React, { useState, useEffect } from 'react';
import { X, RefreshCw, Loader2 } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { fetchPortfolio, updatePortfolioPrices, PortfolioData } from '../api';

interface Props {
  portfolioId: number;
  onClose: () => void;
  onChange: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

function fmtMoney(val: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

export default function PortfolioDialog({ portfolioId, onClose, onChange, showToast }: Props) {
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const load = async () => {
    try {
      const data = await fetchPortfolio(portfolioId);
      setPortfolio(data);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [portfolioId]);

  const handleUpdatePrices = async () => {
    setUpdating(true);
    try {
      await updatePortfolioPrices(portfolioId);
      await load();
      onChange();
      showToast('Prices updated!');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setUpdating(false);
    }
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const chartData = portfolio?.snapshots.map(s => ({
    date: s.snapshotDate,
    value: parseFloat(s.totalValue),
    pnl: parseFloat(s.totalGainLoss),
  })) || [];

  const isActive = portfolio?.status === 'active';
  const gainLoss = portfolio?.totalGainLoss ?? 0;
  const gainLossPct = portfolio?.totalGainLossPct ?? 0;
  const isPositive = gainLoss >= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-[#1a1d27] border border-[#2a2e3a] rounded-2xl p-6
        max-w-[720px] w-[95%] max-h-[85vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-[#8b8fa3] hover:text-white">
          <X className="w-5 h-5" />
        </button>

        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-[#4f8ff7] mx-auto" />
          </div>
        ) : portfolio ? (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              {isActive && <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />}
              <h2 className="text-xl font-bold">
                {isActive ? 'Active Portfolio' : 'Closed Portfolio'}
              </h2>
              {isActive && (
                <span className="text-xs text-[#8b8fa3] ml-auto">
                  {portfolio.daysRemaining} days remaining
                </span>
              )}
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="bg-[#0f1117] border border-[#2a2e3a] rounded-lg p-4">
                <div className="text-xs text-[#8b8fa3] mb-1">Initial Capital</div>
                <div className="text-lg font-bold">{fmtMoney(portfolio.initialCapital)}</div>
              </div>
              <div className="bg-[#0f1117] border border-[#2a2e3a] rounded-lg p-4">
                <div className="text-xs text-[#8b8fa3] mb-1">Current Value</div>
                <div className="text-lg font-bold">{fmtMoney(portfolio.currentValue)}</div>
              </div>
              <div className="bg-[#0f1117] border border-[#2a2e3a] rounded-lg p-4">
                <div className="text-xs text-[#8b8fa3] mb-1">Net Gain/Loss</div>
                <div className={`text-lg font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                  {isPositive ? '+' : ''}{fmtMoney(gainLoss)}
                </div>
              </div>
              <div className="bg-[#0f1117] border border-[#2a2e3a] rounded-lg p-4">
                <div className="text-xs text-[#8b8fa3] mb-1">ROI</div>
                <div className={`text-lg font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                  {isPositive ? '+' : ''}{gainLossPct.toFixed(2)}%
                </div>
              </div>
            </div>

            {/* Chart */}
            {chartData.length > 1 && (
              <div className="bg-[#0f1117] border border-[#2a2e3a] rounded-lg p-4 mb-6">
                <h3 className="text-sm font-semibold text-[#8b8fa3] mb-3">Portfolio Value</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2e3a" />
                    <XAxis dataKey="date" tick={{ fill: '#8b8fa3', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#8b8fa3', fontSize: 11 }} domain={['auto', 'auto']} />
                    <Tooltip
                      contentStyle={{ background: '#1a1d27', border: '1px solid #2a2e3a', borderRadius: 8 }}
                      labelStyle={{ color: '#8b8fa3' }}
                      formatter={(value: number) => [fmtMoney(value), 'Value']}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#4f8ff7"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Holdings Table */}
            <div className="bg-[#0f1117] border border-[#2a2e3a] rounded-lg overflow-hidden mb-6">
              <h3 className="text-sm font-semibold text-[#8b8fa3] p-4 pb-2">Holdings</h3>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[#2a2e3a]">
                    <th className="px-4 py-2 text-left text-xs text-[#8b8fa3] font-semibold">Symbol</th>
                    <th className="px-4 py-2 text-right text-xs text-[#8b8fa3] font-semibold">Shares</th>
                    <th className="px-4 py-2 text-right text-xs text-[#8b8fa3] font-semibold">Entry</th>
                    <th className="px-4 py-2 text-right text-xs text-[#8b8fa3] font-semibold">Current</th>
                    <th className="px-4 py-2 text-right text-xs text-[#8b8fa3] font-semibold">P&L</th>
                    <th className="px-4 py-2 text-right text-xs text-[#8b8fa3] font-semibold">P&L %</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.holdings.map((h) => {
                    const pnl = parseFloat(h.gainLoss);
                    const pnlPct = parseFloat(h.gainLossPct);
                    const pos = pnl >= 0;
                    return (
                      <tr key={h.id} className="border-b border-[#2a2e3a]/50 hover:bg-[#242836]">
                        <td className="px-4 py-2 font-bold font-mono">{h.symbol}</td>
                        <td className="px-4 py-2 text-right">{parseFloat(h.shares).toFixed(2)}</td>
                        <td className="px-4 py-2 text-right">${parseFloat(h.entryPrice).toFixed(2)}</td>
                        <td className="px-4 py-2 text-right">${h.currentPrice ? parseFloat(h.currentPrice).toFixed(2) : '-'}</td>
                        <td className={`px-4 py-2 text-right font-semibold ${pos ? 'text-green-400' : 'text-red-400'}`}>
                          {pos ? '+' : ''}{fmtMoney(pnl)}
                        </td>
                        <td className={`px-4 py-2 text-right font-semibold ${pos ? 'text-green-400' : 'text-red-400'}`}>
                          {pos ? '+' : ''}{pnlPct.toFixed(2)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Update Prices Button */}
            {isActive && (
              <div className="flex justify-center">
                <button
                  onClick={handleUpdatePrices}
                  disabled={updating}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#242836] hover:bg-[#2a2e3a]
                    border border-[#2a2e3a] text-white rounded-lg font-semibold text-sm transition-all
                    disabled:opacity-50"
                >
                  {updating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  {updating ? 'Updating...' : 'Update Prices'}
                </button>
              </div>
            )}

            {/* Meta info */}
            <div className="mt-4 text-xs text-[#8b8fa3] text-center">
              Purchase Date: {portfolio.purchaseDate}
              {portfolio.closeDate && ` | Closed: ${portfolio.closeDate}`}
              {' | '}{portfolio.holdingDays}-day hold
            </div>
          </>
        ) : (
          <p className="text-center text-[#8b8fa3] py-8">Portfolio not found</p>
        )}
      </div>
    </div>
  );
}
