import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { copyFileSync, existsSync } from 'node:fs'
import path from 'node:path'

/*
 * GitHub Pages 子路径适配。换仓库名只需要改这一行。
 * 与 jerry-site / jerry-tools 保持同一套写法。
 */
const REPO_NAME = 'jerry-notes'

/*
 * Pages 没有 SPA fallback：直接打开 /jerry-notes/notes/xxx 或刷新会 404。
 * 官方做法是额外给一份 404.html（内容同 index.html），Pages 找不到路径时回退到它。
 * 输出目录从 configResolved 取，避免 `--outDir` 时写错地方。
 */
function spaFallbackPlugin() {
  let outDir = null
  return {
    name: 'spa-404-fallback',
    apply: 'build',
    configResolved(config) {
      const dir = config.build.outDir
      outDir = path.isAbsolute(dir) ? dir : path.resolve(config.root, dir)
    },
    closeBundle() {
      if (!outDir) return
      const index = path.join(outDir, 'index.html')
      if (existsSync(index)) copyFileSync(index, path.join(outDir, '404.html'))
    },
  }
}

export default defineConfig(({ command }) => ({
  base: command === 'build' ? `/${REPO_NAME}/` : '/',
  plugins: [vue(), spaFallbackPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5175,
    host: '127.0.0.1',
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
}))
