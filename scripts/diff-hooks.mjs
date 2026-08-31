const ESC = String.fromCharCode(27);

const STYLE = {
  added: `${ESC}[32m`,
  removed: `${ESC}[31m`,
  context: `${ESC}[2m`,
  reset: `${ESC}[0m`,
};

/**
 * Render a line diff of the `hooks` key alone.
 *
 * Only this key is rendered because the settings file routinely holds
 * credentials that must never reach a terminal or a bug report.
 * See SECURITY.md for the reasoning.
 *
 * @param {object} before Settings object before the change.
 * @param {object} after Settings object after the change.
 * @param {boolean} [color] Emit ANSI colour; defaults to whether stdout is a TTY.
 * @returns {string} The rendered diff.
 */
export function diffHooks(before, after, color = Boolean(process.stdout.isTTY)) {
  const render = (settings) =>
    JSON.stringify({ hooks: settings.hooks ?? null }, null, 2).split('\n');
  const from = render(before);
  const to = render(after);

  const paint = (style, text) => (color ? `${style}${text}${STYLE.reset}` : text);
  const lines = [];
  let i = 0;
  let j = 0;

  while (i < from.length || j < to.length) {
    if (i < from.length && j < to.length && from[i] === to[j]) {
      lines.push(paint(STYLE.context, `  ${from[i]}`));
      i += 1;
      j += 1;
    } else if (j < to.length && !from.includes(to[j])) {
      lines.push(paint(STYLE.added, `+ ${to[j]}`));
      j += 1;
    } else if (i < from.length) {
      lines.push(paint(STYLE.removed, `- ${from[i]}`));
      i += 1;
    } else {
      lines.push(paint(STYLE.added, `+ ${to[j]}`));
      j += 1;
    }
  }
  return lines.join('\n');
}
