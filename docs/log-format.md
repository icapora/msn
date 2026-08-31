# The capture log

_Verified against Claude Code 2.1.251._

`~/.claude/msn-log.jsonl` is append-only, one JSON object per line, written by
`hooks/msn-hook.mjs` and read by `src/log/record.mjs`.

## A record

```jsonc
{
  "v": 1,
  "ts": 1788184282070,
  "from": {
    "sessionId": "11111111-2222-3333-4444-555555555555",
    "cwd": "/path/to/msn",
    "pid": 4245,
  },
  "to": "session-b",
  "text": "…",
  "summary": "discovery probe",
  "notifyWhenIdle": false,
  "structured": null,
  "truncated": false,
  "msgId": "99999999-8888-7777-6666-555555555555",
  "delivered": true,
  "toolUseId": "toolu_01EXAMPLEEXAMPLEEXAMPLE",
  "permissionMode": "auto",
  "durationMs": 172,
  "response": { "success": true, "msg_id": "…", "message": "…", "display": "…" },
  "extra": {},
}
```

| Field        |                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------- |
| `v`          | Record version. See the versioning rule below                                                 |
| `ts`         | Capture time in epoch milliseconds. The payload has no timestamp                              |
| `from.pid`   | Parsed from `CLAUDE_CODE_MESSAGING_SOCKET`'s basename — a documented variable                 |
| `to`         | Either a session name or a `uds:` reply address. See [hook-payload.md](hook-payload.md)       |
| `text`       | Body, truncated to 8 KB                                                                       |
| `structured` | `type` of a legacy protocol message, else `null`. Such a body is JSON-stringified into `text` |
| `truncated`  | Whether `text` was cut                                                                        |
| `delivered`  | `tool_response.success` if boolean, else `null` — never `false` by default                    |
| `response`   | The raw `tool_response`, kept whole so no unknown field is lost                               |
| `extra`      | Every `tool_input` key the hook did not recognise                                             |

## Three rules

**Nothing is dropped silently.** Unrecognised `tool_input` keys go to `extra` and the whole
`tool_response` is preserved. When a future Claude Code adds a field, it is already in your
history by the time anyone decides to display it. This was not hypothetical: three
undocumented keys turned up in the very first captured payload.

**An unknown `v` is passed through, not discarded.** A newer hook must never make an older
reader lose history. `parseLine` requires only that a record be an object with a numeric
`ts`; everything else is carried along.

**`delivered` is tri-state.** `true`, `false`, or `null` for "the response shape was not
recognised". A missing field must never be reported to the reader as a failed send.

## Why 8 KB

A cross-session message can reach about a million characters. `appendFileSync` on an
`O_APPEND` file is atomic only up to a limit, and several sessions write to this file at
once, so a megabyte-long line risks interleaving with another session's. Truncating at 8 KB
keeps every write comfortably atomic; `truncated: true` tells the UI to say so.

## Concurrency

Every session appends to the same file with no lock. Correctness relies on `O_APPEND` plus
the size cap above. The reader tolerates a partial trailing line and re-reads from zero if
the file ever shrinks, so a rotation or truncation loses nothing but does not crash.
