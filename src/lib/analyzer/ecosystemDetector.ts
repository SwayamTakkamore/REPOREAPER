import type {
  EcosystemInfo,
  FrameworkInfo,
  LanguageInfo,
  RepoFs,
} from '@/lib/types';

/**
 * Multi-ecosystem and framework detection.
 *
 * Detection combines manifest presence (highest confidence) with source-file
 * extension distribution (coverage for polyglot repositories).
 */

interface LanguageDefinition {
  name: string;
  extensions: string[];
}

const LANGUAGE_DEFINITIONS: LanguageDefinition[] = [
  { name: 'TypeScript', extensions: ['.ts', '.tsx', '.mts', '.cts'] },
  { name: 'JavaScript', extensions: ['.js', '.jsx', '.mjs', '.cjs'] },
  { name: 'Python', extensions: ['.py', '.pyi'] },
  { name: 'Go', extensions: ['.go'] },
  { name: 'Rust', extensions: ['.rs'] },
  { name: 'Java', extensions: ['.java'] },
  { name: 'Kotlin', extensions: ['.kt', '.kts'] },
  { name: 'C#', extensions: ['.cs'] },
  { name: 'C/C++', extensions: ['.c', '.h', '.cc', '.cpp', '.hpp'] },
  { name: 'Ruby', extensions: ['.rb'] },
  { name: 'PHP', extensions: ['.php'] },
  { name: 'Dart', extensions: ['.dart'] },
  { name: 'Swift', extensions: ['.swift'] },
  { name: 'Scala', extensions: ['.scala'] },
  { name: 'Elixir', extensions: ['.ex', '.exs'] },
  { name: 'Shell', extensions: ['.sh', '.bash', '.zsh', '.fish'] },
  { name: 'Vue', extensions: ['.vue'] },
  { name: 'Svelte', extensions: ['.svelte'] },
  { name: 'Lua', extensions: ['.lua'] },
  { name: 'R', extensions: ['.r'] },
  { name: 'Julia', extensions: ['.jl'] },
];

const EXTENSION_TO_LANGUAGE = new Map<string, string>();
for (const definition of LANGUAGE_DEFINITIONS) {
  for (const extension of definition.extensions) {
    EXTENSION_TO_LANGUAGE.set(extension, definition.name);
  }
}

export const MANIFEST_ECOSYSTEMS: Record<string, string> = {
  'package.json': 'Node.js',
  'pyproject.toml': 'Python',
  'requirements.txt': 'Python',
  'Pipfile': 'Python',
  'setup.py': 'Python',
  'go.mod': 'Go',
  'Cargo.toml': 'Rust',
  'pom.xml': 'Java',
  'build.gradle': 'Java',
  'build.gradle.kts': 'Kotlin',
  'composer.json': 'PHP',
  'Gemfile': 'Ruby',
  'pubspec.yaml': 'Dart',
  'mix.exs': 'Elixir',
  'Package.swift': 'Swift',
  'CMakeLists.txt': 'C/C++',
};

const MANIFEST_PRIORITY = Object.keys(MANIFEST_ECOSYSTEMS);

const FRAMEWORK_DEPENDENCIES: Record<string, string> = {
  next: 'Next.js',
  react: 'React',
  'react-dom': 'React',
  'react-native': 'React Native',
  vue: 'Vue',
  nuxt: 'Nuxt',
  '@angular/core': 'Angular',
  svelte: 'Svelte',
  '@sveltejs/kit': 'SvelteKit',
  astro: 'Astro',
  express: 'Express',
  fastify: 'Fastify',
  koa: 'Koa',
  '@nestjs/core': 'NestJS',
  'electron': 'Electron',
  'tailwindcss': 'Tailwind CSS',
  'vite': 'Vite',
  django: 'Django',
  flask: 'Flask',
  fastapi: 'FastAPI',
  'actix-web': 'Actix Web',
  'rocket': 'Rocket',
  'axum': 'Axum',
  'spring-boot': 'Spring Boot',
  'org.springframework': 'Spring',
  'laravel/framework': 'Laravel',
  'rails': 'Ruby on Rails',
  'sinatra': 'Sinatra',
  'phoenix': 'Phoenix',
  'flutter': 'Flutter',
  'tokio': 'Tokio',
  'tensorflow': 'TensorFlow',
  'torch': 'PyTorch',
  'pandas': 'pandas',
};

const TOOLING_KEYS: Record<string, string> = {
  typescript: 'TypeScript',
  eslint: 'ESLint',
  prettier: 'Prettier',
  jest: 'Jest',
  vitest: 'Vitest',
  mocha: 'Mocha',
  playwright: 'Playwright',
  cypress: 'Cypress',
  webpack: 'Webpack',
  vite: 'Vite',
  babel: 'Babel',
  ruff: 'Ruff',
  black: 'Black',
  mypy: 'mypy',
  pytest: 'pytest',
  tox: 'tox',
  poetry: 'Poetry',
};

function readJson(fs: RepoFs, relativePath: string): Record<string, unknown> | null {
  const raw = fs.readText(relativePath);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function collectDeclaredNames(fs: RepoFs): Set<string> {
  const names = new Set<string>();

  const packageJson = readJson(fs, 'package.json');
  if (packageJson) {
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const value = packageJson[field];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const name of Object.keys(value as Record<string, unknown>)) {
          names.add(name.toLowerCase());
        }
      }
    }
  }

  const pyproject = fs.readText('pyproject.toml');
  if (pyproject) {
    const dependencySection = /\[(?:tool\.poetry\.)?(?:dev-)?dependencies\]([\s\S]*?)(?=\n\[|$)/g;
    let match: RegExpExecArray | null;
    while ((match = dependencySection.exec(pyproject)) !== null) {
      const body = match[1] ?? '';
      for (const line of body.split('\n')) {
        const name = /^\s*["']?([A-Za-z0-9_.-]+)["']?\s*=/.exec(line);
        if (name?.[1]) names.add(name[1].toLowerCase());
      }
    }
    const pep621 = /dependencies\s*=\s*\[([\s\S]*?)\]/.exec(pyproject);
    if (pep621?.[1]) {
      for (const quoted of pep621[1].matchAll(/["']([A-Za-z0-9_.-]+)/g)) {
        if (quoted[1]) names.add(quoted[1].toLowerCase());
      }
    }
  }

  const requirements = fs.readText('requirements.txt');
  if (requirements) {
    for (const line of requirements.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
      const name = /^([A-Za-z0-9_.-]+)/.exec(trimmed);
      if (name?.[1]) names.add(name[1].toLowerCase());
    }
  }

  const cargo = fs.readText('Cargo.toml');
  if (cargo) {
    const dependenciesSection = /\[(?:dev-|build-)?dependencies\]([\s\S]*?)(?=\n\[|$)/g;
    let match: RegExpExecArray | null;
    while ((match = dependenciesSection.exec(cargo)) !== null) {
      for (const line of (match[1] ?? '').split('\n')) {
        const name = /^\s*([A-Za-z0-9_-]+)\s*=/.exec(line);
        if (name?.[1]) names.add(name[1].toLowerCase());
      }
    }
  }

  const goMod = fs.readText('go.mod');
  if (goMod) {
    for (const line of goMod.split('\n')) {
      const name = /^\s*(?:require\s+)?([a-z0-9.-]+\.[a-z]{2,}\/[A-Za-z0-9_./-]+)\s+v/.exec(line);
      if (name?.[1]) names.add(name[1].toLowerCase());
    }
  }

  const gemfile = fs.readText('Gemfile');
  if (gemfile) {
    for (const match of gemfile.matchAll(/^\s*gem\s+['"]([^'"]+)['"]/gm)) {
      if (match[1]) names.add(match[1].toLowerCase());
    }
  }

  const composer = readJson(fs, 'composer.json');
  if (composer) {
    const require = composer.require;
    if (require && typeof require === 'object' && !Array.isArray(require)) {
      for (const name of Object.keys(require as Record<string, unknown>)) {
        names.add(name.toLowerCase());
      }
    }
  }

  return names;
}

function detectPackageManager(fs: RepoFs): string | null {
  if (fs.exists('bun.lock') || fs.exists('bun.lockb')) return 'bun';
  if (fs.exists('pnpm-lock.yaml')) return 'pnpm';
  if (fs.exists('yarn.lock')) return 'yarn';
  if (fs.exists('package-lock.json')) return 'npm';
  if (fs.exists('uv.lock')) return 'uv';
  if (fs.exists('poetry.lock')) return 'poetry';
  if (fs.exists('Pipfile.lock')) return 'pipenv';
  if (fs.exists('requirements.txt')) return 'pip';
  if (fs.exists('Cargo.lock')) return 'cargo';
  if (fs.exists('go.sum')) return 'go modules';
  if (fs.exists('composer.lock')) return 'composer';
  if (fs.exists('Gemfile.lock')) return 'bundler';
  if (fs.exists('gradlew')) return 'gradle';
  if (fs.exists('pom.xml')) return 'maven';
  if (fs.exists('pubspec.lock')) return 'pub';
  if (fs.exists('package.json')) return 'npm';
  return null;
}

function computeLanguages(fs: RepoFs): LanguageInfo[] {
  const counts = new Map<string, number>();
  for (const file of fs.files) {
    const language = EXTENSION_TO_LANGUAGE.get(file.extension);
    if (!language) continue;
    counts.set(language, (counts.get(language) ?? 0) + 1);
  }

  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  if (total === 0) return [];

  const languages = [...counts.entries()]
    .map(([name, fileCount]) => ({
      name,
      fileCount,
      percentage: Math.round((fileCount / total) * 100),
    }))
    .sort((a, b) => b.fileCount - a.fileCount || a.name.localeCompare(b.name));

  // Make rounded percentages sum to exactly 100.
  const sum = languages.reduce((acc, language) => acc + language.percentage, 0);
  const first = languages[0];
  if (first && sum !== 100) {
    first.percentage += 100 - sum;
  }

  return languages;
}

function primaryFromManifests(fs: RepoFs): string | null {
  const present = MANIFEST_PRIORITY.filter((manifest) => fs.exists(manifest));
  if (present.length === 0) return null;

  const ecosystem = MANIFEST_ECOSYSTEMS[present[0] as string];
  if (!ecosystem) return null;

  if (ecosystem === 'Node.js') {
    return fs.exists('tsconfig.json') ? 'TypeScript' : 'JavaScript';
  }
  if (ecosystem === 'Java' && fs.exists('build.gradle.kts')) return 'Kotlin';
  return ecosystem;
}

export function analyzeEcosystem(fs: RepoFs): EcosystemInfo {
  const languages = computeLanguages(fs);

  const manifests = MANIFEST_PRIORITY.filter((manifest) => fs.exists(manifest)).map(
    (manifest) => manifest,
  );

  const declaredNames = collectDeclaredNames(fs);

  const frameworks: FrameworkInfo[] = [];
  for (const [dependency, label] of Object.entries(FRAMEWORK_DEPENDENCIES)) {
    if (declaredNames.has(dependency)) {
      frameworks.push({ name: label, evidence: `Declared dependency "${dependency}"` });
    }
  }
  // De-duplicate labels (e.g. react + react-dom → React).
  const uniqueFrameworks = frameworks.filter(
    (framework, index, all) => all.findIndex((entry) => entry.name === framework.name) === index,
  );

  const tooling: string[] = [];
  for (const [key, label] of Object.entries(TOOLING_KEYS)) {
    if (declaredNames.has(key) && !tooling.includes(label)) tooling.push(label);
  }
  if (fs.exists('tsconfig.json') && !tooling.includes('TypeScript')) tooling.push('TypeScript');
  if (fs.exists('.prettierrc') || fs.exists('.prettierrc.json') || fs.exists('prettier.config.js')) {
    if (!tooling.includes('Prettier')) tooling.push('Prettier');
  }
  if (fs.exists('ruff.toml') || fs.exists('.ruff.toml')) {
    if (!tooling.includes('Ruff')) tooling.push('Ruff');
  }

  const primaryLanguage =
    primaryFromManifests(fs) ?? languages[0]?.name ?? 'Unknown';

  return {
    languages,
    primaryLanguage,
    frameworks: uniqueFrameworks,
    packageManager: detectPackageManager(fs),
    manifests,
    tooling,
  };
}
