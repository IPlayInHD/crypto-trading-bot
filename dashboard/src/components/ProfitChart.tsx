import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TradeExecution } from '../types';
import { format } from 'date-fns';

interface ProfitChartProps {
  trades: TradeExecution[];
}

export function ProfitChart({ trades }: ProfitChartProps) {
  const data = useMemo(() => {
    let cumulative = 0;
    return [...trades]
      .reverse()
      .filter((t) => t.status === 'success' && t.actualProfit !== null)
      .map((t) => {
        cumulative += t.actualProfit ?? 0;
        return {
          time: format(new Date(t.timestamp), 'HH:mm:ss'),
          profit: parseFloat((t.actualProfit ?? 0).toFixed(4)),
          cumulative: parseFloat(cumulative.toFixed(4)),
        };
      });
  }, [trades]);

  if (data.length === 0) {
    return (
      <div className="card h-full flex items-center justify-center">
        <div className="text-center text-gray-500">
          <div className="text-4xl mb-2">📊</div>
          <p className="text-sm">No trade data yet</p>
          <p className="text-xs mt-1">Profit chart will appear as trades execute</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card h-full">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">Cumulative Profit (USD)</h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
          <XAxis
            dataKey="time"
            tick={{ fill: '#6b7280', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${v.toFixed(2)}`}
          />
          <Tooltip
            contentStyle={{
              background: '#1e2535',
              border: '1px solid #2d3748',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelStyle={{ color: '#9ca3af' }}
            formatter={(value: number) => [`$${value.toFixed(4)}`, 'Cumulative Profit']}
          />
          <Area
            type="monotone"
            dataKey="cumulative"
            stroke="#22c55e"
            strokeWidth={2}
            fill="url(#profitGradient)"
            dot={false}
            activeDot={{ r: 4, fill: '#22c55e' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
