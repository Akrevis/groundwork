---
name: docs
description: groundwork documentation workflow — init (create context.md and plans/), task (open a task: surface assumptions, define done), wrap (sync at session end), audit (consistency check). Manual invocation only; the model will not trigger this on its own.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git rev-parse:*), Bash(git log:*), Bash(git status:*), Bash(git mv:*), Bash(mkdir:*)
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

Remove that row from the active task table afterwards.

**Why confirm**: moving files has side effects, and "is this task actually done" is a judgement call — getting it wrong means a manual rollback.

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

**Registering it in the active task table of `context.md` is mandatory.** Creating and registering are two separate actions, and this project has missed the second one in practice: a plan document went from creation to completion without ever appearing in the injection, meaning **the AI never knew that task existed for its entire lifetime** — it only surfaced at archiving time.

### 6. Report

- The conclusions from steps 1–3 (the confirmed version)
- Which plan document was created and where it was registered
- If you judged a document not worth creating, say why

## audit — consistency check (periodic, user-initiated)

### The test: is there one obvious fix?

**Not "can it be checked mechanically."** Going through the checks one by one showed that test does not hold:

> **Detection mechanises. Repair usually needs judgement. Being able to detect is not the same as knowing what to do.**
>
> **One obvious fix, apply it. More than one, report only.**

Example: "a file referenced in `context.md` does not exist" is perfectly mechanical to detect, but **the fix is not unique** — delete the reference, or create the file that should have existed? audit cannot know, so it can only report.

**Across every check here, the only one it can fix directly is ADR renumbering.**

### Scope

Groups 0 and 3 only mean something for **package projects** (ones with `skills/` or `hooks/`). In ordinary product repos those directories do not exist and the checks skip naturally — **do not error out over it, and do not report it as a gap**.

### Group 0 · Liveness (what the hook cannot reach itself)

Hook errors are **entirely silent** — a first-layer hard constraint: injection is a bonus, not a precondition, and must never block a session. The cost is that a crashed hook, or one that was never invoked, produces no signal at all. So it gets checked here:

```bash
node hooks/inject-context.js >/dev/null 2>&1 || echo "hook script failed to execute"
# Classify per ADR-009 — list both kinds, since which is which cannot be determined mechanically
for f in skills/*/SKILL.md; do
  grep -q 'disable-model-invocation: true' "$f" \
    && echo "command: $f" \
    || echo "skill (auto-trigger): $f — verify it states constraints, not evaluations"
done
```

The second check exists for ADR-009, and **both kinds must be listed**: drop the field and an evaluation-style command silently becomes an auto-triggering skill, exactly the noise source that ADR warns about. But a pure-constraint skill **is supposed to lack** the field. **Telling them apart requires reading the content**, which no mechanical check can do — so it lists without judging.

**Whether injection is actually running, audit cannot check.** The first command only proves the script executes; it cannot prove Claude Code invoked it. That is the "detecting that config exists is easy, detecting that config works is hard" class of problem. The real signal is **whether you see `<groundwork-context>` when a session opens**: once you are used to having it, its absence is the alarm.

### Group 1 · Form

```bash
# Dead links
grep -o '`[^`]*\.md`' docs/context.md | tr -d '`' | sort -u | while read f; do
  [ -e "$f" ] || echo "dead link: $f"
done

# Are all active plan documents registered in context.md — missed once in practice
for f in docs/plans/*.md; do
  [ -e "$f" ] && { grep -q "$(basename "$f")" docs/context.md || echo "unregistered: $f"; }
done

# ADR numbering gaps or duplicates — the only directly fixable check
grep -o '^## ADR-[0-9]*' docs/devlog.md | sed 's/.*ADR-//' |
  awk '{if($1+0!=NR) print "numbering breaks at entry "NR": " $1}'

# Do the commits cited in devlog actually exist
grep -o '`[0-9a-f]\{7\}`' docs/devlog.md | tr -d '`' | sort -u | while read h; do
  git cat-file -e "$h^{commit}" 2>/dev/null || echo "commit missing: $h"
done

# Do cross-file section references point at real sections — missed once in practice
grep -rho 'S[0-9]\.[0-9]' docs/ skills/ 2>/dev/null | sort -u | while read ref; do
  grep -q "^### ${ref#S}" docs/design.md || echo "broken section reference: $ref"
done
```

The last two **were both missed in practice on this project**, not hypothetical checks. Cross-file references especially: a broken reference inside one file is visible while editing, across files it is invisible without grep.

### Group 2 · Placement (content in the wrong file)

```bash
# context.md hand-writing what the hook collects — an explicit rule violation, not a matter of taste
grep -nEi '^(branch|tech stack|uncommitted|recent commit)' docs/context.md

# Architectural signals: not errors, signals
[ $(wc -l < docs/context.md) -gt 60 ] && echo "context.md is getting large, check for content that belongs in design.md"

# Content in the wrong file
grep -nEi 'options considered|trade-off|revisit when' docs/design.md
grep -nEi 'current state|todo|not started|next up' docs/devlog.md
```

The first of those two greps looks for ADR markers that probably belong in devlog; the second looks for status text, since ADRs record decisions rather than status.

**This project got burned twice**: `design.md` and `devlog.md` grown together, and a list of pending changes that was really a task backlog sitting in design.md. Both were caught by a human, not by a check.

### Group 3 · Rule violations

```bash
# No dependency on any external plugin
grep -rn 'ponytail\|karpathy\|glassbox' hooks/ skills/ 2>/dev/null
```

**Needs a human**: recording why some package was not used, inside `devlog.md`, is normal; referencing it in **execution logic** is the violation. No mechanical check separates those, so it reports only.

**Three known false positives** (all hit on the first real run, do not re-adjudicate them):
- **The check itself** — the regex in this section names those plugins, so audit flags itself. Self-referential and unfixable, since excluding this file would hide real violations
- **Lesson citations** — a recorded lesson is a record, not a dependency
- **Pointers to ADRs** — a line like "trade-off: see ADR-011" matches the ADR-marker check, but it is a pointer; the content lives in devlog

**Common thread: a keyword check cannot distinguish "mentions" from "depends on."** That is the inherent precision ceiling of this class of check, not a bug — which is why it lives under report-only rather than fix-directly.

Same category: evaluation words in a skill file (recommend, you should consider, perhaps) may violate the ADR-009 rule that skills state constraints and never evaluations.

### Group 4 · Staleness

```bash
# Collect the Revisit When clauses — list them, do not judge them
grep -A1 'Revisit When' docs/devlog.md

# Zombie tasks
git log -1 --format='%cr' -- docs/plans/ 2>/dev/null
```

**Revisit When is the field most likely to become dead text in an ADR**: every other field is retrospective, recording why something was chosen; only this one is prospective, recording when it should change. Once written nobody looks at it again, so unless something sweeps for it, it may as well not exist. Listing it costs essentially nothing.

Structural gotchas have the same staleness problem — whether a long-recorded gotcha still applies **cannot be determined mechanically**, so it gets listed for the user.

### Group 5 · Content plausibility (report only, marked as judgement)

Whether descriptions are still accurate, whether module responsibilities are right, whether the conclusion of an ADR has been overtaken by later practice.

**This group was once ruled off-limits entirely, which was wrong**: ADR-009 says evaluation content should not be a *skill*, because auto-triggering turns it into noise. As a command it is fine, because the user asked for it. **audit is a command**, and running it is asking for exactly this.

But the report **must mark this section as judgement rather than fact, needing the user to verify it**, and must never auto-fix.

### Output shape

The report has four sections, and **the fourth is not optional**:

1. **Fixed** — only the single-obvious-fix kind, like ADR renumbering
2. **Needs your call** — a problem was found but the fix is not unique; list the options
3. **Signals** — not errors, architectural health indicators (size, gotcha count, module table growth)
4. **What was not checked this run**

Section 4 is the important one: audit misses far more than it catches. Without it, an all-clear gives **false confidence** — precisely the shape of the lesson recorded in ADR-008: **a check that does not state what it checked is more dangerous than no check at all.**

### No auto-triggering

Having the hook suggest running audit when drift exceeds a threshold was **rejected**: it is the same shape as the onboarding-suggestion component removed in ADR-008, a thing prompting you about itself, and the cost of a missed audit is only that problems accumulate for a while, not immediate breakage. Run it when you want it.

---

## Constraints shared by all four modes

- **ADRs always require asking the user.** No mode may write one automatically. This outranks any direct-execution setting elsewhere
- `context.md` may be written directly, without item-by-item confirmation
- **Never auto-commit, never push.** Report which files changed
- If any step fails, report exactly where it failed — do not paper over it with a claim of success
- Always write files as UTF-8
