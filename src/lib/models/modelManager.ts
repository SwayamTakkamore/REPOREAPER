import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { CURATED_CATALOG } from './modelCatalog';
import type {
  DiskStats,
  DownloadProgress,
  ModelInfo,
  ModelLibraryState,
} from './types';

const DEFAULT_HF_CACHE = path.join(os.homedir(), '.cache', 'huggingface', 'hub');

let currentActiveModelId =
  process.env.AI_MODEL ??
  process.env.HF_MODEL ??
  process.env.HUGGINGFACE_MODEL ??
  'google/gemma-3-1b-it';

export function getActiveModel(): string {
  return currentActiveModelId;
}

let activeDownloadProcess: ChildProcess | null = null;
let activeDownloadState: DownloadProgress | null = null;
const progressListeners = new Set<(progress: DownloadProgress) => void>();

export function getHfCacheDir(): string {
  return (
    process.env.HF_HOME ??
    process.env.HUGGINGFACE_HUB_CACHE ??
    process.env.REPOREAPER_MODELS_DIR ??
    DEFAULT_HF_CACHE
  );
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0 || !Number.isFinite(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0 || !Number.isFinite(bytesPerSec)) return '0 B/s';
  const mb = bytesPerSec / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB/s`;
  const kb = bytesPerSec / 1024;
  if (kb >= 1) return `${kb.toFixed(0)} KB/s`;
  return `${Math.round(bytesPerSec)} B/s`;
}

export function formatEta(seconds: number | null): string {
  if (seconds === null || seconds < 0 || !Number.isFinite(seconds)) {
    return '--';
  }
  const s = Math.round(seconds);
  if (s === 0) return '0s';
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m`;
  }
  if (mins === 0) {
    return `${secs}s`;
  }
  return `${mins}m ${secs}s`;
}

export function getDiskStats(): DiskStats {
  const cacheDir = getHfCacheDir();
  const rootPath = path.parse(cacheDir).root || '/';

  let totalDiskBytes = 500 * 1024 * 1024 * 1024; // 500 GB fallback
  let freeDiskBytes = 50 * 1024 * 1024 * 1024; // 50 GB fallback

  try {
    const stat = fs.statfsSync(rootPath);
    totalDiskBytes = stat.blocks * stat.bsize;
    freeDiskBytes = stat.bfree * stat.bsize;
  } catch {
    // Keep fallback estimates
  }

  let modelsUsedBytes = 0;
  if (fs.existsSync(cacheDir)) {
    try {
      modelsUsedBytes = getDirectoryPhysicalSize(cacheDir);
    } catch {
      // Keep 0
    }
  }

  const usedDisk = totalDiskBytes - freeDiskBytes;
  const usagePercent = totalDiskBytes > 0 ? Math.round((usedDisk / totalDiskBytes) * 100) : 0;

  return {
    modelsUsedBytes,
    modelsUsedFormatted: formatBytes(modelsUsedBytes),
    freeDiskBytes,
    freeDiskFormatted: formatBytes(freeDiskBytes),
    totalDiskBytes,
    totalDiskFormatted: formatBytes(totalDiskBytes),
    usagePercent,
  };
}

/** Recursively measures size resolving symlinks to calculate true disk weight */
function getDirectoryPhysicalSize(dirPath: string): number {
  let size = 0;
  if (!fs.existsSync(dirPath)) return 0;

  const stack = [dirPath];
  while (stack.length > 0) {
    const current = stack.pop()!;
    try {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(current, entry.name);
        try {
          const stat = fs.statSync(full); // follows symlinks
          if (stat.isDirectory()) {
            // avoid circular recursion
            if (!entry.isSymbolicLink()) {
              stack.push(full);
            }
          } else {
            size += stat.size;
          }
        } catch {
          // ignore broken links
        }
      }
    } catch {
      // ignore unreadable dirs
    }
  }
  return size;
}

export function listInstalledModels(): ModelInfo[] {
  const cacheDir = getHfCacheDir();
  const installed: ModelInfo[] = [];

  if (!fs.existsSync(cacheDir)) return installed;

  try {
    const entries = fs.readdirSync(cacheDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (!entry.name.startsWith('models--')) continue;

      // Extract repo id: "models--google--gemma-3-1b-it" -> "google/gemma-3-1b-it"
      const rest = entry.name.replace(/^models--/, '');
      const parts = rest.split('--');
      if (parts.length < 2) continue;
      const owner = parts[0] ?? 'community';
      const repo = parts.slice(1).join('--') || 'model';
      const modelId = `${owner}/${repo}`;

      const fullPath = path.join(cacheDir, entry.name);
      const snapshotsDir = path.join(fullPath, 'snapshots');
      let isUsable = false;
      let filesCount = 0;
      let snapshotTarget = fullPath;

      if (fs.existsSync(snapshotsDir)) {
        try {
          const snaps = fs.readdirSync(snapshotsDir);
          if (snaps.length > 0 && snaps[0]) {
            snapshotTarget = path.join(snapshotsDir, snaps[0]);
            const snapFiles = fs.readdirSync(snapshotTarget);
            filesCount = snapFiles.length;
            isUsable = snapFiles.some(
              (f) =>
                f.endsWith('.safetensors') ||
                f.endsWith('.bin') ||
                f === 'config.json',
            );
          }
        } catch {
          // Keep false
        }
      } else {
        try {
          const directFiles = fs.readdirSync(fullPath);
          filesCount = directFiles.length;
          isUsable = directFiles.some((f) => f.endsWith('.safetensors') || f === 'config.json');
        } catch {
          // Keep false
        }
      }

      const sizeBytes = getDirectoryPhysicalSize(fullPath);
      const catalogEntry = CURATED_CATALOG.find((c) => c.id.toLowerCase() === modelId.toLowerCase());

      installed.push({
        id: modelId,
        name: catalogEntry?.name ?? `${repo.replace(/[-_]/g, ' ')}`,
        author: catalogEntry?.author ?? owner,
        parameters: catalogEntry?.parameters ?? 'Custom',
        description:
          catalogEntry?.description ??
          `Locally installed Hugging Face model (${owner}/${repo}).`,
        sizeBytes,
        sizeFormatted: formatBytes(sizeBytes),
        isInstalled: isUsable,
        isActive: modelId.toLowerCase() === currentActiveModelId.toLowerCase(),
        tags: catalogEntry?.tags ?? ['Local', 'Custom'],
        vramRecommended: catalogEntry?.vramRecommended ?? '2 - 4 GB',
        architecture: catalogEntry?.architecture ?? 'Transformer',
        installedPath: snapshotTarget,
        filesCount,
        isCustom: !catalogEntry,
      });
    }
  } catch (err) {
    console.error('Error listing installed models:', err);
  }

  return installed;
}

export function getModelLibraryState(): ModelLibraryState {
  const installed = listInstalledModels();
  const installedMap = new Map(installed.map((m) => [m.id.toLowerCase(), m]));

  const catalogWithStatus: ModelInfo[] = CURATED_CATALOG.map((cat) => {
    const inst = installedMap.get(cat.id.toLowerCase());
    return {
      ...cat,
      isInstalled: Boolean(inst?.isInstalled),
      isActive: cat.id.toLowerCase() === currentActiveModelId.toLowerCase(),
      sizeBytes: inst?.sizeBytes ?? cat.sizeBytes,
      sizeFormatted: inst ? inst.sizeFormatted : cat.sizeFormatted,
      installedPath: inst?.installedPath,
      filesCount: inst?.filesCount,
      isCustom: false,
    };
  });

  // Combine catalog with any extra custom-installed models
  const customInstalled = installed.filter(
    (inst) => !CURATED_CATALOG.some((c) => c.id.toLowerCase() === inst.id.toLowerCase()),
  );

  const all = [...catalogWithStatus, ...customInstalled];

  return {
    activeModel: currentActiveModelId,
    installed: installed.filter((m) => m.isInstalled),
    catalog: catalogWithStatus,
    all,
    diskStats: getDiskStats(),
    activeDownload: activeDownloadState,
  };
}

export async function setActiveModel(
  modelId: string,
): Promise<{ success: boolean; activeModel: string }> {
  const trimmed = modelId.trim();
  if (!trimmed) {
    throw new Error('Model ID cannot be empty.');
  }

  currentActiveModelId = trimmed;
  process.env.AI_MODEL = trimmed;
  process.env.HF_MODEL = trimmed;

  // Attempt to notify local python server if it is running
  const serverUrl = process.env.HF_BASE_URL ?? 'http://localhost:8080';
  try {
    await fetch(`${serverUrl}/v1/switch_model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: trimmed }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Server might be offline or using standard TGI
  }

  broadcastProgress();
  return { success: true, activeModel: currentActiveModelId };
}

export async function deleteModel(
  modelId: string,
): Promise<{ success: boolean; freedBytes: number; modelId: string }> {
  const sanitized = modelId.trim();
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(sanitized)) {
    throw new Error('Invalid model identifier.');
  }

  if (sanitized.toLowerCase() === currentActiveModelId.toLowerCase()) {
    throw new Error(
      `Cannot delete active model "${sanitized}". Please switch to another model first.`,
    );
  }

  const cacheDir = getHfCacheDir();
  const dirName = `models--${sanitized.replace('/', '--')}`;
  const targetDir = path.join(cacheDir, dirName);

  if (!targetDir.startsWith(cacheDir)) {
    throw new Error('Path traversal detected.');
  }

  if (!fs.existsSync(targetDir)) {
    throw new Error(`Model directory not found: ${dirName}`);
  }

  const freedBytes = getDirectoryPhysicalSize(targetDir);
  await fs.promises.rm(targetDir, { recursive: true, force: true });

  broadcastProgress();
  return { success: true, freedBytes, modelId: sanitized };
}

export function subscribeToProgress(
  listener: (progress: DownloadProgress) => void,
): () => void {
  progressListeners.add(listener);
  if (activeDownloadState) {
    listener(activeDownloadState);
  }
  return () => {
    progressListeners.delete(listener);
  };
}

function broadcastProgress(): void {
  if (!activeDownloadState) return;
  for (const listener of progressListeners) {
    try {
      listener(activeDownloadState);
    } catch {
      // Ignore listener error
    }
  }
}

export async function startModelDownload(
  modelId: string,
): Promise<DownloadProgress> {
  const cleanId = modelId.trim();
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(cleanId)) {
    throw new Error('Invalid model identifier. Use format "owner/repo".');
  }

  if (activeDownloadState && activeDownloadState.status === 'downloading') {
    throw new Error(
      `Another download is already in progress (${activeDownloadState.modelId}). Cancel it before starting a new one.`,
    );
  }

  const catalogEntry = CURATED_CATALOG.find((c) => c.id.toLowerCase() === cleanId.toLowerCase());
  const expectedTotal = catalogEntry?.sizeBytes ?? 2 * 1024 * 1024 * 1024;

  const now = Date.now();
  activeDownloadState = {
    modelId: cleanId,
    modelName: catalogEntry?.name ?? cleanId,
    status: 'queued',
    percent: 0,
    downloadedBytes: 0,
    totalBytes: expectedTotal,
    downloadedFormatted: '0 B',
    totalFormatted: formatBytes(expectedTotal),
    speedBytesPerSec: 0,
    speedFormatted: '0.0 MB/s',
    etaSeconds: null,
    etaFormatted: 'Estimating...',
    currentFile: 'Resolving repository metadata...',
    completedFiles: 0,
    totalFiles: 6,
    startedAt: now,
    updatedAt: now,
  };

  broadcastProgress();

  const scriptPath = path.join(process.cwd(), 'scripts', 'download_model.py');
  const pythonBin = fs.existsSync('/usr/bin/python3') ? '/usr/bin/python3' : 'python3';

  try {
    const child = spawn(
      pythonBin,
      [scriptPath, '--model', cleanId],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      },
    );

    activeDownloadProcess = child;

    let buffer = '';
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line.trim());
          handleDownloadEvent(cleanId, event);
        } catch {
          // non-JSON log line
        }
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      console.warn(`[hf-downloader] ${chunk.toString('utf8').trim()}`);
    });

    child.on('close', (code) => {
      activeDownloadProcess = null;
      if (activeDownloadState && activeDownloadState.modelId === cleanId) {
        if (code === 0 && activeDownloadState.status !== 'cancelled') {
          activeDownloadState = {
            ...activeDownloadState,
            status: 'completed',
            percent: 100,
            downloadedBytes: activeDownloadState.totalBytes,
            downloadedFormatted: activeDownloadState.totalFormatted,
            speedBytesPerSec: 0,
            speedFormatted: '0.0 MB/s',
            etaSeconds: 0,
            etaFormatted: 'Complete',
            currentFile: 'All weights verified',
            updatedAt: Date.now(),
          };
          broadcastProgress();
        } else if (activeDownloadState.status !== 'cancelled') {
          activeDownloadState = {
            ...activeDownloadState,
            status: 'error',
            error: `Downloader process exited with code ${code}`,
            updatedAt: Date.now(),
          };
          broadcastProgress();
        }
      }
    });

    child.on('error', (err) => {
      activeDownloadProcess = null;
      if (activeDownloadState) {
        activeDownloadState = {
          ...activeDownloadState,
          status: 'error',
          error: `Failed to spawn downloader: ${err.message}`,
          updatedAt: Date.now(),
        };
        broadcastProgress();
      }
    });
  } catch (err) {
    activeDownloadState = {
      ...activeDownloadState,
      status: 'error',
      error: (err as Error).message,
      updatedAt: Date.now(),
    };
    broadcastProgress();
  }

  return activeDownloadState;
}

function handleDownloadEvent(modelId: string, event: Record<string, unknown>): void {
  if (!activeDownloadState || activeDownloadState.modelId !== modelId) return;

  const now = Date.now();
  const status = typeof event.status === 'string' ? event.status : 'downloading';

  if (status === 'downloading') {
    const downloaded = typeof event.downloaded === 'number' ? event.downloaded : activeDownloadState.downloadedBytes;
    const total = typeof event.total === 'number' && event.total > 0 ? event.total : activeDownloadState.totalBytes;
    const percent = typeof event.percent === 'number' ? event.percent : total > 0 ? (downloaded / total) * 100 : 0;
    const speed = typeof event.speed === 'number' ? event.speed : 0;
    const eta = typeof event.eta === 'number' ? event.eta : null;
    const currentFile = typeof event.file === 'string' ? event.file : activeDownloadState.currentFile;

    activeDownloadState = {
      ...activeDownloadState,
      status: 'downloading',
      downloadedBytes: downloaded,
      totalBytes: total,
      downloadedFormatted: formatBytes(downloaded),
      totalFormatted: formatBytes(total),
      percent: Math.min(100, Math.max(0, Math.round(percent * 10) / 10)),
      speedBytesPerSec: speed,
      speedFormatted: formatSpeed(speed),
      etaSeconds: eta,
      etaFormatted: formatEta(eta),
      currentFile,
      updatedAt: now,
    };
  } else if (status === 'completed') {
    const totalBytes = typeof event.totalBytes === 'number' ? event.totalBytes : activeDownloadState.totalBytes;
    activeDownloadState = {
      ...activeDownloadState,
      status: 'completed',
      percent: 100,
      downloadedBytes: totalBytes,
      totalBytes,
      downloadedFormatted: formatBytes(totalBytes),
      totalFormatted: formatBytes(totalBytes),
      speedBytesPerSec: 0,
      speedFormatted: '0.0 MB/s',
      etaSeconds: 0,
      etaFormatted: 'Complete',
      currentFile: 'Model ready to activate',
      updatedAt: now,
    };
  } else if (status === 'error') {
    activeDownloadState = {
      ...activeDownloadState,
      status: 'error',
      error: typeof event.error === 'string' ? event.error : 'Download failed.',
      updatedAt: now,
    };
  } else if (status === 'cancelled') {
    activeDownloadState = {
      ...activeDownloadState,
      status: 'cancelled',
      currentFile: 'Cancelled by user',
      updatedAt: now,
    };
  }

  broadcastProgress();
}

export async function cancelActiveDownload(): Promise<boolean> {
  if (!activeDownloadProcess && !activeDownloadState) return false;

  if (activeDownloadProcess) {
    try {
      activeDownloadProcess.kill('SIGTERM');
    } catch {
      // Process might already be dead
    }
    activeDownloadProcess = null;
  }

  if (activeDownloadState) {
    activeDownloadState = {
      ...activeDownloadState,
      status: 'cancelled',
      currentFile: 'Download aborted by user',
      updatedAt: Date.now(),
    };
    broadcastProgress();
  }

  return true;
}

export function getActiveDownload(): DownloadProgress | null {
  return activeDownloadState;
}

export function clearFinishedDownload(): void {
  if (
    activeDownloadState &&
    (activeDownloadState.status === 'completed' ||
      activeDownloadState.status === 'cancelled' ||
      activeDownloadState.status === 'error')
  ) {
    activeDownloadState = null;
    broadcastProgress();
  }
}
