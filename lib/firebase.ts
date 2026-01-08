import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, enableIndexedDbPersistence, disableNetwork, enableNetwork } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyCdVt4ykUgUNHE5ggUZYeWqQjzXyIg6uEU",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "newproject2-2afdc.firebaseapp.com",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "newproject2-2afdc",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "newproject2-2afdc.firebasestorage.app",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "133801940558",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:133801940558:web:39e564c9c1698a7695151f"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

import { Firestore } from "firebase/firestore";

// Initialize Firestore with settings if needed (before getFirestore)
let db: Firestore;
try {
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        const { initializeFirestore } = require("firebase/firestore");
        db = initializeFirestore(app, {
            experimentalForceLongPolling: true,
        });
        console.log("🔥 Firebase Long Polling Enabled for Localhost");
    } else {
        db = getFirestore(app);
    }
} catch (e) {
    // Fallback if already initialized
    db = getFirestore(app);
}

const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

let isPersistenceEnabled = false;

export const enableOfflinePersistence = async () => {
    if (typeof window !== 'undefined' && !isPersistenceEnabled) {
        try {
            await enableIndexedDbPersistence(db);
            isPersistenceEnabled = true;
            console.log("✅ Firebase Offline Persistence Enabled");
        } catch (err: any) {
            if (err.code == 'failed-precondition') {
                console.warn("⚠️ Persistence failed: Multiple tabs open. Only one tab can maintain persistence.");
            } else if (err.code == 'unimplemented') {
                console.warn("⚠️ Persistence failed: Browser not supported.");
            } else {
                console.warn("⚠️ Persistence warning:", err);
            }
        }
    }
}

import { getStorage } from "firebase/storage";

const storage = getStorage(app);

export { app, db, auth, storage };
