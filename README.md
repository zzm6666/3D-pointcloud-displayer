# 3D 点云显示

基于 **Vue 3 + Vite + CesiumJS** 的纯前端 3D 点云可视化工具，支持多种方式加载 [3D Tiles](https://github.com/CesiumGS/3d-tiles) 格式的点云数据。

## 功能特性

- 🗂️ **文件夹上传** — 利用浏览器 File System Access API 直接选择本地文件夹，自动定位 `tileset.json` 并加载
- 📦 **压缩包上传** — 支持拖拽/选择 `.zip` 文件，浏览器端自动解压后加载
- 🌐 **URL 加载** — 从远程 HTTP 服务器直接加载 3D Tiles 数据
- 🎨 **点云渲染增强** — 通过 EDL (Eye-Dome Lighting)、点大小和颜色样式优化点云显示
- 🔄 **视角复位** — 一键回到最佳观察角度

## 技术栈

| 技术               | 版本    | 用途                                          |
| ------------------ | ------- | --------------------------------------------- |
| Vue 3              | ^3.5    | 前端框架 (Composition API + `<script setup>`) |
| Vite               | ^8.0    | 构建工具                                      |
| CesiumJS           | 1.134.0 | 3D 渲染引擎，加载 3D Tiles 点云               |
| JSZip              | ^3.10   | 浏览器端 ZIP 解压                             |
| patch-package      | ^8.0    | 修补 Cesium Engine 上游 bug                   |
| vite-plugin-cesium | ^1.2    | 自动处理 Cesium 静态资源路径                  |

## 快速开始

### 环境要求

- Node.js >= 20.19.0（或 >= 22.12.0，Vite 8 要求）
- 支持 File System Access API 的现代浏览器（Chrome / Edge 86+）

### 安装

```bash
npm install
```

### 开发

```bash
npm run dev
```

默认运行在 `http://localhost:5173`，所有 `/file` 路径的请求会代理到 `.env` 中配置的远程服务器。

### 生产构建

```bash
npm run build
```

构建产物输出到 `dist/` 目录。

### 本地预览构建结果

```bash
npm run preview
```

## 配置说明

### 环境变量

在 `.env` 文件中配置远程服务器地址（用于 URL 加载模式和开发代理）：

```
VITE_SERVER_URL = https://your-server.com
```

### Vite 代理

开发环境下，Vite 使用 `loadEnv` 读取当前模式的环境文件，`/file` 开头的请求会被代理到 `VITE_SERVER_URL` 指定的服务器，方便加载远程点云数据。开发服务器默认只监听 `localhost`，如需局域网访问请按部署环境显式调整 `vite.config.js`：

```js
// vite.config.js
proxy: {
  '/file': {
    target: env.VITE_SERVER_URL,
    changeOrigin: true
  }
}
```

## 使用方式

### 方式一：文件夹上传

1. 点击 **"选择文件夹"** 卡片，或直接拖拽文件夹到该区域
2. 浏览器会递归读取文件夹内所有文件，自动查找最外层的 `tileset.json`
3. 数据以 Blob URL 形式注入 Cesium 渲染

> 需要浏览器支持 `showDirectoryPicker` API（Chrome / Edge 86+）

### 方式二：压缩包上传

1. 点击 **"选择压缩包"** 卡片，或拖拽 `.zip` 文件到该区域
2. JSZip 在浏览器端解压，自动查找 `tileset.json`
3. 后续流程与文件夹上传一致

### 方式三：URL 加载

1. 切换到 **"URL 加载"** 标签
2. 输入 `tileset.json` 的完整路径（如 `/file/pointclouds/example/tileset.json`）
3. 点击"加载"，Cesium 直接从服务器请求并渲染

## 点云渲染配置

项目对加载的 `Cesium3DTileset` 应用了以下默认配置：

```js
tileset.pointCloudShading.attenuation = true
tileset.pointCloudShading.geometricErrorScale = 1.0
tileset.pointCloudShading.maximumAttenuation = 5
tileset.pointCloudShading.baseResolution = 1.0
tileset.pointCloudShading.eyeDomeLighting = true // 开启 EDL
tileset.pointCloudShading.eyeDomeLightingStrength = 2.0
tileset.pointCloudShading.eyeDomeLightingRadius = 0.8

tileset.style = new Cesium.Cesium3DTileStyle({
  pointSize: 5,
  color: { conditions: [['true', 'pow((${COLOR} * 1.2), vec4(1.0))']] }
})
```

这些参数可根据需要在 `src/cesium/viewer.js` 的 `applyTilesetSettings` 函数中调整。

## 已知问题与修复

### Cesium Engine Float64Array 字节对齐问题

`patch-package` 修复了 Cesium Engine 21.0.1 中 `ComponentDatatype.createArrayBufferView` 在创建 `Float64Array` 时的字节对齐异常：当 `byteOffset` 非 8 的倍数时，直接用原始 `buffer` 会导致崩溃。修复方案是先 `slice` 再创建 `Float64Array`。

详见 `patches/@cesium+engine+21.0.1.patch`。

## 项目结构

```
3D-pointcloud-displayer/
├── index.html                  # HTML 入口
├── vite.config.js              # Vite 配置（插件、环境变量和代理）
├── package.json
├── .env                        # 本地环境变量（不要提交敏感信息）
├── patches/                    # patch-package 补丁
│   └── @cesium+engine+21.0.1.patch
└── src/
    ├── main.js                 # Vue 应用入口
    ├── style.css               # 全局样式
    ├── favicon.png             # 站点图标
    ├── App.vue                 # 页面编排：串联加载器与上传界面，管理提示与加载态
    ├── cesium/
    │   └── viewer.js           # Cesium Viewer 创建、点云渲染参数、相机取景
    ├── components/
    │   └── UploadOverlay.vue   # 上传遮罩层：模式切换、两张上传卡片、URL 输入
    ├── composables/
    │   └── usePointCloudViewer.js  # Viewer 与 tileset 生命周期、三种加载入口
    └── utils/
        ├── fileReaders.js      # 文件夹 / 拖拽 / ZIP 的文件读取
        └── tilesetFiles.js     # tileset.json 定位与 content.uri → Blob URL 重写
```

### 模块依赖方向

```
App.vue ──► components/UploadOverlay.vue
   │
   ├──► composables/usePointCloudViewer.js ──► cesium/viewer.js
   │            │
   │            └──► utils/tilesetFiles.js
   │
   └──► utils/fileReaders.js
```

底层模块不反向依赖上层：`utils/` 与 `cesium/` 不认识 Vue 组件，
`composables/` 只做状态与生命周期编排，`App.vue` 仅负责把用户操作接到加载器上。

## License

MIT
