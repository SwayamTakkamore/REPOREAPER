import type { DimensionScore, Finding, RevivalAnalysisResponse, RoadmapAction } from '@/lib/types';

/**
 * Markdown export.
 *
 * Pure function over an already-computed report: no filesystem or network
 * access, so exports are deterministic for a given analysis.
 */

const SEVERITY_LABELS: Record<Finding['severity'], string> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
  info: 'INFO',
};

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
}

function fenceFor(content: string): string {
  return content.includes('```') ? '````' : '```';
}

function renderDimensionTable(dimensions: DimensionScore[]): string {
  const header = '| Dimension | Score | Status | Signals |\n| --- | ---: | --- | --- |';
  const rows = dimensions.map((dimension) => {
    const passed = dimension.signals.filter((signal) => signal.status === 'pass').length;
    return `| ${escapeCell(dimension.label)} | ${dimension.score}/${dimension.maxScore} | ${dimension.status} | ${passed}/${dimension.signals.length} passing |`;
  });
  return [header, ...rows].join('\n');
}

function renderSignals(dimensions: DimensionScore[]): string {
  const blocks = dimensions.map((dimension) => {
    const lines = dimension.signals.map((signal) => {
      const icon =
        signal.status === 'pass' ? '✓' : signal.status === 'partial' ? '◐' : signal.status === 'unknown' ? '?' : '✗';
      return `- ${icon} **${signal.label}** — ${signal.awarded}/${signal.max} · ${signal.detail}`;
    });
    return `### ${dimension.label} — ${dimension.score}/${dimension.maxScore}\n\n${lines.join('\n')}`;
  });
  return blocks.join('\n\n');
}

function renderFindings(findings: Finding[]): string {
  if (findings.length === 0) {
    return 'No deterministic defects were detected. Preserve the current practices and keep dependencies and tests current.';
  }

  return findings
    .map((finding, index) => {
      const lines: string[] = [
        `### ${index + 1}. [${SEVERITY_LABELS[finding.severity]}] ${finding.title}`,
        '',
        finding.description,
        '',
        `**Recommendation:** ${finding.recommendation}`,
      ];

      if (finding.evidence) {
        const location = `${finding.evidence.filePath}${finding.evidence.lineNumber ? `:${finding.evidence.lineNumber}` : ''}`;
        lines.push('', `**Evidence:** \`${location}\``);
        if (finding.evidence.note) lines.push('', `> ${finding.evidence.note}`);
        if (finding.evidence.snippet) {
          const fence = fenceFor(finding.evidence.snippet);
          lines.push('', `${fence}`, finding.evidence.snippet.trimEnd(), fence);
        }
      }

      return lines.join('\n');
    })
    .join('\n\n');
}

function renderAction(action: RoadmapAction): string {
  const related =
    action.relatedFindings.length > 0 ? ` _(${action.relatedFindings.join(', ')})_` : '';
  return `- **${action.title}**${related}\n  - Why: ${action.rationale}\n  - Expected benefit: ${action.expectedBenefit}\n  - Effort: ${action.effort}`;
}

function renderRoadmap(report: RevivalAnalysisResponse): string {
  const { roadmap } = report.ai;
  return [
    `### Immediate — 0–7 days`,
    '',
    roadmap.immediate.map(renderAction).join('\n'),
    '',
    `### Short term — 1–4 weeks`,
    '',
    roadmap.shortTerm.map(renderAction).join('\n'),
    '',
    `### Long term — 1–6 months`,
    '',
    roadmap.longTerm.map(renderAction).join('\n'),
  ].join('\n');
}

export function buildMarkdownReport(report: RevivalAnalysisResponse): string {
  const { repository, score, ai } = report;
  const scoreBar = '█'.repeat(Math.round(score.total / 5)).padEnd(20, '░');
  const generated = report.generatedAt.replace('T', ' ').replace(/\.\d+Z$/, ' UTC');

  const sections: string[] = [
    `# REPOREAPER — Revival Assessment`,
    '',
    `> **${repository.owner}/${repository.repo}** · ${score.total}/100 · **${score.label}** · ${score.confidence}% confidence`,
    '',
    `\`${scoreBar}\` ${score.total}/100`,
    '',
    '## Repository',
    '',
    `| Field | Value |`,
    `| --- | --- |`,
    `| Repository | [${repository.owner}/${repository.repo}](${repository.url}) |`,
    `| Analyzed | ${generated} |`,
    `| Files scanned | ${repository.fileCount}${repository.truncated ? ' (truncated at safety limit)' : ''} |`,
    `| Snapshot size | ${(repository.totalBytes / 1024).toFixed(1)} KB |`,
    `| Primary language | ${report.ecosystem.primaryLanguage} |`,
    `| Package manager | ${report.ecosystem.packageManager ?? 'unknown'} |`,
    `| Frameworks | ${report.ecosystem.frameworks.map((framework) => framework.name).join(', ') || 'none detected'} |`,
    `| License | ${report.documentation.license.type ?? 'none detected'} |`,
    `| Last commit | ${report.maintenance.lastCommitAgeDays === null ? 'unavailable' : `${report.maintenance.lastCommitAgeDays} days ago`} |`,
    `| Findings | ${report.findings.length} |`,
    '',
    '## Revival score',
    '',
    renderDimensionTable(score.dimensions),
    '',
    `**Confidence:** ${score.confidence}% — ${score.signalsEvaluated} of ${score.signalsTotal} signals were verifiable.`,
    '',
    '## Signal detail',
    '',
    renderSignals(score.dimensions),
    '',
    '## Findings',
    '',
    renderFindings(report.findings),
    '',
    '## Technical assessment',
    '',
    ai.verdict,
    '',
    ai.technicalAssessment,
    '',
    '### Root causes',
    '',
    ai.rootCauses.map((cause) => `- ${cause}`).join('\n'),
    '',
    `_${ai.confidenceNote}_`,
    '',
    '## Revival roadmap',
    '',
    renderRoadmap(report),
    '',
    '## Methodology',
    '',
    'REPOREAPER performs **static analysis only**: the repository is cloned shallowly into an ephemeral sandbox, every file read is bounded and sandboxed, and no repository scripts, installers, or tests are executed. Scores come from a deterministic 100-point model (five dimensions × 20 points). The AI assessment is generated by',
    ai.degraded
      ? ` the deterministic fallback engine because the configured model was unavailable (${ai.degradationReason ?? 'unknown reason'}).`
      : ` \`${ai.provider}\`${ai.model ? ` (${ai.model})` : ''}.`,
    '',
    `---`,
    '',
    `Generated by REPOREAPER v1.0.0 · analysis id \`${report.id}\` · ${report.durationMs} ms`,
    '',
  ];

  return `${sections.join('\n')}\n`;
}

export function exportFileName(report: RevivalAnalysisResponse, extension: 'md' | 'json'): string {
  const safeOwner = report.repository.owner.replace(/[^A-Za-z0-9._-]/g, '-');
  const safeRepo = report.repository.repo.replace(/[^A-Za-z0-9._-]/g, '-');
  return `reporeaper-${safeOwner}-${safeRepo}.${extension}`;
}
