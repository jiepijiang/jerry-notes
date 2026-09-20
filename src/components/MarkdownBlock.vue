<script setup>
import { computed } from 'vue'
import { renderMarkdown } from '@/lib/markdown'
import { useLibrary } from '@/composables/useLibrary'

/**
 * Markdown 正文渲染。
 * 链接里的 `[x](a.md)` 会被解析成站内笔记链接（带 data-note 属性），
 * 点击由 App.vue 统一的事件委托处理 —— 这样正文里、列表里、卡片里的链接
 * 走的是同一套逻辑，不用给每个渲染点单独挂 handler。
 */
const props = defineProps({
  text: { type: String, default: '' },
  /** 来源笔记 id，用于解析相对路径链接 */
  from: { type: String, default: '' },
})

const { resolveLink } = useLibrary()

const html = computed(() =>
  renderMarkdown(props.text, { resolveNote: (href) => resolveLink(href, props.from) })
)
</script>

<template>
  <div class="md" v-html="html" />
</template>
