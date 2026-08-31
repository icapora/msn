import { avatarElement } from './avatar.mjs';
import { renderMarkdown } from './markdown.mjs';
import { playNudge } from './sounds.mjs';
import { dayKey, dayLabel, statusLabel, timeOf } from './format.mjs';
import { t } from './i18n.mjs';

const ALL_PEERS = '__all__';

/**
 * The party on the other end of a message, relative to the session in view.
 * @param {object} message
 * @param {string} self
 * @returns {{name: string}}
 */
export function otherParty(message, self) {
  return message.sender.name === self ? message.peer : message.sender;
}

/**
 * Build the "X is typing…" line.
 *
 * Real typing is not observable. This reports that a peer's session is busy,
 * which is the closest honest signal Claude Code exposes; the wording is MSN's,
 * and the meaning is spelled out in the README.
 *
 * @param {Array<string>} peers
 * @param {Map<string, string>} statuses
 * @returns {string}
 */
export function describeTyping(peers, statuses) {
  const busy = peers.filter((peer) => statuses.get(peer) === 'busy');
  if (busy.length === 0) return '';
  if (busy.length === 1) return t('typing.one', { name: busy[0] });
  return t('typing.many', { names: busy.slice(0, -1).join(', '), last: busy.at(-1) });
}

/**
 * Owns the tab strip and one window per contact.
 *
 * A window puts you inside the chosen session rather than above it: that
 * session's own messages sit on the right, everything said to it sits on the
 * left under the speaker's avatar. Reading a line therefore never requires
 * parsing an "A to B" label. See docs/design.md.
 */
export class Conversations {
  #tabsRoot;
  #windowsRoot;
  #onSend;
  #onFilterChange = () => {};
  #windows = new Map();
  #active = null;

  /**
   * @param {HTMLElement} tabsRoot
   * @param {HTMLElement} windowsRoot
   * @param {(to: string, text: string) => Promise<void>} onSend
   */
  constructor(tabsRoot, windowsRoot, onSend) {
    this.#tabsRoot = tabsRoot;
    this.#windowsRoot = windowsRoot;
    this.#onSend = onSend;
  }

  /** @returns {string|null} The screen name of the focused window. */
  get active() {
    return this.#active;
  }

  /**
   * @param {string} name
   * @returns {boolean} Whether a window is open for this contact.
   */
  has(name) {
    return this.#windows.has(name);
  }

  /**
   * Register the callback a peer chip fires when the filter changes.
   * @param {() => void} handler
   */
  onFilterChange(handler) {
    this.#onFilterChange = handler;
  }

  /**
   * Open, or focus, the window for a contact.
   * @param {string} name
   */
  open(name) {
    if (!this.#windows.has(name)) this.#windows.set(name, this.#createWindow(name));
    this.#active = name;
    this.#syncActive();
  }

  /**
   * Close a window and focus whichever remains.
   * @param {string} name
   */
  close(name) {
    const entry = this.#windows.get(name);
    if (!entry) return;
    entry.root.remove();
    entry.tab.remove();
    this.#windows.delete(name);
    if (this.#active === name) this.#active = [...this.#windows.keys()].at(-1) ?? null;
    this.#syncActive();
  }

  /**
   * Repaint a window.
   * @param {string} name The session this window stands inside.
   * @param {Array<object>} messages Messages it sent or received, oldest first.
   * @param {object|null} contact Roster entry, when the session is still live.
   * @param {Map<string, string>} statuses Live status keyed by screen name.
   * @param {boolean} canSend Whether the session is reachable right now.
   */
  update(name, messages, contact, statuses, canSend) {
    const entry = this.#windows.get(name);
    if (!entry) return;

    entry.subtitle.textContent = contact?.cwd ?? t('window.noSession');
    entry.status.textContent = statusLabel(contact?.status ?? 'offline');
    entry.avatar.dataset.status = contact?.status ?? 'offline';

    const peers = [...new Set(messages.map((message) => otherParty(message, name).name))];
    this.#renderPeerFilter(entry, peers);

    const visible =
      entry.peerFilter === ALL_PEERS
        ? messages
        : messages.filter((message) => otherParty(message, name).name === entry.peerFilter);

    const watched = entry.peerFilter === ALL_PEERS ? peers : [entry.peerFilter];
    entry.typing.textContent = describeTyping(watched, statuses);

    entry.input.disabled = !canSend;
    entry.send.disabled = !canSend;
    entry.note.textContent = canSend
      ? t('window.canSend', { name })
      : t('window.cannotSend', { name });

    this.#renderLog(entry, visible, name);
  }

  /**
   * Shake a window and play the nudge tone. Sends nothing.
   * @param {string} [name] Defaults to the focused window.
   */
  zumbido(name) {
    const entry = this.#windows.get(name ?? this.#active);
    if (!entry) return;
    playNudge();
    entry.root.classList.remove('shake');
    void entry.root.offsetWidth;
    entry.root.classList.add('shake');
  }

  #renderPeerFilter(entry, peers) {
    if (peers.length < 2) {
      entry.peerFilter = ALL_PEERS;
      entry.filterRow.replaceChildren();
      entry.filterRow.hidden = true;
      return;
    }
    if (entry.peerFilter !== ALL_PEERS && !peers.includes(entry.peerFilter)) {
      entry.peerFilter = ALL_PEERS;
    }

    entry.filterRow.hidden = false;
    entry.filterRow.replaceChildren(
      ...[ALL_PEERS, ...peers].map((peer) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.textContent = peer === ALL_PEERS ? t('peers.all') : peer;
        chip.setAttribute('aria-pressed', String(entry.peerFilter === peer));
        chip.addEventListener('click', () => {
          entry.peerFilter = peer;
          this.#onFilterChange();
        });
        return chip;
      }),
    );
  }

  #renderLog(entry, messages, self) {
    const atBottom = entry.log.scrollHeight - entry.log.scrollTop - entry.log.clientHeight < 60;

    const nodes = [];
    let lastDay = null;
    let lastAuthor = null;

    for (const message of messages) {
      const day = dayKey(message.ts);
      if (day !== lastDay) {
        lastDay = day;
        lastAuthor = null;
        const separator = document.createElement('div');
        separator.className = 'date-sep';
        separator.textContent = dayLabel(message.ts);
        nodes.push(separator);
      }

      const outgoing = message.sender.name === self;
      const author = outgoing ? self : otherParty(message, self).name;
      nodes.push(this.#row(message, outgoing, author, author !== lastAuthor));
      lastAuthor = author;
    }

    entry.log.replaceChildren(...nodes);
    if (atBottom) entry.log.scrollTop = entry.log.scrollHeight;
  }

  #row(message, outgoing, author, showHeader) {
    const gutter = document.createElement('div');
    gutter.className = 'row-gutter';
    if (showHeader) {
      const avatar = document.createElement('div');
      avatar.className = 'avatar avatar-sm';
      avatar.append(avatarElement(author));
      gutter.append(avatar);
    }

    const stack = document.createElement('div');
    stack.className = 'row-stack';

    if (showHeader) {
      const head = document.createElement('div');
      head.className = 'bubble-head';
      head.textContent = author;
      stack.append(head);
    }

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.append(renderMarkdown(message.text));

    const footer = document.createElement('div');
    footer.className = 'bubble-foot';
    footer.textContent = timeOf(message.ts);

    for (const [label, isError, shown] of [
      [t('badge.local'), false, message.local === true],
      [t('badge.truncated'), false, message.truncated === true],
      [t('badge.failed'), true, message.delivered === false],
    ]) {
      if (!shown) continue;
      const badge = document.createElement('span');
      badge.className = isError ? 'bubble-badge bubble-badge-error' : 'bubble-badge';
      badge.textContent = label;
      footer.append(badge);
    }

    stack.append(bubble, footer);

    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.side = outgoing ? 'out' : 'in';
    row.dataset.failed = String(message.delivered === false);
    row.append(gutter, stack);
    return row;
  }

  #createWindow(name) {
    const tabLabel = document.createElement('button');
    tabLabel.type = 'button';
    tabLabel.className = 'tab-label';
    tabLabel.textContent = name;
    tabLabel.addEventListener('click', () => this.open(name));

    const tabClose = document.createElement('button');
    tabClose.type = 'button';
    tabClose.className = 'tab-close';
    tabClose.textContent = '×';
    tabClose.title = t('window.close', { name });
    tabClose.addEventListener('click', () => this.close(name));

    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.setAttribute('role', 'tab');
    tab.append(tabLabel, tabClose);
    this.#tabsRoot.append(tab);

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.append(avatarElement(name));

    const status = document.createElement('span');
    status.className = 'window-status';

    const title = document.createElement('div');
    title.className = 'window-title';
    title.textContent = name;
    title.append(status);

    const subtitle = document.createElement('div');
    subtitle.className = 'window-sub';

    const heading = document.createElement('div');
    heading.append(title, subtitle);

    const zumbido = document.createElement('button');
    zumbido.type = 'button';
    zumbido.className = 'zumbido';
    zumbido.textContent = t('window.zumbido');
    zumbido.title = t('window.zumbidoTitle');
    zumbido.addEventListener('click', () => this.zumbido(name));

    const actions = document.createElement('div');
    actions.className = 'window-actions';
    actions.append(zumbido);

    const head = document.createElement('div');
    head.className = 'window-head';
    head.append(avatar, heading, actions);

    const filterRow = document.createElement('div');
    filterRow.className = 'peer-filter';
    filterRow.hidden = true;

    const log = document.createElement('div');
    log.className = 'log';

    const typing = document.createElement('div');
    typing.className = 'typing';

    const input = document.createElement('textarea');
    input.placeholder = t('window.compose', { name });
    input.rows = 2;

    const send = document.createElement('button');
    send.type = 'button';
    send.textContent = t('window.send');

    const composer = document.createElement('div');
    composer.className = 'composer';
    composer.append(input, send);

    const note = document.createElement('div');
    note.className = 'composer-note';

    const submit = async () => {
      const text = input.value.trim();
      if (text === '' || send.disabled) return;
      send.disabled = true;
      try {
        await this.#onSend(name, text);
        input.value = '';
      } finally {
        send.disabled = false;
        input.focus();
      }
    };

    send.addEventListener('click', submit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submit();
      }
    });

    const root = document.createElement('div');
    root.className = 'window';
    root.append(head, filterRow, log, typing, composer, note);
    this.#windowsRoot.append(root);

    return {
      name,
      root,
      tab,
      log,
      typing,
      input,
      send,
      note,
      subtitle,
      status,
      avatar,
      filterRow,
      peerFilter: ALL_PEERS,
    };
  }

  #syncActive() {
    const empty = this.#windowsRoot.querySelector('.empty-state');
    if (empty) empty.hidden = this.#windows.size > 0;

    for (const [name, entry] of this.#windows) {
      const isActive = name === this.#active;
      entry.root.dataset.active = String(isActive);
      entry.tab.setAttribute('aria-selected', String(isActive));
    }
  }
}
