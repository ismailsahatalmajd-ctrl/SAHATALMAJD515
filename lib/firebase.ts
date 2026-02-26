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

// Initialize Firestore
let db: Firestore;
try {
    db = initializeFirestore(app, {
        experimentalForceLongPolling: true,
    });
    console.log("🔥 Firebase Initialized");
} catch (e) {
    db = getFirestore(app);
}

const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
const storage = getStorage(app);

let isPersistenceEnabled = false;

export const enableOfflinePersistence = async () => {
    if (typeof window !== 'undefined' && !isPersistenceEnabled) {
        try {
            await enableMultiTabIndexedDbPersistence(db);
            isPersistenceEnabled = true;
            console.log("✅ Firebase Multi-Tab Persistence Enabled");
        } catch (err: any) {
            if (err.code == 'failed-precondition') {
                console.warn("⚠️ Persistence failed: Multiple tabs already active.");
            } else if (err.code == 'unimplemented') {
                console.warn("⚠️ Persistence failed: Browser not supported.");
            } else {
                console.error("⚠️ Persistence FATAL Error:", err);

                // 🛠️ AUTO-FIX FOR DEVELOPMENT:
                if (process.env.NODE_ENV === 'development') {
                    console.log("🛠️ Dev Mode: Attempting to clear corrupted Persistence...");
                    try {
                        await terminate(db);
                        await clearIndexedDbPersistence(db);
                        console.log("✨ Persistence cleared successfully. Please refresh the page.");
                    } catch (clearErr) {
                        console.error("Failed to clear persistence:", clearErr);
                    }
                }
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
