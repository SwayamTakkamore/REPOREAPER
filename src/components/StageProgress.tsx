'use client';

import { AlertTriangle, Check, Circle, Loader2 } from 'lucide-react';

import {
  STAGE_LABELS,
  STAGE_ORDER,
  type StageEvent,
  type StageId,
  type StageStatus,
} from '@/lib/types';

export interface StageProgressProps {
  /** Latest event per stage, keyed by stage id. */
  stages: Partial<Record<StageId, StageEvent>>;
  active: boolean;
  targetUrl?: string | null;
}

function statusOf(stage: StageId, stages: Partial<Record<StageId, StageEvent>>): StageStatus {
  return stages[stage]?.status ?? 'pending';
}

const STATUS_TEXT: Record<StageStatus, string> = {
  pending: 'Queued',
  in_progress: 'Running',
  complete: 'Complete',
  error: 'Failed',
};

function StageIcon({ status }: { status: StageStatus }) {
  if (status === 'complete') {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-400/10 text-emerald-300">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    );
  }
  if (status === 'in_progress') {
    return (
      <span className="pulse-ring flex h-7 w-7 items-center justify-center rounded-full border border-cyan-300/50 bg-cyan-300/10 text-cyan-200">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-rose-400/50 bg-rose-400/10 text-rose-300">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.02] text-slate-600">
      <Circle className="h-2.5 w-2.5" aria-hidden="true" />
    </span>
  );
}

export default function StageProgress({ stages, active, targetUrl }: StageProgressProps) {
  const completed = STAGE_ORDER.filter((stage) => stages[stage]?.status === 'complete').length;
  const percent = Math.round((completed / STAGE_ORDER.length) * 100);
  const currentStage = STAGE_ORDER.find((stage) => stages[stage]?.status === 'in_progress');

  return (
    <section className="panel panel-accent overflow-hidden" aria-label="Analysis progress">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4 sm:px-6">
        <div>
          <p className="eyebrow">Excavation log</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">
            {currentStage ? STAGE_LABELS[currentStage] : completed === 8 ? 'Analysis complete' : 'Preparing pipeline'}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="mono text-xs text-slate-300">
              {completed}
              <span className="text-slate-600"> / {STAGE_ORDER.length}</span>
            </p>
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">stages</p>
          </div>
          <div className="h-10 w-px bg-white/[0.08]" aria-hidden="true" />
          <div className="mono text-xl font-semibold text-cyan-200">{percent}%</div>
        </div>
      </div>

      <div className="h-1 w-full bg-white/[0.04]">
        <div
          className="h-full bg-gradient-to-r from-cyber-cyan via-cyber-emerald to-cyber-violet transition-[width] duration-700 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      {targetUrl ? (
        <div className="border-b border-white/[0.06] bg-black/20 px-5 py-2.5 sm:px-6">
          <p className="truncate font-mono text-[11px] text-slate-500">
            <span className="text-cyber-cyan">target</span> {targetUrl}
          </p>
        </div>
      ) : null}

      <ol className="px-4 py-3 sm:px-5" aria-live="polite">
        {STAGE_ORDER.map((stage, index) => {
          const status = statusOf(stage, stages);
          const event = stages[stage];
          const isLast = index === STAGE_ORDER.length - 1;

          return (
            <li key={stage} className="relative flex gap-3 py-2.5">
              {!isLast ? (
                <span
                  className={`absolute left-[13px] top-9 h-[calc(100%-1.25rem)] w-px ${
                    status === 'complete' ? 'bg-emerald-400/30' : 'bg-white/[0.07]'
                  }`}
                  aria-hidden="true"
                />
              ) : null}

              <div className="relative z-10 shrink-0">
                <StageIcon status={status} />
              </div>

              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p
                    className={`text-sm font-medium ${
                      status === 'pending'
                        ? 'text-slate-500'
                        : status === 'error'
                          ? 'text-rose-200'
                          : 'text-slate-100'
                    }`}
                  >
                    <span className="mono mr-2 text-[10px] text-slate-600">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    {STAGE_LABELS[stage]}
                  </p>
                  <span
                    className={`font-mono text-[10px] uppercase tracking-[0.12em] ${
                      status === 'complete'
                        ? 'text-emerald-400/80'
                        : status === 'in_progress'
                          ? 'text-cyan-300'
                          : status === 'error'
                            ? 'text-rose-400'
                            : 'text-slate-600'
                    }`}
                  >
                    {STATUS_TEXT[status]}
                  </span>
                </div>
                <p
                  className={`mt-0.5 truncate font-mono text-[11px] ${
                    status === 'pending' ? 'text-slate-600' : 'text-slate-400'
                  }`}
                  title={event?.message}
                >
                  {event?.message ??
                    (status === 'pending' && active ? 'Waiting for pipeline…' : 'Awaiting excavation')}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
