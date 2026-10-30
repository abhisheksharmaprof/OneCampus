/**
 * Scanned Signature White-Threshold Background Removal
 *
 * Scanned signatures and paper stamps often carry yellowish or non-uniform white backgrounds.
 * This function calculates perceptual luminance:
 *   L = 0.299 * R + 0.587 * G + 0.114 * B
 * Pixels with luminance >= threshold become fully transparent.
 * Pixels within feather levels get antialiased alpha.
 */

export interface ThresholdOptions {
  threshold?: number // 180 to 255, default 240
  feather?: number   // feather gradient width in levels, default 15
}

export async function removeWhiteBackground(
  imageSrc: string,
  options: ThresholdOptions = {},
): Promise<string> {
  const { threshold = 240, feather = 15 } = options

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      try {
        const width = img.naturalWidth || img.width
        const height = img.naturalHeight || img.height

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas 2D context unavailable'))
          return
        }

        ctx.drawImage(img, 0, 0)
        const imageData = ctx.getImageData(0, 0, width, height)
        const d = imageData.data

        for (let i = 0; i < d.length; i += 4) {
          const r = d[i]
          const g = d[i + 1]
          const b = d[i + 2]
          const luminance = 0.299 * r + 0.587 * g + 0.114 * b

          if (luminance >= threshold) {
            d[i + 3] = 0 // transparent
          } else if (luminance > threshold - feather) {
            // antialiased edge
            const factor = (threshold - luminance) / feather
            d[i + 3] = Math.round(d[i + 3] * factor)
          }
        }

        ctx.putImageData(imageData, 0, 0)
        resolve(canvas.toDataURL('image/png'))
      } catch (err) {
        reject(err)
      }
    }

    img.onerror = () => {
      reject(new Error('Failed to load image for background removal'))
    }

    img.src = imageSrc
  })
}
