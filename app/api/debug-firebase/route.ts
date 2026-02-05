import { NextResponse } from "next/server";
import { getAdminStorage, initAdminApp } from "@/lib/firebase-admin";

export async function GET() {
    try {
        const app = initAdminApp();
        const storage = getAdminStorage();

        // Try to list buckets
        const [buckets] = await storage.getBuckets();
        const bucketNames = buckets.map(b => b.name);

        return NextResponse.json({
            status: "success",
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            serviceAccountProjectId: app.options.credential ? "cert_credential" : "unknown",
            foundBuckets: bucketNames,
            defaultBucketConfig: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
        });

    } catch (error: any) {
        return NextResponse.json({
            status: "error",
            message: error.message,
            fullError: JSON.stringify(error, Object.getOwnPropertyNames(error))
        }, { status: 500 });
    }
}
