# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Capture of every `SendMessage` call through a user-level `PostToolUse` hook.
- Node server that tails the capture log and streams it to the browser over SSE.
- Buddy list built from `claude agents --json` and the on-disk session registry, with
  automatic degradation to the documented CLI source alone.
- Conversation windows that stand inside a session: its own messages on the right, its
  peers' on the left, with a per-peer filter.
- Markdown rendering for message bodies, built as DOM nodes rather than markup.
- Delivery into a live session's inbox socket, with local echo in the window.
- Deterministic avatars, synthesised sounds, Zumbido, date separators and splash screen.
- `install`, `uninstall` and `doctor` scripts. The doctor reports the platform and probes
  every socket directory Claude Code may have used.
- `docs/versions.md`: version floors per platform, the support matrix, socket paths, the
  auth-line rules and the boundaries sessions cannot cross.
- An inbox socket, so peers can reply to messages sent from the browser. Verified by probe
  before being built: the documented reply-target safety check accepts a plain socket owned
  by an ordinary process.
- Bounded in-memory history with backward paging over `GET /api/history?before=<ts>`, and
  capture-log rotation. Messages average several kilobytes, so an unbounded history was
  both a memory leak and a slow first paint.
- `GET /api/meta` for counters without opening an event stream.
- Full-text search across resident messages, matching body and participants.
- Interface language follows the system, with English and Spanish catalogues and a
  `?lang=` override that is remembered. Catalogue parity is enforced by tests.
- End-to-end integration tests covering static serving, path traversal, SSE delivery, socket
  ingest, history bounds, deduplication and the send API.

[Unreleased]: https://github.com/icapora/msn/commits/main
