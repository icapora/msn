# The homage

_An affectionate tribute to MSN Messenger. No Microsoft branding, artwork or trademarks are
used._

## What is being echoed

The visual language is the **later** MSN era — Windows Live Messenger, roughly 2009 to 2011:
rounded corners, glossy gradients with a top highlight, soft shadows, pill-shaped buttons
and a blue palette that runs from near-white to a deep navy. Tahoma at 11px is the one
detail carried over from the earlier releases, because nothing else reads quite like it.

The wordmark reproduces the old lockup's _relationship_, not its content: a large
`MSN` with `My Sessions Network` set small, tracked and uppercase beneath it — the way
"Windows Live" sat above "Messenger". The backronym is the joke, so it stays visible.

## The mark

Two chevrons, amber and teal. The original was two green figures; this is deliberately
neither green nor a redraw of them. A chevron is the shape a terminal prompt makes, and two
of them side by side say what the app is about — two sessions talking — without borrowing
anything.

## What each cue maps to

| MSN cue                        | What it means here                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| Screen name                    | The session name, the address cross-session messaging actually uses                |
| Personal message               | The session's working directory, in grey italics                                   |
| Online / Busy / Away / Offline | Interactive idle / interactive busy / background / seen in the log but not running |
| "X está escribiendo…"          | X's session is **busy**. Real typing is not observable — see below                 |
| Nudge                          | Zumbido: shakes the window, plays a tone, sends nothing                            |
| Display picture                | Generated from a hash of the screen name                                           |
| Message sound                  | Two rising notes from a WebAudio oscillator                                        |

## Standing inside a session

The first version of the conversation window listed every message as `A → B`. That is a
surveillance view: correct, and nothing like a chat.

A window now stands _inside_ the session you picked. Its own messages sit on the right in
amber; everything said to it sits on the left in blue, under the speaker's avatar and name.
Consecutive messages from one speaker share a single header. Reading a line never requires
parsing a label, because the side already says who spoke.

When a session has talked to several peers, a chip row filters to one of them. This is the
one place the interface admits that a session's history is not a single thread.

## Spanish is the original, not a translation

The interface follows the system language, with English and Spanish available. The two are
not peers in the way a translated app's languages usually are: the Spanish strings came
first and are quotations. _En línea_, _Ocupado_, _No disponible_, _Sin conexión_ and
_Zumbido_ are what the Spanish MSN Messenger client said, and reproducing them exactly is
the homage. The English catalogue is the accommodation, and _Nudge_ is the corresponding
quotation there.

That is worth knowing before editing them. A translator smoothing _No disponible_ into a
more literal rendering of "Away" would be correcting the joke out of the product.

## The honest bits

Two cues would be lies if left unexplained, so both are documented in the README and in the
interface itself:

**"X está escribiendo…"** — Claude Code exposes no typing signal, and inventing one would
make the prettiest part of the homage the least trustworthy. What it reports is that the
peer's session is busy: it is _doing something_, which is the nearest true statement. The
wording is MSN's; the meaning is stated plainly.

**Messages you send** are marked _desde MSN Web_. They never pass through the capture hook,
which only observes the `SendMessage` tool, so they are local echoes rather than recorded
history. Presenting them identically to captured messages would misrepresent what the log
contains.

## Sounds and images ship as code

Avatars are SVG built from a hash; tones are oscillators. Nothing binary is in the
repository, which keeps it small, keeps every asset inspectable in review, and means no
sound or image was taken from anywhere.

## Accessibility

Contrast is checked against the pale blue panels, groups and tabs are real buttons with
`aria-pressed` and `aria-selected`, and `prefers-reduced-motion` shortens the splash and
disables the Zumbido shake.
