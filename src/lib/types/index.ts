/**
 * REPOREAPER — shared domain types.
 *
 * This module is intentionally free of runtime dependencies so it can be
 * imported by both the server-side analyzer and client-side components
 * using `import type`.
 */

/* -------------------------------------------------------------------------- */
/* Pipeline                                                                   */
/* -------------------------------------------------------------------------- */

export const STAGE_ORDER = [
  'VALIDATING_URL',
  'INGESTING_REPO',
  'INSPECTING_STRUCTURE',
  'ANALYZING_DEPENDENCIES',
  'CHECKING_DOCUMENTATION',
  'EVALUATING_MAINTENANCE',
  'CALCULATING_SCORE',
  'GENERATING_AI_ASSESSMENT',
] as const;

export type StageId = (typeof STAGE_ORDER)[number];

export const STAGE_LABELS: Record<StageId, string> = {
  VALIDATING_URL: 'Validating URL',
  INGESTING_REPO: 'Ingesting Repository',
  INSPECTING_STRUCTURE: 'Inspecting Structure',
  ANALYZING_DEPENDENCIES: 'Analyzing Dependencies',
  CHECKING_DOCUMENTATION: 'Checking Documentation',
  EVALUATING_MAINTENANCE: 'Evaluating Maintenance',
  CALCULATING_SCORE: 'Calculating Revival Score',
  GENERATING_AI_ASSESSMENT: 'Generating AI Assessment',
};

export type StageStatus = 'pending' | 'in_progress' | 'complete' | 'error';

export interface StageEvent {
  stage: StageId;
  stageIndex: number;
  totalStages: number;
  status: StageStatus;
  message: string;
  timestamp: number;
}

export type AnalysisStreamEvent =
  | { event: 'stage'; data: StageEvent }
  | { event: 'complete'; data: RevivalAnalysisResponse }
  | { event: 'error'; data: { message: string; code: string } };

/* -------------------------------------------------------------------------- */
/* URL validation                                                             */
/* -------------------------------------------------------------------------- */

export interface RepoCoordinates {
  owner: string;
  repo: string;
  /** Canonical human URL, e.g. https://github.com/owner/repo */
  canonicalUrl: string;
  /** HTTPS clone URL passed as an argument vector to git. */
  cloneUrl: string;
}

export type ValidationErrorCode =
  | 'EMPTY'
  | 'TOO_LONG'
  | 'MALFORMED'
  | 'UNSAFE_CHARACTERS'
  | 'INVALID_PROTOCOL'
  | 'UNTRUSTED_HOST'
  | 'CREDENTIALS'
  | 'QUERY_OR_FRAGMENT'
  | 'INVALID_PATH'
  | 'INVALID_OWNER'
  | 'INVALID_REPO';

export type ValidationResult =
  | { ok: true; value: RepoCoordinates }
  | { ok: false; code: ValidationErrorCode; error: string };

/* -------------------------------------------------------------------------- */
/* Filesystem scanning                                                        */
/* -------------------------------------------------------------------------- */

export interface ScannedFile {
  /** POSIX-style path relative to the repository root. */
  relativePath: string;
  sizeBytes: number;
  extension: string;
  isText: boolean;
  /** Number of lines for text files that were sampled; null for binaries. */
  lineCount: number | null;
}

export interface FileScanResult {
  files: ScannedFile[];
  /** All directory paths (POSIX, relative) discovered during traversal. */
  directories: string[];
  totalBytes: number;
  truncated: boolean;
  fileCount: number;
}

/**
 * Read-only view over a scanned repository. Analyzers depend on this
 * interface rather than the filesystem, which makes them pure and testable
 * against in-memory fixtures.
 */
export interface RepoFs {
  files: ScannedFile[];
  directories: string[];
  readText(relativePath: string, maxBytes?: number): string | null;
  exists(relativePath: string): boolean;
  /** True when any file lives under `dir/` (matching is case-insensitive). */
  hasDirectory(dir: string): boolean;
}

/* -------------------------------------------------------------------------- */
/* Analyzer results                                                           */
/* -------------------------------------------------------------------------- */

export interface Evidence {
  filePath: string;
  lineNumber?: number;
  snippet?: string;
  note?: string;
}

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export const DIMENSION_KEYS = [
  'documentation',
  'dependencies',
  'maintenance',
  'testing',
  'quality',
] as const;

export type DimensionKey = (typeof DIMENSION_KEYS)[number];

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  documentation: 'Documentation Health',
  dependencies: 'Dependency Health',
  maintenance: 'Maintenance Activity',
  testing: 'Testing & CI Health',
  quality: 'Code Quality & Architecture',
};

export interface LanguageInfo {
  name: string;
  fileCount: number;
  percentage: number;
}

export interface FrameworkInfo {
  name: string;
  evidence: string;
}

export interface EcosystemInfo {
  languages: LanguageInfo[];
  primaryLanguage: string;
  frameworks: FrameworkInfo[];
  packageManager: string | null;
  manifests: string[];
  tooling: string[];
}

export interface ManifestInfo {
  path: string;
  ecosystem: string;
  dependencyCount: number;
  parsed: boolean;
}

export interface LockfileInfo {
  path: string;
  ecosystem: string;
}

export interface DependencyInfo {
  manifests: ManifestInfo[];
  lockfiles: LockfileInfo[];
  totalDependencies: number;
  declaredDependencies: string[];
  wildcardDependencies: string[];
  legacyBuildTools: string[];
  hasLockfile: boolean;
  missingLockfilesFor: string[];
}

export interface ReadmeInfo {
  exists: boolean;
  path: string | null;
  wordCount: number;
  charCount: number;
  hasDescription: boolean;
  snippet: string;
  sections: {
    installation: boolean;
    usage: boolean;
    configuration: boolean;
    contributing: boolean;
    license: boolean;
  };
}

export interface LicenseInfo {
  exists: boolean;
  path: string | null;
  type: string | null;
  isOpenSource: boolean;
}

export interface DocumentationInfo {
  readme: ReadmeInfo;
  license: LicenseInfo;
  contributing: boolean;
  codeOfConduct: boolean;
  changelog: boolean;
  securityPolicy: boolean;
  docsDirectory: boolean;
  envExample: boolean;
}

export interface GitMetadata {
  available: boolean;
  lastCommitDate: string | null;
  lastCommitAgeDays: number | null;
  commitCount: number | null;
  contributorCount: number | null;
  branch: string | null;
  shallow: boolean;
}

export interface MaintenanceInfo extends GitMetadata {
  todoCount: number;
  fixmeCount: number;
  hackCount: number;
  /** TODO/FIXME/HACK markers per 1,000 lines of source code. */
  todoDensity: number;
}

export interface OversizedFile {
  path: string;
  lineCount: number;
}

export interface QualityInfo {
  sourceFileCount: number;
  totalSourceLines: number;
  largestFile: OversizedFile | null;
  oversizedFiles: OversizedFile[];
  emptyFiles: string[];
  standardLayoutDirs: string[];
  formattingConfigs: string[];
  testDirectories: string[];
  ciConfigurations: string[];
  hasTestScript: boolean;
  testScriptNames: string[];
}

/* -------------------------------------------------------------------------- */
/* Scoring                                                                    */
/* -------------------------------------------------------------------------- */

export type HealthLabel = 'Healthy' | 'Needs Attention' | 'At Risk' | 'Critical';

export type SignalStatus = 'pass' | 'partial' | 'fail' | 'unknown';

export interface SignalResult {
  id: string;
  label: string;
  awarded: number;
  max: number;
  status: SignalStatus;
  detail: string;
  evidence?: Evidence;
}

export interface DimensionScore {
  key: DimensionKey;
  label: string;
  score: number;
  maxScore: number;
  percentage: number;
  status: HealthLabel;
  summary: string;
  signals: SignalResult[];
}

export interface HealthScore {
  total: number;
  maxTotal: number;
  label: HealthLabel;
  confidence: number;
  signalsEvaluated: number;
  signalsTotal: number;
  dimensions: DimensionScore[];
}

export interface Finding {
  id: string;
  dimension: DimensionKey;
  severity: Severity;
  title: string;
  description: string;
  recommendation: string;
  evidence?: Evidence;
}

/* -------------------------------------------------------------------------- */
/* Analysis payload                                                           */
/* -------------------------------------------------------------------------- */

export interface RepositorySummary {
  owner: string;
  repo: string;
  url: string;
  analyzedAt: string;
  fileCount: number;
  totalBytes: number;
  truncated: boolean;
}

export interface AnalysisPayload {
  repository: RepositorySummary;
  ecosystem: EcosystemInfo;
  dependencies: DependencyInfo;
  documentation: DocumentationInfo;
  maintenance: MaintenanceInfo;
  quality: QualityInfo;
}

/* -------------------------------------------------------------------------- */
/* AI revival report                                                          */
/* -------------------------------------------------------------------------- */

export type EffortLevel = 'low' | 'medium' | 'high';

export interface RoadmapAction {
  title: string;
  rationale: string;
  expectedBenefit: string;
  effort: EffortLevel;
  relatedFindings: string[];
}

export interface RevivalRoadmap {
  immediate: RoadmapAction[];
  shortTerm: RoadmapAction[];
  longTerm: RoadmapAction[];
}

/** The subset of the AI report that the language model is asked to produce. */
export interface RevivalReportContent {
  verdict: string;
  technicalAssessment: string;
  rootCauses: string[];
  roadmap: RevivalRoadmap;
  confidenceNote: string;
}

export interface AIRevivalReport extends RevivalReportContent {
  provider: string;
  model: string | null;
  generatedAt: string;
  degraded: boolean;
  degradationReason: string | null;
  durationMs: number;
}

export interface RevivalAnalysisResponse {
  id: string;
  repository: RepositorySummary;
  score: HealthScore;
  ecosystem: EcosystemInfo;
  dependencies: DependencyInfo;
  documentation: DocumentationInfo;
  maintenance: MaintenanceInfo;
  quality: QualityInfo;
  findings: Finding[];
  ai: AIRevivalReport;
  durationMs: number;
  generatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export function healthLabelFor(percentage: number): HealthLabel {
  if (percentage >= 80) return 'Healthy';
  if (percentage >= 60) return 'Needs Attention';
  if (percentage >= 40) return 'At Risk';
  return 'Critical';
}

export function severityRank(severity: Severity): number {
  switch (severity) {
    case 'critical':
      return 0;
    case 'high':
      return 1;
    case 'medium':
      return 2;
    case 'low':
      return 3;
    case 'info':
      return 4;
  }
}
