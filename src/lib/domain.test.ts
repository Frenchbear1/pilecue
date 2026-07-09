import { describe, expect, it } from 'vitest'
import {
  applyClientItemChange,
  createClientToken,
  markItemHandled,
  markItemUnchecked,
} from './domain'
import { buildClientUrl, getClientTokenFromUrl } from './clientLink'
import type { PileCueItem } from '../types'

const baseItem: PileCueItem = {
  id: 'item_1',
  jobId: 'job_1',
  photoUrl: 'photo',
  thumbnailUrl: 'thumb',
  storagePath: null,
  category: 'unsure',
  clientNote: '',
  workerNote: '',
  handledAt: null,
  handledBy: null,
  lastClientChangeAt: null,
  needsWorkerReview: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('PileCue domain', () => {
  it('updates category and note without alert before an item is handled', () => {
    const result = applyClientItemChange(
      baseItem,
      { category: 'keep', clientNote: '  on shelf  ' },
      '2026-01-01T00:05:00.000Z',
    )

    expect(result.item.category).toBe('keep')
    expect(result.item.clientNote).toBe('on shelf')
    expect(result.item.needsWorkerReview).toBe(false)
    expect(result.activity).toBeNull()
  })

  it('marks an item reviewed when the client taps the current category', () => {
    const result = applyClientItemChange(
      baseItem,
      { category: 'unsure' },
      '2026-01-01T00:03:00.000Z',
    )

    expect(result.item.category).toBe('unsure')
    expect(result.item.lastClientChangeAt).toBe('2026-01-01T00:03:00.000Z')
    expect(result.activity).toBeNull()
  })

  it('creates a notification when a handled item is changed by the client', () => {
    const handled = markItemHandled(
      baseItem,
      'worker_1',
      '2026-01-01T00:04:00.000Z',
    )
    const result = applyClientItemChange(
      handled,
      { category: 'trash' },
      '2026-01-01T00:06:00.000Z',
    )

    expect(result.item.needsWorkerReview).toBe(true)
    expect(result.activity?.type).toBe('client_changed_after_handled')
    expect(result.activity?.message).toContain('category')
  })

  it('clears review state when the worker checks an item again', () => {
    const changed = {
      ...baseItem,
      handledAt: '2026-01-01T00:04:00.000Z',
      handledBy: 'worker_1',
      needsWorkerReview: true,
    }
    const rechecked = markItemHandled(
      changed,
      'worker_1',
      '2026-01-01T00:07:00.000Z',
    )
    const unchecked = markItemUnchecked(rechecked, '2026-01-01T00:08:00.000Z')

    expect(rechecked.needsWorkerReview).toBe(false)
    expect(unchecked.handledAt).toBeNull()
    expect(unchecked.handledBy).toBeNull()
  })

  it('creates compact private client tokens', () => {
    const token = createClientToken()

    expect(token.length).toBeGreaterThan(12)
    expect(token).not.toContain('-')
  })

  it('reads the client token from the current URL', () => {
    window.history.replaceState(null, '', '/?client=abc123')

    expect(getClientTokenFromUrl()).toBe('abc123')
  })

  it('builds share links with the client token', () => {
    window.history.replaceState(null, '', '/worker?foo=bar')
    const url = buildClientUrl('token_1')

    expect(url).toContain('client=token_1')
    expect(url).not.toContain('foo=bar')
  })
})
