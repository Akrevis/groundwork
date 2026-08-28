---
name: docs
description: "groundwork documentation workflow — init (create context.md and plans/), task (open a task: surface assumptions, define done), wrap (sync at session end), audit (consistency check). Manual invocation only; the model will not trigger this on its own."
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git rev-parse:*), Bash(git log:*), Bash(git status:*), Bash(git mv:*), Bash(mkdir:*), Bash(groundwork-audit:*), Bash(node bin/groundwork-audit:*)
---

# /groundwork:docs — documentation workflow

Route on the first word of `$ARGUMENTS`. **Missing, or not one of `init` / `task` / `wrap` / `audit` → stop and ask which one, don't guess.**

`docs/` is project state shared by the human and the AI, tracked in git. **Only `context.md` is force-injected into every session**; the rest is read on demand.

## What each file holds (shared by all four modes, single source of truth)

| File | Holds | Read by |
|---|---|---|
| `docs/context.md` | Facts git can't derive, that the AI doesn't know it's missing | **auto-injected every session** |
| `docs/plans/<date>-<task>.md` | One task's goal, definition of done, progress | when relevant to the task |
| `docs/plans/archive/` | Plan documents for finished tasks | rarely |
| `docs/roadmap.md` | How the project got here: phases, and for each one the ADRs, landing commits and plan documents. **Pointers only, never status** | when the AI needs the shape of the whole history |
| `docs/design.md` | Architecture snapshot (layout, data flow, known risks) | when the AI is about to change a module |
| `docs/devlog.md` | ADRs: context / options / decision / rationale / cost / landing commit | when the AI is about to change architecture |

**`design.md` and `devlog.md` are not created up front** — wait until there is real architecture to snapshot and real decisions to record. Empty templates are noise: an AI reading an empty file doesn't know whether it's supposed to fill it in.

## Hard constraints on `context.md` (all four modes enforce these)

1. **Only what git can't derive.** Tech stack, module locations, branch, uncommitted changes, recent commits are collected automatically by the hook — **never hand-write them here**.
2. **Only what the AI doesn't know it's missing.** Anything it would think to look up when needed (architecture detail, full ADR text) gets a pointer, not the content.
3. **It must stay small.** Not to save tokens — because recall drops for material in the middle of a long context. Injecting 500 lines drowns the 5 that matter.
4. **Structural gotchas only if they're permanent and recurring.** Anything fixable gets fixed instead of occupying the always-on budget.

---

## wrap — sync at session end (scope: this session)

### 1. Preflight

`docs/context.md` missing → stop and tell the user to run `/groundwork:docs init` first. Don't generate around the scaffolding.

### 2. Distill this session

Read back through the session and determine:

- Did any active task change state? Any new tasks? Any finished?
- Were top-level modules added or removed?
- Did you hit a **structural gotcha** (permanent, will recur every time)?
- Were any non-obvious technical decisions made (the options-plus-rationale kind)?

Anything after the mode word in `$ARGUMENTS` is a hint about what mattered, but reading the session still governs.

### 3. Update `context.md` directly (no need to confirm item by item)

- **Active task table**: update states, append new tasks. Leave finished ones in place until step 4 confirms archiving. **A new `plans/` document must be registered here at the same time** — creating and registering are two separate actions, and skipping the second makes that task invisible in the injection
- **Top-level module table**: only touch it if modules were actually added or removed. **Responsibilities only, never locations** (the hook reads locations itself)
- **Structural gotchas**: filter through hard constraint 4 above. Fixable ones don't belong here

### 4. Archive finished tasks (confirm first)

For each task judged finished, **ask the user, then** run:

```bash
mkdir -p docs/plans/archive
git mv docs/plans/<file>.md docs/plans/archive/
```

Then two more edits, both mandatory:

- Remove that row from the active task table in `context.md`
- **Append the task to the current phase in `docs/roadmap.md`** — what it settled, its ADR if it has one, its landing commit, and a pointer to the archived plan document. **No roadmap yet → ask whether to start one**; like `design.md` and `devlog.md` it is never pre-created, because a project with one archived task has no history worth mapping

**Archiving and registering are two separate actions, and the second is the one that gets dropped.** A plan archived but never added to the roadmap leaves a hole nothing will ever surface: the file is gone from `plans/`, the active task table no longer lists it, and no other check goes looking.

**Opening a new phase is a judgement call — ask the user.** A phase is not a time span, it is "this batch of work solves one problem". wrap appends to the current phase; it never opens one by itself.

**Why confirm the archiving**: moving files has side effects, and "is this task actually done" is a judgement call — getting it wrong means a manual rollback.

### 5. Update the header commit hash (never skip)

```bash
git rev-parse --short HEAD
```

Write it into the `> Last updated: YYYY-MM-DD · commit <hash>` line at the top of `context.md`, along with the date.

**What skipping this costs**: the hash is the baseline for drift detection. Content updated but hash stale means every subsequent session carries a "context.md may be out of date" warning; after a few rounds the AI learns to ignore it, and **the entire staleness guard stops working**.

### 6. ADR confirmation (never write one directly)

When step 2 surfaces a non-obvious decision, **stop and ask**: "Record an ADR for this? <candidate title + one-line context>"

- User says yes → append to `docs/devlog.md` in the standard format (create the file if absent), including the **landing commit hash**, so decision → implementation stays traceable
- User says no, or it's a small decision → don't write it

**The bar for an ADR is higher than for other files.** Don't let step 3's direct-write behavior spill over into devlog. `git log` records what changed; an ADR records "considered A/B/C, chose B because X, at cost Y" — git can't replace that, but writing too many of them drowns the signal.

### 7. Report

- Which sections of `context.md` changed
- Which tasks were archived
- Whether the ADR question was asked, and the answer
- **Remind the user to commit**: list the changed files, **don't commit automatically** — committing at session end mixes documentation changes into whatever the user has in flight

---

## init — set up the documentation skeleton (once per project)

### 1. Preflight

`docs/context.md` **already exists** → stop, tell the user the project is already set up, and ask whether they want `wrap` to update it or genuinely intend to rebuild. **Never overwrite** — everything in that file was obtained by asking, and overwriting means asking all over again.

### 2. Read what's mechanically readable, don't ask

Per "anything derivable is never hand-written," look before you open your mouth:

```bash
git rev-parse --short HEAD          # header hash; empty repo with no commits → write "no commits yet"
ls -d */                            # top-level directories, to seed the module list
```

Filter out the obvious non-modules: `node_modules`, `.git`, `dist`, `build`, `target`, `venv`, `__pycache__`, `.venv`, `vendor`.

**Never ask about or write down tech stack, module locations, branch, uncommitted changes, or recent commits** — the hook collects all of it every session, and writing it into a file only creates drift.

### 3. Ask four things (don't guess, don't infer from the README)

**Why not guess**: a wrong guess gets **force-injected into every single session**, and the AI treats it as authoritative. That costs far more than a few extra questions.

| Ask | Notes | Can it be empty? |
|---|---|---|
| **What is this project** | One line: who uses it, what problem it solves | No — this is the core one |
| **What it doesn't do** | Explicitly out of scope, stops the AI from widening scope on its own | Can start empty, but strongly worth filling |
| **What is each directory responsible for** | List the directories from step 2 and have the user give one line each | New project with no code → omit the section |
| **Any known gotchas** | **Only the permanent, recurring kind.** Fixable ones get fixed instead of occupying the budget | New projects usually have none → omit the section |

**Omitting a section beats leaving it empty** — an empty table costs space and conveys nothing, which is worse than absence.

### 4. Generate

Create exactly these two:

```
docs/
├── context.md
└── plans/
```

**Don't create** `design.md` / `devlog.md`: an early project has no architecture to snapshot and no ADRs to record, and an empty template is noise — an AI reading an empty file doesn't know whether to fill it in. Create them when there's real content.

`context.md` skeleton (omit sections as decided in step 3):

```markdown
# <project> · context

> Last updated: YYYY-MM-DD · commit <hash>
> This file is injected into every session. Only facts git can't derive, that the AI doesn't know it's missing.

## What this is
<one line>

## What it doesn't do
- <explicitly out of scope>

## Top-level modules
| Module | Responsibility (one line) |
|---|---|

## Active tasks
| Task | Plan document | State |
|---|---|---|

## Structural gotchas
- <permanent constraint you'll hit every time>
```

**Contract vs. convention** (this determines how freely the format can evolve later):

| | What | Breaking it does what |
|---|---|---|
| **Contract** | The path `docs/context.md`; the `commit <hash>` on the header line | Hook can't find the file / drift detection stops working |
| **Convention** | Section titles, ordering, table columns, how content is organised | Nothing breaks — **the hook doesn't parse structure, it injects verbatim and regexes out the hash** |

So the format can evolve freely with the project as long as those two stay put.

### 5. Report

- Which files were created
- **How to make injection take effect**: installing the groundwork plugin is enough, **no configuration required**
- The next session will open with `<groundwork-context>` present
- **Remind the user to commit**, don't commit automatically

## task — open a task (once per task, before touching anything)

Treats two failure modes: **the AI reasoning forward from premises nobody stated**, and **the AI claiming completion without verifying**.

### When not to run this

Renames, formatting, typo fixes, throwaway scripts, read-only lookups — **running task on these is pure overhead**. The test: if this task goes sideways, will you need to look up what was originally agreed? If not, don't create a document.

But **the questioning discipline in steps 1–4 always applies**, document or not. The core of task is those three questions, not the file.

### 1. Restate the goal as you understand it

In your own words: **what is wanted** and **where the boundary is** (what's explicitly excluded).

**Never parrot the user's phrasing back** — repetition proves nothing, and the entire point of this step is to surface a misunderstanding before any work starts.

### 2. Surface the premises you're inferring (this step is not optional)

List, one by one, everything you're about to build on that the user never said, **marked as inference rather than requirement**:

- User didn't say where it's stored → "I'm assuming `data/`, you didn't say"
- User didn't say whether to support the old format → "I'm assuming no, new format only"

**Why this has to be explicit**: reasoning forward from unstated premises produces output that looks complete while pointing the wrong way, and **the error is hard to see** — the assumption is buried in the implementation and only surfaces at runtime.

**If you can't list any, say so.** Don't invent two trivial ones to fill the section.

### 3. State what "done" means

It has to be **verifiable**, not an adjective.

| ✗ Not a criterion | ✓ Is a criterion |
|---|---|
| Good code quality | `node test.js` — all 13 pass |
| Smooth user experience | First paint < 1s (measured in DevTools) |
| Refactor complete | Existing tests pass + 3 new edge-case tests |

**Criteria are set before the work, not backfilled after.** Anything written afterwards is tailored to whatever got built, which means nothing was ever defined.

### 4. Stop and wait for confirmation

Deliver steps 1–3 together and **wait for the user to confirm or correct before starting**.

This is where "stop when unsure" lands: **the moment to stop is now**, not halfway through when it turns out not to work.

### 5. Create the plan document and register it

Worth creating → `docs/plans/<YYYY-MM-DD>-<task-slug>.md`:

```markdown
# <task name>

> Opened: YYYY-MM-DD · commit <hash>

## Goal
<from step 1>

## Boundary
- Not doing: <explicitly excluded>

## Premises (inferred, confirmed)
- <from step 2, one by one>

## Definition of done
- [ ] <from step 3, checkable>

## Progress
- YYYY-MM-DD <what happened>
```

**Registering it in the active task table of `context.md` is mandatory.** Creating and registering are two separate actions, and skipping the second is the easy mistake: the plan document goes from creation to completion without ever appearing in the injection, which means **the AI never knows that task exists for its entire lifetime** — it surfaces only at archiving time.

### 6. Report

- The conclusions from steps 1–3 (the confirmed version)
- Which plan document was created and where it was registered
- If you judged a document not worth creating, say why

## audit — consistency check (periodic, user-initiated)

### 1. Run the mechanical half

```bash
groundwork-audit
```

The script ships in this plugin's `bin/`, which Claude Code puts on PATH. If the name is not found, fall back to `node bin/groundwork-audit` (only works when the cwd is the groundwork repo itself) and report that the plugin's `bin/` is not on PATH — that is a finding in its own right.

It runs every check that is genuinely mechanical: dead links, unregistered plans, ADR numbering, cited commits, cross-file section references, README and translation drift in both directions, archived plans that never reached the roadmap, hand-written fields the hook already collects, `context.md` size, misplaced content, external-package references, `Revisit When` clauses, zombie plans. Each check reports clean, findings, **skipped with a reason**, or **errored** — a check that throws says so rather than passing quietly.

`--json` gives the same results structured, if you would rather organise the report yourself.

**Do not re-run these checks by hand.** A second copy of a check written into this file is a second implementation that will drift from the first; the script is the only copy.

### 2. The test for what to do with a finding: is there one obvious fix?

**Not "can it be checked mechanically."** Take the checks one at a time and that test falls apart:

> **Detection mechanises. Repair usually needs judgement. Being able to detect is not the same as knowing what to do.**
>
> **One obvious fix, apply it. More than one, report only.**

Example: "a file referenced in `context.md` does not exist" is perfectly mechanical to detect, but **the fix is not unique** — delete the reference, or create the file that should have existed? The script cannot know, so it only reports.

**Across everything the script finds, the only one you may fix directly is ADR renumbering.**

Two categories in its output are **lists, not errors** — read them, do not try to fix them:

- `skill-kinds` — classifies every skill as command or auto-triggering. Which one is correct requires reading the content; the script only lists
- `revisit-when` — every forward-looking clause in the devlog. Whether one has fired is not mechanically decidable

**Three findings are expected, not bugs**: a lesson that cites a package name is a record rather than a dependency; a pointer like "trade-off: see ADR-011" is a pointer, not misplaced content; and a check that names other packages will match itself. A keyword check cannot separate "mentions" from "depends on" — that is this class of check's ceiling, which is why it reports rather than fixes.

### 3. The half no script can do — this is where you actually work

The script compares **documents against documents and documents against git**. It never opens the implementation. So these are yours, and they are where the real drift lives:

| Judgement pass | What to actually do |
|---|---|
| **Documentation vs implementation** | Read `hooks/` and `skills/` and check them against every behavioural claim in `design.md` and the README. Injected content, trigger conditions, promised silence, component counts — a claim that describes a mechanism nobody built looks exactly like a true one from inside the docs |
| **Is each description still true** | Project identity, module responsibilities, whether an ADR's conclusion has been overtaken by later practice |
| **Structural gotchas** | Whether a long-recorded gotcha still applies — not mechanically decidable, so raise the ones you doubt |
| **Roadmap phases** | Whether an entry landed in the right phase. Its pointers can all resolve while the entry sits under the wrong heading |

This section was once ruled out entirely on the grounds that evaluation does not belong in a skill. That reasoning holds for **auto-triggering** skills, where it becomes noise. audit is a command: running it *is* the request for this. But the report **must mark this section as judgement rather than fact, needing your verification**, and must never auto-fix.


### Output shape

The report has four sections, and **the fourth is not optional**:

1. **Fixed** — only the single-obvious-fix kind, like ADR renumbering
2. **Needs your call** — a problem was found but the fix is not unique; list the options
3. **Signals** — not errors, architectural health indicators (size, gotcha count, module table growth)
4. **What was not checked this run**

Section 4 is the important one: audit misses far more than it catches. Without it, an all-clear gives **false confidence** — **a check that does not state what it checked is more dangerous than no check at all.**

### No auto-triggering

Having the hook suggest running audit when drift exceeds a threshold was **rejected**: that is a tool prompting you about itself, the exact noise this pack refuses to make, and the cost of a missed audit is only that problems accumulate for a while, not immediate breakage. Run it when you want it.

---

## Constraints shared by all four modes

- **ADRs always require asking the user.** No mode may write one automatically. This outranks any direct-execution setting elsewhere
- `context.md` may be written directly, without item-by-item confirmation
- **Never auto-commit, never push.** Report which files changed
- If any step fails, report exactly where it failed — do not paper over it with a claim of success
- Always write files as UTF-8
