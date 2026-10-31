# REPOREAPER — Acceptance Criteria & Verification Matrix

> **Status:** Stage 1 Approved  
> **Target:** P0 Mandatory MVP Acceptance Criteria for Stage 2 Implementation and Stage 3 Audit

---

## 1. Acceptance Criteria Checklist

| ID | Acceptance Criterion | Verification Method | Pass Criteria |
|---|---|---|---|
| **AC-01** | **Strict URL Validation** | Unit test `urlValidator.test.ts` & UI input | Valid GitHub URLs (`https://github.com/owner/repo`) accepted. Invalid schemes (`http://`), other domains (`gitlab.com`), IP addresses (`127.0.0.1`, `169.254.169.254`), shell metacharacters, and query parameters are rejected with clear error messages. |
| **AC-02** | **Safe Repository Retrieval** | Integration test with real public repo | `git clone --depth 1 --single-branch` invoked via `child_process.execFile` with argument vector. Clones into `/tmp/reporeaper-scans/[uuid]`. Zero shell injection possible. |
| **AC-03** | **Zero Untrusted Execution** | Static analysis audit | No `npm install`, `npm test`, `setup.py`, `make`, or script executions occur on cloned files. Pure read-only file inspection. |
| **AC-04** | **Multi-Ecosystem Detection** | Unit test `ecosystemDetector.test.ts` | Accurately identifies JS/TS, Python, Go, Rust, Java, PHP, Ruby from manifests (`package.json`, `requirements.txt`, `Cargo.toml`, etc.) and extensions. |
| **AC-05** | **Dependency Manifest Inspection** | Manifest parser tests | Identifies declared dependencies, missing lockfiles (`package-lock.json`, `Cargo.lock`, etc.), wildcard versions, and legacy build tools without inventing vulnerabilities or CVEs. |
| **AC-06** | **Documentation Health Audit** | Doc analyzer tests | Analyzes `README.md` presence, word count, key sections (Installation, Usage, Config), `LICENSE` open-source detection, and community files (`CONTRIBUTING.md`). |
| **AC-07** | **Maintenance Signal Extraction** | Git metadata tests | Reads last commit timestamp, commit count, TODO/FIXME markers. Accurately calculates commit age without equating repository age with abandonment. |
| **AC-08** | **Deterministic Scoring** | Scoring engine unit tests | Calculates 100-point score across 5 dimensions (20 pts each). Math is completely deterministic, transparent, and reproducible without LLM input. |
| **AC-09** | **Honest Confidence Score** | Scoring engine tests | Emits 0–100% confidence score based on ratio of verifiable signals. Distinguishes between verified negative signals and unavailable metadata. |
| **AC-10** | **Pluggable AI Revival Engine** | Ollama integration & offline fallback tests | AI engine calls local Ollama (`glm-4.7-flash:latest`) or falls back gracefully to deterministic offline report if Ollama is unavailable. Zero crashes. |
| **AC-11** | **Structured AI Output Validation** | Zod schema validation tests | AI responses strictly conform to `RevivalReportSchema`. Malformed JSON is caught and handled via fallback provider. |
| **AC-12** | **Evidence-Backed Findings** | UI evidence inspector & report test | Every finding in the report contains `filePath`, `lineNumber` (where applicable), `evidence` snippet, and `severity`. No fabricated files or lines. |
| **AC-13** | **Actionable Phased Roadmap** | Roadmap component tests | Generates prioritized action items divided into Immediate, Short-Term, and Long-Term with rationale and expected benefits. |
| **AC-14** | **Real-Time 8-Stage Progress** | SSE streaming test | Frontend displays real-time progress through all 8 stages: Validating, Ingesting, Inspecting, Dependencies, Docs, Maintenance, Scoring, AI Assessment. |
| **AC-15** | **Filesystem Cleanup Guarantee** | Filesystem audit post-scan | Cloned directory in `/tmp/reporeaper-scans/[uuid]` is completely deleted in `finally` block, even when analysis encounters an error or timeout. |
| **AC-16** | **Export Capabilities** | Export endpoint test | User can download complete report as GitHub Flavored Markdown (`REVIVAL_REPORT.md`) or structured JSON. |
| **AC-17** | **Next.js Version Compliance** | Lockfile & package.json check | Next.js is strictly pinned to `next@16.0.10`. No other version is permitted. |
| **AC-18** | **No Docker Constraint** | Repository file check | Zero Dockerfiles, docker-compose files, or container dependencies exist in the repository. Runs natively on host. |
| **AC-19** | **Zero Hardcoded Secrets** | Security scan (`git log`, `.env.example`) | Secrets only loaded via environment variables. `.env.local` is ignored in `.gitignore`. No credentials leaked in frontend bundles or logs. |
| **AC-20** | **Automated Test Suite Passes** | Command: `bun test` | All unit and integration test suites pass with zero failures. |
| **AC-21** | **Production Build Succeeds** | Command: `bun run build` | Next.js 16 production build compiles with zero TypeScript or ESLint errors. |
