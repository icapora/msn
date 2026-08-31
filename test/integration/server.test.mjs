import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let base;
let dir;
let logPath;
let child;

/**
 * Read the port the server actually bound.
 *
 * The server is asked for an ephemeral port rather than a fixed one: a fixed
 * port makes the suite depend on the state of the machine, and an orphan left
 * by an interrupted run does not fail the tests — it serves them, which is a
 * far worse outcome than a red build.
 *
 * @param {import('node:child_process').ChildProcess} process
 * @returns {Promise<string>} The base URL.
 */
function readBaseUrl(process) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(
      () => reject(new Error(`server never printed a URL: ${buffer}`)),
      20000,
    );

    process.stdout.on('data', (chunk) => {
      buffer += chunk;
      const match = /(http:\/\/127\.0\.0\.1:\d+)/.exec(buffer);
      if (!match) return;
      clearTimeout(timer);
      resolve(match[1]);
    });
    process.on('error', reject);
  });
}

function record(ts, to, text, msgId) {
  return `${JSON.stringify({
    v: 1,
    ts,
    from: { sessionId: 's', cwd: '/path/to/demo', pid: 4242 },
    to,
    text,
    msgId,
    delivered: true,
    truncated: false,
    extra: {},
  })}\n`;
}

/** Poll until `check` returns a value, so the test never races the server. */
async function until(check, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await check();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  throw new Error(`condition never held: ${last}`);
}

/**
 * Open an event stream and expose it as awaitable pieces.
 *
 * `ready` resolves once the backlog has arrived, which proves the connection is
 * live — a fixed sleep before acting is a coin toss under parallel test load.
 * `next` rejects on a deadline rather than hanging, so a missed event fails the
 * run instead of stalling it.
 *
 * @returns {{ready: Promise<void>, next: (event: string, timeoutMs?: number) => Promise<object>, close: () => void}}
 */
function openStream() {
  const controller = new AbortController();
  const waiters = [];
  let backlogSeen;
  const ready = new Promise((resolve) => (backlogSeen = resolve));

  (async () => {
    const response = await fetch(`${base}/events`, { signal: controller.signal });
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const name = /^event: (.+)$/m.exec(frame)?.[1];
          const data = /^data: (.+)$/m.exec(frame)?.[1];
          if (!name || !data) continue;
          if (name === 'history') backlogSeen();

          for (const waiter of waiters.filter((w) => w.event === name)) {
            waiter.resolve(JSON.parse(data));
            waiters.splice(waiters.indexOf(waiter), 1);
          }
        }
      }
    } catch {
      /* the stream is closed by close(), which surfaces as an abort */
    }
  })();

  return {
    ready,
    next(event, timeoutMs = 20000) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`no "${event}" event within ${timeoutMs}ms`)),
          timeoutMs,
        );
        waiters.push({
          event,
          resolve: (data) => {
            clearTimeout(timer);
            resolve(data);
          },
        });
      });
    },
    close: () => controller.abort(),
  };
}

/** The server's current counters, without opening an event stream. */
async function currentMeta() {
  return (await fetch(`${base}/api/meta`)).json();
}

/**
 * Read the first events off a fresh SSE stream, then tear the connection down.
 *
 * The request is aborted rather than the reader cancelled: cancelling leaves a
 * keep-alive connection in the pool, and a later read can then pick up frames
 * buffered from the previous response.
 *
 * @param {number} count How many `data:` frames to collect.
 * @returns {Promise<Array<{event: string, data: object}>>}
 */
async function readEvents(count) {
  const controller = new AbortController();
  const response = await fetch(`${base}/events`, { signal: controller.signal });
  const decoder = new TextDecoder();
  const events = [];
  let buffer = '';

  try {
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });

      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const name = /^event: (.+)$/m.exec(frame)?.[1];
        const data = /^data: (.+)$/m.exec(frame)?.[1];
        if (name && data) events.push({ event: name, data: JSON.parse(data) });
      }
      if (events.length >= count) break;
    }
  } finally {
    controller.abort();
  }
  return events;
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'msn-int-'));
  logPath = join(dir, 'msn-log.jsonl');
  writeFileSync(logPath, record(1000, 'session-b', 'first', 'm1'));

  child = spawn('node', [join(repoRoot, 'src', 'server.mjs')], {
    env: {
      ...process.env,
      MSN_PORT: '0',
      MSN_LOG_PATH: logPath,
      MSN_NAMES_PATH: join(dir, 'names.json'),
      MSN_REGISTRY_DIR: join(dir, 'sessions'),
      MSN_INBOX_PATH: join(dir, 'i.sock'),
      MSN_CLAUDE_BIN: join(dir, 'no-claude-here'),
      MSN_HISTORY_LIMIT: '5',
      MSN_CLI_POLL_MS: '600000',
      MSN_REGISTRY_POLL_MS: '600000',
    },
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  base = await readBaseUrl(child);
  await until(async () => (await fetch(`${base}/api/meta`)).ok);
});

after(() => {
  child?.kill('SIGKILL');
  rmSync(dir, { recursive: true, force: true });
});

test('serves the page and its modules', async () => {
  for (const path of ['/', '/css/msn.css', '/js/app.mjs', '/js/markdown.mjs']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, `${path} was not served`);
  }
});

test('refuses to serve a path outside the public directory', async () => {
  const response = await fetch(`${base}/../package.json`);
  assert.equal(response.status, 404);
});

test('sends history, roster and meta to a browser on connect', async () => {
  const events = await readEvents(3);
  const names = events.map((event) => event.event);

  assert.deepEqual(names, ['meta', 'roster', 'history']);
  assert.equal(events[2].data.length, 1);
  assert.equal(events[2].data[0].text, 'first');
  assert.equal(events[2].data[0].sender.name, 'demo (4242)');
  assert.equal(events[2].data[0].peer.name, 'session-b');
});

test('reports that it could not read the version, without refusing to start', async () => {
  const [meta] = await readEvents(1);
  assert.match(meta.data.warnings.join(' '), /could not run/);
});

test('binds an inbox so replies have somewhere to land', async () => {
  const [meta] = await readEvents(1);
  assert.match(meta.data.inboxAddress, /^uds:.+\.sock$/);
});

test('pushes a message appended to the log while a browser is connected', async () => {
  const stream = openStream();
  await stream.ready;

  const arrived = stream.next('message');
  appendFileSync(logPath, record(2000, 'session-a', 'live', 'm2'));

  const message = await arrived;
  stream.close();

  assert.equal(message.text, 'live');
  assert.equal(message.peer.name, 'session-a');
});

test('ingests a reply arriving on the inbox socket', async () => {
  const stream = openStream();
  await stream.ready;

  const arrived = stream.next('message');
  await new Promise((resolve, reject) => {
    const client = connect(join(dir, 'i.sock'), () => {
      client.write(
        `${JSON.stringify({
          msgV: 1,
          msg_id: 'inbound-1',
          type: 'user',
          message: {
            role: 'user',
            content:
              '<cross-session-message from="uds:/tmp/cc-socks/4242.sock" from-name="session-a" from-mode="prompting">\nreply over the socket\n</cross-session-message>',
          },
          priority: 'next',
          from: 'uds:/tmp/cc-socks/4242.sock',
        })}\n`,
      );
      client.end();
      resolve();
    });
    client.on('error', reject);
  });

  const message = await arrived;
  stream.close();

  assert.equal(message.text, 'reply over the socket');
  assert.equal(message.sender.name, 'session-a');
  assert.equal(message.peer.name, 'MSN Web');
  assert.equal(message.inbound, true);
});

test('keeps only the most recent messages once the limit is passed', async () => {
  const before = (await currentMeta()).messageCount;
  for (let i = 3; i <= 12; i += 1) {
    appendFileSync(logPath, record(2000 + i, 'peer', `message ${i}`, `m${i}`));
  }

  const meta = await until(async () => {
    const current = await currentMeta();
    return current.messageCount >= before + 10 ? current : null;
  });

  assert.equal(meta.historyLimit, 5);
  assert.equal(meta.residentCount, 5);
  assert.ok(meta.droppedCount > 0);

  const { messages } = await (await fetch(`${base}/api/history`)).json();
  assert.equal(messages.length, 5);
  assert.equal(messages.at(-1).text, 'message 12');
});

test('ignores a duplicate delivery id', async () => {
  const before = (await currentMeta()).messageCount;
  appendFileSync(logPath, record(9999, 'peer', 'duplicate', 'm12'));
  await new Promise((resolve) => setTimeout(resolve, 500));

  assert.equal((await currentMeta()).messageCount, before);
});

test('pages backwards through history', async () => {
  const { messages } = await (await fetch(`${base}/api/history?before=2010`)).json();
  assert.ok(messages.every((message) => message.ts < 2010));
});

test('rejects a send with no live target', async () => {
  const response = await fetch(`${base}/api/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to: 'nobody', text: 'hola' }),
  });

  assert.equal(response.status, 404);
  assert.match((await response.json()).error, /no live session/);
});

test('rejects a send with no text', async () => {
  const response = await fetch(`${base}/api/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to: 'someone' }),
  });

  assert.equal(response.status, 400);
});
