/**
 * 极简 Markdown 渲染器
 * ---------------------------------------------------------------------------
 * **不引 markdown 库**：要支持的就那么几种语法，而一个完整的 markdown 库
 * （含 HTML 直通、脚注、表格、内嵌 HTML）反而是个 XSS 面。
 *
 * 安全策略：**先把原文整个转义，再往上加标签。**
 * 这样原文里任何 `<script>` 都已经是 `&lt;script&gt;`，
 * 后面插入的标签全都是我们自己拼的常量，不存在注入路径。
 */

/** 转义 HTML 特殊字符。所有进入渲染管道的文本都要先过这一层 */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 只允许 http / https / mailto / 站内相对路径，其余（javascript:、data:）一律拒绝 */
function safeHref(href) {
  const h = String(href || '').trim()
  if (/^(https?:|mailto:)/i.test(h)) return h
  // 站内相对路径：不含协议头、不以 // 开头
  if (!/^[a-z][a-z0-9+.-]*:/i.test(h) && !h.startsWith('//')) return h
  return ''
}

/**
 * 行内语法：代码 → 粗体 → 斜体 → 链接。
 * 顺序很重要：先处理反引号，否则代码块里的 `**` 会被当成粗体。
 */
function inline(text, opts) {
  let s = text

  // 行内代码：先抽出来占位，避免里面的符号被后续规则误伤
  const codes = []
  s = s.replace(/`([^`\n]+)`/g, (_, c) => {
    codes.push(c)
    return `\u0000${codes.length - 1}\u0000`
  })

  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,，。]|$)/g, '$1<em>$2</em>')
  s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>')

  // 链接
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, label, href) => {
    const h = safeHref(href)
    if (!h) return label
    // 指向其它笔记的链接交给调用方解析（渲染成能打开抽屉的内部链接）
    const target = opts.resolveNote ? opts.resolveNote(href) : null
    if (target) {
      return `<a class="md-note-link" href="#" data-note="${esc(target)}">${label}</a>`
    }
    if (/^https?:/i.test(h)) {
      return `<a href="${esc(h)}" target="_blank" rel="noopener noreferrer">${label}</a>`
    }
    if (/^mailto:/i.test(h)) return `<a href="${esc(h)}">${label}</a>`
    // 解析不出来的 .md 链接（笔记已删除/改名）：渲染成普通文字，不留死链
    return label
  })

  // 还原行内代码
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`)
  return s
}

/**
 * 渲染 Markdown。
 * @param text        原文
 * @param opts.resolveNote  (href) => noteId | null，用于把 `[x](a.md)` 变成站内链接
 */
export function renderMarkdown(text, opts = {}) {
  if (!text) return ''

  const lines = esc(text).split(/\r?\n/)
  const out = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // —— 代码块 ——
    const fence = /^\s*(```|~~~)\s*([\w+-]*)\s*$/.exec(line)
    if (fence) {
      const buf = []
      i++
      while (i < lines.length && !/^\s*(```|~~~)\s*$/.test(lines[i])) buf.push(lines[i++])
      i++ // 跳过收尾的 ```
      const lang = fence[2] ? `<span class="md-code-lang">${fence[2]}</span>` : ''
      out.push(`<pre class="md-pre">${lang}<code>${buf.join('\n')}</code></pre>`)
      continue
    }

    // —— 标题 ——
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) {
      const lvl = h[1].length
      out.push(`<h${lvl} class="md-h md-h${lvl}">${inline(h[2], opts)}</h${lvl}>`)
      i++
      continue
    }

    // —— 分隔线 ——
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push('<hr class="md-hr">')
      i++
      continue
    }

    // —— 引用块 ——
    if (/^\s*&gt;\s?/.test(line)) {
      const buf = []
      while (i < lines.length && /^\s*&gt;\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*&gt;\s?/, ''))
        i++
      }
      out.push(`<blockquote class="md-quote">${inline(buf.join(' '), opts)}</blockquote>`)
      continue
    }

    // —— 列表（连续的同类行算一个列表）——
    const ul = /^\s*[-*+]\s+(.*)$/.exec(line)
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (ul || ol) {
      const ordered = Boolean(ol)
      const items = []
      while (i < lines.length) {
        const m = ordered ? /^\s*\d+[.)]\s+(.*)$/.exec(lines[i]) : /^\s*[-*+]\s+(.*)$/.exec(lines[i])
        if (!m) break
        items.push(`<li>${inline(m[1], opts)}</li>`)
        i++
      }
      out.push(`<${ordered ? 'ol' : 'ul'} class="md-list">${items.join('')}</${ordered ? 'ol' : 'ul'}>`)
      continue
    }

    // —— 空行 ——
    if (!line.trim()) {
      i++
      continue
    }

    // —— 段落（连续的普通行合成一段，软换行保留为 <br>）——
    const buf = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !/^\s*(```|~~~)/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^\s*&gt;\s?/.test(lines[i])
    ) {
      buf.push(lines[i])
      i++
    }
    out.push(`<p class="md-p">${inline(buf.join('<br>'), opts)}</p>`)
  }

  return out.join('\n')
}

/**
 * 从 Markdown 里剥出纯文本，用于卡片摘要。
 * 不做完整解析 —— 只要「看起来干净」就够了。
 */
export function plainText(text, max = 0) {
  let s = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ') // 代码块
    .replace(/`([^`]*)`/g, '$1') // 行内代码
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // 图片
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // 链接留文字
    .replace(/^#{1,6}\s+/gm, '') // 标题号
    .replace(/^\s*[-*+]\s+/gm, '') // 列表符
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/^\s*&gt;\s?/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  if (max > 0 && s.length > max) s = `${s.slice(0, max)}…`
  return s
}
