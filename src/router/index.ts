import { createRouter, createWebHistory } from '@ionic/vue-router';
import { RouteRecordRaw } from 'vue-router';
import HomePage from '../views/home-page/HomePage.vue'
import InstructionsForUsePage from '../views/instructions-for-use/index.vue'

const routes: Array<RouteRecordRaw> = [
  /**
   * 使用 alias 而非 redirect，避免 `/` → `/home` 多一次导航，
   * Ionic IonRouterOutlet 在开发与 HMR 下易出现视图栈与 scoped 样式不同步（表现为“样式丢失”，需手动进 /home 才恢复）。
   */
  {
    path: '/',
    alias: '/home',
    name: 'Home',
    component: HomePage,
  },
  {
    path: '/instructions-for-use',
    name: 'InstructionsForUse',
    component: InstructionsForUsePage,
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

export default router
