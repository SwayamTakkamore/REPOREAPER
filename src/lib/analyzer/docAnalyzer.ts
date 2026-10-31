import type {
  DocumentationInfo,
  LicenseInfo,
  ReadmeInfo,
  RepoFs,
} from '@/lib/types';

/**
 * Documentation health inspection.
 *
 * Only file presence and literal text patterns are evaluated. No network
 * lookups and no inference beyond the repository's own contents.
 */

const README_CANDIDATES = [
  'README.md',
  'README.rst',
  'README.markdown',
  'README.txt',
  'readme.md',
  'Readme.md',
  'README',
];

const CONTRIBUTING_CANDIDATES = [
  'CONTRIBUTING.md',
  'CONTRIBUTING.rst',
  'CONTRIBUTING.txt',
  '.github/CONTRIBUTING.md',
  'docs/CONTRIBUTING.md',
];

const CODE_OF_CONDUCT_CANDIDATES = [
  'CODE_OF_CONDUCT.md',
  '.github/CODE_OF_CONDUCT.md',
  'docs/CODE_OF_CONDUCT.md',
  'code_of_conduct.md',
];

const CHANGELOG_CANDIDATES = [
  'CHANGELOG.md',
  'CHANGELOG.rst',
  'CHANGELOG.txt',
  'CHANGES.md',
  'HISTORY.md',
  '.github/CHANGELOG.md',
];

const SECURITY_CANDIDATES = ['SECURITY.md', '.github/SECURITY.md', 'docs/SECURITY.md'];

const LICENSE_CANDIDATES = [
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'LICENCE',
  'LICENCE.md',
  'COPYING',
  'COPYING.txt',
  'UNLICENSE',
  'license',
  'license.md',
];

const ENV_EXAMPLE_CANDIDATES = [
  '.env.example',
  '.env.sample',
  '.env.template',
  'env.example',
  '.env.dist',
];

const SECTION_PATTERNS: Record<keyof ReadmeInfo['sections'], RegExp[]> = {
  installation: [
    /^#{1,6}\s*(installation|install|installing|setup|set up|getting started|quick ?start|quickstart)\b/im,
    /\b(npm|yarn|pnpm|bun|pip|poetry|cargo|go get|gem|composer)\s+(install|add|get)\b/i,
  ],
  usage: [
    /^#{1,6}\s*(usage|how to use|using|examples?|quick ?start|getting started|basic usage)\b/im,
    /\b(import|require|from)\s+[A-Za-z0-9_@]+\s*(import|from)?/,
  ],
  configuration: [
    /^#{1,6}\s*(configuration|config|configuring|settings|options|environment variables?|env vars?|\.env)\b/im,
    /\b(process\.env|os\.environ|import\.meta\.env|dotenv)\b/,
  ],
  contributing: [/^#{1,6}\s*(contributing|contribution|development|developing|build from source)\b/im],
  license: [/^#{1,6}\s*(licen[cs]e)\b/im, /\b(MIT|Apache-2\.0|GPL-3\.0|BSD-3-Clause)\b/],
};

const LICENSE_SIGNATURES: Array<{ type: string; pattern: RegExp }> = [
  { type: 'MIT', pattern: /permission is hereby granted, free of charge/i },
  { type: 'Apache-2.0', pattern: /apache license,?\s*version 2\.0/i },
  { type: 'GPL-3.0', pattern: /gnu general public license,?\s*version 3/i },
  { type: 'GPL-2.0', pattern: /gnu general public license,?\s*version 2/i },
  { type: 'AGPL-3.0', pattern: /gnu affero general public license,?\s*version 3/i },
  { type: 'LGPL-3.0', pattern: /gnu lesser general public license,?\s*version 3/i },
  { type: 'MPL-2.0', pattern: /mozilla public license,?\s*version 2\.0/i },
  { type: 'BSD-3-Clause', pattern: /redistribution and use in source and binary forms/i },
  { type: 'ISC', pattern: /permission to use, copy, modify, and\/or distribute this software/i },
  { type: 'Unlicense', pattern: /this is free and unencumbered software released into the public domain/i },
  { type: 'CC0-1.0', pattern: /cc0 1\.0 universal/i },
];

const OPEN_SOURCE_LICENSES = new Set([
  'MIT',
  'Apache-2.0',
  'GPL-3.0',
  'GPL-2.0',
  'AGPL-3.0',
  'LGPL-3.0',
  'MPL-2.0',
  'BSD-3-Clause',
  'ISC',
  'Unlicense',
  'CC0-1.0',
]);

function firstExisting(fs: RepoFs, candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (fs.exists(candidate)) return candidate;
  }
  return null;
}

function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectDescription(raw: string): boolean {
  const lines = raw.split('\n');
  const paragraphs: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      if (current.length > 0) {
        paragraphs.push(current.join(' '));
        current = [];
      }
      continue;
    }
    // Skip headings, badges, images, and HTML blocks.
    if (/^#{1,6}\s/.test(trimmed)) continue;
    if (/^\[!\[/.test(trimmed) || /^!\[/.test(trimmed)) continue;
    if (/^<[^>]+>$/.test(trimmed)) continue;
    if (/^[=-]{3,}$/.test(trimmed)) continue;
    if (trimmed.startsWith('|')) continue;
    current.push(trimmed);
  }
  if (current.length > 0) paragraphs.push(current.join(' '));

  return paragraphs.some((paragraph) => stripMarkdown(paragraph).length >= 50);
}

function detectSections(raw: string): ReadmeInfo['sections'] {
  const sections = {
    installation: false,
    usage: false,
    configuration: false,
    contributing: false,
    license: false,
  };

  for (const key of Object.keys(sections) as Array<keyof ReadmeInfo['sections']>) {
    sections[key] = SECTION_PATTERNS[key].some((pattern) => pattern.test(raw));
  }

  return sections;
}

function inspectReadme(fs: RepoFs): ReadmeInfo {
  const readmePath = firstExisting(fs, README_CANDIDATES);

  if (!readmePath) {
    return {
      exists: false,
      path: null,
      wordCount: 0,
      charCount: 0,
      hasDescription: false,
      snippet: '',
      sections: {
        installation: false,
        usage: false,
        configuration: false,
        contributing: false,
        license: false,
      },
    };
  }

  const raw = fs.readText(readmePath) ?? '';
  const plain = stripMarkdown(raw);
  const words = plain.length > 0 ? plain.split(/\s+/).length : 0;
  const snippet = raw.replace(/\r\n/g, '\n').slice(0, 480);

  return {
    exists: true,
    path: readmePath,
    wordCount: words,
    charCount: raw.length,
    hasDescription: detectDescription(raw),
    snippet,
    sections: detectSections(raw),
  };
}

function inspectLicense(fs: RepoFs): LicenseInfo {
  const licensePath = firstExisting(fs, LICENSE_CANDIDATES);
  if (!licensePath) {
    return { exists: false, path: null, type: null, isOpenSource: false };
  }

  const raw = fs.readText(licensePath) ?? '';
  const match = LICENSE_SIGNATURES.find((signature) => signature.pattern.test(raw));
  const type = match?.type ?? 'Unrecognized';

  return {
    exists: true,
    path: licensePath,
    type,
    isOpenSource: match ? OPEN_SOURCE_LICENSES.has(type) : false,
  };
}

export function analyzeDocumentation(fs: RepoFs): DocumentationInfo {
  return {
    readme: inspectReadme(fs),
    license: inspectLicense(fs),
    contributing: firstExisting(fs, CONTRIBUTING_CANDIDATES) !== null,
    codeOfConduct: firstExisting(fs, CODE_OF_CONDUCT_CANDIDATES) !== null,
    changelog: firstExisting(fs, CHANGELOG_CANDIDATES) !== null,
    securityPolicy: firstExisting(fs, SECURITY_CANDIDATES) !== null,
    docsDirectory: fs.hasDirectory('docs') || fs.hasDirectory('documentation'),
    envExample: firstExisting(fs, ENV_EXAMPLE_CANDIDATES) !== null,
  };
}
