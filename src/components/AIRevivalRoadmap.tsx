'use client';

import { ArrowUpRight, CalendarRange, Clock3, Zap } from 'lucide-react';

import type { EffortLevel, RevivalRoadmap, RoadmapAction } from '@/lib/types';

const EFFORT_CHIP: Record<EffortLevel, string> = {
  low: 'chip chip-emerald',
  medium: 'chip chip-amber',
  high: 'chip chip-rose',
};

const PHASES: Array<{
  key: keyof RevivalRoadmap;
  title: string;
  window: string;
  icon: typeof Zap;
  accent: string;
  border: string;
}> = [
  {
    key: 'immediate',
    title: 'Immediate',
    window: 'Next 48 hours',
    icon: Zap,
    accent: 'text-cyber-emerald',
    border: 'border-emerald-400/20',
  },
  {
    key: 'shortTerm',
    title: 'Short term',
    window: '1–2 weeks',
    icon: Clock3,
    accent: 'text-cyber-cyan',
    border: 'border-cyan-400/20',
  },
  {
    key: 'longTerm',
    title: 'Long term',
    window: '1–3 months',
    icon: CalendarRange,
    accent: 'text-cyber-violet',
    border: 'border-violet-400/20',
  },
];

function ActionItem({ action, accent }: { action: RoadmapAction; accent: string }) {
  return (
    <li className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 transition hover:border-white/15">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-xs font-semibold leading-snug text-slate-100">{action.title}</h4>
        <span className={`${EFFORT_CHIP[action.effort]} shrink-0`}>{action.effort} effort</span>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{action.rationale}</p>

      <p className={`mt-2.5 flex items-start gap-1.5 text-[11px] leading-relaxed ${accent}`}>
        <ArrowUpRight className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        {action.expectedBenefit}
      </p>

      {action.relatedFindings.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {action.relatedFindings.map((id) => (
            <span
              key={id}
              className="rounded border border-white/[0.07] bg-black/30 px-1.5 py-0.5 font-mono text-[9px] text-slate-500"
            >
              {id}
            </span>
          ))}
        </div>
      ) : null}
    </li>
  );
}

export interface AIRevivalRoadmapProps {
  roadmap: RevivalRoadmap;
}

export default function AIRevivalRoadmap({ roadmap }: AIRevivalRoadmapProps) {
  return (
    <section className="panel panel-accent overflow-hidden" aria-label="Revival roadmap">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/[0.06] px-5 py-4 sm:px-6">
        <div>
          <p className="eyebrow">Revival protocol</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">
            Phased resurrection roadmap
          </h2>
        </div>
        <span className="chip chip-violet">sequenced by impact</span>
      </div>

      <div className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-3">
        {PHASES.map((phase) => {
          const actions = roadmap[phase.key] ?? [];
          const Icon = phase.icon;

          return (
            <div key={phase.key} className={`rounded-2xl border ${phase.border} bg-black/20 p-3.5`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] ${phase.accent}`}>
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">
                      {phase.title}
                    </h3>
                    <p className="font-mono text-[10px] text-slate-600">{phase.window}</p>
                  </div>
                </div>
                <span className="mono text-[10px] text-slate-600">{actions.length}</span>
              </div>

              {actions.length === 0 ? (
                <p className="mt-4 rounded-lg border border-dashed border-white/[0.08] px-3 py-4 text-center text-[11px] leading-relaxed text-slate-600">
                  No actions queued for this window.
                </p>
              ) : (
                <ol className="mt-3 space-y-2.5">
                  {actions.map((action, index) => (
                    <ActionItem key={`${phase.key}-${action.title}-${index}`} action={action} accent={phase.accent} />
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
