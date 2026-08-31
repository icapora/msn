# Contributing

## Getting set up

```bash
npm install
npm test
npm run doctor    # confirms Claude Code, the hook, the log and the sockets
```

You do not need the hook installed to run the tests. Every test that touches the filesystem
works in a temporary directory, and none of them read your real settings file.

## Before opening a pull request

```bash
npm run lint && npm run format:check && npm test
```

CI runs these on macOS and Linux against Node 22 and 24.

## How this codebase is documented

**The "why" lives in `docs/`, not in comment blocks.** A file with a comment on every second
line is harder to maintain than one with none: the comments drift, and the reader stops
trusting them.

- Exported functions get a JSDoc block: parameters, return, and the contract.
- An inline comment is warranted only for a non-obvious _external_ constraint — a platform
  quirk, a protocol rule, a bug in something we do not control — and it should say which
  document covers the topic.
- Anything explaining a design decision belongs in a `docs/*.md` page.

Each page in `docs/` states which Claude Code version its claims were verified against.
If you verify something against a newer one, update that line.

## Things worth knowing before you change them

**`hooks/msn-hook.mjs` imports nothing.** Not even from `src/`. It runs inside every one of
the user's Claude Code sessions, so it must not be breakable by a refactor elsewhere and
must not pay module-resolution cost on every message. `src/log/record.mjs` validates what it
writes and a test asserts the two agree. Keep it standalone.

**The hook must never fail loudly.** It exits 0 on every path and writes nothing to stderr.
A capture tool that interrupts the user's work is worse than one that misses a message.

**No runtime dependencies, and it is worth keeping that way.** The tailer polls the log's
size rather than pulling in a filesystem watcher; `docs/architecture.md` explains why that
is the better design here, not just the lighter one. Dev tooling is a different question —
a linter and formatter earn their place in a public repo.

**Two roster sources, on purpose.** `claude agents --json` is documented and authoritative
but costs about 1.2 seconds; `~/.claude/sessions/*.json` is instant but is an internal
format. Read [docs/compatibility.md](docs/compatibility.md) before making the app depend on
the fast one. The rule: it must stay fully functional on documented sources alone.

**Never parse the transcripts** under `~/.claude/projects/`. Their format is internal and
changes between versions. The hook payload is the supported way to observe a message.

**Changing the log record?** Bump `v`, update [docs/log-format.md](docs/log-format.md), and
keep the reader able to pass an unknown version through untouched. Someone's history should
survive your upgrade.

**No `innerHTML`.** Message text comes from other sessions and is untrusted. Build DOM nodes
and assign through `textContent`. See [SECURITY.md](SECURITY.md).

## Tests must be deterministic

`node --test` runs test files in parallel, so anything timing-dependent is a coin toss under
load. A flaky test in a public repository is worse than a missing one: it teaches everyone
to ignore a red build. Four rules, each of which this suite learned the hard way:

**Never sleep a fixed amount and then assert.** Poll for the condition, or wait on a real
signal. The integration tests wait for the SSE backlog to arrive before appending to the
log, because that proves the connection is live; a 250 ms sleep only guessed that it was.

**Every wait needs a deadline.** A promise awaited without a timeout does not fail when the
event is missed — it hangs, and the whole suite stalls with no indication of which test is
stuck. Reject on a deadline so a miss is a red test.

**Give each test its own directory.** These tests used to share one temporary directory,
which put several filesystem watchers on the same path in turn. macOS coalesces events
across them and appends silently went unreported.

**Never bind a fixed port.** The integration test asks for an ephemeral port and reads back
the one the server printed. With a fixed port, an orphan left by an interrupted run does not
fail the tests — it _serves_ them, which is far worse than a red build.

**Never assume anything about the environment.** A test that used pid 2 as "a pid that is
free" passed on macOS and failed on Linux, where pid 2 is `kthreadd` and always running.
Derive the fact instead: run a process to completion and take its pid. CI runs macOS and
Linux for exactly this reason.

If you find a flaky test, fix the timing assumption. Do not raise a bound and move on.

## Reporting a bug

Include the output of `npm run doctor` and your `claude --version`. If it involves a
specific message, a redacted line from `~/.claude/msn-log.jsonl` is worth more than a
description — but read it first: the log contains full message text.
