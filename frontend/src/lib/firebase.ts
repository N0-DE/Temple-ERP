import { initializeApp } from "firebase/app"
import { getAnalytics, isSupported } from "firebase/analytics"
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
} from "firebase/firestore"

const firebaseConfig = {
  apiKey: "AIzaSyBUH-8NHGYkXrAwMzMsIimObUR6KUx_w3c",
  authDomain: "temple-erp-d269e.firebaseapp.com",
  projectId: "temple-erp-d269e",
  storageBucket: "temple-erp-d269e.firebasestorage.app",
  messagingSenderId: "378252934039",
  appId: "1:378252934039:web:6786a93efe94bfa0d5a2d2",
  measurementId: "G-S3V1PEXJ80",
}

const app = initializeApp(firebaseConfig)

// Persistent local cache: after the first load, reads are served from disk
// instantly and Firestore only syncs the delta in the background. Without
// this, every page visit re-downloads data from the network from scratch.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentSingleTabManager(undefined),
  }),
})

// Analytics only runs where the browser supports it; Firestore remains available
// in the Tauri desktop app and other non-browser environments.
if (typeof window !== "undefined") {
  void isSupported().then((supported) => {
    if (supported) getAnalytics(app)
  })
}
