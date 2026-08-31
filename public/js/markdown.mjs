const FENCE = /^( {0,3})```(\S*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const BULLET = /^[-*+]\s+(.*)$/;
const ORDERED = /^(\d+)[.)]\s+(.*)$/;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})$/;

/**
 * Inline rules, tried in order.
 *
 * Emphasis markers must sit flush against their content: without the
 * lookarounds, arithmetic such as `2 * 3 * 4` reads as italics.
 */
const INLINE = [
  ['code', /^`([^`]+)`/],
  ['strong', /^\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*/],
  ['del', /^~~(?=\S)([\s\S]+?)(?<=\S)~~/],
  ['em', /^\*(?=\S)([^*\n]+?)(?<=\S)\*/],
  ['em', /^_(?=\S)([^_\n]+?)(?<=\S)_/],
  ['link', /^\[([^\]]*)\]\(([^)\s]+)\)/],
];

const SAFE_PROTOCOL = /^(https?:|mailto:)/i;

/**
 * Split inline markup into a flat list of spans.
 *
 * Emphasis containers recurse, because real messages nest them — `**\`x\`**`
 * is how Claude writes an emphasised identifier. Code spans never recurse:
 * their content is literal by definition.
 *
 * @param {string} text
 * @returns {Array<{type: string, text?: string, children?: Array, href?: string}>}
 */
export function parseInline(text) {
  const spans = [];
  let plain = '';
  let rest = text;

  const flush = () => {
    if (plain !== '') spans.push({ type: 'text', text: plain });
    plain = '';
  };

  while (rest.length > 0) {
    let matched = false;

    for (const [type, pattern] of INLINE) {
      const match = pattern.exec(rest);
      if (match === null) continue;

      flush();
      if (type === 'link') spans.push({ type, text: match[1], href: match[2] });
      else if (type === 'code') spans.push({ type, text: match[1] });
      else spans.push({ type, children: parseInline(match[1]) });

      rest = rest.slice(match[0].length);
      matched = true;
      break;
    }

    if (!matched) {
      plain += rest[0];
      rest = rest.slice(1);
    }
  }

  flush();
  return spans;
}

/**
 * Parse a message body into a block tree.
 *
 * The subset covers what Claude actually writes into cross-session messages:
 * fenced code, headings, quotes, lists, rules and paragraphs. The parser is
 * pure so it can be tested without a DOM. See docs/design.md.
 *
 * @param {string} text
 * @returns {Array<object>}
 */
export function parseBlocks(text) {
  const lines = String(text ?? '').split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    const fence = FENCE.exec(line);
    if (fence !== null) {
      const indent = fence[1].length;
      const body = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index])) {
        body.push(
          lines[index].slice(0, indent).trim() === ''
            ? lines[index].slice(indent)
            : lines[index],
        );
        index += 1;
      }
      index += 1;
      blocks.push({ type: 'code', lang: fence[2], text: body.join('\n') });
      continue;
    }

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    if (RULE.test(line.trim())) {
      blocks.push({ type: 'rule' });
      index += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading !== null) {
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        spans: parseInline(heading[2]),
      });
      index += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted = [];
      while (index < lines.length && QUOTE.test(lines[index])) {
        quoted.push(QUOTE.exec(lines[index])[1]);
        index += 1;
      }
      blocks.push({ type: 'quote', blocks: parseBlocks(quoted.join('\n')) });
      continue;
    }

    if (BULLET.test(line) || ORDERED.test(line)) {
      const ordered = ORDERED.test(line);
      const pattern = ordered ? ORDERED : BULLET;
      const start = ordered ? Number(ORDERED.exec(line)[1]) : 1;
      const items = [];
      while (index < lines.length && pattern.test(lines[index])) {
        const match = pattern.exec(lines[index]);
        items.push(parseInline(ordered ? match[2] : match[1]));
        index += 1;
      }
      blocks.push({ type: 'list', ordered, start, items });
      continue;
    }

    const paragraph = [];
    while (
      index < lines.length &&
      lines[index].trim() !== '' &&
      !FENCE.test(lines[index]) &&
      !HEADING.test(lines[index]) &&
      !QUOTE.test(lines[index]) &&
      !BULLET.test(lines[index]) &&
      !ORDERED.test(lines[index]) &&
      !RULE.test(lines[index].trim())
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push({ type: 'paragraph', spans: parseInline(paragraph.join('\n')) });
  }

  return blocks;
}

function renderSpans(spans, parent) {
  for (const span of spans) {
    if (span.type === 'link' && SAFE_PROTOCOL.test(span.href)) {
      const anchor = document.createElement('a');
      anchor.href = span.href;
      anchor.target = '_blank';
      anchor.rel = 'noreferrer noopener';
      anchor.textContent = span.text;
      parent.append(anchor);
      continue;
    }

    if (span.type === 'code') {
      const code = document.createElement('code');
      code.textContent = span.text;
      parent.append(code);
      continue;
    }

    const tag = { strong: 'strong', em: 'em', del: 'del' }[span.type];
    if (tag === undefined) {
      parent.append(document.createTextNode(span.text));
      continue;
    }

    const element = document.createElement(tag);
    renderSpans(span.children, element);
    parent.append(element);
  }
}

function renderBlocks(blocks, parent) {
  for (const block of blocks) {
    if (block.type === 'code') {
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      if (block.lang) code.dataset.lang = block.lang;
      code.textContent = block.text;
      pre.append(code);
      parent.append(pre);
      continue;
    }

    if (block.type === 'rule') {
      parent.append(document.createElement('hr'));
      continue;
    }

    if (block.type === 'heading') {
      const heading = document.createElement(`h${Math.min(block.level + 2, 6)}`);
      renderSpans(block.spans, heading);
      parent.append(heading);
      continue;
    }

    if (block.type === 'quote') {
      const quote = document.createElement('blockquote');
      renderBlocks(block.blocks, quote);
      parent.append(quote);
      continue;
    }

    if (block.type === 'list') {
      const list = document.createElement(block.ordered ? 'ol' : 'ul');
      if (block.ordered && block.start !== 1) list.start = block.start;
      for (const spans of block.items) {
        const item = document.createElement('li');
        renderSpans(spans, item);
        list.append(item);
      }
      parent.append(list);
      continue;
    }

    const paragraph = document.createElement('p');
    renderSpans(block.spans, paragraph);
    parent.append(paragraph);
  }
}

/**
 * Render a message body as DOM nodes.
 *
 * Nothing is ever assigned as markup: every node is created and every string
 * lands in `textContent`, so message text cannot inject HTML no matter what a
 * peer session wrote. Link protocols are allowlisted for the same reason.
 *
 * @param {string} text
 * @returns {DocumentFragment}
 */
export function renderMarkdown(text) {
  const fragment = document.createDocumentFragment();
  renderBlocks(parseBlocks(text), fragment);
  return fragment;
}
