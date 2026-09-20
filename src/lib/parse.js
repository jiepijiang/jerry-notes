/**
 * 笔记解析器
 * ---------------------------------------------------------------------------
 * **构建期（scripts/gen-notes.mjs，Node）和运行时（浏览器挂载本地目录）共用这一份。**
 * 所以这个文件里不许出现任何 Node 专有或浏览器专有的 API —— 纯字符串处理。
 *
 * 设计原则：**能推断的就推断，推断不出的退化成「随手记」，绝不报错、绝不丢笔记**。
 * 知识库最怕的是「有一篇格式没写对，整个列表就空了」。
 */

/**
 * 状态：优先取 frontmatter.status，其次路径第一段，都没有就是 note。
 * 前四个是 ADR（架构决策记录）那套，note 是兜底 —— 让普通笔记也能进来。
 */
export const STATUSES = [
  { key: 'implemented', label: '已落地', color: '#4ade80', desc: '已经在用 / 已经做完' },
  { key: 'proposed', label: '待验证', color: '#fbbf24', desc: '想法与计划，还没定' },
  { key: 'rejected', label: '已否决', color: '#f87171', desc: '试过不行 / 想清楚不做' },
  { key: 'archived', label: '已归档', color: '#94a3b8', desc: '过时了，留个记录' },
  { key: 'note', label: '随手记', color: '#60a5fa', desc: '还没归类的日常记录' },
]

/** 分类：优先取 frontmatter.category，其次路径第二段，都没有就是未分类 */
export const CATEGORIES = [
  { key: 'architecture', label: '架构设计', icon: '🏛️' },
  { key: 'feature', label: '功能特性', icon: '🧩' },
  { key: 'bug-fix', label: '缺陷修复', icon: '🐛' },
  { key: 'simplification', label: '化简裁撤', icon: '✂️' },
  { key: 'process', label: '流程规范', icon: '📐' },
  { key: 'testing', label: '测试基建', icon: '🧪' },
  { key: 'learning', label: '学习笔记', icon: '📚' },
]

export const UNCATEGORIZED = { key: 'uncategorized', label: '未分类', icon: '📄' }

export const STATUS_KEYS = STATUSES.map((s) => s.key)
export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key)

export const statusLabel = (k) => STATUSES.find((s) => s.key === k)?.label || k
export const statusColor = (k) => STATUSES.find((s) => s.key === k)?.color || '#94a3b8'
export const statusDesc = (k) => STATUSES.find((s) => s.key === k)?.desc || ''
export const categoryLabel = (k) =>
  k === UNCATEGORIZED.key ? UNCATEGORIZED.label : CATEGORIES.find((c) => c.key === k)?.label || k
export const categoryIcon = (k) =>
  k === UNCATEGORIZED.key ? UNCATEGORIZED.icon : CATEGORIES.find((c) => c.key === k)?.icon || '📄'

/**
 * 四个 ADR 段落的别名。**中英文都认** —— 笔记是自己写的，不该被措辞卡住。
 * 匹配规则是「标题去掉空格后的包含关系」，所以 `## 曾考虑的替代方案` 能被 `备选` 命中。
 */
export const SECTION_ALIASES = {
  problem: ['问题', '背景', '痛点', '动机', 'problem', 'context', 'background'],
  decision: ['决策', '方案', '裁定', '做法', '结论', '落地', 'decision', 'proposal', 'solution'],
  alternatives: [
    '备选',
    '替代方案',
    '曾考虑的替代',
    '放弃的方案',
    '否决的方案',
    'alternatives',
    'rejected',
  ],
  consequences: [
    '后果',
    '影响',
    '收益与代价',
    '代价',
    '效果',
    'consequences',
    'impact',
    'tradeoff',
    'trade-off',
  ],
}

/** 详情抽屉里四段的标题（顺序即展示顺序） */
export const QUAD_META = [
  { key: 'problem', icon: '🎯', title: '背景与痛点' },
  { key: 'decision', icon: '⚡', title: '落地事实' },
  { key: 'alternatives', icon: '🚫', title: '审慎考虑并放弃的备选' },
  { key: 'consequences', icon: '⚖️', title: '收益与代价' },
]

/* ------------------------------------------------------------------ *
 * 极简 frontmatter（不引 YAML 库：只用得到字符串 / 数组两种值）
 * ------------------------------------------------------------------ */

/**
 * 解析开头的 `--- ... ---` 块。支持：
 *   key: 值
 *   key: [a, b, c]
 *   key:
 *     - a
 *     - b
 * 不认识的复杂结构原样当字符串存，不抛错。
 */
export function parseFrontmatter(raw) {
  const text = raw.replace(/^\uFEFF/, '')
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  if (!m) return { data: {}, body: text }

  const data = {}
  let listKey = null

  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue

    const item = /^\s+-\s+(.*)$/.exec(line)
    if (item && listKey) {
      data[listKey].push(unquote(item[1].trim()))
      continue
    }

    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line)
    if (!kv) continue
    const key = kv[1]
    const val = kv[2].trim()

    if (!val) {
      data[key] = [] // 空值后面可能跟列表
      listKey = key
      continue
    }
    listKey = null
    data[key] = /^\[.*\]$/.test(val)
      ? val
          .slice(1, -1)
          .split(',')
          .map((s) => unquote(s.trim()))
          .filter(Boolean)
      : unquote(val)
  }

  // 声明了列表键但一个项都没收到 → 还原成空字符串，更符合直觉
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v) && v.length === 0) data[k] = ''
  }

  return { data, body: text.slice(m[0].length) }
}

function unquote(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1)
  }
  return s
}

/* ------------------------------------------------------------------ *
 * 分段
 * ------------------------------------------------------------------ */

/** 把正文按 `## ` 切成 [{ title, content }]，标题不含 `## `。代码块里的 `## ` 不算 */
export function splitSections(body) {
  const out = []
  let cur = null
  let inFence = false

  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence

    const h2 = !inFence && /^##\s+(.*)$/.exec(line)
    if (h2) {
      if (cur) out.push(cur)
      cur = { title: h2[1].trim(), lines: [] }
      continue
    }
    if (cur) cur.lines.push(line)
  }
  if (cur) out.push(cur)

  return out.map((s) => ({ title: s.title, content: s.lines.join('\n').trim() }))
}

/**
 * 把段落标题归到 problem / decision / alternatives / consequences，认不出返回 null。
 *
 * **用「最长命中的别名」判定，不是「第一个命中的段落类型」。**
 * 因为别名之间有包含关系：`方案` 是 `替代方案` 的子串，
 * 按类型顺序判会让 `## 曾考虑的替代方案` 被归成「决策」，把备选段吞掉。
 * 按别名长度取最长，`替代方案`(4) 就会赢过 `方案`(2)。
 */
export function classifySection(title) {
  const norm = title.toLowerCase().replace(/\s/g, '')
  let best = null
  let bestLen = 0
  for (const [key, aliases] of Object.entries(SECTION_ALIASES)) {
    for (const a of aliases) {
      const needle = a.toLowerCase().replace(/\s/g, '')
      if (norm.includes(needle) && needle.length > bestLen) {
        best = key
        bestLen = needle.length
      }
    }
  }
  return best
}

/**
 * 去掉 `Agent Note:` / `笔记：` 这类前缀 —— 它是个类型标记，不该出现在标题里。
 * 认不出来就原样返回。
 */
export function cleanTitle(t) {
  return String(t || '')
    .replace(/^(?:agent\s*note|note|笔记|记录)\s*[:：]\s*/i, '')
    .trim()
}

/** 取正文的第一个 `# ` 标题（不是 `##`） */
export function firstH1(body) {
  const m = /^#\s+(.+)$/m.exec(body)
  return m ? m[1].trim() : ''
}

/* ------------------------------------------------------------------ *
 * 链接解析
 * ------------------------------------------------------------------ */

/** 相对路径规范化：处理 `.` / `..` / 重复斜杠 */
function normalizePath(p) {
  const out = []
  for (const s of p.replace(/\\/g, '/').split('/')) {
    if (!s || s === '.') continue
    if (s === '..') out.pop()
    else out.push(s)
  }
  return out.join('/')
}

/**
 * 从正文里抽出指向其它笔记的链接。认三种写法：
 *   [文字](2026-09-20-xxx.md)              同目录
 *   [文字](../feature/2026-09-20-xxx.md)   相对跳转
 *   [文字](implemented/feature/xxx.md)     从笔记根开始
 * 外链（含 `://`）和纯锚点忽略。**解析不出目标的链接直接丢掉，不算错误**。
 */
export function extractLinks(body, selfPath, index) {
  const dir = selfPath.includes('/') ? selfPath.slice(0, selfPath.lastIndexOf('/')) : ''
  const found = new Set()

  for (const m of body.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    let target = m[1].split('#')[0].trim()
    if (!target || target.includes('://') || target.startsWith('mailto:')) continue

    // `.zh.md` 双语文档指向同一篇
    target = target.replace(/\.zh\.md$/, '.md')
    const slug = target.replace(/\.md$/i, '').split('/').pop()

    // 依次尝试：相对当前文件 → 从笔记根 → slug 兜底（笔记改名后链接不会全断）
    const candidates = [normalizePath(dir ? `${dir}/${target}` : target), normalizePath(target), index.get(slug)]

    for (const c of candidates) {
      if (c && c !== selfPath && index.has(c)) {
        found.add(c)
        break
      }
    }
  }

  return [...found]
}

/* ------------------------------------------------------------------ *
 * 主入口
 * ------------------------------------------------------------------ */

/**
 * 解析单篇笔记。
 *
 * @param raw            原文（含 frontmatter）
 * @param relPath        相对笔记根的路径，如 `implemented/architecture/2026-09-20-x.md`
 * @param index          路径/slug → 路径 的索引（buildSlugIndex 产物），用于解析链接
 * @param fallbackMtime  没有日期时的兜底时间戳（构建期传文件 mtime；运行时传 undefined，
 *                       因为 File System Access 拿到的 lastModified 是「本地文件修改时间」，
 *                       对笔记来说反而是个有用的信息，所以运行时也会传）
 */
export function parseNote(raw, relPath, index = new Map(), fallbackMtime) {
  const { data: fm, body } = parseFrontmatter(raw)
  const parts = relPath.split('/')
  const slug = parts[parts.length - 1].replace(/\.md$/i, '')

  // —— 状态：frontmatter → 路径首段 → 兜底 ——
  let status = String(fm.status || '').trim()
  if (!STATUS_KEYS.includes(status)) status = STATUS_KEYS.includes(parts[0]) ? parts[0] : 'note'

  // —— 分类：frontmatter → 路径次段 → 路径首段 → 兜底 ——
  // 最后那一步是为了兼容「只按分类建目录」的写法：notes/learning/xxx.md
  let category = String(fm.category || fm.cls || '').trim()
  if (!CATEGORY_KEYS.includes(category)) {
    if (CATEGORY_KEYS.includes(parts[1])) category = parts[1]
    else if (CATEGORY_KEYS.includes(parts[0])) category = parts[0]
    else category = UNCATEGORIZED.key
  }

  // —— 日期：frontmatter → 文件名前缀 → 文件修改时间 ——
  let date = String(fm.date || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const d = /^(\d{4}-\d{2}-\d{2})/.exec(slug)
    date = d ? d[1] : ''
  }
  if (!date && fallbackMtime) date = new Date(fallbackMtime).toISOString().slice(0, 10)

  // —— 标题：frontmatter → 正文 H1 → 文件名 ——
  const title =
    cleanTitle(fm.title) ||
    cleanTitle(firstH1(body)) ||
    slug.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/[-_]+/g, ' ')

  // —— 四段：同名段落取第一次出现的（通常是主段落，后面可能是补充） ——
  // 归了类但槽位已被占的，退回 extras —— **绝不丢内容**。
  const quad = { problem: '', decision: '', alternatives: '', consequences: '' }
  const extras = []
  for (const s of splitSections(body)) {
    const key = classifySection(s.title)
    if (key && !quad[key]) quad[key] = s.content
    else extras.push(s)
  }

  const tags = Array.isArray(fm.tags)
    ? fm.tags
    : String(fm.tags || '')
        .split(/[,，\s]+/)
        .filter(Boolean)

  return {
    id: relPath,
    slug,
    path: relPath,
    status,
    category,
    date,
    title,
    tags,
    summary: String(fm.summary || '').trim(),
    problem: quad.problem,
    decision: quad.decision,
    alternatives: quad.alternatives,
    consequences: quad.consequences,
    /** 除四段以外的 `## ` 段落，普通笔记靠它展示 */
    sections: extras,
    outLinks: extractLinks(body, relPath, index),
    body,
    /** 是否 ADR 式（四段里至少有一段）。只有 ADR 式才会进「避坑智库」和「承重墙」 */
    isDecision: Boolean(quad.problem || quad.decision || quad.alternatives || quad.consequences),
    /** 去掉空白后的字数，用于列表展示体量 */
    size: body.replace(/\s/g, '').length,
  }
}

/**
 * 建立「路径 / slug → 路径」索引。
 * slug 撞车时**先到先得**，所以先按路径排序，保证多次构建结果一致。
 */
export function buildSlugIndex(relPaths) {
  const index = new Map()
  for (const rel of [...relPaths].sort()) {
    index.set(rel, rel)
    const slug = rel.split('/').pop().replace(/\.md$/i, '')
    if (!index.has(slug)) index.set(slug, rel)
  }
  return index
}

/**
 * 批量解析 + 建立引用图。
 * @param entries [{ path, raw, mtime? }]
 */
export function buildLibrary(entries) {
  const index = buildSlugIndex(entries.map((e) => e.path))
  const notes = entries.map((e) => parseNote(e.raw, e.path, index, e.mtime))

  const byId = new Map(notes.map((n) => [n.id, n]))

  // 入度 = 被多少篇引用，用于「承重墙」和「引用最多」排序
  const inCount = new Map()
  for (const n of notes) {
    n.outLinks = n.outLinks.filter((t) => byId.has(t))
    for (const t of n.outLinks) inCount.set(t, (inCount.get(t) || 0) + 1)
  }

  // frontmatter 里写的自定义分类也要能被展示
  const known = new Set(CATEGORY_KEYS)
  const extraCategories = [...new Set(notes.map((n) => n.category))].filter(
    (c) => c && !known.has(c) && c !== UNCATEGORIZED.key
  )

  notes.sort((a, b) => (b.date || '0000').localeCompare(a.date || '0000') || a.title.localeCompare(b.title))

  // 把索引一起返回：运行时渲染正文里的 `[x](a.md)` 链接要用它解析，
  // 和解析器算 outLinks 时用的是同一份 —— 否则会出现
  // 「血缘链路里能看到这篇，正文里却点不开」这种不一致。
  return { notes, byId, inCount, extraCategories, slugIndex: index }
}
