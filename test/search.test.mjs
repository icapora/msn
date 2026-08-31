import { test } from 'node:test';
import assert from 'node:assert/strict';
import { excerpt, highlight, searchMessages } from '../public/js/search.mjs';

function message(text, sender = 'session-a', peer = 'session-b') {
  return { text, sender: { name: sender }, peer: { name: peer }, ts: 1 };
}

test('splits a body around every match, case-insensitively', () => {
  assert.deepEqual(highlight('Gate and GATE', 'gate'), [
    { text: 'Gate', hit: true },
    { text: ' and ', hit: false },
    { text: 'GATE', hit: true },
  ]);
});

test('an empty needle leaves the body in one piece', () => {
  assert.deepEqual(highlight('anything', ''), [{ text: 'anything', hit: false }]);
});

test('a needle that never occurs leaves the body in one piece', () => {
  assert.deepEqual(highlight('anything', 'zzz'), [{ text: 'anything', hit: false }]);
});

test('preserves the body exactly when the segments are rejoined', () => {
  const body = 'gate, gateway, GATEKEEPER and nothing';
  assert.equal(
    highlight(body, 'gate')
      .map((segment) => segment.text)
      .join(''),
    body,
  );
});

test('matches on the body and on either participant', () => {
  const messages = [
    message('nothing relevant'),
    message('talks about the gate'),
    message('otra cosa', 'session-c', 'session-b'),
  ];

  assert.equal(searchMessages(messages, 'gate').length, 1);
  assert.equal(searchMessages(messages, 'session-c').length, 1);
  assert.equal(searchMessages(messages, 'session-b').length, 3);
});

test('an empty query matches nothing rather than everything', () => {
  assert.deepEqual(searchMessages([message('x')], '   '), []);
});

test('excerpts a window around the first match, flattening whitespace', () => {
  const body = `${'a'.repeat(200)} NEEDLE ${'b'.repeat(200)}`;
  const window = excerpt(body, 'NEEDLE', 20);

  assert.ok(window.includes('NEEDLE'));
  assert.ok(window.startsWith('…') && window.endsWith('…'));
  assert.ok(window.length < 80);
});

test('excerpts the head of the body when the needle is not in it', () => {
  assert.equal(excerpt('short body', 'zzz'), 'short body');
});

test('collapses newlines so a result row stays on one line', () => {
  assert.equal(excerpt('one\n\n  two', 'two'), 'one two');
});
