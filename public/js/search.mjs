/**
 * Split a body around every case-insensitive occurrence of a needle.
 *
 * Returned as segments rather than as markup so the caller builds DOM nodes:
 * message text comes from other sessions and is never trusted with markup.
 *
 * @param {string} text
 * @param {string} needle
 * @returns {Array<{text: string, hit: boolean}>}
 */
export function highlight(text, needle) {
  if (needle === '') return [{ text, hit: false }];

  const segments = [];
  const haystack = text.toLowerCase();
  const target = needle.toLowerCase();
  let cursor = 0;

  for (;;) {
    const at = haystack.indexOf(target, cursor);
    if (at === -1) break;
    if (at > cursor) segments.push({ text: text.slice(cursor, at), hit: false });
    segments.push({ text: text.slice(at, at + needle.length), hit: true });
    cursor = at + needle.length;
  }

  if (cursor < text.length) segments.push({ text: text.slice(cursor), hit: false });
  return segments;
}

/**
 * Messages whose body or participants match a query.
 *
 * @param {Array<object>} messages
 * @param {string} query
 * @returns {Array<object>}
 */
export function searchMessages(messages, query) {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [];

  return messages.filter(
    (message) =>
      message.text.toLowerCase().includes(needle) ||
      message.sender.name.toLowerCase().includes(needle) ||
      message.peer.name.toLowerCase().includes(needle),
  );
}

/**
 * A short window of the body around the first match, for a result row.
 *
 * @param {string} text
 * @param {string} needle
 * @param {number} [radius]
 * @returns {string}
 */
export function excerpt(text, needle, radius = 60) {
  const flat = text.replace(/\s+/g, ' ').trim();
  const at = flat.toLowerCase().indexOf(needle.trim().toLowerCase());
  if (at === -1) return flat.slice(0, radius * 2);

  const start = Math.max(0, at - radius);
  const end = Math.min(flat.length, at + needle.length + radius);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`;
}
