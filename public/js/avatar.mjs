const SVG_NS = 'http://www.w3.org/2000/svg';

/** Shape recipes, expressed as data so nothing has to build markup from strings. */
const GLYPHS = [
  [['circle', { cx: 16, cy: 16, r: 8 }]],
  [['rect', { x: 8, y: 8, width: 16, height: 16, rx: 3 }]],
  [['path', { d: 'M16 7l9 16H7z' }]],
  [
    ['rect', { x: 8, y: 8, width: 16, height: 7, rx: 1 }],
    ['rect', { x: 8, y: 17, width: 16, height: 7, rx: 1 }],
  ],
  [['path', { d: 'M16 6l10 10-10 10L6 16z' }]],
  [
    ['circle', { cx: 12, cy: 12, r: 5 }],
    ['circle', { cx: 21, cy: 21, r: 5 }],
  ],
];

/**
 * FNV-1a, chosen because it is short, stable across runs and has no
 * dependencies. The value only picks colours and a shape, so collision quality
 * matters far less than every client agreeing on the same answer.
 *
 * @param {string} text
 * @returns {number} A 32-bit unsigned hash.
 */
export function hash(text) {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value >>> 0;
}

/**
 * Derive a stable palette and glyph index from a screen name.
 *
 * Two sessions with the same name deliberately share an avatar: the name is
 * the address in cross-session messaging, so it is the identity a reader is
 * matching against.
 *
 * @param {string} name
 * @returns {{hue: number, hue2: number, glyph: number}}
 */
export function avatarTraits(name) {
  const value = hash(name);
  return {
    hue: value % 360,
    hue2: (value >>> 9) % 360,
    glyph: (value >>> 17) % GLYPHS.length,
  };
}

/**
 * Build the avatar as real DOM nodes.
 *
 * The name never reaches the markup — only the numbers derived from it do —
 * so there is no string to escape and no innerHTML to trust.
 *
 * @param {string} name
 * @returns {SVGElement}
 */
export function avatarElement(name) {
  const { hue, hue2, glyph } = avatarTraits(name);

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');

  const background = document.createElementNS(SVG_NS, 'rect');
  background.setAttribute('width', '32');
  background.setAttribute('height', '32');
  background.setAttribute('fill', `hsl(${hue} 52% 84%)`);

  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('fill', `hsl(${hue2} 46% 42%)`);
  group.setAttribute('opacity', '0.9');

  for (const [tag, attributes] of GLYPHS[glyph]) {
    const shape = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attributes)) {
      shape.setAttribute(key, String(value));
    }
    group.append(shape);
  }

  svg.append(background, group);
  return svg;
}
