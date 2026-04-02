"use client"

import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text, Box, Html } from '@react-three/drei'
import * as THREE from 'three'
import { WarehouseLocation, Product } from '@/lib/types'

interface Rack3DProps {
  aisleIndex: number
  rackIndex: number
  zone: string
  locations: WarehouseLocation[]
  products: Product[]
  onLocationClick: (loc: WarehouseLocation) => void
  highlightedLocationId?: string
}

export function Rack3D({ 
  aisleIndex, 
  rackIndex, 
  zone, 
  locations, 
  products, 
  onLocationClick,
  highlightedLocationId 
}: Rack3DProps) {
  const meshRef = useRef<THREE.Group>(null)
  
  // Dimensions
  const rackWidth = 2
  const rackHeight = 4
  const rackDepth = 1.5
  const aisleSpacing = 5
  const rackSpacing = 3

  // Calculated Position
  // X = Aisle, Z = Rack number, Y = 0 (Ground)
  const x = aisleIndex * aisleSpacing
  const z = rackIndex * rackSpacing
  
  // Filter locations for THIS specific rack
  const rackLabel = `R${rackIndex + 1}`
  const aisleLabel = `A${aisleIndex + 1}`
  
  const rackLocations = useMemo(() => {
    return locations.filter(l => 
      l.zone === zone && 
      (l.aisle === aisleLabel || l.aisle === (aisleIndex + 1).toString()) && 
      (l.rack === rackLabel || l.rack === (rackIndex + 1).toString())
    )
  }, [locations, zone, aisleLabel, rackLabel, aisleIndex, rackIndex])

  // Group by Levels
  const levels = ['1', '2', '3'] // Ground, Mid, Top
  const sides = ['R', 'L']

  return (
    <group position={[x, 0, z]} ref={meshRef}>
      {/* Rack Structure (Vertical Pillars) */}
      <Box args={[0.1, rackHeight, 0.1]} position={[-rackWidth/2, rackHeight/2, -rackDepth/2]}>
        <meshStandardMaterial color="#444" />
      </Box>
      <Box args={[0.1, rackHeight, 0.1]} position={[rackWidth/2, rackHeight/2, -rackDepth/2]}>
        <meshStandardMaterial color="#444" />
      </Box>
      <Box args={[0.1, rackHeight, 0.1]} position={[-rackWidth/2, rackHeight/2, rackDepth/2]}>
        <meshStandardMaterial color="#444" />
      </Box>
      <Box args={[0.1, rackHeight, 0.1]} position={[rackWidth/2, rackHeight/2, rackDepth/2]}>
        <meshStandardMaterial color="#444" />
      </Box>

      {/* Horizontal Shelves */}
      {levels.map((level, idx) => (
        <group key={level} position={[0, idx * 1.3 + 0.5, 0]}>
          <Box args={[rackWidth, 0.05, rackDepth]}>
            <meshStandardMaterial color="#888" />
          </Box>
          
          {/* Slots on this level (Left and Right) */}
          {sides.map((side, sIdx) => {
            const sidePos = side === 'R' ? rackWidth/4 : -rackWidth/4
            const loc = rackLocations.find(l => l.level.toString() === level && l.side === side)
            const isSelected = loc?.id === highlightedLocationId
            const hasProducts = loc ? products.some(p => p.warehousePositionCode === loc.positionCode) : false

            return (
              <group key={side} position={[sidePos, 0.3, 0]}>
                {/* Physical Slot Visual */}
                <Box 
                  args={[0.8, 0.5, 1]} 
                  onClick={(e) => {
                    e.stopPropagation()
                    if (loc) onLocationClick(loc)
                  }}
                >
                  <meshStandardMaterial 
                    color={isSelected ? "#3b82f6" : (hasProducts ? "#f97316" : "#22c55e")} 
                    transparent 
                    opacity={isSelected ? 0.9 : 0.4}
                    emissive={isSelected ? "#3b82f6" : "#000"}
                    emissiveIntensity={isSelected ? 0.5 : 0}
                  />
                </Box>
                
                {/* Product Box if exists */}
                {hasProducts && (
                  <Box args={[0.5, 0.4, 0.5]} position={[0, 0, 0]}>
                    <meshStandardMaterial color="#d97706" />
                  </Box>
                )}

                {/* Label (Only show when close or hovered - simplified for now) */}
                <Text
                  position={[0, 0.5, 0.6]}
                  fontSize={0.15}
                  color="black"
                  anchorX="center"
                  anchorY="middle"
                >
                  {level}-{side}
                </Text>
              </group>
            )
          })}
        </group>
      ))}

      {/* Rack Number Label */}
      <Text
        position={[0, rackHeight + 0.5, 0]}
        fontSize={0.5}
        color="#1e293b"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        {rackLabel}
      </Text>
    </group>
  )
}
