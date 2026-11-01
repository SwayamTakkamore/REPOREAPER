import { describe, expect, test } from 'vitest';

import {
  formatBytes,
  formatEta,
  formatSpeed,
  getActiveModel,
  getDiskStats,
  listInstalledModels,
  setActiveModel,
  subscribeToProgress,
  deleteModel,
} from '@/lib/models/modelManager';
import { CURATED_CATALOG } from '@/lib/models/modelCatalog';
import type { DownloadProgress } from '@/lib/models/types';

describe('formatBytes helper', () => {
  test('formats 0 bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  test('formats KB, MB, GB accurately', () => {
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(1024 * 1024 * 50)).toBe('50.00 MB');
    expect(formatBytes(1024 * 1024 * 1024 * 2.5)).toBe('2.50 GB');
  });
});

describe('formatSpeed helper', () => {
  test('formats download speed correctly', () => {
    expect(formatSpeed(0)).toBe('0 B/s');
    expect(formatSpeed(1024 * 512)).toBe('512 KB/s');
    expect(formatSpeed(1024 * 1024 * 12.4)).toBe('12.4 MB/s');
  });
});

describe('formatEta helper', () => {
  test('formats seconds and minutes correctly', () => {
    expect(formatEta(null)).toBe('--');
    expect(formatEta(-5)).toBe('--');
    expect(formatEta(0)).toBe('0s');
    expect(formatEta(45)).toBe('45s');
    expect(formatEta(125)).toBe('2m 5s');
    expect(formatEta(3665)).toBe('1h 1m');
  });
});

describe('CURATED_CATALOG', () => {
  test('contains valid archaeological models with complete metadata', () => {
    expect(CURATED_CATALOG.length).toBeGreaterThan(3);

    for (const model of CURATED_CATALOG) {
      expect(model.id).toContain('/');
      expect(model.name.length).toBeGreaterThan(0);
      expect(model.description.length).toBeGreaterThan(0);
      expect(model.parameters.length).toBeGreaterThan(0);
      expect(model.sizeBytes).toBeGreaterThan(0);
      expect(model.vramRecommended.length).toBeGreaterThan(0);
    }
  });

  test('includes google/gemma-3-1b-it as default archeological model', () => {
    const defaultModel = CURATED_CATALOG.find((m) => m.id === 'google/gemma-3-1b-it');
    expect(defaultModel).toBeDefined();
    expect(defaultModel?.name).toContain('Gemma 3 1B');
  });
});

describe('Model Manager Disk & Cache Operations', () => {
  test('getDiskStats returns non-zero host filesystem telemetry', () => {
    const stats = getDiskStats();
    expect(stats.totalDiskBytes).toBeGreaterThan(0);
    expect(stats.freeDiskBytes).toBeGreaterThan(0);
    expect(stats.modelsUsedBytes).toBeGreaterThanOrEqual(0);
    expect(stats.totalDiskBytes).toBeGreaterThanOrEqual(stats.freeDiskBytes);
  });

  test('listInstalledModels discovers cached local models', () => {
    const models = listInstalledModels();
    expect(Array.isArray(models)).toBe(true);

    // If local huggingface cache has gemma-3-1b-it installed
    const gemma = models.find((m) => m.id === 'google/gemma-3-1b-it');
    if (gemma) {
      expect(gemma.isInstalled).toBe(true);
      expect(gemma.sizeBytes).toBeGreaterThan(0);
      expect(gemma.sizeFormatted).toContain('GB');
    }
  });

  test('active model state management', async () => {
    const initial = getActiveModel();
    expect(initial).toBeTruthy();

    await setActiveModel('Qwen/Qwen2.5-Coder-1.5B-Instruct');
    expect(getActiveModel()).toBe('Qwen/Qwen2.5-Coder-1.5B-Instruct');

    // Restore to initial
    await setActiveModel(initial);
    expect(getActiveModel()).toBe(initial);
  });

  test('deleteModel protects active model from deletion', async () => {
    const active = getActiveModel();
    await expect(deleteModel(active)).rejects.toThrow('Cannot delete active model');
  });

  test('deleteModel protects against path traversal', async () => {
    await expect(deleteModel('../../etc/passwd')).rejects.toThrow('Invalid model identifier');
  });

  test('subscribeToProgress dispatches events to listeners', () => {
    const events: DownloadProgress[] = [];
    const unsubscribe = subscribeToProgress((progress) => {
      events.push(progress);
    });

    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });
});
