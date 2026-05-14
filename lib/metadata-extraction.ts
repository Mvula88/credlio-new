/**
 * FREE Metadata Extraction Utilities
 * Client-side document verification for fraud detection
 * NO external APIs or costs
 *
 * NOTE: This module uses dynamic imports to avoid SSR issues.
 * pdfjs-dist requires browser APIs (DOMMatrix) that don't exist in Node.js.
 */

// PDF.js is loaded dynamically to avoid SSR issues (DOMMatrix not available in Node.js)
// We use a promise-based singleton pattern to ensure single initialization
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null

// Initialize PDF.js only on client side
async function getPdfJs(): Promise<typeof import('pdfjs-dist') | null> {
  // Server-side check
  if (typeof window === 'undefined') {
    return null
  }

  // Return cached promise if already loading/loaded
  if (pdfjsPromise) {
    return pdfjsPromise
  }

  // Create a new promise for loading
  pdfjsPromise = (async () => {
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`
    return pdfjs
  })()

  return pdfjsPromise
}

export interface PDFMetadata {
  // Basic metadata
  title?: string
  author?: string
  subject?: string
  keywords?: string
  creator?: string  // Software that created the document
  producer?: string // PDF producer
  creationDate?: Date
  modificationDate?: Date

  // File information
  pageCount?: number
  fileSize?: number
  pdfVersion?: string

  // Fraud detection flags
  wasModified: boolean
  suspiciousCreator: boolean
  dateMismatch: boolean
  recentCreation: boolean

  // Risk factors
  riskFactors: string[]
  riskScore: number // 0-100
}

export interface ImageMetadata {
  // EXIF data
  make?: string       // Camera manufacturer
  model?: string      // Camera model
  software?: string   // Software used
  dateTime?: Date     // When photo was taken (DateTimeOriginal)
  modifyDate?: Date   // When file was last written
  gps?: {
    latitude?: number
    longitude?: number
  }

  // File information
  width?: number
  height?: number
  fileSize?: number
  format?: string

  // Raw EXIF (for storing in DB)
  exifRaw?: Record<string, unknown>

  // Fraud detection flags — these map 1:1 to borrower_documents columns
  hasBeenEdited: boolean      // → edited_with_software
  suspiciousSoftware: boolean // legacy alias of hasBeenEdited (kept for older callers)
  noExifData: boolean         // → missing_exif_data
  isScreenshot: boolean       // → is_screenshot
  modifiedAfterCreation: boolean // → modified_after_creation

  // Risk factors
  riskFactors: string[]
  riskScore: number
}

export interface VideoMetadata {
  duration?: number
  width?: number
  height?: number
  fileSize?: number
  format?: string
  codec?: string

  // Fraud detection
  riskFactors: string[]
  riskScore: number
}

/**
 * Extract metadata from PDF files
 */
export async function extractPDFMetadata(file: File): Promise<PDFMetadata> {
  const riskFactors: string[] = []
  let riskScore = 0

  try {
    // Load PDF.js dynamically (client-side only)
    const pdfjsLib = await getPdfJs()
    if (!pdfjsLib) {
      throw new Error('PDF.js is not available (server-side rendering)')
    }

    // Read file
    const arrayBuffer = await file.arrayBuffer()
    const loadingTask = pdfjsLib.getDocument(arrayBuffer)
    const pdf = await loadingTask.promise
    const metadata = await pdf.getMetadata()
    const info = metadata.info as any

    // Parse dates
    const creationDate = info.CreationDate
      ? parsePDFDate(info.CreationDate)
      : undefined
    const modificationDate = info.ModDate
      ? parsePDFDate(info.ModDate)
      : undefined

    // Check if modified
    const wasModified = !!(creationDate && modificationDate &&
      modificationDate.getTime() !== creationDate.getTime())

    if (wasModified) {
      riskFactors.push('Document was modified after creation')
      riskScore += 15
    }

    // Check creator software
    const creator = info.Creator || ''
    const producer = info.Producer || ''
    const suspiciousCreator = checkSuspiciousCreator(creator, producer)

    if (suspiciousCreator) {
      riskFactors.push(`Created with suspicious software: ${creator}`)
      riskScore += 25
    }

    // Check for recent creation (created recently but might claim to be old)
    const now = new Date()
    const recentCreation = creationDate
      ? (now.getTime() - creationDate.getTime()) < (24 * 60 * 60 * 1000) // Less than 24 hours old
      : false

    if (recentCreation) {
      riskFactors.push('Document created very recently')
      riskScore += 10
    }

    // Check for date mismatches
    const dateMismatch = checkDateMismatch(creationDate, modificationDate)
    if (dateMismatch) {
      riskFactors.push('Suspicious date patterns detected')
      riskScore += 15
    }

    // Check if minimal/no metadata (could be scrubbed)
    if (!creator && !producer && !info.Author) {
      riskFactors.push('Missing metadata - may have been scrubbed')
      riskScore += 20
    }

    return {
      title: info.Title,
      author: info.Author,
      subject: info.Subject,
      keywords: info.Keywords,
      creator: creator,
      producer: producer,
      creationDate,
      modificationDate,
      pageCount: pdf.numPages,
      fileSize: file.size,
      pdfVersion: info.PDFFormatVersion,
      wasModified,
      suspiciousCreator,
      dateMismatch,
      recentCreation,
      riskFactors,
      riskScore: Math.min(riskScore, 100)
    }
  } catch (error: any) {
    console.error('Error extracting PDF metadata:', error)
    return {
      wasModified: false,
      suspiciousCreator: false,
      dateMismatch: false,
      recentCreation: false,
      riskFactors: ['Failed to extract metadata'],
      riskScore: 50 // Unknown = medium risk
    }
  }
}

// Software signatures that indicate the photo was edited or fabricated rather
// than being a raw camera capture. Lowercased; substring match.
const EDITING_SOFTWARE_SIGNATURES = [
  'photoshop', 'lightroom', 'gimp', 'pixlr', 'canva', 'picsart',
  'snapseed', 'facetune', 'meitu', 'beautyplus', 'youcam',
  'paint.net', 'paint', 'affinity', 'corel', 'acdsee',
  'gemini', 'midjourney', 'stable diffusion', 'dall-e', 'firefly'
]

const SCREENSHOT_SOFTWARE_SIGNATURES = [
  'screenshot', 'screen capture', 'snipping tool', 'lightshot',
  'snagit', 'greenshot', 'shareX'
]

function hasSignature(value: string | undefined, signatures: string[]): boolean {
  if (!value) return false
  const lower = value.toLowerCase()
  return signatures.some(sig => lower.includes(sig))
}

/**
 * Extract metadata from image files using exifr.
 * Returns fraud-detection flags that map directly to borrower_documents columns.
 */
export async function extractImageMetadata(file: File): Promise<ImageMetadata> {
  const riskFactors: string[] = []
  let riskScore = 0

  // Pull dimensions in parallel with EXIF parsing.
  const [img, exif] = await Promise.all([
    loadImage(file).catch(() => null),
    parseExif(file).catch(() => null),
  ])

  const make = exif?.Make as string | undefined
  const model = exif?.Model as string | undefined
  const software = (exif?.Software ?? exif?.CreatorTool) as string | undefined
  const dateTime = (exif?.DateTimeOriginal ?? exif?.CreateDate) as Date | undefined
  const modifyDate = exif?.ModifyDate as Date | undefined

  // No EXIF at all, or EXIF with no camera-origin tags. A real phone photo
  // always carries Make + Model + DateTimeOriginal — absence means the file
  // was re-saved through software that stripped EXIF (or was never a camera
  // capture in the first place).
  const hasCameraSignature = !!(make && model && dateTime)
  const noExifData = !exif || Object.keys(exif).length === 0 || !hasCameraSignature

  if (noExifData) {
    riskFactors.push('Missing photo metadata')
    riskScore += 60
  }

  // Software tag identifies the program that last wrote the file. Photoshop /
  // GIMP / AI generators leave a fingerprint here.
  const hasBeenEdited = hasSignature(software, EDITING_SOFTWARE_SIGNATURES) ||
                        hasSignature(file.name, ['photoshop', 'gimp', 'edited'])

  if (hasBeenEdited) {
    riskFactors.push(`Edited with photo software${software ? ': ' + software : ''}`)
    riskScore += 70
  }

  // Screenshots: either the software tag says so, or the filename does (most
  // platforms prefix screenshots with "Screenshot" or "Screen Shot").
  const filenameLooksLikeScreenshot = /^(screenshot|screen[\s_-]?shot)/i.test(file.name)
  const isScreenshot = hasSignature(software, SCREENSHOT_SOFTWARE_SIGNATURES) ||
                       filenameLooksLikeScreenshot

  if (isScreenshot) {
    riskFactors.push('Appears to be a screenshot')
    riskScore += 70
  }

  // Modified after creation: file was re-saved through some tool after the
  // camera wrote it. >10s tolerance to avoid flagging the EXIF write itself.
  let modifiedAfterCreation = false
  if (dateTime && modifyDate) {
    modifiedAfterCreation = modifyDate.getTime() - dateTime.getTime() > 10_000
    if (modifiedAfterCreation) {
      riskFactors.push('File modified after creation')
      riskScore += 40
    }
  }

  // Fresh capture is normal but worth recording.
  const fileDate = new Date(file.lastModified)
  const now = new Date()
  if ((now.getTime() - fileDate.getTime()) < (24 * 60 * 60 * 1000)) {
    riskFactors.push('Document created recently')
    riskScore += 10
  }

  // Suspiciously small files are often screenshots or heavily recompressed.
  if (file.size < 50_000) {
    riskFactors.push('File size very small — may be a screenshot or recompression')
    riskScore += 15
  }

  const gps = (exif?.latitude || exif?.longitude) ? {
    latitude: exif.latitude as number | undefined,
    longitude: exif.longitude as number | undefined,
  } : undefined

  return {
    make,
    model,
    software,
    dateTime,
    modifyDate,
    gps,
    width: img?.width,
    height: img?.height,
    fileSize: file.size,
    format: file.type,
    exifRaw: exif ?? undefined,
    hasBeenEdited,
    suspiciousSoftware: hasBeenEdited,
    noExifData,
    isScreenshot,
    modifiedAfterCreation,
    riskFactors,
    riskScore: Math.min(riskScore, 100),
  }
}

// Parse EXIF on the client using exifr. Dynamic import keeps the bundle off
// the server-side render path. Returns null when the file has no EXIF.
async function parseExif(file: File): Promise<Record<string, any> | null> {
  if (typeof window === 'undefined') return null
  const exifr = (await import('exifr')).default
  // `gps: true` exposes latitude/longitude as decimal degrees.
  const data = await exifr.parse(file, { gps: true })
  return (data && Object.keys(data).length > 0) ? data : null
}

/**
 * Extract metadata from video files
 */
export async function extractVideoMetadata(file: File): Promise<VideoMetadata> {
  const riskFactors: string[] = []
  let riskScore = 0

  try {
    // Create video element to get basic info
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)

    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve
      video.onerror = reject
      video.src = url
    })

    const duration = video.duration

    URL.revokeObjectURL(url)

    // Check duration (should be around 60 seconds for liveness check)
    if (duration < 30) {
      riskFactors.push('Video too short for proper verification')
      riskScore += 20
    } else if (duration > 120) {
      riskFactors.push('Video unusually long')
      riskScore += 10
    }

    // Check file size
    if (file.size < 500000) { // Less than 500KB
      riskFactors.push('Video file size suspiciously small')
      riskScore += 15
    }

    return {
      duration,
      width: video.videoWidth,
      height: video.videoHeight,
      fileSize: file.size,
      format: file.type,
      riskFactors,
      riskScore: Math.min(riskScore, 100)
    }
  } catch (error: any) {
    console.error('Error extracting video metadata:', error)
    return {
      riskFactors: ['Failed to extract video metadata'],
      riskScore: 50
    }
  }
}

/**
 * Generate SHA-256 hash of file
 */
export async function generateFileHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Generate hash of metadata object
 */
export function generateMetadataHash(metadata: any): string {
  const str = JSON.stringify(metadata, null, 0)
  // Simple hash for metadata (not cryptographic, just for verification)
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return hash.toString(16)
}

// Helper functions

function parsePDFDate(pdfDate: string): Date | undefined {
  try {
    // PDF date format: D:YYYYMMDDHHmmSSOHH'mm'
    const match = pdfDate.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/)
    if (match) {
      const [, year, month, day, hour, minute, second] = match
      return new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second)
      )
    }
  } catch (error: any) {
    console.error('Error parsing PDF date:', error)
  }
  return undefined
}

function checkSuspiciousCreator(creator: string, producer: string): boolean {
  const suspicious = [
    'photoshop',
    'gimp',
    'paint',
    'microsoft word',
    'microsoft excel',
    'google docs',
    'canva',
    'pixlr',
    'photoscape'
  ]

  const creatorLower = creator.toLowerCase()
  const producerLower = producer.toLowerCase()

  return suspicious.some(s =>
    creatorLower.includes(s) || producerLower.includes(s)
  )
}

function checkDateMismatch(creation?: Date, modification?: Date): boolean {
  if (!creation || !modification) return false

  // If modified more than 30 days after creation
  const diff = modification.getTime() - creation.getTime()
  const thirtyDays = 30 * 24 * 60 * 60 * 1000

  return diff > thirtyDays
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }

    img.src = url
  })
}

/**
 * Calculate overall risk level from score
 */
export function getRiskLevel(score: number): 'low' | 'medium' | 'high' {
  if (score <= 30) return 'low'
  if (score <= 60) return 'medium'
  return 'high'
}

/**
 * Get risk color for UI
 */
export function getRiskColor(level: 'low' | 'medium' | 'high'): string {
  switch (level) {
    case 'low': return 'text-green-600 bg-green-50'
    case 'medium': return 'text-yellow-600 bg-yellow-50'
    case 'high': return 'text-red-600 bg-red-50'
  }
}
