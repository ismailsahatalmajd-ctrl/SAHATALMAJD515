import { cert, getApps, initializeApp as initAdmin, App } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import serviceAccount from "@/service-account.json";

// Logic to determine correct GCS bucket name
// Logic to determine correct GCS bucket name
let bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "newproject2-2afdc.firebasestorage.app";

// Fix for Admin SDK: It requires the Google Cloud Storage bucket name (project-id.appspot.com)
// NOT the Firebase client alias (project-id.firebasestorage.app)
if (bucketName.includes("firebasestorage.app")) {
    // Hardcode known good bucket for this project if default is causing issues
    if (bucketName.includes("newproject2-2afdc")) {
        bucketName = "newproject2-2afdc.appspot.com";
    } else {
        bucketName = bucketName.replace("firebasestorage.app", "appspot.com");
    }
}

const firebaseConfig = {
    credential: cert(serviceAccount as any),
    storageBucket: bucketName,
};

export const initAdminApp = (): App => {
    if (getApps().length <= 0) {
        return initAdmin(firebaseConfig);
    }
    return getApps()[0];
};

export const getAdminStorage = () => {
    const app = initAdminApp();
    return getStorage(app);
}
