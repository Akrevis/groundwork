#!/usr/bin/env node
// groundwork — SessionStart injection hook
//
// The only test: does <git root>/docs/context.md exist?
//   yes → inject "hand-written facts + automatically collected git state"
//   no  → complete silence (project not onboarded; no prompt, no nagging)
//
// Hard constraint: injection is a bonus, not a precondition. Every error path must stay
// silent. A broken hook may cost this session its injection; it may never block a session.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const AGGREGATE_THRESHOLD = 10; // above this many uncommitted files, aggregate by directory — see docs/design.md §4.4
const SUBJECT_MAX = 50; // truncation length for a single commit subject
const DRIFT_MIN = 5; // how many commits behind before it is worth warning — too sensitive and it degrades into background noise

// The single standing rule (ADR-012). The test is not "is it important", it is
// "at the moment of the mistake, does the AI know?" — when writing a fictional branch
// it does not, so probabilistic skill triggering cannot work and this has to be injected
// every session. Hold the line: before adding a second rule here, go re-read the
// Revisit When clause of ADR-012.
const STANDING_RULE = `## Standing constraint
Every branch, every check, every rule must name a concrete situation that will really happen.
Say the triggering situation out loud before writing an \`if\` — if you cannot, that branch is fiction.`;

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function git(args, cwd) {
  try {
    return execSync(`git ${args}`, {
      cwd,
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'], // discard stderr; a non-git directory should not spam the terminal
      // trimEnd, never trim: `git status --short` marks an unstaged edit with a LEADING
      // space (" M path"). Stripping it shifts the fixed-width status columns, and the
      // first file in the list loses a character — "docs/x" gets injected as "ocs/x".
    }).trimEnd();
  } catch {
    return null; // git missing / not a repo / command failed — all degrade to "this item could not be collected"
  }
}

function dirOf(file) {
  const i = file.lastIndexOf('/');
  return i === -1 ? './' : file.slice(0, i + 1);
}

// Uncommitted changes: list filenames when there are few, aggregate by directory when there are many.
// Aggregation is not only about size — 47 expanded lines would dilute the project identity
// sitting right next to them (§2.4, reason one).
function summarizeStatus(porcelain) {
  const files = porcelain
    .split('\n')
    .filter(Boolean)
    // Strip the XY status columns by shape, not by offset: a caller that trimmed the
    // input would otherwise silently eat the first character of the first path.
    .map((l) => l.replace(/^\s*\S{1,2}\s+/, '').trim().replace(/^"|"$/g, ''))
    .map((f) => (f.includes(' -> ') ? f.split(' -> ')[1] : f)); // renames take the new path
  if (files.length === 0) return null;
  const noun = files.length === 1 ? 'file' : 'files';
  if (files.length < AGGREGATE_THRESHOLD) {
    return `${files.length} ${noun} — ${files.join(', ')}`;
  }
  const byDir = new Map();
  for (const f of files) byDir.set(dirOf(f), (byDir.get(dirOf(f)) || 0) + 1);
  const top = [...byDir.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([d, n]) => `${d}(${n})`)
    .join(' ');
  return `${files.length} ${noun} — ${top}`;
}

function summarizeDirs(nameList) {
  const dirs = [...new Set(nameList.split('\n').filter(Boolean).map(dirOf))];
  return dirs.slice(0, 8).join(', ') + (dirs.length > 8 ? ` and ${dirs.length - 8} more` : '');
}

// Stack: report the ecosystem and runtime version only.
// "Which dependency counts as the key framework" is a judgement call and cannot be derived —
// that part is left for context.md to state by hand (ADR-006, Trade-off).
function detectStack(root) {
  const out = [];
  const read = (f) => {
    try {
      return fs.readFileSync(path.join(root, f), 'utf8');
    } catch {
      return null;
    }
  };

  const pkgRaw = read('package.json');
  if (pkgRaw) {
    try {
      const pkg = JSON.parse(pkgRaw);
      let s = 'Node.js';
      if (pkg.engines && pkg.engines.node) s += ` ${pkg.engines.node}`;
      if (pkg.packageManager) s += ` · ${pkg.packageManager}`;
      out.push(s);
    } catch {
      out.push('Node.js');
    }
  }

  const goMod = read('go.mod');
  if (goMod) {
    const m = goMod.match(/^go\s+([\d.]+)/m);
    out.push('Go' + (m ? ` ${m[1]}` : ''));
  }

  if (read('Cargo.toml')) out.push('Rust');

  const py = read('pyproject.toml');
  if (py) {
    const m = py.match(/requires-python\s*=\s*"([^"]+)"/);
    out.push('Python' + (m ? ` ${m[1]}` : ''));
  } else if (read('requirements.txt')) {
    out.push('Python');
  }

  return out.length ? out.join(' · ') : null;
}

function markdownIn(root, dir) {
  try {
    return fs
      .readdirSync(path.join(root, dir), { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => e.name.slice(0, -3))
      .sort();
  } catch {
    return []; // directory absent — the normal state until the first task or plan exists
  }
}

// Active tasks are read off docs/tasks/, never hand-written into context.md: a hand-kept
// table is a second copy of the directory listing, and the copy is the one that drifts —
// a task file created but never registered was invisible to every session of its life.
function activeTasks(root) {
  return markdownIn(root, 'docs/tasks');
}

// The docs/ layout groundwork prescribes is knowledge of the package, so no project
// needs to restate it in its own files. But list only what actually exists — an empty
// template is noise, and a pointer to a missing file is worse. A directory counts as
// existing only once it holds a document: git does not track empty directories, so an
// empty one exists on this machine and nowhere else.
function docPointers(root) {
  const out = [];
  const file = (p, label) => {
    if (fs.existsSync(path.join(root, p))) out.push(`${label} → ${p}`);
  };
  file('docs/roadmap.md', 'how it got here');
  file('docs/design.md', 'design');
  file('docs/devlog.md', 'rationale');
  const plans = markdownIn(root, 'docs/plans').length;
  if (plans) out.push(`under discussion → docs/plans (${plans})`);
  if (markdownIn(root, 'docs/archive').length) out.push('completed → docs/archive');
  return out.length ? out.join(' | ') : null;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function build(root) {
  const ctxPath = path.join(root, 'docs', 'context.md');
  if (!fs.existsSync(ctxPath)) return null; // not onboarded → silence

  const ctx = fs.readFileSync(ctxPath, 'utf8').trim();
  if (!ctx) return null;

  const parts = [ctx];

  const auto = [];
  const branch = git('branch --show-current', root);
  if (branch) auto.push(`branch: ${branch}`);

  // -uall: untracked directories collapse to a single line by default (`?? src/`),
  // and without expanding them the file count is badly wrong
  const status = git('status --short -uall', root);
  if (status !== null) auto.push(`uncommitted: ${summarizeStatus(status) || 'none'}`);

  const tasks = activeTasks(root);
  if (tasks.length) auto.push('active tasks (docs/tasks/):\n' + tasks.map((t) => '  ' + t).join('\n'));

  const stack = detectStack(root);
  if (stack) auto.push(`stack: ${stack}`);

  const log = git('log --oneline -10', root);
  if (log) {
    // Truncate each subject: what gets injected is the shape of "what happened lately",
    // not the full messages. Ten untruncated subjects would take half a screen — exactly
    // the attention dilution described in §2.4.
    const lines = log.split('\n').map((l) => '  ' + truncate(l, SUBJECT_MAX));
    auto.push('recent commits:\n' + lines.join('\n'));
  }

  if (auto.length) parts.push(`## Auto-collected (groundwork · ${stamp()})\n${auto.join('\n')}`);

  // Drift detection: don't just say "possibly stale", locate it to specific directories
  // so the AI can judge for itself which parts are untrustworthy.
  // The baseline is the last commit that touched context.md, read from git — not a hash
  // written into the file. A written hash names the commit that contains it, so amend,
  // rebase or a squash merge replaces the very commit it points at; once that commit is
  // gone (a fresh clone, or after gc) the lookup fails and the warning switches off
  // without a word. The last commit touching the file cannot be rewritten out from under it.
  const base = git('log -1 --format=%h -- docs/context.md', root);
  if (base) {
    const behind = git(`rev-list --count ${base}..HEAD`, root);
    if (behind && Number(behind) >= DRIFT_MIN) {
      const names = git(`diff --name-only ${base} HEAD`, root);
      const dirs = names ? summarizeDirs(names) : '';
      parts.push(
        `## ⚠ context.md may be stale\n${behind} commits behind` +
          (dirs ? `, directories changed since: ${dirs}` : '')
      );
    }
  }

  // Knowledge of the package, not of the project — hard-coded here so project files
  // never repeat it (§4.2). List only what exists: init does not pre-create design.md
  // or devlog.md, and pointing at a missing file sends the AI on a wasted trip.
  const pointers = docPointers(root);
  if (pointers) parts.push(`## Where the docs are\n${pointers}`);

  // Unconditional — git down, no docs at all, this one still has to be present
  // (reasoning above STANDING_RULE).
  parts.push(STANDING_RULE);

  return `<groundwork-context>\n${parts.join('\n\n')}\n</groundwork-context>\n`;
}

if (require.main === module) {
  try {
    const cwd = process.cwd();
    const root = git('rev-parse --show-toplevel', cwd) || cwd;
    const out = build(root);
    if (out) process.stdout.write(out);
  } catch {
    // Silence. The worst outcome of a broken hook must be "no injection this time",
    // never "the user cannot start a session".
  }
} else {
  module.exports = { summarizeStatus, summarizeDirs, truncate, detectStack, activeTasks, docPointers, build, STANDING_RULE };
}
