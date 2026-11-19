"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Cctv,
  Maximize2,
  Minimize2,
  RefreshCw,
  Play,
  Pause,
  Camera,
  Grid2X2,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Download,
  AlertCircle,
  Film,
  Calendar,
  Clock,
  HardDrive,
  Search,
  Radio,
  Globe,
  Wifi,
  ShieldCheck,
  ShieldAlert,
  Bell,
  Sliders,
  Settings,
  Home,
  User,
  MoreVertical,
  Volume2,
  VolumeX,
  FileVideo,
  Eye,
  CheckCircle2,
} from "lucide-react";
import CloudVideoPlayer from "@/components/cameras/cloud-video-player";
import SmartAlertsCenter from "@/components/cameras/smart-alerts-center";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ChannelData {
  channel: number;
  name: string;
  id?: string;
  mainStreamId?: number;
  subStreamId?: number;
  online?: boolean;
}

interface DeviceData {
  online: boolean;
  deviceName?: string;
  model?: string;
  serialNumber?: string;
  firmwareVersion?: string;
  totalChannels?: number;
  error?: string;
}

interface RecordedClip {
  trackId: number;
  channel: number;
  startTime: string;
  endTime: string;
  size: number;
  sizeFormatted: string;
  playbackURI: string;
}

export default function CamerasPage() {
  const [device, setDevice] = useState<DeviceData | null>({
    online: true,
    model: "iDS-7216HUHI-M2/XT",
    serialNumber: "GK0622137",
    totalChannels: 16,
  });
  const [channels, setChannels] = useState<ChannelData[]>([]);
  const [isLive, setIsLive] = useState<boolean>(true);
  const [refreshInterval, setRefreshInterval] = useState<number>(3);
  const [streamQuality, setStreamQuality] = useState<"sub" | "main">("main");
  const [layoutMode, setLayoutMode] = useState<"8_first" | "16" | "4" | "1">("8_first");

  // Connection mode: 'cloud' (via Hik-Connect OpenAPI) or 'local'
  const [connectionMode, setConnectionMode] = useState<"cloud" | "local">("cloud");

  // Active View Tab: 'live' | 'thumbnail' | 'alerts' | 'playback'
  const [activeTab, setActiveTab] = useState<"live" | "thumbnail" | "alerts" | "events" | "playback" | "smart" | "settings">("live");

  // Playback search state
  const [playbackChannel, setPlaybackChannel] = useState<number>(1);
  const [playbackDate, setPlaybackDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [searchingClips, setSearchingClips] = useState<boolean>(false);
  const [recordedClips, setRecordedClips] = useState<RecordedClip[]>([]);
  const [searchDone, setSearchDone] = useState<boolean>(false);

  // Fullscreen state
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Single focused camera in modal
  const [focusedChannel, setFocusedChannel] = useState<number | null>(null);
  const [modalStreamMode, setModalStreamMode] = useState<"video" | "snapshot">("video");

  // Rename modal
  const [editingChannel, setEditingChannel] = useState<ChannelData | null>(null);
  const [newChannelName, setNewChannelName] = useState<string>("");
  const [savingName, setSavingName] = useState<boolean>(false);

  // Timestamps for forced image refresh
  const [imageTimestamps, setImageTimestamps] = useState<Record<number, number>>({});

  // Fetch initial info based on connection mode
  const fetchCameraData = useCallback(async (mode: "cloud" | "local") => {
    try {
      if (mode === "cloud") {
        const res = await fetch("/api/cameras/cloud/cameras");
        const data = await res.json();
        if (data.success && data.cameras) {
          setDevice({
            online: data.deviceOnline ?? true,
            deviceName: "Hik-Connect Cloud DVR",
            model: "iDS-7216HUHI-M2/XT",
            serialNumber: data.deviceSerial || "GK0622137",
            totalChannels: 16,
          });

          let localCustomNames: Record<number, string> = {};
          try {
            const infoRes = await fetch("/api/cameras/info");
            const infoData = await infoRes.json();
            if (infoData.settings?.customNames) {
              localCustomNames = infoData.settings.customNames;
            }
          } catch {}

          const mapped: ChannelData[] = data.cameras.map((c: any) => ({
            channel: c.channelNo,
            id: c.id,
            name: localCustomNames[c.channelNo] || c.name || `Camera ${c.channelNo.toString().padStart(2, "0")}`,
            online: c.online !== false,
          }));
          setChannels(mapped);
          return;
        }
      }

      // Local fallback
      const res = await fetch("/api/cameras/info");
      const data = await res.json();
      if (data.device) setDevice(data.device);
      if (data.channels) setChannels(data.channels);
      if (data.settings?.refreshInterval) setRefreshInterval(data.settings.refreshInterval);
    } catch (err) {
      console.error("Failed to load camera data", err);
    }
  }, []);

  useEffect(() => {
    fetchCameraData(connectionMode);
  }, [fetchCameraData, connectionMode]);

  // Periodic refresh loop
  useEffect(() => {
    if (!isLive || activeTab === "playback") return;

    const interval = setInterval(() => {
      const now = Date.now();
      setImageTimestamps((prev) => {
        const next = { ...prev };
        for (let i = 1; i <= 16; i++) {
          next[i] = now;
        }
        return next;
      });
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [isLive, refreshInterval, activeTab]);

  // Fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Search playback clips
  const handleSearchClips = async () => {
    setSearchingClips(true);
    setSearchDone(true);
    try {
      const res = await fetch(
        `/api/cameras/playback/search?channel=${playbackChannel}&date=${playbackDate}`
      );
      const data = await res.json();
      if (data.success && data.clips) {
        setRecordedClips(data.clips);
      } else {
        setRecordedClips([]);
      }
    } catch (err) {
      console.error("Failed to search playback clips", err);
      setRecordedClips([]);
    } finally {
      setSearchingClips(false);
    }
  };

  useEffect(() => {
    if (activeTab === "playback" && !searchDone) {
      handleSearchClips();
    }
  }, [activeTab, searchDone]);

  // Displayed channels based on layout
  const displayedChannels = channels.filter((c) => {
    if (layoutMode === "8_first") return c.channel <= 8;
    if (layoutMode === "16") return true;
    if (layoutMode === "4") return c.channel <= 4;
    if (layoutMode === "1") return c.channel === (focusedChannel || 1);
    return true;
  });

  // Save new camera name
  const handleSaveName = async () => {
    if (!editingChannel || !newChannelName.trim()) return;
    setSavingName(true);
    try {
      const res = await fetch("/api/cameras/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: editingChannel.channel,
          customName: newChannelName.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setChannels((prev) =>
          prev.map((c) =>
            c.channel === editingChannel.channel
              ? { ...c, name: newChannelName.trim() }
              : c
          )
        );
        setEditingChannel(null);
      }
    } catch (err) {
      console.error("Failed to save channel name", err);
    } finally {
      setSavingName(false);
    }
  };

  // Compute live image URL for each channel
  const getCameraImageUrl = (ch: ChannelData, timestamp: number, isEnlarged = false) => {
    if (connectionMode === "cloud") {
      const forceParam = isEnlarged ? "&refresh=1" : "";
      return `/api/cameras/cloud/snapshot?cameraId=${ch.id || ""}&channel=${ch.channel}&t=${timestamp}${forceParam}`;
    }
    return `/api/cameras/snapshot?channel=${ch.channel}&stream=${streamQuality}&t=${timestamp}`;
  };

  const handleDownloadSnapshot = async (ch: ChannelData) => {
    try {
      const url = getCameraImageUrl(ch, Date.now(), true);
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      const dateStr = new Date().toISOString().replace(/[:.]/g, "-");
      a.download = `camera_${ch.channel}_${ch.name}_${dateStr}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("Error downloading snapshot", err);
    }
  };

  const activeCount = channels.filter((c) => c.online !== false).length || 8;
  const offlineCount = channels.filter((c) => c.online === false).length || 0;
  const totalCount = channels.length || 8;

  return (
    <div className="min-h-screen bg-[#f4f6f9] text-slate-800 flex" dir="rtl">
      {/* 1. RIGHT SIDEBAR NAVIGATION (طراز الصورة المرفقة) */}
      <aside className="w-48 bg-white border-l border-slate-200/80 flex flex-col justify-between py-5 px-3 select-none flex-shrink-0 z-20 shadow-sm">
        <div className="space-y-6">
          {/* Logo */}
          <div className="flex items-center justify-center pb-2">
            <Link href="/" className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 font-black text-lg">
                <Cctv className="h-6 w-6" />
              </div>
            </Link>
          </div>

          {/* Navigation Items */}
          <nav className="space-y-1 text-sm font-semibold">
            <Link
              href="/"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              <Home className="h-4 w-4 text-slate-400" />
              <span>الرئيسية</span>
            </Link>

            <button
              onClick={() => setActiveTab("live")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                activeTab === "live" || activeTab === "thumbnail"
                  ? "bg-blue-50 text-blue-600 font-bold border border-blue-200/60 shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Cctv className={`h-4 w-4 ${activeTab === "live" ? "text-blue-600" : "text-slate-400"}`} />
              <span>الكاميرات</span>
            </button>

            <button
              onClick={() => setActiveTab("alerts")}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${
                activeTab === "alerts"
                  ? "bg-blue-50 text-blue-600 font-bold border border-blue-200/60 shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <div className="flex items-center gap-3">
                <Bell className={`h-4 w-4 ${activeTab === "alerts" ? "text-blue-600" : "text-slate-400"}`} />
                <span>التنبيهات</span>
              </div>
              <span className="h-5 w-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                3
              </span>
            </button>

            <button
              onClick={() => setActiveTab("events")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                activeTab === "events"
                  ? "bg-blue-50 text-blue-600 font-bold border border-blue-200/60 shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Calendar className="h-4 w-4 text-slate-400" />
              <span>الأحداث</span>
            </button>

            <button
              onClick={() => setActiveTab("playback")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                activeTab === "playback"
                  ? "bg-blue-50 text-blue-600 font-bold border border-blue-200/60 shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Film className="h-4 w-4 text-slate-400" />
              <span>التسجيلات</span>
            </button>

            <button
              onClick={() => setActiveTab("smart")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                activeTab === "smart"
                  ? "bg-blue-50 text-blue-600 font-bold border border-blue-200/60 shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Sliders className="h-4 w-4 text-slate-400" />
              <span>الضبط الذكي</span>
            </button>

            <button
              onClick={() => setActiveTab("settings")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                activeTab === "settings"
                  ? "bg-blue-50 text-blue-600 font-bold border border-blue-200/60 shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Settings className="h-4 w-4 text-slate-400" />
              <span>الإعدادات</span>
            </button>
          </nav>
        </div>

        {/* User Role at Bottom */}
        <div className="pt-4 border-t border-slate-100 flex items-center gap-2.5 px-2">
          <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
            <User className="h-4 w-4" />
          </div>
          <div className="truncate">
            <div className="text-xs font-bold text-slate-800">مدير النظام</div>
            <div className="text-[10px] text-slate-400 truncate">GK0622137</div>
          </div>
        </div>
      </aside>

      {/* 2. MAIN CONTENT AREA */}
      <div ref={containerRef} className="flex-1 flex flex-col p-4 md:p-6 overflow-x-hidden min-w-0">
        {/* TOP STATUS BAR (المراقبة المباشرة + بطاقات العدادات) */}
        <div className="bg-white rounded-2xl p-4 md:p-5 border border-slate-200/80 shadow-sm mb-4 flex flex-wrap items-center justify-between gap-4">
          {/* Right Section: Page Title & Icon */}
          <div className="flex items-center gap-3.5">
            <div className="h-12 w-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/30">
              <Cctv className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                المراقبه المباشره
              </h1>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                كاميرات الفروع والمستودعات
              </p>
            </div>
          </div>

          {/* Center Stats Badges (مطابق للصورة تماماً) */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            {/* 1. Total Cameras */}
            <div className="bg-slate-50 border border-slate-200/70 rounded-xl px-4 py-2 flex items-center gap-2.5">
              <div className="text-left">
                <div className="text-sm font-extrabold text-slate-800 flex items-center gap-1 justify-end">
                  <span>{totalCount}</span>
                  <Cctv className="h-3.5 w-3.5 text-slate-500" />
                </div>
                <div className="text-[11px] text-slate-400 font-medium">الإجمالي</div>
              </div>
            </div>

            {/* 2. Offline Cameras */}
            <div className="bg-slate-50 border border-slate-200/70 rounded-xl px-4 py-2 flex items-center gap-2.5">
              <div className="text-left">
                <div className="text-sm font-extrabold text-red-500 flex items-center gap-1 justify-end">
                  <span>{offlineCount}</span>
                  <AlertCircle className="h-3.5 w-3.5" />
                </div>
                <div className="text-[11px] text-slate-400 font-medium">غير متصل</div>
              </div>
            </div>

            {/* 3. Active Cameras */}
            <div className="bg-slate-50 border border-slate-200/70 rounded-xl px-4 py-2 flex items-center gap-2.5">
              <div className="text-left">
                <div className="text-sm font-extrabold text-emerald-600 flex items-center gap-1 justify-end">
                  <span>{activeCount}</span>
                  <Cctv className="h-3.5 w-3.5 text-emerald-500" />
                </div>
                <div className="text-[11px] text-slate-400 font-medium">كاميرات نشطة</div>
              </div>
            </div>

            {/* 4. Connection State Badge */}
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-2 rounded-xl flex items-center gap-2 font-bold text-xs shadow-sm">
              <Globe className="h-4 w-4 text-emerald-600" />
              <span>متصل Hik-Connect</span>
            </div>

            {/* 5. DVR Device Badge */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-1.5 flex items-center gap-3">
              <div className="h-8 w-12 bg-slate-800 rounded flex items-center justify-center text-white text-[9px] font-mono">
                DVR
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1">
                  <span>iDS-7216HUHI-M2/XT</span>
                  <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
                </div>
                <div className="text-[10px] text-slate-400 font-mono">GK0622137</div>
              </div>
            </div>
          </div>
        </div>

        {/* ACTION & VIEW CONTROLS TOOLBAR (الشريط الثاني كما في الصورة) */}
        <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-sm mb-4 flex flex-wrap items-center justify-between gap-3">
          {/* Left Actions: Tab Switch (بث مباشر vs الصورة المصغرة) */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("live")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                activeTab === "live"
                  ? "bg-blue-600 text-white shadow-blue-600/30"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Radio className="h-3.5 w-3.5" />
              <span>بث مباشر</span>
            </button>

            <button
              onClick={() => setActiveTab("thumbnail")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === "thumbnail"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              <span>الصورة المصغرة</span>
            </button>
          </div>

          {/* Right Actions: Fullscreen & Grid Layout Mode */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={toggleFullscreen}
              className="border-slate-200 text-slate-600 hover:bg-slate-100 gap-1.5 text-xs font-bold rounded-xl h-9"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span>ملء الشاشة</span>
            </Button>

            <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/80 text-xs">
              <button
                onClick={() => setLayoutMode("8_first")}
                className={`p-1.5 rounded-lg transition-colors ${
                  layoutMode === "8_first"
                    ? "bg-white text-blue-600 font-bold shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
                title="عرض شبكة 8 كاميرات"
              >
                <Grid2X2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setLayoutMode("16")}
                className={`p-1.5 rounded-lg transition-colors ${
                  layoutMode === "16"
                    ? "bg-white text-blue-600 font-bold shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
                title="عرض 16 كاميرا"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setLayoutMode("1")}
                className={`p-1.5 rounded-lg transition-colors ${
                  layoutMode === "1"
                    ? "bg-white text-blue-600 font-bold shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
                title="عرض كاميرا مفردة"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* 3. CONDITIONAL TAB RENDERING */}

        {/* TAB 1 & 2: LIVE VIDEO STREAM / THUMBNAILS GRID (طراز الصورة المرفقة) */}
        {(activeTab === "live" || activeTab === "thumbnail") && (
          <div className="flex-1 flex flex-col justify-between">
            {/* The 8 / 16 Cameras Cards Grid */}
            <div
              className={`grid gap-4 overflow-y-auto pb-4 ${
                layoutMode === "8_first"
                  ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
                  : layoutMode === "16"
                  ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                  : "grid-cols-1"
              }`}
            >
              {displayedChannels.map((ch) => {
                const timestamp = imageTimestamps[ch.channel] || 0;
                const imgUrl = getCameraImageUrl(ch, timestamp);

                return (
                  <Card
                    key={ch.channel}
                    className="bg-white border-slate-200/90 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
                  >
                    {/* Top Bar of Each Camera Card */}
                    <div className="p-3 bg-white border-b border-slate-100 flex items-center justify-between text-xs font-bold text-slate-800">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold">{ch.name || `Camera ${ch.channel.toString().padStart(2, "0")}`}</span>
                        <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
                      </div>

                      <button
                        onClick={() => {
                          setModalStreamMode("video");
                          setFocusedChannel(ch.channel);
                        }}
                        className="text-slate-400 hover:text-blue-600 transition-colors p-1"
                        title="تكبير"
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Camera Video / Snapshot Viewport */}
                    <div
                      className="relative aspect-video bg-slate-900 cursor-pointer overflow-hidden flex items-center justify-center"
                      onClick={() => {
                        setModalStreamMode("video");
                        setFocusedChannel(ch.channel);
                      }}
                    >
                      <img
                        src={imgUrl}
                        alt={ch.name}
                        className="w-full h-full object-cover select-none group-hover:scale-102 transition-transform duration-300"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.opacity = "0.7";
                        }}
                        onLoad={(e) => {
                          e.currentTarget.style.opacity = "1";
                        }}
                      />

                      {/* Overlaid Badges on Video Frame */}
                      <div className="absolute bottom-2.5 right-2.5 bg-red-600 text-white font-black text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1 pointer-events-none shadow-sm">
                        <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                        <span>LIVE</span>
                      </div>

                      <div className="absolute bottom-2.5 left-2.5 bg-black/60 text-white font-mono text-[10px] px-2 py-0.5 rounded-md pointer-events-none">
                        CH {ch.channel.toString().padStart(2, "0")}
                      </div>
                    </div>

                    {/* Bottom Controls Bar of Camera Card (مطابق تماماً للصورة) */}
                    <div className="p-2.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-around text-slate-400">
                      <button
                        onClick={() => {
                          setModalStreamMode("video");
                          setFocusedChannel(ch.channel);
                        }}
                        className="p-1.5 hover:text-blue-600 hover:bg-white rounded-lg transition-colors"
                        title="مشاهدة البث"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDownloadSnapshot(ch)}
                        className="p-1.5 hover:text-emerald-600 hover:bg-white rounded-lg transition-colors"
                        title="التقاط صورة"
                      >
                        <Camera className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setActiveTab("alerts")}
                        className="p-1.5 hover:text-amber-600 hover:bg-white rounded-lg transition-colors"
                        title="تنبيهات هذه الكاميرا"
                      >
                        <Bell className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingChannel(ch);
                          setNewChannelName(ch.name);
                        }}
                        className="p-1.5 hover:text-purple-600 hover:bg-white rounded-lg transition-colors"
                        title="خيارات وتعديل"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* BOTTOM FOOTER BAR (مطابق لشريط أسفل الصفحة في الصورة) */}
            <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-sm mt-2 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-slate-700">
              {/* Right Footer Actions */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setLayoutMode("16")}
                  className="border-slate-200 text-slate-700 hover:bg-slate-50 gap-1.5 h-9 rounded-xl"
                >
                  <LayoutGrid className="h-3.5 w-3.5 text-slate-500" />
                  <span>عرض الكل</span>
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    displayedChannels.forEach((ch) => handleDownloadSnapshot(ch));
                  }}
                  className="border-slate-200 text-slate-700 hover:bg-slate-50 gap-1.5 h-9 rounded-xl"
                >
                  <Camera className="h-3.5 w-3.5 text-slate-500" />
                  <span>التقاط صورة</span>
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsLive(!isLive)}
                  className="border-slate-200 text-slate-700 hover:bg-slate-50 gap-1.5 h-9 rounded-xl"
                >
                  <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${isLive ? "animate-spin" : ""}`} />
                  <span>تشغيل متتابع</span>
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setActiveTab("playback")}
                  className="border-slate-200 text-red-600 hover:bg-red-50 gap-1.5 h-9 rounded-xl"
                >
                  <span className="h-2 w-2 rounded-full bg-red-500 inline-block" />
                  <span>تسجيل مقطع</span>
                </Button>
              </div>

              {/* Left Footer: Stream Quality Selector */}
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-600 text-white font-bold text-xs px-2.5 py-1 rounded-lg">
                  HD
                </Badge>
                <span className="text-slate-600 font-bold">دقة عالية: (2K HD)</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SMART ALERTS & OUT-OF-HOURS MONITORING */}
        {activeTab === "alerts" && (
          <div className="flex-1 overflow-y-auto">
            <SmartAlertsCenter
              onSelectCamera={(channel) => {
                setActiveTab("live");
                setFocusedChannel(channel);
                setModalStreamMode("video");
              }}
            />
          </div>
        )}

        {/* TAB 4: PLAYBACK & RECORDINGS */}
        {activeTab === "playback" && (
          <div className="flex-1 flex flex-col gap-4 overflow-y-auto">
            <Card className="bg-white border-slate-200 p-5 rounded-2xl shadow-sm flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-bold">الكاميرا:</span>
                  <Select
                    value={String(playbackChannel)}
                    onValueChange={(val) => setPlaybackChannel(Number(val))}
                  >
                    <SelectTrigger className="w-[180px] bg-slate-50 border-slate-200 text-slate-800 text-xs rounded-xl">
                      <SelectValue placeholder="اختر الكاميرا" />
                    </SelectTrigger>
                    <SelectContent>
                      {channels.map((c) => (
                        <SelectItem key={c.channel} value={String(c.channel)}>
                          {c.name || `كاميرا ${c.channel}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-bold">التاريخ:</span>
                  <Input
                    type="date"
                    value={playbackDate}
                    onChange={(e) => setPlaybackDate(e.target.value)}
                    className="w-[160px] bg-slate-50 border-slate-200 text-slate-800 text-xs rounded-xl"
                  />
                </div>

                <Button
                  size="sm"
                  onClick={handleSearchClips}
                  disabled={searchingClips}
                  className="bg-blue-600 hover:bg-blue-700 text-white gap-2 font-bold text-xs rounded-xl h-9"
                >
                  <Search className={`h-3.5 w-3.5 ${searchingClips ? "animate-spin" : ""}`} />
                  {searchingClips ? "جاري البحث..." : "بحث في التسجيلات"}
                </Button>
              </div>
            </Card>

            {/* Clips List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recordedClips.length === 0 ? (
                <div className="col-span-full text-center py-12 text-slate-400 text-sm bg-white rounded-2xl border border-slate-200">
                  <Film className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                  لا توجد تسجيلات متاحة لهذا التاريخ
                </div>
              ) : (
                recordedClips.map((clip, index) => (
                  <Card key={index} className="bg-white border-slate-200 p-4 rounded-xl shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <Badge className="bg-blue-50 text-blue-600 border border-blue-200 text-xs">
                        مقطع #{index + 1}
                      </Badge>
                      <span className="text-xs font-bold text-emerald-600">{clip.sizeFormatted}</span>
                    </div>
                    <div className="text-xs text-slate-500 mb-3">
                      {clip.startTime} - {clip.endTime}
                    </div>
                    <Button size="sm" variant="outline" className="w-full text-xs rounded-lg">
                      <Download className="h-3.5 w-3.5 ml-1" /> تحميل الفيديو
                    </Button>
                  </Card>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 5: SMART TUNING / الضبط الذكي */}
        {activeTab === "smart" && (
          <div className="flex-1 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <h2 className="text-lg font-black text-slate-900 mb-2">إعدادات التحليل والضبط الذكي AcuSense</h2>
            <p className="text-xs text-slate-500 mb-6">ضبط حساسية كشف الأشخاص والمركبات وتحديد خطوط التسلل لكل كاميرا.</p>
            <div className="space-y-4 max-w-xl">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-slate-800">تصفية الإنذارات الكاذبة (False Alarm Filter)</div>
                  <div className="text-xs text-slate-400 mt-0.5">تجاهل حركة الحيوانات والرياح والظلال تلقائياً</div>
                </div>
                <Badge className="bg-emerald-600 text-white">مفعل</Badge>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. MODAL: LIVE HD STREAM POPUP (عند الضغط على الكاميرا) */}
      {focusedChannel !== null && (
        <Dialog open={focusedChannel !== null} onOpenChange={() => setFocusedChannel(null)}>
          <DialogContent className="max-w-5xl bg-slate-950 border-slate-800 text-white p-0 overflow-hidden rounded-2xl" dir="rtl">
            <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cctv className="h-5 w-5 text-blue-400" />
                <DialogTitle className="text-base font-bold text-white">
                  {channels.find((c) => c.channel === focusedChannel)?.name || `Camera ${focusedChannel}`}
                </DialogTitle>
                <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs">
                  بث مباشر حي (30 FPS)
                </Badge>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setFocusedChannel(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </Button>
            </div>

            <div className="p-3 bg-black flex items-center justify-center min-h-[460px]">
              <CloudVideoPlayer
                channel={focusedChannel}
                quality="hd"
                onClose={() => setFocusedChannel(null)}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* 5. MODAL: RENAME CAMERA */}
      {editingChannel && (
        <Dialog open={editingChannel !== null} onOpenChange={() => setEditingChannel(null)}>
          <DialogContent className="bg-white border-slate-200 text-slate-800 rounded-2xl" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">تعديل اسم الكاميرا</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Input
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder="أدخل الاسم الجديد للكاميرا..."
                className="border-slate-200 rounded-xl"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setEditingChannel(null)} className="rounded-xl">
                إلغاء
              </Button>
              <Button onClick={handleSaveName} disabled={savingName} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
                {savingName ? "جاري الحفظ..." : "حفظ التعديل"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
