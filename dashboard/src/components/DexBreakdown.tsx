import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TradeExecution } from '../types';

const COLORS = ['#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444', '#06b6d4'];

interface DexBreakdownProps {
  trades: TradeExecution[];
}

export function DexBreakdown({ trades }: DexBreakdownProps) {
  const data = useMemo(() => {
    const dexCounts: Record<string, number> = {};
    for (const t of trades) {
      dexCounts[t.buyDex] = (dexCounts[t.buyDex] || 0) + 1;
    }
    return Object.entries(dexCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [trades]);

  if (data.length === 0) {
    return (
      <div className="card flex items-center justify-center min-h-[160px]">
        <p className="text-xs text-gray-500">No DEX activity yet</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">DEX Activity</h3>
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={65}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((_, index) => (
              <Cell key={index} fill={COLORS[index % COLORS.length]} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: '#1e2535',
              border: '1px solid #2d3748',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            formatter={(value: number, name: string) => [value, name]}
          />
          <Legend
            wrapperStyle={{ fontSize: '11px', color: '#9ca3af' }}
            iconType="circle"
            iconSize={8}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
