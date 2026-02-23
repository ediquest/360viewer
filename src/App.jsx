import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import * as exifr from 'exifr'
import L from 'leaflet'
import piexif from 'piexifjs'
import 'leaflet/dist/leaflet.css'
import './App.css'

const DB_NAME = 'viewer360-db'
const DB_VERSION = 2
const PANORAMAS_STORE = 'panoramas'
const SETTINGS_STORE = 'settings'
const ROOT_HANDLE_KEY = 'fs-root-handle'
const ROOT_HANDLES_KEY = 'fs-root-handles'
const DEBUG_BUILD_TAG = 'open-fix-2026-02-21-b'
const MAX_LIBRARY_FILE_SIZE_BYTES = 100 * 1024 * 1024
const THUMBNAIL_WIDTH = 512
const THUMBNAIL_HEIGHT = 256
const MIN_PANORAMA_RATIO = 1.95
const PANORAMA_RATIO_TOLERANCE = 0.04

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
      repairLibraryLinks: 'Repair library links',
      clearLibrary: 'Clear library',
      hideLocationPanel: 'Hide location panel',
      showLocationPanel: 'Show location panel',
      hideGpsMap: 'Hide GPS mini-map',
      showGpsMap: 'Show GPS mini-map',
      emptyLibraryTitle: 'Panorama 360 Viewer',
      emptyLibraryHint: 'Library is empty. Add panoramas to the library.',
      cancelScan: 'Cancel scan',
      cancel: 'Cancel',
      scanCanceled: 'Scan canceled by user.',
      locationResolving: 'Resolving location...',
      unknownProjection: 'Unknown',
      telemetryProjection: 'Proj',
      countPanoramas: 'Panoramas',
      dbSize: 'DB size',
      connectedFolders: 'Folders',
      showPanoramas: 'Show panoramas',
      showFolders: 'Show folders',
      collapseAllFolders: 'Collapse all folders',
      expandAllFolders: 'Expand all folders',
      clearFolderFilter: 'Clear folder filter',
      photoFromPanorama: 'Photo',
      openPhotoFrame: 'Photo frame mode',
      editPanorama: 'Edit',
      closeEdit: 'Close edit',
      editPanelTitle: 'Panorama edit',
      pickGpsOnMap: 'Pick GPS on map',
      pickGpsHint: 'Click a point on the map to set coordinates.',
      gpsFromPhoto: 'GPS from photo',
      gpsFromPhotoHint: 'Drop a photo with EXIF GPS or click to choose.',
      removeGps: 'Remove GPS',
      exportEditedJpeg: 'Export edited JPG',
      openExportPanel: 'Export options',
      exportPanelTitle: 'Export',
      exportMode: 'Mode',
      exportModePanorama: 'Full panorama',
      exportModePhoto: 'Photo frame',
      exportAspect: 'Aspect ratio',
      exportFrameSize: 'Frame size',
      exportFrameHint: 'Drag panorama to compose the shot inside the frame.',
      exportPhotoJpeg: 'Export photo JPG',
      lat: 'Lat',
      lon: 'Lon',
      gpsSaved: 'GPS saved in editor.',
      gpsCopiedFromPhoto: 'GPS copied from reference photo.',
      noGpsInPhoto: 'No GPS found in reference photo.',
      editedExportDone: 'Edited panorama exported as JPG.',
      openMaskEditor: 'Mask areas (pixelate)',
      clearMasks: 'Clear masks',
      maskEditorTitle: 'Mask editor',
      maskEditorHint: 'Draw masks over sensitive areas. Effect is applied on export.',
      maskCount: 'Masks',
      drawOnPanorama: 'Add mask',
      stopDrawing: 'Stop drawing',
      maskEffect: 'Mask effect',
      maskEffectBlur: 'Blur',
      maskEffectPixelate: 'Pixelate',
      maskStrength: 'Strength',
      editSectionGps: 'GPS',
      editSectionMasks: 'Masks',
      editSectionAdjustments: 'Adjustments',
      adjustmentPreset: 'Preset',
      presetCustom: 'Custom',
      presetNatural: 'Natural',
      presetBw: 'B&W',
      presetPunchy: 'Punchy',
      presetWarm: 'Warm',
      presetCool: 'Cool',
      toggleAdjustments: 'Adjust panel',
      exposure: 'Exposure',
      contrast: 'Contrast',
      saturation: 'Saturation',
      whiteBalance: 'White balance',
      tint: 'Tint',
      highlights: 'Highlights',
      shadows: 'Shadows',
      sharpen: 'Sharpen',
      bloom: 'Bloom',
      vignette: 'Vignette',
      grain: 'Grain',
      lut: 'Look (LUT)',
      lutNone: 'None',
      lutCinematic: 'Cinematic',
      lutTealOrange: 'Teal/Orange',
      lutVintage: 'Vintage',
      resetAdjustments: 'Reset adjustments',
      gpsOverwriteTitle: 'Replace existing GPS?',
      gpsOverwriteMessage: 'This panorama already has GPS coordinates. Do you want to replace them?',
      replaceGps: 'Replace GPS',
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
      repairLibraryLinks: 'Napraw linki biblioteki',
      clearLibrary: 'Wyczysc biblioteke',
      hideLocationPanel: 'Ukryj panel lokalizacji',
      showLocationPanel: 'Pokaz panel lokalizacji',
      hideGpsMap: 'Ukryj mapke GPS',
      showGpsMap: 'Pokaz mapke GPS',
      emptyLibraryTitle: 'Panorama 360 Viewer',
      emptyLibraryHint: 'Biblioteka jest pusta. Dodaj panoramy do biblioteki.',
      cancelScan: 'Anuluj skanowanie',
      cancel: 'Anuluj',
      scanCanceled: 'Skanowanie anulowane przez uzytkownika.',
      locationResolving: 'Ustalanie miejscowosci...',
      unknownProjection: 'Nieznany',
      telemetryProjection: 'Proj',
      countPanoramas: 'Panoramy',
      dbSize: 'Rozmiar bazy',
      connectedFolders: 'Foldery',
      showPanoramas: 'Pokaz panoramy',
      showFolders: 'Pokaz foldery',
      collapseAllFolders: 'Zwin wszystkie foldery',
      expandAllFolders: 'Rozwin wszystkie foldery',
      clearFolderFilter: 'Wyczysc filtr folderu',
      photoFromPanorama: 'Foto',
      openPhotoFrame: 'Tryb kadru foto',
      editPanorama: 'Edycja',
      closeEdit: 'Zamknij edycje',
      editPanelTitle: 'Edycja panoramy',
      pickGpsOnMap: 'Wybierz GPS na mapie',
      pickGpsHint: 'Kliknij punkt na mapie, aby ustawic wspolrzedne.',
      gpsFromPhoto: 'GPS ze zdjecia',
      gpsFromPhotoHint: 'Upusc zdjecie z EXIF GPS lub kliknij, aby wybrac.',
      removeGps: 'Usun GPS',
      exportEditedJpeg: 'Eksportuj edytowany JPG',
      openExportPanel: 'Opcje eksportu',
      exportPanelTitle: 'Eksport',
      exportMode: 'Tryb',
      exportModePanorama: 'Cala panorama',
      exportModePhoto: 'Kadr foto',
      exportAspect: 'Proporcje',
      exportFrameSize: 'Rozmiar kadru',
      exportFrameHint: 'Przeciagaj panorame, aby ustawic kadr w ramce.',
      exportPhotoJpeg: 'Eksportuj foto JPG',
      lat: 'Szer',
      lon: 'Dlug',
      gpsSaved: 'GPS zapisany w edycji.',
      gpsCopiedFromPhoto: 'GPS skopiowany ze zdjecia referencyjnego.',
      noGpsInPhoto: 'Brak GPS w zdjeciu referencyjnym.',
      editedExportDone: 'Wyeksportowano edytowana panorame JPG.',
      openMaskEditor: 'Maskuj obszary (pixelate)',
      clearMasks: 'Wyczysc maski',
      maskEditorTitle: 'Edytor masek',
      maskEditorHint: 'Rysuj maski na obszarach wrazliwych. Efekt zostanie nalozony przy eksporcie.',
      maskCount: 'Maski',
      drawOnPanorama: 'Dodaj maske',
      stopDrawing: 'Zakoncz rysowanie',
      maskEffect: 'Efekt maski',
      maskEffectBlur: 'Rozmycie',
      maskEffectPixelate: 'Pikselizacja',
      maskStrength: 'Sila',
      editSectionGps: 'GPS',
      editSectionMasks: 'Maski',
      editSectionAdjustments: 'Korekty',
      adjustmentPreset: 'Preset',
      presetCustom: 'Niestandardowy',
      presetNatural: 'Naturalny',
      presetBw: 'Czarno-bialy',
      presetPunchy: 'Wyrazisty',
      presetWarm: 'Cieply',
      presetCool: 'Chlodny',
      toggleAdjustments: 'Panel korekt',
      exposure: 'Ekspozycja',
      contrast: 'Kontrast',
      saturation: 'Nasycenie',
      whiteBalance: 'Balans bieli',
      tint: 'Tint',
      highlights: 'Jasne tony',
      shadows: 'Cienie',
      sharpen: 'Wyostrzenie',
      bloom: 'Bloom',
      vignette: 'Winieta',
      grain: 'Ziarno',
      lut: 'Look (LUT)',
      lutNone: 'Brak',
      lutCinematic: 'Kinowy',
      lutTealOrange: 'Teal/Orange',
      lutVintage: 'Vintage',
      resetAdjustments: 'Resetuj korekty',
      gpsOverwriteTitle: 'Nadpisac istniejacy GPS?',
      gpsOverwriteMessage: 'Ta panorama ma juz wspolrzedne GPS. Czy chcesz je zastapic?',
      replaceGps: 'Nadpisz GPS',
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
const LOCALITY_FAILURE_RETRY_MS = 2 * 60 * 1000
const DEFAULT_ADJUSTMENTS = Object.freeze({
  exposure: 0,
  contrast: 0,
  saturation: 1,
  temperature: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
  sharpen: 0,
  bloom: 0,
  vignette: 0,
  grain: 0,
})
const LUT_MODE_VALUES = Object.freeze({
  none: 0,
  cinematic: 1,
  teal_orange: 2,
  vintage: 3,
})
const EXPORT_ASPECT_VALUES = Object.freeze({
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
  '1:1': 1,
  '21:9': 21 / 9,
})
const ADJUSTMENT_PRESETS = Object.freeze({
  custom: null,
  natural: {
    exposure: 0.08, contrast: 0.1, saturation: 1.06, temperature: 0, tint: 0, highlights: 0.05, shadows: 0.08,
    sharpen: 0.2, bloom: 0.06, vignette: 0.06, grain: 0.01, lut: 'none',
  },
  bw: {
    exposure: 0, contrast: 0.18, saturation: 0, temperature: 0, tint: 0, highlights: 0.12, shadows: 0.12,
    sharpen: 0.28, bloom: 0.04, vignette: 0.08, grain: 0.03, lut: 'none',
  },
  punchy: {
    exposure: 0.12, contrast: 0.26, saturation: 1.22, temperature: 0, tint: 0, highlights: 0.1, shadows: 0.18,
    sharpen: 0.36, bloom: 0.12, vignette: 0.12, grain: 0.015, lut: 'cinematic',
  },
  warm: {
    exposure: 0.05, contrast: 0.08, saturation: 1.08, temperature: 0.22, tint: -0.03, highlights: 0.06, shadows: 0.1,
    sharpen: 0.16, bloom: 0.08, vignette: 0.07, grain: 0.01, lut: 'vintage',
  },
  cool: {
    exposure: 0, contrast: 0.12, saturation: 0.95, temperature: -0.2, tint: 0.05, highlights: 0.08, shadows: 0.12,
    sharpen: 0.16, bloom: 0.08, vignette: 0.07, grain: 0.012, lut: 'teal_orange',
  },
})

const PANORAMA_ADJUST_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    exposure: { value: DEFAULT_ADJUSTMENTS.exposure },
    contrast: { value: DEFAULT_ADJUSTMENTS.contrast },
    saturation: { value: DEFAULT_ADJUSTMENTS.saturation },
    temperature: { value: DEFAULT_ADJUSTMENTS.temperature },
    tint: { value: DEFAULT_ADJUSTMENTS.tint },
    highlights: { value: DEFAULT_ADJUSTMENTS.highlights },
    shadows: { value: DEFAULT_ADJUSTMENTS.shadows },
    sharpen: { value: DEFAULT_ADJUSTMENTS.sharpen },
    bloom: { value: DEFAULT_ADJUSTMENTS.bloom },
    vignette: { value: DEFAULT_ADJUSTMENTS.vignette },
    grain: { value: DEFAULT_ADJUSTMENTS.grain },
    lutMode: { value: LUT_MODE_VALUES.none },
    texelSize: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float exposure;
    uniform float contrast;
    uniform float saturation;
    uniform float temperature;
    uniform float tint;
    uniform float highlights;
    uniform float shadows;
    uniform float sharpen;
    uniform float bloom;
    uniform float vignette;
    uniform float grain;
    uniform float lutMode;
    uniform vec2 texelSize;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    float signedPow(float v, float p) {
      float a = pow(abs(v), p);
      return v < 0.0 ? -a : a;
    }

    vec3 adjustColor(vec3 inputColor) {
      vec3 color = inputColor * pow(2.0, exposure);
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, max(0.0, saturation));
      color = (color - 0.5) * (1.0 + contrast * 0.55) + 0.5;
      float hiMask = smoothstep(0.4, 1.0, luma);
      float shMask = 1.0 - smoothstep(0.08, 0.42, luma);
      float hiEff = signedPow(highlights, 0.72);
      float shEff = signedPow(shadows, 1.7);
      if (hiEff >= 0.0) {
        color += hiEff * hiMask * (1.0 - color) * 2.0;
      } else {
        color += hiEff * hiMask * color * 1.1;
      }
      if (shEff >= 0.0) {
        color += shEff * shMask * (1.0 - color) * 0.28;
      } else {
        color += shEff * shMask * color * 0.5;
      }
      color.r += temperature * 0.09;
      color.b -= temperature * 0.09;
      color.g += tint * 0.08;
      color.r -= tint * 0.03;
      color.b -= tint * 0.03;
      return color;
    }

    vec3 applyLut(vec3 color) {
      if (lutMode < 0.5) {
        return color;
      }
      if (lutMode < 1.5) {
        vec3 base = color;
        vec3 c = color;
        c = (c - 0.5) * 1.10 + 0.5;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        vec3 warm = vec3(1.04, 1.01, 0.98);
        vec3 cool = vec3(0.96, 1.00, 1.06);
        c *= mix(cool, warm, smoothstep(0.32, 0.85, l));
        c = mix(vec3(l), c, 1.03);
        return clamp(mix(base, c, 0.78), 0.0, 1.0);
      }
      if (lutMode < 2.5) {
        vec3 c = color;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        vec3 shadowsTint = vec3(0.86, 1.02, 1.12);
        vec3 highsTint = vec3(1.12, 1.00, 0.90);
        c *= mix(shadowsTint, highsTint, smoothstep(0.28, 0.82, l));
        c = (c - 0.5) * 1.12 + 0.5;
        return clamp(c, 0.0, 1.0);
      }
      vec3 v = color;
      v.r = pow(v.r, 0.92) * 1.04;
      v.g = pow(v.g, 0.95) * 1.01;
      v.b = pow(v.b, 1.07) * 0.92;
      float l = dot(v, vec3(0.2126, 0.7152, 0.0722));
      v = mix(vec3(l), v, 0.88);
      return clamp(v, 0.0, 1.0);
    }

    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 color = adjustColor(src.rgb);

      if (sharpen > 0.001) {
        vec3 n = adjustColor(texture2D(tDiffuse, vUv + vec2(0.0, -texelSize.y)).rgb);
        vec3 s = adjustColor(texture2D(tDiffuse, vUv + vec2(0.0, texelSize.y)).rgb);
        vec3 e = adjustColor(texture2D(tDiffuse, vUv + vec2(texelSize.x, 0.0)).rgb);
        vec3 w = adjustColor(texture2D(tDiffuse, vUv + vec2(-texelSize.x, 0.0)).rgb);
        vec3 blur = (n + s + e + w) * 0.25;
        float sharpenMul = min(2.5, sharpen * 1.25);
        color += (color - blur) * sharpenMul;
      }

      if (bloom > 0.001) {
        vec2 r1 = texelSize * 2.5;
        vec2 r2 = texelSize * 5.0;
        vec3 b0 = adjustColor(texture2D(tDiffuse, vUv + vec2(r1.x, 0.0)).rgb);
        vec3 b1 = adjustColor(texture2D(tDiffuse, vUv + vec2(-r1.x, 0.0)).rgb);
        vec3 b2 = adjustColor(texture2D(tDiffuse, vUv + vec2(0.0, r1.y)).rgb);
        vec3 b3 = adjustColor(texture2D(tDiffuse, vUv + vec2(0.0, -r1.y)).rgb);
        vec3 b4 = adjustColor(texture2D(tDiffuse, vUv + vec2(r2.x, r2.y)).rgb);
        vec3 b5 = adjustColor(texture2D(tDiffuse, vUv + vec2(-r2.x, r2.y)).rgb);
        vec3 b6 = adjustColor(texture2D(tDiffuse, vUv + vec2(r2.x, -r2.y)).rgb);
        vec3 b7 = adjustColor(texture2D(tDiffuse, vUv + vec2(-r2.x, -r2.y)).rgb);
        vec3 blur2 = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + b7 + color) / 9.0;
        vec3 bright = max(blur2 - vec3(0.45), vec3(0.0));
        color += bright * bloom * 2.8;
      }

      if (vignette > 0.001) {
        vec2 centered = vUv - vec2(0.5);
        float dist = length(centered) / 0.70710678;
        float vig = smoothstep(0.25, 1.0, dist) * vignette;
        color *= (1.0 - vig);
      }

      if (grain > 0.0001) {
        float n = rand(vUv * 4096.0) - 0.5;
        color += vec3(n * grain);
      }

      color = applyLut(clamp(color, 0.0, 1.0));
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), src.a);
    }
  `,
}

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

const pickLocalityFromAddress = (address) => {
  if (!address || typeof address !== 'object') return ''
  return (
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.suburb ||
    address.county ||
    address.state ||
    ''
  )
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

const sanitizeGpsCoords = (coords) => {
  if (!coords || typeof coords !== 'object') return null
  const lat = Number(coords.lat)
  const lon = Number(coords.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon }
}

const decimalToExifDms = (value) => {
  const absolute = Math.abs(Number(value) || 0)
  const degrees = Math.floor(absolute)
  const minutesFloat = (absolute - degrees) * 60
  const minutes = Math.floor(minutesFloat)
  const seconds = (minutesFloat - minutes) * 60
  return [
    [degrees, 1],
    [minutes, 1],
    [Math.round(seconds * 10000), 10000],
  ]
}

const attachGpsToJpegDataUrl = (jpegDataUrl, coords) => {
  const safe = sanitizeGpsCoords(coords)
  if (!safe) return jpegDataUrl

  const gps = {
    [piexif.GPSIFD.GPSLatitudeRef]: safe.lat >= 0 ? 'N' : 'S',
    [piexif.GPSIFD.GPSLatitude]: decimalToExifDms(safe.lat),
    [piexif.GPSIFD.GPSLongitudeRef]: safe.lon >= 0 ? 'E' : 'W',
    [piexif.GPSIFD.GPSLongitude]: decimalToExifDms(safe.lon),
  }
  const exifObj = {
    '0th': {},
    Exif: {},
    GPS: gps,
    Interop: {},
    '1st': {},
    thumbnail: null,
  }
  const exifBytes = piexif.dump(exifObj)
  return piexif.insert(exifBytes, jpegDataUrl)
}

const applyPixelateToCanvasRegion = (canvas, ctx, x, y, width, height, pixelSize = 24) => {
  const sx = Math.max(0, Math.floor(x))
  const sy = Math.max(0, Math.floor(y))
  const sw = Math.max(1, Math.min(canvas.width - sx, Math.floor(width)))
  const sh = Math.max(1, Math.min(canvas.height - sy, Math.floor(height)))
  if (sw <= 0 || sh <= 0) return

  const imageData = ctx.getImageData(sx, sy, sw, sh)
  const data = imageData.data
  const block = Math.max(6, Math.floor(pixelSize))

  for (let by = 0; by < sh; by += block) {
    for (let bx = 0; bx < sw; bx += block) {
      const bw = Math.min(block, sw - bx)
      const bh = Math.min(block, sh - by)
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let count = 0

      for (let yy = 0; yy < bh; yy += 1) {
        for (let xx = 0; xx < bw; xx += 1) {
          const idx = ((by + yy) * sw + (bx + xx)) * 4
          r += data[idx]
          g += data[idx + 1]
          b += data[idx + 2]
          a += data[idx + 3]
          count += 1
        }
      }
      if (count === 0) continue
      const rr = Math.round(r / count)
      const gg = Math.round(g / count)
      const bb = Math.round(b / count)
      const aa = Math.round(a / count)

      for (let yy = 0; yy < bh; yy += 1) {
        for (let xx = 0; xx < bw; xx += 1) {
          const idx = ((by + yy) * sw + (bx + xx)) * 4
          data[idx] = rr
          data[idx + 1] = gg
          data[idx + 2] = bb
          data[idx + 3] = aa
        }
      }
    }
  }

  ctx.putImageData(imageData, sx, sy)
}

const applyPixelateToPolygon = (canvas, ctx, pointsPx, pixelSize = 24) => {
  if (!Array.isArray(pointsPx) || pointsPx.length < 3) return
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const p of pointsPx) {
    const x = Number(p?.x)
    const y = Number(p?.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return
  const bx = Math.max(0, Math.floor(minX))
  const by = Math.max(0, Math.floor(minY))
  const bw = Math.max(1, Math.ceil(maxX - minX))
  const bh = Math.max(1, Math.ceil(maxY - minY))

  const tmp = document.createElement('canvas')
  tmp.width = canvas.width
  tmp.height = canvas.height
  const tctx = tmp.getContext('2d', { alpha: false })
  if (!tctx) return
  tctx.drawImage(canvas, 0, 0)
  applyPixelateToCanvasRegion(tmp, tctx, bx, by, bw, bh, pixelSize)

  ctx.save()
  ctx.beginPath()
  pointsPx.forEach((p, idx) => {
    if (idx === 0) ctx.moveTo(p.x, p.y)
    else ctx.lineTo(p.x, p.y)
  })
  ctx.closePath()
  ctx.clip()
  ctx.drawImage(tmp, 0, 0)
  ctx.restore()
}

const applyBlurToPolygon = (canvas, ctx, pointsPx, blurPx = 20) => {
  if (!Array.isArray(pointsPx) || pointsPx.length < 3) return
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const p of pointsPx) {
    const x = Number(p?.x)
    const y = Number(p?.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return
  const bx = Math.floor(minX)
  const by = Math.floor(minY)
  const bw = Math.max(1, Math.ceil(maxX - minX))
  const bh = Math.max(1, Math.ceil(maxY - minY))
  const blur = Math.max(2, Math.floor(blurPx))
  const feather = Math.max(2, Math.floor(blur * 0.65))
  const pad = Math.max(4, Math.ceil(blur * 2 + feather * 2))

  const ex = Math.max(0, bx - pad)
  const ey = Math.max(0, by - pad)
  const ew = Math.max(1, Math.min(canvas.width - ex, bw + pad * 2))
  const eh = Math.max(1, Math.min(canvas.height - ey, bh + pad * 2))

  const src = document.createElement('canvas')
  src.width = ew
  src.height = eh
  const sctx = src.getContext('2d', { alpha: false })
  if (!sctx) return
  sctx.drawImage(canvas, ex, ey, ew, eh, 0, 0, ew, eh)

  const blurred = document.createElement('canvas')
  blurred.width = ew
  blurred.height = eh
  const bctx = blurred.getContext('2d', { alpha: false })
  if (!bctx) return
  bctx.filter = `blur(${blur}px)`
  bctx.drawImage(src, 0, 0)
  bctx.filter = 'none'

  const mask = document.createElement('canvas')
  mask.width = ew
  mask.height = eh
  const mctx = mask.getContext('2d')
  if (!mctx) return
  mctx.clearRect(0, 0, ew, eh)
  mctx.fillStyle = '#fff'
  mctx.beginPath()
  pointsPx.forEach((p, idx) => {
    const lx = p.x - ex
    const ly = p.y - ey
    if (idx === 0) mctx.moveTo(lx, ly)
    else mctx.lineTo(lx, ly)
  })
  mctx.closePath()
  mctx.fill()

  const featheredMask = document.createElement('canvas')
  featheredMask.width = ew
  featheredMask.height = eh
  const fmctx = featheredMask.getContext('2d')
  if (!fmctx) return
  fmctx.filter = `blur(${feather}px)`
  fmctx.drawImage(mask, 0, 0)
  fmctx.filter = 'none'

  const composed = document.createElement('canvas')
  composed.width = ew
  composed.height = eh
  const cctx = composed.getContext('2d', { alpha: true })
  if (!cctx) return
  cctx.drawImage(blurred, 0, 0)
  cctx.globalCompositeOperation = 'destination-in'
  cctx.drawImage(featheredMask, 0, 0)
  cctx.globalCompositeOperation = 'source-over'

  ctx.drawImage(composed, ex, ey)
}

const applyBlurToCanvasRegion = (canvas, ctx, x, y, width, height, blurPx = 20) => {
  const sx = Math.max(0, Math.floor(x))
  const sy = Math.max(0, Math.floor(y))
  const sw = Math.max(1, Math.min(canvas.width - sx, Math.floor(width)))
  const sh = Math.max(1, Math.min(canvas.height - sy, Math.floor(height)))
  if (sw <= 0 || sh <= 0) return
  const rectPoints = [
    { x: sx, y: sy },
    { x: sx + sw, y: sy },
    { x: sx + sw, y: sy + sh },
    { x: sx, y: sy + sh },
  ]
  applyBlurToPolygon(canvas, ctx, rectPoints, blurPx)
}

const clampUnit = (value) => Math.min(1, Math.max(0, value))
const toFiniteOr = (value, fallback) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}
const applyLutToRgb = (r, g, b, lutMode) => {
  if (lutMode === 'cinematic') {
    const br = r
    const bg = g
    const bb0 = b
    let rr = (r - 0.5) * 1.10 + 0.5
    let gg = (g - 0.5) * 1.10 + 0.5
    let bb = (b - 0.5) * 1.10 + 0.5
    const l = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb
    const t = clampUnit((l - 0.32) / 0.53)
    const warm = { r: 1.04, g: 1.01, b: 0.98 }
    const cool = { r: 0.96, g: 1.0, b: 1.06 }
    const tr = cool.r + (warm.r - cool.r) * t
    const tg = cool.g + (warm.g - cool.g) * t
    const tb = cool.b + (warm.b - cool.b) * t
    rr *= tr
    gg *= tg
    bb *= tb
    rr = l + (rr - l) * 1.03
    gg = l + (gg - l) * 1.03
    bb = l + (bb - l) * 1.03
    rr = br + (rr - br) * 0.78
    gg = bg + (gg - bg) * 0.78
    bb = bb0 + (bb - bb0) * 0.78
    return {
      r: clampUnit(rr),
      g: clampUnit(gg),
      b: clampUnit(bb),
    }
  }
  if (lutMode === 'teal_orange') {
    let rr = r
    let gg = g
    let bb = b
    const l = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb
    const t = clampUnit((l - 0.28) / 0.54)
    const sh = { r: 0.86, g: 1.02, b: 1.12 }
    const hi = { r: 1.12, g: 1.0, b: 0.9 }
    rr *= sh.r + (hi.r - sh.r) * t
    gg *= sh.g + (hi.g - sh.g) * t
    bb *= sh.b + (hi.b - sh.b) * t
    rr = (rr - 0.5) * 1.12 + 0.5
    gg = (gg - 0.5) * 1.12 + 0.5
    bb = (bb - 0.5) * 1.12 + 0.5
    return { r: clampUnit(rr), g: clampUnit(gg), b: clampUnit(bb) }
  }
  if (lutMode === 'vintage') {
    let rr = (r ** 0.92) * 1.04
    let gg = (g ** 0.95) * 1.01
    let bb = (b ** 1.07) * 0.92
    const l = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb
    rr = l + (rr - l) * 0.88
    gg = l + (gg - l) * 0.88
    bb = l + (bb - l) * 0.88
    return { r: clampUnit(rr), g: clampUnit(gg), b: clampUnit(bb) }
  }
  return { r: clampUnit(r), g: clampUnit(g), b: clampUnit(b) }
}

const applyBloomToCanvas = (canvas, ctx, bloom = 0) => {
  const amount = Math.max(0, Math.min(1, bloom))
  if (amount <= 0.001) return
  const width = canvas.width
  const height = canvas.height
  const src = document.createElement('canvas')
  src.width = width
  src.height = height
  const sctx = src.getContext('2d', { alpha: false })
  if (!sctx) return
  sctx.drawImage(canvas, 0, 0)

  const blurred = document.createElement('canvas')
  blurred.width = width
  blurred.height = height
  const bctx = blurred.getContext('2d', { alpha: false })
  if (!bctx) return
  bctx.filter = `blur(${4 + amount * 14}px)`
  bctx.drawImage(src, 0, 0)
  bctx.filter = 'none'

  const bloomMask = document.createElement('canvas')
  bloomMask.width = width
  bloomMask.height = height
  const mctx = bloomMask.getContext('2d', { alpha: false })
  if (!mctx) return
  mctx.drawImage(blurred, 0, 0)
  const imageData = mctx.getImageData(0, 0, width, height)
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255
    const g = data[i + 1] / 255
    const b = data[i + 2] / 255
    const bright = Math.max(0, (r + g + b) / 3 - 0.45)
    const scale = Math.min(1, bright * 3.2)
    data[i] = Math.round(data[i] * scale)
    data[i + 1] = Math.round(data[i + 1] * scale)
    data[i + 2] = Math.round(data[i + 2] * scale)
  }
  mctx.putImageData(imageData, 0, 0)

  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.globalAlpha = amount * 1.25
  ctx.drawImage(bloomMask, 0, 0)
  ctx.restore()
}

const applySharpenToCanvas = (canvas, ctx, amount = 0) => {
  const strength = Math.max(0, Number(amount) || 0)
  if (strength <= 0.001) return
  const width = canvas.width
  const height = canvas.height
  if (width < 3 || height < 3) return

  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data
  const source = new Uint8ClampedArray(data)
  const factor = Math.min(2.5, strength * 1.25)

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = (y * width + x) * 4
      const iN = ((y - 1) * width + x) * 4
      const iS = ((y + 1) * width + x) * 4
      const iW = (y * width + (x - 1)) * 4
      const iE = (y * width + (x + 1)) * 4
      for (let c = 0; c < 3; c += 1) {
        const center = source[i + c]
        const blur = (source[iN + c] + source[iS + c] + source[iW + c] + source[iE + c]) * 0.25
        const next = center + (center - blur) * factor
        data[i + c] = Math.max(0, Math.min(255, Math.round(next)))
      }
    }
  }

  ctx.putImageData(imageData, 0, 0)
}

const applyGlobalAdjustmentsToCanvas = (canvas, ctx, adjustments, lutMode = 'none') => {
  const exposure = toFiniteOr(adjustments?.exposure, 0)
  const contrast = toFiniteOr(adjustments?.contrast, 0)
  const saturation = toFiniteOr(adjustments?.saturation, 1)
  const temperature = toFiniteOr(adjustments?.temperature, 0)
  const tint = toFiniteOr(adjustments?.tint, 0)
  const highlights = toFiniteOr(adjustments?.highlights, 0)
  const shadows = toFiniteOr(adjustments?.shadows, 0)
  const sharpen = toFiniteOr(adjustments?.sharpen, 0)
  const bloom = toFiniteOr(adjustments?.bloom, 0)
  const vignette = toFiniteOr(adjustments?.vignette, 0)
  const grain = toFiniteOr(adjustments?.grain, 0)
  const hasToneAdjust =
    Math.abs(exposure) > 1e-4 ||
    Math.abs(contrast) > 1e-4 ||
    Math.abs(saturation - 1) > 1e-4 ||
    Math.abs(temperature) > 1e-4 ||
    Math.abs(tint) > 1e-4

  if (hasToneAdjust) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data
    const exposureMul = 2 ** exposure
    const contrastMul = 1 + contrast * 0.55
    for (let i = 0; i < data.length; i += 4) {
      let r = (data[i] / 255) * exposureMul
      let g = (data[i + 1] / 255) * exposureMul
      let b = (data[i + 2] / 255) * exposureMul

      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
      r = luma + (r - luma) * Math.max(0, saturation)
      g = luma + (g - luma) * Math.max(0, saturation)
      b = luma + (b - luma) * Math.max(0, saturation)

      r = (r - 0.5) * contrastMul + 0.5
      g = (g - 0.5) * contrastMul + 0.5
      b = (b - 0.5) * contrastMul + 0.5

      const hiMask = clampUnit((luma - 0.4) / 0.6)
      const shMask = 1 - clampUnit((luma - 0.08) / 0.34)
      const hiEff = Math.sign(highlights) * Math.abs(highlights) ** 0.72
      const shEff = Math.sign(shadows) * Math.abs(shadows) ** 1.7
      if (hiEff >= 0) {
        r += hiEff * hiMask * (1 - r) * 2.0
        g += hiEff * hiMask * (1 - g) * 2.0
        b += hiEff * hiMask * (1 - b) * 2.0
      } else {
        r += hiEff * hiMask * r * 1.1
        g += hiEff * hiMask * g * 1.1
        b += hiEff * hiMask * b * 1.1
      }
      if (shEff >= 0) {
        r += shEff * shMask * (1 - r) * 0.28
        g += shEff * shMask * (1 - g) * 0.28
        b += shEff * shMask * (1 - b) * 0.28
      } else {
        r += shEff * shMask * r * 0.5
        g += shEff * shMask * g * 0.5
        b += shEff * shMask * b * 0.5
      }

      r += temperature * 0.09
      b -= temperature * 0.09
      g += tint * 0.08
      r -= tint * 0.03
      b -= tint * 0.03

      data[i] = Math.round(clampUnit(r) * 255)
      data[i + 1] = Math.round(clampUnit(g) * 255)
      data[i + 2] = Math.round(clampUnit(b) * 255)
    }
    ctx.putImageData(imageData, 0, 0)
  }

  if (sharpen > 0.001) {
    applySharpenToCanvas(canvas, ctx, sharpen)
  }

  if (bloom > 0.001) {
    applyBloomToCanvas(canvas, ctx, bloom)
  }

  if (vignette > 0.001 || grain > 0.0001) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data
    const width = canvas.width
    const height = canvas.height
    const safeVignette = Math.max(0, Math.min(1, vignette))
    const safeGrain = Math.max(0, Math.min(0.3, grain))
    const centerX = width * 0.5
    const centerY = height * 0.5
    const maxDist = Math.max(1e-6, Math.sqrt(centerX * centerX + centerY * centerY))

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4
        let rf = data[i] / 255
        let gf = data[i + 1] / 255
        let bf = data[i + 2] / 255

        if (safeVignette > 0.001) {
          const dx = x - centerX
          const dy = y - centerY
          const dist = Math.sqrt(dx * dx + dy * dy) / maxDist
          const ramp = Math.max(0, Math.min(1, (dist - 0.25) / 0.75))
          const vig = ramp * ramp * (3 - 2 * ramp) * safeVignette
          const mul = 1 - vig
          rf *= mul
          gf *= mul
          bf *= mul
        }

        if (safeGrain > 0.0001) {
          const seed = Math.sin((x + 1) * 12.9898 + (y + 1) * 78.233) * 43758.5453
          const noise = (seed - Math.floor(seed) - 0.5) * safeGrain
          rf += noise
          gf += noise
          bf += noise
        }

        data[i] = Math.round(clampUnit(rf) * 255)
        data[i + 1] = Math.round(clampUnit(gf) * 255)
        data[i + 2] = Math.round(clampUnit(bf) * 255)
      }
    }
    ctx.putImageData(imageData, 0, 0)
  }

  if (lutMode !== 'none') {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255
      const g = data[i + 1] / 255
      const b = data[i + 2] / 255
      const next = applyLutToRgb(r, g, b, lutMode)
      data[i] = Math.round(next.r * 255)
      data[i + 1] = Math.round(next.g * 255)
      data[i + 2] = Math.round(next.b * 255)
    }
    ctx.putImageData(imageData, 0, 0)
  }
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
        <span className={`toolbar-dropdown-caret ${isOpen ? 'is-open' : ''}`}>v</span>
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
  const gpsPhotoInputRef = useRef(null)
  const currentUrlRef = useRef(null)
  const loadedImageRef = useRef(null)
  const loadedMetaRef = useRef(null)
  const gpsMapContainerRef = useRef(null)
  const gpsMapRef = useRef(null)
  const gpsMapMarkerRef = useRef(null)
  const maskSurfaceRef = useRef(null)
  const maskPointerRef = useRef(null)
  const viewerMaskDragRef = useRef(null)
  const raycasterRef = useRef(new THREE.Raycaster())
  const ndcPointerRef = useRef(new THREE.Vector2())

  const rendererRef = useRef(null)
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const meshRef = useRef(null)
  const frameRef = useRef(null)
  const composerRef = useRef(null)
  const adjustmentPassRef = useRef(null)
  const maxTextureSizeRef = useRef(4096)
  const activeProjectionRef = useRef('spherical')
  const lockVerticalRef = useRef(true)
  const dbRef = useRef(null)
  const rootDirHandleRef = useRef(null)
  const rootDirHandlesRef = useRef([])
  const contextMenuRef = useRef(null)
  const localityCacheRef = useRef(new Map())
  const scanWorkerRef = useRef(null)
  const scanProgressRef = useRef({ added: 0, duplicates: 0, tooLarge: 0, checked: 0 })
  const scanPromiseResolveRef = useRef(null)
  const scanCancelledRef = useRef(false)
  const unknownRootFastRepairRef = useRef(new Map())
  const transientHistoryFilesRef = useRef(new Map())
  const dragDepthRef = useRef(0)
  const backupDragDepthRef = useRef(0)
  const homeScrollTopRef = useRef(0)
  const shouldRestoreHomeScrollRef = useRef(false)
  const pendingGpsOverrideActionRef = useRef(null)

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
  const [isScanInProgress, setIsScanInProgress] = useState(false)
  const [showTelemetry, setShowTelemetry] = useState(true)
  const [showLocationPanel, setShowLocationPanel] = useState(true)
  const [showGpsMapOverlay, setShowGpsMapOverlay] = useState(true)
  const [isEditMode, setIsEditMode] = useState(false)
  const [isExportPanelOpen, setIsExportPanelOpen] = useState(false)
  const [exportMode, setExportMode] = useState('panorama')
  const [exportAspect, setExportAspect] = useState('16:9')
  const [exportFrameScale, setExportFrameScale] = useState(70)
  const [exportFrameRect, setExportFrameRect] = useState(null)
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false)
  const [editedGpsCoords, setEditedGpsCoords] = useState(null)
  const [hasGpsOverride, setHasGpsOverride] = useState(false)
  const [latInput, setLatInput] = useState('')
  const [lonInput, setLonInput] = useState('')
  const [isGpsPhotoDragging, setIsGpsPhotoDragging] = useState(false)
  const [isMaskEditorOpen, setIsMaskEditorOpen] = useState(false)
  const [pixelateMasks, setPixelateMasks] = useState([])
  const [maskEffectMode, setMaskEffectMode] = useState('blur')
  const [maskEffectStrength, setMaskEffectStrength] = useState(42)
  const [adjustments, setAdjustments] = useState({ ...DEFAULT_ADJUSTMENTS })
  const [lutMode, setLutMode] = useState('none')
  const [adjustmentPreset, setAdjustmentPreset] = useState('custom')
  const [isAdjustmentsPanelOpen, setIsAdjustmentsPanelOpen] = useState(false)
  const [maskDraft, setMaskDraft] = useState(null)
  const [isMaskDrawMode, setIsMaskDrawMode] = useState(false)
  const [viewerMaskDraft, setViewerMaskDraft] = useState(null)
  const [maskPreviewTick, setMaskPreviewTick] = useState(0)
  const [isGpsOverrideConfirmOpen, setIsGpsOverrideConfirmOpen] = useState(false)
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
  const [panelContentMode, setPanelContentMode] = useState('panoramas')
  const [collapsedFolderNodes, setCollapsedFolderNodes] = useState({})
  const [homeFolderFilter, setHomeFolderFilter] = useState(null)
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
  const [connectedRootCount, setConnectedRootCount] = useState(0)
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
    folderTarget: null,
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
  const debugOpenHistory = (...args) => {
    try {
      console.log('[open-history]', ...args)
    } catch {
      // ignore logging failures
    }
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
  const maskEffectOptions = useMemo(
    () => [
      { value: 'blur', label: t('strings.maskEffectBlur') },
      { value: 'pixelate', label: t('strings.maskEffectPixelate') },
    ],
    [language],
  )
  const exportModeOptions = useMemo(
    () => [
      { value: 'panorama', label: t('strings.exportModePanorama') },
      { value: 'photo', label: t('strings.exportModePhoto') },
    ],
    [language],
  )
  const exportAspectOptions = useMemo(
    () => Object.keys(EXPORT_ASPECT_VALUES).map((key) => ({ value: key, label: key })),
    [],
  )
  const adjustmentPresetOptions = useMemo(
    () => [
      { value: 'custom', label: t('strings.presetCustom') },
      { value: 'natural', label: t('strings.presetNatural') },
      { value: 'bw', label: t('strings.presetBw') },
      { value: 'punchy', label: t('strings.presetPunchy') },
      { value: 'warm', label: t('strings.presetWarm') },
      { value: 'cool', label: t('strings.presetCool') },
    ],
    [language],
  )
  const lutOptions = useMemo(
    () => [
      { value: 'none', label: t('strings.lutNone') },
      { value: 'cinematic', label: t('strings.lutCinematic') },
      { value: 'teal_orange', label: t('strings.lutTealOrange') },
      { value: 'vintage', label: t('strings.lutVintage') },
    ],
    [language],
  )
  const hasActiveAdjustments = useMemo(() => {
    return (
      Math.abs((adjustments.exposure ?? 0) - DEFAULT_ADJUSTMENTS.exposure) > 1e-4 ||
      Math.abs((adjustments.contrast ?? 0) - DEFAULT_ADJUSTMENTS.contrast) > 1e-4 ||
      Math.abs((adjustments.saturation ?? 1) - DEFAULT_ADJUSTMENTS.saturation) > 1e-4 ||
      Math.abs((adjustments.temperature ?? 0) - DEFAULT_ADJUSTMENTS.temperature) > 1e-4 ||
      Math.abs((adjustments.tint ?? 0) - DEFAULT_ADJUSTMENTS.tint) > 1e-4 ||
      Math.abs((adjustments.sharpen ?? 0) - DEFAULT_ADJUSTMENTS.sharpen) > 1e-4 ||
      Math.abs((adjustments.highlights ?? 0) - DEFAULT_ADJUSTMENTS.highlights) > 1e-4 ||
      Math.abs((adjustments.shadows ?? 0) - DEFAULT_ADJUSTMENTS.shadows) > 1e-4 ||
      Math.abs((adjustments.bloom ?? 0) - DEFAULT_ADJUSTMENTS.bloom) > 1e-4 ||
      Math.abs((adjustments.vignette ?? 0) - DEFAULT_ADJUSTMENTS.vignette) > 1e-4 ||
      Math.abs((adjustments.grain ?? 0) - DEFAULT_ADJUSTMENTS.grain) > 1e-4 ||
      lutMode !== 'none'
    )
  }, [adjustments, lutMode])
  const setSingleAdjustment = (key, rawValue) => {
    const fallback = DEFAULT_ADJUSTMENTS[key] ?? 0
    const value = toFiniteOr(rawValue, fallback)
    setAdjustments((prev) => ({ ...prev, [key]: value }))
    if (adjustmentPreset !== 'custom') setAdjustmentPreset('custom')
  }
  const resetSingleAdjustment = (key) => {
    setAdjustments((prev) => ({ ...prev, [key]: DEFAULT_ADJUSTMENTS[key] ?? 0 }))
    if (adjustmentPreset !== 'custom') setAdjustmentPreset('custom')
  }
  const applyAdjustmentPreset = (presetId) => {
    const next = ADJUSTMENT_PRESETS[presetId]
    setAdjustmentPreset(presetId)
    if (!next) {
      setLutMode('none')
      return
    }
    setAdjustments({
      exposure: toFiniteOr(next.exposure, DEFAULT_ADJUSTMENTS.exposure),
      contrast: toFiniteOr(next.contrast, DEFAULT_ADJUSTMENTS.contrast),
      saturation: toFiniteOr(next.saturation, DEFAULT_ADJUSTMENTS.saturation),
      temperature: toFiniteOr(next.temperature, DEFAULT_ADJUSTMENTS.temperature),
      tint: toFiniteOr(next.tint, DEFAULT_ADJUSTMENTS.tint),
      highlights: toFiniteOr(next.highlights, DEFAULT_ADJUSTMENTS.highlights),
      shadows: toFiniteOr(next.shadows, DEFAULT_ADJUSTMENTS.shadows),
      sharpen: toFiniteOr(next.sharpen, DEFAULT_ADJUSTMENTS.sharpen),
      bloom: toFiniteOr(next.bloom, DEFAULT_ADJUSTMENTS.bloom),
      vignette: toFiniteOr(next.vignette, DEFAULT_ADJUSTMENTS.vignette),
      grain: toFiniteOr(next.grain, DEFAULT_ADJUSTMENTS.grain),
    })
    const presetLut = typeof next.lut === 'string' ? next.lut : 'none'
    setLutMode(LUT_MODE_VALUES[presetLut] == null ? 'none' : presetLut)
  }

  useEffect(() => {
    // Diagnostic marker to verify the newest bundle is loaded (helps with PWA cache issues).
    console.log('[open-history] build', DEBUG_BUILD_TAG)
    if (!folderInputRef.current) return
    folderInputRef.current.setAttribute('webkitdirectory', '')
    folderInputRef.current.setAttribute('directory', '')
  }, [])

  const createScanWorker = () => new Worker(new URL('./workers/libraryScan.worker.js', import.meta.url), { type: 'module' })

  const restartScanWorker = () => {
    if (scanWorkerRef.current) {
      scanWorkerRef.current.terminate()
      scanWorkerRef.current = null
    }
    try {
      scanWorkerRef.current = createScanWorker()
    } catch {
      scanWorkerRef.current = null
    }
  }

  useEffect(() => {
    restartScanWorker()
    return () => {
      if (scanWorkerRef.current) {
        scanWorkerRef.current.terminate()
        scanWorkerRef.current = null
      }
    }
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
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
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

    const composer = new EffectComposer(renderer)
    composer.setSize(initialSize.width, initialSize.height)
    const renderPass = new RenderPass(scene, camera)
    const adjustmentPass = new ShaderPass(PANORAMA_ADJUST_SHADER)
    const outputPass = new OutputPass()
    adjustmentPass.uniforms.texelSize.value.set(1 / initialSize.width, 1 / initialSize.height)
    composer.addPass(renderPass)
    composer.addPass(adjustmentPass)
    composer.addPass(outputPass)

    rendererRef.current = renderer
    composerRef.current = composer
    adjustmentPassRef.current = adjustmentPass
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
      if (composerRef.current) composerRef.current.setSize(width, height)
      if (adjustmentPassRef.current) {
        adjustmentPassRef.current.uniforms.texelSize.value.set(1 / width, 1 / height)
      }
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
      if (composerRef.current) composerRef.current.render()
      else renderer.render(scene, camera)
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
      composerRef.current = null
      adjustmentPassRef.current = null
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

        const [savedSettings, savedPanoramas, savedRootHandles, savedRootHandle] = await Promise.all([
          dbGet(db, SETTINGS_STORE, 'app'),
          dbGetAll(db, PANORAMAS_STORE),
          dbGet(db, SETTINGS_STORE, ROOT_HANDLES_KEY),
          dbGet(db, SETTINGS_STORE, ROOT_HANDLE_KEY),
        ])
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
          if (s.panelContentMode === 'folders' || s.panelContentMode === 'panoramas') {
            setPanelContentMode(s.panelContentMode)
          }
          if (typeof s.exportAspect === 'string' && EXPORT_ASPECT_VALUES[s.exportAspect]) {
            setExportAspect(s.exportAspect)
          }
          if (Number.isFinite(Number(s.exportFrameScale))) {
            const scale = Math.max(30, Math.min(100, Number(s.exportFrameScale)))
            setExportFrameScale(Math.round(scale))
          }
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

        const handlesFromNewKey = Array.isArray(savedRootHandles?.value) ? savedRootHandles.value.filter(Boolean) : []
        const handlesFromLegacyKey = savedRootHandle?.value ? [savedRootHandle.value] : []
        const initialHandles = handlesFromNewKey.length > 0 ? handlesFromNewKey : handlesFromLegacyKey
        rootDirHandlesRef.current = initialHandles
        rootDirHandleRef.current = initialHandles[0] || null
        setConnectedRootCount(initialHandles.length)
        if (handlesFromNewKey.length === 0 && initialHandles.length > 0) {
          await dbPut(db, SETTINGS_STORE, { key: ROOT_HANDLES_KEY, value: initialHandles }).catch(() => {})
        }
        if (initialHandles.length > 0) {
          let hasAccess = false
          for (const handle of initialHandles) {
            try {
              // eslint-disable-next-line no-await-in-loop
              const perm = await handle.queryPermission({ mode: 'read' })
              if (perm === 'granted') {
                hasAccess = true
                break
              }
            } catch {
              // ignore
            }
          }
          setHasFolderAccess(hasAccess)
        } else {
          setHasFolderAccess(false)
        }

        const unknownItems = sorted.filter((item) => !item.device || item.device === 'Nieznane urzadzenie')
        if (unknownItems.length > 0) {
          const accessibleRoots = await getAccessibleRootHandles(false)
          for (const item of unknownItems) {
            if (cancelled || !item.relativePath || accessibleRoots.length === 0) continue
            let file = null
            for (const rootHandle of accessibleRoots) {
              // eslint-disable-next-line no-await-in-loop
              file = await getFileFromRelativePath(rootHandle, item.relativePath)
              if (file) break
            }
            if (!file) continue
            try {
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
      panelContentMode,
      exportAspect,
      exportFrameScale,
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
    panelContentMode,
    exportAspect,
    exportFrameScale,
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
    return Math.abs(ratio - 2) <= PANORAMA_RATIO_TOLERANCE ? 'spherical' : 'cylindrical'
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

  useEffect(() => {
    if (!isEditMode) {
      setIsAdjustmentsPanelOpen(false)
      setIsExportPanelOpen(false)
    }
  }, [isEditMode])

  useEffect(() => {
    if (!hasActivePanorama) {
      setIsExportPanelOpen(false)
    }
  }, [hasActivePanorama])

  const getExportAspectValue = (aspectKey) => EXPORT_ASPECT_VALUES[aspectKey] || EXPORT_ASPECT_VALUES['16:9']

  const computeExportFrameRect = (boundsWidth, boundsHeight, aspectKey, scalePercent) => {
    const safeW = Math.max(1, boundsWidth)
    const safeH = Math.max(1, boundsHeight)
    const aspect = getExportAspectValue(aspectKey)
    const scale = Math.min(100, Math.max(20, Number(scalePercent) || 70)) / 100
    const maxW = safeW * scale
    const maxH = safeH * scale
    let width = maxW
    let height = width / aspect
    if (height > maxH) {
      height = maxH
      width = height * aspect
    }
    width = Math.max(24, Math.min(width, safeW))
    height = Math.max(24, Math.min(height, safeH))
    const centerX = safeW / 2
    const centerY = safeH / 2
    const x = Math.min(safeW - width, Math.max(0, centerX - width / 2))
    const y = Math.min(safeH - height, Math.max(0, centerY - height / 2))
    return { x, y, width, height }
  }

  useEffect(() => {
    if (!hasActivePanorama || !isEditMode || !isExportPanelOpen || exportMode !== 'photo') {
      setExportFrameRect(null)
      return
    }
    const updateFrame = () => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      setExportFrameRect(computeExportFrameRect(rect.width, rect.height, exportAspect, exportFrameScale))
    }
    updateFrame()
    window.addEventListener('resize', updateFrame)
    return () => window.removeEventListener('resize', updateFrame)
  }, [hasActivePanorama, isEditMode, isExportPanelOpen, exportMode, exportAspect, exportFrameScale])

  useEffect(() => {
    const pass = adjustmentPassRef.current
    if (!pass) return
    pass.uniforms.exposure.value = toFiniteOr(adjustments.exposure, 0)
    pass.uniforms.contrast.value = toFiniteOr(adjustments.contrast, 0)
    pass.uniforms.saturation.value = toFiniteOr(adjustments.saturation, 1)
    pass.uniforms.temperature.value = toFiniteOr(adjustments.temperature, 0)
    pass.uniforms.tint.value = toFiniteOr(adjustments.tint, 0)
    pass.uniforms.highlights.value = toFiniteOr(adjustments.highlights, 0)
    pass.uniforms.shadows.value = toFiniteOr(adjustments.shadows, 0)
    pass.uniforms.sharpen.value = toFiniteOr(adjustments.sharpen, 0)
    pass.uniforms.bloom.value = toFiniteOr(adjustments.bloom, 0)
    pass.uniforms.vignette.value = toFiniteOr(adjustments.vignette, 0)
    pass.uniforms.grain.value = toFiniteOr(adjustments.grain, 0)
    pass.uniforms.lutMode.value = LUT_MODE_VALUES[lutMode] ?? LUT_MODE_VALUES.none
  }, [adjustments, lutMode])

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
    const candidates = []
    for (let i = 0; i < parts.length; i += 1) {
      const candidate = parts.slice(i)
      if (candidate.length > 0) candidates.push(candidate)
    }

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
    const candidates = []
    for (let i = 0; i < parts.length - 1; i += 1) {
      const candidate = parts.slice(i)
      if (candidate.length > 0) candidates.push(candidate)
    }

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

  const findFilesByNameInTree = async (rootHandle, targetName, maxMatches = 24) => {
    if (!rootHandle || !targetName) return []
    const targetRaw = String(targetName || '').trim()
    const targetLower = targetRaw.toLowerCase()
    const targetStem = targetLower.replace(/\.[^.]+$/, '')
    const queue = [{ dir: rootHandle, pathPrefix: '' }]
    let visited = 0
    const visitLimit = 300000
    const exactMatches = []
    const stemMatches = []

    while (queue.length > 0 && visited < visitLimit) {
      const { dir, pathPrefix } = queue.shift()
      // eslint-disable-next-line no-restricted-syntax
      for await (const [name, handle] of dir.entries()) {
        visited += 1
        if (visited >= visitLimit) break
        if (handle.kind === 'directory') {
          queue.push({ dir: handle, pathPrefix: `${pathPrefix}${name}/` })
        } else if (handle.kind === 'file') {
          const entryNameLower = String(name || '').toLowerCase()
          const isExactName = entryNameLower === targetLower
          const isStemMatch = !isExactName && entryNameLower.replace(/\.[^.]+$/, '') === targetStem
          if (!isExactName && !isStemMatch) continue
          const candidate = { file: await handle.getFile(), relativePath: `${pathPrefix}${name}` }
          if (isExactName) {
            exactMatches.push(candidate)
          } else {
            stemMatches.push(candidate)
          }
          if (exactMatches.length >= maxMatches) return exactMatches
          if (exactMatches.length + stemMatches.length >= maxMatches) {
            return [...exactMatches, ...stemMatches].slice(0, maxMatches)
          }
        }
      }
    }
    return [...exactMatches, ...stemMatches].slice(0, maxMatches)
  }

  const buildNameTokens = (name) => {
    const raw = String(name || '').trim().toLowerCase()
    if (!raw) return []
    const noExt = raw.replace(/\.[^.]+$/, '')
    const tokens = new Set([raw, noExt])
    const camToken = noExt.match(/cam_\d{14}_\d{4}/i)?.[0]?.toLowerCase()
    if (camToken) tokens.add(camToken)
    const dateToken = noExt.match(/\d{14}/)?.[0]
    if (dateToken) tokens.add(dateToken.toLowerCase())
    return Array.from(tokens).filter(Boolean)
  }

  const findFilesByLooseNameInTree = async (rootHandle, targetName, maxMatches = 24) => {
    if (!rootHandle || !targetName) return []
    const tokens = buildNameTokens(targetName)
    if (tokens.length === 0) return []
    const queue = [{ dir: rootHandle, pathPrefix: '' }]
    let visited = 0
    const visitLimit = 300000
    const matches = []

    while (queue.length > 0 && visited < visitLimit) {
      const { dir, pathPrefix } = queue.shift()
      // eslint-disable-next-line no-restricted-syntax
      for await (const [name, handle] of dir.entries()) {
        visited += 1
        if (visited >= visitLimit) break
        if (handle.kind === 'directory') {
          queue.push({ dir: handle, pathPrefix: `${pathPrefix}${name}/` })
        } else if (handle.kind === 'file') {
          const entryNameLower = String(name || '').toLowerCase()
          const entryNoExt = entryNameLower.replace(/\.[^.]+$/, '')
          const matched = tokens.some((token) => entryNameLower.includes(token) || entryNoExt.includes(token))
          if (!matched) continue
          matches.push({ file: await handle.getFile(), relativePath: `${pathPrefix}${name}` })
          if (matches.length >= maxMatches) return matches
        }
      }
    }
    return matches
  }

  const findFilesByNameAcrossRoots = async (rootHandles, targetName, maxMatches = 48) => {
    const roots = Array.isArray(rootHandles) ? rootHandles.filter(Boolean) : []
    if (roots.length === 0 || !targetName) return []
    const merged = []
    for (const rootHandle of roots) {
      const remaining = Math.max(0, maxMatches - merged.length)
      if (remaining <= 0) break
      // eslint-disable-next-line no-await-in-loop
      const found = await findFilesByNameInTree(rootHandle, targetName, remaining)
      if (found.length > 0) {
        merged.push(...found.map((entry) => ({ ...entry, rootName: rootHandle?.name || '', rootHandle })))
      }
    }
    return merged.slice(0, maxMatches)
  }

  const findFilesByLooseNameAcrossRoots = async (rootHandles, targetName, maxMatches = 48) => {
    const roots = Array.isArray(rootHandles) ? rootHandles.filter(Boolean) : []
    if (roots.length === 0 || !targetName) return []
    const merged = []
    for (const rootHandle of roots) {
      const remaining = Math.max(0, maxMatches - merged.length)
      if (remaining <= 0) break
      // eslint-disable-next-line no-await-in-loop
      const found = await findFilesByLooseNameInTree(rootHandle, targetName, remaining)
      if (found.length > 0) merged.push(...found.map((entry) => ({ ...entry, rootName: rootHandle?.name || '', rootHandle })))
    }
    return merged.slice(0, maxMatches)
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

  const saveScannedHistoryEntry = async (candidate) => {
    const db = dbRef.current
    if (!db || !candidate) return false

    const existing = await dbGetByIndex(db, PANORAMAS_STORE, 'fingerprint', candidate.fingerprint).catch(() => null)
    if (existing) return false

    const createdAt = Number(candidate.createdAt) || Date.now()
    const entry = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: candidate.name,
      width: candidate.width,
      height: candidate.height,
      projection: candidate.projection,
      fingerprint: candidate.fingerprint,
      createdAt,
      dateKey: getDateGroupingKey(createdAt),
      device: candidate.device || 'Unknown device',
      relativePath: normalizeRelativePath(candidate.relativePath || ''),
      rootName: candidate.rootName ? String(candidate.rootName) : '',
      thumbDataUrl: candidate.thumbDataUrl || '',
    }

    await dbPut(db, PANORAMAS_STORE, entry)
    setHistoryItems((prev) => [entry, ...prev])
    return true
  }

  const scanFilesOnMainThread = async (fileItems) => {
    scanCancelledRef.current = false
    setIsScanInProgress(true)
    let added = 0
    let duplicates = 0
    let tooLarge = 0
    let checked = 0
    for (let i = 0; i < fileItems.length; i += 1) {
      if (scanCancelledRef.current) break
      const item = fileItems[i]
      try {
        const result = await ingestFileToHistory(item.file, {
          relativePath: item.relativePath || '',
          rootName: item.rootName || '',
        })
        if (result === 'added') added += 1
        if (result === 'duplicate') duplicates += 1
        if (result === 'too-large') tooLarge += 1
      } catch {
        // skip unreadable files
      }
      checked += 1
      scanProgressRef.current = { added, duplicates, tooLarge, checked }
      if ((i + 1) % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    }
    setIsScanInProgress(false)
    return { added, duplicates, tooLarge, checked, canceled: scanCancelledRef.current }
  }

  const scanFilesWithWorker = async (fileItems, progressPrefix = 'Scanning folder') => {
    if (!Array.isArray(fileItems) || fileItems.length === 0) {
      return { added: 0, duplicates: 0, tooLarge: 0, checked: 0 }
    }

    const worker = scanWorkerRef.current
    if (!worker) {
      return scanFilesOnMainThread(fileItems)
    }

    const db = dbRef.current
    if (!db) {
      return { added: 0, duplicates: 0, tooLarge: 0, checked: 0 }
    }

    scanCancelledRef.current = false
    setIsScanInProgress(true)
    let added = 0
    let duplicates = 0
    let tooLarge = 0
    let checked = 0
    scanProgressRef.current = { added: 0, duplicates: 0, tooLarge: 0, checked: 0 }
    const knownFingerprints = new Set()
    const total = fileItems.length

    return new Promise((resolve, reject) => {
      let finished = false
      let queue = Promise.resolve()
      scanPromiseResolveRef.current = (payload) => {
        if (finished) return
        finished = true
        cleanup()
        setIsScanInProgress(false)
        resolve(payload)
      }

      const cleanup = () => {
        scanPromiseResolveRef.current = null
        worker.removeEventListener('message', onMessage)
        worker.removeEventListener('error', onError)
      }

      const onMessage = (event) => {
        const msg = event.data || {}
        if (scanCancelledRef.current) return
        if (msg.type === 'file-processed') {
          const result = msg.result || {}
          checked += 1

          queue = queue.then(async () => {
            if (scanCancelledRef.current) return
            if (result.kind === 'too-large') {
              tooLarge += 1
            } else if (result.kind === 'candidate' && result.data?.fingerprint) {
              const fingerprint = result.data.fingerprint
              if (knownFingerprints.has(fingerprint)) {
                duplicates += 1
              } else {
                knownFingerprints.add(fingerprint)
                const exists = await dbGetByIndex(db, PANORAMAS_STORE, 'fingerprint', fingerprint).catch(() => null)
                if (exists) {
                  duplicates += 1
                } else {
                  const saved = await saveScannedHistoryEntry(result.data)
                  if (saved) added += 1
                  else duplicates += 1
                }
              }
            }

            scanProgressRef.current = { added, duplicates, tooLarge, checked }
            setStatus(
              `${progressPrefix}... ${checked}/${total} | added: ${added}, duplicates: ${duplicates}, >100MB: ${tooLarge}`,
            )
          })
          return
        }

        if (msg.type === 'done') {
          queue
            .then(() => {
              if (finished) return
              finished = true
              cleanup()
              setIsScanInProgress(false)
              resolve({ added, duplicates, tooLarge, checked })
            })
            .catch((err) => {
              if (finished) return
              finished = true
              cleanup()
              setIsScanInProgress(false)
              reject(err)
            })
        }
      }

      const onError = (error) => {
        if (finished) return
        finished = true
        cleanup()
        setIsScanInProgress(false)
        reject(error)
      }

      worker.addEventListener('message', onMessage)
      worker.addEventListener('error', onError)
      worker.postMessage({
        type: 'scan',
        files: fileItems,
        options: {
          maxSizeBytes: MAX_LIBRARY_FILE_SIZE_BYTES,
          minPanoramaRatio: MIN_PANORAMA_RATIO,
          projectionMode,
        },
      })
    })
  }

  const cancelScan = () => {
    if (!isScanInProgress) return
    scanCancelledRef.current = true
    const snapshot = scanProgressRef.current
    restartScanWorker()
    if (scanPromiseResolveRef.current) {
      scanPromiseResolveRef.current({
        added: snapshot.added || 0,
        duplicates: snapshot.duplicates || 0,
        tooLarge: snapshot.tooLarge || 0,
        checked: snapshot.checked || 0,
        canceled: true,
      })
    } else {
      setIsScanInProgress(false)
    }
    setStatus(t('strings.scanCanceled'))
  }

  const saveHistoryEntry = async ({
    file,
    image,
    width,
    height,
    projection,
    metadata,
    fingerprint,
    relativePath,
    rootName = '',
  }) => {
    const db = dbRef.current
    if (!db) return { added: false, reason: 'no-db' }

    const existing = await dbGetByIndex(db, PANORAMAS_STORE, 'fingerprint', fingerprint).catch(() => null)
    if (existing) {
      return { added: false, reason: 'duplicate', existing }
    }

    const createdAt = extractCreatedAt(file, metadata)
    const device = extractDeviceLabel(metadata)
    const normalizedRelativePath = normalizeRelativePath(relativePath)
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
      relativePath: normalizedRelativePath,
      rootName: rootName ? String(rootName) : '',
      thumbDataUrl: buildThumbnailDataUrl(image),
    }

    await dbPut(db, PANORAMAS_STORE, entry)
    if (!normalizedRelativePath && file) {
      const cache = transientHistoryFilesRef.current
      cache.set(entry.id, file)
      while (cache.size > 64) {
        const oldestKey = cache.keys().next().value
        if (!oldestKey) break
        cache.delete(oldestKey)
      }
    }
    setHistoryItems((prev) => [entry, ...prev])
    return { added: true, entry }
  }

  const isPanoramaCandidate = (width, height) => {
    if (!width || !height) return false
    const ratio = width / height
    return ratio >= MIN_PANORAMA_RATIO
  }

  const isNearSphericalRatio = (width, height) => {
    if (!width || !height) return false
    const ratio = width / height
    return Math.abs(ratio - 2) <= PANORAMA_RATIO_TOLERANCE
  }

  const hasPanoramaMetadata = (metadata) => {
    if (!metadata || typeof metadata !== 'object') return false
    const projectionTagRaw = metadata?.ProjectionType || metadata?.projectionType || metadata?.GPanoProjectionType
    const projectionTag = String(projectionTagRaw || '').toLowerCase()
    if (projectionTag.includes('equirectangular') || projectionTag.includes('spherical')) {
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
    if (hasPanoramaMetadata(metadata)) return true
    if (projectionMode === 'spherical') return isNearSphericalRatio(width, height)
    if (projectionMode === 'cylindrical') return isPanoramaCandidate(width, height)
    return isNearSphericalRatio(width, height) || isPanoramaCandidate(width, height)
  }

  const ingestFileToHistory = async (file, options = {}) => {
    const { relativePath = '', rootName = '' } = options
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
      rootName,
    })
    URL.revokeObjectURL(tmpUrl)
    return saveResult.added ? 'added' : 'duplicate'
  }

  const processPanoramaFile = async (file, options = {}) => {
    const { persistHistory = true, forcedProjection = null, loadingText = 'Loading panorama...' } = options

    if (!file || !file.type.startsWith('image/')) {
      debugOpenHistory('processPanoramaFile: rejected non-image', {
        name: file?.name,
        type: file?.type,
      })
      setStatus('This is not an image file.')
      return false
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
        setEditedGpsCoords(sanitizeGpsCoords(extractGpsCoords(parsed)))
        setHasGpsOverride(false)
      } catch {
        setExifError('Could not read EXIF.')
        setEditedGpsCoords(null)
        setHasGpsOverride(false)
      } finally {
        setIsExifLoading(false)
      }

      const resolvedProjection = forcedProjection || getResolvedProjection(width, height, parsed)
      setActiveCapturedAt(extractCreatedAt(file, parsed))
      debugOpenHistory('processPanoramaFile: parsed', {
        name: file.name,
        width,
        height,
        ratio: Number((width / height).toFixed(4)),
        resolvedProjection,
        forcedProjection,
        hasMetadata: Boolean(parsed),
      })

      if (!isPanoramaCandidateWithMetadata(width, height, parsed)) {
        URL.revokeObjectURL(tmpUrl)
        debugOpenHistory('processPanoramaFile: rejected panorama candidate', {
          name: file.name,
          width,
          height,
          ratio: Number((width / height).toFixed(4)),
          hasPanoramaMetadata: hasPanoramaMetadata(parsed),
        })
        setStatus(
          `This does not look like a panorama: ${width}x${height} (expected near 2:1 in auto mode, or GPano metadata).`,
        )
        setIsBusy(false)
        return false
      }

      if (resolvedProjection === 'spherical' && Math.abs(ratio - 2) > 0.15) {
        URL.revokeObjectURL(tmpUrl)
        debugOpenHistory('processPanoramaFile: rejected spherical ratio', {
          name: file.name,
          width,
          height,
          ratio: Number(ratio.toFixed(4)),
        })
        setStatus(`Spherical mode requires near 2:1 ratio. Received ${width}x${height}.`)
        setIsBusy(false)
        return false
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
      setIsMaskEditorOpen(false)
      setIsMaskDrawMode(false)
      setPixelateMasks([])
      setMaskDraft(null)

      updateStatusAfterTexture(file.name, width, height, drawWidth, drawHeight, requestedMax, resolvedProjection)
      setHasActivePanorama(true)

      if (persistHistory) {
        const fingerprint = await createFileFingerprint(file)
        const relPath = file.webkitRelativePath || ''
        const inferredRootName = splitRelativePath(relPath)[0] || ''
        const saveResult = await saveHistoryEntry({
          file,
          image,
          width,
          height,
          projection: resolvedProjection,
          metadata: parsed,
          fingerprint,
          relativePath: relPath,
          rootName: inferredRootName,
        })
        if (saveResult.reason === 'duplicate') {
          setStatus((prev) => `${prev} (Already in history)`)
        }
      }
      debugOpenHistory('processPanoramaFile: success', {
        name: file.name,
        projection: resolvedProjection,
      })
      return true

    } catch {
      debugOpenHistory('processPanoramaFile: exception', {
        name: file?.name,
      })
      setIsExifLoading(false)
      setStatus('Could not load image.')
      return false
    } finally {
      setIsBusy(false)
    }
  }

  const getConnectedRootHandles = () => {
    const handles = Array.isArray(rootDirHandlesRef.current) ? rootDirHandlesRef.current.filter(Boolean) : []
    if (handles.length > 0) return handles
    if (rootDirHandleRef.current) return [rootDirHandleRef.current]
    return []
  }

  const persistRootHandles = async (handles) => {
    const nextHandles = Array.isArray(handles) ? handles.filter(Boolean) : []
    rootDirHandlesRef.current = nextHandles
    rootDirHandleRef.current = nextHandles[0] || null
    setConnectedRootCount(nextHandles.length)
    const db = dbRef.current
    if (!db) return
    await dbPut(db, SETTINGS_STORE, { key: ROOT_HANDLES_KEY, value: nextHandles }).catch(() => {})
    if (nextHandles[0]) {
      await dbPut(db, SETTINGS_STORE, { key: ROOT_HANDLE_KEY, value: nextHandles[0] }).catch(() => {})
    }
  }

  const addConnectedRootHandle = async (dirHandle) => {
    if (!dirHandle) return { added: false, handles: getConnectedRootHandles() }
    const existing = getConnectedRootHandles()
    for (const handle of existing) {
      if (!handle) continue
      try {
        if (typeof handle.isSameEntry === 'function') {
          // eslint-disable-next-line no-await-in-loop
          const same = await handle.isSameEntry(dirHandle)
          if (same) return { added: false, handles: existing }
        }
      } catch {
        // ignore comparison errors
      }
    }
    const next = [...existing, dirHandle]
    await persistRootHandles(next)
    return { added: true, handles: next }
  }

  const getAccessibleRootHandles = async (requestPermission = true) => {
    const connected = getConnectedRootHandles()
    const accessible = []
    for (const handle of connected) {
      const granted = requestPermission ? await ensureReadPermission(handle) : await handle.queryPermission({ mode: 'read' }).catch(() => 'denied') === 'granted'
      if (granted) accessible.push(handle)
    }
    return accessible
  }

  const handleFile = async (file) => {
    await processPanoramaFile(file, { persistHistory: true, loadingText: 'Loading panorama...' })
  }

  const relinkHistoryItemFromPicker = async (item, startHandle, candidateRoots = []) => {
    if (!canUseOpenFilePicker && !canUseFsApi) return false
    try {
      if (canUseFsApi) {
        const dirPickerOptions = { mode: 'read' }
        if (startHandle) {
          dirPickerOptions.startIn = startHandle
        }
        // @ts-ignore
        const selectedRoot = await window.showDirectoryPicker(dirPickerOptions)
        const granted = await ensureReadPermission(selectedRoot)
        if (!granted) {
          setHasFolderAccess(false)
          setStatus('Folder access was not granted.')
          return false
        }
        const { handles } = await addConnectedRootHandle(selectedRoot)
        setHasFolderAccess(true)
        setStatus(`Folder connected (${handles.length}). Trying to open panorama...`)

        let resolvedPath = normalizeRelativePath(item.relativePath)
        let file = await getFileFromRelativePath(selectedRoot, resolvedPath)
        if (!file) {
          const found = await findFilesByNameAcrossRoots([selectedRoot], item.name, 32)
          if (found.length > 0) {
            file = found[0].file
            resolvedPath = normalizeRelativePath(found[0].relativePath || resolvedPath)
          }
        }
        if (!file) {
          const foundLoose = await findFilesByLooseNameAcrossRoots([selectedRoot], item.name, 32)
          if (foundLoose.length > 0) {
            file = foundLoose[0].file
            resolvedPath = normalizeRelativePath(foundLoose[0].relativePath || resolvedPath)
          }
        }

        if (!file) {
          setStatus(`Connected folder "${selectedRoot?.name || ''}", but file "${item.name}" was not found there.`)
          return false
        }

        const openedWithStoredProjection = await processPanoramaFile(file, {
          persistHistory: false,
          forcedProjection: item.projection,
          loadingText: 'Loading panorama...',
        })
        const opened = openedWithStoredProjection
          || (await processPanoramaFile(file, {
            persistHistory: false,
            forcedProjection: null,
            loadingText: 'Loading panorama...',
          }))
        if (!opened) {
          setStatus(`Could not open "${item.name}" from selected folder.`)
          return false
        }

        const nextItem = {
          ...item,
          name: file.name || item.name,
          relativePath: normalizeRelativePath(resolvedPath || file.name || item.relativePath),
          rootName: selectedRoot?.name || item.rootName || '',
        }
        const db = dbRef.current
        if (db) {
          await dbPut(db, PANORAMAS_STORE, nextItem).catch(() => {})
        }
        setHistoryItems((prev) => prev.map((entry) => (entry.id === item.id ? nextItem : entry)))
        setStatus(`Relinked and opened: ${nextItem.name}`)
        return true
      }

      const pickerOptions = {
        multiple: false,
        types: [
          {
            description: 'Obrazy',
            accept: {
              'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'],
            },
          },
        ],
      }
      if (startHandle) {
        pickerOptions.startIn = startHandle
      }
      // @ts-ignore
      const [pickedHandle] = await window.showOpenFilePicker(pickerOptions)
      const file = await pickedHandle.getFile()
      await processPanoramaFile(file, {
        persistHistory: false,
        forcedProjection: item.projection,
        loadingText: 'Loading panorama...',
      })

      let resolvedRootHandle = null
      let nextRelativePath = normalizeRelativePath(file.name || item.name || '')
      const rootsToTry = Array.isArray(candidateRoots) && candidateRoots.length > 0
        ? candidateRoots.filter(Boolean)
        : startHandle
          ? [startHandle]
          : []
      for (const rootHandle of rootsToTry) {
        // eslint-disable-next-line no-await-in-loop
        const parts = await rootHandle.resolve(pickedHandle).catch(() => null)
        if (Array.isArray(parts) && parts.length > 0) {
          resolvedRootHandle = rootHandle
          nextRelativePath = normalizeRelativePath(parts.join('/'))
          break
        }
      }

      const nextItem = {
        ...item,
        name: file.name || item.name,
        relativePath: normalizeRelativePath(nextRelativePath),
        rootName: resolvedRootHandle?.name || item.rootName || '',
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

  const fastRelinkUnknownRootItemsForRoot = async (rootHandle, options = {}) => {
    if (!rootHandle) return 0
    const rootName = String(rootHandle?.name || '').trim()
    if (!rootName) return 0

    const maxItems = Number.isFinite(options.maxItems) ? Math.max(1, Number(options.maxItems)) : 220
    const maxTrim = Number.isFinite(options.maxTrim) ? Math.max(1, Number(options.maxTrim)) : 5
    const missing = historyItems.filter((entry) => !entry?.rootName && entry?.relativePath).slice(0, maxItems)
    if (missing.length === 0) return 0

    const updates = []
    for (const entry of missing) {
      const originalPath = normalizeRelativePath(entry.relativePath || '')
      if (!originalPath) continue
      let matchedPath = ''
      let matchedFile = null

      // First, try the exact path.
      // eslint-disable-next-line no-await-in-loop
      matchedFile = await getFileFromRelativePath(rootHandle, originalPath)
      if (matchedFile) {
        matchedPath = originalPath
      } else {
        const parts = splitRelativePath(originalPath)
        const trimLimit = Math.min(Math.max(0, parts.length - 1), maxTrim)
        for (let trim = 1; trim <= trimLimit; trim += 1) {
          const candidatePath = parts.slice(trim).join('/')
          if (!candidatePath) continue
          // eslint-disable-next-line no-await-in-loop
          matchedFile = await getFileFromRelativePath(rootHandle, candidatePath)
          if (matchedFile) {
            matchedPath = candidatePath
            break
          }
        }
      }

      if (!matchedPath) continue
      updates.push({
        ...entry,
        name: matchedFile?.name || entry.name,
        relativePath: matchedPath,
        rootName,
      })
    }

    if (updates.length === 0) return 0
    const db = dbRef.current
    if (db) {
      await Promise.all(updates.map((entry) => dbPut(db, PANORAMAS_STORE, entry).catch(() => null)))
    }
    const updateById = new Map(updates.map((entry) => [entry.id, entry]))
    setHistoryItems((prev) => prev.map((entry) => updateById.get(entry.id) || entry))
    debugOpenHistory('openHistoryItem:fast unknown-root relink complete', {
      rootName,
      checked: missing.length,
      repaired: updates.length,
    })
    return updates.length
  }

  const applyAutoRootMappingFromResolvedPath = async (item, resolvedPath, resolvedRootName, resolvedRootHandle = null) => {
    const normalizedResolved = normalizeRelativePath(resolvedPath)
    const normalizedOriginal = normalizeRelativePath(item?.relativePath || '')
    const rootName = String(resolvedRootName || '').trim()
    const originalRootName = String(item?.rootName || '').trim()
    if (!normalizedResolved || !normalizedOriginal || !rootName) return
    if (originalRootName) return

    const oldParts = splitRelativePath(normalizedOriginal)
    const newParts = splitRelativePath(normalizedResolved)
    let mode = ''
    let trimCount = 0
    let droppedPrefix = ''
    let addedPrefix = ''
    if (oldParts.length > newParts.length) {
      const maxTrim = oldParts.length - newParts.length
      for (let t = 1; t <= maxTrim; t += 1) {
        if (oldParts.slice(t).join('/') === normalizedResolved) {
          trimCount = t
          droppedPrefix = oldParts.slice(0, trimCount).join('/')
          if (droppedPrefix) mode = 'trim'
          break
        }
      }
    } else if (newParts.length > oldParts.length) {
      const prefixLen = newParts.length - oldParts.length
      if (newParts.slice(prefixLen).join('/') === normalizedOriginal) {
        addedPrefix = newParts.slice(0, prefixLen).join('/')
        if (addedPrefix) mode = 'prepend'
      }
    }
    if (!mode) return

    const missingEntries = historyItems.filter((entry) => !entry?.rootName && entry?.relativePath).slice(0, 360)
    if (missingEntries.length === 0) return

    const db = dbRef.current
    const dbUpdates = []
    for (const entry of missingEntries) {
      const entryPath = normalizeRelativePath(entry?.relativePath || '')
      if (!entryPath) continue
      let nextPath = ''
      if (mode === 'trim') {
        if (entryPath !== droppedPrefix && !entryPath.startsWith(`${droppedPrefix}/`)) continue
        const entryParts = splitRelativePath(entryPath)
        if (entryParts.length <= trimCount) continue
        nextPath = entryParts.slice(trimCount).join('/')
      } else if (mode === 'prepend') {
        if (entryPath === addedPrefix || entryPath.startsWith(`${addedPrefix}/`)) continue
        nextPath = normalizeRelativePath(`${addedPrefix}/${entryPath}`)
      }
      if (!nextPath || nextPath === entryPath) continue
      if (resolvedRootHandle) {
        // eslint-disable-next-line no-await-in-loop
        const exists = await getFileFromRelativePath(resolvedRootHandle, nextPath)
        if (!exists) continue
      }
      dbUpdates.push({
        ...entry,
        relativePath: nextPath,
        rootName,
      })
    }

    if (dbUpdates.length === 0) return
    if (db) {
      await Promise.all(dbUpdates.map((entry) => dbPut(db, PANORAMAS_STORE, entry).catch(() => null)))
    }
    const updatesById = new Map(dbUpdates.map((entry) => [entry.id, entry]))
    setHistoryItems((prev) => prev.map((entry) => updatesById.get(entry.id) || entry))
    debugOpenHistory('openHistoryItem:auto root mapping applied', {
      mode,
      rootName,
      droppedPrefix,
      trimCount,
      addedPrefix,
      changed: dbUpdates.length,
    })
  }

  const openHistoryItem = async (item) => {
    if (!item) return
    debugOpenHistory('openHistoryItem:start', {
      id: item.id,
      name: item.name,
      relativePath: item.relativePath,
      projection: item.projection,
      hasFingerprint: Boolean(item.fingerprint),
    })

    if (!item?.relativePath) {
      const transientFile = transientHistoryFilesRef.current.get(item.id)
      if (transientFile) {
        const openedWithStoredProjection = await processPanoramaFile(transientFile, {
          persistHistory: false,
          forcedProjection: item.projection || null,
          loadingText: 'Loading panorama...',
        })
        if (openedWithStoredProjection) return
        const openedAuto = await processPanoramaFile(transientFile, {
          persistHistory: false,
          forcedProjection: null,
          loadingText: 'Loading panorama...',
        })
        if (openedAuto) return
      }
    }

    const connectedRoots = getConnectedRootHandles()
    if (connectedRoots.length === 0) {
      debugOpenHistory('openHistoryItem:abort no root folder')
      setStatus('No folder connected. Click "Select folder".')
      return
    }

    const accessibleRootsRaw = await getAccessibleRootHandles(true)
    const preferredRootName = String(item?.rootName || '').trim().toLowerCase()
    const accessibleRoots = [...accessibleRootsRaw].sort((a, b) => {
      const aName = String(a?.name || '').trim().toLowerCase()
      const bName = String(b?.name || '').trim().toLowerCase()
      const aScore = preferredRootName && aName === preferredRootName ? 0 : 1
      const bScore = preferredRootName && bName === preferredRootName ? 0 : 1
      if (aScore !== bScore) return aScore - bScore
      return 0
    })
    setHasFolderAccess(accessibleRoots.length > 0)
    debugOpenHistory('openHistoryItem:connected roots', {
      connected: connectedRoots.length,
      accessible: accessibleRoots.length,
      rootNames: accessibleRoots.map((h) => h?.name || '(unknown)'),
    })
    if (accessibleRoots.length === 0) {
      setStatus('No folder permission. Use "Refresh access".')
      return
    }
    let pickerRoot = accessibleRoots[0]
    if (item?.relativePath) {
      for (const rootHandle of accessibleRoots) {
        // eslint-disable-next-line no-await-in-loop
        const dir = await getDirectoryFromRelativePath(rootHandle, item.relativePath)
        if (dir) {
          pickerRoot = dir
          break
        }
      }
    }

    const persistResolvedPath = async (resolvedPath, nameOverride = null, rootNameOverride = null, rootHandleOverride = null) => {
      const normalized = normalizeRelativePath(resolvedPath)
      if (!normalized) return
      const resolvedRoot = String(rootNameOverride || item.rootName || '').trim()
      const nextItem = {
        ...item,
        relativePath: normalized,
        name: nameOverride || item.name,
        rootName: resolvedRoot,
      }
      const db = dbRef.current
      if (db) {
        await dbPut(db, PANORAMAS_STORE, nextItem).catch(() => {})
      }
      setHistoryItems((prev) => prev.map((entry) => (entry.id === item.id ? nextItem : entry)))
      debugOpenHistory('openHistoryItem:persisted resolved path', {
        id: item.id,
        relativePath: normalized,
        name: nextItem.name,
      })
      await applyAutoRootMappingFromResolvedPath(item, normalized, resolvedRoot, rootHandleOverride)

      // Opportunistic fast repair for "(unknown root)" entries against this same root.
      if (resolvedRoot) {
        const now = Date.now()
        const key = resolvedRoot.toLowerCase()
        const lastRun = Number(unknownRootFastRepairRef.current.get(key) || 0)
        if (now - lastRun > 12000) {
          unknownRootFastRepairRef.current.set(key, now)
          const resolvedHandle = accessibleRoots.find(
            (handle) => String(handle?.name || '').trim().toLowerCase() === key,
          )
          if (resolvedHandle) {
            await fastRelinkUnknownRootItemsForRoot(resolvedHandle, { maxItems: 280, maxTrim: 6 })
          }
        }
      }
    }

    const openHistoryFile = async (file) => {
      if (!file) return false
      debugOpenHistory('openHistoryFile:try', {
        name: file.name,
        size: file.size,
        projection: item.projection || null,
      })
      const openedWithStoredProjection = await processPanoramaFile(file, {
        persistHistory: false,
        forcedProjection: item.projection || null,
        loadingText: 'Loading panorama...',
      })
      if (openedWithStoredProjection) {
        debugOpenHistory('openHistoryFile:success with stored projection', { name: file.name })
        return true
      }
      const openedAuto = await processPanoramaFile(file, {
        persistHistory: false,
        forcedProjection: null,
        loadingText: 'Loading panorama...',
      })
      debugOpenHistory('openHistoryFile:auto projection result', { name: file.name, openedAuto })
      return openedAuto
    }

    const tryOpenCandidates = async (candidates, options = {}) => {
      const { allowRelaxed = false } = options
      if (!Array.isArray(candidates) || candidates.length === 0) return false

      const usable = candidates.filter((candidate) => candidate?.file)
      if (usable.length === 0) return false

      // Fast path: one candidate from search, try opening immediately.
      if (usable.length === 1) {
        const only = usable[0]
        const opened = await openHistoryFile(only.file)
        if (opened) {
          await persistResolvedPath(only.relativePath, only.file.name, only.rootName || '', only.rootHandle || null)
          debugOpenHistory('tryOpenCandidates:opened single-fast', {
            relativePath: only.relativePath,
            name: only.file?.name,
          })
          return true
        }
      }

      const strictCandidates = []
      const relaxedCandidates = []
      if (item.fingerprint) {
        for (const candidate of usable) {
          const fp = await createFileFingerprint(candidate.file).catch(() => null)
          if (fp === item.fingerprint) {
            strictCandidates.push(candidate)
          } else if (allowRelaxed) {
            relaxedCandidates.push(candidate)
          }
        }
      } else {
        strictCandidates.push(...usable)
      }

      debugOpenHistory('tryOpenCandidates:prepared', {
        item: item.name,
        total: usable.length,
        strict: strictCandidates.length,
        relaxed: relaxedCandidates.length,
        allowRelaxed,
      })

      for (const candidate of strictCandidates) {
        const opened = await openHistoryFile(candidate.file)
        if (!opened) continue
        await persistResolvedPath(candidate.relativePath, candidate.file.name, candidate.rootName || '', candidate.rootHandle || null)
        debugOpenHistory('tryOpenCandidates:opened strict', {
          relativePath: candidate.relativePath,
          name: candidate.file?.name,
        })
        return true
      }

      if (!allowRelaxed) return false
      for (const candidate of relaxedCandidates.slice(0, 8)) {
        const opened = await openHistoryFile(candidate.file)
        if (!opened) continue
        await persistResolvedPath(candidate.relativePath, candidate.file.name, candidate.rootName || '', candidate.rootHandle || null)
        debugOpenHistory('tryOpenCandidates:opened relaxed', {
          relativePath: candidate.relativePath,
          name: candidate.file?.name,
        })
        return true
      }

      debugOpenHistory('tryOpenCandidates:no candidate opened')
      return false
    }

    if (!item?.relativePath) {
      debugOpenHistory('openHistoryItem:no relativePath, trying picker')
      const relinked = await relinkHistoryItemFromPicker(item, pickerRoot, accessibleRoots)
      if (!relinked) {
        setStatus('No file path in history. Pick panorama file manually.')
      }
      return
    }

    try {
      let file = null
      let resolvedRootName = ''
      let resolvedRootHandle = null
      for (const rootHandle of accessibleRoots) {
        // eslint-disable-next-line no-await-in-loop
        file = await getFileFromRelativePath(rootHandle, item.relativePath)
        if (file) {
          resolvedRootName = rootHandle?.name || ''
          resolvedRootHandle = rootHandle
          break
        }
      }
      debugOpenHistory('openHistoryItem:path lookup result', {
        relativePath: item.relativePath,
        found: Boolean(file),
      })
      if (!file) {
        setBusyText('Searching subfolders...')
        setIsBusy(true)
        const found = await findFilesByNameAcrossRoots(accessibleRoots, item.name, 48)
        setIsBusy(false)
        debugOpenHistory('openHistoryItem:search results (path missing)', {
          name: item.name,
          matches: found.length,
        })
        const fallbackFound =
          found.length > 0 ? found : await findFilesByLooseNameAcrossRoots(accessibleRoots, item.name, 48)
        debugOpenHistory('openHistoryItem:search results (path missing, loose)', {
          name: item.name,
          matches: fallbackFound.length,
        })
        const openedFromSearch = await tryOpenCandidates(fallbackFound, { allowRelaxed: true })
        if (openedFromSearch) {
          return
        }
        const relinked = await relinkHistoryItemFromPicker(item, pickerRoot, accessibleRoots)
        if (!relinked) {
          const rootsInfo = accessibleRoots.map((h) => h?.name || '(unknown)').join(', ')
          debugOpenHistory('openHistoryItem:not found in roots', { rootsInfo })
          setStatus('File not found on disk. Choose the correct panorama folder.')
        }
        return
      }
      const openedFromPath = await openHistoryFile(file)
      if (openedFromPath) {
        await persistResolvedPath(item.relativePath, file?.name || item.name, resolvedRootName, resolvedRootHandle)
        return
      }

      setBusyText('Searching subfolders...')
      setIsBusy(true)
      const found = await findFilesByNameAcrossRoots(accessibleRoots, item.name, 48)
      setIsBusy(false)
      debugOpenHistory('openHistoryItem:search results (open by path failed)', {
        name: item.name,
        matches: found.length,
      })
      const fallbackFound =
        found.length > 0 ? found : await findFilesByLooseNameAcrossRoots(accessibleRoots, item.name, 48)
      debugOpenHistory('openHistoryItem:search results (open by path failed, loose)', {
        name: item.name,
        matches: fallbackFound.length,
      })
      const openedFromSearch = await tryOpenCandidates(fallbackFound, { allowRelaxed: true })
      if (openedFromSearch) {
        return
      }
      const relinked = await relinkHistoryItemFromPicker(item, pickerRoot, accessibleRoots)
      if (!relinked) {
        const rootsInfo = accessibleRoots.map((h) => h?.name || '(unknown)').join(', ')
        debugOpenHistory('openHistoryItem:not found in roots after path fail', { rootsInfo })
        setStatus('Could not open this panorama from saved path. Choose file manually.')
      }
    } catch (error) {
      setIsBusy(false)
      debugOpenHistory('openHistoryItem:exception', {
        name: item.name,
        message: error?.message || String(error),
      })
      const relinked = await relinkHistoryItemFromPicker(item, pickerRoot, accessibleRoots)
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
    for (const id of uniqueIds) {
      transientHistoryFilesRef.current.delete(id)
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

  const repairLibraryLinks = async () => {
    const connectedRoots = getConnectedRootHandles()
    if (connectedRoots.length === 0) {
      setStatus('No folder connected. Click "Select folder".')
      return
    }

    const accessibleRoots = await getAccessibleRootHandles(true)
    setHasFolderAccess(accessibleRoots.length > 0)
    if (accessibleRoots.length === 0) {
      setStatus('No folder permission. Use "Refresh access".')
      return
    }

    const db = dbRef.current
    if (!db) {
      setStatus('Database is not ready.')
      return
    }

    const itemsToCheck = [...historyItems]
    if (itemsToCheck.length === 0) {
      setStatus('Library is empty. Nothing to repair.')
      return
    }

    let checked = 0
    let repaired = 0
    let missing = 0
    const updatedById = new Map()
    const fingerprintCache = new Map()
    const nameIndex = new Map()

    setBusyText('Repairing library links: indexing folders...')
    setIsBusy(true)
    try {
      const queue = accessibleRoots.map((rootHandle, idx) => ({
        dir: rootHandle,
        pathPrefix: '',
        rootKey: `${idx}:${rootHandle?.name || 'root'}`,
        rootName: rootHandle?.name || '',
      }))
      let indexedFiles = 0

      while (queue.length > 0) {
        const { dir, pathPrefix, rootKey, rootName } = queue.shift()
        // eslint-disable-next-line no-restricted-syntax
        for await (const [name, handle] of dir.entries()) {
          if (handle.kind === 'directory') {
            queue.push({ dir: handle, pathPrefix: `${pathPrefix}${name}/`, rootKey, rootName })
            continue
          }
          indexedFiles += 1
          const entry = {
            relativePath: normalizeRelativePath(`${pathPrefix}${name}`),
            handle,
            name,
            cacheKey: `${rootKey}|${normalizeRelativePath(`${pathPrefix}${name}`)}`,
            rootName,
          }
          const key = String(name || '').toLowerCase()
          if (!nameIndex.has(key)) nameIndex.set(key, [entry])
          else nameIndex.get(key).push(entry)

          if (indexedFiles % 400 === 0) {
            setBusyText(`Repairing library links: indexing folders (${indexedFiles} files)...`)
            await new Promise((resolve) => requestAnimationFrame(resolve))
          }
        }
      }

      setBusyText(`Repairing library links (0/${itemsToCheck.length})...`)
      for (const item of itemsToCheck) {
        checked += 1
        if (checked % 8 === 0 || checked === itemsToCheck.length) {
          setBusyText(`Repairing library links (${checked}/${itemsToCheck.length})...`)
          await new Promise((resolve) => requestAnimationFrame(resolve))
        }

        const normalizedPath = normalizeRelativePath(item?.relativePath || '')
        let existingFile = null
        if (normalizedPath) {
          for (const rootHandle of accessibleRoots) {
            // eslint-disable-next-line no-await-in-loop
            existingFile = await getFileFromRelativePath(rootHandle, normalizedPath)
            if (existingFile) break
          }
        }
        if (existingFile) {
          continue
        }

        const candidates = nameIndex.get(String(item?.name || '').toLowerCase()) || []
        let matched = null

        if (candidates.length === 1 && !item?.fingerprint) {
          matched = candidates[0]
        } else {
          for (const candidate of candidates) {
            if (!candidate?.handle) continue
            if (item?.fingerprint) {
              const cacheKey = candidate.cacheKey || candidate.relativePath
              let fp = fingerprintCache.get(cacheKey)
              if (!fp) {
                const candidateFile = await candidate.handle.getFile().catch(() => null)
                if (!candidateFile) continue
                fp = await createFileFingerprint(candidateFile).catch(() => null)
                if (!fp) continue
                fingerprintCache.set(cacheKey, fp)
              }
              if (fp !== item.fingerprint) continue
            }
            matched = candidate
            break
          }
        }

        if (!matched && candidates.length === 1) {
          matched = candidates[0]
        }

        if (!matched && candidates.length > 1) {
          const oldParts = splitRelativePath(item?.relativePath || '')
          const tail = oldParts.slice(-2).join('/').toLowerCase()
          if (tail) {
            matched =
              candidates.find((candidate) =>
                normalizeRelativePath(candidate?.relativePath || '')
                  .toLowerCase()
                  .endsWith(tail),
              ) || null
          }
        }

        if (!matched) {
          missing += 1
          continue
        }

        let repairedFingerprint = item?.fingerprint || ''
        const matchedFile = await matched.handle.getFile().catch(() => null)
        if (matchedFile) {
          const fp = await createFileFingerprint(matchedFile).catch(() => null)
          if (fp) repairedFingerprint = fp
        }

        const nextItem = {
          ...item,
          name: matched.name || item.name,
          relativePath: normalizeRelativePath(matched.relativePath || ''),
          rootName: matched.rootName || item.rootName || '',
          fingerprint: repairedFingerprint || item.fingerprint,
        }
        const saved = await dbPut(db, PANORAMAS_STORE, nextItem)
          .then(() => true)
          .catch(() => false)
        if (!saved) continue
        updatedById.set(nextItem.id, nextItem)
        repaired += 1
      }

      if (updatedById.size > 0) {
        setHistoryItems((prev) => prev.map((entry) => updatedById.get(entry.id) || entry))
      }
      setStatus(
        `Repair complete (roots: ${accessibleRoots.length}). Checked: ${checked}, repaired: ${repaired}, already valid: ${Math.max(
          0,
          checked - repaired - missing,
        )}, missing: ${missing}.`,
      )
    } finally {
      setIsBusy(false)
    }
  }

  const clearLibrary = async () => {
    const db = dbRef.current
    if (db) {
      await dbClear(db, PANORAMAS_STORE).catch(() => {})
      await dbPut(db, SETTINGS_STORE, { key: ROOT_HANDLES_KEY, value: [] }).catch(() => {})
      await dbDelete(db, SETTINGS_STORE, ROOT_HANDLE_KEY).catch(() => {})
    }
    rootDirHandlesRef.current = []
    rootDirHandleRef.current = null
    setConnectedRootCount(0)
    setHasFolderAccess(false)
    transientHistoryFilesRef.current.clear()
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current)
      currentUrlRef.current = null
    }
    loadedImageRef.current = null
    loadedMetaRef.current = null
    setHasActivePanorama(false)
    setActiveHistoryId(null)
    setIsEditMode(false)
    setIsExportPanelOpen(false)
    setIsMapPickerOpen(false)
    setIsMaskEditorOpen(false)
    setIsMaskDrawMode(false)
    setHistoryItems([])
    setSelectedHomeIds([])
    setCollapsedGroups({})
    setCollapsedFolderNodes({})
    setHomeFolderFilter(null)
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
  const gpsSavedMessage = t('strings.gpsSaved')
  const activeGpsCoords = useMemo(
    () => (hasGpsOverride ? sanitizeGpsCoords(editedGpsCoords) : sanitizeGpsCoords(gpsCoords)),
    [hasGpsOverride, editedGpsCoords, gpsCoords],
  )
  const hasAnyGpsData = useMemo(() => hasGpsMetadata(exifData), [exifData])
  const hasOriginalGpsCoords = useMemo(() => Boolean(sanitizeGpsCoords(gpsCoords)), [gpsCoords])
  const mapSrc = useMemo(() => {
    if (!activeGpsCoords) return ''
    const deltaLat = 0.003
    const deltaLon = 0.006
    const left = activeGpsCoords.lon - deltaLon
    const right = activeGpsCoords.lon + deltaLon
    const top = activeGpsCoords.lat + deltaLat
    const bottom = activeGpsCoords.lat - deltaLat
    const bbox = `${left},${bottom},${right},${top}`
    return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${activeGpsCoords.lat}%2C${activeGpsCoords.lon}`
  }, [activeGpsCoords])
  const panoramaDateLabel = useMemo(() => {
    if (!activeCapturedAt) return ''
    const formatted = formatShortDateTime(activeCapturedAt)
    return formatted === '-' ? '' : formatted
  }, [activeCapturedAt])
  const panoramaCaptionLines = useMemo(() => {
    if (!hasActivePanorama) return []
    if (!activeGpsCoords) return panoramaDateLabel ? [panoramaDateLabel] : []
    const locationLine = resolvedLocality || (isResolvingLocality ? t('strings.locationResolving') : '')
    if (locationLine && panoramaDateLabel) return [locationLine, panoramaDateLabel]
    if (locationLine) return [locationLine]
    if (panoramaDateLabel) return [panoramaDateLabel]
    return []
  }, [hasActivePanorama, activeGpsCoords, resolvedLocality, isResolvingLocality, panoramaDateLabel, t])

  useEffect(() => {
    const safe = sanitizeGpsCoords(activeGpsCoords)
    if (!safe) {
      setLatInput('')
      setLonInput('')
      return
    }
    setLatInput(String(safe.lat.toFixed(6)))
    setLonInput(String(safe.lon.toFixed(6)))
  }, [activeHistoryId, activeGpsCoords])

  useEffect(() => {
    if (!hasActivePanorama || !activeGpsCoords) {
      setResolvedLocality('')
      setIsResolvingLocality(false)
      return
    }

    const lat = Number(activeGpsCoords.lat)
    const lon = Number(activeGpsCoords.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setResolvedLocality('')
      setIsResolvingLocality(false)
      return
    }

    const key = `${lat.toFixed(4)},${lon.toFixed(4)}`
    const cached = localityCacheRef.current.get(key)
    if (cached && typeof cached === 'object') {
      if (cached.ok) {
        setResolvedLocality(cached.locality || '')
        setIsResolvingLocality(false)
        return
      }
      if (Date.now() - Number(cached.at || 0) < LOCALITY_FAILURE_RETRY_MS) {
        setResolvedLocality('')
        setIsResolvingLocality(false)
        return
      }
    }

    let cancelled = false
    const controller = new AbortController()
    setIsResolvingLocality(true)

    const resolveLocality = async () => {
      try {
        const providers = [
          {
            // Photon (OSM-based) works reliably from browser and reduces CORS/rate-limit noise in console.
            url: `https://photon.komoot.io/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&lang=${encodeURIComponent(language === 'pl' ? 'pl' : 'en')}`,
            parse: (payload) => {
              const props = payload?.features?.[0]?.properties || {}
              return props.city || props.name || props.county || props.state || ''
            },
          },
          {
            // Nominatim fallback.
            url: `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=12&addressdetails=1`,
            parse: (payload) => pickLocalityFromAddress(payload?.address || {}),
          },
        ]

        let locality = ''
        for (const provider of providers) {
          try {
            // eslint-disable-next-line no-await-in-loop
            const response = await fetch(provider.url, {
              headers: {
                'Accept-Language': 'pl,en',
              },
              signal: controller.signal,
            })
            if (!response.ok) continue
            // eslint-disable-next-line no-await-in-loop
            const payload = await response.json()
            locality = String(provider.parse(payload) || '').trim()
            if (locality) break
          } catch {
            // try next provider
          }
        }

        localityCacheRef.current.set(key, { ok: Boolean(locality), locality, at: Date.now() })
        if (!cancelled) setResolvedLocality(locality)
      } catch {
        localityCacheRef.current.set(key, { ok: false, locality: '', at: Date.now() })
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
  }, [hasActivePanorama, activeGpsCoords, language])

  useEffect(() => {
    if (!hasActivePanorama) {
      setIsEditMode(false)
      setIsMapPickerOpen(false)
    }
  }, [hasActivePanorama])

  useEffect(() => {
    if (!hasActivePanorama) {
      setIsGpsOverrideConfirmOpen(false)
      pendingGpsOverrideActionRef.current = null
    }
  }, [hasActivePanorama])

  useEffect(() => {
    if (historyItems.length !== 0) return
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current)
      currentUrlRef.current = null
    }
    loadedImageRef.current = null
    loadedMetaRef.current = null
    setHasActivePanorama(false)
    setActiveHistoryId(null)
    setIsEditMode(false)
    setIsExportPanelOpen(false)
  }, [historyItems.length])

  useEffect(() => {
    if (!Array.isArray(pixelateMasks) || pixelateMasks.length === 0) return
    setPixelateMasks((prev) =>
      prev.map((mask) => {
        if (!mask || typeof mask !== 'object') return mask
        if (mask.version === 2) return mask
        const y = Number(mask.y) || 0
        const h = Number(mask.height) || 0
        return {
          ...mask,
          y: Math.max(0, Math.min(1, 1 - y - h)),
          version: 2,
        }
      }),
    )
  }, [])

  useEffect(() => {
    if (!isMapPickerOpen || !gpsMapContainerRef.current) return undefined
    const current = sanitizeGpsCoords(activeGpsCoords) || { lat: 52.2297, lon: 21.0122 }

    if (!gpsMapRef.current) {
      const map = L.map(gpsMapContainerRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView([current.lat, current.lon], 14)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map)
      map.on('click', (event) => {
        setEditedGpsCoords({ lat: event.latlng.lat, lon: event.latlng.lng })
        setHasGpsOverride(true)
        setStatus(gpsSavedMessage)
      })
      gpsMapRef.current = map
    }

    const map = gpsMapRef.current
    map.invalidateSize()
    map.setView([current.lat, current.lon], 14)

    if (!gpsMapMarkerRef.current) {
      gpsMapMarkerRef.current = L.circleMarker([current.lat, current.lon], {
        radius: 8,
        color: '#06b6d4',
        weight: 2,
        fillColor: '#22d3ee',
        fillOpacity: 0.5,
      }).addTo(map)
    } else {
      gpsMapMarkerRef.current.setLatLng([current.lat, current.lon])
    }
    return undefined
  }, [isMapPickerOpen, activeGpsCoords, gpsSavedMessage])

  useEffect(() => {
    if (!gpsMapMarkerRef.current) return
    const safe = sanitizeGpsCoords(activeGpsCoords)
    if (!safe) return
    gpsMapMarkerRef.current.setLatLng([safe.lat, safe.lon])
  }, [activeGpsCoords])

  useEffect(() => {
    if (isMapPickerOpen) return
    if (gpsMapRef.current) {
      gpsMapRef.current.remove()
      gpsMapRef.current = null
      gpsMapMarkerRef.current = null
    }
  }, [isMapPickerOpen])

  const closeGpsOverrideConfirm = () => {
    setIsGpsOverrideConfirmOpen(false)
    pendingGpsOverrideActionRef.current = null
  }

  const runWithGpsOverrideGuard = (action) => {
    if (typeof action !== 'function') return
    if (hasOriginalGpsCoords && !hasGpsOverride) {
      pendingGpsOverrideActionRef.current = action
      setIsGpsOverrideConfirmOpen(true)
      return
    }
    action()
  }

  const confirmGpsOverride = () => {
    const action = pendingGpsOverrideActionRef.current
    pendingGpsOverrideActionRef.current = null
    setIsGpsOverrideConfirmOpen(false)
    if (typeof action === 'function') action()
  }

  const applyManualGpsInputs = () => {
    const lat = Number(String(latInput).replace(',', '.'))
    const lon = Number(String(lonInput).replace(',', '.'))
    const safe = sanitizeGpsCoords({ lat, lon })
    if (!safe) return
    runWithGpsOverrideGuard(() => {
      setEditedGpsCoords(safe)
      setHasGpsOverride(true)
      setStatus(t('strings.gpsSaved'))
    })
  }

  const applyGpsFromReferencePhoto = async (file) => {
    if (!file || !file.type?.startsWith('image/')) return
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
    const coords = sanitizeGpsCoords(extractGpsCoords(parsed))
    if (!coords) {
      setStatus(t('strings.noGpsInPhoto'))
      return
    }
    runWithGpsOverrideGuard(() => {
      setEditedGpsCoords(coords)
      setHasGpsOverride(true)
      setStatus(t('strings.gpsCopiedFromPhoto'))
    })
  }

  const normalizeMaskRect = (x1, y1, x2, y2) => {
    const left = Math.max(0, Math.min(x1, x2))
    const top = Math.max(0, Math.min(y1, y2))
    const right = Math.min(1, Math.max(x1, x2))
    const bottom = Math.min(1, Math.max(y1, y2))
    const width = Math.max(0, right - left)
    const height = Math.max(0, bottom - top)
    return { x: left, y: top, width, height }
  }

  const getMaskPointFromEvent = (event) => {
    const el = maskSurfaceRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    }
  }

  const handleMaskPointerDown = (event) => {
    if (event.button !== 0) return
    const point = getMaskPointFromEvent(event)
    if (!point) return
    event.preventDefault()
    maskPointerRef.current = point
    setMaskDraft({ x: point.x, y: point.y, width: 0, height: 0 })
  }

  const handleMaskPointerMove = (event) => {
    if (!maskPointerRef.current) return
    const point = getMaskPointFromEvent(event)
    if (!point) return
    event.preventDefault()
    const rect = normalizeMaskRect(maskPointerRef.current.x, maskPointerRef.current.y, point.x, point.y)
    setMaskDraft(rect)
  }

  const commitMaskDraft = (event) => {
    if (!maskPointerRef.current) return
    const point = getMaskPointFromEvent(event)
    const start = maskPointerRef.current
    maskPointerRef.current = null
    if (!point) {
      setMaskDraft(null)
      return
    }
    const rect = normalizeMaskRect(start.x, start.y, point.x, point.y)
    setMaskDraft(null)
    if (rect.width < 0.004 || rect.height < 0.004) return
    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    setPixelateMasks((prev) => [...prev, { id, ...rect }])
  }

  const removeMask = (id) => {
    setPixelateMasks((prev) => prev.filter((mask) => mask.id !== id))
  }

  const getUvAtClientPosition = (clientX, clientY) => {
    const renderer = rendererRef.current
    const camera = cameraRef.current
    const mesh = meshRef.current
    if (!renderer || !camera || !mesh) return null
    const rect = renderer.domElement.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1)
    ndcPointerRef.current.set(ndcX, ndcY)
    raycasterRef.current.setFromCamera(ndcPointerRef.current, camera)
    const intersections = raycasterRef.current.intersectObject(mesh, false)
    const uv = intersections?.[0]?.uv
    if (!uv) return null
    return {
      u: ((Number(uv.x) % 1) + 1) % 1,
      v: Math.max(0, Math.min(1, Number(uv.y))),
    }
  }

  const addMaskFromUvPair = (startUv, endUv) => {
    if (!startUv || !endUv) return
    let u1 = Number(startUv.u)
    let u2 = Number(endUv.u)
    const v1 = Number(startUv.v)
    const v2 = Number(endUv.v)
    if (!Number.isFinite(u1) || !Number.isFinite(u2) || !Number.isFinite(v1) || !Number.isFinite(v2)) return

    if (Math.abs(u2 - u1) > 0.5) {
      if (u1 < u2) u1 += 1
      else u2 += 1
    }
    const left = Math.min(u1, u2)
    const right = Math.max(u1, u2)
    const imageV1 = 1 - v1
    const imageV2 = 1 - v2
    const top = Math.max(0, Math.min(imageV1, imageV2))
    const bottom = Math.min(1, Math.max(imageV1, imageV2))
    const width = right - left
    const height = bottom - top
    if (width < 0.002 || height < 0.002) return

    const normalizedLeft = ((left % 1) + 1) % 1
    const idBase = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    if (normalizedLeft + width <= 1) {
      setPixelateMasks((prev) => [...prev, { id: idBase, x: normalizedLeft, y: top, width, height, version: 2 }])
      return
    }

    const firstWidth = 1 - normalizedLeft
    const secondWidth = width - firstWidth
    setPixelateMasks((prev) => [
      ...prev,
      { id: `${idBase}-a`, x: normalizedLeft, y: top, width: firstWidth, height, version: 2 },
      { id: `${idBase}-b`, x: 0, y: top, width: secondWidth, height, version: 2 },
    ])
  }

  const handleViewerMaskPointerDown = (event) => {
    if (!isMaskDrawMode || event.button !== 0) return
    const uv = getUvAtClientPosition(event.clientX, event.clientY)
    if (!uv) return
    event.preventDefault()
    event.stopPropagation()
    if (typeof event.currentTarget?.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    viewerMaskDragRef.current = {
      startUv: uv,
      startX: event.clientX - rect.left,
      startY: event.clientY - rect.top,
    }
    setViewerMaskDraft({
      left: event.clientX - rect.left,
      top: event.clientY - rect.top,
      width: 0,
      height: 0,
    })
  }

  const handleViewerMaskPointerMove = (event) => {
    if (!isMaskDrawMode || !viewerMaskDragRef.current) return
    event.preventDefault()
    event.stopPropagation()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const sx = viewerMaskDragRef.current.startX
    const sy = viewerMaskDragRef.current.startY
    const cx = event.clientX - rect.left
    const cy = event.clientY - rect.top
    setViewerMaskDraft({
      left: Math.min(sx, cx),
      top: Math.min(sy, cy),
      width: Math.abs(cx - sx),
      height: Math.abs(cy - sy),
    })
  }

  const handleViewerMaskPointerUp = (event) => {
    if (!isMaskDrawMode || !viewerMaskDragRef.current) return
    event.preventDefault()
    event.stopPropagation()
    if (typeof event.currentTarget?.releasePointerCapture === 'function') {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const containerRect = containerRef.current?.getBoundingClientRect()
    if (containerRect && viewerMaskDraft) {
      const cornerClientPoints = [
        { x: containerRect.left + viewerMaskDraft.left, y: containerRect.top + viewerMaskDraft.top },
        { x: containerRect.left + viewerMaskDraft.left + viewerMaskDraft.width, y: containerRect.top + viewerMaskDraft.top },
        {
          x: containerRect.left + viewerMaskDraft.left + viewerMaskDraft.width,
          y: containerRect.top + viewerMaskDraft.top + viewerMaskDraft.height,
        },
        { x: containerRect.left + viewerMaskDraft.left, y: containerRect.top + viewerMaskDraft.top + viewerMaskDraft.height },
      ]
      const uvCorners = cornerClientPoints
        .map((p) => getUvAtClientPosition(p.x, p.y))
        .filter(Boolean)
        .map((uv) => ({ x: uv.u, y: 1 - uv.v }))

      if (uvCorners.length === 4) {
        const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
        setPixelateMasks((prev) => [...prev, { id, points: uvCorners, version: 3 }])
      } else {
        const endUv = getUvAtClientPosition(event.clientX, event.clientY)
        addMaskFromUvPair(viewerMaskDragRef.current.startUv, endUv)
      }
    } else {
      const endUv = getUvAtClientPosition(event.clientX, event.clientY)
      addMaskFromUvPair(viewerMaskDragRef.current.startUv, endUv)
    }
    viewerMaskDragRef.current = null
    setViewerMaskDraft(null)
  }

  const exportEditedJpeg = () => {
    const image = loadedImageRef.current
    const meta = loadedMetaRef.current
    if (!image || !meta) return
    const width = Number(meta.width || image.naturalWidth || image.width || 0)
    const height = Number(meta.height || image.naturalHeight || image.height || 0)
    if (!width || !height) return

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return
    ctx.drawImage(image, 0, 0, width, height)
    applyGlobalAdjustmentsToCanvas(canvas, ctx, adjustments, lutMode)

    const maskCount = Array.isArray(pixelateMasks) ? pixelateMasks.length : 0
    const effectStrength = Math.max(4, Number(maskEffectStrength) || 32)
    const useBlur = maskEffectMode === 'blur'
    if (maskCount > 0) {
      for (const mask of pixelateMasks) {
        if (Array.isArray(mask?.points) && mask.points.length >= 3) {
          const pointsPx = mask.points
            .map((p) => {
              const nx = Number(p?.x)
              const ny = Number(p?.y)
              if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null
              const ex = flipHorizontal ? nx : 1 - nx
              return { x: ex * width, y: ny * height }
            })
            .filter(Boolean)
          if (pointsPx.length >= 3) {
            if (useBlur) applyBlurToPolygon(canvas, ctx, pointsPx, effectStrength)
            else applyPixelateToPolygon(canvas, ctx, pointsPx, effectStrength)
            continue
          }
        }

        const nx = Number(mask.x) || 0
        const ny = Number(mask.y) || 0
        const nw = Number(mask.width) || 0
        const nh = Number(mask.height) || 0
        const exportXNorm = flipHorizontal ? nx : 1 - nx - nw

        const x = Math.round(exportXNorm * width)
        const y = Math.round(ny * height)
        const w = Math.round(nw * width)
        const h = Math.round(nh * height)
        if (w <= 1 || h <= 1) continue
        if (useBlur) applyBlurToCanvasRegion(canvas, ctx, x, y, w, h, effectStrength)
        else applyPixelateToCanvasRegion(canvas, ctx, x, y, w, h, effectStrength)
      }
    }

    let jpegDataUrl = canvas.toDataURL('image/jpeg', 0.95)
    const safeGps = sanitizeGpsCoords(activeGpsCoords)
    if (safeGps) {
      try {
        jpegDataUrl = attachGpsToJpegDataUrl(jpegDataUrl, safeGps)
      } catch {
        // Export still succeeds without metadata if EXIF injection fails.
      }
    }

    const a = document.createElement('a')
    const baseName = String(meta.name || 'panorama').replace(/\.[^.]+$/, '')
    a.href = jpegDataUrl
    a.download = `${baseName}-edited.jpg`
    a.click()
    setStatus(`${t('strings.editedExportDone')} (masks: ${maskCount}, ${maskEffectMode})`)
  }

  const exportPhotoJpeg = () => {
    const renderer = rendererRef.current
    const meta = loadedMetaRef.current
    const frame = exportFrameRect
    if (!renderer || !frame || exportMode !== 'photo') return
    if (composerRef.current) composerRef.current.render()
    else if (sceneRef.current && cameraRef.current) renderer.render(sceneRef.current, cameraRef.current)
    const source = renderer.domElement
    const viewRect = source.getBoundingClientRect()
    if (!viewRect.width || !viewRect.height) return

    const scaleX = source.width / viewRect.width
    const scaleY = source.height / viewRect.height
    const sx = Math.round(Math.max(0, frame.x * scaleX))
    const sy = Math.round(Math.max(0, frame.y * scaleY))
    const sw = Math.round(Math.max(1, Math.min(source.width - sx, frame.width * scaleX)))
    const sh = Math.round(Math.max(1, Math.min(source.height - sy, frame.height * scaleY)))

    const canvas = document.createElement('canvas')
    canvas.width = sw
    canvas.height = sh
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh)

    const maskCount = Array.isArray(projectedMaskPreviews) ? projectedMaskPreviews.length : 0
    const effectStrength = Math.max(4, Number(maskEffectStrength) || 32)
    const useBlur = maskEffectMode === 'blur'
    if (maskCount > 0) {
      for (const mask of projectedMaskPreviews) {
        if (!Array.isArray(mask?.points) || mask.points.length < 3) continue
        const pointsPx = mask.points
          .map((p) => {
            const nx = Number(p?.x)
            const ny = Number(p?.y)
            if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null
            const srcX = nx * source.width
            const srcY = ny * source.height
            return { x: srcX - sx, y: srcY - sy }
          })
          .filter(Boolean)
        if (pointsPx.length < 3) continue
        if (useBlur) applyBlurToPolygon(canvas, ctx, pointsPx, effectStrength)
        else applyPixelateToPolygon(canvas, ctx, pointsPx, effectStrength)
      }
    }

    const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.95)
    const a = document.createElement('a')
    const baseName = String(meta?.name || 'panorama').replace(/\.[^.]+$/, '')
    const safeAspect = String(exportAspect).replace(':', 'x')
    a.href = jpegDataUrl
    a.download = `${baseName}-photo-${safeAspect}.jpg`
    a.click()
    setStatus(`${t('strings.exportPhotoJpeg')} (${exportAspect}, masks: ${maskCount})`)
  }

  const projectedMaskPreviews = useMemo(() => {
    if (!hasActivePanorama || !isEditMode || !Array.isArray(pixelateMasks) || pixelateMasks.length === 0) return []
    const renderer = rendererRef.current
    const camera = cameraRef.current
    const mesh = meshRef.current
    if (!renderer || !camera || !mesh) return []

    const rect = renderer.domElement.getBoundingClientRect()
    const viewportW = rect.width
    const viewportH = rect.height
    if (!viewportW || !viewportH) return []

    const uvToLocalPoint = (u, v) => {
      const uu = ((u % 1) + 1) % 1
      const vv = Math.max(0, Math.min(1, v))
      if (activeProjection === 'cylindrical') {
        const theta = uu * Math.PI * 2
        const radius = 500
        const height = 500
        // CylinderGeometry UV has v=1 at top and v=0 at bottom.
        return new THREE.Vector3(radius * Math.sin(theta), (vv - 0.5) * height, radius * Math.cos(theta))
      }
      // SphereGeometry UV has v=1 at top and v=0 at bottom.
      const phi = uu * Math.PI * 2
      const theta = (1 - vv) * Math.PI
      const radius = 500
      return new THREE.Vector3(
        -radius * Math.cos(phi) * Math.sin(theta),
        radius * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta),
      )
    }

    const result = []
    for (const mask of pixelateMasks) {
      let cornersUv = []
      if (Array.isArray(mask?.points) && mask.points.length >= 3) {
        cornersUv = mask.points
          .map((p) => {
            const x = Number(p?.x)
            const y = Number(p?.y)
            if (!Number.isFinite(x) || !Number.isFinite(y)) return null
            return { u: x, v: 1 - y }
          })
          .filter(Boolean)
      } else {
        const x = Number(mask?.x)
        const y = Number(mask?.y)
        const w = Number(mask?.width)
        const h = Number(mask?.height)
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) continue
        if (w <= 0 || h <= 0) continue
        cornersUv = [
          { u: x, v: 1 - y },
          { u: x + w, v: 1 - y },
          { u: x + w, v: 1 - (y + h) },
          { u: x, v: 1 - (y + h) },
        ]
      }
      if (cornersUv.length < 3) continue

      const cornerPoints = []
      let visibleCorners = 0
      for (const corner of cornersUv) {
        const world = uvToLocalPoint(corner.u, corner.v).applyMatrix4(mesh.matrixWorld)
        const projected = world.clone().project(camera)
        if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y) || !Number.isFinite(projected.z)) continue
        if (projected.z >= -1 && projected.z <= 1) visibleCorners += 1
        const sx = ((projected.x + 1) * 0.5) * viewportW
        const sy = ((1 - projected.y) * 0.5) * viewportH
        cornerPoints.push({ x: sx, y: sy })
      }
      // Avoid unstable "half-screen" polygons when any corner goes behind camera.
      // In that transition state the preview can explode across the viewport.
      if (cornerPoints.length < 4 || visibleCorners < 4) continue

      const pointsNormalized = cornerPoints.map((p) => ({
        x: p.x / viewportW,
        y: p.y / viewportH,
      }))
      const topRight = cornerPoints.reduce(
        (best, p) => {
          if (p.y < best.y || (Math.abs(p.y - best.y) < 1e-6 && p.x > best.x)) return p
          return best
        },
        { x: cornerPoints[0].x, y: cornerPoints[0].y },
      )
      const topLeft = cornerPoints.reduce(
        (best, p) => {
          if (p.y < best.y || (Math.abs(p.y - best.y) < 1e-6 && p.x < best.x)) return p
          return best
        },
        { x: cornerPoints[0].x, y: cornerPoints[0].y },
      )

      const clamp01 = (value) => Math.max(0, Math.min(1, value))
      const labelX = clamp01(topLeft.x / viewportW)
      const labelY = clamp01(topLeft.y / viewportH)
      const removeX = clamp01(topRight.x / viewportW)
      const removeY = clamp01(topRight.y / viewportH)

      result.push({
        id: mask.id,
        points: pointsNormalized,
        labelX,
        labelY,
        removeX,
        removeY,
      })
    }
    return result
  }, [pixelateMasks, hasActivePanorama, isEditMode, activeProjection, maskPreviewTick])

  const maskOrderById = useMemo(() => {
    const map = new Map()
    for (let i = 0; i < pixelateMasks.length; i += 1) {
      const id = pixelateMasks[i]?.id
      if (id) map.set(id, i + 1)
    }
    return map
  }, [pixelateMasks])

  useEffect(() => {
    if (!hasActivePanorama || !isEditMode) return undefined
    let raf = 0
    const loop = () => {
      setMaskPreviewTick((prev) => (prev + 1) % 1000000)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      if (raf) cancelAnimationFrame(raf)
    }
  }, [hasActivePanorama, isEditMode])

  useEffect(() => {
    if (!visibleExifTabs.includes(exifTab)) {
      setExifTab('all')
    }
  }, [exifTab, visibleExifTabs])
  const panelFilteredItems = useMemo(() => {
    const filtered = historyItems.filter((item) => {
      const projectionOk = panelProjectionFilter === 'all' || item.projection === panelProjectionFilter
      const deviceOk = panelDeviceFilter === 'all' || item.device === panelDeviceFilter
      return projectionOk && deviceOk
    })
    return [...filtered].sort((a, b) =>
      panelSortOrder === 'asc' ? a.createdAt - b.createdAt : b.createdAt - a.createdAt,
    )
  }, [historyItems, panelProjectionFilter, panelDeviceFilter, panelSortOrder])

  const groupedHistory = useMemo(() => {
    return panelFilteredItems.reduce((acc, item) => {
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
  }, [panelFilteredItems])

  const panelFolderTree = useMemo(() => {
    const topRootMap = new Map()
    const ensureTopRoot = (rootName) => {
      const key = rootName || '(unknown root)'
      let rootNode = topRootMap.get(key)
      if (rootNode) return rootNode
      rootNode = {
        key: `root:${key}`,
        name: key,
        fullPath: key,
        rootName: key,
        count: 0,
        isRoot: true,
        children: [],
      }
      topRootMap.set(key, rootNode)
      return rootNode
    }

    const childMapByRoot = new Map()
    const ensureChildNode = (rootKey, pathParts, idx) => {
      if (!childMapByRoot.has(rootKey)) {
        childMapByRoot.set(rootKey, new Map())
      }
      const nodeByPath = childMapByRoot.get(rootKey)
      const path = pathParts.slice(0, idx + 1).join('/')
      let node = nodeByPath.get(path)
      if (node) return node
      node = {
        key: `${rootKey}:${path}`,
        name: pathParts[idx],
        fullPath: path,
        rootName: rootKey,
        count: 0,
        isRoot: false,
        children: [],
      }
      nodeByPath.set(path, node)
      if (idx === 0) {
        topRootMap.get(rootKey).children.push(node)
      } else {
        const parentPath = pathParts.slice(0, idx).join('/')
        const parent = nodeByPath.get(parentPath)
        if (parent) parent.children.push(node)
      }
      return node
    }

    for (const item of panelFilteredItems) {
      const rootName = String(item?.rootName || '').trim() || '(unknown root)'
      const topRoot = ensureTopRoot(rootName)
      topRoot.count += 1
      const normalized = normalizeRelativePath(item?.relativePath || '')
      const parts = splitRelativePath(normalized)
      const folderParts = parts.length > 1 ? parts.slice(0, -1) : []
      for (let i = 0; i < folderParts.length; i += 1) {
        const node = ensureChildNode(rootName, folderParts, i)
        node.count += 1
      }
    }

    const sortNodes = (nodes) => {
      nodes.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      for (const node of nodes) {
        if (node.children.length > 0) sortNodes(node.children)
      }
    }

    const rootNodes = Array.from(topRootMap.values())
    sortNodes(rootNodes)
    return rootNodes
  }, [panelFilteredItems])

  const uniqueDevices = useMemo(() => {
    const set = new Set()
    for (const item of historyItems) {
      if (item.device) set.add(item.device)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [historyItems])

  const filteredGroupedHistory = groupedHistory

  useEffect(() => {
    let cancelled = false
    const backfillRootNames = async () => {
      const missing = historyItems.filter((item) => !item?.rootName && item?.relativePath).slice(0, 40)
      if (missing.length === 0) return
      const accessibleRoots = await getAccessibleRootHandles(false)
      if (cancelled || accessibleRoots.length === 0) return

      const updates = []
      for (const item of missing) {
        let matchedRootName = ''
        for (const rootHandle of accessibleRoots) {
          // eslint-disable-next-line no-await-in-loop
          const file = await getFileFromRelativePath(rootHandle, item.relativePath)
          if (file) {
            matchedRootName = rootHandle?.name || ''
            break
          }
        }
        if (matchedRootName) {
          updates.push({ ...item, rootName: matchedRootName })
        }
      }
      if (cancelled || updates.length === 0) return

      const db = dbRef.current
      if (db) {
        await Promise.all(updates.map((entry) => dbPut(db, PANORAMAS_STORE, entry).catch(() => null)))
      }
      if (cancelled) return
      const updateById = new Map(updates.map((entry) => [entry.id, entry]))
      setHistoryItems((prev) => prev.map((entry) => updateById.get(entry.id) || entry))
    }

    backfillRootNames()
    return () => {
      cancelled = true
    }
  }, [historyItems.length])

  const filteredHomeItems = useMemo(
    () => {
      const filtered = historyItems.filter((item) => {
        const projectionOk = homeProjectionFilter === 'all' || item.projection === homeProjectionFilter
        const deviceOk = homeDeviceFilter === 'all' || item.device === homeDeviceFilter
        const folderOk = (() => {
          if (!homeFolderFilter) return true
          const itemRoot = String(item?.rootName || '').trim() || '(unknown root)'
          if (itemRoot !== homeFolderFilter.rootName) return false
          if (!homeFolderFilter.folderPath) return true
          const parts = splitRelativePath(item?.relativePath || '')
          const itemFolderPath = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
          return itemFolderPath === homeFolderFilter.folderPath || itemFolderPath.startsWith(`${homeFolderFilter.folderPath}/`)
        })()
        return projectionOk && deviceOk && folderOk
      })
      return [...filtered].sort((a, b) =>
        homeSortOrder === 'asc' ? a.createdAt - b.createdAt : b.createdAt - a.createdAt,
      )
    },
    [historyItems, homeProjectionFilter, homeDeviceFilter, homeSortOrder, homeFolderFilter],
  )
  const isLibraryEmpty = historyItems.length === 0
  const showEmptyLibraryFallback = historyItems.length === 0
  const hasRenderablePanorama = hasActivePanorama && Boolean(currentUrlRef.current) && Boolean(loadedMetaRef.current)
  const activeHomeIndex = useMemo(
    () => filteredHomeItems.findIndex((item) => item.id === activeHistoryId),
    [filteredHomeItems, activeHistoryId],
  )
  const previousHomeItem = activeHomeIndex > 0 ? filteredHomeItems[activeHomeIndex - 1] : null
  const nextHomeItem =
    activeHomeIndex >= 0 && activeHomeIndex < filteredHomeItems.length - 1 ? filteredHomeItems[activeHomeIndex + 1] : null
  const selectedHomeIdSet = useMemo(() => new Set(selectedHomeIds), [selectedHomeIds])
  const hasHomeSelection = selectedHomeIds.length > 0
  const activeHomeFolderFilterLabel = useMemo(() => {
    if (!homeFolderFilter) return ''
    const rootName = String(homeFolderFilter.rootName || '(unknown root)')
    const folderPath = String(homeFolderFilter.folderPath || '')
    return folderPath ? `${rootName}/${folderPath}` : rootName
  }, [homeFolderFilter])

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

  const displayedDbBytes = estimatedDbBytes

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
      rootName: item.rootName ? String(item.rootName) : '',
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
    let nextScope = scope
    let folderTarget = null
    if (nextScope && typeof nextScope === 'object') {
      folderTarget = nextScope.folderTarget || null
      nextScope = nextScope.scope || 'panel'
    }
    event.preventDefault()
    event.stopPropagation()
    const submenuSide = event.clientX > window.innerWidth - 420 ? 'left' : 'right'
    setContextMenu({
      open: true,
      x: event.clientX,
      y: event.clientY,
      itemId,
      folderTarget,
      submenuSide,
      scope: nextScope,
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
    setIsEditMode(false)
    setIsMapPickerOpen(false)
    setIsMaskEditorOpen(false)
    setIsMaskDrawMode(false)
    setEditedGpsCoords(null)
    setHasGpsOverride(false)
    setLatInput('')
    setLonInput('')
    setPixelateMasks([])
    setMaskDraft(null)
    setResolvedLocality('')
    setIsResolvingLocality(false)
  }

  const openPhotoFrameMode = () => {
    if (!hasActivePanorama) return
    setIsEditMode(true)
    setIsExportPanelOpen(true)
    setExportMode('photo')
  }
  const isPhotoModeActive = isEditMode && isExportPanelOpen && exportMode === 'photo'
  const togglePhotoFrameMode = () => {
    if (!hasActivePanorama) return
    if (isPhotoModeActive) {
      setIsExportPanelOpen(false)
      setExportMode('panorama')
      return
    }
    openPhotoFrameMode()
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
      const fileItems = files.map((file) => {
        const rel = file.webkitRelativePath || ''
        const rootName = rel.split('/').filter(Boolean)[0] || ''
        return { file, relativePath: rel, rootName }
      })
      const { added, duplicates, tooLarge, canceled } = await scanFilesWithWorker(fileItems, 'Scanning folder')
      if (!canceled) {
        setStatus(
          `Folder scan complete. Added ${added}, duplicates: ${duplicates}, skipped >100MB: ${tooLarge}, total files: ${files.length}.`,
        )
      }
    } finally {
      event.target.value = ''
    }
  }

  const collectFilesFromDirectoryHandle = async (dirHandle, pathPrefix = '', rootName = '') => {
    const collected = []
    // eslint-disable-next-line no-restricted-syntax
    for await (const [name, handle] of dirHandle.entries()) {
      if (handle.kind === 'directory') {
        const nested = await collectFilesFromDirectoryHandle(handle, `${pathPrefix}${name}/`, rootName)
        collected.push(...nested)
      } else if (handle.kind === 'file') {
        try {
          const file = await handle.getFile()
          collected.push({ file, relativePath: `${pathPrefix}${name}`, rootName })
        } catch {
          // skip unreadable files
        }
      }
    }
    return collected
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
      if (!granted) {
        setHasFolderAccess(false)
        setStatus('Folder access was not granted.')
        return
      }

      const { added, handles } = await addConnectedRootHandle(dirHandle)
      setHasFolderAccess(true)

      if (!scanAfterPick) {
        setStatus(
          added
            ? `Folder added (${handles.length} connected). Library was loaded from backup without scanning.`
            : `Folder already connected (${handles.length} connected).`,
        )
        return
      }

      const fileItems = await collectFilesFromDirectoryHandle(dirHandle, '', dirHandle?.name || '')
      const { added: addedFromScan, duplicates, tooLarge, checked, canceled } = await scanFilesWithWorker(fileItems, 'Scanning folder')
      if (!canceled) {
        setStatus(
          `Folder scan complete. Added ${addedFromScan}, duplicates: ${duplicates}, skipped >100MB: ${tooLarge}, checked files: ${checked}. Connected folders: ${handles.length}.`,
        )
      }
    } catch {
      setStatus('Folder selection was canceled or not supported by browser.')
    }
  }

  const refreshFolderAccess = async () => {
    const connected = getConnectedRootHandles()
    if (connected.length === 0) {
      await pickFolderWithFsApi({ scanAfterPick: false })
      return
    }
    const accessible = await getAccessibleRootHandles(true)
    setHasFolderAccess(accessible.length > 0)
    setStatus(
      accessible.length > 0
        ? `Folder access refreshed (${accessible.length}/${connected.length}).`
        : 'Could not refresh folder access.',
    )
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

    const connectedRoots = getConnectedRootHandles()
    if (connectedRoots.length === 0) {
      setStatus('No folder connected. Click "Select folder".')
      return
    }

    const accessibleRoots = await getAccessibleRootHandles(true)
    setHasFolderAccess(accessibleRoots.length > 0)
    if (accessibleRoots.length === 0) {
      setStatus('No folder permission. Use "Refresh access".')
      return
    }

    try {
      let startIn = accessibleRoots[0]
      for (const rootHandle of accessibleRoots) {
        // eslint-disable-next-line no-await-in-loop
        const dir = await getDirectoryFromRelativePath(rootHandle, item.relativePath)
        if (dir) {
          startIn = dir
          break
        }
      }
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

  const getDirectoryHandleFromFolderPath = async (rootHandle, folderPath) => {
    if (!rootHandle) return null
    const normalized = normalizeRelativePath(folderPath)
    if (!normalized) return rootHandle
    const parts = splitRelativePath(normalized)
    if (parts.length === 0) return rootHandle
    try {
      let dir = rootHandle
      for (const part of parts) {
        // eslint-disable-next-line no-await-in-loop
        dir = await dir.getDirectoryHandle(part, { create: false })
      }
      return dir
    } catch {
      return null
    }
  }

  const rescanFolderFromContext = async () => {
    if (isScanInProgress) {
      setStatus('Another scan is already in progress.')
      return
    }
    const target = contextMenu.folderTarget
    const targetRootName = String(target?.rootName || '').trim()
    const targetFolderPath = normalizeRelativePath(target?.folderPath || '')
    if (!targetRootName || targetRootName === '(unknown root)') {
      setStatus('Cannot rescan this folder. Root folder is unknown.')
      return
    }

    const accessibleRoots = await getAccessibleRootHandles(true)
    if (accessibleRoots.length === 0) {
      setHasFolderAccess(false)
      setStatus('No folder permission. Use "Refresh access".')
      return
    }
    setHasFolderAccess(true)
    const matchingRoots = accessibleRoots.filter((handle) => String(handle?.name || '').trim() === targetRootName)
    if (matchingRoots.length === 0) {
      setStatus(`Connected root "${targetRootName}" is not accessible.`)
      return
    }

    let totals = { added: 0, duplicates: 0, tooLarge: 0, checked: 0 }
    let scannedRoots = 0
    for (const rootHandle of matchingRoots) {
      // eslint-disable-next-line no-await-in-loop
      const scanDir = await getDirectoryHandleFromFolderPath(rootHandle, targetFolderPath)
      if (!scanDir) continue
      const pathPrefix = targetFolderPath ? `${targetFolderPath}/` : ''
      // eslint-disable-next-line no-await-in-loop
      const fileItems = await collectFilesFromDirectoryHandle(scanDir, pathPrefix, targetRootName)
      if (fileItems.length === 0) continue
      // eslint-disable-next-line no-await-in-loop
      const { added, duplicates, tooLarge, checked, canceled } = await scanFilesWithWorker(fileItems, 'Rescanning folder')
      totals = {
        added: totals.added + added,
        duplicates: totals.duplicates + duplicates,
        tooLarge: totals.tooLarge + tooLarge,
        checked: totals.checked + checked,
      }
      scannedRoots += 1
      if (canceled) return
    }

    if (scannedRoots === 0) {
      setStatus('Rescan skipped. Selected folder was not found in connected roots.')
      return
    }
    const label = targetFolderPath ? `${targetRootName}/${targetFolderPath}` : targetRootName
    setStatus(
      `Rescan complete for ${label}. Added ${totals.added}, duplicates: ${totals.duplicates}, skipped >100MB: ${totals.tooLarge}, checked files: ${totals.checked}.`,
    )
  }

  const selectedContextItem = contextMenu.itemId
    ? historyItems.find((item) => item.id === contextMenu.itemId) || null
    : null
  const selectedContextFolder = contextMenu.scope === 'panel' ? contextMenu.folderTarget : null
  const selectedContextFolderPath = normalizeRelativePath(selectedContextFolder?.folderPath || '')
  const selectedContextFolderLabel = selectedContextFolderPath
    ? `${selectedContextFolder?.rootName || ''}/${selectedContextFolderPath}`
    : selectedContextFolder?.rootName || ''
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
  const collapseAllFolderNodes = () => {
    const next = {}
    const walk = (nodes) => {
      for (const node of nodes || []) {
        if (Array.isArray(node.children) && node.children.length > 0) {
          next[node.key] = true
          walk(node.children)
        }
      }
    }
    walk(panelFolderTree)
    setCollapsedFolderNodes(next)
  }
  const expandAllFolderNodes = () => {
    const next = {}
    const walk = (nodes) => {
      for (const node of nodes || []) {
        if (Array.isArray(node.children) && node.children.length > 0) {
          next[node.key] = false
          walk(node.children)
        }
      }
    }
    walk(panelFolderTree)
    setCollapsedFolderNodes(next)
  }
  const toggleFolderNode = (nodeKey, depth) => {
    if (!nodeKey) return
    setCollapsedFolderNodes((prev) => {
      const defaultCollapsed = depth > 0
      const isCollapsed = prev[nodeKey] ?? defaultCollapsed
      return {
        ...prev,
        [nodeKey]: !isCollapsed,
      }
    })
  }
  const selectFolderForHome = (node) => {
    if (!node) return
    const rootName = String(node.rootName || node.name || '(unknown root)')
    const folderPath = node.isRoot ? '' : node.fullPath
    setHomeFolderFilter((prev) => {
      if (prev && prev.rootName === rootName && prev.folderPath === folderPath) {
        return null
      }
      return { rootName, folderPath }
    })
    if (hasActivePanorama) {
      closePanoramaToHome()
    }
  }
  const renderFolderTreeNodes = (nodes, depth = 0) =>
    nodes.map((node) => {
      const hasChildren = Array.isArray(node.children) && node.children.length > 0
      const defaultCollapsed = depth > 0
      const isCollapsed = hasChildren ? collapsedFolderNodes[node.key] ?? defaultCollapsed : false
      const rootName = String(node.rootName || node.name || '(unknown root)')
      const folderPath = node.isRoot ? '' : node.fullPath
      const isSelected = Boolean(homeFolderFilter && homeFolderFilter.rootName === rootName && homeFolderFilter.folderPath === folderPath)
      return (
        <div key={node.key} className="panel-folder-node">
          <button
            type="button"
            className={`panel-folder-row ${hasChildren ? 'is-expandable' : 'is-leaf'} ${isSelected ? 'is-selected' : ''}`}
            style={{ paddingLeft: `${10 + depth * 14}px` }}
            title={node.fullPath}
            onContextMenu={(event) =>
              openContextMenu(event, null, {
                scope: 'panel',
                folderTarget: {
                  rootName,
                  folderPath,
                },
              })
            }
            onClick={() => {
              selectFolderForHome(node)
            }}
          >
            <span
              className="panel-folder-chevron"
              onClick={(event) => {
                event.stopPropagation()
                if (!hasChildren) return
                toggleFolderNode(node.key, depth)
              }}
            >
              {hasChildren ? (isCollapsed ? '+' : '-') : ''}
            </span>
            <span className="panel-folder-name">{node.name}</span>
            <span className="panel-folder-count">{node.count}</span>
          </button>
          {hasChildren && !isCollapsed && <div>{renderFolderTreeNodes(node.children, depth + 1)}</div>}
        </div>
      )
    })

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
        <button
          type="button"
          className={`toolbar-photo-btn ${isPhotoModeActive ? 'is-active' : ''}`}
          disabled={!hasRenderablePanorama}
          aria-label={t('strings.openPhotoFrame')}
          onClick={togglePhotoFrameMode}
        >
          {t('strings.photoFromPanorama')}
        </button>
        <button
          type="button"
          className={`toolbar-edit-btn ${isEditMode ? 'is-active' : ''}`}
          disabled={!hasRenderablePanorama}
          aria-label={isEditMode ? t('strings.closeEdit') : t('strings.editPanorama')}
          onClick={() => {
            if (!hasRenderablePanorama) return
            setIsEditMode((prev) => !prev)
          }}
        >
          {isEditMode ? t('strings.closeEdit') : t('strings.editPanorama')}
        </button>
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
        {isScanInProgress && (
          <button type="button" className="status-cancel-btn" onClick={cancelScan}>
            {t('strings.cancelScan')}
          </button>
        )}
        <span className="status-side-group">
          {homeFolderFilter && (
            <span className="status-filter-wrap">
              <span>Filter:</span>
              <button type="button" className="status-filter-pill" onClick={() => setHomeFolderFilter(null)}>
                {activeHomeFolderFilterLabel} x
              </button>
            </span>
          )}
          <span className="status-side" aria-label="Library stats">
            {t('strings.countPanoramas')}: <strong>{historyItems.length}</strong> | {t('strings.connectedFolders')}:{' '}
            <strong>{connectedRootCount}</strong> | {t('strings.dbSize')}: <strong>{formatBytes(displayedDbBytes)}</strong>
          </span>
        </span>
      </p>
      <div className="viewer-wrap">
        <div ref={containerRef} className="viewer" />
        {showEmptyLibraryFallback && (
          <div className="empty-library-fallback" onContextMenu={(event) => openContextMenu(event, null, 'home')}>
            <img
              src="/empty-library-bg.jpg"
              alt=""
              className="empty-library-fallback-bg"
              draggable={false}
            />
            <div className="empty-library-fallback-shade" />
            <div className="empty-library-fallback-card">
              <h2>{t('strings.emptyLibraryTitle')}</h2>
              <p>{t('strings.emptyLibraryHint')}</p>
            </div>
          </div>
        )}
        {showLocationPanel && showGpsMapOverlay && hasRenderablePanorama && activeGpsCoords && (
          <div className="map-overlay" aria-label="Panorama GPS location">
            <div className="map-overlay-head">
              <span>GPS</span>
              <a
                href={`https://www.openstreetmap.org/?mlat=${activeGpsCoords.lat}&mlon=${activeGpsCoords.lon}#map=16/${activeGpsCoords.lat}/${activeGpsCoords.lon}`}
                target="_blank"
                rel="noreferrer"
              >
                Open
              </a>
            </div>
            <iframe title="Location map" src={mapSrc} loading="lazy" />
            <p>
              {activeGpsCoords.lat.toFixed(6)}, {activeGpsCoords.lon.toFixed(6)}
            </p>
          </div>
        )}
        {showLocationPanel && showGpsMapOverlay && hasRenderablePanorama && !activeGpsCoords && (
          <div className="map-overlay map-overlay-empty" aria-live="polite">
            {hasAnyGpsData ? 'No valid GPS coordinates in EXIF.' : 'No GPS data in EXIF.'}
          </div>
        )}
        {showLocationPanel && hasRenderablePanorama && panoramaCaptionLines.length > 0 && (
          <div className="panorama-caption" aria-live="polite">
            {panoramaCaptionLines.map((line, index) => (
              <div key={`${line}-${index}`}>{line}</div>
            ))}
          </div>
        )}
        {hasRenderablePanorama && isEditMode && projectedMaskPreviews.length > 0 && (
          <div className="viewer-mask-preview-layer">
            <svg className="viewer-mask-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
              {projectedMaskPreviews.map((mask) => (
                <polygon
                  key={`preview-poly-${mask.id}`}
                  className="viewer-mask-polygon"
                  points={mask.points.map((p) => `${(p.x * 100).toFixed(3)},${(p.y * 100).toFixed(3)}`).join(' ')}
                />
              ))}
            </svg>
            {projectedMaskPreviews.map((mask) => (
              <div key={`preview-ui-${mask.id}`}>
                <span
                  className="viewer-mask-id"
                  style={{
                    left: `${mask.labelX * 100}%`,
                    top: `${mask.labelY * 100}%`,
                  }}
                >
                  #{maskOrderById.get(mask.id) || '?'}
                </span>
                <button
                  type="button"
                  className="viewer-mask-remove"
                  style={{
                    left: `${mask.removeX * 100}%`,
                    top: `${mask.removeY * 100}%`,
                  }}
                  onClick={(event) => {
                    event.stopPropagation()
                    removeMask(mask.id)
                  }}
                  aria-label={`Remove mask #${maskOrderById.get(mask.id) || ''}`}
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}
        {hasRenderablePanorama && isMaskDrawMode && (
          <div
            className="viewer-mask-overlay"
            onPointerDown={handleViewerMaskPointerDown}
            onPointerMove={handleViewerMaskPointerMove}
            onPointerUp={handleViewerMaskPointerUp}
            onPointerCancel={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (typeof event.currentTarget?.releasePointerCapture === 'function') {
                event.currentTarget.releasePointerCapture(event.pointerId)
              }
              viewerMaskDragRef.current = null
              setViewerMaskDraft(null)
            }}
          >
            {viewerMaskDraft && (
              <div
                className="viewer-mask-draft"
                style={{
                  left: `${viewerMaskDraft.left}px`,
                  top: `${viewerMaskDraft.top}px`,
                  width: `${viewerMaskDraft.width}px`,
                  height: `${viewerMaskDraft.height}px`,
                }}
              />
            )}
          </div>
        )}
        {hasRenderablePanorama && isEditMode && isExportPanelOpen && exportMode === 'photo' && exportFrameRect && (
          <div className="photo-export-overlay" aria-hidden="true">
            <div
              className="photo-export-frame"
              style={{
                left: `${exportFrameRect.x}px`,
                top: `${exportFrameRect.y}px`,
                width: `${exportFrameRect.width}px`,
                height: `${exportFrameRect.height}px`,
              }}
            />
          </div>
        )}
        {hasRenderablePanorama && (
          <>
            <button
              type="button"
              className="viewer-close-btn"
              aria-label="Close panorama"
              onClick={closePanoramaToHome}
            >
              x
            </button>
            {isEditMode && (
              <section className="edit-panel" aria-label={t('strings.editPanelTitle')}>
                <h3>{t('strings.editPanelTitle')}</h3>
                {!isAdjustmentsPanelOpen && (
                  <>
                    <div className="edit-section">
                      <div className="edit-section-head">
                        <span>{t('strings.editSectionGps')}</span>
                      </div>
                      <div className="edit-gps-row">
                        <label>
                          {t('strings.lat')}
                          <input
                            type="text"
                            value={latInput}
                            onChange={(event) => setLatInput(event.target.value)}
                            onBlur={applyManualGpsInputs}
                          />
                        </label>
                        <label>
                          {t('strings.lon')}
                          <input
                            type="text"
                            value={lonInput}
                            onChange={(event) => setLonInput(event.target.value)}
                            onBlur={applyManualGpsInputs}
                          />
                        </label>
                      </div>
                      <div className="edit-actions">
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => runWithGpsOverrideGuard(() => setIsMapPickerOpen(true))}
                        >
                          {t('strings.pickGpsOnMap')}
                        </button>
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() =>
                            runWithGpsOverrideGuard(() => {
                              setEditedGpsCoords(null)
                              setHasGpsOverride(true)
                            })
                          }
                        >
                          {t('strings.removeGps')}
                        </button>
                      </div>
                      <div
                        className={`gps-photo-dropzone ${isGpsPhotoDragging ? 'is-active' : ''}`}
                        onDragEnter={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          setIsGpsPhotoDragging(true)
                        }}
                        onDragOver={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                        }}
                        onDragLeave={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          setIsGpsPhotoDragging(false)
                        }}
                        onDrop={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          setIsGpsPhotoDragging(false)
                          const file = event.dataTransfer?.files?.[0]
                          if (file) applyGpsFromReferencePhoto(file)
                        }}
                        onClick={() => gpsPhotoInputRef.current?.click()}
                      >
                        <strong>{t('strings.gpsFromPhoto')}</strong>
                        <span>{t('strings.gpsFromPhotoHint')}</span>
                      </div>
                    </div>

                    <div className="edit-section">
                      <div className="edit-section-head">
                        <span>{t('strings.editSectionMasks')}</span>
                      </div>
                      <div className="edit-actions">
                        <button
                          type="button"
                          className={`secondary-btn ${isMaskDrawMode ? 'is-active' : ''}`}
                          onClick={() => {
                            setIsMaskDrawMode((prev) => !prev)
                            setViewerMaskDraft(null)
                            viewerMaskDragRef.current = null
                          }}
                        >
                          {isMaskDrawMode ? t('strings.stopDrawing') : t('strings.drawOnPanorama')}
                        </button>
                        <button type="button" className="secondary-btn" onClick={() => setPixelateMasks([])}>
                          {t('strings.clearMasks')}
                        </button>
                      </div>
                      <div className="edit-mask-count">
                        {t('strings.maskCount')}: <strong>{pixelateMasks.length}</strong>
                      </div>
                      <div className="edit-mask-controls">
                        <AnimatedDropdown
                          label={t('strings.maskEffect')}
                          value={maskEffectMode}
                          options={maskEffectOptions}
                          onChange={setMaskEffectMode}
                        />
                        <label>
                          <span>
                            {t('strings.maskStrength')}: <strong>{maskEffectStrength}</strong>
                          </span>
                          <input
                            type="range"
                            min="8"
                            max="72"
                            step="1"
                            value={maskEffectStrength}
                            onChange={(event) => setMaskEffectStrength(Number(event.target.value))}
                          />
                        </label>
                      </div>
                      {pixelateMasks.length > 0 && (
                        <div className="edit-mask-list">
                          {pixelateMasks.map((mask, index) => (
                            <div key={mask.id} className="edit-mask-item">
                              <span>#{index + 1}</span>
                              <button type="button" className="mask-mini-remove" onClick={() => removeMask(mask.id)}>
                                x
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                <div className={`edit-bottom-drawer ${isAdjustmentsPanelOpen ? 'is-open' : ''}`}>
                  <button
                    type="button"
                    className="edit-bottom-drawer-toggle"
                    onClick={() => setIsAdjustmentsPanelOpen((prev) => !prev)}
                    aria-expanded={isAdjustmentsPanelOpen}
                  >
                    <span>{t('strings.editSectionAdjustments')}</span>
                    <span className="edit-bottom-drawer-chevron">{isAdjustmentsPanelOpen ? '^' : 'v'}</span>
                  </button>
                  <div className="edit-bottom-drawer-body">
                    <div className="edit-mask-controls">
                      <AnimatedDropdown
                        label={t('strings.adjustmentPreset')}
                        value={adjustmentPreset}
                        options={adjustmentPresetOptions}
                        onChange={applyAdjustmentPreset}
                      />
                      <AnimatedDropdown
                        label={t('strings.lut')}
                        value={lutMode}
                        options={lutOptions}
                        onChange={(nextValue) => {
                          setLutMode(nextValue)
                          if (adjustmentPreset !== 'custom') setAdjustmentPreset('custom')
                        }}
                      />
                      <label>
                        <span>
                          {t('strings.exposure')}: <strong>{adjustments.exposure.toFixed(2)}</strong>
                        </span>
                        <input
                          type="range"
                          min="-2"
                          max="2"
                          step="0.05"
                          value={adjustments.exposure}
                          onChange={(event) => setSingleAdjustment('exposure', event.target.value)}
                          onDoubleClick={() => resetSingleAdjustment('exposure')}
                        />
                      </label>
                      <label>
                        <span>
                          {t('strings.contrast')}: <strong>{adjustments.contrast.toFixed(2)}</strong>
                        </span>
                        <input
                          type="range"
                          min="-1"
                          max="1"
                          step="0.02"
                          value={adjustments.contrast}
                          onChange={(event) => setSingleAdjustment('contrast', event.target.value)}
                          onDoubleClick={() => resetSingleAdjustment('contrast')}
                        />
                      </label>
                      <label>
                        <span>
                          {t('strings.saturation')}: <strong>{adjustments.saturation.toFixed(2)}</strong>
                        </span>
                        <input
                          type="range"
                          min="0"
                          max="2"
                          step="0.02"
                          value={adjustments.saturation}
                          onChange={(event) => setSingleAdjustment('saturation', event.target.value)}
                          onDoubleClick={() => resetSingleAdjustment('saturation')}
                        />
                      </label>
                      <label>
                        <span>
                          {t('strings.whiteBalance')}: <strong>{adjustments.temperature.toFixed(2)}</strong>
                        </span>
                        <input
                          type="range"
                          min="-1"
                          max="1"
                          step="0.02"
                          value={adjustments.temperature}
                          onChange={(event) => setSingleAdjustment('temperature', event.target.value)}
                          onDoubleClick={() => resetSingleAdjustment('temperature')}
                        />
                      </label>
                      <label>
                        <span>
                          {t('strings.tint')}: <strong>{adjustments.tint.toFixed(2)}</strong>
                        </span>
                        <input
                          type="range"
                          min="-1"
                          max="1"
                          step="0.02"
                          value={adjustments.tint}
                          onChange={(event) => setSingleAdjustment('tint', event.target.value)}
                          onDoubleClick={() => resetSingleAdjustment('tint')}
                        />
                      </label>
                      <label>
                        <span>
                          {t('strings.highlights')}: <strong>{adjustments.highlights.toFixed(2)}</strong>
                        </span>
                        <input
                          type="range"
                          min="-1"
                          max="1"
                          step="0.02"
                          value={adjustments.highlights}
                          onChange={(event) => setSingleAdjustment('highlights', event.target.value)}
                          onDoubleClick={() => resetSingleAdjustment('highlights')}
                        />
                      </label>
                      <label>
                        <span>
                          {t('strings.shadows')}: <strong>{adjustments.shadows.toFixed(2)}</strong>
                        </span>
                        <input
                          type="range"
                          min="-1"
                          max="1"
                          step="0.02"
                          value={adjustments.shadows}
                          onChange={(event) => setSingleAdjustment('shadows', event.target.value)}
                          onDoubleClick={() => resetSingleAdjustment('shadows')}
                        />
                      </label>
                      <label>
                        <span>
                          {t('strings.sharpen')}: <strong>{adjustments.sharpen.toFixed(2)}</strong>
                        </span>
                        <input
                          type="range"
                          min="0"
                          max="2"
                          step="0.02"
                          value={adjustments.sharpen}
                          onChange={(event) => setSingleAdjustment('sharpen', event.target.value)}
                          onDoubleClick={() => resetSingleAdjustment('sharpen')}
                        />
                      </label>
                      <label>
                        <span>
                          {t('strings.bloom')}: <strong>{adjustments.bloom.toFixed(2)}</strong>
                        </span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={adjustments.bloom}
                          onChange={(event) => setSingleAdjustment('bloom', event.target.value)}
                          onDoubleClick={() => resetSingleAdjustment('bloom')}
                        />
                      </label>
                      <label>
                        <span>
                          {t('strings.vignette')}: <strong>{adjustments.vignette.toFixed(2)}</strong>
                        </span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={adjustments.vignette}
                          onChange={(event) => setSingleAdjustment('vignette', event.target.value)}
                          onDoubleClick={() => resetSingleAdjustment('vignette')}
                        />
                      </label>
                      <label>
                        <span>
                          {t('strings.grain')}: <strong>{adjustments.grain.toFixed(3)}</strong>
                        </span>
                        <input
                          type="range"
                          min="0"
                          max="0.3"
                          step="0.005"
                          value={adjustments.grain}
                          onChange={(event) => setSingleAdjustment('grain', event.target.value)}
                          onDoubleClick={() => resetSingleAdjustment('grain')}
                        />
                      </label>
                    </div>
                    <div className="edit-actions">
                      <button
                        type="button"
                        className="secondary-btn"
                        disabled={!hasActiveAdjustments}
                        onClick={() => {
                          setAdjustments({ ...DEFAULT_ADJUSTMENTS })
                          setAdjustmentPreset('custom')
                          setLutMode('none')
                        }}
                      >
                        {t('strings.resetAdjustments')}
                      </button>
                    </div>
                  </div>
                </div>

                <input
                  ref={gpsPhotoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden-input"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) applyGpsFromReferencePhoto(file)
                    event.target.value = ''
                  }}
                />
                <div className="edit-actions edit-footer-actions">
                  <button type="button" className="secondary-btn" onClick={() => setIsEditMode(false)}>
                    {t('strings.cancel')}
                  </button>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => {
                      setIsExportPanelOpen((prev) => !prev)
                      if (exportMode !== 'panorama' && exportMode !== 'photo') setExportMode('panorama')
                    }}
                  >
                    {t('strings.openExportPanel')}
                  </button>
                </div>
              </section>
            )}
            {isEditMode && isExportPanelOpen && (
              <section className="export-panel" aria-label={t('strings.exportPanelTitle')}>
                <h3>{t('strings.exportPanelTitle')}</h3>
                <div className="edit-mask-controls">
                  <AnimatedDropdown
                    label={t('strings.exportMode')}
                    value={exportMode}
                    options={exportModeOptions}
                    onChange={(nextValue) => setExportMode(nextValue)}
                  />
                  {exportMode === 'photo' && (
                    <>
                      <AnimatedDropdown
                        label={t('strings.exportAspect')}
                        value={exportAspect}
                        options={exportAspectOptions}
                        onChange={setExportAspect}
                      />
                      <label>
                        <span>
                          {t('strings.exportFrameSize')}: <strong>{exportFrameScale}%</strong>
                        </span>
                        <input
                          type="range"
                          min="30"
                          max="100"
                          step="1"
                          value={exportFrameScale}
                          onChange={(event) => setExportFrameScale(Number(event.target.value))}
                        />
                      </label>
                      <p className="export-frame-hint">{t('strings.exportFrameHint')}</p>
                    </>
                  )}
                </div>
                <div className="edit-actions export-panel-actions">
                  <button type="button" className="secondary-btn" onClick={() => setIsExportPanelOpen(false)}>
                    {t('strings.cancel')}
                  </button>
                  {exportMode === 'photo' ? (
                    <button type="button" className="primary-btn" onClick={exportPhotoJpeg}>
                      {t('strings.exportPhotoJpeg')}
                    </button>
                  ) : (
                    <button type="button" className="primary-btn" onClick={exportEditedJpeg}>
                      {t('strings.exportEditedJpeg')}
                    </button>
                  )}
                </div>
              </section>
            )}
            {previousHomeItem && (
              <button
                type="button"
                className="viewer-nav viewer-nav-left"
                aria-label="Previous panorama"
                title="Previous panorama"
                onClick={() => openPanoramaFromLibrary(previousHomeItem)}
              >
                <span>{'<'}</span>
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
                <span>{'>'}</span>
              </button>
            )}
          </>
        )}
        {(!hasRenderablePanorama || historyItems.length === 0) && (
          <div
            ref={homeOverlayRef}
            className={`home-grid-overlay ${isLibraryEmpty ? 'is-library-empty' : ''}`}
            onContextMenu={(event) => openContextMenu(event, null, 'home')}
          >
            {filteredHomeItems.length === 0 ? (
              <div className="home-empty">
                {isLibraryEmpty ? (
                  <>
                    <h2>{t('strings.emptyLibraryTitle')}</h2>
                    <p>{t('strings.emptyLibraryHint')}</p>
                  </>
                ) : (
                  <>
                    <h2>No panoramas for active filter</h2>
                    <p>Change filters in the context menu or add panoramas to the library.</p>
                  </>
                )}
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
                    onClick={() => {
                      if (hasHomeSelection) {
                        toggleHomeSelection(item.id, !selectedHomeIdSet.has(item.id))
                        return
                      }
                      openPanoramaFromLibrary(item)
                    }}
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
                        aria-label={`Select ${item.name}`}
                      />
                      <span className="home-tile-select-mark" aria-hidden="true" />
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
              {panelContentMode === 'panoramas' && (
                <>
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
                </>
              )}
              {panelContentMode === 'folders' && (
                <>
                  {panelFolderTree.length === 0 && <p className="history-empty">No folders for active filter.</p>}
                  {panelFolderTree.length > 0 && <div className="panel-folder-tree">{renderFolderTreeNodes(panelFolderTree)}</div>}
                </>
              )}
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
            <>
              <button
                type="button"
                className={`context-menu-item ${panelContentMode === 'panoramas' ? 'active' : ''}`}
                onClick={() => {
                  setPanelContentMode('panoramas')
                  closeContextMenuAfterMenuAction()
                }}
              >
                <span className="cm-icon cm-expand" />
                <span>{t('strings.showPanoramas')}</span>
              </button>
              <button
                type="button"
                className={`context-menu-item ${panelContentMode === 'folders' ? 'active' : ''}`}
                onClick={() => {
                  setPanelContentMode('folders')
                  closeContextMenuAfterMenuAction()
                }}
              >
                <span className="cm-icon cm-folder" />
                <span>{t('strings.showFolders')}</span>
              </button>
            </>
          )}
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
          {contextMenu.scope === 'panel' && panelContentMode === 'panoramas' && (
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
          {contextMenu.scope === 'panel' && panelContentMode === 'folders' && (
            <>
              <button
                type="button"
                className="context-menu-item"
                disabled={!selectedContextFolder || selectedContextFolder.rootName === '(unknown root)' || isScanInProgress}
                onClick={() => {
                  rescanFolderFromContext()
                  closeContextMenuAfterMenuAction()
                }}
              >
                <span className="cm-icon cm-folder" />
                <span>{selectedContextFolderLabel ? `Rescan folder: ${selectedContextFolderLabel}` : 'Rescan folder'}</span>
              </button>
              <button
                type="button"
                className="context-menu-item"
                onClick={() => {
                  collapseAllFolderNodes()
                  closeContextMenuAfterMenuAction()
                }}
              >
                <span className="cm-icon cm-collapse" />
                <span>{t('strings.collapseAllFolders')}</span>
              </button>
              <button
                type="button"
                className="context-menu-item"
                onClick={() => {
                  expandAllFolderNodes()
                  closeContextMenuAfterMenuAction()
                }}
              >
                <span className="cm-icon cm-expand" />
                <span>{t('strings.expandAllFolders')}</span>
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
              {hasActivePanorama && (
                <button
                  type="button"
                  className="context-menu-item"
                  onClick={() => {
                    openPhotoFrameMode()
                    closeContextMenuAfterMenuAction()
                  }}
                >
                  <span className="cm-icon cm-image" />
                  <span>{t('strings.openPhotoFrame')}</span>
                </button>
              )}
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
                className="context-menu-item"
                onClick={() => {
                  repairLibraryLinks()
                  closeContextMenuAfterMenuAction()
                }}
              >
                <span className="cm-icon cm-folder" />
                <span>{t('strings.repairLibraryLinks')}</span>
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
              {homeFolderFilter && (
                <button
                  type="button"
                  className="context-menu-item"
                  onClick={() => {
                    setHomeFolderFilter(null)
                    closeContextMenuAfterMenuAction()
                  }}
                >
                  <span className="cm-icon cm-clear" />
                  <span>{t('strings.clearFolderFilter')}</span>
                </button>
              )}
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
            <>
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
            </>
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

      {isGpsOverrideConfirmOpen && (
        <div className="confirm-backdrop" onClick={closeGpsOverrideConfirm}>
          <div className="confirm-modal" onClick={(event) => event.stopPropagation()}>
            <h3>{t('strings.gpsOverwriteTitle')}</h3>
            <p>{t('strings.gpsOverwriteMessage')}</p>
            <div className="confirm-actions">
              <button type="button" className="secondary-btn" onClick={closeGpsOverrideConfirm}>
                Cancel
              </button>
              <button type="button" className="danger-btn" onClick={confirmGpsOverride}>
                {t('strings.replaceGps')}
              </button>
            </div>
          </div>
        </div>
      )}

      {isMapPickerOpen && (
        <div className="modal-backdrop" onClick={() => setIsMapPickerOpen(false)}>
          <div className="modal gps-map-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h2>{t('strings.pickGpsOnMap')}</h2>
              <button type="button" onClick={() => setIsMapPickerOpen(false)}>
                Close
              </button>
            </div>
            <p>{t('strings.pickGpsHint')}</p>
            <div ref={gpsMapContainerRef} className="gps-map-canvas" />
          </div>
        </div>
      )}

      {isMaskEditorOpen && (
        <div className="modal-backdrop" onClick={() => setIsMaskEditorOpen(false)}>
          <div className="modal mask-editor-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h2>{t('strings.maskEditorTitle')}</h2>
              <button type="button" onClick={() => setIsMaskEditorOpen(false)}>
                Close
              </button>
            </div>
            <p>{t('strings.maskEditorHint')}</p>
            <div
              ref={maskSurfaceRef}
              className="mask-editor-surface"
              onPointerDown={handleMaskPointerDown}
              onPointerMove={handleMaskPointerMove}
              onPointerUp={commitMaskDraft}
              onPointerCancel={() => {
                maskPointerRef.current = null
                setMaskDraft(null)
              }}
              onPointerLeave={(event) => {
                if ((event.buttons & 1) === 1) return
                if (!maskPointerRef.current) return
                maskPointerRef.current = null
                setMaskDraft(null)
              }}
            >
              <img src={currentUrlRef.current || ''} alt="Mask preview" className="mask-editor-image" />
              {pixelateMasks.map((mask) => (
                <div
                  key={mask.id}
                  className="mask-rect"
                  style={{
                    left: `${mask.x * 100}%`,
                    top: `${mask.y * 100}%`,
                    width: `${mask.width * 100}%`,
                    height: `${mask.height * 100}%`,
                  }}
                >
                  <button
                    type="button"
                    className="mask-rect-remove"
                    onClick={(event) => {
                      event.stopPropagation()
                      removeMask(mask.id)
                    }}
                    aria-label="Remove mask"
                  >
                    x
                  </button>
                </div>
              ))}
              {maskDraft && (
                <div
                  className="mask-rect mask-rect-draft"
                  style={{
                    left: `${maskDraft.x * 100}%`,
                    top: `${maskDraft.y * 100}%`,
                    width: `${maskDraft.width * 100}%`,
                    height: `${maskDraft.height * 100}%`,
                  }}
                />
              )}
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



