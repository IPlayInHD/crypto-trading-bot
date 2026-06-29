import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../types';
import { Terminal } from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';

interface LogConsoleProps {
  logs: LogEntry[];
}

export function LogConsole({ logs }: LogConsoleProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="card flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Terminal size={14} className="text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-300">Bot Logs</h3>
        <span className="ml-auto text-xs text-gray-600">{logs.length} entries</span>
      </div>

      <div className="bg-dark-900 rounded-lg p-3 font-mono text-xs overflow-y-auto max-h-48 space-y-1">
        {logs.length === 0 && (
          <span className="text-gray-600 animate-pulse">Waiting for bot connection...</span>
        )}
        {logs.map((log, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-gray-600 shrink-0">
              {format(new Date(log.timestamp), 'HH:mm:ss.SSS')}
            </span>
            <span
              className={clsx(
                'shrink-0 w-12 text-right',
                log.level === 'error' && 'text-red-400',
                log.level === 'warn' && 'text-yellow-400',
                log.level === 'info' && 'text-blue-400',
                log.level === 'debug' && 'text-gray-600'
              )}
            >
              {log.level.toUpperCase()}
            </span>
            <span
              className={clsx(
                log.level === 'error' && 'text-red-300',
                log.level === 'warn' && 'text-yellow-300',
                log.level === 'info' && 'text-gray-300',
                log.level === 'debug' && 'text-gray-600'
              )}
            >
              {log.message}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
