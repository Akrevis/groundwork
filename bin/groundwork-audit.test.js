#!/usr/bin/env node
// groundwork audit self-check — `node bin/groundwork-audit.test.js`
// No framework, no fixtures. Same shape as hooks/inject-context.test.js.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { audit } = require('./groundwork-audit');

let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log(`  ok ${name}`);
};

// ---------- fixture helpers ----------

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gw-audit-'));

const write = (root, rel, body) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
};

const find = (results, id) => results.find((r) => r.id === id);
const findings = (root, id) => find(audit(root), id).findings;

const gitRepo = (root) => {
  const run = (args) => execSync(`git ${args}`, { cwd: root, stdio: 'ignore' });
  run('init -q');
  run('-c user.name=t -c user.email=t@example.com commit -q --allow-empty -m seed');
  return execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim();
};

const clean = (root) => fs.rmSync(root, { recursive: true, force: true });

// ---------- skip behaviour ----------
// A skipped check must say why. Silence about what was not checked is how an all-clear
// turns into false confidence.

t('an empty directory skips every check and gives a reason for each', () => {
  const root = tmp();
  const results = audit(root);
  const skipped = results.filter((r) => r.status === 'skipped');
  assert.strictEqual(skipped.length, results.length);
  for (const r of skipped) assert.ok(r.reason && r.reason.length > 0, `${r.id} skipped without a reason`);
  clean(root);
});

// ---------- frontmatter that voids itself ----------
// The failure this catches is silent by construction: nothing errors, the skill just
// loads with no fields at all.

t('skill-frontmatter flags an unquoted value containing a colon-space', () => {
  const root = tmp();
  write(root, 'skills/broken/SKILL.md', '---\nname: broken\ndescription: fires when X happens: editing a file\n---\n\nbody\n');
  const out = findings(root, 'skill-frontmatter');
  assert.strictEqual(out.length, 1);
  assert.match(out[0], /description/);
  clean(root);
});

t('skill-frontmatter accepts the same value once quoted', () => {
  const root = tmp();
  write(root, 'skills/ok/SKILL.md', '---\nname: ok\ndescription: "fires when X happens: editing a file"\n---\n\nbody\n');
  assert.deepStrictEqual(findings(root, 'skill-frontmatter'), []);
  clean(root);
});

t('skill-frontmatter flags a skill with no frontmatter at all', () => {
  const root = tmp();
  write(root, 'skills/bare/SKILL.md', '# just a heading\n');
  const out = findings(root, 'skill-frontmatter');
  assert.strictEqual(out.length, 1);
  assert.match(out[0], /no frontmatter/);
  clean(root);
});

// ---------- dead links ----------

t('dead-links flags a referenced file that does not exist', () => {
  const root = tmp();
  write(root, 'docs/context.md', '# c\n\nsee `docs/nope.md`\n');
  const out = findings(root, 'dead-links');
  assert.strictEqual(out.length, 1);
  assert.match(out[0], /docs\/nope\.md/);
  clean(root);
});

t('dead-links stays quiet when the file is there', () => {
  const root = tmp();
  write(root, 'docs/context.md', '# c\n\nsee `docs/design.md`\n');
  write(root, 'docs/design.md', '# d\n');
  assert.deepStrictEqual(findings(root, 'dead-links'), []);
  clean(root);
});

// ---------- docs/ files git does not have ----------
// The ignored case is the one that bites in silence: `git add -A` skips the file, the
// commit reports success, and the document exists on one machine only.

t('docs-untracked flags an ignored file and an uncommitted one, and passes a committed one', () => {
  const root = tmp();
  gitRepo(root);
  write(root, '.gitignore', 'docs/secret.md\n');
  write(root, 'docs/kept.md', '# kept\n');
  execSync('git add -A', { cwd: root, stdio: 'ignore' });
  execSync('git -c user.name=t -c user.email=t@example.com commit -q -m kept', { cwd: root, stdio: 'ignore' });
  write(root, 'docs/secret.md', '# ignored\n');
  write(root, 'docs/tasks/2026-01-01-new.md', '# not yet committed\n');
  const out = findings(root, 'docs-untracked');
  assert.strictEqual(out.length, 2, out.join('|'));
  assert.ok(out.some((f) => /docs\/secret\.md is ignored/.test(f)), out.join('|'));
  assert.ok(out.some((f) => /docs\/tasks\/2026-01-01-new\.md is not committed/.test(f)), out.join('|'));
  assert.ok(!out.some((f) => /kept\.md/.test(f)));
  clean(root);
});

t('docs-untracked skips outside a git repo', () => {
  const root = tmp();
  write(root, 'docs/context.md', '# c\n');
  assert.strictEqual(find(audit(root), 'docs-untracked').status, 'skipped');
  clean(root);
});

// ---------- ADR numbering ----------

t('adr-numbering flags a gap', () => {
  const root = tmp();
  write(root, 'docs/devlog.md', '## ADR-001 · a\n\n## ADR-003 · c\n');
  const out = findings(root, 'adr-numbering');
  assert.strictEqual(out.length, 1);
  assert.match(out[0], /ADR-003/);
  clean(root);
});

// ---------- translations, both directions ----------
// The reverse direction is the one the shell version never had: a new skill with no
// translation was invisible.

t('translations flags a skill that has no translation', () => {
  const root = tmp();
  write(root, 'skills/alpha/SKILL.md', '## one\n');
  write(root, 'skills/beta/SKILL.md', '## one\n');
  write(root, 'docs/skills-zh/alpha.md', '## 一\n');
  const out = findings(root, 'translations');
  assert.strictEqual(out.length, 1);
  assert.match(out[0], /skills\/beta\/SKILL\.md/);
  clean(root);
});

t('translations flags an orphan translation', () => {
  const root = tmp();
  write(root, 'skills/alpha/SKILL.md', '## one\n');
  write(root, 'docs/skills-zh/alpha.md', '## 一\n');
  write(root, 'docs/skills-zh/gone.md', '## 没了\n');
  const out = findings(root, 'translations');
  assert.strictEqual(out.length, 1);
  assert.match(out[0], /orphan translation.*gone\.md/);
  clean(root);
});

t('translations flags structural drift on a pair that exists', () => {
  const root = tmp();
  write(root, 'skills/alpha/SKILL.md', '## one\n## two\n');
  write(root, 'docs/skills-zh/alpha.md', '## 一\n');
  const out = findings(root, 'translations');
  assert.strictEqual(out.length, 1);
  assert.match(out[0], /en=2 zh=1/);
  clean(root);
});

// ---------- roadmap ----------

t('roadmap-archived flags an archived task that never reached the roadmap', () => {
  const root = tmp();
  write(root, 'docs/roadmap.md', '# r\n\n- settled X: `archive/2026-01-01-listed.md`\n');
  write(root, 'docs/archive/2026-01-01-listed.md', '# listed\n');
  write(root, 'docs/archive/2026-01-02-done.md', '# done\n');
  const out = findings(root, 'roadmap-archived');
  assert.strictEqual(out.length, 1);
  assert.match(out[0], /docs\/archive\/2026-01-02-done\.md/);
  clean(root);
});

t('roadmap-pointers flags an ADR the devlog does not contain', () => {
  const root = tmp();
  write(root, 'docs/roadmap.md', '# r\n\nsettled by ADR-042\n');
  write(root, 'docs/devlog.md', '## ADR-001 · a\n');
  const out = findings(root, 'roadmap-pointers');
  assert.ok(out.some((f) => /ADR-042/.test(f)), out.join('|'));
  clean(root);
});

// ---------- commits: the regression that matters ----------
// `git cat-file -e <hash>^{commit}` looks correct and passes in a shell, but execSync on
// Windows goes through cmd.exe where `^` is the escape character — `^{commit}` becomes
// `{commit}` and every single hash reports missing. This test is why that is not silent.

t('devlog-commits does NOT flag a commit that really exists', () => {
  const root = tmp();
  const head = gitRepo(root);
  write(root, 'docs/devlog.md', `## ADR-001 · a\n\n**落地**：\`${head}\`\n`);
  assert.deepStrictEqual(findings(root, 'devlog-commits'), []);
  clean(root);
});

t('devlog-commits flags a hash that is not in the repo', () => {
  const root = tmp();
  gitRepo(root);
  write(root, 'docs/devlog.md', '## ADR-001 · a\n\n**落地**：`abcdef0`\n');
  const out = findings(root, 'devlog-commits');
  assert.strictEqual(out.length, 1);
  assert.match(out[0], /abcdef0/);
  clean(root);
});

t('devlog-commits judges nothing outside a git repo', () => {
  const root = tmp();
  write(root, 'docs/devlog.md', '## ADR-001 · a\n\n**落地**：`abcdef0`\n');
  assert.deepStrictEqual(findings(root, 'devlog-commits'), []);
  clean(root);
});

// ---------- placement ----------

t('context-handwritten flags a field the hook collects', () => {
  const root = tmp();
  write(root, 'docs/context.md', '# c\n\nbranch: main\n');
  const out = findings(root, 'context-handwritten');
  assert.strictEqual(out.length, 1);
  assert.match(out[0], /branch/);
  clean(root);
});

// Every context.md written before 2.0.0 carries both of these — they were contract then.
t('context-handwritten flags a pre-2.0 task table and header hash, in either language', () => {
  const root = tmp();
  write(
    root,
    'docs/context.md',
    '# c\n\n> 最后更新：2026-01-01 · commit 0c910cf\n\n## 当前活跃任务\n\n| 任务 | 状态 |\n\n## Active tasks\n'
  );
  const out = findings(root, 'context-handwritten');
  assert.strictEqual(out.length, 3, out.join('|'));
  assert.ok(out.some((f) => /line 3 hand-writes a baseline commit/.test(f)), out.join('|'));
  assert.strictEqual(out.filter((f) => /active task list/.test(f)).length, 2, out.join('|'));
  clean(root);
});

t('context-handwritten leaves a date-only header and other headings alone', () => {
  const root = tmp();
  write(root, 'docs/context.md', '# c\n\n> Last updated: 2026-01-01\n\n## What this is\nx\n\n## Structural gotchas\n- y\n');
  assert.deepStrictEqual(findings(root, 'context-handwritten'), []);
  clean(root);
});

// ---------- a throwing check must not report clean ----------

t('a check that throws is reported as errored, never as clean', () => {
  const { CHECKS } = require('./groundwork-audit');
  const victim = CHECKS.find((c) => c.id === 'dead-links');
  const original = victim.run;
  victim.run = () => {
    throw new Error('boom');
  };
  const root = tmp();
  write(root, 'docs/context.md', '# c\n');
  const r = find(audit(root), 'dead-links');
  assert.strictEqual(r.status, 'errored');
  assert.match(r.findings[0], /boom/);
  victim.run = original;
  clean(root);
});

console.log(`\n${n} checks passed`);
