# REPOREAPER

> **Tagline:** Bringing dead repositories back to life.  
> **Theme:** Ghost in the Machine — Hacktoberfest 2026, Week 4.  
> **Repository:** [https://github.com/SwayamTakkamore/REPOREAPER](https://github.com/SwayamTakkamore/REPOREAPER)

REPOREAPER is an AI-powered software repository archaeology and revival platform. Give it
a public GitHub URL and it produces an honest, evidence-grounded assessment of an abandoned,
outdated, or neglected codebase: what is broken, what is still solid, a deterministic
100-point Revival Score, and a phased roadmap to bring it back.

---

## Core principles

- **Analysis before interpretation.** The static analyzer walks the tree, parses manifests,
  inspects documentation, samples git history, and computes the Revival Score deterministically
  _before_ any model is invoked. The AI explains findings; it never invents them.
- **Zero untrusted execution.** Analysis is read-only: no `npm install`, no build scripts, no
  tests, no `setup.py`, no shell interpolation.
- **AI is optional.** A local Hugging Face model (or Ollama) can write the narrative assessment. If it is
  missing, slow, or returns malformed JSON, a deterministic fallback report is returned with
  `degraded: true` and an explicit reason. The API never crashes because the model is down.
- **Evidence or it did not happen.** Every finding points at a file, and where applicable a
  line number and snippet, taken from the repository itself.
- **Portable exports.** Download the complete report as GitHub-Flavored Markdown or JSON.

## Tech stack

| Layer      | Choice                                                                        |
| ---------- | ----------------------------------------------------------------------------- |
| Framework  | Next.js `16.0.10` (App Router, Turbopack)                                     |
| UI         | React 19, Tailwind CSS 3, lucide-react                                        |
| Language   | TypeScript 5, strict + `noUncheckedIndexedAccess`                             |
| Validation | Zod (AI response schema, request bodies)                                      |
| AI         | Local Hugging Face Inference (TGI / vLLM / Local server), default `google/gemma-3-1b-it` |
| Runtime    | Bun for install, tests, and scripts                                           |
| Storage    | None — every scan is ephemeral                                                |

No Docker, no Python environment, no database. The application runs natively on the host.

## Quick start

```bash
bun install
bun run dev          # http://localhost:3000
```

Open the page, paste a public GitHub repository URL such as
`https://github.com/octocat/Hello-World`, and start the scan.

### Local Hugging Face AI inference

REPOREAPER supports local Hugging Face inference via standard OpenAI/TGI-compatible endpoints (`/v1/chat/completions` or `/generate`).

To serve local models (such as `google/gemma-3-1b-it` or `google/gemma-2-2b-it` cached in `~/.cache/huggingface/hub`) directly on port 8080:

```bash
# Start the built-in local Hugging Face inference server:
bun run hf:serve
# or: python3 scripts/hf_local_server.py --model google/gemma-3-1b-it --port 8080
```

Without the server running, the app still works: it immediately returns the deterministic fallback assessment and labels the report as degraded.

### Production

```bash
bun run build
bun run start
```

## Configuration

Copy `.env.example` to `.env.local` and adjust as needed. Everything is optional.

| Variable                     | Default                     | Purpose                                                                |
| ---------------------------- | --------------------------- | ---------------------------------------------------------------------- |
| `AI_PROVIDER`                | `huggingface`               | `huggingface` (default), `ollama`, or `fallback` / `none` / `disabled` |
| `AI_MODEL`                   | `google/gemma-3-1b-it`      | Hugging Face model identifier or path                                  |
| `HF_BASE_URL`                | `http://localhost:8080`     | Local Hugging Face / TGI inference endpoint                            |
| `HF_TOKEN`                   | _(empty)_                   | Optional Hugging Face token for gated models                           |
| `OLLAMA_BASE_URL`            | `http://localhost:11434`    | Ollama endpoint (if using `AI_PROVIDER=ollama`)                        |
| `AI_TIMEOUT_MS`              | `60000`                     | Model request timeout                                                  |
| `REPOREAPER_MAX_FILES`       | `1000`                      | Maximum files retained by the scanner                                  |
| `REPOREAPER_MAX_DEPTH`       | `6`                         | Maximum directory depth                                                |
| `REPOREAPER_MAX_FILE_BYTES`  | `524288`                    | Maximum bytes read from one file                                       |
| `REPOREAPER_MAX_REPO_BYTES`  | `52428800`                  | Maximum cloned snapshot size                                           |
| `REPOREAPER_CLONE_TIMEOUT_MS`| `30000`                     | Git clone timeout                                                      |

Secrets are never required and never shipped to the client. `.env.local` is git-ignored.

## How the score works

The score is the sum of five dimensions, each worth 20 points:

1. **Documentation (20 pts):** README presence, section completeness (install, usage, config),
   OSI license detection, contributing guidelines, code of conduct, changelog.
2. **Dependencies (20 pts):** Manifest presence (`package.json`, `Cargo.toml`, `pyproject.toml`,
   `go.mod`, etc.), lockfile synchronisation, wildcard constraint hygiene, absence of
   deprecated build tools (Bower, Grunt, Gulp).
3. **Maintenance (20 pts):** Time since last commit (binned: <90d, <1y, <2y, <4y), author
   count, technical debt markers (`TODO`, `FIXME`, `HACK`).
4. **Testing and CI (20 pts):** Test directory presence, configured test script in manifest,
   active CI workflow (`.github/workflows`, `.gitlab-ci.yml`, etc.).
5. **Codebase quality (20 pts):** Standard source layout, oversized file detection (>2000 lines),
   empty files, formatting configuration (`prettier`, `eslint`, `ruff`).

Each score also carries an **Assessment Confidence** percentage that measures what fraction
of expected signals could actually be verified, preventing unavailable metadata from being
conflated with poor health.

## Project structure

```
reporeaper/
  app/
    api/analyze/route.ts     SSE streaming analysis pipeline (8 stages)
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
    ai/                      Prompt hardening, Hugging Face, Ollama, fallback, Zod
    report/markdown.ts       Report serialisation
    types/index.ts           Shared domain types
  scripts/
    hf_local_server.py       Hugging Face local inference server
  tests/                     Unit + end-to-end fixtures
```

Every analyzer consumes a small `RepoFs` interface rather than the filesystem directly, which
keeps the heuristics testable with in-memory fixtures and keeps path access centralised in
`fileScanner.ts`.\n
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

## License

MIT © Swayam Takkamore
