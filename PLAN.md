# REPOREAPER — Project Master Plan (Stage 1: Planning)

> **Theme:** Ghost in the Machine — Hacktoberfest Week 4, 2026  
> **Tagline:** Bringing dead repositories back to life.  
> **Repository:** [https://github.com/SwayamTakkamore/REPOREAPER](https://github.com/SwayamTakkamore/REPOREAPER)  
> **Target Delivery:** 1-Day Functional Open-Source MVP

---

## 1. Executive Summary & Vision

REPOREAPER is an open-source, AI-powered software repository archaeology and revival platform. It is engineered to analyze abandoned, outdated, poorly documented, or neglected software repositories and provide developers with:
1. Ground-truth structural and diagnostic analysis (static inspection without code execution).
2. Transparent, deterministic health metrics across 5 key dimensions (100-point Revival Score).
3. Evidence-grounded AI interpretation that explains root problems, prioritizes remediation, and produces a phased revival roadmap (Immediate, Short-Term, Long-Term).

Unlike generic AI chatbot wrappers, REPOREAPER enforces strict **Analysis Before Interpretation**: every finding is tied to verified repository files, line numbers, or git metadata. Untrusted repository contents are sanitized and never executed.

---

## 2. Environment & System Audit

A thorough audit of the host environment was performed during Stage 1:

| Component | Host State / Version | Architectural Decision |
|---|---|---|
| **OS** | Linux (Debian / Kali GNU/Linux) | Native host execution; zero container overhead. |
| **Node.js** | `v24.21.0` | Primary runtime for the full-stack web application. |
| **Bun** | `v1.3.14` (`/home/kali/.bun/bin/bun`) | High-speed package manager, runtime, and test runner. |
| **npm / Corepack** | Corepack shims available (`npm 12.2.0`) | Supports standard lockfiles (`package-lock.json`). |
| **Python** | `Python 3.14.8` (PEP 668 externally managed) | **Excluded from core runtime** per Directive 2.2 (no venv/virtualenv allowed). All analyzer modules implemented in pure TypeScript. |
| **Local LLM Inference** | Ollama running at `http://localhost:11434` with `glm-4.7-flash:latest` (29.9B MoE) | Default MVP AI provider (`AI_PROVIDER=ollama`, `AI_MODEL=glm-4.7-flash:latest`), fully configurable via `.env`. |
| **Docker** | Strictly prohibited by Directive 2.1 | Not used anywhere in development, testing, or deployment. |
| **Next.js** | Strictly pinned to `16.0.10` per Directive 2.3 | Configured with React 19, App Router, Route Handlers, and Tailwind CSS. |

---

## 3. Technology Decisions & Justifications

### 3.1 Framework: Next.js 16.0.10 (App Router) + React 19 + TypeScript
- **Justification:** Mandated version `next@16.0.10`. Unifies the frontend archaeological dashboard and backend analysis engine in a single type-safe codebase. Eliminates cross-language IPC overhead and external daemon dependencies.
- **Route Handlers:** Utilizes Web Standard `ReadableStream` / Server-Sent Events (SSE) for real-time progress updates through all 8 stages of repository analysis. Allows instant client-side cancellation via `AbortController`.

### 3.2 Styling & Design: Tailwind CSS + Lucide Icons
- **Aesthetic:** Dark developer archaeology meets futuristic cyberpunk (slate/obsidian backdrops `#090D16`, `#0D1117`, cyber cyan `#00F2FE`, ghostly emerald `#10B981`, electric violet `#A855F7`).
- **Justification:** High contrast, responsive, accessible, with zero runtime CSS-in-JS overhead.

### 3.3 Static Ingestion & Inspection: Node.js Native Process APIs
- **Safe Execution:** Uses `child_process.execFile` with argument vectors (e.g. `['clone', '--depth', '1', '--single-branch', url, targetDir]`). **Zero shell interpolation (`exec`)** to prevent command injection.
- **Filesystem Safety:** Temporary directories isolated under `/tmp/reporeaper-scans/[uuid]`. Validated path canonicalization prevents directory traversal and symlink escapes.
- **Resource Limits:** Max clone size 50MB, max scan depth 6 levels, max 1,000 files, max 500KB per analyzed file, 30s timeout.

### 3.4 Deterministic Scoring Engine
- **Pure Functional TypeScript:** Calculates scores from 0 to 100 based on explicit, inspectable math across 5 dimensions:
  1. Documentation Health (20%)
  2. Dependency Health (20%)
  3. Maintenance Activity (20%)
  4. Testing & CI Health (20%)
  5. Code Quality & Architecture Signals (20%)
- **Honest Confidence Score:** Tracks the ratio of assessed signals against available metadata, distinguishing between "zero activity" and "metadata unavailable".

### 3.5 AI Revival Engine: Pluggable Architecture with Local Inference
- **Provider Interface:** `AIProvider` contract with pluggable backends (`OllamaProvider`, `FallbackDeterministicProvider`).
- **Default Provider:** Local Ollama instance serving `glm-4.7-flash:latest` (or user-configured model via `AI_MODEL`).
- **Fallback Resilience:** If Ollama is offline or times out, the `FallbackDeterministicProvider` generates a structured, evidence-based synthesis without hallucinations or runtime crashes.
- **Prompt Injection Defense:** Strict delimitation of untrusted code snippets, system prompt boundaries, JSON mode output, and Zod runtime schema validation.

---

## 4. Scope & Boundary Matrix

### 4.1 P0: Mandatory MVP (Stage 2 Target)
- [x] Cyberpunk developer landing page with live repo submission.
- [x] Strict GitHub public URL parsing, normalization, and SSRF prevention.
- [x] Secure shallow repository retrieval (`git clone --depth 1`).
- [x] Multi-ecosystem detection (JS/TS, Python, Go, Rust, Java, PHP, Ruby).
- [x] Manifest inspection (`package.json`, `requirements.txt`, `Cargo.toml`, `go.mod`, etc.).
- [x] Documentation completeness audit (`README`, `LICENSE`, `CONTRIBUTING`, etc.).
- [x] Git maintenance signals (last commit, age, author counts, TODO/FIXME markers).
- [x] Deterministic 100-point Revival Score & confidence calculation.
- [x] Streaming 8-stage progress tracker (SSE).
- [x] Pluggable Ollama integration with prompt injection defenses and Zod validation.
- [x] Interactive Results Dashboard with expandable file evidence.
- [x] Actionable Revival Roadmap (Immediate, Short-Term, Long-Term).
- [x] Export report as Markdown (`REVIVAL_REPORT.md`) and JSON.
- [x] Safe filesystem isolation and automatic temporary directory cleanup.
- [x] Automated test suite (`bun test` / Node test runner).

### 4.2 P1: If Time Permits
- GitHub public REST API integration for issues/PR activity metadata.
- Ecosystem-specific vulnerability checks via trustworthy public advisory endpoints.
- Scan history stored in browser `localStorage`.

### 4.3 P2: Explicitly Out of Scope (Future Roadmap)
- Private repository support or GitHub OAuth user logins.
- Automatic PR creation or automated code modification.
- Multi-tenant cloud databases or user authentication.
- Automated execution of repository build scripts or tests (strictly prohibited).

---

## 5. Execution Commands & Quickstart

```bash
# 1. Install dependencies (strictly pinning Next.js 16.0.10)
bun install
# or: corepack npm install

# 2. Configure environment
cp .env.example .env.local

# 3. Run development server
bun run dev
# or: corepack npm run dev

# 4. Run test suite
bun test
# or: corepack npm test

# 5. Production build and verification
bun run build
bun run start
```

---

## 6. Handover to Stage 2
Stage 1 Planning establishes the complete architecture, task graph, security rules, and acceptance criteria. All artifacts are committed and ready for the implementation model (**T3 Code OpenCode provider — Big Pickle**).
