import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, RefreshCw, Download, Upload, TrendingUp, Loader2,
  BarChart3, ArrowLeft,
} from 'lucide-react';
import {
  fetchRanking, fetchDates, triggerCheckAndDownload, triggerForceAnalysis,
  RankingData, DateEntry,
} from './api';
import RankingTable from './components/RankingTable';
import PortfolioSection from './components/PortfolioSection';
import EmaAnalysisSection from './components/EmaAnalysisSection';
import StockDetailModal from './components/StockDetailModal';
import PerformanceComparison from './components/PerformanceComparison';
import type { StockResult } from './api';

type ListName = 'leading_stocks' | 'hot_stocks';

const TAB_LABELS: Record<ListName, string> = {
  leading_stocks: 'Leading Stocks',
  hot_stocks: 'Hot Stocks',
};

const MEMBER_PORTAL_URL = import.meta.env.VITE_MEMBER_PORTAL_URL || 'https://portal.cyclescope.com';
const MANUAL_TRIGGER = import.meta.env.VITE_MANUAL_TRIGGER === 'true';

export default function App() {
  const [activeTab, setActiveTab] = useState<ListName>('leading_stocks');
  const [ranking, setRanking] = useState<RankingData | null>(null);
  const [dates, setDates] = useState<DateEntry[]>([]);
  const [currentDateIdx, setCurrentDateIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [automationLoading, setAutomationLoading] = useState(false);
  const [forceLoading, setForceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStock, setSelectedStock] = useState<StockResult | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showComparison, setShowComparison] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadDates = useCallback(async (list: ListName) => {
    try {
      const d = await fetchDates(list);
      setDates(d);
      return d;
    } catch {
      setDates([]);
      return [];
    }
  }, []);

  const loadRanking = useCallback(async (list: ListName, date?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRanking(list, date);
      setRanking(data);
    } catch (err: any) {
      setError(err.message);
      setRanking(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const d = await loadDates(activeTab);
      if (d.length > 0) {
        setCurrentDateIdx(0);
        await loadRanking(activeTab, d[0].analysisDate);
      } else {
        setRanking(null);
      }
    })();
  }, [activeTab, loadDates, loadRanking]);

  const handleTabChange = (tab: ListName) => {
    setActiveTab(tab);
    setCurrentDateIdx(0);
    setRanking(null);
  };

  const handlePrevDate = async () => {
    if (currentDateIdx < dates.length - 1) {
      const newIdx = currentDateIdx + 1;
      setCurrentDateIdx(newIdx);
      await loadRanking(activeTab, dates[newIdx].analysisDate);
    }
  };

  const handleNextDate = async () => {
    if (currentDateIdx > 0) {
      const newIdx = currentDateIdx - 1;
      setCurrentDateIdx(newIdx);
      await loadRanking(activeTab, dates[newIdx].analysisDate);
    }
  };

  const handleCheckAndDownload = async () => {
    setAutomationLoading(true);
    try {
      const result = await triggerCheckAndDownload();
      if (result.processed?.leading_stocks || result.processed?.hot_stocks) {
        showToast('New data downloaded and analyzed!');
        const d = await loadDates(activeTab);
        if (d.length > 0) {
          setCurrentDateIdx(0);
          await loadRanking(activeTab, d[0].analysisDate);
        }
      } else {
        showToast('No new updates found');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setAutomationLoading(false);
    }
  };

  const handleForceAnalysis = async () => {
    setForceLoading(true);
    try {
      const result = await triggerForceAnalysis();
      if (result.processed?.leading_stocks || result.processed?.hot_stocks) {
        showToast('Analysis complete! Data re-downloaded and re-analyzed.');
        const d = await loadDates(activeTab);
        if (d.length > 0) {
          setCurrentDateIdx(0);
          await loadRanking(activeTab, d[0].analysisDate);
        }
      } else {
        showToast('Force analysis completed but no data was processed', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setForceLoading(false);
    }
  };

  const handlePortfolioChange = async () => {
    // Refresh current ranking to reflect portfolio status change
    if (dates.length > 0) {
      await loadRanking(activeTab, dates[currentDateIdx]?.analysisDate);
    }
  };

  const currentDate = dates[currentDateIdx];

  return (
    <div className="min-h-screen">
      {/* Top Nav Bar */}
      <nav className="bg-[#0c0e14] border-b border-[#2a2e3a] px-4 py-3 flex items-center">
        <a
          href={MEMBER_PORTAL_URL}
          className="flex items-center gap-1.5 text-[#8b8fa3] hover:text-white text-sm font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          CycleScope Portal
        </a>
        <div className="flex-1 text-center">
          <span className="text-white font-bold text-lg tracking-tight">
            StockScope Swing Trade Strategy
          </span>
        </div>
        <div className="w-[140px]" />
      </nav>

      <div className="max-w-[1400px] mx-auto px-4 py-6">
        {/* Toast */}
        {toast && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium
            ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
            {toast.message}
          </div>
        )}

        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-1">Stock Swing Trade Strategy</h1>
          <p className="text-[#8b8fa3] text-sm">Automated stock analysis with portfolio tracking</p>
        </header>

        {/* Controls Row */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* Tabs */}
          <div className="flex bg-[#1a1d27] rounded-lg p-1">
            {(Object.entries(TAB_LABELS) as [ListName, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => handleTabChange(key)}
                className={`px-4 py-2 rounded-md text-sm font-semibold transition-all
                  ${activeTab === key
                    ? 'bg-[#4f8ff7] text-white'
                    : 'text-[#8b8fa3] hover:text-white'
                  }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Check for Updates (admin only) */}
          {MANUAL_TRIGGER && (
            <button
              onClick={handleCheckAndDownload}
              disabled={automationLoading || forceLoading}
              className="flex items-center gap-2 px-4 py-2 bg-[#1a1d27] hover:bg-[#242836]
                border border-[#2a2e3a] rounded-lg text-sm font-medium transition-all disabled:opacity-50"
            >
              {automationLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {automationLoading ? 'Checking...' : 'Check for Updates'}
            </button>
          )}

          {/* Force Analysis (admin only) */}
          {MANUAL_TRIGGER && (
            <button
              onClick={handleForceAnalysis}
              disabled={automationLoading || forceLoading}
              className="flex items-center gap-2 px-4 py-2 bg-[#1a1d27] hover:bg-[#242836]
                border border-orange-500/30 rounded-lg text-sm font-medium transition-all disabled:opacity-50
                text-orange-400 hover:text-orange-300"
            >
              {forceLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {forceLoading ? 'Analyzing...' : 'Force Analysis'}
            </button>
          )}

          {/* Compare Performance */}
          <button
            onClick={() => setShowComparison(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#1a1d27] hover:bg-[#242836]
              border border-purple-500/30 rounded-lg text-sm font-medium transition-all
              text-purple-400 hover:text-purple-300"
          >
            <BarChart3 className="w-4 h-4" />
            Compare Performance
          </button>
        </div>

        {/* Date Navigation */}
        {dates.length > 0 && (
          <div className="flex items-center justify-center gap-4 mb-6">
            <button
              onClick={handlePrevDate}
              disabled={currentDateIdx >= dates.length - 1 || loading}
              className="p-2 rounded-lg bg-[#1a1d27] hover:bg-[#242836] border border-[#2a2e3a]
                disabled:opacity-30 transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="text-center min-w-[200px]">
              <div className="text-lg font-bold">{currentDate?.analysisDate}</div>
              {currentDate?.listUpdateDate && (
                <div className="text-xs text-[#8b8fa3]">
                  List update: {currentDate.listUpdateDate}
                </div>
              )}
            </div>

            <button
              onClick={handleNextDate}
              disabled={currentDateIdx <= 0 || loading}
              className="p-2 rounded-lg bg-[#1a1d27] hover:bg-[#242836] border border-[#2a2e3a]
                disabled:opacity-30 transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <span className="text-xs text-[#8b8fa3]">
              {currentDateIdx + 1} of {dates.length}
            </span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-16">
            <Loader2 className="w-10 h-10 animate-spin text-[#4f8ff7] mx-auto mb-4" />
            <p className="text-[#8b8fa3]">Loading rankings...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-center py-16 text-red-400">
            <p>{error}</p>
          </div>
        )}

        {/* No Data */}
        {!loading && !error && !ranking?.found && (
          <div className="text-center py-16">
            <TrendingUp className="w-12 h-12 text-[#2a2e3a] mx-auto mb-4" />
            <p className="text-[#8b8fa3] mb-2">No ranking data available for {TAB_LABELS[activeTab]}</p>
            <p className="text-[#8b8fa3] text-sm">
              Data is automatically downloaded and analyzed on trading days
            </p>
          </div>
        )}

        {/* Results */}
        {!loading && ranking?.found && (
          <>
            {/* SPY Info + Meta */}
            <div className="flex items-center gap-4 mb-4 text-xs text-[#8b8fa3]">
              {ranking.spyData && (
                <span>
                  SPY: 1M {ranking.spyData.return1m >= 0 ? '+' : ''}{ranking.spyData.return1m.toFixed(1)}%
                  {' | '}
                  3M {ranking.spyData.return3m >= 0 ? '+' : ''}{ranking.spyData.return3m.toFixed(1)}%
                </span>
              )}
              <span>{ranking.stockCount} stocks analyzed</span>
            </div>

            {/* Legend */}
            <div className="flex gap-3 mb-4 flex-wrap">
              <span className="px-3 py-1 rounded text-xs font-semibold bg-green-500/10 text-green-500">85-100: Prime Entry</span>
              <span className="px-3 py-1 rounded text-xs font-semibold bg-blue-500/10 text-blue-400">70-84: Watchlist</span>
              <span className="px-3 py-1 rounded text-xs font-semibold bg-yellow-500/10 text-yellow-500">55-69: Caution</span>
              <span className="px-3 py-1 rounded text-xs font-semibold bg-red-500/10 text-red-500">0-54: Avoid</span>
            </div>

            {/* Portfolio Section */}
            <PortfolioSection
              rankingId={ranking.id}
              portfolioId={ranking.portfolioId}
              portfolioStatus={ranking.portfolioStatus}
              listName={activeTab}
              analysisDate={currentDate?.analysisDate}
              onChange={handlePortfolioChange}
              showToast={showToast}
            />

            {/* Ranking Table */}
            <RankingTable
              results={ranking.results}
              onSelectStock={setSelectedStock}
            />

            {/* EMA Analysis Section */}
            <EmaAnalysisSection
              listName={activeTab}
              analysisDate={currentDate?.analysisDate}
            />
          </>
        )}

        {/* Stock Detail Modal */}
        {selectedStock && (
          <StockDetailModal
            stock={selectedStock}
            onClose={() => setSelectedStock(null)}
          />
        )}

        {/* Performance Comparison Modal */}
        {showComparison && (
          <PerformanceComparison onClose={() => setShowComparison(false)} />
        )}
      </div>
    </div>
  );
}
