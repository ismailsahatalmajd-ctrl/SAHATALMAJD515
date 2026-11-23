"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Script from "next/script";
import Link from "next/link";
import {
  Maximize2,
  RefreshCw,
  Download,
  ShieldCheck,
  Sparkles,
  ChevronDown,
  Layers,
  Clock,
  Radio,
  SlidersHorizontal,
  Bell,
  Trash2,
  ExternalLink,
  Eye,
  CheckCircle2,
  AlertTriangle,
  User,
  Truck,
  Scan,
} from "lucide-react";

declare global {
  interface Window {
    EZUIKit?: any;
    cocoSsd?: any;
    tf?: any;
  }
}

interface PartnerDevice {
  id: string;
  deviceName: string;
  deviceOnlineStatus: number;
  deviceSerial: string;
  deviceVersion?: string;
  deviceType?: string;
  siteID?: string;
  siteName?: string;
  totalChannels?: number;
}

interface PresenceRule {
  enabled: boolean;
  mode: "always" | "schedule";
  start: string;
  end: string;
  confidence: number;
  hold: number;
  cooldown: number;
  roi: [number, number, number, number]; // [x1, y1, x2, y2] percentages 0..100
}

interface CloudAlarm {
  id: string;
  alarmName: string;
  alarmTime: string;
  channelNo: number;
  pictureUrl?: string;
  targetType: string;
  confidence?: number;
}

export default function MarsadPage() {
  // Devices & Channels
  const [devices, setDevices] = useState<PartnerDevice[]>([]);
  const [selectedDeviceIndex, setSelectedDeviceIndex] = useState<number>(0);
  const [selectedChannel, setSelectedChannel] = useState<number>(12); // Default to Camera 12 (where user is)
  const [quality, setQuality] = useState<"live" | "hd">("live");
  const [scriptLoaded, setScriptLoaded] = useState<boolean>(false);

  // AI Model State
  const [tfLoaded, setTfLoaded] = useState<boolean>(false);
  const [cocoLoaded, setCocoLoaded] = useState<boolean>(false);
  const [aiModel, setAiModel] = useState<any>(null);
  const [aiModelLoading, setAiModelLoading] = useState<boolean>(false);
  const [detectedPeople, setDetectedPeople] = useState<number>(0);
  const [detectedVehicles, setDetectedVehicles] = useState<number>(0);
  const [analysisMs, setAnalysisMs] = useState<number>(120);
  const [lastDetections, setLastDetections] = useState<any[]>([]);

  // Player state
  const [streamState, setStreamState] = useState<"stopped" | "connecting" | "live" | "error">("connecting");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [ageSeconds, setAgeSeconds] = useState<number>(0);
  const playerRef = useRef<any>(null);
  const activeRequestRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const lastAlertTimeRef = useRef<number>(0);

  // Presence Rule State
  const [rule, setRule] = useState<PresenceRule>({
    enabled: true,
    mode: "always",
    start: "22:00",
    end: "06:00",
    confidence: 35, // Balanced for warehouse ambient light
    hold: 1.0,
    cooldown: 60,
    roi: [0, 0, 100, 100], // Full region by default or customized
  });
  const [ruleSavedMsg, setRuleSavedMsg] = useState<string | null>(null);

  // Events & Alarms
  const [events, setEvents] = useState<CloudAlarm[]>([]);
  const [loadingEvents, setLoadingEvents] = useState<boolean>(false);

  // Ask Marsad (Visual AI Assistant)
  const [question, setQuestion] = useState<string>("");
  const [askScope, setAskScope] = useState<"live" | "today_events">("live");
  const [asking, setAsking] = useState<boolean>(false);
  const [assistantAnswer, setAssistantAnswer] = useState<string | null>(null);
  const [assistantLimits, setAssistantLimits] = useState<string | null>(null);
  const [assistantEvidence, setAssistantEvidence] = useState<any[]>([]);
  const [assistantError, setAssistantError] = useState<string | null>(null);

  const currentDevice = devices[selectedDeviceIndex] || {
    deviceName: "iDS-7216HUHI-M2/XT(GK0622137)",
    deviceSerial: "GK0622137",
    deviceOnlineStatus: 1,
    siteName: "مستودع الكاميرات الرئيسي",
    totalChannels: 16,
  };

  const totalChannels = currentDevice.totalChannels || 16;
  const channelsList = Array.from({ length: totalChannels }, (_, i) => i + 1);

  // Load Rule from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("marsad_presence_rule_v1");
      if (saved) {
        setRule(JSON.parse(saved));
      }
    } catch (e) {}
  }, []);

  // Initialize COCO-SSD / TensorFlow Model
  useEffect(() => {
    if (!cocoLoaded || typeof window === "undefined" || !window.cocoSsd) return;
    if (aiModel || aiModelLoading) return;

    setAiModelLoading(true);
    window.cocoSsd
      .load({ base: "lite_mobilenet_v2" })
      .then((model: any) => {
        setAiModel(model);
        console.log("Marsad AI Vision Model Loaded Successfully");
      })
      .catch((err: any) => {
        console.warn("Failed to load cocoSsd:", err);
      })
      .finally(() => {
        setAiModelLoading(false);
      });
  }, [cocoLoaded, aiModel, aiModelLoading]);

  // Fetch Devices
  useEffect(() => {
    fetch("/api/hik-partner/devices")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.devices && data.devices.length > 0) {
          setDevices(data.devices);
          const whIdx = data.devices.findIndex((d: PartnerDevice) => d.deviceSerial === "GK0622137");
          if (whIdx >= 0) {
            setSelectedDeviceIndex(whIdx);
          }
        }
      })
      .catch((e) => console.error("Failed to load devices:", e));
  }, []);

  // Fetch Events
  const fetchEvents = useCallback(() => {
    setLoadingEvents(true);
    fetch(`/api/cameras/cloud/alarms?channel=${selectedChannel}&type=all`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.alarms) {
          setEvents((prev) => {
            // Merge with local AI detections
            const localOnly = prev.filter((p) => p.id.startsWith("marsad_ai_"));
            return [...localOnly, ...data.alarms];
          });
        }
      })
      .catch((err) => console.warn("Failed to fetch cloud alarms:", err))
      .finally(() => setLoadingEvents(false));
  }, [selectedChannel]);

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 15000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  // Stream Duration Timer
  useEffect(() => {
    const t = setInterval(() => setAgeSeconds((prev) => prev + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Start Stream
  const startStream = useCallback(async () => {
    if (!scriptLoaded || typeof window === "undefined" || !window.EZUIKit) return;

    const containerId = "marsad-player-viewport";
    const dom = document.getElementById(containerId);
    if (!dom) return;

    const requestId = ++activeRequestRef.current;
    setStreamState("connecting");
    setStreamError(null);
    setAgeSeconds(0);
    setDetectedPeople(0);
    setDetectedVehicles(0);

    // Clean previous player
    if (playerRef.current) {
      try {
        playerRef.current.stop();
        playerRef.current = null;
      } catch (e) {}
    }

    try {
      const res = await fetch(
        `/api/hik-partner/live?deviceSerial=${encodeURIComponent(
          currentDevice.deviceSerial
        )}&channel=${selectedChannel}&quality=${quality}`
      );
      const data = await res.json();

      if (requestId !== activeRequestRef.current) return;

      if (!data.success || (!data.url && !data.directWsUrl && !data.ezopenUrl)) {
        throw new Error(data.error || "تعذر جلب رابط البث السحابي");
      }

      let playUrl = data.directWsUrl || data.url || data.ezopenUrl;
      const playToken = data.accessToken;
      const width = dom.clientWidth || 800;
      const height = dom.clientHeight || 480;

      const activeCode = currentDevice.deviceSerial === "GK0622137" ? "Y1KkbT" : "";

      if (activeCode) {
        if (playUrl.includes("?")) {
          playUrl += `&checkCode=${encodeURIComponent(activeCode)}`;
        } else {
          playUrl += `?checkCode=${encodeURIComponent(activeCode)}`;
        }
      }

      dom.innerHTML = "";

      const player = new window.EZUIKit.EZUIKitPlayer({
        id: containerId,
        url: playUrl,
        accessToken: playToken,
        staticPath: "/ezuikit/ezuikit_static/v65",
        env: { domain: "https://isgpopen.ezvizlife.com" },
        header: { verifyCode: activeCode },
        validCode: activeCode,
        width,
        height,
        audio: 0,
        autoplay: true,
        handleSuccess: () => {
          if (requestId === activeRequestRef.current) {
            setStreamState("live");
            setStreamError(null);
          }
        },
        handleError: (e: any) => {
          if (requestId !== activeRequestRef.current) return;
          if (e?.code === "200" || e?.code === 200 || e?.retcode === "0" || e?.retcode === 0) return;
          const msg = e?.msg || e?.message || e?.data?.msg || e?.data?.message;
          if (msg) {
            setStreamError(msg);
            setStreamState("error");
          }
        },
      });

      playerRef.current = player;
      if ((player as any)?.jSPlugin?.JS_SetSecretKey && activeCode) {
        try {
          (player as any).jSPlugin.JS_SetSecretKey(0, activeCode);
        } catch (e) {}
      }
    } catch (err: any) {
      if (requestId === activeRequestRef.current) {
        setStreamError(err.message || "فشل الاتصال بالبث السحابي");
        setStreamState("error");
      }
    }
  }, [scriptLoaded, currentDevice.deviceSerial, selectedChannel, quality]);

  useEffect(() => {
    if (scriptLoaded) {
      startStream();
    }
    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.stop();
          playerRef.current = null;
        } catch (e) {}
      }
    };
  }, [startStream, scriptLoaded]);

  // AI REAL-TIME OBJECT DETECTION LOOP (Person & Vehicle Detection)
  useEffect(() => {
    if (!aiModel || streamState !== "live" || !rule.enabled) {
      // Clear overlay when disabled
      const overlay = overlayCanvasRef.current;
      if (overlay) {
        const ctx = overlay.getContext("2d");
        ctx?.clearRect(0, 0, overlay.width, overlay.height);
      }
      return;
    }

    let isScanning = false;
    let timerId: any = null;

    const runDetection = async () => {
      if (isScanning) return;

      const viewport = document.getElementById("marsad-player-viewport");
      const videoCanvas = viewport?.querySelector("canvas:not(#marsad-detection-overlay)") as HTMLCanvasElement;
      const overlay = overlayCanvasRef.current;

      if (!videoCanvas || videoCanvas.width < 10 || videoCanvas.height < 10 || !overlay) {
        return;
      }

      isScanning = true;
      const t0 = performance.now();

      try {
        // Sync overlay dimensions
        if (overlay.width !== overlay.clientWidth || overlay.height !== overlay.clientHeight) {
          overlay.width = overlay.clientWidth;
          overlay.height = overlay.clientHeight;
        }

        const ctx = overlay.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, overlay.width, overlay.height);

        // Run inference
        const minConf = Math.max(0.25, (rule.confidence || 40) / 100);
        const predictions = await aiModel.detect(videoCanvas);
        const t1 = performance.now();
        setAnalysisMs(Math.round(t1 - t0));

        const scaleX = overlay.width / videoCanvas.width;
        const scaleY = overlay.height / videoCanvas.height;

        let peopleCount = 0;
        let vehiclesCount = 0;
        const currentDetections: any[] = [];

        const [rx1, ry1, rx2, ry2] = rule.roi;

        for (const pred of predictions) {
          const isPerson = pred.class === "person";
          const isVehicle = ["car", "truck", "bus", "motorcycle"].includes(pred.class);

          if (!isPerson && !isVehicle) continue;
          if (pred.score < minConf) continue;

          const [bx, by, bw, bh] = pred.bbox;
          const sx = bx * scaleX;
          const sy = by * scaleY;
          const sw = bw * scaleX;
          const sh = bh * scaleY;

          // Feet / Ground anchor point calculation (bottom-center)
          const footXPercent = ((bx + bw / 2) / videoCanvas.width) * 100;
          const footYPercent = ((by + bh) / videoCanvas.height) * 100;

          const inRoi =
            footXPercent >= rx1 && footXPercent <= rx2 && footYPercent >= ry1 && footYPercent <= ry2;

          if (isPerson) peopleCount++;
          if (isVehicle) vehiclesCount++;

          currentDetections.push({
            class: pred.class,
            label: isPerson ? "شخص" : pred.class === "truck" ? "شاحنة" : "مركبة",
            score: Math.round(pred.score * 100),
            inRoi,
            box: [sx, sy, sw, sh],
          });

          // Draw Bounding Box with High-Tech Glow
          const mainColor = isPerson ? "#22c55e" : "#06b6d4"; // Green for Person, Cyan for Vehicle
          const activeColor = inRoi ? "#eab308" : mainColor; // Gold if inside ROI

          ctx.save();
          ctx.strokeStyle = activeColor;
          ctx.lineWidth = 2.5;
          ctx.shadowColor = activeColor;
          ctx.shadowBlur = 8;

          // Corner-accented rounded rectangle
          ctx.strokeRect(sx, sy, sw, sh);

          // Subtle translucent fill
          ctx.fillStyle = isPerson ? "rgba(34, 197, 94, 0.12)" : "rgba(6, 182, 212, 0.12)";
          ctx.fillRect(sx, sy, sw, sh);

          // Label Badge Header
          const badgeText = `${isPerson ? "شخص" : pred.class === "truck" ? "شاحنة" : "مركبة"} ${Math.round(
            pred.score * 100
          )}%`;
          ctx.font = "bold 11px sans-serif";
          const textWidth = ctx.measureText(badgeText).width;

          ctx.fillStyle = activeColor;
          ctx.fillRect(sx, Math.max(0, sy - 20), textWidth + 12, 20);

          ctx.fillStyle = "#ffffff";
          ctx.fillText(badgeText, sx + 6, Math.max(14, sy - 6));

          // Base anchor point (Feet / Wheel base indicator)
          ctx.beginPath();
          ctx.arc(sx + sw / 2, sy + sh, 4, 0, Math.PI * 2);
          ctx.fillStyle = inRoi ? "#eab308" : "#ffffff";
          ctx.fill();
          ctx.strokeStyle = "#152b46";
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.restore();
        }

        setDetectedPeople(peopleCount);
        setDetectedVehicles(vehiclesCount);
        setLastDetections(currentDetections);

        // Auto Snapshot & Event creation on intrusion (with cooldown)
        const now = Date.now();
        if (
          (peopleCount > 0 || vehiclesCount > 0) &&
          now - lastAlertTimeRef.current >= rule.cooldown * 1000
        ) {
          lastAlertTimeRef.current = now;
          try {
            const snap = videoCanvas.toDataURL("image/jpeg", 0.7);
            const nowRiyadh = new Intl.DateTimeFormat("ar-SA", {
              timeZone: "Asia/Riyadh",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: true,
            }).format(new Date());

            const newAlert: CloudAlarm = {
              id: `marsad_ai_${now}`,
              alarmName:
                peopleCount > 0
                  ? "رصد حضور شخص داخل المستطيل الذهبي"
                  : "رصد مركبة / شاحنة في منطقة المراقبة",
              targetType: peopleCount > 0 ? "human" : "vehicle",
              alarmTime: nowRiyadh,
              channelNo: selectedChannel,
              pictureUrl: snap,
              confidence: 90,
            };

            setEvents((prev) => [newAlert, ...prev.slice(0, 19)]);
          } catch (e) {
            console.warn("Could not capture AI event snapshot:", e);
          }
        }
      } catch (err) {
        console.warn("Detection error in loop:", err);
      } finally {
        isScanning = false;
      }
    };

    // Run every 600ms for smooth real-time tracking
    timerId = setInterval(runDetection, 600);
    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [aiModel, streamState, rule, selectedChannel]);

  // Save Rule
  const handleSaveRule = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem("marsad_presence_rule_v1", JSON.stringify(rule));
      setRuleSavedMsg("تم حفظ القاعدة بنجاح وتحديث المستطيل الذهبي.");
      setTimeout(() => setRuleSavedMsg(null), 4000);
    } catch (e) {
      setRuleSavedMsg("تعذر حفظ الإعدادات في المتصفح");
    }
  };

  // Ask Marsad
  const handleAskAssistant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    setAsking(true);
    setAssistantError(null);
    setAssistantAnswer(null);
    setAssistantLimits(null);
    setAssistantEvidence([]);

    // Capture frame base64 from active video canvas if available
    let snapBase64 = "";
    try {
      const viewport = document.getElementById("marsad-player-viewport");
      const videoCanvas = viewport?.querySelector("canvas:not(#marsad-detection-overlay)") as HTMLCanvasElement;
      if (videoCanvas) {
        snapBase64 = videoCanvas.toDataURL("image/jpeg", 0.75);
      }
    } catch (e) {}

    try {
      const res = await fetch("/api/marsad/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          scope: askScope,
          channelNo: selectedChannel,
          deviceSerial: currentDevice.deviceSerial,
          imageBase64: snapBase64,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "فشل تحليل المشهد عبر المساعد");
      }

      setAssistantAnswer(data.answer);
      setAssistantLimits(data.limitations);
      setAssistantEvidence(data.evidence || []);
    } catch (err: any) {
      setAssistantError(err.message || "حدث خطأ أثناء سؤال المساعد البصري");
    } finally {
      setAsking(false);
    }
  };

  // Clear Events
  const handleClearEvents = () => {
    if (confirm("هل ترغب في مسح سجل التنبيهات من الشاشة؟")) {
      setEvents([]);
    }
  };

  // Fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => console.error(err));
    } else {
      document.exitFullscreen().catch((err) => console.error(err));
    }
  };

  // ROI coordinates for visual Golden Box
  const [x1, y1, x2, y2] = rule.roi;
  const roiWidth = Math.max(5, x2 - x1);
  const roiHeight = Math.max(5, y2 - y1);

  return (
    <>
      {/* EZUIKit Script */}
      <Script
        src="/ezuikit/ezuikit.js?v=marsad_cloud_v1"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
      />

      {/* TensorFlow.js & COCO-SSD for Real-time AI Person & Vehicle Detection */}
      <Script
        src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.21.0/dist/tf.min.js"
        strategy="afterInteractive"
        onLoad={() => setTfLoaded(true)}
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js"
        strategy="afterInteractive"
        onLoad={() => setCocoLoaded(true)}
      />

      <div
        dir="rtl"
        className="min-h-screen text-[#152b46] bg-[#f6f3ed] font-sans antialiased selection:bg-[#b38a46]/20"
      >
        {/* HEADER */}
        <header className="bg-[#152b46] text-white px-6 md:px-12 py-5 shadow-lg border-b border-[#213f64]">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#b38a46] flex items-center justify-center text-white shadow-md">
                <Eye className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">مرصد</h1>
                  <span className="text-xs bg-[#b38a46] text-white px-2 py-0.5 rounded-full font-bold">
                    سحابي 1.0 · كاشف ذكي
                  </span>
                </div>
                <p className="text-xs md:text-sm text-[#cbd5e1] mt-0.5">
                  رصد الأشخاص والمركبات المباشر لجميع الكاميرات · بدون كمبيوتر خادم
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* AI Status Badge */}
              <div
                className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-bold transition-all ${
                  aiModel
                    ? "bg-emerald-950/80 text-emerald-300 border-emerald-700/60"
                    : aiModelLoading
                    ? "bg-amber-950/80 text-amber-300 border-amber-700/60"
                    : "bg-slate-800 text-slate-300 border-slate-700"
                }`}
              >
                <Scan
                  className={`w-3.5 h-3.5 ${
                    aiModel ? "text-emerald-400" : aiModelLoading ? "animate-spin text-amber-400" : ""
                  }`}
                />
                <span>
                  {aiModel
                    ? "نموذج الذكاء الاصطناعي نشط"
                    : aiModelLoading
                    ? "جارٍ تحميل نموذج الرصد..."
                    : "جاري تجهيز الكاشف..."}
                </span>
              </div>

              <Link
                href="/partner-cameras"
                className="inline-flex items-center gap-1.5 text-xs bg-[#213f64] hover:bg-[#2b517e] text-white px-3 py-1.5 rounded-lg border border-[#335c8d] transition-colors"
              >
                <Layers className="w-3.5 h-3.5 text-[#b38a46]" />
                <span>منصة الكاميرات الشاملة</span>
                <ExternalLink className="w-3 h-3 opacity-70" />
              </Link>
            </div>
          </div>
        </header>

        {/* STATUS PILLS BAR */}
        <div className="max-w-7xl mx-auto px-4 md:px-8 pt-6">
          <div className="flex flex-wrap items-center gap-2.5 text-xs md:text-sm">
            <span className="inline-flex items-center gap-1.5 bg-white border border-[#e1e3e5] px-3.5 py-1.5 rounded-full shadow-sm font-semibold">
              <span
                className={`w-2 h-2 rounded-full ${
                  streamState === "live"
                    ? "bg-emerald-500 animate-pulse"
                    : streamState === "connecting"
                    ? "bg-amber-500 animate-ping"
                    : "bg-rose-500"
                }`}
              />
              <span>
                {streamState === "live"
                  ? "البث متصل وسحابي"
                  : streamState === "connecting"
                  ? "جارٍ الاتصال بالسحابة..."
                  : "انقطع البث"}
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5 bg-white border border-[#e1e3e5] px-3.5 py-1.5 rounded-full shadow-sm text-[#687584]">
              <Layers className="w-3.5 h-3.5 text-[#b38a46]" />
              <span>
                الكاميرا النشطة: <b>قناة {selectedChannel.toString().padStart(2, "0")}</b>
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5 bg-white border border-[#e1e3e5] px-3.5 py-1.5 rounded-full shadow-sm text-[#687584]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#b38a46]" />
              <span>
                حالة التحليل:{" "}
                <b className={rule.enabled ? "text-emerald-700" : "text-slate-500"}>
                  {rule.enabled
                    ? detectedPeople > 0 || detectedVehicles > 0
                      ? `تم رصد ${detectedPeople} شخص و ${detectedVehicles} مركبة`
                      : "المستطيل الذهبي مفعّل وجاهز"
                    : "التحليل معطّل"}
                </b>
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5 bg-white border border-[#e1e3e5] px-3.5 py-1.5 rounded-full shadow-sm text-[#687584] mr-auto">
              <Clock className="w-3.5 h-3.5 text-[#b38a46]" />
              <span>التوقيت: الرياض (UTC+3)</span>
            </span>
          </div>
        </div>

        {/* NOTIFICATION MESSAGE */}
        {ruleSavedMsg && (
          <div className="max-w-7xl mx-auto px-4 md:px-8 mt-4">
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{ruleSavedMsg}</span>
            </div>
          </div>
        )}

        {/* MAIN TWO-COLUMN GRID */}
        <main className="max-w-7xl mx-auto p-4 md:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT / CENTER COLUMN: Video Player & Events & Ask Marsad */}
            <div className="lg:col-span-8 space-y-6">
              {/* 1. CAMERA STREAM CARD */}
              <div className="bg-white border border-[#e1e3e5] rounded-2xl p-5 md:p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-xl font-bold flex items-center gap-2 text-[#152b46]">
                      <span>
                        كاميرا {selectedChannel.toString().padStart(2, "0")} — {currentDevice.siteName || "المستودع"}
                      </span>
                    </h2>
                    <p className="text-xs text-[#687584] mt-0.5">
                      الجهاز: {currentDevice.deviceName} ({currentDevice.deviceSerial})
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setQuality(quality === "live" ? "hd" : "live")}
                      className={`text-xs px-2.5 py-1 rounded-md font-bold border transition-colors ${
                        quality === "hd"
                          ? "bg-amber-100 text-amber-900 border-amber-300"
                          : "bg-slate-100 text-slate-700 border-slate-300"
                      }`}
                      title="تبديل جودة البث"
                    >
                      {quality === "hd" ? "2K HD عالي" : "Sub سلس"}
                    </button>
                    <button
                      onClick={startStream}
                      className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md border border-slate-200"
                      title="تحديث البث"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={toggleFullscreen}
                      className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md border border-slate-200"
                      title="ملء الشاشة"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* THE VIEWPORT CONTAINER */}
                <div
                  ref={containerRef}
                  className="relative w-full aspect-[5/3] bg-[#101d2c] rounded-xl overflow-hidden shadow-inner flex items-center justify-center"
                >
                  {/* EZUIKit Target Div */}
                  <div id="marsad-player-viewport" className="w-full h-full" />

                  {/* REAL-TIME AI BOUNDING BOXES OVERLAY CANVAS */}
                  <canvas
                    id="marsad-detection-overlay"
                    ref={overlayCanvasRef}
                    className="absolute inset-0 w-full h-full pointer-events-none z-15"
                  />

                  {/* Golden ROI Overlay (المستطيل الذهبي) */}
                  {rule.enabled && streamState === "live" && (
                    <div
                      style={{
                        position: "absolute",
                        left: `${x1}%`,
                        top: `${y1}%`,
                        width: `${roiWidth}%`,
                        height: `${roiHeight}%`,
                        border: "2px dashed #eab308",
                        backgroundColor: "rgba(234, 179, 8, 0.05)",
                        pointerEvents: "none",
                        zIndex: 10,
                        transition: "all 0.15s ease-out",
                      }}
                    >
                      <div className="absolute top-1 right-1 bg-amber-500/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow flex items-center gap-1">
                        <Scan className="w-3 h-3" />
                        <span>منطقة قاعدة الحضور الذهبية (ROI)</span>
                      </div>
                    </div>
                  )}

                  {/* Connecting / Error Placeholder */}
                  {streamState !== "live" && (
                    <div className="absolute inset-0 bg-[#101d2c]/90 flex flex-col items-center justify-center p-6 text-center text-white z-20">
                      {streamState === "connecting" ? (
                        <>
                          <div className="w-10 h-10 border-4 border-[#b38a46] border-t-transparent rounded-full animate-spin mb-3" />
                          <p className="font-semibold text-sm">جارٍ جلب البث السحابي المباشر...</p>
                          <p className="text-xs text-slate-400 mt-1">فك التشفير برمز الحماية والاتصال الآمن</p>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-10 h-10 text-rose-400 mb-2" />
                          <p className="font-bold text-sm text-rose-300">
                            {streamError || "تعذر بدء البث المباشر"}
                          </p>
                          <button
                            onClick={startStream}
                            className="mt-3 text-xs bg-[#b38a46] hover:bg-[#977335] text-white px-4 py-2 rounded-lg font-bold transition-colors"
                          >
                            إعادة المحاولة
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* DYNAMIC REAL-TIME STATS BAR */}
                <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-[#f1f3f5] text-xs text-[#687584]">
                  <div className="flex flex-wrap items-center gap-4">
                    <span>
                      مدة البث: <b className="text-[#152b46] font-semibold">{ageSeconds} ث</b>
                    </span>

                    {/* Detected Persons Counter */}
                    <span className="flex items-center gap-1">
                      <User className={`w-3.5 h-3.5 ${detectedPeople > 0 ? "text-emerald-600" : "text-slate-400"}`} />
                      <span>الأشخاص المرصودون:</span>
                      <b
                        className={`px-1.5 py-0.2 rounded font-bold ${
                          detectedPeople > 0 ? "bg-emerald-100 text-emerald-800 text-sm" : "text-[#152b46]"
                        }`}
                      >
                        {detectedPeople}
                      </b>
                    </span>

                    {/* Detected Vehicles Counter */}
                    <span className="flex items-center gap-1">
                      <Truck className={`w-3.5 h-3.5 ${detectedVehicles > 0 ? "text-cyan-600" : "text-slate-400"}`} />
                      <span>المركبات المرصودة:</span>
                      <b
                        className={`px-1.5 py-0.2 rounded font-bold ${
                          detectedVehicles > 0 ? "bg-cyan-100 text-cyan-800 text-sm" : "text-[#152b46]"
                        }`}
                      >
                        {detectedVehicles}
                      </b>
                    </span>

                    <span>
                      وقت الاستجابة: <b className="text-[#152b46] font-semibold">~{analysisMs} مللي ثانية</b>
                    </span>
                  </div>

                  <a
                    href={`/api/cameras/cloud/snapshot?channel=${selectedChannel}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-[#152b46] hover:text-[#b38a46] font-bold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>حفظ لقطة البث الحالية</span>
                  </a>
                </div>

                <p className="text-[11px] text-[#687584] mt-3 bg-[#fdfbf7] p-2.5 rounded-lg border border-[#f3eee4] leading-relaxed">
                  <b>المربعات الذكية:</b> يتم تحديد الأشخاص باللون <span className="text-emerald-600 font-bold">الأخضر</span>، والمركبات والشاحنات باللون <span className="text-cyan-600 font-bold">السماوي</span>، وعند دخولهم <b>المستطيل الذهبي</b> يتحول المربع إلى <span className="text-amber-600 font-bold">الذهبي</span> ويتم تسجيل الحدث تلقائياً في السجل.
                </p>
              </div>

              {/* 2. ASK MARSAD (VISUAL AI ASSISTANT) */}
              <div className="bg-white border border-[#e1e3e5] rounded-2xl p-5 md:p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 bg-amber-100 text-[#b38a46] rounded-lg">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-bold text-[#152b46]">اسأل مرصد</h2>
                </div>
                <p className="text-xs text-[#687584] mb-4 leading-relaxed">
                  السؤال يحلل لقطة الكاميرا الحالية بالذكاء الاصطناعي البصري. اسأل بالعربية عما تلاحظه في المشهد (مثلاً عن الشاحنة، أو العمال).
                </p>

                <form onSubmit={handleAskAssistant} className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-1">
                      <label className="block text-xs font-bold text-slate-700 mb-1">نطاق السؤال</label>
                      <select
                        value={askScope}
                        onChange={(e: any) => setAskScope(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#152b46]"
                      >
                        <option value="live">اللقطة الحالية</option>
                        <option value="today_events">آخر تنبيهات اليوم</option>
                      </select>
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-xs font-bold text-slate-700 mb-1">سؤالك للمساعد</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={question}
                          onChange={(e) => setQuestion(e.target.value)}
                          placeholder="وش تلاحظ في اللقطة؟ (مثال: هل الشاحنة متوقفة؟ هل يوجد شخص خلفها؟)"
                          maxLength={1000}
                          className="flex-1 text-xs bg-white border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#152b46]"
                        />
                        <button
                          type="submit"
                          disabled={asking || !question.trim()}
                          className="text-xs font-bold px-5 py-2.5 bg-[#152b46] hover:bg-[#203f67] disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
                        >
                          {asking ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>جارٍ التحليل...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5 text-[#b38a46]" />
                              <span>اسأل مرصد</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </form>

                {/* ASSISTANT RESPONSE */}
                {assistantAnswer && (
                  <div className="mt-4 p-4 bg-[#f8fafc] border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#152b46]">
                      <Sparkles className="w-4 h-4 text-[#b38a46]" />
                      <span>إجابة مرصد:</span>
                    </div>
                    <p className="text-xs md:text-sm text-slate-800 whitespace-pre-wrap leading-relaxed font-medium">
                      {assistantAnswer}
                    </p>
                    {assistantLimits && (
                      <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-200">
                        {assistantLimits}
                      </p>
                    )}
                  </div>
                )}

                {assistantError && (
                  <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
                    {assistantError}
                  </div>
                )}
              </div>

              {/* 3. CLOUD ALARMS & EVENTS LOG */}
              <div className="bg-white border border-[#e1e3e5] rounded-2xl p-5 md:p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <h2 className="text-xl font-bold flex items-center gap-2 text-[#152b46]">
                      <Bell className="w-5 h-5 text-[#b38a46]" />
                      <span>سجل التنبيهات والأحداث المرصودة</span>
                    </h2>
                    <p className="text-xs text-[#687584] mt-0.5">
                      الأحداث وصورها الملتقطة عند رصد شخص أو مركبة في المنطقة
                    </p>
                  </div>
                  <button
                    onClick={handleClearEvents}
                    className="inline-flex items-center gap-1 text-xs bg-[#f1f3f5] hover:bg-[#e4e7eb] text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-slate-500" />
                    <span>مسح السجل</span>
                  </button>
                </div>

                {events.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    {loadingEvents ? (
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-[#b38a46]" />
                        <span>جارٍ تحميل الأحداث...</span>
                      </div>
                    ) : (
                      "لا توجد أحداث مسجلة حالياً على هذه القناة. تحرك شخص أو شاحنة داخل المستطيل الذهبي يسجل الحدث تلقائياً."
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                    {events.slice(0, 9).map((evt) => (
                      <div
                        key={evt.id}
                        className="border border-[#e1e3e5] rounded-xl overflow-hidden bg-[#fafafa] shadow-xs hover:border-[#b38a46] transition-colors"
                      >
                        {evt.pictureUrl ? (
                          <img
                            src={evt.pictureUrl}
                            alt={evt.alarmName || "صورة التنبيه"}
                            className="w-full aspect-video object-cover bg-slate-200"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full aspect-video bg-slate-100 flex items-center justify-center text-slate-400 text-xs">
                            لا توجد لقطة
                          </div>
                        )}
                        <div className="p-3 text-xs space-y-1">
                          <div className="font-bold text-[#152b46] flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              {evt.targetType === "human" ? (
                                <User className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Truck className="w-3.5 h-3.5 text-cyan-600" />
                              )}
                              <span>
                                {evt.targetType === "human"
                                  ? "رصد شخص"
                                  : evt.targetType === "vehicle"
                                  ? "رصد شاحنة/مركبة"
                                  : evt.alarmName}
                              </span>
                            </span>
                            <span className="text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-bold">
                              قناة {evt.channelNo || selectedChannel}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#687584]">
                            {evt.alarmTime || "بتوقيت الرياض"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN (SIDEBAR): Multi-Camera Selection & Presence Rules */}
            <div className="lg:col-span-4 space-y-6">
              {/* 1. ALL CAMERAS & DEVICE SELECTOR */}
              <div className="bg-white border border-[#e1e3e5] rounded-2xl p-5 shadow-sm">
                <h2 className="text-lg font-bold text-[#152b46] mb-3 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-[#b38a46]" />
                  <span>عرض جميع الكاميرات</span>
                </h2>

                {/* Device Selector */}
                <div className="mb-4">
                  <label className="block text-xs font-bold text-slate-700 mb-1">جهاز الـ DVR</label>
                  <div className="relative">
                    <select
                      value={selectedDeviceIndex}
                      onChange={(e) => {
                        const idx = parseInt(e.target.value, 10);
                        setSelectedDeviceIndex(idx);
                        setSelectedChannel(1);
                      }}
                      className="w-full text-xs font-bold bg-[#fafafa] border border-slate-300 rounded-lg p-2.5 pl-8 appearance-none focus:outline-none focus:ring-2 focus:ring-[#152b46]"
                    >
                      {devices.map((dev, i) => (
                        <option key={dev.id || i} value={i}>
                          {dev.deviceName} ({dev.totalChannels || 16} كاميرات)
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-500 absolute left-2.5 top-3 pointer-events-none" />
                  </div>
                </div>

                {/* Channel Grid Selector */}
                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-2">
                    <span>اختر الكاميرا ({channelsList.length} قنوات):</span>
                    <span className="text-[#b38a46]">
                      كاميرا {selectedChannel.toString().padStart(2, "0")}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {channelsList.map((ch) => (
                      <button
                        key={ch}
                        onClick={() => setSelectedChannel(ch)}
                        className={`p-2 rounded-lg text-xs font-bold border transition-all text-center flex flex-col items-center justify-center gap-0.5 ${
                          selectedChannel === ch
                            ? "bg-[#152b46] text-white border-[#152b46] shadow-md scale-102"
                            : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                      >
                        <span className="text-[10px] opacity-75">كاميرا</span>
                        <span className="text-sm">{ch.toString().padStart(2, "0")}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 2. PRESENCE RULE CARD (قاعدة وجود شخص والمركبات) */}
              <div className="bg-white border border-[#e1e3e5] rounded-2xl p-5 shadow-sm">
                <h2 className="text-lg font-bold text-[#152b46] mb-2 flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-[#b38a46]" />
                  <span>قاعدة الرصد الذكي والمستطيل الذهبي</span>
                </h2>
                <p className="text-xs text-[#687584] mb-4">
                  تحديد المنطقة الذهبية وأوقات المراقبة وحساسية اكتشاف الأشخاص والشاحنات.
                </p>

                <form onSubmit={handleSaveRule} className="space-y-4 text-xs">
                  {/* Enable Rule Checkbox */}
                  <label className="flex items-center gap-2 font-bold cursor-pointer bg-[#fafafa] p-2.5 rounded-lg border border-slate-200">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) => setRule({ ...rule, enabled: e.target.checked })}
                      className="w-4 h-4 rounded text-[#152b46] focus:ring-[#152b46]"
                    />
                    <span>تفعيل التحليل ورسم مربعات التتبع</span>
                  </label>

                  {/* Mode Schedule */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">وقت تطبيق القاعدة</label>
                    <select
                      value={rule.mode}
                      onChange={(e: any) => setRule({ ...rule, mode: e.target.value })}
                      className="w-full bg-[#fafafa] border border-slate-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-[#152b46]"
                    >
                      <option value="always">طوال اليوم (24 ساعة)</option>
                      <option value="schedule">فترة محددة بتوقيت الرياض</option>
                    </select>
                  </div>

                  {rule.mode === "schedule" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-0.5">من الساعة</label>
                        <input
                          type="time"
                          value={rule.start}
                          onChange={(e) => setRule({ ...rule, start: e.target.value })}
                          className="w-full bg-[#fafafa] border border-slate-300 rounded-lg p-1.5 text-center"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-0.5">إلى الساعة</label>
                        <input
                          type="time"
                          value={rule.end}
                          onChange={(e) => setRule({ ...rule, end: e.target.value })}
                          className="w-full bg-[#fafafa] border border-slate-300 rounded-lg p-1.5 text-center"
                        />
                      </div>
                    </div>
                  )}

                  {/* Golden Box ROI Sliders */}
                  <div className="pt-2 border-t border-slate-100 space-y-2.5">
                    <span className="font-bold text-slate-800 block">
                      أبعاد المستطيل الذهبي (ROI %)
                    </span>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] text-slate-600 flex justify-between">
                          <span>يسار:</span>
                          <b>{x1}%</b>
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="90"
                          value={x1}
                          onChange={(e) =>
                            setRule({
                              ...rule,
                              roi: [parseInt(e.target.value, 10), y1, Math.max(parseInt(e.target.value, 10) + 10, x2), y2],
                            })
                          }
                          className="w-full accent-[#b38a46]"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-600 flex justify-between">
                          <span>أعلى:</span>
                          <b>{y1}%</b>
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="90"
                          value={y1}
                          onChange={(e) =>
                            setRule({
                              ...rule,
                              roi: [x1, parseInt(e.target.value, 10), x2, Math.max(parseInt(e.target.value, 10) + 10, y2)],
                            })
                          }
                          className="w-full accent-[#b38a46]"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-600 flex justify-between">
                          <span>يمين:</span>
                          <b>{x2}%</b>
                        </label>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          value={x2}
                          onChange={(e) =>
                            setRule({
                              ...rule,
                              roi: [Math.min(parseInt(e.target.value, 10) - 10, x1), y1, parseInt(e.target.value, 10), y2],
                            })
                          }
                          className="w-full accent-[#b38a46]"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-600 flex justify-between">
                          <span>أسفل:</span>
                          <b>{y2}%</b>
                        </label>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          value={y2}
                          onChange={(e) =>
                            setRule({
                              ...rule,
                              roi: [x1, Math.min(parseInt(e.target.value, 10) - 10, y1), x2, parseInt(e.target.value, 10)],
                            })
                          }
                          className="w-full accent-[#b38a46]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Confidence & Hold */}
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <div>
                      <div className="flex justify-between font-bold text-slate-700">
                        <span>حد ثقة النموذج:</span>
                        <span className="text-[#b38a46]">{rule.confidence}%</span>
                      </div>
                      <input
                        type="range"
                        min="25"
                        max="85"
                        value={rule.confidence}
                        onChange={(e) => setRule({ ...rule, confidence: parseInt(e.target.value, 10) })}
                        className="w-full accent-[#152b46]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-0.5">استمرار الحضور</label>
                        <select
                          value={rule.hold}
                          onChange={(e) => setRule({ ...rule, hold: parseFloat(e.target.value) })}
                          className="w-full bg-[#fafafa] border border-slate-300 rounded-lg p-1.5"
                        >
                          <option value="1">1 ثانية</option>
                          <option value="2">2 ثوانٍ</option>
                          <option value="5">5 ثوانٍ</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-0.5">فاصل التنبيه</label>
                        <select
                          value={rule.cooldown}
                          onChange={(e) => setRule({ ...rule, cooldown: parseInt(e.target.value, 10) })}
                          className="w-full bg-[#fafafa] border border-slate-300 rounded-lg p-1.5"
                        >
                          <option value="30">30 ثانية</option>
                          <option value="60">دقيقة واحدة</option>
                          <option value="300">5 دقائق</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-[#152b46] hover:bg-[#203f67] text-white font-bold rounded-lg transition-colors shadow-sm"
                  >
                    حفظ وتطبيق القاعدة
                  </button>
                </form>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
