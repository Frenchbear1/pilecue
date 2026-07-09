import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore'
import {
  getDownloadURL,
  deleteObject,
  ref,
  uploadBytesResumable,
  type FirebaseStorage,
} from 'firebase/storage'
import { blobToDataUrl } from '../lib/image'
import type {
  JobSnapshot,
  PileCueActivity,
  PileCueItem,
  PileCueJob,
  PublicClientJob,
} from '../types'
import { getFirebaseServices } from './firebase'

export type PhotoUploadResult = {
  photoUrl: string
  thumbnailUrl: string
  storagePath: string | null
}

export type PileCueRepository = {
  subscribeJobs: (
    workerId: string,
    onData: (jobs: PileCueJob[]) => void,
    onError: (message: string) => void,
  ) => Unsubscribe
  subscribeJob: (
    job: PileCueJob,
    onData: (snapshot: JobSnapshot) => void,
    onError: (message: string) => void,
  ) => Unsubscribe
  subscribeClientJob: (
    clientToken: string,
    onData: (snapshot: JobSnapshot) => void,
    onError: (message: string) => void,
  ) => Unsubscribe
  saveJob: (job: PileCueJob) => Promise<void>
  deleteJob: (job: PileCueJob) => Promise<void>
  saveItem: (clientToken: string, item: PileCueItem) => Promise<void>
  saveActivity: (clientToken: string, activity: PileCueActivity) => Promise<void>
  saveActivities: (clientToken: string, activity: PileCueActivity[]) => Promise<void>
  markActivityRead: (
    clientToken: string,
    activityIds: string[],
    readAt: string,
  ) => Promise<void>
  uploadItemPhoto: (
    workerId: string,
    jobId: string,
    itemId: string,
    photoBlob: Blob,
    thumbnailBlob: Blob,
    onProgress: (progress: number) => void,
  ) => Promise<PhotoUploadResult>
}

const localEventName = 'pilecue-local-change'
const jobsKey = 'pilecue.jobs'

function clientJobKey(clientToken: string) {
  return `pilecue.clientJob.${clientToken}`
}

function itemsKey(clientToken: string) {
  return `pilecue.items.${clientToken}`
}

function activityKey(clientToken: string) {
  return `pilecue.activity.${clientToken}`
}

function publicJobFromJob(job: PileCueJob): PublicClientJob {
  return {
    jobId: job.id,
    title: job.title,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }
}

function sortByUpdatedAt<T extends { updatedAt: string; createdAt: string }>(entries: T[]) {
  return [...entries].sort(
    (a, b) =>
      new Date(b.updatedAt || b.createdAt).getTime() -
      new Date(a.updatedAt || a.createdAt).getTime(),
  )
}

function sortByCreatedAt<T extends { createdAt: string }>(entries: T[]) {
  return [...entries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback
  }

  const stored = window.localStorage.getItem(key)

  if (!stored) {
    return fallback
  }

  try {
    return JSON.parse(stored) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value))
  window.dispatchEvent(new CustomEvent(localEventName))
}

function removeJson(key: string) {
  window.localStorage.removeItem(key)
  window.dispatchEvent(new CustomEvent(localEventName))
}

function getLocalJobSnapshot(clientToken: string): JobSnapshot {
  return {
    job: readJson<PublicClientJob | null>(clientJobKey(clientToken), null),
    items: sortByCreatedAt(readJson<PileCueItem[]>(itemsKey(clientToken), [])),
    activity: sortByCreatedAt(readJson<PileCueActivity[]>(activityKey(clientToken), [])),
  }
}

class FirestorePileCueRepository implements PileCueRepository {
  constructor(
    private readonly db: Firestore,
    private readonly storage: FirebaseStorage,
  ) {}

  subscribeJobs(
    workerId: string,
    onData: (jobs: PileCueJob[]) => void,
    onError: (message: string) => void,
  ) {
    return onSnapshot(
      query(collection(this.db, 'jobs'), where('workerId', '==', workerId)),
      (snapshot) =>
        onData(sortByUpdatedAt(snapshot.docs.map((entry) => entry.data() as PileCueJob))),
      (error) => onError(error.message),
    )
  }

  subscribeJob(
    job: PileCueJob,
    onData: (snapshot: JobSnapshot) => void,
    onError: (message: string) => void,
  ) {
    const state: JobSnapshot = { job, items: [], activity: [] }
    const emit = () =>
      onData({
        job: state.job,
        items: sortByCreatedAt(state.items),
        activity: sortByCreatedAt(state.activity),
      })

    const unsubscribes = [
      onSnapshot(
        doc(this.db, `jobs/${job.id}`),
        (snapshot) => {
          state.job = snapshot.exists() ? (snapshot.data() as PileCueJob) : null
          emit()
        },
        (error) => onError(error.message),
      ),
      onSnapshot(
        collection(this.db, `clientJobs/${job.clientToken}/items`),
        (snapshot) => {
          state.items = snapshot.docs.map((entry) => entry.data() as PileCueItem)
          emit()
        },
        (error) => onError(error.message),
      ),
      onSnapshot(
        collection(this.db, `clientJobs/${job.clientToken}/activity`),
        (snapshot) => {
          state.activity = snapshot.docs.map((entry) => entry.data() as PileCueActivity)
          emit()
        },
        (error) => onError(error.message),
      ),
    ]

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe())
  }

  subscribeClientJob(
    clientToken: string,
    onData: (snapshot: JobSnapshot) => void,
    onError: (message: string) => void,
  ) {
    const state: JobSnapshot = { job: null, items: [], activity: [] }
    const emit = () =>
      onData({
        job: state.job,
        items: sortByCreatedAt(state.items),
        activity: sortByCreatedAt(state.activity),
      })

    const unsubscribes = [
      onSnapshot(
        doc(this.db, `clientJobs/${clientToken}`),
        (snapshot) => {
          state.job = snapshot.exists() ? (snapshot.data() as PublicClientJob) : null
          emit()
        },
        (error) => onError(error.message),
      ),
      onSnapshot(
        collection(this.db, `clientJobs/${clientToken}/items`),
        (snapshot) => {
          state.items = snapshot.docs.map((entry) => entry.data() as PileCueItem)
          emit()
        },
        (error) => onError(error.message),
      ),
      onSnapshot(
        collection(this.db, `clientJobs/${clientToken}/activity`),
        (snapshot) => {
          state.activity = snapshot.docs.map((entry) => entry.data() as PileCueActivity)
          emit()
        },
        (error) => onError(error.message),
      ),
    ]

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe())
  }

  async saveJob(job: PileCueJob) {
    const batch = writeBatch(this.db)
    batch.set(doc(this.db, `jobs/${job.id}`), job)
    batch.set(doc(this.db, `clientJobs/${job.clientToken}`), publicJobFromJob(job))
    await batch.commit()
  }

  async deleteJob(job: PileCueJob) {
    const itemsSnapshot = await getDocs(
      collection(this.db, `clientJobs/${job.clientToken}/items`),
    )
    const activitySnapshot = await getDocs(
      collection(this.db, `clientJobs/${job.clientToken}/activity`),
    )
    const itemData = itemsSnapshot.docs.map((entry) => entry.data() as PileCueItem)

    await Promise.all([
      ...itemsSnapshot.docs.map((entry) => deleteDoc(entry.ref)),
      ...activitySnapshot.docs.map((entry) => deleteDoc(entry.ref)),
      ...itemData.flatMap((item) =>
        item.storagePath
          ? [
              deleteStorageObject(this.storage, `${item.storagePath}.jpg`),
              deleteStorageObject(this.storage, `${item.storagePath}_thumb.jpg`),
            ]
          : [],
      ),
    ])

    await Promise.all([
      deleteDoc(doc(this.db, `clientJobs/${job.clientToken}`)),
      deleteDoc(doc(this.db, `jobs/${job.id}`)),
    ])
  }

  async saveItem(clientToken: string, item: PileCueItem) {
    await setDoc(doc(this.db, `clientJobs/${clientToken}/items/${item.id}`), item)
  }

  async saveActivity(clientToken: string, activity: PileCueActivity) {
    await setDoc(
      doc(this.db, `clientJobs/${clientToken}/activity/${activity.id}`),
      activity,
    )
  }

  async saveActivities(clientToken: string, activity: PileCueActivity[]) {
    await Promise.all(activity.map((entry) => this.saveActivity(clientToken, entry)))
  }

  async markActivityRead(clientToken: string, activityIds: string[], readAt: string) {
    await Promise.all(
      activityIds.map((activityId) =>
        updateDoc(doc(this.db, `clientJobs/${clientToken}/activity/${activityId}`), {
          readAt,
        }),
      ),
    )
  }

  async uploadItemPhoto(
    workerId: string,
    jobId: string,
    itemId: string,
    photoBlob: Blob,
    thumbnailBlob: Blob,
    onProgress: (progress: number) => void,
  ) {
    const basePath = `jobPhotos/${workerId}/${jobId}/${itemId}`
    const [photoUrl, thumbnailUrl] = await Promise.all([
      uploadBlobWithProgress(
        ref(this.storage, `${basePath}.jpg`),
        photoBlob,
        (progress) => onProgress(Math.round(progress * 0.82)),
      ),
      uploadBlobWithProgress(
        ref(this.storage, `${basePath}_thumb.jpg`),
        thumbnailBlob,
        (progress) => onProgress(82 + Math.round(progress * 18)),
      ),
    ])
    onProgress(100)

    return {
      photoUrl,
      thumbnailUrl,
      storagePath: basePath,
    }
  }
}

class LocalPileCueRepository implements PileCueRepository {
  subscribeJobs(
    workerId: string,
    onData: (jobs: PileCueJob[]) => void,
    onError: (message: string) => void,
  ) {
    const emit = () =>
      onData(
        sortByUpdatedAt(
          readJson<PileCueJob[]>(jobsKey, []).filter((job) => job.workerId === workerId),
        ),
      )

    try {
      window.setTimeout(emit, 0)
      window.addEventListener('storage', emit)
      window.addEventListener(localEventName, emit)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Local storage failed.')
    }

    return () => {
      window.removeEventListener('storage', emit)
      window.removeEventListener(localEventName, emit)
    }
  }

  subscribeJob(
    job: PileCueJob,
    onData: (snapshot: JobSnapshot) => void,
    onError: (message: string) => void,
  ) {
    const emit = () => {
      const jobs = readJson<PileCueJob[]>(jobsKey, [])
      onData({
        ...getLocalJobSnapshot(job.clientToken),
        job: jobs.find((entry) => entry.id === job.id) ?? job,
      })
    }

    try {
      window.setTimeout(emit, 0)
      window.addEventListener('storage', emit)
      window.addEventListener(localEventName, emit)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Local storage failed.')
    }

    return () => {
      window.removeEventListener('storage', emit)
      window.removeEventListener(localEventName, emit)
    }
  }

  subscribeClientJob(
    clientToken: string,
    onData: (snapshot: JobSnapshot) => void,
    onError: (message: string) => void,
  ) {
    const emit = () => onData(getLocalJobSnapshot(clientToken))

    try {
      window.setTimeout(emit, 0)
      window.addEventListener('storage', emit)
      window.addEventListener(localEventName, emit)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Local storage failed.')
    }

    return () => {
      window.removeEventListener('storage', emit)
      window.removeEventListener(localEventName, emit)
    }
  }

  async saveJob(job: PileCueJob) {
    const jobs = readJson<PileCueJob[]>(jobsKey, [])
    writeJson(jobsKey, [job, ...jobs.filter((entry) => entry.id !== job.id)])
    writeJson(clientJobKey(job.clientToken), publicJobFromJob(job))
  }

  async deleteJob(job: PileCueJob) {
    const jobs = readJson<PileCueJob[]>(jobsKey, [])
    writeJson(
      jobsKey,
      jobs.filter((entry) => entry.id !== job.id),
    )
    removeJson(clientJobKey(job.clientToken))
    removeJson(itemsKey(job.clientToken))
    removeJson(activityKey(job.clientToken))
  }

  async saveItem(clientToken: string, item: PileCueItem) {
    const items = readJson<PileCueItem[]>(itemsKey(clientToken), [])
    writeJson(itemsKey(clientToken), [
      item,
      ...items.filter((entry) => entry.id !== item.id),
    ])
  }

  async saveActivity(clientToken: string, activity: PileCueActivity) {
    const activityEntries = readJson<PileCueActivity[]>(activityKey(clientToken), [])
    writeJson(activityKey(clientToken), [
      activity,
      ...activityEntries.filter((entry) => entry.id !== activity.id),
    ])
  }

  async saveActivities(clientToken: string, activity: PileCueActivity[]) {
    const activityEntries = readJson<PileCueActivity[]>(activityKey(clientToken), [])
    const nextById = new Map(activityEntries.map((entry) => [entry.id, entry]))
    activity.forEach((entry) => nextById.set(entry.id, entry))
    writeJson(activityKey(clientToken), Array.from(nextById.values()))
  }

  async markActivityRead(clientToken: string, activityIds: string[], readAt: string) {
    const ids = new Set(activityIds)
    const activityEntries = readJson<PileCueActivity[]>(activityKey(clientToken), [])
    writeJson(
      activityKey(clientToken),
      activityEntries.map((entry) =>
        ids.has(entry.id) ? { ...entry, readAt } : entry,
      ),
    )
  }

  async uploadItemPhoto(
    _workerId: string,
    _jobId: string,
    _itemId: string,
    photoBlob: Blob,
    thumbnailBlob: Blob,
    onProgress: (progress: number) => void,
  ) {
    onProgress(25)
    const [photoUrl, thumbnailUrl] = await Promise.all([
      blobToDataUrl(photoBlob),
      blobToDataUrl(thumbnailBlob),
    ])
    onProgress(100)
    return {
      photoUrl,
      thumbnailUrl,
      storagePath: null,
    }
  }
}

async function deleteStorageObject(storage: FirebaseStorage, path: string) {
  try {
    await deleteObject(ref(storage, path))
  } catch {
    // If the file is already gone, Firestore cleanup should still complete.
  }
}

function uploadBlobWithProgress(
  targetRef: ReturnType<typeof ref>,
  blob: Blob,
  onProgress: (progress: number) => void,
) {
  return new Promise<string>((resolve, reject) => {
    const uploadTask = uploadBytesResumable(targetRef, blob, {
      contentType: 'image/jpeg',
    })

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = snapshot.totalBytes
          ? snapshot.bytesTransferred / snapshot.totalBytes
          : 0
        onProgress(progress)
      },
      reject,
      async () => {
        resolve(await getDownloadURL(uploadTask.snapshot.ref))
      },
    )
  })
}

export function createPileCueRepository(): PileCueRepository {
  const firebase = getFirebaseServices()

  if (firebase) {
    return new FirestorePileCueRepository(firebase.db, firebase.storage)
  }

  return new LocalPileCueRepository()
}
