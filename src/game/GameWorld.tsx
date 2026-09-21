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
  position: readonly [number, number]
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
const WORLD_LIMIT = 58
const TREE_RADIUS = 0.72
const WORLD_SIZE = 120

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function terrainHeight(x: number, z: number) {
  const r = Math.hypot(x, z)
  const villageBlend = smoothstep(13, 24, r)

  let h =
    Math.sin(x * 0.075) * 0.8 +
    Math.cos(z * 0.062) * 0.7 +
    Math.sin((x + z) * 0.035) * 0.65

  const eastHill = Math.exp(-(((x - 36) ** 2) + ((z + 30) ** 2)) / 520) * 7.5
  const westRise = Math.exp(-(((x + 43) ** 2) + ((z - 23) ** 2)) / 700) * 5
  const marshDip = Math.exp(-(((x - 31) ** 2) + ((z - 30) ** 2)) / 230) * -2.9

  h += eastHill + westRise + marshDip
  return h * villageBlend
}

const buildings: BuildingData[] = [
  { position: [-7, -8], size: [4, 3, 4], color: '#876147', roof: '#44352f' },
  { position: [5, -10], size: [5, 4, 4], color: '#536879', roof: '#343943' },
  { position: [9, 2], size: [3.5, 2.5, 5], color: '#765044', roof: '#3e322e' },
  { position: [-10, 5], size: [5, 3.5, 3.5], color: '#667358', roof: '#343d2f' },
  { position: [14, -9], size: [4, 3, 4.5], color: '#79624d', roof: '#40332d' },
  { position: [-15, -8], size: [4.5, 3.2, 4], color: '#5f6d76', roof: '#343b40' },
  { position: [15, 10], size: [4.2, 3.2, 4.2], color: '#80604b', roof: '#44352f' },
  { position: [-13, 14], size: [4.8, 3.7, 4.2], color: '#666f52', roof: '#343b30' },
  { position: [38, -31], size: [5, 4.5, 5], color: '#635b55', roof: '#35312f' },
  { position: [-42, 24], size: [5.5, 3.5, 4.5], color: '#756a5e', roof: '#3b3530' },
]

function seeded(seed: number) {
  const n = Math.sin(seed * 12.9898) * 43758.5453
  return n - Math.floor(n)
}

const treePositions: [number, number][] = []
for (let i = 0; i < 120; i += 1) {
  const x = -54 + seeded(i + 10) * 108
  const z = -54 + seeded(i + 90) * 108
  if (Math.hypot(x, z) < 18) continue
  if (Math.hypot(x - 31, z - 30) < 9) continue
  if (buildings.some((b) => Math.abs(x - b.position[0]) < 4 && Math.abs(z - b.position[1]) < 4)) continue
  treePositions.push([x, z])
}

const rockPositions: [number, number][] = []
for (let i = 0; i < 34; i += 1) {
  const x = -53 + seeded(i + 220) * 106
  const z = -53 + seeded(i + 330) * 106
  if (Math.hypot(x, z) < 10) continue
  rockPositions.push([x, z])
}

const npcData: NpcData[] = [
  { start: [5.5, 5.5], shirt: '#6f497f', trousers: '#303842', skin: '#c99772', hair: '#3a281f' },
  { start: [-4, 8], shirt: '#496b7a', trousers: '#373b32', skin: '#b97f5d', hair: '#171717' },
  { start: [11, -4], shirt: '#785349', trousers: '#2f3540', skin: '#d3a27c', hair: '#6a4a2f' },
  { start: [-17, 12], shirt: '#6c6a42', trousers: '#34353a', skin: '#c08d69', hair: '#4b3324' },
  { start: [18, 13], shirt: '#4d5d82', trousers: '#2f3339', skin: '#d0a17c', hair: '#2a211c' },
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
    const [bx, bz] = building.position
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
        .multiplyScalar((controls.sprint ? 9 : 5) * delta)

      const nextX = camera.position.x + velocity.current.x
      const nextZ = camera.position.z + velocity.current.z

      if (!collidesWithWorld(nextX, camera.position.z)) camera.position.x = nextX
      if (!collidesWithWorld(camera.position.x, nextZ)) camera.position.z = nextZ
    }

    const targetY = terrainHeight(camera.position.x, camera.position.z) + 1.65
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, Math.min(1, delta * 12))
  })

  return null
}

function Terrain() {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 72, 72)
    geo.rotateX(-Math.PI / 2)

    const positions = geo.attributes.position
    const colors: number[] = []
    const low = new THREE.Color('#4a5942')
    const mid = new THREE.Color('#58694b')
    const high = new THREE.Color('#676d56')
    const marsh = new THREE.Color('#46564c')
    const c = new THREE.Color()

    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i)
      const z = positions.getZ(i)
      const y = terrainHeight(x, z)
      positions.setY(i, y)

      const marshness = THREE.MathUtils.clamp(1 - Math.hypot(x - 31, z - 30) / 16, 0, 1)
      if (marshness > 0.25) {
        c.copy(mid).lerp(marsh, marshness)
      } else if (y > 3.5) {
        c.copy(mid).lerp(high, THREE.MathUtils.clamp((y - 3.5) / 5, 0, 1))
      } else {
        c.copy(low).lerp(mid, THREE.MathUtils.clamp((y + 1) / 4, 0, 1))
      }
      colors.push(c.r, c.g, c.b)
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    return geo
  }, [])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} flatShading />
    </mesh>
  )
}

function Tree({ x, z }: { x: number; z: number }) {
  const y = terrainHeight(x, z)
  return (
    <group position={[x, y, z]}>
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
  const [x, z] = position
  const [sx, sy, sz] = size
  const ground = terrainHeight(x, z)
  const y = ground + sy / 2

  return (
    <group>
      <mesh castShadow receiveShadow position={[x, y, z]}>
        <boxGeometry args={[sx, sy, sz]} />
        <meshStandardMaterial color={color} roughness={0.95} flatShading />
      </mesh>

      <mesh castShadow position={[x, ground + sy + 0.55, z]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[Math.max(sx, sz) * 0.82, 1.35, 4]} />
        <meshStandardMaterial color={roof} roughness={1} flatShading />
      </mesh>

      <mesh position={[x, ground + 1.05, z + sz / 2 + 0.012]}>
        <planeGeometry args={[0.9, 1.8]} />
        <meshStandardMaterial color="#2f251f" roughness={1} />
      </mesh>

      {[-0.28, 0.28].map((offset) => (
        <mesh key={offset} position={[x + sx * offset, ground + sy * 0.58, z + sz / 2 + 0.018]}>
          <planeGeometry args={[0.75, 0.92]} />
          <meshBasicMaterial color="#e4bd70" toneMapped={false} />
        </mesh>
      ))}
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
    npc.position.y =
      terrainHeight(npc.position.x, npc.position.z) +
      1.18 +
      Math.abs(Math.sin(walkTime.current)) * 0.035
  })

  return (
    <sprite
      ref={sprite}
      position={[data.start[0], terrainHeight(data.start[0], data.start[1]) + 1.18, data.start[1]]}
      scale={[1.45, 2.2, 1]}
    >
      <spriteMaterial map={texture} transparent alphaTest={0.18} depthWrite toneMapped={false} />
    </sprite>
  )
}

function Rock({ x, z, index }: { x: number; z: number; index: number }) {
  return (
    <mesh
      position={[x, terrainHeight(x, z) + 0.28, z]}
      rotation={[0.15, index * 0.91, -0.08]}
      castShadow
      receiveShadow
    >
      <dodecahedronGeometry args={[0.45 + (index % 3) * 0.12, 0]} />
      <meshStandardMaterial color="#6b6961" roughness={1} flatShading />
    </mesh>
  )
}

function Pond() {
  const x = 31
  const z = 30
  return (
    <mesh rotation-x={-Math.PI / 2} position={[x, -1.45, z]}>
      <circleGeometry args={[7.4, 32]} />
      <meshStandardMaterial color="#405f66" transparent opacity={0.82} roughness={0.25} metalness={0.05} />
    </mesh>
  )
}

function Ruins() {
  const x = -42
  const z = 28
  const y = terrainHeight(x, z)
  return (
    <group position={[x, y, z]}>
      {[-3, 0, 3].map((offset, i) => (
        <mesh key={offset} castShadow position={[offset, 1.4 + i * 0.18, 0]}>
          <cylinderGeometry args={[0.42, 0.52, 2.8 + i * 0.36, 7]} />
          <meshStandardMaterial color="#77756d" flatShading roughness={1} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 0.35, -2.8]}>
        <boxGeometry args={[7.5, 0.7, 1]} />
        <meshStandardMaterial color="#68665f" roughness={1} flatShading />
      </mesh>
    </group>
  )
}

function HillMarker() {
  const x = 39
  const z = -33
  const y = terrainHeight(x, z)
  return (
    <group position={[x, y, z]}>
      <mesh castShadow position={[0, 2.3, 0]}>
        <cylinderGeometry args={[1.6, 2.1, 4.6, 8]} />
        <meshStandardMaterial color="#55524d" flatShading roughness={1} />
      </mesh>
      <mesh castShadow position={[0, 5.15, 0]}>
        <coneGeometry args={[2.25, 1.8, 8]} />
        <meshStandardMaterial color="#312d2b" flatShading roughness={1} />
      </mesh>
      <pointLight position={[0, 4.2, 0]} color="#ffb45c" intensity={12} distance={10} />
    </group>
  )
}

function TerrainPatch({
  x,
  z,
  width,
  depth,
  color,
  lift = 0.055,
}: {
  x: number
  z: number
  width: number
  depth: number
  color: string
  lift?: number
}) {
  const geometry = useMemo(() => {
    const widthSegments = Math.max(2, Math.ceil(width / 1.4))
    const depthSegments = Math.max(2, Math.ceil(depth / 1.4))
    const geo = new THREE.PlaneGeometry(width, depth, widthSegments, depthSegments)
    geo.rotateX(-Math.PI / 2)

    const positions = geo.attributes.position
    for (let i = 0; i < positions.count; i += 1) {
      const localX = positions.getX(i)
      const localZ = positions.getZ(i)
      positions.setY(i, terrainHeight(x + localX, z + localZ) + lift)
    }

    positions.needsUpdate = true
    geo.computeVertexNormals()
    return geo
  }, [x, z, width, depth, lift])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh geometry={geometry} position={[x, 0, z]} receiveShadow>
      <meshStandardMaterial
        color={color}
        roughness={1}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-2}
      />
    </mesh>
  )
}

function VillagePaths() {
  const pieces = [
    [0, 1, 4.2, 36],
    [-2.5, -5, 24, 2.6],
    [9, 7, 16, 2.2],
    [-10, 9, 14, 2.1],
  ] as const

  return (
    <>
      {pieces.map(([x, z, sx, sz], i) => (
        <TerrainPatch
          key={i}
          x={x}
          z={z}
          width={sx}
          depth={sz}
          color={i === 0 ? '#756e60' : '#6c665a'}
          lift={0.055 + i * 0.006}
        />
      ))}
    </>
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
      sun.current.position.set(Math.cos(angle) * 55, height * 50, Math.sin(angle) * 40)
      sun.current.intensity = 0.2 + daylight * 2.1
      sun.current.color.set(daylight > 0.45 ? '#fff0cf' : '#d88965')
    }

    sky.copy(night).lerp(day, daylight)
    scene.background = sky
    scene.fog = new THREE.FogExp2(sky, 0.011 + (1 - daylight) * 0.009)
  })

  return (
    <>
      <hemisphereLight args={['#aab7c8', '#30301f', 0.62]} />
      <directionalLight
        ref={sun}
        castShadow
        intensity={2}
        position={[20, 35, 15]}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
      />
    </>
  )
}

export default function GameWorld() {
  return (
    <>
      <PlayerController />
      <DayNight />
      <Terrain />
      <VillagePaths />
      <Pond />
      <Ruins />
      <HillMarker />

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
