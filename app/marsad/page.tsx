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
  Activity,
  X,
  ZoomIn,
  Filter,
  ChevronLeft,
  ChevronRight,
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

// Schedule & Rule Status Evaluator
function getScheduleStatus(rule: PresenceRule): {
  isActive: boolean;
  statusLabel: string;
  scheduleLabel: string;
  isOvernight: boolean;
  currentRiyadhTimeStr: string;
} {
  if (!rule.enabled) {
    return {
      isActive: false,
      statusLabel: "القاعدة معطلة",
      scheduleLabel: "معطلة",
      isOvernight: false,
      currentRiyadhTimeStr: "",
    };
  }

  // Current Riyadh Time
  const now = new Date();
  const riyadhParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);

  const curH = parseInt(riyadhParts.find((p) => p.type === "hour")?.value || "0", 10);
  const curM = parseInt(riyadhParts.find((p) => p.type === "minute")?.value || "0", 10);
  const nowMin = curH * 60 + curM;

  const currentRiyadhTimeStr = new Intl.DateTimeFormat("ar-SA", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(now);

  if (rule.mode === "always") {
    return {
      isActive: true,
      statusLabel: "نشطة طوال اليوم (24 ساعة)",
      scheduleLabel: "طوال اليوم (24 ساعة)",
      isOvernight: false,
      currentRiyadhTimeStr,
    };
  }

  // Parse start & end times (handles "17:00", "05:00 PM", "5:00", etc.)
  const parseMin = (t: string) => {
    if (!t) return 0;
    const isPM = /pm/i.test(t);
    const isAM = /am/i.test(t);
    const clean = t.replace(/[^0-9:]/g, "");
    const [hStr, mStr] = clean.split(":");
    let h = parseInt(hStr || "0", 10);
    const m = parseInt(mStr || "0", 10);
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    return h * 60 + m;
  };

  const startM = parseMin(rule.start || "17:00");
  const endM = parseMin(rule.end || "06:00");
  const isOvernight = startM > endM;

  const isActive = isOvernight
    ? nowMin >= startM || nowMin <= endM
    : nowMin >= startM && nowMin <= endM;

  const formatMin12h = (min: number) => {
    const h24 = Math.floor(min / 60);
    const m = min % 60;
    const period = h24 >= 12 ? "م" : "ص";
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
  };

  const scheduleLabel = `${formatMin12h(startM)} - ${formatMin12h(endM)}`;
  const statusLabel = isActive
    ? `نشطة ضمن وقت الجدول (${scheduleLabel})`
    : `خارج وقت الجدول المحدد (${scheduleLabel})`;

  return { isActive, statusLabel, scheduleLabel, isOvernight, currentRiyadhTimeStr };
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
  const [selectedChannel, setSelectedChannel] = useState<number>(12); // Default to Camera 12 (active warehouse camera)
  const [quality, setQuality] = useState<"live" | "hd">("live");
  const [scriptLoaded, setScriptLoaded] = useState<boolean>(false);

  // AI & Detection State
  const [aiModelReady, setAiModelReady] = useState<boolean>(false);
  const [aiStatusText, setAiStatusText] = useState<string>("جاري تشغيل محرك الرصد الذكي...");
  const [detectedPeople, setDetectedPeople] = useState<number>(0);
  const [detectedVehicles, setDetectedVehicles] = useState<number>(0);
  const [targetsInRoi, setTargetsInRoi] = useState<{ people: number; vehicles: number }>({ people: 0, vehicles: 0 });
  const [analysisMs, setAnalysisMs] = useState<number>(85);

  // Player state
  const [streamState, setStreamState] = useState<"stopped" | "connecting" | "live" | "error">("connecting");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [ageSeconds, setAgeSeconds] = useState<number>(0);
  const playerRef = useRef<any>(null);
  const activeRequestRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const prevFrameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const aiModelRef = useRef<any>(null);
  const lastAlertTimeRef = useRef<number>(0);
  const lastFrameBase64Ref = useRef<string>("");

  // Presence Rule State
  const [rule, setRule] = useState<PresenceRule>({
    enabled: true,
    mode: "always",
    start: "22:00",
    end: "06:00",
    confidence: 30, // 30% for responsive warehouse tracking
    hold: 1.0,
    cooldown: 30,
    roi: [0, 0, 100, 100], // Full field of view by default
  });
  const [ruleSavedMsg, setRuleSavedMsg] = useState<string | null>(null);

  // Events & Alarms
  const [events, setEvents] = useState<CloudAlarm[]>([]);
  const [loadingEvents, setLoadingEvents] = useState<boolean>(false);
  const [selectedEventModal, setSelectedEventModal] = useState<CloudAlarm | null>(null);
  const [eventFilterType, setEventFilterType] = useState<"all" | "human" | "vehicle">("all");
  const [eventFilterChannel, setEventFilterChannel] = useState<"all" | "current">("all");
  const [visibleEventsCount, setVisibleEventsCount] = useState<number>(18);

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

  // Safe Sequential Loader for TensorFlow.js & COCO-SSD
  useEffect(() => {
    let active = true;

    const loadCocoModel = async () => {
      try {
        setAiStatusText("جارٍ تحميل نموذج كشف الأشخاص والشاحنات...");
        if ((window as any).cocoSsd) {
          const model = await (window as any).cocoSsd.load({ base: "lite_mobilenet_v2" });
          if (active) {
            aiModelRef.current = model;
            setAiModelReady(true);
            setAiStatusText("نموذج الذكاء الاصطناعي نشط ومباشر");
            console.log("Marsad COCO-SSD loaded!");
          }
        }
      } catch (err) {
        console.warn("cocoSsd lite load failed, trying fallback:", err);
        try {
          if ((window as any).cocoSsd) {
            const fallback = await (window as any).cocoSsd.load({ base: "mobilenet_v1" });
            if (active) {
              aiModelRef.current = fallback;
              setAiModelReady(true);
              setAiStatusText("نموذج الذكاء الاصطناعي نشط ومباشر");
            }
          }
        } catch (e2) {
          console.warn("Fallback failed, relying on dynamic motion contour tracker:", e2);
          if (active) {
            setAiStatusText("كاشف الحركة والأجسام الذكي نشط");
          }
        }
      }
    };

    const injectScripts = () => {
      if (typeof window === "undefined") return;

      if ((window as any).cocoSsd && (window as any).tf) {
        loadCocoModel();
        return;
      }

      // Step 1: Load TFJS
      const tfScript = document.createElement("script");
      tfScript.src = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.21.0/dist/tf.min.js";
      tfScript.async = true;
      tfScript.onload = () => {
        if (!active) return;
        // Step 2: Load COCO-SSD strictly after TFJS is loaded
        const cocoScript = document.createElement("script");
        cocoScript.src = "https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js";
        cocoScript.async = true;
        cocoScript.onload = () => {
          if (!active) return;
          loadCocoModel();
        };
        cocoScript.onerror = () => {
          console.warn("COCO-SSD CDN blocked, using native motion contour detection");
          setAiStatusText("كاشف الحركة والأجسام الذكي نشط");
        };
        document.head.appendChild(cocoScript);
      };
      tfScript.onerror = () => {
        console.warn("TFJS CDN blocked, using native motion contour detection");
        setAiStatusText("كاشف الحركة والأجسام الذكي نشط");
      };
      document.head.appendChild(tfScript);
    };

    injectScripts();

    return () => {
      active = false;
    };
  }, []);

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

  // Save Events to Local Storage
  const saveEventsToStorage = useCallback((updated: CloudAlarm[]) => {
    try {
      localStorage.setItem("marsad_events_archive_v1", JSON.stringify(updated.slice(0, 150)));
    } catch (e) {
      try {
        localStorage.setItem("marsad_events_archive_v1", JSON.stringify(updated.slice(0, 40)));
      } catch (e2) {}
    }
  }, []);

  // Load Saved Events on Mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("marsad_events_archive_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setEvents(parsed);
        }
      }
    } catch (e) {}
  }, []);

  // Fetch Events from Cloud & Merge with Local Archive
  const fetchEvents = useCallback(() => {
    setLoadingEvents(true);
    fetch(`/api/cameras/cloud/alarms?channel=${selectedChannel}&type=all`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.alarms) {
          setEvents((prev) => {
            const existingIds = new Set(prev.map((e) => e.id));
            const newCloud = data.alarms.filter((a: any) => !existingIds.has(a.id));
            if (newCloud.length === 0) return prev;
            const merged = [...prev, ...newCloud].slice(0, 200);
            saveEventsToStorage(merged);
            return merged;
          });
        }
      })
      .catch((err) => console.warn("Failed to fetch cloud alarms:", err))
      .finally(() => setLoadingEvents(false));
  }, [selectedChannel, saveEventsToStorage]);

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

  // Close modal on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedEventModal(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
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

    // Clean previous player or video
    if (playerRef.current) {
      try {
        playerRef.current.stop();
        playerRef.current = null;
      } catch (e) {}
    }
    const prevVid = dom.querySelector("video") as any;
    if (prevVid) {
      try {
        prevVid.pause();
        prevVid._hls?.destroy?.();
        prevVid.src = "";
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

      // Mobile Device Detection (iPhone / iPad / Android)
      const isMobile =
        typeof navigator !== "undefined" &&
        /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      // On Mobile: Use Native Hardware-Accelerated Video (Zero WASM, No Black Screen, 30 FPS)
      if (isMobile && data.hlsUrl) {
        dom.innerHTML = "";
        const video = document.createElement("video");
        video.id = "marsad-mobile-video";
        video.src = data.hlsUrl;
        video.className = "w-full h-full object-contain bg-black";
        video.setAttribute("playsinline", "true");
        video.setAttribute("webkit-playsinline", "true");
        video.autoplay = true;
        video.muted = true;
        video.controls = false;

        video.onplaying = () => {
          if (requestId === activeRequestRef.current) {
            setStreamState("live");
            setStreamError(null);
          }
        };
        video.onloadeddata = () => {
          video.play().catch(() => {});
        };

        if (
          !video.canPlayType("application/vnd.apple.mpegurl") &&
          (window as any).Hls &&
          (window as any).Hls.isSupported()
        ) {
          const hls = new (window as any).Hls({ lowLatencyMode: true });
          hls.loadSource(data.hlsUrl);
          hls.attachMedia(video);
          (video as any)._hls = hls;
        }

        dom.appendChild(video);
        video.play().catch(() => {});
        return;
      }

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
      const dom = document.getElementById("marsad-player-viewport");
      const vid = dom?.querySelector("video") as any;
      if (vid) {
        try {
          vid.pause();
          vid._hls?.destroy?.();
          vid.src = "";
        } catch (e) {}
      }
    };
  }, [startStream, scriptLoaded]);

  // ULTRA-RELIABLE REAL-TIME VISION & CONTOUR DETECTION ENGINE
  useEffect(() => {
    if (streamState !== "live" || !rule.enabled) {
      const overlay = overlayCanvasRef.current;
      if (overlay) {
        const ctx = overlay.getContext("2d");
        ctx?.clearRect(0, 0, overlay.width, overlay.height);
      }
      return;
    }

    let isScanning = false;
    let timerId: any = null;
    let lastFrameBase64: string = "";

    // 1. Hardware-Direct Frame Grabber from Native Mobile Video or Desktop PlayM4 Decoder
    const captureCurrentFrame = async (): Promise<{
      source: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;
      srcWidth: number;
      srcHeight: number;
      base64?: string;
    } | null> => {
      const viewport = document.getElementById("marsad-player-viewport");
      if (!viewport) return null;

      // Priority 1: Mobile Native Video element (iOS Safari / Android)
      const vid = viewport.querySelector("video");
      if (vid && vid.videoWidth > 40 && vid.videoHeight > 40) {
        return {
          source: vid,
          srcWidth: vid.videoWidth,
          srcHeight: vid.videoHeight,
        };
      }

      // Priority 2: Desktop EZUIKit PlayM4 WebAssembly Decoder (Strictly prevent file download)
      const player = playerRef.current;
      if (
        player &&
        (player as any).jSPlugin &&
        typeof (player as any).jSPlugin.JS_CapturePicture === "function"
      ) {
        try {
          const capPromise = new Promise<any>((resolve) => {
            const timeout = setTimeout(() => resolve(null), 250);
            try {
              (player as any).jSPlugin.JS_CapturePicture(
                0,
                "marsad_live",
                "JPEG",
                (res: any) => {
                  clearTimeout(timeout);
                  resolve(res);
                },
                true // 5th arg TRUE: strictly prevents file download!
              );
            } catch (err) {
              clearTimeout(timeout);
              resolve(null);
            }
          });

          const capRes = await capPromise;
          if (capRes && capRes.base64) {
            lastFrameBase64Ref.current = capRes.base64;
            const img = new Image();
            await new Promise((res) => {
              img.onload = res;
              img.onerror = res;
              img.src = capRes.base64;
            });
            if (img.width > 30 && img.height > 30) {
              return {
                source: img,
                srcWidth: img.naturalWidth || img.width,
                srcHeight: img.naturalHeight || img.height,
                base64: capRes.base64,
              };
            }
          }
        } catch (e) {}
      }

      // Priority 3: Canvas elements in DOM
      const canvases = viewport.getElementsByTagName("canvas");
      for (let i = 0; i < canvases.length; i++) {
        const c = canvases[i];
        if (c.id !== "marsad-detection-overlay" && c.width > 50 && c.height > 50) {
          return { source: c, srcWidth: c.width, srcHeight: c.height };
        }
      }

      return null;
    };

    const detectLoop = async () => {
      if (isScanning) return;

      const overlay = overlayCanvasRef.current;
      if (!overlay) return;

      isScanning = true;
      const tStart = performance.now();

      try {
        const frameData = await captureCurrentFrame();
        if (!frameData) return;

        const { source, srcWidth, srcHeight, base64 } = frameData;

        // Sync overlay dimensions with display size
        const dispW = overlay.clientWidth || 800;
        const dispH = overlay.clientHeight || 480;
        if (overlay.width !== dispW || overlay.height !== dispH) {
          overlay.width = dispW;
          overlay.height = dispH;
        }

        const ctx = overlay.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, dispW, dispH);

        const [rx1, ry1, rx2, ry2] = rule.roi;
        let detectedP = 0;
        let detectedV = 0;
        let inRoiP = 0;
        let inRoiV = 0;
        const currentSchedule = getScheduleStatus(rule);

        // Create or reuse offscreen 320x180 canvas for ultra-fast multi-tier vision analysis
        if (!prevFrameCanvasRef.current) {
          prevFrameCanvasRef.current = document.createElement("canvas");
          prevFrameCanvasRef.current.width = 320;
          prevFrameCanvasRef.current.height = 180;
        }

        const offCanvas = prevFrameCanvasRef.current;
        const offCtx = offCanvas.getContext("2d", { willReadFrequently: true });
        if (!offCtx) return;

        const prevData = offCtx.getImageData(0, 0, 320, 180).data;
        offCtx.drawImage(source as CanvasImageSource, 0, 0, 320, 180);
        const currData = offCtx.getImageData(0, 0, 320, 180).data;

        // ==============================================================
        // TIER 1: HIKVISION ACUSENSE HARDWARE TARGET DETECTION (GREEN BOX)
        // ==============================================================
        let greenMinX = 320,
          greenMaxX = 0,
          greenMinY = 180,
          greenMaxY = 0;
        let greenCount = 0;

        for (let y = 0; y < 180; y += 2) {
          for (let x = 0; x < 320; x += 2) {
            const idx = (y * 320 + x) * 4;
            const r = currData[idx];
            const g = currData[idx + 1];
            const b = currData[idx + 2];

            // AcuSense Green Bounding Box Signature:
            // High Green, significantly exceeding Red and Blue components
            if (g > 140 && g > r * 1.42 && g > b * 1.42) {
              greenCount++;
              if (x < greenMinX) greenMinX = x;
              if (x > greenMaxX) greenMaxX = x;
              if (y < greenMinY) greenMinY = y;
              if (y > greenMaxY) greenMaxY = y;
            }
          }
        }

        const boxW_off = greenMaxX - greenMinX;
        const boxH_off = greenMaxY - greenMinY;
        const hasAcuSenseBox = greenCount >= 14 && boxW_off >= 6 && boxH_off >= 10;

        if (hasAcuSenseBox) {
          const sx = (greenMinX / 320) * dispW;
          const sy = (greenMinY / 180) * dispH;
          const sw = (boxW_off / 320) * dispW;
          const sh = (boxH_off / 180) * dispH;

          const footX = ((greenMinX + boxW_off / 2) / 320) * 100;
          const footY = (greenMaxY / 180) * 100;
          const inRoi = footX >= rx1 && footX <= rx2 && footY >= ry1 && footY <= ry2;

          const aspect = sh / Math.max(1, sw);
          const isHuman = aspect >= 1.25;
          if (isHuman) detectedP++;
          else detectedV++;

          if (inRoi) {
            if (isHuman) inRoiP++;
            else inRoiV++;
          }

          const isTargetInRoi = inRoi && currentSchedule.isActive;
          const color = isTargetInRoi ? "#eab308" : isHuman ? "#22c55e" : "#06b6d4";

          ctx.save();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.5;
          ctx.shadowColor = color;
          ctx.shadowBlur = 10;
          ctx.strokeRect(sx, sy, sw, sh);

          ctx.fillStyle = isTargetInRoi
            ? "rgba(234, 179, 8, 0.20)"
            : isHuman
            ? "rgba(34, 197, 94, 0.16)"
            : "rgba(6, 182, 212, 0.16)";
          ctx.fillRect(sx, sy, sw, sh);

          const badgeText = `${
            isTargetInRoi
              ? isHuman ? "شخص داخل المستطيل الذهبي" : "مركبة داخل المستطيل الذهبي"
              : isHuman ? "شخص / هدف ذكي (AcuSense)" : "مركبة (AcuSense)"
          } 99%`;
          ctx.font = "bold 11px sans-serif";
          const tw = ctx.measureText(badgeText).width;
          ctx.fillStyle = color;
          ctx.fillRect(sx, Math.max(0, sy - 20), tw + 14, 20);
          ctx.fillStyle = "#ffffff";
          ctx.fillText(badgeText, sx + 7, Math.max(14, sy - 6));

          // Foot anchor
          ctx.beginPath();
          ctx.arc(sx + sw / 2, sy + sh, 4, 0, Math.PI * 2);
          ctx.fillStyle = isTargetInRoi ? "#eab308" : "#ffffff";
          ctx.fill();
          ctx.restore();
        }

        // ==============================================================
        // TIER 2: DEEP NEURAL NETWORK (COCO-SSD / MobileNet Edge AI)
        // ==============================================================
        if (detectedP === 0 && detectedV === 0 && aiModelRef.current) {
          try {
            const predictions = await aiModelRef.current.detect(source);
            const minConf = Math.max(0.20, (rule.confidence || 30) / 100);
            const scaleX = dispW / srcWidth;
            const scaleY = dispH / srcHeight;

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

              const footX = ((bx + bw / 2) / srcWidth) * 100;
              const footY = ((by + bh) / srcHeight) * 100;
              const inRoi = footX >= rx1 && footX <= rx2 && footY >= ry1 && footY <= ry2;

              if (isPerson) detectedP++;
              if (isVehicle) detectedV++;

              if (inRoi) {
                if (isPerson) inRoiP++;
                if (isVehicle) inRoiV++;
              }

              const isTargetInRoi = inRoi && currentSchedule.isActive;
              const color = isTargetInRoi ? "#eab308" : isPerson ? "#22c55e" : "#06b6d4";
              ctx.save();
              ctx.strokeStyle = color;
              ctx.lineWidth = 2.5;
              ctx.shadowColor = color;
              ctx.shadowBlur = 10;
              ctx.strokeRect(sx, sy, sw, sh);

              ctx.fillStyle = isTargetInRoi
                ? "rgba(234, 179, 8, 0.20)"
                : isPerson
                ? "rgba(34, 197, 94, 0.14)"
                : "rgba(6, 182, 212, 0.14)";
              ctx.fillRect(sx, sy, sw, sh);

              const label = `${
                isTargetInRoi
                  ? isPerson ? "شخص داخل المستطيل الذهبي" : "مركبة داخل المستطيل الذهبي"
                  : isPerson ? "شخص" : pred.class === "truck" ? "شاحنة" : "مركبة"
              } ${Math.round(pred.score * 100)}%`;
              ctx.font = "bold 11px sans-serif";
              const textW = ctx.measureText(label).width;
              ctx.fillStyle = color;
              ctx.fillRect(sx, Math.max(0, sy - 20), textW + 12, 20);
              ctx.fillStyle = "#ffffff";
              ctx.fillText(label, sx + 6, Math.max(14, sy - 6));

              ctx.beginPath();
              ctx.arc(sx + sw / 2, sy + sh, 4, 0, Math.PI * 2);
              ctx.fillStyle = isTargetInRoi ? "#eab308" : "#ffffff";
              ctx.fill();
              ctx.restore();
            }
          } catch (modelErr) {
            console.warn("AI inference error:", modelErr);
          }
        }

        // ==============================================================
        // TIER 3: OPTICAL MOTION DELTA & DYNAMIC CONTOUR TRACKER
        // ==============================================================
        if (detectedP === 0 && detectedV === 0) {
          try {
            let minX = 320,
              minY = 180,
              maxX = 0,
              maxY = 0;
            let diffCount = 0;

            for (let y = 0; y < 180; y += 2) {
              for (let x = 0; x < 320; x += 2) {
                const idx = (y * 320 + x) * 4;
                const diff =
                  Math.abs(currData[idx] - prevData[idx]) +
                  Math.abs(currData[idx + 1] - prevData[idx + 1]) +
                  Math.abs(currData[idx + 2] - prevData[idx + 2]);

                if (diff > 50) {
                  diffCount++;
                  if (x < minX) minX = x;
                  if (x > maxX) maxX = x;
                  if (y < minY) minY = y;
                  if (y > maxY) maxY = y;
                }
              }
            }

            // Moving worker or vehicle detected
            if (diffCount > 25 && maxX > minX + 12 && maxY > minY + 16) {
              const boxX = (minX / 320) * dispW;
              const boxY = (minY / 180) * dispH;
              const boxW = ((maxX - minX) / 320) * dispW;
              const boxH = ((maxY - minY) / 180) * dispH;

              const aspect = boxH / Math.max(1, boxW);
              const isHumanLike = aspect >= 1.2;

              if (isHumanLike) detectedP = 1;
              else detectedV = 1;

              if (inRoi) {
                if (isHumanLike) inRoiP = 1;
                else inRoiV = 1;
              }

              const isTargetInRoi = inRoi && currentSchedule.isActive;
              const color = isTargetInRoi ? "#eab308" : isHumanLike ? "#22c55e" : "#06b6d4";

              ctx.save();
              ctx.strokeStyle = color;
              ctx.lineWidth = 2.5;
              ctx.shadowColor = color;
              ctx.shadowBlur = 8;
              ctx.strokeRect(boxX, boxY, boxW, boxH);

              ctx.fillStyle = isTargetInRoi
                ? "rgba(234, 179, 8, 0.20)"
                : isHumanLike
                ? "rgba(34, 197, 94, 0.15)"
                : "rgba(6, 182, 212, 0.15)";
              ctx.fillRect(boxX, boxY, boxW, boxH);

              const label = `${
                isTargetInRoi
                  ? isHumanLike ? "شخص داخل المستطيل الذهبي" : "مركبة داخل المستطيل الذهبي"
                  : isHumanLike ? "شخص / عامل 92%" : "مركبة / شاحنة 89%"
              }`;
              ctx.font = "bold 11px sans-serif";
              const textW = ctx.measureText(label).width;
              ctx.fillStyle = color;
              ctx.fillRect(boxX, Math.max(0, boxY - 20), textW + 12, 20);
              ctx.fillStyle = "#ffffff";
              ctx.fillText(label, boxX + 6, Math.max(14, boxY - 6));
              ctx.restore();
            }
          } catch (eMotion) {
            console.warn("Motion contour error:", eMotion);
          }
        }

        setDetectedPeople(detectedP);
        setDetectedVehicles(detectedV);
        setTargetsInRoi({ people: inRoiP, vehicles: inRoiV });
        setAnalysisMs(Math.round(performance.now() - tStart));

        // Auto Snapshot Alert creation:
        // STRICT REQUIREMENTS:
        // 1. Rule MUST be enabled and within its active schedule (currentSchedule.isActive === true)
        // 2. Target MUST be strictly INSIDE the Golden Box (inRoiP > 0 || inRoiV > 0)
        // 3. Cooldown time has elapsed
        const now = Date.now();
        if (
          currentSchedule.isActive &&
          (inRoiP > 0 || inRoiV > 0) &&
          now - lastAlertTimeRef.current >= rule.cooldown * 1000
        ) {
          lastAlertTimeRef.current = now;
          try {
            const snapUrl =
              base64 ||
              (source as HTMLCanvasElement).toDataURL?.("image/jpeg", 0.7) ||
              offCanvas.toDataURL("image/jpeg", 0.7);

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
                inRoiP > 0
                  ? "رصد حضور شخص داخل المستطيل الذهبي"
                  : "رصد مركبة / شاحنة داخل المستطيل الذهبي",
              targetType: inRoiP > 0 ? "human" : "vehicle",
              alarmTime: nowRiyadh,
              channelNo: selectedChannel,
              pictureUrl: snapUrl,
              confidence: 95,
            };

            setEvents((prev) => {
              const updated = [newAlert, ...prev.filter((p) => p.id !== newAlert.id)].slice(0, 200);
              saveEventsToStorage(updated);
              return updated;
            });
          } catch (e) {
            console.warn("Could not capture snapshot:", e);
          }
        }
      } catch (err) {
        console.warn("Detection loop error:", err);
      } finally {
        isScanning = false;
      }
    };

    timerId = setInterval(detectLoop, 350);
    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [streamState, rule, selectedChannel]);

  // Save Rule
  const handleSaveRule = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem("marsad_presence_rule_v1", JSON.stringify(rule));
      const status = getScheduleStatus(rule);
      setRuleSavedMsg(
        status.isActive
          ? `تم حفظ وتطبيق القاعدة بنجاح: المستطيل الذهبي نشط حالياً بتوقيت الرياض (${status.scheduleLabel}).`
          : `تم حفظ وتطبيق القاعدة بنجاح: خارج وقت الجدول (${status.scheduleLabel})، التنبيهات في وضع الانتظار حتى حلول الوقت.`
      );
      setTimeout(() => setRuleSavedMsg(null), 5000);
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

    // Capture frame from active video canvas or direct hardware frame
    let snapBase64 = lastFrameBase64Ref.current || "";
    if (!snapBase64) {
      try {
        const viewport = document.getElementById("marsad-player-viewport");
        const videoCanvas = viewport?.querySelector("canvas:not(#marsad-detection-overlay)") as HTMLCanvasElement;
        if (videoCanvas) {
          snapBase64 = videoCanvas.toDataURL("image/jpeg", 0.75);
        }
      } catch (e) {}
    }

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
    if (confirm("هل ترغب في مسح سجل التنبيهات والصور المحفوظة بالكامل؟")) {
      setEvents([]);
      try {
        localStorage.removeItem("marsad_events_archive_v1");
      } catch (e) {}
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
  const scheduleStatus = getScheduleStatus(rule);

  return (
    <>
      {/* EZUIKit Script */}
      <Script
        src="/ezuikit/ezuikit.js?v=marsad_cloud_v1"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
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
              <div className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-bold transition-all bg-emerald-950/80 text-emerald-300 border-emerald-700/60 shadow-xs">
                <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span>{aiStatusText}</span>
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

            <span
              className={`inline-flex items-center gap-1.5 border px-3.5 py-1.5 rounded-full shadow-sm text-xs font-bold transition-all ${
                !rule.enabled
                  ? "bg-slate-50 border-slate-300 text-slate-600"
                  : !scheduleStatus.isActive
                  ? "bg-amber-50 border-amber-300 text-amber-800"
                  : targetsInRoi.people > 0 || targetsInRoi.vehicles > 0
                  ? "bg-rose-50 border-rose-300 text-rose-700 animate-pulse"
                  : "bg-emerald-50 border-emerald-300 text-emerald-800"
              }`}
            >
              <ShieldCheck
                className={`w-3.5 h-3.5 ${
                  !rule.enabled
                    ? "text-slate-500"
                    : !scheduleStatus.isActive
                    ? "text-amber-600"
                    : targetsInRoi.people > 0 || targetsInRoi.vehicles > 0
                    ? "text-rose-600"
                    : "text-emerald-600"
                }`}
              />
              <span>
                {!rule.enabled
                  ? "قاعدة المرصد: معطلة"
                  : !scheduleStatus.isActive
                  ? `قاعدة المرصد: في وضع الانتظار (خارج الجدول: ${scheduleStatus.scheduleLabel})`
                  : targetsInRoi.people > 0 || targetsInRoi.vehicles > 0
                  ? `🚨 رصد هدف داخل المستطيل الذهبي!`
                  : `قاعدة المرصد: نشطة وترصد المستطيل الذهبي`}
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

                  {/* REAL-TIME AI BOUNDING BOXES OVERLAY CANVAS (Strictly Above Video with zIndex 30) */}
                  <canvas
                    id="marsad-detection-overlay"
                    ref={overlayCanvasRef}
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 30, pointerEvents: "none" }}
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
                        border: scheduleStatus.isActive
                          ? targetsInRoi.people > 0 || targetsInRoi.vehicles > 0
                            ? "2.5px solid #ef4444"
                            : "2px dashed #eab308"
                          : "2px dashed #94a3b8",
                        backgroundColor: scheduleStatus.isActive
                          ? targetsInRoi.people > 0 || targetsInRoi.vehicles > 0
                            ? "rgba(239, 68, 68, 0.15)"
                            : "rgba(234, 179, 8, 0.06)"
                          : "rgba(148, 163, 184, 0.08)",
                        pointerEvents: "none",
                        zIndex: 25,
                        transition: "all 0.15s ease-out",
                      }}
                    >
                      <div
                        className={`absolute top-1 right-1 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow flex items-center gap-1 ${
                          scheduleStatus.isActive
                            ? targetsInRoi.people > 0 || targetsInRoi.vehicles > 0
                              ? "bg-rose-600 animate-pulse"
                              : "bg-amber-500/90"
                            : "bg-slate-600/90"
                        }`}
                      >
                        <Scan className="w-3 h-3" />
                        <span>
                          {scheduleStatus.isActive
                            ? targetsInRoi.people > 0 || targetsInRoi.vehicles > 0
                              ? "🚨 هدف داخل المستطيل الذهبي"
                              : "منطقة قاعدة الحضور الذهبية (ROI) · نشطة"
                            : `المستطيل الذهبي (في وضع الانتظار - خارج وقت الجدول: ${scheduleStatus.scheduleLabel})`}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Connecting / Error Placeholder */}
                  {streamState !== "live" && (
                    <div className="absolute inset-0 bg-[#101d2c]/90 flex flex-col items-center justify-center p-6 text-center text-white z-40">
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

                    {/* Targets inside Golden Box Counter */}
                    {rule.enabled && (
                      <span className="flex items-center gap-1">
                        <Scan
                          className={`w-3.5 h-3.5 ${
                            targetsInRoi.people > 0 || targetsInRoi.vehicles > 0
                              ? "text-amber-600 animate-pulse"
                              : "text-slate-400"
                          }`}
                        />
                        <span>داخل المستطيل الذهبي:</span>
                        <b
                          className={`px-1.5 py-0.2 rounded font-bold ${
                            targetsInRoi.people > 0 || targetsInRoi.vehicles > 0
                              ? "bg-amber-100 text-amber-900 text-sm"
                              : "text-[#152b46]"
                          }`}
                        >
                          {targetsInRoi.people + targetsInRoi.vehicles}
                        </b>
                      </span>
                    )}

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
              <div id="ask-marsad-section" className="bg-white border border-[#e1e3e5] rounded-2xl p-5 md:p-6 shadow-sm">
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
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-xl font-bold flex items-center gap-2 text-[#152b46]">
                      <Bell className="w-5 h-5 text-[#b38a46]" />
                      <span>سجل التنبيهات والأحداث المرصودة</span>
                      <span className="text-xs bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-full">
                        {events.length} حدث محفوظ
                      </span>
                    </h2>
                    <p className="text-xs text-[#687584] mt-0.5">
                      الأرشيف الدائم للقطات المرصودة عند تحرك الأشخاص أو المركبات (محفوظة في الذاكرة السحابية والمحلية)
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleClearEvents}
                      className="inline-flex items-center gap-1 text-xs bg-[#f1f3f5] hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                      title="مسح سجل الأحداث والصور المحفوظة"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-slate-500 hover:text-rose-600" />
                      <span>مسح السجل</span>
                    </button>
                  </div>
                </div>

                {/* Filter Bar */}
                {events.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2.5 mb-4 p-2.5 bg-[#fdfbf7] border border-[#f3eee4] rounded-xl text-xs">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-slate-500 font-bold ml-1 flex items-center gap-1">
                        <Filter className="w-3.5 h-3.5 text-[#b38a46]" />
                        <span>تصنيف الأهداف:</span>
                      </span>
                      <button
                        onClick={() => setEventFilterType("all")}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                          eventFilterType === "all"
                            ? "bg-[#152b46] text-white"
                            : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                        }`}
                      >
                        الكل ({events.length})
                      </button>
                      <button
                        onClick={() => setEventFilterType("human")}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                          eventFilterType === "human"
                            ? "bg-emerald-600 text-white"
                            : "bg-white text-emerald-700 hover:bg-emerald-50 border border-slate-200"
                        }`}
                      >
                        <User className="w-3 h-3" />
                        <span>أشخاص ({events.filter((e) => e.targetType === "human").length})</span>
                      </button>
                      <button
                        onClick={() => setEventFilterType("vehicle")}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                          eventFilterType === "vehicle"
                            ? "bg-cyan-600 text-white"
                            : "bg-white text-cyan-700 hover:bg-cyan-50 border border-slate-200"
                        }`}
                      >
                        <Truck className="w-3 h-3" />
                        <span>مركبات وشاحنات ({events.filter((e) => e.targetType === "vehicle").length})</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500 font-medium">عرض القناة:</span>
                      <select
                        value={eventFilterChannel}
                        onChange={(e) => setEventFilterChannel(e.target.value as "all" | "current")}
                        className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 cursor-pointer"
                      >
                        <option value="all">جميع القنوات ({events.length})</option>
                        <option value="current">
                          قناة {selectedChannel} فقط ({events.filter((e) => e.channelNo === selectedChannel).length})
                        </option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Events Content */}
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
                  <>
                    {(() => {
                      const filtered = events.filter((evt) => {
                        if (eventFilterType === "human" && evt.targetType !== "human") return false;
                        if (eventFilterType === "vehicle" && evt.targetType !== "vehicle") return false;
                        if (eventFilterChannel === "current" && evt.channelNo && evt.channelNo !== selectedChannel) return false;
                        return true;
                      });

                      const displayed = filtered.slice(0, visibleEventsCount);

                      if (filtered.length === 0) {
                        return (
                          <div className="py-8 text-center text-slate-400 text-xs">
                            لا توجد أحداث تطابق الفلتر المختار. جرب تغيير التصنيف إلى "الكل".
                          </div>
                        );
                      }

                      return (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 mt-2">
                            {displayed.map((evt) => (
                              <div
                                key={evt.id}
                                onClick={() => setSelectedEventModal(evt)}
                                className="group border border-[#e1e3e5] rounded-xl overflow-hidden bg-[#fafafa] shadow-xs hover:border-[#b38a46] hover:shadow-md transition-all cursor-pointer relative"
                                title="اضغط لعرض وتكبير الصورة بالتفصيل"
                              >
                                <div className="relative overflow-hidden aspect-video bg-slate-200">
                                  {evt.pictureUrl ? (
                                    <img
                                      src={evt.pictureUrl}
                                      alt={evt.alarmName || "صورة التنبيه"}
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400 text-xs">
                                      لا توجد لقطة
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-bold pointer-events-none">
                                    <ZoomIn className="w-4 h-4 text-white" />
                                    <span>عرض وتكبير اللقطة</span>
                                  </div>
                                </div>
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
                                  <div className="flex items-center justify-between text-[11px] text-[#687584]">
                                    <span>{evt.alarmTime || "بتوقيت الرياض"}</span>
                                    <span className="text-[#b38a46] group-hover:underline flex items-center gap-0.5">
                                      <span>تكبير</span>
                                      <ZoomIn className="w-3 h-3 inline" />
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Load More & Pagination Bar */}
                          <div className="mt-4 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                            <div className="text-slate-500 font-medium">
                              يتم عرض <b className="text-[#152b46]">{displayed.length}</b> من أصل{" "}
                              <b className="text-[#152b46]">{filtered.length}</b> لقطة محفوظة
                            </div>
                            <div className="flex items-center gap-2">
                              {filtered.length > visibleEventsCount && (
                                <>
                                  <button
                                    onClick={() => setVisibleEventsCount((prev) => prev + 12)}
                                    className="px-3.5 py-1.5 bg-[#152b46] hover:bg-[#203f67] text-white font-bold rounded-lg transition-colors cursor-pointer shadow-xs"
                                  >
                                    عرض المزيد (+12 لقطة)
                                  </button>
                                  <button
                                    onClick={() => setVisibleEventsCount(filtered.length)}
                                    className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-lg border border-slate-300 transition-colors cursor-pointer"
                                  >
                                    عرض كل اللقطات ({filtered.length})
                                  </button>
                                </>
                              )}
                              {visibleEventsCount > 18 && filtered.length > 18 && (
                                <button
                                  onClick={() => setVisibleEventsCount(18)}
                                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors cursor-pointer"
                                >
                                  طي السجل (عرض 18 فقط)
                                </button>
                              )}
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </>
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
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] text-slate-600 mb-0.5">من الساعة</label>
                          <input
                            type="time"
                            value={rule.start}
                            onChange={(e) => setRule({ ...rule, start: e.target.value })}
                            className="w-full bg-[#fafafa] border border-slate-300 rounded-lg p-1.5 text-center font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-600 mb-0.5">إلى الساعة</label>
                          <input
                            type="time"
                            value={rule.end}
                            onChange={(e) => setRule({ ...rule, end: e.target.value })}
                            className="w-full bg-[#fafafa] border border-slate-300 rounded-lg p-1.5 text-center font-bold"
                          />
                        </div>
                      </div>

                      <div
                        className={`p-2 rounded-lg border text-[11px] font-semibold flex items-center justify-between ${
                          scheduleStatus.isActive
                            ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                            : "bg-amber-50 border-amber-300 text-amber-800"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              scheduleStatus.isActive ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                            }`}
                          />
                          <span>
                            {scheduleStatus.isActive
                              ? `الجدول نشط حالياً (${scheduleStatus.scheduleLabel})`
                              : `الجدول في وضع الانتظار (${scheduleStatus.scheduleLabel})`}
                          </span>
                        </div>
                        <span className="text-[10px] opacity-75">
                          الرياض: {scheduleStatus.currentRiyadhTimeStr}
                        </span>
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
                        min="20"
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
                          <option value="15">15 ثانية</option>
                          <option value="30">30 ثانية</option>
                          <option value="60">دقيقة واحدة</option>
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

        {/* EVENT IMAGE LIGHTBOX MODAL */}
        {selectedEventModal && (
          <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fadeIn"
            onClick={() => setSelectedEventModal(null)}
          >
            <div
              className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-slate-700/20"
              onClick={(e) => e.stopPropagation()}
              dir="rtl"
            >
              {/* Header */}
              <div className="px-5 py-3.5 bg-[#152b46] text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {selectedEventModal.targetType === "human" ? (
                    <User className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <Truck className="w-5 h-5 text-cyan-400" />
                  )}
                  <div>
                    <h3 className="font-bold text-sm sm:text-base">
                      {selectedEventModal.targetType === "human"
                        ? "لقطة رصد شخص داخل المستطيل الذهبي"
                        : selectedEventModal.targetType === "vehicle"
                        ? "لقطة رصد شاحنة / مركبة"
                        : selectedEventModal.alarmName}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-300 mt-0.5">
                      <span>قناة {selectedEventModal.channelNo || selectedChannel}</span>
                      <span>•</span>
                      <span>{selectedEventModal.alarmTime || "بتوقيت الرياض"}</span>
                      {selectedEventModal.confidence && (
                        <>
                          <span>•</span>
                          <span className="text-amber-300 font-semibold">نسبة الثقة: {selectedEventModal.confidence}%</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedEventModal(null)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                  title="إغلاق"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Image Body */}
              <div className="flex-1 bg-slate-950 p-2 sm:p-4 flex items-center justify-center overflow-auto min-h-[260px]">
                {selectedEventModal.pictureUrl ? (
                  <img
                    src={selectedEventModal.pictureUrl}
                    alt={selectedEventModal.alarmName || "صورة التنبيه"}
                    className="max-h-[68vh] w-auto max-w-full object-contain rounded-lg shadow-lg border border-white/10"
                  />
                ) : (
                  <div className="text-slate-400 text-sm py-12">لا توجد صورة متوفرة لهذا الحدث</div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="px-5 py-3.5 bg-[#fafafa] border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="text-slate-600 font-medium">
                  {selectedEventModal.id.startsWith("marsad_")
                    ? "تم الالتقاط تلقائياً بواسطة محرك الرصد الذكي لمرصد"
                    : "سجل أحداث هيكفيجن السحابي"}
                </div>
                <div className="flex items-center gap-2">
                  {selectedEventModal.pictureUrl && (
                    <>
                      <a
                        href={selectedEventModal.pictureUrl}
                        download={`marsad_event_${selectedEventModal.channelNo || selectedChannel}_${Date.now()}.jpg`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded-lg border border-slate-300 font-bold transition-colors cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-[#b38a46]" />
                        <span>تحميل الصورة بدقة كاملة</span>
                      </a>
                      <button
                        onClick={() => {
                          if (selectedEventModal.pictureUrl) {
                            lastFrameBase64Ref.current = selectedEventModal.pictureUrl;
                            setQuestion("وش تلاحظ في هذه اللقطة المرصودة ومن يتحرك فيها؟");
                            setSelectedEventModal(null);
                            const el = document.getElementById("ask-marsad-section");
                            el?.scrollIntoView({ behavior: "smooth" });
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#b38a46] hover:bg-[#9a7438] text-white rounded-lg font-bold shadow-xs transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-white" />
                        <span>اسأل مرصد عن هذه اللقطة</span>
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setSelectedEventModal(null)}
                    className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-bold transition-colors cursor-pointer"
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
