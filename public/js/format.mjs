import { currentLocale, t } from './i18n.mjs';

export const STATUS_ORDER = ['online', 'busy', 'away', 'offline'];

/**
 * @param {string} status
 * @returns {string} The label shown in the buddy list, in the active locale.
 */
export function statusLabel(status) {
  return STATUS_ORDER.includes(status) ? t(`status.${status}`) : t('status.offline');
}

/**
 * @param {number} ts Epoch milliseconds.
 * @returns {string} Local wall-clock time.
 */
export function timeOf(ts) {
  return new Date(ts).toLocaleTimeString(currentLocale(), {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Human day label, using relative wording for the two most recent days.
 * @param {number} ts Epoch milliseconds.
 * @returns {string}
 */
export function dayLabel(ts) {
  const date = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();

  if (sameDay(date, today)) return t('date.today');
  if (sameDay(date, yesterday)) return t('date.yesterday');
  return date.toLocaleDateString(currentLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/**
 * @param {number} ts Epoch milliseconds.
 * @returns {string} A stable key for grouping messages by calendar day.
 */
export function dayKey(ts) {
  return new Date(ts).toDateString();
}

/**
 * @param {number} ms
 * @returns {string} `HH:MM:SS`.
 */
export function uptime(ms) {
  const total = Math.floor(ms / 1000);
  const parts = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60];
  return parts.map((n) => String(n).padStart(2, '0')).join(':');
}

/**
 * Shorten a working directory to its last segments.
 *
 * The tail is what distinguishes one session from another; the home prefix is
 * identical for every one of them.
 *
 * @param {string|null} cwd
 * @param {number} [segments]
 * @returns {string}
 */
export function shortPath(cwd, segments = 2) {
  if (!cwd) return '';
  const parts = cwd.split('/').filter(Boolean);
  const tail = parts.slice(-segments).join('/');
  return parts.length > segments ? `…/${tail}` : `/${tail}`;
}
