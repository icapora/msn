import { avatarElement } from './avatar.mjs';
import { STATUS_ORDER, shortPath, statusLabel } from './format.mjs';
import { plural } from './i18n.mjs';

const COLLAPSE_KEY = 'msn.collapsed-groups';

function loadCollapsed() {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '["away","offline"]'));
  } catch {
    return new Set(['away', 'offline']);
  }
}

function saveCollapsed(collapsed) {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed]));
  } catch {
    /* a browser with storage disabled still gets a working list */
  }
}

/**
 * Renders the contact panel and reports clicks upward.
 *
 * Group collapse is remembered per browser because the away group
 * holds background sessions, which are numerous and rarely what a reader is
 * looking at.
 */
export class BuddyList {
  #root;
  #onSelect;
  #collapsed = loadCollapsed();
  #filter = '';
  #selected = null;

  /**
   * @param {HTMLElement} root Container element.
   * @param {(name: string) => void} onSelect Called with the chosen screen name.
   */
  constructor(root, onSelect) {
    this.#root = root;
    this.#onSelect = onSelect;
  }

  /** @param {string} value Case-insensitive substring filter. */
  setFilter(value) {
    this.#filter = value.trim().toLowerCase();
  }

  /** @param {string|null} name Screen name to highlight. */
  setSelected(name) {
    this.#selected = name;
  }

  /**
   * Redraw the panel.
   * @param {Array<object>} contacts Roster entries, already merged with history.
   * @param {Map<string, number>} unread Unread counts keyed by screen name.
   */
  render(contacts, unread) {
    const visible = contacts.filter(
      (contact) =>
        this.#filter === '' ||
        contact.name.toLowerCase().includes(this.#filter) ||
        (contact.cwd ?? '').toLowerCase().includes(this.#filter),
    );

    this.#root.replaceChildren(
      ...STATUS_ORDER.map((status) => {
        const members = visible.filter((contact) => contact.status === status);
        return members.length === 0 ? null : this.#group(status, members, unread);
      }).filter(Boolean),
    );
  }

  #group(status, members, unread) {
    const group = document.createElement('section');
    group.className = 'group';
    group.dataset.collapsed = String(this.#collapsed.has(status));

    const caret = document.createElement('span');
    caret.className = 'group-caret';
    caret.textContent = '▼';

    const label = document.createElement('span');
    label.textContent = statusLabel(status);

    const count = document.createElement('span');
    count.className = 'group-count';
    count.textContent = `(${members.length})`;

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'group-header';
    header.append(caret, label, count);

    header.addEventListener('click', () => {
      if (this.#collapsed.has(status)) this.#collapsed.delete(status);
      else this.#collapsed.add(status);
      saveCollapsed(this.#collapsed);
      group.dataset.collapsed = String(this.#collapsed.has(status));
    });

    const items = document.createElement('div');
    items.className = 'group-items';
    items.append(
      ...members.map((contact) => this.#buddy(contact, unread.get(contact.name) ?? 0)),
    );

    group.append(header, items);
    return group;
  }

  #buddy(contact, unreadCount) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'buddy';
    button.setAttribute('aria-current', String(contact.name === this.#selected));
    button.title = `${contact.name} — ${statusLabel(contact.status)}${
      contact.cwd ? `\n${contact.cwd}` : ''
    }`;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.dataset.status = contact.status;
    avatar.append(avatarElement(contact.name));

    const text = document.createElement('div');
    text.className = 'buddy-text';

    const name = document.createElement('div');
    name.className = 'buddy-name';
    name.textContent = contact.name;

    const note = document.createElement('div');
    note.className = 'buddy-note';
    note.textContent = contact.cwd
      ? shortPath(contact.cwd)
      : plural('stats.messages', contact.messageCount ?? 0);

    text.append(name, note);
    button.append(avatar, text);

    if (unreadCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'buddy-unread';
      badge.textContent = String(unreadCount);
      button.append(badge);
    }

    button.addEventListener('click', () => this.#onSelect(contact.name));
    return button;
  }
}
