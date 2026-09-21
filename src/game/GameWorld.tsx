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

type BuildingData = {
  position: readonly [number, number, number]
  size: readonly [number, number, number]
  color: string
}

const controls: Controls = {
  forward: false,
  back: false,
  left: false,
  right: false,
  sprint: false,
}

const PLAYER_RADIUS = 0.38
const WORLD_LIMIT = 18.5
const TREE_RADIUS = 0.72

const buildings: BuildingData[] = [
  { position: [-7, 1.5, -8], size: [4, 3, 4], color: '#815c42' },
  { position: [5, 2, -10], size: [5, 4, 4], color: '#425b73' },
  { position: [9, 1.25, 2], size: [3.5, 2.5, 5], color: '#6c493c' },
  { position: [-10, 1.75, 5], size: [5, 3.5, 3.5], color: '#536548' },
]

const treePositions = [
  [-3, -5], [1, -7], [8, -6], [-11, -3], [12, -2],
  [-6, 4], [3, 5], [7, 7], [-12, 9], [13, 10],
] as const

function collidesWithWorld(x: number, z: number, radius = PLAYER_RADIUS) {
  if (
    x - radius < -WORLD_LIMIT ||
    x + radius > WORLD_LIMIT ||
    z - radius < -WORLD_LIMIT ||
    z + radius > WORLD_LIMIT
  ) {
    return true
  }

  for (const [tx, tz] of treePositions) {
    const dx = x - tx
    const dz = z - tz
    const minDistance = radius + TREE_RADIUS
    if (dx * dx + dz * dz < minDistance * minDistance) return true
  }

  for (const building of buildings) {
    const [bx, , bz] = building.position
    const [sx, , sz] = building.size
    const minX = bx - sx / 2 - radius
    const maxX = bx + sx / 2 + radius
    const minZ = bz - sz / 2 - radius
    const maxZ = bz + sz / 2 + radius

    if (x > minX && x < maxX && z > minZ && z < maxZ) return true
  }

  // Central plinth and lamp post.
  if (x > -1.5 - radius && x < 1.5 + radius && z > -3.5 - radius && z < -0.5 + radius) {
    return true
  }

  return false
}

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

      const nextX = camera.position.x + velocity.current.x
      const nextZ = camera.position.z + velocity.current.z

      // Resolve per axis so the player naturally slides along walls/trees.
      if (!collidesWithWorld(nextX, camera.position.z)) {
        camera.position.x = nextX
      }
      if (!collidesWithWorld(camera.position.x, nextZ)) {
        camera.position.z = nextZ
      }
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

function Building({ position, size, color }: BuildingData) {
  return (
    <group>
      <mesh castShadow receiveShadow position={position}>
        <boxGeometry args={[...size]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      <mesh position={[position[0], position[1], position[2] + size[2] / 2 + 0.011]}>
        <planeGeometry args={[size[0] * 0.34, size[1] * 0.42]} />
        <meshBasicMaterial color="#f5c56f" toneMapped={false} />
      </mesh>
    </group>
  )
}

function WanderingNpc() {
  const root = useRef<THREE.Group>(null)
  const leftArm = useRef<THREE.Mesh>(null)
  const rightArm = useRef<THREE.Mesh>(null)
  const leftLeg = useRef<THREE.Mesh>(null)
  const rightLeg = useRef<THREE.Mesh>(null)

  const heading = useRef(2.4)
  const changeTimer = useRef(1.5)
  const walkTime = useRef(0)

  useFrame((_, delta) => {
    const npc = root.current
    if (!npc) return

    changeTimer.current -= delta
    if (changeTimer.current <= 0) {
      heading.current += THREE.MathUtils.randFloatSpread(1.8)
      changeTimer.current = THREE.MathUtils.randFloat(1.4, 3.8)
    }

    const speed = 1.25
    const dx = Math.sin(heading.current) * speed * delta
    const dz = Math.cos(heading.current) * speed * delta
    const nx = npc.position.x + dx
    const nz = npc.position.z + dz

    if (!collidesWithWorld(nx, nz, 0.34)) {
      npc.position.x = nx
      npc.position.z = nz
    } else {
      heading.current += Math.PI * THREE.MathUtils.randFloat(0.55, 0.95)
      changeTimer.current = 0.4
    }

    npc.rotation.y = heading.current + Math.PI
    walkTime.current += delta * 7
    const swing = Math.sin(walkTime.current) * 0.55

    if (leftArm.current) leftArm.current.rotation.x = swing
    if (rightArm.current) rightArm.current.rotation.x = -swing
    if (leftLeg.current) leftLeg.current.rotation.x = -swing
    if (rightLeg.current) rightLeg.current.rotation.x = swing
  })

  return (
    <group ref={root} position={[5.5, 0, 5.5]}>
      <mesh castShadow position={[0, 1.72, 0]}>
        <boxGeometry args={[0.42, 0.42, 0.42]} />
        <meshStandardMaterial color="#d7ad86" flatShading />
      </mesh>

      <mesh castShadow position={[0, 1.08, 0]}>
        <boxGeometry args={[0.7, 0.85, 0.38]} />
        <meshStandardMaterial color="#7e4fa3" flatShading />
      </mesh>

      <mesh ref={leftArm} castShadow position={[-0.45, 1.12, 0]}>
        <boxGeometry args={[0.18, 0.78, 0.18]} />
        <meshStandardMaterial color="#d7ad86" flatShading />
      </mesh>
      <mesh ref={rightArm} castShadow position={[0.45, 1.12, 0]}>
        <boxGeometry args={[0.18, 0.78, 0.18]} />
        <meshStandardMaterial color="#d7ad86" flatShading />
      </mesh>

      <mesh ref={leftLeg} castShadow position={[-0.19, 0.42, 0]}>
        <boxGeometry args={[0.22, 0.78, 0.25]} />
        <meshStandardMaterial color="#2b3340" flatShading />
      </mesh>
      <mesh ref={rightLeg} castShadow position={[0.19, 0.42, 0]}>
        <boxGeometry args={[0.22, 0.78, 0.25]} />
        <meshStandardMaterial color="#2b3340" flatShading />
      </mesh>
    </group>
  )
}

function DayNight() {
  const sun = useRef<THREE.DirectionalLight>(null)
  const { scene } = useThree()
  const clock = useRef(0.18)
  const night = useMemo(() => new THREE.Color('#050711'), [])
  const day = useMemo(() => new THREE.Color('#78a8d5'), [])
  const sky = useMemo(() => new THREE.Color(), [])

  useFrame((_, delta) => {
    clock.current = (clock.current + delta * 0.012) % 1
    const angle = clock.current * Math.PI * 2 - Math.PI / 2
    const height = Math.sin(angle)
    const daylight = THREE.MathUtils.clamp((height + 0.18) / 0.9, 0.05, 1)

    if (sun.current) {
      sun.current.position.set(Math.cos(angle) * 22, height * 24, Math.sin(angle) * 15)
      sun.current.intensity = 0.25 + daylight * 2
      sun.current.color.set(daylight > 0.45 ? '#fff1cf' : '#ff9b70')
    }

    sky.copy(night).lerp(day, daylight)
    scene.background = sky
    scene.fog = new THREE.Fog(sky, 14, 52)
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
      <WanderingNpc />

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
