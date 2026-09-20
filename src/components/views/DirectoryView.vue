<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CATEGORIES, STATUSES } from '@/lib/parse'
import { useLibrary } from '@/composables/useLibrary'
import NoteBadge from '../NoteBadge.vue'

/**
 * 全部笔记（清单）
 * ---------------------------------------------------------------------------
 * 表格 + 筛选 + 排序。筛选条件全部同步到 URL query，
 * 所以「概览里点某个状态 → 跳到清单并筛好」是一个可以分享的链接，
 * 刷新也不会丢。
 */
const { state, citationsOf } = useLibrary()
const route = useRoute()
const router = useRouter()

const q = ref('')
const status = ref('')
const category = ref('')
const sort = ref('new')

/** 从 URL 恢复筛选条件（概览跳过来时会带上） */
watch(
  () => route.query,
  (query) => {
    q.value = typeof query.q === 'string' ? query.q : ''
    status.value = typeof query.status === 'string' ? query.status : ''
    category.value = typeof query.category === 'string' ? query.category : ''
  },
  { immediate: true }
)

/** 把当前筛选写回 URL —— 用 replace 避免每次输入都往历史里塞一条 */
function pushQuery() {
  const query = {}
  if (q.value.trim()) query.q = q.value.trim()
  if (status.value) query.status = status.value
  if (category.value) query.category = category.value
  if (route.query.note) query.note = route.query.note
  router.replace({ query })
}

const usedStatuses = computed(() => {
  const used = new Set(state.notes.map((n) => n.status))
  return STATUSES.filter((s) => used.has(s.key))
})

const usedCategories = computed(() => {
  const used = new Set(state.notes.map((n) => n.category))
  const list = CATEGORIES.filter((c) => used.has(c.key))
  for (const key of state.extraCategories) if (used.has(key)) list.push({ key, label: key })
  if (used.has('uncategorized')) list.push({ key: 'uncategorized', label: '未分类' })
  return list
})

const list = computed(() => {
  const needle = q.value.trim().toLowerCase()
  let out = state.notes.filter((n) => {
    if (status.value && n.status !== status.value) return false
    if (category.value && n.category !== category.value) return false
    if (needle) {
      const hay = `${n.title} ${n.slug} ${n.tags.join(' ')} ${n.summary} ${n.body}`.toLowerCase()
      if (!hay.includes(needle)) return false
    }
    return true
  })

  if (sort.value === 'new') out = [...out].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  else if (sort.value === 'old') out = [...out].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  else if (sort.value === 'cites')
    out = [...out].sort((a, b) => citationsOf(b.id) - citationsOf(a.id))
  else if (sort.value === 'size') out = [...out].sort((a, b) => b.size - a.size)
  return out
})

const hasFilter = computed(() => Boolean(q.value.trim() || status.value || category.value))

function reset() {
  q.value = ''
  status.value = ''
  category.value = ''
  sort.value = 'new'
  router.replace({ query: route.query.note ? { note: route.query.note } : {} })
}

/** 序号按当前排序里的位置给，方便「第几条」这种口头引用 */
const pad = (i) => `#${String(i + 1).padStart(3, '0')}`
</script>

<template>
  <section class="panel">
    <header class="panel-head">
      <span class="panel-title"><span aria-hidden="true">📋</span> 全部笔记</span>
      <span class="panel-note">点任意一行打开详情；筛选条件会写进 URL，可以直接分享</span>
    </header>

    <div class="bar">
      <input
        v-model="q"
        class="bar-input"
        type="text"
        placeholder="在标题、标签和正文里搜…"
        aria-label="筛选笔记"
        @input="pushQuery"
      />
      <select v-model="status" class="bar-select" @change="pushQuery">
        <option value="">状态：全部</option>
        <option v-for="s in usedStatuses" :key="s.key" :value="s.key">状态：{{ s.label }}</option>
      </select>
      <select v-model="category" class="bar-select" @change="pushQuery">
        <option value="">分类：全部</option>
        <option v-for="c in usedCategories" :key="c.key" :value="c.key">分类：{{ c.label }}</option>
      </select>
      <select v-model="sort" class="bar-select">
        <option value="new">排序：最新优先</option>
        <option value="old">排序：最早优先</option>
        <option value="cites">排序：引用最多</option>
        <option value="size">排序：篇幅最长</option>
      </select>
      <button v-if="hasFilter" class="bar-reset" @click="reset">重置</button>
      <span class="bar-count">匹配 <b>{{ list.length }}</b> / {{ state.notes.length }}</span>
    </div>

    <div class="board">
      <div class="row row-head">
        <span>序号</span>
        <span>分类</span>
        <span>标题</span>
        <span>状态</span>
        <span>日期</span>
        <span class="ta-r">引用</span>
      </div>

      <button
        v-for="(n, i) in list"
        :key="n.id"
        class="row row-item"
        :data-open-note="n.id"
        :title="n.title"
      >
        <span class="cell-idx">{{ pad(i) }}</span>
        <span><NoteBadge kind="category" :value="n.category" compact /></span>
        <span class="cell-title">
          <span class="cell-title-text">{{ n.title }}</span>
          <span v-if="n.tags.length" class="cell-tags">
            <span v-for="t in n.tags.slice(0, 3)" :key="t" class="cell-tag">#{{ t }}</span>
          </span>
        </span>
        <span><NoteBadge kind="status" :value="n.status" compact /></span>
        <span class="cell-date">{{ n.date || '—' }}</span>
        <span class="cell-cites">{{ citationsOf(n.id) ? `↗ ${citationsOf(n.id)}` : '' }}</span>
      </button>

      <div v-if="!list.length" class="board-empty">// 没有匹配的笔记</div>
    </div>
  </section>
</template>

<style scoped>
.panel {
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 18px 20px 22px;
}

.panel-head {
  align-items: baseline;
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: space-between;
  margin-bottom: 14px;
  padding-bottom: 12px;
}

.panel-title {
  align-items: center;
  color: #fff;
  display: flex;
  font-size: 14.5px;
  gap: 7px;
}

.panel-note {
  color: var(--text-3);
  font-size: 11.5px;
}

/* —— 工具栏 —— */
.bar {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.bar-input {
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid var(--line);
  border-radius: 7px;
  flex: 1;
  font-size: 12.5px;
  height: 34px;
  min-width: 180px;
  outline: none;
  padding: 0 12px;
}

.bar-input:focus {
  background: rgba(0, 0, 0, 0.42);
  border-color: var(--line-strong);
}

.bar-input::placeholder {
  color: var(--text-3);
}

.bar-select {
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid var(--line);
  border-radius: 7px;
  font-size: 12.5px;
  height: 34px;
  outline: none;
  padding: 0 9px;
}

.bar-select:focus {
  border-color: var(--line-strong);
}

/* 下拉里的选项是系统渲染的，深色下必须显式给底色，否则白底白字 */
.bar-select option {
  background: #14171e;
  color: #eee;
}

.bar-reset {
  color: var(--accent);
  font-size: 12px;
  padding: 0 6px;
}

.bar-reset:hover {
  text-decoration: underline;
}

.bar-count {
  color: var(--text-3);
  font-size: 11.5px;
  margin-left: auto;
}

.bar-count b {
  color: var(--text-2);
  font-weight: 500;
}

/* —— 表格 —— */
.board {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
}

.row {
  align-items: center;
  display: grid;
  gap: 12px;
  grid-template-columns: 56px 104px minmax(0, 1fr) 84px 96px 56px;
  padding: 0 14px;
}

.row-head {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-3);
  font-size: 11px;
  height: 36px;
  letter-spacing: 0.03em;
}

.row-item {
  border-top: 1px solid var(--line);
  cursor: pointer;
  min-height: 46px;
  text-align: left;
  transition: background-color 0.18s ease;
  width: 100%;
}

.row-item:hover {
  background: var(--panel-hover);
}

.cell-idx {
  color: var(--text-3);
  font-family: ui-monospace, monospace;
  font-size: 11px;
}

.cell-title {
  align-items: center;
  display: flex;
  gap: 10px;
  min-width: 0;
}

.cell-title-text {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-tags {
  display: flex;
  flex: none;
  gap: 5px;
}

.cell-tag {
  color: var(--text-3);
  font-size: 10.5px;
}

.cell-date {
  color: var(--text-3);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

.cell-cites {
  color: var(--accent);
  font-size: 11.5px;
}

.ta-r {
  text-align: right;
}

.board-empty {
  border-top: 1px solid var(--line);
  color: var(--text-3);
  font-family: ui-monospace, monospace;
  font-size: 12px;
  padding: 40px;
  text-align: center;
}

@media (max-width: 1000px) {
  .row {
    grid-template-columns: 48px 92px minmax(0, 1fr) 78px 84px 44px;
    gap: 9px;
    padding: 0 11px;
  }
}

@media (max-width: 800px) {
  .panel {
    padding: 14px 14px 18px;
  }
  /* 窄屏藏掉日期和序号，保住标题和状态 —— 这两列是判断「要不要点开」的依据 */
  .row {
    grid-template-columns: 76px minmax(0, 1fr) 72px 40px;
  }
  .row > :nth-child(1),
  .row > :nth-child(5) {
    display: none;
  }
  .cell-tags {
    display: none;
  }
  .bar-count {
    margin-left: 0;
  }
}
</style>
