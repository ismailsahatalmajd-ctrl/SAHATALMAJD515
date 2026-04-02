"use client"

import React, { useRef, useState } from 'react'
import { Box, Text, Image } from '@react-three/drei'
import * as THREE from 'three'
import { WarehouseLocation, Product } from '@/lib/types'

interface RackSlotProps {
  location: WarehouseLocation
  products: Product[]
  onSelect: (loc: WarehouseLocation) => void
  isHighlighted?: boolean
}

// Custom Safe Image component that shows a placeholder immediately to avoid empty boxes
function SafeImage({ url, scale }: { url: string; scale: [number, number] }) {
  const placeholder = 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?q=80&w=200&auto=format&fit=crop'
  const [validUrl, setValidUrl] = useState<string>(placeholder)
  
  React.useEffect(() => {
    if (!url || url === 'DB_IMAGE') {
      setValidUrl(placeholder)
      return
    }

    // Attempt to verify the image background to avoid scene crashes
    const img = new window.Image()
    img.crossOrigin = "anonymous"
    img.onload = () => setValidUrl(url)
    img.onerror = () => {
      console.warn(`Failed 3D asset image: ${url}. Staying on placeholder.`)
      setValidUrl(placeholder)
    }
    img.src = url
  }, [url])

  return (
    <Image 
      url={validUrl} 
      scale={scale}
      transparent
    />
  )
}

export function RackSlot({ 
  location, 
  products, 
  onSelect, 
  isHighlighted 
}: RackSlotProps) {
  const [hovered, setHover] = useState(false)
  
  // Calculate vertical position based on level
  // Level 1: 0.5, Level 2: 1.8, Level 3: 3.1
  const levelMap: Record<string, number> = { '1': 0.5, '2': 1.8, '3': 3.1, 'ground': 0.5, 'middle': 1.8, 'top': 3.1 }
  const yPos = levelMap[location.level.toString()] || 0.5
  
  // Side: Left or Right
  const side = (location.side || 'L').toLowerCase()
  const xPos = side === 'right' || side === 'r' ? 0.6 : -0.6
  
  const locProducts = products.filter(p => p.warehousePositionCode === location.positionCode)
  const isOccupied = locProducts.length > 0

  return (
    <group position={[xPos, yPos, 0]}>
      {/* Slot Frame */}
      <Box 
        args={[1.1, 0.8, 1.2]} 
        onPointerOver={() => setHover(true)}
        onPointerOut={() => setHover(false)}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(location)
        }}
      >
        <meshStandardMaterial 
          color={isHighlighted ? "#3b82f6" : (isOccupied ? "#f97316" : "#10b981")} 
          transparent 
          opacity={hovered ? 0.8 : 0.4}
          emissive={isHighlighted ? "#60a5fa" : "#000"}
          emissiveIntensity={0.5}
        />
      </Box>

      {/* Product Visualization */}
      {isOccupied && (
        <group>
          {/* Main Box */}
          <Box args={[0.7, 0.6, 0.8]}>
            <meshStandardMaterial 
              color={isHighlighted ? "#fbbf24" : "#d97706"} 
              roughness={0.3} 
              metalness={0.2} 
              emissive={isHighlighted ? "#fbbf24" : "#000"}
              emissiveIntensity={isHighlighted ? 0.5 : 0}
            />
          </Box>
          
          {/* Label on Front face (Backup if image is missing) */}
          <Text
            position={[0, -0.2, 0.42]}
            fontSize={0.06}
            color="white"
            maxWidth={0.6}
            textAlign="center"
            fontWeight="bold"
            outlineWidth={0.01}
            outlineColor="black"
          >
            {locProducts[0].productName.substring(0, 15)}
          </Text>

          {/* Product Image on Box front */}
          {locProducts[0].image && (
            <group position={[0, 0.1, 0.41]}>
              <SafeImage 
                url={locProducts[0].image} 
                scale={[0.4, 0.35]}
              />
            </group>
          )}

          {/* Label on Top of Box */}
          <Text
            position={[0, 0.31, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.08}
            color="white"
            maxWidth={0.6}
            textAlign="center"
            fontWeight="bold"
          >
            {locProducts[0].productName.substring(0, 15)}
          </Text>
        </group>
      )}

      {/* Location Label (Only on front) */}
      <Text
        position={[0, -0.5, 0.61]}
        fontSize={0.12}
        color="#94a3b8"
        fontWeight="bold"
      >
        {location.level}-{location.side}
      </Text>
    </group>
  )
}

interface SmartRackProps {
  rackId: string
  locations: WarehouseLocation[]
  products: Product[]
  onSelect: (loc: WarehouseLocation) => void
  highlightedId?: string
  position: [number, number, number]
}

export function SmartRack({ rackId, locations, products, onSelect, highlightedId, position }: SmartRackProps) {
  return (
    <group position={position}>
      {/* Vertical Support Pillars (Industrial Blue) */}
      <Box args={[0.1, 4.5, 0.1]} position={[-1.2, 2.25, -0.6]}><meshStandardMaterial color="#1d4ed8" metalness={0.8} roughness={0.2} /></Box>
      <Box args={[0.1, 4.5, 0.1]} position={[1.2, 2.25, -0.6]}><meshStandardMaterial color="#1d4ed8" metalness={0.8} roughness={0.2} /></Box>
      <Box args={[0.1, 4.5, 0.1]} position={[-1.2, 2.25, 0.6]}><meshStandardMaterial color="#1d4ed8" metalness={0.8} roughness={0.2} /></Box>
      <Box args={[0.1, 4.5, 0.1]} position={[1.2, 2.25, 0.6]}><meshStandardMaterial color="#1d4ed8" metalness={0.8} roughness={0.2} /></Box>

      {/* Diagonal Support Braces (Blue) */}
      <Box args={[0.02, 1.5, 0.02]} position={[-1.2, 1, 0]} rotation={[0.4, 0, 0]}><meshStandardMaterial color="#1e40af" /></Box>
      <Box args={[0.1, 1.5, 0.02]} position={[1.2, 1, 0]} rotation={[-0.4, 0, 0]}><meshStandardMaterial color="#1e40af" /></Box>

      {/* Horizontal Shelves (Safety Orange) */}
      {[0.1, 1.4, 2.7, 4.0].map((y, i) => (
        <group key={i} position={[0, y, 0]}>
          <Box args={[2.5, 0.08, 1.3]}>
            <meshStandardMaterial color="#f97316" metalness={0.5} roughness={0.4} />
          </Box>
          {/* Front Edge Highlight */}
          <Box args={[2.5, 0.12, 0.05]} position={[0, -0.04, 0.63]}>
            <meshStandardMaterial color="#ea580c" metalness={0.7} />
          </Box>
        </group>
      ))}

      {/* Locations in this rack */}
      {locations.map(loc => (
        <RackSlot 
          key={loc.id} 
          location={loc} 
          products={products} 
          onSelect={onSelect}
          isHighlighted={loc.id === highlightedId}
        />
      ))}

      {/* Rack Title */}
      <Text
        position={[0, 5, 0]}
        fontSize={0.4}
        color="#f97316"
        fontWeight="black"
        anchorX="center"
      >
        RACK {rackId}
      </Text>
    </group>
  )
}
