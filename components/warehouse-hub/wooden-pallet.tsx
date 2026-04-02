"use client"

import React from 'react'
import { Box } from '@react-three/drei'

interface WoodenPalletProps {
  size: { width: number; depth: number }
  position?: [number, number, number]
  rotation?: [number, number, number]
}

export function WoodenPallet({ size, position = [0, 0, 0], rotation = [0, 0, 0] }: WoodenPalletProps) {
  const woodColor = "#d69e5e"
  const darkWood = "#c08457"
  
  // A standard pallet usually has 3 bottom boards, 3 stringers (blocks), and 5-7 top boards
  // We'll scale them based on the input size
  
  const slatThickness = 0.05
  const stringerHeight = 0.1
  const totalHeight = stringerHeight + (slatThickness * 2)

  return (
    <group position={position} rotation={rotation}>
      {/* Bottom Slats (3 boards) */}
      {[0, 1, 2].map((i) => (
        <Box 
          key={`bottom-${i}`} 
          args={[size.width, slatThickness, 0.1]} 
          position={[0, slatThickness / 2, (i - 1) * (size.depth / 2.2)]}
        >
          <meshStandardMaterial color={darkWood} roughness={1} />
        </Box>
      ))}

      {/* Stringers / Blocks (Middle support) */}
      {[-1, 0, 1].map((x) => (
        [-1, 0, 1].map((z) => (
          <Box 
            key={`block-${x}-${z}`} 
            args={[0.1, stringerHeight, 0.1]} 
            position={[x * (size.width / 2.2), stringerHeight / 2 + slatThickness, z * (size.depth / 2.2)]}
          >
            <meshStandardMaterial color={darkWood} roughness={1} />
          </Box>
        ))
      ))}

      {/* Top Slats (5 boards) */}
      {[-2, -1, 0, 1, 2].map((i) => (
        <Box 
          key={`top-${i}`} 
          args={[0.12, slatThickness, size.depth]} 
          position={[i * (size.width / 4.5), totalHeight - (slatThickness / 2), 0]}
        >
          <meshStandardMaterial color={woodColor} roughness={1} />
        </Box>
      ))}
    </group>
  )
}
