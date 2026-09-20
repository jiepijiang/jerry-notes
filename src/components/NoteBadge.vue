<script setup>
import { computed } from 'vue'
import { statusLabel, categoryLabel, categoryIcon } from '@/lib/parse'

/**
 * 状态 / 分类徽章。两种形态共用一个组件，因为它们的尺寸、圆角、字号完全一致，
 * 差别只在配色 —— 拆成两个组件反而要复制一遍样式。
 */
const props = defineProps({
  kind: { type: String, default: 'status' }, // status | category
  value: { type: String, required: true },
  /** 分类徽章是否带 emoji 图标 */
  icon: { type: Boolean, default: true },
  /** 紧凑模式：字号再小一档，用于列表行 */
  compact: { type: Boolean, default: false },
})

const label = computed(() =>
  props.kind === 'status' ? statusLabel(props.value) : categoryLabel(props.value)
)
const iconChar = computed(() => (props.kind === 'category' && props.icon ? categoryIcon(props.value) : ''))
</script>

<template>
  <span
    class="badge"
    :class="[`badge--${kind}`, `v-${value}`, { 'is-compact': compact }]"
    :title="label"
  >
    <span v-if="iconChar" class="badge-ico" aria-hidden="true">{{ iconChar }}</span>
    <span class="badge-text">{{ label }}</span>
  </span>
</template>

<style scoped>
.badge {
  align-items: center;
  border: 1px solid transparent;
  border-radius: 5px;
  display: inline-flex;
  flex: none;
  font-size: 11px;
  font-weight: 500;
  gap: 4px;
  line-height: 1;
  padding: 3px 7px;
  white-space: nowrap;
}

.badge.is-compact {
  font-size: 10px;
  padding: 2px 5px;
}

.badge-ico {
  font-size: 10px;
  line-height: 1;
}

/*
 * 配色统一用「同一色相的浅底 + 亮字」，而不是实心块 ——
 * 深色毛玻璃面板上实心块太跳，一屏里十几个徽章会互相抢注意力。
 * 颜色取自 root.css 的 --st-* 变量，值来自 parse.js 的 STATUSES。
 */
.badge--status.v-implemented {
  background: rgba(74, 222, 128, 0.14);
  border-color: rgba(74, 222, 128, 0.32);
  color: var(--st-implemented);
}
.badge--status.v-proposed {
  background: rgba(251, 191, 36, 0.14);
  border-color: rgba(251, 191, 36, 0.32);
  color: var(--st-proposed);
}
.badge--status.v-rejected {
  background: rgba(248, 113, 113, 0.14);
  border-color: rgba(248, 113, 113, 0.32);
  color: var(--st-rejected);
}
.badge--status.v-archived {
  background: rgba(148, 163, 184, 0.14);
  border-color: rgba(148, 163, 184, 0.3);
  color: var(--st-archived);
}
.badge--status.v-note {
  background: rgba(96, 165, 250, 0.14);
  border-color: rgba(96, 165, 250, 0.32);
  color: var(--st-note);
}

/* 分类徽章统一中性色，靠 emoji 区分 —— 7 个分类各配一个色相会太花 */
.badge--category {
  background: rgba(255, 255, 255, 0.07);
  border-color: var(--line);
  color: var(--text-2);
}
</style>
