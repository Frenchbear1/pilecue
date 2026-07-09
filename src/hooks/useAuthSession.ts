import { useEffect, useState } from 'react'
import type { SessionUser } from '../types'
import {
  createAccountWithEmail,
  isFirebaseConfigured,
  signInWithEmail,
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

  const signInEmail = async (email: string, password: string) => {
    setError('')

    if (!isFirebaseConfigured) {
      setSession(previewUser)
      return
    }

    try {
      await signInWithEmail(email, password)
    } catch (signInError) {
      setError(formatAuthError(signInError, 'Could not sign in.'))
    }
  }

  const createEmailAccount = async (email: string, password: string) => {
    setError('')

    if (!isFirebaseConfigured) {
      setSession(previewUser)
      return
    }

    try {
      await createAccountWithEmail(email, password)
    } catch (createError) {
      setError(formatAuthError(createError, 'Could not create account.'))
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
    signInEmail,
    createEmailAccount,
    signOut,
  }
}

function formatAuthError(error: unknown, fallback: string) {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : ''

  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'That email already has an account.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/missing-password': 'Enter a password.',
    'auth/weak-password': 'Use at least 6 characters for the password.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/user-not-found': 'No account was found for that email.',
    'auth/wrong-password': 'Email or password is incorrect.',
  }

  if (messages[code]) {
    return messages[code]
  }

  return error instanceof Error ? error.message : fallback
}
