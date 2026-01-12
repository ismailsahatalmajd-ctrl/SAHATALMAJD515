import { NextRequest, NextResponse } from "next/server";
import { getAdminStorage } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const path = formData.get("path") as string | null;

        if (!file || !path) {
            return NextResponse.json({ error: "Missing file or path" }, { status: 400 });
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

        // Construct public URL
        // Format: https://storage.googleapis.com/[BUCKET_NAME]/[OBJECT_NAME]
        // Or for Firebase specifically (often preferred for consistency):
        // https://firebasestorage.googleapis.com/v0/b/[BUCKET_NAME]/o/[OBJECT_NAME]?alt=media
        // But makePublic() usually enables direct access via storage.googleapis.com

        // Let's use the signed URL approach or just the public link. 
        // Since we made it public, we can just return the public URL.
        const publicUrl = fileRef.publicUrl();

        return NextResponse.json({ url: publicUrl });

    } catch (error: any) {
        console.error("Upload error:", error);
        const storage = getAdminStorage();
        const bucketName = storage.bucket().name;
        return NextResponse.json({
            error: `Upload failed: ${error.message} (Bucket: ${bucketName})`,
            details: {
                message: error.message,
                code: error.code,
                bucket: bucketName
            }
        }, { status: 500 });
    }
}
