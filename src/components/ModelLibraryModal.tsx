'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowDownToLine,
  Check,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  HardDrive,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react';

import type {
  DownloadProgress,
  ModelInfo,
  ModelLibraryState,
} from '@/lib/models/types';

interface ModelLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onActiveModelChanged?: (modelId: string) => void;
  externalDownload?: DownloadProgress | null;
  onCancelActiveDownload?: () => void;
}

export default function ModelLibraryModal({
  isOpen,
  onClose,
  onActiveModelChanged,
  externalDownload,
  onCancelActiveDownload,
}: ModelLibraryModalProps) {
  const [library, setLibrary] = useState<ModelLibraryState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'installed' | 'catalog'>('all');
  const [customModelInput, setCustomModelInput] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [switchingModelId, setSwitchingModelId] = useState<string | null>(null);
  const [modelToDelete, setModelToDelete] = useState<ModelInfo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [liveDownload, setLiveDownload] = useState<DownloadProgress | null>(
    externalDownload ?? null,
  );

  /* Fetch initial library state */
  const fetchLibrary = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch('/api/models', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ModelLibraryState;
      setLibrary(data);
      if (data.activeDownload) {
        setLiveDownload(data.activeDownload);
      }
    } catch (err) {
      setActionError(`Failed to load model vault: ${(err as Error).message}`);
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchLibrary();
    }
  }, [isOpen, fetchLibrary]);

  /* Sync with external download if passed */
  useEffect(() => {
    if (externalDownload) {
      setLiveDownload(externalDownload);
    }
  }, [externalDownload]);

  /* Connect to Server-Sent Events stream for real-time progress */
  useEffect(() => {
    if (!isOpen) return;

    const eventSource = new EventSource('/api/models/download/stream');

    eventSource.addEventListener('progress', (e) => {
      try {
        const data = JSON.parse(e.data) as DownloadProgress;
        setLiveDownload(data);

        // If download finished, re-fetch library state
        if (data.status === 'completed') {
          fetchLibrary();
        }
      } catch {
        // Parse error
      }
    });

    return () => {
      eventSource.close();
    };
  }, [isOpen, fetchLibrary]);

  /* Set active model */
  const handleSetActive = async (modelId: string) => {
    setSwitchingModelId(modelId);
    setActionError(null);
    try {
      const res = await fetch('/api/models/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to switch model.');
      }
      await fetchLibrary();
      onActiveModelChanged?.(modelId);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setSwitchingModelId(null);
    }
  };

  /* Start download */
  const handleDownload = async (modelId: string) => {
    setActionError(null);
    setCustomError(null);
    try {
      const res = await fetch('/api/models/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start download.');
      }
      const initial = (await res.json()) as DownloadProgress;
      setLiveDownload(initial);
      setCustomModelInput('');
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  /* Cancel download */
  const handleCancelDownload = async () => {
    setActionError(null);
    try {
      await fetch('/api/models/download', { method: 'DELETE' });
      onCancelActiveDownload?.();
      setLiveDownload(null);
      await fetchLibrary();
    } catch (err) {
      setActionError(`Failed to abort download: ${(err as Error).message}`);
    }
  };

  /* Delete model */
  const handleDeleteConfirm = async () => {
    if (!modelToDelete) return;
    setIsDeleting(true);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/models?modelId=${encodeURIComponent(modelToDelete.id)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete model.');
      }
      setModelToDelete(null);
      await fetchLibrary();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setIsDeleting(false);
    }
  };

  /* Custom model submission */
  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customModelInput.trim();
    if (!trimmed) return;
    if (!trimmed.includes('/')) {
      setCustomError('Enter full repository identifier in format "owner/model-name"');
      return;
    }
    handleDownload(trimmed);
  };

  /* Filter and search */
  const displayedModels = useMemo(() => {
    if (!library) return [];
    let list = library.all;

    if (activeTab === 'installed') {
      list = list.filter((m) => m.isInstalled);
    } else if (activeTab === 'catalog') {
      list = list.filter((m) => !m.isInstalled);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          m.author.toLowerCase().includes(q) ||
          m.parameters.toLowerCase().includes(q) ||
          m.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    return list;
  }, [library, activeTab, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Model Vault"
    >
      {/* Dark backdrop blur */}
      <div
        className="fixed inset-0 bg-black/85 backdrop-blur-md transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Main Modal Window */}
      <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-obsidian-950 shadow-2xl shadow-cyan-950/40">
        {/* Steam-Style Header */}
        <header className="border-b border-white/[0.08] bg-obsidian-900/90 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyber-cyan/30 bg-cyber-cyan/10 text-cyber-cyan shadow-glow-cyan">
                <Database className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black uppercase tracking-wider text-white">
                    Model Vault
                  </h2>
                  <span className="chip chip-cyan text-[10px] py-0.5 font-bold">
                    STEAM LIBRARY ENGINE
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Switch active models, track live download speeds & ETAs, and manage local storage.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => fetchLibrary(true)}
                disabled={refreshing}
                title="Dynamic refresh"
                className="btn-ghost flex items-center gap-1.5 border border-white/10 text-xs text-slate-300 hover:text-white"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 text-cyber-cyan ${
                    refreshing ? 'animate-spin' : ''
                  }`}
                  aria-hidden="true"
                />
                <span>Refresh</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-400 transition hover:bg-white/10 hover:text-white"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Storage Telemetry Bar */}
          {library?.diskStats ? (
            <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-300">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5 text-cyber-cyan">
                    <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Models: {library.diskStats.modelsUsedFormatted}</span>
                  </span>
                  <span className="text-emerald-400">
                    Free Disk: {library.diskStats.freeDiskFormatted}
                  </span>
                </div>
                <span className="text-slate-400">
                  Total Drive: {library.diskStats.totalDiskFormatted} ({library.diskStats.usagePercent}% used)
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-cyber-cyan via-blue-500 to-emerald-400 shadow-[0_0_8px_rgba(0,242,254,0.5)]"
                  style={{ width: `${Math.min(100, library.diskStats.usagePercent)}%` }}
                />
              </div>
            </div>
          ) : null}

          {/* Search, Filter Tabs & Custom Download Intake */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            {/* Filter Pills */}
            <div className="flex rounded-lg border border-white/10 bg-black/30 p-1">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`rounded-md px-3 py-1 font-mono text-xs font-semibold transition ${
                  activeTab === 'all'
                    ? 'bg-cyber-cyan/20 text-cyber-cyan shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All ({library?.all.length ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('installed')}
                className={`rounded-md px-3 py-1 font-mono text-xs font-semibold transition ${
                  activeTab === 'installed'
                    ? 'bg-cyber-cyan/20 text-cyber-cyan shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Installed ({library?.installed.length ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('catalog')}
                className={`rounded-md px-3 py-1 font-mono text-xs font-semibold transition ${
                  activeTab === 'catalog'
                    ? 'bg-cyber-cyan/20 text-cyber-cyan shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Catalog ({library?.catalog.filter((m) => !m.isInstalled).length ?? 0})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative min-w-[220px] flex-1 max-w-xs">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search models or tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/40 py-1.5 pl-8 pr-3 font-mono text-xs text-white placeholder-slate-500 focus:border-cyber-cyan focus:outline-none focus:ring-1 focus:ring-cyber-cyan"
              />
            </div>

            {/* Custom Model Form */}
            <form onSubmit={handleCustomSubmit} className="flex min-w-[280px] flex-1 max-w-sm gap-2">
              <input
                type="text"
                placeholder="Custom Hugging Face repo (owner/model)..."
                value={customModelInput}
                onChange={(e) => {
                  setCustomModelInput(e.target.value);
                  setCustomError(null);
                }}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 font-mono text-xs text-white placeholder-slate-500 focus:border-cyber-cyan focus:outline-none focus:ring-1 focus:ring-cyber-cyan"
              />
              <button
                type="submit"
                className="btn-primary shrink-0 px-3 py-1.5 font-mono text-xs"
              >
                <Plus className="h-3 w-3" />
                <span>Install</span>
              </button>
            </form>
          </div>

          {customError ? (
            <p className="mt-2 text-xs text-red-400">{customError}</p>
          ) : null}
          {actionError ? (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{actionError}</span>
            </div>
          ) : null}
        </header>

        {/* Models Grid Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin text-cyber-cyan" />
              <p className="font-mono text-xs">Scanning local Hugging Face storage...</p>
            </div>
          ) : displayedModels.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-slate-400">
              <Layers className="h-10 w-10 text-slate-600" />
              <p className="font-semibold text-white">No models found</p>
              <p className="text-xs text-slate-500">
                Try adjusting your search query or install a custom Hugging Face model above.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {displayedModels.map((model) => {
                const isDownloadingThis =
                  liveDownload?.modelId.toLowerCase() === model.id.toLowerCase() &&
                  (liveDownload.status === 'downloading' ||
                    liveDownload.status === 'queued' ||
                    liveDownload.status === 'verifying');

                return (
                  <div
                    key={model.id}
                    className={`relative flex flex-col justify-between rounded-xl border p-5 transition ${
                      model.isActive
                        ? 'border-cyber-cyan/50 bg-cyber-cyan/[0.04] shadow-glow-cyan'
                        : model.isInstalled
                        ? 'border-white/10 bg-white/[0.02] hover:border-white/20'
                        : 'border-white/[0.06] bg-black/20 hover:border-white/10'
                    }`}
                  >
                    {/* Top Row: Title, Author & Badges */}
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-white">
                              {model.name}
                            </h3>
                            <span className="chip text-[10px] py-0.5">
                              {model.parameters}
                            </span>
                          </div>
                          <p className="font-mono text-xs text-slate-400">
                            {model.id} · <span className="text-slate-300">{model.author}</span>
                          </p>
                        </div>

                        {/* Status Chip */}
                        {model.isActive ? (
                          <span className="chip chip-cyan border-cyan-400/50 bg-cyan-400/10 font-bold text-cyber-cyan shadow-glow-cyan">
                            <span className="h-1.5 w-1.5 rounded-full bg-cyber-cyan animate-pulse"></span>
                            ACTIVE
                          </span>
                        ) : isDownloadingThis ? (
                          <span className="chip chip-amber font-bold animate-pulse">
                            DOWNLOADING
                          </span>
                        ) : model.isInstalled ? (
                          <span className="chip chip-emerald text-[11px]">
                            <CheckCircle2 className="h-3 w-3" />
                            INSTALLED
                          </span>
                        ) : (
                          <span className="chip text-[11px] text-slate-400">
                            AVAILABLE
                          </span>
                        )}
                      </div>

                      <p className="mt-2.5 text-xs leading-relaxed text-slate-300">
                        {model.description}
                      </p>

                      {/* Model Specs / Badges */}
                      <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[11px]">
                        <span className="rounded bg-white/[0.04] px-2 py-0.5 text-slate-300">
                          💾 {model.sizeFormatted}
                        </span>
                        <span className="rounded bg-white/[0.04] px-2 py-0.5 text-slate-300">
                          ⚡ {model.vramRecommended}
                        </span>
                        <span className="rounded bg-white/[0.04] px-2 py-0.5 text-slate-300">
                          📐 {model.architecture}
                        </span>
                      </div>

                      {/* Tags */}
                      <div className="mt-2.5 flex flex-wrap gap-1">
                        {model.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2 py-0.5 text-[10px] text-slate-400"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* In-Card Download Telemetry (if this model is downloading) */}
                    {isDownloadingThis && liveDownload ? (
                      <div className="mt-4 rounded-lg border border-cyan-500/30 bg-black/60 p-3 shadow-inner">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="flex items-center gap-1 font-semibold text-cyber-cyan">
                            <Activity className="h-3.5 w-3.5 animate-pulse" />
                            {liveDownload.speedFormatted}
                          </span>
                          <span className="text-slate-400">
                            ETA: {liveDownload.etaFormatted}
                          </span>
                          <span className="font-bold text-white">
                            {liveDownload.percent}%
                          </span>
                        </div>

                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full bg-gradient-to-r from-cyber-cyan to-blue-500 transition-all duration-200"
                            style={{ width: `${Math.max(4, liveDownload.percent)}%` }}
                          />
                        </div>

                        <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-slate-400">
                          <span className="truncate max-w-[200px]">
                            {liveDownload.currentFile}
                          </span>
                          <button
                            type="button"
                            onClick={handleCancelDownload}
                            className="text-xs font-semibold text-red-400 hover:text-red-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {/* Bottom Action Row */}
                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
                      <span className="font-mono text-[11px] text-slate-500">
                        {model.isInstalled
                          ? `Local snapshot ready`
                          : `Estimated download: ${model.sizeFormatted}`}
                      </span>

                      <div className="flex items-center gap-2">
                        {model.isActive ? (
                          <button
                            type="button"
                            disabled
                            className="flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3.5 py-1.5 font-mono text-xs font-semibold text-cyber-cyan cursor-default"
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>Currently Active</span>
                          </button>
                        ) : model.isInstalled ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSetActive(model.id)}
                              disabled={switchingModelId === model.id}
                              className="btn-primary flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs"
                            >
                              {switchingModelId === model.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Zap className="h-3.5 w-3.5" />
                              )}
                              <span>Activate</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setModelToDelete(model)}
                              title="Delete model"
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 transition hover:bg-red-500/20 hover:text-red-300"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDownload(model.id)}
                            disabled={Boolean(liveDownload && liveDownload.status === 'downloading')}
                            className="btn-ghost flex items-center gap-1.5 border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 font-mono text-xs font-semibold text-cyber-cyan hover:bg-cyan-500/20"
                          >
                            <ArrowDownToLine className="h-3.5 w-3.5" />
                            <span>Download & Install</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {modelToDelete ? (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => !isDeleting && setModelToDelete(null)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-red-500/30 bg-obsidian-950 p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base font-bold text-white">Delete Local Model?</h3>
                <p className="font-mono text-xs text-red-400">{modelToDelete.id}</p>
              </div>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-slate-300">
              This will permanently delete this model from local cache and free up approximately{' '}
              <strong className="text-white">{modelToDelete.sizeFormatted}</strong> of disk space.
            </p>

            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setModelToDelete(null)}
                disabled={isDeleting}
                className="btn-ghost px-4 py-1.5 text-xs text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/50 bg-red-600 px-4 py-1.5 font-mono text-xs font-bold text-white transition hover:bg-red-500"
              >
                {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
