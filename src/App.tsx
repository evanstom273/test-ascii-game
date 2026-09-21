import { Canvas } from '@react-three/fiber'
import { Suspense, useRef } from 'react'
import * as THREE from 'three'
import GameWorld from './game/GameWorld'

type ControlName = 'forward' | 'back' | 'left' | 'right' | 'sprint'

function sendControl(name: ControlName, active: boolean) {
  window.dispatchEvent(new CustomEvent('game-control', { detail: { name, active } }))
}

function HoldButton({
  name,
  children,
}: {
  name: ControlName
  children: React.ReactNode
}) {
  return (
    <button
      className="game-button"
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        sendControl(name, true)
      }}
      onPointerUp={(event) => {
        event.preventDefault()
        event.stopPropagation()
        sendControl(name, false)
      }}
      onPointerCancel={(event) => {
        event.preventDefault()
        event.stopPropagation()
        sendControl(name, false)
      }}
      onPointerLeave={() => sendControl(name, false)}
      aria-label={name}
    >
      {children}
    </button>
  )
}

export default function App() {
  const lookPointer = useRef<number | null>(null)
  const lastX = useRef(0)
  const lastY = useRef(0)

  return (
    <main
      className="relative h-full w-full bg-slate-950"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse') return
        if (event.clientX < window.innerWidth * 0.42) return

        event.preventDefault()
        lookPointer.current = event.pointerId
        lastX.current = event.clientX
        lastY.current = event.clientY
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (lookPointer.current !== event.pointerId) return
        event.preventDefault()
        const dx = event.clientX - lastX.current
        const dy = event.clientY - lastY.current
        lastX.current = event.clientX
        lastY.current = event.clientY
        window.dispatchEvent(new CustomEvent('game-look', { detail: { dx, dy } }))
      }}
      onPointerUp={(event) => {
        if (lookPointer.current === event.pointerId) lookPointer.current = null
      }}
      onPointerCancel={() => {
        lookPointer.current = null
      }}
    >
      <Canvas
        camera={{ fov: 70, near: 0.3, far: 180, position: [0, 2.4, 8] }}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
        }}
        dpr={[1, 1.5]}
      >
        <Suspense fallback={null}>
          <GameWorld />
        </Suspense>
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between gap-4 p-3 text-[11px] sm:text-xs">
        <div className="rounded-xl border border-white/15 bg-black/35 px-3 py-2 backdrop-blur-sm">
          <div className="font-semibold tracking-wider">ASCII 3D // PROTOTYPE 02</div>
          <div className="mt-1 text-amber-200/90">BUILD {import.meta.env.VITE_BUILD_SHA}</div>
          <div className="mt-1 text-white/70">WASD · mouse look · Shift sprint</div>
          <div className="text-white/70">Touch: left pad · drag right side to look</div>
        </div>
      </div>

      <div className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2">
        <span className="absolute left-0 top-1/2 h-px w-4 bg-white/70" />
        <span className="absolute left-1/2 top-0 h-4 w-px bg-white/70" />
      </div>

      <div className="touch-controls absolute bottom-5 left-4 grid grid-cols-3 gap-1">
        <div />
        <HoldButton name="forward">▲</HoldButton>
        <div />
        <HoldButton name="left">◀</HoldButton>
        <HoldButton name="back">▼</HoldButton>
        <HoldButton name="right">▶</HoldButton>
      </div>

      <div className="touch-controls absolute bottom-5 right-4">
        <HoldButton name="sprint">RUN</HoldButton>
      </div>
    </main>
  )
}
