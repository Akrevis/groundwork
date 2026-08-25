---
name: module-boundaries
description: Module boundary tests — dependency direction, cohesion, side-effect boundaries, error propagation. Invoke manually when designing a new module, defining cross-module call relationships, laying out directory structure, or introducing a dependency. Outputs judgements only, never edits code. Manual invocation only; the model will not trigger this on its own.
disable-model-invocation: true
allowed-tools: Read, Grep, Glob
---

# /groundwork:module-boundaries

Governs **how something already committed to gets carved up and wired together**. Whether that code should exist at all is decided by the task itself; scope discipline for editing existing code lives in `change-scope`.

**Outputs judgements, never touches code.** Every test below is a question you can answer on the spot — abstract nouns have no binding force.

## Boundaries mean something different for AI

For people, module boundaries are about maintainability. For AI, they decide **how much you have to read to change one thing**.

A cohesive module with only inbound dependencies can be read once, after which a change to it is provably local. In a tangled codebase the AI can't read the whole call chain, so it guesses — **and a guess is a hallucination**.

So the goal isn't clean code. It's **cutting the codebase into pieces that each fit in a context window**. Architectural refinements that don't serve that goal are out of scope here.

## Five basic tests: ask on the spot, don't recite the names

| Test | Ask it like this | What failure looks like |
|---|---|---|
| **One-way dependencies** | "A uses B — does B use A?" | Two modules importing each other; three going around in a circle |
| **Cohesion** | "How many different reasons would force a change here?" | One `utils.js` holding dates, crypto, and HTTP |
| **Loose coupling** | "Does the caller need to know how I store this internally?" | Callers reaching into an internal structure and walking it themselves |
| **Law of Demeter** | "How many dots are on this line?" | `a.getB().getC().doD()` reaching through three layers |
| **Dependency inversion** | "Swap this concrete implementation out — does the high-level code change?" | `new MySQLClient()` sitting in business logic |

**One-way dependencies is the only one of the five a tool can settle outright** — it asks "can it" rather than "is it good", and has no grey zone. If the project already carries a dependency analyser (`madge`, `dependency-cruiser`, `pydeps`), run it and trust its output over your own reading: tracing a full dependency chain by eye is precisely what fails in a large codebase, and using an unreliable reading to check for tangles is self-defeating. With no such tool present, fall back to asking the question.

Failing all five doesn't automatically mean rewrite — **ask what the fix costs first**. Foundation work (directory layout, top-level modules, call direction) is worth being strict about because it's expensive to change later. Adding one feature inside an established skeleton is not worth overturning it.

## Side-effect boundaries: a module doesn't reach across and mutate someone else's state

**Rule**: either be pure (read the arguments, return a result, change nothing outside), or **declare in the name or the docs exactly what you mutate**.

**Ask on the spot**: **What does this function change besides its return value?**

If you can't list it, or what you list isn't reflected in the name → there's a hidden side effect.

Concretely: a query interface that also bumps an access counter, writes a cache, or logs a row into the database — the caller thinks it just read something, and it actually mutated state. **Separating reads from writes isn't fastidiousness; it's what lets callers predict consequences.**

**What failure looks like**: `getXxx` / `formatXxx` / `renderXxx` mutating state; calling a query function producing a write; a presentation layer changing business data, firing requests, or writing caches during render.

## Errors must propagate across boundaries

**Rule**: no problem-masking tolerance at a boundary. Bad argument → throw. Dependency unavailable → throw.

**Ask on the spot**: before writing `try/catch`, `?? default`, or `if (!x) return []` — **am I handling a business case I actually know about, or papering over a situation I'm unsure of?** If it's the second, let it throw.

**Why this matters especially for AI coding**: **when an AI is unsure, adding a fallback is its default way of concealing that uncertainty.** Don't know whether the field can be empty → give it a default. Don't know whether the call can fail → wrap it in try. The result is a hallucination hidden behind a fallback: nothing errors, the output is wrong, and the failure surfaces nowhere near its cause. **Letting it blow up immediately exposes the hallucination at the cheapest possible place.**

The classic shape: **a query returns the same empty array both when there genuinely are no results and when the input doesn't satisfy the index's precondition.** The caller can't tell them apart, so a human has to remember the gotcha — and that memory eventually gets lost. Make the second case throw, and the piece of tribal knowledge stops needing to exist.

**Three cases that genuinely need a fallback**:

- The outermost layer (top of an HTTP handler, a main loop) keeping the process alive — **but it must log the complete error**, never swallow it
- An explicit business rule ("show the username when no nickname is set") — that's business logic, not a fallback; just write it plainly
- Genuinely optional degradation ("analytics failure doesn't block the main flow") — with an explicit comment saying why failure is acceptable

**The overall test**: a fallback is "I know this can fail and I know what to do about it," not "I'm not sure whether something will go wrong, let me wrap it just in case."

## How this command fails in practice

- **Reciting the tests as slogans instead of asking them** — abstract nouns have no binding force; this is the number one failure mode
- **Inventing an interface for a single implementation in the name of loose coupling** — these tests exist to prevent tangling, not to reserve extension points
- **Rewriting existing code the moment it fails a test** — report it; scope discipline for edits lives in `change-scope`
- **Passing off directory depth as modularity** — five levels of nesting that import each other is still one big ball of mud
- **Running the full battery on a throwaway script** — false positives are how people end up not using this at all
