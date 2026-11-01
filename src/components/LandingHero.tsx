'use client';

import { useState, type FormEvent } from 'react';
import {
  ArrowRight,
  BrainCircuit,
  Github,
  GitBranch,
  Loader2,
  Radar,
  ShieldCheck,
  Skull,
  TerminalSquare,
} from 'lucide-react';

const SAMPLE_REPOS = [
  { label: 'express', url: 'https://github.com/expressjs/express', title: 'expressjs/express' },
  { label: 'co', url: 'https://github.com/tj/co', title: 'tj/co' },
  { label: 'underscore', url: 'https://github.com/jashkenas/underscore', title: 'jashkenas/underscore' },
];

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'Static only',
    body: 'Read-only shallow clone. Zero dependencies installed, zero scripts executed.',
    accent: 'text-cyber-emerald',
  },
  {
    icon: Radar,
    title: '18 weighted signals',
    body: 'Deterministic analysis of manifests, tests, git health, code quality & documentation.',
    accent: 'text-cyber-cyan',
  },
  {
    icon: BrainCircuit,
    title: 'Evidence-backed AI',
    body: 'Local model turns findings into a phased revival roadmap. Falls back gracefully.',
    accent: 'text-cyber-violet',
  },
];

export interface LandingHeroProps {
  onAnalyze: (url: string) => void;
  disabled?: boolean;
  error?: string | null;
}

export default function LandingHero({ onAnalyze, disabled = false, error = null }: LandingHeroProps) {
  const [url, setUrl] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    const trimmed = url.trim();
    if (trimmed.length === 0) return;
    onAnalyze(trimmed);
  };

  return (
    <section className="relative mx-auto w-full max-w-7xl px-5 pb-20 pt-10 sm:px-8 lg:pt-16">
      <div className="grid items-center gap-14 lg:grid-cols-[1.08fr_0.92fr] lg:gap-10">
        {/* ---------------------------------------------------------------- */}
        {/* Left: proposition                                                */}
        {/* ---------------------------------------------------------------- */}
        <div className="fade-up">
          <div className="mb-6 flex flex-wrap items-center gap-2.5">
            <span className="chip chip-cyan">
              <span className="h-1.5 w-1.5 rounded-full bg-cyber-cyan shadow-[0_0_8px_rgba(6,182,212,0.8)]" aria-hidden="true" />
              ARCHAEOLOGY ENGINE v1.0
            </span>
          </div>

          <h1 className="text-[clamp(2.9rem,7.4vw,5.3rem)] font-black leading-[0.92] tracking-[-0.045em]">
            <span
              className="block text-gradient"
              style={{
                backgroundImage: 'linear-gradient(96deg, #00f2fe 0%, #22d3ee 40%, #a855f7 100%)',
              }}
            >
              REPOREAPER
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-300/90 sm:text-lg">
            Resurrecting forgotten code through deterministic static analysis.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 max-w-xl" noValidate>
            <div className="flex flex-col gap-2.5 sm:flex-row backdrop-blur-xl bg-obsidian-900/70 border border-white/10 rounded-2xl p-2 shadow-2xl focus-within:border-cyan-500/50 focus-within:shadow-[0_0_25px_rgba(6,182,212,0.15)] transition-all duration-200">
              <div className="relative flex-1">
                <Github
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                  aria-hidden="true"
                />
                <input
                  id="repo-url"
                  name="repoUrl"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://github.com/owner/repo"
                  className="w-full rounded-xl border-0 bg-transparent px-10 py-2.5 font-mono text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-0"
                  aria-describedby="repo-url-hint"
                  aria-invalid={error ? true : undefined}
                  disabled={disabled}
                />
              </div>
              <button type="submit" className="btn-primary shrink-0 !rounded-xl" disabled={disabled || url.trim().length === 0}>
                {disabled ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Excavating
                  </>
                ) : (
                  <>
                    <Skull className="h-4 w-4" aria-hidden="true" />
                    Exhume
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </>
                )}
              </button>
            </div>

            <p id="repo-url-hint" className="mt-2.5 font-mono text-[11px] leading-relaxed text-slate-500">
              Public GitHub repositories only · HTTPS · nothing from the repository is executed.
            </p>

            {error ? (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-rose-500/35 bg-rose-500/10 px-4 py-3 font-mono text-xs leading-relaxed text-rose-200"
              >
                {error}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {SAMPLE_REPOS.map((sample) => (
                <button
                  key={sample.url}
                  type="button"
                  onClick={() => setUrl(sample.url)}
                  className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1 font-mono text-xs text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-100 hover:shadow-[0_0_12px_rgba(6,182,212,0.2)]"
                  disabled={disabled}
                  title={sample.title}
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </form>

          <div className="mt-10 grid max-w-xl grid-cols-3 gap-3">
            {[
              { value: '18 Signals', tooltip: 'Deterministic analysis of manifests, tests, git health, code quality & documentation.' },
              { value: '100 Pts', tooltip: '5-dimension objective Revival Index calibrated against open-source repositories.' },
              { value: 'Zero Exec', tooltip: 'Read-only shallow clone. Zero dependencies installed, zero scripts executed.' },
            ].map((stat) => (
              <div key={stat.value} className="group relative rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 backdrop-blur-sm transition hover:border-cyan-400/40 hover:shadow-[0_0_15px_rgba(6,182,212,0.15)]">
                <div className="mono text-sm font-semibold text-white">{stat.value}</div>
                <div className="pointer-events-none absolute -top-10 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-obsidian-900/95 px-3 py-2 text-xs text-slate-200 opacity-0 shadow-2xl backdrop-blur-xl transition-opacity duration-200 group-hover:opacity-100">
                  {stat.tooltip}
                  <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-white/10 bg-obsidian-900/95"></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Right: Excavation Lens                                         */}
        {/* ---------------------------------------------------------------- */}
        <div className="fade-up relative" style={{ animationDelay: '120ms' }}>
          <div className="pointer-events-none absolute -inset-6 rounded-[36px] bg-cyber-cyan/[0.05] blur-2xl" aria-hidden="true" />
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-obsidian-900/70 backdrop-blur-xl shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" aria-hidden="true" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" aria-hidden="true" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" aria-hidden="true" />
              </div>
              <span className="font-mono text-[10px] tracking-[0.2em] text-slate-500">EXCAVATION_LENS</span>
              <TerminalSquare className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
            </div>

            <div className="relative px-5 py-6">
              <div className="scan-beam" aria-hidden="true" />
              
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <svg className="h-16 w-16 -rotate-90 transform">
                      <circle
                        cx="32"
                        cy="32"
                        r="28"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="transparent"
                        className="text-white/[0.06]"
                      />
                      <circle
                        cx="32"
                        cy="32"
                        r="28"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="transparent"
                        strokeDasharray={`${2 * Math.PI * 28}`}
                        strokeDashoffset={`${2 * Math.PI * 28 * (1 - 86/100)}`}
                        className="text-cyber-cyan drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]"
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="mono text-lg font-bold text-white">86</span>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="mono text-xl font-bold text-white">86</span>
                      <span className="mono text-sm text-slate-500">/ 100</span>
                    </div>
                    <span className="mt-1 inline-flex rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-emerald-300">Healthy</span>
                  </div>
                </div>
              </div>

              <div className="mb-4 flex flex-wrap gap-1.5">
                {[
                  { label: 'DOC 18/20', color: 'from-cyan-400 to-blue-400' },
                  { label: 'DEP 16/20', color: 'from-emerald-400 to-teal-400' },
                  { label: 'MNT 12/20', color: 'from-amber-400 to-orange-400' },
                  { label: 'TST 20/20', color: 'from-violet-400 to-purple-400' },
                  { label: 'QLT 20/20', color: 'from-pink-400 to-rose-400' },
                ].map((dim) => (
                  <span key={dim.label} className="group relative cursor-default rounded-md border border-white/10 bg-white/[0.02] px-2 py-1 font-mono text-[9px] text-slate-300 transition hover:border-cyan-400/40 hover:shadow-[0_0_10px_rgba(6,182,212,0.25)]">
                    <span className={`bg-gradient-to-r ${dim.color} bg-clip-text text-transparent`}>{dim.label}</span>
                  </span>
                ))}
              </div>

              <div className="font-mono text-[10px] leading-6 text-slate-400">
                <p><span className="text-cyber-cyan">&gt;</span> static_scan</p>
                <p className="text-slate-500">  • manifests parsed</p>
                <p className="text-slate-500">  • git history indexed</p>
                <p className="text-slate-500">  • signals computed</p>
                <p><span className="text-cyber-emerald">ok</span> verdict ready</p>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="panel flex items-center gap-2.5 px-4 py-3">
              <GitBranch className="h-4 w-4 text-cyber-emerald" aria-hidden="true" />
              <div>
                <p className="mono text-[11px] text-slate-200">depth-1 clone</p>
                <p className="text-[10px] text-slate-500">ephemeral sandbox</p>
              </div>
            </div>
            <div className="panel flex items-center gap-2.5 px-4 py-3">
              <ShieldCheck className="h-4 w-4 text-cyber-cyan" aria-hidden="true" />
              <div>
                <p className="mono text-[11px] text-slate-200">zero execution</p>
                <p className="text-[10px] text-slate-500">read-only analysis</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Feature strip                                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-16 grid gap-3 sm:grid-cols-3">
        {FEATURES.map((feature, index) => (
          <div
            key={feature.title}
            className="group panel panel-interactive fade-up px-5 py-5"
            style={{ animationDelay: `${180 + index * 80}ms` }}
          >
            <feature.icon className={`h-5 w-5 ${feature.accent}`} aria-hidden="true" />
            <h2 className="mt-3 text-sm font-semibold tracking-tight text-slate-100">{feature.title}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{feature.body}</p>
            <div className="mt-2 max-h-0 overflow-hidden opacity-0 transition-all duration-300 group-hover:max-h-24 group-hover:opacity-100">
              <p className="text-[11px] leading-relaxed text-slate-500">
                {index === 0 && 'Isolated execution environment prevents any code from running during analysis.'}
                {index === 1 && 'Covers repository metadata, code structure, testing setup, dependencies, and documentation quality.'}
                {index === 2 && 'Generates actionable steps prioritized by impact with specific evidence references.'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
