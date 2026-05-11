import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'iris-11574',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Singleton app — prevents "already initialized" crash on hot reload
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Firestore database — export directly, safe to call at module level
export const db = getFirestore(app);

// Keep getter for backwards compatibility with recent refactor
export function getFirebaseDb() {
  return db;
}

// Firebase Storage
export const storage = getStorage(app);

// Keep getter for backwards compatibility
export function getFirebaseStorage() {
  return storage;
}

// Auth — lazy initialization
// We do NOT call initializeAuth() at module level because React Native's
// component registry may not be ready yet when this file is first imported.
let _auth: ReturnType<typeof initializeAuth> | null = null;

export function getFirebaseAuth() {
  if (!_auth) {
    // TEMPORARY: Dropping persistence to fix resolution error. Will add back when stable.
    _auth = initializeAuth(app);
  }
  return _auth;
}

export default app;