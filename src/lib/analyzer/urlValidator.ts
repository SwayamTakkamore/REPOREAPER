import type { RepoCoordinates, ValidationResult } from '@/lib/types';

/**
 * Strict GitHub repository URL validator.
 *
 * Security posture (see SECURITY.md):
 *  - HTTPS only, host must be exactly `github.com`.
 *  - No embedded credentials, ports, query strings, or fragments.
 *  - Exactly two path segments: `/:owner/:repo`.
 *  - Owner/repo character whitelists defeat shell and git-flag injection.
 *  - Raw input is screened for control characters and shell metacharacters
 *    before it ever reaches a process boundary.
 */

const MAX_URL_LENGTH = 300;

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

/** Characters that must never appear in a repository identifier. */
const UNSAFE_CHARACTERS = /[\s\u0000-\u001f\u007f;|&$`<>\\'"{}()[\]*!~^]/;

const SHELL_METACHARACTER_NAMES: Record<string, string> = {
  ';': 'semicolon',
  '|': 'pipe',
  '&': 'ampersand',
  $: 'dollar sign',
  '`': 'backtick',
  '<': 'angle bracket',
  '>': 'angle bracket',
  '\\': 'backslash',
  "'": 'quote',
  '"': 'quote',
  '{': 'brace',
  '}': 'brace',
  '(': 'parenthesis',
  ')': 'parenthesis',
  '[': 'bracket',
  ']': 'bracket',
  '*': 'wildcard',
  '?': 'wildcard',
  '!': 'exclamation mark',
  '~': 'tilde',
  '^': 'caret',
};

function fail(
  code: Extract<ValidationResult, { ok: false }>['code'],
  error: string,
): ValidationResult {
  return { ok: false, code, error };
}

/** Describes the first unsafe character found, for a helpful error message. */
function describeUnsafeCharacter(input: string): string | null {
  const match = UNSAFE_CHARACTERS.exec(input);
  if (!match) return null;
  const character = match[0];
  if (/\s/.test(character)) {
    return character === '\n' ? 'a newline' : 'whitespace';
  }
  if (/[\u0000-\u001f\u007f]/.test(character)) return 'a control character';
  return `"${character}" (${SHELL_METACHARACTER_NAMES[character] ?? 'unsafe character'})`;
}

/**
 * Validates and normalises a GitHub repository URL.
 *
 * Accepted: `https://github.com/owner/repo`, optional single trailing slash,
 * optional `.git` suffix (case-insensitive host).
 */
export function validateRepoUrl(rawInput: unknown): ValidationResult {
  if (typeof rawInput !== 'string') {
    return fail('MALFORMED', 'Repository URL must be a string.');
  }

  const input = rawInput.trim();

  if (input.length === 0) {
    return fail('EMPTY', 'Enter a GitHub repository URL.');
  }

  if (input.length > MAX_URL_LENGTH) {
    return fail('TOO_LONG', `Repository URL must be ${MAX_URL_LENGTH} characters or fewer.`);
  }

  const unsafe = describeUnsafeCharacter(input);
  if (unsafe) {
    return fail(
      'UNSAFE_CHARACTERS',
      `Repository URL contains ${unsafe}. Only standard GitHub URLs are accepted.`,
    );
  }

  // Enforce the scheme textually before parsing so that schemeless or
  // protocol-relative input cannot be silently coerced.
  if (!/^https:\/\//i.test(input)) {
    if (/^http:\/\//i.test(input)) {
      return fail('INVALID_PROTOCOL', 'Only HTTPS URLs are accepted (http:// is not secure).');
    }
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
      return fail('INVALID_PROTOCOL', 'Only HTTPS URLs are accepted.');
    }
    return fail(
      'INVALID_PROTOCOL',
      'Repository URL must start with https://github.com/.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return fail('MALFORMED', 'Repository URL could not be parsed.');
  }

  if (parsed.protocol !== 'https:') {
    return fail('INVALID_PROTOCOL', 'Only HTTPS URLs are accepted.');
  }

  if (parsed.hostname.toLowerCase() !== 'github.com') {
    return fail(
      'UNTRUSTED_HOST',
      'Only repositories hosted on github.com can be analyzed.',
    );
  }

  if (parsed.port !== '') {
    return fail('UNTRUSTED_HOST', 'Repository URLs must not specify a port.');
  }

  if (parsed.username !== '' || parsed.password !== '') {
    return fail('CREDENTIALS', 'Repository URLs must not contain embedded credentials.');
  }

  if (parsed.search !== '' || parsed.hash !== '') {
    return fail(
      'QUERY_OR_FRAGMENT',
      'Repository URLs must not contain query parameters or fragments.',
    );
  }

  const segments = parsed.pathname.split('/').filter((segment) => segment.length > 0);

  if (segments.length !== 2) {
    return fail(
      'INVALID_PATH',
      'Repository URL must point to a repository root: https://github.com/owner/repo',
    );
  }

  const owner = segments[0] as string;
  let repo = segments[1] as string;

  if (repo.toLowerCase().endsWith('.git')) {
    repo = repo.slice(0, -4);
  }

  if (repo.length === 0 || repo === '.' || repo === '..') {
    return fail('INVALID_REPO', 'Repository name is invalid.');
  }

  if (!OWNER_PATTERN.test(owner)) {
    return fail(
      'INVALID_OWNER',
      'GitHub owner may only contain letters, numbers, and single inner hyphens.',
    );
  }

  if (!REPO_PATTERN.test(repo) || repo.startsWith('-') || repo === '.' || repo === '..') {
    return fail(
      'INVALID_REPO',
      'Repository name may only contain letters, numbers, dots, underscores, and hyphens.',
    );
  }

  const canonicalUrl = `https://github.com/${owner}/${repo}`;

  const value: RepoCoordinates = {
    owner,
    repo,
    canonicalUrl,
    cloneUrl: `${canonicalUrl}.git`,
  };

  return { ok: true, value };
}

/** Convenience wrapper that returns the coordinates or throws a typed error. */
export class InvalidRepoUrlError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'InvalidRepoUrlError';
    this.code = code;
  }
}

export function assertValidRepoUrl(rawInput: unknown): RepoCoordinates {
  const result = validateRepoUrl(rawInput);
  if (!result.ok) {
    throw new InvalidRepoUrlError(result.code, result.error);
  }
  return result.value;
}
