'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Detect the primary language and framework of a repository.
 * @param {string} repoPath - Absolute path to the repository root.
 * @returns {{ language: string, framework: string, evidenceFiles: string[], summary: string }}
 */
function detectFramework(repoPath) {
  const exists = (rel) => fs.existsSync(path.join(repoPath, rel));
  const read   = (rel) => {
    try { return fs.readFileSync(path.join(repoPath, rel), 'utf8'); }
    catch { return ''; }
  };
  const evidenceFiles = [];

  // ── PHP ─────────────────────────────────────────────────────────────────────
  if (exists('artisan')) {
    evidenceFiles.push('artisan');
    if (exists('composer.json')) evidenceFiles.push('composer.json');
    return { language: 'PHP', framework: 'Laravel', evidenceFiles,
      summary: 'Laravel application detected via artisan CLI and composer.json.' };
  }
  if (exists('wp-config.php') || exists('wp-config-sample.php')) {
    evidenceFiles.push(exists('wp-config.php') ? 'wp-config.php' : 'wp-config-sample.php');
    return { language: 'PHP', framework: 'WordPress', evidenceFiles,
      summary: 'WordPress installation detected via wp-config.php.' };
  }
  if (exists('composer.json')) {
    const composer = read('composer.json');
    evidenceFiles.push('composer.json');
    if (composer.includes('symfony/')) {
      return { language: 'PHP', framework: 'Symfony', evidenceFiles,
        summary: 'Symfony framework detected via composer.json dependencies.' };
    }
    if (composer.includes('codeigniter')) {
      return { language: 'PHP', framework: 'CodeIgniter', evidenceFiles,
        summary: 'CodeIgniter framework detected via composer.json dependencies.' };
    }
    return { language: 'PHP', framework: 'PHP (generic)', evidenceFiles,
      summary: 'PHP project detected via composer.json (no specific framework identified).' };
  }

  // ── Python ───────────────────────────────────────────────────────────────────
  if (exists('manage.py')) {
    evidenceFiles.push('manage.py');
    if (exists('requirements.txt')) evidenceFiles.push('requirements.txt');
    return { language: 'Python', framework: 'Django', evidenceFiles,
      summary: 'Django project detected via manage.py.' };
  }
  if (exists('requirements.txt') || exists('pyproject.toml')) {
    const reqFile = exists('requirements.txt') ? 'requirements.txt' : 'pyproject.toml';
    const req = read(reqFile);
    evidenceFiles.push(reqFile);
    if (req.match(/fastapi/i)) {
      return { language: 'Python', framework: 'FastAPI', evidenceFiles,
        summary: 'FastAPI application detected via requirements.' };
    }
    if (req.match(/flask/i)) {
      return { language: 'Python', framework: 'Flask', evidenceFiles,
        summary: 'Flask application detected via requirements.' };
    }
    return { language: 'Python', framework: 'Python (generic)', evidenceFiles,
      summary: 'Python project detected (no specific framework identified).' };
  }

  // ── JavaScript / TypeScript ──────────────────────────────────────────────────
  if (exists('package.json')) {
    evidenceFiles.push('package.json');
    const pkg = JSON.parse(read('package.json') || '{}');
    const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);

    if (exists('next.config.js') || exists('next.config.mjs') || exists('next.config.ts') || deps['next']) {
      if (exists('next.config.js'))  evidenceFiles.push('next.config.js');
      if (exists('next.config.mjs')) evidenceFiles.push('next.config.mjs');
      if (exists('next.config.ts'))  evidenceFiles.push('next.config.ts');
      return { language: 'TypeScript/JavaScript', framework: 'Next.js', evidenceFiles,
        summary: 'Next.js application detected via next.config or next dependency.' };
    }
    if (exists('astro.config.mjs') || exists('astro.config.ts') || deps['astro']) {
      if (exists('astro.config.mjs')) evidenceFiles.push('astro.config.mjs');
      if (exists('astro.config.ts'))  evidenceFiles.push('astro.config.ts');
      return { language: 'TypeScript/JavaScript', framework: 'Astro', evidenceFiles,
        summary: 'Astro static site framework detected.' };
    }
    if (exists('remix.config.js') || exists('remix.config.ts') || deps['@remix-run/node'] || deps['@remix-run/react']) {
      if (exists('remix.config.js')) evidenceFiles.push('remix.config.js');
      if (exists('remix.config.ts')) evidenceFiles.push('remix.config.ts');
      return { language: 'TypeScript/JavaScript', framework: 'Remix', evidenceFiles,
        summary: 'Remix full-stack React framework detected.' };
    }
    if (deps['@nestjs/core']) {
      return { language: 'TypeScript', framework: 'NestJS', evidenceFiles,
        summary: 'NestJS application detected via @nestjs/core dependency.' };
    }
    if (deps['@angular/core']) {
      return { language: 'TypeScript', framework: 'Angular', evidenceFiles,
        summary: 'Angular application detected via @angular/core dependency.' };
    }
    if (deps['svelte'] || deps['@sveltejs/kit']) {
      return { language: 'JavaScript/TypeScript', framework: 'Svelte', evidenceFiles,
        summary: 'Svelte application detected via svelte dependency.' };
    }
    if (deps['vue']) {
      return { language: 'JavaScript/TypeScript', framework: 'Vue.js', evidenceFiles,
        summary: 'Vue.js application detected via vue dependency.' };
    }
    if (deps['react']) {
      const lang = deps['typescript'] || deps['@types/react'] ? 'TypeScript' : 'JavaScript';
      return { language: lang, framework: 'React', evidenceFiles,
        summary: 'React application detected via react dependency.' };
    }
    if (deps['express']) {
      return { language: 'JavaScript', framework: 'Express', evidenceFiles,
        summary: 'Express.js application detected via express dependency.' };
    }
    if (deps['hono']) {
      return { language: 'TypeScript/JavaScript', framework: 'Hono', evidenceFiles,
        summary: 'Hono web framework detected via dependency.' };
    }
    if (deps['elysia']) {
      return { language: 'TypeScript', framework: 'Elysia (Bun)', evidenceFiles,
        summary: 'Elysia framework for Bun runtime detected.' };
    }
    if (exists('vite.config.js') || exists('vite.config.ts') || deps['vite']) {
      if (exists('vite.config.js')) evidenceFiles.push('vite.config.js');
      if (exists('vite.config.ts')) evidenceFiles.push('vite.config.ts');
      return { language: 'TypeScript/JavaScript', framework: 'Vite project', evidenceFiles,
        summary: 'Vite build tool detected. Likely a frontend SPA.' };
    }
    return { language: 'JavaScript', framework: 'Node.js (generic)', evidenceFiles,
      summary: 'Node.js project detected via package.json (no specific framework identified).' };
  }

  // ── Bun ──────────────────────────────────────────────────────────────────────
  if (exists('bun.lockb') || exists('bunfig.toml')) {
    evidenceFiles.push(exists('bun.lockb') ? 'bun.lockb' : 'bunfig.toml');
    return { language: 'TypeScript/JavaScript', framework: 'Bun', evidenceFiles,
      summary: 'Bun runtime detected via bun.lockb or bunfig.toml.' };
  }

  // ── Deno ─────────────────────────────────────────────────────────────────────
  if (exists('deno.json') || exists('deno.jsonc') || exists('import_map.json')) {
    evidenceFiles.push(exists('deno.json') ? 'deno.json' : exists('deno.jsonc') ? 'deno.jsonc' : 'import_map.json');
    return { language: 'TypeScript/JavaScript', framework: 'Deno', evidenceFiles,
      summary: 'Deno runtime detected via deno.json or import_map.json.' };
  }

  // ── Ruby ─────────────────────────────────────────────────────────────────────
  if (exists('Gemfile')) {
    const gemfile = read('Gemfile');
    evidenceFiles.push('Gemfile');
    if (gemfile.includes("gem 'rails'") || gemfile.includes('gem "rails"')) {
      return { language: 'Ruby', framework: 'Rails', evidenceFiles,
        summary: 'Ruby on Rails application detected via Gemfile.' };
    }
    if (gemfile.includes('sinatra')) {
      return { language: 'Ruby', framework: 'Sinatra', evidenceFiles,
        summary: 'Sinatra application detected via Gemfile.' };
    }
    return { language: 'Ruby', framework: 'Ruby (generic)', evidenceFiles,
      summary: 'Ruby project detected via Gemfile (no specific framework identified).' };
  }

  // ── Java / Kotlin ─────────────────────────────────────────────────────────────
  if (exists('pom.xml')) {
    const pom = read('pom.xml');
    evidenceFiles.push('pom.xml');
    if (pom.includes('spring-boot')) {
      return { language: 'Java', framework: 'Spring Boot', evidenceFiles,
        summary: 'Spring Boot application detected via pom.xml.' };
    }
    if (pom.includes('quarkus')) {
      return { language: 'Java', framework: 'Quarkus', evidenceFiles,
        summary: 'Quarkus application detected via pom.xml.' };
    }
    return { language: 'Java', framework: 'Java (Maven)', evidenceFiles,
      summary: 'Java Maven project detected via pom.xml.' };
  }
  if (exists('build.gradle') || exists('build.gradle.kts')) {
    const gradleFile = exists('build.gradle.kts') ? 'build.gradle.kts' : 'build.gradle';
    const gradle = read(gradleFile);
    evidenceFiles.push(gradleFile);
    if (gradle.includes('spring-boot')) {
      return { language: 'Kotlin/Java', framework: 'Spring Boot', evidenceFiles,
        summary: 'Spring Boot application detected via build.gradle.' };
    }
    return { language: 'Kotlin/Java', framework: 'Gradle project', evidenceFiles,
      summary: 'Gradle-based JVM project detected.' };
  }

  // ── Go ───────────────────────────────────────────────────────────────────────
  if (exists('go.mod')) {
    const gomod = read('go.mod');
    evidenceFiles.push('go.mod');
    if (gomod.includes('gin-gonic/gin')) {
      return { language: 'Go', framework: 'Gin', evidenceFiles,
        summary: 'Gin web framework detected via go.mod.' };
    }
    if (gomod.includes('gofiber/fiber')) {
      return { language: 'Go', framework: 'Fiber', evidenceFiles,
        summary: 'Fiber web framework detected via go.mod.' };
    }
    if (gomod.includes('labstack/echo')) {
      return { language: 'Go', framework: 'Echo', evidenceFiles,
        summary: 'Echo web framework detected via go.mod.' };
    }
    return { language: 'Go', framework: 'Go (generic)', evidenceFiles,
      summary: 'Go module detected via go.mod (no specific framework identified).' };
  }

  // ── Rust ─────────────────────────────────────────────────────────────────────
  if (exists('Cargo.toml')) {
    const cargo = read('Cargo.toml');
    evidenceFiles.push('Cargo.toml');
    if (cargo.includes('actix-web')) {
      return { language: 'Rust', framework: 'Actix-web', evidenceFiles,
        summary: 'Actix-web application detected via Cargo.toml.' };
    }
    if (cargo.includes('axum')) {
      return { language: 'Rust', framework: 'Axum', evidenceFiles,
        summary: 'Axum web framework detected via Cargo.toml.' };
    }
    if (cargo.includes('rocket')) {
      return { language: 'Rust', framework: 'Rocket', evidenceFiles,
        summary: 'Rocket web framework detected via Cargo.toml.' };
    }
    return { language: 'Rust', framework: 'Rust (generic)', evidenceFiles,
      summary: 'Rust project detected via Cargo.toml.' };
  }

  // ── C# ───────────────────────────────────────────────────────────────────────
  const csprojFiles = fs.readdirSync(repoPath).filter(f => f.endsWith('.csproj'));
  if (csprojFiles.length > 0) {
    evidenceFiles.push(csprojFiles[0]);
    const csproj = read(csprojFiles[0]);
    if (csproj.includes('Microsoft.AspNetCore')) {
      return { language: 'C#', framework: 'ASP.NET Core', evidenceFiles,
        summary: 'ASP.NET Core application detected via .csproj.' };
    }
    return { language: 'C#', framework: '.NET (generic)', evidenceFiles,
      summary: '.NET project detected via .csproj.' };
  }

  // ── Docker-only project ───────────────────────────────────────────────────────
  if (exists('Dockerfile') || exists('docker-compose.yml') || exists('docker-compose.yaml')) {
    const f = exists('Dockerfile') ? 'Dockerfile' : exists('docker-compose.yml') ? 'docker-compose.yml' : 'docker-compose.yaml';
    evidenceFiles.push(f);
    return { language: 'Unknown', framework: 'Docker project', evidenceFiles,
      summary: 'Docker-based project detected. Language/framework unknown without source files.' };
  }

  // ── Unknown ──────────────────────────────────────────────────────────────────
  return { language: 'Unknown', framework: 'Unknown', evidenceFiles: [],
    summary: 'Could not determine language or framework from repository root files.' };
}

module.exports = { detectFramework };
