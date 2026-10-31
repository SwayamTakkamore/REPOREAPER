import type { OversizedFile, QualityInfo, RepoFs } from '@/lib/types';
import { countLines } from './fileScanner';

/**
 * Codebase quality and structural signals.
 *
 * Everything here is derived from file layout and read-only line counting.
 * No linter, compiler, or package manager is executed.
 */

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.mts', '.cts',
  '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyi', '.rb', '.go', '.rs', '.java', '.kt', '.kts', '.scala',
  '.c', '.h', '.cc', '.cpp', '.hpp', '.cs', '.fs', '.swift', '.m', '.mm',
  '.php', '.pl', '.pm', '.lua', '.r', '.jl', '.dart', '.ex', '.exs',
  '.vue', '.svelte', '.astro',
]);

const STANDARD_LAYOUT_DIRECTORIES = [
  'src',
  'lib',
  'pkg',
  'cmd',
  'internal',
  'app',
  'packages',
  'modules',
];

const TEST_DIRECTORIES = ['test', 'tests', '__tests__', 'spec', 'specs', 'e2e', 'cypress', 'playwright'];

const TEST_FILE_PATTERNS = [
  /\.(test|spec)\.[cm]?[jt]sx?$/i,
  /(^|\/)test_[^/]+\.py$/,
  /_test\.go$/,
  /Tests?\.(java|kt|cs|swift)$/,
  /_spec\.rb$/,
];

const CI_FILES = [
  '.gitlab-ci.yml',
  '.travis.yml',
  '.circleci/config.yml',
  'azure-pipelines.yml',
  'appveyor.yml',
  '.drone.yml',
  'bitbucket-pipelines.yml',
  'Jenkinsfile',
  '.woodpecker.yml',
];

const FORMATTING_CONFIGS = [
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  '.prettierrc.cjs',
  'prettier.config.js',
  'prettier.config.mjs',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'biome.json',
  '.editorconfig',
  'ruff.toml',
  '.ruff.toml',
  '.flake8',
  'rustfmt.toml',
  '.rustfmt.toml',
  '.clang-format',
  'dprint.json',
];

const OVERSIZED_LINE_THRESHOLD = 2000;
const MAX_SOURCE_FILES_READ = 800;
const MAX_BYTES_PER_SOURCE_FILE = 500 * 1024;
const MAX_EMPTY_FILES_REPORTED = 25;

function detectTestDirectories(fs: RepoFs): string[] {
  const found: string[] = [];

  for (const directory of TEST_DIRECTORIES) {
    if (fs.hasDirectory(directory)) {
      const flagged = fs.directories.find(
        (candidate) =>
          candidate.toLowerCase() === directory ||
          candidate.toLowerCase().endsWith(`/${directory}`),
      );
      if (flagged && !found.includes(flagged)) found.push(flagged);
    }
  }

  for (const file of fs.files) {
    if (TEST_FILE_PATTERNS.some((pattern) => pattern.test(file.relativePath))) {
      const directory = file.relativePath.includes('/')
        ? file.relativePath.slice(0, file.relativePath.lastIndexOf('/'))
        : '.';
      if (!found.includes(directory)) found.push(directory);
    }
  }

  return found.slice(0, 10);
}

function detectCiConfigurations(fs: RepoFs): string[] {
  const found: string[] = [];

  for (const file of fs.files) {
    const relative = file.relativePath;
    if (/^\.github\/workflows\/.+\.ya?ml$/i.test(relative)) {
      found.push(relative);
      continue;
    }
    if (CI_FILES.some((ci) => relative.toLowerCase() === ci.toLowerCase())) {
      found.push(relative);
    }
  }

  return found.slice(0, 24);
}

function detectFormattingConfigs(fs: RepoFs): string[] {
  return FORMATTING_CONFIGS.filter((config) => fs.exists(config));
}

function detectStandardLayouts(fs: RepoFs): string[] {
  return STANDARD_LAYOUT_DIRECTORIES.filter((directory) => fs.hasDirectory(directory));
}

function detectTestScripts(fs: RepoFs): string[] {
  const scripts: string[] = [];

  const packageJsonRaw = fs.readText('package.json');
  if (packageJsonRaw) {
    try {
      const parsed = JSON.parse(packageJsonRaw) as { scripts?: Record<string, unknown> };
      const test = parsed.scripts?.test;
      if (typeof test === 'string' && test.trim().length > 0 && !/no test specified/i.test(test)) {
        scripts.push('npm test');
      }
    } catch {
      // Ignore malformed manifests; dependency analysis already flags them.
    }
  }

  if (fs.exists('pytest.ini') || fs.exists('tox.ini') || fs.exists('conftest.py')) {
    scripts.push('pytest');
  }
  if (fs.exists('pyproject.toml')) {
    const pyproject = fs.readText('pyproject.toml') ?? '';
    if (/\[tool\.pytest/.test(pyproject)) scripts.push('pytest');
  }
  if (fs.exists('Cargo.toml')) {
    const cargo = fs.readText('Cargo.toml') ?? '';
    if (/\[dev-dependencies\]/.test(cargo)) scripts.push('cargo test');
  }
  if (fs.exists('go.mod')) {
    const hasGoTests = fs.files.some((file) => file.relativePath.endsWith('_test.go'));
    if (hasGoTests) scripts.push('go test');
  }
  if (fs.exists('phpunit.xml') || fs.exists('phpunit.xml.dist')) scripts.push('phpunit');
  if (fs.exists('Gemfile')) {
    const gemfile = fs.readText('Gemfile') ?? '';
    if (/\brspec\b/.test(gemfile)) scripts.push('rspec');
  }

  return scripts;
}

export function analyzeQuality(fs: RepoFs): QualityInfo {
  const sourceFiles = fs.files
    .filter((file) => file.isText && SOURCE_EXTENSIONS.has(file.extension))
    .sort((a, b) => b.sizeBytes - a.sizeBytes);

  let totalSourceLines = 0;
  let largestFile: OversizedFile | null = null;
  const oversizedFiles: OversizedFile[] = [];
  let readCount = 0;

  for (const file of sourceFiles) {
    if (readCount >= MAX_SOURCE_FILES_READ) break;
    const text = fs.readText(file.relativePath, MAX_BYTES_PER_SOURCE_FILE);
    if (text === null) continue;
    readCount += 1;

    const lineCount = countLines(text);
    totalSourceLines += lineCount;

    if (!largestFile || lineCount > largestFile.lineCount) {
      largestFile = { path: file.relativePath, lineCount };
    }
    if (lineCount > OVERSIZED_LINE_THRESHOLD) {
      oversizedFiles.push({ path: file.relativePath, lineCount });
    }
  }

  oversizedFiles.sort((a, b) => b.lineCount - a.lineCount);

  const emptyFiles = fs.files
    .filter((file) => file.isText && file.sizeBytes === 0)
    .map((file) => file.relativePath)
    .slice(0, MAX_EMPTY_FILES_REPORTED);

  const testScripts = detectTestScripts(fs);

  return {
    sourceFileCount: sourceFiles.length,
    totalSourceLines,
    largestFile,
    oversizedFiles: oversizedFiles.slice(0, 20),
    emptyFiles,
    standardLayoutDirs: detectStandardLayouts(fs),
    formattingConfigs: detectFormattingConfigs(fs),
    testDirectories: detectTestDirectories(fs),
    ciConfigurations: detectCiConfigurations(fs),
    hasTestScript: testScripts.length > 0,
    testScriptNames: testScripts,
  };
}

export const QUALITY_LIMITS = {
  oversizedLineThreshold: OVERSIZED_LINE_THRESHOLD,
  maxSourceFilesRead: MAX_SOURCE_FILES_READ,
} as const;
