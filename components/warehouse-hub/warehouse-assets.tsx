"use client"

import React from 'react'
import { Box, Cylinder, Text } from '@react-three/drei'

// Wall Component
export function WarehouseWall({ length = 5, height = 4, thickness = 0.2, color = "#cbd5e1" }) {
  return (
    <Box args={[length, height, thickness]} position={[0, height / 2, 0]}>
      <meshStandardMaterial color={color} />
    </Box>
  )
}

// Door Component
export function WarehouseDoor({ width = 3, height = 3.5 }) {
  return (
    <group position={[0, height / 2, 0.1]}>
      {/* Outer Frame/Guides */}
      <Box args={[width + 0.4, height + 0.2, 0.4]} position={[0, 0, -0.1]}>
        <meshStandardMaterial color="#334155" />
      </Box>
      {/* Industrial Rolling Shutter Effect */}
      <Box args={[width, height, 0.1]} position={[0, 0, 0]}>
        <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.2} />
      </Box>
      {/* Horizontal Segments for rolling door look */}
      {Array.from({ length: 12 }).map((_, i) => (
        <Box key={i} args={[width - 0.2, 0.05, 0.05]} position={[0, -height / 2 + (i * height / 11), 0.05]}>
          <meshStandardMaterial color="#1e293b" />
        </Box>
      ))}
    </group>
  )
}

// Cold Storage Room (Visual Wrapper)
export function ColdStorageRoom({ width = 10, depth = 10, height = 5, label = "COLD STORAGE" }) {
  return (
    <group>
      {/* Semi-transparent walls to see inside */}
      <Box args={[width, height, depth]} position={[0, height / 2, 0]}>
        <meshStandardMaterial color="#0ea5e9" transparent opacity={0.2} />
      </Box>
      {/* Wired frame */}
      <Box args={[width, height, depth]} position={[0, height / 2, 0]}>
        <meshStandardMaterial color="#38bdf8" wireframe />
      </Box>
      {/* Cooling Unit on top */}
      <Box args={[2, 1, 2]} position={[0, height + 0.5, 0]}>
        <meshStandardMaterial color="#94a3b8" />
      </Box>
      {/* Label */}
      <Text
        position={[0, height + 0.1, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={1}
        color="white"
        fontWeight="bold"
      >
        {label}
      </Text>
    </group>
  )
}

// Forklift Component (Based on image: Orange/Black)
export function Forklift() {
  return (
    <group>
      {/* Body */}
      <Box args={[1.5, 1, 2]} position={[0, 0.6, 0]}>
        <meshStandardMaterial color="#f97316" metalness={0.6} />
      </Box>
      {/* Roof/Cabin */}
      <Box args={[1.2, 1.5, 1.2]} position={[0, 1.8, -0.2]}>
        <meshStandardMaterial color="#1e293b" wireframe />
      </Box>
      {/* Mast */}
      <Box args={[0.1, 3, 1.2]} position={[0, 1.5, 1]}>
        <meshStandardMaterial color="#334155" />
      </Box>
      {/* Forks */}
      <group position={[0, 0.3, 1.5]}>
        <Box args={[0.1, 0.05, 1.2]} position={[-0.4, 0, 0]}>
            <meshStandardMaterial color="#f97316" />
        </Box>
        <Box args={[0.1, 0.05, 1.2]} position={[0.4, 0, 0]}>
            <meshStandardMaterial color="#f97316" />
        </Box>
      </group>
      {/* Wheels */}
      {[[-0.6, 0.8], [0.6, 0.8], [-0.6, -0.8], [0.6, -0.8]].map((pos, i) => (
        <Cylinder key={i} args={[0.3, 0.3, 0.4]} position={[pos[0], 0.3, pos[1]]} rotation={[0, 0, Math.PI / 2]}>
          <meshStandardMaterial color="#000" />
        </Cylinder>
      ))}
    </group>
  )
}

// Pallet Jack (Based on image: Red)
export function PalletJack() {
  return (
    <group>
      {/* Forks */}
      <Box args={[0.15, 0.08, 1.2]} position={[-0.3, 0.1, 0.4]}>
        <meshStandardMaterial color="#dc2626" />
      </Box>
      <Box args={[0.15, 0.08, 1.2]} position={[0.3, 0.1, 0.4]}>
        <meshStandardMaterial color="#dc2626" />
      </Box>
      {/* Base */}
      <Box args={[0.8, 0.4, 0.4]} position={[0, 0.3, -0.2]}>
        <meshStandardMaterial color="#dc2626" />
      </Box>
      {/* Handle */}
      <Box args={[0.05, 1.2, 0.05]} position={[0, 0.8, -0.3]} rotation={[-0.2, 0, 0]}>
        <meshStandardMaterial color="#1e293b" />
      </Box>
      <Box args={[0.3, 0.05, 0.05]} position={[0, 1.4, -0.4]}>
        <meshStandardMaterial color="#1e293b" />
      </Box>
      {/* Small Front Wheels */}
      <Cylinder args={[0.08, 0.08, 0.2]} position={[0.3, 0.08, 0.9]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#334155" />
      </Cylinder>
      <Cylinder args={[0.08, 0.08, 0.2]} position={[-0.3, 0.08, 0.9]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#334155" />
      </Cylinder>
    </group>
  )
}

// Concrete Column
export function ConcreteColumn({ height = 5, thickness = 0.6 }) {
  return (
    <group position={[0, height / 2, 0]}>
      {/* Support Base */}
      <Box args={[thickness * 1.5, 0.4, thickness * 1.5]} position={[0, -height / 2 + 0.2, 0]}>
        <meshStandardMaterial color="#64748b" />
      </Box>
      {/* Main Pillar */}
      <Box args={[thickness, height, thickness]}>
        <meshStandardMaterial color="#94a3b8" />
      </Box>
    </group>
  )
}

// Ventilation Window
export function VentilationWindow({ width = 1.5, height = 1 }) {
  return (
    <group position={[0, 3, 0]}>
      {/* Frame */}
      <Box args={[width + 0.1, height + 0.1, 0.4]}>
        <meshStandardMaterial color="#1e293b" />
      </Box>
      {/* Glass/Blades */}
      <Box args={[width, height, 0.1]}>
        <meshStandardMaterial color="#0ea5e9" transparent opacity={0.6} />
      </Box>
      {/* Blades */}
      {[ -0.3, 0, 0.3 ].map((y, i) => (
        <Box key={i} args={[width, 0.05, 0.2]} position={[0, y, 0.1]} rotation={[0.5, 0, 0]}>
          <meshStandardMaterial color="#475569" />
        </Box>
      ))}
    </group>
  )
}

// Warehouse Aisle / Corridor marking
export function WarehouseAisle({ width = 3, length = 10, color = "#1e293b" }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
      <planeGeometry args={[width, length]} />
      <meshStandardMaterial color={color} transparent opacity={0.6} />
    </mesh>
  )
}

// Colored Functional Zone (Reception, Shipping, etc.)
export function WarehouseZone({ width = 10, depth = 10, color = "#22c55e", label = "ZONE" }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={color} transparent opacity={0.3} />
      </mesh>
      {/* Border */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.007, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={color} wireframe />
      </mesh>
      {/* Label on floor */}
      <Text
        position={[0, 0.01, depth / 2 - 0.5]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={Math.max(0.5, Math.min(width, depth) * 0.15)}
        color={color}
        fontWeight="bold"
        anchorY="bottom"
      >
        {label}
      </Text>
    </group>
  )
}

// Massive industrial roof structure with trusses and lamps
export function IndustrialRoof({ width = 100, depth = 100, height = 15 }) {
  const trusses = 10
  const beams = 10

  return (
    <group position={[0, height, 0]}>
      {/* Ceiling Panels */}
      <Box args={[width, 0.5, depth]} position={[0, 0.25, 0]}>
        <meshStandardMaterial color="#222" metalness={0.8} roughness={0.1} />
      </Box>

      {/* Main Trusses (Width-wise) */}
      {Array.from({ length: 11 }).map((_, i) => (
        <group key={`truss-${i}`} position={[0, -0.5, -depth / 2 + (i * depth / 10)]}>
          <Box args={[width, 0.3, 0.2]}>
            <meshStandardMaterial color="#334155" metalness={1} roughness={0} />
          </Box>
          {/* Triangular supports */}
          {Array.from({ length: 10 }).map((_, j) => (
            <Box 
              key={`support-${j}`} 
              args={[0.2, 1.5, 0.1]} 
              position={[-width / 2 + (j * width / 9), -0.7, 0]} 
              rotation={[0, 0, Math.PI / 4 * (j % 2 === 0 ? 1 : -1)]}
            >
              <meshStandardMaterial color="#475569" />
            </Box>
          ))}
        </group>
      ))}

      {/* Industrial Lamps */}
      {Array.from({ length: 6 }).map((_, i) => (
        Array.from({ length: 6 }).map((_, j) => (
          <group key={`lamp-${i}-${j}`} position={[-width * 0.4 + j * (width * 0.16), -0.6, -depth * 0.4 + i * (depth * 0.16)]}>
             {/* Glowing light source */}
             <Cylinder args={[0.5, 0.5, 0.1]} position={[0, 0, 0]}>
               <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={5} />
             </Cylinder>
             <pointLight intensity={2} distance={60} color="#fff" decay={2} />
          </group>
        ))
      ))}
    </group>
  )
}

// Office Desk
export function OfficeDesk({ color = "#94a3b8" }) {
  return (
    <group position={[0, 0.4, 0]}>
      {/* Top */}
      <Box args={[1.5, 0.05, 0.8]} position={[0, 0.35, 0]}>
        <meshStandardMaterial color={color} />
      </Box>
      {/* Legs */}
      {[[-0.7, 0.35], [0.7, 0.35], [-0.7, -0.35], [0.7, -0.35]].map((pos, i) => (
        <Box key={i} args={[0.05, 0.75, 0.05]} position={[pos[0], -0.025, pos[1]]}>
          <meshStandardMaterial color="#334155" />
        </Box>
      ))}
    </group>
  )
}

// Locker
export function Locker() {
  return (
    <group position={[0, 1, 0]}>
      <Box args={[0.5, 2, 0.5]}>
        <meshStandardMaterial color="#475569" />
      </Box>
      {/* Door detail */}
      <Box args={[0.45, 1.9, 0.05]} position={[0, 0, 0.23]}>
        <meshStandardMaterial color="#334155" />
      </Box>
      {/* Ventilation slits */}
      {[0.8, 0.6, 0.4].map((y, i) => (
        <Box key={i} args={[0.2, 0.02, 0.01]} position={[0, y, 0.26]}>
          <meshStandardMaterial color="#1e293b" />
        </Box>
      ))}
    </group>
  )
}

// Safety Barrier (Yellow)
export function SafetyBarrier({ length = 2 }) {
  return (
    <group position={[0, 0.5, 0]}>
      {/* Top rail */}
      <Cylinder args={[0.05, 0.05, length]} position={[0, 0.4, 0]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#eab308" />
      </Cylinder>
      {/* Mid rail */}
      <Cylinder args={[0.05, 0.05, length]} position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#eab308" />
      </Cylinder>
      {/* Posts */}
      <Cylinder args={[0.06, 0.06, 1]} position={[-length / 2 + 0.1, -0.1, 0]}>
        <meshStandardMaterial color="#eab308" />
      </Cylinder>
      <Cylinder args={[0.06, 0.06, 1]} position={[length / 2 - 0.1, -0.1, 0]}>
        <meshStandardMaterial color="#eab308" />
      </Cylinder>
    </group>
  )
}

// Structural Room / Generic Scalable Box
export function StructuralRoom({ color = "#94a3b8", label = "" }) {
  return (
    <group>
      <Box args={[1, 1, 1]} position={[0, 0.5, 0]}>
        <meshStandardMaterial color={color} transparent opacity={0.4} metalness={0.2} roughness={0.3} />
      </Box>
      <Box args={[1, 1, 1]} position={[0, 0.5, 0]}>
        <meshStandardMaterial color={color} wireframe />
      </Box>
      {/* Label on top */}
      {label && (
        <Text
          position={[0, 1.01, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.4}
          color="#1e293b"
          fontWeight="bold"
        >
          {label}
        </Text>
      )}
    </group>
  )
}

// Coordinate Grid Labels (Numbers on floor)
export function WarehouseGridLabels({ width = 100, depth = 100, step = 10 }) {
  const xCount = Math.floor(width / step)
  const zCount = Math.floor(depth / step)
  
  return (
    <group position={[0, 0.02, 0]}>
      {/* X-Axis Labels */}
      {Array.from({ length: xCount + 1 }).map((_, i) => {
        const x = -width / 2 + i * step
        return (
          <Text
            key={`x-${i}`}
            position={[x, 0, depth / 2 + 2]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={2}
            color="#ef4444" // Red for X
            fontWeight="black"
          >
            X:{x}
          </Text>
        )
      })}
      
      {/* Z-Axis Labels */}
      {Array.from({ length: zCount + 1 }).map((_, i) => {
        const z = -depth / 2 + i * step
        return (
          <Text
            key={`z-${i}`}
            position={[-width / 2 - 4, 0, z]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={2}
            color="#3b82f6" // Blue for Z
            fontWeight="black"
          >
            Z:{z}
          </Text>
        )
      })}

      {/* Origin Marker */}
      <group position={[0, 0.1, 0]}>
         <Box args={[1, 0.2, 1]}>
            <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={2} />
         </Box>
         <Text
            position={[0, 0.5, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={1.5}
            color="#fff"
            fontWeight="black"
         >
            المبدأ - Origin (0,0,0)
         </Text>
      </group>
    </group>
  )
}

// Complete Warehouse Building Structure (Matching user photo reference)
export function WarehouseBuilding({ width = 100, depth = 100, height = 15, showRoof = true }) {
  return (
    <group>
      {/* Floor - Polished Concrete reflective look */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[width + 5, depth + 5]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.1} />
      </mesh>
      
      {/* Structural Walls */}
      {/* Front Wall with Door Cutout (-10 to 10, height 2.5) */}
      <group position={[0, 0, -depth / 2]}>
        {/* Left piece */}
        <group position={[(-width / 2 + (-10)) / 2, 0, 0]}>
          <WarehouseWall length={width / 2 - 10} height={height} />
        </group>
        {/* Right piece */}
        <group position={[(width / 2 + 10) / 2, 0, 0]}>
          <WarehouseWall length={width / 2 - 10} height={height} />
        </group>
        {/* Top piece (above door) */}
        <group position={[0, height / 2 + 2.5 / 2, 0]}>
          <WarehouseWall length={20} height={height - 2.5} />
        </group>
        {/* The Door itself */}
        <WarehouseDoor width={20} height={2.5} />
      </group>

      <group position={[0, 0, depth / 2]}>
        <WarehouseWall length={width} height={height} />
      </group>
      <group position={[-width / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <WarehouseWall length={depth} height={height} />
      </group>
      <group position={[width / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <WarehouseWall length={depth} height={height} />
      </group>

      {/* Massive Roof */}
      {showRoof && <IndustrialRoof width={width} depth={depth} height={height} />}
    </group>
  )
}
