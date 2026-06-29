import React, { useState, useCallback } from 'react';
import {
  TrendingUp,
  DollarSign,
  Zap,
  Target,
  BarChart2,
  Award,
  Activity,
  Bot,
} from 'lucide-react';
import { useWebSocket } from './hooks/useWebSocket';
import { StatCard } from './components/StatCard';
import { ProfitChart } from './components/ProfitChart';
import { TradeHistory } from './components/TradeHistory';
import { OpportunityFeed } from './components/OpportunityFeed';
import { PriceTickerBar } from './components/PriceTickerBar';
import { BotStatusPanel } from './components/BotStatusPanel';
import { DexBreakdown } from './components/DexBreakdown';
import { LogConsole } from './components/LogConsole';
import {
  ArbitrageOpportunity,
  BotStats,
  LogEntry,
  PriceUpdate,
  TradeExecution,
  WsMessage,
} from './types';

const WS_URL = `ws://${window.location.hostname}:8080`;
const MAX_TRADES = 100;
const MAX_OPPS = 50;
const MAX_LOGS = 200;

export default function App() {
  const [stats, setStats] = useState<BotStats | null>(null);
  const [trades, setTrades] = useState<TradeExecution[]>([]);
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [prices, setPrices] = useState<Map<string, PriceUpdate>>(new Map());
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const handleMessage = useCallback((msg: WsMessage) => {
    switch (msg.type) {
      case 'stats':
        setStats(msg.payload as BotStats);
        break;

      case 'trade':
        setTrades((prev) => {
          const next = [msg.payload as TradeExecution, ...prev];
          return next.slice(0, MAX_TRADES);
        });
        break;

      case 'opportunity':
        setOpportunities((prev) => {
          const opp = msg.payload as ArbitrageOpportunity;
          const next = [opp, ...prev.filter((o) => o.id !== opp.id)];
          return next.slice(0, MAX_OPPS);
        });
        break;

      case 'price_update':
        setPrices((prev) => {
          const next = new Map(prev);
          for (const p of msg.payload as PriceUpdate[]) {
            next.set(p.pair, p);
          }
          return next;
        });
        break;

      case 'log':
        setLogs((prev) => {
          const entry = { ...(msg.payload as { level: string; message: string }), timestamp: msg.timestamp };
          return [...prev, entry].slice(-MAX_LOGS);
        });
        break;

      default:
        break;
    }
  }, []);

  const { status } = useWebSocket({ url: WS_URL, onMessage: handleMessage });

  const netProfitTrend = stats
    ? stats.netProfitUSD > 0 ? 'up' : stats.netProfitUSD < 0 ? 'down' : 'neutral'
    : 'neutral';

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      {/* Header */}
      <header className="bg-dark-800 border-b border-dark-600 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-500/20 border border-brand-500/30 flex items-center justify-center">
            <Bot size={16} className="text-brand-400" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white">Solana Arbitrage Bot</h1>
            <p className="text-[10px] text-gray-500">Real-time DEX Arbitrage Dashboard</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          {stats?.mode && (
            <span className={`px-3 py-1 rounded-full font-medium border ${
              stats.mode === 'simulation'
                ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                : 'bg-green-500/10 text-green-400 border-green-500/30 animate-pulse'
            }`}>
              {stats.mode === 'simulation' ? '🧪 Simulation Mode' : '🔴 Live Trading'}
            </span>
          )}
          <div className="flex items-center gap-1.5 text-gray-400">
            <Activity size={12} className={status === 'connected' ? 'text-green-400' : 'text-red-400'} />
            <span className={status === 'connected' ? 'text-green-400' : 'text-red-400'}>
              {status === 'connected' ? 'Live' : status}
            </span>
          </div>
        </div>
      </header>

      {/* Price Ticker */}
      <PriceTickerBar prices={prices} />

      {/* Main Content */}
      <div className="flex-1 p-4 space-y-4 overflow-auto">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <div className="col-span-2">
            <StatCard
              label="Net Profit"
              value={`$${stats?.netProfitUSD.toFixed(4) ?? '0.0000'}`}
              subValue="after fees"
              icon={DollarSign}
              iconColor="text-green-400"
              trend={netProfitTrend}
              highlight={stats ? stats.netProfitUSD > 0 : false}
            />
          </div>
          <div className="col-span-2">
            <StatCard
              label="Total Profit"
              value={`$${stats?.totalProfitUSD.toFixed(4) ?? '0.0000'}`}
              icon={TrendingUp}
              iconColor="text-blue-400"
              trend="up"
            />
          </div>
          <StatCard
            label="Trades"
            value={stats?.tradesExecuted ?? 0}
            subValue={`${stats?.tradesSuccessful ?? 0} won`}
            icon={Zap}
            iconColor="text-yellow-400"
          />
          <StatCard
            label="Win Rate"
            value={`${((stats?.winRate ?? 0) * 100).toFixed(1)}%`}
            icon={Target}
            iconColor="text-purple-400"
            trend={(stats?.winRate ?? 0) > 0.5 ? 'up' : 'neutral'}
          />
          <StatCard
            label="Opportunities"
            value={stats?.opportunitiesFound ?? 0}
            icon={BarChart2}
            iconColor="text-cyan-400"
          />
          <StatCard
            label="Best Trade"
            value={`$${stats?.bestTrade.toFixed(4) ?? '0.0000'}`}
            icon={Award}
            iconColor="text-orange-400"
            trend="up"
          />
          <StatCard
            label="Avg Profit"
            value={`$${stats?.avgProfitPerTrade.toFixed(4) ?? '0.0000'}`}
            subValue="per trade"
            icon={Activity}
            iconColor="text-pink-400"
          />
        </div>

        {/* Middle Row */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Profit Chart */}
          <div className="lg:col-span-2">
            <ProfitChart trades={trades} />
          </div>

          {/* Opportunities */}
          <div className="lg:col-span-2">
            <OpportunityFeed opportunities={opportunities} />
          </div>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Bot Status */}
          <div>
            <BotStatusPanel stats={stats} connectionStatus={status} />
          </div>

          {/* DEX Breakdown */}
          <div>
            <DexBreakdown trades={trades} />
          </div>

          {/* Trade History */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <TradeHistory trades={trades} />
          </div>
        </div>

        {/* Log Console */}
        <LogConsole logs={logs} />
      </div>

      {/* Footer */}
      <footer className="bg-dark-800 border-t border-dark-600 px-6 py-2 flex items-center justify-between text-xs text-gray-600 shrink-0">
        <span>Solana Arbitrage Bot · Powered by Jupiter Aggregator</span>
        <span>
          {stats?.totalScans?.toLocaleString() ?? 0} scans ·{' '}
          {stats?.lastScanTime
            ? `Last: ${new Date(stats.lastScanTime).toLocaleTimeString()}`
            : 'Awaiting first scan'}
        </span>
      </footer>
    </div>
  );
}
