---
tags: [Vite, 部署, 验证]
summary: vite preview 对所有路径都回退成 index.html，用它验证 Pages 子路径会误报一堆假 404。
---

# Agent Note: 验证 Pages 子路径行为不能用 vite preview

## 问题

站点部署在 `https://<user>.github.io/<repo>/` 这个子路径下，
构建时必须带 `base`，否则 `/assets/*.js` 全部 404。
（为什么要按子路径部署，见[主站与子站拆成独立仓库](2026-09-19-multi-repo-split.md)）

想本地验证子路径是否正确，很自然会用 `vite preview`。
但它对**所有**找不到的路径都回退成 `index.html` ——
**连 JS / CSS 请求都返回 `text/html`**。于是验证时看到一堆「资源 404 / content-type 错误」，
但分不清是「我的路径拼错了」还是「preview 的行为和 Pages 不一样」。

## 决策

**写一个 25 行的静态服务模拟 Pages 的真实行为**，四步：

```
剥掉路径前缀 → 有文件就给文件 → 是目录就给它的 index.html → 都没有就给 404.html 且状态码 404
```

```js
path = path.slice(PREFIX.length - 1)
let file = await tryFile(join(ROOT, safe))                      // 直接命中
if (!file) file = await tryFile(join(ROOT, safe, 'index.html')) // 目录 / 根路径
if (!file && !extname(safe)) file = await tryFile(join(ROOT, '404.html'))  // SPA 深链，状态码仍 404
```

必查清单：根路径 200、`/assets/*.js` 200、
静态资源（图片 / 字体 / 音频 / **数据 JSON**）200 且 `content-type` 正确、深链返回 404.html。

## 曾考虑的替代方案

**直接推到 GitHub 上看**——否决。每次验证都要等一次完整部署（含 CI 构建），
反馈周期从 3 秒变成 2 分钟，改一行调一次的节奏会断掉。

**信任 `vite preview`**——否决。它的回退行为会把「真 404」和「假 404」混在一起，
等于没有验证。

**用 `http-server` 之类现成工具**——否决。它们同样不支持「子路径前缀 + SPA 回退」，
要么全 404 要么全回退，都不对。

## 后果

- 本地就能完整验证子路径，反馈从 2 分钟降到 3 秒。
- **明确了一条容易搞混的规则**：Pages 的 SPA 深链（如 `/repo/chat`）
  返回的 HTTP 状态码**就是 404**，但正文是 `404.html`（即 index 的副本），页面正常渲染。
  这是**已知且可接受**的取舍，不要当成 bug 去修。
  在意的话只能换 `createHashHistory`，代价是 URL 变成 `/#/chat`。
- 代价：多维护一个 ~25 行的脚本。`/tmp` 会被清理，所以每次要重写 ——
  但正因为短，重写比找回来更快。
- **音频 / 字体 / 数据文件这类资源最容易只测了首页就漏掉** ——
  它们往往靠 `import.meta.env.BASE_URL` 前缀拼路径，
  漏了前缀在 dev 下完全正常、上线才 404。
  （同类问题还有一个更隐蔽的版本：[第三方 API 改到构建期取数](2026-09-20-github-api-egress-limit.md)，
  那个连「本地全绿」都是假象）
