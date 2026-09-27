'use strict';

require('dotenv').config();

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { run } = require('./agent');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── CORS (for hackathon demo / external callers) ─────────────────────────────
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (_req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── SSE helper ───────────────────────────────────────────────────────────────

function setupSSE(res) {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (res.flush) res.flush(); // compression middleware compat
  };

  return send;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/** GET /health */
app.get('/health', (_req, res) => res.json({ status: 'ok', version: '1.0.0' }));

/**
 * GET /run?input=<url-or-path>
 * Streams real-time SSE events while running the OnboardAI pipeline.
 */
app.get('/run', async (req, res) => {
  const input = (req.query.input || '').trim();
  if (!input) {
    return res.status(400).json({ error: 'Missing required query param: input' });
  }

  const send = setupSSE(res);

  send('status', { message: `Starting OnboardAI for: ${input}` });

  const log = (message) => {
    // Mirror to console and stream to client
    console.log(message);
    send('log', { message });
  };

  const outputDir = path.join(__dirname, 'output', `run-${Date.now()}`);

  try {
    const result = await run(input, { log, outputDir, selfHeal: false });

    if (!result) {
      send('error', { message: 'Pipeline returned no result. Check input.' });
      return res.end();
    }

    // Read generated file contents to stream to client
    const readFile = (p) => {
      try { return fs.readFileSync(p, 'utf8'); }
      catch { return ''; }
    };

    const files = {
      readme:         readFile(result.paths.readmePath),
      architecture:   readFile(result.paths.archPath),
      gettingStarted: readFile(result.paths.gsPath),
      tour:           readFile(result.paths.tourPath),
      tests:          readFile(result.paths.testsPath),
    };

    send('complete', {
      framework:   result.framework,
      analysis: {
        totalFiles: result.analysis.totalFiles,
        totalLines: result.analysis.totalLines,
        totalBytes: result.analysis.totalBytes,
      },
      elapsed:     result.elapsed,
      outputDir:   result.outputDir,
      paths:       result.paths,
      files,
    });

  } catch (err) {
    console.error('Pipeline error:', err);
    send('error', { message: err.message || 'Unexpected error during pipeline.' });
  }

  res.end();
});

/**
 * GET /output-files?dir=<outputDir>
 * List previously generated output files.
 */
app.get('/output-files', (req, res) => {
  const dir = req.query.dir;
  if (!dir || !fs.existsSync(dir)) return res.json({ files: [] });
  try {
    const files = fs.readdirSync(dir).map(f => ({
      name: f,
      path: path.join(dir, f),
      size: fs.statSync(path.join(dir, f)).size,
    }));
    res.json({ files });
  } catch {
    res.json({ files: [] });
  }
});

/**
 * GET /file?path=<absolute-path>
 * Serve a single generated output file for download.
 */
app.get('/file', (req, res) => {
  const filePath = req.query.path;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  // Restrict to output directory only for security
  const outputBase = path.join(__dirname, 'output');
  if (!filePath.startsWith(outputBase)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  res.download(filePath);
});

/**
 * POST /api/analyze
 * JSON body: { "input": "<url-or-path>" }
 * Returns the full pipeline result as JSON (no streaming).
 * Useful for programmatic / CI use.
 */
app.post('/api/analyze', async (req, res) => {
  const input = (req.body?.input || '').trim();
  if (!input) {
    return res.status(400).json({ error: 'Missing required field: input' });
  }

  const outputDir = path.join(__dirname, 'output', `api-${Date.now()}`);
  const logs = [];
  const log  = (msg) => { console.log(msg); logs.push(msg); };

  try {
    const result = await run(input, { log, outputDir, selfHeal: false });
    if (!result) {
      return res.status(422).json({ error: 'Pipeline returned no result. Check input.', logs });
    }

    const readFile = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

    res.json({
      success:   true,
      framework: result.framework,
      analysis: {
        totalFiles: result.analysis.totalFiles,
        totalLines: result.analysis.totalLines,
        totalBytes: result.analysis.totalBytes,
      },
      elapsed:   result.elapsed,
      outputDir: result.outputDir,
      files: {
        readme:         readFile(result.paths.readmePath),
        architecture:   readFile(result.paths.archPath),
        gettingStarted: readFile(result.paths.gsPath),
        tour:           readFile(result.paths.tourPath),
        tests:          readFile(result.paths.testsPath),
      },
      logs,
    });
  } catch (err) {
    console.error('API pipeline error:', err);
    res.status(500).json({ error: err.message || 'Unexpected error', logs });
  }
});

// ─── Start server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀 OnboardAI Server running at http://localhost:${PORT}`);
  console.log(`   Open your browser and enter a GitHub URL or local path.`);
  console.log(`   POST /api/analyze  →  programmatic JSON API\n`);
});

module.exports = app; // for testing with supertest
