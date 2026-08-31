#!/usr/bin/env node
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config } from './config.mjs';
import { probeClaudeVersion } from './compat/probe.mjs';
import { MessageTail } from './log/tail.mjs';
import { History } from './log/history.mjs';
import { rotateIfLarge } from './log/rotate.mjs';
import { conversationKey, normalize } from './log/record.mjs';
import { Roster } from './roster/roster.mjs';
import { Inbox } from './messaging/inbox.mjs';
import { EventStream } from './http/sse.mjs';
import { serveStatic } from './http/static.mjs';
import { handleSend } from './http/routes/send.mjs';

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const startedAt = Date.now();

const roster = new Roster(config);
const stream = new EventStream();
const tail = new MessageTail(config.logPath);
const history = new History(config.historyLimit);
const inbox = new Inbox(config.inboxPath, config.selfName);
const warnings = [];

/**
 * Record a warning once, so a recurring condition cannot flood the banner.
 * @param {string} text
 */
function warn(text) {
  if (!warnings.includes(text)) warnings.push(text);
}

/**
 * Attach sender and peer identities to a raw record.
 *
 * Identity is resolved at read time rather than at capture time, so a session
 * renamed after the fact still displays correctly in its own history.
 *
 * @param {object} message
 * @returns {object}
 */
function enrich(message) {
  const sender = message.from?.name
    ? { pid: message.from.pid, name: message.from.name, cwd: null, status: 'offline' }
    : roster.identifySender(message.from ?? {});

  const peer = isSelf(message.target) ? selfIdentity() : roster.identify(message.target);

  return {
    ...message,
    sender,
    peer,
    conversation: conversationKey(
      message,
      (target) => roster.resolve(target)?.pid ?? target.pid,
    ),
  };
}

function selfIdentity() {
  return { pid: process.pid, name: config.selfName, cwd: null, status: 'online' };
}

function isSelf(target) {
  return target?.kind === 'socket' && target.pid === process.pid;
}

function meta() {
  return {
    startedAt,
    uptimeMs: Date.now() - startedAt,
    messageCount: history.total,
    residentCount: history.size,
    droppedCount: history.dropped,
    historyLimit: config.historyLimit,
    sendEnabled: config.sendEnabled,
    inboxAddress: inbox.listening ? inbox.address : null,
    logPath: config.logPath,
    warnings,
  };
}

function backlog() {
  return [
    { event: 'meta', data: meta() },
    { event: 'roster', data: roster.snapshot() },
    { event: 'history', data: history.recent().map(enrich) },
  ];
}

function ingest(record) {
  const message = record.target ? record : normalize(record);
  if (!history.add(message)) return;
  stream.broadcast('message', enrich(message));
  stream.broadcast('meta', meta());
}

tail.on('message', ingest);
tail.on('error', (error) => warn(`log: ${error.message}`));

inbox.on('message', ingest);

roster.on('change', (snapshot) => stream.broadcast('roster', snapshot));
roster.on('degraded', (reason) => {
  warn(`roster degraded to CLI-only: ${reason}`);
  stream.broadcast('meta', meta());
});
roster.on('error', (error) => warn(`roster: ${error.message}`));

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/events') {
    stream.add(res, backlog());
    return;
  }

  if (url.pathname === '/api/meta' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(meta()));
    return;
  }

  if (url.pathname === '/api/history' && req.method === 'GET') {
    const before = Number.parseInt(url.searchParams.get('before') ?? '', 10);
    const page = Number.isInteger(before)
      ? history.before(before, config.historyPageSize)
      : history.recent(config.historyPageSize);

    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ messages: page.map(enrich), hasMore: history.dropped > 0 }));
    return;
  }

  if (url.pathname === '/api/send' && req.method === 'POST') {
    await handleSend({ roster, enabled: config.sendEnabled, replyTo: inbox.address }, req, res);
    return;
  }

  if (req.method === 'GET' && (await serveStatic(publicDir, url.pathname, res))) return;

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('not found');
});

const rotation = rotateIfLarge(config.logPath, config.logMaxBytes);
if (rotation.rotated) {
  warn(`capture log passed ${config.logMaxBytes} bytes and was rotated to ${rotation.to}`);
}

const probe = await probeClaudeVersion({
  bin: config.claudeBin,
  minimum: config.minimumClaudeVersion,
});
if (probe.warning) warn(probe.warning);

try {
  await inbox.start();
} catch (error) {
  warn(`replies cannot be received: ${error.message}`);
}

await tail.start();
roster.start();

server.listen(config.port, config.host, () => {
  const { port } = server.address();
  console.log(`MSN: My Sessions Network  ->  http://${config.host}:${port}`);
  console.log(`log:    ${config.logPath}`);
  console.log(`inbox:  ${inbox.listening ? inbox.address : 'unavailable'}`);
  console.log(`claude: ${probe.version ?? 'unknown'}${probe.ok ? '' : '  (!)'}`);
  for (const warning of warnings) console.log(`warn:   ${warning}`);
});

const shutdown = async () => {
  roster.stop();
  stream.close();
  inbox.stop();
  await tail.stop();
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export { server, roster, history, inbox };
