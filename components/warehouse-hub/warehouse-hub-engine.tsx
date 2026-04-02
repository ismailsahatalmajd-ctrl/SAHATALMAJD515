"use client"

import React, { Suspense, useMemo } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { 
  OrbitControls, 
  PerspectiveCamera,
  OrthographicCamera,
  Sky, 
  Stars, 
  ContactShadows, 
  Float, 
  Text, 
  Environment,
  PresentationControls
} from '@react-three/drei'
import { 
  WarehouseBuilding,
  WarehouseGridLabels
} from './warehouse-assets'
import { SmartRack } from './smart-rack'
import { DraggableRack } from './draggable-rack'
import { WoodenPallet } from './wooden-pallet'
import { WarehouseLocation, Product } from '@/lib/types'

export type NavDirection = 'forward' | 'backward' | 'left' | 'right' | 'up' | 'down'

export interface ManualRack {
  id: string
  type: 'rack' | 'pallet_1x1' | 'pallet_1x12' | 'wall' | 'door' | 'cold_storage' | 'forklift' | 'pallet_jack' | 'column' | 'window' | 'aisle' | 'zone_reception' | 'zone_shipping' | 'office_desk' | 'locker' | 'safety_barrier' | 'structural_room'
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  zone: string
  aisle: string
  data?: any
}
interface WarehouseHubEngineProps {
  locations: WarehouseLocation[]
  products: Product[]
  activeWarehouse: string
  onLocationSelect: (loc: WarehouseLocation) => void
  highlightedCode?: string
  designMode?: boolean
  floorSize?: { width: number; depth: number }
  manualRacks?: ManualRack[]
  selectedManualRackId?: string | null
  onManualRackSelect?: (id: string | null) => void
  onManualRackUpdate?: (id: string, pos: [number, number, number], rot: [number, number, number], scale: [number, number, number]) => void
  onManualRackUpdateEnd?: () => void
  theme?: 'day' | 'night'
  backgroundColor?: string
  floorColor?: string
  isBlueprintMode?: boolean
}

export interface WarehouseHubEngineRef {
  navigate: (direction: NavDirection) => void
  focusCurrent: () => void
}

const WarehouseHubEngine = React.forwardRef<WarehouseHubEngineRef, WarehouseHubEngineProps>(({
  locations,
  products,
  activeWarehouse,
  onLocationSelect,
  highlightedCode,
  designMode = false,
  floorSize = { width: 500, depth: 500 },
  manualRacks = [],
  selectedManualRackId = null,
  onManualRackSelect,
  onManualRackUpdate,
  onManualRackUpdateEnd,
  theme = 'day',
  backgroundColor = '#f8fafc',
  floorColor = '#f1f5f9',
  isBlueprintMode = false
}, ref) => {
  const controlsRef = React.useRef<any>(null)
  
  React.useImperativeHandle(ref, () => ({
    navigate: (direction: NavDirection) => {
      if (!controlsRef.current) return
      const camera = controlsRef.current.object
      const step = 2 // Smaller step for continuous movement
      
      const forward = new THREE.Vector3()
      camera.getWorldDirection(forward)
      forward.y = 0
      forward.normalize()
      
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0))

      if (direction === 'forward') camera.position.addScaledVector(forward, step)
      if (direction === 'backward') camera.position.addScaledVector(forward, -step)
      if (direction === 'right') camera.position.addScaledVector(right, step)
      if (direction === 'left') camera.position.addScaledVector(right, -step)
      if (direction === 'up') camera.position.y += step
      if (direction === 'down') camera.position.y -= step
      
      // Update the controls target to follow the move
      const targetMove = new THREE.Vector3()
      if (direction === 'forward') targetMove.addScaledVector(forward, step)
      if (direction === 'backward') targetMove.addScaledVector(forward, -step)
      if (direction === 'right') targetMove.addScaledVector(right, step)
      if (direction === 'left') targetMove.addScaledVector(right, -step)
      if (direction === 'up') targetMove.y += step
      if (direction === 'down') targetMove.y -= step
      
      controlsRef.current.target.add(targetMove)
      controlsRef.current.update()
    },
    focusCurrent: () => {
      if (controlsRef.current) {
        controlsRef.current.reset()
      }
    }
  }))
  
  const filteredLocations = useMemo(() => {
    return locations.filter(l => l.warehouse === activeWarehouse)
  }, [locations, activeWarehouse])

  const zones = useMemo(() => {
    const z = new Set(filteredLocations.map(l => l.zone))
    return Array.from(z).sort()
  }, [filteredLocations])

  // Advanced Layout Logic
  // We arrange zones in a grid. Each zone has aisles. Each aisle has 2 rows of racks.
  const ZONE_WIDTH = 30
  const ZONE_DEPTH = 50
  const AISLE_GAP = 6
  const RACK_GAP = 4

  return (
    <Canvas shadows dpr={[1, 2]}>
      {isBlueprintMode ? (
        <OrthographicCamera 
          makeDefault 
          position={[0, 100, 0]} 
          zoom={10} 
          near={0.1} 
          far={1000} 
          rotation={[-Math.PI / 2, 0, 0]}
        />
      ) : (
        <PerspectiveCamera makeDefault position={[40, 30, 40]} fov={40} />
      )}

      <color attach="background" args={[backgroundColor]} />
      
      <OrbitControls 
        ref={controlsRef}
        makeDefault 
        enableDamping 
        dampingFactor={0.05}
        maxPolarAngle={isBlueprintMode ? 0 : Math.PI / 2.1}
        minPolarAngle={isBlueprintMode ? 0 : 0}
        minDistance={5}
        maxDistance={200}
        enableRotate={!isBlueprintMode}
      />

      <Suspense fallback={null}>
        {/* Environment & Atmosphere */}
        <Sky 
          sunPosition={theme === 'day' ? [100, 50, 100] : [100, -20, 100]} 
          turbidity={theme === 'day' ? 0.5 : 10} 
          rayleigh={theme === 'day' ? 0.3 : 2}
        />
        {theme === 'night' && <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />}
        
        <Environment preset="warehouse" background={theme === 'day'} />
        <hemisphereLight intensity={theme === 'day' ? 0.3 : 0.1} groundColor="#000" />
        <ambientLight intensity={theme === 'day' ? 0.5 : 0.2} />
        <pointLight position={[20, 15, 20]} intensity={2} color="#fff" />
        
        {/* Full Warehouse Structure (Matching reference photo) */}
        <WarehouseBuilding 
          width={floorSize.width} 
          depth={floorSize.depth} 
          height={15} 
          showRoof={!designMode}
        />
        <WarehouseGridLabels width={floorSize.width} depth={floorSize.depth} step={10} />
        <gridHelper args={[floorSize.width, floorSize.width / 5, theme === 'day' ? "#cbd5e1" : "#1e293b", theme === 'day' ? "#94a3b8" : "#020617"]} />

        {/* Dynamic Content */}
        {!designMode ? (
          <group position={[0, 0, 0]}>
            {zones.map((zone, zIdx) => {
              const zoneX = zIdx * ZONE_WIDTH
              const zoneLocations = filteredLocations.filter(l => l.zone === zone)
              
              // Get unique aisles in this zone
              const aisles = Array.from(new Set(zoneLocations.map(l => l.aisle))).sort()

              return (
                <group key={zone} position={[zoneX, 0, 0]}>
                  {/* Zone Label on the floor */}
                  <Text
                    position={[5, 0.02, -5]}
                    rotation={[-Math.PI / 2, 0, 0]}
                    fontSize={4}
                    color="#fbbf24"
                    fillOpacity={0.6}
                    fontWeight="black"
                  >
                    ZONE {zone}
                  </Text>

                  {/* Road Marking */}
                  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[5, 0.01, 25]}>
                    <planeGeometry args={[2, 60]} />
                    <meshStandardMaterial color="#1e293b" />
                  </mesh>

                  {aisles.map((aisle, aIdx) => {
                    const aisleZ = aIdx * AISLE_GAP
                    const aisleLocations = zoneLocations.filter(l => l.aisle === aisle)
                    const racks = Array.from(new Set(aisleLocations.map(l => l.rack))).sort()

                    return (
                      <group key={aisle} position={[0, 0, aisleZ]}>
                        {racks.map((rack, rIdx) => {
                          const rackX = rIdx * RACK_GAP
                          const rackLocations = aisleLocations.filter(l => l.rack === rack)
                          
                          return (
                            <SmartRack
                              key={rack}
                              rackId={rack}
                              position={[rackX, 0, 0]}
                              locations={rackLocations}
                              products={products}
                              onSelect={onLocationSelect}
                              highlightedId={rackLocations.find(l => l.positionCode === highlightedCode)?.id}
                            />
                          )
                        })}
                      </group>
                    )
                  })}
                </group>
              )
            })}
          </group>
        ) : (
          <group>
            {manualRacks.map(rack => (
              <DraggableRack
                key={rack.id}
                id={rack.id}
                type={rack.type}
                position={rack.position}
                rotation={rack.rotation}
                scale={rack.scale || [1, 1, 1]}
                isSelected={selectedManualRackId === rack.id}
                onSelect={() => onManualRackSelect?.(rack.id)}
                onUpdate={(pos, rot, sca) => onManualRackUpdate?.(rack.id, pos, rot, sca)}
                onUpdateEnd={() => onManualRackUpdateEnd?.()}
                locations={filteredLocations.filter(l => l.rack === rack.id)}
                products={products}
                snapToGrid={true}
                data={rack.data}
              />
            ))}
          </group>
        )}

        <ContactShadows resolution={1024} scale={200} blur={2} opacity={0.3} far={10} color="#000" />
      </Suspense>
    </Canvas>
  )
})

export default WarehouseHubEngine
