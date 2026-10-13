#!/usr/bin/env node
// groundwork hook self-check — `node hooks/inject-context.test.js`
// No framework, no fixtures. Covers the branches that would actually fail if the logic broke.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { summarizeStatus, summarizeDirs, truncate, activeTasks, docPointers, build, STANDING_RULE } = require('./inject-context.js');

let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log(`  ok ${name}`);
};

// --- summarizeStatus: below the threshold, list filenames ---
t('few changes list filenames', () => {
  const out = summarizeStatus(' M src/a.js\n?? src/b.js');
  assert.strictEqual(out, '2 files — src/a.js, src/b.js');
});

// --- summarizeStatus: above the threshold, aggregate by directory ---
// This is the most regression-prone one: git status collapses untracked directories by
// default, so without -uall those 16 files count as 1 and aggregation never fires.
t('many changes aggregate by directory with correct counts', () => {
  const lines = [
    ...Array.from({ length: 8 }, (_, i) => `?? src/auth/a${i}.js`),
    ...Array.from({ length: 5 }, (_, i) => `?? src/pay/p${i}.js`),
    ...Array.from({ length: 3 }, (_, i) => `?? tests/t${i}.js`),
  ].join('\n');
  const out = summarizeStatus(lines);
  assert.match(out, /^16 files — /);
  assert.match(out, /src\/auth\/\(8\)/);
  assert.match(out, /src\/pay\/\(5\)/);
  assert.match(out, /tests\/\(3\)/);
});

t('renames take the new path, and a single file is singular', () => {
  assert.strictEqual(summarizeStatus('R  old/x.js -> new/y.js'), '1 file — new/y.js');
});

t('root-level files group under ./', () => {
  const lines = Array.from({ length: 12 }, (_, i) => `?? f${i}.js`).join('\n');
  assert.match(summarizeStatus(lines), /12 files — \.\/\(12\)/);
});

t('no changes returns null', () => {
  assert.strictEqual(summarizeStatus(''), null);
});

// --- summarizeDirs ---
t('drift directories are deduplicated', () => {
  assert.strictEqual(summarizeDirs('a/1.js\na/2.js\nb/3.js'), 'a/, b/');
});

// "and N more" counts what was left out, not the total. It used to print the total —
// ten directories came out as "d0/ … d7/ and 10 more", eighteen in all.
t('directories beyond the first eight are counted as the remainder', () => {
  const names = Array.from({ length: 10 }, (_, i) => `d${i}/f.js`).join('\n');
  assert.strictEqual(summarizeDirs(names), 'd0/, d1/, d2/, d3/, d4/, d5/, d6/, d7/ and 2 more');
});

// --- truncate ---
t('over-length input is truncated with an ellipsis', () => {
  assert.strictEqual(truncate('abcdef', 4), 'abc…');
  assert.strictEqual(truncate('abc', 4), 'abc');
});

// --- build: a project that is not onboarded must stay completely silent ---
// This is the §4.4 hard constraint: no context.md means do nothing, no prompt, no nagging.
t('no docs/context.md returns null', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-'));
  assert.strictEqual(build(dir), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

t('an empty context.md also returns null', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-'));
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.writeFileSync(path.join(dir, 'docs', 'context.md'), '   \n\n');
  assert.strictEqual(build(dir), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

t('output is wrapped in the tag when context.md exists', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-'));
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.writeFileSync(path.join(dir, 'docs', 'context.md'), '# T\n\n## What this is\ntest.\n');
  const out = build(dir);
  assert.match(out, /^<groundwork-context>\n/);
  assert.match(out, /<\/groundwork-context>\n$/);
  assert.doesNotMatch(out, /## Where the docs are/); // with only context.md and no other docs, that section must not appear
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- summarizeStatus: the caller may hand it a trimmed string ---
// An unstaged edit is marked with a LEADING space (" M path"). Any caller that trims the
// porcelain shifts the status columns by one, and an offset-based parse then eats the
// first character of the first path. The earlier tests all fed ideal porcelain straight
// in, so nothing covered the string the hook actually receives.
t('the first path survives whether or not the input was trimmed', () => {
  const raw = ' M docs/context.md\n M docs/design.md';
  const want = '2 files — docs/context.md, docs/design.md';
  assert.strictEqual(summarizeStatus(raw), want);
  assert.strictEqual(summarizeStatus(raw.trim()), want);
});

t('every porcelain status shape yields the path, not part of it', () => {
  const out = summarizeStatus('?? a.js\nMM b.js\n M c.js\nA  d.js\nR  old.js -> e.js');
  assert.strictEqual(out, '5 files — a.js, b.js, c.js, d.js, e.js');
});

// --- docPointers: list only files that actually exist ---
// init does not pre-create design.md or devlog.md, and pointing at a missing file
// sends the AI on a wasted trip.
t('only existing docs are listed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-'));
  fs.mkdirSync(path.join(dir, 'docs', 'plans'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'plans', '2026-01-01-idea.md'), '# idea\n');
  fs.writeFileSync(path.join(dir, 'docs', 'devlog.md'), '# ADR\n');
  const out = docPointers(dir);
  assert.match(out, /rationale → docs\/devlog\.md/);
  assert.match(out, /under discussion → docs\/plans \(1\)/);
  assert.doesNotMatch(out, /design\.md/); // does not exist, must not be listed
  assert.doesNotMatch(out, /archive/); // does not exist, must not be listed
  fs.rmSync(dir, { recursive: true, force: true });
});

// An empty directory exists on this machine only — git does not track it, so a clone
// has no such directory. Pointing at it sends the AI to an empty room.
t('an empty plans/ or archive/ directory gets no pointer', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-'));
  fs.mkdirSync(path.join(dir, 'docs', 'plans'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs', 'archive'), { recursive: true });
  assert.strictEqual(docPointers(dir), null);
  fs.writeFileSync(path.join(dir, 'docs', 'archive', '2026-01-01-done.md'), '# done\n');
  assert.strictEqual(docPointers(dir), 'completed → docs/archive');
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- activeTasks: the list is read off the directory, never hand-kept ---
t('active tasks are the markdown files in docs/tasks/, sorted, without extension', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-'));
  assert.deepStrictEqual(activeTasks(dir), []); // no directory yet is the normal state
  fs.mkdirSync(path.join(dir, 'docs', 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'tasks', '2026-02-01-b.md'), '# b\n');
  fs.writeFileSync(path.join(dir, 'docs', 'tasks', '2026-01-01-a.md'), '# a\n');
  fs.writeFileSync(path.join(dir, 'docs', 'tasks', 'notes.txt'), 'not a task\n');
  assert.deepStrictEqual(activeTasks(dir), ['2026-01-01-a', '2026-02-01-b']);
  fs.writeFileSync(path.join(dir, 'docs', 'context.md'), '# T\n');
  assert.match(build(dir), /active tasks \(docs\/tasks\/\):\n {2}2026-01-01-a\n {2}2026-02-01-b/);
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- drift: the baseline comes from git, not from a hash written into the file ---
// A written hash is self-referential: amending the commit that holds it replaces the very
// commit it names. Once that commit is unreachable the old lookup failed and the warning
// went silent. The header below names exactly such a dead hash, and the warning must
// still fire, because the baseline is now the last commit that touched context.md.
const gitIn = (dir) => (args) =>
  execSync(`git -c user.name=t -c user.email=t@example.com ${args}`, { cwd: dir, stdio: 'ignore' });

t('drift is measured from the last commit that touched context.md', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-'));
  const git = gitIn(dir);
  git('init -q');
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.writeFileSync(path.join(dir, 'docs', 'context.md'), '# T\n\n> Last updated: 2026-01-01 · commit deadbee\n');
  git('add -A');
  git('commit -q -m ctx');
  for (let i = 0; i < 5; i++) {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', `f${i}.js`), `${i}\n`);
    git('add -A');
    git(`commit -q -m f${i}`);
  }
  const stale = build(dir);
  assert.match(stale, /## ⚠ context\.md may be stale\n5 commits behind, directories changed since: src\//);

  fs.writeFileSync(path.join(dir, 'docs', 'context.md'), '# T\n\n> Last updated: 2026-01-02\n');
  git('add -A');
  git('commit -q -m wrap');
  assert.doesNotMatch(build(dir), /may be stale/); // touching context.md resets the baseline
  fs.rmSync(dir, { recursive: true, force: true });
});

t('a context.md that was never committed has no baseline and no warning', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-'));
  const git = gitIn(dir);
  git('init -q');
  for (let i = 0; i < 6; i++) git(`commit -q --allow-empty -m e${i}`);
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.writeFileSync(path.join(dir, 'docs', 'context.md'), '# T\n');
  assert.doesNotMatch(build(dir), /may be stale/);
  fs.rmSync(dir, { recursive: true, force: true });
});

t('no docs at all returns null', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-'));
  assert.strictEqual(docPointers(dir), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- The standing rule appears unconditionally ---
// Where ADR-012 lands. The temp directory is not a git repo and has no docs files —
// in that fully degraded case the rule must still be present, otherwise it has decayed
// into conditional triggering, and the ADR-012 conclusion is precisely that conditional
// triggering does not work for errors the AI cannot perceive.
t('standing constraint is injected even when collection fully degrades', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-'));
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.writeFileSync(path.join(dir, 'docs', 'context.md'), '# T');
  const out = build(dir);
  assert.doesNotMatch(out, /## Auto-collected/); // precondition: not a git repo, so collection did degrade
  assert.ok(out.includes(STANDING_RULE), 'standing constraint missing');
  assert.match(out, /that branch is fiction/);
  fs.rmSync(dir, { recursive: true, force: true });
});

console.log(`\n${n} checks passed`);
