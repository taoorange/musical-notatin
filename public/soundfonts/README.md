# 音色库（本地可选）

`*.sf2` / `*.sf3` **不会提交到 Git**（体积过大）。应用默认从环境变量 `VITE_ORCHESTRA_SOUNDFONT_URL` 指向的 CDN 下载，并缓存到 IndexedDB（`five-line-staff-soundfont-cache`）。

## 本地开发（可选）

若需离线调试，将音色文件放到本目录，例如：

- `MuseScore_General.sf3`（约 82MB）
- `Sonatina_Symphonic_Orchestra.sf2`（约 470MB）

并在 `.env` 中配置可访问的 URL（本地可用 `vite` 静态路径 `/soundfonts/MuseScore_General.sf3`）。

打包时 `vite.config.ts` 会从 `dist` 中剔除大体积 `.sf2` / `.sf3`，与线上一致。

## 本目录应保留的文件

- `js-synthesizer.js`
- `libfluidsynth-2.4.6-with-libsndfile.js`
