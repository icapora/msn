# Sending into a live session

_Verified against Claude Code 2.1.251._

## The wire format

The documentation specifies the **auth** line a script sends to a session's inbox socket:

```json
{ "type": "auth", "token": "<CLAUDE_CODE_MESSAGING_TOKEN>" }
```

It does not specify the **message** line. Three guessed envelopes were written to a live
socket and all three were accepted and silently discarded, which is the worst kind of
failure to debug. So the real format was captured instead.

### How it was captured

A listening Unix socket was registered as if it were a session — a file in
`~/.claude/sessions/<pid>.json` with `messagingSocketPath` pointing at the listener and the
listener's own pid, so the liveness check passed. A real session was then asked to message
that name, and the bytes it wrote were recorded. The scaffolding was removed afterwards.

### What arrives

```json
{
  "msgV": 1,
  "msg_id": "99999999-8888-7777-6666-555555555555",
  "type": "user",
  "message": {
    "role": "user",
    "content": "<cross-session-message from=\"uds:/tmp/cc-socks/4246.sock\" from-name=\"session-a\" from-mode=\"prompting\">\nWIRE FORMAT CAPTURE 42\n</cross-session-message>"
  },
  "priority": "next",
  "from": "uds:/tmp/cc-socks/4246.sock"
}
```

One line, newline-terminated. Two empty connections precede it — the sender checking
reachability before committing to the payload.

The envelope is worth reading closely: a cross-session message is delivered as a **user
turn**. `type` is `user`, `role` is `user`, and the text is wrapped in a
`<cross-session-message>` tag whose attributes tell the receiver who it is from and what
permission class the sender claims. That is exactly why the docs are so firm that such a
message cannot approve a permission prompt: it arrives through the same channel you type
into, and the `from-mode` attribute is what keeps the receiver from mistaking it for you.

## What this project sends

`src/messaging/socket-client.mjs` builds the same envelope, with `from-name` set to
`MSN Web` and `from-mode` set to `prompting`.

`prompting` is the honest value: this server is not a session and bypasses nothing. Since it
is not a child process of the target, Claude Code cannot verify it as an own-child message,
so the message asserts no permission class — delivered normally to a session that prompts
for permissions, held for approval by one running in `bypassPermissions`.

## The reply address, and why the server binds a socket

`from` is what the receiving Claude copies into its own `to` when it answers. An early
version sent the bare label `msn-web`, which resolves to no session at all: peers reported
the sender unreachable, or routed the reply to whichever session they judged closest. Half
of every conversation was lost.

The fix follows from the capture above. A reply is addressed to a **socket path**, not a
name — so a client that binds a socket of its own and advertises it as `from` can be
answered like any session. `src/messaging/inbox.mjs` binds `/tmp/cc-socks-msn/<pid>.sock`
and the outgoing envelope advertises it.

This was verified before it was built. The documentation warns that Claude Code refuses a
reply target that "fails a safety check, such as a symlinked target or an endpoint that
isn't the expected process", and it was not obvious that a plain socket owned by an ordinary
process would pass. A ten-minute probe — bind a socket, send a message advertising it, reply
to it from a real session — showed that it does. If it had not, the limitation would have
been documented instead of worked around.

### The capture path did not change

Measuring also removed work rather than adding it. The obvious design is for the inbox to
parse arriving bytes and inject them into the stream, but every inbound message is some
session's `SendMessage`, which that session's own hook already logged. The socket only has
to **exist** so the reply is deliverable.

The inbox still parses what arrives, for one case: a session started before the hook was
installed logs nothing, and its replies can be observed nowhere else. The server keys
messages by `msg_id`, so a delivery seen through both paths is stored once.

## Turning it off

`MSN_DISABLE_SEND=1` makes `POST /api/send` return 403 and the composer render disabled.
