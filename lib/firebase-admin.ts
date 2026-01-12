import { cert, getApps, initializeApp as initAdmin, App } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import serviceAccount from "@/service-account.json";

// Logic to determine correct GCS bucket name
let bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "newproject2-2afdc.appspot.com";
if (bucketName.includes("firebasestorage.app")) {
    // Client SDK uses this alias, but Admin SDK needs the real GCS bucket name which is usually project-id.appspot.com
    bucketName = bucketName.replace("firebasestorage.app", "appspot.com");
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
