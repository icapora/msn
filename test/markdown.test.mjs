import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBlocks, parseInline } from '../public/js/markdown.mjs';

test('parses a fenced code block and keeps its language', () => {
  const [block] = parseBlocks('```python\nx = 1\ny = 2\n```');
  assert.deepEqual(block, { type: 'code', lang: 'python', text: 'x = 1\ny = 2' });
});

test('keeps markdown syntax inert inside a code block', () => {
  const [block] = parseBlocks('```\n**not bold** and `not code`\n```');
  assert.equal(block.text, '**not bold** and `not code`');
});

test('parses a blockquote, including one holding other blocks', () => {
  const [block] = parseBlocks('> Structure was gated.\n> Meaning was not.');
  assert.equal(block.type, 'quote');
  assert.equal(block.blocks[0].type, 'paragraph');
});

test('parses headings, rules and both kinds of list', () => {
  assert.equal(parseBlocks('## Status')[0].level, 2);
  assert.equal(parseBlocks('---')[0].type, 'rule');
  assert.equal(parseBlocks('- one\n- two')[0].items.length, 2);
  assert.equal(parseBlocks('1. one\n2. two')[0].ordered, true);
});

test('an unterminated fence still yields a code block', () => {
  const [block] = parseBlocks('```\nno closing fence');
  assert.equal(block.type, 'code');
  assert.equal(block.text, 'no closing fence');
});

test('parses inline code, emphasis and links', () => {
  assert.deepEqual(parseInline('`x`'), [{ type: 'code', text: 'x' }]);
  assert.deepEqual(parseInline('**b**'), [
    { type: 'strong', children: [{ type: 'text', text: 'b' }] },
  ]);
  assert.deepEqual(parseInline('_i_'), [
    { type: 'em', children: [{ type: 'text', text: 'i' }] },
  ]);
  assert.deepEqual(parseInline('[t](https://x.dev)'), [
    { type: 'link', text: 't', href: 'https://x.dev' },
  ]);
});

test('parses a code span nested inside emphasis, as Claude writes identifiers', () => {
  assert.deepEqual(parseInline('**`total_duration_seconds`**'), [
    { type: 'strong', children: [{ type: 'code', text: 'total_duration_seconds' }] },
  ]);
});

test('never parses markdown inside a code span', () => {
  assert.deepEqual(parseInline('`**not bold**`'), [{ type: 'code', text: '**not bold**' }]);
});

test('parses a fence indented inside a list item', () => {
  const blocks = parseBlocks('1. **step**\n   ```\n   pre-deploy (0): 120\n   ```\n   done.');
  const code = blocks.find((block) => block.type === 'code');
  assert.equal(code.text, 'pre-deploy (0): 120');
});

test('keeps the starting number of an ordered list', () => {
  assert.equal(parseBlocks('2. second\n3. third')[0].start, 2);
  assert.equal(parseBlocks('1. first')[0].start, 1);
});

test('leaves unmatched punctuation as plain text', () => {
  assert.deepEqual(parseInline('2 * 3 * 4'), [{ type: 'text', text: '2 * 3 * 4' }]);
  assert.deepEqual(parseInline('a ** b'), [{ type: 'text', text: 'a ** b' }]);
});

test('treats HTML in a message as text rather than markup', () => {
  const spans = parseInline('<img src=x onerror=alert(1)>');
  assert.equal(spans.length, 1);
  assert.equal(spans[0].type, 'text');
});

test('handles an empty or missing body without throwing', () => {
  assert.deepEqual(parseBlocks(''), []);
  assert.deepEqual(parseBlocks(null), []);
});
