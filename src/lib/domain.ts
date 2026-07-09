import type {
  ActivityType,
  PileCueActivity,
  PileCueItem,
  SortCategory,
} from '../types'

export const sortCategories: SortCategory[] = [
  'keep',
  'trash',
  'donate',
  'sell',
  'unsure',
  'relocate',
]

export const categoryLabels: Record<SortCategory, string> = {
  keep: 'Keep',
  trash: 'Trash',
  donate: 'Donate',
  sell: 'Sell',
  unsure: 'Unsure',
  relocate: 'Relocate',
}

export const categoryColors: Record<SortCategory, string> = {
  keep: '#2f8f7a',
  trash: '#d7564a',
  donate: '#5b7cfa',
  sell: '#d5972f',
  unsure: '#6b7280',
  relocate: '#7c5cc4',
}

export type ClientItemPatch = {
  category?: SortCategory
  clientNote?: string
}

export function createId(prefix = 'pc') {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`

  return `${prefix}_${id.replaceAll('-', '').slice(0, 22)}`
}

export function createClientToken() {
  const seed = createId('link').replace('link_', '')
  const randomTail = Math.random().toString(36).slice(2, 10)
  return `${seed}${randomTail}`.slice(0, 30)
}

export function nowIso() {
  return new Date().toISOString()
}

export function normalizeJobTitle(title: string) {
  return title.trim() || 'Cleanup job'
}

export function normalizeNote(note: string) {
  return note.trim()
}

export function buildItemUploadedActivity(
  jobId: string,
  itemId: string,
  createdAt: string,
): PileCueActivity {
  return buildActivity({
    jobId,
    type: 'item_uploaded',
    itemId,
    message: 'New photo added.',
    createdAt,
  })
}

export function buildItemHandledActivity(
  jobId: string,
  itemId: string,
  createdAt: string,
): PileCueActivity {
  return buildActivity({
    jobId,
    type: 'item_handled',
    itemId,
    message: 'Item checked off.',
    createdAt,
  })
}

export function buildActivity(input: {
  jobId: string
  type: ActivityType
  itemId: string | null
  message: string
  createdAt: string
}): PileCueActivity {
  return {
    id: createId('act'),
    jobId: input.jobId,
    type: input.type,
    itemId: input.itemId,
    message: input.message,
    createdAt: input.createdAt,
    readAt: null,
  }
}

export function applyClientItemChange(
  item: PileCueItem,
  patch: ClientItemPatch,
  changedAt: string,
) {
  const nextNote =
    patch.clientNote === undefined ? item.clientNote : normalizeNote(patch.clientNote)
  const nextCategory = patch.category ?? item.category
  const categoryChanged = nextCategory !== item.category
  const noteChanged = nextNote !== item.clientNote
  const categoryReviewed = patch.category !== undefined

  if (!categoryReviewed && !categoryChanged && !noteChanged) {
    return { item, activity: null as PileCueActivity | null }
  }

  const changedAfterHandled = Boolean(item.handledAt) && (categoryChanged || noteChanged)
  const changedLabels = [
    categoryChanged ? 'category' : '',
    noteChanged ? 'note' : '',
  ].filter(Boolean)
  const nextItem: PileCueItem = {
    ...item,
    category: nextCategory,
    clientNote: nextNote,
    lastClientChangeAt: changedAt,
    needsWorkerReview: item.needsWorkerReview || changedAfterHandled,
    updatedAt: changedAt,
  }

  const activity = changedAfterHandled
    ? buildActivity({
        jobId: item.jobId,
        type: 'client_changed_after_handled',
        itemId: item.id,
        message: `Client changed ${changedLabels.join(' and ')} after it was checked.`,
        createdAt: changedAt,
      })
    : null

  return { item: nextItem, activity }
}

export function markItemHandled(
  item: PileCueItem,
  workerId: string,
  handledAt: string,
): PileCueItem {
  return {
    ...item,
    handledAt,
    handledBy: workerId,
    needsWorkerReview: false,
    updatedAt: handledAt,
  }
}

export function markItemUnchecked(item: PileCueItem, updatedAt: string): PileCueItem {
  return {
    ...item,
    handledAt: null,
    handledBy: null,
    needsWorkerReview: false,
    updatedAt,
  }
}

export function groupItemsByCategory(items: PileCueItem[]) {
  return sortCategories.reduce(
    (groups, category) => {
      groups[category] = items.filter((item) => item.category === category)
      return groups
    },
    {} as Record<SortCategory, PileCueItem[]>,
  )
}

export function getUnreadActivity(activity: PileCueActivity[]) {
  return activity.filter((entry) => !entry.readAt)
}
