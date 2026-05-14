/**
 * Client-side perceptual hash (aHash) for cross-borrower duplicate detection.
 *
 * Algorithm: downsample to 8x8 grayscale, average all 64 pixel values,
 * output a 64-bit hash where each bit = (pixel > mean ? 1 : 0). Stable
 * under recompression, mild crops, resizes, and small color shifts —
 * which is what we need to catch fraudsters who re-photograph or
 * re-encode the same physical document.
 *
 * Hex representation is 16 chars. Two hashes are "the same image" when
 * Hamming distance ≤ 5 — but we store only exact equality for the DB
 * check (the trigger uses `=`). Approximate matches can be added later.
 */

const HASH_SIZE = 8

/**
 * Compute aHash for an image file. Returns 16-char hex string, or null if
 * the file cannot be decoded as an image (e.g. PDF).
 */
export async function computeAHash(file: File | Blob): Promise<string | null> {
  if (typeof window === 'undefined') return null
  if (file.type && !file.type.startsWith('image/')) return null

  const bitmap = await loadBitmap(file)
  if (!bitmap) return null

  const canvas = document.createElement('canvas')
  canvas.width = HASH_SIZE
  canvas.height = HASH_SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  // Smooth downscale to 8x8 — browser handles the resampling.
  ctx.drawImage(bitmap, 0, 0, HASH_SIZE, HASH_SIZE)
  const data = ctx.getImageData(0, 0, HASH_SIZE, HASH_SIZE).data

  // Convert to grayscale using luminance weights.
  const grays = new Array<number>(HASH_SIZE * HASH_SIZE)
  let sum = 0
  for (let i = 0; i < HASH_SIZE * HASH_SIZE; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    const y = 0.299 * r + 0.587 * g + 0.114 * b
    grays[i] = y
    sum += y
  }
  const mean = sum / grays.length

  // Build 64-bit hash, MSB-first, packed into 16 hex chars.
  let hex = ''
  for (let nibble = 0; nibble < 16; nibble++) {
    let v = 0
    for (let b = 0; b < 4; b++) {
      const idx = nibble * 4 + b
      if (grays[idx] > mean) v |= (1 << (3 - b))
    }
    hex += v.toString(16)
  }
  return hex
}

async function loadBitmap(file: File | Blob): Promise<ImageBitmap | HTMLImageElement | null> {
  // createImageBitmap is the fast path on modern browsers.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // fall through
    }
  }

  // Fallback for older browsers / certain blob types.
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

/**
 * Hamming distance between two aHash hex strings. Useful for client-side
 * "near duplicate" warnings, but the DB trigger only flags exact equality
 * for now.
 */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Infinity
  let d = 0
  for (let i = 0; i < a.length; i++) {
    const x = parseInt(a[i], 16) ^ parseInt(b[i], 16)
    // Brian Kernighan's bit count
    let v = x
    while (v) { d++; v &= v - 1 }
  }
  return d
}
