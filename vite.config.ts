/// <reference types="vitest" />

import legacy from '@vitejs/plugin-legacy'
import vue from '@vitejs/plugin-vue'
import fs from 'fs/promises'
import path from 'path'
import { defineConfig, normalizePath, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Ionic Vue 的 IonRouterOutlet 会缓存视图栈；Vite 对 .vue 的 HMR 更新 scoped 样式时
 * 易出现 data-v-* 与 DOM 不一致，看起来像整页「丢了 Ionic / 组件样式」。
 * 开发环境对 src 下 .vue 改为整页刷新，代价略大但能稳定对齐样式。
 */
function ionicVueDevFullReload(): Plugin {
  return {
    name: 'ionic-vue-dev-full-reload',
    apply: 'serve',
    enforce: 'post',
    handleHotUpdate({ file, server }) {
      const p = normalizePath(file)
      if (!p.endsWith('.vue')) return
      if (!p.includes('/src/')) return
      server.hot.send({ type: 'full-reload', path: '*' })
      return []
    },
  }
}

/**
 * 保留 public/soundfonts 下的大音色文件用于本地管理，
 * 但打包产物不携带它们（已改为走远程 URL）。
 */
function excludeLargeSoundfontFromBuild(): Plugin {
  return {
    name: 'exclude-large-soundfont-from-build',
    apply: 'build',
    async closeBundle() {
      const targets = [
        path.resolve(__dirname, 'dist/soundfonts/MuseScore_General.sf3'),
        path.resolve(__dirname, 'dist/soundfonts/Sonatina_Symphonic_Orchestra.sf2'),
      ]

      await Promise.all(
        targets.map(async (target) => {
          try {
            await fs.rm(target, { force: true })
          } catch {
            // ignore remove failure
          }
        }),
      )
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  console.log('mode', mode)
  const pwaAppName = mode === 'development'
    ? '五线谱（开发）'
    : mode === 'test'
      ? '五线谱（测试）'
      : '五线谱'

  const pwaShortName = mode === 'development'
  ? '五线谱（开发）'
  : mode === 'test'
    ? '五线谱（测试）'
    : '五线谱'

  return {
    plugins: [
      vue(),
      ionicVueDevFullReload(),
      excludeLargeSoundfontFromBuild(),
      legacy(),
      VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'five-line-staff-*.png'],
      manifest: {
        name: pwaAppName,
        short_name: pwaShortName,
        description: 'Music notation workspace — PWA web & Capacitor native.',
        theme_color: '#3880ff',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'five-line-staff-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'five-line-staff-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'five-line-staff-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Verovio WASM 等 chunk 超过默认 2MB 预缓存上限
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
      },
      devOptions: {
        enabled: false,
      },
      }),
    ],
    css: {
      preprocessorOptions: {
        scss: {
          // Dart Sass 2.0 将移除 legacy JS API；Vite 5.4+ 需显式启用 modern API
          api: 'modern',
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      open: true,
      port: 5173,
      host: true,
    },
    optimizeDeps: {
      // Verovio WASM 在 Vite 预构建中易出问题，排除后按原生 ESM 加载
      exclude: ['verovio'],
    },
    test: {
      globals: true,
      environment: 'jsdom'
    }
  }
})
