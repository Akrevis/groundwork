---
name: change-scope
description: Scope discipline before editing existing code — change only what the task asks for, read the full call chain first, say so when you couldn't, and look before you delete. Triggers when modifying or removing code that already exists: editing a function, changing config, fixing a bug, deleting code, touching a module you didn't write. Not about whether the code should exist, and not about how to carve up a new module. Does not trigger on brand-new files, building a module from scratch, read-only lookups, or running commands.
---

# Change Boundaries

Governs **how existing code gets changed**. Not whether that code should exist, and not how a new module gets carved up.

## Why this matters more for AI than for people

When a person's change scope runs wide, the cost is "this diff is hard to review." For AI the cost is different: **without the full call chain you can only guess, and a guess is a hallucination** — and at the moment it happens, the AI cannot perceive it.

So the four rules below are not tidiness requirements. They are hallucination guards.

## 1. Change only what the task explicitly asks for

Spotted a problem in adjacent code → **write it down and report it, don't fix it in passing**.

Drive-by refactors, drive-by formatting, drive-by dependency bumps — each one makes "what actually changed here" unreviewable. The user is reviewing one thing, not three things tangled together.

**Tension with "fix the root cause"**: fixing a root cause often means editing callers, which collides with this rule. The resolution is **don't widen the scope on your own** — say "the root cause is in X, fixing it touches these 3 call sites" and let the user decide.

## 2. Read the full call chain before editing

Before touching a function / class / config key, **search every reference to it first**.

Editing without reading them is betting that nothing else depends on the current behavior. That bet often wins in a small codebase and always loses in a large one — and large codebases are the entire reason this discipline exists.

## 3. Say so when you couldn't read it all

Too many call sites to finish, an unfamiliar module in the way, dynamic dispatch that search can't reach — **say it**.

"Searched X, found 12 references, read 5 of them" is more honest than "confirmed no impact," and more useful: the user can see where the risk sits. The second sentence tells them nothing.

## 4. Look at the target before deleting or overwriting

No exceptions. Read what that file or block actually is, and confirm it has no remaining value, before removing it.

## 5. Check where you are before the first edit

Which branch, and is the working tree clean. One command, before touching anything:

```bash
git branch --show-current && git status --short -uall
```

**Why this outranks the call chain**: getting the call chain wrong breaks one function. Being on the wrong branch means **an entire batch of edits lands somewhere it was never meant to go** — and nothing looks abnormal while it happens. Every file writes successfully, every test passes, the commit succeeds. It surfaces later, as a missing commit or a mysterious conflict.

This is not hypothetical. It happened while writing this rule: four files were edited and committed on a release branch by an author who believed the whole time they were on the development branch, because the branch had been switched between turns and never re-checked.

**Re-check after anything that could have moved you**: a checkout in an earlier turn, a command someone else ran, resuming a session, any gap where you were not the only actor.
