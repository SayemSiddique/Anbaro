# Session handoffs

The Anbaro production launch runs as a sequence of **numbered sessions**, each a
**fresh Claude Code session** with a small, deliberately scoped context. The plan
that defines them is [`../PRODUCTION_LAUNCH_PLAN.md`](../PRODUCTION_LAUNCH_PLAN.md).

This directory holds one handoff file per completed session:

```
session-01-handoff.md   ← written at the end of Session 1, feeds Session 2
session-02-handoff.md   ← written at the end of Session 2, feeds Session 3
...
```

## The convention

Every session **ends** by writing `session-<NN>-handoff.md` here. That file is
the prompt Sam pastes into the next fresh session. It exists so the next session
starts with exactly what it needs and nothing more — no re-scanning the codebase.

A handoff follows the template at the bottom of the launch plan and states:

- **This is Session `<NN+1>`: `<title>`** and the 2–5 files that session may read.
- **State from last session:** what got done, what is live/verified (URLs, envs,
  passing tests), what was deferred.
- **Secrets provisioned and where they live** — names only, never values.
- **The goal + acceptance test** for the next session, quoted from the plan.
- **Rules:** don't read the whole codebase; stay in scope; don't commit or push
  unless Sam explicitly says so; end by writing the next handoff.

## Ground rules these handoffs assume

- **Read only what the handoff lists.** The architecture is captured in the docs;
  re-deriving it from source burns tokens for no gain.
- **The agent never runs `git commit` or `git push`.** It stages (`git add`) the
  files it changed and writes the commit message as text. Sam commits and pushes.
- **Secrets never appear in these files** — only variable names and the dashboard
  they belong in.
