# Versions and platforms

_Claims below are drawn from the Claude Code documentation and verified against
**v2.1.251** on macOS. Update the line at the top of any page you re-verify._

Run `npm run doctor` before reading further — it reports your version, your platform, and
which parts of this project will work on it.

## The floor

|                | Minimum Claude Code | Why                                                                                  |
| -------------- | ------------------- | ------------------------------------------------------------------------------------ |
| macOS          | **2.1.224**         | Cross-session messaging, and therefore the `SendMessage` calls this project captures |
| Linux          | **2.1.224**         | Same                                                                                 |
| Linux in WSL 2 | **2.1.224**         | WSL 2 is Linux here: same sockets, same paths                                        |
| Native Windows | **2.1.234**         | Messaging arrived later there, and over named pipes                                  |

Below the minimum, `SendMessage` does not exist, so there is nothing to capture. The server
warns and still starts: refusing to run over a version string would be a worse outcome than
saying so.

## What works where

|                           | macOS | Linux | WSL 2 | Native Windows |
| ------------------------- | ----- | ----- | ----- | -------------- |
| Capture messages (hook)   | yes   | yes   | yes   | yes            |
| Buddy list                | yes   | yes   | yes   | yes            |
| Search, markdown, Zumbido | yes   | yes   | yes   | yes            |
| **Send from the browser** | yes   | yes   | yes   | **no**         |
| **Receive replies**       | yes   | yes   | yes   | **no**         |

Native Windows is view-only. Claude Code binds a **named pipe** there rather than a Unix
domain socket, and this project implements only the socket. Everything that reads the
capture log works unchanged, because the hook is platform-independent.

Contributions adding named-pipe support are welcome; `src/messaging/socket-client.mjs` and
`src/messaging/inbox.mjs` are the two files that would need a Windows path.

## Versions that changed something this project relies on

Only the ones that matter here. Later versions are safe; the project reads nothing that a
newer release is known to have removed.

| Version | Change                                                                                    |
| ------- | ----------------------------------------------------------------------------------------- |
| 2.1.224 | Cross-session messaging on macOS, Linux and WSL 2                                         |
| 2.1.225 | Starting a conversation with a session on another machine, not just replying              |
| 2.1.234 | Cross-session messaging on native Windows, over named pipes                               |
| 2.1.236 | `notify_when_idle`; a refused burst is reported to the sender instead of silently dropped |
| 2.1.239 | `/list-agents` shows the session's own name                                               |
| 2.1.247 | An arriving message is shown as a one-line preview rather than in full                    |
| 2.1.248 | Same-machine messaging on Bedrock, Vertex, Foundry, and with feature-flag fetching off    |
| 2.1.251 | The version this project is verified against                                              |

## Where the socket lives

Claude Code prefers `/tmp/cc-socks/<pid>.sock`. When it cannot accept that directory — one
owned by another user on a shared machine, for instance — it uses a private per-user
directory, `/tmp/cc-socks-<uid>/`, instead.

Both are probed, in that order, because `claude agents --json` reports a **pid** and never a
path. Guessing a single directory would make sending fail on precisely the machines that
need the fallback, and it would fail invisibly: the buddy list would look perfect, because
names come from the CLI, while every send reported "no inbox socket".

Set `MSN_SOCKET_DIR` to override the probe with a single directory.

When the on-disk session registry is readable, its `messagingSocketPath` is used directly
and no probing is needed. The probe matters in CLI-only mode — see
[compatibility.md](compatibility.md).

## The auth line

The docs specify a first line a client may send on a session's socket:

```json
{ "type": "auth", "token": "<CLAUDE_CODE_MESSAGING_TOKEN>" }
```

| Platform            | Required?                                                                          |
| ------------------- | ---------------------------------------------------------------------------------- |
| macOS, Linux, WSL 2 | Optional — a connection is accepted with or without it                             |
| Native Windows      | Required — a connection whose first line is not a valid auth line delivers nothing |

This project does not send it. It has no access to another session's token — the variable is
exported only into that session's own children — and on the platforms it supports the line is
optional. The consequence is documented in
[phase-2-sending.md](phase-2-sending.md): messages assert no permission class, so a session
running in `bypassPermissions` mode holds them for approval.

On native Windows the token would be mandatory, which is a second reason sending is not
implemented there.

## Boundaries that cannot be crossed

Sessions find each other through files on disk, so they must share a filesystem and a home
directory:

- **A container and its host cannot reach each other.** Two sessions inside the same
  container can.
- **WSL 2 and native Windows on the same computer cannot reach each other.** They register
  under different home directories and listen on different socket types.

Run the server on the same side of the boundary as the sessions you want to watch. Its own
inbox socket has the same constraint: a peer can only reply to it from within the same
filesystem.

## Which sessions appear

| Session kind                | Appears?                                               |
| --------------------------- | ------------------------------------------------------ |
| Interactive (`claude`)      | Yes — **En línea** when idle, **Ocupado** when busy    |
| Background (`claude --bg`)  | Yes — grouped under **No disponible**                  |
| Headless (`claude -p`)      | Yes — it binds an inbox socket like an interactive one |
| Bare mode (`claude --bare`) | **No** — it binds no socket and is in no listing       |

A session that started **before** the hook was installed appears in the buddy list, because
that comes from the CLI, but logs nothing until it is restarted. The page shows a banner
naming any such session.

## Providers

Same-machine messaging works on every provider, including Amazon Bedrock, Claude Platform on
AWS, Google Cloud's Agent Platform and Microsoft Foundry, and with feature-flag fetching off
— on those, from **2.1.248**.

This project only ever reads same-machine traffic, so it has no other provider requirement.
Sessions on other machines and in the cloud reach each other through Anthropic servers and
never touch the local socket, so they never appear here.
