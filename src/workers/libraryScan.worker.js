import * as exifr from 'exifr'

const THUMBNAIL_WIDTH = 512
const THUMBNAIL_HEIGHT = 256

const hashBufferSha256 = async (buffer) => {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const toFiniteNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const cleaned = value.replace(',', '.').trim()
    if (!cleaned) return null
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (Array.isArray(value) && value.length === 2) {
    const a = toFiniteNumber(value[0])
    const b = toFiniteNumber(value[1])
    if (a == null || b == null || b === 0) return null
    return a / b
  }
  if (value && typeof value === 'object') {
    const n = toFiniteNumber(value.numerator ?? value.num ?? value.n)
    const d = toFiniteNumber(value.denominator ?? value.den ?? value.d)
    if (n != null && d != null && d !== 0) return n / d
    const direct = toFiniteNumber(value.value)
    if (direct != null) return direct
  }
  return null
}

const findMetaValue = (metadata, targetKeys) => {
  if (!metadata || typeof metadata !== 'object') return null
  const wanted = new Set(targetKeys.map((k) => k.toLowerCase()))
  const visited = new Set()

  const walk = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 3 || visited.has(node)) return null
    visited.add(node)

    for (const [key, value] of Object.entries(node)) {
      if (wanted.has(String(key).toLowerCase()) && value != null && value !== '') {
        return value
      }
    }

    for (const value of Object.values(node)) {
      const nested = walk(value, depth + 1)
      if (nested != null && nested !== '') return nested
    }
    return null
  }

  return walk(metadata, 0)
}

const extractDeviceLabel = (metadata) => {
  if (!metadata) return 'Unknown device'
  const make = String(findMetaValue(metadata, ['Make', 'LensMake', 'CameraMake', 'Manufacturer']) || '').trim()
  const model = String(
    findMetaValue(metadata, [
      'Model',
      'CameraModelName',
      'UniqueCameraModel',
      'LensModel',
      'BodySerialNumber',
      'SerialNumber',
    ]) || '',
  ).trim()
  if (make && model) return `${make} ${model}`.trim()
  if (model) return model
  if (make) return make
  const software = String(
    findMetaValue(metadata, ['Software', 'CreatorTool', 'Device', 'DeviceModel', 'Camera', 'ModelName']) || '',
  ).trim()
  return software || 'Unknown device'
}

const extractCreatedAt = (file, metadata) => {
  const candidates = [
    metadata?.DateTimeOriginal,
    metadata?.CreateDate,
    metadata?.ModifyDate,
    metadata?.DateTimeDigitized,
    file.lastModified ? new Date(file.lastModified) : null,
    new Date(),
  ]
  for (const candidate of candidates) {
    if (!candidate) continue
    const d = candidate instanceof Date ? candidate : new Date(candidate)
    const ts = d.getTime()
    if (Number.isFinite(ts)) return ts
  }
  return Date.now()
}

const hasPanoramaMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object') return false
  const projectionTagRaw = metadata?.ProjectionType || metadata?.projectionType || metadata?.GPanoProjectionType
  const projectionTag = String(projectionTagRaw || '').toLowerCase()
  if (projectionTag.includes('equirectangular') || projectionTag.includes('cylindrical') || projectionTag.includes('spherical')) {
    return true
  }

  const usePanoramaViewer = metadata?.UsePanoramaViewer
  if (usePanoramaViewer === true || String(usePanoramaViewer || '').toLowerCase() === 'true') {
    return true
  }

  const gpanoKeys = [
    'GPanoFullPanoWidthPixels',
    'GPanoFullPanoHeightPixels',
    'GPanoCroppedAreaImageWidthPixels',
    'GPanoCroppedAreaImageHeightPixels',
    'FullPanoWidthPixels',
    'FullPanoHeightPixels',
    'CroppedAreaImageWidthPixels',
    'CroppedAreaImageHeightPixels',
  ]
  return gpanoKeys.some((key) => metadata[key] != null)
}

const buildProjection = (width, height, metadata, projectionMode) => {
  if (projectionMode === 'spherical') return 'spherical'
  if (projectionMode === 'cylindrical') return 'cylindrical'

  const projectionTagRaw = metadata?.ProjectionType || metadata?.projectionType || metadata?.GPanoProjectionType
  const projectionTag = String(projectionTagRaw || '').toLowerCase()
  if (projectionTag.includes('equirectangular')) return 'spherical'
  if (projectionTag.includes('cylindrical')) return 'cylindrical'

  const ratio = width / height
  return Math.abs(ratio - 2) <= 0.04 ? 'spherical' : 'cylindrical'
}

const arrayBufferToBase64 = (buffer) => {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk)
    binary += String.fromCharCode(...slice)
  }
  return btoa(binary)
}

const buildThumbnailDataUrl = async (file) => {
  const bitmap = await createImageBitmap(file)
  const canvas = new OffscreenCanvas(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT)
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  ctx.fillStyle = '#020617'
  ctx.fillRect(0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT)

  const scale = Math.max(THUMBNAIL_WIDTH / bitmap.width, THUMBNAIL_HEIGHT / bitmap.height)
  const drawWidth = bitmap.width * scale
  const drawHeight = bitmap.height * scale
  const x = (THUMBNAIL_WIDTH - drawWidth) / 2
  const y = (THUMBNAIL_HEIGHT - drawHeight) / 2
  ctx.drawImage(bitmap, x, y, drawWidth, drawHeight)
  bitmap.close()

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.75 })
  const buffer = await blob.arrayBuffer()
  return `data:image/jpeg;base64,${arrayBufferToBase64(buffer)}`
}

const processFile = async (file, relativePath, rootName, options) => {
  if (!file?.type?.startsWith('image/')) return { kind: 'skip' }
  if ((file.size || 0) > options.maxSizeBytes) return { kind: 'too-large' }

  const [buffer, bitmap, metadata] = await Promise.all([
    file.arrayBuffer(),
    createImageBitmap(file),
    exifr
      .parse(file, {
        tiff: true,
        exif: true,
        gps: true,
        xmp: true,
        icc: true,
        iptc: true,
        jfif: true,
      })
      .catch(() => null),
  ])

  const width = bitmap.width
  const height = bitmap.height
  bitmap.close()

  const ratio = height > 0 ? width / height : 0
  const panoramaCandidate = ratio >= options.minPanoramaRatio || hasPanoramaMetadata(metadata)
  if (!panoramaCandidate) return { kind: 'skip' }

  const fingerprint = `${file.size}-${file.lastModified}-${await hashBufferSha256(buffer)}`
  const createdAt = extractCreatedAt(file, metadata)
  const device = extractDeviceLabel(metadata)
  const projection = buildProjection(width, height, metadata, options.projectionMode)
  const thumbDataUrl = await buildThumbnailDataUrl(file).catch(() => '')

  return {
    kind: 'candidate',
    data: {
      name: file.name,
      relativePath: relativePath || '',
      rootName: rootName || '',
      fingerprint,
      width,
      height,
      projection,
      createdAt,
      device,
      thumbDataUrl,
    },
  }
}

self.onmessage = async (event) => {
  const msg = event.data || {}
  if (msg.type !== 'scan') return

  const files = Array.isArray(msg.files) ? msg.files : []
  const options = msg.options || {}

  for (const item of files) {
    try {
      const result = await processFile(item.file, item.relativePath, item.rootName, options)
      self.postMessage({ type: 'file-processed', result })
    } catch (error) {
      self.postMessage({
        type: 'file-processed',
        result: {
          kind: 'error',
          message: error instanceof Error ? error.message : 'worker-error',
        },
      })
    }
  }

  self.postMessage({ type: 'done' })
}
