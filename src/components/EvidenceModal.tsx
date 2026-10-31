'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle, ChevronRight, FileCode2, Lightbulb, X } from 'lucide-react';

import { DIMENSION_LABELS, type Finding, type Severity } from '@/lib/types';

const SEVERITY_CHIP: Record<Severity, string> = {
  critical: 'chip severity-critical',
  high: 'chip severity-high',
  medium: 'chip severity-medium',
  low: 'chip severity-low',
  info: 'chip severity-info',
};

export interface EvidenceModalProps {
  finding: Finding | null;
  onClose: () => void;
}

export default function EvidenceModal({ finding, onClose }: EvidenceModalProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!finding) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKey);
    closeRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
    };
  }, [finding, onClose]);

  if (!finding) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-4 backdrop-blur-sm sm:items-center"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="evidence-title"
        aria-describedby="evidence-description"
        className="modal-in panel panel-accent w-full max-w-2xl max-h-[88dvh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={SEVERITY_CHIP[finding.severity]}>{finding.severity}</span>
              <span className="chip">{DIMENSION_LABELS[finding.dimension]}</span>
            </div>
            <h2 id="evidence-title" className="mt-2.5 text-lg font-semibold tracking-tight text-white">
              {finding.title}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="btn-ghost shrink-0 !px-2.5 !py-2"
            aria-label="Close evidence detail"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-6">
          <p id="evidence-description" className="text-sm leading-relaxed text-slate-300">
            {finding.description}
          </p>

          <section>
            <h3 className="eyebrow flex items-center gap-1.5">
              <FileCode2 className="h-3.5 w-3.5 text-cyber-cyan" aria-hidden="true" />
              Evidence
            </h3>
            {finding.evidence ? (
              <div className="mt-2.5 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2">
                  <code className="break-all font-mono text-[11px] text-cyan-100/90">
                    {finding.evidence.filePath}
                  </code>
                  {typeof finding.evidence.lineNumber === 'number' ? (
                    <>
                      <ChevronRight className="h-3 w-3 text-slate-600" aria-hidden="true" />
                      <span className="font-mono text-[11px] text-slate-400">
                        line {finding.evidence.lineNumber}
                      </span>
                    </>
                  ) : null}
                </div>
                {finding.evidence.snippet ? (
                  <pre className="evidence-pre">{finding.evidence.snippet}</pre>
                ) : null}
                {finding.evidence.note ? (
                  <p className="font-mono text-[11px] leading-relaxed text-slate-500">
                    {finding.evidence.note}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2.5 text-xs leading-relaxed text-amber-200/80">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                No direct file evidence was captured for this finding. It is inferred from aggregate
                repository signals.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-cyber-emerald/20 bg-cyber-emerald/[0.05] px-4 py-3.5">
            <h3 className="eyebrow flex items-center gap-1.5 !text-emerald-300/80">
              <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
              Recommended action
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-emerald-50/90">
              {finding.recommendation}
            </p>
          </section>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/[0.07] px-5 py-3.5 sm:px-6">
          <span className="font-mono text-[10px] text-slate-600">id · {finding.id}</span>
          <button type="button" onClick={onClose} className="btn-ghost">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
