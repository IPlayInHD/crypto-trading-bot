import React from 'react';
import { ArbitrageOpportunity } from '../types';
import { TrendingUp, ArrowRight, Zap } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';

interface OpportunityFeedProps {
  opportunities: ArbitrageOpportunity[];
}

function ConfidenceBadge({ confidence }: { confidence: ArbitrageOpportunity['confidence'] }) {
  return (
    <span
      className={clsx(
        'badge text-[10px]',
        confidence === 'high' && 'badge-green',
        confidence === 'medium' && 'badge-yellow',
        confidence === 'low' && 'badge-red'
      )}
    >
      {confidence}
    </span>
  );
}

export function OpportunityFeed({ opportunities }: OpportunityFeedProps) {
  if (opportunities.length === 0) {
    return (
      <div className="card flex items-center justify-center min-h-[180px]">
        <div className="text-center text-gray-500">
          <TrendingUp size={28} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Scanning for opportunities...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300">Live Opportunities</h3>
        <span className="badge badge-green">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          {opportunities.length} found
        </span>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto">
        {opportunities.slice(0, 15).map((opp) => (
          <div
            key={opp.id}
            className={clsx(
              'flex items-center gap-3 p-3 rounded-lg border text-xs transition-all animate-slide-in',
              opp.confidence === 'high'
                ? 'border-green-500/30 bg-green-500/5'
                : opp.confidence === 'medium'
                ? 'border-yellow-500/20 bg-yellow-500/5'
                : 'border-dark-500 bg-dark-600'
            )}
          >
            <div className="shrink-0">
              {opp.type === 'triangular' ? (
                <Zap size={14} className="text-purple-400" />
              ) : (
                <TrendingUp size={14} className="text-blue-400" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 font-medium text-white">
                <span>{opp.tokenIn.symbol}</span>
                <ArrowRight size={9} className="text-gray-500" />
                <span>{opp.tokenOut.symbol}</span>
                {opp.type === 'triangular' && (
                  <>
                    <ArrowRight size={9} className="text-gray-500" />
                    <span>{opp.tokenIn.symbol}</span>
                  </>
                )}
              </div>
              <div className="text-gray-500 mt-0.5 flex items-center gap-1 truncate">
                <span className="text-blue-400">{opp.buyDex}</span>
                <ArrowRight size={8} />
                <span className="text-purple-400">{opp.sellDex}</span>
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="text-green-400 font-semibold font-mono">
                +${opp.estimatedProfitUSD.toFixed(4)}
              </div>
              <div className="text-gray-500 mt-0.5">
                {opp.priceDiffPct.toFixed(3)}% spread
              </div>
            </div>

            <div className="shrink-0 flex flex-col items-end gap-1">
              <ConfidenceBadge confidence={opp.confidence} />
              <span className="text-gray-600 text-[10px]">
                {formatDistanceToNow(new Date(opp.timestamp), { addSuffix: true })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
