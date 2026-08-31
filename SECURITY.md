# Security

## Reporting a vulnerability

Open a private security advisory on the repository rather than a public issue.

## What this project touches

It reads and writes files in your home directory and opens local sockets. It has no network
client, no telemetry, and no dependency that makes a network request at runtime.

### `~/.claude/settings.json`

The installer edits this file. It commonly contains **live credentials** — API tokens, MCP
server secrets, personal access tokens.

- The installer and uninstaller print **only the `hooks` key**, never the whole file, so a
  diff pasted into an issue cannot leak a token.
- Every write is preceded by a timestamped backup beside the original.
- A test asserts that install followed by uninstall restores the file byte for byte.
- Both refuse to run if the file does not parse, rather than rewriting it from a guess.

### The capture log

`~/.claude/msn-log.jsonl` holds the **full text** of every message your sessions send, up to
8 KB each. Treat it like a transcript: it can contain code, paths, and anything else Claude
wrote. It is not encrypted. Uninstalling the hook does not delete it.

### The server

It binds `127.0.0.1` and has **no authentication**. Anyone who can reach the port can read
every captured message and, unless `MSN_DISABLE_SEND=1`, deliver messages into your live
sessions. Do not bind it to a routable interface or put it behind a tunnel.

### Message rendering

Message text is written by other Claude sessions and is treated as untrusted. The markdown
renderer builds DOM nodes and assigns every string through `textContent`; the codebase
contains no `innerHTML` assignment at all, so message text cannot inject markup. Link
protocols are limited to `http`, `https` and `mailto`.

### Sending

A message delivered to a session's inbox socket is a cross-session message. Claude Code
already refuses to let one approve permission prompts, change configuration, or run slash
commands, and this project does not attempt to work around that. The server is not a child
of the target session, so its messages assert no permission class: a session running in
`bypassPermissions` mode will hold them for your approval.
