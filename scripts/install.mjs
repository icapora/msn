#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { diffHooks } from './diff-hooks.mjs';
import {
  backupSettings,
  readSettings,
  settingsPath,
  withHookInstalled,
  writeSettings,
} from './settings-file.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hookPath = join(repoRoot, 'hooks', 'msn-hook.mjs');

function parseArgs(argv) {
  const dumpIndex = argv.indexOf('--dump');
  return {
    apply: argv.includes('--apply'),
    dump: dumpIndex === -1 ? null : argv[dumpIndex + 1],
  };
}

function buildCommand(dump) {
  const base = `node ${hookPath}`;
  return dump ? `MSN_RAW_DUMP=${dump} ${base}` : base;
}

const { apply, dump } = parseArgs(process.argv.slice(2));
const path = settingsPath();
const before = readSettings(path);
const after = withHookInstalled(before, buildCommand(dump));

console.log(`settings file: ${path}`);
console.log('showing the "hooks" key only - the rest of the file may hold credentials');
console.log('');
console.log(diffHooks(before, after));

if (!apply) {
  console.log('');
  console.log('dry run. re-run with --apply to write this change.');
  process.exit(0);
}

const backup = backupSettings(path);
writeSettings(path, after);
console.log('');
console.log(`backup: ${backup}`);
console.log('hook installed. existing sessions must be restarted to pick it up.');
