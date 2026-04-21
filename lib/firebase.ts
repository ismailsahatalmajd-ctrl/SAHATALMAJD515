import { initializeApp, getApps, getApp } from "firebase/app";
import {
    initializeFirestore,
    getFirestore,
    enableMultiTabIndexedDbPersistence,
    disableNetwork,
    enableNetwork,
    terminate,
    clearIndexedDbPersistence,
    Firestore,
    Timestamp
} from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";

// ─── Offline Mode: Skip Firebase entirely ────────────────────────────────────
const isOfflineMode = process.env.NEXT_PUBLIC_OFFLINE_MODE === 'true'
    || process.env.NEXT_PUBLIC_DISABLE_FIREBASE === 'true';

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyCdVt4ykUgUNHE5ggUZYeWqQjzXyIg6uEU",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "newproject2-2afdc.firebaseapp.com",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "newproject2-2afdc",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "newproject2-2afdc.firebasestorage.app",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "133801940558",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:133801940558:web:39e564c9c1698a7695151f"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore — in offline mode, disable network immediately after init
let db: Firestore;
try {
    db = initializeFirestore(app, {
        experimentalForceLongPolling: false, // Standard WebSockets are cheaper and more efficient
    });

    if (isOfflineMode) {
        // Disable Firestore network access immediately — prevents all cloud calls
        disableNetwork(db).catch(() => { });
        console.log("🔒 Offline Mode: Firebase network disabled");
    } else {
        console.log("🔥 Firebase Initialized");
    }
} catch (e) {
    db = getFirestore(app);
}

const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
const storage = getStorage(app);

let isPersistenceEnabled = false;

export const enableOfflinePersistence = async () => {
    if (isOfflineMode) return; // Skip in offline mode
    if (typeof window !== 'undefined' && !isPersistenceEnabled) {
        try {
            await enableMultiTabIndexedDbPersistence(db);
            isPersistenceEnabled = true;
            console.log("✅ Firebase Multi-Tab Persistence Enabled");
        } catch (err: any) {
            if (err.code === 'failed-precondition') {
                // Multiple tabs open, persistence can only be enabled in one tab at a time.
                console.warn("⚠️ Persistence failed: Multiple tabs open");
            } else if (err.code === 'unimplemented') {
                // The current browser does not support all of the features required to enable persistence
                console.warn("⚠️ Persistence not supported by browser");
            } else {
                console.error("⚠️ Persistence FATAL Error:", err);
            }
        }
    }
}

export const resetPersistence = async () => {
    if (typeof window === 'undefined') return;
    try {
        await terminate(db);
        await clearIndexedDbPersistence(db);
        window.location.reload();
    } catch (e) {
        console.error("Persistence reset failed", e);
    }
}

export { app, db, auth, storage };
