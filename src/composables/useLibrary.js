/**
 * 数据源状态（模块级单例）
 * ---------------------------------------------------------------------------
 * 两种数据源，走同一条渲染路径：
 *   builtin —— 构建期生成的 public/static/data/notes.json
 *   local   —— 用户授权的本地目录（File System Access）
 *
 * 两者产出的都是 `[{ path, raw, mtime }]`，然后交给同一个 buildLibrary 解析。
 * 这样「挂载本地目录」不会引入第二套解析逻辑，也不会出现
 * 「内置数据能用、本地目录某个字段对不上」这类问题。
 *
 * 热同步策略（参考实现的做法，保留）：
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

const state = reactive({
  /** 'builtin' | 'local' */
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

  /** 本地目录状态：'idle' | 'connected' | 'need-permission' | 'syncing' | 'error' */
  beacon: 'idle',
  beaconText: '',
  dirName: '',
  lastSync: 0,
  /** 扫描时读失败的文件，展示出来而不是静默丢掉 */
  skipped: [],
  supported: fs.isSupported(),
})

let dirHandle = null
let timer = null

/* --------------------------------- 解析入库 --------------------------------- */

function ingest(entries) {
  const lib = buildLibrary(entries)
  state.notes = lib.notes
  state.byId = lib.byId
  state.inCount = lib.inCount
  state.extraCategories = lib.extraCategories
  state.slugIndex = lib.slugIndex
  state.status = 'ready'
}

/* --------------------------------- 内置数据 --------------------------------- */

async function loadBuiltin() {
  state.status = 'loading'
  state.error = ''
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}static/data/notes.json`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    ingest(data.entries || [])
    if (!data.entries?.length) {
      state.status = 'ready'
      state.error = '内置笔记是空的 —— 往 notes/ 目录里放几篇 markdown，然后跑 npm run notes'
    }
  } catch (err) {
    state.status = 'error'
    state.error = `读不到内置笔记数据：${err.message}`
  }
}

/* --------------------------------- 本地目录 --------------------------------- */

async function syncLocal(silent = false) {
  if (!dirHandle) return
  if (!silent) state.beacon = 'syncing'
  state.beaconText = silent ? state.beaconText : '正在同步…'

  try {
    const { entries, skipped, rootName } = await fs.scanDirectory(dirHandle)
    if (!entries.length) {
      state.beacon = 'error'
      state.beaconText = '这个目录里没有找到 .md 文件'
      return
    }
    ingest(entries)
    state.source = 'local'
    state.dirName = rootName
    state.skipped = skipped
    state.lastSync = Date.now()
    state.beacon = 'connected'
    state.beaconText = `已连接「${rootName}」（${entries.length} 篇）`
    if (skipped.length) state.beaconText += `，${skipped.length} 篇读取失败`
  } catch (err) {
    state.beacon = 'error'
    state.beaconText = `同步失败：${err.message}`
  }
}

/** 用户点了「连接本地目录」 */
async function connectLocal() {
  if (!state.supported) return
  try {
    const handle = await fs.pickDirectory()
    if (!handle) return // 用户取消
    dirHandle = handle
    await fs.saveHandle(handle)
    await syncLocal()
  } catch (err) {
    state.beacon = 'error'
    state.beaconText = `无法读取该目录：${err.message}`
  }
}

/** 用户点了「确认授权」—— 已有句柄但权限过期 */
async function grantPermission() {
  if (!dirHandle) return connectLocal()
  const perm = await fs.requestPermission(dirHandle)
  if (perm === 'granted') await syncLocal()
  else {
    state.beacon = 'error'
    state.beaconText = '授权被拒绝，仍在使用内置数据'
  }
}

/** 断开本地目录，回到内置数据 */
async function disconnectLocal() {
  dirHandle = null
  await fs.forgetHandle()
  state.beacon = 'idle'
  state.beaconText = '连接本地目录'
  state.dirName = ''
  state.skipped = []
  state.lastSync = 0
  state.source = 'builtin'
  await loadBuiltin()
}

/* --------------------------------- 启动 --------------------------------- */

async function boot() {
  await loadBuiltin()

  if (!state.supported) {
    state.beaconText = '当前浏览器不支持本地目录'
    return
  }

  // 尝试恢复上次授权的目录
  const saved = await fs.loadHandle()
  if (!saved) {
    state.beaconText = '连接本地目录'
    return
  }

  dirHandle = saved
  const perm = await fs.permissionOf(saved)
  if (perm === 'granted') {
    await syncLocal(true)
  } else if (perm === 'prompt') {
    state.beacon = 'need-permission'
    state.beaconText = '点击确认授权'
  } else {
    state.beaconText = '连接本地目录'
  }
}

function startAutoSync() {
  if (timer) return
  const maybe = (throttle) => {
    if (!dirHandle) return
    if (Date.now() - state.lastSync < throttle) return
    syncLocal(true)
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
    disconnectLocal,
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
