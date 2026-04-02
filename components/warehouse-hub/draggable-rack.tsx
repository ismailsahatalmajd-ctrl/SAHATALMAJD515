"use client"

import React, { useState } from 'react'
import * as THREE from 'three'
import { Box, TransformControls, Text } from '@react-three/drei'
import { SmartRack } from './smart-rack'
import { WoodenPallet } from './wooden-pallet'
import { 
  WarehouseWall, 
  WarehouseDoor, 
  ColdStorageRoom, 
  Forklift, 
  PalletJack,
  ConcreteColumn,
  VentilationWindow,
  WarehouseAisle,
  WarehouseZone,
  OfficeDesk,
  Locker,
  SafetyBarrier,
  StructuralRoom
} from './warehouse-assets'
import { WarehouseLocation, Product } from '@/lib/types'

interface DraggableRackProps {
  id: string
  type?: 'rack' | 'pallet_1x1' | 'pallet_1x12' | 'wall' | 'door' | 'cold_storage' | 'forklift' | 'pallet_jack' | 'column' | 'window' | 'aisle' | 'zone_reception' | 'zone_shipping' | 'office_desk' | 'locker' | 'safety_barrier' | 'structural_room'
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  isSelected: boolean
  onSelect: () => void
  onUpdate: (pos: [number, number, number], rot: [number, number, number], scale: [number, number, number]) => void
  locations: WarehouseLocation[]
  products: Product[]
  snapToGrid: boolean
  onUpdateEnd?: () => void
  data?: any
}

export function DraggableRack({ 
  id, 
  type = 'rack',
  position: initialPosition, 
  rotation: initialRotation, 
  scale: initialScale,
  isSelected, 
  onSelect, 
  onUpdate,
  locations,
  products,
  snapToGrid,
  onUpdateEnd,
  data
}: DraggableRackProps) {
  const groupRef = React.useRef<THREE.Group>(null)

  // Sync to global state only ONCE at the end of drag to prevent lag
  const handleDragEnd = () => {
    if (!groupRef.current) return
    const g = groupRef.current
    const pos: [number, number, number] = [g.position.x, g.position.y, g.position.z]
    const rot: [number, number, number] = [g.rotation.x, g.rotation.y, g.rotation.z]
    const sca: [number, number, number] = [g.scale.x, g.scale.y, g.scale.z]
    
    onUpdate(pos, rot, sca)
    onUpdateEnd?.()
  }

  return (
    <group>
      {isSelected && (
        <TransformControls 
          object={groupRef as any}
          mode="translate" 
          translationSnap={snapToGrid ? 1 : null}
          onMouseUp={handleDragEnd}
        />
      )}

      <group 
        ref={groupRef}
        position={initialPosition} 
        rotation={initialRotation}
        scale={initialScale}
        onClick={(e) => {
          e.stopPropagation()
          onSelect()
        }}
      >
          {renderAsset(type, id, locations, products, data)}
      </group>
    </group>
  )
}

function heightForType(type: string): number {
    switch(type) {
        case 'rack': return 5;
        case 'cold_storage': return 5;
        case 'wall': return 4;
        case 'door': return 3.5;
        case 'forklift': return 3;
        case 'column': return 5;
        case 'locker': return 2;
        default: return 1;
    }
}

function renderAsset(type: string, id: string, locations: any[], products: any[], data: any) {
    switch (type) {
        case 'rack':
            return (
                <group>
                    <SmartRack rackId={id} locations={locations} products={products} onSelect={() => {}} position={[0, 0, 0]} />
                    <Box args={[3, 5, 2]} position={[0, 2.5, 0]}><meshStandardMaterial transparent opacity={0} /></Box>
                </group>
            )
        case 'pallet_1x1':
        case 'pallet_1x12':
            return (
                <group>
                    <WoodenPallet size={type === 'pallet_1x1' ? {width: 1, depth: 1} : {width: 1, depth: 1.2}} />
                    <Box args={[1.2, 0.2, 1.4]} position={[0, 0.1, 0]}><meshStandardMaterial transparent opacity={0} /></Box>
                </group>
            )
        case 'wall':
            return (
                <group>
                    <WarehouseWall />
                    <Box args={[5, 4, 0.5]} position={[0, 2, 0]}><meshStandardMaterial transparent opacity={0} /></Box>
                </group>
            )
        case 'door':
            return (
                <group>
                    <WarehouseDoor />
                    <Box args={[3.5, 4, 1]} position={[0, 2, 0]}><meshStandardMaterial transparent opacity={0} /></Box>
                </group>
            )
        case 'cold_storage':
            return (
                <group>
                    <ColdStorageRoom label={data?.label} />
                    <Box args={[10, 5, 10]} position={[0, 2.5, 0]}><meshStandardMaterial transparent opacity={0} /></Box>
                </group>
            )
        case 'forklift':
            return (
                <group>
                    <Forklift />
                    <Box args={[2, 3, 3]} position={[0, 1.5, 0]}><meshStandardMaterial transparent opacity={0} /></Box>
                </group>
            )
        case 'pallet_jack':
            return (
                <group>
                    <PalletJack />
                    <Box args={[1, 1.5, 2]} position={[0, 0.75, 0]}><meshStandardMaterial transparent opacity={0} /></Box>
                </group>
            )
        case 'column':
            return (
                <group>
                    <ConcreteColumn />
                    <Box args={[1, 5, 1]} position={[0, 2.5, 0]}><meshStandardMaterial transparent opacity={0} /></Box>
                </group>
            )
        case 'window':
            return (
                <group>
                    <VentilationWindow />
                    <Box args={[1.5, 1, 0.5]} position={[0, 3, 0]}><meshStandardMaterial transparent opacity={0} /></Box>
                </group>
            )
        case 'aisle':
            return (
                <group>
                    <WarehouseAisle width={3} length={10} />
                    <Box args={[3, 0.1, 10]} position={[0, 0.05, 0]}><meshStandardMaterial transparent opacity={0} /></Box>
                </group>
            )
        case 'zone_reception':
            return (
                <group>
                    <WarehouseZone width={10} depth={10} color="#3b82f6" label={data?.label || "منطقة استلام / RECEPTION"} />
                    <Box args={[10, 0.1, 10]} position={[0, 0.05, 0]}><meshStandardMaterial transparent opacity={0} /></Box>
                </group>
            )
        case 'zone_shipping':
            return (
                <group>
                    <WarehouseZone width={10} depth={10} color="#ef4444" label={data?.label || "منطقة شحن / SHIPPING"} />
                    <Box args={[10, 0.1, 10]} position={[0, 0.05, 0]}><meshStandardMaterial transparent opacity={0} /></Box>
                </group>
            )
        case 'office_desk':
            return (
                <group>
                    <OfficeDesk />
                    <Box args={[1.5, 0.8, 0.8]} position={[0, 0.4, 0]}><meshStandardMaterial transparent opacity={0} /></Box>
                </group>
            )
        case 'locker':
            return (
                <group>
                    <Locker />
                    <Box args={[0.5, 2, 0.5]} position={[0, 1, 0]}><meshStandardMaterial transparent opacity={0} /></Box>
                </group>
            )
        case 'safety_barrier':
            return (
                <group>
                    <SafetyBarrier />
                    <Box args={[2, 1, 0.2]} position={[0, 0.5, 0]}><meshStandardMaterial transparent opacity={0} /></Box>
                </group>
            )
        case 'structural_room':
            return (
                <group>
                    <StructuralRoom label={data?.label} />
                    <Box args={[1, 1, 1]} position={[0, 0.5, 0]}><meshStandardMaterial transparent opacity={0} /></Box>
                </group>
            )
        default: return null;
    }
}
