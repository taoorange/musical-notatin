import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import App from './App.vue'
import router from './router';

import { IonicVue } from '@ionic/vue';

/* Core CSS required for Ionic components to work properly */
import '@ionic/vue/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';
import '@ionic/vue/css/typography.css';

/* Optional CSS utils that can be commented out */
import '@ionic/vue/css/padding.css';
import '@ionic/vue/css/float-elements.css';
import '@ionic/vue/css/text-alignment.css';
import '@ionic/vue/css/text-transformation.css';
import '@ionic/vue/css/flex-utils.css';
import '@ionic/vue/css/display.css';

/**
 * Ionic Dark Mode
 * -----------------------------------------------------
 * For more info, please see:
 * https://ionicframework.com/docs/theming/dark-mode
 */

/* @import '@ionic/vue/css/palettes/dark.always.css'; */
/* @import '@ionic/vue/css/palettes/dark.class.css'; */
/* 不使用 dark.system：避免 iPad 跟随系统深色模式把 Ionic 壳层变成黑底 */
/* import '@ionic/vue/css/palettes/dark.system.css'; */

/* Theme variables */
import './theme/variables.css';

function hideBootLoading() {
  const loadingEl = document.getElementById('boot-loading');
  if (!loadingEl) return;
  loadingEl.classList.add('boot-loading--hidden');
  window.setTimeout(() => loadingEl.remove(), 260);
}

const app = createApp(App)
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

app
  .use(IonicVue)
  .use(pinia)
  .use(router);

router.isReady().then(() => {
  app.mount('#app');
  hideBootLoading();
});
