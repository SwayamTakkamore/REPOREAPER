/**
 * REPOREAPER Model Library & Download Manager Types
 */

export interface ModelInfo {
  id: string; // e.g. "google/gemma-3-1b-it"
  name: string; // "Gemma 3 1B Instruct"
  author: string; // "Google"
  parameters: string; // "1.0B"
  description: string;
  sizeBytes: number; // Size on disk if installed, or estimated download size
  sizeFormatted: string; // e.g. "1.9 GB"
  isInstalled: boolean;
  isActive: boolean;
  tags: string[];
  vramRecommended: string;
  architecture: string;
  installedPath?: string;
  filesCount?: number;
  lastModified?: string;
  isCustom?: boolean;
}

export interface DiskStats {
  modelsUsedBytes: number;
  modelsUsedFormatted: string;
  freeDiskBytes: number;
  freeDiskFormatted: string;
  totalDiskBytes: number;
  totalDiskFormatted: string;
  usagePercent: number;
}

export type DownloadStatus =
  | 'idle'
  | 'queued'
  | 'downloading'
  | 'verifying'
  | 'completed'
  | 'error'
  | 'cancelled';

export interface DownloadProgress {
  modelId: string;
  modelName: string;
  status: DownloadStatus;
  percent: number; // 0 .. 100
  downloadedBytes: number;
  totalBytes: number;
  downloadedFormatted: string;
  totalFormatted: string;
  speedBytesPerSec: number;
  speedFormatted: string; // e.g. "18.4 MB/s"
  etaSeconds: number | null;
  etaFormatted: string; // e.g. "01m 24s"
  currentFile: string;
  completedFiles: number;
  totalFiles: number;
  startedAt: number;
  updatedAt: number;
  error?: string;
}

export interface ModelLibraryState {
  activeModel: string;
  installed: ModelInfo[];
  catalog: ModelInfo[];
  all: ModelInfo[];
  diskStats: DiskStats;
  activeDownload: DownloadProgress | null;
}
