import { useCallback, useEffect, useRef, useState } from 'react'

import {
  calculateFileChecksums,
  completeFileUpload,
  initiateFileUpload,
  putFileDirectly,
} from './files.api'
import type { FileAsset, FileOwner, FileCategory, FileVisibility, UploadPhase } from './files.types'

interface UploadOptions {
  owner: FileOwner
  branchId?: string | null
  category: FileCategory
  visibility?: FileVisibility
  replacesFileId?: string
}

export function useFileUpload(accessToken: string) {
  const controller = useRef<AbortController | null>(null)
  const [phase, setPhase] = useState<UploadPhase>('idle')
  const [progress, setProgress] = useState(0)
  const [asset, setAsset] = useState<FileAsset | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const cancel = useCallback(() => controller.current?.abort(), [])
  const reset = useCallback(() => {
    controller.current?.abort()
    controller.current = null
    setPhase('idle')
    setProgress(0)
    setAsset(null)
    setError(null)
  }, [])

  const upload = useCallback(async (file: File, options: UploadOptions) => {
    controller.current?.abort()
    const current = new AbortController()
    controller.current = current
    setAsset(null)
    setError(null)
    setProgress(0)
    try {
      setPhase('hashing')
      const checksums = await calculateFileChecksums(file)
      if (current.signal.aborted) throw current.signal.reason
      setPhase('initiating')
      const authorization = await initiateFileUpload(
        accessToken,
        crypto.randomUUID(),
        {
          ...options,
          originalFileName: file.name,
          mediaType: file.type,
          sizeBytes: file.size,
          ...checksums,
          visibility: options.visibility ?? 'PRIVATE',
        },
        current.signal,
      )
      setPhase('uploading')
      const etag = await putFileDirectly(
        authorization,
        file,
        ({ percent }) => setProgress(percent),
        current.signal,
      )
      setPhase('completing')
      const completed = await completeFileUpload(accessToken, authorization, etag, current.signal)
      setAsset(completed)
      setProgress(100)
      setPhase('complete')
      return completed
    } catch (cause) {
      const failure = cause instanceof Error ? cause : new Error('The upload could not be completed.')
      setError(failure)
      setPhase(current.signal.aborted ? 'cancelled' : 'error')
      throw failure
    } finally {
      if (controller.current === current) controller.current = null
    }
  }, [accessToken])

  useEffect(() => cancel, [cancel])

  return { phase, progress, asset, error, upload, cancel, reset }
}
