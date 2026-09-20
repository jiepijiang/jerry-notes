<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLibrary } from '@/composables/useLibrary'
import GlobalSearch from './GlobalSearch.vue'

const { state, connectLocal, grantPermission, disconnectLocal } = useLibrary()
const route = useRoute()
const router = useRouter()

const TABS = [
  { path: '/', label: '概览', icon: '🧭' },
  { path: '/timeline', label: '时间线', icon: '⏱️' },
  { path: '/pitfalls', label: '避坑智库', icon: '🛡️' },
  { path: '/all', label: '全部笔记', icon: '📋' },
]

const menuOpen = ref(false)

const beaconClass = computed(() => {
  if (state.beacon === 'syncing') return 'is-syncing'
  if (state.beacon === 'connected') return 'is-on'
  if (state.beacon === 'error') return 'is-err'
  if (state.beacon === 'need-permission') return 'is-warn'
  return ''
})

const beaconTitle = computed(() => {
  if (!state.supported) return '当前浏览器不支持 File System Access，请用 Chrome / Edge'
  if (state.beacon === 'connected') return `已连接「${state.dirName}」· 点这里重新选择目录`
  if (state.beacon === 'need-permission') return '上次授权的目录需要重新确认'
  return '点这里选择一个本地文件夹，直接读里面的 markdown'
})

function onBeacon() {
  if (!state.supported) return
  if (state.beacon === 'need-permission') grantPermission()
  else connectLocal()
}

/** 已连接时，再点一次给个「断开」的机会，否则用户没法退回内置数据 */
function onDisconnect() {
  menuOpen.value = false
  disconnectLocal()
}
</script>

<template>
  <header class="tb">
    <div class="tb-brand">
      <span class="tb-logo" aria-hidden="true"><i /></span>
      <span class="tb-name">知识库</span>
      <span class="tb-count">{{ state.notes.length }} 篇</span>
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

      <div class="tb-beacon-wrap">
        <button
          class="tb-beacon"
          :class="beaconClass"
          :title="beaconTitle"
          :disabled="!state.supported"
          @click="onBeacon"
        >
          <span class="tb-dot" />
          <span class="tb-beacon-text">{{ state.beaconText }}</span>
          <span
            v-if="state.beacon === 'connected'"
            class="tb-caret"
            @click.stop="menuOpen = !menuOpen"
            >▾</span
          >
        </button>
        <div v-if="menuOpen && state.beacon === 'connected'" class="tb-menu">
          <div class="tb-menu-head">{{ state.dirName }}</div>
          <div class="tb-menu-row">
            <span>共 {{ state.notes.length }} 篇</span>
            <span v-if="state.skipped.length" class="tb-menu-warn">{{ state.skipped.length }} 篇读取失败</span>
          </div>
          <button class="tb-menu-item" @click="onDisconnect">断开，改用内置数据</button>
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
  padding: 2px 8px;
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

/* —— 本地目录状态灯 —— */
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
  max-width: 260px;
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
  padding: 10px;
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  width: 220px;
  z-index: 60;
}

.tb-menu-head {
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tb-menu-row {
  color: var(--text-3);
  display: flex;
  font-size: 11px;
  justify-content: space-between;
  margin-bottom: 8px;
}

.tb-menu-warn {
  color: var(--st-proposed);
}

.tb-menu-item {
  border-top: 1px solid var(--line);
  color: var(--accent);
  font-size: 12px;
  padding-top: 8px;
  text-align: left;
  width: 100%;
}

.tb-menu-item:hover {
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
  .tb-beacon-text {
    max-width: 120px;
  }
}
</style>
