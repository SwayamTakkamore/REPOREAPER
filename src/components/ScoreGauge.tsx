'use client';

import type { CSSProperties } from 'react';

import type { HealthLabel, HealthScore } from '@/lib/types';

const RADIUS = 86;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const SCORE_COLORS: Record<HealthLabel, { from: string; to: string; text: string; ring: string }> = {
  Healthy: { from: '#10B981', to: '#00F2FE', text: 'text-emerald-300', ring: 'rgba(16,185,129,0.35)' },
  'Needs Attention': { from: '#00F2FE', to: '#22D3EE', text: 'text-cyan-200', ring: 'rgba(0,242,254,0.32)' },
  'At Risk': { from: '#F59E0B', to: '#FB923C', text: 'text-amber-300', ring: 'rgba(245,158,11,0.34)' },
  Critical: { from: '#F43F5E', to: '#A855F7', text: 'text-rose-300', ring: 'rgba(244,63,94,0.36)' },
};

export interface ScoreGaugeProps {
  score: HealthScore;
}

export default function ScoreGauge({ score }: ScoreGaugeProps) {
  const palette = SCORE_COLORS[score.label];
  const ratio = Math.max(0, Math.min(1, score.total / Math.max(score.maxTotal, 1)));
  const dashOffset = CIRCUMFERENCE * (1 - ratio);

  const style = {
    '--gauge-circumference': `${CIRCUMFERENCE}`,
    strokeDasharray: `${CIRCUMFERENCE}`,
    strokeDashoffset: dashOffset,
    filter: `drop-shadow(0 0 8px ${palette.ring})`,
  } as CSSProperties;

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg
          width="230"
          height="230"
          viewBox="0 0 230 230"
          role="img"
          aria-label={`Revival score ${score.total} out of ${score.maxTotal}, ${score.label}`}
          className="-rotate-90"
        >
          <defs>
            <linearGradient id="reporeaper-gauge" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={palette.from} />
              <stop offset="100%" stopColor={palette.to} />
            </linearGradient>
          </defs>

          <circle
            cx="115"
            cy="115"
            r={RADIUS + 15}
            fill="none"
            stroke="rgba(148,163,184,0.09)"
            strokeWidth="1"
            strokeDasharray="2 6"
          />
          <circle
            cx="115"
            cy="115"
            r={RADIUS}
            fill="none"
            stroke="rgba(148,163,184,0.11)"
            strokeWidth="13"
          />
          <circle
            cx="115"
            cy="115"
            r={RADIUS}
            fill="none"
            stroke="url(#reporeaper-gauge)"
            strokeWidth="13"
            strokeLinecap="round"
            className="gauge-arc"
            style={style}
          />
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="mono text-[52px] font-bold leading-none tracking-tight text-white">
            {score.total}
          </span>
          <span className="mono mt-1 text-[11px] tracking-[0.2em] text-slate-500">
            / {score.maxTotal}
          </span>
          <span
            className={`mt-3 inline-flex items-center rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${palette.text}`}
            style={{ borderColor: palette.ring, background: 'rgba(255,255,255,0.02)' }}
          >
            {score.label}
          </span>
        </div>
      </div>

      <div className="mt-5 grid w-full grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-center">
          <p className="mono text-lg font-semibold text-slate-100">{score.confidence}%</p>
          <p className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-slate-500">confidence</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-center">
          <p className="mono text-lg font-semibold text-slate-100">
            {score.signalsEvaluated}
            <span className="text-sm text-slate-600">/{score.signalsTotal}</span>
          </p>
          <p className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-slate-500">signals verified</p>
        </div>
      </div>

      {score.confidence < 70 ? (
        <p className="mt-3 w-full rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-center font-mono text-[10px] leading-relaxed text-amber-200/80">
          Low evidence coverage — treat the total as directional.
        </p>
      ) : null}
    </div>
  );
}
