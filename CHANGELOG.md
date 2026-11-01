# Changelog

All notable changes to REPOREAPER are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses semantic versioning for its own releases while pinning framework versions explicitly.

## [Unreleased]

## [0.2.0] — 2026-11-01

### Added

#### AI Engine: Hugging Face Local Inference
- Added `HuggingFaceProvider` (`src/lib/ai/huggingFaceProvider.ts`) for local Hugging Face model inference.
  - Supports standard OpenAI/TGI-compatible chat completions endpoint (`POST /v1/chat/completions`).
  - Supports native Hugging Face TGI / router generation endpoint (`POST /generate`).
  - Supports bearer token authentication via `HF_TOKEN` / `HUGGINGFACE_API_KEY` for private/gated models.
  - Implements multi-probe health checking across `/health`, `/v1/models`, and `/`.
  - Configurable via `AI_PROVIDER=huggingface`, `AI_MODEL=google/gemma-3-1b-it`, `HF_BASE_URL=http://localhost:8080`.
- Added `scripts/hf_local_server.py` lightweight local inference server script using host PyTorch and Transformers to serve cached models (such as `google/gemma-3-1b-it` or `google/gemma-2-2b-it`).
- Added npm script `bun run hf:serve` in `package.json`.
- Added comprehensive unit test suite `src/tests/huggingFaceProvider.test.ts` (12 test cases).
- Preserved `OllamaProvider` as an alternative local backend option.

### Changed
- Migrated default `AI_PROVIDER` from `ollama` to `huggingface`.
- Updated `.env.example` and `README.md` with Hugging Face configuration and quickstart commands.

---

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
- `POST /api/export` generating formatted GitHub-Flavored Markdown or JSON downloads.
- Cyberpunk archaeological dashboard in Next.js 16 + React 19: landing hero with quick-try repos,
  real-time eight-stage progress tracker, radial Revival Score gauge, health dimension cards,
  severity-filtered findings, evidence snippet modal, phased revival roadmap, and repository record.
