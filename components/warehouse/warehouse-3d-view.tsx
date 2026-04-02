"use client"

import React, { Suspense, useState, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Stars, Sky, Environment, ContactShadows, Text, Box } from '@react-three/drei'
import { Rack3D } from './rack-3d'
import { WarehouseLocation, Product } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Info, Package, Map as MapIcon, RotateCcw } from 'lucide-react'

interface Warehouse3DViewProps {
  locations: WarehouseLocation[]
  products: Product[]
  selectedWarehouse: string
  onLocationSelect: (loc: WarehouseLocation) => void
  highlightedPosition?: string
}

export default function Warehouse3DView({ 
  locations, 
  products, 
  selectedWarehouse,
  onLocationSelect,
  highlightedPosition
}: Warehouse3DViewProps) {
  
  // Filter and group data for the scene
  const warehouseLocations = useMemo(() => {
    return locations.filter(l => l.warehouse === selectedWarehouse)
  }, [locations, selectedWarehouse])

  const zones = useMemo(() => {
    const z = new Set(warehouseLocations.map(l => l.zone))
    return Array.from(z).sort()
  }, [warehouseLocations])

  // Simple layout logic: 
  // Each zone gets a set of aisles. Aisles have racks.
  // We'll arrange zones side-by-side with "Main Roads" in between.
  
  const ZONE_SPACING = 20
  const AISLE_COUNT_PER_ZONE = 4
  const RACK_COUNT_PER_AISLE = 6

  return (
    <div className="relative w-full h-[600px] bg-slate-900 rounded-xl overflow-hidden border-2 border-slate-800 shadow-2xl">
      {/* 3D Canvas */}
      <Canvas shadows>
        <Suspense fallback={null}>
          <PerspectiveCamera makeDefault position={[30, 20, 30]} fov={50} />
          <OrbitControls 
            enableDamping 
            dampingFactor={0.05} 
            maxPolarAngle={Math.PI / 2.1} 
            minDistance={5}
            maxDistance={100}
          />
          
          {/* Lighting */}
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 20, 10]} intensity={1.5} castShadow />
          <directionalLight 
            position={[-10, 20, -10]} 
            intensity={1} 
          />
          
          <Sky distance={450000} sunPosition={[0, 1, 0]} inclination={0} azimuth={0.25} />
          <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

          {/* Floor / Ground */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
            <planeGeometry args={[200, 200]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
          <gridHelper args={[200, 50, "#334155", "#1e293b"]} />

          {/* Warehouse Structure & Racks */}
          <group position={[-50, 0, -30]}>
            {zones.map((zone, zIdx) => (
              <group key={zone} position={[zIdx * ZONE_SPACING, 0, 0]}>
                {/* Zone Label */}
                <Text
                  position={[5, 10, -5]}
                  fontSize={2}
                  color="#fbbf24"
                  anchorX="center"
                  anchorY="middle"
                  fontWeight="black"
                >
                  ZONE {zone}
                </Text>

                {/* Main Road Representation (Visual line/divider) */}
                {zIdx > 0 && (
                  <Box args={[ZONE_SPACING - 15, 0.01, 100]} position={[-ZONE_SPACING/2, 0.02, 50]}>
                    <meshStandardMaterial color="#0f172a" />
                  </Box>
                )}

                {/* Aisles in this Zone */}
                {Array.from({ length: AISLE_COUNT_PER_ZONE }).map((_, aIdx) => (
                  <group key={aIdx} position={[aIdx * 4, 0, 0]}>
                    {/* Aisle Path / Road */}
                    <Box args={[1, 0.05, 40]} position={[0, 0.01, 20]}>
                      <meshStandardMaterial color="#334155" />
                    </Box>
                    <Text
                      position={[0, 0.2, -2]}
                      fontSize={0.5}
                      color="white"
                    >
                      A{aIdx + 1}
                    </Text>

                    {/* Racks in this Aisle */}
                    {Array.from({ length: RACK_COUNT_PER_AISLE }).map((_, rIdx) => (
                      <Rack3D 
                        key={rIdx}
                        aisleIndex={aIdx}
                        rackIndex={rIdx}
                        zone={zone}
                        locations={warehouseLocations}
                        products={products}
                        onLocationClick={onLocationSelect}
                        highlightedLocationId={
                          warehouseLocations.find(l => l.positionCode === highlightedPosition)?.id
                        }
                      />
                    ))}
                  </group>
                ))}
              </group>
            ))}
          </group>

          <ContactShadows position={[0, 0, 0]} opacity={0.5} scale={100} blur={2.5} far={10} />
        </Suspense>
      </Canvas>

      {/* UI Overlays */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 z-10 pointer-events-none">
        <div className="bg-slate-950/80 backdrop-blur-md p-4 rounded-xl border border-slate-700 shadow-xl pointer-events-auto">
          <h3 className="text-white font-black flex items-center gap-2 mb-2">
            <MapIcon className="h-4 w-4 text-primary" />
            نظام العرض ثلاثي الأبعاد / 3D Viewer
          </h3>
          <div className="space-y-2 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
              <span>موقع فارغ / Empty</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-orange-500 rounded-sm"></div>
              <span>موقع مشغول / Occupied</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded-sm"></div>
              <span>الموقع المحدد / Selected</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-950/80 backdrop-blur-md p-3 rounded-xl border border-slate-700 shadow-xl pointer-events-auto">
          <p className="text-[10px] text-slate-400 font-bold mb-2 uppercase tracking-widest">توجيهات التحكم / Controls</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-slate-300 italic">
            <span>دوران / Rotate:</span> <span className="text-primary font-bold">Left Click</span>
            <span>تحريك / Pan:</span> <span className="text-primary font-bold">Right Click</span>
            <span>تقريب / Zoom:</span> <span className="text-primary font-bold">Scroll</span>
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 right-4 z-10">
        <Badge variant="outline" className="bg-slate-950/80 border-primary text-primary px-3 py-1 font-black shadow-lg backdrop-blur-sm">
          {selectedWarehouse} - View Active
        </Badge>
      </div>

      {/* Legend Tooltip */}
      <div className="absolute top-4 right-4 z-10">
        <button 
          className="p-2 bg-slate-950/80 rounded-full border border-slate-700 text-slate-400 hover:text-white transition-colors"
          title="Reset Camera"
          onClick={() => window.location.reload()} // Quick hack to reset camera, can be improved with refs
        >
          <RotateCcw className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
