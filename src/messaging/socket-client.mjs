import { connect } from 'node:net';
import { randomUUID } from 'node:crypto';

const CONNECT_TIMEOUT_MS = 5000;
const DISPLAY_NAME = 'MSN Web';

/**
 * Build the line Claude Code accepts on a session's inbox socket.
 *
 * The envelope was captured from real traffic rather than taken from the docs,
 * which specify only the auth line. A cross-session message is delivered as a
 * user turn whose content is wrapped in a `<cross-session-message>` tag; the
 * `from-mode` attribute tells the receiver which permission class the sender
 * claims. See docs/phase-2-sending.md.
 *
 * `replyTo` is what the receiving Claude copies into its own `to` when it
 * answers, so it must be an address a reply can actually reach. A bare label
 * resolves to nothing and the reply is refused; the server's own inbox socket
 * is what makes the conversation two-way.
 *
 * @param {string} text Message body.
 * @param {string} replyTo Address peers should answer, as `uds:<path>`.
 * @returns {object} The envelope, ready to serialise.
 */
export function buildEnvelope(text, replyTo) {
  const attributes = `from="${replyTo}" from-name="${DISPLAY_NAME}" from-mode="prompting"`;
  return {
    msgV: 1,
    msg_id: randomUUID(),
    type: 'user',
    message: {
      role: 'user',
      content: `<cross-session-message ${attributes}>\n${text}\n</cross-session-message>`,
    },
    priority: 'next',
    from: replyTo,
  };
}

/**
 * Deliver one message to a session's inbox socket.
 *
 * The connection is opened only once the payload is ready: Claude Code closes
 * a connection that has not sent a complete line within 30 seconds.
 *
 * @param {string} socketPath Absolute path to the target session's socket.
 * @param {string} text Message body.
 * @param {string} replyTo Address peers should answer.
 * @returns {Promise<{msgId: string}>}
 * @throws {Error} When the socket is unreachable or the write fails.
 */
export function sendToSocket(socketPath, text, replyTo) {
  const envelope = buildEnvelope(text, replyTo);
  const line = `${JSON.stringify(envelope)}\n`;

  return new Promise((resolve, reject) => {
    const socket = connect(socketPath);
    let settled = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve({ msgId: envelope.msg_id });
    };

    socket.setTimeout(CONNECT_TIMEOUT_MS, () => finish(new Error('socket timed out')));
    socket.on('error', (error) => finish(error));
    socket.on('connect', () => {
      socket.write(line, (error) => {
        if (error) finish(error);
        else socket.end();
      });
    });
    socket.on('close', () => finish(null));
  });
}
