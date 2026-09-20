import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

import './styles/root.css'
import './styles/base.css'
/* 正文样式必须是全局的 —— v-html 插进来的内容拿不到 scoped 的 scope 属性 */
import './styles/markdown.css'

createApp(App).use(router).mount('#app')
