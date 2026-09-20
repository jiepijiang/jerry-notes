import { createRouter, createWebHistory } from 'vue-router'

import OverviewView from '@/components/views/OverviewView.vue'
import TimelineView from '@/components/views/TimelineView.vue'
import PitfallsView from '@/components/views/PitfallsView.vue'
import DirectoryView from '@/components/views/DirectoryView.vue'

/**
 * 四个视图各是一个路由；**详情抽屉不是路由，而是 `?note=<id>` 查询参数**。
 *
 * 为什么不做成 `/note/:id`：
 *   - 笔记 id 本身是个路径（`implemented/bug-fix/2026-09-20-x.md`），
 *     塞进 path 参数要么编码得很丑，要么用 catch-all 通配，两者都不如查询参数干净
 *   - 抽屉的语义就是「盖在当前视图上」，用查询参数正好表达这个关系：
 *     关掉抽屉后底下的视图还在，刷新也还在
 *   - 浏览器后退键天然能关掉抽屉
 */
const routes = [
  { path: '/', name: 'overview', component: OverviewView },
  { path: '/timeline', name: 'timeline', component: TimelineView },
  { path: '/pitfalls', name: 'pitfalls', component: PitfallsView },
  { path: '/all', name: 'directory', component: DirectoryView },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  // 与 jerry-site / jerry-tools 一致：走 Pages 的 404.html 做 SPA 回退
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, saved) {
    if (saved) return saved
    // 切视图时回到顶部；只是开关抽屉（query 变化）时保持滚动位置
    if (to.path !== from.path) return { top: 0 }
    return false
  },
})

export default router
