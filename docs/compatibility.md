# Living with Claude Code changes

_Verified against Claude Code 2.1.251._

This project reads things Claude Code produces. Some of those are documented and stable;
others are internal and will change without notice. Keeping the two apart is the difference
between an app that degrades and one that silently reports that nothing is happening.

Version floors, the platform matrix and the socket paths live in
[versions.md](versions.md). This page is about what happens when a _newer_ Claude Code
changes something under the app.

## The two tiers

**Documented.** The app must remain fully functional on these alone.

| Source                          | Used for                                                          |
| ------------------------------- | ----------------------------------------------------------------- |
| `PostToolUse` hook payload      | Every captured message                                            |
| `claude agents --json`          | The authoritative session roster                                  |
| `CLAUDE_CODE_MESSAGING_SOCKET`  | The sender's pid, and this session's own socket                   |
| The socket directory convention | Probed, never assumed: `/tmp/cc-socks` then `/tmp/cc-socks-<uid>` |
| `CLAUDE_CODE_MESSAGING_TOKEN`   | The auth line, when one is needed                                 |

**Internal.** Accelerators only. Losing one degrades the experience, never the function.

| Source                       | Used for                  | Without it                                       |
| ---------------------------- | ------------------------- | ------------------------------------------------ |
| `~/.claude/sessions/*.json`  | Sub-second roster refresh | Falls back to the CLI at 5s, with a banner       |
| The inbox socket wire format | Sending from the browser  | Sending fails and says so; viewing is unaffected |

**Never read.** Transcripts under `~/.claude/projects/`. Their format is internal and
changes between versions, and the hook payload is the supported way to observe a message.

## How each internal read is guarded

Every internal source passes a validator before use. `isValidEntry` requires the fields the
app actually reads, not every field the file happens to have — a registry that gains keys
keeps working, and one that loses `name` or `pid` does not pretend to.

The degradation is deliberately asymmetric:

- **Some entries fail to parse** — skip those, keep the rest. One corrupt file must not
  hide the other five sessions.
- **Every entry fails to parse** — throw. This is the shape having changed, not a bad file,
  and returning `[]` would be indistinguishable from "no sessions are running", which is the
  failure mode that would leave you staring at an empty buddy list wondering why.

On the throw, `Roster` stops polling the registry, switches to CLI-only at 5s, emits
`degraded` **once**, and the page shows a banner. It does not retry the registry: a format
change is not transient, and a warning that reprints every second is a warning nobody reads.

## Version probe

At startup the server runs `claude --version` and compares it against
`claudeCode.minimumVersion` in `package.json`. Below the minimum it warns, in the terminal
and in the page banner. It does **not** refuse to start: the app may still work perfectly,
and refusing over a version string would be a worse outcome than a warning.

An unreadable or unparseable version is reported as unknown, not as a failure.

## The interactive/background split

`claude agents --json` returns two shapes in one array:

```jsonc
// interactive: pid + status
{ "pid": 4244, "kind": "interactive", "status": "busy", "name": "…", "cwd": "…" }

// background: id + state, no pid, no status
{ "id": "976060e2", "kind": "background", "state": "blocked", "name": "…", "cwd": "…" }
```

`normaliseRow` collapses both so nothing downstream knows the difference, and `toStatus`
maps an unrecognised liveness value to _No disponible_ rather than throwing. A third `kind`
appearing in a future version therefore shows up as away rather than crashing the poll.

## When something does change

1. `npm run doctor` tells you which surface broke.
2. If it is the hook payload, capture the new one with `MSN_RAW_DUMP` and update
   [hook-payload.md](hook-payload.md).
3. If it is the record schema, bump `v` and update [log-format.md](log-format.md), keeping
   the reader able to pass unknown versions through.
4. Update the _verified against_ line at the top of each page you touched.
