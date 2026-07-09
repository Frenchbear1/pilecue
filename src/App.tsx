import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import {
  Archive,
  Bell,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  CircleHelp,
  ClipboardCheck,
  Copy,
  Gift,
  Heart,
  ImagePlus,
  Link as LinkIcon,
  Loader2,
  LogOut,
  MapPin,
  MessageSquareText,
  PackageCheck,
  Plus,
  QrCode,
  RefreshCw,
  Share2,
  ShoppingBag,
  Trash2,
  Truck,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import QRCode from 'qrcode'
import clsx from 'clsx'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  applyClientItemChange,
  buildItemHandledActivity,
  buildItemUploadedActivity,
  categoryColors,
  categoryLabels,
  createClientToken,
  createId,
  getUnreadActivity,
  groupItemsByCategory,
  markItemHandled,
  markItemUnchecked,
  normalizeJobTitle,
  nowIso,
  sortCategories,
} from './lib/domain'
import { buildClientUrl, copyText, getClientTokenFromUrl } from './lib/clientLink'
import { prepareImage } from './lib/image'
import { createPileCueRepository } from './services/repository'
import { useAuthSession } from './hooks/useAuthSession'
import { usePileCueStore } from './store/pilecueStore'
import type {
  JobSnapshot,
  PileCueActivity,
  PileCueItem,
  PileCueJob,
  PublicClientJob,
  SessionUser,
  SortCategory,
} from './types'

type WorkerView = 'capture' | 'review' | 'checked' | 'notifications'

const inputClass =
  'min-w-0 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-base text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-[var(--accent)] focus:ring-4 focus:ring-[color:color-mix(in_srgb,var(--accent)_18%,transparent)]'

const labelClass = 'block min-w-0 space-y-2 text-sm font-semibold text-stone-700'

const viewTabs: Array<{ id: WorkerView; label: string; Icon: LucideIcon }> = [
  { id: 'capture', label: 'Capture', Icon: Camera },
  { id: 'review', label: 'Review', Icon: ClipboardCheck },
  { id: 'checked', label: 'Checked', Icon: CheckCircle2 },
  { id: 'notifications', label: 'Alerts', Icon: Bell },
]

const categoryIcons: Record<SortCategory, LucideIcon> = {
  keep: Heart,
  trash: Trash2,
  donate: Gift,
  sell: ShoppingBag,
  unsure: CircleHelp,
  relocate: Truck,
}

function App() {
  const clientToken = getClientTokenFromUrl()

  if (clientToken) {
    return <ClientApp clientToken={clientToken} />
  }

  return <WorkerApp />
}

function WorkerApp() {
  const { session, isReady, error, isFirebaseConfigured, signIn, signOut } =
    useAuthSession()
  const repository = useMemo(() => createPileCueRepository(), [])
  const jobs = usePileCueStore((state) => state.jobs)
  const activeJob = usePileCueStore((state) => state.activeJob)
  const items = usePileCueStore((state) => state.items)
  const activity = usePileCueStore((state) => state.activity)
  const syncState = usePileCueStore((state) => state.syncState)
  const syncMessage = usePileCueStore((state) => state.syncMessage)
  const setJobs = usePileCueStore((state) => state.setJobs)
  const setJobSnapshot = usePileCueStore((state) => state.setJobSnapshot)
  const upsertJobLocal = usePileCueStore((state) => state.upsertJobLocal)
  const upsertItemLocal = usePileCueStore((state) => state.upsertItemLocal)
  const upsertActivityLocal = usePileCueStore((state) => state.upsertActivityLocal)
  const setSyncState = usePileCueStore((state) => state.setSyncState)
  const resetJob = usePileCueStore((state) => state.resetJob)
  const resetAll = usePileCueStore((state) => state.resetAll)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [view, setView] = useState<WorkerView>('capture')
  const [newJobOpen, setNewJobOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? null,
    [jobs, selectedJobId],
  )
  const unreadAlerts = useMemo(
    () =>
      getUnreadActivity(activity).filter(
        (entry) => entry.type === 'client_changed_after_handled',
      ),
    [activity],
  )

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', '#2f8f7a')
    document.documentElement.style.colorScheme = 'light'
  }, [])

  useEffect(() => {
    if (!session) {
      resetAll()
      return
    }

    setSyncState('loading')
    return repository.subscribeJobs(
      session.uid,
      setJobs,
      (message) => setSyncState('error', message),
    )
  }, [repository, resetAll, session, setJobs, setSyncState])

  useEffect(() => {
    if (!selectedJob) {
      resetJob()
      return
    }

    setSyncState('loading')
    return repository.subscribeJob(
      selectedJob,
      setJobSnapshot,
      (message) => setSyncState('error', message),
    )
  }, [repository, resetJob, selectedJob, setJobSnapshot, setSyncState])

  const createJob = async (title: string) => {
    if (!session) {
      return
    }

    const timestamp = nowIso()
    const job: PileCueJob = {
      id: createId('job'),
      title: normalizeJobTitle(title),
      status: 'active',
      workerId: session.uid,
      clientToken: createClientToken(),
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    upsertJobLocal(job)
    setSelectedJobId(job.id)
    setView('capture')
    setNewJobOpen(false)

    try {
      await repository.saveJob(job)
    } catch (saveError) {
      setSyncState(
        'error',
        saveError instanceof Error ? saveError.message : 'Could not save job.',
      )
    }
  }

  const uploadPhotos = async (files: FileList | null) => {
    if (!session || !selectedJob || !files?.length) {
      return
    }

    await Promise.all(
      Array.from(files).map((file) =>
        uploadSinglePhoto(file, selectedJob, session, (message) =>
          setSyncState('error', message),
        ),
      ),
    )
  }

  const uploadSinglePhoto = async (
    file: File,
    job: PileCueJob,
    user: SessionUser,
    onError: (message: string) => void,
  ) => {
    const timestamp = nowIso()
    const itemId = createId('item')
    const localUrl = URL.createObjectURL(file)
    const optimisticItem: PileCueItem = {
      id: itemId,
      jobId: job.id,
      photoUrl: localUrl,
      thumbnailUrl: localUrl,
      storagePath: null,
      category: 'unsure',
      clientNote: '',
      workerNote: '',
      handledAt: null,
      handledBy: null,
      lastClientChangeAt: null,
      needsWorkerReview: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    upsertItemLocal(optimisticItem)
    setUploadProgress((progress) => ({ ...progress, [itemId]: 2 }))

    try {
      const prepared = await prepareImage(file)
      const upload = await repository.uploadItemPhoto(
        user.uid,
        job.id,
        itemId,
        prepared.photoBlob,
        prepared.thumbnailBlob,
        (progress) =>
          setUploadProgress((current) => ({
            ...current,
            [itemId]: Math.max(current[itemId] ?? 0, progress),
          })),
      )
      const savedItem: PileCueItem = {
        ...optimisticItem,
        photoUrl: upload.photoUrl,
        thumbnailUrl: upload.thumbnailUrl,
        storagePath: upload.storagePath,
        updatedAt: nowIso(),
      }
      const uploadActivity = buildItemUploadedActivity(job.id, itemId, nowIso())

      upsertItemLocal(savedItem)
      upsertActivityLocal(uploadActivity)
      await Promise.all([
        repository.saveItem(job.clientToken, savedItem),
        repository.saveActivity(job.clientToken, uploadActivity),
      ])
    } catch (uploadError) {
      onError(uploadError instanceof Error ? uploadError.message : 'Upload failed.')
    } finally {
      URL.revokeObjectURL(localUrl)
      window.setTimeout(() => {
        setUploadProgress((current) => {
          const next = { ...current }
          delete next[itemId]
          return next
        })
      }, 500)
    }
  }

  const toggleHandled = async (item: PileCueItem) => {
    if (!session || !selectedJob) {
      return
    }

    const timestamp = nowIso()
    const shouldUncheck = Boolean(item.handledAt) && !item.needsWorkerReview
    const nextItem = shouldUncheck
      ? markItemUnchecked(item, timestamp)
      : markItemHandled(item, session.uid, timestamp)
    const handledActivity = shouldUncheck
      ? null
      : buildItemHandledActivity(selectedJob.id, item.id, timestamp)

    upsertItemLocal(nextItem)
    if (handledActivity) {
      upsertActivityLocal(handledActivity)
    }

    try {
      await Promise.all([
        repository.saveItem(selectedJob.clientToken, nextItem),
        handledActivity
          ? repository.saveActivity(selectedJob.clientToken, handledActivity)
          : Promise.resolve(),
      ])
    } catch (saveError) {
      setSyncState(
        'error',
        saveError instanceof Error ? saveError.message : 'Could not update item.',
      )
    }
  }

  const markAlertsRead = async () => {
    if (!selectedJob || unreadAlerts.length === 0) {
      return
    }

    const readAt = nowIso()
    const ids = unreadAlerts.map((entry) => entry.id)
    ids.forEach((id) => {
      const entry = activity.find((activityEntry) => activityEntry.id === id)
      if (entry) {
        upsertActivityLocal({ ...entry, readAt })
      }
    })

    try {
      await repository.markActivityRead(selectedJob.clientToken, ids, readAt)
    } catch (readError) {
      setSyncState(
        'error',
        readError instanceof Error ? readError.message : 'Could not mark read.',
      )
    }
  }

  if (!isReady) {
    return <LoadingScreen />
  }

  if (!session) {
    return (
      <AuthScreen
        error={error}
        isConfigured={isFirebaseConfigured}
        onSignIn={() => void signIn()}
      />
    )
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-svh bg-stone-300 text-stone-950">
        <div className="pilecue-shell mx-auto min-h-svh max-w-[430px] shadow-2xl sm:max-w-[760px] lg:max-w-[1100px]">
          {!selectedJob ? (
            <JobListScreen
              jobs={jobs}
              session={session}
              syncState={syncState}
              syncMessage={syncMessage}
              onCreate={() => setNewJobOpen(true)}
              onOpen={(job) => {
                setSelectedJobId(job.id)
                setView('capture')
              }}
              onSignOut={() => void signOut()}
            />
          ) : (
            <JobWorkspace
              job={activeJob ?? selectedJob}
              items={items}
              activity={activity}
              view={view}
              uploadProgress={uploadProgress}
              unreadCount={unreadAlerts.length}
              onBack={() => {
                setSelectedJobId(null)
                setView('capture')
              }}
              onViewChange={setView}
              onUpload={uploadPhotos}
              onShare={() => setShareOpen(true)}
              onToggleNotifications={() => setNotificationsOpen(true)}
              onToggleHandled={(item) => void toggleHandled(item)}
              onMarkAlertsRead={() => void markAlertsRead()}
            />
          )}
        </div>
        <NewJobModal
          open={newJobOpen}
          onClose={() => setNewJobOpen(false)}
          onSubmit={(title) => void createJob(title)}
        />
        <ShareModal
          open={shareOpen}
          job={activeJob ?? selectedJob}
          onClose={() => setShareOpen(false)}
        />
        <NotificationDrawer
          open={notificationsOpen}
          activity={activity}
          items={items}
          onClose={() => setNotificationsOpen(false)}
          onMarkRead={() => void markAlertsRead()}
        />
      </div>
    </MotionConfig>
  )
}

function ClientApp({ clientToken }: { clientToken: string }) {
  const repository = useMemo(() => createPileCueRepository(), [])
  const [snapshot, setSnapshot] = useState<JobSnapshot>({
    job: null,
    items: [],
    activity: [],
  })
  const [syncState, setSyncState] = useState<'loading' | 'synced' | 'error'>('loading')
  const [syncMessage, setSyncMessage] = useState('')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const job = snapshot.job as PublicClientJob | null
  const items = snapshot.items
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? items[0] ?? null,
    [items, selectedItemId],
  )
  const groups = useMemo(() => groupItemsByCategory(items), [items])

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', '#2f8f7a')
    document.documentElement.style.colorScheme = 'light'
  }, [])

  useEffect(() => {
    setSyncState('loading')
    return repository.subscribeClientJob(
      clientToken,
      (nextSnapshot) => {
        setSnapshot(nextSnapshot)
        setSyncState('synced')
      },
      (message) => {
        setSyncMessage(message)
        setSyncState('error')
      },
    )
  }, [clientToken, repository])

  useEffect(() => {
    if (!selectedItemId && items[0]) {
      setSelectedItemId(items[0].id)
    }
  }, [items, selectedItemId])

  useEffect(() => {
    if (!selectedItem) {
      return
    }

    setNoteDrafts((drafts) => ({
      ...drafts,
      [selectedItem.id]: drafts[selectedItem.id] ?? selectedItem.clientNote,
    }))
  }, [selectedItem])

  const saveClientChange = async (
    item: PileCueItem,
    patch: { category?: SortCategory; clientNote?: string },
  ) => {
    const result = applyClientItemChange(item, patch, nowIso())

    if (result.item === item && !result.activity) {
      return
    }

    setSnapshot((current) => ({
      ...current,
      items: current.items.map((entry) =>
        entry.id === item.id ? result.item : entry,
      ),
      activity: result.activity
        ? [result.activity, ...current.activity]
        : current.activity,
    }))

    try {
      await Promise.all([
        repository.saveItem(clientToken, result.item),
        result.activity
          ? repository.saveActivity(clientToken, result.activity)
          : Promise.resolve(),
      ])
    } catch (saveError) {
      setSyncMessage(
        saveError instanceof Error ? saveError.message : 'Could not save change.',
      )
      setSyncState('error')
    }
  }

  const saveSelectedNote = () => {
    if (!selectedItem) {
      return
    }

    void saveClientChange(selectedItem, {
      clientNote: noteDrafts[selectedItem.id] ?? '',
    })
  }

  if (syncState === 'loading') {
    return <LoadingScreen label="Opening job" />
  }

  if (!job) {
    return (
      <main className="grid min-h-svh place-items-center bg-[#f5f7f2] px-5 text-center">
        <section className="max-w-sm rounded-[30px] border border-white bg-white p-6 shadow-xl">
          <div className="mx-auto grid size-14 place-items-center rounded-3xl bg-stone-950 text-white">
            <LinkIcon size={26} />
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-stone-950">Link unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-stone-500">
            {syncMessage || 'This PileCue job link is not active.'}
          </p>
        </section>
      </main>
    )
  }

  return (
    <MotionConfig reducedMotion="user">
      <main className="min-h-svh bg-[#d9ded8] text-stone-950">
        <div className="mx-auto min-h-svh max-w-[1180px] bg-[#f5f7f2]">
          <header className="glass-sticky sticky top-0 z-30 border-b border-stone-200/80 px-5 pb-4 pt-[calc(env(safe-area-inset-top)+14px)] lg:px-8">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
                  PileCue
                </p>
                <h1 className="truncate text-2xl font-semibold text-stone-950 sm:text-3xl">
                  {job.title}
                </h1>
              </div>
              <StatusPill
                label={syncState === 'error' ? 'Offline' : 'Live'}
                tone={syncState === 'error' ? 'warn' : 'ok'}
              />
            </div>
          </header>
          <div className="grid gap-5 px-5 pb-[calc(env(safe-area-inset-bottom)+8.5rem)] pt-5 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:pb-8">
            <section className="min-w-0">
              {selectedItem ? (
                <ClientReviewCard
                  item={selectedItem}
                  noteDraft={noteDrafts[selectedItem.id] ?? selectedItem.clientNote}
                  onNoteDraft={(value) =>
                    setNoteDrafts((drafts) => ({
                      ...drafts,
                      [selectedItem.id]: value,
                    }))
                  }
                  onNoteSave={saveSelectedNote}
                />
              ) : (
                <EmptyState
                  Icon={ImagePlus}
                  title="No photos yet"
                  body="Photos will appear here as the worker adds them."
                />
              )}
            </section>
            <aside className="min-w-0 space-y-5">
              <section className="rounded-[28px] bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-stone-950">Photos</h2>
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-500">
                    {items.length}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        saveSelectedNote()
                        setSelectedItemId(item.id)
                      }}
                      className={clsx(
                        'pressable aspect-square overflow-hidden rounded-2xl border-2 bg-stone-100',
                        selectedItem?.id === item.id
                          ? 'border-[var(--accent)]'
                          : 'border-transparent',
                      )}
                    >
                      <img
                        src={item.thumbnailUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </section>
              <SortedGroups groups={groups} onSelect={setSelectedItemId} />
            </aside>
          </div>
          {selectedItem ? (
            <ClientCategoryDock
              current={selectedItem.category}
              onChange={(category) =>
                void saveClientChange(selectedItem, { category })
              }
            />
          ) : null}
        </div>
      </main>
    </MotionConfig>
  )
}

function JobListScreen({
  jobs,
  session,
  syncState,
  syncMessage,
  onCreate,
  onOpen,
  onSignOut,
}: {
  jobs: PileCueJob[]
  session: SessionUser
  syncState: string
  syncMessage: string
  onCreate: () => void
  onOpen: (job: PileCueJob) => void
  onSignOut: () => void
}) {
  return (
    <>
      <header className="glass-sticky sticky top-0 z-20 border-b border-stone-200/80 px-5 pb-4 pt-[calc(env(safe-area-inset-top)+14px)] lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
              PileCue
            </p>
            <h1 className="text-3xl font-semibold text-stone-950">Jobs</h1>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill
              label={syncState === 'error' ? 'Needs sync' : 'Live'}
              tone={syncState === 'error' ? 'warn' : 'ok'}
              title={syncMessage}
            />
            <IconButton title="Sign out" onClick={onSignOut}>
              <LogOut size={20} />
            </IconButton>
          </div>
        </div>
      </header>
      <main className="space-y-5 px-5 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-5 lg:px-8">
        <section className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-[30px] bg-stone-950 p-5 text-white shadow-xl">
          <div>
            <p className="text-sm font-medium text-white/60">{session.displayName}</p>
            <h2 className="mt-1 text-3xl font-semibold">Ready to sort</h2>
          </div>
          <div className="grid size-16 place-items-center rounded-3xl bg-white/10">
            <Archive size={29} />
          </div>
          <button
            type="button"
            onClick={onCreate}
            className="pressable col-span-2 flex items-center justify-center gap-3 rounded-[24px] bg-white px-5 py-4 text-base font-semibold text-stone-950"
          >
            <Plus size={21} />
            New job
          </button>
        </section>
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-950">Active jobs</h2>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-stone-500 shadow-sm">
              {jobs.length}
            </span>
          </div>
          {jobs.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => onOpen(job)}
                  className="pressable rounded-[28px] border border-white bg-white p-4 text-left shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-xl font-semibold text-stone-950">
                        {job.title}
                      </h3>
                      <p className="mt-1 text-sm text-stone-500">
                        {formatDate(job.updatedAt)}
                      </p>
                    </div>
                    <div className="grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
                      <ClipboardCheck size={23} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              Icon={PackageCheck}
              title="No jobs yet"
              body="Create the first cleanup job and send the client link."
            />
          )}
        </section>
      </main>
    </>
  )
}

function JobWorkspace({
  job,
  items,
  activity,
  view,
  uploadProgress,
  unreadCount,
  onBack,
  onViewChange,
  onUpload,
  onShare,
  onToggleNotifications,
  onToggleHandled,
  onMarkAlertsRead,
}: {
  job: PileCueJob
  items: PileCueItem[]
  activity: PileCueActivity[]
  view: WorkerView
  uploadProgress: Record<string, number>
  unreadCount: number
  onBack: () => void
  onViewChange: (view: WorkerView) => void
  onUpload: (files: FileList | null) => void
  onShare: () => void
  onToggleNotifications: () => void
  onToggleHandled: (item: PileCueItem) => void
  onMarkAlertsRead: () => void
}) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const checkedItems = items.filter((item) => item.handledAt)
  const groups = useMemo(() => groupItemsByCategory(items), [items])

  return (
    <>
      <header className="glass-sticky sticky top-0 z-20 border-b border-stone-200/80 px-5 pb-4 pt-[calc(env(safe-area-inset-top)+14px)] lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <IconButton title="Jobs" onClick={onBack}>
              <ChevronLeft size={22} />
            </IconButton>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
                PileCue
              </p>
              <h1 className="truncate text-2xl font-semibold text-stone-950 sm:text-3xl">
                {job.title}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleNotifications}
              title="Notifications"
              className="pressable relative grid size-11 place-items-center rounded-full border border-stone-200 bg-white text-stone-700 shadow-sm"
            >
              <Bell size={20} />
              {unreadCount ? (
                <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
                  {unreadCount}
                </span>
              ) : null}
            </button>
            <IconButton title="Share" onClick={onShare}>
              <Share2 size={20} />
            </IconButton>
          </div>
        </div>
      </header>
      <main className="px-5 pb-[calc(env(safe-area-inset-bottom)+8.5rem)] pt-5 lg:px-8 lg:pb-32">
        <AnimatePresence mode="wait">
          <PageFrame key={view}>
            {view === 'capture' ? (
              <CaptureView
                items={items}
                uploadProgress={uploadProgress}
                onCapture={() => cameraInputRef.current?.click()}
                onUpload={() => uploadInputRef.current?.click()}
                onToggleHandled={onToggleHandled}
              />
            ) : null}
            {view === 'review' ? (
              <ReviewView groups={groups} onToggleHandled={onToggleHandled} />
            ) : null}
            {view === 'checked' ? (
              <CheckedView items={checkedItems} onToggleHandled={onToggleHandled} />
            ) : null}
            {view === 'notifications' ? (
              <NotificationsView
                activity={activity}
                items={items}
                onMarkRead={onMarkAlertsRead}
              />
            ) : null}
          </PageFrame>
        </AnimatePresence>
      </main>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          onUpload(event.currentTarget.files)
          event.currentTarget.value = ''
        }}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          onUpload(event.currentTarget.files)
          event.currentTarget.value = ''
        }}
      />
      <BottomNav view={view} onChange={onViewChange} unreadCount={unreadCount} />
    </>
  )
}

function CaptureView({
  items,
  uploadProgress,
  onCapture,
  onUpload,
  onToggleHandled,
}: {
  items: PileCueItem[]
  uploadProgress: Record<string, number>
  onCapture: () => void
  onUpload: () => void
  onToggleHandled: (item: PileCueItem) => void
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-[30px] bg-stone-950 p-5 text-white shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-white/60">Camera</p>
            <h2 className="mt-1 text-3xl font-semibold">Add photos</h2>
          </div>
          <div className="grid size-16 place-items-center rounded-3xl bg-white/10">
            <Camera size={30} />
          </div>
        </div>
        <button
          type="button"
          onClick={onCapture}
          className="pressable mt-5 flex w-full items-center justify-center gap-3 rounded-[24px] bg-white px-5 py-5 text-lg font-semibold text-stone-950"
        >
          <Camera size={23} />
          Capture
        </button>
        <button
          type="button"
          onClick={onUpload}
          className="pressable mt-3 flex w-full items-center justify-center gap-3 rounded-[22px] bg-white/10 px-5 py-4 text-base font-semibold text-white ring-1 ring-white/15"
        >
          <ImagePlus size={21} />
          Upload photos
        </button>
      </section>
      {items.length ? (
        <ItemGrid
          items={items}
          uploadProgress={uploadProgress}
          onToggleHandled={onToggleHandled}
        />
      ) : (
        <EmptyState
          Icon={ImagePlus}
          title="No photos yet"
          body="Captured items will land here first."
        />
      )}
    </div>
  )
}

function ReviewView({
  groups,
  onToggleHandled,
}: {
  groups: Record<SortCategory, PileCueItem[]>
  onToggleHandled: (item: PileCueItem) => void
}) {
  return (
    <div className="space-y-4">
      {sortCategories.map((category) => {
        const Icon = categoryIcons[category]
        const categoryItems = groups[category]

        return (
          <section key={category} className="rounded-[28px] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="grid size-11 place-items-center rounded-2xl text-white"
                  style={{ backgroundColor: categoryColors[category] }}
                >
                  <Icon size={21} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-stone-950">
                    {categoryLabels[category]}
                  </h2>
                  <p className="text-sm text-stone-500">{categoryItems.length} items</p>
                </div>
              </div>
            </div>
            {categoryItems.length ? (
              <ItemGrid items={categoryItems} onToggleHandled={onToggleHandled} compact />
            ) : (
              <div className="rounded-2xl bg-stone-100 px-4 py-5 text-sm font-medium text-stone-500">
                Empty
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function CheckedView({
  items,
  onToggleHandled,
}: {
  items: PileCueItem[]
  onToggleHandled: (item: PileCueItem) => void
}) {
  return items.length ? (
    <ItemGrid items={items} onToggleHandled={onToggleHandled} />
  ) : (
    <EmptyState
      Icon={CheckCircle2}
      title="Nothing checked"
      body="Checked items will collect here."
    />
  )
}

function NotificationsView({
  activity,
  items,
  onMarkRead,
}: {
  activity: PileCueActivity[]
  items: PileCueItem[]
  onMarkRead: () => void
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-stone-950">Notifications</h2>
        <button
          type="button"
          onClick={onMarkRead}
          className="pressable flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-stone-700 shadow-sm"
        >
          <Check size={16} />
          Read
        </button>
      </div>
      {activity.length ? (
        <ActivityList activity={activity} items={items} />
      ) : (
        <EmptyState Icon={Bell} title="No alerts" body="Client changes will show here." />
      )}
    </section>
  )
}

function ItemGrid({
  items,
  uploadProgress = {},
  compact = false,
  onToggleHandled,
}: {
  items: PileCueItem[]
  uploadProgress?: Record<string, number>
  compact?: boolean
  onToggleHandled: (item: PileCueItem) => void
}) {
  return (
    <div
      className={clsx(
        'grid gap-3',
        compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
      )}
    >
      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          progress={uploadProgress[item.id]}
          onToggleHandled={() => onToggleHandled(item)}
        />
      ))}
    </div>
  )
}

function ItemCard({
  item,
  progress,
  onToggleHandled,
}: {
  item: PileCueItem
  progress?: number
  onToggleHandled: () => void
}) {
  const Icon = categoryIcons[item.category]
  const handled = Boolean(item.handledAt)

  return (
    <article
      className={clsx(
        'overflow-hidden rounded-[28px] border bg-white shadow-sm',
        item.needsWorkerReview ? 'border-red-200' : 'border-white',
      )}
    >
      <div className="relative aspect-[4/3] bg-stone-100">
        <img src={item.thumbnailUrl} alt="" className="size-full object-cover" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <CategoryPill category={item.category} />
          {item.needsWorkerReview ? (
            <span className="rounded-full bg-red-500 px-3 py-1 text-xs font-bold text-white shadow-sm">
              Changed
            </span>
          ) : null}
        </div>
        {progress !== undefined ? (
          <div className="absolute inset-x-3 bottom-3 overflow-hidden rounded-full bg-white/80 p-1 backdrop-blur">
            <div
              className="h-2 rounded-full bg-[var(--accent)] transition-all"
              style={{ width: `${Math.max(8, progress)}%` }}
            />
          </div>
        ) : null}
      </div>
      <div className="space-y-3 p-4">
        {item.clientNote ? (
          <p className="line-clamp-2 text-sm leading-5 text-stone-600">
            {item.clientNote}
          </p>
        ) : (
          <p className="text-sm text-stone-400">No note</p>
        )}
        <button
          type="button"
          onClick={onToggleHandled}
          className={clsx(
            'pressable flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold',
            handled && !item.needsWorkerReview
              ? 'bg-emerald-50 text-emerald-700'
              : item.needsWorkerReview
                ? 'bg-red-50 text-red-700'
                : 'bg-stone-100 text-stone-700',
          )}
        >
          {handled && !item.needsWorkerReview ? <CheckCircle2 size={17} /> : <Icon size={17} />}
          {handled && !item.needsWorkerReview
            ? 'Checked'
            : item.needsWorkerReview
              ? 'Recheck'
              : 'Check off'}
        </button>
      </div>
    </article>
  )
}

function ClientReviewCard({
  item,
  noteDraft,
  onNoteDraft,
  onNoteSave,
}: {
  item: PileCueItem
  noteDraft: string
  onNoteDraft: (value: string) => void
  onNoteSave: () => void
}) {
  return (
    <article className="overflow-hidden rounded-[32px] bg-white shadow-sm">
      <div className="relative max-h-[68svh] min-h-[320px] bg-stone-100">
        <img src={item.photoUrl} alt="" className="size-full max-h-[68svh] object-contain" />
        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          <CategoryPill category={item.category} />
          {item.handledAt ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white shadow-sm">
              <Check size={13} />
              Checked
            </span>
          ) : null}
        </div>
      </div>
      <div className="space-y-3 p-4 sm:p-5">
        <label className={labelClass}>
          Notes
          <textarea
            className={clsx(inputClass, 'min-h-28 resize-none')}
            value={noteDraft}
            onChange={(event) => onNoteDraft(event.target.value)}
            onBlur={onNoteSave}
            placeholder="Add a note"
          />
        </label>
        <button
          type="button"
          onClick={onNoteSave}
          className="pressable flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-950 px-5 py-3 text-sm font-semibold text-white"
        >
          <MessageSquareText size={17} />
          Save note
        </button>
      </div>
    </article>
  )
}

function SortedGroups({
  groups,
  onSelect,
}: {
  groups: Record<SortCategory, PileCueItem[]>
  onSelect: (itemId: string) => void
}) {
  return (
    <section className="rounded-[28px] bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-stone-950">Sorted</h2>
      <div className="space-y-2">
        {sortCategories.map((category) => {
          const items = groups[category]
          const Icon = categoryIcons[category]

          return (
            <div key={category} className="rounded-2xl bg-stone-100 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Icon
                    size={17}
                    style={{ color: categoryColors[category] }}
                  />
                  <span className="text-sm font-semibold text-stone-800">
                    {categoryLabels[category]}
                  </span>
                </div>
                <span className="text-xs font-bold text-stone-500">{items.length}</span>
              </div>
              {items.length ? (
                <div className="mt-3 flex gap-2 overflow-x-auto">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelect(item.id)}
                      className="pressable size-14 shrink-0 overflow-hidden rounded-xl bg-white"
                    >
                      <img src={item.thumbnailUrl} alt="" className="size-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function ClientCategoryDock({
  current,
  onChange,
}: {
  current: SortCategory
  onChange: (category: SortCategory) => void
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
      <div className="mx-auto grid max-w-[680px] grid-cols-6 gap-2 rounded-[30px] border border-white/80 bg-white/90 p-2 shadow-2xl backdrop-blur-xl">
        {sortCategories.map((category) => {
          const Icon = categoryIcons[category]
          const selected = current === category

          return (
            <button
              key={category}
              type="button"
              onClick={() => onChange(category)}
              title={categoryLabels[category]}
              className={clsx(
                'pressable grid aspect-square min-h-12 place-items-center rounded-[22px] text-white shadow-sm',
                selected ? 'ring-4 ring-stone-950/10' : '',
              )}
              style={{ backgroundColor: categoryColors[category] }}
            >
              <Icon size={21} />
              <span className="sr-only">{categoryLabels[category]}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function BottomNav({
  view,
  unreadCount,
  onChange,
}: {
  view: WorkerView
  unreadCount: number
  onChange: (view: WorkerView) => void
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[calc(env(safe-area-inset-bottom)+14px)]">
      <div className="mx-auto grid max-w-[430px] grid-cols-4 gap-1 rounded-[30px] border border-white/80 bg-white/90 p-2 shadow-2xl backdrop-blur-xl sm:max-w-[640px]">
        {viewTabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={clsx(
              'pressable relative flex flex-col items-center justify-center gap-1 rounded-[22px] px-2 py-3 text-xs font-semibold',
              view === id ? 'bg-stone-950 text-white' : 'text-stone-500',
            )}
          >
            <Icon size={20} />
            <span>{label}</span>
            {id === 'notifications' && unreadCount ? (
              <span className="absolute right-4 top-2 grid min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
                {unreadCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </nav>
  )
}

function NewJobModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (title: string) => void
}) {
  const [title, setTitle] = useState('')

  useEffect(() => {
    if (open) {
      setTitle('')
    }
  }, [open])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit(title)
  }

  return (
    <Modal open={open} title="New job" onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <label className={labelClass}>
          Job name
          <input
            className={inputClass}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Garage cleanout"
            autoFocus
          />
        </label>
        <button
          type="submit"
          className="pressable flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-950 px-5 py-4 text-base font-semibold text-white"
        >
          <Plus size={19} />
          Create
        </button>
      </form>
    </Modal>
  )
}

function ShareModal({
  open,
  job,
  onClose,
}: {
  open: boolean
  job: PileCueJob | null
  onClose: () => void
}) {
  const [qrUrl, setQrUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)
  const clientUrl = job ? buildClientUrl(job.clientToken) : ''

  useEffect(() => {
    if (!open || !clientUrl) {
      setQrUrl('')
      return
    }

    void QRCode.toDataURL(clientUrl, {
      margin: 1,
      width: 240,
      color: {
        dark: '#15211d',
        light: '#ffffff',
      },
    }).then(setQrUrl)
  }, [clientUrl, open])

  const copyClientUrl = async () => {
    await copyText(clientUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  const shareClientUrl = async () => {
    try {
      if ('share' in navigator) {
        await navigator.share({
          title: `${job?.title ?? 'PileCue'} client link`,
          text: 'Review and sort these cleanup photos.',
          url: clientUrl,
        })
        setShared(true)
        window.setTimeout(() => setShared(false), 1200)
        return
      }

      await copyClientUrl()
    } catch (shareError) {
      if (
        shareError instanceof DOMException &&
        shareError.name === 'AbortError'
      ) {
        return
      }

      await copyClientUrl()
    }
  }

  if (!job) {
    return null
  }

  return (
    <Modal open={open} title="Client link" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid place-items-center rounded-[24px] bg-white p-3 shadow-sm">
          {qrUrl ? (
            <img
              src={qrUrl}
              alt="Client QR code"
              className="share-qr rounded-2xl"
            />
          ) : (
            <div className="share-qr grid place-items-center text-stone-400">
              <Loader2 className="animate-spin" size={30} />
            </div>
          )}
        </div>
        <div className="rounded-2xl bg-stone-100 p-3 text-sm font-medium text-stone-600">
          <p className="truncate">{clientUrl}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => void copyClientUrl()}
            className="pressable flex min-w-0 items-center justify-center gap-2 rounded-2xl bg-stone-950 px-4 py-4 text-sm font-semibold text-white"
          >
            <Copy size={18} />
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={() => void shareClientUrl()}
            className="pressable flex min-w-0 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-4 py-4 text-sm font-semibold text-white"
          >
            <Share2 size={18} />
            {shared ? 'Shared' : 'Share'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function NotificationDrawer({
  open,
  activity,
  items,
  onClose,
  onMarkRead,
}: {
  open: boolean
  activity: PileCueActivity[]
  items: PileCueItem[]
  onClose: () => void
  onMarkRead: () => void
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 bg-stone-950/30 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.aside
            initial={{ x: 420 }}
            animate={{ x: 0 }}
            exit={{ x: 420 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="ml-auto flex h-full w-full max-w-[420px] flex-col bg-[#f5f7f2] shadow-2xl"
          >
            <div className="glass-sticky flex items-center justify-between border-b border-stone-200/80 px-5 pb-4 pt-[calc(env(safe-area-inset-top)+16px)]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
                  PileCue
                </p>
                <h2 className="text-2xl font-semibold text-stone-950">Alerts</h2>
              </div>
              <IconButton title="Close" onClick={onClose}>
                <X size={20} />
              </IconButton>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
              <button
                type="button"
                onClick={onMarkRead}
                className="pressable flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-950 px-5 py-3 text-sm font-semibold text-white"
              >
                <Check size={17} />
                Mark read
              </button>
              {activity.length ? (
                <ActivityList activity={activity} items={items} />
              ) : (
                <EmptyState Icon={Bell} title="No alerts" body="Client changes will show here." />
              )}
            </div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function ActivityList({
  activity,
  items,
}: {
  activity: PileCueActivity[]
  items: PileCueItem[]
}) {
  return (
    <div className="space-y-3">
      {activity.map((entry) => {
        const item = items.find((candidate) => candidate.id === entry.itemId)
        const isAlert = entry.type === 'client_changed_after_handled'

        return (
          <article
            key={entry.id}
            className={clsx(
              'rounded-[24px] border bg-white p-3 shadow-sm',
              isAlert && !entry.readAt ? 'border-red-200' : 'border-white',
            )}
          >
            <div className="flex gap-3">
              <div
                className={clsx(
                  'grid size-11 shrink-0 place-items-center rounded-2xl',
                  isAlert ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700',
                )}
              >
                {isAlert ? <Bell size={20} /> : <Check size={20} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-stone-950">{entry.message}</p>
                <p className="mt-1 text-xs text-stone-500">{formatDate(entry.createdAt)}</p>
                {item ? (
                  <div className="mt-3 flex items-center gap-3">
                    <img
                      src={item.thumbnailUrl}
                      alt=""
                      className="size-14 rounded-2xl object-cover"
                    />
                    <div className="min-w-0">
                      <CategoryPill category={item.category} />
                      {item.clientNote ? (
                        <p className="mt-1 truncate text-xs text-stone-500">
                          {item.clientNote}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function CategoryPill({ category }: { category: SortCategory }) {
  const Icon = categoryIcons[category]

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold text-white shadow-sm"
      style={{ backgroundColor: categoryColors[category] }}
    >
      <Icon size={13} />
      {categoryLabels[category]}
    </span>
  )
}

function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-stone-950/30 px-3 py-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.section
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="my-auto max-h-[calc(100svh-2rem)] w-full max-w-[420px] overflow-y-auto rounded-[32px] bg-[#f5f7f2] p-5 shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold text-stone-950">{title}</h2>
              <IconButton title="Close" onClick={onClose}>
                <X size={20} />
              </IconButton>
            </div>
            {children}
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function AuthScreen({
  error,
  isConfigured,
  onSignIn,
}: {
  error: string
  isConfigured: boolean
  onSignIn: () => void
}) {
  return (
    <main className="grid min-h-svh place-items-center bg-[#f5f7f2] px-5">
      <section className="w-full max-w-[420px] rounded-[32px] border border-white bg-white p-6 shadow-2xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-14 place-items-center rounded-3xl bg-stone-950 text-white">
            <Archive size={28} />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-stone-400">
              PileCue
            </p>
            <h1 className="text-3xl font-semibold text-stone-950">Sort jobs</h1>
          </div>
        </div>
        <button
          type="button"
          onClick={onSignIn}
          className="pressable flex w-full items-center justify-center gap-3 rounded-2xl bg-stone-950 px-5 py-4 text-base font-semibold text-white shadow-lg"
        >
          <UserRound size={20} />
          {isConfigured ? 'Continue with Google' : 'Open preview'}
        </button>
        {error ? (
          <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  )
}

function LoadingScreen({ label = 'Loading' }: { label?: string }) {
  return (
    <main className="grid min-h-svh place-items-center bg-[#f5f7f2] text-stone-700">
      <div className="grid place-items-center gap-3">
        <Loader2 className="animate-spin" size={32} />
        <p className="text-sm font-semibold text-stone-500">{label}</p>
      </div>
    </main>
  )
}

function EmptyState({
  Icon,
  title,
  body,
}: {
  Icon: LucideIcon
  title: string
  body: string
}) {
  return (
    <section className="rounded-[28px] border border-white bg-white p-6 text-center shadow-sm">
      <div className="mx-auto grid size-14 place-items-center rounded-3xl bg-stone-100 text-stone-500">
        <Icon size={26} />
      </div>
      <h2 className="mt-4 text-xl font-semibold text-stone-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-stone-500">{body}</p>
    </section>
  )
}

function IconButton({
  title,
  onClick,
  children,
}: {
  title: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="pressable grid size-11 place-items-center rounded-full border border-stone-200 bg-white text-stone-700 shadow-sm"
    >
      {children}
    </button>
  )
}

function StatusPill({
  label,
  tone,
  title,
}: {
  label: string
  tone: 'ok' | 'warn'
  title?: string
}) {
  return (
    <div
      title={title || label}
      className={clsx(
        'flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold',
        tone === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
      )}
    >
      <span className="size-2 rounded-full bg-current" />
      {label}
    </div>
  )
}

function PageFrame({ children }: { children: ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      {children}
    </motion.section>
  )
}

function formatDate(value: string) {
  const date = new Date(value)

  if (!Number.isFinite(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export default App
