'use strict';

const fs           = require('fs');
const path         = require('path');
const { execSync, spawnSync } = require('child_process');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format bytes to a human-readable string. */
function fmtBytes(b) {
  if (b < 1024)        return `${b} B`;
  if (b < 1024 ** 2)   return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 ** 2).toFixed(1)} MB`;
}

/** Pull text between ---output--- markers (Bob CLI convention). */
function extractBobOutput(raw) {
  const match = raw.match(/---output---\s*([\s\S]*?)\s*(?:---end---|$)/);
  return match ? match[1].trim() : raw.trim();
}

/**
 * Call IBM Bob CLI: `bob do "<prompt>"`
 * Returns extracted output or null on failure.
 */
function callBobCLI(prompt) {
  try {
    const escaped = prompt.replace(/"/g, '\\"').replace(/\n/g, ' ');
    const result  = spawnSync('bob', ['do', escaped], {
      encoding: 'utf8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024,
    });
    if (result.status === 0 && result.stdout) {
      return extractBobOutput(result.stdout);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Call Groq API as fallback (llama-3.3-70b-versatile).
 * Requires GROQ_API_KEY in environment.
 */
async function callGroq(prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  // Use Node 18+ built-in fetch
  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4096,
        temperature: 0.3,
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

/**
 * Generate content via AI (Bob CLI → Groq → deterministic fallback).
 * @param {string} prompt
 * @param {string} fallback - Used when both AI engines are unavailable.
 * @param {Function} [onEngine] - Called with the engine name that responded.
 */
async function aiGenerate(prompt, fallback, onEngine) {
  const bob = callBobCLI(prompt);
  if (bob) { if (onEngine) onEngine('Bob CLI'); return bob; }

  const groq = await callGroq(prompt);
  if (groq) { if (onEngine) onEngine('Groq'); return groq; }

  if (onEngine) onEngine('fallback');
  return fallback;
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function snapshotText(snapshot) {
  return snapshot.map(f =>
    `### ${f.relPath} (${f.lines} lines, priority ${f.priority})\n\`\`\`\n${f.content}\n\`\`\``
  ).join('\n\n');
}

function buildReadmePrompt(info) {
  return `You are a senior software engineer writing onboarding documentation.

Project: ${info.framework.framework} (${info.framework.language})
${info.framework.summary}

Codebase stats:
- Total files: ${info.analysis.totalFiles}
- Total lines: ${info.analysis.totalLines.toLocaleString()}
- Total size: ${fmtBytes(info.analysis.totalBytes)}

Key files detected:
${info.analysis.files.slice(0, 15).map(f => `  - ${f.relPath} (priority ${f.priority})`).join('\n')}

File snapshots:
${snapshotText(info.analysis.snapshot.slice(0, 8))}

Write a comprehensive README-GENERATED.md with:
1. Project Overview (what it does, tech stack badge list)
2. Quick Stats table (files, lines, size, language, framework)
3. Project Structure (key directories and their purpose)
4. Key Components (top files/modules with one-line descriptions)
5. Configuration overview

Use markdown. Be specific to this codebase.`;
}

function buildArchitecturePrompt(info) {
  return `You are a senior software architect writing technical documentation.

Project: ${info.framework.framework} (${info.framework.language})
${info.framework.summary}

Evidence files that triggered detection: ${info.framework.evidenceFiles.join(', ')}

File snapshots:
${snapshotText(info.analysis.snapshot.slice(0, 10))}

Write a detailed ARCHITECTURE.md with:
1. Architecture Overview (1-2 paragraph narrative)
2. Layer diagram using ASCII art or markdown table
3. Framework Detection Evidence Table (Evidence File | What It Proves | Framework Signal)
4. Key modules and their responsibilities
5. Data flow description (request → response path)
6. External dependencies and integrations

Use markdown. Be specific to this codebase.`;
}

function buildGettingStartedPrompt(info) {
  return `You are a developer advocate writing a beginner-friendly getting started guide.

Project: ${info.framework.framework} (${info.framework.language})
${info.framework.summary}

File snapshots:
${snapshotText(info.analysis.snapshot.slice(0, 6))}

Write a complete GETTING-STARTED.md with:
1. Prerequisites (runtime version, package manager, required tools)
2. Installation steps (numbered, copy-paste ready)
3. Environment setup (.env variables, config files)
4. Running the application (dev mode, production mode)
5. Running tests
6. Common issues & fixes (at least 3 entries)
7. Next steps for a new developer

Use markdown code blocks for all commands.`;
}

function buildCodebaseTourPrompt(info) {
  const topFiles = info.analysis.snapshot.slice(0, 12);
  return `You are a senior engineer writing an interactive developer tour for a new team member.

Project: ${info.framework.framework} (${info.framework.language})
${info.framework.summary}

All files (sorted by importance):
${info.analysis.files.slice(0, 30).map((f, i) => `  ${i + 1}. ${f.relPath} (priority ${f.priority}, ${f.lines} lines)`).join('\n')}

Key file snapshots:
${snapshotText(topFiles)}

Write a complete CODEBASE-TOUR.md that a developer can read in 10 minutes to become productive. Include:
1. **Welcome & What This Project Does** (2–3 sentences, plain English)
2. **Repository Map** — ASCII tree of key folders with one-line purpose for each
3. **Entry Points** — Exactly where execution starts (e.g. main file, server boot, CLI command)
4. **The 5 Most Important Files** — Table with file path, purpose, and what to read first
5. **Key Data Flows** — Numbered steps showing a typical request/operation from start to finish
6. **Where to Make Common Changes** — Table: "I want to add a route" → which file to edit
7. **Gotchas & Surprises** — At least 3 non-obvious things a new developer should know
8. **Your First Task** — A suggested small task to get hands-on experience

Use markdown. Be specific to this codebase. Prioritize clarity over completeness.`;
}

function buildTestsPrompt(info) {
  const topFiles = info.analysis.snapshot
    .filter(f => f.priority >= 50)
    .slice(0, 6);

  return `You are a QA engineer writing a Mocha test suite.

Project: ${info.framework.framework} (${info.framework.language})

Key source files to test:
${snapshotText(topFiles)}

Generate a complete Mocha/Chai test file (TESTS-GENERATED.js) that:
1. Uses require('assert') or require('chai').expect — no external test deps beyond mocha/chai
2. Has a describe block for each major module
3. Tests happy paths AND failure/edge cases
4. Includes at least 12 it() test cases total
5. Uses beforeEach/afterEach for setup/teardown where appropriate
6. Adds comments explaining what each test verifies

Output ONLY the JavaScript code, no markdown fences.`;
}

// ─── Self-healing test runner ──────────────────────────────────────────────────

/**
 * Run generated tests with npx mocha and return { passed, output }.
 */
function runTests(testFilePath) {
  const result = spawnSync('npx', ['mocha', '--timeout', '10000', testFilePath], {
    encoding: 'utf8', timeout: 60_000,
  });
  const output = (result.stdout || '') + (result.stderr || '');
  return { passed: result.status === 0, output };
}

/**
 * Self-healing loop: run tests → if fail, feed errors back to AI → retry.
 * @param {string} testFilePath
 * @param {string} originalPrompt
 * @param {number} [maxRetries=3]
 * @param {Function} log
 */
async function selfHealTests(testFilePath, originalPrompt, maxRetries, log) {
  maxRetries = maxRetries ?? 3;
  log        = log        ?? console.log;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    log(`🧪 [Self-Healing] Executing generated tests (attempt ${attempt}/${maxRetries})...`);
    const { passed, output } = runTests(testFilePath);

    if (passed) {
      log('✅ [Self-Healing] Tests passed!');
      return true;
    }

    log(`⚠️  [Self-Healing] Tests failed. Feeding errors back to AI...`);
    const healPrompt = `${originalPrompt}

The previous test file had failures. Here are the errors:
\`\`\`
${output.slice(0, 3000)}
\`\`\`

Fix the test file so all tests pass. Output ONLY the corrected JavaScript code.`;

    const healed = await aiGenerate(healPrompt, null);
    if (healed) {
      fs.writeFileSync(testFilePath, healed, 'utf8');
      log(`🔧 [Self-Healing] Rewrote test file with AI-suggested fixes.`);
    } else {
      log('⚠️  [Self-Healing] AI unavailable for healing; keeping current file.');
      break;
    }
  }

  const { passed } = runTests(testFilePath);
  if (!passed) log('⚠️  [Self-Healing] Max retries reached. Tests may have remaining issues.');
  return passed;
}

// ─── Deterministic fallbacks ──────────────────────────────────────────────────

function fallbackReadme(info) {
  const { framework, language, summary } = info.framework;
  const { totalFiles, totalLines, totalBytes } = info.analysis;
  return `# Project Documentation

> *Generated by OnboardAI*

## Overview
${summary}

## Tech Stack
- **Language:** ${language}
- **Framework:** ${framework}

## Quick Stats
| Metric | Value |
|--------|-------|
| Files | ${totalFiles} |
| Lines of Code | ${totalLines.toLocaleString()} |
| Total Size | ${fmtBytes(totalBytes)} |

## Key Files
${info.analysis.files.slice(0, 10).map(f => `- \`${f.relPath}\``).join('\n')}

## Getting Started
See \`GETTING-STARTED.md\` for setup instructions.
`;
}

function fallbackArchitecture(info) {
  const { framework, language, evidenceFiles } = info.framework;
  return `# Architecture

> *Generated by OnboardAI*

## Overview
This is a **${framework}** application written in **${language}**.

## Framework Detection Evidence
| Evidence File | Framework Signal |
|---------------|-----------------|
${evidenceFiles.map(f => `| \`${f}\` | ${framework} indicator |`).join('\n')}

## Key Modules
${info.analysis.files.filter(f => f.priority >= 70).slice(0, 10).map(f => `- \`${f.relPath}\``).join('\n')}
`;
}

function fallbackGettingStarted(info) {
  const { framework, language } = info.framework;
  return `# Getting Started

> *Generated by OnboardAI*

## Prerequisites
- ${language} runtime (see project docs for version)
- Package manager appropriate for ${framework}

## Installation
\`\`\`bash
# Clone the repository
git clone <repo-url>
cd <project-directory>

# Install dependencies
# (see package.json / composer.json / requirements.txt)
\`\`\`

## Running the Application
\`\`\`bash
# Start development server
# (refer to your ${framework} documentation)
\`\`\`
`;
}

function fallbackCodebaseTour(info) {
  const { framework, language } = info.framework;
  return `# Codebase Tour

> *Generated by OnboardAI*

## Welcome
This is a **${framework}** project written in **${language}**.

## Repository Map
\`\`\`
${info.analysis.files.slice(0, 15).map(f => `├── ${f.relPath}`).join('\n')}
\`\`\`

## Entry Points
${info.analysis.files.filter(f => f.priority >= 85).slice(0, 5).map(f => `- \`${f.relPath}\``).join('\n') || '- See project documentation'}

## Key Files
| File | Purpose |
|------|---------|
${info.analysis.files.slice(0, 5).map(f => `| \`${f.relPath}\` | Priority ${f.priority} file |`).join('\n')}

## Your First Task
1. Read the entry point file listed above.
2. Trace one request from entry to response.
3. Make a small change and verify it works.
`;
}

function fallbackTests(info) {
  const { framework } = info.framework;
  return `'use strict';
const assert = require('assert');

describe('OnboardAI Generated Tests — ${framework}', () => {
  it('should confirm framework detection result is defined', () => {
    const framework = ${JSON.stringify(info.framework)};
    assert.ok(framework.framework, 'Framework name should not be empty');
    assert.ok(framework.language, 'Language should not be empty');
  });

  it('should confirm analysis produced files', () => {
    const totalFiles = ${info.analysis.totalFiles};
    assert.ok(totalFiles > 0, 'Should have found at least one file');
  });

  it('should confirm evidence files array is non-empty', () => {
    const evidence = ${JSON.stringify(info.framework.evidenceFiles)};
    assert.ok(Array.isArray(evidence), 'evidenceFiles should be an array');
  });
});
`;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Generate all 4 documentation files in parallel.
 * @param {{
 *   framework: object,
 *   analysis: object,
 *   outputDir: string,
 *   log?: Function,
 *   selfHeal?: boolean
 * }} options
 * @returns {Promise<{ readme: string, architecture: string, gettingStarted: string, tests: string }>}
 */
async function generateDocs(options) {
  const { framework, analysis, outputDir, selfHeal = true } = options;
  const log = options.log ?? console.log;

  fs.mkdirSync(outputDir, { recursive: true });

  const info = { framework, analysis };

  log('🤖 Dispatching 5 parallel documentation subagents...');

  const [readme, architecture, gettingStarted, codebaseTour, tests] = await Promise.all([
    aiGenerate(buildReadmePrompt(info),         fallbackReadme(info),        e => log(`  ✅ README-GENERATED.md complete [${e}]`)),
    aiGenerate(buildArchitecturePrompt(info),   fallbackArchitecture(info),  e => log(`  ✅ ARCHITECTURE.md complete [${e}]`)),
    aiGenerate(buildGettingStartedPrompt(info), fallbackGettingStarted(info),e => log(`  ✅ GETTING-STARTED.md complete [${e}]`)),
    aiGenerate(buildCodebaseTourPrompt(info),   fallbackCodebaseTour(info),  e => log(`  ✅ CODEBASE-TOUR.md complete [${e}]`)),
    aiGenerate(buildTestsPrompt(info),          fallbackTests(info),         e => log(`  ✅ TESTS-GENERATED.js complete [${e}]`)),
  ]);

  // Write all 5 files
  const readmePath  = path.join(outputDir, 'README-GENERATED.md');
  const archPath    = path.join(outputDir, 'ARCHITECTURE.md');
  const gsPath      = path.join(outputDir, 'GETTING-STARTED.md');
  const tourPath    = path.join(outputDir, 'CODEBASE-TOUR.md');
  const testsPath   = path.join(outputDir, 'TESTS-GENERATED.js');

  fs.writeFileSync(readmePath,  readme,         'utf8');
  fs.writeFileSync(archPath,    architecture,   'utf8');
  fs.writeFileSync(gsPath,      gettingStarted, 'utf8');
  fs.writeFileSync(tourPath,    codebaseTour,   'utf8');
  fs.writeFileSync(testsPath,   tests,          'utf8');

  log(`📄 Output files written to: ${outputDir}`);

  // Self-healing test run
  if (selfHeal) {
    await selfHealTests(testsPath, buildTestsPrompt(info), 3, log);
  }

  return { readme, architecture, gettingStarted, codebaseTour, tests,
           paths: { readmePath, archPath, gsPath, tourPath, testsPath } };
}

module.exports = { generateDocs, aiGenerate, selfHealTests, fmtBytes,
                   buildCodebaseTourPrompt, buildReadmePrompt,
                   buildArchitecturePrompt, buildGettingStartedPrompt, buildTestsPrompt };
