<script setup>
import { computed, ref } from 'vue'
import { categoryLabel } from '@/lib/parse'
import { useLibrary } from '@/composables/useLibrary'
import { extractPitfalls, filterPitfalls } from '@/lib/pitfalls'
import NoteBadge from '../NoteBadge.vue'

/**
 * 避坑智库
 * ---------------------------------------------------------------------------
 * 把所有笔记里的「放弃的方案 + 为什么放弃」摊平成一屏卡片。
 * 抽取逻辑在 `src/lib/pitfalls.js`，这里只管展示和筛选。
 */
const { state, citationsOf } = useLibrary()

const q = ref('')
const onlyRejected = ref(false)

const all = computed(() => extractPitfalls(state.notes, citationsOf))

const items = computed(() => {
  let list = filterPitfalls(all.value, q.value)
  if (onlyRejected.value) list = list.filter((it) => it.verdict.tone === 'no')
  return list
})

const stats = computed(() => ({
  total: all.value.length,
  notes: new Set(all.value.map((i) => i.noteId)).size,
  rejected: all.value.filter((i) => i.verdict.tone === 'no').length,
}))
</script>

<template>
  <section class="panel">
    <header class="panel-head">
      <span class="panel-title"><span aria-hidden="true">🛡️</span> 避坑智库</span>
      <span class="panel-note">
        从 {{ stats.notes }} 篇笔记里拆出 {{ stats.total }} 条备选方案 ——
        「为什么没选 B」比「选了 A」更容易忘，也更容易再踩一次
      </span>
    </header>

    <div class="bar">
      <input
        v-model="q"
        class="bar-input"
        type="text"
        placeholder="搜方案名、否决理由或来源笔记…（比如：Service Worker、Supabase、懒加载）"
        aria-label="检索避坑条目"
      />
      <button class="bar-toggle" :class="{ 'is-on': onlyRejected }" @click="onlyRejected = !onlyRejected">
        只看否决 <b>{{ stats.rejected }}</b>
      </button>
      <span class="bar-count">命中 <b>{{ items.length }}</b> 条</span>
    </div>

    <div v-if="items.length" class="grid">
      <article
        v-for="it in items"
        :key="it.key"
        class="dossier"
        :class="{ 'is-whole': it.whole }"
        :data-open-note="it.noteId"
      >
        <div class="ds-head">
          <NoteBadge kind="category" :value="it.category" compact />
          <span class="ds-verdict" :class="`tone-${it.verdict.tone}`">{{ it.verdict.label }}</span>
          <span v-if="citationsOf(it.noteId)" class="ds-cites">来源被引用 ↗{{ citationsOf(it.noteId) }}</span>
        </div>

        <div class="ds-name">
          <span class="ds-name-ico" aria-hidden="true">🚫</span>
          <span class="ds-name-text">{{ it.whole ? it.name : `放弃的备选：${it.name}` }}</span>
        </div>

        <p class="ds-reason">{{ it.reason }}</p>

        <div class="ds-foot">
          <span class="ds-foot-ico" aria-hidden="true">✅</span>
          <span class="ds-foot-text">{{ it.whole ? `已归入「已否决」分类` : `采纳：${it.note.title}` }}</span>
        </div>
      </article>
    </div>

    <div v-else class="panel-empty">
      {{ q || onlyRejected ? '// 没有命中任何避坑条目' : '// 还没有笔记写过「曾考虑的替代方案」段' }}
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

.panel-empty {
  color: var(--text-3);
  font-family: ui-monospace, monospace;
  font-size: 12px;
  padding: 46px;
  text-align: center;
}

/* —— 检索条 —— */
.bar {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}

.bar-input {
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid var(--line);
  border-radius: 7px;
  flex: 1;
  font-size: 12.5px;
  height: 34px;
  min-width: 200px;
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

.bar-toggle {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--line);
  border-radius: 7px;
  color: var(--text-2);
  flex: none;
  font-size: 12px;
  height: 34px;
  padding: 0 12px;
}

.bar-toggle:hover {
  background: var(--panel-hover);
  color: var(--text);
}

.bar-toggle.is-on {
  background: rgba(248, 113, 113, 0.14);
  border-color: rgba(248, 113, 113, 0.42);
  color: var(--st-rejected);
}

.bar-toggle b {
  color: var(--text-3);
  font-weight: 400;
}

.bar-toggle.is-on b {
  color: inherit;
  opacity: 0.75;
}

.bar-count {
  color: var(--text-3);
  flex: none;
  font-size: 11.5px;
}

.bar-count b {
  color: var(--text-2);
  font-weight: 500;
}

/* —— 卡片 —— */
.grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
}

.dossier {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 14px 15px;
  transition: background-color 0.2s ease, border-color 0.2s ease, transform 0.25s ease;
}

.dossier:hover {
  background: var(--panel-hover);
  border-color: var(--line-strong);
  transform: translateY(-2px);
}

/* 整篇被否决的用左侧红边标出来，和「某一条备选被否决」区分开 */
.dossier.is-whole {
  border-left: 3px solid rgba(248, 113, 113, 0.6);
}

.ds-head {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.ds-verdict {
  border-radius: 5px;
  font-size: 10.5px;
  line-height: 1;
  padding: 3px 6px;
}

.ds-verdict.tone-no {
  background: rgba(248, 113, 113, 0.16);
  border: 1px solid rgba(248, 113, 113, 0.36);
  color: var(--st-rejected);
}

.ds-verdict.tone-wait {
  background: rgba(251, 191, 36, 0.16);
  border: 1px solid rgba(251, 191, 36, 0.36);
  color: var(--st-proposed);
}

.ds-verdict.tone-yes {
  background: rgba(74, 222, 128, 0.16);
  border: 1px solid rgba(74, 222, 128, 0.36);
  color: var(--st-implemented);
}

.ds-verdict.tone-neutral {
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid var(--line);
  color: var(--text-3);
}

.ds-cites {
  color: var(--text-3);
  font-size: 10.5px;
  margin-left: auto;
}

.ds-name {
  align-items: flex-start;
  display: flex;
  gap: 7px;
}

.ds-name-ico {
  flex: none;
  font-size: 11px;
  padding-top: 2px;
}

.ds-name-text {
  color: #fff;
  font-size: 13.5px;
  line-height: 1.5;
}

.ds-reason {
  color: var(--text-2);
  font-size: 12.5px;
  line-height: 1.7;
}

.ds-foot {
  align-items: flex-start;
  border-top: 1px dashed var(--line);
  color: var(--text-3);
  display: flex;
  font-size: 11.5px;
  gap: 7px;
  margin-top: auto;
  padding-top: 9px;
}

.ds-foot-ico {
  flex: none;
  font-size: 10px;
  padding-top: 2px;
}

.ds-foot-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 900px) {
  .panel {
    padding: 14px 14px 18px;
  }
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
