import React, { useState, useEffect } from 'react';
import { TrendingUp, Loader2, Eye, Star } from 'lucide-react';
import { createPortfolio, createEmaPortfolio, fetchEmaAnalysis, EmaAnalysisData } from '../api';
import PortfolioDialog from './PortfolioDialog';

interface Props {
  rankingId: number;
  portfolioId: number | null;
  portfolioStatus: string;
  listName: string;
  analysisDate?: string;
  onChange: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function PortfolioSection({
  rankingId, portfolioId, portfolioStatus, listName, analysisDate, onChange, showToast,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [emaData, setEmaData] = useState<EmaAnalysisData | null>(null);
  const [emaDialogOpen, setEmaDialogOpen] = useState(false);
  const [creatingEma, setCreatingEma] = useState(false);

  // Fetch EMA analysis data for this list/date
  useEffect(() => {
    (async () => {
      try {
        const ema = await fetchEmaAnalysis(listName, analysisDate);
        if (ema?.found) {
          setEmaData(ema);
        } else {
          setEmaData(null);
        }
      } catch {
        setEmaData(null);
      }
    })();
  }, [listName, analysisDate]);

  const refreshEmaData = async () => {
    try {
      const refreshed = await fetchEmaAnalysis(listName, analysisDate);
      if (refreshed?.found) setEmaData(refreshed);
    } catch { /* ignore */ }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      // Create ranking portfolio
      await createPortfolio(rankingId);

      // Also create EMA portfolio if analysis exists
      if (emaData?.id) {
        try {
          await createEmaPortfolio(emaData.id);
          await refreshEmaData();
          showToast('Both Ranking and EMA portfolios created!');
        } catch (emaErr: any) {
          showToast('Ranking portfolio created! EMA portfolio: ' + emaErr.message, 'error');
        }
      } else {
        showToast('Portfolio created with top 5 stocks!');
      }

      onChange();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateEma = async () => {
    if (!emaData?.id) return;
    setCreatingEma(true);
    try {
      await createEmaPortfolio(emaData.id);
      await refreshEmaData();
      showToast('EMA Portfolio created with top 5 stocks by star rating!');
      onChange();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setCreatingEma(false);
    }
  };

  const handleEmaDialogChange = async () => {
    await refreshEmaData();
    onChange();
  };

  const emaAnalysisId = emaData?.id ?? null;

  const buttonLabel = emaAnalysisId
    ? 'Create Portfolios (Ranking + EMA)'
    : 'Create Portfolio';

  const buttonDescription = emaAnalysisId
    ? 'Create virtual $100K portfolios: Ranking (top 5 by score) + EMA (top 5 by star rating)'
    : 'Create a virtual $100K portfolio with the top 5 ranked stocks';

  // Helper to render ranking portfolio card
  const renderRankingCard = () => {
    if (portfolioStatus === 'active') {
      return (
        <div className="flex-1 bg-green-500/5 border border-green-500/20 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            <span className="text-green-400 font-semibold text-sm">Ranking Portfolio Active</span>
          </div>
          <button
            onClick={() => setDialogOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#4f8ff7] hover:bg-[#3a7be0]
              text-white rounded-lg font-semibold text-sm transition-all"
          >
            <Eye className="w-4 h-4" />
            View Portfolio Details
          </button>
        </div>
      );
    }
    // closed
    return (
      <div className="flex-1 bg-[#1a1d27] border border-[#2a2e3a] rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-3 h-3 bg-gray-500 rounded-full" />
          <span className="text-[#8b8fa3] font-semibold text-sm">Ranking Portfolio Closed</span>
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
    );
  };

  // Helper to render EMA portfolio card
  const renderEmaCard = () => {
    if (!emaData) return null;

    if (!emaData.portfolioStatus || emaData.portfolioStatus === 'none') {
      return (
        <div className="flex-1 bg-[#1a1d27] border border-[#2a2e3a] rounded-xl p-4">
          <p className="text-[#8b8fa3] text-sm mb-2">
            Create a virtual $100K EMA portfolio with the top 5 stocks by star rating
          </p>
          <button
            onClick={handleCreateEma}
            disabled={creatingEma}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700
              text-white rounded-lg font-semibold text-sm transition-all disabled:opacity-50"
          >
            {creatingEma ? (
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
      );
    }

    if (emaData.portfolioStatus === 'active') {
      return (
        <div className="flex-1 bg-purple-500/5 border border-purple-500/20 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-3 h-3 bg-purple-500 rounded-full animate-pulse" />
            <span className="text-purple-400 font-semibold text-sm">EMA Portfolio Active</span>
          </div>
          <button
            onClick={() => setEmaDialogOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#4f8ff7] hover:bg-[#3a7be0]
              text-white rounded-lg font-semibold text-sm transition-all"
          >
            <Eye className="w-4 h-4" />
            View EMA Portfolio
          </button>
        </div>
      );
    }

    // closed
    return (
      <div className="flex-1 bg-[#1a1d27] border border-[#2a2e3a] rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-3 h-3 bg-gray-500 rounded-full" />
          <span className="text-[#8b8fa3] font-semibold text-sm">EMA Portfolio Closed</span>
        </div>
        <button
          onClick={() => setEmaDialogOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#242836] hover:bg-[#2a2e3a]
            text-white rounded-lg font-semibold text-sm transition-all"
        >
          <Eye className="w-4 h-4" />
          View Results
        </button>
      </div>
    );
  };

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-[#8b8fa3] uppercase tracking-wide mb-3">
        Model Portfolio
      </h3>

      {portfolioStatus === 'none' || !portfolioStatus ? (
        <div className="bg-[#1a1d27] border border-[#2a2e3a] rounded-xl p-6 text-center">
          <p className="text-[#8b8fa3] text-sm mb-3">
            {buttonDescription}
          </p>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700
              text-white rounded-lg font-semibold text-sm transition-all disabled:opacity-50"
          >
            {creating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating {emaAnalysisId ? 'Portfolios' : 'Portfolio'}...
              </>
            ) : (
              <>
                <TrendingUp className="w-4 h-4" />
                {buttonLabel}
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="flex gap-4">
          {renderRankingCard()}
          {renderEmaCard()}
        </div>
      )}

      {/* Ranking Portfolio Dialog */}
      {dialogOpen && portfolioId && (
        <PortfolioDialog
          portfolioId={portfolioId}
          onClose={() => setDialogOpen(false)}
          onChange={onChange}
          showToast={showToast}
        />
      )}

      {/* EMA Portfolio Dialog */}
      {emaDialogOpen && emaData?.portfolioId && (
        <PortfolioDialog
          portfolioId={emaData.portfolioId}
          onClose={() => setEmaDialogOpen(false)}
          onChange={handleEmaDialogChange}
          showToast={showToast}
        />
      )}
    </div>
  );
}
