import { create } from 'zustand'
import type {
  JobSnapshot,
  PileCueActivity,
  PileCueItem,
  PileCueJob,
} from '../types'

type SyncState = 'idle' | 'loading' | 'synced' | 'error'

type PileCueStore = {
  jobs: PileCueJob[]
  activeJob: PileCueJob | null
  items: PileCueItem[]
  activity: PileCueActivity[]
  syncState: SyncState
  syncMessage: string
  setJobs: (jobs: PileCueJob[]) => void
  setJobSnapshot: (snapshot: JobSnapshot) => void
  upsertJobLocal: (job: PileCueJob) => void
  removeJobLocal: (jobId: string) => void
  upsertItemLocal: (item: PileCueItem) => void
  upsertActivityLocal: (activity: PileCueActivity) => void
  setSyncState: (syncState: SyncState, syncMessage?: string) => void
  resetJob: () => void
  resetAll: () => void
}

export const usePileCueStore = create<PileCueStore>((set) => ({
  jobs: [],
  activeJob: null,
  items: [],
  activity: [],
  syncState: 'idle',
  syncMessage: '',

  setJobs: (jobs) =>
    set({
      jobs,
      syncState: 'synced',
      syncMessage: '',
    }),

  setJobSnapshot: (snapshot) =>
    set({
      activeJob:
        snapshot.job && 'workerId' in snapshot.job ? snapshot.job : null,
      items: snapshot.items,
      activity: snapshot.activity,
      syncState: 'synced',
      syncMessage: '',
    }),

  upsertJobLocal: (job) =>
    set((state) => ({
      jobs: [job, ...state.jobs.filter((entry) => entry.id !== job.id)],
      activeJob: state.activeJob?.id === job.id ? job : state.activeJob,
    })),

  removeJobLocal: (jobId) =>
    set((state) => ({
      jobs: state.jobs.filter((entry) => entry.id !== jobId),
      activeJob: state.activeJob?.id === jobId ? null : state.activeJob,
      items: state.activeJob?.id === jobId ? [] : state.items,
      activity: state.activeJob?.id === jobId ? [] : state.activity,
    })),

  upsertItemLocal: (item) =>
    set((state) => ({
      items: [item, ...state.items.filter((entry) => entry.id !== item.id)],
    })),

  upsertActivityLocal: (activity) =>
    set((state) => ({
      activity: [
        activity,
        ...state.activity.filter((entry) => entry.id !== activity.id),
      ],
    })),

  setSyncState: (syncState, syncMessage = '') => set({ syncState, syncMessage }),

  resetJob: () =>
    set({
      activeJob: null,
      items: [],
      activity: [],
    }),

  resetAll: () =>
    set({
      jobs: [],
      activeJob: null,
      items: [],
      activity: [],
      syncState: 'idle',
      syncMessage: '',
    }),
}))
