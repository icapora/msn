#!/usr/bin/env node
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

const RECORD_VERSION = 1;
const MAX_TEXT_BYTES = 8192;
const KNOWN_INPUT_KEYS = new Set([
  'to',
  'message',
  'summary',
  'notify_when_idle',
  'type',
  'recipient',
  'content',
]);

const logPath = process.env.MSN_LOG_PATH || join(homedir(), '.claude', 'msn-log.jsonl');

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', () => resolve(''));
  });
}

function truncate(text) {
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= MAX_TEXT_BYTES) return { text, truncated: false };
  return { text: buf.subarray(0, MAX_TEXT_BYTES).toString('utf8'), truncated: true };
}

function pidFromSocketPath(socketPath) {
  if (typeof socketPath !== 'string' || socketPath === '') return null;
  const parsed = Number.parseInt(basename(socketPath), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function collectExtra(toolInput) {
  const extra = {};
  for (const [key, value] of Object.entries(toolInput)) {
    if (!KNOWN_INPUT_KEYS.has(key)) extra[key] = value;
  }
  return extra;
}

function buildRecord(payload) {
  const toolInput = payload.tool_input ?? {};
  const response = payload.tool_response ?? {};
  const raw = toolInput.message;
  const asText = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '');
  const { text, truncated } = truncate(asText);

  return {
    v: RECORD_VERSION,
    ts: Date.now(),
    from: {
      sessionId: payload.session_id ?? null,
      cwd: payload.cwd ?? null,
      pid: pidFromSocketPath(process.env.CLAUDE_CODE_MESSAGING_SOCKET),
    },
    to: typeof toolInput.to === 'string' ? toolInput.to : null,
    text,
    summary: typeof toolInput.summary === 'string' ? toolInput.summary : null,
    notifyWhenIdle: toolInput.notify_when_idle === true,
    structured: typeof raw === 'string' ? null : (raw?.type ?? null),
    truncated,
    msgId: response.msg_id ?? null,
    delivered: typeof response.success === 'boolean' ? response.success : null,
    toolUseId: payload.tool_use_id ?? null,
    permissionMode: payload.permission_mode ?? null,
    durationMs: typeof payload.duration_ms === 'number' ? payload.duration_ms : null,
    response,
    extra: collectExtra(toolInput),
  };
}

function dumpRaw(input) {
  const target = process.env.MSN_RAW_DUMP;
  if (!target) return;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, input);
}

async function main() {
  const input = await readStdin();
  if (input.trim() === '') return;

  const payload = JSON.parse(input);
  dumpRaw(input);
  if (payload.tool_name !== 'SendMessage') return;

  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify(buildRecord(payload))}\n`);
}

main()
  .catch(() => {})
  .finally(() => process.exit(0));
