#!/usr/bin/env node
// groundwork hook 自测 —— `node hooks/inject-context.test.js`
// 不用框架，不用夹具。只测逻辑坏了就真会出错的那些分支。

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { summarizeStatus, summarizeDirs, truncate, pendingTasks, docPointers, build, STANDING_RULE } = require('./inject-context.js');

let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log(`  ok ${name}`);
};

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gw-'));
const write = (dir, rel, body) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), body);
};
// date 给定时，作者时间和提交时间都固定成它，天数才算得准
const gitIn = (dir, date) => (args) =>
  execSync(`git -c user.name=t -c user.email=t@example.com ${args}`, {
    cwd: dir,
    stdio: 'ignore',
    env: date ? { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : process.env,
  });

// --- summarizeStatus：低于阈值时列文件名 ---
t('改动少时列出文件名', () => {
  assert.strictEqual(summarizeStatus(' M src/a.js\n?? src/b.js'), '2 个文件 — src/a.js、src/b.js');
});

// --- summarizeStatus：超过阈值时按目录聚合 ---
// 最容易回归的一条：git status 默认折叠未跟踪的目录，不加 -uall 的话这 16 个文件
// 只算 1 个，聚合永远不会触发。
t('改动多时按目录聚合，计数正确', () => {
  const lines = [
    ...Array.from({ length: 8 }, (_, i) => `?? src/auth/a${i}.js`),
    ...Array.from({ length: 5 }, (_, i) => `?? src/pay/p${i}.js`),
    ...Array.from({ length: 3 }, (_, i) => `?? tests/t${i}.js`),
  ].join('\n');
  const out = summarizeStatus(lines);
  assert.match(out, /^16 个文件 — /);
  assert.match(out, /src\/auth\/\(8\)/);
  assert.match(out, /src\/pay\/\(5\)/);
  assert.match(out, /tests\/\(3\)/);
});

t('改名的取新路径', () => {
  assert.strictEqual(summarizeStatus('R  old/x.js -> new/y.js'), '1 个文件 — new/y.js');
});

t('根目录的文件归在 ./ 下', () => {
  const lines = Array.from({ length: 12 }, (_, i) => `?? f${i}.js`).join('\n');
  assert.match(summarizeStatus(lines), /12 个文件 — \.\/\(12\)/);
});

t('没有改动返回 null', () => {
  assert.strictEqual(summarizeStatus(''), null);
});

// --- summarizeStatus：调用方可能递来 trim 过的字符串 ---
// 未暂存的修改用行首空格标记（" M path"）。调用方一 trim，状态列就错一位，按偏移量
// 解析会吃掉第一个路径的第一个字符。早先的测试都直接喂理想的 porcelain，没有一条
// 覆盖 hook 实际收到的字符串。
t('输入 trim 没 trim，第一个路径都完整', () => {
  const raw = ' M docs/context.md\n M docs/design.md';
  const want = '2 个文件 — docs/context.md、docs/design.md';
  assert.strictEqual(summarizeStatus(raw), want);
  assert.strictEqual(summarizeStatus(raw.trim()), want);
});

t('每种 porcelain 状态都只取出路径', () => {
  const out = summarizeStatus('?? a.js\nMM b.js\n M c.js\nA  d.js\nR  old.js -> e.js');
  assert.strictEqual(out, '5 个文件 — a.js、b.js、c.js、d.js、e.js');
});

// --- summarizeDirs ---
t('漂移目录去重', () => {
  assert.strictEqual(summarizeDirs('a/1.js\na/2.js\nb/3.js'), 'a/、b/');
});

// 「另有 N 个」数的是没列出来的，不是总数。它曾经印的是总数——十个目录印成
// 「d0/ … d7/ 另有 10 个」，加起来十八个。
t('超过八个的目录，只数剩下的', () => {
  const names = Array.from({ length: 10 }, (_, i) => `d${i}/f.js`).join('\n');
  assert.strictEqual(summarizeDirs(names), 'd0/、d1/、d2/、d3/、d4/、d5/、d6/、d7/，另有 2 个目录');
});

// --- truncate ---
t('超长的截断并加省略号', () => {
  assert.strictEqual(truncate('abcdef', 4), 'abc…');
  assert.strictEqual(truncate('abc', 4), 'abc');
});

// --- build：没建档的项目必须完全静默 ---
// §4.4 的硬约束：没有 context.md 就什么都不做，不提示、不打扰。
t('没有 docs/context.md 返回 null', () => {
  const dir = tmp();
  assert.strictEqual(build(dir), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

t('context.md 是空的也返回 null', () => {
  const dir = tmp();
  write(dir, 'docs/context.md', '   \n\n');
  assert.strictEqual(build(dir), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

t('有 context.md 时输出包在标签里', () => {
  const dir = tmp();
  write(dir, 'docs/context.md', '# T\n\n## 是什么\n测试。\n');
  const out = build(dir);
  assert.match(out, /^<groundwork-context>\n/);
  assert.match(out, /<\/groundwork-context>\n$/);
  assert.doesNotMatch(out, /## 文档在哪/); // 只有 context.md、没有别的文档时，这一节不该出现
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- docPointers：只列真实存在的 ---
// 建档不预建 design.md、devlog.md，指向不存在的文件会让 AI 白跑一趟。
t('只列存在的文档', () => {
  const dir = tmp();
  write(dir, 'docs/plans/7-细节.md', '# 细节\n');
  write(dir, 'docs/devlog.md', '# ADR\n');
  const out = docPointers(dir);
  assert.match(out, /决策理由 → docs\/devlog\.md/);
  assert.doesNotMatch(out, /design\.md/);
  assert.doesNotMatch(out, /archive/);
  fs.rmSync(dir, { recursive: true, force: true });
});

// 话题文件名以层级开头，最小的就是现在该定的那一层；不带层级的不拿来当「最靠前」。
t('待讨论显示最靠前的层级话题', () => {
  const dir = tmp();
  write(dir, 'docs/plans/7-细节.md', '# 细节\n');
  write(dir, 'docs/plans/2-形态.md', '# 形态\n');
  write(dir, 'docs/plans/随手记.md', '# 没有层级\n');
  assert.match(docPointers(dir), /待讨论 → docs\/plans（3 个，最靠前：2-形态）/);
  fs.rmSync(dir, { recursive: true, force: true });
});

t('没有层级话题时只给个数', () => {
  const dir = tmp();
  write(dir, 'docs/plans/2026-01-01-idea.md', '# idea\n');
  assert.strictEqual(docPointers(dir), '待讨论 → docs/plans（1 个）');
  fs.rmSync(dir, { recursive: true, force: true });
});

// 空目录只在这台机器上存在——git 不跟踪它，clone 下来根本没有。指向它，AI 就走进空房间。
t('空的 plans/、archive/ 不给指针', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'docs', 'plans'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs', 'archive'), { recursive: true });
  assert.strictEqual(docPointers(dir), null);
  write(dir, 'docs/archive/2026-01-01-done.md', '# done\n');
  assert.strictEqual(docPointers(dir), '已完成任务的背景 → docs/archive');
  fs.rmSync(dir, { recursive: true, force: true });
});

t('一份文档都没有返回 null', () => {
  const dir = tmp();
  assert.strictEqual(docPointers(dir), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- pendingTasks：待办从目录读，按文件名排序，后面标多久没动 ---
t('不是 git 仓库时只列名字，按序号排，不带扩展名', () => {
  const dir = tmp();
  assert.deepStrictEqual(pendingTasks(dir), []); // 还没有目录是常态
  write(dir, 'docs/tasks/02-b.md', '# b\n');
  write(dir, 'docs/tasks/01-a.md', '# a\n');
  write(dir, 'docs/tasks/notes.txt', '不是待办\n');
  assert.deepStrictEqual(pendingTasks(dir), ['01-a', '02-b']);
  fs.rmSync(dir, { recursive: true, force: true });
});

// 停下的待办不会自己离开 tasks/。天数让它在注入里露出来，不靠谁记得挪走它。
t('待办后面标出多久没动、没提交的标未提交', () => {
  const dir = tmp();
  gitIn(dir)('init -q');
  write(dir, 'docs/tasks/01-a.md', '# a\n');
  gitIn(dir, '2026-01-01T00:00:00Z')('add -A');
  gitIn(dir, '2026-01-01T00:00:00Z')('commit -q -m a');
  write(dir, 'docs/tasks/02-b.md', '# b\n');
  gitIn(dir, '2026-01-09T00:00:00Z')('add -A');
  gitIn(dir, '2026-01-09T00:00:00Z')('commit -q -m b');
  write(dir, 'docs/tasks/03-c.md', '# c\n');
  const now = Date.parse('2026-01-11T00:00:00Z');
  assert.deepStrictEqual(pendingTasks(dir, now), ['01-a（10 天没动）', '02-b（2 天没动）', '03-c（未提交）']);
  assert.deepStrictEqual(pendingTasks(dir, Date.parse('2026-01-09T08:00:00Z')).slice(1, 2), ['02-b（今天动过）']);
  write(dir, 'docs/context.md', '# T\n');
  assert.match(build(dir), /待办（按顺序）：\n {2}01-a（\d+ 天没动）\n {2}02-b（\d+ 天没动）\n {2}03-c（未提交）/);
  fs.rmSync(dir, { recursive: true, force: true });
});

// git 默认把中文文件名印成八进制转义，注入里会变成一串 \347\262\276…
t('中文文件名原样注入，不变成转义码', () => {
  const dir = tmp();
  const git = gitIn(dir);
  git('init -q');
  write(dir, 'docs/context.md', '# T\n');
  write(dir, 'docs/tasks/01-精简.md', '# 精简\n');
  git('add -A');
  git('commit -q -m 开工');
  write(dir, 'docs/新文件.md', '新\n');
  const out = build(dir);
  assert.match(out, /未提交：1 个文件 — docs\/新文件\.md/);
  assert.match(out, / {2}01-精简（今天动过）/);
  assert.doesNotMatch(out, /\\\d{3}/);
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- 漂移：基线从 git 来，不从文件里写的 hash 来 ---
// 写进去的 hash 是自指的：amend 包含它的那个 commit，换掉的正是它指向的 commit。
// 那个 commit 一旦找不到，旧的查询就失败，警告悄无声息地关掉。下面的头部写的就是
// 这样一个死 hash，警告照样要出现，因为基线现在是最后一次改动 context.md 的 commit。
t('漂移从最后一次改动 context.md 的 commit 算起', () => {
  const dir = tmp();
  const git = gitIn(dir);
  git('init -q');
  write(dir, 'docs/context.md', '# T\n\n> 最后更新：2026-01-01 · commit deadbee\n');
  git('add -A');
  git('commit -q -m ctx');
  for (let i = 0; i < 5; i++) {
    write(dir, `src/f${i}.js`, `${i}\n`);
    git('add -A');
    git(`commit -q -m f${i}`);
  }
  assert.match(build(dir), /## ⚠ context\.md 可能过期\n落后 5 个提交，期间变动的目录：src\//);

  write(dir, 'docs/context.md', '# T\n\n> 最后更新：2026-01-02\n');
  git('add -A');
  git('commit -q -m wrap');
  assert.doesNotMatch(build(dir), /可能过期/); // 改动 context.md 就重置了基线
  fs.rmSync(dir, { recursive: true, force: true });
});

t('从没提交过的 context.md 没有基线，也不警告', () => {
  const dir = tmp();
  const git = gitIn(dir);
  git('init -q');
  for (let i = 0; i < 6; i++) git(`commit -q --allow-empty -m e${i}`);
  write(dir, 'docs/context.md', '# T\n');
  assert.doesNotMatch(build(dir), /可能过期/);
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- 常驻约束无条件出现 ---
// ADR-012 的落点。临时目录不是 git 仓库、也没有别的文档——在这种完全降级的情况下，
// 规则也必须在；否则它就退化成了条件触发，而 ADR-012 的结论正是：AI 感知不到的错误，
// 条件触发管不住。
t('采集完全降级时，常驻约束照样注入', () => {
  const dir = tmp();
  write(dir, 'docs/context.md', '# T');
  const out = build(dir);
  assert.doesNotMatch(out, /## 自动采集/); // 前提：不是 git 仓库，采集确实降级了
  assert.ok(out.includes(STANDING_RULE), '缺少常驻约束');
  assert.match(out, /这个分支就是虚构的/);
  fs.rmSync(dir, { recursive: true, force: true });
});

console.log(`\n${n} 项检查通过`);
