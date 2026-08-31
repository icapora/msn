import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const HOOK_EVENT = 'PostToolUse';
export const HOOK_MATCHER = 'SendMessage';
export const HOOK_MARKER = 'msn-hook';

/**
 * Absolute path of the Claude Code user settings file.
 * @param {string} [home] Override for the home directory, used by tests.
 * @returns {string}
 */
export function settingsPath(home = homedir()) {
  return join(home, '.claude', 'settings.json');
}

/**
 * Parse a settings file, refusing anything that is not a JSON object.
 * @param {string} path
 * @returns {object}
 * @throws {Error} When the file is missing or does not hold a JSON object.
 */
export function readSettings(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`No settings file at ${path}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} is not valid JSON, refusing to touch it: ${error.message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${path} does not contain a JSON object, refusing to touch it`);
  }
  return parsed;
}

/**
 * Copy the settings file next to itself with a timestamped suffix.
 * @param {string} path
 * @returns {string} The backup path.
 */
export function backupSettings(path) {
  const target = `${path}.msn-backup-${Date.now()}`;
  copyFileSync(path, target);
  return target;
}

/**
 * Serialise settings back to disk with the two-space indent Claude Code uses.
 * @param {string} path
 * @param {object} settings
 */
export function writeSettings(path, settings) {
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
}

/**
 * Whether a matcher group belongs to this project.
 * @param {object} group
 * @returns {boolean}
 */
export function isMsnGroup(group) {
  return (group?.hooks ?? []).some((handler) =>
    String(handler?.command ?? '').includes(HOOK_MARKER),
  );
}

/**
 * Add or replace this project's hook group, leaving every other key untouched.
 * @param {object} settings
 * @param {string} command Shell command Claude Code runs for the hook.
 * @returns {object} A new settings object.
 */
export function withHookInstalled(settings, command) {
  const next = structuredClone(settings);
  const hooks = next.hooks ?? {};
  const groups = (hooks[HOOK_EVENT] ?? []).filter((group) => !isMsnGroup(group));

  groups.push({
    matcher: HOOK_MATCHER,
    hooks: [{ type: 'command', command, async: true }],
  });

  next.hooks = { ...hooks, [HOOK_EVENT]: groups };
  return next;
}

/**
 * Remove this project's hook group, pruning containers it leaves empty.
 * @param {object} settings
 * @returns {{settings: object, removed: number}}
 */
export function withHookRemoved(settings) {
  const next = structuredClone(settings);
  if (!next.hooks?.[HOOK_EVENT]) return { settings: next, removed: 0 };

  const before = next.hooks[HOOK_EVENT].length;
  const groups = next.hooks[HOOK_EVENT].filter((group) => !isMsnGroup(group));
  const removed = before - groups.length;

  if (groups.length > 0) next.hooks[HOOK_EVENT] = groups;
  else delete next.hooks[HOOK_EVENT];

  if (Object.keys(next.hooks).length === 0) delete next.hooks;
  return { settings: next, removed };
}
