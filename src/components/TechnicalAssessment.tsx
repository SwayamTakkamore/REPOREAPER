'use client';

import { BrainCircuit, Cpu, ScanLine, ShieldAlert, Sparkles } from 'lucide-react';

import type { AIRevivalReport, HealthScore } from '@/lib/types';

function paragraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export interface TechnicalAssessmentProps {
  ai: AIRevivalReport;
  score: HealthScore;
}

export default function TechnicalAssessment({ ai, score }: TechnicalAssessmentProps) {
  return (
    <section className="panel panel-accent overflow-hidden" aria-label="Technical assessment">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4 sm:px-6">
        <div>
          <p className="eyebrow flex items-center gap-1.5">
            <BrainCircuit className="h-3.5 w-3.5 text-cyber-violet" aria-hidden="true" />
            Machine assessment
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">The verdict</h2>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {ai.degraded ? (
            <span className="chip chip-amber">
              <ShieldAlert className="h-3 w-3" aria-hidden="true" />
              deterministic fallback
            </span>
          ) : (
            <span className="chip chip-emerald">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              model synthesis
            </span>
          )}
          <span className="chip" title={`Provider: ${ai.provider}`}>
            <Cpu className="h-3 w-3" aria-hidden="true" />
            {ai.model ?? ai.provider}
          </span>
        </div>
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-6">
        <blockquote className="border-l-2 border-cyber-violet/50 pl-4">
          <p className="text-base font-medium leading-relaxed text-slate-100 sm:text-lg">{ai.verdict}</p>
        </blockquote>

        <div className="space-y-3">
          {paragraphs(ai.technicalAssessment).map((paragraph, index) => (
            <p key={index} className="text-sm leading-relaxed text-slate-400">
              {paragraph}
            </p>
          ))}
        </div>

        {ai.rootCauses.length > 0 ? (
          <div>
            <h3 className="eyebrow flex items-center gap-1.5">
              <ScanLine className="h-3.5 w-3.5 text-cyber-cyan" aria-hidden="true" />
              Root causes
            </h3>
            <ol className="mt-2.5 space-y-2">
              {ai.rootCauses.map((cause, index) => (
                <li key={cause} className="flex gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                  <span className="mono shrink-0 text-[10px] text-cyber-cyan/70">
                    R{String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="text-xs leading-relaxed text-slate-300">{cause}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        <div className="rounded-xl border border-white/[0.07] bg-black/25 px-4 py-3">
          <p className="eyebrow">Confidence note</p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{ai.confidenceNote}</p>
          <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-slate-600">
            <span>
              score {score.total}/{score.maxTotal} · {score.label}
            </span>
            <span>confidence {score.confidence}%</span>
            <span>{ai.durationMs} ms synthesis</span>
          </p>
        </div>

        {ai.degraded && ai.degradationReason ? (
          <p className="rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2.5 font-mono text-[10px] leading-relaxed text-amber-200/70">
            degradation · {ai.degradationReason}
          </p>
        ) : null}
      </div>
    </section>
  );
}
