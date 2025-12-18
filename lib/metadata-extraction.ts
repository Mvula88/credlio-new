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
  dateTime?: Date     // When photo was taken
  gps?: {
    latitude?: number
    longitude?: number
  }

  // File information
  width?: number
  height?: number
  fileSize?: number
  format?: string

  // Fraud detection
  hasBeenEdited: boolean
  suspiciousSoftware: boolean
  noExifData: boolean

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

    // Parse dates
    const creationDate = metadata.info.CreationDate
      ? parsePDFDate(metadata.info.CreationDate)
      : undefined
    const modificationDate = metadata.info.ModDate
      ? parsePDFDate(metadata.info.ModDate)
      : undefined

    // Check if modified
    const wasModified = !!(creationDate && modificationDate &&
      modificationDate.getTime() !== creationDate.getTime())

    if (wasModified) {
      riskFactors.push('Document was modified after creation')
      riskScore += 15
    }

    // Check creator software
    const creator = metadata.info.Creator || ''
    const producer = metadata.info.Producer || ''
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
    if (!creator && !producer && !metadata.info.Author) {
      riskFactors.push('Missing metadata - may have been scrubbed')
      riskScore += 20
    }

    return {
      title: metadata.info.Title,
      author: metadata.info.Author,
      subject: metadata.info.Subject,
      keywords: metadata.info.Keywords,
      creator: creator,
      producer: producer,
      creationDate,
      modificationDate,
      pageCount: pdf.numPages,
      fileSize: file.size,
      pdfVersion: metadata.info.PDFFormatVersion,
      wasModified,
      suspiciousCreator,
      dateMismatch,
      recentCreation,
      riskFactors,
      riskScore: Math.min(riskScore, 100)
    }
  } catch (error) {
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

/**
 * Extract metadata from image files
 */
export async function extractImageMetadata(file: File): Promise<ImageMetadata> {
  const riskFactors: string[] = []
  let riskScore = 0

  try {
    // Use EXIF.js or similar library for EXIF extraction
    // For now, we'll do basic checks

    const img = await loadImage(file)

    // Check for editing software in filename
    const suspiciousSoftware = file.name.toLowerCase().includes('photoshop') ||
                               file.name.toLowerCase().includes('gimp') ||
                               file.name.toLowerCase().includes('edited')

    if (suspiciousSoftware) {
      riskFactors.push('Filename suggests image editing')
      riskScore += 20
    }

    // Check file size (suspiciously small might be screenshot)
    if (file.size < 50000) { // Less than 50KB
      riskFactors.push('File size very small - may be screenshot or compressed')
      riskScore += 15
    }

    // Check if very recent file
    const fileDate = new Date(file.lastModified)
    const now = new Date()
    if ((now.getTime() - fileDate.getTime()) < (24 * 60 * 60 * 1000)) {
      riskFactors.push('File modified within last 24 hours')
      riskScore += 10
    }

    return {
      width: img.width,
      height: img.height,
      fileSize: file.size,
      format: file.type,
      hasBeenEdited: false, // Would need EXIF analysis
      suspiciousSoftware,
      noExifData: true, // Would check EXIF
      riskFactors,
      riskScore: Math.min(riskScore, 100)
    }
  } catch (error) {
    console.error('Error extracting image metadata:', error)
    return {
      hasBeenEdited: false,
      suspiciousSoftware: false,
      noExifData: true,
      riskFactors: ['Failed to extract metadata'],
      riskScore: 50
    }
  }
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
  } catch (error) {
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
  } catch (error) {
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
