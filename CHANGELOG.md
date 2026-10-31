# Changelog

All notable changes to REPOREAPER are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses semantic versioning for its own releases while pinning framework versions explicitly.

## [Unreleased]

## [0.1.0] — 2026-11-01

Stage 2 implementation: the complete P0 MVP.

### Added

#### Analysis engine

- Strict GitHub URL validator with an HTTPS-only allowlist, owner/repository grammar checks,
  unsafe-character screening, and typed error codes.
- Safe shallow ingestion via `child_process.execFile('git', [...])` into
  `/tmp/reporeaper-scans/<uuid>`, with timeout, size cap, abort support, and guaranteed
  cleanup in a `finally` block.
- Bounded read-only filesystem scanner (depth 6, 1,000 files, 500 KB per file, 50 MB total)
  with ignore lists, symlink-escape rejection, binary sniffing, and a testable `RepoFs`
  abstraction.
- Multi-ecosystem and framework detection from manifests, extension distribution, declared
  dependencies, and tooling configuration.
- Dependency analyzer for npm, pip/requirements, Poetry/PEP 621, Cargo, Go modules, Composer,
  and Bundler: declared dependencies, lockfile presence per ecosystem, wildcard constraints,
  and legacy Bower/Grunt/Gulp detection.
- Documentation analyzer for README presence, description, installation/usage/configuration/
  contributing/license sections, license signature recognition, and community files.
- Maintenance analyzer using read-only git metadata (last commit, commit count) plus
  TODO/FIXME/HACK density, with an explicit `unknown` state when metadata is unavailable.
- Quality analyzer for source line counts, oversized files, standard layout directories,
  test directories/scripts, CI configurations, and formatting configs.
- Eight-stage orchestrator with per-stage progress callbacks, abort handling, and cleanup.

#### Scoring

- Deterministic 18-signal, five-dimension 100-point scoring engine (documentation,
  dependencies, maintenance, testing, quality — 20 points each).
- Confidence score based on evaluated signals; unavailable metadata is neutral rather than
  treated as a defect.
- Evidence-backed findings with severity, recommendation, file path, line number, and snippet.

#### AI

- Hardened prompt builder that isolates repository text in `<untrusted_evidence>` delimiters,
  neutralises forged tags and control characters, and caps evidence size.
- Local Ollama provider with structured JSON output, request timeout, and health probing.
- Zod validation for every model response, with automatic deterministic fallback on network,
  parse, or schema failure.
- Deterministic fallback report: verdict, technical assessment, root causes, and a phased
  revival roadmap that always contains at least one action per phase.

#### Application

- `POST /api/analyze` Server-Sent Events pipeline emitting `stage`, `complete`, and `error`
  events, with request validation and abort propagation.
- `GET /api/analyze` configuration/status payload.
- `POST /api/export` for GitHub-Flavored Markdown and JSON report downloads.
- Cyberpunk dashboard with landing intake, sample repositories, live 8-stage tracker, radial
  Revival Score gauge, confidence badge, five dimension cards, severity-filtered findings,
  evidence modal, phased roadmap, static repository record, and export controls.
- Ambient obsidian/cyan/emerald/violet design system with reduced-motion support.

#### Project

- 98 unit and end-to-end tests covering validation, scanning, analyzers, scoring, prompt
  hardening, AI schema/fallback, Markdown export, and the full local pipeline.
- README, environment example, implementation report, and this changelog.

### Fixed

- Prompt sanitizer parameter inferred a literal `600` type, rejecting call sites with other
  caps.
- TOML section regexes consumed the following header, causing every second dependency section
  (Poetry and Cargo dev dependencies) to be skipped.

### Security

- No shell interpolation: Git is invoked with an argument vector and the URL follows `--`.
- No untrusted repository code is executed; analysis is strictly static and read-only.
- Clone directories are removed on success, failure, abort, and timeout.
- Environment-only configuration; `.env.local` is git-ignored and no secrets are bundled.
