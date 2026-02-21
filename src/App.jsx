import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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

const I18N = {
  en: {
    qualityLabels: {
      auto: 'Auto (GPU max)',
      max: 'Max (GPU)',
      q8192: '8192',
      q4096: '4096',
      q2048: '2048',
    },
    projectionLabels: {
      auto: 'Auto',
      spherical: 'Spherical',
      cylindrical: 'Cylindrical',
    },
    exifTabs: {
      all: 'All',
      basic: 'Basic',
      camera: 'Camera',
      capture: 'Exposure & date',
      gps: 'GPS',
      panorama: 'Panorama',
      other: 'Other',
    },
    strings: {
      initialStatus: 'Drag and drop a 2:1 panorama or click to choose a file.',
      loading: 'Loading...',
      appInstalled: 'App has been installed.',
      initialStatusWithGpu: 'Drag and drop a 2:1 panorama or click to choose a file. GPU limit: {gpu}.',
      toolbarProjection: 'Projection:',
      toolbarLockVertical: 'Lock vertical (cyl.):',
      toolbarQuality: 'Quality:',
      toolbarFlip: 'Flip horizontally:',
      toolbarTelemetry: 'Show telemetry:',
      install: 'Install',
      openImage: 'Choose image',
      showExif: 'Show EXIF',
      showOnDisk: 'Show on disk',
      backupImportExport: 'Backup import/export',
      removeFromLibrary: 'Remove from library',
      removeSelectedFromLibrary: 'Remove selected from library',
      deselectAll: 'Deselect all',
      clearLibrary: 'Clear library',
      hideLocationPanel: 'Hide location panel',
      showLocationPanel: 'Show location panel',
      hideGpsMap: 'Hide GPS mini-map',
      showGpsMap: 'Show GPS mini-map',
      locationResolving: 'Resolving location...',
      unknownProjection: 'Unknown',
      telemetryProjection: 'Proj',
      countPanoramas: 'Panoramas',
      dbSize: 'DB size',
    },
  },
  pl: {
    qualityLabels: {
      auto: 'Auto (GPU max)',
      max: 'Maks (GPU)',
      q8192: '8192',
      q4096: '4096',
      q2048: '2048',
    },
    projectionLabels: {
      auto: 'Auto',
      spherical: 'Sferyczna',
      cylindrical: 'Cylindryczna',
    },
    exifTabs: {
      all: 'Wszystkie',
      basic: 'Podstawowe',
      camera: 'Aparat',
      capture: 'Ekspozycja i data',
      gps: 'GPS',
      panorama: 'Panorama',
      other: 'Pozostale',
    },
    strings: {
      initialStatus: 'Przeciagnij panorame 2:1 lub kliknij, aby wybrac plik.',
      loading: 'Ladowanie...',
      appInstalled: 'Aplikacja zostala zainstalowana.',
      initialStatusWithGpu: 'Przeciagnij panorame 2:1 lub kliknij, aby wybrac plik. Limit GPU: {gpu}.',
      toolbarProjection: 'Projekcja:',
      toolbarLockVertical: 'Blokuj pion (cyl.):',
      toolbarQuality: 'Jakosc:',
      toolbarFlip: 'Odwroc poziomo:',
      toolbarTelemetry: 'Pokaz telemetry:',
      install: 'Zainstaluj',
      openImage: 'Wybierz obraz',
      showExif: 'Pokaz EXIF',
      showOnDisk: 'Pokaz na dysku',
      backupImportExport: 'Backup import/eksport',
      removeFromLibrary: 'Usun z biblioteki',
      removeSelectedFromLibrary: 'Usun zaznaczone z biblioteki',
      deselectAll: 'Odznacz wszystkie',
      clearLibrary: 'Wyczysc biblioteke',
      hideLocationPanel: 'Ukryj panel lokalizacji',
      showLocationPanel: 'Pokaz panel lokalizacji',
      hideGpsMap: 'Ukryj mapke GPS',
      showGpsMap: 'Pokaz mapke GPS',
      locationResolving: 'Ustalanie miejscowosci...',
      unknownProjection: 'Nieznany',
      telemetryProjection: 'Proj',
      countPanoramas: 'Panoramy',
      dbSize: 'Rozmiar bazy',
    },
  },
}

const getI18nValue = (obj, path) => {
  const segments = path.split('.')
  let current = obj
  for (const segment of segments) {
    if (!current || typeof current !== 'object') return undefined
    current = current[segment]
  }
  return current
}

const interpolate = (template, vars = {}) =>
  String(template).replace(/\{(\w+)\}/g, (_, key) => (vars[key] == null ? '' : String(vars[key])))

const SPHERICAL_DEFAULT_FOV = 80
const SPHERICAL_MIN_FOV = 30
const SPHERICAL_MAX_FOV = 100

const CYLINDRICAL_DEFAULT_FOV = 54
const CYLINDRICAL_MIN_FOV = 45
const CYLINDRICAL_MAX_FOV = 140
const EXIF_TAB_ORDER = ['basic', 'camera', 'capture', 'gps', 'panorama', 'other', 'all']

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes < 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIdx = 0
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024
    unitIdx += 1
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unitIdx]}`
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

const normalizeGpsCoordinate = (value, ref) => {
  if (value == null) return null
  let numeric = null

  if (typeof value === 'number') {
    numeric = toFiniteNumber(value)
  } else if (typeof value === 'string') {
    const cleaned = value.replace(',', '.').trim()
    const parsed = Number(cleaned)
    if (Number.isFinite(parsed)) {
      numeric = parsed
    } else {
      const parts = cleaned
        .match(/-?\d+(?:\.\d+)?/g)
        ?.map((part) => Number(part))
        ?.filter((part) => Number.isFinite(part))
      if (parts?.length) {
        const deg = Math.abs(parts[0] || 0)
        const min = Math.abs(parts[1] || 0)
        const sec = Math.abs(parts[2] || 0)
        numeric = deg + min / 60 + sec / 3600
      }
    }
  } else if (Array.isArray(value) && value.length > 0) {
    const parts = value.map((part) => toFiniteNumber(part)).filter((part) => Number.isFinite(part))
    if (parts.length > 0) {
      const deg = Math.abs(parts[0] || 0)
      const min = Math.abs(parts[1] || 0)
      const sec = Math.abs(parts[2] || 0)
      numeric = deg + min / 60 + sec / 3600
    }
  } else if (value && typeof value === 'object') {
    const single = toFiniteNumber(value)
    if (single != null) {
      numeric = single
    } else {
      const deg = toFiniteNumber(value.deg ?? value.degree ?? value.degrees)
      const min = toFiniteNumber(value.min ?? value.minute ?? value.minutes)
      const sec = toFiniteNumber(value.sec ?? value.second ?? value.seconds)
      if (deg != null) {
        numeric = Math.abs(deg) + Math.abs(min || 0) / 60 + Math.abs(sec || 0) / 3600
      }
    }
  }

  if (!Number.isFinite(numeric)) return null
  let hemisphere = String(ref || '').trim().toUpperCase()
  if (!hemisphere && typeof value === 'string') {
    const m = value.trim().toUpperCase().match(/[NSEW]/)
    hemisphere = m ? m[0] : ''
  }
  if (hemisphere === 'S' || hemisphere === 'W') return -Math.abs(numeric)
  if (hemisphere === 'N' || hemisphere === 'E') return Math.abs(numeric)
  return numeric
}

const extractGpsCoords = (metadata) => {
  if (!metadata || typeof metadata !== 'object') return null
  const gps = metadata.gps && typeof metadata.gps === 'object' ? metadata.gps : null
  const latRaw = gps?.latitude ?? metadata.latitude ?? metadata.Latitude ?? metadata.lat ?? metadata.GPSLatitude
  const lonRaw = gps?.longitude ?? metadata.longitude ?? metadata.Longitude ?? metadata.lon ?? metadata.GPSLongitude
  const latRef = gps?.latitudeRef ?? metadata.GPSLatitudeRef ?? metadata.LatitudeRef
  const lonRef = gps?.longitudeRef ?? metadata.GPSLongitudeRef ?? metadata.LongitudeRef
  const lat = normalizeGpsCoordinate(latRaw, latRef)
  const lon = normalizeGpsCoordinate(lonRaw, lonRef)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  if (Math.abs(lat) < 1e-9 && Math.abs(lon) < 1e-9) return null
  return { lat, lon }
}

const hasGpsMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object') return false
  if (metadata.gps && typeof metadata.gps === 'object') return true
  return Object.keys(metadata).some((key) => /gps|latitude|longitude/i.test(key))
}

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

function AnimatedDropdown({ label, value, options, onChange }) {
  const rootRef = useRef(null)
  const buttonRef = useRef(null)
  const [isOpen, setIsOpen] = useState(false)
  const selected = options.find((option) => option.value === value) || options[0]

  useEffect(() => {
    if (!isOpen) return

    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false)
      }
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        buttonRef.current?.focus()
      }
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  const handleSelect = (nextValue) => {
    onChange(nextValue)
    setIsOpen(false)
    buttonRef.current?.focus()
  }

  return (
    <div ref={rootRef} className={`toolbar-dropdown ${isOpen ? 'is-open' : ''}`}>
      <span className="toolbar-dropdown-label">{label}</span>
      <button
        ref={buttonRef}
        type="button"
        className="toolbar-dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="toolbar-dropdown-value">{selected?.label ?? ''}</span>
        <span className={`toolbar-dropdown-caret ${isOpen ? 'is-open' : ''}`}>▾</span>
      </button>
      <div className="toolbar-dropdown-menu" role="listbox" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={value === option.value}
            className={`toolbar-dropdown-option ${value === option.value ? 'active' : ''}`}
            onClick={() => handleSelect(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function App() {
  const containerRef = useRef(null)
  const homeOverlayRef = useRef(null)
  const inputRef = useRef(null)
  const folderInputRef = useRef(null)
  const backupInputRef = useRef(null)
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
  const localityCacheRef = useRef(new Map())
  const dragDepthRef = useRef(0)
  const backupDragDepthRef = useRef(0)
  const homeScrollTopRef = useRef(0)
  const shouldRestoreHomeScrollRef = useRef(false)

  const dragStateRef = useRef({
    isPointerDown: false,
    pointerXOnDown: 0,
    pointerYOnDown: 0,
    lonOnDown: 0,
    latOnDown: 0,
    lon: 0,
    lat: 0,
  })

  const [language, setLanguage] = useState('en')
  const [status, setStatus] = useState('Drag and drop a 2:1 panorama or click to pick a file.')
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
  const [exifTab, setExifTab] = useState('all')
  const [isBusy, setIsBusy] = useState(false)
  const [busyText, setBusyText] = useState('Loading...')
  const [showTelemetry, setShowTelemetry] = useState(true)
  const [showLocationPanel, setShowLocationPanel] = useState(true)
  const [showGpsMapOverlay, setShowGpsMapOverlay] = useState(true)
  const [telemetry, setTelemetry] = useState({ yaw: 0, pitch: 0, fov: SPHERICAL_DEFAULT_FOV })
  const [historyItems, setHistoryItems] = useState([])
  const [hasActivePanorama, setHasActivePanorama] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState({})
  const [hasFolderAccess, setHasFolderAccess] = useState(false)
  const [homeTileSize, setHomeTileSize] = useState('large')
  const [panelTileSize, setPanelTileSize] = useState('small')
  const [homeProjectionFilter, setHomeProjectionFilter] = useState('all')
  const [homeDeviceFilter, setHomeDeviceFilter] = useState('all')
  const [homeSortOrder, setHomeSortOrder] = useState('desc')
  const [panelProjectionFilter, setPanelProjectionFilter] = useState('all')
  const [panelDeviceFilter, setPanelDeviceFilter] = useState('all')
  const [panelSortOrder, setPanelSortOrder] = useState('desc')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [isDeleteSelectedConfirmOpen, setIsDeleteSelectedConfirmOpen] = useState(false)
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false)
  const [clearConfirmChecked, setClearConfirmChecked] = useState(false)
  const [indexedDbBytes, setIndexedDbBytes] = useState(null)
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false)
  const [backupFile, setBackupFile] = useState(null)
  const [isBackupDragging, setIsBackupDragging] = useState(false)
  const [importClearBefore, setImportClearBefore] = useState(false)
  const [importLinkFolderAfter, setImportLinkFolderAfter] = useState(true)
  const [importScanAfterLink, setImportScanAfterLink] = useState(false)
  const [installPromptEvent, setInstallPromptEvent] = useState(null)
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === 'undefined') return false
    const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches
    // @ts-ignore
    const iosStandalone = window.navigator?.standalone === true
    return Boolean(standalone || iosStandalone)
  })
  const [activeHistoryId, setActiveHistoryId] = useState(null)
  const [selectedHomeIds, setSelectedHomeIds] = useState([])
  const [isPanelPinnedOpen, setIsPanelPinnedOpen] = useState(false)
  const [activeCapturedAt, setActiveCapturedAt] = useState(null)
  const [resolvedLocality, setResolvedLocality] = useState('')
  const [isResolvingLocality, setIsResolvingLocality] = useState(false)
  const [contextMenu, setContextMenu] = useState({
    open: false,
    x: 0,
    y: 0,
    itemId: null,
    submenuSide: 'right',
    scope: 'panel',
  })

  const dict = I18N[language] || I18N.en
  const qualityLabels = dict.qualityLabels
  const projectionLabels = dict.projectionLabels
  const exifTabLabels = dict.exifTabs
  const t = (key, vars = {}) => {
    const template = getI18nValue(dict, key) ?? getI18nValue(I18N.en, key) ?? key
    return interpolate(template, vars)
  }
  const projectionOptions = useMemo(
    () => [
      { value: 'auto', label: projectionLabels.auto },
      { value: 'spherical', label: projectionLabels.spherical },
      { value: 'cylindrical', label: projectionLabels.cylindrical },
    ],
    [projectionLabels],
  )
  const qualityOptions = useMemo(
    () => [
      { value: 'auto', label: qualityLabels.auto },
      { value: 'max', label: qualityLabels.max },
      { value: 'q8192', label: qualityLabels.q8192 },
      { value: 'q4096', label: qualityLabels.q4096 },
      { value: 'q2048', label: qualityLabels.q2048 },
    ],
    [qualityLabels],
  )

  useEffect(() => {
    if (!folderInputRef.current) return
    folderInputRef.current.setAttribute('webkitdirectory', '')
    folderInputRef.current.setAttribute('directory', '')
  }, [])

  const reloadHistoryFromDb = async () => {
    const db = dbRef.current
    if (!db) return
    const rows = await dbGetAll(db, PANORAMAS_STORE).catch(() => [])
    const sorted = [...(rows || [])].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    setHistoryItems(sorted)
  }

  useEffect(() => {
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault()
      setInstallPromptEvent(event)
    }
    const onInstalled = () => {
      setIsInstalled(true)
      setInstallPromptEvent(null)
      setStatus(t('strings.appInstalled'))
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
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
    setStatus(t('strings.initialStatusWithGpu', { gpu: maxTextureSizeRef.current }))

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
          if (s.language === 'pl' || s.language === 'en') setLanguage(s.language)
          if (s.qualityMode) setQualityMode(s.qualityMode)
          if (s.projectionMode) setProjectionMode(s.projectionMode)
          if (typeof s.lockVertical === 'boolean') setLockVertical(s.lockVertical)
          if (typeof s.flipHorizontal === 'boolean') setFlipHorizontal(s.flipHorizontal)
          if (typeof s.showTelemetry === 'boolean') setShowTelemetry(s.showTelemetry)
          if (typeof s.showLocationPanel === 'boolean') setShowLocationPanel(s.showLocationPanel)
          if (typeof s.showGpsMapOverlay === 'boolean') setShowGpsMapOverlay(s.showGpsMapOverlay)
          if (s.homeTileSize) setHomeTileSize(s.homeTileSize)
          if (s.panelTileSize === 'small' || s.panelTileSize === 'large') setPanelTileSize(s.panelTileSize)
          if (s.homeSortOrder) setHomeSortOrder(s.homeSortOrder)
          if (s.panelSortOrder) setPanelSortOrder(s.panelSortOrder)
          if (s.collapsedGroups && typeof s.collapsedGroups === 'object') {
            const nextCollapsed = {}
            for (const [key, value] of Object.entries(s.collapsedGroups)) {
              if (value === true) nextCollapsed[key] = true
            }
            setCollapsedGroups(nextCollapsed)
          }
        }

        const cleanedPanoramas = []
        for (const item of savedPanoramas || []) {
          const normalizedPath = normalizeRelativePath(item?.relativePath || '')
          const needsPathFix = (item?.relativePath || '') !== normalizedPath
          if (item?.fileBlob) {
            const { fileBlob, ...rest } = item
            const trimmed = { ...rest, relativePath: normalizedPath }
            cleanedPanoramas.push(trimmed)
            await dbPut(db, PANORAMAS_STORE, trimmed)
          } else if (needsPathFix) {
            const fixed = { ...item, relativePath: normalizedPath }
            cleanedPanoramas.push(fixed)
            await dbPut(db, PANORAMAS_STORE, fixed)
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
      language,
      qualityMode,
      projectionMode,
      lockVertical,
      flipHorizontal,
      showTelemetry,
      showLocationPanel,
      showGpsMapOverlay,
      homeTileSize,
      panelTileSize,
      homeSortOrder,
      panelSortOrder,
      collapsedGroups,
    }
    dbPut(db, SETTINGS_STORE, { key: 'app', value }).catch(() => {})
  }, [
    language,
    qualityMode,
    projectionMode,
    lockVertical,
    flipHorizontal,
    showTelemetry,
    showLocationPanel,
    showGpsMapOverlay,
    homeTileSize,
    panelTileSize,
    homeSortOrder,
    panelSortOrder,
    collapsedGroups,
  ])

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
  const isFileDragEvent = (event) => {
    const types = event?.dataTransfer?.types
    if (!types) return false
    return Array.from(types).includes('Files')
  }

  const canUseFsApi = typeof window !== 'undefined' && 'showDirectoryPicker' in window
  const canUseOpenFilePicker = typeof window !== 'undefined' && 'showOpenFilePicker' in window

  const normalizeRelativePath = (value) => {
    if (!value) return ''
    const raw = String(value).trim()
    if (!raw) return ''
    return raw
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .replace(/^\/+/, '')
      .replace(/\/+/g, '/')
  }

  const splitRelativePath = (value) => normalizeRelativePath(value).split('/').filter(Boolean)

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
    const parts = splitRelativePath(relativePath)
    if (parts.length === 0) return null
    const candidates = [parts]
    if (parts.length > 1) candidates.push(parts.slice(1))

    for (const candidateParts of candidates) {
      try {
        let dir = rootHandle
        for (let i = 0; i < candidateParts.length - 1; i += 1) {
          dir = await dir.getDirectoryHandle(candidateParts[i], { create: false })
        }
        const fileHandle = await dir.getFileHandle(candidateParts[candidateParts.length - 1], { create: false })
        return fileHandle.getFile()
      } catch {
        // try next candidate
      }
    }
    return null
  }

  const getDirectoryFromRelativePath = async (rootHandle, relativePath) => {
    if (!rootHandle || !relativePath) return null
    const parts = splitRelativePath(relativePath)
    if (parts.length <= 1) return rootHandle
    const candidates = [parts]
    if (parts.length > 1) candidates.push(parts.slice(1))

    for (const candidateParts of candidates) {
      try {
        let dir = rootHandle
        for (let i = 0; i < candidateParts.length - 1; i += 1) {
          dir = await dir.getDirectoryHandle(candidateParts[i], { create: false })
        }
        return dir
      } catch {
        // try next candidate
      }
    }
    return rootHandle
  }

  const findFileByNameInTree = async (rootHandle, targetName) => {
    if (!rootHandle || !targetName) return null
    const queue = [{ dir: rootHandle, pathPrefix: '' }]
    let visited = 0
    const visitLimit = 50000

    while (queue.length > 0 && visited < visitLimit) {
      const { dir, pathPrefix } = queue.shift()
      // eslint-disable-next-line no-restricted-syntax
      for await (const [name, handle] of dir.entries()) {
        visited += 1
        if (visited >= visitLimit) break
        if (handle.kind === 'directory') {
          queue.push({ dir: handle, pathPrefix: `${pathPrefix}${name}/` })
        } else if (handle.kind === 'file' && name === targetName) {
          return { file: await handle.getFile(), relativePath: `${pathPrefix}${name}` }
        }
      }
    }
    return null
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
    const modeLabel = qualityLabels[qualityMode] || qualityMode
    const reqLabel = Number.isFinite(requestedMax) ? requestedMax : maxTextureSizeRef.current
    const projectionLabel = projectionLabels[projection || activeProjection]
    setStatus(
      wasScaled
        ? `Loaded: ${name} (${width}x${height}), rendered: ${drawWidth}x${drawHeight}. Projection: ${projectionLabel}. Quality mode: ${modeLabel}, mode limit: ${reqLabel}, GPU limit: ${maxTextureSizeRef.current}.`
        : `Loaded: ${name} (${width}x${height}) at full resolution. Projection: ${projectionLabel}. Quality mode: ${modeLabel}, GPU limit: ${maxTextureSizeRef.current}.`,
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
      relativePath: normalizeRelativePath(relativePath),
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
    const { persistHistory = true, forcedProjection = null, loadingText = 'Loading panorama...' } = options

    if (!file || !file.type.startsWith('image/')) {
      setStatus('This is not an image file.')
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
        setExifError('Could not read EXIF.')
      } finally {
        setIsExifLoading(false)
      }

      const resolvedProjection = forcedProjection || getResolvedProjection(width, height, parsed)
      setActiveCapturedAt(extractCreatedAt(file, parsed))

      if (!isPanoramaCandidateWithMetadata(width, height, parsed)) {
        URL.revokeObjectURL(tmpUrl)
        setStatus(`This does not look like a panorama: ${width}x${height} (min ratio ~${MIN_PANORAMA_RATIO}:1 or GPano metadata).`)
        setIsBusy(false)
        return
      }

      if (resolvedProjection === 'spherical' && Math.abs(ratio - 2) > 0.15) {
        URL.revokeObjectURL(tmpUrl)
        setStatus(`Spherical mode requires near 2:1 ratio. Received ${width}x${height}.`)
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
          setStatus((prev) => `${prev} (Already in history)`)
        }
      }

    } catch {
      setIsExifLoading(false)
      setStatus('Could not load image.')
    } finally {
      setIsBusy(false)
    }
  }

  const handleFile = async (file) => {
    await processPanoramaFile(file, { persistHistory: true, loadingText: 'Loading panorama...' })
  }

  const relinkHistoryItemFromPicker = async (item, rootHandle) => {
    if (!canUseOpenFilePicker) return false
    try {
      // @ts-ignore
      const [pickedHandle] = await window.showOpenFilePicker({
        multiple: false,
        startIn: rootHandle,
        types: [
          {
            description: 'Obrazy',
            accept: {
              'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'],
            },
          },
        ],
      })
      const file = await pickedHandle.getFile()
      await processPanoramaFile(file, {
        persistHistory: false,
        forcedProjection: item.projection,
        loadingText: 'Loading panorama...',
      })

      let nextRelativePath = normalizeRelativePath(item.relativePath)
      try {
        const parts = await rootHandle.resolve(pickedHandle)
        if (Array.isArray(parts) && parts.length > 0) {
          nextRelativePath = normalizeRelativePath(parts.join('/'))
        }
      } catch {
        // ignore resolve errors
      }

      const nextItem = {
        ...item,
        name: file.name || item.name,
        relativePath: normalizeRelativePath(nextRelativePath),
      }
      const db = dbRef.current
      if (db) {
        await dbPut(db, PANORAMAS_STORE, nextItem).catch(() => {})
      }
      setHistoryItems((prev) => prev.map((entry) => (entry.id === item.id ? nextItem : entry)))
      setStatus(`Podlinkowano ponownie plik: ${nextItem.name}`)
      return true
    } catch {
      return false
    }
  }

  const openHistoryItem = async (item) => {
    if (!item) return
    const root = rootDirHandleRef.current
    if (!root) {
      setStatus('No folder connected. Click "Select folder".')
      return
    }

    const granted = await ensureReadPermission(root)
    setHasFolderAccess(granted)
    if (!granted) {
      setStatus('No folder permission. Use "Refresh access".')
      return
    }

    const persistResolvedPath = async (resolvedPath, nameOverride = null) => {
      const normalized = normalizeRelativePath(resolvedPath)
      if (!normalized) return
      const nextItem = {
        ...item,
        relativePath: normalized,
        name: nameOverride || item.name,
      }
      const db = dbRef.current
      if (db) {
        await dbPut(db, PANORAMAS_STORE, nextItem).catch(() => {})
      }
      setHistoryItems((prev) => prev.map((entry) => (entry.id === item.id ? nextItem : entry)))
    }

    if (!item?.relativePath) {
      const relinked = await relinkHistoryItemFromPicker(item, root)
      if (!relinked) {
        setStatus('No file path in history. Pick panorama file manually.')
      }
      return
    }

    try {
      const file = await getFileFromRelativePath(root, item.relativePath)
      if (!file) {
        setBusyText('Searching subfolders...')
        setIsBusy(true)
        const found = await findFileByNameInTree(root, item.name)
        setIsBusy(false)
        if (found?.file) {
          await persistResolvedPath(found.relativePath, found.file.name)
          await processPanoramaFile(found.file, {
            persistHistory: false,
            forcedProjection: item.projection,
            loadingText: 'Loading panorama...',
          })
          return
        }
        const relinked = await relinkHistoryItemFromPicker(item, root)
        if (!relinked) {
          setStatus('File not found on disk. Choose the correct panorama folder.')
        }
        return
      }
      await processPanoramaFile(file, {
        persistHistory: false,
        forcedProjection: item.projection,
        loadingText: 'Loading panorama...',
      })
    } catch {
      setIsBusy(false)
      const relinked = await relinkHistoryItemFromPicker(item, root)
      if (!relinked) {
        setStatus('File not found on disk. Choose the correct panorama folder.')
      }
    }
  }

  const removeHistoryItems = async (itemIds) => {
    const uniqueIds = Array.from(new Set((itemIds || []).filter(Boolean)))
    if (uniqueIds.length === 0) return

    const removeSet = new Set(uniqueIds)
    const isRemovingActive = hasActivePanorama && activeHistoryId && removeSet.has(activeHistoryId)
    let fallbackNextItem = null

    if (isRemovingActive) {
      const activeIndex = filteredHomeItems.findIndex((item) => item.id === activeHistoryId)
      if (activeIndex >= 0) {
        for (let i = activeIndex + 1; i < filteredHomeItems.length; i += 1) {
          const candidate = filteredHomeItems[i]
          if (!removeSet.has(candidate.id)) {
            fallbackNextItem = candidate
            break
          }
        }
        if (!fallbackNextItem) {
          for (let i = activeIndex - 1; i >= 0; i -= 1) {
            const candidate = filteredHomeItems[i]
            if (!removeSet.has(candidate.id)) {
              fallbackNextItem = candidate
              break
            }
          }
        }
      }
    }

    const db = dbRef.current
    if (db) {
      await Promise.all(uniqueIds.map((id) => dbDelete(db, PANORAMAS_STORE, id).catch(() => {})))
    }

    setHistoryItems((prev) => prev.filter((item) => !removeSet.has(item.id)))
    setSelectedHomeIds((prev) => prev.filter((id) => !removeSet.has(id)))
    setDeleteTarget(null)
    setIsDeleteSelectedConfirmOpen(false)

    if (isRemovingActive) {
      if (fallbackNextItem) {
        await openPanoramaFromLibrary(fallbackNextItem)
      } else {
        setActiveHistoryId(null)
        closePanoramaToHome()
      }
    }
  }

  const removeHistoryItem = async (itemId) => {
    await removeHistoryItems([itemId])
  }

  const clearLibrary = async () => {
    const db = dbRef.current
    if (db) {
      await dbClear(db, PANORAMAS_STORE).catch(() => {})
    }
    setHistoryItems([])
    setSelectedHomeIds([])
    setCollapsedGroups({})
    setDeleteTarget(null)
    setIsDeleteSelectedConfirmOpen(false)
    setClearConfirmChecked(false)
    setIsClearConfirmOpen(false)
    setStatus('Library has been cleared.')
  }

  const openClearConfirmModal = () => {
    setClearConfirmChecked(false)
    setIsClearConfirmOpen(true)
  }

  const closeClearConfirmModal = () => {
    setClearConfirmChecked(false)
    setIsClearConfirmOpen(false)
  }

  const exifEntries = exifData ? Object.entries(exifData) : []
  const groupedExifEntries = useMemo(() => {
    const groups = {
      all: [...exifEntries],
      basic: [],
      camera: [],
      capture: [],
      gps: [],
      panorama: [],
      other: [],
    }

    const matches = (key, needles) => {
      const lower = key.toLowerCase()
      return needles.some((needle) => lower.includes(needle))
    }

    for (const entry of exifEntries) {
      const [key] = entry
      if (
        matches(key, [
          'gpano',
          'projection',
          'equirect',
          'cylindr',
          'fullpano',
          'croppedarea',
          'panorama',
          'usepanoramaviewer',
        ])
      ) {
        groups.panorama.push(entry)
        continue
      }
      if (matches(key, ['gps', 'latitude', 'longitude', 'altitude', 'speed', 'direction', 'position'])) {
        groups.gps.push(entry)
        continue
      }
      if (
        matches(key, [
          'datetime',
          'created',
          'modify',
          'digitalcreation',
          'timecreated',
          'exposure',
          'shutter',
          'aperture',
          'fnumber',
          'iso',
          'sensitivity',
          'brightness',
          'metering',
          'flash',
          'whitebalance',
        ])
      ) {
        groups.capture.push(entry)
        continue
      }
      if (
        matches(key, [
          'make',
          'model',
          'camera',
          'lens',
          'focal',
          'software',
          'serial',
          'firmware',
          'body',
          'manufacturer',
        ])
      ) {
        groups.camera.push(entry)
        continue
      }
      if (matches(key, ['image', 'width', 'height', 'orientation', 'resolution', 'color', 'profile', 'bits'])) {
        groups.basic.push(entry)
        continue
      }
      groups.other.push(entry)
    }
    return groups
  }, [exifEntries])
  const shownExifEntries = groupedExifEntries[exifTab] || groupedExifEntries.all
  const visibleExifTabs = EXIF_TAB_ORDER.filter((tabId) => tabId === 'all' || (groupedExifEntries[tabId] || []).length > 0)
  const gpsCoords = useMemo(() => extractGpsCoords(exifData), [exifData])
  const hasAnyGpsData = useMemo(() => hasGpsMetadata(exifData), [exifData])
  const mapSrc = useMemo(() => {
    if (!gpsCoords) return ''
    const deltaLat = 0.003
    const deltaLon = 0.006
    const left = gpsCoords.lon - deltaLon
    const right = gpsCoords.lon + deltaLon
    const top = gpsCoords.lat + deltaLat
    const bottom = gpsCoords.lat - deltaLat
    const bbox = `${left},${bottom},${right},${top}`
    return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${gpsCoords.lat}%2C${gpsCoords.lon}`
  }, [gpsCoords])
  const panoramaDateLabel = useMemo(() => {
    if (!activeCapturedAt) return ''
    const formatted = formatShortDateTime(activeCapturedAt)
    return formatted === '-' ? '' : formatted
  }, [activeCapturedAt])
  const panoramaCaptionLines = useMemo(() => {
    if (!hasActivePanorama) return []
    if (!gpsCoords) return panoramaDateLabel ? [panoramaDateLabel] : []
    const locationLine = resolvedLocality || (isResolvingLocality ? t('strings.locationResolving') : '')
    if (locationLine && panoramaDateLabel) return [locationLine, panoramaDateLabel]
    if (locationLine) return [locationLine]
    if (panoramaDateLabel) return [panoramaDateLabel]
    return []
  }, [hasActivePanorama, gpsCoords, resolvedLocality, isResolvingLocality, panoramaDateLabel])

  useEffect(() => {
    if (!hasActivePanorama || !gpsCoords) {
      setResolvedLocality('')
      setIsResolvingLocality(false)
      return
    }

    const lat = Number(gpsCoords.lat)
    const lon = Number(gpsCoords.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setResolvedLocality('')
      setIsResolvingLocality(false)
      return
    }

    const key = `${lat.toFixed(4)},${lon.toFixed(4)}`
    const cached = localityCacheRef.current.get(key)
    if (typeof cached === 'string') {
      setResolvedLocality(cached)
      setIsResolvingLocality(false)
      return
    }

    let cancelled = false
    const controller = new AbortController()
    setIsResolvingLocality(true)

    const resolveLocality = async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=12&addressdetails=1`,
          {
            headers: {
              'Accept-Language': 'pl,en',
            },
            signal: controller.signal,
          },
        )
        if (!response.ok) throw new Error('reverse geocoding failed')
        const payload = await response.json()
        const address = payload?.address || {}
        const locality =
          address.city ||
          address.town ||
          address.village ||
          address.municipality ||
          address.suburb ||
          address.county ||
          address.state ||
          ''
        localityCacheRef.current.set(key, locality)
        if (!cancelled) setResolvedLocality(locality)
      } catch {
        localityCacheRef.current.set(key, '')
        if (!cancelled) setResolvedLocality('')
      } finally {
        if (!cancelled) setIsResolvingLocality(false)
      }
    }

    resolveLocality()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [hasActivePanorama, gpsCoords])

  useEffect(() => {
    if (!visibleExifTabs.includes(exifTab)) {
      setExifTab('all')
    }
  }, [exifTab, visibleExifTabs])
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
  const activeHomeIndex = useMemo(
    () => filteredHomeItems.findIndex((item) => item.id === activeHistoryId),
    [filteredHomeItems, activeHistoryId],
  )
  const previousHomeItem = activeHomeIndex > 0 ? filteredHomeItems[activeHomeIndex - 1] : null
  const nextHomeItem =
    activeHomeIndex >= 0 && activeHomeIndex < filteredHomeItems.length - 1 ? filteredHomeItems[activeHomeIndex + 1] : null
  const selectedHomeIdSet = useMemo(() => new Set(selectedHomeIds), [selectedHomeIds])
  const hasHomeSelection = selectedHomeIds.length > 0

  const estimatedDbBytes = useMemo(() => {
    try {
      return new Blob([JSON.stringify(historyItems)]).size
    } catch {
      return 0
    }
  }, [historyItems])

  useEffect(() => {
    let cancelled = false
    const estimateStorage = async () => {
      if (!navigator?.storage?.estimate) return
      try {
        const estimate = await navigator.storage.estimate()
        const usageDetails = estimate?.usageDetails || {}
        const rawIndexedDb = usageDetails.indexedDB
        const next = Number.isFinite(rawIndexedDb) ? rawIndexedDb : null
        if (!cancelled) setIndexedDbBytes(next)
      } catch {
        if (!cancelled) setIndexedDbBytes(null)
      }
    }
    estimateStorage()
    return () => {
      cancelled = true
    }
  }, [historyItems])

  const displayedDbBytes = indexedDbBytes ?? estimatedDbBytes

  const buildBackupPayload = () => ({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    app: 'Panorama 360 Viewer',
    panoramas: historyItems,
  })

  const exportBackup = () => {
    const payload = buildBackupPayload()
    const json = JSON.stringify(payload, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    a.href = url
    a.download = `panorama360-backup-${stamp}.json`
    a.click()
    URL.revokeObjectURL(url)
    setStatus(`Backup exported (${historyItems.length} panoramas).`)
  }

  const parseBackupFile = async (file) => {
    if (!file) return null
    const text = await file.text()
    const raw = JSON.parse(text)
    const items = Array.isArray(raw?.panoramas) ? raw.panoramas : Array.isArray(raw?.items) ? raw.items : null
    if (!items) throw new Error('Nieprawidlowy format backupu.')
    return items
  }

  const normalizeImportedItem = (item) => {
    if (!item || typeof item !== 'object') return null
    const width = Number(item.width) || 0
    const height = Number(item.height) || 0
    if (!item.fingerprint || !item.name || !width || !height) return null
    const createdAt = Number(item.createdAt) || Date.now()
    const projection = item.projection === 'cylindrical' ? 'cylindrical' : 'spherical'
    return {
      id: item.id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
      name: String(item.name),
      width,
      height,
      projection,
      fingerprint: String(item.fingerprint),
      createdAt,
      dateKey: item.dateKey || getDateGroupingKey(createdAt),
      device: item.device ? String(item.device) : 'Nieznane urzadzenie',
      relativePath: normalizeRelativePath(item.relativePath ? String(item.relativePath) : ''),
      thumbDataUrl: item.thumbDataUrl ? String(item.thumbDataUrl) : '',
    }
  }

  function formatShortDateTime(timestamp) {
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

  const closeContextMenuAfterMenuAction = () => {
    if (contextMenu.scope === 'panel') {
      setIsPanelPinnedOpen(true)
    }
    closeContextMenu()
  }

  const rememberHomeScrollPosition = () => {
    if (homeOverlayRef.current) {
      homeScrollTopRef.current = homeOverlayRef.current.scrollTop || 0
    }
  }

  const closePanoramaToHome = () => {
    if (!hasActivePanorama) return
    shouldRestoreHomeScrollRef.current = true
    setHasActivePanorama(false)
    setResolvedLocality('')
    setIsResolvingLocality(false)
  }

  const openPanoramaFromLibrary = async (item) => {
    if (!item) return
    if (!hasActivePanorama) rememberHomeScrollPosition()
    setActiveHistoryId(item.id || null)
    setActiveCapturedAt(Number(item.createdAt) || null)
    await openHistoryItem(item)
  }

  useEffect(() => {
    if (hasActivePanorama || !shouldRestoreHomeScrollRef.current) return
    const restore = () => {
      if (homeOverlayRef.current) {
        homeOverlayRef.current.scrollTop = homeScrollTopRef.current
      }
      shouldRestoreHomeScrollRef.current = false
    }
    requestAnimationFrame(restore)
  }, [hasActivePanorama])

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
    if (!isBackupModalOpen) {
      backupDragDepthRef.current = 0
      setIsBackupDragging(false)
      return
    }

    const onDragEnter = (event) => {
      if (!isFileDragEvent(event)) return
      event.preventDefault()
      backupDragDepthRef.current += 1
      setIsBackupDragging(true)
    }

    const onDragOver = (event) => {
      if (!isFileDragEvent(event)) return
      event.preventDefault()
      setIsBackupDragging(true)
    }

    const onDragLeave = (event) => {
      if (!isFileDragEvent(event)) return
      event.preventDefault()
      backupDragDepthRef.current = Math.max(0, backupDragDepthRef.current - 1)
      if (backupDragDepthRef.current === 0) {
        setIsBackupDragging(false)
      }
    }

    const onDrop = (event) => {
      if (!isFileDragEvent(event)) return
      event.preventDefault()
      backupDragDepthRef.current = 0
      setIsBackupDragging(false)
      const file = event.dataTransfer?.files?.[0]
      if (file) setBackupFile(file)
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)

    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [isBackupModalOpen])

  useLayoutEffect(() => {
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
      setBusyText('Applying settings...')
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
    dragDepthRef.current = 0
    setIsDragging(false)
    if (!isFileDragEvent(event)) return
    const [file] = event.dataTransfer.files
    if (isBackupModalOpen) {
      backupDragDepthRef.current = 0
      setIsBackupDragging(false)
      if (file) setBackupFile(file)
      return
    }
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
      setBusyText('Scanning panorama folder...')
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
        `Folder scan complete. Added ${added}, duplicates: ${duplicates}, skipped >100MB: ${tooLarge}, total files: ${files.length}.`,
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

  const pickFolderWithFsApi = async (options = {}) => {
    const { scanAfterPick = true } = options
    if (!canUseFsApi) {
      if (scanAfterPick) {
        folderInputRef.current?.click()
      } else {
        setStatus('Browser does not support connecting folder without scanning.')
      }
      return
    }

    try {
      // @ts-ignore
      const dirHandle = await window.showDirectoryPicker()
      const granted = await ensureReadPermission(dirHandle)
      setHasFolderAccess(granted)
      if (!granted) {
        setStatus('Folder access was not granted.')
        return
      }

      rootDirHandleRef.current = dirHandle
      if (dbRef.current) {
        await dbPut(dbRef.current, SETTINGS_STORE, { key: ROOT_HANDLE_KEY, value: dirHandle })
      }

      if (!scanAfterPick) {
        setStatus('Folder connected. Library was loaded from backup without scanning.')
        return
      }

      setBusyText('Scanning panorama folder...')
      setIsBusy(true)
      await new Promise((resolve) => requestAnimationFrame(resolve))
      const { added, duplicates, tooLarge, checked } = await scanDirectoryHandle(dirHandle)
      setStatus(
        `Folder scan complete. Added ${added}, duplicates: ${duplicates}, skipped >100MB: ${tooLarge}, checked files: ${checked}.`,
      )
    } catch {
      setStatus('Folder selection was canceled or not supported by browser.')
    } finally {
      setIsBusy(false)
    }
  }

  const refreshFolderAccess = async () => {
    const root = rootDirHandleRef.current
    if (!root) {
      await pickFolderWithFsApi({ scanAfterPick: false })
      return
    }
    const granted = await ensureReadPermission(root)
    setHasFolderAccess(granted)
    setStatus(granted ? 'Folder access refreshed.' : 'Could not refresh folder access.')
  }

  const importBackup = async () => {
    if (!backupFile) {
      setStatus('Choose a .json backup file.')
      return
    }
    const db = dbRef.current
    if (!db) {
      setStatus('Database is not ready.')
      return
    }

    try {
      setBusyText('Importing backup...')
      setIsBusy(true)
      await new Promise((resolve) => requestAnimationFrame(resolve))

      const importedRaw = await parseBackupFile(backupFile)
      const normalized = importedRaw.map(normalizeImportedItem).filter(Boolean)

      if (importClearBefore) {
        await dbClear(db, PANORAMAS_STORE)
      }

      const existing = importClearBefore ? [] : await dbGetAll(db, PANORAMAS_STORE).catch(() => [])
      const knownFingerprints = new Set(existing.map((item) => item?.fingerprint).filter(Boolean))

      let added = 0
      let skipped = 0
      for (const item of normalized) {
        if (knownFingerprints.has(item.fingerprint)) {
          skipped += 1
          continue
        }
        knownFingerprints.add(item.fingerprint)
        await dbPut(db, PANORAMAS_STORE, item)
        added += 1
      }

      await reloadHistoryFromDb()
      setIsBackupModalOpen(false)
      setBackupFile(null)
      setStatus(`Backup import finished. Added: ${added}, skipped duplicates: ${skipped}.`)

      if (importLinkFolderAfter) {
        await pickFolderWithFsApi({ scanAfterPick: importScanAfterLink })
      }
    } catch {
      setStatus('Could not import backup. Check JSON file format.')
    } finally {
      setIsBusy(false)
    }
  }

  const installApp = async () => {
    if (!installPromptEvent) return
    try {
      await installPromptEvent.prompt()
      await installPromptEvent.userChoice
      setInstallPromptEvent(null)
    } catch {
      setStatus('Could not show install prompt.')
    }
  }

  const revealHistoryItemOnDisk = async (item) => {
    if (!item?.relativePath) {
      setStatus('No file path in history. Re-import this folder.')
      return
    }

    if (!canUseFsApi && !canUseOpenFilePicker) {
      setStatus('This browser does not support files/folders API. Use Chrome/Edge.')
      return
    }

    const root = rootDirHandleRef.current
    if (!root) {
      setStatus('No folder connected. Click "Select folder".')
      return
    }

    const granted = await ensureReadPermission(root)
    setHasFolderAccess(granted)
    if (!granted) {
      setStatus('No folder permission. Use "Refresh access".')
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
      setStatus(`Opened disk location for: ${item.name}`)
    } catch {
      setStatus('Could not open folder. Check browser permissions.')
    }
  }

  const selectedContextItem = contextMenu.itemId
    ? historyItems.find((item) => item.id === contextMenu.itemId) || null
    : null
  const activeContextItem = useMemo(() => {
    if (selectedContextItem) return selectedContextItem
    if (!hasActivePanorama || !activeHistoryId) return null
    return historyItems.find((item) => item.id === activeHistoryId) || null
  }, [selectedContextItem, hasActivePanorama, activeHistoryId, historyItems])
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
  const openBackupModal = () => {
    setIsBackupModalOpen(true)
    setBackupFile(null)
    backupDragDepthRef.current = 0
    setIsBackupDragging(false)
  }
  const onBackupFileInput = (event) => {
    const file = event.target.files?.[0]
    if (file) {
      setBackupFile(file)
    }
    event.target.value = ''
  }
  const onBackupDrop = (event) => {
    event.preventDefault()
    backupDragDepthRef.current = 0
    setIsBackupDragging(false)
    const file = event.dataTransfer?.files?.[0]
    if (file) {
      setBackupFile(file)
    }
  }
  const toggleHomeSelection = (itemId, checked) => {
    if (!itemId) return
    setSelectedHomeIds((prev) => {
      if (checked) {
        if (prev.includes(itemId)) return prev
        return [...prev, itemId]
      }
      return prev.filter((id) => id !== itemId)
    })
  }
  const clearHomeSelection = () => {
    setSelectedHomeIds([])
  }

  useEffect(() => {
    setSelectedHomeIds((prev) => {
      if (prev.length === 0) return prev
      const existing = new Set(historyItems.map((item) => item.id))
      const next = prev.filter((id) => existing.has(id))
      return next.length === prev.length ? prev : next
    })
  }, [historyItems])
  const canInstallApp = Boolean(installPromptEvent) && !isInstalled

  return (
    <div
      className={`app ${isDragging ? 'dragging' : ''}`}
      onContextMenu={(event) => openContextMenu(event, null, 'home')}
      onDragEnter={(event) => {
        if (!isFileDragEvent(event)) return
        preventDefaults(event)
        if (isBackupModalOpen) return
        dragDepthRef.current += 1
        setIsDragging(true)
      }}
      onDragOver={(event) => {
        if (!isFileDragEvent(event)) return
        preventDefaults(event)
        if (isBackupModalOpen) return
      }}
      onDragLeave={(event) => {
        if (!isFileDragEvent(event)) return
        preventDefaults(event)
        if (isBackupModalOpen) return
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
        if (dragDepthRef.current === 0) {
          setIsDragging(false)
        }
      }}
      onDrop={onDrop}
    >
      <div className="toolbar">
        <button type="button" className="brand-button" onClick={closePanoramaToHome}>
          Panorama 360 Viewer
        </button>
        {canInstallApp && (
          <button type="button" className="install-btn" onClick={installApp}>
            {t('strings.install')}
          </button>
        )}
        <AnimatedDropdown
          label={t('strings.toolbarProjection')}
          value={projectionMode}
          options={projectionOptions}
          onChange={setProjectionMode}
        />
        <label>
          {t('strings.toolbarLockVertical')}
          <input
            type="checkbox"
            checked={lockVertical}
            onChange={(event) => setLockVertical(event.target.checked)}
          />
        </label>
        <AnimatedDropdown
          label={t('strings.toolbarQuality')}
          value={qualityMode}
          options={qualityOptions}
          onChange={setQualityMode}
        />
        <label>
          {t('strings.toolbarFlip')}
          <input
            type="checkbox"
            checked={flipHorizontal}
            onChange={(event) => setFlipHorizontal(event.target.checked)}
          />
        </label>
        <label>
          {t('strings.toolbarTelemetry')}
          <input
            type="checkbox"
            checked={showTelemetry}
            onChange={(event) => setShowTelemetry(event.target.checked)}
          />
        </label>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden-input"
          onChange={onInputChange}
        />
        <input
          ref={backupInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden-input"
          onChange={onBackupFileInput}
        />
      </div>
      <p className="status">
        <span className="status-main">{status}</span>
        <span className="status-side" aria-label="Library stats">
          {t('strings.countPanoramas')}: <strong>{historyItems.length}</strong> | {t('strings.dbSize')}:{' '}
          <strong>{formatBytes(displayedDbBytes)}</strong>
        </span>
      </p>
      <div className="viewer-wrap">
        <div ref={containerRef} className="viewer" />
        {showLocationPanel && showGpsMapOverlay && hasActivePanorama && gpsCoords && (
          <div className="map-overlay" aria-label="Panorama GPS location">
            <div className="map-overlay-head">
              <span>GPS</span>
              <a
                href={`https://www.openstreetmap.org/?mlat=${gpsCoords.lat}&mlon=${gpsCoords.lon}#map=16/${gpsCoords.lat}/${gpsCoords.lon}`}
                target="_blank"
                rel="noreferrer"
              >
                Open
              </a>
            </div>
            <iframe title="Location map" src={mapSrc} loading="lazy" />
            <p>
              {gpsCoords.lat.toFixed(6)}, {gpsCoords.lon.toFixed(6)}
            </p>
          </div>
        )}
        {showLocationPanel && showGpsMapOverlay && hasActivePanorama && !gpsCoords && (
          <div className="map-overlay map-overlay-empty" aria-live="polite">
            {hasAnyGpsData ? 'No valid GPS coordinates in EXIF.' : 'No GPS data in EXIF.'}
          </div>
        )}
        {showLocationPanel && hasActivePanorama && panoramaCaptionLines.length > 0 && (
          <div className="panorama-caption" aria-live="polite">
            {panoramaCaptionLines.map((line, index) => (
              <div key={`${line}-${index}`}>{line}</div>
            ))}
          </div>
        )}
        {hasActivePanorama && (
          <>
            <button
              type="button"
              className="viewer-close-btn"
              aria-label="Close panorama"
              onClick={closePanoramaToHome}
            >
              ×
            </button>
            {previousHomeItem && (
              <button
                type="button"
                className="viewer-nav viewer-nav-left"
                aria-label="Previous panorama"
                title="Previous panorama"
                onClick={() => openPanoramaFromLibrary(previousHomeItem)}
              >
                <span>‹</span>
              </button>
            )}
            {nextHomeItem && (
              <button
                type="button"
                className="viewer-nav viewer-nav-right"
                aria-label="Next panorama"
                title="Next panorama"
                onClick={() => openPanoramaFromLibrary(nextHomeItem)}
              >
                <span>›</span>
              </button>
            )}
          </>
        )}
        {!hasActivePanorama && (
          <div
            ref={homeOverlayRef}
            className="home-grid-overlay"
            onContextMenu={(event) => openContextMenu(event, null, 'home')}
          >
            {filteredHomeItems.length === 0 ? (
              <div className="home-empty">
                <h2>No panoramas for active filter</h2>
                <p>Change filters in the context menu or add panoramas to the library.</p>
              </div>
            ) : (
              <div className={`home-grid home-grid-${homeTileSize}`}>
                {filteredHomeItems.map((item) => (
                  <button
                    key={`home-${item.id}`}
                    type="button"
                    className={`home-tile home-tile-${homeTileSize} ${hasHomeSelection ? 'has-selection-mode' : ''} ${
                      selectedHomeIdSet.has(item.id) ? 'is-selected' : ''
                    }`}
                    onClick={() => openPanoramaFromLibrary(item)}
                    onContextMenu={(event) => openContextMenu(event, item.id, 'home')}
                    onDragStart={(event) => event.preventDefault()}
                    title={`${item.name} (${item.width}x${item.height})`}
                  >
                    <label
                      className="home-tile-select"
                      onClick={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedHomeIdSet.has(item.id)}
                        onChange={(event) => toggleHomeSelection(item.id, event.target.checked)}
                      />
                    </label>
                    {item.thumbDataUrl ? (
                      <img src={item.thumbDataUrl} alt={item.name} className="home-tile-thumb" draggable={false} />
                    ) : (
                      <div className="home-tile-thumb home-tile-thumb-placeholder" />
                    )}
                    <span className="home-tile-name">{item.name}</span>
                    <span className="home-tile-meta">Type: {projectionLabels[item.projection] || t('strings.unknownProjection')}</span>
                    <span className="home-tile-meta">Device: {item.device || 'Unknown device'}</span>
                    <span className="home-tile-meta">Date: {formatShortDateTime(item.createdAt)}</span>
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
            <div>{t('strings.telemetryProjection')}: {projectionLabels[activeProjection]}</div>
          </div>
        )}
        <div className="side-panel-hover-zone" aria-hidden="true" />
        <aside
          className={`side-panel ${
            (contextMenu.open && contextMenu.scope === 'panel') || isPanelPinnedOpen || deleteTarget || isClearConfirmOpen
              ? 'is-open'
              : ''
          }`}
          aria-label="Right panel"
          onContextMenu={(event) => openContextMenu(event, null, 'panel')}
          onMouseLeave={() => setIsPanelPinnedOpen(false)}
        >
          <button
            type="button"
            className="side-panel-tab"
            aria-label="Expand panorama library"
            onContextMenu={(event) => openContextMenu(event, null, 'panel')}
          >
            Library
          </button>
          <div className="side-panel-content" onContextMenu={(event) => openContextMenu(event, null, 'panel')}>
            <h3>Panorama library</h3>
            <div className="history-list">
              {filteredGroupedHistory.length === 0 && <p className="history-empty">No panoramas for active filter.</p>}
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
                        className={`history-item history-item-${panelTileSize}`}
                        onClick={() => openPanoramaFromLibrary(item)}
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
                            {item.width}x{item.height} | {projectionLabels[item.projection]}
                          </span>
                        </div>
                      </button>
                    ))}
                </section>
              ))}
            </div>
            <div className="history-actions">
              <button type="button" className="folder-btn" onClick={pickFolderWithFsApi}>
                Select folder
              </button>
              {!hasFolderAccess && (
                <button type="button" className="folder-btn secondary-btn" onClick={refreshFolderAccess}>
                  Refresh access
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
          onMouseLeave={closeContextMenu}
        >
          <div className="context-title">Filters</div>
          <div className="context-menu-submenu">
            <button type="button" className="context-menu-item submenu-trigger">
              <span className="cm-icon cm-filter" />
              <span>Panorama type</span>
              <span className="submenu-arrow">&gt;</span>
            </button>
            <div className="context-submenu-panel">
              <button
                type="button"
                className={`context-menu-item ${menuProjectionFilter === 'all' ? 'active' : ''}`}
                onClick={() => {
                  setMenuProjectionFilter('all')
                  closeContextMenuAfterMenuAction()
                }}
              >
                <span>All</span>
              </button>
              <button
                type="button"
                className={`context-menu-item ${menuProjectionFilter === 'spherical' ? 'active' : ''}`}
                onClick={() => {
                  setMenuProjectionFilter('spherical')
                  closeContextMenuAfterMenuAction()
                }}
              >
                <span>Spherical</span>
              </button>
              <button
                type="button"
                className={`context-menu-item ${menuProjectionFilter === 'cylindrical' ? 'active' : ''}`}
                onClick={() => {
                  setMenuProjectionFilter('cylindrical')
                  closeContextMenuAfterMenuAction()
                }}
              >
                <span>Cylindrical</span>
              </button>
            </div>
          </div>
          <div className="context-menu-submenu">
            <button type="button" className="context-menu-item submenu-trigger">
              <span className="cm-icon cm-filter" />
              <span>Device</span>
              <span className="submenu-arrow">&gt;</span>
            </button>
            <div className="context-submenu-panel">
              <button
                type="button"
                className={`context-menu-item ${menuDeviceFilter === 'all' ? 'active' : ''}`}
                onClick={() => {
                  setMenuDeviceFilter('all')
                  closeContextMenuAfterMenuAction()
                }}
              >
                <span>All</span>
              </button>
              {uniqueDevices.map((device) => (
                <button
                  key={device}
                  type="button"
                  className={`context-menu-item ${menuDeviceFilter === device ? 'active' : ''}`}
                  onClick={() => {
                    setMenuDeviceFilter(device)
                    closeContextMenuAfterMenuAction()
                  }}
                >
                  <span>{device}</span>
                </button>
              ))}
            </div>
          </div>
          {contextMenu.scope === 'panel' && (
            <div className="context-menu-submenu">
              <button type="button" className="context-menu-item submenu-trigger">
                <span className="cm-icon cm-expand" />
                <span>Tile size</span>
                <span className="submenu-arrow">&gt;</span>
              </button>
              <div className="context-submenu-panel">
                <button
                  type="button"
                  className={`context-menu-item ${panelTileSize === 'small' ? 'active' : ''}`}
                  onClick={() => {
                    setPanelTileSize('small')
                    closeContextMenuAfterMenuAction()
                  }}
                >
                  <span>Small (default)</span>
                </button>
                <button
                  type="button"
                  className={`context-menu-item ${panelTileSize === 'large' ? 'active' : ''}`}
                  onClick={() => {
                    setPanelTileSize('large')
                    closeContextMenuAfterMenuAction()
                  }}
                >
                  <span>Large</span>
                </button>
              </div>
            </div>
          )}
          {contextMenu.scope === 'home' && (
            <div className="context-menu-submenu">
              <button type="button" className="context-menu-item submenu-trigger">
                <span className="cm-icon cm-expand" />
                <span>Tile size</span>
                <span className="submenu-arrow">&gt;</span>
              </button>
              <div className="context-submenu-panel">
                <button
                  type="button"
                  className={`context-menu-item ${homeTileSize === 'small' ? 'active' : ''}`}
                  onClick={() => {
                    setHomeTileSize('small')
                    closeContextMenuAfterMenuAction()
                  }}
                >
                  <span>Small</span>
                </button>
                <button
                  type="button"
                  className={`context-menu-item ${homeTileSize === 'medium' ? 'active' : ''}`}
                  onClick={() => {
                    setHomeTileSize('medium')
                    closeContextMenuAfterMenuAction()
                  }}
                >
                  <span>Medium</span>
                </button>
                <button
                  type="button"
                  className={`context-menu-item ${homeTileSize === 'large' ? 'active' : ''}`}
                  onClick={() => {
                    setHomeTileSize('large')
                    closeContextMenuAfterMenuAction()
                  }}
                >
                  <span>Large (default)</span>
                </button>
                <button
                  type="button"
                  className={`context-menu-item ${homeTileSize === 'xlarge' ? 'active' : ''}`}
                  onClick={() => {
                    setHomeTileSize('xlarge')
                    closeContextMenuAfterMenuAction()
                  }}
                >
                  <span>X-Large</span>
                </button>
              </div>
            </div>
          )}
          <div className="context-menu-submenu">
            <button type="button" className="context-menu-item submenu-trigger">
              <span className="cm-icon cm-sort" />
              <span>Date sorting</span>
              <span className="submenu-arrow">&gt;</span>
            </button>
            <div className="context-submenu-panel">
              <button
                type="button"
                className={`context-menu-item ${menuSortOrder === 'desc' ? 'active' : ''}`}
                onClick={() => {
                  setMenuSortOrder('desc')
                  closeContextMenuAfterMenuAction()
                }}
              >
                <span>Descending (newest)</span>
              </button>
              <button
                type="button"
                className={`context-menu-item ${menuSortOrder === 'asc' ? 'active' : ''}`}
                onClick={() => {
                  setMenuSortOrder('asc')
                  closeContextMenuAfterMenuAction()
                }}
              >
                <span>Ascending (oldest)</span>
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
                  closeContextMenuAfterMenuAction()
                }}
              >
                <span className="cm-icon cm-collapse" />
                <span>Collapse all dates</span>
              </button>
              <button
                type="button"
                className="context-menu-item"
                onClick={() => {
                  expandAllGroups()
                  closeContextMenuAfterMenuAction()
                }}
              >
                <span className="cm-icon cm-expand" />
                <span>Expand all dates</span>
              </button>
              <div className="context-sep" />
            </>
          )}
          {contextMenu.scope === 'home' && (
            <>
              <button
                type="button"
                className="context-menu-item"
                onClick={() => {
                  inputRef.current?.click()
                  closeContextMenuAfterMenuAction()
                }}
              >
                <span className="cm-icon cm-image" />
                <span>{t('strings.openImage')}</span>
              </button>
              <button
                type="button"
                className="context-menu-item"
                disabled={!loadedMetaRef.current || isExifLoading}
                onClick={() => {
                  setIsExifOpen(true)
                  closeContextMenuAfterMenuAction()
                }}
              >
                <span className="cm-icon cm-exif" />
                <span>{t('strings.showExif')}</span>
              </button>
              <button
                type="button"
                className="context-menu-item"
                disabled={!activeContextItem}
                onClick={() => {
                  if (!activeContextItem) return
                  revealHistoryItemOnDisk(activeContextItem)
                  closeContextMenuAfterMenuAction()
                }}
              >
                <span className="cm-icon cm-folder" />
                <span>{t('strings.showOnDisk')}</span>
              </button>
              <button
                type="button"
                className="context-menu-item"
                onClick={() => {
                  openBackupModal()
                  closeContextMenuAfterMenuAction()
                }}
              >
                <span className="cm-icon cm-backup" />
                <span>{t('strings.backupImportExport')}</span>
              </button>
              <button
                type="button"
                className={`context-menu-item ${showLocationPanel ? 'active' : ''}`}
                onClick={() => {
                  setShowLocationPanel((prev) => !prev)
                  closeContextMenuAfterMenuAction()
                }}
              >
                <span className="cm-icon cm-map" />
                <span>{showLocationPanel ? t('strings.hideLocationPanel') : t('strings.showLocationPanel')}</span>
              </button>
              <button
                type="button"
                className={`context-menu-item ${showGpsMapOverlay ? 'active' : ''}`}
                onClick={() => {
                  setShowGpsMapOverlay((prev) => !prev)
                  closeContextMenuAfterMenuAction()
                }}
              >
                <span className="cm-icon cm-map" />
                <span>{showGpsMapOverlay ? t('strings.hideGpsMap') : t('strings.showGpsMap')}</span>
              </button>
              {hasHomeSelection && (
                <>
                  <button
                    type="button"
                    className="context-menu-item danger"
                    onClick={() => {
                      setIsDeleteSelectedConfirmOpen(true)
                      closeContextMenuAfterMenuAction()
                    }}
                  >
                    <span className="cm-icon cm-delete" />
                    <span>{t('strings.removeSelectedFromLibrary')}</span>
                  </button>
                  <button
                    type="button"
                    className="context-menu-item"
                    onClick={() => {
                      clearHomeSelection()
                      closeContextMenuAfterMenuAction()
                    }}
                  >
                    <span className="cm-icon cm-collapse" />
                    <span>{t('strings.deselectAll')}</span>
                  </button>
                  <div className="context-sep" />
                </>
              )}
              <button
                type="button"
                className="context-menu-item danger"
                disabled={!activeContextItem}
                onClick={() => {
                  if (!activeContextItem) return
                  setDeleteTarget(activeContextItem)
                  closeContextMenuAfterMenuAction()
                }}
              >
                <span className="cm-icon cm-delete" />
                <span>{t('strings.removeFromLibrary')}</span>
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
                  closeContextMenuAfterMenuAction()
                }}
              >
                <span className="cm-icon cm-folder" />
                <span>{t('strings.showOnDisk')}</span>
              </button>
              <div className="context-sep" />
            </>
          )}
          {contextMenu.scope === 'home' && (
            <button
              type="button"
              className="context-menu-item danger"
              onClick={() => {
                openClearConfirmModal()
                closeContextMenuAfterMenuAction()
              }}
            >
              <span className="cm-icon cm-clear" />
              <span>{t('strings.clearLibrary')}</span>
            </button>
          )}
        </div>
      )}

      {deleteTarget && (
        <div className="confirm-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="confirm-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Remove from library</h3>
            <p>Are you sure you want to remove "{deleteTarget.name}" from the library?</p>
            <div className="confirm-actions">
              <button type="button" className="secondary-btn" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button type="button" className="danger-btn" onClick={() => removeHistoryItem(deleteTarget.id)}>
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {isDeleteSelectedConfirmOpen && (
        <div className="confirm-backdrop" onClick={() => setIsDeleteSelectedConfirmOpen(false)}>
          <div className="confirm-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Remove selected from library</h3>
            <p>Are you sure you want to remove {selectedHomeIds.length} selected panorama(s)?</p>
            <div className="confirm-actions">
              <button type="button" className="secondary-btn" onClick={() => setIsDeleteSelectedConfirmOpen(false)}>
                Cancel
              </button>
              <button type="button" className="danger-btn" onClick={() => removeHistoryItems(selectedHomeIds)}>
                Remove selected
              </button>
            </div>
          </div>
        </div>
      )}

      {isClearConfirmOpen && (
        <div className="confirm-backdrop" onClick={closeClearConfirmModal}>
          <div className="confirm-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Clear library</h3>
            <p>Are you sure you want to remove all panoramas from the library?</p>
            <label className="confirm-checkbox">
              <input
                type="checkbox"
                checked={clearConfirmChecked}
                onChange={(event) => setClearConfirmChecked(event.target.checked)}
              />
              I understand this action will remove the entire library.
            </label>
            <div className="confirm-actions">
              <button type="button" className="secondary-btn" onClick={closeClearConfirmModal}>
                Cancel
              </button>
              <button type="button" className="danger-btn" disabled={!clearConfirmChecked} onClick={clearLibrary}>
                Remove all
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
                Close
              </button>
            </div>
            {isExifLoading && <p>Reading EXIF...</p>}
            {!isExifLoading && exifError && <p>{exifError}</p>}
            {!isExifLoading && !exifError && exifEntries.length === 0 && (
              <p>No EXIF/XMP/IPTC metadata found in this file.</p>
            )}
            {!isExifLoading && !exifError && exifEntries.length > 0 && (
              <>
                <div className="exif-tabs">
                  {visibleExifTabs.map((tabId) => (
                    <button
                      key={tabId}
                      type="button"
                      className={`exif-tab ${exifTab === tabId ? 'active' : ''}`}
                      onClick={() => setExifTab(tabId)}
                    >
                      {exifTabLabels[tabId]} ({(groupedExifEntries[tabId] || []).length})
                    </button>
                  ))}
                </div>
                <div className="exif-table-wrap">
                  <table className="exif-table">
                    <colgroup>
                      <col className="exif-col-key" />
                      <col className="exif-col-value" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownExifEntries.map(([key, value]) => (
                        <tr key={key}>
                          <td>{key}</td>
                          <td>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {isBackupModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsBackupModalOpen(false)}>
          <div className="modal backup-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h2>Backup biblioteki</h2>
              <button type="button" onClick={() => setIsBackupModalOpen(false)}>
                Close
              </button>
            </div>
            <div className="backup-section">
              <h3>Export</h3>
              <p>Export thumbnails and metadata to a JSON file.</p>
              <button type="button" onClick={exportBackup}>
                Export backup
              </button>
            </div>
            <div className="backup-section">
              <h3>Import</h3>
              <p>Drag a JSON file here or choose it from disk.</p>
              <div
                className={`backup-dropzone ${isBackupDragging ? 'is-active' : ''}`}
                onDragEnter={(event) => {
                  if (!isFileDragEvent(event)) return
                  event.preventDefault()
                  backupDragDepthRef.current += 1
                  setIsBackupDragging(true)
                }}
                onDragOver={(event) => {
                  if (!isFileDragEvent(event)) return
                  event.preventDefault()
                  setIsBackupDragging(true)
                }}
                onDragLeave={(event) => {
                  if (!isFileDragEvent(event)) return
                  event.preventDefault()
                  backupDragDepthRef.current = Math.max(0, backupDragDepthRef.current - 1)
                  if (backupDragDepthRef.current === 0) {
                    setIsBackupDragging(false)
                  }
                }}
                onDrop={onBackupDrop}
              >
                {backupFile ? `Selected: ${backupFile.name}` : 'Drop backup file (.json)'}
              </div>
              <button type="button" className="secondary-btn" onClick={() => backupInputRef.current?.click()}>
                Choose backup file
              </button>
              <label className="backup-option">
                <input
                  type="checkbox"
                  checked={importClearBefore}
                  onChange={(event) => setImportClearBefore(event.target.checked)}
                />
                Clear current library before import
              </label>
              <label className="backup-option">
                <input
                  type="checkbox"
                  checked={importLinkFolderAfter}
                  onChange={(event) => setImportLinkFolderAfter(event.target.checked)}
                />
                After import, connect folder with files
              </label>
              <label className="backup-option">
                <input
                  type="checkbox"
                  checked={importScanAfterLink}
                  disabled={!importLinkFolderAfter}
                  onChange={(event) => setImportScanAfterLink(event.target.checked)}
                />
                Scan folder immediately after connecting
              </label>
              <div className="backup-actions">
                <button type="button" className="secondary-btn" onClick={() => setIsBackupModalOpen(false)}>
                  Cancel
                </button>
                <button type="button" onClick={importBackup}>
                  Import backup
                </button>
              </div>
            </div>
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

