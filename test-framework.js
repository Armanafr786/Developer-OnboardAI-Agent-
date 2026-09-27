'use strict';

/**
 * test-framework.js
 * Mocha test suite for framework-detector.js
 *
 * Run with:  npx mocha test-framework.js
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');

const { detectFramework } = require('./framework-detector');

// ─── Test fixture builder ─────────────────────────────────────────────────────

/**
 * Create a temporary directory with the given file tree and return its path.
 * @param {{ [relPath: string]: string }} files  - Map of relative path → content
 * @returns {string} tmpDir
 */
function makeTempProject(files) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onboardai-test-'));
  for (const [relPath, content] of Object.entries(files)) {
    const full = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  }
  return tmpDir;
}

/** Remove a temp directory after a test. */
function removeTempDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); }
  catch { /* best-effort */ }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('detectFramework()', () => {

  // ── PHP ─────────────────────────────────────────────────────────────────────
  describe('PHP', () => {
    let tmpDir;
    afterEach(() => removeTempDir(tmpDir));

    it('should detect Laravel via artisan', () => {
      tmpDir = makeTempProject({
        'artisan': '#!/usr/bin/env php\n<?php\n',
        'composer.json': JSON.stringify({ require: { 'laravel/framework': '^10.0' } }),
      });
      const result = detectFramework(tmpDir);
      assert.strictEqual(result.language,  'PHP');
      assert.strictEqual(result.framework, 'Laravel');
      assert.ok(result.evidenceFiles.includes('artisan'));
    });

    it('should detect WordPress via wp-config.php', () => {
      tmpDir = makeTempProject({ 'wp-config.php': '<?php define("DB_NAME","wp");' });
      const result = detectFramework(tmpDir);
      assert.strictEqual(result.language,  'PHP');
      assert.strictEqual(result.framework, 'WordPress');
    });

    it('should detect Symfony via composer.json', () => {
      tmpDir = makeTempProject({
        'composer.json': JSON.stringify({ require: { 'symfony/framework-bundle': '^6.0' } }),
      });
      const result = detectFramework(tmpDir);
      assert.strictEqual(result.language,  'PHP');
      assert.strictEqual(result.framework, 'Symfony');
    });

    it('should fall back to PHP (generic) for unknown composer.json', () => {
      tmpDir = makeTempProject({
        'composer.json': JSON.stringify({ require: { 'monolog/monolog': '^3.0' } }),
      });
      const result = detectFramework(tmpDir);
      assert.strictEqual(result.language, 'PHP');
      assert.match(result.framework, /generic/i);
    });
  });

  // ── Python ───────────────────────────────────────────────────────────────────
  describe('Python', () => {
    let tmpDir;
    afterEach(() => removeTempDir(tmpDir));

    it('should detect Django via manage.py', () => {
      tmpDir = makeTempProject({ 'manage.py': '#!/usr/bin/env python\nimport django\n' });
      const result = detectFramework(tmpDir);
      assert.strictEqual(result.language,  'Python');
      assert.strictEqual(result.framework, 'Django');
    });

    it('should detect FastAPI via requirements.txt', () => {
      tmpDir = makeTempProject({ 'requirements.txt': 'fastapi==0.100.0\nuvicorn\n' });
      const result = detectFramework(tmpDir);
      assert.strictEqual(result.language,  'Python');
      assert.strictEqual(result.framework, 'FastAPI');
    });

    it('should detect Flask via requirements.txt', () => {
      tmpDir = makeTempProject({ 'requirements.txt': 'Flask==3.0.0\n' });
      const result = detectFramework(tmpDir);
      assert.strictEqual(result.language,  'Python');
      assert.strictEqual(result.framework, 'Flask');
    });

    it('should fall back to Python (generic) for unknown requirements', () => {
      tmpDir = makeTempProject({ 'requirements.txt': 'numpy\npandas\n' });
      const result = detectFramework(tmpDir);
      assert.strictEqual(result.language, 'Python');
      assert.match(result.framework, /generic/i);
    });
  });

  // ── JavaScript / TypeScript ──────────────────────────────────────────────────
  describe('JavaScript / TypeScript', () => {
    let tmpDir;
    afterEach(() => removeTempDir(tmpDir));

    it('should detect Next.js via next.config.js', () => {
      tmpDir = makeTempProject({
        'package.json':    JSON.stringify({ dependencies: { next: '^14.0.0', react: '^18.0.0' } }),
        'next.config.js':  'module.exports = {};\n',
      });
      const result = detectFramework(tmpDir);
      assert.strictEqual(result.framework, 'Next.js');
    });

    it('should detect NestJS via @nestjs/core', () => {
      tmpDir = makeTempProject({
        'package.json': JSON.stringify({ dependencies: { '@nestjs/core': '^10.0.0' } }),
      });
      const result = detectFramework(tmpDir);
      assert.strictEqual(result.language,  'TypeScript');
      assert.strictEqual(result.framework, 'NestJS');
    });

    it('should detect Angular via @angular/core', () => {
      tmpDir = makeTempProject({
        'package.json': JSON.stringify({ dependencies: { '@angular/core': '^17.0.0' } }),
      });
      const result = detectFramework(tmpDir);
      assert.strictEqual(result.framework, 'Angular');
    });

    it('should detect Vue.js', () => {
      tmpDir = makeTempProject({
        'package.json': JSON.stringify({ dependencies: { vue: '^3.3.0' } }),
      });
      const result = detectFramework(tmpDir);
      assert.strictEqual(result.framework, 'Vue.js');
    });

    it('should detect React (without Next.js)', () => {
      tmpDir = makeTempProject({
        'package.json': JSON.stringify({ dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' } }),
      });
      const result = detectFramework(tmpDir);
      assert.strictEqual(result.framework, 'React');
    });

    it('should detect Express.js', () => {
      tmpDir = makeTempProject({
        'package.json': JSON.stringify({ dependencies: { express: '^4.18.0' } }),
      });
      const result = detectFramework(tmpDir);
      assert.strictEqual(result.language,  'JavaScript');
      assert.strictEqual(result.framework, 'Express');
    });

    it('should detect Svelte via svelte dep', () => {
      tmpDir = makeTempProject({
        'package.json': JSON.stringify({ devDependencies: { svelte: '^4.0.0' } }),
      });
      const result = detectFramework(tmpDir);
      assert.strictEqual(result.framework, 'Svelte');
    });

    it('should fall back to Node.js (generic) for plain package.json', () => {
      tmpDir = makeTempProject({
        'package.json': JSON.stringify({ dependencies: { lodash: '^4.17.21' } }),
      });
      const result = detectFramework(tmpDir);
      assert.match(result.framework, /generic/i);
    });
  });

  // ── Ruby ─────────────────────────────────────────────────────────────────────
  describe('Ruby', () => {
    let tmpDir;
    afterEach(() => removeTempDir(tmpDir));

    it('should detect Rails via Gemfile', () => {
      tmpDir = makeTempProject({ "Gemfile": "source 'https://rubygems.org'\ngem 'rails', '~> 7.0'\n" });
      const result = detectFramework(tmpDir);
      assert.strictEqual(result.language,  'Ruby');
      assert.strictEqual(result.framework, 'Rails');
    });

    it('should detect Sinatra via Gemfile', () => {
      tmpDir = makeTempProject({ 'Gemfile': "gem 'sinatra'\n" });
      const result = detectFramework(tmpDir);
      assert.strictEqual(result.framework, 'Sinatra');
    });
  });

  // ── Go ───────────────────────────────────────────────────────────────────────
  describe('Go', () => {
    let tmpDir;
    afterEach(() => removeTempDir(tmpDir));

    it('should detect Gin via go.mod', () => {
      tmpDir = makeTempProject({ 'go.mod': 'module example.com/app\n\nrequire github.com/gin-gonic/gin v1.9.1\n' });
      const result = detectFramework(tmpDir);
      assert.strictEqual(result.language,  'Go');
      assert.strictEqual(result.framework, 'Gin');
    });

    it('should detect Fiber via go.mod', () => {
      tmpDir = makeTempProject({ 'go.mod': 'module example.com/app\n\nrequire github.com/gofiber/fiber/v2 v2.50.0\n' });
      const result = detectFramework(tmpDir);
      assert.strictEqual(result.framework, 'Fiber');
    });

    it('should fall back to Go (generic) for plain go.mod', () => {
      tmpDir = makeTempProject({ 'go.mod': 'module example.com/myapp\n\ngo 1.21\n' });
      const result = detectFramework(tmpDir);
      assert.strictEqual(result.language, 'Go');
      assert.match(result.framework, /generic/i);
    });
  });

  // ── Rust ─────────────────────────────────────────────────────────────────────
  describe('Rust', () => {
    let tmpDir;
    afterEach(() => removeTempDir(tmpDir));

    it('should detect Actix-web via Cargo.toml', () => {
      tmpDir = makeTempProject({ 'Cargo.toml': '[dependencies]\nactix-web = "4"\n' });
      const result = detectFramework(tmpDir);
      assert.strictEqual(result.language,  'Rust');
      assert.strictEqual(result.framework, 'Actix-web');
    });

    it('should detect Axum via Cargo.toml', () => {
      tmpDir = makeTempProject({ 'Cargo.toml': '[dependencies]\naxum = "0.7"\n' });
      const result = detectFramework(tmpDir);
      assert.strictEqual(result.framework, 'Axum');
    });
  });

  // ── Java / Kotlin ──────────────────────────────────────────────────────────
  describe('Java / Kotlin', () => {
    let tmpDir;
    afterEach(() => removeTempDir(tmpDir));

    it('should detect Spring Boot via pom.xml', () => {
      tmpDir = makeTempProject({
        'pom.xml': '<project><parent><artifactId>spring-boot-starter-parent</artifactId></parent></project>',
      });
      const result = detectFramework(tmpDir);
      assert.strictEqual(result.language,  'Java');
      assert.strictEqual(result.framework, 'Spring Boot');
    });

    it('should detect plain Maven project', () => {
      tmpDir = makeTempProject({ 'pom.xml': '<project><modelVersion>4.0.0</modelVersion></project>' });
      const result = detectFramework(tmpDir);
      assert.strictEqual(result.language, 'Java');
    });
  });

  // ── Unknown ───────────────────────────────────────────────────────────────
  describe('Unknown project', () => {
    let tmpDir;
    afterEach(() => removeTempDir(tmpDir));

    it('should return Unknown for an empty directory', () => {
      tmpDir = makeTempProject({ 'README.txt': 'hello\n' });
      const result = detectFramework(tmpDir);
      assert.strictEqual(result.language,  'Unknown');
      assert.strictEqual(result.framework, 'Unknown');
    });
  });

  // ── Return shape ──────────────────────────────────────────────────────────
  describe('Return shape', () => {
    let tmpDir;
    afterEach(() => removeTempDir(tmpDir));

    it('should always return language, framework, evidenceFiles[], summary', () => {
      tmpDir = makeTempProject({ 'go.mod': 'module app\ngo 1.21\n' });
      const result = detectFramework(tmpDir);
      assert.ok(typeof result.language   === 'string', 'language must be string');
      assert.ok(typeof result.framework  === 'string', 'framework must be string');
      assert.ok(Array.isArray(result.evidenceFiles),   'evidenceFiles must be array');
      assert.ok(typeof result.summary    === 'string', 'summary must be string');
      assert.ok(result.summary.length > 0,             'summary must be non-empty');
    });
  });

});
