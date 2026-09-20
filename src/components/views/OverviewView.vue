<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { CATEGORIES, STATUSES } from '@/lib/parse'
import { plainText } from '@/lib/markdown'
import { useLibrary } from '@/composables/useLibrary'
import NoteBadge from '../NoteBadge.vue'

/**
 * 概览
 * ---------------------------------------------------------------------------
 * 三块：KPI 仪表 → 承重墙 → 分类阵列。
 *
 * 和参考站的差别：**KPI 是动态的**。参考站固定四张（落地 / 提案 / 否决 / 裁撤），
 * 因为它的数据只有那四种 lifecycle。这里多了一个「随手记」兜底状态，
 * 而且分类也允许自定义 —— 写死张数会让新增的状态直接不显示。
 */
const { state, pillars, citationsOf } = useLibrary()
const router = useRouter()

/** 只显示数据里真实存在的状态，避免出现一排 0 */
const kpis = computed(() =>
  STATUSES.map((s) => ({
    ...s,
    count: state.notes.filter((n) => n.status === s.key).length,
  })).filter((s) => s.count > 0)
)

/** 决策类笔记数（进「避坑智库」的那些） */
const decisionCount = computed(() => state.notes.filter((n) => n.isDecision).length)

/** 分类阵列：已知分类 + 数据里出现的自定义分类 */
const chambers = computed(() => {
  const list = [...CATEGORIES]
  for (const key of state.extraCategories) list.push({ key, label: key, icon: '🏷️' })
  // 未分类只在真的有内容时才占一格
  if (state.notes.some((n) => n.category === 'uncategorized')) {
    list.push({ key: 'uncategorized', label: '未分类', icon: '📄' })
  }
  return list.map((c) => ({
    ...c,
    notes: state.notes.filter((n) => n.category === c.key),
  }))
})

function summaryOf(n, max = 130) {
  return plainText(n.summary || n.problem || n.decision || n.body, max)
}

function goStatus(key) {
  router.push({ path: '/all', query: { status: key } })
}

function goCategory(key) {
  router.push({ path: '/all', query: { category: key } })
}
</script>

<template>
  <div class="ov">
    <!-- ① KPI -->
    <div class="kpis" :style="{ '--n': Math.min(kpis.length, 5) }">
      <button v-for="k in kpis" :key="k.key" class="kpi" @click="goStatus(k.key)">
        <span class="kpi-top">
          <span class="kpi-label">{{ k.label }}</span>
          <span class="kpi-dot" :style="{ background: k.color }" />
        </span>
        <span class="kpi-num">{{ k.count }}</span>
        <span class="kpi-desc">{{ k.desc }}</span>
        <span class="kpi-bar" :style="{ background: k.color }" />
      </button>
    </div>

    <!-- ② 承重墙 -->
    <section class="panel">
      <header class="panel-head">
        <span class="panel-title"><span aria-hidden="true">🏛️</span> 承重墙</span>
        <span class="panel-note">按被引用次数排 —— 引它最多的，就是这套东西的地基</span>
      </header>

      <div v-if="pillars.length" class="pillars">
        <button
          v-for="n in pillars"
          :key="n.id"
          class="pillar"
          :data-open-note="n.id"
        >
          <span class="pillar-head">
            <NoteBadge kind="category" :value="n.category" compact />
            <span class="pillar-cites">被引用 × {{ citationsOf(n.id) }}</span>
          </span>
          <span class="pillar-title">{{ n.title }}</span>
          <span class="pillar-abs">{{ summaryOf(n, 110) }}</span>
          <span class="pillar-foot">
            <span>{{ n.date || '无日期' }}</span>
            <span class="pillar-slug">{{ n.slug }}</span>
          </span>
        </button>
      </div>
      <div v-else class="panel-empty">
        还没有笔记之间互相引用。在正文里写 <code>[文字](另一篇.md)</code> 就会连起来。
      </div>
    </section>

    <!-- ③ 分类阵列 -->
    <section class="panel">
      <header class="panel-head">
        <span class="panel-title"><span aria-hidden="true">🧩</span> 分类阵列</span>
        <span class="panel-note">
          共 {{ state.notes.length }} 篇，其中 {{ decisionCount }} 篇是决策记录（有「问题 / 决策 / 备选 / 后果」四段）
        </span>
      </header>

      <div class="chambers">
        <div v-for="c in chambers" :key="c.key" class="chamber">
          <button class="chamber-head" @click="goCategory(c.key)">
            <span class="chamber-name"><span aria-hidden="true">{{ c.icon }}</span>{{ c.label }}</span>
            <span class="chamber-count">{{ c.notes.length }}</span>
          </button>
          <div class="chamber-list">
            <button
              v-for="n in c.notes"
              :key="n.id"
              class="chamber-item"
              :data-open-note="n.id"
              :title="n.title"
            >
              <span class="chamber-item-title">{{ n.title }}</span>
              <span class="chamber-item-meta">
                <span>{{ n.date || '—' }}</span>
                <span v-if="citationsOf(n.id)" class="chamber-item-cites">↗{{ citationsOf(n.id) }}</span>
              </span>
            </button>
            <div v-if="!c.notes.length" class="chamber-empty">// 这一类还没有笔记</div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ov {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

/* —— KPI —— */
.kpis {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(var(--n, 4), minmax(0, 1fr));
}

.kpi {
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: hidden;
  padding: 16px 18px 18px;
  position: relative;
  text-align: left;
  transition: border-color 0.2s ease, transform 0.25s ease;
}

.kpi:hover {
  border-color: var(--line-strong);
  transform: translateY(-2px);
}

.kpi-top {
  align-items: center;
  color: var(--text-2);
  display: flex;
  font-size: 12.5px;
  justify-content: space-between;
}

.kpi-dot {
  border-radius: 50%;
  height: 7px;
  width: 7px;
}

.kpi-num {
  color: #fff;
  font-size: 30px;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
  margin-top: 2px;
}

.kpi-desc {
  color: var(--text-3);
  font-size: 11.5px;
}

.kpi-bar {
  bottom: 0;
  height: 2px;
  left: 0;
  opacity: 0.75;
  position: absolute;
  right: 0;
}

/* —— 面板 —— */
.panel {
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 18px 20px 20px;
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
  font-size: 12.5px;
  padding: 26px;
  text-align: center;
}

.panel-empty code {
  background: rgba(255, 255, 255, 0.09);
  border-radius: 4px;
  color: #ffd9a0;
  font-family: ui-monospace, monospace;
  padding: 1px 5px;
}

/* —— 承重墙 —— */
.pillars {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
}

.pillar {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 14px 15px;
  text-align: left;
  transition: background-color 0.2s ease, border-color 0.2s ease, transform 0.25s ease;
}

.pillar:hover {
  background: var(--panel-hover);
  border-color: var(--line-strong);
  transform: translateY(-2px);
}

.pillar-head {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
}

.pillar-cites {
  color: var(--accent);
  flex: none;
  font-size: 11px;
}

.pillar-title {
  color: #fff;
  font-size: 14px;
  line-height: 1.5;
}

.pillar-abs {
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.65;
}

.pillar-foot {
  color: var(--text-3);
  display: flex;
  font-size: 10.5px;
  gap: 10px;
  margin-top: 2px;
}

.pillar-slug {
  font-family: ui-monospace, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* —— 分类阵列 —— */
.chambers {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
}

.chamber {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  max-height: 340px;
}

.chamber-head {
  align-items: center;
  border-bottom: 1px solid var(--line);
  display: flex;
  flex: none;
  gap: 8px;
  justify-content: space-between;
  padding: 10px 13px;
  width: 100%;
}

.chamber-head:hover {
  background: var(--panel-hover);
}

.chamber-name {
  align-items: center;
  display: flex;
  font-size: 12.5px;
  gap: 6px;
}

.chamber-count {
  color: var(--text-3);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.chamber-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  overflow-y: auto;
  padding: 5px;
}

.chamber-item {
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 7px 9px;
  text-align: left;
  width: 100%;
}

.chamber-item:hover {
  background: var(--panel-hover);
}

.chamber-item-title {
  font-size: 12.5px;
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.chamber-item-meta {
  color: var(--text-3);
  display: flex;
  font-size: 10.5px;
  gap: 8px;
}

.chamber-item-cites {
  color: var(--accent);
}

.chamber-empty {
  color: var(--text-3);
  font-family: ui-monospace, monospace;
  font-size: 11px;
  padding: 12px 9px;
}

@media (max-width: 900px) {
  .kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .panel {
    padding: 14px 14px 16px;
  }
  .pillars,
  .chambers {
    grid-template-columns: 1fr;
  }
  .chamber {
    max-height: none;
  }
}
</style>
