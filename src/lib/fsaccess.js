/**
 * 本地目录挂载（File System Access API）
 * ---------------------------------------------------------------------------
 * 让「看板」直接读本地文件夹里的 markdown —— 不用提交、不用部署、不用后端。
 *
 * 三个必须处理的现实问题：
 *
 * 1. **目录句柄要跨刷新存活。** File System Access 的句柄不能存 localStorage
 *    （会被 JSON 序列化毁掉），只能存 IndexedDB（结构化克隆）。
 * 2. **权限不会跨会话自动延续。** 刷新后拿到句柄，但 `queryPermission` 可能是
 *    'prompt' —— 需要用户再点一次。所以要区分「有句柄但没权限」和「没有句柄」，
 *    界面上给不同提示。
 * 3. **浏览器支持面窄。** 只有 Chromium 系支持。不支持时要明确告诉用户
 *    「换个浏览器」或「用内置数据」，而不是静默失败。
 */

const DB_NAME = 'jerry-notes'
const STORE = 'handles'
const KEY = 'notesRoot'

/** 浏览器是否支持（Safari / Firefox 不支持，别指望 polyfill） */
export function isSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

/* ---------------------------------- IndexedDB ---------------------------------- */

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbPut(value) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function idbGet() {
  const db = await openDB()
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(KEY)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => resolve(null)
  })
}

async function idbClear() {
  const db = await openDB()
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

/* ---------------------------------- 句柄 ---------------------------------- */

export const saveHandle = (handle) => idbPut(handle).catch(() => {})
export const loadHandle = () => idbGet()
export const forgetHandle = () => idbClear()

/** 当前权限：'granted' | 'prompt' | 'denied' | 'unknown' */
export async function permissionOf(handle) {
  if (!handle) return 'unknown'
  try {
    return await handle.queryPermission({ mode: 'read' })
  } catch {
    return 'unknown'
  }
}

/** 主动请求权限（必须在用户手势里调用，否则会被拒） */
export async function requestPermission(handle) {
  if (!handle) return 'denied'
  try {
    return await handle.requestPermission({ mode: 'read' })
  } catch {
    return 'denied'
  }
}

/** 弹出目录选择器。用户取消返回 null（不是错误） */
export async function pickDirectory() {
  try {
    return await window.showDirectoryPicker({ mode: 'read', id: 'jerry-notes' })
  } catch (err) {
    if (err?.name === 'AbortError') return null
    throw err
  }
}

/* ---------------------------------- 扫描 ---------------------------------- */

const MD = /\.md$/i
const isHidden = (name) => name.startsWith('.')

/**
 * 找「真正的笔记根」。
 *
 * 用户选的目录很可能是项目根、或者笔记仓库的根，而不是 markdown 直接所在的那一层。
 * 按这个顺序找：
 *
 *   1. `<选的目录>/.agents/notes`   ← ADR 类工具（含参考站）的约定
 *   2. `<选的目录>/notes`           ← 这个仓库自己的约定
 *   3. 选的目录本身（只要它的子树里有笔记）
 *   4. 只有一个子目录就钻进去
 *
 * **判定「有笔记」时会排除 README / LICENSE 这类仓库说明文件，并且是递归判定的。**
 * 两条都是必须的：
 *   - 几乎每个项目根都有 README.md，如果它算数，选了项目根就会停在根目录、
 *     只扫到一篇 README，永远钻不进 notes/；
 *   - 笔记通常在 `notes/<状态>/<分类>/xxx.md` 两层深，只看当前层会漏判。
 *   （这两个 bug 都是集成测试里发现的：假目录放了个 README.md，结果只扫出 1 篇。）
 */
async function resolveNotesRoot(handle, depth = 0) {
  for (const [dir, sub] of [
    ['.agents', 'notes'],
    ['notes', null],
  ]) {
    try {
      const d = await handle.getDirectoryHandle(dir)
      const target = sub ? await d.getDirectoryHandle(sub) : d
      if (await hasNotes(target)) return target
    } catch {
      /* 不存在就试下一个 */
    }
  }

  if (await hasNotes(handle)) return handle

  if (depth < 3) {
    const dirs = []
    for await (const entry of handle.values()) {
      if (entry.kind === 'directory' && !isHidden(entry.name)) dirs.push(entry)
    }
    if (dirs.length === 1) return resolveNotesRoot(dirs[0], depth + 1)
  }

  return handle
}

/** 仓库说明类文件不算「笔记」—— 判定笔记根时要忽略它们 */
const NOT_NOTES = new Set([
  'readme.md',
  'changelog.md',
  'license.md',
  'licence.md',
  'contributing.md',
  'code_of_conduct.md',
  'security.md',
  'agents.md',
  'claude.md',
])

/**
 * 扫描时要跳过的目录。
 * **必须有这个清单**：用户很可能直接选项目根，没有它就会把 `node_modules`
 * 里几千个 markdown（README、CHANGELOG）全读进来，既慢又污染知识库。
 */
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'output',
  'vendor',
  'target',
  'coverage',
  'tmp',
  'temp',
  'cache',
  'public',
  'static',
  'assets',
  '__pycache__',
  '.git',
  '.github',
  '.next',
  '.nuxt',
  '.cache',
  '.vscode',
  '.idea',
])

/** 子树里有没有「真笔记」。递归，命中即返回（不数完整棵树） */
async function hasNotes(dirHandle, depth = 0) {
  if (depth > 4) return false
  try {
    for await (const entry of dirHandle.values()) {
      if (isHidden(entry.name)) continue
      if (entry.kind === 'file') {
        if (MD.test(entry.name) && !NOT_NOTES.has(entry.name.toLowerCase())) return true
      } else if (entry.kind === 'directory' && !SKIP_DIRS.has(entry.name.toLowerCase())) {
        if (await hasNotes(entry, depth + 1)) return true
      }
    }
  } catch {
    /* 读不动就当没有 */
  }
  return false
}

/**
 * 递归扫出所有 markdown。
 * 返回 `[{ path, raw, mtime }]`，**格式和构建期生成的 notes.json 完全一致** ——
 * 所以本地目录挂载和内置数据走的是同一条渲染路径。
 */
export async function scanDirectory(rootHandle) {
  const root = await resolveNotesRoot(rootHandle)
  const entries = []
  const skipped = []

  async function walk(dirHandle, prefix) {
    const dirs = []
    for await (const entry of dirHandle.values()) {
      if (isHidden(entry.name)) continue
      if (entry.kind === 'directory') {
        // node_modules / dist 这类目录直接跳过，否则选项目根会把依赖里的 markdown 全读进来
        if (!SKIP_DIRS.has(entry.name.toLowerCase())) dirs.push(entry)
        continue
      }
      if (entry.kind !== 'file' || !MD.test(entry.name)) continue
      // README / LICENSE 这类仓库说明文件不是笔记
      if (NOT_NOTES.has(entry.name.toLowerCase())) continue
      try {
        const file = await entry.getFile()
        entries.push({
          path: prefix ? `${prefix}/${entry.name}` : entry.name,
          raw: await file.text(),
          mtime: file.lastModified,
        })
      } catch {
        // 单个文件读失败不能中断整次扫描，记下来给用户看
        skipped.push(`${prefix ? `${prefix}/` : ''}${entry.name}`)
      }
    }
    // 目录排序后递归，保证多次扫描的顺序稳定
    dirs.sort((a, b) => a.name.localeCompare(b.name))
    for (const d of dirs) {
      await walk(d, prefix ? `${prefix}/${d.name}` : d.name)
    }
  }

  await walk(root, '')
  return { entries, skipped, rootName: root.name }
}
