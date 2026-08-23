[English](README.md)

# groundwork

给 coding agent 用的 AI 开发规范包。治大型项目里的 AI 编码幻觉——**编造不存在的 API 和文件、改坏没读全的代码、失去对项目全局的把握**。

装上之后，每次会话开场，AI 拿到的第一段上下文是你项目的真实状态：

```
<groundwork-context>
# my-project · context

## 是什么
面向中小团队的排班系统。

## 结构性的坑
- 时区一律用 UTC 存，展示层才转——历史数据里混过本地时间，不要相信 created_at 的时区

## Auto-collected (groundwork · 2026-08-23 14:02)
branch: feat/shift-swap
uncommitted: 14 files — src/schedule/(9) src/api/(3) tests/(2)
stack: Node.js >=20 · pnpm@9
recent commits:
  a3f9c21 修复跨月排班的边界计算
  ...

## Where the docs are
architecture → docs/design.md | rationale → docs/devlog.md

## Standing constraint
Every branch, every check, every rule must name a concrete situation that will really
happen. Say the triggering situation out loud before writing an `if` — if you cannot,
that branch is fiction.
</groundwork-context>
```

注入的骨架是英文的，你 `context.md` 里写什么语言，它就原样注入什么语言。

**没有 `docs/context.md` 的项目完全静默**——不提示、不打扰。

## 为什么是强制注入，不是 skill

skill 的触发是概率性的：靠 description 匹配，模型自己判断这次要不要加载，没触发不会有任何提示。

而幻觉不是「某个时刻触发了某个条件」，是**持续性的信息缺失**。更关键的是：**幻觉发生的那一刻，AI 自己不知道自己在幻觉——这正是幻觉的定义。**

指望 skill 在「AI 快要编造了」的时刻被触发，是拿概率性机制去治一个模型自身感知不到的问题。所以第一层只能是 hook。

## 三层

| 层 | 机制 | 管什么 | 频率 |
|---|---|---|---|
| **一** | SessionStart hook | 项目定位、模块职责、git 状态开场就在上下文里 | 每次会话，强制 |
| **二** | `/groundwork:docs` | 建档、任务开张、会话收尾、一致性体检 | 你主动调 |
| **三** | 两个 skill ＋ 一个 command | 查证纪律、改动边界、模块边界判据 | 按场景 |

同一条规则放错层就会失效或变成负担：「先查项目现状」放第三层是废话（AI 不会在该查的时候想起要查）；「模块边界八条」放第一层是灾难（改个 typo 也被架构判据扫一遍）。

## 安装

```bash
claude plugin marketplace add Akrevis/groundwork
claude plugin install groundwork@groundwork
```

不需要改 `CLAUDE.md`，不需要改 `settings.json`。卸载就干净。

## 上手

在你的项目里跑：

```
/groundwork:docs init
```

它会问四件事（这个项目是什么、不做什么、目录职责、已知的坑），生成 `docs/context.md`。下次会话开场就能看到 `<groundwork-context>`。

之后：

| 命令 | 什么时候 |
|---|---|
| `/groundwork:docs task` | 接到一个新任务，动手之前 |
| `/groundwork:docs wrap` | 会话收尾，把这次的变化同步回文档 |
| `/groundwork:docs audit` | 定期体检，查文档和代码之间的漂移 |
| `/groundwork:module-boundaries` | 要设计新模块、定跨模块调用关系时 |

另外两个 skill（`verify-first`、`change-scope`）自动触发，不用调。

## 不做什么

- 不管**用户是否理解 AI 写的代码**——那是调试黑盒问题，需要真人复述配合
- 不管**跨项目的个人记忆**——本包只管项目级
- 不做**工具类能力**（文档转换、skill 管理等）
- 不依赖任何**其他插件**
- **不做代码质量评价**——评价类内容一律做成 command 由你主动要，不做成自动触发的 skill

## 注入内容为什么必须小

不是为了省 token。三条与窗口大小无关的理由：

1. **注意力稀释**——长上下文中段内容的召回率会显著下降。注入 500 行，真正关键的那 5 行反而被淹没
2. **维护成本**——越大的文件越没人维护，越不维护越过期
3. **过期的注入比根本没有更危险**——AI 会拿着错误信息自信地干活，而且不会怀疑，因为它是被强制注入的，看起来就是权威

所以 `docs/context.md` 只装两类东西：**git 推导不出的**，和 **AI 不知道自己缺的**。技术栈、分支、未提交改动、最近 commit 全部由 hook 自动采集，不许手写。

## License

MIT
