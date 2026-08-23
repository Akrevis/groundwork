[中文](README.zh-CN.md)

# groundwork

An AI development discipline pack for coding agents. Treats hallucination in large codebases — **inventing APIs and files that don't exist, breaking code it never fully read, losing track of where the project actually stands**.

Once installed, the first thing an AI sees in every session is the real state of your project:

```
<groundwork-context>
# my-project · context

## What this is
Shift scheduling for small teams.

## Structural gotchas
- Everything is stored in UTC and converted at the presentation layer. Historical rows
  contain local timestamps — do not trust the timezone on created_at.

## Auto-collected (groundwork · 2026-08-23 14:02)
branch: feat/shift-swap
uncommitted: 14 files — src/schedule/(9) src/api/(3) tests/(2)
stack: Node.js >=20 · pnpm@9
recent commits:
  a3f9c21 fix cross-month boundary in shift calculation
  ...

## Where the docs are
architecture → docs/design.md | rationale → docs/devlog.md

## Standing constraint
Every branch, every check, every rule must name a concrete situation that will really
happen. Say the triggering situation out loud before writing an `if` — if you cannot,
that branch is fiction.
</groundwork-context>
```

**Projects without a `docs/context.md` get complete silence** — no prompts, no nagging.

## Why forced injection instead of a skill

Skill triggering is probabilistic: it matches on a description, the model decides for itself whether to load it, and nothing tells you when it didn't fire.

Hallucination isn't "a condition was met at some moment." It's a **persistent absence of information**. And more importantly: **at the moment a hallucination happens, the AI doesn't know it's hallucinating — that is the definition of hallucination.**

Expecting a skill to fire at the moment the AI is about to invent something means pointing a probabilistic mechanism at a problem the model cannot perceive in itself. So the first layer can only be a hook.

## Three layers

| Layer | Mechanism | Governs | Frequency |
|---|---|---|---|
| **1** | SessionStart hook | Project identity, module responsibilities, git state — present from the first token | every session, forced |
| **2** | `/groundwork:docs` | Setup, opening a task, session wrap-up, consistency audit | you invoke it |
| **3** | Two skills + one command | Verification discipline, change boundaries, module boundary tests | per situation |

Putting a rule in the wrong layer either kills it or turns it into overhead: "check the current state of the project first" is useless in layer 3 (the AI won't think to check at the moment it should), and "eight module boundary rules" would be a disaster in layer 1 (fixing a typo would drag the whole architecture checklist through the context).

## Install

```bash
claude plugin marketplace add Akrevis/groundwork
claude plugin install groundwork@groundwork
```

No changes to `CLAUDE.md`, none to `settings.json`. Uninstalling leaves nothing behind.

## Getting started

In your project:

```
/groundwork:docs init
```

It asks four things — what this project is, what it doesn't do, what each directory is responsible for, and any known gotchas — and writes `docs/context.md`. The next session opens with `<groundwork-context>` in place.

After that:

| Command | When |
|---|---|
| `/groundwork:docs task` | A new task has landed, before touching anything |
| `/groundwork:docs wrap` | End of session, sync what changed back into the docs |
| `/groundwork:docs audit` | Periodic check for drift between docs and code |
| `/groundwork:module-boundaries` | Designing a new module or defining cross-module calls |

The other two skills (`verify-first`, `change-scope`) trigger on their own; you don't invoke them.

## What it doesn't do

- Doesn't address **whether you understand the code the AI wrote** — that's a debugging-blackbox problem and needs a human in the loop
- Doesn't handle **cross-project personal memory** — this pack is project-scoped only
- Doesn't provide **tooling** (document conversion, skill management, and so on)
- Doesn't depend on **any other plugin**
- **Doesn't evaluate code quality** — anything evaluative is a command you invoke, never an auto-triggering skill

## Why the injected content has to stay small

Not to save tokens. Three reasons, none of which depend on window size:

1. **Attention dilution** — recall drops measurably for material in the middle of a long context. Inject 500 lines and the 5 that matter get buried
2. **Maintenance cost** — the bigger a file gets, the less anyone maintains it, and the less it's maintained the staler it gets
3. **A stale injection is worse than none** — the AI works confidently off wrong information and never questions it, because it arrived force-injected and therefore looks authoritative

So `docs/context.md` holds exactly two kinds of thing: **what git can't derive**, and **what the AI doesn't know it's missing**. Tech stack, branch, uncommitted changes and recent commits are all collected by the hook — never hand-written.

## License

MIT
