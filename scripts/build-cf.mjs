// Cloudflare deploy wrapper.
//
// @cursor/sdk has dynamic webpack requires + .d.ts files in dist/ that crash
// both esbuild (OpenNext) AND wrangler's deploy bundler. The SDK is only
// used in the live (non-DEMO_REPLAY) path, which we never run on Cloudflare.
// We rename the package directory before the run, then restore it after.
//
// Usage:
//   node scripts/build-cf.mjs build    -> opennextjs-cloudflare build
//   node scripts/build-cf.mjs preview  -> opennextjs-cloudflare build && wrangler dev
//   node scripts/build-cf.mjs deploy   -> opennextjs-cloudflare build && wrangler deploy

import { existsSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SDK = join(ROOT, 'node_modules', '@cursor');
const SDK_HIDDEN = join(ROOT, 'node_modules', '.cursor-hidden-for-cf-build');

let moved = false;
function hide() {
  if (existsSync(SDK)) {
    if (existsSync(SDK_HIDDEN)) rmSync(SDK_HIDDEN, { recursive: true, force: true });
    renameSync(SDK, SDK_HIDDEN);
    moved = true;
    console.log('[build-cf] hid @cursor/sdk');
  }
}
function restore() {
  if (moved && existsSync(SDK_HIDDEN)) {
    if (existsSync(SDK)) rmSync(SDK, { recursive: true, force: true });
    renameSync(SDK_HIDDEN, SDK);
    moved = false;
    console.log('[build-cf] restored @cursor/sdk');
  }
}

process.on('exit', restore);
process.on('SIGINT', () => { restore(); process.exit(130); });
process.on('uncaughtException', (e) => { console.error(e); restore(); process.exit(1); });

function run(cmd, args) {
  console.log(`[build-cf] $ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    restore();
    process.exit(r.status ?? 1);
  }
}

const mode = process.argv[2] ?? 'build';

try {
  hide();
  run('npx', ['opennextjs-cloudflare', 'build']);

  if (mode === 'preview') {
    run('npx', ['wrangler', 'dev']);
  } else if (mode === 'deploy') {
    run('npx', ['wrangler', 'deploy']);
  }
} finally {
  restore();
}
