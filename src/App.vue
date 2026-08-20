<script setup>
import { ref, onBeforeUnmount, onMounted, watch } from 'vue'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import faviconPng from './favicon.png'
import JSZip from 'jszip'

const SERVER_URL = import.meta.env.VITE_SERVER_URL

const cesiumRef = ref(null)
const zipInputRef = ref(null)
const showUpload = ref(true)
const isFolderDragging = ref(false)
const isZipDragging = ref(false)
const loading = ref(false)
const errorMsg = ref('')
let errorTimer = null

watch(errorMsg, (val) => {
  if (errorTimer) clearTimeout(errorTimer)
  if (val) {
    errorTimer = setTimeout(() => {
      errorMsg.value = ''
      errorTimer = null
    }, 2000)
  }
})

const loadMode = ref('upload')
const urlInput = ref('')

let viewer = null

/** @type {Set<Cesium.Cesium3DTileset>} */
const managedTilesets = new Set()
/** @type {Set<string>} */
let activeObjectUrls = new Set()

function releaseObjectUrls(objectUrls) {
  for (const url of objectUrls) URL.revokeObjectURL(url)
  objectUrls.clear()
}

function destroyTileset(tileset) {
  if (!tileset || !viewer || viewer.isDestroyed()) return
  if (viewer.scene.primitives.contains(tileset)) {
    viewer.scene.primitives.removeAndDestroy(tileset)
  }
  managedTilesets.delete(tileset)
}

function destroyManagedResources() {
  for (const tileset of [...managedTilesets]) destroyTileset(tileset)
  managedTilesets.clear()
  currentTileset = null
  releaseObjectUrls(activeObjectUrls)
  activeObjectUrls = new Set()
}

function goHome() {
  if (!viewer) return
  destroyManagedResources()
  showUpload.value = true
  errorMsg.value = ''
}

function switchMode(mode) {
  if (errorTimer) { clearTimeout(errorTimer); errorTimer = null }
  errorMsg.value = ''
  loadMode.value = mode
}

/** @type {Cesium.Cesium3DTileset|null} */
let currentTileset = null

Cesium.Ion.defaultAccessToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIiLCJpZCI6MCwiaWF0IjowfQ.local'

onMounted(() => {
  viewer = new Cesium.Viewer(cesiumRef.value, {
    baseLayer: false, baseLayerPicker: false, geocoder: false,
    homeButton: false, sceneModePicker: false, navigationHelpButton: false,
    animation: false, timeline: false, fullscreenButton: false,
    infoBox: false, selectionIndicator: false,
    creditContainer: document.createElement('div')
  })
  viewer.imageryLayers.removeAll()
  viewer.scene.globe.show = false
  viewer.scene.backgroundColor = Cesium.Color.WHITE
  viewer.scene.skyAtmosphere.show = false
  viewer.scene.sun.show = false
  viewer.scene.moon.show = false

  // 最小化配置：把旋转绑给中键，其他都恢复 Cesium 默认
  // 用户测试发现：物理中键拖拽 = 想要的旋转效果（左键被系统拦截无法触发）
  const canvas = viewer.scene.canvas
  canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  const controller = viewer.scene.screenSpaceCameraController
  controller.enableInputs = true
  controller.rotateEventTypes = [0, 2]  // LEFT_DRAG=0, MIDDLE_DRAG=2，左键和中键都 = 旋转
  // 其他属性保持 Cesium 默认
})

onBeforeUnmount(() => {
  if (errorTimer) clearTimeout(errorTimer)
  destroyManagedResources()
  if (viewer && !viewer.isDestroyed()) viewer.destroy()
  viewer = null
})

function applyTilesetSettings(tileset) {
  tileset.pointCloudShading.attenuation = true
  tileset.pointCloudShading.geometricErrorScale = 1.0
  tileset.pointCloudShading.maximumAttenuation = 5
  tileset.pointCloudShading.baseResolution = 1.0
  tileset.pointCloudShading.eyeDomeLighting = true
  tileset.pointCloudShading.eyeDomeLightingStrength = 2.0
  tileset.pointCloudShading.eyeDomeLightingRadius = 0.8
  tileset.style = new Cesium.Cesium3DTileStyle({
    pointSize: 5,
    color: { conditions: [['true', 'pow((${COLOR} * 1.2), vec4(1.0))']] }
  })
}

function resetView() {
  if (!currentTileset || !viewer) return
  const range = currentTileset.boundingSphere.radius * 2.5
  viewer.flyTo(currentTileset, {
    offset: new Cesium.HeadingPitchRange(0, -Math.PI / 4, range),
    duration: 1.0,
    easingFunction: Cesium.EasingFunction.QUADRATIC_OUT
  })
}

async function loadFromUrl() {
  const url = urlInput.value.trim()
  if (!url) { errorMsg.value = '请输入 tileset.json 的 URL 地址'; return }
  loading.value = true
  errorMsg.value = ''
  let tileset = null
  try {
    tileset = await Cesium.Cesium3DTileset.fromUrl(url, {
      maximumScreenSpaceError: 10, preferLeaves: true, maximumMemoryUsage: 512
    })
    const previousTilesets = [...managedTilesets]
    viewer.scene.primitives.add(tileset)
    managedTilesets.add(tileset)
    applyTilesetSettings(tileset)
    const range = tileset.boundingSphere.radius * 2.5
    await viewer.zoomTo(tileset, new Cesium.HeadingPitchRange(0, -Math.PI / 4, range))
    for (const previousTileset of previousTilesets) destroyTileset(previousTileset)
    releaseObjectUrls(activeObjectUrls)
    activeObjectUrls = new Set()
    currentTileset = tileset
    showUpload.value = false
  } catch (err) {
    if (tileset) destroyTileset(tileset)
    console.error('加载点云失败:', err)
    errorMsg.value = err.message || '加载失败，请检查 URL 是否正确以及服务器是否支持跨域访问'
  } finally { loading.value = false }
}

// ==================== 文件夹上传 ====================

/** @type {boolean|null} */
let directoryPickerSupported = null
function isDirectoryPickerSupported() {
  if (directoryPickerSupported !== null) return directoryPickerSupported
  directoryPickerSupported = 'showDirectoryPicker' in window
  return directoryPickerSupported
}

async function openFolderPicker() {
  if (!isDirectoryPickerSupported()) {
    errorMsg.value = '当前浏览器不支持文件夹选择，请拖拽文件夹或使用压缩包上传'
    return
  }
  try {
    errorMsg.value = ''
    const dirHandle = await window.showDirectoryPicker()
    loading.value = true
    const files = await readDirectoryHandle(dirHandle)
    if (files.length === 0) throw new Error('所选文件夹为空')
    await loadTilesetFromFiles(files)
  } catch (err) {
    if (err.name !== 'AbortError' && err.name !== 'SecurityError') {
      errorMsg.value = err.message || '读取文件夹失败'
    }
  } finally { loading.value = false }
}

async function readDirectoryHandle(dirHandle, basePath = '') {
  const files = []
  for await (const [name, handle] of dirHandle.entries()) {
    const fullPath = basePath + name
    if (handle.kind === 'file') {
      const file = await handle.getFile()
      Object.defineProperty(file, 'webkitRelativePath', { value: fullPath, writable: false })
      files.push(file)
    } else if (handle.kind === 'directory') {
      const subFiles = await readDirectoryHandle(handle, basePath + name + '/')
      files.push(...subFiles)
    }
  }
  return files
}

function onFolderDragOver(e) { e.preventDefault(); isFolderDragging.value = true }
function onFolderDragLeave() { isFolderDragging.value = false }

async function onFolderDrop(e) {
  isFolderDragging.value = false
  const files = await getFilesFromDataTransfer(e.dataTransfer.items)
  if (files.length > 0) await loadTilesetFromFiles(files)
}

// ==================== 压缩包上传 ====================

function isZipFile(file) {
  return file.name?.endsWith('.zip') || file.type === 'application/zip'
}

function openZipPicker() { zipInputRef.value?.click() }

async function handleZipInput(event) {
  const file = event.target.files?.[0]
  if (!file) return
  event.target.value = ''
  await loadFromZipFile(file)
}

async function extractZipFile(file) {
  const arrayBuffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(arrayBuffer)
  const tasks = []
  zip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir) return
    tasks.push(
      (async () => {
        const blob = await zipEntry.async('blob')
        const extractedFile = new File([blob], zipEntry.name, {
          type: zipEntry.name.endsWith('.json') ? 'application/json' : ''
        })
        Object.defineProperty(extractedFile, 'webkitRelativePath', { value: relativePath, writable: false })
        return extractedFile
      })()
    )
  })
  return Promise.all(tasks)
}

async function loadFromZipFile(zipFile) {
  loading.value = true
  errorMsg.value = ''
  try {
    const extractedFiles = await extractZipFile(zipFile)
    if (extractedFiles.length === 0) throw new Error('压缩包为空')
    await loadTilesetFromFiles(extractedFiles)
  } catch (err) {
    console.error('解压或加载失败:', err)
    errorMsg.value = err.message || '解压失败，请检查压缩包格式'
    loading.value = false
  }
}

function onZipDragOver(e) { e.preventDefault(); isZipDragging.value = true }
function onZipDragLeave() { isZipDragging.value = false }

async function onZipDrop(e) {
  isZipDragging.value = false
  const files = await getFilesFromDataTransfer(e.dataTransfer.items)
  const zipFile = files.find((f) => isZipFile(f))
  if (zipFile) {
    await loadFromZipFile(zipFile)
  } else {
    errorMsg.value = '请拖拽 .zip 格式的压缩包'
  }
}

// ==================== 通用拖拽文件读取 ====================

async function getFilesFromDataTransfer(items) {
  const files = []
  const entries = []
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.()
    if (entry) entries.push(entry)
  }
  if (entries.length > 0) {
    for (const entry of entries) await readEntry(entry, '', files)
  } else {
    for (let i = 0; i < items.length; i++) {
      const file = items[i].getAsFile()
      if (file) files.push(file)
    }
  }
  return files
}

async function readEntry(entry, basePath, files) {
  if (entry.isFile) {
    const file = await new Promise((resolve) => entry.file(resolve))
    Object.defineProperty(file, 'webkitRelativePath', { value: basePath + file.name, writable: false })
    files.push(file)
  } else if (entry.isDirectory) {
    const reader = entry.createReader()
    const childEntries = await readAllDirectoryEntries(reader)
    for (const childEntry of childEntries) await readEntry(childEntry, basePath + entry.name + '/', files)
  }
}

function readAllDirectoryEntries(reader) {
  return new Promise((resolve) => {
    const allEntries = []
    function readBatch() {
      reader.readEntries((entries) => {
        if (entries.length === 0) resolve(allEntries)
        else { allEntries.push(...entries); readBatch() }
      })
    }
    readBatch()
  })
}

// ==================== 通用 tileset 加载 ====================

async function loadTilesetFromFiles(fileList) {
  loading.value = true
  errorMsg.value = ''
  let objectUrls = new Set()
  let tileset = null
  try {
    const fileMap = new Map()
    for (const file of fileList) fileMap.set(file.webkitRelativePath || file.name, file)
    const rootTilesetPath = findRootTileset(fileMap)
    if (!rootTilesetPath) throw new Error('未找到 tileset.json 文件')
    const rootBlobUrl = await processTilesetFiles(fileMap, rootTilesetPath, objectUrls)
    tileset = await Cesium.Cesium3DTileset.fromUrl(rootBlobUrl, {
      maximumScreenSpaceError: 10, preferLeaves: true, maximumMemoryUsage: 512
    })
    const previousTilesets = [...managedTilesets]
    viewer.scene.primitives.add(tileset)
    managedTilesets.add(tileset)
    applyTilesetSettings(tileset)
    const range = tileset.boundingSphere.radius * 2.5
    await viewer.zoomTo(tileset, new Cesium.HeadingPitchRange(0, -Math.PI / 4, range))
    for (const previousTileset of previousTilesets) destroyTileset(previousTileset)
    releaseObjectUrls(activeObjectUrls)
    activeObjectUrls = objectUrls
    currentTileset = tileset
    showUpload.value = false
  } catch (err) {
    if (tileset) destroyTileset(tileset)
    releaseObjectUrls(objectUrls)
    console.error('加载点云失败:', err)
    errorMsg.value = err.message || '加载失败，请检查文件格式'
  } finally { loading.value = false }
}

function findRootTileset(fileMap) {
  let rootPath = null
  for (const [path] of fileMap) {
    const fileName = path.split('/').pop()
    if (fileName === 'tileset.json') {
      if (!rootPath || path.split('/').length < rootPath.split('/').length) rootPath = path
    }
  }
  return rootPath
}

async function processTilesetFiles(fileMap, rootTilesetPath, objectUrls) {
  const createObjectUrl = (blob) => {
    const url = URL.createObjectURL(blob)
    objectUrls.add(url)
    return url
  }
  const blobUrlMap = new Map()
  for (const [path, file] of fileMap) {
    if (!path.endsWith('.json')) blobUrlMap.set(path, createObjectUrl(file))
  }
  const jsonBlobUrls = new Map()
  for (const [path, file] of fileMap) {
    if (path.endsWith('.json')) {
      const text = await file.text()
      try {
        const json = JSON.parse(text)
        const basePath = path.substring(0, path.lastIndexOf('/') + 1)
        rewriteContentUris(json, basePath, blobUrlMap)
        jsonBlobUrls.set(path, createObjectUrl(new Blob([JSON.stringify(json)], { type: 'application/json' })))
      } catch { jsonBlobUrls.set(path, createObjectUrl(file)) }
    }
  }
  const allBlobUrls = new Map([...blobUrlMap, ...jsonBlobUrls])
  const finalJsonBlobUrls = new Map()
  for (const [path, file] of fileMap) {
    if (path.endsWith('.json')) {
      const text = await file.text()
      try {
        const json = JSON.parse(text)
        const basePath = path.substring(0, path.lastIndexOf('/') + 1)
        rewriteContentUris(json, basePath, allBlobUrls)
        finalJsonBlobUrls.set(path, createObjectUrl(new Blob([JSON.stringify(json)], { type: 'application/json' })))
      } catch { finalJsonBlobUrls.set(path, createObjectUrl(file)) }
    }
  }
  return finalJsonBlobUrls.get(rootTilesetPath)
}

function rewriteContentUris(tileset, basePath, blobUrlMap) {
  if (tileset.root) rewriteTile(tileset.root, basePath, blobUrlMap)
}
function rewriteTile(tile, basePath, blobUrlMap) {
  if (tile.content) {
    const uri = tile.content.uri
    if (uri) {
      const fullPath = basePath + uri
      const blobUrl = blobUrlMap.get(fullPath)
      if (blobUrl) tile.content.uri = blobUrl
    }
  }
  if (tile.children) { for (const child of tile.children) rewriteTile(child, basePath, blobUrlMap) }
}
</script>

<template>
  <div class="app">
    <div ref="cesiumRef" class="cesium-container"></div>

    <!-- 复位按钮 -->
    <button v-if="!showUpload" class="action-btn" @click="resetView" title="复位点云视角">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
      </svg>
      复位
    </button>

    <!-- 返回主页按钮 -->
    <button v-if="!showUpload" class="action-btn home-btn" @click="goHome" title="返回主页">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
      </svg>
      返回
    </button>

    <div v-if="showUpload" class="upload-overlay">
      <!-- 左上角平台标识 -->
      <div class="platform-brand">
        <img :src="faviconPng" alt="3D点云显示" width="28" height="28" />
        <span>3D点云显示</span>
      </div>

      <!-- 模式切换标签 -->
      <div class="mode-tabs">
        <button :class="['mode-tab', { active: loadMode === 'upload' }]" @click="switchMode('upload')">文件上传</button>
        <button :class="['mode-tab', { active: loadMode === 'url' }]" @click="switchMode('url')">URL加载</button>
      </div>

      <!-- 上传模式：文件夹 + 压缩包两个独立上传框 -->
      <div v-if="loadMode === 'upload'" class="upload-options">
        <!-- 文件夹上传框 -->
        <div
          class="upload-card"
          :class="{ dragging: isFolderDragging }"
          @click="openFolderPicker"
          @dragover.prevent="onFolderDragOver"
          @dragleave="onFolderDragLeave"
          @drop.prevent="onFolderDrop"
        >
          <svg class="upload-icon" viewBox="0 0 48 48" width="48" height="48">
            <path d="M24 4L14 14h6v12h8V14h6L24 4zM8 28v12c0 2.2 1.8 4 4 4h24c2.2 0 4-1.8 4-4V28h-4v12H12V28H8z" fill="currentColor"/>
          </svg>
          <h3>选择文件夹</h3>
          <p class="upload-card-desc">点击选择或拖拽文件夹到此处</p>
          <p class="upload-card-hint">自动读取 tileset.json</p>
        </div>

        <!-- 压缩包上传框 -->
        <div
          class="upload-card zip-card"
          :class="{ dragging: isZipDragging }"
          @click="openZipPicker"
          @dragover.prevent="onZipDragOver"
          @dragleave="onZipDragLeave"
          @drop.prevent="onZipDrop"
        >
          <svg viewBox="0 0 48 48" width="48" height="48" fill="currentColor" class="upload-icon">
            <path d="M38 6H10C7.8 6 6 7.8 6 10v28c0 2.2 1.8 4 4 4h28c2.2 0 4-1.8 4-4V10c0-2.2-1.8-4-4-4zm-4 20h-8v8h-4v-8h-8v-4h8v-8h4v8h8v4z"/>
          </svg>
          <h3>选择压缩包</h3>
          <p class="upload-card-desc">点击选择或拖拽 .zip 文件到此处</p>
          <p class="upload-card-hint">自动解压后查找 tileset.json</p>
          <input
            ref="zipInputRef"
            type="file"
            accept=".zip"
            style="display: none"
            @change="handleZipInput"
          />
        </div>
      </div>

      <!-- URL 加载模式 -->
      <div v-else class="url-box" @click.stop>
        <p class="title">从 HTTP 服务器加载</p>
        <p class="upload-desc">当前服务器地址：{{ SERVER_URL }}</p>
        <div class="url-input-group">
          <input v-model="urlInput" type="url" class="url-input"
            placeholder="tileset.json地址，如：/file/pointclouds/xxx/tileset.json" @keyup.enter="loadFromUrl" />
          <button class="url-load-btn" :disabled="loading" @click="loadFromUrl">
            {{ loading ? '加载中...' : '加载' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="loading" class="loading-overlay">
      <div class="spinner"></div>
      <p>正在加载点云数据...</p>
    </div>
    <div v-if="errorMsg" class="error-toast">{{ errorMsg }}</div>
  </div>
</template>

<style scoped>
.app { width: 100%; height: 100vh; position: relative; overflow: hidden; }
.cesium-container { width: 100%; height: 100%; }

.upload-overlay {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  background: rgba(10, 10, 26, 0.85); z-index: 10;
}

/* 两个上传卡片并列 */
.upload-options { display: flex; gap: 24px; align-items: stretch; }

.upload-card {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  width: 260px; padding: 40px 24px 32px;
  border: 2px dashed rgba(255, 255, 255, 0.25); border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  transition: all 0.25s ease; cursor: pointer; user-select: none;
}
.upload-card:hover { border-color: #4fc3f7; background: rgba(79, 195, 247, 0.08); }
.upload-card.dragging { border-color: #4fc3f7; background: rgba(79, 195, 247, 0.12); transform: scale(1.03); }
.upload-card h3 { color: #fff; font-size: 16px; font-weight: 500; margin: 12px 0 8px; }
.upload-card-desc { color: rgba(255, 255, 255, 0.55); font-size: 13px; margin: 0; text-align: center; line-height: 1.4; }
.upload-card-hint { color: rgba(255, 255, 255, 0.3); font-size: 11px; margin: 6px 0 0; text-align: center; }

/* 压缩包卡片特殊样式 */
.zip-card { border-style: solid; border-color: rgba(255, 255, 255, 0.15); }
.zip-card:hover { border-color: #4caf50; background: rgba(76, 175, 80, 0.08); }
.zip-card.dragging { border-color: #4caf50; background: rgba(76, 175, 80, 0.12); }

.url-box {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  width: 500px; padding: 32px 32px 46px; border-radius: 12px; background: rgba(255, 255, 255, 0.05);
}
.title { color: #fff; font-size: 20px; font-weight: 500; margin-bottom: 12px; }
.url-input-group { display: flex; width: 100%; gap: 8px; margin-top: 16px; }
.url-input {
  flex: 1; padding: 10px 14px; border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 6px;
  background: rgba(255, 255, 255, 0.1); color: #fff; font-size: 14px; outline: none; transition: border-color 0.2s;
}
.url-input::placeholder { color: rgba(255, 255, 255, 0.35); }
.url-input:focus { border-color: #4fc3f7; }
.url-load-btn {
  padding: 10px 20px; border: none; border-radius: 6px; background: #4fc3f7; color: #fff;
  font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.2s; white-space: nowrap;
}
.url-load-btn:hover { background: #29b6f6; }
.url-load-btn:disabled { background: rgba(255, 255, 255, 0.2); cursor: not-allowed; }

/* 左上角平台标识 */
.platform-brand {
  position: absolute; top: 12px; left: 12px; display: flex; align-items: center;
  gap: 10px; color: #fff; font-size: 18px; letter-spacing: 1px; user-select: none;
}
.platform-brand img { user-select: none; pointer-events: none; }

/* 模式切换标签 */
.mode-tabs {
  display: flex; gap: 0; margin-bottom: 24px; border-radius: 8px;
  overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.15);
}
.mode-tab {
  padding: 8px 24px; border: none; background: transparent; color: rgba(255, 255, 255, 0.5);
  font-size: 14px; cursor: pointer; transition: all 0.2s;
}
.mode-tab.active { background: rgba(79, 195, 247, 0.2); color: #4fc3f7; }
.mode-tab:not(.active):hover { color: rgba(255, 255, 255, 0.8); }

.upload-icon { color: rgba(255, 255, 255, 0.6); margin-bottom: 16px; }

/* 底部操作按钮 */
.action-btn {
  position: absolute; left: 20px; z-index: 15; display: inline-flex; align-items: center;
  gap: 4px; padding: 8px 16px; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px;
  background: rgba(0, 0, 0, 0.3); color: #fff; font-size: 14px; cursor: pointer;
  transition: all 0.2s; backdrop-filter: blur(2px);
}
.action-btn:hover { background: rgba(0, 0, 0, 0.5); }
.action-btn:first-of-type { bottom: 72px; } /* 复位 */
.action-btn:last-of-type { bottom: 20px; }  /* 返回 */

.loading-overlay {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; background: rgba(10, 10, 26, 0.8);
  z-index: 20; color: #fff; font-size: 16px;
}
.spinner {
  width: 40px; height: 40px; border: 3px solid rgba(255, 255, 255, 0.2);
  border-top-color: #4fc3f7; border-radius: 50%;
  animation: spin 0.8s linear infinite; margin-bottom: 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }

.error-toast {
  position: absolute; bottom: 220px; left: 50%; transform: translateX(-50%);
  background: rgba(244, 67, 54, 0.7); color: #fff; padding: 10px 24px;
  border-radius: 8px; font-size: 14px; z-index: 30; animation: toastIn 0.3s ease-out;
}
@keyframes toastIn {
  from { opacity: 0; transform: translateX(-50%) translateY(16px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
</style>
