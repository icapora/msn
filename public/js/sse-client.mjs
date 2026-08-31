/**
 * Subscribe to the server's event stream.
 *
 * EventSource reconnects on its own, so the only work here is surfacing the
 * connection state to the UI and routing named events to handlers.
 *
 * @param {Record<string, (data: unknown) => void>} handlers Keyed by event name.
 * @param {(state: 'connecting'|'open'|'lost') => void} onState
 * @returns {EventSource}
 */
export function connectStream(handlers, onState) {
  const source = new EventSource('/events');

  onState('connecting');
  source.addEventListener('open', () => onState('open'));
  source.addEventListener('error', () => onState('lost'));

  for (const [event, handler] of Object.entries(handlers)) {
    source.addEventListener(event, (message) => handler(JSON.parse(message.data)));
  }
  return source;
}
