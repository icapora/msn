import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rotateIfLarge } from '../../src/log/rotate.mjs';

let dir;
let path;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'msn-rotate-'));
  path = join(dir, 'msn-log.jsonl');
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test('leaves a log that is under the limit alone', () => {
  writeFileSync(path, 'a'.repeat(100));
  assert.deepEqual(rotateIfLarge(path, 1000), { rotated: false });
  assert.equal(existsSync(path), true);
});

test('moves an oversized log aside, preserving its contents', () => {
  writeFileSync(path, 'a'.repeat(2000));
  const result = rotateIfLarge(path, 1000);

  assert.equal(result.rotated, true);
  assert.equal(existsSync(path), false);
  assert.equal(readFileSync(`${path}.1`, 'utf8').length, 2000);
});

test('a missing log is not an error', () => {
  assert.deepEqual(rotateIfLarge(join(dir, 'nope.jsonl'), 1000), { rotated: false });
});

test('keeps one generation, overwriting the previous rotation', () => {
  writeFileSync(path, 'first'.repeat(500));
  rotateIfLarge(path, 100);
  writeFileSync(path, 'second'.repeat(500));
  rotateIfLarge(path, 100);

  assert.match(readFileSync(`${path}.1`, 'utf8'), /^second/);
});
