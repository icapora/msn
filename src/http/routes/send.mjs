import { sendToSocket } from '../../messaging/socket-client.mjs';

const MAX_BODY_BYTES = 256 * 1024;

/**
 * Read and parse a JSON request body, refusing anything oversized.
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<object>}
 */
export async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('request body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/**
 * Deliver a message typed in the browser into a live session.
 *
 * Resolution goes through the roster because the browser addresses a peer by
 * name, while the socket is named by pid.
 *
 * @param {{roster: import('../../roster/roster.mjs').Roster, enabled: boolean, replyTo: string}} deps
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export async function handleSend({ roster, enabled, replyTo }, req, res) {
  const reply = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };

  if (!enabled) return reply(403, { error: 'sending is disabled (MSN_DISABLE_SEND=1)' });

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    return reply(400, { error: error.message });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const to = typeof body.to === 'string' ? body.to : '';
  if (text === '') return reply(400, { error: 'text is required' });
  if (to === '') return reply(400, { error: 'to is required' });

  const target = roster.resolve({ name: to, pid: body.pid ?? null });
  if (target === null) return reply(404, { error: `no live session named "${to}"` });
  if (!target.socketPath) return reply(409, { error: `"${to}" has no inbox socket` });

  try {
    const { msgId } = await sendToSocket(target.socketPath, text, replyTo);
    return reply(200, { msgId, to: target.name, pid: target.pid });
  } catch (error) {
    return reply(502, { error: error.message });
  }
}
