<script setup>
import { ref } from 'vue'
import UploadOverlay from './components/UploadOverlay.vue'
import { usePointCloudViewer } from './composables/usePointCloudViewer'
import {
  getFilesFromDataTransfer,
  isDirectoryPickerSupported,
  isZipFile,
  readDirectoryHandle
} from './utils/fileReaders'

const SERVER_URL = import.meta.env.VITE_SERVER_URL
const PICKER_CANCELLED = new Set(['AbortError', 'SecurityError'])

const cesiumRef = ref(null)
const {
  loading,
  ready,
  errorMsg,
  reportError,
  loadFromUrl,
  loadFromFiles,
  loadFromZip,
  resetView,
  clear
} = usePointCloudViewer(cesiumRef)

async function pickFolder() {
  if (!isDirectoryPickerSupported()) {
    reportError('当前浏览器不支持文件夹选择，请拖拽文件夹或使用压缩包上传')
    return
  }

  try {
    const dirHandle = await window.showDirectoryPicker()
    loading.value = true
    const files = await readDirectoryHandle(dirHandle)
    if (files.length === 0) throw new Error('所选文件夹为空')
    await loadFromFiles(files)
  } catch (err) {
    if (!PICKER_CANCELLED.has(err.name)) {
      reportError(err.message || '读取文件夹失败')
    }
  } finally {
    loading.value = false
  }
}

async function dropFolder(dataTransfer) {
  const files = await getFilesFromDataTransfer(dataTransfer.items)
  if (files.length === 0) {
    reportError('未读取到文件，请重试')
    return
  }
  await loadFromFiles(files)
}

async function dropZip(dataTransfer) {
  const files = await getFilesFromDataTransfer(dataTransfer.items)
  const zipFile = files.find(isZipFile)
  if (!zipFile) {
    reportError('请拖拽 .zip 格式的压缩包')
    return
  }
  await loadFromZip(zipFile)
}
</script>

<template>
  <div class="app">
    <div ref="cesiumRef" class="cesium-container"></div>

    <template v-if="ready">
      <button
        class="action-btn reset-btn"
        title="复位点云视角"
        @click="resetView"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path
            d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"
          />
        </svg>
        复位
      </button>

      <button class="action-btn home-btn" title="返回主页" @click="clear">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
        </svg>
        返回
      </button>
    </template>

    <UploadOverlay
      v-else
      :server-url="SERVER_URL"
      :loading="loading"
      @pick-folder="pickFolder"
      @load-zip="loadFromZip"
      @load-url="loadFromUrl"
      @drop-folder="dropFolder"
      @drop-zip="dropZip"
    />

    <div v-if="loading" class="loading-overlay">
      <div class="spinner"></div>
      <p>正在加载点云数据...</p>
    </div>
    <div v-if="errorMsg" class="error-toast">{{ errorMsg }}</div>
  </div>
</template>

<style scoped>
.app {
  width: 100%;
  height: 100vh;
  position: relative;
  overflow: hidden;
}
.cesium-container {
  width: 100%;
  height: 100%;
}

/* 底部操作按钮 */
.action-btn {
  position: absolute;
  left: 20px;
  z-index: 15;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.3);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  backdrop-filter: blur(2px);
}
.action-btn:hover {
  background: rgba(0, 0, 0, 0.5);
}
.reset-btn {
  bottom: 72px;
}
.home-btn {
  bottom: 20px;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(10, 10, 26, 0.8);
  z-index: 20;
  color: #fff;
  font-size: 16px;
}
.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.2);
  border-top-color: #4fc3f7;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 16px;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-toast {
  position: absolute;
  bottom: 220px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(244, 67, 54, 0.7);
  color: #fff;
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 14px;
  z-index: 30;
  animation: toastIn 0.3s ease-out;
}
@keyframes toastIn {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
</style>
