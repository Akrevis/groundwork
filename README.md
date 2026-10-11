[中文](README.zh-CN.md)

# groundwork

A human–AI collaboration discipline pack for coding agents. Treats hallucination in large projects — **inventing APIs and files that don't exist, breaking code it never fully read, losing track of where the project actually stands**.

The discipline runs both ways: the AI verifies before it asserts and stays inside the boundary of what was asked, while you hand it the facts it cannot derive on its own. This pack turns both halves into mechanisms rather than good intentions.

Once installed, the first thing an AI sees in every session is the real state of your project:

```
<groundwork-context>
# my-project · context

## What this is
Shift scheduling for small teams.

## Structural gotchas
- Everything is stored in UTC and converted at the presentation layer. Historical rows
  contain local timestamps — do not trust the timezone on created_at.

## Auto-collected (groundwork · 2026-10-11 14:02)
branch: feat/shift-swap
uncommitted: 14 files — src/schedule/(9) src/api/(3) tests/(2)
active tasks (docs/tasks/):
  2026-10-09-shift-swap
  2026-10-10-holiday-rules
stack: Node.js >=20 · pnpm@9
recent commits:
  a3f9c21 fix cross-month boundary in shift calculation
  ...

## Where the docs are
design → docs/design.md | rationale → docs/devlog.md | under discussion → docs/plans (2)

## Standing constraint
Every branch, every check, every rule must name a concrete situation that will really
happen. Say the triggering situation out loud before writing an `if` — if you cannot,
that branch is fiction.
</groundwork-context>
```

**Projects without a `docs/context.md` get no injection at all** — no prompts, no nagging. The two auto-triggering skills carry no such condition: they are plain discipline and hold in any repo, onboarded or not.

## Three layers

| Layer | Mechanism | Governs | Frequency |
|---|---|---|---|
| **1** | SessionStart hook | Project identity, module responsibilities, active tasks, git state — present from the first token | every session, forced |
| **2** | `/groundwork:docs` | Setup, turning a decision into a task, session wrap-up, consistency audit | you invoke it |
| **3** | Two skills + one command | Verification discipline, change boundaries, module boundary tests | per situation |

Putting a rule in the wrong layer either kills it or turns it into overhead: "check the current state of the project first" is useless in layer 3 (the AI won't think to check at the moment it should), and "eight module boundary rules" would be a disaster in layer 1 (fixing a typo would drag the whole architecture checklist through the context).

**Layers 1 and 2 depend on nothing but git and markdown** — `groundwork` itself is a docs-heavy project and runs on them. Layer 3 is code-specific.

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

It asks four things — what this project is, what it doesn't do, what each directory is responsible for, and any known gotchas — then writes `docs/context.md` and commits it. If the project already has design notes or a decision log, it asks where each one belongs before touching anything. The next session opens with `<groundwork-context>` in place.

After that:

| Command | When |
|---|---|
| `/groundwork:docs task` | A piece of work is decided, before touching anything. It writes a task contract under `docs/tasks/` that another session can pick up and execute |
| `/groundwork:docs wrap` | End of session — sync what changed back into the docs |
| `/groundwork:docs audit` | Periodic check for drift between docs and code |
| `/groundwork:module-boundaries` | Designing a new module or defining cross-module calls |

`audit` comes in two halves. The mechanical checks ship as **`groundwork-audit`**, a script the plugin puts on your PATH — run it directly in any project to catch dead links, documents git ignores or never committed, archived tasks the roadmap never heard of, translations that have drifted from their source, commits a document cites that no longer exist. Every check reports clean, findings, or **skipped with a reason**, and the report ends with what it could not reach. The half that needs judgement — whether the documentation still describes what the code actually does — is what the command walks you through.

The other two skills (`verify-first`, `change-scope`) trigger on their own; you don't invoke them.

## How work moves through docs/

```
docs/
├── context.md    injected every session
├── design.md     core zone (intent, rarely changes) + phase zone (current architecture)
├── roadmap.md    how the project got here — pointers only
├── devlog.md     decisions: the options, the choice, the cost
├── backlog.md    friction with groundwork itself, met while using it here
├── plans/        topics under discussion
├── tasks/        decided work, one contract per task
└── archive/      finished tasks
```

Only `context.md` is created up front. Everything else appears the first time something real goes into it — an empty template is noise, and an empty directory never reaches anyone else's clone.

A topic starts in `plans/` and stays there while it's being discussed. `task` turns a settled one into a contract in `tasks/`: the goal, the boundary, the premises, a definition of done you can verify, and a handoff — what it depends on, which files it will change, the core content of any file it shares with another task, and when the executing session has to come back and ask. Once it's merged, `wrap` archives it and registers it in the roadmap. The hook reads `docs/tasks/` itself, so a task is visible to every session from the moment it exists.

**Parallel work.** When tasks run side by side, each gets its own worktree. A session executing a task writes code and its own task file, nothing else; shared documents are written only by `/groundwork:docs`, only in the main worktree, after the merge. The documents never conflict, and code is the only thing left to merge.

**Commits.** The docs commands commit what they write — staged by path, never `git add -A`, never pushed, and never a file that already had changes of yours in flight.

## Why forced injection instead of a skill

Skill triggering is probabilistic: it matches on a description, the model decides for itself whether to load it, and nothing tells you when it didn't fire.

Hallucination isn't "a condition was met at some moment." It's a **persistent absence of information**. And more importantly: **at the moment a hallucination happens, the AI doesn't know it's hallucinating — that is the definition of hallucination.**

Expecting a skill to fire at the moment the AI is about to invent something means pointing a probabilistic mechanism at a problem the model cannot perceive in itself. So the first layer can only be a hook.

## Why the injected content has to stay small

Not to save tokens. Three reasons, none of which depend on window size:

1. **Attention dilution** — recall drops measurably for material in the middle of a long context. Inject 500 lines and the 5 that matter get buried
2. **Maintenance cost** — the bigger a file gets, the less anyone maintains it, and the less it's maintained the staler it gets
3. **A stale injection is worse than none** — the AI works confidently off wrong information and never questions it, because it arrived force-injected and therefore looks authoritative

So every entry in `docs/context.md` has to pass three tests: **git can't derive it**, **the AI doesn't know it's missing it**, and **it holds for anyone who clones the repo**. Tech stack, branch, uncommitted changes, recent commits and active tasks are all collected by the hook — never hand-written. There is no line limit; the three tests are what keep the file small.

## What it doesn't do

The line it draws: **it governs the discipline on both sides — what the AI puts out, and what you feed it — and stays out of your own head.**

- Doesn't address **whether you understand the code the AI wrote** — that needs you talking the code back to someone, not a rule that takes effect on install
- Doesn't handle **cross-project personal memory** — this pack is project-scoped only
- Doesn't provide **tooling** (document conversion, skill management, and so on)
- Doesn't depend on **any other plugin**
- **Doesn't evaluate code quality** — anything evaluative is a command you invoke, never an auto-triggering skill

## License

MIT
