import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  backupSettings,
  isMsnGroup,
  readSettings,
  settingsPath,
  withHookInstalled,
  withHookRemoved,
  writeSettings,
} from '../../scripts/settings-file.mjs';

const COMMAND = 'node /repo/hooks/msn-hook.mjs';
let home;
let path;

/** A settings file shaped like a real one: many keys, no `hooks`. */
const REALISTIC = {
  env: { TOKEN: 'secret-value' },
  permissions: { allow: ['Bash(git status:*)'], deny: ['Bash(sudo *)'], defaultMode: 'auto' },
  statusLine: { type: 'command', command: 'bash line.sh' },
  mcpServers: { 'example-server': { command: 'python3', args: ['server.py'] } },
};

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'msn-settings-'));
  mkdirSync(join(home, '.claude'));
  path = settingsPath(home);
  writeSettings(path, REALISTIC);
});

after(() => {
  rmSync(home, { recursive: true, force: true });
});

test('settingsPath points at the user settings file', () => {
  assert.equal(settingsPath('/path/to/home'), '/path/to/home/.claude/settings.json');
});

test('refuses a file that is not valid JSON', () => {
  writeFileSync(path, '{ this is not json');
  assert.throws(() => readSettings(path), /not valid JSON/);
});

test('refuses a file that does not hold an object', () => {
  writeFileSync(path, '[1, 2, 3]');
  assert.throws(() => readSettings(path), /does not contain a JSON object/);
});

test('refuses a file that is not there', () => {
  assert.throws(() => readSettings(join(home, 'missing.json')), /No settings file/);
});

test('installing adds the hook and leaves every other key untouched', () => {
  const before = readSettings(path);
  const after_ = withHookInstalled(before, COMMAND);

  assert.deepEqual(after_.env, before.env);
  assert.deepEqual(after_.permissions, before.permissions);
  assert.deepEqual(after_.mcpServers, before.mcpServers);
  assert.equal(after_.hooks.PostToolUse[0].matcher, 'SendMessage');
  assert.equal(after_.hooks.PostToolUse[0].hooks[0].command, COMMAND);
  assert.equal(after_.hooks.PostToolUse[0].hooks[0].async, true);
});

test('installing does not mutate the object it was given', () => {
  const before = readSettings(path);
  withHookInstalled(before, COMMAND);
  assert.equal('hooks' in before, false);
});

test('installing twice leaves exactly one hook group', () => {
  const once = withHookInstalled(readSettings(path), COMMAND);
  const twice = withHookInstalled(once, `${COMMAND} --changed`);

  assert.equal(twice.hooks.PostToolUse.length, 1);
  assert.equal(twice.hooks.PostToolUse[0].hooks[0].command, `${COMMAND} --changed`);
});

test('uninstalling restores the file byte for byte', () => {
  const original = readFileSync(path, 'utf8');

  writeSettings(path, withHookInstalled(readSettings(path), COMMAND));
  const { settings, removed } = withHookRemoved(readSettings(path));
  writeSettings(path, settings);

  assert.equal(removed, 1);
  assert.equal(readFileSync(path, 'utf8'), original);
});

test('uninstalling keeps hook groups that belong to someone else', () => {
  const foreign = {
    matcher: 'Write',
    hooks: [{ type: 'command', command: 'node other-tool.js' }],
  };
  const settings = withHookInstalled(
    { ...REALISTIC, hooks: { PostToolUse: [foreign] } },
    COMMAND,
  );

  const { settings: cleaned, removed } = withHookRemoved(settings);

  assert.equal(removed, 1);
  assert.deepEqual(cleaned.hooks.PostToolUse, [foreign]);
});

test('uninstalling prunes the containers it empties', () => {
  const installed = withHookInstalled(readSettings(path), COMMAND);
  const { settings } = withHookRemoved(installed);
  assert.equal('hooks' in settings, false);
});

test('uninstalling a file with no hook reports nothing removed', () => {
  const { removed } = withHookRemoved(readSettings(path));
  assert.equal(removed, 0);
});

test('a group is recognised by the hook script it runs, not by its matcher', () => {
  assert.equal(isMsnGroup({ hooks: [{ command: 'node /x/hooks/msn-hook.mjs' }] }), true);
  assert.equal(
    isMsnGroup({ hooks: [{ command: 'MSN_RAW_DUMP=/t node /x/msn-hook.mjs' }] }),
    true,
  );
  assert.equal(isMsnGroup({ hooks: [{ command: 'node other.js' }] }), false);
  assert.equal(isMsnGroup({ matcher: 'SendMessage' }), false);
  assert.equal(isMsnGroup(undefined), false);
});

test('a backup is a faithful copy taken before any write', () => {
  const original = readFileSync(path, 'utf8');
  const backup = backupSettings(path);

  writeSettings(path, withHookInstalled(readSettings(path), COMMAND));

  assert.equal(readFileSync(backup, 'utf8'), original);
  assert.notEqual(readFileSync(path, 'utf8'), original);
});
