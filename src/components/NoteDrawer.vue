<script setup>
import { computed, ref, watch } from 'vue'
import { QUAD_META } from '@/lib/parse'
import { useLibrary } from '@/composables/useLibrary'
import NoteBadge from './NoteBadge.vue'
import MarkdownBlock from './MarkdownBlock.vue'

/**
 * 详情抽屉
 * ---------------------------------------------------------------------------
 * 两种笔记形态用同一套骨架渲染：
 *   - ADR 式：四段（问题 / 决策 / 备选 / 后果）+ 血缘链路
 *   - 普通笔记：正文分段（sections）+ 血缘链路
 * 判断依据是 `note.isDecision`，不是「有没有四段内容」——
 * 有些 ADR 只写了问题就搁置了，那也该按 ADR 的样式展示。
 */
const props = defineProps({
  noteId: { type: String, default: '' },
})

const emit = defineEmits(['close', 'open'])

const { state, citationsOf, incomingOf, outgoingOf } = useLibrary()

const note = computed(() => (props.noteId ? state.byId.get(props.noteId) || null : null))
const incoming = computed(() => (note.value ? incomingOf(note.value) : []))
const outgoing = computed(() => (note.value ? outgoingOf(note.value) : []))

/** 四段里真正有内容的那些 */
const quad = computed(() =>
  QUAD_META.map((m) => ({ ...m, body: note.value?.[m.key] || '' })).filter((m) => m.body)
)

/** 复制锚点注释：贴回代码里当反向索引 */
const copied = ref(false)
const anchor = computed(() => (note.value ? `// Note: 见 notes/${note.value.id}` : ''))

async function copyAnchor() {
  const text = anchor.value
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // 非安全上下文 / 无剪贴板权限时的兜底
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}

/** 打开新笔记时把抽屉内容滚回顶部 */
watch(
  () => props.noteId,
  (v) => {
    if (v) document.querySelector('.dw-body')?.scrollTo({ top: 0 })
  }
)
</script>

<template>
  <Teleport to="body">
    <Transition name="curtain">
      <div v-if="note" class="curtain" @click="emit('close')" />
    </Transition>

    <Transition name="drawer">
      <aside v-if="note" class="dw" role="dialog" aria-modal="true" :aria-label="note.title">
        <header class="dw-head">
          <NoteBadge kind="status" :value="note.status" />
          <NoteBadge kind="category" :value="note.category" />
          <span class="dw-grow" />
          <button class="dw-close" title="关闭 (Esc)" @click="emit('close')">✕</button>
        </header>

        <div class="dw-body">
          <button class="dw-anchor" :title="anchor" @click="copyAnchor">
            <code>{{ anchor }}</code>
            <span class="dw-anchor-btn">{{ copied ? '已复制' : '复制反向注释' }}</span>
          </button>

          <h1 class="dw-title">{{ note.title }}</h1>

          <div class="dw-meta">
            <span>{{ note.date || '无日期' }}</span>
            <span class="dw-sep">·</span>
            <span class="dw-slug">{{ note.slug }}</span>
            <template v-if="citationsOf(note.id)">
              <span class="dw-sep">·</span>
              <span class="dw-cites">被引用 {{ citationsOf(note.id) }} 次</span>
            </template>
            <template v-if="note.tags.length">
              <span class="dw-sep">·</span>
              <span class="dw-tags">
                <span v-for="t in note.tags" :key="t" class="dw-tag">#{{ t }}</span>
              </span>
            </template>
          </div>

          <p v-if="note.summary" class="dw-summary">{{ note.summary }}</p>

          <!-- ADR 式：四段 -->
          <template v-if="note.isDecision">
            <section v-for="m in quad" :key="m.key" class="dw-sec" :class="`sec-${m.key}`">
              <h2 class="dw-sec-title">
                <span class="dw-sec-ico" aria-hidden="true">{{ m.icon }}</span>
                <span>{{ m.title }}</span>
              </h2>
              <MarkdownBlock :text="m.body" :from="note.id" />
            </section>

            <section v-if="!quad.length" class="dw-sec">
              <div class="dw-muted">这篇被识别成决策记录，但四段都是空的 —— 看看正文写在哪了。</div>
            </section>
          </template>

          <!-- 普通笔记：按原段落展示 -->
          <template v-else>
            <section v-for="(s, i) in note.sections" :key="i" class="dw-sec">
              <h2 class="dw-sec-title">
                <span class="dw-sec-ico" aria-hidden="true">§</span>
                <span>{{ s.title }}</span>
              </h2>
              <MarkdownBlock :text="s.content" :from="note.id" />
            </section>
            <section v-if="!note.sections.length" class="dw-sec">
              <MarkdownBlock :text="note.body" :from="note.id" />
            </section>
          </template>

          <!-- 血缘链路 -->
          <section class="dw-sec dw-lineage">
            <h2 class="dw-sec-title">
              <span class="dw-sec-ico" aria-hidden="true">🔗</span>
              <span>因果与血缘链路</span>
            </h2>

            <div v-if="outgoing.length" class="dw-lin-group">
              <div class="dw-lin-label">前置依据（这篇引用了）</div>
              <div class="dw-chips">
                <button
                  v-for="o in outgoing"
                  :key="o.id"
                  class="dw-chip"
                  :title="o.title"
                  @click="emit('open', o.id)"
                >
                  <span class="dw-chip-ico">↖</span>
                  <span class="dw-chip-text">{{ o.title }}</span>
                </button>
              </div>
            </div>

            <div v-if="incoming.length" class="dw-lin-group">
              <div class="dw-lin-label">派生影响（引用了这篇）</div>
              <div class="dw-chips">
                <button
                  v-for="o in incoming"
                  :key="o.id"
                  class="dw-chip"
                  :title="o.title"
                  @click="emit('open', o.id)"
                >
                  <span class="dw-chip-ico">↘</span>
                  <span class="dw-chip-text">{{ o.title }}</span>
                </button>
              </div>
            </div>

            <div v-if="!incoming.length && !outgoing.length" class="dw-muted">
              独立节点，暂时没有和其它笔记互相引用。
            </div>
          </section>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.curtain {
  background: rgba(0, 0, 0, 0.5);
  inset: 0;
  position: fixed;
  z-index: 90;
}

.dw {
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  background: var(--panel-solid);
  border-left: 1px solid var(--line-strong);
  box-shadow: -20px 0 60px rgba(0, 0, 0, 0.55);
  display: flex;
  flex-direction: column;
  height: 100%;
  max-width: 96vw;
  position: fixed;
  right: 0;
  top: 0;
  width: var(--drawer-w);
  z-index: 100;
}

.dw-head {
  align-items: center;
  border-bottom: 1px solid var(--line);
  display: flex;
  flex: none;
  gap: 8px;
  padding: 13px 18px;
}

.dw-grow {
  flex: 1;
}

.dw-close {
  border-radius: 6px;
  color: var(--text-2);
  font-size: 14px;
  height: 28px;
  line-height: 1;
  width: 28px;
}

.dw-close:hover {
  background: var(--panel-hover);
  color: var(--text);
}

.dw-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 26px 60px;
}

/* —— 可复制的反向注释锚点 —— */
.dw-anchor {
  align-items: center;
  background: rgba(0, 0, 0, 0.3);
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius);
  display: flex;
  gap: 10px;
  margin-bottom: 18px;
  padding: 9px 12px;
  text-align: left;
  width: 100%;
}

.dw-anchor code {
  color: var(--text-2);
  flex: 1;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 11.5px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dw-anchor-btn {
  border: 1px solid var(--line-strong);
  border-radius: 5px;
  color: var(--accent);
  flex: none;
  font-size: 11px;
  padding: 3px 8px;
}

.dw-anchor:hover .dw-anchor-btn {
  background: var(--accent-soft);
}

.dw-title {
  font-size: 23px;
  font-weight: 500;
  line-height: 1.4;
  margin-bottom: 12px;
}

.dw-meta {
  align-items: center;
  color: var(--text-3);
  display: flex;
  flex-wrap: wrap;
  font-size: 12px;
  gap: 6px;
  margin-bottom: 14px;
}

.dw-sep {
  opacity: 0.5;
}

.dw-slug {
  font-family: ui-monospace, monospace;
  font-size: 11px;
}

.dw-cites {
  color: var(--accent);
}

.dw-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.dw-tag {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  padding: 1px 6px;
}

.dw-summary {
  border-left: 3px solid var(--accent);
  color: var(--text-2);
  font-size: 13px;
  margin-bottom: 20px;
  padding: 3px 0 3px 12px;
}

/* —— 段落 —— */
.dw-sec {
  margin-bottom: 24px;
}

.dw-sec-title {
  align-items: center;
  color: #fff;
  display: flex;
  font-size: 13.5px;
  font-weight: 500;
  gap: 7px;
  letter-spacing: 0.02em;
  margin-bottom: 10px;
  padding-bottom: 7px;
  border-bottom: 1px solid var(--line);
}

.dw-sec-ico {
  font-size: 12px;
}

/* 备选段用暖色，和「决策」形成视觉对比 —— 这一段的语义就是「没选的那些」 */
.sec-alternatives .dw-sec-title {
  border-bottom-color: rgba(248, 113, 113, 0.24);
}

.sec-alternatives {
  background: rgba(248, 113, 113, 0.05);
  border-radius: var(--radius);
  padding: 14px 16px;
}

.dw-lineage {
  border-top: 1px solid var(--line);
  margin-top: 30px;
  padding-top: 20px;
}

.dw-lin-group + .dw-lin-group {
  margin-top: 14px;
}

.dw-lin-label {
  color: var(--text-3);
  font-size: 11.5px;
  margin-bottom: 7px;
}

.dw-chips {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dw-chip {
  align-items: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--line);
  border-radius: 6px;
  display: flex;
  gap: 8px;
  padding: 7px 10px;
  text-align: left;
  transition: background-color 0.2s ease, border-color 0.2s ease;
  width: 100%;
}

.dw-chip:hover {
  background: var(--panel-hover);
  border-color: var(--line-strong);
}

.dw-chip-ico {
  color: var(--accent);
  flex: none;
  font-size: 11px;
}

.dw-chip-text {
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dw-muted {
  color: var(--text-3);
  font-size: 12.5px;
}

/* —— 过渡 —— */
.curtain-enter-active,
.curtain-leave-active {
  transition: opacity 0.25s ease;
}
.curtain-enter-from,
.curtain-leave-to {
  opacity: 0;
}

.drawer-enter-active,
.drawer-leave-active {
  transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}
.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(100%);
}

@media (max-width: 820px) {
  .dw {
    border-left: 0;
    width: 100%;
  }
  .dw-body {
    padding: 16px 16px 60px;
  }
  .dw-title {
    font-size: 19px;
  }
}
</style>
