#!/usr/bin/env node
'use strict';

require('dotenv').config();

const { run, classifyInput } = require('./agent');

// ─── Banner ───────────────────────────────────────────────────────────────────

function printBanner() {
  console.log('');
  console.log('  ╔═══════════════════════════════════════════════════╗');
  console.log('  ║          OnboardAI — Developer Onboarding         ║');
  console.log('  ║    Autonomous codebase analysis & doc generation  ║');
  console.log('  ╚═══════════════════════════════════════════════════╝');
  console.log('');
}

// ─── Usage ────────────────────────────────────────────────────────────────────

function printUsage() {
  console.log('Usage:');
  console.log('  node cli.js <github-url>              Remote GitHub/GitLab repo');
  console.log('  node cli.js <local-path>              Local project folder');
  console.log('  node cli.js .                         Current directory');
  console.log('');
  console.log('Options:');
  console.log('  --no-self-heal    Skip self-healing test retry loop');
  console.log('  --output <dir>    Custom output directory');
  console.log('  --help, -h        Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  node cli.js https://github.com/laravel/laravel');
  console.log('  node cli.js https://github.com/expressjs/express');
  console.log('  node cli.js E:\\my-projects\\my-laravel-app');
  console.log('  node cli.js /home/user/projects/my-api');
  console.log('  node cli.js .');
  console.log('');
}

// ─── Argument parser ──────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2); // strip 'node' and script path
  const options = { selfHeal: true, outputDir: null, input: null };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--no-self-heal') {
      options.selfHeal = false;
    } else if (arg === '--output' && args[i + 1]) {
      options.outputDir = args[++i];
    } else if (!arg.startsWith('--')) {
      options.input = arg;
    }
  }

  return options;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  printBanner();

  const opts = parseArgs(process.argv);

  if (opts.help || !opts.input) {
    printUsage();
    process.exit(opts.help ? 0 : 1);
  }

  const mode = classifyInput(opts.input);
  if (mode === 'unknown') {
    console.error(`❌ Cannot determine input type for: "${opts.input}"`);
    console.error('   Must be a URL (https://..., git@...) or a local path.');
    console.error('');
    printUsage();
    process.exit(1);
  }

  try {
    const result = await run(opts.input, {
      outputDir: opts.outputDir || undefined,
      selfHeal:  opts.selfHeal,
    });

    if (!result) {
      process.exit(1);
    }

    console.log('');
    console.log('─'.repeat(56));
    console.log('📦 Generated files:');
    console.log(`   • ${result.paths.readmePath}`);
    console.log(`   • ${result.paths.archPath}`);
    console.log(`   • ${result.paths.gsPath}`);
    console.log(`   • ${result.paths.testsPath}`);
    console.log('─'.repeat(56));
    console.log('');

    process.exit(0);
  } catch (err) {
    console.error('');
    console.error('❌ Fatal error:', err.message);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}

main();
