import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, parseVersion, probeClaudeVersion } from '../../src/compat/probe.mjs';

test('pulls a version out of the noise the CLI prints around it', () => {
  assert.equal(parseVersion('2.1.251 (Claude Code)'), '2.1.251');
  assert.equal(parseVersion('v1.0.0\n'), '1.0.0');
  assert.equal(parseVersion('no version here'), null);
});

test('orders versions numerically, not as strings', () => {
  assert.ok(compareVersions('2.1.224', '2.1.251') < 0);
  assert.ok(compareVersions('2.1.9', '2.1.10') < 0);
  assert.equal(compareVersions('2.1.251', '2.1.251'), 0);
  assert.ok(compareVersions('2.2.0', '2.1.999') > 0);
});

test('treats a missing component as zero', () => {
  assert.equal(compareVersions('2.1', '2.1.0'), 0);
  assert.ok(compareVersions('2.1', '2.1.1') < 0);
});

test('reports a missing binary as a warning rather than throwing', async () => {
  const result = await probeClaudeVersion({
    bin: 'definitely-not-a-real-binary',
    minimum: '2.1.224',
  });

  assert.equal(result.ok, false);
  assert.equal(result.version, null);
  assert.match(result.warning, /could not run/);
});

test('accepts the installed Claude Code when it meets the minimum', async (t) => {
  const result = await probeClaudeVersion({ bin: 'claude', minimum: '0.0.1' });
  if (result.version === null) {
    t.skip('claude is not on PATH in this environment');
    return;
  }
  assert.equal(result.ok, true);
  assert.equal(result.warning, null);
});
