import { avatarElement } from './avatar.mjs';
import { BuddyList } from './buddy-list.mjs';
import { Conversations } from './conversation.mjs';
import { connectStream } from './sse-client.mjs';
import { playMessage } from './sounds.mjs';
import { excerpt, highlight, searchMessages } from './search.mjs';
import { activate, pickLocale, plural, rememberLocale, storedLocale, t } from './i18n.mjs';
import { timeOf, uptime } from './format.mjs';

/**
 * Resolve the language before anything renders.
 *
 * Precedence is `?lang=`, then a previous explicit choice, then what the browser
 * reports the system prefers. A `?lang=` is remembered, so choosing a language
 * survives the next visit without the query string. English is the fallback, so
 * an unlisted system language still gets a usable interface.
 */
const requested = new URLSearchParams(location.search).get('lang');
const locale = pickLocale(
  navigator.languages ?? [navigator.language],
  requested ?? storedLocale(),
);
if (requested) rememberLocale(locale);

activate(locale);
document.documentElement.lang = locale;

/** Translate the static markup, which ships in English. */
function applyStaticText() {
  for (const node of document.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of document.querySelectorAll('[data-i18n-placeholder]')) {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  }
}

applyStaticText();

const dom = {
  banners: document.getElementById('banners'),
  buddyList: document.getElementById('buddy-list'),
  connection: document.getElementById('connection'),
  filter: document.getElementById('filter'),
  meAvatar: document.getElementById('me-avatar'),
  search: document.getElementById('msg-search'),
  searchResults: document.getElementById('search-results'),
  statMessages: document.getElementById('stat-messages'),
  statSessions: document.getElementById('stat-sessions'),
  statUptime: document.getElementById('stat-uptime'),
  tabs: document.getElementById('tabs'),
  windows: document.getElementById('windows'),
};

const state = {
  query: '',
  messages: [],
  sessions: [],
  degraded: null,
  warnings: [],
  meta: { startedAt: Date.now(), uptimeMs: 0, messageCount: 0, sendEnabled: true },
  unread: new Map(),
};

dom.meAvatar.append(avatarElement('MSN Web'));

/**
 * Every name that appears in the log, whether or not the session still runs.
 * @returns {Array<object>}
 */
function contacts() {
  const byName = new Map();

  for (const session of state.sessions) {
    byName.set(session.name, { ...session, messageCount: 0 });
  }
  for (const message of state.messages) {
    for (const party of [message.sender, message.peer]) {
      const existing = byName.get(party.name);
      if (existing) existing.messageCount += 1;
      else byName.set(party.name, { ...party, messageCount: 1, status: 'offline' });
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * @param {string} name
 * @returns {Array<object>} Messages this contact sent or received, oldest first.
 */
function threadFor(name) {
  return state.messages.filter(
    (message) => message.sender.name === name || message.peer.name === name,
  );
}

/**
 * Why the composer is usable, or is not.
 *
 * A disabled server and an absent session are different problems and used to
 * report the same message, which sent the reader looking for a session that was
 * running perfectly well.
 *
 * @param {object|null} session
 * @returns {'ok'|'disabled'|'unreachable'}
 */
function sendState(session) {
  if (!state.meta.sendEnabled) return 'disabled';
  return session?.socketPath ? 'ok' : 'unreachable';
}

function liveSession(name) {
  return state.sessions.find((session) => session.name === name) ?? null;
}

const conversations = new Conversations(dom.tabs, dom.windows, async (to, text) => {
  const response = await fetch('/api/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to, text }),
  });

  if (!response.ok) {
    const { error } = await response.json().catch(() => ({ error: response.statusText }));
    pushWarning(t('banner.sendFailed', { name: to, error }));
    return;
  }

  state.messages.push(localEcho(to, text));
  state.messages.sort((a, b) => a.ts - b.ts);
  render();
});

conversations.onFilterChange(render);

/**
 * A message typed here never passes through the capture hook, which only sees
 * the SendMessage tool. Without this echo the window would stay silent about
 * something the reader just did.
 *
 * @param {string} to
 * @param {string} text
 * @returns {object}
 */
function localEcho(to, text) {
  const peer = liveSession(to);
  return {
    v: 1,
    ts: Date.now(),
    text,
    local: true,
    delivered: true,
    truncated: false,
    sender: { name: t('me.name'), cwd: null, pid: null, status: 'online' },
    peer: {
      name: to,
      cwd: peer?.cwd ?? null,
      pid: peer?.pid ?? null,
      status: peer?.status ?? 'offline',
    },
  };
}

const buddyList = new BuddyList(dom.buddyList, (name) => {
  state.unread.delete(name);
  conversations.open(name);
  buddyList.setSelected(name);
  render();
});

dom.filter.addEventListener('input', () => {
  buddyList.setFilter(dom.filter.value);
  render();
});

dom.search.addEventListener('input', () => {
  state.query = dom.search.value;
  render();
});

dom.search.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  dom.search.value = '';
  state.query = '';
  render();
});

/**
 * Draw the search results, or hand the panel back to the conversation windows.
 *
 * Matches are rendered as text segments rather than markup: message bodies come
 * from other sessions, so nothing from them is ever assigned as HTML.
 */
function renderSearch() {
  const query = state.query.trim();
  const searching = query !== '';

  dom.searchResults.hidden = !searching;
  dom.tabs.hidden = searching;
  dom.windows.hidden = searching;
  if (!searching) return;

  const hits = searchMessages(state.messages, query).slice(-200).reverse();

  const summary = document.createElement('div');
  summary.className = 'search-summary';
  summary.textContent =
    hits.length === 0
      ? t('search.none', { query })
      : plural('search.results', hits.length, { query });

  dom.searchResults.replaceChildren(
    summary,
    ...hits.map((message) => searchHit(message, query)),
  );
}

function searchHit(message, query) {
  const avatar = document.createElement('div');
  avatar.className = 'avatar avatar-sm';
  avatar.append(avatarElement(message.sender.name));

  const head = document.createElement('div');
  head.className = 'search-hit-head';
  head.textContent = `${message.sender.name} → ${message.peer.name}`;

  const time = document.createElement('span');
  time.className = 'search-hit-time';
  time.textContent = timeOf(message.ts);
  head.append(time);

  const text = document.createElement('div');
  text.className = 'search-hit-text';
  for (const segment of highlight(excerpt(message.text, query), query)) {
    if (segment.hit) {
      const mark = document.createElement('mark');
      mark.textContent = segment.text;
      text.append(mark);
    } else {
      text.append(document.createTextNode(segment.text));
    }
  }

  const body = document.createElement('div');
  body.className = 'search-hit-body';
  body.append(head, text);

  const hit = document.createElement('button');
  hit.type = 'button';
  hit.className = 'search-hit';
  hit.append(avatar, body);
  hit.addEventListener('click', () => {
    dom.search.value = '';
    state.query = '';
    conversations.open(message.sender.name);
    buddyList.setSelected(message.sender.name);
    render();
  });
  return hit;
}

function pushWarning(text) {
  if (!state.warnings.includes(text)) state.warnings.push(text);
  render();
}

function renderBanners() {
  const notes = [...state.warnings];
  if (state.degraded) notes.push(t('banner.degraded', { reason: state.degraded }));

  const liveWithoutHistory = state.sessions.filter(
    (session) =>
      session.kind === 'interactive' &&
      !state.messages.some((message) => message.from?.pid === session.pid),
  );
  if (liveWithoutHistory.length > 0) {
    notes.push(
      plural('banner.noCapture', liveWithoutHistory.length, {
        names: liveWithoutHistory.map((session) => session.name).join(', '),
      }),
    );
  }

  dom.banners.hidden = notes.length === 0;
  dom.banners.replaceChildren(
    ...notes.map((text) => {
      const line = document.createElement('div');
      line.className = 'banner';
      line.textContent = text;
      return line;
    }),
  );
}

function render() {
  buddyList.render(contacts(), state.unread);
  renderBanners();
  renderSearch();

  const active = conversations.active;
  if (active !== null) {
    const session = liveSession(active);
    const statuses = new Map(state.sessions.map((entry) => [entry.name, entry.status]));
    conversations.update(active, threadFor(active), session, statuses, sendState(session));
  }

  const total = state.meta.messageCount ?? state.messages.length;
  dom.statMessages.textContent = plural('stats.messages', total);
  dom.statSessions.textContent = plural('stats.sessions', state.sessions.length);
}

connectStream(
  {
    meta(data) {
      state.meta = data;
      state.warnings = [...new Set([...state.warnings, ...(data.warnings ?? [])])];
      render();
    },
    roster(data) {
      state.sessions = data.sessions;
      state.degraded = data.degraded;
      render();
    },
    history(data) {
      const echoes = state.messages.filter((message) => message.local === true);
      state.messages = [...data, ...echoes].sort((a, b) => a.ts - b.ts);
      render();
    },
    message(data) {
      state.messages.push(data);
      state.messages.sort((a, b) => a.ts - b.ts);
      for (const name of [data.sender.name, data.peer.name]) {
        if (!conversations.has(name) || conversations.active !== name) {
          state.unread.set(name, (state.unread.get(name) ?? 0) + 1);
        }
      }
      playMessage();
      render();
    },
  },
  (connectionState) => {
    dom.connection.dataset.state = connectionState;
    dom.connection.textContent = t(`connection.${connectionState}`);
  },
);

setInterval(() => {
  const elapsed = Date.now() - state.meta.startedAt;
  dom.statUptime.textContent = t('stats.uptime', { value: uptime(elapsed) });
}, 1000);
