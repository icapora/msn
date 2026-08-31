import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conversationKey, parseLine, parseTarget } from '../../src/log/record.mjs';

test('parseTarget reads a plain session name', () => {
  assert.deepEqual(parseTarget('session-b'), {
    kind: 'name',
    name: 'session-b',
    pid: null,
  });
});

test('parseTarget reads the reply address Claude uses when answering', () => {
  assert.deepEqual(parseTarget('uds:/tmp/cc-socks/4242.sock'), {
    kind: 'socket',
    name: null,
    pid: 4242,
  });
});

test('parseTarget survives a socket path with no pid in it', () => {
  assert.equal(parseTarget('uds:/tmp/cc-socks/weird.sock').pid, null);
});

test('parseTarget treats a missing target as unknown', () => {
  for (const value of [null, '', undefined, 42]) {
    assert.equal(parseTarget(value).kind, 'unknown');
  }
});

test('parseLine rejects blank lines, bad JSON and records without a timestamp', () => {
  assert.equal(parseLine('   '), null);
  assert.equal(parseLine('{not json'), null);
  assert.equal(parseLine('null'), null);
  assert.equal(parseLine(JSON.stringify({ to: 'x' })), null);
});

test('parseLine keeps a record whose version it does not recognise', () => {
  const line = JSON.stringify({ v: 99, ts: 1, to: 'peer', text: 'hi', futureField: true });
  const parsed = parseLine(line);
  assert.equal(parsed.v, 99);
  assert.equal(parsed.futureField, true);
});

test('parseLine normalises a missing delivery result to null rather than false', () => {
  const parsed = parseLine(JSON.stringify({ ts: 1, to: 'peer', text: 'hi' }));
  assert.equal(parsed.delivered, null);
});

test('conversationKey pairs a name-addressed message with its socket-addressed reply', () => {
  const resolve = (target) => (target.name === 'session-b' ? 4243 : target.pid);

  const outbound = parseLine(
    JSON.stringify({ ts: 1, to: 'session-b', text: 'a', from: { pid: 4242 } }),
  );
  const reply = parseLine(
    JSON.stringify({
      ts: 2,
      to: 'uds:/tmp/cc-socks/4242.sock',
      text: 'b',
      from: { pid: 4243 },
    }),
  );

  assert.equal(conversationKey(outbound, resolve), conversationKey(reply, resolve));
});

test('conversationKey falls back to the name when the peer is no longer running', () => {
  const message = parseLine(
    JSON.stringify({ ts: 1, to: 'ghost', text: 'a', from: { pid: 10 } }),
  );
  assert.equal(
    conversationKey(message, () => null),
    'name:ghost|pid:10',
  );
});
