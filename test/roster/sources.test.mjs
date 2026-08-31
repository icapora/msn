import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isAlive, isValidEntry, readRegistry } from '../../src/roster/registry-source.mjs';
import { findSocketPath, normaliseRow } from '../../src/roster/cli-source.mjs';
import { STATUS, toStatus } from '../../src/roster/status.mjs';

let dir;

/**
 * A pid that is genuinely gone.
 *
 * Picking a low number does not work: on Linux pid 2 is `kthreadd`, a kernel
 * thread present on every machine, so a test that assumed it was free passed on
 * macOS and failed on Linux. Running a process to completion and taking its pid
 * is true on every platform.
 *
 * @returns {number}
 */
function deadPid() {
  return spawnSync(process.execPath, ['-e', '']).pid;
}

/** A registry entry shaped like one Claude Code writes. */
function entry(overrides = {}) {
  return {
    pid: process.pid,
    sessionId: 'aaaa-bbbb',
    name: 'demo',
    cwd: '/path/to/demo',
    kind: 'interactive',
    status: 'idle',
    messagingSocketPath: `/tmp/cc-socks/${process.pid}.sock`,
    startedAt: 1,
    ...overrides,
  };
}

function writeEntry(name, value) {
  writeFileSync(join(dir, name), typeof value === 'string' ? value : JSON.stringify(value));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'msn-registry-'));
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test('interactive sessions map their status onto the four buddy states', () => {
  assert.equal(toStatus({ kind: 'interactive', status: 'idle' }), STATUS.ONLINE);
  assert.equal(toStatus({ kind: 'interactive', status: 'busy' }), STATUS.BUSY);
});

test('background sessions are away regardless of the state they report', () => {
  assert.equal(toStatus({ kind: 'background', state: 'blocked' }), STATUS.AWAY);
  assert.equal(toStatus({ kind: 'background', state: 'running' }), STATUS.AWAY);
});

test('an unknown liveness shape degrades to away rather than throwing', () => {
  assert.equal(toStatus({}), STATUS.AWAY);
  assert.equal(toStatus({ kind: 'interactive', status: 'something-new' }), STATUS.AWAY);
});

test('isAlive tells a running process from one that has exited', () => {
  assert.equal(isAlive(process.pid), true);
  assert.equal(isAlive(deadPid()), false);
});

test('isAlive rejects a non-positive pid, which POSIX reads as a process group', () => {
  assert.equal(isAlive(0), false);
  assert.equal(isAlive(-1), false);
  assert.equal(isAlive(null), false);
});

test('isValidEntry requires the fields the app actually reads', () => {
  assert.equal(isValidEntry(entry()), true);
  assert.equal(isValidEntry({ ...entry(), name: undefined }), false);
  assert.equal(isValidEntry({ ...entry(), pid: 'not-a-number' }), false);
  assert.equal(isValidEntry(null), false);
});

test('reads live sessions and drops ones whose process is gone', () => {
  writeEntry('live.json', entry({ name: 'live' }));
  writeEntry('dead.json', entry({ name: 'dead', pid: deadPid(), sessionId: 'cccc' }));

  const sessions = readRegistry(dir);

  assert.deepEqual(
    sessions.map((session) => session.name),
    ['live'],
  );
  assert.equal(sessions[0].status, STATUS.ONLINE);
  assert.equal(sessions[0].source, 'registry');
});

test('an empty registry is not an error', () => {
  assert.deepEqual(readRegistry(dir), []);
});

test('throws when every entry fails validation, so the caller can fall back', () => {
  writeEntry('a.json', { totally: 'different' });
  writeEntry('b.json', 'not json at all');

  assert.throws(() => readRegistry(dir), /none matched the expected shape/);
});

test('a single unreadable entry does not discard the readable ones', () => {
  writeEntry('good.json', entry({ name: 'good' }));
  writeEntry('bad.json', 'not json at all');

  assert.deepEqual(
    readRegistry(dir).map((session) => session.name),
    ['good'],
  );
});

test('normalises the interactive shape from the CLI', () => {
  const row = normaliseRow({
    pid: 4242,
    cwd: '/x',
    kind: 'interactive',
    sessionId: 'ses',
    name: 'worker',
    status: 'busy',
  });

  assert.equal(row.status, STATUS.BUSY);
  assert.equal(row.pid, 4242);
});

test('finds the inbox socket in whichever directory holds it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'msn-socks-'));
  const shared = mkdtempSync(join(tmpdir(), 'msn-socks-'));
  writeFileSync(join(dir, '4242.sock'), '');

  assert.equal(findSocketPath(4242, [shared, dir]), join(dir, '4242.sock'));
  assert.equal(findSocketPath(4242, [dir, shared]), join(dir, '4242.sock'));

  rmSync(dir, { recursive: true, force: true });
  rmSync(shared, { recursive: true, force: true });
});

test('reports no socket rather than guessing a path that does not exist', () => {
  assert.equal(findSocketPath(4242, ['/nowhere/at/all']), null);
  assert.equal(findSocketPath(null, ['/tmp']), null);
});

test('normalises the background shape, which carries neither pid nor status', () => {
  const row = normaliseRow({
    id: 'abc',
    cwd: '/y',
    kind: 'background',
    sessionId: 'ses2',
    name: 'migration',
    state: 'blocked',
  });

  assert.equal(row.status, STATUS.AWAY);
  assert.equal(row.pid, null);
  assert.equal(row.socketPath, null);
});
