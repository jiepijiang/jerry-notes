<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLibrary } from '@/composables/useLibrary'
import TopBar from '@/components/TopBar.vue'
import NoteDrawer from '@/components/NoteDrawer.vue'

const { state, boot, startAutoSync } = useLibrary()
const route = useRoute()
const router = useRouter()

const ready = ref(false)

const noteId = computed(() => (typeof route.query.note === 'string' ? route.query.note : ''))
/** 路由里的 note 已经不存在时（比如切到本地目录后笔记没了），不渲染抽屉 */
const activeNoteId = computed(() => (state.byId.has(noteId.value) ? noteId.value : ''))

function openNote(id) {
  router.push({ query: { ...route.query, note: id } })
}

function closeNote() {
  const q = { ...route.query }
  delete q.note
  router.push({ query: q })
}

/**
 * 全局事件委托。
 * 正文里的笔记链接（`.md-note-link[data-note]`）和卡片上的打开按钮都走这里 ——
 * 不用给每个渲染点单独挂 handler，也自然覆盖了 v-html 生成的内容。
 */
function onDocClick(e) {
  const link = e.target.closest?.('.md-note-link[data-note]')
  if (link) {
    e.preventDefault()
    openNote(link.dataset.note)
    return
  }
  const opener = e.target.closest?.('[data-open-note]')
  if (opener) {
    e.preventDefault()
    openNote(opener.dataset.openNote)
  }
}

function onKeydown(e) {
  if (e.key === 'Escape' && activeNoteId.value) closeNote()
}

onMounted(async () => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKeydown)
  await boot()
  startAutoSync()
  ready.value = true
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <TopBar />

  <main class="main">
    <div v-if="state.status === 'loading'" class="notice">正在读取笔记…</div>

    <div v-else-if="state.status === 'error'" class="notice is-error">
      <div class="notice-title">读不到笔记数据</div>
      <div class="notice-body">{{ state.error }}</div>
    </div>

    <div v-else-if="!state.notes.length" class="notice">
      <div class="notice-title">这里还没有笔记</div>
      <div class="notice-body">
        往仓库的 <code>notes/</code> 目录里放几篇 markdown，然后跑一次
        <code>npm run notes</code>；或者点右上角「连接本地目录」，
        直接读本地文件夹里的 markdown。
      </div>
    </div>

    <template v-else>
      <div v-if="state.error" class="banner">{{ state.error }}</div>
      <RouterView v-slot="{ Component }">
        <component :is="Component" />
      </RouterView>
    </template>
  </main>

  <footer class="foot">
    <span>
      {{ state.notes.length }} 篇笔记 ·
      {{ state.source === 'local' ? `本地目录「${state.dirName}」` : '内置数据' }}
    </span>
    <!-- 三站互链的收口：主站 ⇄ 导航站 ⇄ 知识库。
         主站和导航站都各自链到了本站，本站此前只回链主站，
         从知识库想去导航站只能先回主站绕一圈。 -->
    <span class="foot-right">
      <a href="https://jiepijiang.github.io/jerry-site/" target="_blank" rel="noopener noreferrer">
        主站
      </a>
      <span class="foot-sep" aria-hidden="true">·</span>
      <a href="https://jiepijiang.github.io/jerry-tools/" target="_blank" rel="noopener noreferrer">
        导航站
      </a>
    </span>
  </footer>

  <NoteDrawer :note-id="activeNoteId" @close="closeNote" @open="openNote" />
</template>

<style scoped>
.main {
  margin: 0 auto;
  max-width: 1360px;
  min-height: calc(100vh - var(--topbar-h) - 60px);
  padding: 24px 20px 40px;
}

.notice {
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  color: var(--text-2);
  margin: 60px auto;
  max-width: 560px;
  padding: 28px 30px;
  text-align: center;
}

.notice.is-error {
  border-color: rgba(248, 113, 113, 0.4);
}

.notice-title {
  color: #fff;
  font-size: 15px;
  margin-bottom: 8px;
}

.notice-body {
  font-size: 13px;
  line-height: 1.8;
}

.notice-body code {
  background: rgba(255, 255, 255, 0.09);
  border-radius: 4px;
  color: #ffd9a0;
  font-family: ui-monospace, monospace;
  font-size: 0.9em;
  padding: 1px 5px;
}

.banner {
  background: rgba(251, 191, 36, 0.12);
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: var(--radius);
  color: var(--st-proposed);
  font-size: 12.5px;
  margin-bottom: 18px;
  padding: 9px 14px;
}

.foot {
  align-items: center;
  border-top: 1px solid var(--line);
  color: var(--text-3);
  display: flex;
  font-size: 11.5px;
  justify-content: space-between;
  margin: 0 auto;
  max-width: 1360px;
  padding: 16px 20px 24px;
}

.foot-right {
  align-items: center;
  display: flex;
  gap: 8px;
}

.foot-sep {
  color: var(--text-3);
}

.foot-right a {
  color: var(--accent);
}

.foot-right a:hover {
  text-decoration: underline;
}

@media (max-width: 900px) {
  .main {
    padding: 16px 14px 30px;
  }
  .foot {
    padding: 14px 14px 22px;
  }
}
</style>
