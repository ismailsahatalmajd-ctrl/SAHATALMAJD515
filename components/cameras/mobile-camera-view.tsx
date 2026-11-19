"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Cctv,
  Menu,
  Bell,
  Cloud,
  Maximize2,
  Clock,
  Zap,
  Play,
  Camera,
  MoreHorizontal,
  ChevronLeft,
  X,
  Target,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";

interface ChannelData {
  channel: number;
  name: string;
  id?: string;
  online?: boolean;
}

interface MobileCameraViewProps {
  channels: ChannelData[];
  activeChannel: number;
  onSelectChannel: (ch: number) => void;
  onOpenMenu: () => void;
  onOpenAlerts: () => void;
  onDownloadSnapshot: (ch: ChannelData) => void;
  activeTab: string;
  setActiveTab: (tab: any) => void;
}

export default function MobileCameraView({
  channels,
  activeChannel,
  onSelectChannel,
  onOpenMenu,
  onOpenAlerts,
  onDownloadSnapshot,
  activeTab,
  setActiveTab,
}: MobileCameraViewProps) {
  const [quality, setQuality] = useState<"live" | "hd">("live");
  const [mode, setMode] = useState<"snapshot" | "video">("snapshot");
  const [showAi, setShowAi] = useState<boolean>(true);
  const [showAllOther, setShowAllOther] = useState<boolean>(false);
  const [duration, setDuration] = useState<number>(0);
  const [snapshotTimestamp, setSnapshotTimestamp] = useState<number>(Date.now());
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const currentCam =
    channels.find((c) => c.channel === activeChannel) ||
    channels[0] || { channel: activeChannel, name: `Camera ${activeChannel < 10 ? `0${activeChannel}` : activeChannel}` };

  // Timer increment
  useEffect(() => {
    const timer = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Continuous live snapshot refresh
  useEffect(() => {
    if (mode !== "snapshot") return;
    const interval = setInterval(() => {
      setSnapshotTimestamp(Date.now());
    }, 2500);
    return () => clearInterval(interval);
  }, [mode, activeChannel]);

  const toggleFullscreen = () => {
    if (!videoContainerRef.current) return;
    if (!document.fullscreenElement) {
      videoContainerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const otherCameras = channels.filter((c) => c.channel !== activeChannel);
  const displayedOtherCameras = showAllOther ? otherCameras : otherCameras.slice(0, 4);

  return (
    <div className="w-full min-h-screen bg-[#f8fafc] text-slate-800 pb-24 select-none" dir="rtl">
      {/* 1. TOP MOBILE HEADER (طراز الصورة المرفقة) */}
      <header className="bg-white border-b border-slate-200/80 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        {/* Right (in RTL): Menu Icon */}
        <button
          onClick={onOpenMenu}
          className="p-1 rounded-xl text-slate-800 hover:bg-slate-100 active:scale-95 transition-all"
          title="القائمة"
        >
          <Menu className="h-6 w-6" />
        </button>

        {/* Center: Title + Cloud Connected Badge */}
        <div className="flex flex-col items-center">
          <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
            كاميرات المراقبة المباشرة
          </h1>
          <div className="mt-1 flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#f0fbf6] text-[#0f766e] border border-[#a7f3d0] text-[11px] font-bold">
            <Cloud className="h-3 w-3 text-[#0f766e]" />
            <span>متصل بالسحابة</span>
          </div>
        </div>

        {/* Left (in RTL): Alerts Bell with Red Dot */}
        <button
          onClick={onOpenAlerts}
          className="p-1 rounded-xl text-slate-800 hover:bg-slate-100 relative active:scale-95 transition-all"
          title="التنبيهات"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute 1 top-0.5 right-0.5 h-2 w-2 rounded-full bg-red-500 border border-white" />
        </button>
      </header>

      {/* MAIN BODY CONTAINER */}
      <main className="p-3.5 space-y-4 max-w-lg mx-auto">
        {/* 2. ACTIVE FOCUSED CAMERA CARD (البطاقة الكبيرة الرئيسية كما في الصورة) */}
        <div className="bg-white rounded-3xl border border-slate-200/90 p-3 sm:p-4 shadow-sm space-y-3">
          {/* Card Header Row */}
          <div className="flex items-center justify-between px-1">
            {/* Left (in RTL): Close / Reset Icon */}
            <button
              onClick={() => onSelectChannel(channels[0]?.channel || 1)}
              className="text-slate-500 hover:text-slate-800 p-1 rounded-lg"
              title="إعادة التعيين"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Right (in RTL): Camera Name + Separator + Live Badge */}
            <div className="flex items-center gap-2">
              <span className="bg-[#e8f8f0] text-[#0f766e] border border-[#a3e6cd] text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                بث مباشر حي (FPS 30)
              </span>

              <span className="text-slate-300">|</span>

              <h2 className="text-base font-black text-slate-800 tracking-tight flex items-center gap-1.5">
                <span>{currentCam.name || `Camera ${currentCam.channel < 10 ? `0${currentCam.channel}` : currentCam.channel}`}</span>
                <Cctv className="h-4 w-4 text-blue-600" />
              </h2>
            </div>
          </div>

          {/* Video / Snapshot Viewport */}
          <div
            ref={videoContainerRef}
            className="relative w-full aspect-[16/10] bg-black rounded-2xl overflow-hidden border border-slate-200/80 shadow-inner group flex items-center justify-center"
          >
            {/* Top-Left Red Live Badge */}
            <div className="absolute top-2.5 left-2.5 bg-red-600/90 text-white font-bold text-[10px] px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-md z-10 pointer-events-none">
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              <span>بث مباشر</span>
            </div>

            {/* Bottom-Left Channel Number Badge */}
            <div className="absolute bottom-2.5 left-2.5 bg-black/65 backdrop-blur-xs text-white text-[10px] font-mono px-2 py-0.5 rounded-md border border-white/10 z-10 pointer-events-none">
              CH {currentCam.channel < 10 ? `0${currentCam.channel}` : currentCam.channel}
            </div>

            {/* Bottom-Right Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              className="absolute bottom-2.5 right-2.5 bg-black/65 hover:bg-black/80 text-white p-1.5 rounded-lg border border-white/10 z-10 active:scale-95 transition-all"
              title="ملء الشاشة"
            >
              <Maximize2 className="h-4 w-4" />
            </button>

            {/* AI Human Tracking Bounding Box */}
            {showAi && currentCam.channel === 7 && (
              <div
                style={{
                  position: "absolute",
                  left: "48%",
                  top: "38%",
                  width: "12%",
                  height: "28%",
                }}
                className="border-2 border-emerald-400 rounded bg-emerald-500/10 pointer-events-none z-10 transition-all duration-300 shadow-sm"
              >
                <div className="absolute -top-5 right-0 bg-emerald-600 text-white font-bold text-[9px] px-1.5 py-0.2 rounded shadow whitespace-nowrap">
                  شخص 96%
                </div>
              </div>
            )}

            {/* Live Camera View Image (Ultra-Fast 0 Latency Stream) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/cameras/cloud/snapshot?channel=${currentCam.channel}&t=${snapshotTimestamp}`}
              alt={currentCam.name}
              className="w-full h-full object-cover"
              onError={() => {
                setTimeout(() => setSnapshotTimestamp(Date.now()), 1500);
              }}
            />
          </div>

          {/* Control Row 1: Status Bar (مطابق تماماً للصورة) */}
          <div className="bg-[#eefbf4] border border-[#c6f1dc] rounded-2xl px-3 py-2 flex items-center justify-between text-xs">
            {/* Right (in RTL): بث فيديو حي */}
            <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>بث فيديو حي</span>
            </div>

            {/* Center: 00:00:00 Clock */}
            <div className="flex items-center gap-1 text-slate-700 font-mono font-bold text-xs">
              <Clock className="h-3.5 w-3.5 text-slate-500" />
              <span>{formatTimer(duration)}</span>
            </div>

            {/* Left (in RTL): تتبع الأشخاص (AI) */}
            <button
              onClick={() => setShowAi(!showAi)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-xl font-bold text-[11px] transition-all active:scale-95 ${
                showAi
                  ? "bg-emerald-100/90 text-emerald-800 border border-emerald-300"
                  : "bg-slate-100 text-slate-500 border border-slate-200"
              }`}
            >
              <Target className="h-3.5 w-3.5 text-emerald-600" />
              <span>تتبع الأشخاص (AI)</span>
            </button>
          </div>

          {/* Control Row 2: Two Side-by-Side Action Buttons (مطابق تماماً للصورة) */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* Sub (سلس) [HD] Button */}
            <button
              onClick={() => setQuality(quality === "hd" ? "live" : "hd")}
              className="bg-white hover:bg-emerald-50/50 text-[#0f766e] font-bold py-2.5 px-3 rounded-2xl border-2 border-[#34d399] flex items-center justify-center gap-2 shadow-xs active:scale-98 transition-all text-xs"
            >
              <span className="bg-emerald-600 text-white font-mono text-[10px] px-1 py-0.2 rounded font-extrabold">
                {quality === "hd" ? "2K" : "HD"}
              </span>
              <span>{quality === "hd" ? "2K HD (فائقة)" : "Sub (سلس)"}</span>
            </button>

            {/* نمط الجوال السريع Button */}
            <button
              onClick={() => {
                setMode("snapshot");
                setSnapshotTimestamp(Date.now());
              }}
              className="bg-[#dbeafe] hover:bg-[#bfdbfe] text-[#1d4ed8] font-bold py-2.5 px-3 rounded-2xl border border-[#93c5fd] flex items-center justify-center gap-2 shadow-xs active:scale-98 transition-all text-xs"
            >
              <Zap className="h-4 w-4 text-[#1d4ed8]" />
              <span>نمط الجوال السريع</span>
            </button>
          </div>

          {/* Control Row 3: Full-Width Solid Green Action Button (مطابق تماماً للصورة) */}
          <button
            onClick={() => {
              setMode("snapshot");
              setSnapshotTimestamp(Date.now());
            }}
            className="w-full bg-[#0f766e] hover:bg-[#115e59] text-white font-bold py-3 px-4 rounded-2xl flex items-center justify-center gap-2 shadow-md shadow-emerald-700/20 active:scale-98 transition-all text-sm"
          >
            <Zap className="h-4 w-4 text-emerald-300" />
            <span>الفتح الفوري بنمط الجوال السريع</span>
          </button>
        </div>

        {/* 3. SECTION: OTHER CAMERAS (كاميرات أخرى كما في الصورة) */}
        <section className="space-y-2.5 pt-1">
          {/* Header Row */}
          <div className="flex items-center justify-between px-1">
            {/* Right: Section Title */}
            <div className="flex items-center gap-1.5 text-slate-800 font-extrabold text-sm">
              <Cctv className="h-4 w-4 text-slate-700" />
              <span>كاميرات أخرى</span>
            </div>

            {/* Left: View All Link */}
            <button
              onClick={() => setShowAllOther(!showAllOther)}
              className="text-blue-600 hover:text-blue-700 text-xs font-bold flex items-center gap-0.5 active:scale-95 transition-all"
            >
              <span>{showAllOther ? "عرض أقل" : "عرض الكل"}</span>
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* 2-Column Camera Grid Cards */}
          <div className="grid grid-cols-2 gap-3">
            {displayedOtherCameras.map((cam) => (
              <div
                key={cam.channel}
                onClick={() => {
                  onSelectChannel(cam.channel);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs hover:shadow-md cursor-pointer active:scale-98 transition-all flex flex-col"
              >
                {/* Snapshot Thumbnail */}
                <div className="relative aspect-[16/10] bg-slate-900 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/cameras/cloud/snapshot?channel=${cam.channel}`}
                    alt={cam.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute bottom-1.5 left-1.5 bg-black/60 text-white font-mono text-[9px] px-1.5 py-0.5 rounded">
                    CH {cam.channel < 10 ? `0${cam.channel}` : cam.channel}
                  </div>
                </div>

                {/* Bottom Card Bar */}
                <div className="p-2.5 flex items-center justify-between text-xs bg-white">
                  {/* Left: بث مباشر */}
                  <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span>بث مباشر</span>
                  </div>

                  {/* Right: Camera Name */}
                  <div className="font-extrabold text-slate-800 flex items-center gap-1 text-xs">
                    <span>{cam.name || `Camera ${cam.channel < 10 ? `0${cam.channel}` : cam.channel}`}</span>
                    <Cctv className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* 4. FIXED BOTTOM MOBILE NAVIGATION BAR (مطابق تماماً للصورة) */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200/90 py-1.5 px-4 flex items-center justify-around z-40 shadow-lg">
        {/* Tab 1: البث المباشر (Active) */}
        <button
          onClick={() => setActiveTab("live")}
          className={`flex flex-col items-center justify-center py-1 px-4 rounded-2xl transition-all ${
            activeTab === "live" || activeTab === "thumbnail"
              ? "bg-[#dbeafe] text-[#1d4ed8] font-bold shadow-xs"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <Play className="h-4 w-4 fill-current" />
          <span className="text-[10px] mt-0.5">البث المباشر</span>
        </button>

        {/* Tab 2: لقطة */}
        <button
          onClick={() => onDownloadSnapshot(currentCam)}
          className="flex flex-col items-center justify-center py-1 px-3 text-slate-500 hover:text-slate-800 active:scale-95 transition-all"
        >
          <Camera className="h-4 w-4" />
          <span className="text-[10px] mt-0.5">لقطة</span>
        </button>

        {/* Tab 3: التنبيهات */}
        <button
          onClick={onOpenAlerts}
          className={`flex flex-col items-center justify-center py-1 px-3 relative transition-all ${
            activeTab === "alerts"
              ? "bg-[#dbeafe] text-[#1d4ed8] font-bold rounded-2xl"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <div className="relative">
            <Bell className="h-4 w-4" />
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500 border border-white" />
          </div>
          <span className="text-[10px] mt-0.5">التنبيهات</span>
        </button>

        {/* Tab 4: المزيد */}
        <button
          onClick={onOpenMenu}
          className="flex flex-col items-center justify-center py-1 px-3 text-slate-500 hover:text-slate-800 active:scale-95 transition-all"
        >
          <MoreHorizontal className="h-4 w-4" />
          <span className="text-[10px] mt-0.5">المزيد</span>
        </button>
      </nav>
    </div>
  );
}
