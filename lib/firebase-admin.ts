import { cert, getApps, initializeApp as initAdmin, App } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

// Logic to determine correct GCS bucket name
let bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "newproject2-2afdc.firebasestorage.app";

// Fix for Admin SDK: It requires the Google Cloud Storage bucket name (project-id.appspot.com)
// NOT the Firebase client alias (project-id.firebasestorage.app)
if (bucketName.includes("firebasestorage.app")) {
    if (bucketName.includes("newproject2-2afdc")) {
        bucketName = "newproject2-2afdc.appspot.com";
    } else {
        bucketName = bucketName.replace("firebasestorage.app", "appspot.com");
    }
}

const getServiceAccount = () => {
    // 1. Try environment variable (Preferred for Vercel/Production)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        } catch (e) {
            console.error("Firebase Admin: Failed to parse FIREBASE_SERVICE_ACCOUNT env var");
        }
    }

    // 2. Fallback or placeholder for build time
    // Returning null will cause cert() to fail if called, so we handle it in init
    return null;
};

export const initAdminApp = (): App => {
    const apps = getApps();
    if (apps.length > 0) return apps[0];

    const serviceAccount = getServiceAccount();

    if (!serviceAccount) {
        console.warn("Firebase Admin: No service account found. Admin features will be disabled.");
        // Return a dummy or handle error - here we'll let it throw if actually called, 
        // but it won't break the build anymore.
        throw new Error("Firebase Service Account is missing. Set FIREBASE_SERVICE_ACCOUNT environment variable.");
    }

    return initAdmin({
        credential: cert(serviceAccount),
        storageBucket: bucketName,
    });
};

export const getAdminStorage = () => {
    try {
        const app = initAdminApp();
        return getStorage(app);
    } catch (e) {
        console.error("Firebase Admin Storage Error:", e);
        throw e;
    }
};
