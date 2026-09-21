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
  roof: string
}

type NpcData = {
  start: readonly [number, number]
  shirt: string
  trousers: string
  skin: string
  hair: string
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
  { position: [-7, 1.5, -8], size: [4, 3, 4], color: '#876147', roof: '#44352f' },
  { position: [5, 2, -10], size: [5, 4, 4], color: '#536879', roof: '#343943' },
  { position: [9, 1.25, 2], size: [3.5, 2.5, 5], color: '#765044', roof: '#3e322e' },
  { position: [-10, 1.75, 5], size: [5, 3.5, 3.5], color: '#667358', roof: '#343d2f' },
]

const treePositions = [
  [-3, -5], [1, -7], [8, -6], [-11, -3], [12, -2],
  [-6, 4], [3, 5], [7, 7], [-12, 9], [13, 10],
] as const

const rockPositions = [
  [-15, -10], [-5, 9], [10, -12], [14, 5], [-1, 12], [5, -1],
] as const

const npcData: NpcData[] = [
  { start: [5.5, 5.5], shirt: '#6f497f', trousers: '#303842', skin: '#c99772', hair: '#3a281f' },
  { start: [-4, 8], shirt: '#496b7a', trousers: '#373b32', skin: '#b97f5d', hair: '#171717' },
  { start: [11, -4], shirt: '#785349', trousers: '#2f3540', skin: '#d3a27c', hair: '#6a4a2f' },
]

function collidesWithWorld(x: number, z: number, radius = PLAYER_RADIUS) {
  if (
    x - radius < -WORLD_LIMIT ||
    x + radius > WORLD_LIMIT ||
    z - radius < -WORLD_LIMIT ||
    z + radius > WORLD_LIMIT
  ) return true

  for (const [tx, tz] of treePositions) {
    const dx = x - tx
    const dz = z - tz
    const minDistance = radius + TREE_RADIUS
    if (dx * dx + dz * dz < minDistance * minDistance) return true
  }

  for (const building of buildings) {
    const [bx, , bz] = building.position
    const [sx, , sz] = building.size
    if (
      x > bx - sx / 2 - radius &&
      x < bx + sx / 2 + radius &&
      z > bz - sz / 2 - radius &&
      z < bz + sz / 2 + radius
    ) return true
  }

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

      if (!collidesWithWorld(nextX, camera.position.z)) camera.position.x = nextX
      if (!collidesWithWorld(camera.position.x, nextZ)) camera.position.z = nextZ
    }

    camera.position.y = 1.65
  })

  return null
}

function Tree({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh castShadow position={[0, 1.25, 0]}>
        <cylinderGeometry args={[0.18, 0.28, 2.5, 6]} />
        <meshStandardMaterial color="#5a3f2a" flatShading roughness={1} />
      </mesh>
      <mesh castShadow position={[0, 2.6, 0]}>
        <coneGeometry args={[1.15, 2.1, 7]} />
        <meshStandardMaterial color="#315a37" flatShading roughness={1} />
      </mesh>
      <mesh castShadow position={[0.15, 3.35, -0.05]}>
        <coneGeometry args={[0.8, 1.55, 7]} />
        <meshStandardMaterial color="#3b6940" flatShading roughness={1} />
      </mesh>
    </group>
  )
}

function Building({ position, size, color, roof }: BuildingData) {
  const [x, y, z] = position
  const [sx, sy, sz] = size
  return (
    <group>
      <mesh castShadow receiveShadow position={position}>
        <boxGeometry args={[sx, sy, sz]} />
        <meshStandardMaterial color={color} roughness={0.95} flatShading />
      </mesh>

      <mesh castShadow position={[x, y + sy / 2 + 0.55, z]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[Math.max(sx, sz) * 0.82, 1.35, 4]} />
        <meshStandardMaterial color={roof} roughness={1} flatShading />
      </mesh>

      <mesh position={[x, 1.05, z + sz / 2 + 0.012]}>
        <planeGeometry args={[0.9, 1.8]} />
        <meshStandardMaterial color="#2f251f" roughness={1} />
      </mesh>

      {[-0.28, 0.28].map((offset) => (
        <mesh key={offset} position={[x + sx * offset, y + sy * 0.08, z + sz / 2 + 0.018]}>
          <planeGeometry args={[0.75, 0.92]} />
          <meshBasicMaterial color="#e4bd70" toneMapped={false} />
        </mesh>
      ))}

      <mesh position={[x, 0.12, z + sz / 2 + 0.55]} receiveShadow>
        <boxGeometry args={[1.5, 0.22, 0.75]} />
        <meshStandardMaterial color="#777065" roughness={1} />
      </mesh>
    </group>
  )
}

function makeNpcTexture(data: NpcData) {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 48
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')

  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, 32, 48)

  ctx.fillStyle = '#00000033'
  ctx.fillRect(8, 43, 16, 3)

  ctx.fillStyle = data.trousers
  ctx.fillRect(10, 29, 5, 14)
  ctx.fillRect(17, 29, 5, 14)

  ctx.fillStyle = data.shirt
  ctx.fillRect(8, 17, 16, 14)
  ctx.fillRect(5, 19, 4, 11)
  ctx.fillRect(23, 19, 4, 11)

  ctx.fillStyle = data.skin
  ctx.fillRect(11, 7, 10, 11)
  ctx.fillRect(5, 29, 4, 4)
  ctx.fillRect(23, 29, 4, 4)

  ctx.fillStyle = data.hair
  ctx.fillRect(10, 5, 12, 5)
  ctx.fillRect(9, 7, 3, 5)

  ctx.fillStyle = '#2a211f'
  ctx.fillRect(13, 12, 2, 2)
  ctx.fillRect(18, 12, 2, 2)

  ctx.fillStyle = '#7d4b3d'
  ctx.fillRect(15, 16, 3, 1)

  ctx.fillStyle = '#14171b'
  ctx.fillRect(9, 42, 7, 3)
  ctx.fillRect(17, 42, 7, 3)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  return texture
}

function BillboardNpc({ data, index }: { data: NpcData; index: number }) {
  const sprite = useRef<THREE.Sprite>(null)
  const heading = useRef(0.9 + index * 1.75)
  const changeTimer = useRef(1.2 + index * 0.8)
  const walkTime = useRef(index)
  const texture = useMemo(() => makeNpcTexture(data), [data])

  useEffect(() => () => texture.dispose(), [texture])

  useFrame((_, delta) => {
    const npc = sprite.current
    if (!npc) return

    changeTimer.current -= delta
    if (changeTimer.current <= 0) {
      heading.current += THREE.MathUtils.randFloatSpread(1.4)
      changeTimer.current = THREE.MathUtils.randFloat(1.8, 4.2)
    }

    const speed = 0.85 + index * 0.08
    const dx = Math.sin(heading.current) * speed * delta
    const dz = Math.cos(heading.current) * speed * delta
    const nx = npc.position.x + dx
    const nz = npc.position.z + dz

    if (!collidesWithWorld(nx, nz, 0.28)) {
      npc.position.x = nx
      npc.position.z = nz
    } else {
      heading.current += Math.PI * THREE.MathUtils.randFloat(0.6, 1.05)
      changeTimer.current = 0.35
    }

    walkTime.current += delta * 7
    npc.position.y = 1.18 + Math.abs(Math.sin(walkTime.current)) * 0.035
    npc.material.opacity = 0.96
  })

  return (
    <sprite
      ref={sprite}
      position={[data.start[0], 1.18, data.start[1]]}
      scale={[1.45, 2.2, 1]}
      castShadow
    >
      <spriteMaterial
        map={texture}
        transparent
        alphaTest={0.18}
        depthWrite
        toneMapped={false}
      />
    </sprite>
  )
}

function Rock({ x, z, index }: { x: number; z: number; index: number }) {
  return (
    <mesh
      position={[x, 0.28, z]}
      rotation={[0.15, index * 0.91, -0.08]}
      castShadow
      receiveShadow
    >
      <dodecahedronGeometry args={[0.45 + (index % 3) * 0.12, 0]} />
      <meshStandardMaterial color="#6b6961" roughness={1} flatShading />
    </mesh>
  )
}

function FenceLine() {
  const posts = [-16, -14, -12, -10, -8, -6]
  return (
    <group>
      {posts.map((x) => (
        <mesh key={x} position={[x, 0.65, 14]} castShadow>
          <boxGeometry args={[0.16, 1.3, 0.16]} />
          <meshStandardMaterial color="#65503a" roughness={1} />
        </mesh>
      ))}
      <mesh position={[-11, 0.85, 14]} castShadow>
        <boxGeometry args={[10.2, 0.13, 0.13]} />
        <meshStandardMaterial color="#65503a" roughness={1} />
      </mesh>
      <mesh position={[-11, 0.45, 14]} castShadow>
        <boxGeometry args={[10.2, 0.13, 0.13]} />
        <meshStandardMaterial color="#65503a" roughness={1} />
      </mesh>
    </group>
  )
}

function DayNight() {
  const sun = useRef<THREE.DirectionalLight>(null)
  const { scene } = useThree()
  const clock = useRef(0.18)
  const night = useMemo(() => new THREE.Color('#070914'), [])
  const day = useMemo(() => new THREE.Color('#7898b8'), [])
  const sky = useMemo(() => new THREE.Color(), [])

  useFrame((_, delta) => {
    clock.current = (clock.current + delta * 0.012) % 1
    const angle = clock.current * Math.PI * 2 - Math.PI / 2
    const height = Math.sin(angle)
    const daylight = THREE.MathUtils.clamp((height + 0.18) / 0.9, 0.05, 1)

    if (sun.current) {
      sun.current.position.set(Math.cos(angle) * 22, height * 24, Math.sin(angle) * 15)
      sun.current.intensity = 0.2 + daylight * 2.1
      sun.current.color.set(daylight > 0.45 ? '#fff0cf' : '#d88965')
    }

    sky.copy(night).lerp(day, daylight)
    scene.background = sky
    scene.fog = new THREE.FogExp2(sky, 0.025 + (1 - daylight) * 0.012)
  })

  return (
    <>
      <hemisphereLight args={['#aab7c8', '#30301f', 0.62]} />
      <directionalLight
        ref={sun}
        castShadow
        intensity={2}
        position={[8, 16, 6]}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
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
        <planeGeometry args={[40, 40, 24, 24]} />
        <meshStandardMaterial color="#556048" roughness={1} flatShading />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position={[0, 0.018, 1]} receiveShadow>
        <planeGeometry args={[4.3, 36]} />
        <meshStandardMaterial color="#766f61" roughness={1} />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position={[-2.5, 0.021, -5]} receiveShadow>
        <planeGeometry args={[24, 2.6]} />
        <meshStandardMaterial color="#6d675b" roughness={1} />
      </mesh>

      {buildings.map((building, index) => (
        <Building key={index} {...building} />
      ))}

      {treePositions.map(([x, z], index) => (
        <Tree key={index} x={x} z={z} />
      ))}

      {rockPositions.map(([x, z], index) => (
        <Rock key={index} x={x} z={z} index={index} />
      ))}

      {npcData.map((data, index) => (
        <BillboardNpc key={index} data={data} index={index} />
      ))}

      <FenceLine />

      <mesh position={[0, 0.2, -2]} receiveShadow>
        <boxGeometry args={[3, 0.4, 3]} />
        <meshStandardMaterial color="#777166" roughness={1} flatShading />
      </mesh>

      <mesh position={[0, 1.4, -2.2]} castShadow>
        <cylinderGeometry args={[0.05, 0.08, 2.4, 8]} />
        <meshStandardMaterial color="#252525" roughness={0.8} />
      </mesh>
      <mesh position={[0, 2.55, -2.2]}>
        <boxGeometry args={[0.9, 0.38, 0.12]} />
        <meshBasicMaterial color="#f2d38b" toneMapped={false} />
      </mesh>
      <pointLight position={[0, 2.45, -2.2]} color="#ffd58c" intensity={8} distance={6} decay={2} />
    </>
  )
}
