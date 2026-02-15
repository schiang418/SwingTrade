import React, { useState, useEffect } from 'react';
import { Loader2, TrendingUp, Eye, Star } from 'lucide-react';
import {
  fetchEmaAnalysis, createEmaPortfolio,
  EmaAnalysisData, EmaStockAnalysis, EmaCategorySummary,
} from '../api';
import PortfolioDialog from './PortfolioDialog';

interface Props {
  listName: string;
  analysisDate?: string;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onPortfolioChange: () => void;
}

const BUCKET_STYLES: Record<string, { bg: string; border: string; text: string; label: string }> = {
  bucket_1: { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', label: 'High Conviction' },
  bucket_2: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', label: 'Watchlist' },
  bucket_3: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', label: 'Under Observation' },
};

function getStarRating(stock: EmaStockAnalysis): number {
  if (stock.star_rating) return stock.star_rating;
  const stars = (stock.ranking_formatted?.match(/★/g) || []).length;
  return stars || 0;
}

function StarDisplay({ rating }: { rating: number }) {
  return (
    <span className="text-yellow-400 text-sm">
      {'★'.repeat(rating)}{'☆'.repeat(Math.max(0, 5 - rating))}
    </span>
  );
}

export default function EmaAnalysisSection({ listName, analysisDate, showToast, onPortfolioChange }: Props) {
  const [data, setData] = useState<EmaAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingPortfolio, setCreatingPortfolio] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await fetchEmaAnalysis(listName, analysisDate);
        if (!cancelled) setData(result);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [listName, analysisDate]);

  const handleCreatePortfolio = async () => {
    if (!data?.id) return;
    setCreatingPortfolio(true);
    try {
      await createEmaPortfolio(data.id);
      showToast('EMA Portfolio created with top 5 stocks by star rating!');
      // Refresh data
      const result = await fetchEmaAnalysis(listName, analysisDate);
      setData(result);
      onPortfolioChange();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setCreatingPortfolio(false);
    }
  };

  if (loading) {
    return (
      <div className="mt-8 text-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-[#4f8ff7] mx-auto mb-2" />
        <p className="text-[#8b8fa3] text-sm">Loading EMA analysis...</p>
      </div>
    );
  }

  if (!data?.found) {
    return null; // Don't show section if no EMA data
  }

  const { categorySummary, stockAnalysis } = data;

  // Group stocks by bucket
  const bucketGroups: Record<string, EmaStockAnalysis[]> = {};
  for (const stock of stockAnalysis) {
    const bucket = stock.bucket || 'bucket_3';
    if (!bucketGroups[bucket]) bucketGroups[bucket] = [];
    bucketGroups[bucket].push(stock);
  }

  return (
    <div className="mt-8">
      <h3 className="text-sm font-semibold text-[#8b8fa3] uppercase tracking-wide mb-3">
        20-Day EMA Pullback Analysis
      </h3>

      {/* Scan Info */}
      {data.scanResult && (
        <div className="flex items-center gap-3 mb-4 text-xs text-[#8b8fa3]">
          <span>{data.scanResult.stockCount} stocks passed EMA filter</span>
          {data.scanResult.chartlistName && (
            <span>| {data.scanResult.chartlistName}</span>
          )}
        </div>
      )}

      {/* Category Summary Chips */}
      <div className="flex gap-3 mb-4 flex-wrap">
        {categorySummary.map((cat: EmaCategorySummary) => {
          const bucketKey = cat.bucket_name === 'High Conviction' ? 'bucket_1'
            : cat.bucket_name === 'Watchlist' ? 'bucket_2' : 'bucket_3';
          const style = BUCKET_STYLES[bucketKey] || BUCKET_STYLES.bucket_3;
          return (
            <div key={cat.bucket_name} className={`${style.bg} ${style.border} border rounded-lg px-3 py-2`}>
              <div className={`text-xs font-semibold ${style.text}`}>{cat.bucket_name}</div>
              <div className="text-xs text-[#8b8fa3] mt-0.5">{cat.symbols.length} stocks</div>
              <div className="text-[10px] text-[#8b8fa3] mt-1">{cat.symbols.join(', ')}</div>
            </div>
          );
        })}
      </div>

      {/* EMA Portfolio Section */}
      <div className="mb-4">
        {(!data.portfolioStatus || data.portfolioStatus === 'none') ? (
          <div className="bg-[#1a1d27] border border-[#2a2e3a] rounded-xl p-4">
            <p className="text-[#8b8fa3] text-sm mb-2">
              Create a virtual $100K EMA portfolio with the top 5 stocks by star rating
            </p>
            <button
              onClick={handleCreatePortfolio}
              disabled={creatingPortfolio}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700
                text-white rounded-lg font-semibold text-sm transition-all disabled:opacity-50"
            >
              {creatingPortfolio ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Star className="w-4 h-4" />
                  Create EMA Portfolio
                </>
              )}
            </button>
          </div>
        ) : data.portfolioStatus === 'active' ? (
          <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-3 h-3 bg-purple-500 rounded-full animate-pulse" />
              <span className="text-purple-400 font-semibold text-sm">EMA Portfolio Active</span>
            </div>
            <button
              onClick={() => setDialogOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#4f8ff7] hover:bg-[#3a7be0]
                text-white rounded-lg font-semibold text-sm transition-all"
            >
              <Eye className="w-4 h-4" />
              View EMA Portfolio
            </button>
          </div>
        ) : (
          <div className="bg-[#1a1d27] border border-[#2a2e3a] rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-3 h-3 bg-gray-500 rounded-full" />
              <span className="text-[#8b8fa3] font-semibold text-sm">EMA Portfolio Closed</span>
            </div>
            <button
              onClick={() => setDialogOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#242836] hover:bg-[#2a2e3a]
                text-white rounded-lg font-semibold text-sm transition-all"
            >
              <Eye className="w-4 h-4" />
              View Results
            </button>
          </div>
        )}
      </div>

      {/* Stock Analysis Table */}
      <div className="bg-[#1a1d27] border border-[#2a2e3a] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2a2e3a]">
              <th className="text-left px-4 py-3 text-[#8b8fa3] font-semibold">Symbol</th>
              <th className="text-left px-4 py-3 text-[#8b8fa3] font-semibold">Company</th>
              <th className="text-center px-4 py-3 text-[#8b8fa3] font-semibold">Rating</th>
              <th className="text-left px-4 py-3 text-[#8b8fa3] font-semibold">Category</th>
              <th className="text-left px-4 py-3 text-[#8b8fa3] font-semibold">Analysis</th>
            </tr>
          </thead>
          <tbody>
            {stockAnalysis
              .sort((a, b) => getStarRating(b) - getStarRating(a))
              .map((stock: EmaStockAnalysis) => {
                const bucketKey = stock.bucket || 'bucket_3';
                const style = BUCKET_STYLES[bucketKey] || BUCKET_STYLES.bucket_3;
                return (
                  <tr key={stock.symbol} className="border-b border-[#2a2e3a]/50 hover:bg-[#242836] transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-bold text-white">{stock.symbol}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-white text-xs">{stock.company_name}</div>
                      <div className="text-[#8b8fa3] text-[10px] mt-0.5 max-w-[200px] truncate">
                        {stock.company_description}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StarDisplay rating={getStarRating(stock)} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={`${style.bg} ${style.text} px-2 py-1 rounded text-xs font-medium`}>
                        {style.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[#8b8fa3] text-xs max-w-[400px]">
                        {stock.analysis}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* CandleGlance Chart Image */}
      {data.scanResult?.imageUrl && (
        <div className="mt-4 bg-[#1a1d27] border border-[#2a2e3a] rounded-xl p-4">
          <h4 className="text-sm font-semibold text-[#8b8fa3] mb-3">
            CandleGlance Charts - All Scanned Stocks
          </h4>
          <img
            src={data.scanResult.imageUrl}
            alt="CandleGlance charts for EMA pullback scan results"
            className="w-full rounded-lg border border-[#2a2e3a]"
            loading="lazy"
          />
        </div>
      )}

      {/* Swing Setup Details (expandable) */}
      <details className="mt-4">
        <summary className="text-[#8b8fa3] text-xs cursor-pointer hover:text-white transition-colors">
          View Swing Setup Details
        </summary>
        <div className="mt-2 space-y-2">
          {stockAnalysis
            .sort((a, b) => getStarRating(b) - getStarRating(a))
            .map((stock: EmaStockAnalysis) => (
              <div key={stock.symbol} className="bg-[#1a1d27] border border-[#2a2e3a] rounded-lg p-3">
                <span className="font-bold text-white text-sm">{stock.symbol}</span>
                <span className="mx-2 text-[#8b8fa3]">|</span>
                <StarDisplay rating={getStarRating(stock)} />
                <p className="text-[#8b8fa3] text-xs mt-1">{stock.swing_setup}</p>
              </div>
            ))}
        </div>
      </details>

      {/* EMA Portfolio Dialog */}
      {dialogOpen && data.portfolioId && (
        <PortfolioDialog
          portfolioId={data.portfolioId}
          onClose={() => setDialogOpen(false)}
          onChange={onPortfolioChange}
          showToast={showToast}
        />
      )}
    </div>
  );
}
