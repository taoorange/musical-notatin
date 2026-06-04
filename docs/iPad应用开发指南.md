# five-line-staff iPad 应用开发流程

本文档说明如何基于当前项目（Vue + Vite + Capacitor）进行 iPad 应用开发与调试。  
已默认你本机已安装 Xcode。

---

## 1. 前置条件

在开始之前，请确保：

- 已安装 Node.js（建议 LTS 版本）和 npm
- 已安装 Xcode（你已完成）
- 已安装 Xcode Command Line Tools（通常随 Xcode 一并安装）
- 可正常使用 Apple 开发者账号进行签名（真机调试时需要）

项目内与 iOS 相关的关键配置：

- `capacitor.config.ts`
- `ios/App`（已存在 iOS 工程）
- `package.json` 中脚本：
  - `build:ios`
  - `cap:sync`
  - `cap:open:ios`

---

## 2. 首次初始化（新机器或刚拉代码）

在项目根目录执行：

```bash
npm install
```

说明：

- 安装前端依赖（包含 Capacitor CLI 与 iOS 平台包）
- 若依赖安装失败，先确认 Node 版本与网络环境

---

## 3. 开发前检查（Web 端）

先在浏览器中验证页面逻辑，开发效率更高：

```bash
npm run dev
```

说明：

- Web 层逻辑（Vue 页面、状态管理、渲染逻辑）建议先在浏览器调通
- 调通后再进入 iPad 壳子调试原生相关行为

---

## 4. 同步到 iOS 工程

当前项目推荐使用已有脚本：

```bash
npm run build:ios
```

该命令会执行：

1. `vue-tsc`：TypeScript 类型检查
2. `vite build`：构建 Web 资源到 `dist`
3. `npx cap sync`：把最新 Web 资源与 Capacitor 配置同步到 iOS 工程

> 只要修改了前端代码，通常都需要重新执行一次该命令，再回 Xcode 运行。

---

## 5. 打开并运行 iPad 应用（Xcode）

执行：

```bash
npm run cap:open:ios
```

然后在 Xcode 中：

1. 确认打开的是 `App.xcworkspace`（不是 `xcodeproj`）
2. 选择运行目标：
   - 模拟器：任一 iPad Simulator
   - 真机：已连接并信任的 iPad
3. 点击左上角 Run（▶）启动应用

---

## 6. 真机调试必做：签名配置

如果要在真实 iPad 上运行，请在 Xcode 中配置：

1. 选中 `App` target
2. 打开 `Signing & Capabilities`
3. 勾选 `Automatically manage signing`
4. 选择你的 Team
5. 检查 Bundle Identifier（当前默认 `com.fivelinestaff.app`，如冲突请改为你自己的唯一 ID）

常见现象：

- 无法安装到真机：通常是签名或 Bundle ID 冲突
- 设备列表看不到 iPad：检查数据线、设备信任和开发者模式

---

## 7. 日常开发循环（最常用）

推荐循环如下：

1. 修改前端代码
2. 执行 `npm run build:ios`
3. 回到 Xcode 点击 Run
4. 在 iPad 模拟器或真机验证功能

这个循环适合当前项目结构，稳定且直观。

---

## 8. 常见问题排查

### 8.1 改了代码但 iPad 里没变化

原因通常是没有重新构建同步。执行：

```bash
npm run build:ios
```

### 8.2 Xcode 打开后编译报依赖或缓存异常

按顺序尝试：

1. `npm run cap:sync`
2. 在 Xcode 执行 `Product -> Clean Build Folder`
3. 重新 Run

### 8.3 误开了 xcodeproj

请关闭后重新通过 `npm run cap:open:ios` 打开 `App.xcworkspace`。

---

## 9. 发布前建议检查

在准备 TestFlight/App Store 前，建议确认：

- 应用名称、图标、启动图配置完整
- 版本号/构建号符合发布策略
- 隐私权限描述（如有）完整且准确
- 在至少 1 台真机 + 1 个 iPad 模拟器回归核心流程
- `npm run build:ios` 后无构建报错

---

## 10. 常用命令速查

```bash
# 安装依赖
npm install

# 本地 Web 开发
npm run dev

# 构建并同步到 Capacitor(iOS)
npm run build:ios

# 仅同步 Capacitor 资源
npm run cap:sync

# 打开 iOS 工程
npm run cap:open:ios
```

---

如需进一步提升开发效率，可在后续增加「iOS 真机/模拟器 Live Reload」流程，减少每次完整 build 的等待时间。
