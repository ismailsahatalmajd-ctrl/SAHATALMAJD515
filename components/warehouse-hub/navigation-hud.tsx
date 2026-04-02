"use client"

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Gamepad2, 
  ChevronUp, 
  ChevronDown, 
  ChevronLeft, 
  ChevronRight, 
  ArrowUp, 
  ArrowDown,
  LocateFixed,
  Zap,
  Target,
  Compass
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavigationHUDProps {
  onMove: (direction: 'forward' | 'backward' | 'left' | 'right' | 'up' | 'down') => void
  onSelect: () => void
  className?: string
}

export function NavigationHUD({ onMove, onSelect, className }: NavigationHUDProps) {
  const [activeDir, setActiveDir] = useState<string | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const startMoving = (dir: any) => {
    if (activeDir === dir) return // Already moving
    setActiveDir(dir)
    onMove(dir)
    timerRef.current = setInterval(() => {
      onMove(dir)
    }, 40)
  }

  const stopMoving = (dir?: string) => {
    if (dir && activeDir !== dir) return
    setActiveDir(null)
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  // Keyboard Mapping
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (key === 'w' || key === 'arrowup') startMoving('forward')
      if (key === 's' || key === 'arrowdown') startMoving('backward')
      if (key === 'a' || key === 'arrowleft') startMoving('left')
      if (key === 'd' || key === 'arrowright') startMoving('right')
      if (key === ' ' || key === 'q') startMoving('up')
      if (key === 'shift' || key === 'e') startMoving('down')
      if (key === 'f' || key === 'enter') onSelect()
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (['w', 'arrowup', 's', 'arrowdown', 'a', 'arrowleft', 'd', 'arrowright', ' ', 'q', 'shift', 'e'].includes(key)) {
        stopMoving()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      stopMoving()
    }
  }, [activeDir]) // Dependencies to ensure current state is respected

  const JoystickBtn = ({ dir, icon: Icon, position }: any) => {
    const isActive = activeDir === dir
    return (
      <div className={cn("absolute", position)}>
        <motion.button
          onMouseDown={() => startMoving(dir)}
          onMouseUp={stopMoving}
          onMouseLeave={stopMoving}
          onTouchStart={(e) => { e.preventDefault(); startMoving(dir); }}
          onTouchEnd={stopMoving}
          className={cn(
            "w-9 h-9 flex items-center justify-center rounded-lg border transition-all duration-300",
            isActive 
              ? "bg-primary border-primary shadow-[0_0_15px_rgba(59,130,246,0.8)] scale-110 text-white" 
              : "bg-slate-900/60 border-slate-700/50 text-slate-400 hover:border-primary/50"
          )}
        >
          <Icon className={cn("w-5 h-5", isActive && "animate-pulse")} />
        </motion.button>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col items-center select-none scale-90", className)}>
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="group relative h-48 w-48 rounded-full flex items-center justify-center"
      >
        {/* Background Visual Effects */}
        <div className="absolute inset-0 rounded-full bg-slate-950/60 backdrop-blur-3xl border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)]" />
        <div className="absolute inset-3 rounded-full border border-dashed border-primary/20 animate-[spin_20s_linear_infinite]" />
        
        {/* Core Compass Design */}
        <div className="absolute inset-0 flex items-center justify-center opacity-10 group-hover:opacity-20 transition-opacity">
          <Compass className="w-28 h-28 text-primary" />
        </div>

        {/* D-Pad Buttons in Circle */}
        <JoystickBtn dir="forward" icon={ChevronUp} position="-top-1 left-1/2 -translate-x-1/2" />
        <JoystickBtn dir="backward" icon={ChevronDown} position="-bottom-1 left-1/2 -translate-x-1/2" />
        <JoystickBtn dir="left" icon={ChevronLeft} position="top-1/2 -left-1 -translate-y-1/2" />
        <JoystickBtn dir="right" icon={ChevronRight} position="top-1/2 -right-1 -translate-y-1/2" />

        {/* Vertical Controls (Side Wings) */}
        <div className="absolute right-[-55px] flex flex-col gap-2">
          <motion.button
            onMouseDown={() => startMoving('up')}
            onMouseUp={stopMoving}
            onMouseLeave={stopMoving}
            className={cn(
              "w-9 h-9 rounded-full flex items-center justify-center border transition-all",
              activeDir === 'up' ? "bg-amber-500 border-amber-400 text-white shadow-lg shadow-amber-500/50" : "bg-slate-900/80 border-slate-800 text-slate-500"
            )}
          >
            <ArrowUp className="w-4 h-4" />
          </motion.button>
          <motion.button
            onMouseDown={() => startMoving('down')}
            onMouseUp={stopMoving}
            onMouseLeave={stopMoving}
            className={cn(
              "w-9 h-9 rounded-full flex items-center justify-center border transition-all",
              activeDir === 'down' ? "bg-amber-500 border-amber-400 text-white shadow-lg shadow-amber-500/50" : "bg-slate-900/80 border-slate-800 text-slate-500"
            )}
          >
            <ArrowDown className="w-4 h-4" />
          </motion.button>
        </div>

        {/* Tactical Center Pillar */}
        <motion.button
          onClick={onSelect}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="relative z-10 w-16 h-16 rounded-full bg-gradient-to-br from-primary via-blue-600 to-indigo-900 text-white flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.5)] border border-white/20"
        >
          <Target className="w-7 h-7" />
        </motion.button>
      </motion.div>

      <div className="mt-3 flex items-center gap-2 bg-slate-900/80 backdrop-blur-xl px-4 py-1.5 rounded-full border border-slate-700/50 shadow-xl">
        <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.3em]">
          Drone Controller v2.0
        </span>
        <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
      </div>

      <style jsx>{`
        @keyframes scan {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(300%); }
        }
      `}</style>
    </div>
  )
}
