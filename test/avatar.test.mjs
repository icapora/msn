import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avatarTraits, hash } from '../public/js/avatar.mjs';

test('the same name always produces the same avatar', () => {
  assert.deepEqual(avatarTraits('session-a'), avatarTraits('session-a'));
  assert.equal(hash('session-a'), hash('session-a'));
});

test('different names generally produce different avatars', () => {
  assert.notDeepEqual(avatarTraits('session-a'), avatarTraits('session-b'));
});

test('traits stay in range for every name, including hashes above 2^31', () => {
  for (let i = 0; i < 20_000; i += 1) {
    const { hue, hue2, glyph } = avatarTraits(`session-${i}`);
    assert.ok(hue >= 0 && hue < 360, `hue out of range for session-${i}`);
    assert.ok(hue2 >= 0 && hue2 < 360, `hue2 out of range for session-${i}`);
    assert.ok(
      Number.isInteger(glyph) && glyph >= 0 && glyph < 6,
      `glyph out of range for session-${i}`,
    );
  }
});

test('handles an empty name without throwing', () => {
  const traits = avatarTraits('');
  assert.ok(Number.isInteger(traits.glyph));
});

test('spreads glyphs across the available shapes', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i += 1) seen.add(avatarTraits(`peer-${i}`).glyph);
  assert.equal(seen.size, 6);
});
