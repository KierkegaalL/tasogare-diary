'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';

import { getFirebaseAuth, isFirebaseConfigured } from '@/lib/firebase';

export interface AuthState {
  user: User | null;
  loading: boolean;
}

// 現在のサインイン状態を購読する。Firebase 未設定時は loading=false / user=null。
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setState({ user: null, loading: false });
      return;
    }
    const unsub = onAuthStateChanged(getFirebaseAuth(), (user) => {
      setState({ user, loading: false });
    });
    return unsub;
  }, []);

  return state;
}
