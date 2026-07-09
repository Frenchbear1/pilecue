export type SortCategory =
  | 'keep'
  | 'trash'
  | 'donate'
  | 'sell'
  | 'unsure'
  | 'relocate'

export type JobStatus = 'active' | 'archived'

export type PileCueJob = {
  id: string
  title: string
  status: JobStatus
  workerId: string
  clientToken: string
  createdAt: string
  updatedAt: string
}

export type PublicClientJob = {
  jobId: string
  title: string
  status: JobStatus
  createdAt: string
  updatedAt: string
}

export type PileCueItem = {
  id: string
  jobId: string
  photoUrl: string
  thumbnailUrl: string
  storagePath: string | null
  category: SortCategory
  clientNote: string
  workerNote: string
  handledAt: string | null
  handledBy: string | null
  lastClientChangeAt: string | null
  needsWorkerReview: boolean
  createdAt: string
  updatedAt: string
}

export type ActivityType =
  | 'item_uploaded'
  | 'item_handled'
  | 'client_changed_after_handled'

export type PileCueActivity = {
  id: string
  jobId: string
  type: ActivityType
  itemId: string | null
  message: string
  createdAt: string
  readAt: string | null
}

export type SessionUser = {
  uid: string
  displayName: string
  email: string
  photoURL: string | null
  isPreview: boolean
}

export type JobSnapshot = {
  job: PileCueJob | PublicClientJob | null
  items: PileCueItem[]
  activity: PileCueActivity[]
}
