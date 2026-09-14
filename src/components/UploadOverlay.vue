<script setup>
import { ref } from 'vue'
import faviconPng from '../favicon.png'

defineProps({
  serverUrl: { type: String, default: '' },
  loading: { type: Boolean, default: false }
})

const emit = defineEmits([
  'pick-folder',
  'load-zip',
  'load-url',
  'drop-folder',
  'drop-zip'
])

const loadMode = ref('upload')
const urlInput = ref('')
const zipInputRef = ref(null)
const isFolderDragging = ref(false)
const isZipDragging = ref(false)

function switchMode(mode) {
  loadMode.value = mode
}

function openZipPicker() {
  zipInputRef.value?.click()
}

function handleZipInput(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (file) emit('load-zip', file)
}

function submitUrl() {
  emit('load-url', urlInput.value)
}

function onFolderDrop(event) {
  isFolderDragging.value = false
  emit('drop-folder', event.dataTransfer)
}

function onZipDrop(event) {
  isZipDragging.value = false
  emit('drop-zip', event.dataTransfer)
}
</script>

<template>
  <div class="upload-overlay">
    <div class="platform-brand">
      <img :src="faviconPng" alt="3D点云显示" width="28" height="28" />
      <span>3D点云显示</span>
    </div>

    <div class="mode-tabs">
      <button
        :class="['mode-tab', { active: loadMode === 'upload' }]"
        @click="switchMode('upload')"
      >
        文件上传
      </button>
      <button
        :class="['mode-tab', { active: loadMode === 'url' }]"
        @click="switchMode('url')"
      >
        URL加载
      </button>
    </div>

    <div v-if="loadMode === 'upload'" class="upload-options">
      <div
        class="upload-card"
        :class="{ dragging: isFolderDragging }"
        @click="emit('pick-folder')"
        @dragover.prevent="isFolderDragging = true"
        @dragleave="isFolderDragging = false"
        @drop.prevent="onFolderDrop"
      >
        <svg class="upload-icon" viewBox="0 0 48 48" width="48" height="48">
          <path
            d="M24 4L14 14h6v12h8V14h6L24 4zM8 28v12c0 2.2 1.8 4 4 4h24c2.2 0 4-1.8 4-4V28h-4v12H12V28H8z"
            fill="currentColor"
          />
        </svg>
        <h3>选择文件夹</h3>
        <p class="upload-card-desc">点击选择或拖拽文件夹到此处</p>
        <p class="upload-card-hint">自动读取 tileset.json</p>
      </div>

      <div
        class="upload-card zip-card"
        :class="{ dragging: isZipDragging }"
        @click="openZipPicker"
        @dragover.prevent="isZipDragging = true"
        @dragleave="isZipDragging = false"
        @drop.prevent="onZipDrop"
      >
        <svg
          class="upload-icon"
          viewBox="0 0 48 48"
          width="48"
          height="48"
          fill="currentColor"
        >
          <path
            d="M38 6H10C7.8 6 6 7.8 6 10v28c0 2.2 1.8 4 4 4h28c2.2 0 4-1.8 4-4V10c0-2.2-1.8-4-4-4zm-4 20h-8v8h-4v-8h-8v-4h8v-8h4v8h8v4z"
          />
        </svg>
        <h3>选择压缩包</h3>
        <p class="upload-card-desc">点击选择或拖拽 .zip 文件到此处</p>
        <p class="upload-card-hint">自动解压后查找 tileset.json</p>
        <input
          ref="zipInputRef"
          type="file"
          accept=".zip"
          style="display: none"
          @click.stop
          @change="handleZipInput"
        />
      </div>
    </div>

    <div v-else class="url-box">
      <p class="title">从 HTTP 服务器加载</p>
      <p class="upload-desc">当前服务器地址：{{ serverUrl }}</p>
      <div class="url-input-group">
        <input
          v-model="urlInput"
          type="url"
          class="url-input"
          placeholder="tileset.json地址，如：/file/pointclouds/xxx/tileset.json"
          @keyup.enter="submitUrl"
        />
        <button class="url-load-btn" :disabled="loading" @click="submitUrl">
          {{ loading ? '加载中...' : '加载' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.upload-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(10, 10, 26, 0.85);
  z-index: 10;
}

/* 左上角平台标识 */
.platform-brand {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #fff;
  font-size: 18px;
  letter-spacing: 1px;
  user-select: none;
}
.platform-brand img {
  user-select: none;
  pointer-events: none;
}

/* 模式切换标签 */
.mode-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 24px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.15);
}
.mode-tab {
  padding: 8px 24px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}
.mode-tab.active {
  background: rgba(79, 195, 247, 0.2);
  color: #4fc3f7;
}
.mode-tab:not(.active):hover {
  color: rgba(255, 255, 255, 0.8);
}

/* 两个上传卡片并列 */
.upload-options {
  display: flex;
  gap: 24px;
  align-items: stretch;
}
.upload-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 260px;
  padding: 40px 24px 32px;
  border: 2px dashed rgba(255, 255, 255, 0.25);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  transition: all 0.25s ease;
  cursor: pointer;
  user-select: none;
}
.upload-card:hover {
  border-color: #4fc3f7;
  background: rgba(79, 195, 247, 0.08);
}
.upload-card.dragging {
  border-color: #4fc3f7;
  background: rgba(79, 195, 247, 0.12);
  transform: scale(1.03);
}
.upload-card h3 {
  color: #fff;
  font-size: 16px;
  font-weight: 500;
  margin: 12px 0 8px;
}
.upload-card-desc {
  color: rgba(255, 255, 255, 0.55);
  font-size: 13px;
  margin: 0;
  text-align: center;
  line-height: 1.4;
}
.upload-card-hint {
  color: rgba(255, 255, 255, 0.3);
  font-size: 11px;
  margin: 6px 0 0;
  text-align: center;
}
.upload-icon {
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 16px;
}

/* 压缩包卡片特殊样式 */
.zip-card {
  border-style: solid;
  border-color: rgba(255, 255, 255, 0.15);
}
.zip-card:hover {
  border-color: #4caf50;
  background: rgba(76, 175, 80, 0.08);
}
.zip-card.dragging {
  border-color: #4caf50;
  background: rgba(76, 175, 80, 0.12);
}

.url-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 500px;
  padding: 32px 32px 46px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
}
.title {
  color: #fff;
  font-size: 20px;
  font-weight: 500;
  margin-bottom: 12px;
}
.upload-desc {
  color: rgba(255, 255, 255, 0.55);
  font-size: 13px;
  margin: 0;
}
.url-input-group {
  display: flex;
  width: 100%;
  gap: 8px;
  margin-top: 16px;
}
.url-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}
.url-input::placeholder {
  color: rgba(255, 255, 255, 0.35);
}
.url-input:focus {
  border-color: #4fc3f7;
}
.url-load-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  background: #4fc3f7;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
  white-space: nowrap;
}
.url-load-btn:hover {
  background: #29b6f6;
}
.url-load-btn:disabled {
  background: rgba(255, 255, 255, 0.2);
  cursor: not-allowed;
}
</style>
