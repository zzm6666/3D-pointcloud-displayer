import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import * as Cesium from 'cesium'
import {
  applyTilesetSettings,
  createViewer,
  TILESET_LOAD_OPTIONS,
  viewOffset
} from '../cesium/viewer'
import { extractZipFile } from '../utils/fileReaders'
import { findRootTileset, processTilesetFiles } from '../utils/tilesetFiles'

const ERROR_VISIBLE_MS = 2000

/**
 * Owns the Cesium viewer and the lifetime of everything mounted into it.
 *
 * `ready` flips to true once a tileset is displayed and back to false when the
 * view is cleared, which is what drives the upload overlay in the UI.
 *
 * @param {import('vue').Ref<HTMLElement|null>} containerRef
 */
export function usePointCloudViewer(containerRef) {
  const viewer = shallowRef(null)
  const loading = ref(false)
  const ready = ref(false)
  const errorMsg = ref('')

  let errorTimer = null
  let currentTileset = null
  /** @type {Set<Cesium.Cesium3DTileset>} */
  const managedTilesets = new Set()
  /** @type {Set<string>} */
  let activeObjectUrls = new Set()

  watch(errorMsg, (value) => {
    if (errorTimer) clearTimeout(errorTimer)
    if (!value) return
    errorTimer = setTimeout(() => {
      errorMsg.value = ''
      errorTimer = null
    }, ERROR_VISIBLE_MS)
  })

  onMounted(() => {
    viewer.value = createViewer(containerRef.value)
  })

  onBeforeUnmount(() => {
    if (errorTimer) clearTimeout(errorTimer)
    destroyManagedResources()
    if (viewer.value && !viewer.value.isDestroyed()) viewer.value.destroy()
    viewer.value = null
  })

  function releaseObjectUrls(urls) {
    for (const url of urls) URL.revokeObjectURL(url)
    urls.clear()
  }

  function destroyTileset(tileset) {
    if (!tileset || !viewer.value || viewer.value.isDestroyed()) return
    if (viewer.value.scene.primitives.contains(tileset)) {
      viewer.value.scene.primitives.removeAndDestroy(tileset)
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

  /** Swaps in a new tileset, then tears down whatever it replaced. */
  async function attachTileset(tileset, objectUrls) {
    const previousTilesets = [...managedTilesets]

    viewer.value.scene.primitives.add(tileset)
    managedTilesets.add(tileset)
    applyTilesetSettings(tileset)
    await viewer.value.zoomTo(tileset, viewOffset(tileset))

    for (const previousTileset of previousTilesets)
      destroyTileset(previousTileset)
    releaseObjectUrls(activeObjectUrls)
    activeObjectUrls = objectUrls ?? new Set()
    currentTileset = tileset
    ready.value = true
  }

  async function loadFromUrl(url) {
    const target = url?.trim()
    if (!target) {
      errorMsg.value = '请输入 tileset.json 的 URL 地址'
      return false
    }

    loading.value = true
    errorMsg.value = ''
    let tileset = null
    try {
      tileset = await Cesium.Cesium3DTileset.fromUrl(
        target,
        TILESET_LOAD_OPTIONS
      )
      await attachTileset(tileset)
      return true
    } catch (err) {
      if (tileset) destroyTileset(tileset)
      console.error('加载点云失败:', err)
      errorMsg.value =
        err.message || '加载失败，请检查 URL 是否正确以及服务器是否支持跨域访问'
      return false
    } finally {
      loading.value = false
    }
  }

  async function loadFromFiles(fileList) {
    loading.value = true
    errorMsg.value = ''
    const objectUrls = new Set()
    let tileset = null
    try {
      const rootBlobUrl = await buildRootTilesetUrl(fileList, objectUrls)
      tileset = await Cesium.Cesium3DTileset.fromUrl(
        rootBlobUrl,
        TILESET_LOAD_OPTIONS
      )
      await attachTileset(tileset, objectUrls)
      return true
    } catch (err) {
      if (tileset) destroyTileset(tileset)
      releaseObjectUrls(objectUrls)
      console.error('加载点云失败:', err)
      errorMsg.value = err.message || '加载失败，请检查文件格式'
      return false
    } finally {
      loading.value = false
    }
  }

  async function loadFromZip(zipFile) {
    loading.value = true
    errorMsg.value = ''
    try {
      const extractedFiles = await extractZipFile(zipFile)
      if (extractedFiles.length === 0) throw new Error('压缩包为空')
      // loadFromFiles owns the loading flag from here, so release it first.
      loading.value = false
      await loadFromFiles(extractedFiles)
    } catch (err) {
      console.error('解压或加载失败:', err)
      errorMsg.value = err.message || '解压失败，请检查压缩包格式'
      loading.value = false
    }
  }

  async function buildRootTilesetUrl(fileList, objectUrls) {
    const fileMap = new Map()
    for (const file of fileList) {
      fileMap.set(file.webkitRelativePath || file.name, file)
    }

    const rootTilesetPath = findRootTileset(fileMap)
    if (!rootTilesetPath) throw new Error('未找到 tileset.json 文件')

    return processTilesetFiles(fileMap, rootTilesetPath, objectUrls)
  }

  /** Flies the camera back to the framing used when the tileset was loaded. */
  function resetView() {
    if (!currentTileset || !viewer.value) return
    viewer.value.flyTo(currentTileset, {
      offset: viewOffset(currentTileset),
      duration: 1.0,
      easingFunction: Cesium.EasingFunction.QUADRATIC_OUT
    })
  }

  /** Drops every loaded resource and returns to the upload screen. */
  function clear() {
    if (viewer.value) destroyManagedResources()
    ready.value = false
    errorMsg.value = ''
  }

  return {
    viewer,
    loading,
    ready,
    errorMsg,
    reportError: (message) => {
      errorMsg.value = message
    },
    loadFromUrl,
    loadFromFiles,
    loadFromZip,
    resetView,
    clear
  }
}
