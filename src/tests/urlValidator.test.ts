import { describe, expect, test } from 'bun:test';

import {
  assertValidRepoUrl,
  InvalidRepoUrlError,
  validateRepoUrl,
} from '@/lib/analyzer/urlValidator';

describe('validateRepoUrl', () => {
  test('accepts a canonical GitHub repository URL', () => {
    const result = validateRepoUrl('https://github.com/vercel/next.js');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      owner: 'vercel',
      repo: 'next.js',
      canonicalUrl: 'https://github.com/vercel/next.js',
      cloneUrl: 'https://github.com/vercel/next.js.git',
    });
  });

  test('normalises a trailing slash and .git suffix', () => {
    const result = validateRepoUrl('  https://github.com/owner/repo.git/  ');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.canonicalUrl).toBe('https://github.com/owner/repo');
    expect(result.value.repo).toBe('repo');
  });

  test('accepts an uppercase host', () => {
    const result = validateRepoUrl('https://GitHub.com/owner/repo');
    expect(result.ok).toBe(true);
  });

  test('rejects non-string input', () => {
    const result = validateRepoUrl(42);
    expect(result).toEqual({ ok: false, code: 'MALFORMED', error: expect.any(String) });
  });

  test('rejects empty input', () => {
    const result = validateRepoUrl('   ');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('EMPTY');
  });

  test('rejects an over-long URL', () => {
    const result = validateRepoUrl(`https://github.com/owner/${'a'.repeat(400)}`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('TOO_LONG');
  });

  test('rejects http://', () => {
    const result = validateRepoUrl('http://github.com/owner/repo');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_PROTOCOL');
  });

  test('rejects schemeless and protocol-relative input', () => {
    expect(validateRepoUrl('github.com/owner/repo').ok).toBe(false);
    expect(validateRepoUrl('//github.com/owner/repo').ok).toBe(false);
  });

  test('rejects non-GitHub hosts', () => {
    const result = validateRepoUrl('https://gitlab.com/owner/repo');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('UNTRUSTED_HOST');
  });

  test('rejects credentials, ports, queries, and fragments', () => {
    const cases = [
      'https://user:pass@github.com/owner/repo',
      'https://github.com:8443/owner/repo',
      'https://github.com/owner/repo?tab=readme',
      'https://github.com/owner/repo#readme',
    ];
    for (const url of cases) {
      expect(validateRepoUrl(url).ok).toBe(false);
    }
  });

  test('rejects repository paths that are not exactly owner/repo', () => {
    expect(validateRepoUrl('https://github.com/owner').ok).toBe(false);
    expect(validateRepoUrl('https://github.com/owner/repo/tree/main').ok).toBe(false);
  });

  test('rejects invalid owners and flag-like repository names', () => {
    const invalid = [
      'https://github.com/-owner/repo',
      'https://github.com/owner-/repo',
      'https://github.com/owner/-repo',
      'https://github.com/owner/..',
    ];
    for (const url of invalid) {
      const result = validateRepoUrl(url);
      expect(result.ok).toBe(false);
    }
  });

  test('screens shell metacharacters before parsing', () => {
    const injection = 'https://github.com/owner/repo;rm -rf /';
    const result = validateRepoUrl(injection);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('UNSAFE_CHARACTERS');
    expect(result.error).toContain('semicolon');
  });

  test('screens control characters', () => {
    const result = validateRepoUrl('https://github.com/owner/repo\u0000');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('UNSAFE_CHARACTERS');
    expect(result.error).toContain('control character');
  });
});

describe('assertValidRepoUrl', () => {
  test('returns coordinates for a valid URL', () => {
    expect(assertValidRepoUrl('https://github.com/owner/repo').owner).toBe('owner');
  });

  test('throws a typed error with the validation code', () => {
    try {
      assertValidRepoUrl('not-a-url');
      throw new Error('expected assertValidRepoUrl to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidRepoUrlError);
      expect((error as InvalidRepoUrlError).code).toBe('INVALID_PROTOCOL');
    }
  });
});
