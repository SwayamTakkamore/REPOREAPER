import type {
  DependencyInfo,
  LockfileInfo,
  ManifestInfo,
  RepoFs,
} from '@/lib/types';

/**
 * Manifest and lockfile inspection.
 *
 * This analyzer is deliberately conservative: it reports what a manifest
 * literally declares. It never queries vulnerability databases and never
 * invents CVE identifiers.
 */

const MANIFEST_PARSERS: Record<string, string> = {
  'package.json': 'Node.js',
  'requirements.txt': 'Python',
  'pyproject.toml': 'Python',
  'Pipfile': 'Python',
  'Cargo.toml': 'Rust',
  'go.mod': 'Go',
  'composer.json': 'PHP',
  'Gemfile': 'Ruby',
  'pom.xml': 'Java',
  'build.gradle': 'Java',
  'build.gradle.kts': 'Kotlin',
  'pubspec.yaml': 'Dart',
  'mix.exs': 'Elixir',
  'Package.swift': 'Swift',
};

const LOCKFILES_BY_ECOSYSTEM: Record<string, string[]> = {
  'Node.js': ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb'],
  Python: ['poetry.lock', 'Pipfile.lock', 'uv.lock', 'requirements.lock'],
  Rust: ['Cargo.lock'],
  Go: ['go.sum'],
  PHP: ['composer.lock'],
  Ruby: ['Gemfile.lock'],
  Dart: ['pubspec.lock'],
  Elixir: ['mix.lock'],
  Swift: ['Package.resolved'],
  // Maven and Gradle resolve through their own repositories/BOMs; there is no
  // conventional lockfile to require.
  Java: [],
  Kotlin: [],
};

const LEGACY_TOOL_FILES: Array<{ path: string; label: string }> = [
  { path: 'bower.json', label: 'Bower' },
  { path: '.bowerrc', label: 'Bower' },
  { path: 'Gruntfile.js', label: 'Grunt' },
  { path: 'gruntfile.js', label: 'Grunt' },
  { path: 'gulpfile.js', label: 'Gulp' },
  { path: 'gulpfile.ts', label: 'Gulp' },
];

const MAX_DEPENDENCIES = 250;

function isWildcardSpec(spec: string): boolean {
  const trimmed = spec.trim();
  if (trimmed.length === 0) return true;
  const normalised = trimmed.toLowerCase();
  if (normalised === '*' || normalised === 'latest' || normalised === 'x' || normalised === 'next') {
    return true;
  }
  // Ranges made purely of wildcards, e.g. "*.*.*" or "x.x".
  return /^[x*.\s]+$/.test(normalised);
}

function parsePackageJson(raw: string): { names: string[]; wildcards: string[] } {
  const names: string[] = [];
  const wildcards: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { names, wildcards };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { names, wildcards };
  }
  const record = parsed as Record<string, unknown>;

  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const section = record[field];
    if (!section || typeof section !== 'object' || Array.isArray(section)) continue;
    for (const [name, spec] of Object.entries(section as Record<string, unknown>)) {
      if (!names.includes(name)) names.push(name);
      if (typeof spec === 'string' && isWildcardSpec(spec)) wildcards.push(name);
    }
  }

  const scripts = record.scripts;
  if (scripts && typeof scripts === 'object' && !Array.isArray(scripts)) {
    // Legacy build tools declared in scripts are handled by the caller.
  }

  return { names, wildcards };
}

function parseRequirements(raw: string): { names: string[]; wildcards: string[] } {
  const names: string[] = [];
  const wildcards: string[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
    const match = /^([A-Za-z0-9_.-]+)\s*(.*)$/.exec(trimmed);
    if (!match?.[1]) continue;
    const name = match[1];
    const spec = (match[2] ?? '').split('#')[0]?.trim() ?? '';
    if (!names.includes(name)) names.push(name);
    if (!/[=<>!~^]/.test(spec)) wildcards.push(name);
  }
  return { names, wildcards };
}

function parseCargo(raw: string): { names: string[]; wildcards: string[] } {
  const names: string[] = [];
  const wildcards: string[] = [];
  const sections = /\[(?:[a-z-]*\.)?(?:dev-|build-)?dependencies\]([\s\S]*?)(?=\n\[|$)/g;
  let match: RegExpExecArray | null;
  while ((match = sections.exec(raw)) !== null) {
    for (const line of (match[1] ?? '').split('\n')) {
      const inline = /^\s*([A-Za-z0-9_-]+)\s*=\s*"([^"]*)"/.exec(line);
      if (inline?.[1]) {
        if (!names.includes(inline[1])) names.push(inline[1]);
        if (isWildcardSpec(inline[2] ?? '')) wildcards.push(inline[1]);
        continue;
      }
      const table = /^\s*([A-Za-z0-9_-]+)\s*=\s*\{([^}]*)\}/.exec(line);
      if (table?.[1]) {
        if (!names.includes(table[1])) names.push(table[1]);
        const version = /version\s*=\s*"([^"]*)"/.exec(table[2] ?? '');
        if (version && isWildcardSpec(version[1] ?? '')) wildcards.push(table[1]);
      }
    }
  }
  return { names, wildcards };
}

function parseGoMod(raw: string): { names: string[]; wildcards: string[] } {
  const names: string[] = [];
  for (const line of raw.split('\n')) {
    const match = /^\s*(?:require\s+)?([a-z0-9.-]+\.[a-z]{2,}\/[A-Za-z0-9_./-]+)\s+v\S+/.exec(line);
    if (match?.[1] && !names.includes(match[1])) names.push(match[1]);
  }
  return { names, wildcards: [] };
}

function parseComposer(raw: string): { names: string[]; wildcards: string[] } {
  const names: string[] = [];
  const wildcards: string[] = [];
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const field of ['require', 'require-dev']) {
      const section = parsed[field];
      if (!section || typeof section !== 'object' || Array.isArray(section)) continue;
      for (const [name, spec] of Object.entries(section as Record<string, unknown>)) {
        if (!names.includes(name)) names.push(name);
        if (typeof spec === 'string' && isWildcardSpec(spec)) wildcards.push(name);
      }
    }
  } catch {
    // Unparsable composer.json: report no dependencies rather than guessing.
  }
  return { names, wildcards };
}

function parseGemfile(raw: string): { names: string[]; wildcards: string[] } {
  const names: string[] = [];
  const wildcards: string[] = [];
  for (const match of raw.matchAll(/^\s*gem\s+['"]([^'"]+)['"]([^#\n]*)/gm)) {
    const name = match[1];
    if (!name) continue;
    if (!names.includes(name)) names.push(name);
    if (!/['"][^'"]*['"]/.test(match[2] ?? '')) wildcards.push(name);
  }
  return { names, wildcards };
}

function parsePyproject(raw: string): { names: string[]; wildcards: string[] } {
  const names: string[] = [];
  const wildcards: string[] = [];

  const poetrySections = /\[(?:tool\.poetry\.)?(?:dev-)?dependencies\]([\s\S]*?)(?=\n\[|$)/g;
  let match: RegExpExecArray | null;
  while ((match = poetrySections.exec(raw)) !== null) {
    for (const line of (match[1] ?? '').split('\n')) {
      const inline = /^\s*["']?([A-Za-z0-9_.-]+)["']?\s*=\s*(.+)$/.exec(line);
      if (!inline?.[1]) continue;
      const name = inline[1];
      if (!names.includes(name)) names.push(name);
      if (isWildcardSpec((inline[2] ?? '').replace(/["']/g, ''))) wildcards.push(name);
    }
  }

  const pep621 = /dependencies\s*=\s*\[([\s\S]*?)\]/.exec(raw);
  if (pep621?.[1]) {
    for (const quoted of pep621[1].matchAll(/["']([^"']+)["']/g)) {
      const spec = quoted[1] ?? '';
      const name = /^([A-Za-z0-9_.-]+)/.exec(spec)?.[1];
      if (!name) continue;
      if (!names.includes(name)) names.push(name);
      if (!/[=<>!~^[]/.test(spec)) wildcards.push(name);
    }
  }

  return { names, wildcards };
}

function detectLegacyTools(fs: RepoFs, packageJsonRaw: string | null): string[] {
  const found = new Set<string>();
  for (const tool of LEGACY_TOOL_FILES) {
    if (fs.exists(tool.path)) found.add(tool.label);
  }
  if (packageJsonRaw) {
    if (/"\s*(?:bower|grunt|gulp)\s+/.test(packageJsonRaw)) {
      if (/bower/.test(packageJsonRaw)) found.add('Bower');
      if (/grunt/.test(packageJsonRaw)) found.add('Grunt');
      if (/gulp/.test(packageJsonRaw)) found.add('Gulp');
    }
  }
  return [...found].sort();
}

export function analyzeDependencies(fs: RepoFs): DependencyInfo {
  const manifests: ManifestInfo[] = [];
  const declared = new Set<string>();
  const wildcards = new Set<string>();
  const ecosystemsWithManifest = new Set<string>();

  for (const [manifestPath, ecosystem] of Object.entries(MANIFEST_PARSERS)) {
    if (!fs.exists(manifestPath)) continue;

    const raw = fs.readText(manifestPath);
    let parsed = { names: [] as string[], wildcards: [] as string[] };
    let parseSucceeded = raw !== null;

    if (raw !== null) {
      switch (manifestPath) {
        case 'package.json':
          parsed = parsePackageJson(raw);
          break;
        case 'requirements.txt':
          parsed = parseRequirements(raw);
          break;
        case 'pyproject.toml':
          parsed = parsePyproject(raw);
          break;
        case 'Pipfile':
          break;
        case 'Cargo.toml':
          parsed = parseCargo(raw);
          break;
        case 'go.mod':
          parsed = parseGoMod(raw);
          break;
        case 'composer.json':
          parsed = parseComposer(raw);
          break;
        case 'Gemfile':
          parsed = parseGemfile(raw);
          break;
        default:
          break;
      }
      if (manifestPath.endsWith('.json')) {
        try {
          JSON.parse(raw);
        } catch {
          parseSucceeded = false;
        }
      }
    }

    for (const name of parsed.names) declared.add(name);
    for (const name of parsed.wildcards) wildcards.add(name);
    ecosystemsWithManifest.add(ecosystem);

    manifests.push({
      path: manifestPath,
      ecosystem,
      dependencyCount: parsed.names.length,
      parsed: parseSucceeded,
    });
  }

  const lockfiles: LockfileInfo[] = [];
  const missingLockfilesFor: string[] = [];

  for (const ecosystem of ecosystemsWithManifest) {
    const candidates = LOCKFILES_BY_ECOSYSTEM[ecosystem] ?? [];
    const present = candidates.filter((candidate) => fs.exists(candidate));
    for (const lockfilePath of present) {
      if (!lockfiles.some((lockfile) => lockfile.path === lockfilePath)) {
        lockfiles.push({ path: lockfilePath, ecosystem });
      }
    }
    if (candidates.length > 0 && present.length === 0) {
      missingLockfilesFor.push(ecosystem);
    }
  }

  const packageJsonRaw = fs.readText('package.json');

  return {
    manifests,
    lockfiles,
    totalDependencies: declared.size,
    declaredDependencies: [...declared].sort().slice(0, MAX_DEPENDENCIES),
    wildcardDependencies: [...wildcards].sort().slice(0, MAX_DEPENDENCIES),
    legacyBuildTools: detectLegacyTools(fs, packageJsonRaw),
    hasLockfile: lockfiles.length > 0,
    missingLockfilesFor,
  };
}

/** Returns the primary manifest path, preferring Node.js then common stacks. */
export function primaryManifestPath(dependencies: DependencyInfo): string | null {
  return dependencies.manifests[0]?.path ?? null;
}
