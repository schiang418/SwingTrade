import React, { useState } from 'react';
import { TrendingUp, Loader2, Eye } from 'lucide-react';
import { createPortfolio } from '../api';
import PortfolioDialog from './PortfolioDialog';

interface Props {
  rankingId: number;
  portfolioId: number | null;
  portfolioStatus: string;
  onChange: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function PortfolioSection({ rankingId, portfolioId, portfolioStatus, onChange, showToast }: Props) {
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createPortfolio(rankingId);
      showToast('Portfolio created with top 5 stocks!');
      onChange();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-[#8b8fa3] uppercase tracking-wide mb-3">
        Model Portfolio
      </h3>

      {portfolioStatus === 'none' || !portfolioStatus ? (
        <div className="bg-[#1a1d27] border border-[#2a2e3a] rounded-xl p-6 text-center">
          <p className="text-[#8b8fa3] text-sm mb-3">
            Create a virtual $100K portfolio with the top 5 ranked stocks
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
                Creating Portfolio...
              </>
            ) : (
              <>
                <TrendingUp className="w-4 h-4" />
                Create Portfolio
              </>
            )}
          </button>
        </div>
      ) : portfolioStatus === 'active' ? (
        <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            <span className="text-green-400 font-semibold text-sm">Portfolio Active</span>
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
      ) : (
        <div className="bg-[#1a1d27] border border-[#2a2e3a] rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-3 h-3 bg-gray-500 rounded-full" />
            <span className="text-[#8b8fa3] font-semibold text-sm">Portfolio Closed</span>
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

      {/* Portfolio Dialog */}
      {dialogOpen && portfolioId && (
        <PortfolioDialog
          portfolioId={portfolioId}
          onClose={() => setDialogOpen(false)}
          onChange={onChange}
          showToast={showToast}
        />
      )}
    </div>
  );
}
