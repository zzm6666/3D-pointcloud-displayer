import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

// Placeholder token: the viewer never requests Ion-hosted assets, but the
// Cesium ion client refuses to initialize without one.
export const ION_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIiLCJpZCI6MCwiaWF0IjowfQ.local'

export const TILESET_LOAD_OPTIONS = {
  maximumScreenSpaceError: 10,
  preferLeaves: true,
  maximumMemoryUsage: 512
}

export function createViewer(container) {
  Cesium.Ion.defaultAccessToken = ION_ACCESS_TOKEN

  const viewer = new Cesium.Viewer(container, {
    baseLayer: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    creditContainer: document.createElement('div')
  })

  viewer.imageryLayers.removeAll()
  viewer.scene.globe.show = false
  viewer.scene.backgroundColor = Cesium.Color.WHITE
  viewer.scene.skyAtmosphere.show = false
  viewer.scene.sun.show = false
  viewer.scene.moon.show = false

  const canvas = viewer.scene.canvas
  canvas.addEventListener('contextmenu', (e) => e.preventDefault())

  // LEFT_DRAG = 0, MIDDLE_DRAG = 2. Some environments intercept left drag
  // before it reaches the canvas, so middle drag is bound as a fallback.
  const controller = viewer.scene.screenSpaceCameraController
  controller.enableInputs = true
  controller.rotateEventTypes = [0, 2]

  return viewer
}

/** Applies the point cloud display tuning shared by every load path. */
export function applyTilesetSettings(tileset) {
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

/** Framing offset that places the whole tileset in view at a 45 degree pitch. */
export function viewOffset(tileset) {
  const range = tileset.boundingSphere.radius * 2.5
  return new Cesium.HeadingPitchRange(0, -Math.PI / 4, range)
}
