export type PreparedImage = {
  photoBlob: Blob
  thumbnailBlob: Blob
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image.')
  }

  const bitmap = await loadBitmap(file)
  const photoBlob = await drawToBlob(bitmap, 1600, 0.78)
  const thumbnailBlob = await drawToBlob(bitmap, 520, 0.72)

  return { photoBlob, thumbnailBlob }
}

export function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image.'))
    reader.readAsDataURL(blob)
  })
}

async function loadBitmap(file: File) {
  if ('createImageBitmap' in window) {
    return window.createImageBitmap(file, { imageOrientation: 'from-image' })
  }

  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Could not load image.'))
      img.src = url
    })

    return image
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function drawToBlob(
  source: ImageBitmap | HTMLImageElement,
  maxSide: number,
  quality: number,
) {
  const width = source.width
  const height = source.height
  const scale = Math.min(1, maxSide / Math.max(width, height))
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Could not prepare image.')
  }

  context.drawImage(source, 0, 0, targetWidth, targetHeight)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not compress image.'))
          return
        }

        resolve(blob)
      },
      'image/jpeg',
      quality,
    )
  })
}
