import React from 'react';
import { TradeExecution } from '../types';
import { format } from 'date-fns';
import { CheckCircle, XCircle, Clock, ArrowRight, ExternalLink } from 'lucide-react';
import clsx from 'clsx';

interface TradeHistoryProps {
  trades: TradeExecution[];
}

function StatusIcon({ status }: { status: TradeExecution['status'] }) {
  switch (status) {
    case 'success':
      return <CheckCircle size={14} className="text-green-400" />;
    case 'failed':
      return <XCircle size={14} className="text-red-400" />;
    default:
      return <Clock size={14} className="text-yellow-400 animate-spin" />;
  }
}

export function TradeHistory({ trades }: TradeHistoryProps) {
  if (trades.length === 0) {
    return (
      <div className="card flex-1 flex items-center justify-center min-h-[200px]">
        <div className="text-center text-gray-500">
          <div className="text-3xl mb-2">⚡</div>
          <p className="text-sm">Waiting for trade executions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card flex-1 overflow-hidden flex flex-col">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">Trade History</h3>
      <div className="overflow-y-auto flex-1 -mx-4 px-4 space-y-2 max-h-80">
        {trades.map((trade) => (
          <div
            key={trade.id}
            className={clsx(
              'flex items-center gap-3 p-3 rounded-lg border text-xs animate-slide-in',
              trade.status === 'success'
                ? 'bg-green-500/5 border-green-500/20'
                : trade.status === 'failed'
                ? 'bg-red-500/5 border-red-500/20'
                : 'bg-dark-600 border-dark-500'
            )}
          >
            <StatusIcon status={trade.status} />

            <div className="flex items-center gap-1 flex-1 min-w-0">
              <span className="font-mono font-medium text-white">{trade.tokenIn}</span>
              <ArrowRight size={10} className="text-gray-500 shrink-0" />
              <span className="font-mono font-medium text-white">{trade.tokenOut}</span>
              <span className="text-gray-500 ml-1">via</span>
              <span className="text-blue-400 truncate">{trade.buyDex}</span>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <div
                  className={clsx(
                    'font-mono font-semibold',
                    trade.actualProfit && trade.actualProfit > 0
                      ? 'text-green-400'
                      : 'text-red-400'
                  )}
                >
                  {trade.actualProfit !== null
                    ? `${trade.actualProfit > 0 ? '+' : ''}$${trade.actualProfit.toFixed(4)}`
                    : '—'}
                </div>
                <div className="text-gray-500">{trade.executionTimeMs}ms</div>
              </div>

              <div className="text-right">
                <div className="text-gray-400">{format(new Date(trade.timestamp), 'HH:mm:ss')}</div>
                <div className="text-gray-600 capitalize">
                  <span className={clsx(
                    'px-1.5 py-0.5 rounded text-[10px]',
                    trade.mode === 'simulation' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
                  )}>
                    {trade.mode === 'simulation' ? 'SIM' : 'LIVE'}
                  </span>
                </div>
              </div>

              {trade.txSignatureBuy && (
                <a
                  href={`https://solscan.io/tx/${trade.txSignatureBuy}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-500 hover:text-blue-400 transition-colors"
                  title="View on Solscan"
                >
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
