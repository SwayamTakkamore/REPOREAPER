# REPOREAPER

> Excavate abandoned repositories. Score their health. Generate a revival roadmap.

REPOREAPER is a static-analysis and AI-assisted repository archaeology tool. Paste a public
GitHub URL and it clones a shallow snapshot into an isolated sandbox, inspects the codebase
without executing a single line of it, produces a deterministic 100-point health score, and
synthesises a phased revival roadmap with evidence for every finding.

The UI is a dark cyberpunk dashboard: an 8-stage live progress tracker over Server-Sent
Events, a radial Revival Score gauge, five health-dimension cards, severity-coded findings
with an evidence inspector, and an immediate / short-term / long-term action plan.

## Highlights

- **Deterministic first.** All 18 health signals and the 100-point score are computed locally
  with no model involved. The same repository always produces the same score.
- **Honest confidence.** Unknown metadata (for example, no git history) is reported as
  `unknown` and lowers confidence instead of being counted as a defect.
- **Zero untrusted execution.** Analysis is read-only: no `npm install`, no build scripts, no
  tests, no `setup.py`, no shell interpolation.
- **AI is optional.** A local Ollama model can write the narrative assessment. If it is
  missing, slow, or returns malformed JSON, a deterministic fallback report is returned with
  `degraded: true` and an explicit reason. The API never crashes because the model is down.
- **Evidence or it did not happen.** Every finding points at a file, and where applicable a
  line number and snippet, taken from the repository itself.
- **Portable exports.** Download the complete report as GitHub-Flavored Markdown or JSON.

## Tech stack

| Layer      | Choice                                                        |
| ---------- | ------------------------------------------------------------- |
| Framework  | Next.js `16.0.10` (App Router, Turbopack)                     |
| UI         | React 19, Tailwind CSS 3, lucide-react                        |
| Language   | TypeScript 5, strict + `noUncheckedIndexedAccess`             |
| Validation | Zod (AI response schema, request bodies)                      |
| AI         | Ollama HTTP API, default `glm-4.7-flash:latest`               |
| Runtime    | Bun for install, tests, and scripts                           |
| Storage    | None — every scan is ephemeral                                |

No Docker, no Python environment, no database. The application runs natively on the host.

## Quick start

```bash
bun install
bun run dev          # http://localhost:3000
```

Open the page, paste a public GitHub repository URL such as
`https://github.com/octocat/Hello-World`, and start the scan.

### Optional: local AI narratives

```bash
ollama pull glm-4.7-flash:latest
ollama serve         # default http://localhost:11434
```

Without Ollama the app still works: it returns the deterministic fallback assessment and
labels the report as degraded.

### Production

```bash
bun run build
bun run start
```

## Configuration

Copy `.env.example` to `.env.local` and adjust as needed. Everything is optional.

| Variable                     | Default                     | Purpose                                                        |
| ---------------------------- | --------------------------- | -------------------------------------------------------------- |
| `AI_PROVIDER`                | `ollama`                    | `ollama`, or `fallback` / `none` / `disabled` to force offline |
| `AI_MODEL`                   | `glm-4.7-flash:latest`      | Ollama model name                                              |
| `OLLAMA_BASE_URL`            | `http://localhost:11434`    | Ollama endpoint                                                |
| `AI_TIMEOUT_MS`              | `60000`                     | Model request timeout                                          |
| `REPOREAPER_MAX_FILES`       | `1000`                      | Maximum files retained by the scanner                          |
| `REPOREAPER_MAX_DEPTH`       | `6`                         | Maximum directory depth                                        |
| `REPOREAPER_MAX_FILE_BYTES`  | `524288`                    | Maximum bytes read from one file                               |
| `REPOREAPER_MAX_REPO_BYTES`  | `52428800`                  | Maximum cloned snapshot size                                   |
| `REPOREAPER_CLONE_TIMEOUT_MS`| `30000`                     | Git clone timeout                                              |

Secrets are never required and never shipped to the client. `.env.local` is git-ignored.

## How the score works

The score is the sum of five dimensions, each worth 20 points:

| Dimension     | Signals                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| Documentation | README presence, description, installation, usage, license, community   |
| Dependencies  | Manifest presence, lockfile, version constraints, legacy build tools    |
| Maintenance   | Last-commit age (one weighted signal)                                   |
| Testing       | Test directory, test script, CI configuration                           |
| Quality       | Standard layout, oversized files, TODO density, formatting config       |

Confidence is the share of the 18 signals that could actually be evaluated. A repository with
no git history, for example, cannot be judged on maintenance, so that signal is marked
`unknown` and confidence drops rather than the score being silently penalised.

Findings are generated from failed or partial signals, sorted by severity. AI output is
validated with Zod and, on any schema or network failure, replaced by the deterministic
fallback report.

## API

### `POST /api/analyze`

Request:

```json
{ "repoUrl": "https://github.com/owner/repo" }
```

Returns `text/event-stream` with three event types:

- `stage` — `{ stage, stageIndex, totalStages, status, message, timestamp }` for each of the
  eight stages (`VALIDATING_URL`, `INGESTING_REPO`, `INSPECTING_STRUCTURE`,
  `ANALYZING_DEPENDENCIES`, `CHECKING_DOCUMENTATION`, `EVALUATING_MAINTENANCE`,
  `CALCULATING_SCORE`, `GENERATING_AI_ASSESSMENT`).
- `complete` — the full `RevivalAnalysisResponse`.
- `error` — `{ code, message, stage? }`.

The stream is always HTTP 200 once accepted, so clients must handle the `error` event. Invalid
request bodies return HTTP 400 JSON before streaming begins.

### `GET /api/analyze`

Returns a small status payload describing the analyzer and AI provider configuration.

### `POST /api/export`

Request:

```json
{ "format": "md", "report": { "...": "RevivalAnalysisResponse" } }
```

Responds with an attachment named `reporeaper-<owner>-<repo>.md` or `.json`.

## Architecture

```text
src/
  app/
    api/analyze/route.ts     SSE pipeline endpoint
    api/export/route.ts      Markdown / JSON download
    page.tsx                 Server entry
  components/                Cyberpunk dashboard pieces
    AnalyzerApp.tsx          Client state machine + SSE parser
    LandingHero.tsx          URL intake
    StageProgress.tsx        8-stage live tracker
    ScoreGauge.tsx           Radial Revival Score
    HealthDimensionCard.tsx  Per-dimension evidence
    FindingsList.tsx         Severity-filtered findings
    EvidenceModal.tsx        File/line/snippet inspector
    AIRevivalRoadmap.tsx     Phased action plan
    TechnicalAssessment.tsx  AI narrative + confidence
    RepositoryRecord.tsx     Static evidence summary
  lib/
    analyzer/
      urlValidator.ts        Strict GitHub allowlist
      fileScanner.ts         Bounded, read-only traversal
      repoIngestion.ts       Safe shallow clone + cleanup
      ecosystemDetector.ts   Languages, frameworks, tooling
      dependencyAnalyzer.ts  Manifests, lockfiles, wildcards
      docAnalyzer.ts         README, license, community files
      maintenanceAnalyzer.ts Read-only git metadata + debt markers
      qualityAnalyzer.ts     Layout, size, tests, CI, formatting
      orchestrator.ts        8-stage pipeline + cleanup guarantee
    scoring/scoringEngine.ts Deterministic 18-signal score
    ai/                      Prompt hardening, Ollama, fallback, Zod
    report/markdown.ts       Report serialisation
    types/index.ts           Shared domain types
  tests/                     Unit + end-to-end fixtures
```

Every analyzer consumes a small `RepoFs` interface rather than the filesystem directly, which
keeps the heuristics testable with in-memory fixtures and keeps path access centralised in
`fileScanner.ts`.

## Security model

- Only `https://github.com/<owner>/<repo>` URLs are accepted. Other protocols, hosts,
  credentials, query strings, encoded separators, and shell metacharacters are rejected.
- Cloning uses `child_process.execFile('git', [...])` with an argument vector; no shell is
  ever involved, and the URL is passed after `--`.
- Clones are shallow (`--depth 1 --single-branch`), size-limited, time-limited, and written to
  `/tmp/reporeaper-scans/<uuid>`.
- The sandbox directory is removed in a `finally` block, including on timeout, abort, invalid
  repository, and analysis failure. Stale scan directories are also swept opportunistically.
- Path resolution rejects traversal and symlink escapes outside the scan root.
- Repository content is treated as untrusted input. AI prompts fence it inside
  `<untrusted_evidence>` tags, neutralise forged delimiters and control characters, and cap
  the amount of text sent. Model output is validated before use.
- Nothing is executed from the analysed repository: no package manager, build tool, test
  runner, or script.

## Testing

```bash
bun test          # unit + end-to-end fixtures
bun run typecheck # tsc --noEmit
bun run build     # Next.js production build
```

The suite covers URL validation, bounded scanning, ecosystem and dependency detection,
documentation and quality analysis, scoring and confidence, prompt hardening, AI schema
validation, the deterministic fallback, Markdown export, and a full local-directory pipeline
including abort and invalid-URL paths.

## Limitations

- Public GitHub repositories only; private repositories and other hosts are out of scope.
- Analysis is heuristic and file-based. It does not resolve transitive dependencies, query
  vulnerability databases, compile code, or claim CVE identifiers.
- The Maintenance dimension relies on the shallow clone's git metadata. When that metadata is
  unavailable the signal is reported as unknown rather than guessed.
- The AI narrative is advisory. The deterministic score and findings are the source of truth.
