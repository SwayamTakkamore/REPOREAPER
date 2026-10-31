'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, FileSearch, ShieldCheck } from 'lucide-react';

import {
  DIMENSION_LABELS,
  severityRank,
  type Finding,
  type Severity,
} from '@/lib/types';

const SEVERITY_CHIP: Record<Severity, string> = {
  critical: 'chip severity-critical',
  high: 'chip severity-high',
  medium: 'chip severity-medium',
  low: 'chip severity-low',
  info: 'chip severity-info',
};

const FILTERS: Array<{ id: 'all' | Severity; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'critical', label: 'Critical' },
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
];

export interface FindingsListProps {
  findings: Finding[];
  onSelect: (finding: Finding) => void;
}

export default function FindingsList({ findings, onSelect }: FindingsListProps) {
  const [filter, setFilter] = useState<'all' | Severity>('all');

  const sorted = useMemo(
    () => [...findings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity)),
    [findings],
  );

  const visible = useMemo(
    () => (filter === 'all' ? sorted : sorted.filter((finding) => finding.severity === filter)),
    [filter, sorted],
  );

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: sorted.length };
    for (const finding of sorted) {
      map[finding.severity] = (map[finding.severity] ?? 0) + 1;
    }
    return map;
  }, [sorted]);

  return (
    <section className="panel overflow-hidden" aria-label="Findings">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/[0.06] px-5 py-4 sm:px-6">
        <div>
          <p className="eyebrow">Excavated findings</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">
            What is holding this repository back
          </h2>
        </div>
        <span className="chip">
          <FileSearch className="h-3 w-3" aria-hidden="true" />
          {sorted.length} total
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-white/[0.06] bg-black/20 px-4 py-2.5 sm:px-5">
        {FILTERS.map((option) => {
          const count = counts[option.id] ?? 0;
          const active = filter === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              aria-pressed={active}
              disabled={count === 0 && option.id !== 'all'}
              className={`rounded-lg border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition ${
                active
                  ? 'border-cyber-cyan/45 bg-cyber-cyan/10 text-cyan-100'
                  : 'border-white/[0.08] bg-white/[0.02] text-slate-500 hover:border-white/20 hover:text-slate-300'
              } disabled:cursor-not-allowed disabled:opacity-35`}
            >
              {option.label}
              <span className="ml-1.5 text-slate-600">{count}</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium text-slate-200">No findings at this severity</p>
          <p className="max-w-sm text-xs leading-relaxed text-slate-500">
            The deterministic engine found nothing to flag in this band. Switch filters to review the
            remaining signals.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.05]">
          {visible.map((finding) => (
            <li key={finding.id}>
              <button
                type="button"
                onClick={() => onSelect(finding)}
                className="group flex w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-white/[0.03] sm:px-6"
              >
                <span className={`${SEVERITY_CHIP[finding.severity]} mt-0.5 shrink-0`}>
                  {finding.severity}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-100 group-hover:text-white">
                    {finding.title}
                  </span>
                  <span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-slate-400">
                    {finding.description}
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-slate-600">
                    <span>{DIMENSION_LABELS[finding.dimension]}</span>
                    {finding.evidence ? (
                      <span className="truncate text-cyan-300/60">{finding.evidence.filePath}</span>
                    ) : null}
                  </span>
                </span>
                <ChevronRight
                  className="mt-1 h-4 w-4 shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-cyber-cyan"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
