import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const hook = join(repoRoot, 'hooks', 'msn-hook.mjs');

let dir;
let logPath;

/**
 * Feed a payload to the hook exactly as Claude Code would.
 * @param {string} input Raw stdin.
 * @param {object} [env] Extra environment.
 * @returns {Promise<{stdout: string, stderr: string, lines: Array<object>}>}
 */
function fire(input, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [hook], {
      env: { ...process.env, MSN_LOG_PATH: logPath, ...env },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      const lines = existsSync(logPath)
        ? readFileSync(logPath, 'utf8')
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line))
        : [];
      resolve({ code, stdout, stderr, lines });
    });

    child.stdin.end(input);
  });
}

function payload(overrides = {}) {
  return JSON.stringify({
    session_id: 'ses-1',
    cwd: '/path/to/repo',
    permission_mode: 'auto',
    hook_event_name: 'PostToolUse',
    tool_name: 'SendMessage',
    tool_use_id: 'toolu_1',
    duration_ms: 167,
    tool_input: { to: 'peer', message: 'hola', summary: 'saludo' },
    tool_response: { success: true, msg_id: 'msg-1' },
    ...overrides,
  });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'msn-hook-'));
  logPath = join(dir, 'nested', 'msn-log.jsonl');
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test('writes one record and creates the log directory on the way', async () => {
  const { lines, stderr } = await fire(payload(), {
    CLAUDE_CODE_MESSAGING_SOCKET: '/tmp/cc-socks/4245.sock',
  });

  assert.equal(stderr, '');
  assert.equal(lines.length, 1);
  assert.deepEqual(lines[0].from, {
    sessionId: 'ses-1',
    cwd: '/path/to/repo',
    pid: 4245,
  });
  assert.equal(lines[0].to, 'peer');
  assert.equal(lines[0].text, 'hola');
  assert.equal(lines[0].delivered, true);
  assert.equal(lines[0].msgId, 'msg-1');
  assert.equal(lines[0].durationMs, 167);
});

test('records a refused send as undelivered rather than as success', async () => {
  const { lines } = await fire(
    payload({ tool_response: { success: false, message: 'no such session' } }),
  );
  assert.equal(lines[0].delivered, false);
});

test('a response shape it does not recognise yields an unknown delivery, never false', async () => {
  const { lines } = await fire(payload({ tool_response: { future: 'shape' } }));
  assert.equal(lines[0].delivered, null);
  assert.deepEqual(lines[0].response, { future: 'shape' });
});

test('keeps tool_input fields it has never seen before', async () => {
  const { lines } = await fire(
    payload({ tool_input: { to: 'peer', message: 'x', brandNewField: 42 } }),
  );
  assert.deepEqual(lines[0].extra, { brandNewField: 42 });
});

test('treats the documented aliases as known, so extra stays meaningful', async () => {
  const { lines } = await fire(
    payload({
      tool_input: {
        to: 'peer',
        message: 'x',
        type: 'message',
        recipient: 'peer',
        content: 'x',
      },
    }),
  );
  assert.deepEqual(lines[0].extra, {});
});

test('serialises a legacy protocol message and records its type', async () => {
  const { lines } = await fire(
    payload({
      tool_input: { to: 'lead', message: { type: 'shutdown_response', approve: true } },
    }),
  );
  assert.equal(lines[0].structured, 'shutdown_response');
  assert.match(lines[0].text, /shutdown_response/);
});

test('truncates an oversized message so concurrent appends cannot interleave', async () => {
  const { lines } = await fire(
    payload({ tool_input: { to: 'peer', message: 'x'.repeat(2 * 1024 * 1024) } }),
  );
  assert.equal(lines[0].truncated, true);
  assert.equal(Buffer.byteLength(lines[0].text, 'utf8'), 8192);
});

test('ignores tools other than SendMessage', async () => {
  const { lines } = await fire(payload({ tool_name: 'Bash' }));
  assert.equal(lines.length, 0);
});

test('survives malformed and empty input without a word on stderr', async () => {
  for (const input of ['', '   ', 'not json {{{', 'null', '[]']) {
    const { stderr, lines } = await fire(input);
    assert.equal(stderr, '', `stderr was not empty for ${JSON.stringify(input)}`);
    assert.equal(lines.length, 0);
  }
});

test('exits 0 even when the log path cannot be written', async () => {
  const blocker = join(dir, 'a-regular-file');
  writeFileSync(blocker, 'not a directory');

  const { code, stderr } = await fire(payload(), {
    MSN_LOG_PATH: join(blocker, 'msn-log.jsonl'),
  });

  assert.equal(code, 0);
  assert.equal(stderr, '');
});

test('appends rather than replacing, so history accumulates', async () => {
  await fire(payload());
  const { lines } = await fire(payload({ tool_input: { to: 'peer', message: 'second' } }));

  assert.equal(lines.length, 2);
  assert.equal(lines[1].text, 'second');
});

test('writes the raw payload when dump mode is on, for schema discovery', async () => {
  const dump = join(dir, 'dump.json');
  await fire(payload(), { MSN_RAW_DUMP: dump });

  assert.deepEqual(JSON.parse(readFileSync(dump, 'utf8')), JSON.parse(payload()));
});
