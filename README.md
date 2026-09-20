# Jerry Notes

基于 **Vue 3 + Vite** 的**个人知识库看板** —— 把踩过的坑、做过的决策、学过的东西
结构化记下来，再做成交互式的分析视图。

> **定位**
>
> 笔记以 Markdown 存在 `notes/` 目录里，构建期扫成一份 JSON，前端读它渲染成看板。
> 也可以点右上角**连接本地目录**，授权选一个本地文件夹直接读 —— 本地改完切回浏览器
> 就生效，不用重新部署。**笔记本身不需要联网，也不需要提交。**

> **参考来源**
>
> 功能与交互逻辑参考 [**write-notes-like-deepseek-demo**](https://czm15053.github.io/write-notes-like-deepseek-demo/)。
> **UI 风格**沿用 [jerry-site](https://jiepijiang.github.io/jerry-site/)（深色毛玻璃），
> 与工具导航站 [jerry-tools](https://jiepijiang.github.io/jerry-tools/) 同一套设计语言。

> **它和「笔记软件」的区别**
>
> 记笔记的软件已经够多了，这个站的着力点不在「写」，在**读**：
> 笔记写完之后能不能被翻出来、能不能看出哪几篇是地基、能不能一眼扫完当初为什么否决某个方案。
> 所以它默认按「状态 × 分类」组织，而不是按文件夹树。

---

## 快速开始

```bash
npm install
npm run dev      # 开发预览 http://127.0.0.1:5175
npm run build    # 产出 dist/
npm run preview  # 预览构建产物
```

**不用手动跑「生成数据」那一步** —— `dev` 和 `build` 前面挂了 npm 钩子
（`predev` / `prebuild`），会自动先扫一遍 `notes/`。
`npm run notes` 也可以单独跑，看它扫到了哪些文件：

```
✓ 21 篇笔记 → public/static/data/notes.json（原文 56.4 KB）
    implemented/architecture/2026-09-16-replicate-then-own.md
    ...
```

---

## 在线预览

推送到 `main` 分支后会自动构建并发布到 GitHub Pages（见 `.github/workflows/deploy.yml`）：

**https://jiepijiang.github.io/jerry-notes/**

几个和部署相关的点（与 jerry-site / jerry-tools 同一套写法）：

- 站点挂在 `/<仓库名>/` 子路径下，所以 `vite.config.js` 顶部的 `REPO_NAME` 必须和仓库名一致。
- 构建时会额外产出一份 `404.html`（内容同 `index.html`）。GitHub Pages 没有 SPA fallback，
  直接打开或刷新 `/jerry-notes/timeline` 时靠它回退，前端路由再接管。
  这种回退的 HTTP 状态码仍是 404，属于该方案的固有代价；站内点击链接是前端跳转，不受影响。
- 首次部署后如果页面 404，去仓库 **Settings → Pages** 确认 Source 选的是
  **GitHub Actions**（而不是 "Deploy from a branch"）。
- **不需要任何 secret。** 数据来自仓库里的 `notes/`，构建期本地生成，
  不像 jerry-site 那样要在 CI 里拉第三方接口。

---

## 目录结构

```
jerry-notes/
├── notes/                          ← 你的笔记（唯一的「内容源」）
│   ├── 2026-09-20-notes-convention.md
│   ├── implemented/architecture/*.md
│   ├── proposed/learning/*.md
│   └── rejected/feature/*.md
├── scripts/
│   └── gen-notes.mjs               ← 扫 notes/ → notes.json（构建期跑）
├── public/static/data/notes.json   ← 生成物，会被覆盖，别手改
├── src/
│   ├── lib/
│   │   ├── parse.js                ← 解析器（构建期 / 运行时共用，禁 Node 专有 API）
│   │   ├── markdown.js             ← 极简 Markdown 渲染（不引库）
│   │   ├── pitfalls.js             ← 从「备选方案」段萃取避坑条目
│   │   └── fsaccess.js             ← File System Access API 封装
│   ├── composables/
│   │   └── useLibrary.js           ← 模块级单例：数据源 / 索引 / 自动同步
│   ├── components/
│   │   ├── views/                  ← 四个视图
│   │   ├── NoteDrawer.vue          ← 详情抽屉
│   │   ├── GlobalSearch.vue        ← 全局搜索（/ 聚焦、↑↓、↵）
│   │   └── TopBar.vue              ← 顶栏 + 本地目录连接按钮
│   └── styles/                     ← 全局样式（root / base / markdown）
└── vite.config.js                  ← 顶部 REPO_NAME 是换仓库名唯一要改的地方
```

---

## 笔记怎么写

### 路径本身携带信息

不用每篇都写 frontmatter，目录摆对了就够：

```
notes/
  <状态>/<分类>/<日期>-<标题>.md     ← 完整写法，状态和分类都从路径读
  <分类>/<日期>-<标题>.md            ← 只写了分类，状态默认「随手记」
  <日期>-<标题>.md                   ← 都不写，状态「随手记」+ 分类「未分类」
```

**状态**：`implemented`（已落地）· `proposed`（待验证）· `rejected`（已否决）· `archived`（已归档）

**分类**：`architecture` · `feature` · `bug-fix` · `simplification` · `process` · `testing` · `learning`

分类不在这个列表里也没关系 —— frontmatter 里写什么就显示什么，看板的分类阵列会自动多出一格。
**不要为了迁就工具去改自己的分类习惯。**

### frontmatter 能覆盖什么

```yaml
---
title: 显示用的标题        # 不写就取正文第一个 # 标题，再不行用文件名
date: 2026-09-20          # 不写就取文件名前缀的日期，再不行用文件修改时间
status: implemented       # 覆盖路径推断
category: architecture    # 覆盖路径推断
tags: [Vue, 性能]         # 只在这里写
summary: 一句话摘要        # 只在这里写，用于卡片展示
---
```

### ADR 四段式 —— 「分析」能力的基础

有「问题 / 决策 / 曾考虑的替代方案 / 后果」四段的笔记，会额外进入**避坑智库**和**承重墙**：

```markdown
## 问题

共享出口 IP 触发 api.github.com 限流，首页那块只剩「取不到数据」。

## 决策

改成构建期生成，不在浏览器里直连第三方接口。

## 曾考虑的替代方案

- 加个后端代理 —— 否决，为了一个静态站点多维护一个服务不划算
- 前端加缓存 —— 搁置，解决不了首次访问

## 后果

数据滞后到下次构建，但访客永远能看见内容。
```

段落标题不用完全一样，`## 为什么` / `## 背景` 会归到「问题」，
`## 否决` / `## 为什么不选` 会归到「备选」。判定用的是**最长命中的别名**，
所以「曾考虑的替代方案」不会被「方案」抢先归成「决策」。

**归不了类的段落不会被丢掉** —— 会原样留在正文里，详情抽屉的「其他」区能看到。

### 交叉引用

正文里写 `[文字](另一篇的路径.md)`，看板会自动连起来，并统计**被引用次数**
（首页「承重墙」按它排序 —— 被引用最多的那几篇就是地基）。

```markdown
[同目录的笔记](2026-09-20-xxx.md)
[上一层的笔记](../feature/2026-09-20-yyy.md)
[从根开始的](implemented/architecture/2026-09-20-zzz.md)
```

**改名之后链接不会全断** —— 解析器依次尝试「相对当前文件」「从笔记根」「按文件名匹配」，
只要文件名没变就还能连上。外链（带 `://`）不参与引用统计。

---

## 连接本地目录

点顶栏右上角的「连接本地目录」，选一个文件夹，浏览器会要一次授权。
之后本地改完文件、切回浏览器就生效（`focus` 事件 + 5s 轮询双保险），不用重新部署。

几点说明：

- 用的是 **File System Access API**，**只有 Chromium 系（Chrome / Edge）支持**。
  Firefox / Safari 打开时按钮会是禁用态，站点自动退回内置数据，不影响浏览。
- 选哪个目录都行，会自动往下找 `notes/` 或 `.agents/notes/`；
  找不到就认为你选的就是笔记根。选项目根也不会把 `node_modules` 读进来（有跳过清单）。
- 目录句柄存在 **IndexedDB**（不是 localStorage —— 句柄不能被 JSON 序列化）。
  权限不跨会话自动延续，重开浏览器可能要再点一次授权，这是浏览器的限制。
- 断开连接会同时清掉 IndexedDB 里的句柄，并退回内置数据。

---

## 换成你自己的笔记

1. 把 `notes/` 里的内容删掉，放自己的 Markdown。
2. 跑 `npm run notes` 看扫到的篇数对不对。
3. `vite.config.js` 顶部的 `REPO_NAME` 改成你的仓库名。
4. `index.html` 里的标题、描述、`favicon` 换掉。
5. `public/static/img/background.jpg` 换成自己的背景图
   （背景上那层全局遮罩在 `src/styles/base.css` 的 `body::before`，**别删**，
   删了深色下背景会又亮又锐、正文压不住）。

---

## 已知限制

- 本地目录挂载只在 Chromium 系可用（浏览器能力限制，非本站取舍）。
- Pages 的 SPA 回退状态码是 404（方案固有代价，页面能正常渲染）。
- Markdown 渲染器是**故意做小**的：支持标题 / 列表 / 表格 / 代码块 / 引用 / 链接 /
  粗斜体 / 行内代码。嵌套列表、脚注、数学公式不支持。
  换库的话注意现在这套是「先整体转义再拼标签」，XSS 面为零。
