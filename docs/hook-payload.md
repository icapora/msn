# The `SendMessage` hook payload

_Verified against Claude Code 2.1.251 by capturing a real send._

This page records what a `PostToolUse` hook actually receives when Claude calls
`SendMessage`. It was **captured, not inferred**: the hook was installed with
`MSN_RAW_DUMP` set, a real message was sent between two sessions, and the file below is
that dump with only the identifiers shortened.

## The payload

```json
{
  "session_id": "11111111-2222-3333-4444-555555555555",
  "transcript_path": "~/.claude/projects/<project>/11111111-….jsonl",
  "cwd": "/path/to/msn",
  "prompt_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  "permission_mode": "auto",
  "effort": { "level": "high" },
  "hook_event_name": "PostToolUse",
  "tool_name": "SendMessage",
  "tool_input": {
    "to": "session-b",
    "summary": "discovery probe",
    "message": "MSN discovery probe alpha",
    "type": "message",
    "recipient": "session-b",
    "content": "MSN discovery probe alpha"
  },
  "tool_response": {
    "success": true,
    "message": "“discovery probe” → session-b (another Claude session on this machine)",
    "display": "“discovery probe” → sent to session-b — another Claude session on this machine",
    "msg_id": "99999999-8888-7777-6666-555555555555"
  },
  "tool_use_id": "toolu_01EXAMPLEEXAMPLEEXAMPLE",
  "duration_ms": 172
}
```

## What each part gives us

| Need              | Field                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------ |
| Sender identity   | `session_id` and `cwd`. **The sender's name is not in the payload**                        |
| Sender process    | Not in the payload. Derived from `CLAUDE_CODE_MESSAGING_SOCKET`, whose basename is the pid |
| Recipient         | `tool_input.to`                                                                            |
| Body              | `tool_input.message`                                                                       |
| Timestamp         | **Not in the payload.** The hook stamps `Date.now()`                                       |
| Delivered?        | `tool_response.success`                                                                    |
| Stable message id | `tool_response.msg_id`                                                                     |

## Three things that were not in the documented schema

The `SendMessage` tool schema declares `to`, `message`, `summary` and `notify_when_idle`.
The payload carries three more:

```json
{ "type": "message", "recipient": "…", "content": "…" }
```

`recipient` and `content` duplicate `to` and `message`; `type` names the envelope kind.
They are treated as known aliases so they do not clutter `extra`, but their presence is why
the hook keeps unrecognised keys instead of using an allowlist — see
[log-format.md](log-format.md).

`duration_ms` is also absent from the hooks reference. It is recorded as `durationMs`.

## `to` has two forms

This is the finding that matters most, and it is only visible in real traffic:

```
pid 4242  ->  session-b                      a session name
pid 4243  ->  uds:/tmp/cc-socks/4242.sock      a reply address
```

When Claude **starts** a conversation it addresses the peer by name. When it **replies**, it
copies the `from=` attribute of the incoming message, which is a `uds:` socket path. Roughly
half of all real traffic uses the second form.

An implementation that assumes `to` is always a name loses every reply — half of every
conversation. `src/log/record.mjs` parses both, and identity is keyed on **pid**, the only
value present in both forms.

## Reproducing this

```bash
npm run install:hook -- --apply --dump /tmp/sendmessage-dump.json
# send a message between two sessions, then
cat /tmp/sendmessage-dump.json
npm run install:hook -- --apply   # removes the dump flag
```
