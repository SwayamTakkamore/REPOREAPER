import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { generateRevivalReport } from '@/lib/ai';
import { scoreRepository } from '@/lib/scoring/scoringEngine';
import {
  STAGE_LABELS,
  STAGE_ORDER,
  type AnalysisPayload,
  type RepoCoordinates,
  type RevivalAnalysisResponse,
  type StageEvent,
  type StageId,
  type StageStatus,
} from '@/lib/types';

import { analyzeDependencies } from './dependencyAnalyzer';
import { analyzeDocumentation } from './docAnalyzer';
import { analyzeEcosystem } from './ecosystemDetector';
import { createRepoFs, scanRepository, type ScanOptions } from './fileScanner';
import { analyzeMaintenance, readGitMetadata } from './maintenanceAnalyzer';
import { analyzeQuality } from './qualityAnalyzer';
import {
  cleanupStaleScans,
  ingestRepository,
  IngestionError,
  type IngestionOptions,
} from './repoIngestion';
import { validateRepoUrl } from './urlValidator';

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export class AnalysisError extends Error {
  readonly code: string;
  readonly stage: StageId | null;

  constructor(code: string, message: string, stage: StageId | null = null) {
    super(message);
    this.name = 'AnalysisError';
    this.code = code;
    this.stage = stage;
  }
}

function toAnalysisError(error: unknown, stage: StageId): AnalysisError {
  if (error instanceof AnalysisError) return error;
  if (error instanceof IngestionError) {
    return new AnalysisError(error.code, error.message, stage);
  }
  const message = error instanceof Error ? error.message : 'Unexpected analysis failure.';
  return new AnalysisError('ANALYSIS_FAILED', message, stage);
}

/* -------------------------------------------------------------------------- */
/* Stage emission                                                             */
/* -------------------------------------------------------------------------- */

export type StageListener = (event: StageEvent) => void;

function emitStage(
  listener: StageListener | undefined,
  stage: StageId,
  status: StageStatus,
  message: string,
): void {
  if (!listener) return;
  listener({
    stage,
    stageIndex: STAGE_ORDER.indexOf(stage) + 1,
    totalStages: STAGE_ORDER.length,
    status,
    message,
    timestamp: Date.now(),
  });
}

async function runStage<T>(
  listener: StageListener | undefined,
  stage: StageId,
  startMessage: string,
  work: () => Promise<T> | T,
  completeMessage: (result: T) => string,
): Promise<T> {
  emitStage(listener, stage, 'in_progress', startMessage);
  try {
    const result = await work();
    emitStage(listener, stage, 'complete', completeMessage(result));
    return result;
  } catch (error) {
    const analysisError = toAnalysisError(error, stage);
    emitStage(listener, stage, 'error', analysisError.message);
    throw analysisError;
  }
}

/* -------------------------------------------------------------------------- */
/* Options                                                                    */
/* -------------------------------------------------------------------------- */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function scanLimits(): Partial<ScanOptions> {
  return {
    maxFiles: envInt('REPOREAPER_MAX_FILES', 1000),
    maxDepth: envInt('REPOREAPER_MAX_DEPTH', 6),
    maxFileBytes: envInt('REPOREAPER_MAX_FILE_BYTES', 500 * 1024),
    maxTotalBytes: envInt('REPOREAPER_MAX_REPO_BYTES', 50 * 1024 * 1024),
  };
}

export interface RunAnalysisOptions {
  onStage?: StageListener;
  signal?: AbortSignal;
  scanRoot?: string;
  now?: Date;
}

export interface LocalAnalysisOptions extends RunAnalysisOptions {
  /** Canonical URL to present in the report. */
  repoUrl?: string;
}

/* -------------------------------------------------------------------------- */
/* Pipeline                                                                   */
/* -------------------------------------------------------------------------- */

interface PipelineInput {
  coords: RepoCoordinates;
  directory: string;
  sizeBytes: number;
  cleanup: (() => Promise<void>) | null;
  listener?: StageListener;
  signal?: AbortSignal;
  now: Date;
}

function ensureNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new AnalysisError('ABORTED', 'Analysis was cancelled by the client.', null);
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function executePipeline(input: PipelineInput): Promise<RevivalAnalysisResponse> {
  const startedAt = Date.now();
  const { coords, directory, listener, signal, now } = input;

  try {
    ensureNotAborted(signal);

    /* Stage 3 — structure ------------------------------------------------ */
    const structure = await runStage(
      listener,
      'INSPECTING_STRUCTURE',
      'Walking the repository tree with bounded limits...',
      async () => {
        const scan = await scanRepository(directory, scanLimits());
        const fs = createRepoFs(directory, scan);
        const ecosystem = analyzeEcosystem(fs);
        const quality = analyzeQuality(fs);
        return { scan, fs, ecosystem, quality };
      },
      (result) =>
        `Scanned ${result.scan.fileCount} files (${formatBytes(result.scan.totalBytes)})` +
        `${result.scan.truncated ? ', truncated at safety limit' : ''} · ` +
        `${result.ecosystem.primaryLanguage}` +
        `${result.ecosystem.packageManager ? ` · ${result.ecosystem.packageManager}` : ''}`,
    );

    ensureNotAborted(signal);

    /* Stage 4 — dependencies -------------------------------------------- */
    const dependencies = await runStage(
      listener,
      'ANALYZING_DEPENDENCIES',
      'Parsing manifests and lockfiles...',
      () => analyzeDependencies(structure.fs),
      (result) =>
        `${result.manifests.length} manifest${result.manifests.length === 1 ? '' : 's'} · ` +
        `${result.totalDependencies} declared dependencies · ` +
        `${result.hasLockfile ? 'lockfile present' : 'no lockfile'}`,
    );

    ensureNotAborted(signal);

    /* Stage 5 — documentation ------------------------------------------- */
    const documentation = await runStage(
      listener,
      'CHECKING_DOCUMENTATION',
      'Auditing README, license, and community files...',
      () => analyzeDocumentation(structure.fs),
      (result) =>
        result.readme.exists
          ? `README ${result.readme.wordCount} words · ${result.license.type ?? 'no license'}`
          : 'No README found · documentation gaps identified',
    );

    ensureNotAborted(signal);

    /* Stage 6 — maintenance --------------------------------------------- */
    const maintenance = await runStage(
      listener,
      'EVALUATING_MAINTENANCE',
      'Reading local git metadata (read-only)...',
      async () => {
        const git = await readGitMetadata(directory, now);
        return analyzeMaintenance(structure.fs, git, structure.quality.totalSourceLines);
      },
      (result) =>
        result.available && result.lastCommitAgeDays !== null
          ? `Last commit ${result.lastCommitAgeDays} days ago · ${result.todoCount + result.fixmeCount + result.hackCount} debt markers`
          : 'Git metadata unavailable · activity scored neutrally',
    );

    const payload: AnalysisPayload = {
      repository: {
        owner: coords.owner,
        repo: coords.repo,
        url: coords.canonicalUrl,
        analyzedAt: now.toISOString(),
        fileCount: structure.scan.fileCount,
        totalBytes: structure.scan.totalBytes,
        truncated: structure.scan.truncated,
      },
      ecosystem: structure.ecosystem,
      dependencies,
      documentation,
      maintenance,
      quality: structure.quality,
    };

    ensureNotAborted(signal);

    /* Stage 7 — scoring -------------------------------------------------- */
    const { score, findings } = await runStage(
      listener,
      'CALCULATING_SCORE',
      'Applying the deterministic 100-point scoring model...',
      () => scoreRepository(payload),
      (result) =>
        `${result.score.total}/100 (${result.score.label}) · ${result.score.confidence}% confidence · ${result.findings.length} findings`,
    );

    ensureNotAborted(signal);

    /* Stage 8 — AI ------------------------------------------------------- */
    const ai = await runStage(
      listener,
      'GENERATING_AI_ASSESSMENT',
      'Synthesising the revival roadmap...',
      () => generateRevivalReport({ payload, score, findings }),
      (report) =>
        report.degraded
          ? `Deterministic assessment generated (${report.degradationReason ?? 'model unavailable'})`
          : `Assessment generated by ${report.provider} (${report.model ?? 'local model'})`,
    );

    return {
      id: randomUUID(),
      repository: payload.repository,
      score,
      ecosystem: payload.ecosystem,
      dependencies: payload.dependencies,
      documentation: payload.documentation,
      maintenance: payload.maintenance,
      quality: payload.quality,
      findings,
      ai,
      durationMs: Date.now() - startedAt,
      generatedAt: new Date().toISOString(),
    };
  } finally {
    if (input.cleanup) {
      await input.cleanup();
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Public entry points                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Full pipeline: validate → shallow clone → static analysis → score → AI.
 * The cloned directory is always removed in a `finally` block.
 */
export async function runAnalysis(
  rawUrl: unknown,
  options: RunAnalysisOptions = {},
): Promise<RevivalAnalysisResponse> {
  const now = options.now ?? new Date();
  const { onStage: listener, signal } = options;

  const coords = await runStage(
    listener,
    'VALIDATING_URL',
    'Validating repository URL against the GitHub allowlist...',
    () => {
      const validation = validateRepoUrl(rawUrl);
      if (!validation.ok) {
        throw new AnalysisError(validation.code, validation.error, 'VALIDATING_URL');
      }
      return validation.value;
    },
    (result) => `Validated ${result.canonicalUrl}`,
  );

  ensureNotAborted(signal);

  // Best-effort housekeeping; never blocks or fails an analysis.
  void cleanupStaleScans({ scanRoot: options.scanRoot }).catch(() => undefined);

  const ingestionOptions: IngestionOptions = {
    signal,
    scanRoot: options.scanRoot,
    timeoutMs: envInt('REPOREAPER_CLONE_TIMEOUT_MS', 30_000),
    maxBytes: envInt('REPOREAPER_MAX_REPO_BYTES', 50 * 1024 * 1024),
  };

  const ingested = await runStage(
    listener,
    'INGESTING_REPO',
    'Cloning a shallow snapshot (depth 1) into an isolated sandbox...',
    () => ingestRepository(coords, ingestionOptions),
    (result) => `Snapshot ready (${formatBytes(result.sizeBytes)})`,
  );

  return executePipeline({
    coords,
    directory: ingested.directory,
    sizeBytes: ingested.sizeBytes,
    cleanup: ingested.cleanup,
    listener,
    signal,
    now,
  });
}

/**
 * Analyzes an already-materialised directory without cloning. Used by the
 * end-to-end test suite; runs the exact same static analysis stages.
 */
export async function analyzeLocalDirectory(
  directory: string,
  options: LocalAnalysisOptions = {},
): Promise<RevivalAnalysisResponse> {
  const now = options.now ?? new Date();
  const absolute = path.resolve(directory);
  const repoName = path.basename(absolute) || 'local-repository';

  let coords: RepoCoordinates;
  if (options.repoUrl) {
    const validation = validateRepoUrl(options.repoUrl);
    if (!validation.ok) {
      throw new AnalysisError(validation.code, validation.error, 'VALIDATING_URL');
    }
    coords = validation.value;
  } else {
    coords = {
      owner: 'local',
      repo: repoName,
      canonicalUrl: `https://github.com/local/${repoName}`,
      cloneUrl: `https://github.com/local/${repoName}.git`,
    };
  }

  emitStage(
    options.onStage,
    'VALIDATING_URL',
    'complete',
    `Using local fixture at ${absolute}`,
  );

  return executePipeline({
    coords,
    directory: absolute,
    sizeBytes: 0,
    cleanup: null,
    listener: options.onStage,
    signal: options.signal,
    now,
  });
}

export { STAGE_LABELS };
