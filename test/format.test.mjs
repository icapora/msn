import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortPath, statusLabel, uptime } from '../public/js/format.mjs';
import { activate } from '../public/js/i18n.mjs';
import { describeTyping } from '../public/js/conversation.mjs';

test('labels every status in the active locale, falling back for an unknown one', () => {
  activate('en');
  assert.equal(statusLabel('online'), 'Online');
  assert.equal(statusLabel('busy'), 'Busy');
  assert.equal(statusLabel('away'), 'Away');
  assert.equal(statusLabel('offline'), 'Offline');
  assert.equal(statusLabel('something-new'), 'Offline');
});

test('follows a locale change without a reload', () => {
  activate('es');
  assert.equal(statusLabel('online'), 'En línea');
  activate('en');
  assert.equal(statusLabel('online'), 'Online');
});

test('shortens a working directory to its distinguishing tail', () => {
  assert.equal(shortPath('/path/to/your/repos/project'), '…/repos/project');
  assert.equal(shortPath('/path/to'), '/path/to');
  assert.equal(shortPath(null), '');
});

test('formats uptime as zero-padded hours, minutes and seconds', () => {
  assert.equal(uptime(0), '00:00:00');
  assert.equal(uptime(61_000), '00:01:01');
  assert.equal(uptime(3_723_000), '01:02:03');
});

test('announces only the peers whose session is actually busy', () => {
  activate('en');
  const statuses = new Map([
    ['a', 'busy'],
    ['b', 'online'],
    ['c', 'busy'],
  ]);

  assert.equal(describeTyping(['b'], statuses), '');
  assert.equal(describeTyping(['a'], statuses), 'a is typing…');
  assert.equal(describeTyping(['a', 'b', 'c'], statuses), 'a and c are typing…');
});

test('announces typing in Spanish when that locale is active', () => {
  activate('es');
  const statuses = new Map([['a', 'busy']]);
  assert.equal(describeTyping(['a'], statuses), 'a está escribiendo…');
  activate('en');
});
