import type {
  AnalysisPayload,
  DimensionScore,
  EffortLevel,
  Finding,
  RevivalReportContent,
  RoadmapAction,
  Severity,
} from '@/lib/types';
import type { AIContext, AIProvider } from './provider';

/**
 * Deterministic fallback provider.
 *
 * This is not an error page: it synthesises a complete, evidence-grounded
 * revival report from the deterministic score and findings. It runs whenever
 * Ollama is unavailable, times out, or returns output that fails validation,
 * so an analysis always completes.
 */

const SEVERITY_EFFORT: Record<Severity, EffortLevel> = {
  critical: 'medium',
  high: 'medium',
  medium: 'low',
  low: 'low',
  info: 'low',
};

const DIMENSION_BENEFIT: Record<string, string> = {
  documentation:
    'Lowers the barrier to first contribution and makes the project legible to evaluators and users.',
  dependencies:
    'Makes builds reproducible and removes a common source of abandoned-project breakage.',
  maintenance:
    'Signals that the project is alive, which preserves contributor trust and downstream adoption.',
  testing:
    'Creates a safety net for refactoring and turns future changes into verifiable improvements.',
  quality:
    'Reduces review and onboarding cost, making sustained maintenance practical.',
};

const EVERGREEN_ACTIONS: Record<string, { title: string; rationale: string; expectedBenefit: string }> = {
  documentation: {
    title: 'Publish a maintenance status and quick-start section',
    rationale:
      'Documentation already scores well; a short maintenance-status note keeps expectations accurate as the project evolves.',
    expectedBenefit: 'Preserves documentation quality and sets clear expectations for new users.',
  },
  dependencies: {
    title: 'Schedule a dependency review cadence',
    rationale:
      'Dependency health is currently sound; a quarterly review prevents silent drift into unsupported versions.',
    expectedBenefit: 'Keeps builds reproducible and avoids emergency upgrades later.',
  },
  maintenance: {
    title: 'Adopt a lightweight release cadence',
    rationale:
      'Recent activity is healthy; a predictable release rhythm converts that activity into stable, consumable versions.',
    expectedBenefit: 'Turns maintenance effort into user-visible progress.',
  },
  testing: {
    title: 'Add regression tests around the busiest code paths',
    rationale:
      'Testing signals are strong; targeted regression coverage protects the newest behaviour from future changes.',
    expectedBenefit: 'Sustains confidence as the codebase grows.',
  },
  quality: {
    title: 'Document architectural boundaries',
    rationale:
      'Code quality is healthy; a short architecture note makes the existing structure easier to extend.',
    expectedBenefit: 'Lowers the cost of the next significant change.',
  },
};

function firstSentence(value: string, maxLength = 180): string {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  const stop = cleaned.search(/[.!?](\s|$)/);
  const sentence = stop === -1 ? cleaned : cleaned.slice(0, stop + 1);
  return sentence.length > maxLength ? `${sentence.slice(0, maxLength - 1)}…` : sentence;
}

function weakestDimensions(score: AIContext['score']): DimensionScore[] {
  return [...score.dimensions].sort((a, b) => a.percentage - b.percentage);
}

function strongestDimension(score: AIContext['score']): DimensionScore {
  return [...score.dimensions].sort((a, b) => b.percentage - a.percentage)[0] as DimensionScore;
}

function actionFromFinding(finding: Finding): RoadmapAction {
  return {
    title: finding.recommendation.length > 110
      ? `${firstSentence(finding.recommendation, 108)}`
      : finding.recommendation,
    rationale: firstSentence(finding.description, 320),
    expectedBenefit:
      DIMENSION_BENEFIT[finding.dimension] ?? 'Improves the repository health signals measured by REPOREAPER.',
    effort: SEVERITY_EFFORT[finding.severity],
    relatedFindings: [finding.id],
  };
}

function evergreenAction(dimension: string): RoadmapAction {
  const template = EVERGREEN_ACTIONS[dimension] ?? {
    title: 'Keep the health signals green',
    rationale: 'This dimension currently passes every check; a periodic review keeps it that way.',
    expectedBenefit: 'Prevents regression in an already-healthy area.',
  };
  return { ...template, effort: 'low', relatedFindings: [] };
}

function dedupe(actions: RoadmapAction[], max: number): RoadmapAction[] {
  const seen = new Set<string>();
  const unique: RoadmapAction[] = [];
  for (const action of actions) {
    const key = action.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(action);
    if (unique.length >= max) break;
  }
  return unique;
}

function buildRoadmap(context: AIContext): RevivalReportContent['roadmap'] {
  const { findings, score } = context;
  const immediate = findings.filter(
    (finding) => finding.severity === 'critical' || finding.severity === 'high',
  );
  const shortTerm = findings.filter((finding) => finding.severity === 'medium');
  const longTerm = findings.filter(
    (finding) => finding.severity === 'low' || finding.severity === 'info',
  );

  const weakest = weakestDimensions(score).map((dimension) => dimension.key);

  const immediateActions = dedupe(
    [
      ...immediate.map(actionFromFinding),
      ...shortTerm.slice(0, 1).map(actionFromFinding),
    ],
    4,
  );
  const shortTermActions = dedupe(
    [
      ...shortTerm.map(actionFromFinding),
      ...weakest.slice(0, 2).map((dimension) => evergreenAction(dimension)),
    ],
    4,
  );
  const longTermActions = dedupe(
    [
      ...longTerm.map(actionFromFinding),
      ...weakest.slice(-2).map((dimension) => evergreenAction(dimension)),
      evergreenAction('maintenance'),
    ],
    4,
  );

  const ensureMinimum = (actions: RoadmapAction[], dimension: string): RoadmapAction[] =>
    actions.length > 0 ? actions : [evergreenAction(dimension)];

  return {
    immediate: ensureMinimum(immediateActions, weakest[0] ?? 'documentation'),
    shortTerm: ensureMinimum(shortTermActions, weakest[1] ?? 'testing'),
    longTerm: ensureMinimum(longTermActions, weakest[2] ?? 'quality'),
  };
}

function buildRootCauses(context: AIContext): string[] {
  const { findings } = context;

  if (findings.length === 0) {
    return [
      'No deterministic defects were detected; the remaining risk is ordinary project ageing rather than a specific failure.',
    ];
  }

  const causes = findings
    .slice(0, 5)
    .map((finding) => `${finding.title}: ${firstSentence(finding.description, 200)}`);

  return causes.length > 0
    ? causes
    : ['The repository has insufficient verifiable signals to isolate a single root cause.'];
}

function buildTechnicalAssessment(context: AIContext): string {
  const { payload, score } = context;
  const weakest = weakestDimensions(score);
  const strongest = strongestDimension(score);

  const scoreLine =
    `${payload.repository.owner}/${payload.repository.repo} scores ${score.total}/${score.maxTotal} ` +
    `(${score.label}) with ${score.confidence}% confidence across ${score.signalsTotal} weighted signals.`;

  const stackLine =
    `The repository is primarily ${payload.ecosystem.primaryLanguage || 'unclassified'}` +
    `${payload.ecosystem.frameworks.length > 0 ? ` using ${payload.ecosystem.frameworks.map((framework) => framework.name).join(', ')}` : ''}` +
    `${payload.ecosystem.packageManager ? `, managed with ${payload.ecosystem.packageManager}` : ''}` +
    `, with ${payload.repository.fileCount} scanned files and ${payload.dependencies.totalDependencies} declared dependencies.`;

  const dimensionLine =
    `The strongest dimension is ${strongest.label} (${strongest.score}/${strongest.maxScore}); ` +
    `the weakest is ${weakest[0]?.label ?? 'unknown'} (${weakest[0]?.score ?? 0}/${weakest[0]?.maxScore ?? 20}). ` +
    weakest
      .slice(0, 3)
      .map((dimension) => `${dimension.key} ${dimension.percentage}%`)
      .join(', ') +
    ' form the primary drag on the total.';

  const evidenceBits: string[] = [];
  evidenceBits.push(
    payload.maintenance.lastCommitAgeDays === null
      ? 'Git history was unavailable, so activity was scored neutrally rather than punished.'
      : `The last commit was ${payload.maintenance.lastCommitAgeDays} days ago.`,
  );
  evidenceBits.push(
    payload.documentation.readme.exists
      ? `README coverage is ${payload.documentation.readme.wordCount} words with ${payload.documentation.license.type ?? 'no recognised'} licensing.`
      : 'No README was found, which limits both onboarding and external evaluation.',
  );
  evidenceBits.push(
    payload.quality.testDirectories.length > 0
      ? `Tests exist under ${payload.quality.testDirectories.slice(0, 2).join(', ')}${payload.quality.ciConfigurations.length > 0 ? ' and CI is configured' : ' but CI is not configured'}.`
      : 'No test suite was detected, so changes cannot be validated automatically.',
  );

  return [scoreLine, stackLine, dimensionLine, evidenceBits.join(' ')].join('\n\n');
}

function verdictFor(score: AIContext['score'], repo: string): string {
  switch (score.label) {
    case 'Healthy':
      return `${repo} is Healthy at ${score.total}/100; the work is preservation, not rescue.`;
    case 'Needs Attention':
      return `${repo} is viable but drifting at ${score.total}/100; a focused repair sprint would return it to Healthy.`;
    case 'At Risk':
      return `${repo} is At Risk at ${score.total}/100; core maintenance signals are degrading and need an owner.`;
    case 'Critical':
      return `${repo} is Critical at ${score.total}/100; it needs an immediate, scoped revival effort before further decay.`;
  }
}

export class FallbackDeterministicProvider implements AIProvider {
  readonly name = 'deterministic-fallback';
  readonly model = null;

  async checkHealth(): Promise<boolean> {
    return true;
  }

  async generateRevivalReport(context: AIContext): Promise<RevivalReportContent> {
    return buildFallbackReport(context.payload, context.score, context.findings);
  }
}

/**
 * Builds the complete deterministic report. Exported for direct testing and
 * for callers that already know the primary provider is unavailable.
 */
export function buildFallbackReport(
  payload: AnalysisPayload,
  score: AIContext['score'],
  findings: Finding[],
): RevivalReportContent {
  const context: AIContext = { payload, score, findings };

  return {
    verdict: verdictFor(score, `${payload.repository.owner}/${payload.repository.repo}`),
    technicalAssessment: buildTechnicalAssessment(context),
    rootCauses: buildRootCauses(context),
    roadmap: buildRoadmap(context),
    confidenceNote:
      score.confidence >= 90
        ? `Confidence is ${score.confidence}%: almost every signal was verifiable from repository contents.`
        : score.confidence >= 60
          ? `Confidence is ${score.confidence}%: ${score.signalsTotal - score.signalsEvaluated} signals could not be verified and were excluded from the score.`
          : `Confidence is only ${score.confidence}%: the repository exposes too little structure for a high-certainty assessment.`,
  };
}

export { buildFallbackReport as createFallbackReport };
