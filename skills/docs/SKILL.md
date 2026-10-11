---
name: docs
description: "groundwork documentation workflow — init (set up docs/context.md), task (turn a decision into a task contract under docs/tasks/), wrap (sync at session end), audit (consistency check). Manual invocation only; the model will not trigger this on its own."
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git rev-parse:*), Bash(git log:*), Bash(git status:*), Bash(git diff:*), Bash(git worktree list:*), Bash(git mv:*), Bash(git rm:*), Bash(git add:*), Bash(git commit:*), Bash(mkdir:*), Bash(groundwork-audit:*), Bash(node bin/groundwork-audit:*)
---

# /groundwork:docs — documentation workflow

Route on the first word of `$ARGUMENTS`. **Missing, or not one of `init` / `task` / `wrap` / `audit` → stop and ask which one, don't guess.**

`docs/` is project state shared by the human and the AI, tracked in git. **Only `context.md` is force-injected into every session**; everything else is read on demand. All four modes work on the same layout, the same templates and the same commit rules, so those are defined once, first, and the modes refer back to them.

## The layout (single source of truth for all four modes)

```
docs/
├── context.md    injected every session: what this is, what it doesn't do, module duties, gotchas
├── design.md     core zone (intent, rarely changes) + phase zone (current architecture)
├── roadmap.md    how the project got here: phases, and pointers into everything else
├── devlog.md     ADRs: the options considered, the choice, the cost
├── backlog.md    friction with groundwork itself, met while using it here
├── plans/        topics under discussion, one file per topic
├── tasks/        decided work, one contract per task — the hook lists these
└── archive/      finished task files
```

### How a piece of work moves

```
  something comes up in a session
        │  wrap records it
        v
  plans/<topic>.md      under discussion — stays here until it is settled
        │  task, in the main worktree
        v
  tasks/<task>.md       decided — executed in the main worktree, or in its own worktree
        │  merged; then wrap, in the main worktree
        v
  archive/<task>.md     done — and registered in the roadmap
```

Not every topic becomes work. One that settles as a design decision goes into `design.md` instead, and one that is dropped simply goes — either way it leaves `plans/` (see "plans/<topic>.md — under discussion"). Friction with groundwork itself takes a side path: `wrap` writes it to `backlog.md`.

### Who reads and writes what

| File | Read by | Written by | Written where |
|---|---|---|---|
| `context.md` | the hook, every session | `init` creates it; `wrap` updates it | main worktree |
| `design.md` | the AI, before changing a module | `wrap` — when a `plans/` topic settles as a design decision; core zone only alongside an ADR; phase zone rewritten when a new phase opens | main worktree |
| `roadmap.md` | the AI, when it needs the shape of the whole history | `wrap`, when it archives a task | main worktree |
| `devlog.md` | the AI, before changing architecture | `wrap`, only after the user says yes | main worktree |
| `backlog.md` | the human, deciding what groundwork should change | `wrap` | main worktree |
| `plans/<topic>.md` | whoever picks the topic up | `wrap` records, updates, and removes it once it settles into `design.md` or is dropped; `task` removes it on promotion | main worktree |
| `tasks/<task>.md` | the hook lists it; the executing session reads all of it | `task` creates it; after that, only the session executing it | created in the main worktree; updated wherever it executes |
| `archive/` | rarely | `wrap` | main worktree |

**Nothing but `context.md` is created up front.** `design.md`, `devlog.md`, `roadmap.md`, `backlog.md` and the three directories each appear the first time something real goes into them. An empty template is noise — an AI reading an empty file doesn't know whether it's supposed to fill it in — and git does not carry an empty directory to any other machine.

### One writer for shared documents

**Shared documents — everything above except a task's own file — are written only by this command, and only in the main worktree.** A session executing a task writes code and its own task file, nothing else. Whatever it finds that belongs in a shared document goes under that file's *Write-back* block, and `wrap` in the main worktree carries it across after the merge.

Why: parallel sessions each work in their own worktree, on their own branch. If every one of them also edits `context.md` or `roadmap.md`, every merge conflicts on the documents, and the injected state is whichever branch happened to merge last. With a single writer the documents never conflict, and code is the only thing left to merge.

How to tell where you are:

```bash
git rev-parse --path-format=absolute --git-dir --git-common-dir
```

Two identical lines → the main worktree. Two different lines → a linked worktree. **Keep `--path-format=absolute`**: without it, run from a subdirectory, one line comes back absolute and the other relative, and they never compare equal.

**This assumes parallel work uses worktrees.** Running tasks side by side by switching branches inside the main worktree defeats it: every branch looks like the main worktree, shared documents get edited on all of them, and nothing warns you.

### Required blocks

Each template below lists **required blocks**. Two rules govern all of them:

1. **The block must be present; its heading is free.** Write headings in the project's own language and wording. Nothing parses these blocks mechanically — the hook reads file names and git history, never sections — so the contract is the content, not the title.
2. **An empty block says "none"; it is never left out.** A missing block is ambiguous: forgotten, or nothing to say? The one exception is `context.md`: it is injected into every session, and an empty section there spends attention and carries nothing, so an empty section is omitted instead.

## context.md — what gets in

`context.md` exists so the AI understands this project from the first token. **Every entry has to pass all three tests:**

1. **git can't derive it.** Tech stack, module locations, branch, uncommitted changes, recent commits, active tasks and the staleness baseline are all collected by the hook — **never hand-write them here**
2. **The AI doesn't know it's missing it.** Anything it would think to look up when it needed it (architecture detail, full ADR text) gets a pointer, not the content
3. **It holds for anyone who clones the repo.** A gotcha that exists only on one machine — a shell's quoting rules, a local path, a personal git setting — belongs in that person's user-level memory, not here. The test: *on another machine, after a fresh clone, would this still bite?*

**There is no line limit.** Tables take room, and a line count punishes them without saying anything about whether an entry belongs. What keeps the file small is the three tests, applied entry by entry — and small still matters: not to save tokens, but because recall drops for material in the middle of a long context. Inject 500 lines and the 5 that matter get buried.

**Structural gotchas only if they're permanent and recurring.** Anything fixable gets fixed instead of occupying the always-on budget.

```markdown
# <project> · context

> Last updated: YYYY-MM-DD
> Injected into every session. Only facts git can't derive, that the AI doesn't know it's missing.

## What this is
<one line: who uses it, what problem it solves>

## What it doesn't do
- <explicitly out of scope — stops the AI widening the scope on its own>

## Top-level modules
| Module | Responsibility (one line) |
|---|---|

## Structural gotchas
- <hits anyone who clones this repo, every time>
```

| Block | Required |
|---|---|
| Header with the date | always |
| What this is | always — the core one |
| What it doesn't do | strongly worth filling; omitted only while genuinely empty |
| Top-level modules | omitted while there is no code |
| Structural gotchas | omitted when there are none |

**What the hook appends after the file**: branch, uncommitted changes, active tasks (read off `docs/tasks/`), stack, recent commits, a staleness warning when it applies, and pointers to whichever other documents exist. None of it belongs in the file.

**The date line is what resets the staleness warning.** The hook takes the last commit that touched `context.md` as its baseline and warns once 5 or more commits have landed since, naming the directories they changed. So `wrap` updating the date — and committing it — marks the file as reviewed. No commit hash is written anywhere: a hash written into a file names the commit that contains it, and amend, rebase or a squash merge replaces exactly that commit. (If the date already reads today and nothing else changed, there is nothing to commit and the baseline stays at today's earlier update. That is fine.)

## tasks/<task>.md — the task contract

A task file is the contract between whoever decided the work and whoever executes it — often another session, possibly several in parallel. It is written so the executing session needs nothing else.

```markdown
# <task name>

> Opened: YYYY-MM-DD

## Goal
<what is wanted, in your own words>

## Boundary
- Not doing: <explicitly excluded>

## Premises (inferred, confirmed)
- <each premise the user never stated, confirmed before work started>

## Definition of done
- [ ] <verifiable: a command and its expected result, a measured number, a named test>

## Handoff

### Depends on
<tasks that must merge before this one starts or merges — or "none">

### Change scope
<the files and directories this task will change>

### Key files: core content fixed up front
<for each shared key file: its interface, data shape or convention, as decided now — or "none">

### When to come back
<situations that must stop and ask the decider — or "none beyond the fixed rule">
Fixed rule: changing anything outside Change scope always comes back first.

## Execution conventions
- Other tasks running at the same time → work in your own worktree, named after this file, so that `git worktree list` in the main worktree shows this task is under way. The only task running → the main worktree is fine.
- Write code and this file. Nothing else: context.md, design.md, roadmap.md, devlog.md, backlog.md and plans/ are written in the main worktree after the merge. Put what they need under Write-back.
- Unsure about something "When to come back" does not list → choose, record the choice and the reason under Progress, and carry on. The decider reviews these at merge time.
- Done → tick Definition of done, commit, and say it is ready to merge.

## Progress
- YYYY-MM-DD <what happened; every choice made on your own, and why>

## Write-back
<for wrap in the main worktree, after the merge: gotchas, ADR candidates, project todos, friction with groundwork — or "none">
```

| Block | Who uses it | Why it is required |
|---|---|---|
| Goal, Boundary, Premises | the executing session | Reasoning forward from premises nobody stated produces work that looks complete while pointing the wrong way |
| Definition of done | the executing session; `wrap` when it archives | Set before the work, it is a test; written afterwards, it is a description of whatever got built |
| Depends on | the human, ordering merges | Two tasks touching the same ground must merge in a known order |
| Change scope | the next `task`, checking for overlap | Overlap is only detectable if every task declares its ground |
| Key files | every parallel task; and the tie-breaker when a merge conflicts | Settled up front, a shared interface is something both sides build to rather than something they fight over at merge time |
| When to come back | the executing session | Without it every doubt comes back to the decider. Three sessions means three times the interruptions, and parallel work ends up slower than serial — the bottleneck has moved to the decider |
| Execution conventions | the executing session | The same text in every task file, so the contract does not depend on the session having read this skill |
| Progress | the decider, reviewing afterwards | The choices made without asking are exactly what needs reviewing |
| Write-back | `wrap` in the main worktree | The executing session must not edit shared documents, so what it learns has to wait somewhere |

**A key file** is either a file another active task also lists in its Change scope — the overlap check in `task` finds these — or a file many modules depend on: an interface, a schema, a config, a routing table.

## plans/<topic>.md — under discussion

One topic per file: `docs/plans/<YYYY-MM-DD>-<topic-slug>.md`. A topic may bundle a few closely related items; when one is promoted to a task it leaves the file, and the file goes when nothing is left in it.

```markdown
# <topic>

> Raised: YYYY-MM-DD

## Source
<what actually happened that raised this>

## To decide
- <each open question>

## Discussion record
- YYYY-MM-DD <what was concluded; what is still open>
```

**The bar for a topic: something actually happened.** A hypothetical problem goes nowhere — writing one down is how fictional problems acquire components.

**A topic ends one of three ways, and in all three the file leaves `plans/`** — a settled topic left behind reads as still open to every session that follows:

| Ending | What happens |
|---|---|
| **It becomes work** | Discussed far enough that `task` can state its goal, boundary, premises and definition of done → `task` promotes it to `tasks/` |
| **It settles as a design decision** | The answer is a decision, not a piece of work — the usual ending in a project that designs before it codes → once the user confirms it is settled, `wrap` writes the conclusion into `design.md`, in the zone it belongs to, and removes the topic file. A core-zone conclusion goes through the ADR question first. No `design.md` yet → this is its first real content; create it |
| **It ends in "no"** | Non-obvious reasoning → offer an ADR, so it isn't raised again from scratch; otherwise just remove the file |

git keeps the discussion record in every case.

**Partly settled is not settled.** When some of a topic's questions are decided and others are not, write the decided part into `design.md`, take it off To decide (the discussion record keeps the history), and keep the file until nothing is left open. Removing the file early loses the open remainder; waiting for the last question keeps decided design out of `design.md`.

## design.md — two zones

| Zone | Required blocks | Changes how |
|---|---|---|
| **Core** | goals and intent; principles and hard constraints; the full boundary | Rarely. Every change needs an ADR, and `context.md`'s "What this is" and "What it doesn't do" — the digest of this zone — change with it |
| **Phase** | which roadmap phase it describes; current architecture (layout, data flow); known risks | Rewritten as a whole when a new roadmap phase opens |

Mark the zones visibly: as two top-level parts, or with a zone table at the top when existing section numbers are referenced elsewhere and must not move.

A `plans/` topic that settles as a design decision lands here, in whichever zone it belongs to.

**Not in `design.md`**: pending items (→ `plans/`), decision rationale (→ `devlog.md`), history (→ `roadmap.md`). An architecture document is not a todo list; one that becomes one stops being read as architecture.

**Created when there is real content.** For a project that designs before it codes, that is the first settled design discussion — the core zone holds the intent and the phase zone holds the planned architecture. That is a design draft, not a snapshot, and it is exactly what this file is for at that stage.

## backlog.md — friction with groundwork itself

Feedback on groundwork as a tool, met while using it on this project. **This project's own pending work is not here** — that goes to `plans/`.

```markdown
# groundwork backlog · <project>

> Friction with groundwork itself, met while using it on this project.

## B-01 · <short title>
**What happened** (YYYY-MM-DD): <the actual incident>
**To decide**: <what would have to change>
<optional: root cause, cost, suggested fix>
```

The bar is the same as for `plans/`: something actually happened, here, while using groundwork. Numbers run in order and are never reused.

## devlog.md and roadmap.md

**ADR format** (`devlog.md`): context / options considered / decision / rationale / trade-off / Revisit When / landing commit. The landing commit keeps decision → implementation traceable. A superseded ADR stays in full, marked as superseded, and the new one says what it supersedes.

**Roadmap format**: a phase is not a time span, it is "this batch of work solves one problem" — the heading names the problem, with a date range. Entries are **pointers only, never status**: what it settled, its ADR if any, its landing commit, and the archived task file.

## Committing (all four modes)

Every mode commits what it wrote, and only that:

1. **Before writing anything, note which files already have uncommitted changes** (`git status --short`). Never commit those — your commit would sweep the user's in-flight edits in with yours. Report them instead
2. **Stage by path, only the files this run wrote**: `git add <path>`, `git mv`, `git rm`. Never `git add -A` or `git add .`
3. **One commit per run.** Write the message in the language and style of the repository's recent commits (`git log --oneline -10`); with no history yet, plain English in the imperative
4. **Never push**
5. **`git add` refuses a path because it is ignored → stop and report.** Don't force it with `-f`: someone chose to ignore it, and whether these documents belong in git is their decision. `groundwork-audit` reports ignored and uncommitted files under `docs/`
6. **The user has said not to commit** — this session, or in their standing instructions → stop at listing the changed files

In a linked worktree the commit lands on that task's branch. That is intended: the task file travels with the work and merges with it.

## init — set up the documentation skeleton (once per project)

### 1. Preflight

`docs/context.md` **already exists** → stop, tell the user the project is already set up, and ask whether they want `wrap` to update it or genuinely intend to rebuild. **Never overwrite** — everything in that file was obtained by asking, and overwriting means asking all over again.

**Look at what the project already has.** List the markdown files under `docs/` and at the repository root, leaving out `README*`, `LICENSE*`, `CHANGELOG*` and `CONTRIBUTING*`. Anything found → **stop and ask, file by file**, where it belongs:

| Existing file | Where it can go |
|---|---|
| A design document | becomes `design.md` — which parts are core zone, which are phase zone |
| A decision log | becomes `devlog.md` |
| A todo or pending list | its items become `plans/` topics |
| Anything else | stays where it is, outside the layout |

**Never move, rename or rewrite one on your own.** They hold the user's work, and a wrong guess is a manual rollback. A design document written before any code is a design draft — map it onto `design.md` as such, don't relabel it an architecture snapshot.

### 2. Read what's mechanically readable, don't ask

Per "anything derivable is never hand-written," look before you open your mouth:

```bash
ls -d */                            # top-level directories, to seed the module list
```

Filter out the obvious non-modules: `node_modules`, `.git`, `dist`, `build`, `target`, `venv`, `__pycache__`, `.venv`, `vendor`.

**Never ask about or write down tech stack, module locations, branch, uncommitted changes, recent commits or active tasks** — the hook collects all of it every session, and writing it into a file only creates drift.

### 3. Ask four things (don't guess, don't infer from the README)

**Why not guess**: a wrong guess gets **force-injected into every single session**, and the AI treats it as authoritative. That costs far more than a few extra questions.

| Ask | Notes | Can it be empty? |
|---|---|---|
| **What is this project** | One line: who uses it, what problem it solves | No — this is the core one |
| **What it doesn't do** | Explicitly out of scope, stops the AI from widening scope on its own | Can start empty, but strongly worth filling |
| **What is each directory responsible for** | List the directories from step 2 and have the user give one line each | New project with no code → omit the section |
| **Any known gotchas** | **Only the permanent, recurring kind that would bite anyone who clones the repo.** Fixable ones get fixed; machine-specific ones belong in user-level memory | New projects usually have none → omit the section |

**Omitting a section beats leaving it empty** — in `context.md` an empty table costs space and conveys nothing.

### 4. Generate

Create exactly one file: **`docs/context.md`**, from the template in "context.md — what gets in". **No directories** — `plans/`, `tasks/` and `archive/` appear when their first file does; git does not track an empty directory, so an empty one would exist on this machine and nowhere else.

**Contract vs. convention** (this determines how freely the format can evolve later):

| | What | Breaking it does what |
|---|---|---|
| **Contract** | The paths `docs/context.md`, `docs/plans/`, `docs/tasks/`, `docs/archive/` | The hook can't find the file, lists no tasks, points nowhere; audit checks the wrong place |
| **Convention** | Headings, ordering, table columns, wording, language | Nothing breaks — **the hook doesn't parse structure: it injects the file verbatim and reads the rest from the directory listing and git** |

### 5. Commit and report

Commit `docs/context.md` (see "Committing"), then report:

- Which file was created, and the commit
- **How to make injection take effect**: installing the groundwork plugin is enough, **no configuration required**
- The next session will open with `<groundwork-context>` present

## task — turn a decision into a task contract

Treats two failure modes: **the AI reasoning forward from premises nobody stated**, and **the AI claiming completion without verifying**. Its output is a task file another session can execute without asking anything the file already answers.

### When to use it

| Situation | Use task? |
|---|---|
| A `plans/` topic has been discussed to a decision | Yes — the most common case |
| A new, non-trivial piece of work, and you want to start without a discussion round | Yes |
| The work will be handed to another session, or run in parallel with other tasks | Yes — the handoff blocks exist for exactly this |
| Renames, formatting, typo fixes, read-only lookups, throwaway scripts | No — pure overhead |
| Unsure | Ask: if this goes sideways, will anyone need to look up what was agreed? If yes, use it |

**The questioning discipline in steps 2–4 always applies, file or no file.** The core of task is those three questions, not the document.

### 1. Preflight

- `docs/context.md` missing → stop and tell the user to run `/groundwork:docs init` first
- **In a linked worktree → stop.** The task file has to be committed in the main worktree, where every later session branches from — otherwise parallel sessions cannot see each other's change scope, and the overlap check below is blind
- **The source**: whatever follows `task` in `$ARGUMENTS` names a `plans/` file or describes new work; nothing → ask. A `plans/` source → read the whole topic first; its discussion record is where the premises come from

### 2. Restate the goal as you understand it

In your own words: **what is wanted** and **where the boundary is** (what's explicitly excluded).

**Never parrot the user's phrasing back** — repetition proves nothing, and the entire point of this step is to surface a misunderstanding before any work starts.

### 3. Surface the premises you're inferring (this step is not optional)

List, one by one, everything you're about to build on that the user never said, **marked as inference rather than requirement**:

- User didn't say where it's stored → "I'm assuming `data/`, you didn't say"
- User didn't say whether to support the old format → "I'm assuming no, new format only"

**Why this has to be explicit**: reasoning forward from unstated premises produces output that looks complete while pointing the wrong way, and **the error is hard to see** — the assumption is buried in the implementation and only surfaces at runtime.

**If you can't list any, say so.** Don't invent two trivial ones to fill the section.

### 4. State what "done" means

It has to be **verifiable**, not an adjective.

| ✗ Not a criterion | ✓ Is a criterion |
|---|---|
| Good code quality | `node test.js` — all 13 pass |
| Smooth user experience | First paint < 1s (measured in DevTools) |
| Refactor complete | Existing tests pass + 3 new edge-case tests |

**Criteria are set before the work, not backfilled after.** Anything written afterwards is tailored to whatever got built, which means nothing was ever defined.

### 5. Settle the handoff

**Depends on** and **Change scope** first. Then **check for overlap**: read the Change scope and Key files of every other file in `docs/tasks/`. For each file both tasks touch:

| The other task | Do |
|---|---|
| Already fixed this file's core content | Adopt it — copy it into this task's Key files block |
| Listed the file, fixed nothing, and **has not started** (no worktree named after it in `git worktree list`) | Fix the core content now, in both task files — the other one is still yours to edit in the main worktree |
| Listed the file, fixed nothing, and is under way — or you can't tell | Stop and ask: make this task depend on it, or narrow this task's scope. **Never edit its file** — its branch owns it now, and an edit here becomes a merge conflict there |

Add the files many modules depend on to Key files as well, then **When to come back**: the situations that genuinely need the decider. Keep it short — everything not listed, the executing session decides and records.

### 6. Stop and wait for confirmation

Deliver steps 2–5 together and **wait for the user to confirm or correct before writing anything**.

This is where "stop when unsure" lands: **the moment to stop is now**, not halfway through when it turns out not to work.

### 7. Write it, retire the plan, commit

- Write `docs/tasks/<YYYY-MM-DD>-<task-slug>.md` from the template in "tasks/<task>.md — the task contract". Copy the Execution conventions block verbatim
- From a `plans/` source: take the promoted topic out of its file — `git rm` the file if nothing else is left in it, edit the topic out otherwise
- Commit both (see "Committing")

No registration step: the hook lists `docs/tasks/` itself, so the task appears in the next session's injection by existing.

### 8. Report

- The conclusions from steps 2–5, as confirmed
- The task file, and the commit
- **How to execute it**:
  - The only task running → carry on here, or in any new session, in the main worktree
  - Others running → open a new session, have it create a worktree named after the task file, and tell it to execute `docs/tasks/<file>`

## wrap — sync at session end

### 1. Preflight

- `docs/context.md` missing → stop and tell the user to run `/groundwork:docs init` first. Don't generate around the scaffolding
- **Find out where you are** (see "One writer for shared documents") — the two cases below do different things
- Note which files already have uncommitted changes, before writing anything (see "Committing")

### 2. In a linked worktree — executing a task

1. **Identify this session's task file** — the one it was told to execute. Can't tell → ask
2. **Update it**: Progress (date, what happened, every choice made without asking and why); tick the Definition-of-done items that are verifiably done; add to Write-back anything that belongs in a shared document — a structural gotcha, a non-obvious decision (an ADR candidate), a project todo that isn't this task, friction with groundwork itself
3. **Touch nothing else.** Commit the task file
4. **Report** what changed. Every done item ticked → say the task is ready to merge, and that `wrap` in the main worktree archives it afterwards

### 3. In the main worktree — distill this session

Read back through the session and determine:

- Did a task executed here make progress? → its Progress block, as in the worktree case
- Were top-level modules added or removed?
- Did you hit a **structural gotcha** that passes the three tests?
- Were any non-obvious technical decisions made (the options-plus-rationale kind)?
- Did something come up that the project should do, but not now? → a `plans/` topic
- Was a `plans/` topic discussed? → its discussion record — or, if it settled, step 5
- Did groundwork itself get in the way? → `backlog.md`

Anything after the mode word in `$ARGUMENTS` is a hint about what mattered, but reading the session still governs.

### 4. Update `context.md` directly (no need to confirm item by item)

- **Top-level module table**: only touch it if modules were actually added or removed. **Responsibilities only, never locations** (the hook reads locations itself)
- **Structural gotchas**: filter through the three tests and the permanence bar
- **The date line — never skip it.** Updating it is what marks the file as reviewed and resets the staleness baseline. Skip it and every following session carries a "context.md may be stale" warning; after a few rounds the AI learns to ignore it, and **the whole staleness guard stops working**

### 5. Record topics and friction

- A new topic → a new `plans/` file; a discussed topic → a dated line in its discussion record
- **A topic that settled as a design decision** → **ask first**: whether a topic is settled is a judgement call, exactly like whether a task is done, and a conclusion written into `design.md` reads as decided to every later session. Confirmed → write the conclusion into `design.md`, in the zone it belongs to, then `git rm` the topic file. A core-zone conclusion waits for the ADR question in step 8. A topic that ended in "no" is removed the same way, after the ADR offer. **Only partly settled** → the decided part goes into `design.md` and comes off To decide; the file stays
- Friction with groundwork → a new entry in `backlog.md`, creating the file with its header on the first entry
- **Same bar for both: something actually happened.** Nothing qualifies → write nothing, and don't ask

### 6. Archive finished tasks (confirm first)

A task is a candidate when every Definition-of-done item is ticked, or the user says it is merged and done. **Ask the user**, then for each one confirmed:

1. **Carry its Write-back across**: gotchas → `context.md` (three tests apply); ADR candidates → the question in step 8; project todos → `plans/`; friction → `backlog.md`
2. Move it:

   ```bash
   mkdir -p docs/archive
   git mv docs/tasks/<file>.md docs/archive/
   ```

3. **Append it to the current phase in `docs/roadmap.md`** — what it settled, its ADR if it has one, its landing commit, and a pointer to the archived file. **No roadmap yet → ask whether to start one**; a project with one archived task has no history worth mapping

**Archiving and registering are separate actions, and the second is the one that gets dropped.** A task archived but never added to the roadmap leaves a hole nothing will surface on its own; `groundwork-audit` checks for exactly this.

**Opening a new phase is a judgement call — ask the user.** A phase is not a time span, it is "this batch of work solves one problem". wrap appends to the current phase; it never opens one by itself. **When the user does open one and `design.md` exists, its phase zone is now out of date**: draft the rewrite for the phase that is starting, and write it once the user agrees.

**Why confirm the archiving**: "is this task actually done" is a judgement call, and getting it wrong means a manual rollback.

### 7. design.md core zone

If this session changed a goal, a principle or the boundary, that is a core-zone change: it goes through the ADR question in step 8, and `context.md`'s "What this is" and "What it doesn't do" follow it. Never edit the core zone without that ADR.

### 8. ADR confirmation (never write one directly)

When step 3, a settled or dropped topic in step 5, a Write-back block or step 7 surfaces a non-obvious decision, **stop and ask**: "Record an ADR for this? <candidate title + one-line context>"

- User says yes → append to `docs/devlog.md` in the standard format (create the file if absent), including the **landing commit hash**, so decision → implementation stays traceable
- User says no, or it's a small decision → don't write it

**The bar for an ADR is higher than for anything else here.** Don't let the direct-write behavior of step 4 spill over into devlog. `git log` records what changed; an ADR records "considered A/B/C, chose B because X, at cost Y" — git can't replace that, but writing too many of them drowns the signal.

### 9. Commit and report

Commit everything this run wrote (see "Committing"), then report:

- Which sections of `context.md` changed
- Topics and backlog entries recorded
- Tasks archived, and where they went in the roadmap
- Whether the ADR question was asked, and the answer
- The commit — and any file left uncommitted because it already had changes in flight

## audit — consistency check (periodic, user-initiated)

### 1. Run the mechanical half

```bash
groundwork-audit
```

The script ships in this plugin's `bin/`, which Claude Code puts on PATH. If the name is not found, fall back to `node bin/groundwork-audit` (only works when the cwd is the groundwork repo itself) and report that the plugin's `bin/` is not on PATH — that is a finding in its own right.

It runs every check that is genuinely mechanical: whether the hook executes, skill frontmatter that silently voids itself, dead links, files under `docs/` that git ignores or has not committed, ADR numbering, cited commits, cross-file section references, README and translation drift in both directions, archived tasks that never reached the roadmap, hand-written fields the hook already collects (a hand-kept task list or baseline hash included), misplaced content, external-package references, `Revisit When` clauses, tasks that have not moved in a month. Each check reports clean, findings, **skipped with a reason**, or **errored** — a check that throws says so rather than passing quietly.

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
| **Documentation vs implementation** | Read the code the documents describe and check it against every behavioural claim in `design.md` and the README. A claim that describes a mechanism nobody built looks exactly like a true one from inside the docs |
| **Is each description still true** | Project identity, module responsibilities, whether an ADR's conclusion has been overtaken by later practice |
| **Structural gotchas** | Whether a long-recorded gotcha still applies, and whether it still passes the three tests — not mechanically decidable, so raise the ones you doubt |
| **Roadmap phases** | Whether an entry landed in the right phase. Its pointers can all resolve while the entry sits under the wrong heading |
| **Tasks and topics** | Whether a task in `docs/tasks/` is still alive, and whether a `plans/` topic has quietly been decided without being promoted or dropped |

This section was once ruled out entirely on the grounds that evaluation does not belong in a skill. That reasoning holds for **auto-triggering** skills, where it becomes noise. audit is a command: running it *is* the request for this. But the report **must mark this section as judgement rather than fact, needing your verification**, and must never auto-fix.

### Output shape

The report has four sections, and **the fourth is not optional**:

1. **Fixed** — only the single-obvious-fix kind, like ADR renumbering
2. **Needs your call** — a problem was found but the fix is not unique; list the options
3. **Signals** — not errors, architectural health indicators (`context.md` growth, gotcha count, module table growth, tasks piling up)
4. **What was not checked this run**

Section 4 is the important one: audit misses far more than it catches. Without it, an all-clear gives **false confidence** — **a check that does not state what it checked is more dangerous than no check at all.**

A fix applied here is committed like any other write (see "Committing").

### No auto-triggering

Having the hook suggest running audit when drift exceeds a threshold was **rejected**: that is a tool prompting you about itself, the exact noise this pack refuses to make, and the cost of a missed audit is only that problems accumulate for a while, not immediate breakage. Run it when you want it.

---

## Constraints shared by all four modes

- **ADRs always require asking the user.** No mode may write one automatically. This outranks any direct-execution setting elsewhere
- `context.md` may be written directly, without item-by-item confirmation
- **Shared documents are written only in the main worktree** (see "One writer for shared documents")
- **Commit what you wrote, by path; never push** (see "Committing")
- If any step fails, report exactly where it failed — do not paper over it with a claim of success
- Always write files as UTF-8
