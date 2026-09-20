/**
 * 「避坑智库」的数据抽取
 * ---------------------------------------------------------------------------
 * 从每篇笔记的「曾考虑的替代方案」段里，把「放弃的方案 + 为什么放弃」拆成一张张卡片。
 *
 * 参考站的做法是 `split(/\n(?=###? |- )/)` 再按冒号切 —— 实测会产出**重复条目**：
 * 一句话同时被当成「放弃备选」和「权衡依据」，卡片上出现两遍同样的字。
 * 这里换成「先按段落切，再定位分隔符」的两步法，并明确区分
 * 「方案名」和「否决理由」两个字段。
 *
 * 之所以要拆得这么细，是因为这一段的价值密度最高 ——
 * 「为什么没选 B」比「选了 A」更难回忆，也更容易重复踩坑。
 */

/** 结论词：出现在理由开头时单独提出来做徽章 */
const VERDICTS = [
  { re: /^否决|^不采用|^放弃|^拒绝|^排除/, label: '否决', tone: 'no' },
  { re: /^搁置|^暂缓|^以后再说|^待定/, label: '搁置', tone: 'wait' },
  { re: /^采纳|^改为|^已改|^最终选/, label: '改为', tone: 'yes' },
]

/** 去掉 markdown 行内标记，保留可读文本 */
function strip(s) {
  return String(s || '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // 链接留文字
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^#{3,6}\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 把 alternatives 正文切成若干「一条备选」的原始块 */
function splitBlocks(text) {
  const blocks = []
  let cur = []

  const flush = () => {
    const t = cur.join('\n').trim()
    if (t) blocks.push(t)
    cur = []
  }

  for (const line of String(text || '').split(/\r?\n/)) {
    // `### 方案名` 这种小标题一定是新一条
    if (/^#{3,6}\s+/.test(line)) {
      flush()
      cur.push(line.replace(/^#{3,6}\s+/, ''))
      continue
    }
    // 空行分段
    if (!line.trim()) {
      flush()
      continue
    }
    // 同级列表项（`- xxx`）也当新一条，但列表项的续行要跟着走
    if (/^\s*[-*+]\s+/.test(line) && cur.length) flush()
    cur.push(line)
  }
  flush()
  return blocks
}

/**
 * 从一个块里切出「方案名」和「理由」。
 * 依次尝试：`——` 破折号 → 首行内的冒号 → 首行本身就是短标题 → 整块当前缀。
 */
function splitEntry(block) {
  const lines = block.split('\n')
  const first = lines[0]

  // ① `**方案名**——否决。理由`
  const dash = first.indexOf('——')
  if (dash > 0) {
    return { name: strip(first.slice(0, dash)), reason: strip(block.slice(dash + 2)) }
  }

  // ② `**方案名**：理由`（冒号要出现在前半段，否则可能只是句中的冒号）
  for (const colon of ['：', ':']) {
    const i = first.indexOf(colon)
    if (i > 0 && i < 42) {
      return { name: strip(first.slice(0, i)), reason: strip(block.slice(i + 1)) }
    }
  }

  // ③ 首行是短标题，后面换行接着写理由
  if (lines.length > 1 && strip(first).length <= 42) {
    return { name: strip(first), reason: strip(lines.slice(1).join('\n')) }
  }

  // ④ 兜底：整块就是一段理由，用前 30 个字当名字
  const plain = strip(block)
  return { name: plain.slice(0, 30), reason: plain }
}

/** 从理由开头识别结论 */
function verdictOf(reason) {
  for (const v of VERDICTS) {
    if (v.re.test(reason)) return v
  }
  return { label: '权衡', tone: 'neutral' }
}

/**
 * 抽取全部避坑条目。
 *
 * 两个来源：
 *   1. **整篇被否决的笔记**（status=rejected）—— 本身就是一条避坑记录，
 *      用它的标题当「放弃的方案」，用「问题」段当依据。
 *   2. 每篇笔记「曾考虑的替代方案」段里的每一条。
 *
 * 返回顺序按笔记的引用数降序 —— 被引用越多的笔记，它踩过的坑越值得先看。
 */
export function extractPitfalls(notes, citationsOf = () => 0) {
  const out = []

  for (const n of notes) {
    // ① 整篇否决
    if (n.status === 'rejected') {
      out.push({
        key: `${n.id}::whole`,
        noteId: n.id,
        note: n,
        category: n.category,
        name: n.title,
        reason: strip(n.problem || n.decision || n.summary || ''),
        verdict: { label: '整篇否决', tone: 'no' },
        whole: true,
      })
    }

    // ② 备选方案
    if (!n.alternatives) continue
    for (const [i, block] of splitBlocks(n.alternatives).entries()) {
      const { name, reason } = splitEntry(block)
      // 太短的块多半是标题残留或分割噪声，丢掉
      if (strip(reason).length < 6) continue
      out.push({
        key: `${n.id}::${i}`,
        noteId: n.id,
        note: n,
        category: n.category,
        name,
        reason,
        verdict: verdictOf(reason),
        whole: false,
      })
    }
  }

  out.sort(
    (a, b) =>
      citationsOf(b.noteId) - citationsOf(a.noteId) ||
      (b.note.date || '').localeCompare(a.note.date || '')
  )
  return out
}

/** 按关键词过滤（同时匹配方案名、理由、来源笔记标题） */
export function filterPitfalls(items, query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return items
  return items.filter((it) =>
    `${it.name} ${it.reason} ${it.note.title} ${it.note.tags.join(' ')}`.toLowerCase().includes(q)
  )
}
