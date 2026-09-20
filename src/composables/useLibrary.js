/**
 * 数据源状态（模块级单例）
 * ---------------------------------------------------------------------------
 * 三种数据源，走同一条渲染路径：
 *   builtin  —— 构建期生成的 public/static/data/notes.json
 *   local    —— 用户授权的本地目录（File System Access），可以挂多个
 *
 * 它们产出的都是 `[{ path, raw, mtime }]`，然后交给同一个 buildLibrary 解析。
 * 这样「挂载本地目录」不会引入第二套解析逻辑，也不会出现
 * 「内置数据能用、本地目录某个字段对不上」这类问题。
 *
 * ## 多个目录是「切换」而不是「合并」
 *
 * 2026-09-20 加的。判据是 `parse.js` 里 **笔记 id 就是相对笔记根的路径** ——
 * 两个仓库都有 `notes/design.md` 的话，合并会让它们撞成同一个 id：
 * 列表里只剩一篇，交叉引用还会串到另一个仓库去。加前缀能绕开，
 * 但那样「承重墙」「避坑智库」这些按仓库维度的统计也会混在一起，语义就糊了。
 *
 * 所以：**一个挂载点 = 一个独立知识库**，顶栏切换，一次只看一个。
 * 想分开看两个仓库就分别挂载它们；想当一个整体看就挂它们的共同父目录。
 *
 * 每个数据源的解析结果各自缓存（`cache`），切回来是瞬时的。
 * 热同步**只作用于当前活跃的那个本地目录** —— 后台目录没必要反复读盘。
 *
 * ## 热同步策略（参考实现的做法，保留）
 *   - window focus 时若距上次同步 > 2.5s 就重扫
 *   - 页面可见且聚焦时，每 5s 检查一次（同样有 4s 节流）
 * 两个节流值是为了避免「切回来就扫、扫完又触发 focus」这种抖动。
 */
import { computed, reactive, readonly } from 'vue'
import { buildLibrary } from '@/lib/parse'
import * as fs from '@/lib/fsaccess'

const FOCUS_THROTTLE = 2500
const POLL_INTERVAL = 5000
const POLL_THROTTLE = 4000

/** 上次选的数据源。只是个字符串，放 localStorage 就行 */
const ACTIVE_KEY = 'jerry-notes:activeSource'

const BUILTIN_ID = 'builtin'

const state = reactive({
  /**
   * 全部数据源。内置项永远在第一位。
   * 每项：`{ id, name, kind, count?, needsPermission?, error? }`
   */
  sources: [{ id: BUILTIN_ID, name: '内置笔记', kind: 'builtin' }],
  /** 当前数据源 id */
  activeId: BUILTIN_ID,
  /** 当前数据源的种类：'builtin' | 'local'（各视图和页脚在用） */
  source: 'builtin',

  /** 'loading' | 'ready' | 'error' */
  status: 'loading',
  /** 加载失败的说明，展示在界面上（不吞错误） */
  error: '',

  notes: [],
  byId: new Map(),
  inCount: new Map(),
  extraCategories: [],
  /** 路径 / slug → 路径。渲染正文链接时用，和解析器算 outLinks 用的是同一份 */
  slugIndex: new Map(),

  /** 当前数据源的状态：'idle' | 'connected' | 'need-permission' | 'syncing' | 'error' */
  beacon: 'idle',
  beaconText: '',
  /** 当前本地目录名（页脚用） */
  dirName: '',
  lastSync: 0,
  /** 扫描时读失败的文件，展示出来而不是静默丢掉 */
  skipped: [],
  supported: fs.isSupported(),
})

/** id → FileSystemDirectoryHandle（只对 local 源有） */
const handles = new Map()
/** id → buildLibrary 产物（切换时用来秒切，省掉重扫重解析） */
const cache = new Map()

let timer = null

/* --------------------------------- 解析入库 --------------------------------- */

/** 把一份解析结果挂到当前视图上。**只改展示用的那几个字段** */
function applyLibrary(lib) {
  state.notes = lib.notes
  state.byId = lib.byId
  state.inCount = lib.inCount
  state.extraCategories = lib.extraCategories
  state.slugIndex = lib.slugIndex
}

function ingest(entries, id) {
  const lib = buildLibrary(entries)
  cache.set(id, lib)
  applyLibrary(lib)
  state.status = 'ready'
  const src = state.sources.find((s) => s.id === id)
  if (src) {
    src.count = entries.length
    delete src.error
    delete src.needsPermission
  }
  return lib
}

/** 把一份空库挂上去（空目录 / 数据源被移走时的兜底） */
function ingestEmpty(id) {
  const lib = buildLibrary([])
  cache.set(id, lib)
  applyLibrary(lib)
  state.status = 'ready'
  const src = state.sources.find((s) => s.id === id)
  if (src) src.count = 0
  return lib
}

/* --------------------------------- 内置数据 --------------------------------- */

async function loadBuiltin() {
  state.status = 'loading'
  state.error = ''
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}static/data/notes.json`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const entries = data.entries || []
    ingest(entries, BUILTIN_ID)
    if (!entries.length) {
      state.error = '内置笔记是空的 —— 往 notes/ 目录里放几篇 markdown，然后跑 npm run notes'
    }
  } catch (err) {
    state.status = 'error'
    state.error = `读不到内置笔记数据：${err.message}`
  }
}

/* --------------------------------- 本地目录 --------------------------------- */

/** 把句柄表写回 IndexedDB。写失败要显式说出来，否则刷新后目录会莫名消失 */
async function persistRoots() {
  try {
    await fs.saveRoots([...handles].map(([id, handle]) => ({ id, handle })))
  } catch (err) {
    state.beacon = 'error'
    state.beaconText = `目录列表存不下来，刷新后会丢：${err.message}`
  }
}

/**
 * 同步一个本地目录。
 * **只在它已经是当前活跃数据源时**才更新视图 —— 这个函数是给
 * activate() 和热同步调用的，两者都只针对活跃源。
 */
async function syncLocal(id, silent = false) {
  const handle = handles.get(id)
  const src = state.sources.find((s) => s.id === id)
  if (!handle || !src) return

  if (!silent) {
    state.beacon = 'syncing'
    state.beaconText = `正在同步「${src.name}」…`
  }

  try {
    const { entries, skipped, rootName } = await fs.scanDirectory(handle)
    if (!entries.length) {
      state.beacon = 'error'
      state.beaconText = `「${src.name}」里没找到 .md 文件`
      src.error = '这个目录里没有 .md 文件'
      src.count = 0
      if (state.activeId === id) ingestEmpty(id)
      return
    }
    ingest(entries, id)
    // `state.dirName` **不在这里改** —— 它代表「挂载点名字」，由 activate() 设置。
    // 这里扫出来的 rootName 是「真正的笔记根」（用户可能选的是项目根，
    // 实际读的是它下面的 .agents/notes），两者不是一回事，混用会让
    // 按钮、菜单、页脚三处名字对不上。
    state.skipped = skipped
    state.lastSync = Date.now()
    state.beacon = 'connected'
    state.beaconText = `已连接「${rootName}」（${entries.length} 篇）`
    if (skipped.length) state.beaconText += `，${skipped.length} 篇读取失败`
  } catch (err) {
    state.beacon = 'error'
    state.beaconText = `同步「${src.name}」失败：${err.message}`
    src.error = err.message
  }
}

/** 目录重名时自动加序号，避免两个 `notes` 目录抢同一个 id */
function uniqueId(name) {
  const base = `local:${name}`
  if (!handles.has(base)) return base
  let n = 2
  while (handles.has(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}

/** 用户点了「连接本地目录」—— 追加一个新目录并切过去 */
async function connectLocal() {
  if (!state.supported) return
  try {
    const handle = await fs.pickDirectory()
    if (!handle) return // 用户取消
    const id = uniqueId(handle.name || '未命名目录')
    handles.set(id, handle)
    state.sources.push({ id, name: handle.name || '未命名目录', kind: 'local' })
    await persistRoots()
    await activate(id)
  } catch (err) {
    state.beacon = 'error'
    state.beaconText = `无法读取该目录：${err.message}`
  }
}

/** 用户点了菜单里某个「待授权」的目录 */
async function grantPermission(id = state.activeId) {
  const handle = handles.get(id)
  if (!handle) return connectLocal()
  const perm = await fs.requestPermission(handle)
  if (perm === 'granted') await activate(id, { force: true })
  else {
    state.beacon = 'error'
    state.beaconText = '授权被拒绝'
  }
}

/** 移除一个已挂载的目录。移除当前活跃项时退回内置数据 */
async function removeRoot(id) {
  const idx = state.sources.findIndex((s) => s.id === id)
  if (idx < 0 || state.sources[idx].kind !== 'local') return
  handles.delete(id)
  cache.delete(id)
  state.sources.splice(idx, 1)
  await persistRoots()
  if (state.activeId === id) await activate(BUILTIN_ID, { force: true })
}

/* --------------------------------- 切换 --------------------------------- */

function persistActive(id) {
  try {
    localStorage.setItem(ACTIVE_KEY, id)
  } catch {
    /* 隐私模式下写不了，不影响使用 */
  }
}

/**
 * 切到某个数据源。
 *
 * - 有缓存 → 直接换上，瞬时完成（这是常见路径：来回对比两个仓库）
 * - 没缓存 → 扫一次。期间 `status='loading'`，顶部篇数显示「…」
 * - `force` 用来跳过「已经在这个源上」的短路（重新授权、移除后回退要用）
 */
async function activate(id, { force = false, silent = false } = {}) {
  const src = state.sources.find((s) => s.id === id)
  if (!src) return
  if (!force && id === state.activeId && state.status === 'ready') return

  state.activeId = id
  state.source = src.kind
  state.dirName = src.kind === 'local' ? src.name : ''
  state.error = ''
  state.skipped = []
  state.beacon = 'idle'
  state.beaconText = '连接本地目录'

  if (src.kind === 'builtin') {
    if (cache.has(BUILTIN_ID)) {
      applyLibrary(cache.get(BUILTIN_ID))
      state.status = 'ready'
    } else {
      await loadBuiltin()
    }
    persistActive(id)
    return
  }

  state.beacon = 'connected'
  state.beaconText = `「${src.name}」`

  if (cache.has(id)) {
    applyLibrary(cache.get(id))
    state.status = 'ready'
    state.lastSync = Date.now()
  } else {
    state.status = 'loading'
    await syncLocal(id, silent)
  }
  persistActive(id)
}

/* --------------------------------- 启动 --------------------------------- */

async function boot() {
  // 先读内置数据：无论后面发生什么，页面上总得有东西看
  await loadBuiltin()

  if (!state.supported) {
    state.beaconText = '当前浏览器不支持本地目录'
    return
  }

  // 恢复上次挂过的目录列表（loadRoots 内部会做一次单句柄 → 数组的迁移）
  let list = []
  try {
    list = await fs.loadRoots()
  } catch {
    list = []
  }
  for (const item of list) {
    if (!item?.handle) continue
    const name = item.handle.name || item.id.replace(/^local:/, '')
    handles.set(item.id, item.handle)
    state.sources.push({ id: item.id, name, kind: 'local' })
  }

  if (!list.length) {
    state.beaconText = '连接本地目录'
    return
  }

  // 恢复上次选的那个源。权限没过期就直接切过去，过期就先停在内置数据，
  // 并在那一项上打标记 —— 菜单里会显示「需要授权」，点了才弹授权
  const saved = localStorage.getItem(ACTIVE_KEY)
  if (saved && handles.has(saved)) {
    const perm = await fs.permissionOf(handles.get(saved))
    if (perm === 'granted') {
      await activate(saved, { silent: true })
      return
    }
    const src = state.sources.find((s) => s.id === saved)
    if (src) src.needsPermission = true
  }

  state.beaconText = '连接本地目录'
}

function startAutoSync() {
  if (timer) return
  const maybe = (throttle) => {
    // 只同步当前活跃的本地目录 —— 后台目录没必要反复读盘
    if (state.source !== 'local') return
    if (!handles.has(state.activeId)) return
    if (Date.now() - state.lastSync < throttle) return
    syncLocal(state.activeId, true)
  }
  window.addEventListener('focus', () => maybe(FOCUS_THROTTLE))
  timer = setInterval(() => {
    // 只在页面可见且聚焦时轮询 —— 后台标签页没必要反复读磁盘
    if (document.hasFocus() && document.visibilityState === 'visible') maybe(POLL_THROTTLE)
  }, POLL_INTERVAL)
}

/* --------------------------------- 派生数据 --------------------------------- */

/** 全部日期（有日期的）按倒序 */
const dated = computed(() => state.notes.filter((n) => n.date))

/** 只有 ADR 式笔记才进「避坑智库」和「承重墙」 */
const decisions = computed(() => state.notes.filter((n) => n.isDecision))

const kpis = computed(() => {
  const map = new Map()
  for (const n of state.notes) map.set(n.status, (map.get(n.status) || 0) + 1)
  return map
})

/** 承重墙：被引用最多的笔记 */
const pillars = computed(() =>
  [...state.notes]
    .filter((n) => (state.inCount.get(n.id) || 0) > 0)
    .sort((a, b) => (state.inCount.get(b.id) || 0) - (state.inCount.get(a.id) || 0))
    .slice(0, 6)
)

const citationsOf = (id) => state.inCount.get(id) || 0

/** 指向某篇的（派生影响） */
const incomingOf = (note) => state.notes.filter((x) => x.outLinks.includes(note.id))

/** 某篇引用的（前置依据） */
const outgoingOf = (note) => note.outLinks.map((t) => state.byId.get(t)).filter(Boolean)

/**
 * 把 markdown 里的相对链接解析成笔记 id。
 * 用的是解析器建好的那份索引（路径和 slug 都在里面），
 * 所以「渲染时能点开」和「入度统计」的结果一定一致 ——
 * 不会出现「血缘链路里看得到、正文里点不开」。
 */
function resolveLink(href, fromId) {
  const dir = fromId && fromId.includes('/') ? fromId.slice(0, fromId.lastIndexOf('/')) : ''
  const clean = String(href).split('#')[0].replace(/\.zh\.md$/, '.md').trim()
  const norm = (p) => {
    const out = []
    for (const s of p.split('/')) {
      if (!s || s === '.') continue
      if (s === '..') out.pop()
      else out.push(s)
    }
    return out.join('/')
  }
  const slug = clean.replace(/\.md$/i, '').split('/').pop()

  for (const c of [norm(dir ? `${dir}/${clean}` : clean), norm(clean), slug]) {
    const hit = c && state.slugIndex.get(c)
    if (hit && hit !== fromId) return hit
  }
  return null
}

export function useLibrary() {
  return {
    state: readonly(state),
    /** 需要写操作的场景直接用非只读引用 */
    raw: state,
    boot,
    startAutoSync,
    connectLocal,
    grantPermission,
    activate,
    removeRoot,
    reload: loadBuiltin,
    dated,
    decisions,
    kpis,
    pillars,
    citationsOf,
    incomingOf,
    outgoingOf,
    resolveLink,
  }
}
