import { NextRequest, NextResponse } from "next/server";
import { getAdminStorage } from "@/lib/firebase-admin";

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
    });
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const path = formData.get("path") as string | null;

        if (!file || !path) {
            return NextResponse.json({ error: "Missing file or path" }, {
                status: 400,
                headers: { "Access-Control-Allow-Origin": "*" }
            });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const storage = getAdminStorage();
        const bucket = storage.bucket();
        const fileRef = bucket.file(path);

        await fileRef.save(buffer, {
            contentType: file.type,
            metadata: {
                contentType: file.type,
            },
        });

        await fileRef.makePublic();

        const publicUrl = fileRef.publicUrl();

        return NextResponse.json({ url: publicUrl }, {
            headers: { "Access-Control-Allow-Origin": "*" }
        });

    } catch (error: any) {
        console.error("Upload error:", error);

        // Debug info
        const storage = getAdminStorage();
        const bucketName = storage.bucket().name;

        return NextResponse.json({
            error: `Upload failed: ${error.message}`,
            details: error,
            debug: {
                triedBucket: bucketName,
                projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
            }
        }, {
            status: 500,
            headers: { "Access-Control-Allow-Origin": "*" }
        });
    }
}
