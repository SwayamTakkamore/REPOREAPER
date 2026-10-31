import {
  DIMENSION_LABELS,
  healthLabelFor,
  severityRank,
  type AnalysisPayload,
  type DimensionKey,
  type DimensionScore,
  type Evidence,
  type Finding,
  type HealthLabel,
  type HealthScore,
  type Severity,
  type SignalResult,
  type SignalStatus,
} from '@/lib/types';

/**
 * Deterministic 100-point revival scoring engine.
 *
 * Every point is attributable to a named, inspectable signal. The language
 * model never influences these numbers: it receives the score as an input.
 *
 * Dimensions (20 points each): documentation, dependencies, maintenance,
 * testing, quality. Signals with unavailable metadata are marked `unknown`,
 * award a neutral value where appropriate, and reduce confidence instead of
 * being silently treated as failures.
 */

const MAX_PER_DIMENSION = 20;

interface SignalInput {
  id: string;
  label: string;
  max: number;
  awarded: number;
  detail: string;
  status?: SignalStatus;
  evidence?: Evidence;
}

function statusFor(awarded: number, max: number, explicit?: SignalStatus): SignalStatus {
  if (explicit) return explicit;
  if (awarded >= max) return 'pass';
  if (awarded <= 0) return 'fail';
  return 'partial';
}

function buildSignal(input: SignalInput): SignalResult {
  const status = statusFor(input.awarded, input.max, input.status);
  return {
    id: input.id,
    label: input.label,
    max: input.max,
    awarded: input.awarded,
    status,
    detail: input.detail,
    ...(input.evidence ? { evidence: input.evidence } : {}),
  };
}

function summarise(key: DimensionKey, signals: SignalResult[], score: number): string {
  const failed = signals.filter((signal) => signal.status === 'fail');
  const unknown = signals.filter((signal) => signal.status === 'unknown');

  if (score >= 16) {
    return `${DIMENSION_LABELS[key]} is strong (${score}/20): core signals are present and verifiable.`;
  }

  const reasons: string[] = [];
  if (failed.length > 0) {
    reasons.push(`missing ${failed.map((signal) => signal.label.toLowerCase()).join(', ')}`);
  }
  if (unknown.length > 0) {
    reasons.push(`${unknown.length} signal${unknown.length === 1 ? '' : 's'} could not be verified`);
  }

  return `${DIMENSION_LABELS[key]} scores ${score}/20${reasons.length > 0 ? ` — ${reasons.join('; ')}` : ''}.`;
}

function dimension(
  key: DimensionKey,
  signals: SignalResult[],
): DimensionScore {
  const score = signals.reduce((sum, signal) => sum + signal.awarded, 0);
  const maxScore = signals.reduce((sum, signal) => sum + signal.max, 0);
  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  return {
    key,
    label: DIMENSION_LABELS[key],
    score,
    maxScore,
    percentage,
    status: healthLabelFor(percentage),
    summary: summarise(key, signals, score),
    signals,
  };
}

function scoreDocumentation(payload: AnalysisPayload): DimensionScore {
  const { readme, license, contributing, codeOfConduct } = payload.documentation;
  const readmeEvidence: Evidence | undefined = readme.path
    ? {
        filePath: readme.path,
        lineNumber: 1,
        snippet: readme.snippet.slice(0, 240),
        note: `${readme.wordCount} words`,
      }
    : undefined;

  const signals: SignalResult[] = [
    buildSignal({
      id: 'readme_exists',
      label: 'README present',
      max: 6,
      awarded: readme.exists ? 6 : 0,
      detail: readme.exists
        ? `Found ${readme.path}.`
        : 'No README file was found at the repository root.',
      evidence: readmeEvidence,
    }),
    buildSignal({
      id: 'readme_description',
      label: 'Project description',
      max: 2,
      awarded: readme.hasDescription ? 2 : 0,
      detail: readme.hasDescription
        ? 'README opens with a descriptive paragraph.'
        : readme.exists
          ? 'README does not contain a description of at least 50 characters.'
          : 'No README to describe the project.',
      evidence: readmeEvidence,
    }),
    buildSignal({
      id: 'readme_installation',
      label: 'Installation instructions',
      max: 3,
      awarded: readme.sections.installation ? 3 : 0,
      detail: readme.sections.installation
        ? 'README documents installation or setup.'
        : 'README has no installation or setup section.',
      evidence: readmeEvidence,
    }),
    buildSignal({
      id: 'readme_usage',
      label: 'Usage instructions',
      max: 3,
      awarded: readme.sections.usage ? 3 : 0,
      detail: readme.sections.usage
        ? 'README documents usage or examples.'
        : 'README has no usage or example section.',
      evidence: readmeEvidence,
    }),
    buildSignal({
      id: 'license',
      label: 'Open-source license',
      max: 4,
      awarded: license.isOpenSource ? 4 : license.exists ? 2 : 0,
      detail: license.isOpenSource
        ? `Detected ${license.type} license at ${license.path}.`
        : license.exists
          ? `A license file exists at ${license.path} but its type could not be recognised (${license.type ?? 'unknown'}).`
          : 'No LICENSE file was detected, so the legal terms of reuse are undefined.',
      evidence: license.path
        ? { filePath: license.path, lineNumber: 1, note: license.type ?? 'unrecognised license' }
        : undefined,
    }),
    buildSignal({
      id: 'community_files',
      label: 'Contribution guidelines',
      max: 2,
      awarded: contributing || codeOfConduct ? 2 : 0,
      detail:
        contributing || codeOfConduct
          ? `Community files present: ${[contributing ? 'CONTRIBUTING' : null, codeOfConduct ? 'CODE_OF_CONDUCT' : null].filter(Boolean).join(', ')}.`
          : 'No CONTRIBUTING or CODE_OF_CONDUCT file was found.',
    }),
  ];

  return dimension('documentation', signals);
}

function scoreDependencies(payload: AnalysisPayload): DimensionScore {
  const {
    manifests,
    lockfiles,
    wildcardDependencies,
    totalDependencies,
    legacyBuildTools,
    hasLockfile,
    missingLockfilesFor,
  } = payload.dependencies;

  const hasManifest = manifests.length > 0;
  const primaryManifest = manifests[0]?.path;
  const manifestEvidence: Evidence | undefined = primaryManifest
    ? { filePath: primaryManifest, lineNumber: 1, note: 'dependency manifest' }
    : undefined;

  const lockfileUnknown = !hasManifest;
  const wildcardRatio =
    totalDependencies > 0 ? wildcardDependencies.length / totalDependencies : 0;

  let constraintAward = 0;
  let constraintStatus: SignalStatus | undefined;
  let constraintDetail: string;
  if (totalDependencies === 0) {
    constraintStatus = 'unknown';
    constraintDetail = hasManifest
      ? 'No dependencies are declared, so version constraints cannot be evaluated.'
      : 'No manifest was found, so dependency constraints cannot be evaluated.';
  } else if (wildcardDependencies.length === 0) {
    constraintAward = 4;
    constraintDetail = `All ${totalDependencies} declared dependencies use bounded version constraints.`;
  } else if (wildcardRatio < 0.25) {
    constraintAward = 2;
    constraintDetail = `${wildcardDependencies.length} of ${totalDependencies} dependencies use unbounded ranges (e.g. ${wildcardDependencies.slice(0, 3).join(', ')}).`;
  } else {
    constraintAward = 0;
    constraintDetail = `${wildcardDependencies.length} of ${totalDependencies} dependencies use unbounded ranges (e.g. ${wildcardDependencies.slice(0, 3).join(', ')}).`;
  }

  const lockfileDetail = !hasManifest
    ? 'No manifest exists, so no lockfile is expected.'
    : hasLockfile
      ? `Lockfile detected: ${lockfiles.map((lockfile) => lockfile.path).join(', ')}.`
      : missingLockfilesFor.length > 0
        ? `No lockfile found for ${missingLockfilesFor.join(', ')}; builds are not reproducible.`
        : 'The detected ecosystem resolves dependencies without a conventional lockfile.';

  const signals: SignalResult[] = [
    buildSignal({
      id: 'manifest_present',
      label: 'Dependency manifest',
      max: 6,
      awarded: hasManifest ? 6 : 0,
      detail: hasManifest
        ? `Found ${manifests.map((manifest) => manifest.path).join(', ')}.`
        : 'No recognised dependency manifest was found (package.json, requirements.txt, Cargo.toml, go.mod, ...).',
      evidence: manifestEvidence,
    }),
    buildSignal({
      id: 'lockfile_present',
      label: 'Reproducible lockfile',
      max: 6,
      awarded: lockfileUnknown ? 0 : hasLockfile ? 6 : 0,
      status: lockfileUnknown ? 'unknown' : undefined,
      detail: lockfileDetail,
      evidence: primaryManifest ? { filePath: primaryManifest, lineNumber: 1 } : undefined,
    }),
    buildSignal({
      id: 'version_constraints',
      label: 'Bounded version ranges',
      max: 4,
      awarded: constraintAward,
      status: constraintStatus,
      detail: constraintDetail,
      evidence: primaryManifest ? { filePath: primaryManifest, lineNumber: 1 } : undefined,
    }),
    buildSignal({
      id: 'no_legacy_tools',
      label: 'No legacy build tooling',
      max: 4,
      awarded: legacyBuildTools.length === 0 ? 4 : 0,
      detail:
        legacyBuildTools.length === 0
          ? 'No Bower, Grunt, or Gulp build tooling was detected.'
          : `Legacy build tooling detected: ${legacyBuildTools.join(', ')}.`,
    }),
  ];

  return dimension('dependencies', signals);
}

function maintenanceAward(ageDays: number | null): { awarded: number; detail: string } {
  if (ageDays === null) {
    return {
      awarded: 10,
      detail:
        'Git history is unavailable (shallow or missing metadata), so activity is treated as neutral rather than failed.',
    };
  }
  if (ageDays < 90) return { awarded: 20, detail: `Last commit was ${ageDays} days ago.` };
  if (ageDays <= 365) return { awarded: 14, detail: `Last commit was ${ageDays} days ago.` };
  if (ageDays <= 730) return { awarded: 8, detail: `Last commit was ${Math.round(ageDays / 30)} months ago.` };
  if (ageDays <= 1460) return { awarded: 3, detail: `Last commit was ${Math.round(ageDays / 365)} years ago.` };
  return { awarded: 0, detail: `Last commit was over ${Math.round(ageDays / 365)} years ago.` };
}

function scoreMaintenance(payload: AnalysisPayload): DimensionScore {
  const { maintenance } = payload;
  const { awarded, detail } = maintenanceAward(maintenance.lastCommitAgeDays);

  const signals: SignalResult[] = [
    buildSignal({
      id: 'commit_recency',
      label: 'Commit recency',
      max: 20,
      awarded,
      status: maintenance.available ? undefined : 'unknown',
      detail: maintenance.available
        ? `${detail} ${maintenance.commitCount !== null ? `Commit count visible to shallow clone: ${maintenance.commitCount}.` : ''}`.trim()
        : detail,
    }),
  ];

  return dimension('maintenance', signals);
}

function scoreTesting(payload: AnalysisPayload): DimensionScore {
  const { quality, dependencies } = payload;
  const hasManifest = dependencies.manifests.length > 0;
  const hasTests = quality.testDirectories.length > 0;
  const testScriptUnknown = !hasManifest;

  const signals: SignalResult[] = [
    buildSignal({
      id: 'test_directory',
      label: 'Test suite present',
      max: 8,
      awarded: hasTests ? 8 : 0,
      detail: hasTests
        ? `Test locations detected: ${quality.testDirectories.slice(0, 3).join(', ')}.`
        : 'No test directory or test file was detected.',
    }),
    buildSignal({
      id: 'test_script',
      label: 'Test runner configured',
      max: 6,
      awarded: testScriptUnknown ? 0 : quality.hasTestScript ? 6 : 0,
      status: testScriptUnknown ? 'unknown' : undefined,
      detail: quality.hasTestScript
        ? `Test runner configured: ${quality.testScriptNames.join(', ')}.`
        : testScriptUnknown
          ? 'No manifest exists, so a configured test runner cannot be verified.'
          : 'No test command was found in the project manifest or runner configuration.',
    }),
    buildSignal({
      id: 'ci_config',
      label: 'Continuous integration',
      max: 6,
      awarded: quality.ciConfigurations.length > 0 ? 6 : 0,
      detail:
        quality.ciConfigurations.length > 0
          ? `CI configuration detected: ${quality.ciConfigurations.slice(0, 3).join(', ')}.`
          : 'No continuous integration configuration was found.',
      evidence:
        quality.ciConfigurations[0] !== undefined
          ? { filePath: quality.ciConfigurations[0], lineNumber: 1 }
          : undefined,
    }),
  ];

  return dimension('testing', signals);
}

function scoreQuality(payload: AnalysisPayload): DimensionScore {
  const { quality } = payload;
  const hasSource = quality.sourceFileCount > 0;

  const layoutAward = !hasSource ? 0 : quality.standardLayoutDirs.length > 0 ? 6 : 0;
  const sizeAward = !hasSource ? 0 : quality.oversizedFiles.length === 0 ? 5 : 0;

  let debtAward = 0;
  let debtStatus: SignalStatus | undefined;
  let debtDetail: string;
  if (quality.totalSourceLines === 0) {
    debtStatus = 'unknown';
    debtDetail = 'No source lines were readable, so technical-debt density cannot be calculated.';
  } else if (payload.maintenance.todoDensity < 15) {
    debtAward = 5;
    debtDetail = `${payload.maintenance.todoDensity} TODO/FIXME markers per 1,000 lines (${payload.maintenance.todoCount + payload.maintenance.fixmeCount + payload.maintenance.hackCount} total).`;
  } else if (payload.maintenance.todoDensity < 30) {
    debtAward = 2;
    debtDetail = `${payload.maintenance.todoDensity} TODO/FIXME markers per 1,000 lines indicates growing debt.`;
  } else {
    debtDetail = `${payload.maintenance.todoDensity} TODO/FIXME markers per 1,000 lines indicates heavy outstanding debt.`;
  }

  const signals: SignalResult[] = [
    buildSignal({
      id: 'standard_layout',
      label: 'Organised source layout',
      max: 6,
      awarded: layoutAward,
      status: hasSource ? undefined : 'unknown',
      detail: !hasSource
        ? 'No recognised source files were found, so layout cannot be evaluated.'
        : quality.standardLayoutDirs.length > 0
          ? `Standard source directories: ${quality.standardLayoutDirs.join(', ')}.`
          : 'Source files are not organised under a conventional root (src/, lib/, pkg/, cmd/).',
    }),
    buildSignal({
      id: 'file_size',
      label: 'No oversized source files',
      max: 5,
      awarded: sizeAward,
      status: hasSource ? undefined : 'unknown',
      detail: !hasSource
        ? 'No source files were found to measure.'
        : quality.oversizedFiles.length === 0
          ? `No source file exceeds 2,000 lines (${quality.sourceFileCount} files, ${quality.totalSourceLines.toLocaleString('en-US')} lines).`
          : `${quality.oversizedFiles.length} source file(s) exceed 2,000 lines; the largest is ${quality.oversizedFiles[0]?.path} at ${quality.oversizedFiles[0]?.lineCount} lines.`,
      evidence: quality.oversizedFiles[0]
        ? {
            filePath: quality.oversizedFiles[0].path,
            lineNumber: 1,
            note: `${quality.oversizedFiles[0].lineCount} lines`,
          }
        : undefined,
    }),
    buildSignal({
      id: 'todo_density',
      label: 'Low technical-debt density',
      max: 5,
      awarded: debtAward,
      status: debtStatus,
      detail: debtDetail,
    }),
    buildSignal({
      id: 'formatting',
      label: 'Formatting or lint configuration',
      max: 4,
      awarded: quality.formattingConfigs.length > 0 ? 4 : 0,
      detail:
        quality.formattingConfigs.length > 0
          ? `Formatting configuration detected: ${quality.formattingConfigs.slice(0, 4).join(', ')}.`
          : 'No formatter or linter configuration was found.',
      evidence: quality.formattingConfigs[0]
        ? { filePath: quality.formattingConfigs[0], lineNumber: 1 }
        : undefined,
    }),
  ];

  return dimension('quality', signals);
}

export function computeScore(payload: AnalysisPayload): HealthScore {
  const dimensions = [
    scoreDocumentation(payload),
    scoreDependencies(payload),
    scoreMaintenance(payload),
    scoreTesting(payload),
    scoreQuality(payload),
  ];

  const total = dimensions.reduce((sum, dimensionScore) => sum + dimensionScore.score, 0);
  const maxTotal = dimensions.reduce((sum, dimensionScore) => sum + dimensionScore.maxScore, 0);

  const signals = dimensions.flatMap((dimensionScore) => dimensionScore.signals);
  const signalsTotal = signals.length;
  const signalsEvaluated = signals.filter((signal) => signal.status !== 'unknown').length;
  const confidence = signalsTotal > 0 ? Math.round((signalsEvaluated / signalsTotal) * 100) : 0;

  return {
    total,
    maxTotal,
    label: healthLabelFor(Math.round((total / Math.max(maxTotal, 1)) * 100)),
    confidence,
    signalsEvaluated,
    signalsTotal,
    dimensions,
  };
}

/* -------------------------------------------------------------------------- */
/* Findings                                                                   */
/* -------------------------------------------------------------------------- */

interface FindingTemplate {
  severity: Severity;
  title: string;
  recommendation: string;
}

const FINDING_TEMPLATES: Record<string, FindingTemplate> = {
  readme_exists: {
    severity: 'high',
    title: 'No README found',
    recommendation:
      'Add a README.md that explains what the project does, why it exists, and how to run it.',
  },
  readme_description: {
    severity: 'medium',
    title: 'README lacks a project description',
    recommendation:
      'Open the README with a two or three sentence summary of the problem the project solves.',
  },
  readme_installation: {
    severity: 'medium',
    title: 'Installation steps are undocumented',
    recommendation:
      'Document prerequisites and exact install commands in an Installation section.',
  },
  readme_usage: {
    severity: 'medium',
    title: 'Usage is undocumented',
    recommendation:
      'Add a minimal usage example that a newcomer can copy, paste, and run.',
  },
  license: {
    severity: 'high',
    title: 'No open-source license detected',
    recommendation:
      'Add an OSI-approved LICENSE file (MIT or Apache-2.0 are common) so others may legally reuse the code.',
  },
  community_files: {
    severity: 'low',
    title: 'No contribution guidelines',
    recommendation:
      'Add CONTRIBUTING.md and CODE_OF_CONDUCT.md to make it easy — and safe — for others to contribute.',
  },
  manifest_present: {
    severity: 'high',
    title: 'No dependency manifest found',
    recommendation:
      'Commit a manifest (package.json, requirements.txt, Cargo.toml, go.mod, ...) that declares dependencies explicitly.',
  },
  lockfile_present: {
    severity: 'medium',
    title: 'Dependency lockfile missing',
    recommendation:
      'Commit the lockfile generated by your package manager (package-lock.json, Cargo.lock, poetry.lock, ...) to make builds reproducible.',
  },
  version_constraints: {
    severity: 'medium',
    title: 'Unbounded dependency ranges',
    recommendation:
      'Pin or bound dependency versions (^ or ~ ranges, exact versions) instead of wildcards or latest.',
  },
  no_legacy_tools: {
    severity: 'low',
    title: 'Legacy build tooling detected',
    recommendation:
      'Migrate Bower, Grunt, or Gulp pipelines to the ecosystem-native tooling so contributors can build reliably.',
  },
  commit_recency: {
    severity: 'high',
    title: 'Repository appears inactive',
    recommendation:
      'Triage open work, publish a maintenance status, and make a small, visible commit to re-establish momentum.',
  },
  test_directory: {
    severity: 'high',
    title: 'No automated tests detected',
    recommendation:
      'Add a test directory with at least one smoke test covering the primary code path, then wire it into CI.',
  },
  test_script: {
    severity: 'medium',
    title: 'No test command configured',
    recommendation:
      'Add a test script to the manifest (for example "test": "vitest run") so contributors can run the suite with one command.',
  },
  ci_config: {
    severity: 'medium',
    title: 'No continuous integration configured',
    recommendation:
      'Add a CI workflow that installs dependencies, runs tests, and checks types on every pull request.',
  },
  standard_layout: {
    severity: 'low',
    title: 'Unconventional source layout',
    recommendation:
      'Move implementation files under a conventional root such as src/ or lib/ so newcomers can navigate the codebase.',
  },
  file_size: {
    severity: 'medium',
    title: 'Oversized source file detected',
    recommendation:
      'Split the largest modules into focused units; files above 2,000 lines are hard to review and test.',
  },
  todo_density: {
    severity: 'low',
    title: 'High technical-debt marker density',
    recommendation:
      'Convert TODO/FIXME comments into tracked issues and resolve or remove the oldest ones.',
  },
  formatting: {
    severity: 'low',
    title: 'No formatter or linter configuration',
    recommendation:
      'Adopt Prettier, ESLint, Ruff, or an equivalent and commit the configuration so style is enforced automatically.',
  },
};

function severityForSignal(signal: SignalResult, payload: AnalysisPayload): Severity {
  if (signal.id === 'commit_recency') {
    const age = payload.maintenance.lastCommitAgeDays;
    if (age === null) return 'info';
    if (age > 1460) return 'critical';
    if (age > 730) return 'high';
    if (age > 365) return 'medium';
    return 'low';
  }
  return FINDING_TEMPLATES[signal.id]?.severity ?? 'medium';
}

function describeSignal(signal: SignalResult): string {
  return `${signal.detail} Signal awarded ${signal.awarded}/${signal.max} points.`;
}

export function buildFindings(payload: AnalysisPayload, score: HealthScore): Finding[] {
  const findings: Finding[] = [];

  for (const dimensionScore of score.dimensions) {
    for (const signal of dimensionScore.signals) {
      const template = FINDING_TEMPLATES[signal.id];
      if (!template) continue;

      const shouldReport =
        signal.status === 'fail' ||
        signal.status === 'partial' ||
        (signal.status === 'unknown' && signal.id === 'commit_recency');

      if (!shouldReport) continue;

      findings.push({
        id: `finding-${signal.id}`,
        dimension: dimensionScore.key,
        severity: severityForSignal(signal, payload),
        title: signal.status === 'unknown' ? 'Maintenance history unavailable' : template.title,
        description:
          signal.status === 'unknown'
            ? `${signal.detail} Treat this as an unknown, not a confirmed defect.`
            : describeSignal(signal),
        recommendation: template.recommendation,
        ...(signal.evidence ? { evidence: signal.evidence } : {}),
      });
    }
  }

  return findings.sort((a, b) => {
    const bySeverity = severityRank(a.severity) - severityRank(b.severity);
    if (bySeverity !== 0) return bySeverity;
    return a.id.localeCompare(b.id);
  });
}

export function scoreRepository(payload: AnalysisPayload): {
  score: HealthScore;
  findings: Finding[];
} {
  const score = computeScore(payload);
  return { score, findings: buildFindings(payload, score) };
}

export const SCORING_MAX_PER_DIMENSION = MAX_PER_DIMENSION;
export type { HealthLabel };
