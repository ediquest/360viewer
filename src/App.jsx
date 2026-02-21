import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import * as exifr from 'exifr'
import './App.css'

const DB_NAME = 'viewer360-db'
const DB_VERSION = 2
const PANORAMAS_STORE = 'panoramas'
const SETTINGS_STORE = 'settings'
const ROOT_HANDLE_KEY = 'fs-root-handle'
const MAX_LIBRARY_FILE_SIZE_BYTES = 100 * 1024 * 1024
const THUMBNAIL_WIDTH = 512
const THUMBNAIL_HEIGHT = 256
const MIN_PANORAMA_RATIO = 1.95

const QUALITY_MODES = {
  auto: Number.POSITIVE_INFINITY,
  max: Number.POSITIVE_INFINITY,
  q8192: 8192,
  q4096: 4096,
  q2048: 2048,
}

const QUALITY_LABELS = {
  auto: 'Auto (GPU max)',
  max: 'Maks (GPU)',
  q8192: '8192',
  q4096: '4096',
  q2048: '2048',
}

const PROJECTION_LABELS = {
  auto: 'Auto',
  spherical: 'Sferyczna',
  cylindrical: 'Cylindryczna',
}

const SPHERICAL_DEFAULT_FOV = 80
const SPHERICAL_MIN_FOV = 30
const SPHERICAL_MAX_FOV = 100

const CYLINDRICAL_DEFAULT_FOV = 54
const CYLINDRICAL_MIN_FOV = 45
const CYLINDRICAL_MAX_FOV = 140

const openDb = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      let panoramasStore
      if (!db.objectStoreNames.contains(PANORAMAS_STORE)) {
        panoramasStore = db.createObjectStore(PANORAMAS_STORE, { keyPath: 'id' })
      } else {
        panoramasStore = request.transaction.objectStore(PANORAMAS_STORE)
      }
      if (!panoramasStore.indexNames.contains('fingerprint')) {
        panoramasStore.createIndex('fingerprint', 'fingerprint', { unique: true })
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const dbPut = (db, storeName, value) =>
  new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    store.put(value)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

const dbGet = (db, storeName, key) =>
  new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.get(key)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const dbGetAll = (db, storeName) =>
  new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })

const dbGetByIndex = (db, storeName, indexName, key) =>
  new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const index = store.index(indexName)
    const request = index.get(key)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const dbDelete = (db, storeName, key) =>
  new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    store.delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

const dbClear = (db, storeName) =>
  new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    store.clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

const hashBufferSha256 = async (buffer) => {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function App() {
  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const folderInputRef = useRef(null)
  const currentUrlRef = useRef(null)
  const loadedImageRef = useRef(null)
  const loadedMetaRef = useRef(null)

  const rendererRef = useRef(null)
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const meshRef = useRef(null)
  const frameRef = useRef(null)
  const maxTextureSizeRef = useRef(4096)
  const activeProjectionRef = useRef('spherical')
  const lockVerticalRef = useRef(true)
  const dbRef = useRef(null)
  const rootDirHandleRef = useRef(null)
  const contextMenuRef = useRef(null)

  const dragStateRef = useRef({
    isPointerDown: false,
    pointerXOnDown: 0,
    pointerYOnDown: 0,
    lonOnDown: 0,
    latOnDown: 0,
    lon: 0,
    lat: 0,
  })

  const [status, setStatus] = useState('Przeciagnij panorame 2:1 lub kliknij, aby wybrac plik.')
  const [isDragging, setIsDragging] = useState(false)
  const [qualityMode, setQualityMode] = useState('auto')
  const [projectionMode, setProjectionMode] = useState('auto')
  const [activeProjection, setActiveProjection] = useState('spherical')
  const [lockVertical, setLockVertical] = useState(true)
  const [flipHorizontal, setFlipHorizontal] = useState(false)
  const [exifData, setExifData] = useState(null)
  const [isExifOpen, setIsExifOpen] = useState(false)
  const [isExifLoading, setIsExifLoading] = useState(false)
  const [exifError, setExifError] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [busyText, setBusyText] = useState('Ladowanie...')
  const [showTelemetry, setShowTelemetry] = useState(true)
  const [telemetry, setTelemetry] = useState({ yaw: 0, pitch: 0, fov: SPHERICAL_DEFAULT_FOV })
  const [historyItems, setHistoryItems] = useState([])
  const [hasActivePanorama, setHasActivePanorama] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState({})
  const [hasFolderAccess, setHasFolderAccess] = useState(false)
  const [homeTileSize, setHomeTileSize] = useState('small')
  const [homeProjectionFilter, setHomeProjectionFilter] = useState('all')
  const [homeDeviceFilter, setHomeDeviceFilter] = useState('all')
  const [homeSortOrder, setHomeSortOrder] = useState('desc')
  const [panelProjectionFilter, setPanelProjectionFilter] = useState('all')
  const [panelDeviceFilter, setPanelDeviceFilter] = useState('all')
  const [panelSortOrder, setPanelSortOrder] = useState('desc')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState({
    open: false,
    x: 0,
    y: 0,
    itemId: null,
    submenuSide: 'right',
    scope: 'panel',
  })

  useEffect(() => {
    if (!folderInputRef.current) return
    folderInputRef.current.setAttribute('webkitdirectory', '')
    folderInputRef.current.setAttribute('directory', '')
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(SPHERICAL_DEFAULT_FOV, 1, 1, 2000)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.outputColorSpace = THREE.SRGBColorSpace

    const getSafeSize = () => {
      const rect = container.getBoundingClientRect()
      const width = Math.max(1, Math.floor(rect.width))
      const height = Math.max(1, Math.floor(rect.height))
      return { width, height }
    }

    renderer.setPixelRatio(window.devicePixelRatio)
    const initialSize = getSafeSize()
    renderer.setSize(initialSize.width, initialSize.height)
    container.appendChild(renderer.domElement)

    rendererRef.current = renderer
    sceneRef.current = scene
    cameraRef.current = camera
    maxTextureSizeRef.current = renderer.capabilities.maxTextureSize || 4096
    setStatus(`Przeciagnij panorame 2:1 lub kliknij, aby wybrac plik. Limit GPU: ${maxTextureSizeRef.current}.`)

    const initialGeometry = new THREE.SphereGeometry(500, 60, 40)
    const initialMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.BackSide,
    })
    const initialMesh = new THREE.Mesh(initialGeometry, initialMaterial)
    scene.add(initialMesh)
    meshRef.current = initialMesh

    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return
      const { width, height } = getSafeSize()
      rendererRef.current.setSize(width, height)
      cameraRef.current.aspect = width / height
      cameraRef.current.updateProjectionMatrix()
    }

    const updateCamera = () => {
      const drag = dragStateRef.current
      const isLockedCylindrical = activeProjectionRef.current === 'cylindrical' && lockVerticalRef.current
      if (isLockedCylindrical) {
        drag.lat = 0
      } else {
        drag.lat = Math.max(-85, Math.min(85, drag.lat))
      }

      const phi = THREE.MathUtils.degToRad(90 - drag.lat)
      const theta = THREE.MathUtils.degToRad(drag.lon)

      const x = 500 * Math.sin(phi) * Math.cos(theta)
      const y = 500 * Math.cos(phi)
      const z = 500 * Math.sin(phi) * Math.sin(theta)

      camera.lookAt(x, y, z)
    }

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate)
      updateCamera()
      renderer.render(scene, camera)
    }

    const onPointerDown = (event) => {
      const drag = dragStateRef.current
      drag.isPointerDown = true
      drag.pointerXOnDown = event.clientX
      drag.pointerYOnDown = event.clientY
      drag.lonOnDown = drag.lon
      drag.latOnDown = drag.lat
    }

    const onPointerMove = (event) => {
      const drag = dragStateRef.current
      if (!drag.isPointerDown) return

      drag.lon = (drag.pointerXOnDown - event.clientX) * 0.1 + drag.lonOnDown
      const isLockedCylindrical = activeProjectionRef.current === 'cylindrical' && lockVerticalRef.current
      if (isLockedCylindrical) {
        drag.lat = 0
      } else {
        drag.lat = (event.clientY - drag.pointerYOnDown) * 0.1 + drag.latOnDown
      }
    }

    const onPointerUp = () => {
      dragStateRef.current.isPointerDown = false
    }

    const onWheel = (event) => {
      if (!cameraRef.current) return
      event.preventDefault()
      const isCyl = activeProjectionRef.current === 'cylindrical'
      const minFov = isCyl ? CYLINDRICAL_MIN_FOV : SPHERICAL_MIN_FOV
      const maxFov = isCyl ? CYLINDRICAL_MAX_FOV : SPHERICAL_MAX_FOV
      cameraRef.current.fov = THREE.MathUtils.clamp(cameraRef.current.fov + event.deltaY * 0.03, minFov, maxFov)
      cameraRef.current.updateProjectionMatrix()
    }

    handleResize()
    animate()
    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(container)

    container.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    container.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('resize', handleResize)

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      window.removeEventListener('resize', handleResize)
      resizeObserver.disconnect()
      container.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      container.removeEventListener('wheel', onWheel)

      if (meshRef.current) {
        if (meshRef.current.material.map) {
          meshRef.current.material.map.dispose()
        }
        meshRef.current.material.dispose()
        meshRef.current.geometry.dispose()
      }
      renderer.dispose()

      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }

      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      const camera = cameraRef.current
      const drag = dragStateRef.current
      if (!camera || !drag) return
      setTelemetry({
        yaw: Number(drag.lon.toFixed(2)),
        pitch: Number(drag.lat.toFixed(2)),
        fov: Number(camera.fov.toFixed(2)),
      })
    }, 120)

    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false

    const initDb = async () => {
      try {
        const db = await openDb()
        if (cancelled) return
        dbRef.current = db

        const [savedSettings, savedPanoramas] = await Promise.all([
          dbGet(db, SETTINGS_STORE, 'app'),
          dbGetAll(db, PANORAMAS_STORE),
        ])
        const savedRootHandle = await dbGet(db, SETTINGS_STORE, ROOT_HANDLE_KEY)
        if (cancelled) return

        if (savedSettings?.value) {
          const s = savedSettings.value
          if (s.qualityMode) setQualityMode(s.qualityMode)
          if (s.projectionMode) setProjectionMode(s.projectionMode)
          if (typeof s.lockVertical === 'boolean') setLockVertical(s.lockVertical)
          if (typeof s.flipHorizontal === 'boolean') setFlipHorizontal(s.flipHorizontal)
          if (typeof s.showTelemetry === 'boolean') setShowTelemetry(s.showTelemetry)
          if (s.homeTileSize) setHomeTileSize(s.homeTileSize)
          if (s.homeSortOrder) setHomeSortOrder(s.homeSortOrder)
          if (s.panelSortOrder) setPanelSortOrder(s.panelSortOrder)
        }

        const cleanedPanoramas = []
        for (const item of savedPanoramas || []) {
          if (item?.fileBlob) {
            const { fileBlob, ...trimmed } = item
            cleanedPanoramas.push(trimmed)
            await dbPut(db, PANORAMAS_STORE, trimmed)
          } else {
            cleanedPanoramas.push(item)
          }
        }

        const sorted = cleanedPanoramas.sort((a, b) => b.createdAt - a.createdAt)
        setHistoryItems(sorted)

        if (savedRootHandle?.value) {
          rootDirHandleRef.current = savedRootHandle.value
          try {
            const perm = await savedRootHandle.value.queryPermission({ mode: 'read' })
            setHasFolderAccess(perm === 'granted')
          } catch {
            setHasFolderAccess(false)
          }
        }

        const unknownItems = sorted.filter((item) => !item.device || item.device === 'Nieznane urzadzenie')
        if (unknownItems.length > 0) {
          const rootHandle = rootDirHandleRef.current
          const canReadRoot = rootHandle ? await ensureReadPermission(rootHandle) : false
          for (const item of unknownItems) {
            if (cancelled || !item.relativePath || !canReadRoot) continue
            try {
              const file = await getFileFromRelativePath(rootHandle, item.relativePath)
              if (!file) continue
              const parsed = await exifr.parse(file, {
                tiff: true,
                exif: true,
                xmp: true,
                iptc: true,
              })
              const device = extractDeviceLabel(parsed)
              if (device && device !== 'Nieznane urzadzenie') {
                const next = { ...item, device }
                await dbPut(db, PANORAMAS_STORE, next)
                setHistoryItems((prev) => prev.map((p) => (p.id === item.id ? next : p)))
              }
            } catch {
              // ignore item enrichment errors
            }
          }
        }
      } catch {
        // IndexedDB may be unavailable in private / restricted contexts
      }
    }

    initDb()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const db = dbRef.current
    if (!db) return
    const value = {
      qualityMode,
      projectionMode,
      lockVertical,
      flipHorizontal,
      showTelemetry,
      homeTileSize,
      homeSortOrder,
      panelSortOrder,
    }
    dbPut(db, SETTINGS_STORE, { key: 'app', value }).catch(() => {})
  }, [qualityMode, projectionMode, lockVertical, flipHorizontal, showTelemetry, homeTileSize, homeSortOrder, panelSortOrder])

  const applyProjectionCameraSettings = (projection) => {
    const camera = cameraRef.current
    if (!camera) return
    const defaultFov = projection === 'cylindrical' ? CYLINDRICAL_DEFAULT_FOV : SPHERICAL_DEFAULT_FOV
    const minFov = projection === 'cylindrical' ? CYLINDRICAL_MIN_FOV : SPHERICAL_MIN_FOV
    const maxFov = projection === 'cylindrical' ? CYLINDRICAL_MAX_FOV : SPHERICAL_MAX_FOV
    camera.fov = THREE.MathUtils.clamp(defaultFov, minFov, maxFov)
    camera.updateProjectionMatrix()
  }

  const getResolvedProjection = (width, height, metadata) => {
    if (projectionMode === 'spherical') return 'spherical'
    if (projectionMode === 'cylindrical') return 'cylindrical'

    const projectionTagRaw = metadata?.ProjectionType || metadata?.projectionType || metadata?.GPanoProjectionType
    const projectionTag = String(projectionTagRaw || '').toLowerCase()
    if (projectionTag.includes('equirectangular')) return 'spherical'
    if (projectionTag.includes('cylindrical')) return 'cylindrical'

    const ratio = width / height
    return Math.abs(ratio - 2) <= 0.04 ? 'spherical' : 'cylindrical'
  }

  const switchProjectionMesh = (projection) => {
    const scene = sceneRef.current
    if (!scene) return

    if (meshRef.current) {
      if (meshRef.current.material.map) {
        meshRef.current.material.map.dispose()
      }
      scene.remove(meshRef.current)
      meshRef.current.material.dispose()
      meshRef.current.geometry.dispose()
    }

    let geometry
    if (projection === 'cylindrical') {
      geometry = new THREE.CylinderGeometry(500, 500, 500, 96, 1, true)
    } else {
      geometry = new THREE.SphereGeometry(500, 60, 40)
    }

    const material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.BackSide,
    })
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)
    meshRef.current = mesh
    activeProjectionRef.current = projection
    setActiveProjection(projection)
    applyProjectionCameraSettings(projection)
  }

  useEffect(() => {
    lockVerticalRef.current = lockVertical
  }, [lockVertical])

  const preventDefaults = (event) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const canUseFsApi = typeof window !== 'undefined' && 'showDirectoryPicker' in window
  const canUseOpenFilePicker = typeof window !== 'undefined' && 'showOpenFilePicker' in window

  const ensureReadPermission = async (handle) => {
    if (!handle) return false
    try {
      const current = await handle.queryPermission({ mode: 'read' })
      if (current === 'granted') return true
      const requested = await handle.requestPermission({ mode: 'read' })
      return requested === 'granted'
    } catch {
      return false
    }
  }

  const getFileFromRelativePath = async (rootHandle, relativePath) => {
    if (!rootHandle || !relativePath) return null
    const parts = relativePath.split('/').filter(Boolean)
    if (parts.length === 0) return null

    let dir = rootHandle
    for (let i = 0; i < parts.length - 1; i += 1) {
      dir = await dir.getDirectoryHandle(parts[i], { create: false })
    }
    const fileHandle = await dir.getFileHandle(parts[parts.length - 1], { create: false })
    return fileHandle.getFile()
  }

  const getDirectoryFromRelativePath = async (rootHandle, relativePath) => {
    if (!rootHandle || !relativePath) return null
    const parts = relativePath.split('/').filter(Boolean)
    if (parts.length <= 1) return rootHandle

    let dir = rootHandle
    for (let i = 0; i < parts.length - 1; i += 1) {
      dir = await dir.getDirectoryHandle(parts[i], { create: false })
    }
    return dir
  }

  const formatDaySeparator = (timestamp) =>
    new Date(timestamp).toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

  const getDateGroupingKey = (timestamp) => new Date(timestamp).toISOString().slice(0, 10)

  const buildThumbnailDataUrl = (image) => {
    const targetWidth = THUMBNAIL_WIDTH
    const targetHeight = THUMBNAIL_HEIGHT
    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''

    ctx.fillStyle = '#020617'
    ctx.fillRect(0, 0, targetWidth, targetHeight)

    const scale = Math.max(targetWidth / image.naturalWidth, targetHeight / image.naturalHeight)
    const drawWidth = image.naturalWidth * scale
    const drawHeight = image.naturalHeight * scale
    const x = (targetWidth - drawWidth) / 2
    const y = (targetHeight - drawHeight) / 2

    ctx.drawImage(image, x, y, drawWidth, drawHeight)
    return canvas.toDataURL('image/jpeg', 0.75)
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
    if (!metadata) return 'Nieznane urzadzenie'
    const make = String(
      findMetaValue(metadata, ['Make', 'LensMake', 'CameraMake', 'Manufacturer']) || '',
    ).trim()
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
    const softLower = software.toLowerCase()
    if (softLower.includes('samsung')) return software
    if (softLower.includes('iphone') || softLower.includes('ios') || softLower.includes('apple')) return software
    if (softLower.includes('pixel') || softLower.includes('google')) return software
    return software || 'Nieznane urzadzenie'
  }

  const createFileFingerprint = async (file) => {
    try {
      const buffer = await file.arrayBuffer()
      const hash = await hashBufferSha256(buffer)
      return `${file.size}-${file.lastModified}-${hash}`
    } catch {
      return `${file.name}-${file.size}-${file.lastModified}`
    }
  }

  const readImageSize = (file) =>
    new Promise((resolve, reject) => {
      const image = new Image()
      const tmpUrl = URL.createObjectURL(file)

      image.onload = () => {
        resolve({ image, width: image.naturalWidth, height: image.naturalHeight, tmpUrl })
      }
      image.onerror = () => {
        URL.revokeObjectURL(tmpUrl)
        reject(new Error('Cannot read image'))
      }
      image.src = tmpUrl
    })

  const getRequestedMaxWidth = () => {
    const selected = QUALITY_MODES[qualityMode] ?? QUALITY_MODES.auto
    if (!Number.isFinite(selected)) {
      return maxTextureSizeRef.current
    }
    return selected
  }

  const applyTextureFromImage = (image, width, height) => {
    const requestedMax = getRequestedMaxWidth()
    const maxWidth = Math.min(requestedMax, maxTextureSizeRef.current, width)
    const scale = width > maxWidth ? maxWidth / width : 1

    const drawWidth = Math.round(width * scale)
    const drawHeight = Math.round(height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = drawWidth
    canvas.height = drawHeight

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return { drawWidth, drawHeight }
    ctx.drawImage(image, 0, 0, drawWidth, drawHeight)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = false
    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    texture.flipY = true
    if (!flipHorizontal) {
      texture.wrapS = THREE.RepeatWrapping
      texture.repeat.x = -1
      texture.offset.x = 1
    }
    texture.needsUpdate = true

    const mesh = meshRef.current
    if (!mesh) return { drawWidth, drawHeight }

    if (mesh.material.map) {
      mesh.material.map.dispose()
    }

    mesh.material.map = texture
    mesh.material.color.set(0xffffff)
    mesh.material.needsUpdate = true

    return { drawWidth, drawHeight, requestedMax }
  }

  const updateStatusAfterTexture = (name, width, height, drawWidth, drawHeight, requestedMax, projection) => {
    const wasScaled = drawWidth !== width
    const modeLabel = QUALITY_LABELS[qualityMode] || qualityMode
    const reqLabel = Number.isFinite(requestedMax) ? requestedMax : maxTextureSizeRef.current
    const projectionLabel = PROJECTION_LABELS[projection || activeProjection]
    setStatus(
      wasScaled
        ? `Zaladowano: ${name} (${width}x${height}), wyswietlane: ${drawWidth}x${drawHeight}. Projekcja: ${projectionLabel}. Tryb jakosci: ${modeLabel}, limit trybu: ${reqLabel}, limit GPU: ${maxTextureSizeRef.current}.`
        : `Zaladowano: ${name} (${width}x${height}) w pelnej rozdzielczosci. Projekcja: ${projectionLabel}. Tryb jakosci: ${modeLabel}, limit GPU: ${maxTextureSizeRef.current}.`,
    )
  }

  const saveHistoryEntry = async ({ file, image, width, height, projection, metadata, fingerprint, relativePath }) => {
    const db = dbRef.current
    if (!db) return { added: false, reason: 'no-db' }

    const existing = await dbGetByIndex(db, PANORAMAS_STORE, 'fingerprint', fingerprint).catch(() => null)
    if (existing) {
      return { added: false, reason: 'duplicate', existing }
    }

    const createdAt = extractCreatedAt(file, metadata)
    const device = extractDeviceLabel(metadata)
    const entry = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: file.name,
      width,
      height,
      projection,
      fingerprint,
      createdAt,
      dateKey: getDateGroupingKey(createdAt),
      device,
      relativePath: relativePath || '',
      thumbDataUrl: buildThumbnailDataUrl(image),
    }

    await dbPut(db, PANORAMAS_STORE, entry)
    setHistoryItems((prev) => [entry, ...prev])
    return { added: true, entry }
  }

  const isPanoramaCandidate = (width, height) => {
    if (!width || !height) return false
    const ratio = width / height
    return ratio >= MIN_PANORAMA_RATIO
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

  const isPanoramaCandidateWithMetadata = (width, height, metadata) => {
    if (isPanoramaCandidate(width, height)) return true
    return hasPanoramaMetadata(metadata)
  }

  const ingestFileToHistory = async (file, options = {}) => {
    const { relativePath = '' } = options
    if (!file?.type?.startsWith('image/')) return false
    const db = dbRef.current
    if (!db) return 'skip'
    if ((file.size || 0) > MAX_LIBRARY_FILE_SIZE_BYTES) return 'too-large'

    const fingerprint = await createFileFingerprint(file)
    const existing = await dbGetByIndex(db, PANORAMAS_STORE, 'fingerprint', fingerprint).catch(() => null)
    if (existing) return 'duplicate'

    const { image, width, height, tmpUrl } = await readImageSize(file)
    let parsed = null
    try {
      parsed = await exifr.parse(file, {
        tiff: true,
        exif: true,
        gps: true,
        xmp: true,
      })
    } catch {
      parsed = null
    }

    if (!isPanoramaCandidateWithMetadata(width, height, parsed)) {
      URL.revokeObjectURL(tmpUrl)
      return 'skip'
    }

    const projection = getResolvedProjection(width, height, parsed)
    const saveResult = await saveHistoryEntry({
      file,
      image,
      width,
      height,
      projection,
      metadata: parsed,
      fingerprint,
      relativePath,
    })
    URL.revokeObjectURL(tmpUrl)
    return saveResult.added ? 'added' : 'duplicate'
  }

  const processPanoramaFile = async (file, options = {}) => {
    const { persistHistory = true, forcedProjection = null, loadingText = 'Wczytywanie panoramy...' } = options

    if (!file || !file.type.startsWith('image/')) {
      setStatus('To nie jest plik obrazu.')
      return
    }

    try {
      setBusyText(loadingText)
      setIsBusy(true)
      await new Promise((resolve) => requestAnimationFrame(resolve))

      setExifData(null)
      setExifError('')
      setIsExifLoading(true)
      const { image, width, height, tmpUrl } = await readImageSize(file)
      const ratio = width / height
      let parsed = null
      try {
        parsed = await exifr.parse(file, {
          tiff: true,
          exif: true,
          gps: true,
          xmp: true,
          icc: true,
          iptc: true,
          jfif: true,
        })
        setExifData(parsed || {})
      } catch {
        setExifError('Nie udalo sie odczytac EXIF.')
      } finally {
        setIsExifLoading(false)
      }

      const resolvedProjection = forcedProjection || getResolvedProjection(width, height, parsed)

      if (!isPanoramaCandidateWithMetadata(width, height, parsed)) {
        URL.revokeObjectURL(tmpUrl)
        setStatus(`To nie wyglada na panorame: ${width}x${height} (min. proporcja ~${MIN_PANORAMA_RATIO}:1 lub metadane GPano).`)
        setIsBusy(false)
        return
      }

      if (resolvedProjection === 'spherical' && Math.abs(ratio - 2) > 0.15) {
        URL.revokeObjectURL(tmpUrl)
        setStatus(`W trybie sferycznym wymagane proporcje bliskie 2:1. Otrzymano ${width}x${height}.`)
        setIsBusy(false)
        return
      }

      if (resolvedProjection !== activeProjectionRef.current) {
        switchProjectionMesh(resolvedProjection)
      }

      const { drawWidth, drawHeight, requestedMax } = applyTextureFromImage(image, width, height)

      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current)
      }
      currentUrlRef.current = tmpUrl
      loadedImageRef.current = image
      loadedMetaRef.current = { name: file.name, width, height }

      updateStatusAfterTexture(file.name, width, height, drawWidth, drawHeight, requestedMax, resolvedProjection)
      setHasActivePanorama(true)

      if (persistHistory) {
        const fingerprint = await createFileFingerprint(file)
        const saveResult = await saveHistoryEntry({
          file,
          image,
          width,
          height,
          projection: resolvedProjection,
          metadata: parsed,
          fingerprint,
          relativePath: file.webkitRelativePath || '',
        })
        if (saveResult.reason === 'duplicate') {
          setStatus((prev) => `${prev} (Juz jest w historii)`)
        }
      }

    } catch {
      setIsExifLoading(false)
      setStatus('Nie udalo sie wczytac obrazu.')
    } finally {
      setIsBusy(false)
    }
  }

  const handleFile = async (file) => {
    await processPanoramaFile(file, { persistHistory: true, loadingText: 'Wczytywanie panoramy...' })
  }

  const openHistoryItem = async (item) => {
    if (!item?.relativePath) {
      setStatus('Brak sciezki do pliku w historii. Ponownie zaimportuj ten folder.')
      return
    }

    const root = rootDirHandleRef.current
    if (!root) {
      setStatus('Brak podlaczonego folderu. Kliknij "Wybierz folder".')
      return
    }

    const granted = await ensureReadPermission(root)
    setHasFolderAccess(granted)
    if (!granted) {
      setStatus('Brak uprawnienia do folderu. Uzyj "Odswiez dostep".')
      return
    }

    try {
      const file = await getFileFromRelativePath(root, item.relativePath)
      if (!file) {
        setStatus('Nie znaleziono pliku na dysku. Sprawdz czy folder nadal zawiera te panoramy.')
        return
      }
      await processPanoramaFile(file, {
        persistHistory: false,
        forcedProjection: item.projection,
        loadingText: 'Wczytywanie panoramy...',
      })
    } catch {
      setStatus('Nie znaleziono pliku na dysku. Wybierz poprawny folder z panoramami.')
    }
  }

  const removeHistoryItem = async (itemId) => {
    if (!itemId) return
    const db = dbRef.current
    if (db) {
      await dbDelete(db, PANORAMAS_STORE, itemId).catch(() => {})
    }
    setHistoryItems((prev) => prev.filter((item) => item.id !== itemId))
    setDeleteTarget(null)
  }

  const clearLibrary = async () => {
    const db = dbRef.current
    if (db) {
      await dbClear(db, PANORAMAS_STORE).catch(() => {})
    }
    setHistoryItems([])
    setCollapsedGroups({})
    setDeleteTarget(null)
    setIsClearConfirmOpen(false)
    setStatus('Biblioteka zostala wyczyszczona.')
  }

  const exifEntries = exifData ? Object.entries(exifData) : []
  const groupedHistory = useMemo(() => {
    const filtered = historyItems.filter((item) => {
      const projectionOk = panelProjectionFilter === 'all' || item.projection === panelProjectionFilter
      const deviceOk = panelDeviceFilter === 'all' || item.device === panelDeviceFilter
      return projectionOk && deviceOk
    })
    const sorted = [...filtered].sort((a, b) =>
      panelSortOrder === 'asc' ? a.createdAt - b.createdAt : b.createdAt - a.createdAt,
    )
    return sorted.reduce((acc, item) => {
      const key = item.dateKey || getDateGroupingKey(item.createdAt)
      const existing = acc.find((group) => group.key === key)
      if (existing) {
        existing.items.push(item)
        return acc
      }
      acc.push({
        key,
        label: formatDaySeparator(item.createdAt),
        items: [item],
      })
      return acc
    }, [])
  }, [historyItems, panelProjectionFilter, panelDeviceFilter, panelSortOrder])

  const uniqueDevices = useMemo(() => {
    const set = new Set()
    for (const item of historyItems) {
      if (item.device) set.add(item.device)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [historyItems])

  const filteredGroupedHistory = groupedHistory

  const filteredHomeItems = useMemo(
    () => {
      const filtered = historyItems.filter((item) => {
        const projectionOk = homeProjectionFilter === 'all' || item.projection === homeProjectionFilter
        const deviceOk = homeDeviceFilter === 'all' || item.device === homeDeviceFilter
        return projectionOk && deviceOk
      })
      return [...filtered].sort((a, b) =>
        homeSortOrder === 'asc' ? a.createdAt - b.createdAt : b.createdAt - a.createdAt,
      )
    },
    [historyItems, homeProjectionFilter, homeDeviceFilter, homeSortOrder],
  )

  const formatShortDateTime = (timestamp) => {
    if (!timestamp) return '-'
    const d = new Date(timestamp)
    if (!Number.isFinite(d.getTime())) return '-'
    return d.toLocaleString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const toggleHistoryGroup = (key) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const collapseAllGroups = () => {
    const next = {}
    for (const group of filteredGroupedHistory) {
      next[group.key] = true
    }
    setCollapsedGroups(next)
  }

  const expandAllGroups = () => {
    setCollapsedGroups((prev) => {
      const next = { ...prev }
      for (const group of filteredGroupedHistory) {
        delete next[group.key]
      }
      return next
    })
  }

  const openContextMenu = (event, itemId = null, scope = 'panel') => {
    event.preventDefault()
    event.stopPropagation()
    const submenuSide = event.clientX > window.innerWidth - 420 ? 'left' : 'right'
    setContextMenu({
      open: true,
      x: event.clientX,
      y: event.clientY,
      itemId,
      submenuSide,
      scope,
    })
  }

  const closeContextMenu = () => {
    setContextMenu((prev) => ({ ...prev, open: false }))
  }

  useEffect(() => {
    if (!contextMenu.open) return
    const close = () => closeContextMenu()
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
    }
  }, [contextMenu.open])

  useEffect(() => {
    if (!contextMenu.open || !contextMenuRef.current) return
    const el = contextMenuRef.current
    const rect = el.getBoundingClientRect()
    const pad = 10
    let x = contextMenu.x
    let y = contextMenu.y

    if (x + rect.width > window.innerWidth - pad) {
      x = Math.max(pad, window.innerWidth - rect.width - pad)
    }
    if (y + rect.height > window.innerHeight - pad) {
      y = Math.max(pad, window.innerHeight - rect.height - pad)
    }
    if (x !== contextMenu.x || y !== contextMenu.y) {
      setContextMenu((prev) => ({ ...prev, x, y }))
    }
  }, [contextMenu.open, contextMenu.x, contextMenu.y])

  useEffect(() => {
    const image = loadedImageRef.current
    const meta = loadedMetaRef.current
    if (!image || !meta) return

    let cancelled = false

    const rerenderWithQuality = async () => {
      setBusyText('Zmiana ustawien...')
      setIsBusy(true)
      await new Promise((resolve) => requestAnimationFrame(resolve))
      if (cancelled) return

      const resolvedProjection = getResolvedProjection(meta.width, meta.height, exifData)
      if (resolvedProjection !== activeProjectionRef.current) {
        switchProjectionMesh(resolvedProjection)
      }

      const { drawWidth, drawHeight, requestedMax } = applyTextureFromImage(image, meta.width, meta.height)
      updateStatusAfterTexture(meta.name, meta.width, meta.height, drawWidth, drawHeight, requestedMax, resolvedProjection)
      if (!cancelled) {
        setIsBusy(false)
      }
    }

    rerenderWithQuality()

    return () => {
      cancelled = true
    }
  }, [qualityMode, projectionMode, flipHorizontal])

  const onDrop = async (event) => {
    preventDefaults(event)
    setIsDragging(false)
    const [file] = event.dataTransfer.files
    await handleFile(file)
  }

  const onInputChange = async (event) => {
    const [file] = event.target.files || []
    await handleFile(file)
    event.target.value = ''
  }

  const onFolderInputChange = async (event) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    try {
      setBusyText('Skanowanie folderu panoram...')
      setIsBusy(true)
      await new Promise((resolve) => requestAnimationFrame(resolve))

      let added = 0
      let duplicates = 0
      let tooLarge = 0
      for (const file of files) {
        try {
          const result = await ingestFileToHistory(file, { relativePath: file.webkitRelativePath || '' })
          if (result === 'added') added += 1
          if (result === 'duplicate') duplicates += 1
          if (result === 'too-large') tooLarge += 1
        } catch {
          // skip unreadable files
        }
      }
      setStatus(
        `Skan folderu zakonczony. Dodano ${added}, duplikaty: ${duplicates}, >100MB pominiete: ${tooLarge}, wszystkich plikow: ${files.length}.`,
      )
    } finally {
      setIsBusy(false)
      event.target.value = ''
    }
  }

  const scanDirectoryHandle = async (dirHandle, pathPrefix = '') => {
    let added = 0
    let duplicates = 0
    let tooLarge = 0
    let checked = 0

    // eslint-disable-next-line no-restricted-syntax
    for await (const [name, handle] of dirHandle.entries()) {
      if (handle.kind === 'directory') {
        const nested = await scanDirectoryHandle(handle, `${pathPrefix}${name}/`)
        added += nested.added
        duplicates += nested.duplicates
        tooLarge += nested.tooLarge
        checked += nested.checked
      } else if (handle.kind === 'file') {
        checked += 1
        try {
          const file = await handle.getFile()
          const result = await ingestFileToHistory(file, { relativePath: `${pathPrefix}${name}` })
          if (result === 'added') added += 1
          if (result === 'duplicate') duplicates += 1
          if (result === 'too-large') tooLarge += 1
        } catch {
          // skip files that cannot be read
        }
      }
    }

    return { added, duplicates, tooLarge, checked }
  }

  const pickFolderWithFsApi = async () => {
    if (!canUseFsApi) {
      folderInputRef.current?.click()
      return
    }

    try {
      // @ts-ignore
      const dirHandle = await window.showDirectoryPicker()
      const granted = await ensureReadPermission(dirHandle)
      setHasFolderAccess(granted)
      if (!granted) {
        setStatus('Nie przyznano dostepu do folderu.')
        return
      }

      rootDirHandleRef.current = dirHandle
      if (dbRef.current) {
        await dbPut(dbRef.current, SETTINGS_STORE, { key: ROOT_HANDLE_KEY, value: dirHandle })
      }

      setBusyText('Skanowanie folderu panoram...')
      setIsBusy(true)
      await new Promise((resolve) => requestAnimationFrame(resolve))
      const { added, duplicates, tooLarge, checked } = await scanDirectoryHandle(dirHandle)
      setStatus(
        `Skan folderu zakonczony. Dodano ${added}, duplikaty: ${duplicates}, >100MB pominiete: ${tooLarge}, sprawdzono plikow: ${checked}.`,
      )
    } catch {
      setStatus('Anulowano wybor folderu lub przegladarka nie obsluguje tej funkcji.')
    } finally {
      setIsBusy(false)
    }
  }

  const refreshFolderAccess = async () => {
    const root = rootDirHandleRef.current
    if (!root) {
      await pickFolderWithFsApi()
      return
    }
    const granted = await ensureReadPermission(root)
    setHasFolderAccess(granted)
    setStatus(granted ? 'Dostep do folderu odswiezony.' : 'Nie udalo sie odswiezyc dostepu do folderu.')
  }

  const revealHistoryItemOnDisk = async (item) => {
    if (!item?.relativePath) {
      setStatus('Brak sciezki do pliku w historii. Ponownie zaimportuj ten folder.')
      return
    }

    if (!canUseFsApi && !canUseOpenFilePicker) {
      setStatus('Ta przegladarka nie obsluguje API plikow/folderow. Uzyj Chrome/Edge.')
      return
    }

    const root = rootDirHandleRef.current
    if (!root) {
      setStatus('Brak podlaczonego folderu. Kliknij "Wybierz folder".')
      return
    }

    const granted = await ensureReadPermission(root)
    setHasFolderAccess(granted)
    if (!granted) {
      setStatus('Brak uprawnienia do folderu. Uzyj "Odswiez dostep".')
      return
    }

    try {
      const dir = await getDirectoryFromRelativePath(root, item.relativePath)
      const startIn = dir || root
      if (canUseOpenFilePicker) {
        await window.showOpenFilePicker({
          multiple: false,
          startIn,
          types: [
            {
              description: 'Obrazy',
              accept: {
                'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'],
              },
            },
          ],
        })
      } else {
        await window.showDirectoryPicker({ mode: 'read', startIn })
      }
      setStatus(`Otwarto lokalizacje na dysku dla: ${item.name}`)
    } catch {
      setStatus('Nie udalo sie otworzyc folderu. Sprawdz uprawnienia przegladarki.')
    }
  }

  const selectedContextItem = contextMenu.itemId
    ? historyItems.find((item) => item.id === contextMenu.itemId) || null
    : null
  const menuProjectionFilter = contextMenu.scope === 'home' ? homeProjectionFilter : panelProjectionFilter
  const menuDeviceFilter = contextMenu.scope === 'home' ? homeDeviceFilter : panelDeviceFilter
  const menuSortOrder = contextMenu.scope === 'home' ? homeSortOrder : panelSortOrder
  const setMenuProjectionFilter = (value) => {
    if (contextMenu.scope === 'home') {
      setHomeProjectionFilter(value)
    } else {
      setPanelProjectionFilter(value)
    }
  }
  const setMenuDeviceFilter = (value) => {
    if (contextMenu.scope === 'home') {
      setHomeDeviceFilter(value)
    } else {
      setPanelDeviceFilter(value)
    }
  }
  const setMenuSortOrder = (value) => {
    if (contextMenu.scope === 'home') {
      setHomeSortOrder(value)
    } else {
      setPanelSortOrder(value)
    }
  }

  return (
    <div
      className={`app ${isDragging ? 'dragging' : ''}`}
      onContextMenu={(event) => openContextMenu(event, null, 'home')}
      onDragEnter={(event) => {
        preventDefaults(event)
        setIsDragging(true)
      }}
      onDragOver={preventDefaults}
      onDragLeave={(event) => {
        preventDefaults(event)
        if (event.currentTarget === event.target) {
          setIsDragging(false)
        }
      }}
      onDrop={onDrop}
    >
      <div className="toolbar">
        <button type="button" className="brand-button" onClick={() => setHasActivePanorama(false)}>
          Panorama 360 Viewer
        </button>
        <button type="button" onClick={() => inputRef.current?.click()}>
          Wybierz obraz
        </button>
        <label>
          Projekcja:
          <select value={projectionMode} onChange={(event) => setProjectionMode(event.target.value)}>
            <option value="auto">Auto</option>
            <option value="spherical">Sferyczna</option>
            <option value="cylindrical">Cylindryczna</option>
          </select>
        </label>
        <label>
          Blokuj pion (cyl.):
          <input
            type="checkbox"
            checked={lockVertical}
            onChange={(event) => setLockVertical(event.target.checked)}
          />
        </label>
        <label>
          Jakosc:
          <select value={qualityMode} onChange={(event) => setQualityMode(event.target.value)}>
            <option value="auto">Auto (GPU max)</option>
            <option value="max">Maks (GPU)</option>
            <option value="q8192">8192</option>
            <option value="q4096">4096</option>
            <option value="q2048">2048</option>
          </select>
        </label>
        <label>
          Odwroc poziomo:
          <input
            type="checkbox"
            checked={flipHorizontal}
            onChange={(event) => setFlipHorizontal(event.target.checked)}
          />
        </label>
        <label>
          Pokaz telemetry:
          <input
            type="checkbox"
            checked={showTelemetry}
            onChange={(event) => setShowTelemetry(event.target.checked)}
          />
        </label>
        <button type="button" onClick={() => setIsExifOpen(true)} disabled={!loadedMetaRef.current || isExifLoading}>
          Pokaz EXIF
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden-input"
          onChange={onInputChange}
        />
      </div>
      <p className="status">{status}</p>
      <div className="viewer-wrap">
        <div ref={containerRef} className="viewer" />
        {!hasActivePanorama && (
          <div className="home-grid-overlay" onContextMenu={(event) => openContextMenu(event, null, 'home')}>
            {filteredHomeItems.length === 0 ? (
              <div className="home-empty">
                <h2>Brak panoram dla aktywnego filtra</h2>
                <p>Zmien filtr w menu kontekstowym albo dodaj panoramy do biblioteki.</p>
              </div>
            ) : (
              <div className={`home-grid home-grid-${homeTileSize}`}>
                {filteredHomeItems.map((item) => (
                  <button
                    key={`home-${item.id}`}
                    type="button"
                    className={`home-tile home-tile-${homeTileSize}`}
                    onClick={() => openHistoryItem(item)}
                    onContextMenu={(event) => openContextMenu(event, item.id, 'home')}
                    title={`${item.name} (${item.width}x${item.height})`}
                  >
                    {item.thumbDataUrl ? (
                      <img src={item.thumbDataUrl} alt={item.name} className="home-tile-thumb" />
                    ) : (
                      <div className="home-tile-thumb home-tile-thumb-placeholder" />
                    )}
                    <span className="home-tile-name">{item.name}</span>
                    <span className="home-tile-meta">Typ: {PROJECTION_LABELS[item.projection] || 'Nieznany'}</span>
                    <span className="home-tile-meta">Urzadzenie: {item.device || 'Nieznane urzadzenie'}</span>
                    <span className="home-tile-meta">Data: {formatShortDateTime(item.createdAt)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {showTelemetry && (
          <div className="telemetry-panel">
            <div>Yaw: {telemetry.yaw}</div>
            <div>Pitch: {telemetry.pitch}</div>
            <div>FOV: {telemetry.fov}</div>
            <div>Proj: {PROJECTION_LABELS[activeProjection]}</div>
          </div>
        )}
        <div className="side-panel-hover-zone" aria-hidden="true" />
        <aside
          className={`side-panel ${
            (contextMenu.open && contextMenu.scope === 'panel') || deleteTarget || isClearConfirmOpen ? 'is-open' : ''
          }`}
          aria-label="Prawy panel"
          onContextMenu={(event) => openContextMenu(event, null, 'panel')}
        >
          <button
            type="button"
            className="side-panel-tab"
            aria-label="Rozwin biblioteke panoram"
            onContextMenu={(event) => openContextMenu(event, null, 'panel')}
          >
            Biblioteka
          </button>
          <div className="side-panel-content" onContextMenu={(event) => openContextMenu(event, null, 'panel')}>
            <h3>Biblioteka panoram</h3>
            <div className="history-list">
              {filteredGroupedHistory.length === 0 && <p className="history-empty">Brak panoram dla aktywnego filtra.</p>}
              {filteredGroupedHistory.map((group) => (
                <section key={group.key} className="history-group">
                  <button type="button" className="history-date-btn" onClick={() => toggleHistoryGroup(group.key)}>
                    <span>{group.label}</span>
                    <span className="history-date-count">
                      {collapsedGroups[group.key] ? '+' : '-'} {group.items.length}
                    </span>
                  </button>
                  {!collapsedGroups[group.key] &&
                    group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="history-item"
                        onClick={() => openHistoryItem(item)}
                        onContextMenu={(event) => openContextMenu(event, item.id)}
                        title={`${item.name} (${item.width}x${item.height})`}
                      >
                        {item.thumbDataUrl ? (
                          <img src={item.thumbDataUrl} alt={item.name} className="history-thumb" />
                        ) : (
                          <div className="history-thumb history-thumb-placeholder" />
                        )}
                        <div className="history-meta">
                          <span className="history-name">{item.name}</span>
                          <span className="history-sub">
                            {item.width}x{item.height} | {PROJECTION_LABELS[item.projection]}
                          </span>
                        </div>
                      </button>
                    ))}
                </section>
              ))}
            </div>
            <div className="history-actions">
              <button type="button" className="folder-btn" onClick={pickFolderWithFsApi}>
                Wybierz folder
              </button>
              {!hasFolderAccess && (
                <button type="button" className="folder-btn secondary-btn" onClick={refreshFolderAccess}>
                  Odswiez dostep
                </button>
              )}
              <input
                ref={folderInputRef}
                type="file"
                multiple
                className="hidden-input"
                onChange={onFolderInputChange}
              />
            </div>
          </div>
        </aside>
      </div>

      {contextMenu.open && (
        <div
          ref={contextMenuRef}
          className={`context-menu ${contextMenu.submenuSide === 'left' ? 'submenu-left' : 'submenu-right'}`}
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="context-title">Filtry</div>
          <div className="context-menu-submenu">
            <button type="button" className="context-menu-item submenu-trigger">
              <span className="cm-icon cm-filter" />
              <span>Typ panoramy</span>
              <span className="submenu-arrow">›</span>
            </button>
            <div className="context-submenu-panel">
              <button
                type="button"
                className={`context-menu-item ${menuProjectionFilter === 'all' ? 'active' : ''}`}
                onClick={() => {
                  setMenuProjectionFilter('all')
                  closeContextMenu()
                }}
              >
                <span>Wszystkie</span>
              </button>
              <button
                type="button"
                className={`context-menu-item ${menuProjectionFilter === 'spherical' ? 'active' : ''}`}
                onClick={() => {
                  setMenuProjectionFilter('spherical')
                  closeContextMenu()
                }}
              >
                <span>Sferyczne</span>
              </button>
              <button
                type="button"
                className={`context-menu-item ${menuProjectionFilter === 'cylindrical' ? 'active' : ''}`}
                onClick={() => {
                  setMenuProjectionFilter('cylindrical')
                  closeContextMenu()
                }}
              >
                <span>Cylindryczne</span>
              </button>
            </div>
          </div>
          <div className="context-menu-submenu">
            <button type="button" className="context-menu-item submenu-trigger">
              <span className="cm-icon cm-filter" />
              <span>Urzadzenie</span>
              <span className="submenu-arrow">›</span>
            </button>
            <div className="context-submenu-panel">
              <button
                type="button"
                className={`context-menu-item ${menuDeviceFilter === 'all' ? 'active' : ''}`}
                onClick={() => {
                  setMenuDeviceFilter('all')
                  closeContextMenu()
                }}
              >
                <span>Wszystkie</span>
              </button>
              {uniqueDevices.map((device) => (
                <button
                  key={device}
                  type="button"
                  className={`context-menu-item ${menuDeviceFilter === device ? 'active' : ''}`}
                  onClick={() => {
                    setMenuDeviceFilter(device)
                    closeContextMenu()
                  }}
                >
                  <span>{device}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="context-menu-submenu">
            <button type="button" className="context-menu-item submenu-trigger">
              <span className="cm-icon cm-expand" />
              <span>Rozmiar kafelkow</span>
              <span className="submenu-arrow">›</span>
            </button>
            <div className="context-submenu-panel">
              <button
                type="button"
                className={`context-menu-item ${homeTileSize === 'small' ? 'active' : ''}`}
                onClick={() => {
                  setHomeTileSize('small')
                  closeContextMenu()
                }}
              >
                <span>Male (domyslnie)</span>
              </button>
              <button
                type="button"
                className={`context-menu-item ${homeTileSize === 'medium' ? 'active' : ''}`}
                onClick={() => {
                  setHomeTileSize('medium')
                  closeContextMenu()
                }}
              >
                <span>Srednie</span>
              </button>
              <button
                type="button"
                className={`context-menu-item ${homeTileSize === 'large' ? 'active' : ''}`}
                onClick={() => {
                  setHomeTileSize('large')
                  closeContextMenu()
                }}
              >
                <span>Duze</span>
              </button>
              <button
                type="button"
                className={`context-menu-item ${homeTileSize === 'xlarge' ? 'active' : ''}`}
                onClick={() => {
                  setHomeTileSize('xlarge')
                  closeContextMenu()
                }}
              >
                <span>Bardzo duze</span>
              </button>
            </div>
          </div>
          <div className="context-menu-submenu">
            <button type="button" className="context-menu-item submenu-trigger">
              <span className="cm-icon cm-sort" />
              <span>Sortowanie daty</span>
              <span className="submenu-arrow">›</span>
            </button>
            <div className="context-submenu-panel">
              <button
                type="button"
                className={`context-menu-item ${menuSortOrder === 'desc' ? 'active' : ''}`}
                onClick={() => {
                  setMenuSortOrder('desc')
                  closeContextMenu()
                }}
              >
                <span>Malejaco (najnowsze)</span>
              </button>
              <button
                type="button"
                className={`context-menu-item ${menuSortOrder === 'asc' ? 'active' : ''}`}
                onClick={() => {
                  setMenuSortOrder('asc')
                  closeContextMenu()
                }}
              >
                <span>Rosnaco (najstarsze)</span>
              </button>
            </div>
          </div>
          <div className="context-sep" />
          {contextMenu.scope === 'panel' && (
            <>
              <button
                type="button"
                className="context-menu-item"
                onClick={() => {
                  collapseAllGroups()
                  closeContextMenu()
                }}
              >
                <span className="cm-icon cm-collapse" />
                <span>Zwin wszystkie daty</span>
              </button>
              <button
                type="button"
                className="context-menu-item"
                onClick={() => {
                  expandAllGroups()
                  closeContextMenu()
                }}
              >
                <span className="cm-icon cm-expand" />
                <span>Rozwin wszystkie daty</span>
              </button>
              <div className="context-sep" />
            </>
          )}
          {contextMenu.scope === 'home' && (
            <>
              <button
                type="button"
                className="context-menu-item"
                disabled={!selectedContextItem}
                onClick={() => {
                  if (!selectedContextItem) return
                  revealHistoryItemOnDisk(selectedContextItem)
                  closeContextMenu()
                }}
              >
                <span className="cm-icon cm-folder" />
                <span>Pokaz na dysku</span>
              </button>
              <div className="context-sep" />
              <button
                type="button"
                className="context-menu-item danger"
                disabled={!selectedContextItem}
                onClick={() => {
                  if (!selectedContextItem) return
                  setDeleteTarget(selectedContextItem)
                  closeContextMenu()
                }}
              >
                <span className="cm-icon cm-delete" />
                <span>Usun z biblioteki</span>
              </button>
              <div className="context-sep" />
            </>
          )}
          {contextMenu.scope === 'panel' && (
            <>
              <button
                type="button"
                className="context-menu-item"
                disabled={!selectedContextItem}
                onClick={() => {
                  if (!selectedContextItem) return
                  revealHistoryItemOnDisk(selectedContextItem)
                  closeContextMenu()
                }}
              >
                <span className="cm-icon cm-folder" />
                <span>Pokaz na dysku</span>
              </button>
              <div className="context-sep" />
            </>
          )}
          {contextMenu.scope === 'home' && (
            <button
              type="button"
              className="context-menu-item danger"
              onClick={() => {
                setIsClearConfirmOpen(true)
                closeContextMenu()
              }}
            >
              <span className="cm-icon cm-clear" />
              <span>Wyczysc biblioteke</span>
            </button>
          )}
        </div>
      )}

      {deleteTarget && (
        <div className="confirm-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="confirm-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Usun z biblioteki</h3>
            <p>Czy na pewno chcesz usunac "{deleteTarget.name}" z biblioteki?</p>
            <div className="confirm-actions">
              <button type="button" className="secondary-btn" onClick={() => setDeleteTarget(null)}>
                Anuluj
              </button>
              <button type="button" className="danger-btn" onClick={() => removeHistoryItem(deleteTarget.id)}>
                Usun
              </button>
            </div>
          </div>
        </div>
      )}

      {isClearConfirmOpen && (
        <div className="confirm-backdrop" onClick={() => setIsClearConfirmOpen(false)}>
          <div className="confirm-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Wyczysc biblioteke</h3>
            <p>Czy na pewno chcesz usunac wszystkie panoramy z biblioteki?</p>
            <div className="confirm-actions">
              <button type="button" className="secondary-btn" onClick={() => setIsClearConfirmOpen(false)}>
                Anuluj
              </button>
              <button type="button" className="danger-btn" onClick={clearLibrary}>
                Usun wszystko
              </button>
            </div>
          </div>
        </div>
      )}

      {isExifOpen && (
        <div className="modal-backdrop" onClick={() => setIsExifOpen(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h2>EXIF / Metadata</h2>
              <button type="button" onClick={() => setIsExifOpen(false)}>
                Zamknij
              </button>
            </div>
            {isExifLoading && <p>Odczytywanie EXIF...</p>}
            {!isExifLoading && exifError && <p>{exifError}</p>}
            {!isExifLoading && !exifError && exifEntries.length === 0 && (
              <p>Brak metadanych EXIF/XMP/IPTC w tym pliku.</p>
            )}
            {!isExifLoading && !exifError && exifEntries.length > 0 && (
              <div className="exif-table-wrap">
                <table className="exif-table">
                  <colgroup>
                    <col className="exif-col-key" />
                    <col className="exif-col-value" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Pole</th>
                      <th>Wartosc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exifEntries.map(([key, value]) => (
                      <tr key={key}>
                        <td>{key}</td>
                        <td>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {isBusy && (
        <div className="loading-overlay" aria-live="polite" aria-busy="true">
          <div className="loading-card">
            <div className="spinner" />
            <p>{busyText}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
