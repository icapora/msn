#!/usr/bin/env node
import { accessSync, constants, existsSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { platform, release } from 'node:os';
import { config } from '../src/config.mjs';
import { probeClaudeVersion } from '../src/compat/probe.mjs';
import { readRegistry } from '../src/roster/registry-source.mjs';
import { readCli } from '../src/roster/cli-source.mjs';
import { isMsnGroup, readSettings, settingsPath } from './settings-file.mjs';

const checks = [];

/**
 * Record one diagnostic result.
 * @param {string} name
 * @param {'ok'|'warn'|'fail'} level
 * @param {string} detail
 */
function report(name, level, detail) {
  checks.push({ name, level, detail });
}

async function checkClaude() {
  const probe = await probeClaudeVersion({
    bin: config.claudeBin,
    minimum: config.minimumClaudeVersion,
  });
  if (probe.ok) {
    report(
      'claude version',
      'ok',
      `${probe.version} (minimum ${config.minimumClaudeVersion}, verified against ${config.verifiedClaudeVersion})`,
    );
  } else {
    report('claude version', 'fail', probe.warning);
  }
}

function checkHook() {
  const path = settingsPath();
  try {
    const settings = readSettings(path);
    const installed = (settings.hooks?.PostToolUse ?? []).some(isMsnGroup);
    if (installed) report('hook installed', 'ok', path);
    else
      report(
        'hook installed',
        'fail',
        `no MSN hook in ${path} — run npm run install:hook -- --apply`,
      );
  } catch (error) {
    report('hook installed', 'fail', error.message);
  }
}

function checkLog() {
  if (!existsSync(config.logPath)) {
    report(
      'capture log',
      'warn',
      `${config.logPath} does not exist yet (no message captured so far)`,
    );
    return;
  }
  try {
    accessSync(config.logPath, constants.R_OK);
    report('capture log', 'ok', config.logPath);
  } catch {
    report('capture log', 'fail', `${config.logPath} is not readable`);
  }
  try {
    accessSync(dirname(config.logPath), constants.W_OK);
  } catch {
    report('log directory', 'fail', `${dirname(config.logPath)} is not writable by the hook`);
  }
}

function checkRegistry() {
  try {
    const sessions = readRegistry(config.registryDir);
    report(
      'session registry',
      'ok',
      `${sessions.length} live session(s) in ${config.registryDir}`,
    );
  } catch (error) {
    report(
      'session registry',
      'warn',
      `${error.message} — the roster will fall back to the CLI`,
    );
  }
}

/**
 * Whether this is Linux running under WSL, which behaves like Linux here.
 * @returns {boolean}
 */
function isWsl() {
  return platform() === 'linux' && /microsoft|wsl/i.test(release());
}

function checkPlatform() {
  const os = platform();

  if (os === 'darwin' || os === 'linux') {
    report(
      'platform',
      'ok',
      `${isWsl() ? 'linux (WSL)' : os} - Unix sockets, sending supported`,
    );
    return;
  }
  if (os === 'win32') {
    report(
      'platform',
      'warn',
      'native Windows uses named pipes, which this project does not implement - viewing works, sending does not',
    );
    return;
  }
  report('platform', 'warn', `${os} is untested; viewing should work, sending may not`);
}

function checkSockets() {
  const found = config.socketDirs.filter((dir) => existsSync(dir));

  if (found.length === 0) {
    report(
      'inbox sockets',
      'warn',
      `none of ${config.socketDirs.join(', ')} exist - no session has bound an inbox, so sending will fail`,
    );
    return;
  }

  const sockets = found.flatMap((dir) =>
    readdirSync(dir).filter((name) => name.endsWith('.sock')),
  );
  report(
    'inbox sockets',
    sockets.length > 0 ? 'ok' : 'warn',
    `${sockets.length} socket(s) across ${found.join(', ')}`,
  );
}

async function checkCli() {
  try {
    const started = Date.now();
    const sessions = await readCli({ bin: config.claudeBin, timeoutMs: config.cliTimeoutMs });
    report(
      'claude agents --json',
      'ok',
      `${sessions.length} session(s) in ${Date.now() - started}ms`,
    );
  } catch (error) {
    report('claude agents --json', 'fail', error.message);
  }
}

await checkClaude();
checkPlatform();
checkHook();
checkLog();
checkRegistry();
checkSockets();
await checkCli();

const mark = { ok: '  ok  ', warn: ' warn ', fail: ' FAIL ' };
console.log('MSN: My Sessions Network - doctor\n');
for (const check of checks) {
  console.log(`[${mark[check.level]}] ${check.name.padEnd(22)} ${check.detail}`);
}

const failed = checks.filter((check) => check.level === 'fail').length;
console.log(`\n${checks.length} checks, ${failed} failing`);
process.exit(failed === 0 ? 0 : 1);
