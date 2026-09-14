import JSZip from 'jszip'

let directoryPickerSupported = null

export function isDirectoryPickerSupported() {
  if (directoryPickerSupported !== null) return directoryPickerSupported
  directoryPickerSupported = 'showDirectoryPicker' in window
  return directoryPickerSupported
}

export function isZipFile(file) {
  return file.name?.endsWith('.zip') || file.type === 'application/zip'
}

/** Recursively reads a FileSystemDirectoryHandle into a flat File list. */
export async function readDirectoryHandle(dirHandle, basePath = '') {
  const files = []
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'file') {
      const file = await handle.getFile()
      defineRelativePath(file, basePath + name)
      files.push(file)
    } else if (handle.kind === 'directory') {
      const subFiles = await readDirectoryHandle(handle, basePath + name + '/')
      files.push(...subFiles)
    }
  }
  return files
}

/** Reads dropped items, preferring the directory-aware entry API. */
export async function getFilesFromDataTransfer(items) {
  const entries = []
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.()
    if (entry) entries.push(entry)
  }

  const files = []
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

/** Decompresses a .zip archive into File objects with relative paths. */
export async function extractZipFile(file) {
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
        defineRelativePath(extractedFile, relativePath)
        return extractedFile
      })()
    )
  })

  return Promise.all(tasks)
}

async function readEntry(entry, basePath, files) {
  if (entry.isFile) {
    const file = await new Promise((resolve) => entry.file(resolve))
    defineRelativePath(file, basePath + file.name)
    files.push(file)
  } else if (entry.isDirectory) {
    const reader = entry.createReader()
    const childEntries = await readAllDirectoryEntries(reader)
    for (const childEntry of childEntries) {
      await readEntry(childEntry, basePath + entry.name + '/', files)
    }
  }
}

// readEntries only returns a batch at a time, so keep pulling until empty.
function readAllDirectoryEntries(reader) {
  return new Promise((resolve) => {
    const allEntries = []
    function readBatch() {
      reader.readEntries((entries) => {
        if (entries.length === 0) resolve(allEntries)
        else {
          allEntries.push(...entries)
          readBatch()
        }
      })
    }
    readBatch()
  })
}

// File.webkitRelativePath is read-only and empty for programmatically built
// File objects, so it is shadowed with a fixed value.
function defineRelativePath(file, path) {
  Object.defineProperty(file, 'webkitRelativePath', {
    value: path,
    writable: false
  })
}
