/** Buddy-list states, in the order the UI groups them. */
export const STATUS = {
  ONLINE: 'online',
  BUSY: 'busy',
  AWAY: 'away',
  OFFLINE: 'offline',
};

/** Spanish labels, matching the original client's vocabulary. */
export const STATUS_LABEL = {
  [STATUS.ONLINE]: 'En línea',
  [STATUS.BUSY]: 'Ocupado',
  [STATUS.AWAY]: 'No disponible',
  [STATUS.OFFLINE]: 'Sin conexión',
};

export const STATUS_ORDER = [STATUS.ONLINE, STATUS.BUSY, STATUS.AWAY, STATUS.OFFLINE];

/**
 * Map a session's reported liveness onto a buddy-list state.
 *
 * Interactive and background sessions report liveness through different fields
 * (`status` versus `state`); see docs/compatibility.md.
 *
 * @param {{kind?: string, status?: string, state?: string}} session
 * @returns {string} One of STATUS.
 */
export function toStatus(session) {
  if (session.kind === 'background') return STATUS.AWAY;
  if (session.status === 'idle') return STATUS.ONLINE;
  if (session.status === 'busy') return STATUS.BUSY;
  return STATUS.AWAY;
}
