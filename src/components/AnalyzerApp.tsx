'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Database,
  Download,
  FileJson,
  FileText,
  Github,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Skull,
  Timer,
  TriangleAlert,
} from 'lucide-react';

import AIRevivalRoadmap from '@/components/AIRevivalRoadmap';
import EvidenceModal from '@/components/EvidenceModal';
import FindingsList from '@/components/FindingsList';
import HealthDimensionCard, { DimensionLegend } from '@/components/HealthDimensionCard';
import LandingHero from '@/components/LandingHero';
import ModelLibraryModal from '@/components/ModelLibraryModal';
import RepositoryRecord from '@/components/RepositoryRecord';
import ScoreGauge from '@/components/ScoreGauge';
import StageProgress from '@/components/StageProgress';
import SteamDownloadDock from '@/components/SteamDownloadDock';
import TechnicalAssessment from '@/components/TechnicalAssessment';
import type { DownloadProgress } from '@/lib/models/types';
import {
  STAGE_ORDER,
  type Finding,
  type RevivalAnalysisResponse,
  type StageEvent,
  type StageId,
} from '@/lib/types';

type Phase = 'idle' | 'scanning' | 'complete' | 'error';

interface AnalysisFailure {
  message: string;
  code: string;
}

function isStageId(value: unknown): value is StageId {
  return typeof value === 'string' && (STAGE_ORDER as readonly string[]).includes(value);
}

export default function AnalyzerApp() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [stages, setStages] = useState<Partial<Record<StageId, StageEvent>>>({});
  const [report, setReport] = useState<RevivalAnalysisResponse | null>(null);
  const [failure, setFailure] = useState<AnalysisFailure | null>(null);
  const [targetUrl, setTargetUrl] = useState('');
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [exporting, setExporting] = useState<'md' | 'json' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Steam-style Model Vault state
  const [isVaultOpen, setIsVaultOpen] = useState(false);
  const [activeModel, setActiveModel] = useState<string>('google/gemma-3-1b-it');
  const [activeDownload, setActiveDownload] = useState<DownloadProgress | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const closeEvidence = useCallback(() => setSelectedFinding(null), []);

  // Fetch initial active model from model manager
  useEffect(() => {
    fetch('/api/models')
      .then((res) => res.json())
      .then((data) => {
        if (data?.activeModel) {
          setActiveModel(data.activeModel);
        }
      })
      .catch(() => {});
  }, []);

  // Subscribe to live SSE download stream
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let timer: NodeJS.Timeout | null = null;

    try {
      eventSource = new EventSource('/api/models/download/stream');
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as DownloadProgress;
          if (data.status === 'completed' || data.status === 'cancelled' || data.status === 'error') {
            setActiveDownload(data);
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
              setActiveDownload(null);
            }, 3500);
          } else {
            setActiveDownload(data);
          }
        } catch {
          // Ignore parse errors on keepalive
        }
      };
      eventSource.onerror = () => {
        // SSE reconnects automatically
      };
    } catch {
      // EventSource not supported or failed to construct
    }

    return () => {
      if (timer) clearTimeout(timer);
      eventSource?.close();
    };
  }, []);

  const handleCancelDownload = useCallback(async () => {
    try {
      await fetch('/api/models/download', { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to cancel download:', err);
    }
  }, []);

  /* Scroll to the report the moment it lands. */
  useEffect(() => {
    if (phase !== 'complete' || !report) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => {
      document.getElementById('revival-report')?.scrollIntoView({
        behavior: reduced ? 'auto' : 'smooth',
        block: 'start',
      });
    }, 140);
    return () => window.clearTimeout(timer);
  }, [phase, report]);

  /* Abort any in-flight analysis when the component unmounts. */
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const startAnalysis = useCallback(async (url: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStages({});
    setReport(null);
    setFailure(null);
    setExportError(null);
    setSelectedFinding(null);
    setTargetUrl(url);
    setPhase('scanning');

    const handleFrame = (frame: string): void => {
      let eventName = 'message';
      const dataLines: string[] = [];

      for (const line of frame.split('\n')) {
        if (line.startsWith(':') || line.trim().length === 0) continue;
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).replace(/^ /, ''));
        }
      }

      if (dataLines.length === 0) return;

      let payload: unknown;
      try {
        payload = JSON.parse(dataLines.join('\n'));
      } catch {
        return;
      }

      if (eventName === 'stage') {
        const stageEvent = payload as Partial<StageEvent>;
        if (!isStageId(stageEvent.stage)) return;
        const normalized: StageEvent = {
          stage: stageEvent.stage,
          stageIndex:
            typeof stageEvent.stageIndex === 'number'
              ? stageEvent.stageIndex
              : STAGE_ORDER.indexOf(stageEvent.stage),
          totalStages:
            typeof stageEvent.totalStages === 'number'
              ? stageEvent.totalStages
              : STAGE_ORDER.length,
          status:
            stageEvent.status === 'in_progress' ||
            stageEvent.status === 'complete' ||
            stageEvent.status === 'error'
              ? stageEvent.status
              : 'in_progress',
          message: typeof stageEvent.message === 'string' ? stageEvent.message : '',
          timestamp: typeof stageEvent.timestamp === 'number' ? stageEvent.timestamp : Date.now(),
        };
        setStages((prev) => ({ ...prev, [normalized.stage]: normalized }));
        return;
      }

      if (eventName === 'complete') {
        const fullReport = payload as RevivalAnalysisResponse;
        setReport(fullReport);
        setPhase('complete');
        return;
      }

      if (eventName === 'error') {
        const errPayload = payload as { message?: string; code?: string };
        setFailure({
          message: errPayload.message ?? 'An unknown error halted the excavation.',
          code: errPayload.code ?? 'PIPELINE_ERROR',
        });
        setPhase('error');
      }
    };

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: url, url }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let message = `Excavation request rejected (HTTP ${response.status}).`;
        let code = 'HTTP_ERROR';
        try {
          const body = (await response.json()) as { error?: string; code?: string };
          if (body.error) message = body.error;
          if (body.code) code = body.code;
        } catch {
          // Keep default message.
        }
        setFailure({ message, code });
        setPhase('error');
        return;
      }

      if (!response.body) {
        setFailure({
          message: 'The server opened a stream without a response body.',
          code: 'STREAM_UNAVAILABLE',
        });
        setPhase('error');
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          handleFrame(frame);
        }
      }

      if (buffer.trim().length > 0) {
        handleFrame(buffer);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setFailure({
        message: error instanceof Error ? error.message : 'The analysis failed unexpectedly.',
        code: 'CLIENT_ERROR',
      });
      setPhase('error');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase('idle');
    setStages({});
    setReport(null);
    setFailure(null);
    setTargetUrl('');
    setSelectedFinding(null);
    setExportError(null);
    setExporting(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const exportReport = useCallback(
    async (format: 'md' | 'json') => {
      const current = report;
      if (!current || exporting) return;

      setExporting(format);
      setExportError(null);

      try {
        const response = await fetch('/api/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format, report: current }),
        });

        if (!response.ok) {
          let message = `Export failed (HTTP ${response.status}).`;
          try {
            const payload = (await response.json()) as { error?: unknown };
            if (typeof payload.error === 'string' && payload.error.length > 0) message = payload.error;
          } catch {
            // Keep the status-based message.
          }
          throw new Error(message);
        }

        const blob = await response.blob();
        const disposition = response.headers.get('content-disposition') ?? '';
        const match = /filename="?([^";]+)"?/i.exec(disposition);
        const fallback = `reporeaper-${current.repository.owner}-${current.repository.repo}.${
          format === 'md' ? 'md' : 'json'
        }`;

        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = match?.[1] ?? fallback;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } catch (error) {
        setExportError(error instanceof Error ? error.message : 'Export failed.');
      } finally {
        setExporting(null);
      }
    },
    [report, exporting],
  );

  const header = (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-obsidian-950/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <button
          type="button"
          onClick={reset}
          className="group flex items-center gap-2.5 rounded-lg py-1 pr-2 transition hover:opacity-90"
          aria-label="REPOREAPER — return to start"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyber-cyan/30 bg-cyber-cyan/[0.08] text-cyber-cyan transition group-hover:shadow-glow-cyan">
            <Skull className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="flex items-baseline text-lg font-black leading-none tracking-tight">
            <span className="text-white/90">REPO</span>
            <span className="text-gradient">REAPER</span>
          </span>
        </button>

        <div className="flex items-center gap-2">
          {/* Steam-style Model Vault Button */}
          <button
            type="button"
            onClick={() => setIsVaultOpen(true)}
            className="btn-ghost relative flex items-center gap-2 border border-cyber-cyan/30 bg-cyber-cyan/[0.05] text-cyber-cyan hover:border-cyber-cyan/60 hover:bg-cyber-cyan/[0.1] hover:text-white"
            title="Open AI Model Vault"
            aria-label="Open AI Model Vault"
          >
            <Database className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline font-mono text-[11px]">Vault</span>
            <span className="hidden md:inline-flex items-center gap-1.5 rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
              {activeModel.split('/').pop()?.slice(0, 16)}
            </span>
            {activeDownload && activeDownload.status === 'downloading' && (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
              </span>
            )}
          </button>

          <span className="chip chip-emerald hidden sm:inline-flex">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            static only · zero execution
          </span>
          <span className="hidden h-4 w-px bg-white/10 sm:block" aria-hidden="true" />
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost"
            aria-label="GitHub"
          >
            <Github className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">GitHub</span>
          </a>
          {phase !== 'idle' ? (
            <button type="button" onClick={reset} className="btn-ghost">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">New scan</span>
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );

  return (
    <div className="relative pb-16">
      {header}

      {phase === 'idle' && (
        <>
          <LandingHero onAnalyze={startAnalysis} disabled={false} error={null} />
          <footer className="border-t border-white/[0.06] px-5 py-6 sm:px-8">
            <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-[10px] text-slate-600">
                REPOREAPER · Hacktoberfest 2026 · software archaeology engine
              </p>
              <p className="font-mono text-[10px] text-slate-600">
                shallow clone · bounded scan · 18 deterministic signals · local AI
              </p>
            </div>
          </footer>
        </>
      )}

      {phase === 'scanning' && (
        <main className="mx-auto grid w-full max-w-6xl gap-5 px-5 py-10 sm:px-8 lg:grid-cols-[1.15fr_0.85fr]">
          <StageProgress stages={stages} active targetUrl={targetUrl} />

          <div className="space-y-3">
            <div className="panel panel-accent overflow-hidden">
              <div className="relative px-5 py-5">
                <div className="scan-beam" aria-hidden="true" />
                <p className="eyebrow">Sandbox protocol</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">
                  Ephemeral clone, read-only analysis
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  The repository is shallow-cloned into an isolated temporary directory, walked with
                  hard limits, and deleted before the response finishes. No install, build, or test
                  script from the repository is ever executed.
                </p>

                <dl className="mt-4 space-y-2">
                  {[
                    { label: 'clone depth', value: '1' },
                    { label: 'file ceiling', value: '1,000' },
                    { label: 'depth ceiling', value: '6' },
                    { label: 'clone timeout', value: '30s' },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                    >
                      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
                        {item.label}
                      </dt>
                      <dd className="mono text-[11px] text-slate-200">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            <button type="button" onClick={reset} className="btn-ghost w-full">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Cancel excavation
            </button>
          </div>
        </main>
      )}

      {phase === 'error' && (
        <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
          <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <StageProgress stages={stages} active={false} targetUrl={targetUrl} />

            <div className="panel overflow-hidden border-rose-400/25">
              <div className="border-b border-rose-400/20 bg-rose-500/[0.06] px-5 py-4">
                <p className="eyebrow flex items-center gap-1.5 !text-rose-300/80">
                  <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                  Excavation aborted
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">
                  The repository could not be revived
                </h2>
              </div>

              <div className="space-y-4 px-5 py-5">
                <p className="rounded-xl border border-rose-400/25 bg-rose-500/[0.08] px-4 py-3 text-sm leading-relaxed text-rose-100">
                  {failure?.message ?? 'An unexpected error interrupted the analysis.'}
                </p>

                {failure?.code ? (
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">
                    error code · <span className="text-rose-300/80">{failure.code}</span>
                  </p>
                ) : null}

                <ul className="space-y-2 text-xs leading-relaxed text-slate-400">
                  <li className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
                    Confirm the URL is a public repository in the form
                    <code className="font-mono text-[11px] text-cyan-200/80">https://github.com/owner/repo</code>.
                  </li>
                  <li className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
                    Very large repositories may exceed the static scan ceiling.
                  </li>
                  <li className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
                    Check that outbound HTTPS access to github.com is available.
                  </li>
                </ul>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void startAnalysis(targetUrl)}
                    className="btn-primary !py-2.5"
                    disabled={targetUrl.length === 0}
                  >
                    Retry excavation
                  </button>
                  <button type="button" onClick={reset} className="btn-ghost">
                    Start over
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      )}

      {phase === 'complete' && report && (
        <>
          <main id="revival-report" className="mx-auto w-full max-w-7xl px-5 pb-16 pt-8 sm:px-8">
            {/* Report masthead */}
            <div className="fade-up flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.07] pb-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="chip chip-emerald">
                    <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                    scan complete
                  </span>
                  <span className="chip">{report.ecosystem.primaryLanguage}</span>
                  {report.repository.truncated ? <span className="chip chip-amber">truncated</span> : null}
                  {report.ai.degraded ? <span className="chip chip-amber">fallback engine</span> : null}
                </div>

                <h1 className="mt-3 flex flex-wrap items-baseline gap-x-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  <span className="text-slate-500">{report.repository.owner}/</span>
                  <span>{report.repository.repo}</span>
                </h1>

                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-slate-500">
                  <a
                    href={report.repository.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-cyan-300/80 transition hover:text-cyan-200"
                  >
                    {report.repository.url}
                    <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                  </a>
                  <span className="inline-flex items-center gap-1">
                    <Timer className="h-3 w-3" aria-hidden="true" />
                    {report.durationMs} ms
                  </span>
                  <span>analyzed {new Date(report.generatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  <span>{report.findings.length} findings</span>
                </p>
              </div>

              <div className="flex flex-col items-stretch gap-2 sm:items-end">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void exportReport('md')}
                    className="btn-ghost"
                    disabled={exporting !== null}
                  >
                    {exporting === 'md' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Markdown
                  </button>
                  <button
                    type="button"
                    onClick={() => void exportReport('json')}
                    className="btn-ghost"
                    disabled={exporting !== null}
                  >
                    {exporting === 'json' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <FileJson className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => void exportReport('md')}
                    className="btn-primary !px-4 !py-2.5"
                    disabled={exporting !== null}
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    Export report
                  </button>
                </div>
                {exportError ? (
                  <p role="alert" className="max-w-xs text-right font-mono text-[10px] text-rose-300">
                    {exportError}
                  </p>
                ) : null}
              </div>
            </div>

            {/* Score + verdict */}
            <div className="mt-5 grid gap-5 lg:grid-cols-[330px_1fr]">
              <div className="panel panel-accent flex flex-col px-5 py-6">
                <div className="flex items-center justify-between">
                  <p className="eyebrow">Revival score</p>
                  <span className="chip">100-point model</span>
                </div>
                <div className="mt-3 flex flex-1 items-center justify-center">
                  <ScoreGauge score={report.score} />
                </div>

                <div className="mt-5 space-y-2 border-t border-white/[0.06] pt-4">
                  {report.score.dimensions.map((dimension) => (
                    <div key={dimension.key} className="flex items-center gap-2.5">
                      <span className="w-24 shrink-0 truncate text-[10px] uppercase tracking-[0.1em] text-slate-500">
                        {dimension.key}
                      </span>
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <span
                          className="block h-full rounded-full bg-gradient-to-r from-cyber-cyan to-cyber-violet"
                          style={{ width: `${dimension.percentage}%` }}
                        />
                      </span>
                      <span className="mono w-10 shrink-0 text-right text-[10px] text-slate-400">
                        {dimension.score}/{dimension.maxScore}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <TechnicalAssessment ai={report.ai} score={report.score} />
            </div>

            {/* Dimensions */}
            <div className="mt-8">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="eyebrow">Signal breakdown</p>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">
                    Five dimensions of repository health
                  </h2>
                </div>
                <DimensionLegend />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {report.score.dimensions.map((dimension, index) => (
                  <HealthDimensionCard key={dimension.key} dimension={dimension} index={index} />
                ))}
              </div>
            </div>

            {/* Roadmap */}
            <div className="mt-8">
              <AIRevivalRoadmap roadmap={report.ai.roadmap} />
            </div>

            {/* Findings + record */}
            <div className="mt-8 grid gap-5 xl:grid-cols-2">
              <FindingsList findings={report.findings} onSelect={setSelectedFinding} />
              <RepositoryRecord report={report} />
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-5 py-4">
              <p className="max-w-xl text-[11px] leading-relaxed text-slate-500">
                This report was generated from static evidence only. Scores are deterministic; the
                narrative may be model-generated and should be treated as a starting point, not a
                guarantee. Repository contents are never executed.
              </p>
              <button type="button" onClick={reset} className="btn-ghost">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Excavate another repository
              </button>
            </div>
          </main>

          <footer className="border-t border-white/[0.06] px-5 py-6 sm:px-8">
            <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-[10px] text-slate-600">
                REPOREAPER · report {report.id.slice(0, 8)} · {report.ai.provider}
              </p>
              <p className="font-mono text-[10px] text-slate-600">
                static analysis · no repository code was executed
              </p>
            </div>
          </footer>

          <EvidenceModal finding={selectedFinding} onClose={closeEvidence} />
        </>
      )}

      {/* Steam-Style Vault Modal Dialog */}
      <ModelLibraryModal
        isOpen={isVaultOpen}
        onClose={() => setIsVaultOpen(false)}
        onActiveModelChanged={(modelId: string) => setActiveModel(modelId)}
        externalDownload={activeDownload}
        onCancelActiveDownload={handleCancelDownload}
      />

      {/* Steam-Style Bottom Live Download Dock */}
      <SteamDownloadDock
        download={activeDownload}
        onCancelDownload={handleCancelDownload}
        onOpenVault={() => setIsVaultOpen(true)}
      />
    </div>
  );
}
