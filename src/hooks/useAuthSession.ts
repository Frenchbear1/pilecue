import { useEffect, useState } from 'react'
import type { SessionUser } from '../types'
import {
  isFirebaseConfigured,
  signInWithGoogle,
  signOutOfFirebase,
  watchFirebaseUser,
} from '../services/firebase'

const previewUser: SessionUser = {
  uid: 'preview-worker',
  displayName: 'Preview Worker',
  email: 'preview@pilecue.local',
  photoURL: null,
  isPreview: true,
}

export function useAuthSession() {
  const [session, setSession] = useState<SessionUser | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setSession(previewUser)
      setIsReady(true)
      return
    }

    return watchFirebaseUser((user) => {
      setSession(
        user
          ? {
              uid: user.uid,
              displayName: user.displayName ?? user.email ?? 'Worker',
              email: user.email ?? '',
              photoURL: user.photoURL,
              isPreview: false,
            }
          : null,
      )
      setIsReady(true)
    })
  }, [])

  const signIn = async () => {
    setError('')

    if (!isFirebaseConfigured) {
      setSession(previewUser)
      return
    }

    try {
      await signInWithGoogle()
    } catch (signInError) {
      setError(
        signInError instanceof Error
          ? signInError.message
          : 'Could not sign in.',
      )
    }
  }

  const signOut = async () => {
    setError('')

    if (!isFirebaseConfigured) {
      setSession(null)
      return
    }

    try {
      await signOutOfFirebase()
    } catch (signOutError) {
      setError(
        signOutError instanceof Error
          ? signOutError.message
          : 'Could not sign out.',
      )
    }
  }

  return {
    session,
    isReady,
    error,
    isFirebaseConfigured,
    signIn,
    signOut,
  }
}
