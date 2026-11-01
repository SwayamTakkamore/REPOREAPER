'use client';

import { Activity, Clock, Download, X } from 'lucide-react';
import type { DownloadProgress } from '@/lib/models/types';

interface SteamDownloadDockProps {
  download: DownloadProgress | null;
  onOpenVault: () => void;
  onCancelDownload: () => void;
}

export default function SteamDownloadDock({
  download,
  onOpenVault,
  onCancelDownload,
}: SteamDownloadDockProps) {
  if (
    !download ||
    download.status === 'idle' ||
    download.status === 'completed' ||
    download.status === 'cancelled'
  ) {
    return null;
  }

  const isError = download.status === 'error';

  return (
    <aside
      aria-label="Active model download"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-cyan-500/30 bg-obsidian-950/95 px-4 py-3 shadow-[0_-8px_32px_rgba(0,0,0,0.8)] backdrop-blur-2xl transition-transform duration-300 sm:px-6"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        {/* Left: Model identification & status */}
        <div className="flex min-w-[200px] items-center gap-3">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyber-cyan shadow-glow-cyan">
            <Download className="h-5 w-5 animate-bounce" aria-hidden="true" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-500"></span>
            </span>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-cyber-cyan">
                Steam Download Engine
              </span>
              <span className="chip chip-amber text-[10px] py-0.5">
                {download.status}
              </span>
            </div>
            <p className="truncate text-sm font-semibold text-white">
              {download.modelName}
            </p>
            <p className="truncate font-mono text-[11px] text-slate-400">
              {download.currentFile}
            </p>
          </div>
        </div>

        {/* Center: Progress & live telemetry metrics */}
        <div className="flex-1 min-w-[280px] max-w-xl space-y-1.5 px-2">
          <div className="flex items-center justify-between font-mono text-xs text-slate-300">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-cyber-cyan font-semibold">
                <Activity className="h-3 w-3 text-cyan-400" aria-hidden="true" />
                {download.speedFormatted}
              </span>
              <span className="flex items-center gap-1 text-slate-400">
                <Clock className="h-3 w-3" aria-hidden="true" />
                ETA: {download.etaFormatted}
              </span>
            </div>
            <span className="font-bold text-white">
              {download.percent}%{' '}
              <span className="font-normal text-slate-400">
                ({download.downloadedFormatted} / {download.totalFormatted})
              </span>
            </span>
          </div>

          {/* Steam-style striped glow progress bar */}
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-800/80 p-0.5 shadow-inner">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyber-cyan via-blue-500 to-emerald-400 transition-all duration-200 ease-out shadow-[0_0_12px_rgba(0,242,254,0.6)]"
              style={{ width: `${Math.max(3, download.percent)}%` }}
            />
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenVault}
            className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 font-mono text-xs font-semibold text-cyber-cyan transition hover:bg-cyan-500/20 hover:shadow-glow-cyan"
          >
            Open Vault
          </button>
          <button
            type="button"
            onClick={onCancelDownload}
            title="Cancel Download"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 transition hover:bg-red-500/20 hover:text-red-300"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Cancel Download</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
