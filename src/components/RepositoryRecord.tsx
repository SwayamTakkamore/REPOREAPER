'use client';

import {
  Archive,
  Boxes,
  Check,
  CircleSlash,
  FileCog,
  FileText,
  GitCommitHorizontal,
  Package,
  Scale,
  ShieldCheck,
  TestTube2,
  Users,
} from 'lucide-react';

import type { RevivalAnalysisResponse } from '@/lib/types';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mono mt-1 truncate text-sm font-semibold text-slate-100" title={value}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 truncate text-[10px] text-slate-600">{hint}</p> : null}
    </div>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 py-1">
      {ok ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
      ) : (
        <CircleSlash className="h-3.5 w-3.5 shrink-0 text-slate-600" aria-hidden="true" />
      )}
      <span className={`text-xs ${ok ? 'text-slate-300' : 'text-slate-500'}`}>{label}</span>
    </li>
  );
}

export interface RepositoryRecordProps {
  report: RevivalAnalysisResponse;
}

export default function RepositoryRecord({ report }: RepositoryRecordProps) {
  const { ecosystem, dependencies, documentation, maintenance, quality } = report;

  return (
    <section className="panel overflow-hidden" aria-label="Repository record">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/[0.06] px-5 py-4 sm:px-6">
        <div>
          <p className="eyebrow flex items-center gap-1.5">
            <Archive className="h-3.5 w-3.5 text-cyber-cyan" aria-hidden="true" />
            Archaeological record
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">Static evidence</h2>
        </div>
        <span className="chip">{report.repository.fileCount} files sampled</span>
      </div>

      <div className="grid gap-5 px-5 py-5 sm:px-6 lg:grid-cols-3">
        {/* Ecosystem + dependencies ------------------------------------------ */}
        <div className="space-y-4">
          <div>
            <h3 className="eyebrow flex items-center gap-1.5">
              <Boxes className="h-3.5 w-3.5" aria-hidden="true" />
              Ecosystem
            </h3>
            <p className="mt-2 text-sm font-medium text-slate-200">{ecosystem.primaryLanguage}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ecosystem.frameworks.slice(0, 6).map((framework) => (
                <span key={framework.name} className="chip" title={framework.evidence}>
                  {framework.name}
                </span>
              ))}
              {ecosystem.frameworks.length === 0 ? (
                <span className="text-[11px] text-slate-600">No framework signatures detected</span>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Stat label="Package manager" value={ecosystem.packageManager ?? 'none'} />
            <Stat label="Manifests" value={String(ecosystem.manifests.length)} hint={ecosystem.manifests.join(', ') || '—'} />
            <Stat label="Dependencies" value={String(dependencies.totalDependencies)} />
            <Stat
              label="Lockfile"
              value={dependencies.hasLockfile ? 'present' : 'missing'}
              hint={dependencies.lockfiles.map((lock) => lock.path).join(', ') || undefined}
            />
          </div>

          {dependencies.wildcardDependencies.length > 0 ? (
            <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-amber-300/80">
                <Package className="h-3 w-3" aria-hidden="true" />
                Unpinned dependencies
              </p>
              <p className="mt-1 break-words font-mono text-[10px] leading-relaxed text-amber-100/70">
                {dependencies.wildcardDependencies.join(', ')}
              </p>
            </div>
          ) : null}

          {ecosystem.tooling.length > 0 ? (
            <div>
              <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">Tooling</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {ecosystem.tooling.slice(0, 8).map((tool) => (
                  <span key={tool} className="chip chip-cyan">
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Documentation ----------------------------------------------------- */}
        <div className="space-y-3">
          <h3 className="eyebrow flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            Documentation
          </h3>

          <div className="flex flex-wrap items-center gap-2">
            <span className={documentation.readme.exists ? 'chip chip-emerald' : 'chip chip-rose'}>
              {documentation.readme.exists ? 'README' : 'no README'}
            </span>
            {documentation.license.isOpenSource ? (
              <span className="chip chip-emerald">
                <Scale className="h-3 w-3" aria-hidden="true" />
                {documentation.license.type ?? 'OSI license'}
              </span>
            ) : (
              <span className="chip chip-rose">
                <Scale className="h-3 w-3" aria-hidden="true" />
                {documentation.license.type ?? 'no license'}
              </span>
            )}
            {documentation.readme.exists ? (
              <span className="chip">{documentation.readme.wordCount} words</span>
            ) : null}
          </div>

          <ul className="grid grid-cols-1 gap-x-3 sm:grid-cols-2 lg:grid-cols-1">
            <CheckRow ok={documentation.readme.sections.installation} label="Installation section" />
            <CheckRow ok={documentation.readme.sections.usage} label="Usage section" />
            <CheckRow ok={documentation.readme.sections.configuration} label="Configuration section" />
            <CheckRow ok={documentation.contributing} label="CONTRIBUTING" />
            <CheckRow ok={documentation.codeOfConduct} label="Code of conduct" />
            <CheckRow ok={documentation.changelog} label="CHANGELOG" />
            <CheckRow ok={documentation.securityPolicy} label="Security policy" />
            <CheckRow ok={documentation.docsDirectory} label="docs/ directory" />
          </ul>

          {documentation.readme.snippet ? (
            <p className="line-clamp-3 rounded-lg border border-white/[0.06] bg-black/25 px-3 py-2 font-mono text-[10px] leading-relaxed text-slate-500">
              {documentation.readme.snippet}
            </p>
          ) : null}
        </div>

        {/* Maintenance + quality --------------------------------------------- */}
        <div className="space-y-3">
          <h3 className="eyebrow flex items-center gap-1.5">
            <GitCommitHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            Maintenance &amp; quality
          </h3>

          <div className="grid grid-cols-2 gap-2">
            <Stat
              label="Last commit"
              value={
                maintenance.lastCommitAgeDays === null ? 'unknown' : `${maintenance.lastCommitAgeDays}d ago`
              }
              hint={maintenance.lastCommitDate ?? 'git metadata unavailable'}
            />
            <Stat
              label="Contributors"
              value={maintenance.contributorCount === null ? 'unknown' : String(maintenance.contributorCount)}
              hint={maintenance.shallow ? 'shallow snapshot' : undefined}
            />
            <Stat label="Source lines" value={String(quality.totalSourceLines)} hint={`${quality.sourceFileCount} files`} />
            <Stat
              label="Debt markers"
              value={String(maintenance.todoCount + maintenance.fixmeCount + maintenance.hackCount)}
              hint={`${maintenance.todoDensity}/1k lines`}
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className={quality.hasTestScript ? 'chip chip-emerald' : 'chip chip-amber'}>
              <TestTube2 className="h-3 w-3" aria-hidden="true" />
              {quality.hasTestScript ? quality.testScriptNames.join(', ') : 'no test script'}
            </span>
            <span className={quality.ciConfigurations.length > 0 ? 'chip chip-emerald' : 'chip chip-amber'}>
              <FileCog className="h-3 w-3" aria-hidden="true" />
              {quality.ciConfigurations.length > 0 ? 'CI configured' : 'no CI'}
            </span>
            <span className="chip">
              <Users className="h-3 w-3" aria-hidden="true" />
              {quality.testDirectories.length} test dirs
            </span>
          </div>

          {quality.oversizedFiles.length > 0 ? (
            <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-[0.14em] text-amber-300/80">Oversized files</p>
              <ul className="mt-1 space-y-0.5">
                {quality.oversizedFiles.slice(0, 4).map((file) => (
                  <li key={file.path} className="flex items-center justify-between gap-2 font-mono text-[10px] text-amber-100/70">
                    <span className="truncate">{file.path}</span>
                    <span className="shrink-0">{file.lineCount} ln</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.05] px-3 py-2.5 text-[11px] text-emerald-200/80">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              No oversized source files detected
            </p>
          )}

          <p className="font-mono text-[10px] text-slate-600">
            {formatBytes(report.repository.totalBytes)} sampled
            {report.repository.truncated ? ' · truncated at safety limit' : ''}
          </p>
        </div>
      </div>
    </section>
  );
}
