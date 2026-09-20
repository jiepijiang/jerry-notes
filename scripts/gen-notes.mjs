/**
 * 构建期把 notes/ 目录扫成一份 JSON
 * ---------------------------------------------------------------------------
 * 为什么不让前端直接 import 一堆 .md：Vite 对 `import.meta.glob` 的 md 处理要么
 * 变成字符串模块（每篇一个 chunk）、要么要装插件，都不如「构建期扫一次、产出一个 JSON」
 * 来得可控 —— 而且这份 JSON 同时是「挂载本地目录失败时的兜底数据」。
 *
 * **JSON 里存的是原文，不是解析结果。** 解析放在运行时做（`src/lib/parse.js`），
 * 这样：
 *   - 不用把「四段」和「全文」存两遍（全文本来就包含四段）
 *   - 构建期和运行时走的是**同一个解析器**，不存在 schema 漂移
 *   - 几百篇笔记的解析是毫秒级的字符串操作，不值得预计算
 *
 * 用法：
 *     node scripts/gen-notes.mjs
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { dirname, resolve, relative, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const NOTES_DIR = resolve(ROOT, 'notes')
const OUT = resolve(ROOT, 'public/static/data/notes.json')

/** 递归收集 .md。隐藏目录 / 隐藏文件跳过（.git、.obsidian 之类） */
function walk(dir, base = dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full, base))
    else if (entry.isFile() && /\.md$/i.test(entry.name)) {
      out.push({ path: relative(base, full).split(/[\\/]/).join('/'), full })
    }
  }
  return out
}

let files = []
try {
  files = walk(NOTES_DIR)
} catch (err) {
  console.error(`✗ 读不到 notes/ 目录：${err.message}`)
}

const entries = files
  .sort((a, b) => a.path.localeCompare(b.path))
  .map((f) => ({
    path: f.path,
    raw: readFileSync(f.full, 'utf8'),
    mtime: statSync(f.full).mtimeMs,
  }))

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), count: entries.length, entries }, null, 0) + '\n'
)

const bytes = entries.reduce((n, e) => n + Buffer.byteLength(e.raw, 'utf8'), 0)
console.log(`✓ ${entries.length} 篇笔记 → public/static/data/notes.json（原文 ${(bytes / 1024).toFixed(1)} KB）`)
for (const e of entries) {
  console.log(`    ${e.path}`)
}
