import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOGUES,
  DEFAULT_LOCALE,
  createTranslator,
  interpolate,
  pickLocale,
} from '../public/js/i18n.mjs';

test('every catalogue defines exactly the same keys', () => {
  const locales = Object.keys(CATALOGUES);
  const reference = Object.keys(CATALOGUES[DEFAULT_LOCALE]).sort();

  for (const locale of locales) {
    assert.deepEqual(
      Object.keys(CATALOGUES[locale]).sort(),
      reference,
      `catalogue "${locale}" does not match "${DEFAULT_LOCALE}"`,
    );
  }
});

test('every plural key defines both forms', () => {
  for (const [locale, catalogue] of Object.entries(CATALOGUES)) {
    for (const key of Object.keys(catalogue)) {
      if (!key.endsWith('_one')) continue;
      const other = `${key.slice(0, -4)}_other`;
      assert.ok(other in catalogue, `"${locale}" is missing ${other}`);
    }
  }
});

test('no catalogue entry leaves a placeholder the other one fills', () => {
  const placeholders = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  for (const key of Object.keys(CATALOGUES[DEFAULT_LOCALE])) {
    const reference = placeholders(CATALOGUES[DEFAULT_LOCALE][key]);
    for (const [locale, catalogue] of Object.entries(CATALOGUES)) {
      assert.deepEqual(
        placeholders(catalogue[key]),
        reference,
        `"${locale}" and "${DEFAULT_LOCALE}" disagree on the placeholders of ${key}`,
      );
    }
  }
});

test('picks a catalogue from the system languages, ignoring the region', () => {
  assert.equal(pickLocale(['es-AR', 'en-US']), 'es');
  assert.equal(pickLocale(['es-419']), 'es');
  assert.equal(pickLocale(['en-GB']), 'en');
  assert.equal(pickLocale(['EN-gb']), 'en');
});

test('falls back to the default for a language with no catalogue', () => {
  assert.equal(pickLocale(['ja', 'ko']), DEFAULT_LOCALE);
  assert.equal(pickLocale([]), DEFAULT_LOCALE);
  assert.equal(pickLocale(), DEFAULT_LOCALE);
});

test('skips languages it does not have and takes the next one it does', () => {
  assert.equal(pickLocale(['ja', 'es-AR', 'en']), 'es');
});

test('an explicit override wins, unless it names a language with no catalogue', () => {
  assert.equal(pickLocale(['en'], 'es'), 'es');
  assert.equal(pickLocale(['es'], 'ja'), 'es');
});

test('fills placeholders and leaves unknown ones visible', () => {
  assert.equal(interpolate('hola {name}', { name: 'msn' }), 'hola msn');
  assert.equal(interpolate('{a} y {b}', { a: 1, b: 2 }), '1 y 2');
  assert.equal(interpolate('{missing}', {}), '{missing}');
});

test('translates in the requested locale', () => {
  assert.equal(createTranslator('es').t('status.online'), 'En línea');
  assert.equal(createTranslator('en').t('status.online'), 'Online');
});

test('keeps the Spanish buddy states the original client used', () => {
  const es = createTranslator('es');
  assert.equal(es.t('status.online'), 'En línea');
  assert.equal(es.t('status.busy'), 'Ocupado');
  assert.equal(es.t('status.away'), 'No disponible');
  assert.equal(es.t('status.offline'), 'Sin conexión');
  assert.equal(es.t('window.zumbido'), 'Zumbido');
});

test('agrees the noun with its count in both locales', () => {
  assert.equal(createTranslator('es').plural('stats.messages', 1), '1 mensaje');
  assert.equal(createTranslator('es').plural('stats.messages', 0), '0 mensajes');
  assert.equal(createTranslator('en').plural('stats.messages', 1), '1 message');
  assert.equal(createTranslator('en').plural('stats.messages', 2), '2 messages');
});

test('an unknown key renders as itself, so a gap is visible rather than blank', () => {
  assert.equal(createTranslator('en').t('no.such.key'), 'no.such.key');
});

test('an unknown locale falls back to the default catalogue', () => {
  assert.equal(createTranslator('ja').t('status.online'), 'Online');
});
