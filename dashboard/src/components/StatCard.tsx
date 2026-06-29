import React from 'react';
import { LucideIcon } from 'lucide-react';
import clsx from 'clsx';

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon: LucideIcon;
  iconColor?: string;
  trend?: 'up' | 'down' | 'neutral';
  highlight?: boolean;
}

export function StatCard({
  label,
  value,
  subValue,
  icon: Icon,
  iconColor = 'text-brand-400',
  trend,
  highlight,
}: StatCardProps) {
  return (
    <div
      className={clsx(
        'stat-card',
        highlight && 'border-brand-500/40 bg-brand-500/5'
      )}
    >
      <div className="flex items-start justify-between">
        <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">{label}</span>
        <div className={clsx('p-1.5 rounded-lg bg-dark-600', iconColor)}>
          <Icon size={14} />
        </div>
      </div>
      <div className="mt-2">
        <span
          className={clsx(
            'text-2xl font-bold tabular-nums',
            trend === 'up' && 'text-green-400',
            trend === 'down' && 'text-red-400',
            (!trend || trend === 'neutral') && 'text-white'
          )}
        >
          {value}
        </span>
        {subValue && (
          <span className="ml-2 text-xs text-gray-500">{subValue}</span>
        )}
      </div>
    </div>
  );
}
