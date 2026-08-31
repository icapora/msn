# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

MSN: My Sessions Network captures the messages Claude Code sessions send each other and
renders them as an MSN Messenger-style buddy list. A user-level `PostToolUse` hook appends
every `SendMessage` call to `~/.claude/msn-log.jsonl`; a Node server tails that log and
pushes events to a vanilla-JS page over SSE; the page can write back into a live session
through its inbox socket.

## Commands

```bash
npm start                              # server on http://127.0.0.1:4646
npm test                               # node:test, no test dependency
node --test test/log/record.test.mjs   # one file
node --test --test-name-pattern="two forms" test/log/record.test.mjs   # one test
npm run lint && npm run format:check   # what CI enforces
npm run doctor                         # version, platform, hook, log, registry, sockets

npm run install:hook                   # dry run: prints the settings.json diff
npm run install:hook -- --apply
npm run uninstall:hook -- --apply
```

Always scope `--test-name-pattern` to a file. Applied across the suite it reports files whose
tests were all filtered out as failures, which looks alarming and means nothing.

Everything is configurable by environment variable (see `src/config.mjs`), which is how tests
point the app at temporary directories instead of patching the filesystem. `MSN_LOG_PATH`,
`MSN_REGISTRY_DIR`, `MSN_INBOX_PATH`, `MSN_PORT` (use `0` for an ephemeral port) and
`MSN_CLAUDE_BIN` are the ones tests use most.

## Architecture

Data enters through **two doors** and leaves through one:

```
SendMessage (any session) → hook → msn-log.jsonl → tail ─┐
peer replies → inbox socket ────────────────────────────┤→ History → SSE → browser
                                                         │
claude agents --json (30s) ─┐                            │
~/.claude/sessions/*.json (1s) ─→ Roster ────────────────┘
```

`src/server.mjs` is the only file that wires these together. Read it first.

**Identity is keyed on pid, never on name.** A log record's `to` field takes two forms: a
session name when Claude opens a conversation, and a `uds:/tmp/cc-socks/<pid>.sock` reply
address when it answers. Roughly half of real traffic uses the second. Indexing by name
silently loses every reply — half of every conversation — with no error. `parseTarget` in
`src/log/record.mjs` handles both; pid is the only value present in each.

**Names are resolved at read time**, in `enrich()`, not at capture time, so a session renamed
after the fact still displays correctly in its own history. `NameCache` persists
`sessionId → name` so history outlives the sessions in it.

**The roster's two sources are held in separate maps and unioned on read.** The registry
polls every second; the CLI every thirty and is the only source that reports background
sessions. A single shared map that each poll cleared would drop the background group for
twenty-nine seconds out of every thirty.

**Normalisation belongs to the record, not the reader.** Both doors call `normalize()` from
`src/log/record.mjs`. Deriving fields inside the log reader once meant socket-borne records
reached the renderer without a parsed `target`, and the server crashed on the first reply.

## Load-bearing decisions that look like cleanup opportunities

**`hooks/msn-hook.mjs` imports nothing — not even from `src/`.** It runs inside every one of
the user's sessions on every message, so a refactor elsewhere must not be able to break it
and it must not pay module resolution per message. `src/log/record.mjs` validates what it
writes and a test asserts the two agree. It also exits 0 on every path and writes nothing to
stderr: a capture tool that interrupts the work it observes is worse than one that misses a
message. The `.mjs` extension is deliberate, so it stays ESM regardless of any manifest.

**The tailer polls the log's size; it does not watch it.** This replaced chokidar, which
missed appends on macOS and made the suite flaky. The target is one file that one process
appends to — the case watching libraries are least needed for. Do not "improve" it back into
a watcher.

**Zero runtime dependencies is a maintained property**, not an accident of being small. Dev
tooling is a separate question and welcome.

**No `innerHTML`, anywhere.** Message text is written by other sessions and is untrusted.
`public/js/markdown.mjs` builds DOM nodes and every string lands in `textContent`; link
protocols are allowlisted. `public/js/avatar.mjs` builds SVG the same way.

**Never parse transcripts** under `~/.claude/projects/`. Their format is internal and changes
between versions. The hook payload is the supported way to observe a message.

**Socket directories are probed, never assumed.** Claude Code prefers `/tmp/cc-socks` but
falls back to `/tmp/cc-socks-<uid>`. Hardcoding the first makes sending fail invisibly on the
machines that need the second: the buddy list still looks perfect, because names come from
the CLI.

**Nothing is dropped silently.** Unrecognised `tool_input` keys go to `extra`, the whole
`tool_response` is preserved, and a record with an unknown `v` passes through rather than
being discarded. If you change the record shape, bump `v`, update `docs/log-format.md`, and
keep the reader able to pass unknown versions through.

**Never print `~/.claude/settings.json` wholesale.** It routinely holds credentials. The
install and uninstall scripts render only the `hooks` key, so a diff pasted into an issue
cannot leak a token.

**Spanish is the original, not a translation.** _En línea_, _Ocupado_, _No disponible_,
_Sin conexión_ and _Zumbido_ are what the Spanish MSN Messenger client said; reproducing them
is the homage. A test enforces catalogue parity, so a partial translation fails the build.

## Documenting changes

JSDoc on exported functions — parameters, return, contract. The "why" goes in `docs/*.md`,
not in comment blocks. An inline comment is warranted only for a non-obvious external
constraint (a platform quirk, a protocol rule) and should point at the document that covers
it. There are currently zero `//` comments in the source.

Each page in `docs/` states which Claude Code version its claims were verified against.
Update that line when you re-verify one.

## Test rules

CI runs macOS and Linux against Node 22 and 24, and `node --test` runs files in parallel, so
anything environment- or timing-dependent is a coin toss. Each rule below was learned from a
failure in this repository:

- **No fixed sleeps before asserting.** Poll, or wait on a real signal — the integration
  tests wait for the SSE backlog to arrive before appending to the log.
- **Every wait needs a deadline.** A promise awaited without one does not fail when the event
  is missed; it hangs, and the suite stalls with no indication of which test is stuck.
- **One temporary directory per test.** Several filesystem watchers on one path coalesce on
  macOS and appends go unreported.
- **Never bind a fixed port.** The integration test asks for an ephemeral one and reads back
  what the server printed. An orphan from an interrupted run does not fail a fixed-port
  test — it _serves_ it.
- **Never assume anything about the environment.** A test that used pid 2 as "a free pid"
  passed on macOS and failed on Linux, where pid 2 is `kthreadd`. Derive the fact instead.

## Reference

`docs/versions.md` (version floors, platform matrix, socket paths, auth-line rules),
`architecture.md`, `compatibility.md` (documented vs internal sources and the degradation
policy), `hook-payload.md` (the captured payload), `log-format.md`, `phase-2-sending.md` (the
captured wire protocol), `design.md`. `CONTRIBUTING.md` repeats the rules above for humans.
