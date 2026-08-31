const STORAGE_KEY = 'msn.locale';

/**
 * Message catalogues.
 *
 * Spanish is not a translation of English here — it is the original. The
 * buddy-list states in particular reproduce the vocabulary the Spanish MSN
 * Messenger client used, so they are fixed strings rather than anything a
 * translator should smooth over. See docs/design.md.
 *
 * A string ending in `_one` / `_other` is a plural form, selected by `plural()`.
 */
export const CATALOGUES = {
  es: {
    'app.title': 'MSN: My Sessions Network',
    'app.tagline': 'My Sessions Network',

    'me.name': 'MSN Web',
    'me.note': 'mirando tus sesiones',

    'connection.connecting': 'conectando…',
    'connection.open': 'en línea',
    'connection.lost': 'sin conexión',

    'status.online': 'En línea',
    'status.busy': 'Ocupado',
    'status.away': 'No disponible',
    'status.offline': 'Sin conexión',

    'search.contacts': 'Buscar contacto…',
    'search.messages': 'Buscar en los mensajes…',
    'search.results_one': '{count} resultado para "{query}".',
    'search.results_other': '{count} resultados para "{query}".',
    'search.none': 'Sin resultados para "{query}".',

    'empty.title': 'Elegí un contacto para ver la conversación.',
    'empty.hint': 'Las conversaciones aparecen solas a medida que tus sesiones se escriben.',

    'window.zumbido': 'Zumbido',
    'window.zumbidoTitle': 'Sacude esta ventana. No envía nada.',
    'window.close': 'Cerrar {name}',
    'window.compose': 'Escribile a {name}…',
    'window.send': 'Enviar',
    'window.noSession': 'sesión no disponible',
    'window.canSend':
      'Tu mensaje llega a {name} como mensaje entre sesiones: no aprueba permisos ni ejecuta slash commands.',
    'window.cannotSend': 'No se puede escribir: {name} no está corriendo.',
    'window.sendDisabled': 'Envío deshabilitado en este servidor (MSN_DISABLE_SEND=1).',

    'typing.one': '{name} está escribiendo…',
    'typing.many': '{names} y {last} están escribiendo…',
    'peers.all': 'Todos',

    'badge.local': 'desde MSN Web',
    'badge.truncated': 'recortado a 8 KB',
    'badge.failed': '(!) no entregado',

    'date.today': 'Hoy',
    'date.yesterday': 'Ayer',

    'stats.messages_one': '{count} mensaje',
    'stats.messages_other': '{count} mensajes',
    'stats.sessions_one': '{count} sesión',
    'stats.sessions_other': '{count} sesiones',
    'stats.uptime': 'uptime {value}',

    'banner.noCapture_one':
      '{count} sesión sin mensajes capturados ({names}). Si arrancó antes de instalar el hook, reiniciála.',
    'banner.noCapture_other':
      '{count} sesiones sin mensajes capturados ({names}). Si arrancaron antes de instalar el hook, reiniciálas.',
    'banner.degraded': 'Buddy list degradada: {reason}',
    'banner.sendFailed': 'no se pudo enviar a {name}: {error}',
  },

  en: {
    'app.title': 'MSN: My Sessions Network',
    'app.tagline': 'My Sessions Network',

    'me.name': 'MSN Web',
    'me.note': 'watching your sessions',

    'connection.connecting': 'connecting…',
    'connection.open': 'online',
    'connection.lost': 'disconnected',

    'status.online': 'Online',
    'status.busy': 'Busy',
    'status.away': 'Away',
    'status.offline': 'Offline',

    'search.contacts': 'Search contacts…',
    'search.messages': 'Search messages…',
    'search.results_one': '{count} result for "{query}".',
    'search.results_other': '{count} results for "{query}".',
    'search.none': 'No results for "{query}".',

    'empty.title': 'Pick a contact to see the conversation.',
    'empty.hint': 'Conversations appear on their own as your sessions message each other.',

    'window.zumbido': 'Nudge',
    'window.zumbidoTitle': 'Shakes this window. Sends nothing.',
    'window.close': 'Close {name}',
    'window.compose': 'Message {name}…',
    'window.send': 'Send',
    'window.noSession': 'session unavailable',
    'window.canSend':
      'Your message reaches {name} as a cross-session message: it approves no permissions and runs no slash commands.',
    'window.cannotSend': 'Cannot write: {name} is not running.',
    'window.sendDisabled': 'Sending is disabled on this server (MSN_DISABLE_SEND=1).',

    'typing.one': '{name} is typing…',
    'typing.many': '{names} and {last} are typing…',
    'peers.all': 'All',

    'badge.local': 'from MSN Web',
    'badge.truncated': 'truncated at 8 KB',
    'badge.failed': '(!) not delivered',

    'date.today': 'Today',
    'date.yesterday': 'Yesterday',

    'stats.messages_one': '{count} message',
    'stats.messages_other': '{count} messages',
    'stats.sessions_one': '{count} session',
    'stats.sessions_other': '{count} sessions',
    'stats.uptime': 'uptime {value}',

    'banner.noCapture_one':
      '{count} session with no captured messages ({names}). If it started before the hook was installed, restart it.',
    'banner.noCapture_other':
      '{count} sessions with no captured messages ({names}). If they started before the hook was installed, restart them.',
    'banner.degraded': 'Buddy list degraded: {reason}',
    'banner.sendFailed': 'could not send to {name}: {error}',
  },
};

export const DEFAULT_LOCALE = 'en';

/**
 * Choose a catalogue for a list of preferred languages.
 *
 * Only the primary subtag is compared, so `es-AR`, `es-419` and `es` all land
 * on the same catalogue.
 *
 * @param {Array<string>} preferred Language tags, most preferred first.
 * @param {string} [override] An explicit choice, which wins when it is known.
 * @returns {string} A key of CATALOGUES.
 */
export function pickLocale(preferred = [], override = null) {
  if (override && override in CATALOGUES) return override;

  for (const tag of preferred) {
    const primary = String(tag).toLowerCase().split('-')[0];
    if (primary in CATALOGUES) return primary;
  }
  return DEFAULT_LOCALE;
}

/**
 * Fill `{placeholders}` in a template.
 * @param {string} template
 * @param {Record<string, string|number>} params
 * @returns {string}
 */
export function interpolate(template, params = {}) {
  return template.replace(/\{(\w+)\}/g, (whole, key) =>
    key in params ? String(params[key]) : whole,
  );
}

/**
 * A translator bound to one locale.
 *
 * A missing key returns the key itself rather than throwing or rendering an
 * empty string: a visible `window.send` in the interface is a bug report,
 * while a blank button is a mystery.
 *
 * @param {string} locale
 * @returns {{locale: string, t: (key: string, params?: object) => string,
 *            plural: (key: string, count: number, params?: object) => string}}
 */
export function createTranslator(locale) {
  const catalogue = CATALOGUES[locale] ?? CATALOGUES[DEFAULT_LOCALE];
  const fallback = CATALOGUES[DEFAULT_LOCALE];

  const t = (key, params) => {
    const template = catalogue[key] ?? fallback[key];
    return template === undefined ? key : interpolate(template, params);
  };

  return {
    locale,
    t,
    plural: (key, count, params = {}) =>
      t(`${key}_${count === 1 ? 'one' : 'other'}`, { ...params, count }),
  };
}

/**
 * Remember an explicit language choice, when the browser allows it.
 * @param {string} locale
 */
export function rememberLocale(locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* a browser with storage disabled still gets a working interface */
  }
}

/**
 * The stored choice, if any.
 * @returns {string|null}
 */
export function storedLocale() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

let active = createTranslator(DEFAULT_LOCALE);

/**
 * Set the locale every module renders in.
 *
 * A single active translator keeps the interface from having to thread one
 * through every constructor; the pure functions above stay independently
 * testable.
 *
 * @param {string} locale
 * @returns {ReturnType<typeof createTranslator>}
 */
export function activate(locale) {
  active = createTranslator(locale);
  return active;
}

/** @returns {string} The active locale. */
export function currentLocale() {
  return active.locale;
}

/**
 * Translate a key in the active locale.
 * @param {string} key
 * @param {object} [params]
 * @returns {string}
 */
export function t(key, params) {
  return active.t(key, params);
}

/**
 * Translate a counted key in the active locale.
 * @param {string} key
 * @param {number} count
 * @param {object} [params]
 * @returns {string}
 */
export function plural(key, count, params) {
  return active.plural(key, count, params);
}
