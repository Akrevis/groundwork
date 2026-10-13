[English](README.md)

# groundwork

给 coding agent 用的人机协作纪律包。治大型项目里的 AI 幻觉——**编造不存在的 API 和文件、改坏没读全的代码、失去对项目全局的把握**。

纪律是双向的：AI 断言之前先查证、只改任务要求的范围，而你把它自己推导不出来的事实交给它。这个包把两边都做成机制，而不是良好意愿。

装上之后，每次会话开场，AI 拿到的第一段上下文是你项目的真实状态：

```
<groundwork-context>
# my-project · context

## 是什么
面向中小团队的排班系统。

## 结构性的坑
- 时区一律用 UTC 存，展示层才转——历史数据里混过本地时间，不要相信 created_at 的时区

## Auto-collected (groundwork · 2026-10-11 14:02)
branch: feat/shift-swap
uncommitted: 14 files — src/schedule/(9) src/api/(3) tests/(2)
active tasks (docs/tasks/):
  2026-10-09-shift-swap
  2026-10-10-holiday-rules
stack: Node.js >=20 · pnpm@9
recent commits:
  a3f9c21 修复跨月排班的边界计算
  ...

## Where the docs are
design → docs/design.md | rationale → docs/devlog.md | under discussion → docs/plans (2)

## Standing constraint
Every branch, every check, every rule must name a concrete situation that will really
happen. Say the triggering situation out loud before writing an `if` — if you cannot,
that branch is fiction.
</groundwork-context>
```

注入的骨架是英文的，你 `context.md` 里写什么语言，它就原样注入什么语言。

**没有 `docs/context.md` 的项目不会有任何注入**——不提示、不打扰。两个自动触发的 skill 不带这个条件：它们是通用纪律，接没接入都一样在任何仓库里生效。

## 三层

| 层 | 机制 | 管什么 | 频率 |
|---|---|---|---|
| **一** | SessionStart hook | 项目定位、模块职责、活跃任务、git 状态开场就在上下文里 | 每次会话，强制 |
| **二** | `/groundwork:docs` | 建档、把决定变成任务、会话收尾、一致性体检 | 你主动调 |
| **三** | 两个 skill ＋ 一个 command | 查证纪律、改动边界、模块边界判据 | 按场景 |

同一条规则放错层就会失效或变成负担：「先查项目现状」放第三层是废话（AI 不会在该查的时候想起要查）；「模块边界八条」放第一层是灾难（改个 typo 也被架构判据扫一遍）。

**第一、二层只依赖 git 与 markdown**——`groundwork` 自己就是一个以文档为主的项目，跑的就是这两层。第三层是代码专属。

## 安装

```bash
claude plugin marketplace add Akrevis/groundwork
claude plugin install groundwork@groundwork
```

不需要改 `CLAUDE.md`，不需要改 `settings.json`。卸载就干净。

注入 hook 是一个 Node.js 脚本，所以 PATH 上要有 `node`——Claude Code 本身并不需要它。没有的话会话照常开始，但每次都会显示一条 hook error。

## 上手

在你的项目里跑：

```
/groundwork:docs init
```

它会问四件事（这个项目是什么、不做什么、目录职责、已知的坑），生成 `docs/context.md` 并提交。如果项目里已经有设计笔记或决策记录，它会先逐个问清每份该归到哪里，再动手。下次会话开场就能看到 `<groundwork-context>`。

之后：

| 命令 | 什么时候 |
|---|---|
| `/groundwork:docs task` | 一件工作定下来了，动手之前。它在 `docs/tasks/` 下写一份任务契约，另一个会话拿过去就能执行 |
| `/groundwork:docs wrap` | 会话收尾，把这次的变化同步回文档 |
| `/groundwork:docs audit` | 定期体检，查文档和代码之间的漂移 |
| `/groundwork:module-boundaries` | 要设计新模块、定跨模块调用关系时 |

`audit` 分两半。机械检查固化成了 **`groundwork-audit`**——插件会把它放进 PATH，在任何项目里都能直接跑：死链、被 git 忽略或从没提交过的文档、归档了 roadmap 却不知道的任务、译文与原文的结构漂移、文档引用了已经不存在的 commit。每条检查会报「通过」「有发现」或**「跳过并说明原因」**，报告末尾还列出它够不到的部分。需要判断的那半——文档描述的行为跟代码还对不对得上——由 command 带着你走。

另外两个 skill（`verify-first`、`change-scope`）自动触发，不用调。

## 工作怎么在 docs/ 里流转

```
docs/
├── context.md    每次会话注入
├── design.md     核心区（意图，很少改）＋ 阶段区（当前架构）
├── roadmap.md    项目怎么走到今天——只放指针
├── devlog.md     决策：有哪些方案、选了哪个、代价是什么
├── backlog.md    在这个项目里用 groundwork 时，groundwork 本身带来的摩擦
├── plans/        讨论中的话题
├── tasks/        已定案的工作，一个任务一份契约
└── archive/      已完成的任务
```

只有 `context.md` 是预先创建的。其余的都在第一次真有内容放进去时才出现——空模板是噪音，空目录也到不了任何别人的 clone 里。

一个话题从 `plans/` 开始，讨论期间一直留在那里。`task` 把定下来的话题变成 `tasks/` 里的一份契约：目标、边界、前提、可验证的完成标准，以及交接内容——依赖什么、要改哪些文件、和其他任务共用的文件的核心内容、执行的会话什么情况下必须回来问。合并之后，`wrap` 把它归档并登记进 roadmap。如果话题的结论是一个设计决定、而不是一件要做的事，就写进 `design.md`，同样离开 `plans/`。hook 自己读 `docs/tasks/`，所以任务从文件存在的那一刻起，每个会话都看得见。

**并行开发。** 几个任务同时跑时，每个任务一个 worktree。执行任务的会话只写代码和自己那份任务文件，别的一概不碰；共享文档只由 `/groundwork:docs` 写，只在主工作区写，在合并之后写。文档永远不冲突，要合并的只剩代码。

**提交。** docs 的各个命令会提交自己写的东西——按路径暂存，绝不 `git add -A`，从不 push，也绝不提交你手上本来就有改动在进行中的文件。

## 为什么是强制注入，不是 skill

skill 的触发是概率性的：靠 description 匹配，模型自己判断这次要不要加载，没触发不会有任何提示。

而幻觉不是「某个时刻触发了某个条件」，是**持续性的信息缺失**。更关键的是：**幻觉发生的那一刻，AI 自己不知道自己在幻觉——这正是幻觉的定义。**

指望 skill 在「AI 快要编造了」的时刻被触发，是拿概率性机制去治一个模型自身感知不到的问题。所以第一层只能是 hook。

## 注入内容为什么必须小

不是为了省 token。三条与窗口大小无关的理由：

1. **注意力稀释**——长上下文中段内容的召回率会显著下降。注入 500 行，真正关键的那 5 行反而被淹没
2. **维护成本**——越大的文件越没人维护，越不维护越过期
3. **过期的注入比根本没有更危险**——AI 会拿着错误信息自信地干活，而且不会怀疑，因为它是被强制注入的，看起来就是权威

所以 `docs/context.md` 里的每一条都要过三道检查：**git 推导不出**、**AI 不知道自己缺它**、**对任何 clone 这个仓库的人都成立**。技术栈、分支、未提交改动、最近 commit、活跃任务全部由 hook 自动采集，不许手写。没有行数限制；让这份文件保持小的，是这三道检查。

## 不做什么

界线：**管两侧的纪律——AI 输出什么、你喂给它什么——不管你自己脑子里的过程。**

- 不管**用户是否理解 AI 写的代码**——那要真人把代码复述回来，不是装上就生效的规则
- 不管**跨项目的个人记忆**——本包只管项目级
- 不做**工具类能力**（文档转换、skill 管理等）
- 不依赖任何**其他插件**
- **不做代码质量评价**——评价类内容一律做成 command 由你主动要，不做成自动触发的 skill

## License

MIT
