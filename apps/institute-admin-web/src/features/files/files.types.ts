export type FileOwnerType = 'STUDENT' | 'STAFF' | 'INSTITUTE' | 'CLASS' | 'SUBJECT' | 'TERM'
export type FileCategory =
  | 'PROFILE_PHOTO'
  | 'LOGO'
  | 'LETTERHEAD'
  | 'BANNER'
  | 'GALLERY_IMAGE'
  | 'ID_DOCUMENT'
  | 'CERTIFICATE'
  | 'MARKSHEET'
  | 'ACADEMIC_NOTE'
  | 'OTHER_DOCUMENT'
export type FileVisibility = 'PRIVATE' | 'AUTHENTICATED' | 'PUBLIC'

export interface FileOwner {
  type: FileOwnerType
  id: string
}

export interface FileAsset {
  id: string
  owner: FileOwner
  branchId: string | null
  category: FileCategory
  originalFileName: string
  mediaType: string
  sizeBytes: number
  state: 'PENDING' | 'PROCESSING' | 'ACTIVE' | 'QUARANTINED' | 'FAILED' | 'DELETED' | 'DISPOSED'
  visibility: FileVisibility
  createdAt: string
  deletedAt: string | null
  retentionUntil: string | null
  version: number
}

export interface InitiateFileUploadInput {
  owner: FileOwner
  branchId?: string | null
  category: FileCategory
  originalFileName: string
  mediaType: string
  sizeBytes: number
  sha256: string
  contentMd5: string
  visibility?: FileVisibility
  replacesFileId?: string
}

export interface UploadAuthorization {
  uploadId: string
  fileId: string
  state: 'AWAITING_UPLOAD'
  expiresAt: string
  upload: {
    method: 'PUT'
    url: string
    headers: Record<string, string>
  }
  completeUrl: string
}

export type UploadPhase =
  | 'idle'
  | 'hashing'
  | 'initiating'
  | 'uploading'
  | 'completing'
  | 'complete'
  | 'error'
  | 'cancelled'
