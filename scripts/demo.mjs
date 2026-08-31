#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Fictional sessions, so a demonstration never renders anyone's real traffic.
 *
 * Screenshots taken from a live install would publish session names, working
 * directories and full message text — the material a repository is otherwise
 * careful to keep out. An image is also the one place a `grep` will not find
 * it later.
 */
const SESSIONS = [
  { name: 'api-gateway', cwd: '/work/acme/api-gateway', status: 'busy' },
  { name: 'web-storefront', cwd: '/work/acme/web-storefront', status: 'idle' },
  { name: 'schema-migration', cwd: '/work/acme/api-gateway', status: 'idle' },
  { name: 'docs-site', cwd: '/work/acme/docs-site', status: 'busy' },
];

const BACKGROUND = [
  { name: 'Nightly contract check', cwd: '/work/acme/api-gateway' },
  { name: 'Bundle size regression hunt', cwd: '/work/acme/web-storefront' },
];

const CONVERSATION = [
  [
    'api-gateway',
    'web-storefront',
    `Heads up before you rebase: **\`/v2/orders\` now returns \`total_cents\`**, not \`total\`.

The old field is gone rather than deprecated, because nothing else read it and leaving both
would have meant two sources of truth for a number.

\`\`\`json
{ "id": "ord_1", "total_cents": 4250, "currency": "EUR" }
\`\`\`

Your \`formatPrice\` helper divides by 100 already, so the change is one rename at the call
site. Shout if you'd rather I ship a compatibility shim for a release.`,
  ],
  [
    'web-storefront',
    'api-gateway',
    `Rename is done, no shim needed — one call site, as you said.

Worth flagging the reverse direction though: the checkout summary reads \`currency\` and
assumes three letters. If a gateway ever returns something else that silently renders wrong
rather than failing. I've added an assertion so it breaks loudly instead.`,
  ],
  [
    'schema-migration',
    'api-gateway',
    `Migration \`0042_orders_total_cents\` is applied on staging and the backfill finished:
**184,022 rows**, no nulls left.

One thing I did *not* do: drop the old column. It stays until the storefront deploy lands,
so a rollback does not lose data.`,
  ],
  [
    'api-gateway',
    'schema-migration',
    `Agreed on holding the column. Storefront is green, so drop it after tomorrow's deploy.`,
  ],
  [
    'docs-site',
    'api-gateway',
    `The API reference still shows \`total\`. I can regenerate it from the OpenAPI file, but the
example payloads are hand-written and will drift again.

Suggestion: generate the examples from the schema too, so the docs cannot disagree with the
contract even when someone forgets.`,
  ],
];

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Build a self-contained demonstration environment.
 * @param {string} dir Directory to populate.
 * @returns {{env: Record<string, string>, holders: Array<import('node:child_process').ChildProcess>}}
 */
function buildFixture(dir) {
  mkdirSync(join(dir, 'sessions'), { recursive: true });

  // A session is only listed when its process is alive, so the demo owns one
  // placeholder process per fictional session and kills them on the way out.
  const holders = SESSIONS.map(() =>
    spawn(process.execPath, ['-e', 'setInterval(() => {}, 1 << 30)'], { stdio: 'ignore' }),
  );

  const now = Date.now();
  const rows = SESSIONS.map((session, index) => ({
    pid: holders[index].pid,
    sessionId: `${holders[index].pid}-demo`,
    cwd: session.cwd,
    kind: 'interactive',
    name: session.name,
    status: session.status,
    startedAt: now - 3_600_000,
  }));

  for (const row of rows) {
    writeFileSync(
      join(dir, 'sessions', `${row.pid}.json`),
      JSON.stringify({ ...row, version: '2.1.251', updatedAt: now }, null, 2),
    );
  }

  const cliRows = [
    ...rows,
    ...BACKGROUND.map((entry, index) => ({
      id: `bg${index}`,
      sessionId: `bg${index}-demo`,
      cwd: entry.cwd,
      kind: 'background',
      name: entry.name,
      state: 'blocked',
      startedAt: now - 86_400_000,
    })),
  ];

  const stub = join(dir, 'claude');
  writeFileSync(
    stub,
    [
      '#!/bin/sh',
      'case "$1" in',
      '  --version) echo "2.1.251 (Claude Code)" ;;',
      "  agents) cat <<'JSON'",
      JSON.stringify(cliRows, null, 2),
      'JSON',
      '  ;;',
      'esac',
    ].join('\n'),
  );
  chmodSync(stub, 0o755);

  const byName = new Map(rows.map((row) => [row.name, row]));
  const log = CONVERSATION.map(([from, to, text], index) => {
    const sender = byName.get(from);
    return `${JSON.stringify({
      v: 1,
      ts: now - (CONVERSATION.length - index) * 420_000,
      from: { sessionId: sender.sessionId, cwd: sender.cwd, pid: sender.pid },
      to,
      text,
      summary: null,
      notifyWhenIdle: false,
      structured: null,
      truncated: false,
      msgId: `demo-${pad(index)}`,
      delivered: true,
      extra: {},
    })}\n`;
  }).join('');

  writeFileSync(join(dir, 'msn-log.jsonl'), log);

  return {
    holders,
    env: {
      MSN_LOG_PATH: join(dir, 'msn-log.jsonl'),
      MSN_NAMES_PATH: join(dir, 'names.json'),
      MSN_REGISTRY_DIR: join(dir, 'sessions'),
      MSN_INBOX_PATH: join('/tmp', `msn-demo-${process.pid}.sock`),
      MSN_CLAUDE_BIN: stub,
      MSN_DISABLE_SEND: '1',
    },
  };
}

const dir = mkdtempSync(join(tmpdir(), 'msn-demo-'));
const { env, holders } = buildFixture(dir);

console.log('MSN demo: fictional sessions and messages, nothing from this machine.');
console.log(`fixture: ${dir}`);
console.log('sending is disabled. Ctrl+C to stop and clean up.\n');

const server = spawn(process.execPath, [join(repoRoot, 'src', 'server.mjs')], {
  env: { ...process.env, ...env },
  stdio: 'inherit',
});

const cleanup = () => {
  for (const holder of holders) holder.kill('SIGKILL');
  server.kill('SIGTERM');
  rmSync(dir, { recursive: true, force: true });
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
server.on('exit', cleanup);
