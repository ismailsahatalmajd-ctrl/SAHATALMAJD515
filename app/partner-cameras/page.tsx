"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Cctv,
  Maximize2,
  RefreshCw,
  Play,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ShieldCheck,
  Globe,
  Radio,
  Clock,
  ExternalLink,
  Layers,
  ChevronLeft,
  Building2,
  HardDrive,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

declare global {
  interface Window {
    EZUIKit?: any;
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

export default function PartnerCamerasPage() {
  const [devices, setDevices] = useState<PartnerDevice[]>([]);
  const [selectedDeviceIndex, setSelectedDeviceIndex] = useState<number>(0);
  const [selectedChannel, setSelectedChannel] = useState<number>(1);
  const [quality, setQuality] = useState<"live" | "hd">("live");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [streamState, setStreamState] = useState<"connecting" | "live" | "error">("connecting");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [scriptLoaded, setScriptLoaded] = useState<boolean>(false);

  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRequestRef = useRef<number>(0);

  const currentDevice = devices[selectedDeviceIndex] || {
    deviceName: "iDS-7204HQHI-M1-XT",
    deviceSerial: "FH8945678",
    deviceOnlineStatus: 1,
    siteName: "Site_o0s.a.k0o.s0@gmail.com",
    deviceType: "iDS-7204HQHI-M1/XT",
    totalChannels: 4,
  };

  const totalChannels = currentDevice.totalChannels || 4;
  const channelsList = Array.from({ length: totalChannels }, (_, i) => i + 1);

  // Timer
  useEffect(() => {
    const t = setInterval(() => setDuration((prev) => prev + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const formatTimer = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // 1. Load EZUIKit Script
  useEffect(() => {
    const scriptId = "ezuikit-partner-script";
    if (document.getElementById(scriptId)) {
      setScriptLoaded(true);
      return;
    }
    const s = document.createElement("script");
    s.id = scriptId;
    s.src = "/ezuikit/ezuikit.js?v=partner_2026";
    s.async = true;
    s.onload = () => setScriptLoaded(true);
    document.body.appendChild(s);
  }, []);

  // 2. Fetch Devices List from Hik-Partner Pro
  const fetchDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hik-partner/devices");
      const data = await res.json();
      if (data.success && data.devices?.length > 0) {
        setDevices(data.devices);
      } else {
        throw new Error(data.error || "لم يتم العثور على أجهزة في حساب Hik-Partner Pro");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "تعذر الاتصال بمنصة Hik-Partner Pro");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  // 3. Start Live Stream for Selected Device & Channel
  const startStream = useCallback(async () => {
    if (!scriptLoaded) return;
    const requestId = ++activeRequestRef.current;

    setStreamState("connecting");
    setStreamError(null);

    // Cleanup previous player
    if (playerRef.current) {
      try {
        playerRef.current.stop();
        playerRef.current.destroy?.();
      } catch (e) {}
      playerRef.current = null;
    }

    const containerId = "partner-player-viewport";
    const dom = document.getElementById(containerId);
    if (dom) dom.innerHTML = "";

    try {
      const res = await fetch(
        `/api/hik-partner/live?deviceSerial=${currentDevice.deviceSerial}&channel=${selectedChannel}&quality=${quality}`
      );
      const data = await res.json();

      // Check if a newer request was made while fetching
      if (requestId !== activeRequestRef.current) {
        return;
      }

      if (!data.success || (!data.ticket && !data.accessToken) || !data.url) {
        throw new Error(data.error || "تعذر الحصول على تذكرة البث المباشر");
      }

      if (!window.EZUIKit) {
        throw new Error("جاري تحميل مشغل EZUIKit، يرجى الانتظار ثوانٍ...");
      }

      const clientW = containerRef.current?.clientWidth || 640;
      const width = Math.max(clientW, 320);
      const height = Math.round((width * 9) / 16) || 360;

      const playUrl = data.directWsUrl || data.url;
      const playToken = data.accessToken || data.ticket;

      // Final DOM clean before instantiating new player
      if (dom) dom.innerHTML = "";

      const player = new window.EZUIKit.EZUIKitPlayer({
        id: containerId,
        url: playUrl,
        accessToken: playToken,
        staticPath: "/ezuikit/ezuikit_static/v65",
        env: {
          domain: "https://isgpopen.ezvizlife.com",
        },
        width: width,
        height: height,
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
          console.warn("Partner Player event:", e);
          if (e?.code !== "200" && e?.retcode !== "0") {
            setStreamError(e?.msg || e?.message || "انقطع اتصال البث");
            setStreamState("error");
          }
        },
      });

      playerRef.current = player;
    } catch (err: any) {
      if (requestId === activeRequestRef.current) {
        console.error(err);
        setStreamError(err.message || "حدث خطأ أثناء تشغيل البث المباشر");
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

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800" dir="rtl">
      {/* 1. TOP HEADER */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30 flex-shrink-0">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  منصة كاميرات Hik-Partner Pro
                </h1>
                <Badge className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold">
                  حساب الشركاء
                </Badge>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                إدارة المواقع وأجهزة الـ DVR عبر منصة الفنيين
              </p>
            </div>
          </div>

          {/* Quick link back to Main 16-Cam page */}
          <div className="flex items-center gap-2">
            <Link
              href="/cameras"
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 px-3.5 rounded-xl border border-slate-200 flex items-center gap-2 transition-all active:scale-95"
            >
              <Cctv className="h-4 w-4 text-blue-600" />
              <span>كاميرات المستودع الرئيسية (16 كاميرا)</span>
              <ChevronLeft className="h-3.5 w-3.5 text-slate-400" />
            </Link>

            <button
              onClick={fetchDevices}
              className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 active:scale-95 transition-all"
              title="تحديث البيانات"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-indigo-600" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      {/* 2. MAIN BODY */}
      <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
        {/* Site & Device Info Banner */}
        <div className="bg-white rounded-3xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Site Badge */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2">
              <Building2 className="h-4 w-4 text-slate-500" />
              <div>
                <div className="text-[10px] text-slate-400 font-medium">الموقع (Site)</div>
                <div className="text-xs font-bold text-slate-800">{currentDevice.siteName || "موقع الحساب"}</div>
              </div>
            </div>

            {/* Device Info */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2">
              <HardDrive className="h-4 w-4 text-indigo-600" />
              <div>
                <div className="text-[10px] text-slate-400 font-medium">جهاز الـ DVR</div>
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span>{currentDevice.deviceName}</span>
                  <span className="text-[10px] font-mono text-slate-400">({currentDevice.deviceSerial})</span>
                </div>
              </div>
            </div>

            {/* Online Status */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>متصل بسحابة Hik-Partner Pro</span>
            </div>
          </div>

          {/* Quality Toggle Button */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setQuality(quality === "hd" ? "live" : "hd")}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 active:scale-95 ${
                quality === "hd"
                  ? "bg-amber-50 text-amber-800 border-amber-300"
                  : "bg-emerald-50 text-emerald-800 border-emerald-300"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-600" />
              <span>{quality === "hd" ? "2K HD (فائقة)" : "Sub (سلس)"}</span>
            </button>
          </div>
        </div>

        {/* 3. MAIN VIDEO PLAYER CARD */}
        <div className="bg-white rounded-3xl border border-slate-200/90 p-4 sm:p-5 shadow-sm space-y-4">
          {/* Player Header Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                CH {selectedChannel < 10 ? `0${selectedChannel}` : selectedChannel}
              </div>
              <div>
                <h2 className="text-base font-extrabold text-slate-900">
                  كاميرا 0{selectedChannel} - {currentDevice.deviceName}
                </h2>
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span>الرقم التسلسلي: {currentDevice.deviceSerial}</span>
                  <span>•</span>
                  <span>المدة: {formatTimer(duration)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleFullscreen}
                className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 active:scale-95 transition-all"
                title="ملء الشاشة"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
              <button
                onClick={startStream}
                className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 active:scale-95 transition-all"
                title="إعادة الاتصال"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Video Viewport Container */}
          <div
            ref={containerRef}
            className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-slate-200 shadow-inner group flex items-center justify-center"
          >
            {/* Top-Left Red Live Badge */}
            <div className="absolute top-3 left-3 bg-red-600/90 text-white font-bold text-[10px] px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-md z-10 pointer-events-none">
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              <span>بث حي Hik-Partner</span>
            </div>

            {/* Bottom-Left Channel Number */}
            <div className="absolute bottom-3 left-3 bg-black/65 backdrop-blur-xs text-white text-[10px] font-mono px-2 py-0.5 rounded-md border border-white/10 z-10 pointer-events-none">
              CH 0{selectedChannel} • {quality === "hd" ? "2K" : "SUB"}
            </div>

            {/* Target DOM Element for EZUIKit Video */}
            <div
              id="partner-player-viewport"
              className="w-full h-full flex items-center justify-center bg-black"
            />

            {/* Connecting State */}
            {streamState === "connecting" && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center gap-2.5 text-slate-200 z-20">
                <RefreshCw className="h-8 w-8 text-indigo-400 animate-spin" />
                <p className="text-xs font-bold text-indigo-200">
                  جاري الاتصال بسحابة Hik-Partner Pro (قناة {selectedChannel})...
                </p>
              </div>
            )}

            {/* Error State */}
            {streamState === "error" && (
              <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-3 text-slate-200 z-20 p-4 text-center">
                <AlertCircle className="h-8 w-8 text-red-400" />
                <p className="text-xs font-bold text-red-300">
                  {streamError || "تعذر بدء البث المباشر لهذه القناة"}
                </p>
                <Button size="sm" onClick={startStream} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5">
                  <RotateCcw className="h-3.5 w-3.5" /> إعادة المحاولة
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* 4. CHANNELS SELECTOR GRID */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <Cctv className="h-4 w-4 text-indigo-600" />
              <span>قنوات الكاميرا المتاحة على هذا الجهاز ({totalChannels} قنوات)</span>
            </h3>
            <span className="text-xs text-slate-400 font-medium">اضغط على أي قناة لتشغيلها</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {channelsList.map((ch) => {
              const isSelected = ch === selectedChannel;
              return (
                <div
                  key={ch}
                  onClick={() => setSelectedChannel(ch)}
                  className={`rounded-2xl border p-4 cursor-pointer transition-all flex flex-col justify-between gap-3 active:scale-98 ${
                    isSelected
                      ? "bg-indigo-50/80 border-indigo-400 shadow-sm ring-2 ring-indigo-500/20"
                      : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-black text-slate-700">CH 0{ch}</span>
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  </div>

                  <div>
                    <div className="font-extrabold text-xs text-slate-800">الكاميرا 0{ch}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {isSelected ? "يعمل البث حالياً" : "جاهز للبث"}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold">
                    <span className={isSelected ? "text-indigo-600" : "text-slate-500"}>
                      {isSelected ? "● مباشر" : "تشغيل"}
                    </span>
                    <Play className={`h-3.5 w-3.5 ${isSelected ? "text-indigo-600 fill-indigo-600" : "text-slate-400"}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
