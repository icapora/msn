# Architecture

_Verified against Claude Code 2.1.251._

Messages arrive through two doors and the roster is assembled from two more. Everything
reaches the browser over one SSE stream; sending is the only path that runs the other way.

```
SendMessage (any session) → hook → msn-log.jsonl → stat poll ┐
                                                             ├→ History ┐
peer replies → our inbox socket ─────────────────────────────┘          │
                                                                        ├→ SSE → browser
claude agents --json  (30s) ┐                                           │
                            ├→ Roster ──────────────────────────────────┘
~/.claude/sessions/*  (1s) ─┘

browser POST /api/send → Roster resolves the name → /tmp/cc-socks/<pid>.sock
```

## The hook imports nothing

`hooks/msn-hook.mjs` has no imports, not even from `src/`. It runs inside every one of the
user's Claude Code sessions, on every message, so two properties matter more than reuse:
a refactor elsewhere must not be able to break it, and it must not pay module-resolution
cost per message. `src/log/record.mjs` validates what it writes and the test suite asserts
the two agree.

It also exits 0 on every path and never writes to stderr. A capture tool that interrupts
the work it is observing is worse than one that misses a message.

The `.mjs` extension is deliberate: it makes the file ESM regardless of any `package.json`,
so it keeps working if it is copied somewhere else or the manifest changes.

## Identity is keyed on pid

A message's `to` field is either a session name or a `uds:` reply address, and only the pid
appears in both. So pid is the canonical key, with the name as an alias:

- The hook derives `from.pid` from `CLAUDE_CODE_MESSAGING_SOCKET`, a **documented**
  variable whose basename is the pid. That survives changes to the internal registry.
- `claude agents --json` reports `pid` for interactive sessions.
- The registry file is _named_ by pid.
- The socket is `/tmp/cc-socks/<pid>.sock`.

Names are resolved at read time, not at capture time, so a session renamed after the fact
still displays correctly in its own history.

## Two roster sources, held apart

`Roster` keeps the registry's sessions and the CLI's sessions in **separate maps** and
unions them on read. The obvious single-map design has a bug worth naming: the registry
poll runs every second, the CLI poll every thirty, and only the CLI reports background
sessions — so a shared map that each poll clears would drop the background group for
twenty-nine seconds out of every thirty. Held apart, the fast poll cannot erase what only
the slow poll knows.

Degradation is covered in [compatibility.md](compatibility.md).

## History is bounded, deliberately

Messages average several kilobytes because Claude writes long ones. An unbounded array is
therefore two problems at once: memory that only grows, and a first paint that ships the
entire history to every connecting browser. At ten thousand messages that is tens of
megabytes, per client.

`History` keeps a bounded window resident and counts what it evicts, so the status bar can
still report a true total. Older messages are served by `GET /api/history?before=<ts>`.
`rotateIfLarge` moves the capture log aside at startup once it passes its size cap, keeping
one generation; the hook holds no file handle between writes, so renaming while sessions are
running is safe and the next append recreates the file.

`History` also dedupes by `msgId`. Two paths can describe one delivery — the sender's hook
and our own inbox socket — and the id is what keeps a reply from appearing twice.

## Normalisation belongs to the record

Two sources feed the pipeline: the capture log and the inbox socket. Deriving fields in the
_reader_ meant a record entering through the second door reached the renderer without a
parsed `target`, and the server crashed on the first real reply. `normalize()` in
`src/log/record.mjs` is shared by both entrances. When a pipeline grows a second entrance,
the derived fields belong to the data, not to whichever reader happened to come first.

## Names outlive sessions

`NameCache` persists `sessionId → name` to `~/.claude/msn-names.json`. History outlives the
sessions in it: a message from last week names a peer that exited days ago, and without the
cache the buddy list could only show a raw pid. When nothing remembers, the fallback is the
working directory's last segment plus the pid — still recognisable.

## Why SSE and not WebSocket

The traffic is one-directional: the server pushes, the browser reads. SSE is native in Node
with no framing code, and `EventSource` reconnects on its own, which matters for a page left
open all day. The single client-to-server action, sending a message, is a `POST`.

Using Node for both the server and the hook keeps the whole project on one runtime with no
build step.

## Why chokidar is the only runtime dependency

`fs.watch` on macOS is unreliable around renames and truncation, and a missed event here
looks exactly like "the viewer is broken". The tailer also has to watch the _directory_
rather than the file, because the log legitimately does not exist until the first hook runs
and a watch on a non-existent path never fires.

Everything else — HTTP, SSE, Unix sockets, the test runner — is in the standard library.

## Module layout

|                                   |                                                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/config.mjs`                  | Every path and interval, each overridable by environment variable so tests never patch the filesystem |
| `src/log/record.mjs`              | Parse and normalise a line; resolve the two forms of `to`; key a conversation                         |
| `src/log/tail.mjs`                | Follow the log across appends, truncation and creation                                                |
| `src/roster/*`                    | The two sources, the status mapping, the merge, the name cache                                        |
| `src/http/*`                      | Routing, SSE fan-out, static files, the send route                                                    |
| `src/messaging/socket-client.mjs` | The captured wire envelope                                                                            |
| `src/compat/probe.mjs`            | Version check                                                                                         |
| `src/server.mjs`                  | Composition root — the only file that wires the others together                                       |

The front end mirrors this in `public/js/`, split so the pure parts — `avatar`, `format`,
`markdown`, and `describeTyping` — are imported directly by `node:test` without a DOM.
