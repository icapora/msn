#!/usr/bin/env node
import { diffHooks } from './diff-hooks.mjs';
import {
  backupSettings,
  readSettings,
  settingsPath,
  withHookRemoved,
  writeSettings,
} from './settings-file.mjs';

const apply = process.argv.slice(2).includes('--apply');
const path = settingsPath();
const before = readSettings(path);
const { settings: after, removed } = withHookRemoved(before);

console.log(`settings file: ${path}`);
console.log('showing the "hooks" key only - the rest of the file may hold credentials');
console.log('');

if (removed === 0) {
  console.log('no MSN hook found. nothing to do.');
  process.exit(0);
}

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
console.log(`removed ${removed} hook group. ~/.claude/msn-log.jsonl is left untouched.`);
