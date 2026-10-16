#!/usr/bin/env node
// groundwork 体检自测 —— `node bin/groundwork-audit.test.js`
// 不用框架，不用夹具。和 hooks/inject-context.test.js 一个样子。

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

// ---------- 夹具辅助 ----------

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

// ---------- 跳过 ----------
// 跳过的检查必须说明原因。对没查的东西一声不吭，全绿就变成虚假的信心。

t('空目录跳过所有检查，每条都给出原因', () => {
  const root = tmp();
  const results = audit(root);
  const skipped = results.filter((r) => r.status === 'skipped');
  assert.strictEqual(skipped.length, results.length);
  for (const r of skipped) assert.ok(r.reason && r.reason.length > 0, `${r.id} 跳过了却没给原因`);
  clean(root);
});

// ---------- 会让自己作废的 frontmatter ----------
// 它抓的失败天生无声：什么都不报错，skill 只是加载时一个字段都没有。

t('skill-frontmatter 抓出没加引号、又含「: 」的值', () => {
  const root = tmp();
  write(root, 'skills/broken/SKILL.md', '---\nname: broken\ndescription: fires when X happens: editing a file\n---\n\nbody\n');
  const out = findings(root, 'skill-frontmatter');
  assert.strictEqual(out.length, 1);
  assert.match(out[0], /description/);
  clean(root);
});

t('同样的值加了引号就放行', () => {
  const root = tmp();
  write(root, 'skills/ok/SKILL.md', '---\nname: ok\ndescription: "fires when X happens: editing a file"\n---\n\nbody\n');
  assert.deepStrictEqual(findings(root, 'skill-frontmatter'), []);
  clean(root);
});

t('skill-frontmatter 抓出完全没有 frontmatter 的 skill', () => {
  const root = tmp();
  write(root, 'skills/bare/SKILL.md', '# 只有标题\n');
  const out = findings(root, 'skill-frontmatter');
  assert.strictEqual(out.length, 1);
  assert.match(out[0], /没有 frontmatter/);
  clean(root);
});

// ---------- 死链 ----------

t('dead-links 抓出引用了却不存在的文件', () => {
  const root = tmp();
  write(root, 'docs/context.md', '# c\n\n见 `docs/nope.md`\n');
  const out = findings(root, 'dead-links');
  assert.strictEqual(out.length, 1);
  assert.match(out[0], /docs\/nope\.md/);
  clean(root);
});

t('文件在就不报', () => {
  const root = tmp();
  write(root, 'docs/context.md', '# c\n\n见 `docs/design.md`\n');
  write(root, 'docs/design.md', '# d\n');
  assert.deepStrictEqual(findings(root, 'dead-links'), []);
  clean(root);
});

t('只写文件名的引用，按文件名在全仓库找', () => {
  const root = tmp();
  gitRepo(root);
  write(root, 'docs/context.md', '# c\n\n见 `owncc.md`、`context.md`、`待办.md`，还有 `gone.md`\n');
  write(root, 'output-styles/owncc.md', '# o\n');
  write(root, 'notes/深一层/待办.md', '# t\n');
  assert.deepStrictEqual(findings(root, 'dead-links'), ['context.md 指向一个不存在的文件：gone.md']);
  clean(root);
});

t('~/ 开头的路径在仓库外，不查', () => {
  const root = tmp();
  write(root, 'docs/context.md', '# c\n\n生效的副本在 `~/.claude/output-styles/owncc.md`\n');
  assert.deepStrictEqual(findings(root, 'dead-links'), []);
  clean(root);
});

// ---------- docs/ 下 git 没有的文件 ----------
// 被忽略的那种最无声：`git add -A` 跳过它，commit 报告成功，文件只在一台机器上有。

t('docs-untracked 抓出被忽略的和没提交的，放过已提交的', () => {
  const root = tmp();
  gitRepo(root);
  write(root, '.gitignore', 'docs/secret.md\n');
  write(root, 'docs/kept.md', '# kept\n');
  execSync('git add -A', { cwd: root, stdio: 'ignore' });
  execSync('git -c user.name=t -c user.email=t@example.com commit -q -m kept', { cwd: root, stdio: 'ignore' });
  write(root, 'docs/secret.md', '# 被忽略\n');
  write(root, 'docs/tasks/01-中文.md', '# 还没提交\n');
  const out = findings(root, 'docs-untracked');
  assert.strictEqual(out.length, 2, out.join('|'));
  assert.ok(out.some((f) => /docs\/secret\.md 被 git 忽略/.test(f)), out.join('|'));
  // 中文文件名原样出现，不是八进制转义
  assert.ok(out.some((f) => /docs\/tasks\/01-中文\.md 还没提交/.test(f)), out.join('|'));
  assert.ok(!out.some((f) => /kept\.md/.test(f)));
  clean(root);
});

t('不是 git 仓库时 docs-untracked 跳过', () => {
  const root = tmp();
  write(root, 'docs/context.md', '# c\n');
  assert.strictEqual(find(audit(root), 'docs-untracked').status, 'skipped');
  clean(root);
});

// ---------- ADR 编号 ----------
// 失效的 ADR 整条删掉，空号是正常的；重号和乱序才是错。

t('adr-numbering 放过空号', () => {
  const root = tmp();
  write(root, 'docs/devlog.md', '## ADR-001 · a\n\n## ADR-003 · c\n');
  assert.deepStrictEqual(findings(root, 'adr-numbering'), []);
  clean(root);
});

t('adr-numbering 抓出重号和乱序', () => {
  const root = tmp();
  write(root, 'docs/devlog.md', '## ADR-001 · a\n\n## ADR-004 · d\n\n## ADR-004 · d2\n\n## ADR-002 · b\n');
  const out = findings(root, 'adr-numbering');
  assert.strictEqual(out.length, 2, out.join('|'));
  assert.ok(out.some((f) => /ADR-004 出现了不止一次/.test(f)), out.join('|'));
  assert.ok(out.some((f) => /ADR-002 排在 ADR-004 后面/.test(f)), out.join('|'));
  clean(root);
});

// ---------- 悬空的 ADR 引用 ----------

t('adr-refs 抓出引用了已删 ADR 的文档，devlog 自己的引用不算', () => {
  const root = tmp();
  write(root, 'docs/devlog.md', '## ADR-003 · c\n\n取代 ADR-002（已删除，原文见 `abc1234`）\n');
  write(root, 'docs/design.md', '# d\n\n理由见 ADR-002，另见 ADR-003。\n');
  write(root, 'skills/x/SKILL.md', '---\nname: x\n---\n按 ADR-003。\n');
  const out = findings(root, 'adr-refs');
  assert.strictEqual(out.length, 1, out.join('|'));
  assert.match(out[0], /docs\/design\.md 引用了 ADR-002/);
  clean(root);
});

// ---------- 章节引用 ----------

t('section-refs 一级、二级节号都查', () => {
  const root = tmp();
  write(root, 'docs/design.md', '# d\n\n## 4. 架构\n\n### 4.2 契约\n\n## 8. 风险\n');
  write(root, 'docs/plans/7-x.md', '# x\n\n见 §4.2、§8 和 §7。\n');
  const out = findings(root, 'section-refs');
  assert.strictEqual(out.length, 1, out.join('|'));
  assert.match(out[0], /§7/);
  clean(root);
});

// ---------- commit：真正要紧的那次回归 ----------
// `git cat-file -e <hash>^{commit}` 看着没错、在 shell 里也能过，但 Windows 上 execSync 走
// cmd.exe，`^` 是转义符——`^{commit}` 变成 `{commit}`，每个 hash 都报不存在。有这条测试，
// 它才不会无声。

t('devlog-commits 不报真实存在的 commit', () => {
  const root = tmp();
  const head = gitRepo(root);
  write(root, 'docs/devlog.md', `## ADR-001 · a\n\n**落地**：\`${head}\`\n`);
  assert.deepStrictEqual(findings(root, 'devlog-commits'), []);
  clean(root);
});

t('devlog-commits 抓出仓库里没有的 hash', () => {
  const root = tmp();
  gitRepo(root);
  write(root, 'docs/devlog.md', '## ADR-001 · a\n\n**落地**：`abcdef0`\n');
  const out = findings(root, 'devlog-commits');
  assert.strictEqual(out.length, 1);
  assert.match(out[0], /abcdef0/);
  clean(root);
});

t('不是 git 仓库时 devlog-commits 什么都不判', () => {
  const root = tmp();
  write(root, 'docs/devlog.md', '## ADR-001 · a\n\n**落地**：`abcdef0`\n');
  assert.deepStrictEqual(findings(root, 'devlog-commits'), []);
  clean(root);
});

// ---------- 放的位置 ----------

t('context-handwritten 抓出 hook 会采集的字段，中英文都认', () => {
  const root = tmp();
  write(root, 'docs/context.md', '# c\n\nbranch: main\n分支：main\n');
  const out = findings(root, 'context-handwritten');
  assert.strictEqual(out.length, 2, out.join('|'));
  clean(root);
});

// 2.0.0 之前写的 context.md 都带着这两样——那时它们是契约。
t('context-handwritten 抓出老的任务表、待办节和头部 hash', () => {
  const root = tmp();
  write(
    root,
    'docs/context.md',
    '# c\n\n> 最后更新：2026-01-01 · commit 0c910cf\n\n## 当前活跃任务\n\n| 任务 | 状态 |\n\n## Active tasks\n\n## 待办\n'
  );
  const out = findings(root, 'context-handwritten');
  assert.strictEqual(out.length, 4, out.join('|'));
  assert.ok(out.some((f) => /第 3 行手写了基线 commit/.test(f)), out.join('|'));
  assert.strictEqual(out.filter((f) => /待办列表/.test(f)).length, 3, out.join('|'));
  clean(root);
});

t('只有日期的头部和别的标题不报', () => {
  const root = tmp();
  write(root, 'docs/context.md', '# c\n\n> 最后更新：2026-01-01\n\n## 是什么\nx\n\n## 结构性的坑\n- y\n');
  assert.deepStrictEqual(findings(root, 'context-handwritten'), []);
  clean(root);
});

t('misplaced-content 抓出 design.md 里的何时重审和 devlog 里的进度', () => {
  const root = tmp();
  write(root, 'docs/design.md', '# d\n\n**何时重审**：以后再说\n');
  write(root, 'docs/devlog.md', '## ADR-001 · a\n\n- 下一步：补测试\n');
  const out = findings(root, 'misplaced-content');
  assert.strictEqual(out.length, 2, out.join('|'));
  clean(root);
});

t('revisit-when 两种写法都列出来', () => {
  const root = tmp();
  write(root, 'docs/devlog.md', '## ADR-001 · a\n\n**何时重审**：用户变多时\n\n## ADR-002 · b\n\n**Revisit When**：never\n');
  const out = findings(root, 'revisit-when');
  assert.deepStrictEqual(out, ['ADR-001：用户变多时', 'ADR-002：never']);
  clean(root);
});

// ---------- 抛异常的检查不能报通过 ----------

t('抛异常的检查报告为出错，绝不算通过', () => {
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

console.log(`\n${n} 项检查通过`);
