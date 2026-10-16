#!/usr/bin/env node
// groundwork —— SessionStart 注入 hook
//
// 唯一的判断：<git 根目录>/docs/context.md 存在吗？
//   存在 → 注入「手写的事实 ＋ 自动采集的 git 状态」
//   不存在 → 完全静默（项目没建档；不提示、不打扰）
//
// 硬约束：注入是增益，不是前置条件。所有错误路径都必须静默。hook 坏了，
// 最多让这次会话少了注入，绝不能让会话开不起来。

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const AGGREGATE_THRESHOLD = 10; // 未提交的文件超过这个数，按目录聚合——见 docs/design.md §4.4
const SUBJECT_MAX = 50; // 单条提交主题的截断长度
const DRIFT_MIN = 5; // 落后多少个提交才值得警告——太灵敏会退化成背景噪音

// 唯一一条常驻规则（ADR-012）。判据不是「它重不重要」，而是「犯错的那一刻，
// AI 自己知道吗」——写一个虚构的分支时它不知道，所以靠概率触发的 skill 没用，
// 只能每次会话都注入。守住门槛：在这里加第二条规则之前，先重读 ADR-012 的何时重审。
const STANDING_RULE = `## 常驻约束
每个分支、每条检查、每条规则，都要说得出一个真会发生的具体场景。
写 \`if\` 之前，先把触发它的场景说出来——说不出来，这个分支就是虚构的。`;

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function git(args, cwd) {
  try {
    // core.quotepath=false：默认情况下 git 会把中文文件名印成 "\347\262\276…" 这样的
    // 八进制转义，注入里就成了一串转义码（2026-10-16 实测）。
    return execSync(`git -c core.quotepath=false ${args}`, {
      cwd,
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'], // 丢掉 stderr；非 git 目录不该往终端里刷错误
      // 只 trimEnd，绝不 trim：`git status --short` 用行首空格标记未暂存的修改
      // （" M path"）。把它削掉，固定宽度的状态列就错位，列表里第一个文件会少一个字符——
      // "docs/x" 被注入成 "ocs/x"。
    }).trimEnd();
  } catch {
    return null; // 没装 git、不是仓库、命令失败——都降级为「这一项采集不到」
  }
}

function dirOf(file) {
  const i = file.lastIndexOf('/');
  return i === -1 ? './' : file.slice(0, i + 1);
}

// 未提交的改动：文件少就列文件名，文件多就按目录聚合。
// 聚合不只是为了省体积——展开的 47 行会稀释掉旁边真正重要的项目定位（§2.4 理由一）。
function summarizeStatus(porcelain) {
  const files = porcelain
    .split('\n')
    .filter(Boolean)
    // 按形状剥掉 XY 状态列，不按偏移量：调用方如果 trim 过输入，按偏移量剥会悄悄
    // 吃掉第一个路径的第一个字符。
    .map((l) => l.replace(/^\s*\S{1,2}\s+/, '').trim().replace(/^"|"$/g, ''))
    .map((f) => (f.includes(' -> ') ? f.split(' -> ')[1] : f)); // 改名的取新路径
  if (files.length === 0) return null;
  if (files.length < AGGREGATE_THRESHOLD) {
    return `${files.length} 个文件 — ${files.join('、')}`;
  }
  const byDir = new Map();
  for (const f of files) byDir.set(dirOf(f), (byDir.get(dirOf(f)) || 0) + 1);
  const top = [...byDir.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([d, n]) => `${d}(${n})`)
    .join(' ');
  return `${files.length} 个文件 — ${top}`;
}

function summarizeDirs(nameList) {
  const dirs = [...new Set(nameList.split('\n').filter(Boolean).map(dirOf))];
  return dirs.slice(0, 8).join('、') + (dirs.length > 8 ? `，另有 ${dirs.length - 8} 个目录` : '');
}

// 技术栈：只报生态和运行时版本。
// 「哪个依赖算关键框架」是判断，推导不出来——那部分留给 context.md 手写（ADR-006 的代价）。
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
    return []; // 目录不存在——第一份待办或话题出现之前，这是常态
  }
}

// 每份待办最后一次被提交的时间，一条 git 命令取完：log 从新到旧，
// 每个文件第一次出现的那个时间就是它最后一次被改动的时间。
function lastTouched(root) {
  const log = git('log --format=@%ct --name-only -- docs/tasks', root);
  if (log === null) return null;
  const seen = new Map();
  let ct = null;
  for (const line of log.split('\n')) {
    if (line.startsWith('@')) ct = Number(line.slice(1));
    else if (line && ct !== null && !seen.has(line)) seen.set(line, ct);
  }
  return seen;
}

// 待办从 docs/tasks/ 读出来，绝不手写进 context.md：手抄的表是目录列表的第二份拷贝，
// 漂移的永远是拷贝——建了却忘了登记的任务，整个生命周期对每个会话都隐形。
// 文件名以序号开头，排序就是开工顺序。后面标出多久没动：停下的待办不会自己离开
// 这个目录，天数让它在注入里自己露出来，不靠谁记得挪走它。
function pendingTasks(root, now = Date.now()) {
  const names = markdownIn(root, 'docs/tasks');
  if (!names.length) return [];
  const touched = lastTouched(root);
  return names.map((name) => {
    if (touched === null) return name; // 不是 git 仓库：只列名字，不猜天数
    const ct = touched.get(`docs/tasks/${name}.md`);
    if (ct === undefined) return `${name}（未提交）`;
    const days = Math.floor((now / 1000 - ct) / 86400);
    return `${name}（${days <= 0 ? '今天动过' : `${days} 天没动`}）`;
  });
}

// groundwork 规定的 docs/ 布局是包的知识，项目自己的文件不必重复。但只列真实存在的——
// 空模板是噪音，指向不存在的文件更糟。目录里至少有一份文档才算存在：git 不跟踪空目录，
// 空目录只在这台机器上有，别处没有。
function docPointers(root) {
  const out = [];
  const file = (p, label) => {
    if (fs.existsSync(path.join(root, p))) out.push(`${label} → ${p}`);
  };
  file('docs/roadmap.md', '阶段');
  file('docs/design.md', '设计');
  file('docs/devlog.md', '决策理由');
  const plans = markdownIn(root, 'docs/plans');
  if (plans.length) {
    // 话题文件名以决策层级开头（0～7），最小的就是现在该定的那一层。
    // 只认带层级前缀的，别的文件名不拿来当「最靠前」。
    const first = plans.find((p) => /^[0-7]-/.test(p));
    out.push(`待讨论 → docs/plans（${plans.length} 个${first ? `，最靠前：${first}` : ''}）`);
  }
  if (markdownIn(root, 'docs/archive').length) out.push('已完成任务的背景 → docs/archive');
  return out.length ? out.join(' | ') : null;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function build(root) {
  const ctxPath = path.join(root, 'docs', 'context.md');
  if (!fs.existsSync(ctxPath)) return null; // 没建档 → 静默

  const ctx = fs.readFileSync(ctxPath, 'utf8').trim();
  if (!ctx) return null;

  const parts = [ctx];

  const auto = [];
  const branch = git('branch --show-current', root);
  if (branch) auto.push(`分支：${branch}`);

  // -uall：未跟踪的目录默认会折叠成一行（`?? src/`），不展开的话文件数会错得离谱
  const status = git('status --short -uall', root);
  if (status !== null) auto.push(`未提交：${summarizeStatus(status) || '无'}`);

  const tasks = pendingTasks(root);
  if (tasks.length) auto.push('待办（按顺序）：\n' + tasks.map((t) => '  ' + t).join('\n'));

  const stack = detectStack(root);
  if (stack) auto.push(`技术栈：${stack}`);

  const log = git('log --oneline -10', root);
  if (log) {
    // 每条主题都截断：注入的是「最近发生了什么」的轮廓，不是完整的 message。
    // 十条不截断的主题会占半屏——正是 §2.4 说的注意力稀释。
    const lines = log.split('\n').map((l) => '  ' + truncate(l, SUBJECT_MAX));
    auto.push('最近提交：\n' + lines.join('\n'));
  }

  if (auto.length) parts.push(`## 自动采集（groundwork · ${stamp()}）\n${auto.join('\n')}`);

  // 漂移检测：不只说「可能过期」，要定位到具体目录，让 AI 自己判断哪部分不可信。
  // 基线是最后一次改动 context.md 的 commit，从 git 读——不是写进文件的 hash。
  // 写进去的 hash 指向包含它的那个 commit，amend、rebase、squash 换掉的正是它；
  // 那个 commit 一旦找不到（新 clone、gc 之后），查询失败，警告就悄无声息地关掉了。
  // 「最后一次改动这个文件的 commit」不会被换掉。
  const base = git('log -1 --format=%h -- docs/context.md', root);
  if (base) {
    const behind = git(`rev-list --count ${base}..HEAD`, root);
    if (behind && Number(behind) >= DRIFT_MIN) {
      const names = git(`diff --name-only ${base} HEAD`, root);
      const dirs = names ? summarizeDirs(names) : '';
      parts.push(
        `## ⚠ context.md 可能过期\n落后 ${behind} 个提交` + (dirs ? `，期间变动的目录：${dirs}` : '')
      );
    }
  }

  // 包的知识，不是项目的知识——写死在这里，项目文件就不必重复（§4.2）。只列存在的：
  // 建档不预建 design.md、devlog.md，指向不存在的文件会让 AI 白跑一趟。
  const pointers = docPointers(root);
  if (pointers) parts.push(`## 文档在哪\n${pointers}`);

  // 无条件出现——git 不可用、一份文档都没有，这一条也必须在（理由见 STANDING_RULE 上方）。
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
    // 静默。hook 坏掉的最坏结果必须是「这次没注入」，绝不能是「用户开不了会话」。
  }
} else {
  module.exports = { summarizeStatus, summarizeDirs, truncate, detectStack, pendingTasks, docPointers, build, STANDING_RULE };
}
