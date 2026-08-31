import { test } from 'node:test';
import assert from 'node:assert/strict';
import { History } from '../../src/log/history.mjs';

function message(ts, msgId = null) {
  return { ts, msgId, text: 'x' };
}

test('keeps only the most recent messages, counting the ones it drops', () => {
  const history = new History(3);
  for (let i = 1; i <= 10; i += 1) history.add(message(i));

  assert.equal(history.size, 3);
  assert.equal(history.total, 10);
  assert.equal(history.dropped, 7);
  assert.deepEqual(
    history.recent().map((m) => m.ts),
    [8, 9, 10],
  );
});

test('refuses a message whose id it has already recorded', () => {
  const history = new History(10);

  assert.equal(history.add(message(1, 'abc')), true);
  assert.equal(history.add(message(2, 'abc')), false);
  assert.equal(history.size, 1);
});

test('accepts messages without an id, since not every source provides one', () => {
  const history = new History(10);

  assert.equal(history.add(message(1)), true);
  assert.equal(history.add(message(2)), true);
  assert.equal(history.size, 2);
});

test('dedupes the same delivery arriving from the log and from the socket', () => {
  const history = new History(10);
  const fromHook = { ts: 1, msgId: 'shared', text: 'hola' };
  const fromSocket = { ts: 2, msgId: 'shared', text: 'hola', inbound: true };

  history.add(fromHook);

  assert.equal(history.add(fromSocket), false);
  assert.equal(history.size, 1);
});

test('pages backwards from a timestamp', () => {
  const history = new History(100);
  for (let i = 1; i <= 10; i += 1) history.add(message(i));

  assert.deepEqual(
    history.before(5).map((m) => m.ts),
    [1, 2, 3, 4],
  );
  assert.deepEqual(
    history.before(5, 2).map((m) => m.ts),
    [3, 4],
  );
  assert.deepEqual(history.before(1), []);
});

test('recent takes a count smaller than the limit', () => {
  const history = new History(100);
  for (let i = 1; i <= 10; i += 1) history.add(message(i));

  assert.deepEqual(
    history.recent(2).map((m) => m.ts),
    [9, 10],
  );
});
