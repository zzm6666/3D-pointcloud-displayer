/**
 * Picks the shallowest tileset.json in the tree, which is the entry point.
 * @param {Map<string, File>} fileMap path -> file
 * @returns {string|null}
 */
export function findRootTileset(fileMap) {
  let rootPath = null
  for (const [path] of fileMap) {
    if (path.split('/').pop() !== 'tileset.json') continue
    if (!rootPath || path.split('/').length < rootPath.split('/').length) {
      rootPath = path
    }
  }
  return rootPath
}

/**
 * Turns an in-memory file tree into a single Blob URL for the root tileset.
 *
 * Local files have no HTTP URL, so every referenced resource gets an object
 * URL and the tileset JSON is rewritten to point at it. Two passes are needed:
 * the first rewrites binary content references, the second rewrites references
 * to other .json tilesets (external tilesets) using the URLs from pass one.
 *
 * Every URL created here is added to `objectUrls` so the caller can revoke them.
 */
export async function processTilesetFiles(
  fileMap,
  rootTilesetPath,
  objectUrls
) {
  const createObjectUrl = (blob) => {
    const url = URL.createObjectURL(blob)
    objectUrls.add(url)
    return url
  }

  const assetUrls = new Map()
  for (const [path, file] of fileMap) {
    if (!path.endsWith('.json')) assetUrls.set(path, createObjectUrl(file))
  }

  const firstPassUrls = await rewriteJsonFiles(
    fileMap,
    assetUrls,
    createObjectUrl
  )
  const allUrls = new Map([...assetUrls, ...firstPassUrls])
  const finalUrls = await rewriteJsonFiles(fileMap, allUrls, createObjectUrl)

  return finalUrls.get(rootTilesetPath)
}

async function rewriteJsonFiles(fileMap, urlMap, createObjectUrl) {
  const rewritten = new Map()

  for (const [path, file] of fileMap) {
    if (!path.endsWith('.json')) continue
    try {
      const json = JSON.parse(await file.text())
      rewriteContentUris(json, basePathOf(path), urlMap)
      const blob = new Blob([JSON.stringify(json)], {
        type: 'application/json'
      })
      rewritten.set(path, createObjectUrl(blob))
    } catch {
      // Not parseable as JSON: serve the original bytes unchanged.
      rewritten.set(path, createObjectUrl(file))
    }
  }

  return rewritten
}

function basePathOf(path) {
  return path.substring(0, path.lastIndexOf('/') + 1)
}

function rewriteContentUris(tileset, basePath, urlMap) {
  if (tileset.root) rewriteTile(tileset.root, basePath, urlMap)
}

function rewriteTile(tile, basePath, urlMap) {
  const uri = tile.content?.uri
  if (uri) {
    const blobUrl = urlMap.get(basePath + uri)
    if (blobUrl) tile.content.uri = blobUrl
  }
  if (tile.children) {
    for (const child of tile.children) rewriteTile(child, basePath, urlMap)
  }
}
