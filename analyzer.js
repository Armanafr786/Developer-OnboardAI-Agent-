'use strict';

const fs   = require('fs');
const path = require('path');

/** Directories to skip entirely during traversal. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'vendor',
  '__pycache__', '.next', '.nuxt', 'coverage', '.nyc_output',
  '.cache', 'tmp', 'temp', '.temp-repos', 'target', 'bin', 'obj',
]);

/** Priority score table — higher = more important to include in snapshot. */
const PRIORITY_MAP = {
  // Dependency / manifest files
  'package.json':      100, 'composer.json':   100, 'requirements.txt': 100,
  'go.mod':            100, 'Cargo.toml':       100, 'Gemfile':          100,
  'pom.xml':           100, 'build.gradle':     100, 'build.gradle.kts': 100,
  'pyproject.toml':    100,

  // Framework entry points
  'artisan':            85, 'manage.py':         85, 'server.js':         85,
  'index.js':           85, 'main.py':            85, 'app.py':            85,
  'main.go':            85, 'main.rs':            85, 'Program.cs':        85,
  'bootstrap/app.php':  85, 'config/routes.rb':   85,

  // Well-known config / readme
  'README.md':          75, '.env.example':       75, 'Dockerfile':        75,
  'docker-compose.yml': 75, '.github':             75,
};

/** Score a file by its basename or relative path. */
function scoreFile(relPath) {
  const base = path.basename(relPath);

  if (PRIORITY_MAP[relPath] !== undefined) return PRIORITY_MAP[relPath];
  if (PRIORITY_MAP[base]    !== undefined) return PRIORITY_MAP[base];

  // Controllers / Models / Routes directories → 70
  const lower = relPath.toLowerCase();
  if (/\/(controllers?|models?|routes?|handlers?|views?|services?|repositories?)\//.test(lower)) return 70;

  // Standard source code files → 50
  if (/\.(js|ts|jsx|tsx|py|php|rb|go|rs|java|kt|cs|swift|cpp|c|h|vue|svelte)$/.test(base)) return 50;

  // Config / data files → 30
  if (/\.(json|yaml|yml|toml|ini|cfg|conf|env)$/.test(base)) return 30;

  // Markdown / docs → 20
  if (/\.(md|rst|txt)$/.test(base)) return 20;

  return 10;
}

/**
 * Recursively walk a directory and collect file metadata.
 * @param {string} dir      - Directory to walk.
 * @param {string} rootPath - Repository root (used to compute relative paths).
 * @param {object[]} results - Accumulator array.
 */
function walkDir(dir, rootPath, results) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // unreadable directory — skip
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    const relPath  = path.relative(rootPath, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      walkDir(fullPath, rootPath, results);
    } else if (entry.isFile()) {
      let size = 0;
      let lines = 0;
      try {
        const stat    = fs.statSync(fullPath);
        size          = stat.size;
        const content = fs.readFileSync(fullPath, 'utf8');
        lines         = content.split('\n').length;
      } catch {
        // binary or unreadable file — still register it, just skip content
      }
      results.push({ fullPath, relPath, size, lines, priority: scoreFile(relPath) });
    }
  }
}

/**
 * Read a file safely, returning content (trimmed to maxChars).
 * @param {string} fullPath
 * @param {number} [maxChars=8000]
 */
function readFileSafe(fullPath, maxChars = 8000) {
  try {
    const raw = fs.readFileSync(fullPath, 'utf8');
    return raw.length > maxChars ? raw.slice(0, maxChars) + '\n… [truncated]' : raw;
  } catch {
    return '[binary or unreadable]';
  }
}

/**
 * Analyze a repository and return a snapshot suitable for documentation generation.
 * @param {string} repoPath - Absolute path to repository root.
 * @param {number} [snapshotLimit=20] - Max files to include in the content snapshot.
 * @returns {{
 *   totalFiles: number,
 *   totalLines: number,
 *   totalBytes: number,
 *   files: object[],
 *   snapshot: { relPath: string, content: string }[]
 * }}
 */
function analyzeRepo(repoPath, snapshotLimit = 20) {
  const allFiles = [];
  walkDir(repoPath, repoPath, allFiles);

  // Aggregate stats
  const totalFiles = allFiles.length;
  const totalLines = allFiles.reduce((s, f) => s + f.lines, 0);
  const totalBytes = allFiles.reduce((s, f) => s + f.size,  0);

  // Sort by priority desc, then by lines desc (prefer larger meaningful files)
  const sorted = [...allFiles].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.lines - a.lines;
  });

  // Build snapshot: top-ranked files with their content
  const snapshot = sorted.slice(0, snapshotLimit).map(f => ({
    relPath: f.relPath,
    priority: f.priority,
    lines: f.lines,
    content: readFileSafe(f.fullPath),
  }));

  // Light-weight file list (no content) for reporting
  const files = sorted.map(({ fullPath: _, ...rest }) => rest);

  return { totalFiles, totalLines, totalBytes, files, snapshot };
}

module.exports = { analyzeRepo, walkDir, scoreFile };
