<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLibrary } from '@/composables/useLibrary'
import GlobalSearch from './GlobalSearch.vue'

const { state, connectLocal, grantPermission, activate, removeRoot } = useLibrary()
const route = useRoute()
const router = useRouter()

const TABS = [
  { path: '/', label: '概览', icon: '🧭' },
  { path: '/timeline', label: '时间线', icon: '⏱️' },
  { path: '/pitfalls', label: '避坑智库', icon: '🛡️' },
  { path: '/all', label: '全部笔记', icon: '📋' },
]

const menuOpen = ref(false)
const wrapRef = ref(null)

/** 当前数据源（内置笔记 / 某个本地目录） */
const current = computed(
  () => state.sources.find((s) => s.id === state.activeId) || state.sources[0]
)

/**
 * 圆点颜色表示状态，**按钮文字只写数据源名** ——
 * 以前文字承载了「已连接「x」（3 篇）」这类完整状态，切来切去时宽度会跳。
 * 状态挪到圆点和 title 上，文字就能定长。
 */
const dotClass = computed(() => {
  if (state.source === 'builtin') return ''
  if (state.beacon === 'syncing') return 'is-syncing'
  if (state.beacon === 'connected') return 'is-on'
  if (state.beacon === 'error') return 'is-err'
  if (state.beacon === 'need-permission') return 'is-warn'
  return ''
})

const buttonTitle = computed(() => {
  if (!state.supported) return '当前浏览器不支持 File System Access，请用 Chrome / Edge'
  return state.beaconText || '点这里切换数据源'
})

const hasLocal = computed(() => state.sources.some((s) => s.kind === 'local'))

/** 一个目录都没挂时，点按钮直接弹选择器；挂过之后才展开菜单 */
function onBeacon() {
  if (!state.supported) return
  if (!hasLocal.value && state.source === 'builtin') {
    connectLocal()
    return
  }
  menuOpen.value = !menuOpen.value
}

function countLabel(src) {
  if (src.needsPermission) return '需要授权'
  if (src.error) return '读取失败'
  return src.count != null ? `${src.count} 篇` : ''
}

async function onPick(src) {
  menuOpen.value = false
  if (src.needsPermission) {
    await grantPermission(src.id)
    return
  }
  if (src.id === state.activeId) return
  await activate(src.id)
}

async function onRemove(src, e) {
  e.stopPropagation()
  menuOpen.value = false
  await removeRoot(src.id)
}

async function onConnect() {
  menuOpen.value = false
  await connectLocal()
}

function onDocClick(e) {
  if (!wrapRef.value?.contains(e.target)) menuOpen.value = false
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <header class="tb">
    <div class="tb-brand">
      <span class="tb-logo" aria-hidden="true"><i /></span>
      <span class="tb-name">知识库</span>
      <!-- 数据到齐前显示「…」而不是「0 篇」：`state.notes` 初始是空数组，
           直接渲染会先闪一下「0 篇」再跳成真实篇数（实测约 450ms）。
           「库是空的」和「还没读完」看起来一模一样，但意思完全不同。 -->
      <span class="tb-count">{{ state.status === 'ready' ? `${state.notes.length} 篇` : '…' }}</span>
    </div>

    <nav class="tb-tabs">
      <RouterLink
        v-for="t in TABS"
        :key="t.path"
        class="tb-tab"
        :class="{ 'is-active': route.path === t.path }"
        :to="{ path: t.path, query: route.query.note ? { note: route.query.note } : {} }"
      >
        <span class="tb-tab-ico" aria-hidden="true">{{ t.icon }}</span>
        <span class="tb-tab-label">{{ t.label }}</span>
      </RouterLink>
    </nav>

    <div class="tb-right">
      <GlobalSearch />

      <div ref="wrapRef" class="tb-beacon-wrap">
        <button
          class="tb-beacon"
          :class="dotClass"
          :title="buttonTitle"
          :disabled="!state.supported"
          :aria-expanded="menuOpen"
          aria-haspopup="menu"
          @click="onBeacon"
        >
          <span class="tb-dot" />
          <span class="tb-beacon-text">{{ current.name }}</span>
          <span v-if="hasLocal || state.source === 'local'" class="tb-caret" aria-hidden="true">▾</span>
        </button>

        <!-- 数据源切换器。一个挂载点 = 一个独立知识库，这里只切换、不合并 ——
             合并会让不同仓库的同名文件撞成同一个 id，理由见 useLibrary.js 顶部 -->
        <div v-if="menuOpen" class="tb-menu" role="menu">
          <div class="tb-menu-cap">数据源</div>

          <!-- 「选择」和「移除」是**并排的两个 button**，不是 button 里套 span[role=button] ——
               交互元素不能嵌套，那样屏幕阅读器会读不出层级，HTML 校验也不通过 -->
          <div
            v-for="s in state.sources"
            :key="s.id"
            class="tb-src"
            :class="{ 'is-active': s.id === state.activeId }"
          >
            <button class="tb-src-pick" role="menuitem" @click="onPick(s)">
              <span class="tb-src-tick" aria-hidden="true">{{ s.id === state.activeId ? '✓' : '' }}</span>
              <span class="tb-src-name">{{ s.name }}</span>
              <span class="tb-src-count" :class="{ 'is-warn': s.needsPermission || s.error }">
                {{ countLabel(s) }}
              </span>
            </button>
            <button
              v-if="s.kind === 'local'"
              class="tb-src-x"
              :title="`移除「${s.name}」`"
              :aria-label="`移除「${s.name}」`"
              @click="onRemove(s, $event)"
            >
              ×
            </button>
          </div>

          <button class="tb-menu-add" role="menuitem" @click="onConnect">＋ 连接本地目录</button>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.tb {
  align-items: center;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  background: rgba(10, 12, 17, 0.62);
  border-bottom: 1px solid var(--line);
  display: flex;
  gap: 22px;
  height: var(--topbar-h);
  padding: 0 20px;
  position: sticky;
  top: 0;
  z-index: 50;
}

.tb-brand {
  align-items: center;
  display: flex;
  flex: none;
  gap: 9px;
}

.tb-logo {
  align-items: center;
  background: #0e1016;
  border-radius: 7px;
  display: flex;
  height: 28px;
  justify-content: center;
  position: relative;
  width: 28px;
}

.tb-logo::before {
  background: var(--gradient);
  border-radius: 6px;
  content: '';
  inset: -1px;
  position: absolute;
  z-index: -1;
}

.tb-logo i {
  background: var(--gradient);
  border-radius: 2px;
  height: 10px;
  width: 10px;
}

.tb-name {
  font-size: 15px;
  font-weight: 500;
}

.tb-count {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  color: var(--text-2);
  font-size: 11px;
  /* 定宽 + 居中：加载态是「…」、就绪态是「21 篇」，不定宽的话
     徽章宽度会变，把右边的 tab 挤得抖一下 */
  min-width: 50px;
  padding: 2px 8px;
  text-align: center;
}

.tb-tabs {
  display: flex;
  gap: 4px;
}

.tb-tab {
  align-items: center;
  border-radius: 7px;
  color: var(--text-2);
  display: flex;
  font-size: 13px;
  gap: 6px;
  padding: 7px 12px;
  transition: background-color 0.2s ease, color 0.2s ease;
  white-space: nowrap;
}

.tb-tab:hover {
  background: var(--panel-hover);
  color: var(--text);
}

.tb-tab.is-active {
  background: var(--accent-soft);
  color: #fff;
}

.tb-tab-ico {
  font-size: 12px;
}

.tb-right {
  align-items: center;
  display: flex;
  flex: 1;
  gap: 12px;
  justify-content: flex-end;
  min-width: 0;
}

/* —— 数据源切换器 —— */
.tb-beacon-wrap {
  position: relative;
}

.tb-beacon {
  align-items: center;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid var(--line);
  border-radius: 7px;
  display: flex;
  flex: none;
  font-size: 12px;
  gap: 7px;
  height: 34px;
  max-width: 220px;
  padding: 0 11px;
  transition: border-color 0.2s ease;
}

.tb-beacon:hover:not(:disabled) {
  border-color: var(--line-strong);
}

.tb-beacon:disabled {
  color: var(--text-3);
  cursor: not-allowed;
}

.tb-dot {
  background: var(--text-3);
  border-radius: 50%;
  flex: none;
  height: 7px;
  width: 7px;
}

.tb-beacon.is-on .tb-dot {
  background: var(--st-implemented);
  box-shadow: 0 0 8px rgba(74, 222, 128, 0.7);
}

.tb-beacon.is-warn .tb-dot {
  background: var(--st-proposed);
}

.tb-beacon.is-err .tb-dot {
  background: var(--st-rejected);
}

.tb-beacon.is-syncing .tb-dot {
  animation: pulse 1s ease-in-out infinite;
  background: var(--st-note);
}

.tb-beacon-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tb-caret {
  color: var(--text-3);
  font-size: 10px;
  padding: 0 2px;
}

.tb-menu {
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  background: var(--panel-solid);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.5);
  padding: 6px;
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  width: 248px;
  z-index: 60;
}

.tb-menu-cap {
  color: var(--text-3);
  font-size: 11px;
  padding: 4px 8px 6px;
}

.tb-src {
  align-items: center;
  border-radius: 6px;
  display: flex;
  transition: background-color 0.15s ease;
}

.tb-src:hover {
  background: var(--panel-hover);
}

.tb-src.is-active {
  color: #fff;
}

.tb-src-pick {
  align-items: center;
  display: flex;
  flex: 1;
  font-size: 12.5px;
  gap: 7px;
  min-width: 0;
  padding: 7px 4px 7px 8px;
  text-align: left;
}

.tb-src-tick {
  color: var(--accent);
  flex: none;
  font-size: 11px;
  width: 12px;
}

.tb-src-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tb-src-count {
  color: var(--text-3);
  flex: none;
  font-size: 11px;
}

.tb-src-count.is-warn {
  color: var(--st-proposed);
}

.tb-src-x {
  border-radius: 4px;
  color: var(--text-3);
  flex: none;
  font-size: 14px;
  line-height: 1;
  margin-right: 5px;
  padding: 3px 5px;
}

.tb-src-x:hover {
  background: rgba(248, 113, 113, 0.18);
  color: var(--st-rejected);
}

.tb-menu-add {
  border-top: 1px solid var(--line);
  color: var(--accent);
  font-size: 12px;
  margin-top: 5px;
  padding: 9px 8px 5px;
  text-align: left;
  width: 100%;
}

.tb-menu-add:hover {
  text-decoration: underline;
}

@media (max-width: 1100px) {
  .tb-tab-label {
    display: none;
  }
  .tb-tab {
    padding: 7px 9px;
  }
}

@media (max-width: 900px) {
  .tb {
    flex-wrap: wrap;
    gap: 10px;
    height: auto;
    padding: 10px 14px;
  }
  .tb-right {
    flex-basis: 100%;
    order: 3;
  }
  .tb-beacon {
    max-width: 150px;
  }
}
</style>
