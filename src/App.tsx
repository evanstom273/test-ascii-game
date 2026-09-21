import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useRef, useState } from 'react'
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

type DialogueState = {
  index: number
  name: string
  greeting: string
  options: string[]
  response?: string
}

type InteractionTarget = {
  index: number
  name: string
}


const portraitPalette: Record<string, { skin: string; hair: string; shirt: string; accent: string }> = {
  Mara: { skin: '#c99772', hair: '#3a281f', shirt: '#6f497f', accent: '#b293c7' },
  Elias: { skin: '#b97f5d', hair: '#171717', shirt: '#496b7a', accent: '#9b835e' },
  Nora: { skin: '#d3a27c', hair: '#6a4a2f', shirt: '#785349', accent: '#c4a37e' },
  Tomas: { skin: '#c08d69', hair: '#4b3324', shirt: '#6c6a42', accent: '#7c6840' },
  Iris: { skin: '#d0a17c', hair: '#2a211c', shirt: '#4d5d82', accent: '#91a1c5' },
}

function PixelPortrait({ name }: { name: string }) {
  const palette = portraitPalette[name] ?? portraitPalette.Nora
  return (
    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-amber-200/20 bg-[#26313c] shadow-inner">
      <div className="absolute inset-x-0 bottom-0 h-7" style={{ background: palette.shirt }} />
      <div className="absolute bottom-5 left-1/2 h-8 w-11 -translate-x-1/2 rounded-t-[12px]" style={{ background: palette.shirt }} />
      <div className="absolute left-1/2 top-4 h-10 w-9 -translate-x-1/2 rounded-[8px_8px_6px_6px]" style={{ background: palette.skin }} />
      <div className="absolute left-1/2 top-2 h-5 w-11 -translate-x-1/2 rounded-t-xl" style={{ background: palette.hair }} />
      <div className="absolute left-[22px] top-[34px] h-1.5 w-1.5 bg-[#252329]" />
      <div className="absolute right-[22px] top-[34px] h-1.5 w-1.5 bg-[#252329]" />
      <div className="absolute left-1/2 top-[44px] h-1.5 w-3 -translate-x-1/2" style={{ background: palette.accent }} />
      <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.08)_50%)] bg-[length:100%_4px] opacity-40" />
    </div>
  )
}

const dialogueResponses = [
  'There is more to this place than the village. Follow the paths and you will find it.',
  'People have stories about that. Most of them get stranger every time they are told.',
  'Fair enough. Safe travels.',
]

export default function App() {
  const lookPointer = useRef<number | null>(null)
  const [dialogue, setDialogue] = useState<DialogueState | null>(null)
  const [interactionTarget, setInteractionTarget] = useState<InteractionTarget | null>(null)
  const lastX = useRef(0)
  const lastY = useRef(0)

  useEffect(() => {
    const openDialogue = (event: Event) => {
      const detail = (event as CustomEvent<DialogueState>).detail
      setDialogue({ ...detail })
      lookPointer.current = null
    }

    const updateInteractionTarget = (event: Event) => {
      const detail = (event as CustomEvent<InteractionTarget | null>).detail
      setInteractionTarget(detail)
    }

    window.addEventListener('game-npc-dialogue', openDialogue)
    window.addEventListener('game-interact-target', updateInteractionTarget)
    return () => {
      window.removeEventListener('game-npc-dialogue', openDialogue)
      window.removeEventListener('game-interact-target', updateInteractionTarget)
    }
  }, [])

  const closeDialogue = () => {
    setDialogue(null)
    window.dispatchEvent(new CustomEvent('game-end-dialogue'))
  }

  return (
    <main
      className="relative h-full w-full bg-slate-950"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (dialogue) return
        if (event.pointerType === 'mouse') return
        if (event.clientX < window.innerWidth * 0.42) return

        event.preventDefault()
        lookPointer.current = event.pointerId
        lastX.current = event.clientX
        lastY.current = event.clientY
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (dialogue) return
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

      <div className="game-vignette pointer-events-none absolute inset-0 z-[1]" />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-between gap-4 p-3 text-[11px] sm:text-xs">
        <div className="rounded-xl border border-white/15 bg-black/35 px-3 py-2 backdrop-blur-sm">
          <div className="font-semibold tracking-wider">ASCII 3D // PROTOTYPE 02</div>
          <div className="mt-1 text-amber-200/90">BUILD {import.meta.env.VITE_BUILD_SHA}</div>
          <div className="mt-1 text-white/70">WASD · mouse look · Shift sprint · E interact</div>
          <div className="text-white/70">Touch: left pad · drag right side to look</div>
        </div>
      </div>

      <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-center">
        <div className="relative mx-auto h-4 w-4">
          <span className={`absolute left-0 top-1/2 h-px w-4 ${interactionTarget ? 'bg-amber-300' : 'bg-white/70'}`} />
          <span className={`absolute left-1/2 top-0 h-4 w-px ${interactionTarget ? 'bg-amber-300' : 'bg-white/70'}`} />
        </div>
        {interactionTarget && !dialogue && (
          <div className="mt-2 whitespace-nowrap rounded-md bg-black/55 px-2 py-1 text-[10px] text-amber-100 backdrop-blur-sm">
            {interactionTarget.name} · INTERACT
          </div>
        )}
      </div>

      {!dialogue && <div className="touch-controls absolute bottom-5 left-4 grid grid-cols-3 gap-1">
        <div />
        <HoldButton name="forward">▲</HoldButton>
        <div />
        <HoldButton name="left">◀</HoldButton>
        <HoldButton name="back">▼</HoldButton>
        <HoldButton name="right">▶</HoldButton>
      </div>}

      {!dialogue && (
        <div className="absolute bottom-5 right-4 flex items-end gap-2">
          {interactionTarget && (
            <button
              className="touch-controls flex h-16 min-w-20 items-center justify-center rounded-2xl border border-amber-200/35 bg-amber-400/20 px-4 text-sm font-semibold text-amber-50 shadow-lg backdrop-blur-sm"
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                window.dispatchEvent(new CustomEvent('game-interact'))
              }}
            >
              INTERACT
            </button>
          )}
          <div className="touch-controls">
            <HoldButton name="sprint">RUN</HoldButton>
          </div>
        </div>
      )}

      {dialogue && (
        <div
          className="absolute inset-x-3 bottom-3 z-20 mx-auto max-w-2xl rounded-2xl border border-amber-100/15 bg-[#10141b]/96 p-4 shadow-2xl backdrop-blur-md"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="mb-4 flex items-start gap-3">
            <PixelPortrait name={dialogue.name} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-amber-200/80">Conversation</div>
                  <div className="text-xl font-semibold text-white">{dialogue.name}</div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-white/40">Village resident</div>
                </div>
                <button
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10"
                  onClick={closeDialogue}
                >
                  Exit
                </button>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/85">
                {dialogue.response ?? dialogue.greeting}
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            {dialogue.options.map((option, index) => (
              <button
                key={option}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-left text-sm text-white transition hover:bg-white/10 active:bg-white/15"
                onClick={() =>
                  setDialogue((current) =>
                    current
                      ? { ...current, response: dialogueResponses[index] ?? 'They nod quietly.' }
                      : current,
                  )
                }
              >
                {index + 1}. {option}
              </button>
            ))}
          </div>
        </div>
      )}
    </main>
  )
}
