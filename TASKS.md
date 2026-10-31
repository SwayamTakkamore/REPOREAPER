# REPOREAPER — Granular Task Breakdown & Milestone Tracker

> **Execution Stage:** Stage 1 (Planning Approved) ➔ Stage 2 (Implementation Target)  
> **Target Delivery:** 1-Day Implementation (Estimated: ~8.5 Hours of Focused Engineering)  
> **Implementation Model:** T3 Code OpenCode provider — Big Pickle

---

## Milestone 1: Project Scaffolding & Core Types (~45 mins)

- [ ] **Task 1.1: Next.js 16.0.10 & Tailwind Setup**
  - **Description:** Initialize project package manifest pinning `next@16.0.10`, `react@^19.0.0`, `react-dom@^19.0.0`, `typescript`, `tailwindcss`, `lucide-react`, and `zod`. Setup `tsconfig.json`, `postcss.config.mjs`, and `next.config.ts`.
  - **Verification Command:** `bun run build` or `corepack npm run build` (verifies zero config errors).
  - **Estimate:** 20 mins.

- [ ] **Task 1.2: Domain Types & Zod Schemas (`src/lib/types/index.ts`)**
  - **Description:** Define TypeScript interfaces for `AnalysisPayload`, `Finding`, `HealthScore`, `EcosystemInfo`, `RoadmapAction`, `RevivalReport`, and Zod schemas for AI validation.
  - **Verification Command:** `bun test` or `bun x tsc --noEmit`.
  - **Estimate:** 25 mins.

---

## Milestone 2: URL Validation & Safe Ingestion Engine (~1 hour)

- [ ] **Task 2.1: Strict GitHub URL Validator (`src/lib/analyzer/urlValidator.ts`)**
  - **Description:** Implement regex parser disallowing private IPs, localhost, invalid protocols, credentials, and query params. Enforce allowed pattern: `https://github.com/:owner/:repo`.
  - **Verification Command:** `bun test src/tests/urlValidator.test.ts`.
  - **Estimate:** 25 mins.

- [ ] **Task 2.2: Safe Shallow Git Ingestion (`src/lib/analyzer/repoIngestion.ts`)**
  - **Description:** Implement safe git shallow clone using `child_process.execFile` with argument vectors (zero shell interpolation). Clone into isolated `/tmp/reporeaper-scans/[uuid]` with 30s timeout and automatic cleanup handler.
  - **Verification Command:** Run ingestion against a small public test repo and verify directory cleanup.
  - **Estimate:** 35 mins.

---

## Milestone 3: Static Tree & Heuristic Analyzers (~2 hours)

- [ ] **Task 3.1: Bounded Filesystem Scanner (`src/lib/analyzer/fileScanner.ts`)**
  - **Description:** Implement recursive directory traversal with bounded depth (6), max files (1,000), binary file exclusion, and ignore-list for `.git`, `node_modules`, `vendor`, etc.
  - **Verification Command:** `bun test` on mock directory tree.
  - **Estimate:** 25 mins.

- [ ] **Task 3.2: Multi-Ecosystem & Framework Detector (`src/lib/analyzer/ecosystemDetector.ts`)**
  - **Description:** Detect JavaScript/TypeScript, Python, Go, Rust, Java, PHP, Ruby, and Dart from manifests and extensions.
  - **Verification Command:** `bun test src/tests/ecosystemDetector.test.ts`.
  - **Estimate:** 25 mins.

- [ ] **Task 3.3: Dependency Manifest & Lockfile Inspector (`src/lib/analyzer/dependencyAnalyzer.ts`)**
  - **Description:** Parse `package.json`, `Cargo.toml`, `requirements.txt`, `go.mod`. Check lockfile synchronization, open wildcard constraints, and legacy build scripts (Bower, Grunt, etc.).
  - **Verification Command:** Run parser against fixture package manifests.
  - **Estimate:** 25 mins.

- [ ] **Task 3.4: Documentation Health Inspector (`src/lib/analyzer/docAnalyzer.ts`)**
  - **Description:** Check presence and section completeness of `README.md` (Description, Install, Usage, Config), `LICENSE` detection, and community files (`CONTRIBUTING.md`, `CHANGELOG.md`).
  - **Verification Command:** Test on synthetic repos with varying doc completeness.
  - **Estimate:** 25 mins.

- [ ] **Task 3.5: Git Maintenance & Code Quality Signals (`src/lib/analyzer/maintenanceAnalyzer.ts`, `qualityAnalyzer.ts`)**
  - **Description:** Extract last commit timestamp, contributor estimate, scan for TODO/FIXME markers, detect huge source files (>2000 lines), and verify test directory/script presence.
  - **Verification Command:** Test on mock Git repo.
  - **Estimate:** 20 mins.

---

## Milestone 4: Deterministic Scoring Engine (~45 mins)

- [ ] **Task 4.1: 100-Point Scoring Engine (`src/lib/scoring/scoringEngine.ts`)**
  - **Description:** Calculate mathematical scores across 5 dimensions (Doc 20%, Dep 20%, Maint 20%, Test 20%, Quality 20%) and compute the confidence percentage.
  - **Verification Command:** `bun test src/tests/scoringEngine.test.ts`.
  - **Estimate:** 45 mins.

---

## Milestone 5: Pluggable AI Revival Engine (~1.5 hours)

- [ ] **Task 5.1: Anti-Injection Prompt Constructor (`src/lib/ai/promptBuilder.ts`)**
  - **Description:** Build strict system prompt isolating untrusted evidence in `<untrusted_evidence>` tags, enforcing structured JSON output.
  - **Verification Command:** `bun test src/tests/promptBuilder.test.ts`.
  - **Estimate:** 30 mins.

- [ ] **Task 5.2: Ollama Provider & Resilient Fallback (`src/lib/ai/ollamaProvider.ts`, `fallbackProvider.ts`)**
  - **Description:** Implement native HTTP client to Ollama endpoint (`http://localhost:11434`, model configurable via `AI_MODEL`). Implement `FallbackDeterministicProvider` for zero-crash offline execution.
  - **Verification Command:** Verify live Ollama inference using `curl` / unit test with fallback trigger.
  - **Estimate:** 60 mins.

---

## Milestone 6: API Layer & Server-Sent Events (~1 hour)

- [ ] **Task 6.1: Streaming Route Handler (`src/app/api/analyze/route.ts`)**
  - **Description:** Implement `POST /api/analyze` returning `ReadableStream` SSE events for each of the 8 stages, with cleanup in `finally` block and `AbortSignal` handling.
  - **Verification Command:** `curl -N -X POST -H "Content-Type: application/json" -d '{"repoUrl":"https://github.com/..."}' http://localhost:3000/api/analyze`.
  - **Estimate:** 40 mins.

- [ ] **Task 6.2: Report Export Endpoint (`src/app/api/export/route.ts`)**
  - **Description:** Generate downloadable Markdown and JSON revival reports.
  - **Verification Command:** Download and inspect generated `REVIVAL_REPORT.md`.
  - **Estimate:** 20 mins.

---

## Milestone 7: Frontend Archaeological Cyberpunk UI (~1.5 hours)

- [ ] **Task 7.1: Cyberpunk Landing & Input View (`src/components/LandingHero.tsx`)**
  - **Description:** High-impact dark aesthetic, logo, clear tagline, repo input field, sample repo shortcuts, validation error display.
  - **Verification Command:** Visual check via `preview_navigate` or browser.
  - **Estimate:** 30 mins.

- [ ] **Task 7.2: Real-Time 8-Stage Progress Tracker (`src/components/StageProgress.tsx`)**
  - **Description:** Animated stage progression showing real step completion status and live message logs.
  - **Verification Command:** Trigger scan and observe smooth step transitions.
  - **Estimate:** 20 mins.

- [ ] **Task 7.3: Revival Scorecard & Health Dimension Cards (`src/components/ScoreGauge.tsx`, `HealthDimensionCard.tsx`)**
  - **Description:** Radial score gauge (Healthy, Needs Attention, At Risk, Critical), confidence badge, and 5 detailed dimension breakdown cards.
  - **Verification Command:** Component visual test.
  - **Estimate:** 20 mins.

- [ ] **Task 7.4: Findings List & Evidence Drawer (`src/components/FindingsList.tsx`, `EvidenceModal.tsx`)**
  - **Description:** Severity-coded cards with click-to-view file path, line numbers, and snippet evidence.
  - **Verification Command:** Click finding card, inspect modal evidence rendering.
  - **Estimate:** 20 mins.

---

## Milestone 8: End-to-End Verification & Production Build (~30 mins)

- [ ] **Task 8.1: Full Automated Test Suite Execution**
  - **Description:** Run all unit and integration tests across validator, analyzers, scoring, and AI engine.
  - **Verification Command:** `bun test`.
  - **Estimate:** 15 mins.

- [ ] **Task 8.2: Live Real-World Repository Analysis**
  - **Description:** Analyze a real public GitHub repository end-to-end and verify generation of revival roadmap.
  - **Verification Command:** Trigger scan on `https://github.com/octocat/Hello-World`.
  - **Estimate:** 15 mins.
