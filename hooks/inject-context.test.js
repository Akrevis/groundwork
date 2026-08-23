#!/usr/bin/env node
// groundwork hook self-check — `node hooks/inject-context.test.js`
// No framework, no fixtures. Covers the branches that would actually fail if the logic broke.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { summarizeStatus, summarizeDirs, truncate, docPointers, build, STANDING_RULE } = require('./inject-context.js');

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

// --- docPointers: list only files that actually exist ---
// init does not pre-create design.md or devlog.md, and pointing at a missing file
// sends the AI on a wasted trip.
t('only existing docs are listed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-'));
  fs.mkdirSync(path.join(dir, 'docs', 'plans'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'devlog.md'), '# ADR\n');
  const out = docPointers(dir);
  assert.match(out, /rationale → docs\/devlog\.md/);
  assert.match(out, /active plans → docs\/plans/);
  assert.doesNotMatch(out, /design\.md/); // does not exist, must not be listed
  assert.doesNotMatch(out, /archive/); // does not exist, must not be listed
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
