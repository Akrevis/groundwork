---
name: verify-first
description: Verification discipline before writing — check version numbers, API parameters, config keys, file paths and function signatures before asserting them; search the repo for an existing helper before adding a new one. Triggers when about to state a concrete fact the user could copy and use directly, or when about to add a helper / util / utility function. Does not trigger on reasoning, option comparisons, or trade-off judgements — things nobody copies verbatim; does not re-trigger for something already verified in this session.
---

# Verify Before Asserting

Governs **whether the concrete facts you write down are true**, and **whether the thing you're about to write already exists in the repo**.

## Why this matters more for AI than for people

Fabricating an API parameter and genuinely remembering one **feel identical at the moment of generation**. There is no internal signal saying "I'm not actually sure about this one."

So the rule "look it up when you're unsure" does not work: that uncertainty never surfaces. It has to be replaced by a mechanical test that doesn't depend on self-awareness.

## The test: would the user copy this and use it directly?

Yes → verify it. No → don't bother.

| Must verify | No need |
|---|---|
| Version numbers, API parameter names, config keys, CLI flags | "The idea behind this design is…" |
| File paths, function signatures, import statements | Option comparisons, trade-off judgements |
| Shell commands, environment variable names | Ordering calls like "do X before Y" |

The test is **would being wrong burn someone directly**, not "is this important."

## 1. Verify concrete facts before asserting them

Before writing anything from the left column, confirm it actually exists.

Anything checkable locally gets checked locally: read the file, grep, run `<cmd> --help`, look at `package.json` / `go.mod` / the lockfile / an installed implementation of the same thing.

## 2. Search the repo before adding a utility

Before writing a helper / util / formatting function, **grep for the keyword and a few plausible alternate names**. If the repo already has one, use it.

A duplicate isn't just wasted work — it drifts from the original over time, and after that every call site has to first decide which one to use.

## 3. Say so when you couldn't find it

Not findable locally and the fact is load-bearing → search online. **Never go online for something available locally**: it's slower, and the answer is often less accurate than the local one (the local copy is the version this project actually runs).

Not findable online either → **say "I'm not sure, I couldn't find it."** An answer carrying an uncertainty marker is useful. A wrong answer dressed as a certain one is harmful.
