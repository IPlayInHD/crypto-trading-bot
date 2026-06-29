import React from 'react';
import { BotStats } from '../types';
import { Activity, Wifi, WifiOff, Loader } from 'lucide-react';
import { ConnectionStatus } from '../hooks/useWebSocket';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';

interface BotStatusPanelProps {
  stats: BotStats | null;
  connectionStatus: ConnectionStatus;
}

export function BotStatusPanel({ stats, connectionStatus }: BotStatusPanelProps) {
  const isConnected = connectionStatus === 'connected';
  const uptime = stats ? formatDistanceToNow(new Date(stats.startTime)) : '—';

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-300">Bot Status</h3>
        <div className="flex items-center gap-2">
          {connectionStatus === 'connecting' && (
            <Loader size={14} className="text-yellow-400 animate-spin" />
          )}
          {isConnected ? (
            <Wifi size={14} className="text-green-400" />
          ) : (
            <WifiOff size={14} className="text-red-400" />
          )}
          <span
            className={clsx(
              'text-xs font-medium',
              isConnected ? 'text-green-400' : 'text-red-400'
            )}
          >
            {isConnected ? 'Connected' : connectionStatus}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">Status</span>
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <div
                className={clsx(
                  'w-2 h-2 rounded-full',
                  stats?.isRunning ? 'bg-green-400' : 'bg-red-400'
                )}
              />
              {stats?.isRunning && (
                <div className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-75" />
              )}
            </div>
            <span className={clsx('text-xs font-medium', stats?.isRunning ? 'text-green-400' : 'text-red-400')}>
              {stats?.isRunning ? 'Running' : 'Stopped'}
            </span>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">Mode</span>
          <span className={clsx(
            'text-xs font-medium px-2 py-0.5 rounded',
            stats?.mode === 'simulation' ? 'bg-purple-500/20 text-purple-400' : 'bg-green-500/20 text-green-400'
          )}>
            {stats?.mode?.toUpperCase() ?? '—'}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">Uptime</span>
          <span className="text-xs text-white">{uptime}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">Scan Interval</span>
          <span className="text-xs text-white">{stats?.scanIntervalMs ?? '—'}ms</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">Last Scan</span>
          <span className="text-xs text-white">
            {stats?.lastScanTime
              ? formatDistanceToNow(new Date(stats.lastScanTime), { addSuffix: true })
              : '—'}
          </span>
        </div>

        <div className="pt-2 border-t border-dark-500">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-gray-500">Wallet</span>
            <span className="text-xs text-white font-mono">
              {stats?.walletBalanceSOL.toFixed(4) ?? '0.0000'} SOL
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500"></span>
            <span className="text-xs text-gray-400 font-mono">
              ≈ ${stats?.walletBalanceUSD.toFixed(2) ?? '0.00'}
            </span>
          </div>
        </div>

        <div className="pt-2 border-t border-dark-500">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Activity size={12} className="text-gray-500" />
              <span className="text-xs text-gray-500">Total Scans</span>
            </div>
            <span className="text-xs font-mono text-white">{stats?.totalScans?.toLocaleString() ?? 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
