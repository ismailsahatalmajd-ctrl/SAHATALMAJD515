"use client"

import { useEffect, useState } from "react"
import { startRealtimeSync, stopRealtimeSync, syncAllLocalToCloud, syncAllCloudToLocal } from "@/lib/firebase-sync-engine"
import { enableOfflinePersistence, auth, db } from "@/lib/firebase"
import { collection, getCountFromServer, query } from "firebase/firestore"
import { db as localDb } from "@/lib/db"
import { signInAnonymously } from "firebase/auth"
import { Cloud, CloudOff, Loader2, UploadCloud, DownloadCloud, AlertCircle } from "lucide-react"

export function FirebaseSyncManager() {
    const [status, setStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting')
    const [isUploading, setIsUploading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState("")

    const [logs, setLogs] = useState<string[]>([])

    const addLog = (msg: string) => setLogs(prev => [msg, ...prev].slice(0, 5))

    useEffect(() => {
        const init = async () => {
            // Enable persistence once (handled in lib/firebase.ts but safer to retry if needed, usually init is called once)
            try {
                await enableOfflinePersistence();
            } catch (err) {
                console.warn("Persistence init warning:", err);
            }

            try {
                // Ensure we are authenticated
                await signInAnonymously(auth);
                addLog("تم تسجيل الدخول (مجهول)");
            } catch (e: any) {
                console.error("Auth Error:", e);
                if (e.code === 'auth/configuration-not-found' || e.code === 'auth/admin-restricted-operation' || e.code === 'auth/operation-not-allowed') {
                    addLog("⚠️ خطأ: تسجيل الدخول المجهول غير مفعل!");
                    alert("تنبيه هام للمطور:\nيجب تفعيل 'Anonymous' في Firebase Console -> Authentication -> Sign-in method\nبدون ذلك لن تعمل المزامنة.");
                } else {
                    addLog("تحذير مصادقة: " + (e.message || e.code));
                }
            }

            try {
                // Start listening regardless of auth success (rules might allow public access)
                startRealtimeSync();
                setStatus('connected');
                addLog("تم الاتصال بالسحابة");

                // --- AUTO MIGRATION CHECK ---
                // Check if Cloud is empty and Local has data
                try {
                    const productsColl = collection(db, 'products');
                    // Use getCountFromServer if available, or just get 1 doc
                    // getCountFromServer is safer/cheaper
                    const snapshot = await getCountFromServer(query(productsColl));
                    const cloudCount = snapshot.data().count;

                    const localCount = await localDb.products.count();

                    console.log(`[AutoSync] Cloud: ${cloudCount}, Local: ${localCount}`);

                    if (cloudCount === 0 && localCount > 0) {
                        addLog(`⚠️ السحابة فارغة (${localCount} عنصر محلي). بدء الرفع التلقائي...`);

                        // Force a small delay to ensure connection is stable
                        await new Promise(r => setTimeout(r, 1000));

                        setIsUploading(true);
                        window.dispatchEvent(new CustomEvent('syncstart'));
                        await syncAllLocalToCloud((current, total) => {
                            // Optional: show progress toast
                            console.log(`Auto-upload: ${current}/${total}`);
                            setUploadProgress(`${Math.round((current / total) * 100)}%`);
                        });
                        addLog("✅ تم الرفع التلقائي للبيانات!");
                        setIsUploading(false);
                        window.dispatchEvent(new CustomEvent('syncend'));
                    }
                } catch (checkErr) {
                    // Suppress visual error for count permission issues as long as realtime sync is active
                    console.warn("Auto-migration check failed (likely permission issue):", checkErr);
                    // addLog("⚠️ فشل التحقق من الترحيل التلقائي"); 
                }
                // -----------------------------

            } catch (e: any) {
                console.error(e);
                setStatus('disconnected');
                addLog("خطأ في الاتصال: " + e.message);
            }
        }

        // Use a slight delay to allow browser environment to settle
        const timer = setTimeout(init, 1000);

        return () => {
            clearTimeout(timer);
            stopRealtimeSync();
        }
    }, [])

    const handleForceUpload = async () => {
        if (!confirm("هل أنت متأكد؟ سيتم رفع جميع البيانات المحلية إلى السحابة. استخدم هذا الزر فقط من الجهاز الذي يحتوي على البيانات.")) return;

        try {
            setIsUploading(true);
            window.dispatchEvent(new CustomEvent('syncstart'));
            addLog("جاري بدء الرفع...");
            const result = await syncAllLocalToCloud((current, total) => {
                setUploadProgress(`${Math.round((current / total) * 100)}%`);
            });
            window.dispatchEvent(new CustomEvent('syncend'));
            // @ts-ignore
            addLog(`✅ تم! نجاح: ${result?.successCount || 0}`);
            // @ts-ignore
            alert(`تم رفع البيانات!\nنجاح: ${result?.successCount}\nفشل: ${result?.failureCount || 0}`);
        } catch (e: any) {
            console.error(e);
            const detailedError = e.message || "Unknown error";
            addLog("❌ خطأ: " + detailedError);
            alert("خطأ أثناء الرفع:\n" + detailedError);
        } finally {
            setIsUploading(false);
            setUploadProgress("");
        }
    }

    const handleForceDownload = async () => {
        if (!confirm("هل تريد تحميل البيانات من السحابة؟ سيتم دمجها مع البيانات الحالية.")) return;
        try {
            setIsUploading(true); // Reuse uploading spinner state for locking
            window.dispatchEvent(new CustomEvent('syncstart'));
            addLog("جاري بدء التحميل...");
            await syncAllCloudToLocal((msg: string) => {
                addLog(msg);
            });
            window.dispatchEvent(new CustomEvent('syncend'));
            alert("تم تحميل البيانات بنجاح!");
        } catch (e: any) {
            console.error(e);
            addLog("❌ خطأ أثناء التحميل: " + e.message);
            alert("حدث خطأ: " + e.message);
        } finally {
            setIsUploading(false);
        }
    }

    return (
        <div className="fixed bottom-4 left-4 z-[9999] flex flex-col items-start gap-1 pointer-events-none">
            {/* Status Bar */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-background/90 backdrop-blur border rounded-full shadow-lg text-xs font-medium pointer-events-auto">
                {status === 'connected' && (
                    <>
                        <Cloud className="h-3 w-3 text-green-500" />
                        <span className="text-green-600">متصل</span>

                        {!isUploading ? (
                            <>
                                <button
                                    onClick={handleForceUpload}
                                    className="mr-1 flex items-center gap-1 bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-0.5 rounded transition-colors"
                                    title="رفع البيانات للسحابة"
                                >
                                    <UploadCloud className="h-3 w-3" />
                                    <span>رفع</span>
                                </button>
                                <button
                                    onClick={handleForceDownload}
                                    className="flex items-center gap-1 bg-green-100 hover:bg-green-200 text-green-700 px-2 py-0.5 rounded transition-colors"
                                    title="تحميل البيانات من السحابة"
                                >
                                    <DownloadCloud className="h-3 w-3" />
                                    <span>تحميل</span>
                                </button>
                            </>
                        ) : (
                            <span className="mr-2 text-blue-600 animate-pulse">
                                جاري العمل...
                            </span>
                        )}
                    </>
                )}
                {status === 'connecting' && (
                    <>
                        <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
                        <span className="text-amber-600">جاري الاتصال...</span>
                    </>
                )}
                {status === 'disconnected' && (
                    <>
                        <CloudOff className="h-3 w-3 text-red-500" />
                        <span className="text-red-600">غير متصل</span>
                    </>
                )}
            </div>

            {/* Debug Logs (Small) */}
            {logs.length > 0 && (
                <div className="bg-black/80 text-white p-2 rounded text-[10px] max-w-[300px] overflow-hidden">
                    {logs.map((log, i) => (
                        <div key={i} className="truncate">• {log}</div>
                    ))}
                </div>
            )}
        </div>
    )
}
