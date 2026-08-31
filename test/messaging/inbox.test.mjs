import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Inbox,
  parseEnvelope,
  pruneStaleSockets,
  toRecord,
} from '../../src/messaging/inbox.mjs';

const sockets = [];

after(() => {
  for (const dir of sockets) rmSync(dir, { recursive: true, force: true });
});

/**
 * Await an event with a deadline.
 *
 * A bare `once` never rejects, so a missed message would hang the suite instead
 * of failing it. See the determinism rules in CONTRIBUTING.md.
 *
 * @param {import('node:events').EventEmitter} emitter
 * @param {string} event
 * @param {number} [timeoutMs]
 */
function nextEvent(emitter, event, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`no "${event}" within ${timeoutMs}ms`)),
      timeoutMs,
    );
    emitter.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** A short-lived socket path: the OS caps a Unix socket path near 104 bytes. */
function socketPath() {
  const dir = mkdtempSync(join(tmpdir(), 'mi-'));
  sockets.push(dir);
  return join(dir, 's.sock');
}

const ENVELOPE = (text, from = 'uds:/tmp/cc-socks/4242.sock', name = 'session-a') =>
  JSON.stringify({
    msgV: 1,
    msg_id: 'abc-123',
    type: 'user',
    message: {
      role: 'user',
      content: `<cross-session-message from="${from}" from-name="${name}" from-mode="prompting">\n${text}\n</cross-session-message>`,
    },
    priority: 'next',
    from,
  });

test('pulls the sender and body out of a captured envelope', () => {
  const parsed = parseEnvelope(
    '<cross-session-message from="uds:/tmp/cc-socks/4246.sock" from-name="session-a" from-mode="prompting">\nWIRE FORMAT CAPTURE 42\n</cross-session-message>',
  );

  assert.deepEqual(parsed, {
    from: 'uds:/tmp/cc-socks/4246.sock',
    fromName: 'session-a',
    fromMode: 'prompting',
    text: 'WIRE FORMAT CAPTURE 42',
  });
});

test('keeps a multi-line body intact', () => {
  const parsed = parseEnvelope(
    '<cross-session-message from="x" from-name="y" from-mode="prompting">\nline one\n\nline three\n</cross-session-message>',
  );
  assert.equal(parsed.text, 'line one\n\nline three');
});

test('treats content without an envelope as the body itself', () => {
  assert.equal(parseEnvelope('just text').text, 'just text');
  assert.equal(parseEnvelope('just text').from, null);
});

test('rejects content that is not a string', () => {
  assert.equal(parseEnvelope(null), null);
  assert.equal(parseEnvelope(42), null);
});

test('builds a record carrying the sender name and pid', () => {
  const record = toRecord(ENVELOPE('hola'), 'MSN Web');

  assert.equal(record.from.name, 'session-a');
  assert.equal(record.from.pid, 4242);
  assert.equal(record.to, 'MSN Web');
  assert.equal(record.text, 'hola');
  assert.equal(record.msgId, 'abc-123');
  assert.equal(record.inbound, true);
});

test('a malformed line yields no record rather than throwing', () => {
  assert.equal(toRecord('not json', 'MSN Web'), null);
  assert.equal(toRecord('{}', 'MSN Web'), null);
});

test('binds a socket, receives a message, and cleans the file up', async () => {
  const path = socketPath();
  const inbox = new Inbox(path, 'MSN Web');

  await inbox.start();
  assert.equal(inbox.listening, true);
  assert.equal(inbox.address, `uds:${path}`);
  assert.equal(existsSync(path), true);

  const received = nextEvent(inbox, 'message');
  await new Promise((resolve, reject) => {
    const client = connect(path, () => {
      client.write(`${ENVELOPE('over the socket')}\n`);
      client.end();
      resolve();
    });
    client.on('error', reject);
  });

  const record = await received;
  assert.equal(record.text, 'over the socket');

  inbox.stop();
  assert.equal(inbox.listening, false);
  assert.equal(existsSync(path), false);
});

test('reassembles a message split across writes', async () => {
  const path = socketPath();
  const inbox = new Inbox(path, 'MSN Web');
  await inbox.start();

  const received = nextEvent(inbox, 'message');
  const line = `${ENVELOPE('split in two')}\n`;

  await new Promise((resolve, reject) => {
    const client = connect(path, () => {
      client.write(line.slice(0, 40));
      setTimeout(() => {
        client.write(line.slice(40));
        client.end();
        resolve();
      }, 20);
    });
    client.on('error', reject);
  });

  assert.equal((await received).text, 'split in two');
  inbox.stop();
});

test('replaces a stale socket file left by an earlier run', async () => {
  const path = socketPath();

  const first = new Inbox(path, 'MSN Web');
  await first.start();
  first.stop();

  const second = new Inbox(path, 'MSN Web');
  await second.start();
  assert.equal(second.listening, true);
  second.stop();
});

test('removes sockets whose process is gone and keeps the ones still running', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mp-'));
  writeFileSync(join(dir, '111.sock'), '');
  writeFileSync(join(dir, '222.sock'), '');
  writeFileSync(join(dir, 'notes.txt'), 'not a socket');

  const removed = pruneStaleSockets(dir, (pid) => pid === 222);

  assert.equal(removed, 1);
  assert.equal(existsSync(join(dir, '111.sock')), false);
  assert.equal(existsSync(join(dir, '222.sock')), true);
  assert.equal(existsSync(join(dir, 'notes.txt')), true);

  rmSync(dir, { recursive: true, force: true });
});

test('a directory that is not there is not an error', () => {
  assert.equal(
    pruneStaleSockets('/nowhere/at/all', () => false),
    0,
  );
});

test('binding cleans up after a run that was killed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mp-'));
  sockets.push(dir);
  writeFileSync(join(dir, '999999.sock'), '');

  const inbox = new Inbox(join(dir, `${process.pid}.sock`), 'MSN Web');
  await inbox.start();

  assert.equal(existsSync(join(dir, '999999.sock')), false);
  inbox.stop();
});
