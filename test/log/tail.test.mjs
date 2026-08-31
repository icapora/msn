import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageTail } from '../../src/log/tail.mjs';

const dirs = [];

after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * A directory of its own for each test.
 *
 * Sharing one would put several watchers on the same path in turn, and macOS
 * coalesces filesystem events across them: an append then goes unreported and
 * the test fails for a reason that has nothing to do with the tailer.
 *
 * @param {string} name
 * @returns {string} Path to a log file inside a fresh directory.
 */
function logPath(name) {
  const dir = mkdtempSync(join(tmpdir(), 'msn-tail-'));
  dirs.push(dir);
  return join(dir, name);
}

function record(ts, to) {
  return `${JSON.stringify({ v: 1, ts, to, text: 't', from: { pid: 1 } })}\n`;
}

/**
 * Wait until `predicate` holds, or fail the test by timing out.
 *
 * The budget is generous on purpose. What is under test is that an append is
 * eventually delivered, not how fast the filesystem notifies; `node --test`
 * runs files in parallel, and a tight bound turns contention into a red build.
 */
async function until(predicate, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('condition never became true');
}

test('reads a log that already exists', async () => {
  const path = logPath('existing.jsonl');
  writeFileSync(path, record(1, 'a') + record(2, 'b'));

  const seen = [];
  const tail = new MessageTail(path);
  tail.on('message', (message) => seen.push(message));
  await tail.start();

  assert.equal(seen.length, 2);
  await tail.stop();
});

test('starts empty and picks up a log created later', async () => {
  const path = logPath('later.jsonl');

  const seen = [];
  const tail = new MessageTail(path);
  tail.on('message', (message) => seen.push(message));
  await tail.start();

  assert.equal(seen.length, 0);

  writeFileSync(path, record(3, 'c'));
  await until(() => seen.length === 1);

  await tail.stop();
});

test('emits appended lines without repeating earlier ones', async () => {
  const path = logPath('append.jsonl');
  writeFileSync(path, record(1, 'a'));

  const seen = [];
  const tail = new MessageTail(path);
  tail.on('message', (message) => seen.push(message));
  await tail.start();

  appendFileSync(path, record(2, 'b'));
  await until(() => seen.length === 2);

  assert.deepEqual(
    seen.map((message) => message.to),
    ['a', 'b'],
  );
  await tail.stop();
});

test('re-reads from the start when the log is truncated', async () => {
  const path = logPath('rotate.jsonl');
  writeFileSync(path, record(1, 'a') + record(2, 'b'));

  const seen = [];
  const tail = new MessageTail(path);
  tail.on('message', (message) => seen.push(message));
  await tail.start();
  assert.equal(seen.length, 2);

  writeFileSync(path, record(9, 'fresh'));
  await until(() => seen.some((message) => message.to === 'fresh'));

  await tail.stop();
});

test('holds a partial trailing line until its newline arrives', async () => {
  const path = logPath('partial.jsonl');
  const full = record(1, 'whole');
  writeFileSync(path, full.slice(0, 20));

  const seen = [];
  const tail = new MessageTail(path);
  tail.on('message', (message) => seen.push(message));
  await tail.start();
  assert.equal(seen.length, 0);

  appendFileSync(path, full.slice(20));
  await until(() => seen.length === 1);

  assert.equal(seen[0].to, 'whole');
  await tail.stop();
});
