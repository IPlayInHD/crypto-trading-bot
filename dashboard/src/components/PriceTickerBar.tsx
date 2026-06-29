import React from 'react';
import { PriceUpdate } from '../types';
import { TrendingUp, TrendingDown } from 'lucide-react';
import clsx from 'clsx';

interface PriceTickerBarProps {
  prices: Map<string, PriceUpdate>;
}

export function PriceTickerBar({ prices }: PriceTickerBarProps) {
  const items = Array.from(prices.values());

  if (items.length === 0) {
    return (
      <div className="bg-dark-800 border-b border-dark-600 h-8 flex items-center px-4">
        <span className="text-xs text-gray-600 animate-pulse">Fetching prices...</span>
      </div>
    );
  }

  return (
    <div className="bg-dark-800 border-b border-dark-600 h-8 flex items-center overflow-hidden">
      <div className="flex gap-8 px-4 overflow-x-auto scrollbar-none">
        {items.map((p) => (
          <div key={p.pair} className="flex items-center gap-1.5 shrink-0 text-xs">
            <span className="text-gray-400 font-medium">{p.pair}</span>
            <span className="font-mono font-semibold text-white">
              ${p.price < 0.01
                ? p.price.toExponential(2)
                : p.price > 100
                ? p.price.toFixed(2)
                : p.price.toFixed(4)}
            </span>
            <span
              className={clsx(
                'flex items-center gap-0.5 font-mono',
                p.change24h >= 0 ? 'text-green-400' : 'text-red-400'
              )}
            >
              {p.change24h >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {Math.abs(p.change24h).toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
