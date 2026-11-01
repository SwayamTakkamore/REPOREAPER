'use client';

import { useId, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleDashed,
  Minus,
  ShieldCheck,
} from 'lucide-react';

import type { DimensionScore, HealthLabel, SignalResult } from '@/lib/types';

const LABEL_STYLES: Record<HealthLabel, { text: string; bar: string; border: string }> = {
  Healthy: {
    text: 'text-emerald-300',
    bar: 'from-emerald-500 to-cyan-400',
    border: 'border-emerald-400/25',
  },
  'Needs Attention': {
    text: 'text-cyan-200',
    bar: 'from-cyan-400 to-teal-300',
    border: 'border-cyan-400/25',
  },
  'At Risk': {
    text: 'text-amber-300',
    bar: 'from-amber-400 to-orange-400',
    border: 'border-amber-400/25',
  },
  Critical: {
    text: 'text-rose-300',
    bar: 'from-rose-500 to-fuchsia-500',
    border: 'border-rose-400/25',
  },
};

function SignalIcon({ signal }: { signal: SignalResult }) {
  if (signal.status === 'pass') {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-400/10 text-emerald-300">
        <Check className="h-3 w-3" aria-hidden="true" />
      </span>
    );
  }
  if (signal.status === 'partial') {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-amber-400/40 bg-amber-400/10 text-amber-300">
        <Minus className="h-3 w-3" aria-hidden="true" />
      </span>
    );
  }
  if (signal.status === 'fail') {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-rose-400/40 bg-rose-400/10 text-rose-300">
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-500/40 bg-slate-500/10 text-slate-400">
      <CircleDashed className="h-3 w-3" aria-hidden="true" />
    </span>
  );
}

export interface HealthDimensionCardProps {
  dimension: DimensionScore;
  index?: number;
}

export default function HealthDimensionCard({ dimension, index = 0 }: HealthDimensionCardProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const palette = LABEL_STYLES[dimension.status];
  const ratio = Math.max(0, Math.min(1, dimension.percentage / 100));

  return (
    <article className={`panel fade-up overflow-hidden border ${palette.border}`} style={{ animationDelay: `${index * 70}ms` }}>
      <div className="px-5 pb-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow">{String(index + 1).padStart(2, '0')} · dimension</p>
            <h3 className="mt-1.5 truncate text-sm font-semibold tracking-tight text-white">
              {dimension.label}
            </h3>
          </div>
          <div className="flex shrink-0 items-baseline gap-1">
            <span className={`mono text-2xl font-bold leading-none ${palette.text}`}>
              {dimension.score}
            </span>
            <span className="mono text-[10px] text-slate-500">/{dimension.maxScore}</span>
          </div>
        </div>

        <div
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
          role="img"
          aria-label={`${dimension.label}: ${dimension.score} out of ${dimension.maxScore}`}
        >
          <div
            className={`h-full rounded-full bg-gradient-to-r ${palette.bar} transition-[width] duration-700 ease-out`}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className={`font-mono text-[10px] uppercase tracking-[0.14em] ${palette.text}`}>
            {dimension.status}
          </span>
          <span className="mono text-[10px] text-slate-500">{dimension.percentage}%</span>
        </div>

        <div className="mt-3 overflow-hidden">
          <p className="text-xs leading-relaxed text-slate-400 transition-all duration-200">{dimension.summary}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between border-t border-white/[0.06] bg-white/[0.015] px-5 py-2.5 text-left transition hover:bg-white/[0.04]"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
          {dimension.signals.length} signals
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <ul id={panelId} className="divide-y divide-white/[0.05] border-t border-white/[0.06]">
          {dimension.signals.map((signal) => (
            <li key={signal.id} className="px-5 py-3">
              <div className="flex items-start gap-2.5">
                <SignalIcon signal={signal} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs font-medium text-slate-200">{signal.label}</p>
                    <span className="mono shrink-0 text-[10px] text-slate-500">
                      {signal.awarded}/{signal.max}
                    </span>
                  </div>
                  <p className="mt-0.5 break-words text-[11px] leading-relaxed text-slate-500">
                    {signal.detail}
                  </p>
                  {signal.evidence ? (
                    <p className="mt-1 truncate font-mono text-[10px] text-slate-600">
                      {signal.evidence.filePath}
                      {signal.evidence.lineNumber ? `:${signal.evidence.lineNumber}` : ''}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

/** Small legend used by the dimension grid header. */
export function DimensionLegend() {
  return (
    <span className="chip">
      <ShieldCheck className="h-3 w-3 text-cyber-emerald" aria-hidden="true" />
      deterministic · evidence-backed
    </span>
  );
}
