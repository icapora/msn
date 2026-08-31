---
name: Claude Code compatibility
about: A newer Claude Code changed something this project reads
labels: compatibility
---

## What changed

Which of these stopped matching what `docs/compatibility.md` describes?

- [ ] The `SendMessage` hook payload
- [ ] `claude agents --json`
- [ ] `~/.claude/sessions/*.json` (internal — degradation is expected, silence is not)
- [ ] The inbox socket protocol
- [ ] Something else

## Versions

- Working Claude Code version:
- Broken Claude Code version:

## Evidence

Raw output, ideally captured with the hook's `MSN_RAW_DUMP` for a payload change.
