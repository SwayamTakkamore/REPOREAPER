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
  { label: 'expressjs/express', url: 'https://github.com/expressjs/express' },
  { label: 'tj/co', url: 'https://github.com/tj/co' },
  { label: 'jashkenas/underscore', url: 'https://github.com/jashkenas/underscore' },
];

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'Static only',
    body: 'The repo is cloned shallowly and read. No installs, no scripts, no execution.',
    accent: 'text-cyber-emerald',
  },
  {
    icon: Radar,
    title: '18 weighted signals',
    body: 'Documentation, dependencies, maintenance, testing, and quality — scored deterministically.',
    accent: 'text-cyber-cyan',
  },
  {
    icon: BrainCircuit,
    title: 'Evidence-backed AI',
    body: 'A local model turns findings into a phased revival roadmap. Falls back gracefully.',
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
              <span className="h-1.5 w-1.5 rounded-full bg-cyber-cyan pulse-ring" aria-hidden="true" />
              Hacktoberfest 2026 · Week 4
            </span>
            <span className="chip">ARCHEOLOGY ENGINE v1.0</span>
          </div>

          <h1 className="text-[clamp(2.9rem,7.4vw,5.3rem)] font-black leading-[0.92] tracking-[-0.045em]">
            <span className="block text-white/95">REPO</span>
            <span
              className="glitch text-gradient block"
              data-text="REAPER"
              aria-label="REAPER"
            >
              REAPER
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-300/90 sm:text-lg">
            Every abandoned repository leaves a skeleton. REPOREAPER excavates the bones —
            documentation, dependencies, maintenance, tests, and structure — then hands you a
            deterministic score and a phased plan to bring the project back.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 max-w-xl" noValidate>
            <label htmlFor="repo-url" className="eyebrow mb-2 block">
              Repository URL
            </label>
            <div className="flex flex-col gap-2.5 sm:flex-row">
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
                  className="input-dark pl-10"
                  aria-describedby="repo-url-hint"
                  aria-invalid={error ? true : undefined}
                  disabled={disabled}
                />
              </div>
              <button type="submit" className="btn-primary shrink-0" disabled={disabled || url.trim().length === 0}>
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
              <span className="text-[11px] uppercase tracking-[0.16em] text-slate-600">Try</span>
              {SAMPLE_REPOS.map((sample) => (
                <button
                  key={sample.url}
                  type="button"
                  onClick={() => setUrl(sample.url)}
                  className="chip transition hover:border-cyber-cyan/40 hover:text-cyan-100"
                  disabled={disabled}
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </form>

          <dl className="mt-10 grid max-w-xl grid-cols-3 gap-3">
            {[
              { value: '8', label: 'pipeline stages' },
              { value: '100', label: 'point score' },
              { value: '5', label: 'health dimensions' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <dt className="mono text-xl font-semibold text-white">{stat.value}</dt>
                <dd className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-500">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Right: artifact terminal                                         */}
        {/* ---------------------------------------------------------------- */}
        <div className="fade-up relative" style={{ animationDelay: '120ms' }}>
          <div className="pointer-events-none absolute -inset-6 rounded-[36px] bg-cyber-cyan/[0.05] blur-2xl" aria-hidden="true" />
          <div className="panel panel-accent relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" aria-hidden="true" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" aria-hidden="true" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" aria-hidden="true" />
              </div>
              <span className="font-mono text-[10px] tracking-[0.2em] text-slate-500">EXCAVATION_PREVIEW</span>
              <TerminalSquare className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
            </div>

            <div className="relative px-5 py-6">
              <div className="scan-beam" aria-hidden="true" />
              <div className="font-mono text-[11px] leading-7 text-slate-400">
                <p>
                  <span className="text-cyber-cyan">$</span> reporeaper scan --static-only
                </p>
                <p className="text-slate-500">[01] validating url ..................... ok</p>
                <p className="text-slate-500">[02] shallow clone (depth 1) ............. ok</p>
                <p className="text-slate-500">[03] walking tree · bounded 1,000 files .. ok</p>
                <p className="text-slate-500">[04] parsing manifests &amp; lockfiles ..... ok</p>
                <p className="text-slate-500">[05] auditing documentation .............. ok</p>
                <p className="text-slate-500">[06] reading git metadata ................ ok</p>
                <p className="text-slate-300">
                  [07] scoring 18 signals ............. <span className="text-cyber-emerald">100/100</span>
                </p>
                <p className="text-slate-300">
                  [08] synthesis ...................... <span className="text-cyber-violet">roadmap</span>
                  <span className="cursor-blink ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 bg-cyber-cyan" aria-hidden="true" />
                </p>
              </div>

              <div className="mt-6 rounded-xl border border-white/[0.07] bg-black/30 p-4">
                <div className="flex items-center justify-between">
                  <span className="eyebrow">Revival score</span>
                  <span className="chip chip-emerald">Healthy</span>
                </div>
                <div className="mt-3 flex items-end gap-2">
                  <span className="mono text-4xl font-bold leading-none text-white">86</span>
                  <span className="mono pb-0.5 text-sm text-slate-500">/ 100</span>
                  <span className="ml-auto mono text-[10px] text-slate-500">conf 94%</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full w-[86%] rounded-full bg-gradient-to-r from-cyber-cyan via-cyber-emerald to-cyber-violet" />
                </div>
                <div className="mt-3 grid grid-cols-5 gap-1.5">
                  {[18, 16, 12, 20, 20].map((value, index) => (
                    <div key={index} className="rounded-md border border-white/[0.06] bg-white/[0.02] px-1.5 py-1 text-center">
                      <div className="mono text-[10px] text-slate-300">{value}</div>
                      <div className="text-[7px] uppercase tracking-wider text-slate-600">
                        {['doc', 'dep', 'mnt', 'tst', 'qlty'][index]}
                      </div>
                    </div>
                  ))}
                </div>
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
            className="panel panel-interactive fade-up px-5 py-5"
            style={{ animationDelay: `${180 + index * 80}ms` }}
          >
            <feature.icon className={`h-5 w-5 ${feature.accent}`} aria-hidden="true" />
            <h2 className="mt-3 text-sm font-semibold tracking-tight text-slate-100">{feature.title}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{feature.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
