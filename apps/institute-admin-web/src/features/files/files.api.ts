import SparkMD5 from 'spark-md5'

import { adminRequest } from '../admin/admin.api'
import type { FileAsset, InitiateFileUploadInput, UploadAuthorization } from './files.types'

export interface UploadProgress {
  loaded: number
  total: number
  percent: number
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function toBase64(binary: string): string {
  return btoa(binary)
}

export async function calculateFileChecksums(file: File): Promise<{ sha256: string; contentMd5: string }> {
  const bytes = await file.arrayBuffer()
  const [sha256, md5Binary] = await Promise.all([
    crypto.subtle.digest('SHA-256', bytes),
    Promise.resolve(SparkMD5.ArrayBuffer.hash(bytes, true)),
  ])
  return { sha256: toHex(sha256), contentMd5: toBase64(md5Binary) }
}

export function initiateFileUpload(
  accessToken: string,
  idempotencyKey: string,
  input: InitiateFileUploadInput,
  signal?: AbortSignal,
): Promise<UploadAuthorization> {
  return adminRequest(accessToken, 'file-uploads', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
    signal,
  })
}

export function putFileDirectly(
  authorization: UploadAuthorization,
  file: File,
  onProgress?: (progress: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open(authorization.upload.method, authorization.upload.url)
    Object.entries(authorization.upload.headers).forEach(([name, value]) => {
      request.setRequestHeader(name, value)
    })
    request.upload.addEventListener('progress', (event) => {
      const total = event.lengthComputable ? event.total : file.size
      onProgress?.({
        loaded: event.loaded,
        total,
        percent: total > 0 ? Math.min(100, Math.round((event.loaded / total) * 100)) : 0,
      })
    })
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        resolve(request.getResponseHeader('ETag'))
      } else {
        reject(new Error(`Direct upload failed with status ${request.status}.`))
      }
    })
    request.addEventListener('error', () => reject(new Error('Direct upload failed.')))
    request.addEventListener('abort', () => reject(new DOMException('Upload cancelled.', 'AbortError')))
    signal?.addEventListener('abort', () => request.abort(), { once: true })
    request.send(file)
  })
}

export function completeFileUpload(
  accessToken: string,
  authorization: UploadAuthorization,
  etag: string | null,
  signal?: AbortSignal,
): Promise<FileAsset> {
  const path = authorization.completeUrl.replace(/^\/api\/v1\/admin\//, '')
  return adminRequest(accessToken, path, {
    method: 'POST',
    body: JSON.stringify({ ...(etag ? { etag: etag.replaceAll('"', '') } : {}) }),
    signal,
  })
}
