---
tags: [CSS, flex, 文本溢出]
summary: text-overflow: ellipsis 挂在 flex 容器上完全无效 —— 文字被硬裁，连省略号都没有。
---

# Agent Note: 省略号必须挂在「真正包着文字」的元素上，flex 容器上无效

## 问题

首页「最近在做什么」的列表项是一个「色点 + 仓库名」的 flex 行。
窄屏下长仓库名会被裁掉，但**没有省略号**：

```
scanCode-demo  →  scanCode-
```

一开始以为是把 `overflow: hidden` 写漏了，加上去还是没省略号。

## 决策

根因：`text-overflow: ellipsis` 是**作用在块级容器的行盒**上的。
`.recent-name` 是 `display: flex`，它内部没有「行盒」这个概念，
文字是被 flex 子项硬裁的，所以 `text-overflow` 完全不参与。

修法：**在文字外面单独套一层元素挂省略号。**

```html
<span class="recent-name">
  <i class="recent-dot" />
  <span class="recent-label">{{ r.name }}</span>   <!-- 省略号挂这一层 -->
</span>
```

```css
.recent-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

另外给 flex 子项补上 `min-width: 0` —— flex 项默认 `min-width: auto`，
不加的话它会被内容撑开，省略号同样不生效。

## 曾考虑的替代方案

**直接改成一行的 `white-space: nowrap` + 固定宽度**——否决。还是会被裁，只是裁得更整齐。

**让名字换行显示**——否决。列表项高度会不一致，网格会歪。

**在窄屏干脆改成上下两行**——**最终也这么做了**。省略号修好之后仍然觉得窄屏太挤：
两行（名字一行、`语言 · 时间` 一行）比一行挤省略号更好读。
所以省略号是兜底，布局是主修。代价是窄屏页面总高各 +24px，基准要跟着改。

## 后果

- 省略号正常显示，长名字不再出现「半截词」。
- 记住两条容易忘的规则：
  1. `text-overflow` 对 flex / grid 容器无效，要套在文字所在的块级元素上。
  2. flex 子项要加 `min-width: 0`，否则永远不会收缩。
- 顺带记一个同类的坑：**行内 `<img>` 换成块级 / flex 容器会少约 3px**。
  `<img>` 默认 `display: inline`，坐在文字基线上，底部留一个 descender 间隙；
  换成 `div` 后这个间隙消失，整页高度就少 3px，下面所有元素的 y 都上移。
  看着像回归，其实是「元素类型变了」—— 接受并重设基准，别去补那 3px。
  （这一条是[移除首屏贡献图](2026-09-19-drop-snake-contribution.md)时实测到的）
