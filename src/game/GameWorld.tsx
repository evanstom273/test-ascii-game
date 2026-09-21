import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

type Controls = {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
  sprint: boolean
}

const controls: Controls = {
  forward: false,
  back: false,
  left: false,
  right: false,
  sprint: false,
}

const buildings = [
  { position: [-7, 1.5, -8] as const, size: [4, 3, 4] as const, color: '#815c42' },
  { position: [5, 2, -10] as const, size: [5, 4, 4] as const, color: '#425b73' },
  { position: [9, 1.25, 2] as const, size: [3.5, 2.5, 5] as const, color: '#6c493c' },
  { position: [-10, 1.75, 5] as const, size: [5, 3.5, 3.5] as const, color: '#536548' },
]

const treePositions = [
  [-3, -5], [1, -7], [8, -6], [-11, -3], [12, -2],
  [-6, 4], [3, 5], [7, 7], [-12, 9], [13, 10],
] as const

function PlayerController() {
  const { camera, gl } = useThree()
  const yaw = useRef(0)
  const pitch = useRef(0)
  const velocity = useRef(new THREE.Vector3())
  const forward = useMemo(() => new THREE.Vector3(), [])
  const right = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    camera.rotation.order = 'YXZ'

    const onKey = (event: KeyboardEvent, active: boolean) => {
      const key = event.key.toLowerCase()
      if (key === 'w') controls.forward = active
      if (key === 's') controls.back = active
      if (key === 'a') controls.left = active
      if (key === 'd') controls.right = active
      if (key === 'shift') controls.sprint = active
    }

    const down = (event: KeyboardEvent) => onKey(event, true)
    const up = (event: KeyboardEvent) => onKey(event, false)

    const mouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return
      yaw.current -= event.movementX * 0.0024
      pitch.current -= event.movementY * 0.0024
      pitch.current = THREE.MathUtils.clamp(pitch.current, -1.35, 1.35)
    }

    const click = () => {
      if (window.matchMedia('(pointer:fine)').matches && document.pointerLockElement == null) {
        gl.domElement.requestPointerLock?.()
      }
    }

    const customControl = (event: Event) => {
      const detail = (event as CustomEvent<{ name: keyof Controls; active: boolean }>).detail
      controls[detail.name] = detail.active
    }

    const customLook = (event: Event) => {
      const { dx, dy } = (event as CustomEvent<{ dx: number; dy: number }>).detail
      yaw.current -= dx * 0.006
      pitch.current -= dy * 0.004
      pitch.current = THREE.MathUtils.clamp(pitch.current, -1.35, 1.35)
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('mousemove', mouseMove)
    window.addEventListener('game-control', customControl)
    window.addEventListener('game-look', customLook)
    gl.domElement.addEventListener('click', click)

    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('mousemove', mouseMove)
      window.removeEventListener('game-control', customControl)
      window.removeEventListener('game-look', customLook)
      gl.domElement.removeEventListener('click', click)
    }
  }, [camera, gl])

  useFrame((_, delta) => {
    camera.rotation.y = yaw.current
    camera.rotation.x = pitch.current

    const z = Number(controls.back) - Number(controls.forward)
    const x = Number(controls.right) - Number(controls.left)
    const moving = x !== 0 || z !== 0

    forward.set(Math.sin(yaw.current), 0, Math.cos(yaw.current))
    right.set(Math.cos(yaw.current), 0, -Math.sin(yaw.current))

    velocity.current.set(0, 0, 0)

    if (moving) {
      velocity.current
        .addScaledVector(forward, z)
        .addScaledVector(right, x)
        .normalize()
        .multiplyScalar((controls.sprint ? 8 : 4.5) * delta)

      camera.position.add(velocity.current)
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, -17, 17)
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, -17, 17)
    }

    camera.position.y = 1.65
  })

  return null
}

function Tree({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh castShadow position={[0, 1, 0]}>
        <boxGeometry args={[0.38, 2, 0.38]} />
        <meshStandardMaterial color="#543a26" flatShading />
      </mesh>
      <mesh castShadow position={[0, 2.6, 0]}>
        <dodecahedronGeometry args={[1.25, 0]} />
        <meshStandardMaterial color="#355f3d" flatShading />
      </mesh>
    </group>
  )
}

function Building({
  position,
  size,
  color,
}: {
  position: readonly [number, number, number]
  size: readonly [number, number, number]
  color: string
}) {
  return (
    <group>
      <mesh castShadow receiveShadow position={position}>
        <boxGeometry args={[...size]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      <mesh
        position={[position[0], position[1], position[2] + size[2] / 2 + 0.011]}
      >
        <planeGeometry args={[size[0] * 0.34, size[1] * 0.42]} />
        <meshBasicMaterial color="#f5c56f" toneMapped={false} />
      </mesh>
    </group>
  )
}

function DayNight() {
  const sun = useRef<THREE.DirectionalLight>(null)
  const { scene } = useThree()
  const clock = useRef(0.18)

  useFrame((_, delta) => {
    clock.current = (clock.current + delta * 0.012) % 1
    const angle = clock.current * Math.PI * 2 - Math.PI / 2
    const height = Math.sin(angle)
    const daylight = THREE.MathUtils.clamp((height + 0.18) / 0.9, 0.05, 1)

    if (sun.current) {
      sun.current.position.set(Math.cos(angle) * 22, height * 24, Math.sin(angle) * 15)
      sun.current.intensity = 0.25 + daylight * 2.0
      sun.current.color.set(daylight > 0.45 ? '#fff1cf' : '#ff9b70')
    }

    const night = new THREE.Color('#050711')
    const day = new THREE.Color('#78a8d5')
    scene.background = night.clone().lerp(day, daylight)
    scene.fog = new THREE.Fog(scene.background, 14, 52)
  })

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight
        ref={sun}
        castShadow
        intensity={2}
        position={[8, 16, 6]}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
    </>
  )
}

export default function GameWorld() {
  return (
    <>
      <PlayerController />
      <DayNight />

      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[40, 40, 40, 40]} />
        <meshStandardMaterial color="#59664e" flatShading />
      </mesh>

      <gridHelper args={[40, 40, '#9baa86', '#384032']} position={[0, 0.01, 0]} />

      {buildings.map((building, index) => (
        <Building key={index} {...building} />
      ))}

      {treePositions.map(([x, z], index) => (
        <Tree key={index} x={x} z={z} />
      ))}

      <mesh position={[0, 0.2, -2]} receiveShadow>
        <boxGeometry args={[3, 0.4, 3]} />
        <meshStandardMaterial color="#7b7466" flatShading />
      </mesh>

      <mesh position={[0, 1.4, -2.2]} castShadow>
        <boxGeometry args={[0.08, 2.4, 0.08]} />
        <meshStandardMaterial color="#202020" />
      </mesh>
      <mesh position={[0, 2.55, -2.2]}>
        <boxGeometry args={[0.9, 0.38, 0.08]} />
        <meshBasicMaterial color="#f6d98a" toneMapped={false} />
      </mesh>
    </>
  )
}
