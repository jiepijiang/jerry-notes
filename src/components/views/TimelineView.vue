<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { CATEGORIES, categoryLabel } from '@/lib/parse'
import { plainText } from '@/lib/markdown'
import { useLibrary } from '@/composables/useLibrary'
import NoteBadge from '../NoteBadge.vue'

/**
 * 时间线
 * ---------------------------------------------------------------------------
 * 双维度切片（月份 × 分类），两个维度正交组合。
 * 和参考站的差别：**分类切片按数据里真实存在的分类生成**，不是写死 6 个 ——
 * 否则自定义分类的笔记在这里永远筛不出来。
 */
const { state, dated, citationsOf } = useLibrary()
const route = useRoute()

const month = ref('')
const category = ref('')

/** 支持从别的视图带筛选条件跳进来（比如概览点了某个分类） */
watch(
  () => route.query,
  (q) => {
    if (typeof q.category === 'string') category.value = q.category
    if (typeof q.month === 'string') month.value = q.month
  },
  { immediate: true }
)

const months = computed(() => {
  const map = new Map()
  for (const n of dated.value) {
    const mo = n.date.slice(0, 7)
    map.set(mo, (map.get(mo) || 0) + 1)
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
})

const usedCategories = computed(() => {
  const used = new Set(dated.value.map((n) => n.category))
  const list = CATEGORIES.filter((c) => used.has(c.key))
  for (const key of state.extraCategories) {
    if (used.has(key)) list.push({ key, label: key, icon: '🏷️' })
  }
  if (used.has('uncategorized')) list.push({ key: 'uncategorized', label: '未分类', icon: '📄' })
  return list
})

const filtered = computed(() =>
  dated.value.filter(
    (n) => (!month.value || n.date.startsWith(month.value)) && (!category.value || n.category === category.value)
  )
)

/** 按月份分组（保持倒序） */
const groups = computed(() => {
  const map = new Map()
  for (const n of filtered.value) {
    const mo = n.date.slice(0, 7)
    if (!map.has(mo)) map.set(mo, [])
    map.get(mo).push(n)
  }
  return [...map.entries()]
})

const hasFilter = computed(() => Boolean(month.value || category.value))

function reset() {
  month.value = ''
  category.value = ''
}
</script>

<template>
  <section class="panel">
    <header class="panel-head">
      <span class="panel-title"><span aria-hidden="true">⏱️</span> 演进时间线</span>
      <span class="panel-note">按日期倒序 —— 看这套东西是怎么一层层长出来的</span>
    </header>

    <div class="filters">
      <div class="filter-row">
        <span class="filter-label">月份</span>
        <div class="pills">
          <button class="pill" :class="{ 'is-on': !month }" @click="month = ''">
            全部 <b>{{ dated.length }}</b>
          </button>
          <button
            v-for="[mo, cnt] in months"
            :key="mo"
            class="pill"
            :class="{ 'is-on': month === mo }"
            @click="month = month === mo ? '' : mo"
          >
            {{ mo }} <b>{{ cnt }}</b>
          </button>
        </div>
      </div>

      <div class="filter-row">
        <span class="filter-label">分类</span>
        <div class="pills">
          <button class="pill" :class="{ 'is-on': !category }" @click="category = ''">
            全部 <b>{{ dated.length }}</b>
          </button>
          <button
            v-for="c in usedCategories"
            :key="c.key"
            class="pill"
            :class="{ 'is-on': category === c.key }"
            @click="category = category === c.key ? '' : c.key"
          >
            <span aria-hidden="true">{{ c.icon }}</span> {{ c.label }}
            <b>{{ dated.filter((n) => n.category === c.key).length }}</b>
          </button>
        </div>
      </div>

      <div class="filter-info">
        <span>
          {{ hasFilter ? '已切片' : '全周期' }} —— 共 <b>{{ filtered.length }}</b> 条
          <template v-if="hasFilter">
            （{{ [month, category ? categoryLabel(category) : ''].filter(Boolean).join(' · ') }}）
          </template>
        </span>
        <button v-if="hasFilter" class="filter-reset" @click="reset">重置筛选</button>
      </div>
    </div>

    <div v-if="groups.length" class="track">
      <div v-for="[mo, items] in groups" :key="mo" class="epoch">
        <div class="epoch-badge">{{ mo }} · {{ items.length }} 条</div>
        <div class="epoch-cards">
          <button
            v-for="n in items"
            :key="n.id"
            class="card"
            :data-open-note="n.id"
            :title="n.title"
          >
            <span class="card-line">
              <span class="card-date">{{ n.date }}</span>
              <NoteBadge kind="category" :value="n.category" compact />
              <NoteBadge kind="status" :value="n.status" compact />
              <span v-if="citationsOf(n.id)" class="card-cites">↗{{ citationsOf(n.id) }}</span>
            </span>
            <span class="card-title">{{ n.title }}</span>
            <span class="card-body">
              {{ plainText(n.summary || n.problem || n.decision || n.body, 150) }}
            </span>
          </button>
        </div>
      </div>
    </div>

    <div v-else class="panel-empty">// 这个切片组合下没有笔记</div>
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
  margin-bottom: 16px;
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

.panel-empty {
  color: var(--text-3);
  font-family: ui-monospace, monospace;
  font-size: 12px;
  padding: 46px;
  text-align: center;
}

/* —— 筛选 —— */
.filters {
  margin-bottom: 20px;
}

.filter-row {
  align-items: flex-start;
  display: flex;
  gap: 12px;
  margin-bottom: 10px;
}

.filter-label {
  color: var(--text-3);
  flex: none;
  font-size: 11.5px;
  padding-top: 5px;
  width: 30px;
}

.pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pill {
  align-items: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--line);
  border-radius: 14px;
  color: var(--text-2);
  display: flex;
  font-size: 11.5px;
  gap: 5px;
  padding: 4px 11px;
  transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
  white-space: nowrap;
}

.pill:hover {
  background: var(--panel-hover);
  color: var(--text);
}

.pill.is-on {
  background: var(--accent-soft);
  border-color: rgba(116, 123, 255, 0.5);
  color: #fff;
}

.pill b {
  color: var(--text-3);
  font-weight: 400;
}

.pill.is-on b {
  color: var(--text-2);
}

.filter-info {
  align-items: center;
  border-top: 1px dashed var(--line);
  color: var(--text-3);
  display: flex;
  font-size: 11.5px;
  justify-content: space-between;
  margin-top: 12px;
  padding-top: 10px;
}

.filter-info b {
  color: var(--text-2);
  font-weight: 500;
}

.filter-reset {
  color: var(--accent);
  font-size: 11.5px;
}

.filter-reset:hover {
  text-decoration: underline;
}

/* —— 时间轴 —— */
.track {
  position: relative;
}

/* 一条竖线串起所有月份 —— 让「时间线」这件事有个视觉锚点 */
.track::before {
  background: linear-gradient(
    to bottom,
    transparent,
    var(--line-strong) 40px,
    var(--line-strong) calc(100% - 40px),
    transparent
  );
  bottom: 0;
  content: '';
  left: 3px;
  position: absolute;
  top: 0;
  width: 1px;
}

.epoch {
  padding-bottom: 22px;
  padding-left: 26px;
  position: relative;
}

.epoch::before {
  background: var(--accent);
  border-radius: 50%;
  box-shadow: 0 0 0 3px rgba(116, 123, 255, 0.18);
  content: '';
  height: 7px;
  left: 0;
  position: absolute;
  top: 6px;
  width: 7px;
}

.epoch-badge {
  color: var(--text-2);
  font-size: 12.5px;
  margin-bottom: 10px;
}

.epoch-cards {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
}

.card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  text-align: left;
  transition: background-color 0.2s ease, border-color 0.2s ease, transform 0.25s ease;
}

.card:hover {
  background: var(--panel-hover);
  border-color: var(--line-strong);
  transform: translateY(-2px);
}

.card-line {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.card-date {
  color: var(--text-3);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.card-cites {
  color: var(--accent);
  font-size: 10.5px;
  margin-left: auto;
}

.card-title {
  color: #fff;
  font-size: 13.5px;
  line-height: 1.5;
}

.card-body {
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.65;
}

@media (max-width: 900px) {
  .panel {
    padding: 14px 14px 18px;
  }
  .filter-label {
    display: none;
  }
  .epoch-cards {
    grid-template-columns: 1fr;
  }
}
</style>
