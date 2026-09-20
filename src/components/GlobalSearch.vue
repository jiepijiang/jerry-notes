<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useLibrary } from '@/composables/useLibrary'
import { plainText } from '@/lib/markdown'
import NoteBadge from './NoteBadge.vue'

/**
 * 全局搜索
 * ---------------------------------------------------------------------------
 * 交互照参考站：`/` 聚焦、↑↓ 选择、↵ 打开、Esc 关闭。
 * 但**搜索范围比参考站宽** —— 参考站只搜 title/slug/problem/decision，
 * 这里把 tags、summary、全文 body 也算进去。
 * 理由是笔记数量在这个量级（几百篇）时，全文匹配的代价可以忽略，
 * 而「记得写过但忘了标题」恰恰是最常见的检索场景。
 *
 * 匹配结果按相关度排序：标题命中 > 标签命中 > 正文命中，同级再看被引用次数。
 */
const { state, citationsOf } = useLibrary()
const router = useRouter()

const q = ref('')
const open = ref(false)
const active = ref(-1)
const inputEl = ref(null)
const boxEl = ref(null)

const MAX = 8

const results = computed(() => {
  const needle = q.value.trim().toLowerCase()
  if (!needle) return []

  const scored = []
  for (const n of state.notes) {
    let score = 0
    if (n.title.toLowerCase().includes(needle)) score += 100
    if (n.tags.some((t) => t.toLowerCase().includes(needle))) score += 60
    if (n.slug.toLowerCase().includes(needle)) score += 40
    if ((n.summary || '').toLowerCase().includes(needle)) score += 30
    if (n.isDecision) {
      if (n.problem.toLowerCase().includes(needle)) score += 20
      if (n.decision.toLowerCase().includes(needle)) score += 20
      if (n.alternatives.toLowerCase().includes(needle)) score += 15
    }
    if (n.body.toLowerCase().includes(needle)) score += 10

    if (score > 0) scored.push({ note: n, score })
  }

  scored.sort((a, b) => b.score - a.score || citationsOf(b.note.id) - citationsOf(a.note.id))
  return scored.slice(0, MAX).map((s) => ({
    note: s.note,
    // 命中位置的一小段上下文，比只给标题有用得多
    excerpt: excerptOf(s.note, needle),
  }))
})

/** 从正文里截一小段包含关键词的上下文 */
function excerptOf(note, needle) {
  const hay = note.isDecision ? `${note.problem} ${note.decision} ${note.alternatives}` : note.body
  const idx = hay.toLowerCase().indexOf(needle)
  if (idx < 0) return plainText(note.summary || note.problem || note.decision, 60)
  const start = Math.max(0, idx - 24)
  return `${start > 0 ? '…' : ''}${plainText(hay.slice(start, idx + needle.length + 40), 90)}`
}

function openNote(id) {
  open.value = false
  q.value = ''
  router.push({ query: { ...router.currentRoute.value.query, note: id } })
}

function move(step) {
  const n = results.value.length
  if (!n) return
  active.value = (active.value + step + n) % n
}

function onKeydown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    move(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    move(-1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (active.value >= 0 && results.value[active.value]) openNote(results.value[active.value].note.id)
    else if (results.value.length === 1) openNote(results.value[0].note.id)
    else {
      // 没选中也没唯一结果 → 跳到全部笔记并带上关键词
      open.value = false
      router.push({ path: '/all', query: { q: q.value.trim() } })
      q.value = ''
    }
  } else if (e.key === 'Escape') {
    open.value = false
    inputEl.value?.blur()
  }
}

function onDocKey(e) {
  // `/` 聚焦（不在输入框里时）。别用 Ctrl/Cmd+K —— 浏览器和系统都占了
  if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) {
    e.preventDefault()
    inputEl.value?.focus()
  }
}

function onDocClick(e) {
  if (!boxEl.value?.contains(e.target)) open.value = false
}

watch(q, () => {
  open.value = Boolean(q.value.trim())
  active.value = -1
})

onMounted(() => {
  document.addEventListener('keydown', onDocKey)
  document.addEventListener('click', onDocClick)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocKey)
  document.removeEventListener('click', onDocClick)
})

// 结果列表更新后把选中项滚进视野
watch(active, async () => {
  await nextTick()
  boxEl.value?.querySelector('.gs-item.is-active')?.scrollIntoView({ block: 'nearest' })
})

defineExpose({ focus: () => inputEl.value?.focus() })
</script>

<template>
  <div ref="boxEl" class="gs">
    <div class="gs-field" :class="{ 'is-open': open }">
      <svg class="gs-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref="inputEl"
        v-model="q"
        class="gs-input"
        type="text"
        placeholder="搜索标题、标签或正文…"
        aria-label="搜索笔记"
        @keydown="onKeydown"
        @focus="open = Boolean(q.trim())"
      />
      <kbd v-if="!q" class="gs-kbd">/</kbd>
      <button v-else class="gs-clear" title="清空" @click="q = ''">✕</button>
    </div>

    <div v-if="open" class="gs-pop">
      <template v-if="results.length">
        <button
          v-for="(r, i) in results"
          :key="r.note.id"
          class="gs-item"
          :class="{ 'is-active': i === active }"
          @click="openNote(r.note.id)"
          @mouseenter="active = i"
        >
          <span class="gs-item-main">
            <span class="gs-item-title">{{ r.note.title }}</span>
            <span class="gs-item-excerpt">{{ r.excerpt }}</span>
          </span>
          <span class="gs-item-side">
            <NoteBadge kind="status" :value="r.note.status" compact />
            <span v-if="citationsOf(r.note.id)" class="gs-cites">↗{{ citationsOf(r.note.id) }}</span>
          </span>
        </button>
        <div class="gs-foot">
          <span>共 <b>{{ results.length }}</b> 条{{ results.length >= MAX ? '（只显示前 8 条）' : '' }}</span>
          <span>↵ 打开 · ↑↓ 切换</span>
        </div>
      </template>
      <div v-else class="gs-empty">没有匹配「{{ q.trim() }}」的笔记</div>
    </div>
  </div>
</template>

<style scoped>
.gs {
  position: relative;
  width: 280px;
}

.gs-field {
  align-items: center;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid var(--line);
  border-radius: 7px;
  display: flex;
  gap: 7px;
  height: 34px;
  padding: 0 10px;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.gs-field:focus-within,
.gs-field.is-open {
  background: rgba(0, 0, 0, 0.42);
  border-color: var(--line-strong);
}

.gs-ico {
  color: var(--text-3);
  flex: none;
  height: 14px;
  width: 14px;
}

.gs-input {
  background: none;
  border: 0;
  flex: 1;
  font-size: 13px;
  min-width: 0;
  outline: none;
}

.gs-input::placeholder {
  color: var(--text-3);
}

.gs-kbd {
  border: 1px solid var(--line);
  border-radius: 4px;
  color: var(--text-3);
  flex: none;
  font-family: ui-monospace, monospace;
  font-size: 10px;
  line-height: 1;
  padding: 3px 5px;
}

.gs-clear {
  color: var(--text-3);
  flex: none;
  font-size: 11px;
  padding: 2px 4px;
}

.gs-clear:hover {
  color: var(--text);
}

.gs-pop {
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  background: var(--panel-solid);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-lg);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5);
  left: 0;
  max-height: 420px;
  overflow-y: auto;
  padding: 6px;
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  z-index: 60;
}

.gs-item {
  align-items: center;
  border-radius: 7px;
  display: flex;
  gap: 10px;
  padding: 9px 10px;
  text-align: left;
  width: 100%;
}

.gs-item.is-active {
  background: var(--panel-hover);
}

.gs-item-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.gs-item-title {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-item-excerpt {
  color: var(--text-3);
  font-size: 11.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-item-side {
  align-items: flex-end;
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 4px;
}

.gs-cites {
  color: var(--text-3);
  font-size: 10.5px;
}

.gs-foot {
  border-top: 1px solid var(--line);
  color: var(--text-3);
  display: flex;
  font-size: 11px;
  justify-content: space-between;
  margin-top: 4px;
  padding: 8px 10px 4px;
}

.gs-empty {
  color: var(--text-3);
  font-size: 12.5px;
  padding: 22px;
  text-align: center;
}

@media (max-width: 900px) {
  .gs {
    width: 100%;
  }
}
</style>
