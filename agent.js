'use strict';

const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { detectFramework } = require('./framework-detector');
const { analyzeRepo }     = require('./analyzer');
const { generateDocs, fmtBytes } = require('./generator');

// ─── Input classifier ─────────────────────────────────────────────────────────

/**
 * Determine whether the input is a remote URL, a local path, or unknown.
 * @param {string} input
 * @returns {'remote'|'local'|'unknown'}
 */
function classifyInput(input) {
  if (!input) return 'unknown';
  const trimmed = input.trim();

  // Remote patterns
  if (/^https?:\/\//i.test(trimmed)) return 'remote';
  if (/^git@/i.test(trimmed))        return 'remote';

  // Current-directory shorthand
  if (trimmed === '.')                return 'local';

  // Absolute Windows paths (C:\, E:\, etc.)
  if (/^[A-Za-z]:[/\\]/.test(trimmed)) return 'local';

  // Absolute Unix paths
  if (trimmed.startsWith('/'))        return 'local';

  // Relative paths
  if (trimmed.startsWith('./') || trimmed.startsWith('../')) return 'local';

  return 'unknown';
}

/** Extract a friendly repo name from a URL. */
function repoNameFromUrl(url) {
  const base = url.split('/').pop().replace(/\.git$/, '') || 'repo';
  return base.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// ─── Remote mode ─────────────────────────────────────────────────────────────

/**
 * Clone a remote repository to .temp-repos/<name>.
 * @param {string} url
 * @param {Function} log
 * @returns {string} clonedPath
 */
function cloneRepo(url, log) {
  const tempBase  = path.join(__dirname, '.temp-repos');
  fs.mkdirSync(tempBase, { recursive: true });

  const repoName  = repoNameFromUrl(url);
  const clonePath = path.join(tempBase, repoName);

  // Remove stale clone if exists
  if (fs.existsSync(clonePath)) {
    log(`🗑️  Removing stale clone at ${clonePath}...`);
    fs.rmSync(clonePath, { recursive: true, force: true });
  }

  log(`🚀 Cloning repository: ${url}`);
  const result = spawnSync('git', ['clone', '--depth', '1', url, clonePath], {
    encoding: 'utf8', timeout: 120_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    const errMsg = result.stderr || result.stdout || 'Unknown git error';
    throw new Error(`Git clone failed:\n${errMsg}`);
  }

  log('✅ Git clone complete.');
  return clonePath;
}

/** Remove the temporary clone directory. */
function cleanupClone(clonePath, log) {
  try {
    fs.rmSync(clonePath, { recursive: true, force: true });
    log(`🧹 Cleaned up temporary clone: ${clonePath}`);
  } catch (err) {
    log(`⚠️  Could not clean up ${clonePath}: ${err.message}`);
  }
}

// ─── Core pipeline ───────────────────────────────────────────────────────────

/**
 * Run the full OnboardAI pipeline on a resolved local path.
 *
 * @param {object} opts
 * @param {string}   opts.repoPath   - Absolute path to the repository root.
 * @param {string}   opts.outputDir  - Where to write generated files.
 * @param {Function} [opts.log]      - Progress logger (defaults to console.log).
 * @param {boolean}  [opts.selfHeal] - Whether to run self-healing test loop.
 * @returns {Promise<object>} Pipeline result object.
 */
async function runPipeline({ repoPath, outputDir, log, selfHeal = true }) {
  log = log ?? console.log;

  const start = Date.now();

  // Step 1 – Analyze + detect
  log('🔍 Analyzing codebase files and detecting framework...');
  const [analysis, framework] = await Promise.all([
    Promise.resolve(analyzeRepo(repoPath)),
    Promise.resolve(detectFramework(repoPath)),
  ]);

  log(`🎯 Detected Framework: ${framework.framework} (${framework.language})`);
  log(`📊 Codebase: ${analysis.totalFiles} files · ${analysis.totalLines.toLocaleString()} lines · ${fmtBytes(analysis.totalBytes)}`);

  // Step 2 – Generate 4 docs in parallel
  const result = await generateDocs({
    framework,
    analysis,
    outputDir,
    log,
    selfHeal,
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log(`🎉 OnboardAI Pipeline Complete in ${elapsed} seconds!`);
  log(`📁 Output directory: ${outputDir}`);

  return {
    framework,
    analysis,
    elapsed,
    outputDir,
    paths: result.paths,
  };
}

// ─── Main exported function ───────────────────────────────────────────────────

/**
 * Entry point for OnboardAI.
 *
 * @param {string}   input      - GitHub URL, local path, or "."
 * @param {object}   [options]
 * @param {string}   [options.outputDir]  - Override output directory.
 * @param {Function} [options.log]        - Progress logger.
 * @param {boolean}  [options.selfHeal]   - Enable self-healing tests (default true).
 * @returns {Promise<object>}
 */
async function run(input, options = {}) {
  const log = options.log ?? console.log;
  const mode = classifyInput(input);

  let repoPath;
  let clonedPath = null;

  if (mode === 'remote') {
    log(`🌐 [Mode] REMOTE MODE detected for URL: ${input}`);
    clonedPath = cloneRepo(input.trim(), log);
    repoPath   = clonedPath;
  } else if (mode === 'local') {
    const resolved = input.trim() === '.' ? process.cwd() : path.resolve(input.trim());
    log(`📁 [Mode] LOCAL MODE detected for path: ${resolved}`);

    if (!fs.existsSync(resolved)) {
      log(`❌ Error: Path does not exist: ${resolved}`);
      process.exitCode = 1;
      return null;
    }
    repoPath = resolved;
  } else {
    log(`❓ Unknown input: "${input}"`);
    log('');
    log('Usage:');
    log('  node agent.js https://github.com/user/repo   (remote)');
    log('  node agent.js E:\\my-projects\\my-app          (local)');
    log('  node agent.js .                               (current directory)');
    process.exitCode = 1;
    return null;
  }

  // Determine output directory
  const outputDir = options.outputDir ??
    path.join(__dirname, 'output', path.basename(repoPath));

  try {
    const result = await runPipeline({
      repoPath,
      outputDir,
      log,
      selfHeal: options.selfHeal ?? true,
    });
    return result;
  } finally {
    // Always clean up remote clone, never touch local path
    if (clonedPath) cleanupClone(clonedPath, log);
  }
}

module.exports = { run, classifyInput, runPipeline, cloneRepo };

// ─── Direct execution ────────────────────────────────────────────────────────
if (require.main === module) {
  const input = process.argv[2];

  if (!input) {
    console.log('OnboardAI — Autonomous Developer Onboarding Agent');
    console.log('');
    console.log('Usage:');
    console.log('  node agent.js https://github.com/user/repo   (remote GitHub repo)');
    console.log('  node agent.js E:\\my-projects\\my-app          (local path)');
    console.log('  node agent.js .                               (current directory)');
    process.exit(1);
  }

  run(input).then(result => {
    if (!result) process.exit(1);
    process.exit(0);
  }).catch(err => {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  });
}
