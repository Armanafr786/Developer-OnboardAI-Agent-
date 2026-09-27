# 🤖 OnboardAI

> **Autonomous Developer Onboarding Agent**  
> Built for the **lablab.ai IBM Bob 2.0 Hackathon**

OnboardAI points at any GitHub repository or local folder and, in seconds, produces five complete onboarding documents using IBM Bob as the primary AI engine (with Groq as a fallback). New developers go from zero to productive in minutes instead of days.

---

## Table of Contents

1. [What It Does](#what-it-does)
2. [Live Demo](#live-demo)
3. [Generated Outputs](#generated-outputs)
4. [Architecture](#architecture)
5. [Project Structure](#project-structure)
6. [Prerequisites](#prerequisites)
7. [Installation](#installation)
8. [Configuration](#configuration)
9. [Running the Project](#running-the-project)
10. [Using the Web UI](#using-the-web-ui)
11. [Using the CLI](#using-the-cli)
12. [REST API Reference](#rest-api-reference)
13. [AI Engine Chain](#ai-engine-chain)
14. [Supported Frameworks](#supported-frameworks)
15. [Self-Healing Tests](#self-healing-tests)
16. [Running Tests](#running-tests)
17. [Key Files](#key-files)

---

## What It Does

A developer joins a new team. They stare at an unfamiliar repository with no README, no architecture docs, and no guide for getting started. OnboardAI solves this in one command:

```
node cli.js https://github.com/org/repo
```

Within seconds (using parallel AI agents), five fully-written documents appear in your `output/` folder, ready to copy into your repository.

---

## Live Demo

1. Start the server: `npm start`
2. Open `http://localhost:3000`
3. Paste a GitHub URL or local path
4. Watch the live log stream as 5 documents are generated in parallel
5. Read, copy, or download each document from the tabbed viewer

---

## Generated Outputs

| File | Contents |
|------|----------|
| `README-GENERATED.md` | Project overview, tech stack badges, quick stats table, key components |
| `ARCHITECTURE.md` | Architecture narrative, layer diagram, framework evidence table, data flow |
| `GETTING-STARTED.md` | Prerequisites, numbered install steps, env setup, run commands, common fixes |
| `CODEBASE-TOUR.md` | 10-minute developer tour: repo map, entry points, top-5 files, gotchas, first task |
| `TESTS-GENERATED.js` | Mocha/Chai test suite with ≥12 test cases, self-healing retry loop |

---

## Architecture

```
User Input (URL or path)
        │
        ▼
   agent.js  ──── classifyInput() ────▶  local path
        │                          └──▶  git clone → .temp-repos/
        ▼
  analyzer.js  ──  walkDir() + scoreFile()  ──▶  snapshot (top 20 files)
        │
        ▼
 framework-detector.js  ──▶  { language, framework, evidenceFiles, summary }
        │
        ▼
  generator.js  ──  5 × aiGenerate() in parallel
        │              │
        │              ├─▶ Bob CLI  (primary)
        │              ├─▶ Groq API (fallback)
        │              └─▶ deterministic template (offline fallback)
        │
        ▼
  output/<run>/
  ├── README-GENERATED.md
  ├── ARCHITECTURE.md
  ├── GETTING-STARTED.md
  ├── CODEBASE-TOUR.md
  └── TESTS-GENERATED.js
        │
        ▼
  selfHealTests()  ──  run mocha → feed errors back → retry (max 3×)
```

**Data flow through the web server:**

```
Browser  ──GET /run?input=──▶  server.js  ──▶  agent.run()  ──▶  SSE stream
Browser  ◀── SSE events ─────  (log / complete / error)
Browser  ──GET /file?path=──▶  server.js  ──▶  res.download()
Browser  ──POST /api/analyze─▶  server.js  ──▶  agent.run()  ──▶  JSON response
```

---

## Project Structure

```
OnboardAI/
├── agent.js              # Orchestrator: input classification, clone, pipeline
├── analyzer.js           # Repo walker, file scorer, snapshot builder
├── framework-detector.js # Detects language & framework from root files
├── generator.js          # AI prompt builders, engine chain, self-healing tests
├── server.js             # Express server: SSE /run, /api/analyze, /file
├── cli.js                # CLI wrapper with argument parser and banner
├── test-framework.js     # Mocha test suite for the pipeline itself
├── public/
│   └── index.html        # Dark-mode web UI (tabs, markdown render, download)
├── output/               # Generated docs written here (git-ignored)
├── .env.example          # Template for environment variables
├── .env                  # Your local config (never committed)
├── package.json
└── README.md             # This file
```

---

## Prerequisites

- **Node.js ≥ 18** (uses built-in `fetch` and ESM-compatible modules)
- **npm** (comes with Node.js)
- **Git** (required for cloning remote repositories)
- **IBM Bob CLI** installed and on your `PATH` *(primary AI engine — no API key needed)*
- **Groq API key** *(optional — used as fallback when Bob is unavailable)*

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-org/onboardai.git
cd onboardai

# 2. Install dependencies
npm install

# 3. Copy the environment template
cp .env.example .env
```

---

## Configuration

Edit `.env`:

```env
# Optional — used only when IBM Bob CLI is unavailable
GROQ_API_KEY=your_groq_api_key_here

# Web server port (default: 3000)
PORT=3000
```

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Optional | Groq API key for fallback LLM calls |
| `PORT` | Optional | Port for the web server (default `3000`) |

> **IBM Bob CLI** is the primary engine. If `bob do "..."` is on your `PATH` and responds, no API key is needed at all.

---

## Running the Project

### Web server (recommended)

```bash
npm start
# → http://localhost:3000
```

### Direct agent (no server)

```bash
node agent.js https://github.com/laravel/laravel
node agent.js /path/to/local/project
node agent.js .
```

### CLI wrapper

```bash
node cli.js https://github.com/expressjs/express
node cli.js --no-self-heal https://github.com/django/django
node cli.js --output ./my-docs .
```

---

## Using the Web UI

Open `http://localhost:3000` in your browser.

| UI Element | Description |
|-----------|-------------|
| **Input field** | Paste a GitHub URL or local absolute path |
| **Quick Try buttons** | One-click load of popular demo repos |
| **Run OnboardAI** | Starts the pipeline; streams live log via SSE |
| **Live timer** | Shows elapsed time in the header while running |
| **Status chip** | Idle / Running / Done ✓ / Error |
| **Live Log terminal** | Real-time progress; AI engine shown in purple (e.g. `[Bob CLI]`) |
| **Tabs** | README · Architecture · Getting Started · Codebase Tour · Tests |
| **Copy button** | Copies active tab content to clipboard |
| **Download button** | Downloads active tab as a file |
| **Codebase Metrics** | Files, lines, size, duration — updated after completion |
| **Stack badge** | Detected framework and language |
| **Download links** | Per-file download links for all 5 documents |
| **New Analysis** | Resets the UI to start a fresh run |

---

## Using the CLI

```bash
node cli.js <input> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `<input>` | GitHub/GitLab URL (`https://...`), SSH URL (`git@...`), local path, or `.` |

### Options

| Flag | Description |
|------|-------------|
| `--no-self-heal` | Skip the self-healing test retry loop |
| `--output <dir>` | Write output files to a custom directory |
| `--help`, `-h` | Show help message |

### Examples

```bash
# Remote GitHub repo
node cli.js https://github.com/laravel/laravel

# Local project folder
node cli.js E:\my-projects\my-laravel-app

# Current directory, skip self-healing
node cli.js --no-self-heal .

# Custom output directory
node cli.js --output ./docs https://github.com/expressjs/express
```

---

## REST API Reference

### `GET /health`

Health check.

```json
{ "status": "ok", "version": "1.0.0" }
```

---

### `GET /run?input=<url-or-path>`

Runs the full pipeline and streams Server-Sent Events (SSE).

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| `input` | ✅ | GitHub URL or local path |

**SSE event types:**

| Event | Payload | Description |
|-------|---------|-------------|
| `log` | `{ message }` | Progress log line (shown in terminal) |
| `complete` | see below | Pipeline finished successfully |
| `error` | `{ message }` | Pipeline failed |

**`complete` event payload:**

```json
{
  "framework": { "framework": "Express", "language": "JavaScript", "summary": "...", "evidenceFiles": ["package.json"] },
  "analysis":  { "totalFiles": 120, "totalLines": 8432, "totalBytes": 312000 },
  "elapsed":   "3.4",
  "outputDir": "/abs/path/to/output/run-1234567890",
  "paths": {
    "readmePath": "...",
    "archPath":   "...",
    "gsPath":     "...",
    "tourPath":   "...",
    "testsPath":  "..."
  },
  "files": {
    "readme":         "# Project...",
    "architecture":   "# Architecture...",
    "gettingStarted": "# Getting Started...",
    "tour":           "# Codebase Tour...",
    "tests":          "'use strict';\n..."
  }
}
```

---

### `POST /api/analyze`

Programmatic JSON API — no browser needed. Runs the pipeline synchronously and returns all 5 documents in one JSON response.

**Request:**

```bash
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{ "input": "https://github.com/expressjs/express" }'
```

**Response:**

```json
{
  "success": true,
  "framework": { "framework": "Express", "language": "JavaScript", ... },
  "analysis":  { "totalFiles": 120, "totalLines": 8432, "totalBytes": 312000 },
  "elapsed":   "3.4",
  "outputDir": "/abs/path/...",
  "files": {
    "readme":         "...",
    "architecture":   "...",
    "gettingStarted": "...",
    "tour":           "...",
    "tests":          "..."
  },
  "logs": ["🌐 [Mode] REMOTE MODE...", "✅ Git clone complete.", "..."]
}
```

---

### `GET /file?path=<absolute-path>`

Download a generated output file. Restricted to the `output/` directory.

```bash
curl "http://localhost:3000/file?path=/abs/path/to/output/run-123/README-GENERATED.md" \
  --output README-GENERATED.md
```

---

### `GET /output-files?dir=<outputDir>`

List all files in a previously generated output directory.

```json
{
  "files": [
    { "name": "README-GENERATED.md", "path": "...", "size": 4120 },
    { "name": "ARCHITECTURE.md",     "path": "...", "size": 3200 }
  ]
}
```

---

## AI Engine Chain

Every document is generated through a three-tier fallback chain:

```
1. IBM Bob CLI   →  bob do "<prompt>"   (primary — no API key needed)
        │
        ▼ (if unavailable or fails)
2. Groq API      →  llama-3.3-70b-versatile   (requires GROQ_API_KEY)
        │
        ▼ (if unavailable or no key)
3. Deterministic template   (always works, offline-safe)
```

The live log shows which engine responded for each document, coloured in purple:
```
  ✅ README-GENERATED.md complete [Bob CLI]
  ✅ ARCHITECTURE.md complete [Groq]
  ✅ GETTING-STARTED.md complete [fallback]
```

All 5 documents are generated **in parallel**, so total time ≈ time of the slowest single call.

---

## Supported Frameworks

| Language | Frameworks Detected |
|----------|-------------------|
| **PHP** | Laravel, WordPress, Symfony, CodeIgniter, PHP (generic) |
| **Python** | Django, FastAPI, Flask, Python (generic) |
| **JavaScript / TypeScript** | Next.js, Astro, Remix, NestJS, Angular, Svelte, Vue.js, React, Express, Hono, Elysia (Bun), Vite, Node.js (generic) |
| **Ruby** | Rails, Sinatra, Ruby (generic) |
| **Java / Kotlin** | Spring Boot, Quarkus, Java (Maven), Gradle project |
| **Go** | Gin, Fiber, Echo, Go (generic) |
| **Rust** | Actix-web, Axum, Rocket, Rust (generic) |
| **C#** | ASP.NET Core, .NET (generic) |
| **Runtime** | Bun, Deno |
| **Container** | Docker project (Dockerfile / docker-compose) |

Detection is based on root-level evidence files (`package.json`, `artisan`, `manage.py`, `go.mod`, etc.) — no source parsing required.

---

## Self-Healing Tests

After generating `TESTS-GENERATED.js`, OnboardAI runs it with Mocha and, if it fails, feeds the error output back to the AI to fix and regenerate — up to 3 times.

```
1. Generate test file via AI
2. Run: npx mocha TESTS-GENERATED.js
3. If FAIL → send errors to AI → rewrite file → go to 2
4. After 3 attempts → keep best result
```

Disable with `--no-self-heal` or `selfHeal: false` in the API.

---

## Running Tests

```bash
# Run the project's own test suite
npm test

# Watch mode
npm run test:watch
```

Tests cover: framework detection, codebase analysis, agent input classification, and server routes.

---

## Key Files

| File | Purpose |
|------|---------|
| [`agent.js`](agent.js) | Top-level orchestrator. Classifies input, clones remote repos, runs the pipeline, cleans up |
| [`analyzer.js`](analyzer.js) | Walks the repo, scores files by importance, builds a content snapshot for AI prompts |
| [`framework-detector.js`](framework-detector.js) | Inspects root files to identify language and framework |
| [`generator.js`](generator.js) | Builds all 5 AI prompts, calls the engine chain, writes output files, runs self-healing |
| [`server.js`](server.js) | Express app: SSE streaming endpoint, JSON API, file download route |
| [`cli.js`](cli.js) | Terminal interface with argument parsing, usage help, and formatted output |
| [`public/index.html`](public/index.html) | Single-page dark UI: tabbed markdown viewer, live log, metrics, copy/download |

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

*Built with ❤️ using IBM Bob · lablab.ai Hackathon 2.0*
