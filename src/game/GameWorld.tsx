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
  rotation: number
}

type NpcData = {
  name: string
  start: readonly [number, number]
  shirt: string
  trousers: string
  skin: string
  hair: string
  greeting: string
  options: readonly string[]
}

const controls: Controls = {
  forward: false,
  back: false,
  left: false,
  right: false,
  sprint: false,
}

let worldDaylight = 1
let activeNpcIndex: number | null = null

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
  { position: [-7, -8], size: [4, 3, 4], color: '#876147', roof: '#44352f', rotation: 0 },
  { position: [5, -10], size: [5, 4, 4], color: '#536879', roof: '#343943', rotation: Math.PI },
  { position: [9, 2], size: [3.5, 2.5, 5], color: '#765044', roof: '#3e322e', rotation: -Math.PI / 2 },
  { position: [-10, 5], size: [5, 3.5, 3.5], color: '#667358', roof: '#343d2f', rotation: Math.PI / 2 },
  { position: [14, -9], size: [4, 3, 4.5], color: '#79624d', roof: '#40332d', rotation: Math.PI },
  { position: [-15, -8], size: [4.5, 3.2, 4], color: '#5f6d76', roof: '#343b40', rotation: Math.PI / 2 },
  { position: [15, 10], size: [4.2, 3.2, 4.2], color: '#80604b', roof: '#44352f', rotation: -Math.PI / 2 },
  { position: [-13, 14], size: [4.8, 3.7, 4.2], color: '#666f52', roof: '#343b30', rotation: Math.PI },
  { position: [38, -31], size: [5, 4.5, 5], color: '#635b55', roof: '#35312f', rotation: Math.PI / 2 },
  { position: [-42, 24], size: [5.5, 3.5, 4.5], color: '#756a5e', roof: '#3b3530', rotation: -Math.PI / 2 },
]

function seeded(seed: number) {
  const n = Math.sin(seed * 12.9898) * 43758.5453
  return n - Math.floor(n)
}


function buildingFootprint(building: BuildingData) {
  const quarterTurn = Math.abs(Math.sin(building.rotation)) > 0.5
  const width = quarterTurn ? building.size[2] : building.size[0]
  const depth = quarterTurn ? building.size[0] : building.size[2]
  return { width, depth }
}

function isNearBuilding(x: number, z: number, padding = 0.8) {
  return buildings.some((building) => {
    const { width, depth } = buildingFootprint(building)
    return (
      Math.abs(x - building.position[0]) <= width / 2 + padding &&
      Math.abs(z - building.position[1]) <= depth / 2 + padding
    )
  })
}

function fenceHitsBuilding(x: number, z: number, length: number, rotation: number) {
  const samples = Math.max(4, Math.ceil(length / 0.6))
  for (let i = 0; i <= samples; i += 1) {
    const t = -length / 2 + (length * i) / samples
    const sx = x + Math.cos(rotation) * t
    const sz = z - Math.sin(rotation) * t
    if (isNearBuilding(sx, sz, 0.55)) return true
  }
  return false
}


const textureCache = new Map<string, THREE.CanvasTexture>()

function getPixelTexture(
  key: string,
  base: string,
  accent: string,
  kind: 'noise' | 'brick' | 'roof' | 'wood' | 'gravel',
) {
  const cached = textureCache.get(key)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')

  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = base
  ctx.fillRect(0, 0, 128, 128)

  const random = (n: number) => seeded(n + key.length * 17)

  if (kind === 'brick') {
    ctx.strokeStyle = accent
    ctx.lineWidth = 2
    for (let y = 0; y <= 128; y += 12) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(128, y)
      ctx.stroke()
      const offset = ((y / 12) % 2) * 10
      for (let x = -offset; x < 128; x += 20) {
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x, y + 12)
        ctx.stroke()
      }
    }
  } else if (kind === 'roof') {
    ctx.fillStyle = accent
    for (let y = 0; y < 128; y += 8) {
      for (let x = (y / 8) % 2 ? -6 : 0; x < 128; x += 12) {
        ctx.fillRect(x, y, 10, 2)
      }
    }
  } else if (kind === 'wood') {
    ctx.strokeStyle = accent
    ctx.lineWidth = 1
    for (let x = 4; x < 128; x += 8) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x + Math.sin(x) * 2, 128)
      ctx.stroke()
    }
  } else if (kind === 'gravel') {
    ctx.fillStyle = accent
    for (let i = 0; i < 170; i += 1) {
      const x = Math.floor(random(i + 1) * 128)
      const y = Math.floor(random(i + 200) * 128)
      const size = 1 + Math.floor(random(i + 400) * 2)
      ctx.fillRect(x, y, size, size)
    }
  } else {
    const baseColor = new THREE.Color(base)
    const accentColor = new THREE.Color(accent)
    for (let y = 0; y < 128; y += 4) {
      for (let x = 0; x < 128; x += 4) {
        const t = random(x * 13 + y * 31) * 0.55
        const c = baseColor.clone().lerp(accentColor, t)
        ctx.fillStyle = '#' + c.getHexString()
        ctx.fillRect(x, y, 4, 4)
      }
    }
  }

  // Shared weathering pass: tiny value shifts keep surfaces from reading as flat procedural fills.
  ctx.globalAlpha = 0.16
  for (let i = 0; i < 220; i += 1) {
    const x = Math.floor(random(i + 7000) * 128)
    const y = Math.floor(random(i + 7600) * 128)
    const light = random(i + 8100) > 0.52
    ctx.fillStyle = light ? '#ffffff' : '#000000'
    const size = random(i + 8500) > 0.88 ? 2 : 1
    ctx.fillRect(x, y, size, size)
  }
  ctx.globalAlpha = 1

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(2, 2)
  texture.anisotropy = 8
  textureCache.set(key, texture)
  return texture
}

const treePositions: [number, number][] = []
for (let i = 0; i < 120; i += 1) {
  const x = -54 + seeded(i + 10) * 108
  const z = -54 + seeded(i + 90) * 108
  if (Math.hypot(x, z) < 18) continue
  if (Math.hypot(x - 31, z - 30) < 9) continue
  if (isNearBuilding(x, z, 2.2)) continue
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
  {
    name: 'Mara',
    start: [5.5, 5.5],
    shirt: '#6f497f',
    trousers: '#303842',
    skin: '#c99772',
    hair: '#3a281f',
    greeting: 'Evening. You look like you are new around here.',
    options: ['What is this place?', 'Anything interesting nearby?', 'Just passing through.'],
  },
  {
    name: 'Elias',
    start: [-4, 8],
    shirt: '#496b7a',
    trousers: '#373b32',
    skin: '#b97f5d',
    hair: '#171717',
    greeting: 'Careful on the western trail. The old ruins are not as empty as they look.',
    options: ['Tell me about the ruins.', 'Where does this road go?', 'I will keep that in mind.'],
  },
  {
    name: 'Nora',
    start: [11, -4],
    shirt: '#785349',
    trousers: '#2f3540',
    skin: '#d3a27c',
    hair: '#6a4a2f',
    greeting: 'Nice weather for once. It usually turns before nightfall.',
    options: ['Does the weather get bad?', 'What is up on the hill?', 'See you around.'],
  },
  {
    name: 'Tomas',
    start: [-17, 12],
    shirt: '#6c6a42',
    trousers: '#34353a',
    skin: '#c08d69',
    hair: '#4b3324',
    greeting: 'If you are heading out, stick to the paths until you know the ground.',
    options: ['Why?', 'Where can I find people?', 'Thanks.'],
  },
  {
    name: 'Iris',
    start: [18, 13],
    shirt: '#4d5d82',
    trousers: '#2f3339',
    skin: '#d0a17c',
    hair: '#2a211c',
    greeting: 'The pond is quiet today. I prefer it that way.',
    options: ['What happens there?', 'Do you live here?', 'I should get going.'],
  },
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
    const { width, depth } = buildingFootprint(building)
    if (
      x > bx - width / 2 - radius &&
      x < bx + width / 2 + radius &&
      z > bz - depth / 2 - radius &&
      z < bz + depth / 2 + radius
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
  const focusTarget = useRef<THREE.Vector3 | null>(null)
  const interactionActive = useRef(false)
  const normalFov = useRef(70)

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
      if (interactionActive.current) return
      if (document.pointerLockElement !== gl.domElement) return
      yaw.current -= event.movementX * 0.0024
      pitch.current -= event.movementY * 0.0024
      pitch.current = THREE.MathUtils.clamp(pitch.current, -1.35, 1.35)
    }

    const click = () => {
      if (interactionActive.current) return
      if (window.matchMedia('(pointer:fine)').matches && document.pointerLockElement == null) {
        gl.domElement.requestPointerLock?.()
      }
    }

    const customControl = (event: Event) => {
      const detail = (event as CustomEvent<{ name: keyof Controls; active: boolean }>).detail
      controls[detail.name] = detail.active
    }

    const customLook = (event: Event) => {
      if (interactionActive.current) return
      const { dx, dy } = (event as CustomEvent<{ dx: number; dy: number }>).detail
      yaw.current -= dx * 0.006
      pitch.current -= dy * 0.004
      pitch.current = THREE.MathUtils.clamp(pitch.current, -1.35, 1.35)
    }

    const focusNpc = (event: Event) => {
      const { x, y, z } = (event as CustomEvent<{ x: number; y: number; z: number }>).detail
      focusTarget.current = new THREE.Vector3(x, y, z)
      interactionActive.current = true
      normalFov.current = (camera as THREE.PerspectiveCamera).fov
      controls.forward = false
      controls.back = false
      controls.left = false
      controls.right = false
      controls.sprint = false
      if (document.pointerLockElement === gl.domElement) document.exitPointerLock?.()
    }

    const endDialogue = () => {
      focusTarget.current = null
      interactionActive.current = false
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('mousemove', mouseMove)
    window.addEventListener('game-control', customControl)
    window.addEventListener('game-look', customLook)
    window.addEventListener('game-focus-npc', focusNpc)
    window.addEventListener('game-end-dialogue', endDialogue)
    gl.domElement.addEventListener('click', click)

    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('mousemove', mouseMove)
      window.removeEventListener('game-control', customControl)
      window.removeEventListener('game-look', customLook)
      window.removeEventListener('game-focus-npc', focusNpc)
      window.removeEventListener('game-end-dialogue', endDialogue)
      gl.domElement.removeEventListener('click', click)
    }
  }, [camera, gl])

  useFrame((_, delta) => {
    if (interactionActive.current && focusTarget.current) {
      const dx = focusTarget.current.x - camera.position.x
      const dy = focusTarget.current.y - camera.position.y
      const dz = focusTarget.current.z - camera.position.z
      const horizontal = Math.hypot(dx, dz)
      // Three.js cameras look down local -Z, so target yaw/pitch must be
      // calculated against -Z rather than +Z.
      const targetYaw = Math.atan2(-dx, -dz)
      const targetPitch = Math.atan2(dy, Math.max(0.001, horizontal))

      const angleDelta = Math.atan2(Math.sin(targetYaw - yaw.current), Math.cos(targetYaw - yaw.current))
      yaw.current += angleDelta * Math.min(1, delta * 7)
      pitch.current = THREE.MathUtils.lerp(pitch.current, targetPitch, Math.min(1, delta * 7))
    }

    const perspectiveCamera = camera as THREE.PerspectiveCamera
    const desiredFov = interactionActive.current ? 46 : normalFov.current
    const nextFov = THREE.MathUtils.lerp(perspectiveCamera.fov, desiredFov, Math.min(1, delta * 6))
    if (Math.abs(nextFov - perspectiveCamera.fov) > 0.01) {
      perspectiveCamera.fov = nextFov
      perspectiveCamera.updateProjectionMatrix()
    }

    camera.rotation.y = yaw.current
    camera.rotation.x = pitch.current

    const z = interactionActive.current ? 0 : Number(controls.back) - Number(controls.forward)
    const x = interactionActive.current ? 0 : Number(controls.right) - Number(controls.left)
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

function isVillagePath(x: number, z: number) {
  const paths = [
    { x: 0, z: 1, w: 4.2, d: 36 },
    { x: -2.5, z: -5, w: 24, d: 2.6 },
    { x: 9, z: 7, w: 16, d: 2.2 },
    { x: -10, z: 9, w: 14, d: 2.1 },
  ]

  return paths.some((p) =>
    Math.abs(x - p.x) <= p.w / 2 &&
    Math.abs(z - p.z) <= p.d / 2
  )
}

function Terrain() {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 140, 140)
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
      if (isVillagePath(x, z)) {
        const pathNoise = seeded(Math.floor(x * 4) * 31 + Math.floor(z * 4) * 17)
        c.set('#8a7658').lerp(new THREE.Color('#655641'), pathNoise * 0.35)
      } else if (marshness > 0.25) {
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
    <mesh geometry={geometry}>
      <meshStandardMaterial
        vertexColors
        map={getPixelTexture('terrain-grass-v2', '#9aa285', '#687357', 'noise')}
        roughness={1}
      />
    </mesh>
  )
}

function Tree({ x, z }: { x: number; z: number }) {
  const y = terrainHeight(x, z)
  const variant = Math.floor(Math.abs(x * 7 + z * 11)) % 3
  const trunkTexture = getPixelTexture('tree-bark', '#5a3f2a', '#2f2118', 'wood')
  const leafTexture = getPixelTexture('tree-leaves', '#3c633d', '#243d27', 'noise')

  return (
    <group position={[x, y, z]} rotation-y={variant * 0.7}>
      <mesh position={[0, 1.35, 0]}>
        <cylinderGeometry args={[0.17, 0.32, 2.7, 7]} />
        <meshStandardMaterial map={trunkTexture} color="#8a6849" roughness={1} flatShading />
      </mesh>

      <mesh position={[0.38, 1.95, 0]} rotation-z={-0.75}>
        <cylinderGeometry args={[0.07, 0.11, 1.3, 6]} />
        <meshStandardMaterial map={trunkTexture} color="#7c5b40" roughness={1} flatShading />
      </mesh>

      <mesh position={[-0.24, 2.65, 0.12]} scale={[1.05, 0.95, 1]}>
        <icosahedronGeometry args={[1.05, 1]} />
        <meshStandardMaterial map={leafTexture} color="#426d43" roughness={1} flatShading />
      </mesh>
      <mesh position={[0.5, 3.1, -0.16]} scale={[0.9, 1.05, 0.85]}>
        <icosahedronGeometry args={[0.95, 1]} />
        <meshStandardMaterial map={leafTexture} color="#4a7749" roughness={1} flatShading />
      </mesh>
      <mesh position={[-0.45, 3.42, -0.15]} scale={[0.75, 0.88, 0.78]}>
        <icosahedronGeometry args={[0.82, 1]} />
        <meshStandardMaterial map={leafTexture} color="#365d39" roughness={1} flatShading />
      </mesh>
    </group>
  )
}

function Building({ position, size, color, roof, rotation }: BuildingData) {
  const [x, z] = position
  const [sx, sy, sz] = size
  const ground = terrainHeight(x, z)
  const variant = Math.abs(Math.round(x * 3 + z * 5)) % 4
  const hasPorch = variant !== 1
  const hasAnnex = variant === 2 || variant === 3
  const hasChimney = variant !== 0

  const wallKind: 'noise' | 'brick' = variant === 0 || variant === 3 ? 'brick' : 'noise'
  const wallAccent = variant === 1 ? '#4e514b' : variant === 2 ? '#695746' : '#3e3832'
  const wallTexture = getPixelTexture(`wall-v${variant}-${color}`, color, wallAccent, wallKind)
  const roofTexture = getPixelTexture(`roof-v${variant}-${roof}`, roof, variant === 2 ? '#35271f' : '#1f1d1c', 'roof')
  const woodTexture = getPixelTexture('building-wood', '#4d3426', '#261a14', 'wood')
  const roofAngle = 0.52 + variant * 0.025
  const roofPanelWidth = sx * 0.64
  const roofRise = Math.tan(roofAngle) * (sx / 2)
  const roofY = sy + roofRise * 0.48
  const beamColor = variant % 2 === 0 ? '#3d291f' : '#493225'
  const stoneColor = variant === 1 ? '#77756c' : '#68645b'

  const gableGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([
        -sx / 2, 0, 0,
         sx / 2, 0, 0,
         0, roofRise, 0,
      ], 3),
    )
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2))
    geometry.setIndex([0, 1, 2])
    geometry.computeVertexNormals()
    return geometry
  }, [sx, roofRise])

  const gableTexture = useMemo(() => {
    const texture = wallTexture.clone()
    texture.repeat.set(2, Math.max(0.7, 2 * roofRise / sy))
    texture.needsUpdate = true
    return texture
  }, [wallTexture, roofRise, sy])

  useEffect(() => () => {
    gableGeometry.dispose()
    gableTexture.dispose()
  }, [gableGeometry, gableTexture])

  const leftWindow = useRef<THREE.MeshStandardMaterial>(null)
  const rightWindow = useRef<THREE.MeshStandardMaterial>(null)

  useFrame(() => {
    const glow = THREE.MathUtils.lerp(2.2, 0.05, worldDaylight)
    if (leftWindow.current) leftWindow.current.emissiveIntensity = glow
    if (rightWindow.current) rightWindow.current.emissiveIntensity = glow
  })

  return (
    <group position={[x, ground, z]} rotation-y={rotation}>
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[sx + 0.34, 0.36, sz + 0.34]} />
        <meshStandardMaterial color={stoneColor} roughness={1} />
      </mesh>

      <mesh position={[0, sy / 2, 0]}>
        <boxGeometry args={[sx, sy, sz]} />
        <meshStandardMaterial map={wallTexture} color="#ffffff" roughness={0.96} />
      </mesh>

      <mesh geometry={gableGeometry} position={[0, sy + 0.002, sz / 2 + 0.008]}>
        <meshStandardMaterial map={gableTexture} color="#ffffff" roughness={0.96} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={gableGeometry} position={[0, sy + 0.002, -sz / 2 - 0.008]} rotation-y={Math.PI}>
        <meshStandardMaterial map={gableTexture} color="#ffffff" roughness={0.96} side={THREE.DoubleSide} />
      </mesh>

      <mesh position={[-sx * 0.24, roofY, 0]} rotation={[0, 0, roofAngle]}>
        <boxGeometry args={[roofPanelWidth, 0.2, sz * 1.18]} />
        <meshStandardMaterial map={roofTexture} color="#ffffff" roughness={1} />
      </mesh>
      <mesh position={[sx * 0.24, roofY, 0]} rotation={[0, 0, -roofAngle]}>
        <boxGeometry args={[roofPanelWidth, 0.2, sz * 1.18]} />
        <meshStandardMaterial map={roofTexture} color="#ffffff" roughness={1} />
      </mesh>
      <mesh position={[0, sy + roofRise + 0.02, 0]}>
        <boxGeometry args={[0.16, 0.16, sz * 1.2]} />
        <meshStandardMaterial color="#271d18" roughness={1} />
      </mesh>

      {hasChimney && (
        <group position={[sx * 0.28, sy + roofRise * 0.65, -sz * 0.16]}>
          <mesh>
            <boxGeometry args={[0.5, 1.7, 0.5]} />
            <meshStandardMaterial map={getPixelTexture('chimney-stone', '#69645d', '#403d38', 'brick')} color="#b0aaa1" roughness={1} />
          </mesh>
          <mesh position={[0, 0.92, 0]}>
            <boxGeometry args={[0.62, 0.14, 0.62]} />
            <meshStandardMaterial color="#45413d" roughness={1} />
          </mesh>
        </group>
      )}

      <mesh position={[0, 1.02, sz / 2 + 0.09]}>
        <boxGeometry args={[0.92, 1.92, 0.14]} />
        <meshStandardMaterial map={woodTexture} color="#543728" roughness={1} />
      </mesh>
      <mesh position={[0.28, 1.03, sz / 2 + 0.18]}>
        <sphereGeometry args={[0.055, 8, 8]} />
        <meshStandardMaterial color="#b38a50" metalness={0.3} roughness={0.55} />
      </mesh>

      {[-0.3, 0.3].map((offset, i) => (
        <group key={offset} position={[sx * offset, sy * 0.58, sz / 2 + 0.09]}>
          <mesh>
            <boxGeometry args={[0.98, 1.12, 0.14]} />
            <meshStandardMaterial map={woodTexture} color="#4b3327" roughness={1} />
          </mesh>
          <mesh position={[0, 0, 0.085]}>
            <planeGeometry args={[0.72, 0.84]} />
            <meshStandardMaterial
              ref={i === 0 ? leftWindow : rightWindow}
              color="#d8b66f"
              emissive="#d8892f"
              emissiveIntensity={0.15}
              roughness={0.4}
            />
          </mesh>
          <mesh position={[0, 0, 0.116]}>
            <boxGeometry args={[0.055, 0.84, 0.026]} />
            <meshStandardMaterial color="#402b22" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0, 0.118]}>
            <boxGeometry args={[0.72, 0.055, 0.026]} />
            <meshStandardMaterial color="#402b22" roughness={0.9} />
          </mesh>
        </group>
      ))}

      {[-0.4, 0, 0.4].map((offset) => (
        <mesh key={offset} position={[sx * offset, sy * 0.5, sz / 2 + 0.07]}>
          <boxGeometry args={[0.12, sy * 0.92, 0.12]} />
          <meshStandardMaterial map={woodTexture} color={beamColor} roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, sy * 0.72, sz / 2 + 0.07]}>
        <boxGeometry args={[sx * 0.92, 0.12, 0.12]} />
        <meshStandardMaterial map={woodTexture} color={beamColor} roughness={1} />
      </mesh>

      {variant === 3 && (
        <>
          <mesh position={[0, sy * 0.39, sz / 2 + 0.12]} rotation-z={0.58}>
            <boxGeometry args={[sx * 1.02, 0.1, 0.1]} />
            <meshStandardMaterial color={beamColor} roughness={1} />
          </mesh>
          <mesh position={[0, sy * 0.39, sz / 2 + 0.13]} rotation-z={-0.58}>
            <boxGeometry args={[sx * 1.02, 0.1, 0.1]} />
            <meshStandardMaterial color={beamColor} roughness={1} />
          </mesh>
        </>
      )}

      {hasPorch && (
        <group position={[0, 0, sz / 2 + 0.76]}>
          <mesh position={[0, 0.12, 0]}>
            <boxGeometry args={[Math.min(2.5, sx * 0.64), 0.24, 1.2]} />
            <meshStandardMaterial map={woodTexture} color="#6a4935" roughness={1} />
          </mesh>
          <mesh position={[-0.82, 1.15, 0.35]}>
            <boxGeometry args={[0.12, 2.1, 0.12]} />
            <meshStandardMaterial color={beamColor} roughness={1} />
          </mesh>
          <mesh position={[0.82, 1.15, 0.35]}>
            <boxGeometry args={[0.12, 2.1, 0.12]} />
            <meshStandardMaterial color={beamColor} roughness={1} />
          </mesh>
          <mesh position={[0, 2.05, 0.25]} rotation-x={-0.14}>
            <boxGeometry args={[2.2, 0.12, 1.45]} />
            <meshStandardMaterial map={roofTexture} color="#ffffff" roughness={1} />
          </mesh>
        </group>
      )}

      {variant === 1 && (
        <group position={[0, sy + roofRise * 0.55, sz * 0.08]}>
          <mesh position={[0, 0, 0.2]}>
            <boxGeometry args={[1.2, 0.9, 0.78]} />
            <meshStandardMaterial map={wallTexture} color="#f2efe5" roughness={1} />
          </mesh>
          <mesh position={[-0.38, 0.56, 0.2]} rotation-z={0.38}>
            <boxGeometry args={[0.82, 0.12, 0.96]} />
            <meshStandardMaterial map={roofTexture} color="#ffffff" roughness={1} />
          </mesh>
          <mesh position={[0.38, 0.56, 0.2]} rotation-z={-0.38}>
            <boxGeometry args={[0.82, 0.12, 0.96]} />
            <meshStandardMaterial map={roofTexture} color="#ffffff" roughness={1} />
          </mesh>
          <mesh position={[0, 0.03, 0.61]}>
            <planeGeometry args={[0.48, 0.42]} />
            <meshStandardMaterial color="#c7a968" emissive="#704717" emissiveIntensity={0.25} roughness={0.45} />
          </mesh>
        </group>
      )}

      {variant === 2 && (
        <group position={[-sx * 0.33, 0.7, sz / 2 + 0.25]}>
          <mesh position={[0, 0.22, 0]}>
            <boxGeometry args={[0.9, 1.4, 0.38]} />
            <meshStandardMaterial map={getPixelTexture('house-stone-course', '#767168', '#4b4842', 'brick')} color="#aaa49a" roughness={1} />
          </mesh>
          <mesh position={[0, -0.58, 0.08]}>
            <boxGeometry args={[1.15, 0.18, 0.72]} />
            <meshStandardMaterial color="#5b554d" roughness={1} />
          </mesh>
        </group>
      )}

      {hasAnnex && (
        <group position={[sx / 2 + 1.0, 0, sz * 0.1]}>
          <mesh position={[0, 1.05, 0]}>
            <boxGeometry args={[2.0, 2.1, Math.max(2.1, sz * 0.72)]} />
            <meshStandardMaterial map={wallTexture} color="#f0eee7" roughness={1} />
          </mesh>
          <mesh position={[0, 2.34, 0]} rotation-z={-0.22}>
            <boxGeometry args={[2.3, 0.16, Math.max(2.35, sz * 0.8)]} />
            <meshStandardMaterial map={roofTexture} color="#ffffff" roughness={1} />
          </mesh>
        </group>
      )}
    </group>
  )
}

function makeNpcTexture(data: NpcData, frame = 0) {
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 144
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')

  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, 96, 144)

  const shade = (hex: string, amount: number) => {
    const c = new THREE.Color(hex)
    c.offsetHSL(0, 0, amount)
    return '#' + c.getHexString()
  }

  const skinDark = shade(data.skin, -0.1)
  const skinLight = shade(data.skin, 0.07)
  const shirtDark = shade(data.shirt, -0.12)
  const shirtLight = shade(data.shirt, 0.08)
  const trouserLight = shade(data.trousers, 0.05)

  const bob = frame % 2
  const legShift = bob ? 3 : 0
  const armShift = bob ? 2 : -2

  ctx.fillStyle = '#0000003d'
  ctx.fillRect(22, 132, 52, 6)

  // Legs and boots: narrower, longer and slightly offset between animation frames.
  ctx.fillStyle = data.trousers
  ctx.fillRect(31 - legShift, 91, 13, 38)
  ctx.fillRect(52 + legShift, 91, 13, 38)
  ctx.fillStyle = trouserLight
  ctx.fillRect(33 - legShift, 92, 4, 33)
  ctx.fillRect(54 + legShift, 92, 4, 33)
  ctx.fillStyle = '#17191d'
  ctx.fillRect(26 - legShift, 125, 20, 9)
  ctx.fillRect(50 + legShift, 125, 20, 9)

  // Torso, shoulders and coat/shirt shaping.
  ctx.fillStyle = shirtDark
  ctx.fillRect(22, 57, 52, 39)
  ctx.fillRect(27, 51, 42, 48)
  ctx.fillStyle = data.shirt
  ctx.fillRect(31, 52, 34, 43)
  ctx.fillStyle = shirtLight
  ctx.fillRect(33, 54, 7, 38)
  ctx.fillStyle = shirtDark
  ctx.fillRect(17 + armShift, 59, 12, 34)
  ctx.fillRect(67 - armShift, 59, 12, 34)

  // Hands.
  ctx.fillStyle = data.skin
  ctx.fillRect(18 + armShift, 88, 11, 13)
  ctx.fillRect(67 - armShift, 88, 11, 13)
  ctx.fillStyle = skinLight
  ctx.fillRect(20 + armShift, 89, 4, 10)
  ctx.fillRect(69 - armShift, 89, 4, 10)

  // Neck.
  ctx.fillStyle = skinDark
  ctx.fillRect(40, 44, 17, 11)
  ctx.fillStyle = data.skin
  ctx.fillRect(43, 43, 13, 12)

  // Head with a less square jaw and cheek shading.
  ctx.fillStyle = skinDark
  ctx.fillRect(30, 16, 38, 31)
  ctx.fillRect(34, 10, 31, 41)
  ctx.fillStyle = data.skin
  ctx.fillRect(34, 15, 31, 31)
  ctx.fillRect(38, 44, 23, 6)
  ctx.fillStyle = skinLight
  ctx.fillRect(36, 16, 7, 25)
  ctx.fillStyle = skinDark
  ctx.fillRect(61, 20, 5, 20)

  // Hair silhouettes vary per NPC.
  ctx.fillStyle = data.hair
  if (data.name === 'Mara') {
    ctx.fillRect(27, 13, 11, 34)
    ctx.fillRect(59, 13, 11, 33)
    ctx.fillRect(31, 7, 36, 13)
    ctx.fillRect(38, 4, 25, 8)
  } else if (data.name === 'Iris') {
    ctx.fillRect(29, 8, 39, 14)
    ctx.fillRect(26, 16, 10, 27)
    ctx.fillRect(63, 14, 8, 24)
    ctx.fillRect(33, 4, 29, 7)
  } else if (data.name === 'Elias') {
    ctx.fillRect(29, 8, 40, 12)
    ctx.fillRect(32, 4, 31, 8)
    ctx.fillRect(29, 18, 8, 16)
  } else if (data.name === 'Tomas') {
    ctx.fillRect(30, 7, 37, 13)
    ctx.fillRect(28, 17, 8, 16)
    ctx.fillRect(61, 15, 7, 13)
  } else {
    ctx.fillRect(31, 7, 37, 13)
    ctx.fillRect(28, 15, 9, 20)
    ctx.fillRect(62, 15, 7, 14)
  }

  // Facial features.
  ctx.fillStyle = shade(data.hair, -0.08)
  ctx.fillRect(38, 25, 8, 3)
  ctx.fillRect(53, 25, 8, 3)
  ctx.fillStyle = '#252329'
  ctx.fillRect(40, 29, 4, 6)
  ctx.fillRect(55, 29, 4, 6)
  ctx.fillStyle = skinDark
  ctx.fillRect(48, 31, 4, 8)
  ctx.fillStyle = '#7d4b43'
  ctx.fillRect(43, 41, 14, 3)

  // Individual clothing identity.
  if (data.name === 'Nora') {
    ctx.fillStyle = '#c4a37e'
    ctx.fillRect(44, 57, 10, 27)
    ctx.fillStyle = '#8c714f'
    ctx.fillRect(47, 60, 4, 24)
  } else if (data.name === 'Elias') {
    ctx.fillStyle = '#273b45'
    ctx.fillRect(31, 55, 34, 6)
    ctx.fillRect(46, 55, 6, 41)
    ctx.fillStyle = '#9b835e'
    ctx.fillRect(39, 72, 20, 4)
  } else if (data.name === 'Mara') {
    ctx.fillStyle = '#b293c7'
    ctx.fillRect(36, 59, 25, 6)
    ctx.fillRect(46, 65, 6, 26)
    ctx.fillStyle = '#4b3656'
    ctx.fillRect(28, 87, 40, 5)
  } else if (data.name === 'Tomas') {
    ctx.fillStyle = '#49452b'
    ctx.fillRect(27, 63, 43, 7)
    ctx.fillStyle = '#7c6840'
    ctx.fillRect(32, 83, 33, 4)
  } else {
    ctx.fillStyle = '#91a1c5'
    ctx.fillRect(34, 57, 29, 5)
    ctx.fillStyle = '#35415f'
    ctx.fillRect(31, 82, 35, 5)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  return texture
}

function BillboardNpc({ data, index }: { data: NpcData; index: number }) {
  const root = useRef<THREE.Group>(null)
  const sprite = useRef<THREE.Sprite>(null)
  const heading = useRef(0.9 + index * 1.75)
  const changeTimer = useRef(1.2 + index * 0.8)
  const walkTime = useRef(index)
  const textures = useMemo(() => [makeNpcTexture(data, 0), makeNpcTexture(data, 1)], [data])

  useEffect(() => () => textures.forEach((texture) => texture.dispose()), [textures])

  useFrame((_, delta) => {
    const npc = root.current
    const visual = sprite.current
    if (!npc || !visual) return

    if (activeNpcIndex === index) {
      npc.position.y = terrainHeight(npc.position.x, npc.position.z)
      visual.position.y = 1.18
      visual.material.map = textures[0]
      return
    }

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

    npc.position.y = terrainHeight(npc.position.x, npc.position.z)
    walkTime.current += delta * 7
    visual.position.y = 1.18 + Math.abs(Math.sin(walkTime.current)) * 0.028
    const frame = Math.floor(walkTime.current * 1.6) % 2
    if (visual.material.map !== textures[frame]) {
      visual.material.map = textures[frame]
      visual.material.needsUpdate = true
    }
  })

  useEffect(() => {
    const end = () => {
      if (activeNpcIndex === index) activeNpcIndex = null
    }
    window.addEventListener('game-end-dialogue', end)
    return () => window.removeEventListener('game-end-dialogue', end)
  }, [index])

  return (
    <group
      ref={root}
      position={[data.start[0], terrainHeight(data.start[0], data.start[1]), data.start[1]]}
    >
      <mesh position={[0, 0.025, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.42, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <sprite ref={sprite} position={[0, 1.18, 0]} scale={[1.28, 2.42, 1]} raycast={() => null}>
        <spriteMaterial map={textures[0]} transparent alphaTest={0.18} depthWrite toneMapped={false} />
      </sprite>

      <mesh
        position={[0, 1.15, 0]}
        userData={{
          npcIndex: index,
          npcName: data.name,
          npcGreeting: data.greeting,
          npcOptions: data.options,
        }}
      >
        <boxGeometry args={[0.9, 2.15, 0.6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

function GrassField() {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const count = 1450
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const positions: number[] = []
    const indices: number[] = []
    const blade = (angle: number, height: number, width: number, lean: number) => {
      const base = positions.length / 3
      const dx = Math.cos(angle) * width
      const dz = Math.sin(angle) * width
      const lx = Math.cos(angle + Math.PI / 2) * lean
      const lz = Math.sin(angle + Math.PI / 2) * lean
      positions.push(
        -dx, 0, -dz,
         dx, 0,  dz,
         lx, height, lz,
      )
      indices.push(base, base + 1, base + 2)
    }
    blade(0, 0.55, 0.06, 0.05)
    blade(Math.PI * 0.66, 0.46, 0.055, -0.04)
    blade(Math.PI * 1.33, 0.62, 0.05, 0.02)
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
  }, [])

  useEffect(() => () => geometry.dispose(), [geometry])

  useEffect(() => {
    const instanced = mesh.current
    if (!instanced) return

    let placed = 0
    let seedIndex = 0

    while (placed < count && seedIndex < count * 10) {
      const x = -56 + seeded(seedIndex + 500) * 112
      const z = -56 + seeded(seedIndex + 1200) * 112
      seedIndex += 1

      if (isVillagePath(x, z)) continue
      if (Math.hypot(x - 31, z - 30) < 8.5) continue
      if (isNearBuilding(x, z, 1.25)) continue

      const y = terrainHeight(x, z)
      const distanceFromVillage = Math.hypot(x, z)
      const scale = 0.45 + seeded(seedIndex + 1800) * (distanceFromVillage > 24 ? 1.1 : 0.65)
      dummy.position.set(x, y + 0.012, z)
      dummy.rotation.set(0, seeded(seedIndex + 2000) * Math.PI * 2, 0)
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()
      instanced.setMatrixAt(placed, dummy.matrix)

      color.set(
        placed % 4 === 0 ? '#9aae69' :
        placed % 4 === 1 ? '#71834d' :
        placed % 4 === 2 ? '#86975a' : '#627545'
      )
      instanced.setColorAt(placed, color)
      placed += 1
    }

    instanced.count = placed
    instanced.instanceMatrix.needsUpdate = true
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true
  }, [color, dummy])

  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, count]}>
      <meshStandardMaterial roughness={1} vertexColors side={THREE.DoubleSide} />
    </instancedMesh>
  )
}

function ReedsAndFlowers() {
  const reedMesh = useRef<THREE.InstancedMesh>(null)
  const flowerMesh = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const reedCount = 190
  const flowerCount = 120

  useEffect(() => {
    const reeds = reedMesh.current
    if (reeds) {
      let placed = 0
      for (let i = 0; i < reedCount * 3 && placed < reedCount; i += 1) {
        const a = seeded(i + 3200) * Math.PI * 2
        const r = 6.5 + seeded(i + 3300) * 3.2
        const x = 31 + Math.cos(a) * r
        const z = 30 + Math.sin(a) * r
        const y = terrainHeight(x, z)
        dummy.position.set(x, y + 0.42, z)
        dummy.rotation.set(0, seeded(i + 3400) * Math.PI * 2, seeded(i + 3500) * 0.12 - 0.06)
        dummy.scale.set(0.7, 0.7 + seeded(i + 3600) * 0.8, 0.7)
        dummy.updateMatrix()
        reeds.setMatrixAt(placed, dummy.matrix)
        color.set(placed % 2 ? '#73844f' : '#8d9759')
        reeds.setColorAt(placed, color)
        placed += 1
      }
      reeds.count = placed
      reeds.instanceMatrix.needsUpdate = true
      if (reeds.instanceColor) reeds.instanceColor.needsUpdate = true
    }

    const flowers = flowerMesh.current
    if (flowers) {
      let placed = 0
      let i = 0
      while (placed < flowerCount && i < flowerCount * 12) {
        const x = -24 + seeded(i + 4100) * 48
        const z = -24 + seeded(i + 4200) * 48
        i += 1
        if (isVillagePath(x, z)) continue
        if (isNearBuilding(x, z, 1.35)) continue
        const y = terrainHeight(x, z)
        dummy.position.set(x, y + 0.2, z)
        dummy.rotation.set(0, seeded(i + 4300) * Math.PI * 2, 0)
        dummy.scale.setScalar(0.55 + seeded(i + 4400) * 0.45)
        dummy.updateMatrix()
        flowers.setMatrixAt(placed, dummy.matrix)
        color.set(placed % 3 === 0 ? '#d8b55f' : placed % 3 === 1 ? '#b37ca8' : '#d6d0a5')
        flowers.setColorAt(placed, color)
        placed += 1
      }
      flowers.count = placed
      flowers.instanceMatrix.needsUpdate = true
      if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true
    }
  }, [color, dummy])

  return (
    <>
      <instancedMesh ref={reedMesh} args={[undefined, undefined, reedCount]}>
        <cylinderGeometry args={[0.025, 0.04, 0.9, 5]} />
        <meshStandardMaterial roughness={1} vertexColors />
      </instancedMesh>
      <instancedMesh ref={flowerMesh} args={[undefined, undefined, flowerCount]}>
        <octahedronGeometry args={[0.07, 0]} />
        <meshBasicMaterial vertexColors toneMapped={false} />
      </instancedMesh>
    </>
  )
}


function Crate({ x, z, rotation = 0 }: { x: number; z: number; rotation?: number }) {
  if (isNearBuilding(x, z, 0.65)) return null
  const y = terrainHeight(x, z)
  const wood = getPixelTexture('crate-wood', '#6b4933', '#2f2018', 'wood')
  return (
    <group position={[x, y, z]} rotation-y={rotation}>
      <mesh position={[0, 0.36, 0]}>
        <boxGeometry args={[0.7, 0.7, 0.7]} />
        <meshStandardMaterial map={wood} color="#9a704f" roughness={1} />
      </mesh>
      <mesh position={[0, 0.36, 0.36]}>
        <boxGeometry args={[0.78, 0.08, 0.08]} />
        <meshStandardMaterial color="#3a281e" roughness={1} />
      </mesh>
      <mesh position={[0, 0.36, -0.36]}>
        <boxGeometry args={[0.78, 0.08, 0.08]} />
        <meshStandardMaterial color="#3a281e" roughness={1} />
      </mesh>
    </group>
  )
}

function Barrel({ x, z }: { x: number; z: number }) {
  if (isNearBuilding(x, z, 0.65)) return null
  const y = terrainHeight(x, z)
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.32, 0.36, 0.84, 10]} />
        <meshStandardMaterial
          map={getPixelTexture('barrel-wood', '#6c4a32', '#2e2119', 'wood')}
          color="#8c6447"
          roughness={1}
        />
      </mesh>
      {[-0.25, 0.25].map((yy) => (
        <mesh key={yy} position={[0, 0.42 + yy, 0]}>
          <torusGeometry args={[0.34, 0.025, 5, 12]} />
          <meshStandardMaterial color="#2e3034" roughness={0.7} metalness={0.2} />
        </mesh>
      ))}
    </group>
  )
}

function Bench({ x, z, rotation = 0 }: { x: number; z: number; rotation?: number }) {
  if (isNearBuilding(x, z, 1.2)) return null
  const y = terrainHeight(x, z)
  return (
    <group position={[x, y, z]} rotation-y={rotation}>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1.8, 0.16, 0.5]} />
        <meshStandardMaterial color="#684b35" roughness={1} />
      </mesh>
      <mesh position={[0, 0.95, 0.2]} rotation-x={-0.12}>
        <boxGeometry args={[1.8, 0.16, 0.55]} />
        <meshStandardMaterial color="#60432f" roughness={1} />
      </mesh>
      {[-0.65, 0.65].map((xx) => (
        <mesh key={xx} position={[xx, 0.25, 0]}>
          <boxGeometry args={[0.12, 0.5, 0.38]} />
          <meshStandardMaterial color="#31261f" roughness={1} />
        </mesh>
      ))}
    </group>
  )
}

function Well() {
  const x = 2.8
  const z = 1.8
  const y = terrainHeight(x, z)
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.9, 1.0, 1.0, 12, 1, true]} />
        <meshStandardMaterial
          map={getPixelTexture('well-stone', '#77746c', '#4f4d47', 'brick')}
          color="#a19d94"
          roughness={1}
          side={THREE.DoubleSide}
        />
      </mesh>
      {[-0.8, 0.8].map((xx) => (
        <mesh key={xx} position={[xx, 1.65, 0]}>
          <boxGeometry args={[0.12, 2.2, 0.12]} />
          <meshStandardMaterial color="#4d3728" roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, 2.52, 0]} rotation-z={0.22}>
        <boxGeometry args={[2.15, 0.14, 1.35]} />
        <meshStandardMaterial color="#3d3027" roughness={1} />
      </mesh>
      <mesh position={[0, 1.45, 0]}>
        <cylinderGeometry args={[0.11, 0.11, 1.35, 8]} />
        <meshStandardMaterial color="#473225" roughness={1} />
      </mesh>
    </group>
  )
}

function Signpost() {
  const x = -2.8
  const z = 5.4
  const y = terrainHeight(x, z)
  return (
    <group position={[x, y, z]} rotation-y={0.4}>
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[0.13, 2.2, 0.13]} />
        <meshStandardMaterial color="#4c3627" roughness={1} />
      </mesh>
      <mesh position={[0.62, 1.72, 0]}>
        <boxGeometry args={[1.35, 0.38, 0.14]} />
        <meshStandardMaterial color="#75543b" roughness={1} />
      </mesh>
      <mesh position={[-0.5, 1.22, 0]}>
        <boxGeometry args={[1.1, 0.34, 0.14]} />
        <meshStandardMaterial color="#674832" roughness={1} />
      </mesh>
    </group>
  )
}

function Fence({ x, z, length = 5, rotation = 0 }: { x: number; z: number; length?: number; rotation?: number }) {
  if (fenceHitsBuilding(x, z, length, rotation)) return null
  const y = terrainHeight(x, z)
  const posts = Math.max(2, Math.round(length / 1.2))
  return (
    <group position={[x, y, z]} rotation-y={rotation}>
      {Array.from({ length: posts + 1 }, (_, i) => {
        const px = -length / 2 + (length / posts) * i
        return (
          <mesh key={i} position={[px, 0.62, 0]}>
            <boxGeometry args={[0.12, 1.24, 0.12]} />
            <meshStandardMaterial color="#5b412f" roughness={1} />
          </mesh>
        )
      })}
      <mesh position={[0, 0.82, 0]}>
        <boxGeometry args={[length, 0.11, 0.11]} />
        <meshStandardMaterial color="#674a35" roughness={1} />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[length, 0.1, 0.1]} />
        <meshStandardMaterial color="#604430" roughness={1} />
      </mesh>
    </group>
  )
}

function HandCart() {
  const x = 6.8
  const z = 5.7
  if (isNearBuilding(x, z, 1.1)) return null
  const y = terrainHeight(x, z)
  return (
    <group position={[x, y, z]} rotation-y={-0.35}>
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[1.5, 0.65, 1.05]} />
        <meshStandardMaterial map={getPixelTexture('cart-wood', '#755139', '#332219', 'wood')} color="#8d6749" roughness={1} />
      </mesh>
      {[-0.62, 0.62].map((xx) => (
        <mesh key={xx} position={[xx, 0.38, 0.58]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.34, 0.07, 6, 12]} />
          <meshStandardMaterial color="#382921" roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, 0.38, -1.15]}>
        <boxGeometry args={[0.12, 0.12, 1.8]} />
        <meshStandardMaterial color="#5a3e2d" roughness={1} />
      </mesh>
    </group>
  )
}

function LanternPost({ x, z }: { x: number; z: number }) {
  if (isNearBuilding(x, z, 0.8)) return null
  const y = terrainHeight(x, z)
  const light = useRef<THREE.PointLight>(null)
  useFrame(() => {
    if (light.current) light.current.intensity = THREE.MathUtils.lerp(7.5, 0.15, worldDaylight)
  })
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 1.3, 0]}>
        <cylinderGeometry args={[0.045, 0.07, 2.6, 8]} />
        <meshStandardMaterial color="#232323" roughness={0.8} />
      </mesh>
      <mesh position={[0, 2.42, 0]}>
        <boxGeometry args={[0.38, 0.52, 0.38]} />
        <meshStandardMaterial color="#d8b15f" emissive="#b76d24" emissiveIntensity={1.1} roughness={0.5} />
      </mesh>
      <pointLight ref={light} position={[0, 2.38, 0]} color="#ffc56c" intensity={2} distance={7} decay={2} />
    </group>
  )
}

function AtmosphereMotes() {
  const points = useRef<THREE.Points>(null)
  const geometry = useMemo(() => {
    const positions: number[] = []
    for (let i = 0; i < 180; i += 1) {
      positions.push(
        -45 + seeded(i + 5100) * 90,
        0.8 + seeded(i + 5200) * 8,
        -45 + seeded(i + 5300) * 90,
      )
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return geo
  }, [])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame((state, delta) => {
    if (!points.current) return
    points.current.rotation.y += delta * 0.004
    points.current.position.y = Math.sin(state.clock.elapsedTime * 0.08) * 0.08
  })

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial color="#e7d8a1" size={0.045} transparent opacity={0.22} depthWrite={false} sizeAttenuation />
    </points>
  )
}

function VillageProps() {
  return (
    <>
      <Well />
      <Signpost />
      <Bench x={-3.9} z={2.2} rotation={0.15} />
      <Bench x={4.2} z={1.8} rotation={-0.25} />
      <Crate x={-3.8} z={-7.0} rotation={0.2} />
      <Crate x={-3.15} z={-6.7} rotation={-0.15} />
      <Crate x={10.8} z={-7.2} rotation={0.5} />
      <Barrel x={-6.5} z={3.7} />
      <Barrel x={-5.9} z={3.4} />
      <Barrel x={11.5} z={5.2} />
      <Fence x={-17.5} z={11.0} length={5.0} rotation={0.0} />
      <Fence x={18.5} z={8.3} length={4.8} rotation={Math.PI / 2} />
      <Fence x={-11.5} z={-13.2} length={5.0} rotation={0.0} />
      <HandCart />
      <LanternPost x={-2.8} z={-1.2} />
      <LanternPost x={3.0} z={3.2} />
      <LanternPost x={-5.0} z={7.0} />
    </>
  )
}

function Rock({ x, z, index }: { x: number; z: number; index: number }) {
  return (
    <mesh
      position={[x, terrainHeight(x, z) + 0.28, z]}
      rotation={[0.15, index * 0.91, -0.08]}
    >
      <dodecahedronGeometry args={[0.45 + (index % 3) * 0.12, 0]} />
      <meshStandardMaterial
        map={getPixelTexture('rock-stone', '#79766c', '#4e4c46', 'noise')}
        color="#9a978b"
        roughness={1}
        flatShading
      />
    </mesh>
  )
}

function Pond() {
  const x = 31
  const z = 30
  const bankY = terrainHeight(x, z)

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[x, -1.45, z]}>
        <circleGeometry args={[7.4, 40]} />
        <meshStandardMaterial color="#405f66" transparent opacity={0.84} roughness={0.2} metalness={0.08} />
      </mesh>

      {Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * Math.PI * 2
        const radius = 7.1 + (i % 3) * 0.24
        const rx = x + Math.cos(a) * radius
        const rz = z + Math.sin(a) * radius
        return (
          <mesh key={i} position={[rx, terrainHeight(rx, rz) + 0.16, rz]} rotation={[0.12, a, -0.08]}>
            <dodecahedronGeometry args={[0.28 + (i % 4) * 0.045, 0]} />
            <meshStandardMaterial color={i % 2 ? '#696d63' : '#77796f'} roughness={1} flatShading />
          </mesh>
        )
      })}

      <group position={[x - 1.2, bankY + 0.28, z - 0.5]} rotation-y={0.2}>
        {[-1.5, -0.75, 0, 0.75, 1.5].map((offset) => (
          <mesh key={offset} position={[offset, 0, 0]}>
            <boxGeometry args={[0.62, 0.16, 2.4]} />
            <meshStandardMaterial
              map={getPixelTexture('bridge-plank', '#72513a', '#33231a', 'wood')}
              color="#8b674c"
              roughness={1}
            />
          </mesh>
        ))}
        {[-1.8, 1.8].map((offset) => (
          <mesh key={offset} position={[offset, 0.35, 0]}>
            <boxGeometry args={[0.12, 0.7, 2.6]} />
            <meshStandardMaterial color="#493326" roughness={1} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function Ruins() {
  const x = -42
  const z = 28
  const y = terrainHeight(x, z)
  const stone = getPixelTexture('ruin-stone', '#77756d', '#4c4a45', 'noise')

  return (
    <group position={[x, y, z]}>
      {[-3.2, 0, 3.1].map((offset, i) => (
        <mesh key={offset} position={[offset, 1.3 + i * 0.12, 0]} rotation-z={i === 0 ? -0.06 : i === 2 ? 0.08 : 0}>
          <cylinderGeometry args={[0.42, 0.56, 2.6 + i * 0.35, 7]} />
          <meshStandardMaterial map={stone} color="#aaa69c" flatShading roughness={1} />
        </mesh>
      ))}

      <mesh position={[-1.6, 2.75, 0]}>
        <boxGeometry args={[2.7, 0.48, 0.72]} />
        <meshStandardMaterial map={stone} color="#9b988f" roughness={1} />
      </mesh>
      <mesh position={[1.65, 2.35, 0]} rotation-z={-0.11}>
        <boxGeometry args={[2.4, 0.42, 0.7]} />
        <meshStandardMaterial map={stone} color="#8f8c84" roughness={1} />
      </mesh>

      <mesh position={[0, 0.34, -2.8]} rotation-y={0.05}>
        <boxGeometry args={[7.5, 0.68, 1]} />
        <meshStandardMaterial map={stone} color="#89867d" roughness={1} flatShading />
      </mesh>

      {[
        [-2.8, 0.25, -1.7, 0.2],
        [2.4, 0.3, -2.0, -0.45],
        [0.8, 0.2, 1.7, 0.7],
        [-0.9, 0.18, 2.1, -0.3],
      ].map(([rx, ry, rz, rot], i) => (
        <mesh key={i} position={[rx, ry, rz]} rotation={[0.2, rot, 0.12]}>
          <boxGeometry args={[1.15, 0.42, 0.6]} />
          <meshStandardMaterial map={stone} color="#817e76" roughness={1} />
        </mesh>
      ))}

      <group position={[0.3, 0.05, 1.0]}>
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.55, 0.7, 0.38, 9]} />
          <meshStandardMaterial color="#41372f" roughness={1} />
        </mesh>
        <pointLight position={[0, 0.75, 0]} color="#ff9b4d" intensity={5} distance={5} decay={2} />
        <mesh position={[0, 0.58, 0]}>
          <coneGeometry args={[0.22, 0.7, 7]} />
          <meshBasicMaterial color="#ef8a37" transparent opacity={0.72} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

function HillMarker() {
  const x = 39
  const z = -33
  const y = terrainHeight(x, z)
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 2.3, 0]}>
        <cylinderGeometry args={[1.6, 2.1, 4.6, 8]} />
        <meshStandardMaterial color="#55524d" flatShading roughness={1} />
      </mesh>
      <mesh position={[0, 5.15, 0]}>
        <coneGeometry args={[2.25, 1.8, 8]} />
        <meshStandardMaterial color="#312d2b" flatShading roughness={1} />
      </mesh>
      <pointLight position={[0, 4.2, 0]} color="#ffb45c" intensity={12} distance={10} />
    </group>
  )
}



function InteractionController() {
  const { camera, scene } = useThree()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const center = useMemo(() => new THREE.Vector2(0, 0), [])
  const currentTarget = useRef<THREE.Object3D | null>(null)
  const currentIndex = useRef<number | null>(null)
  const lastReportedIndex = useRef<number | null>(null)
  const worldPosition = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    const interact = () => {
      const target = currentTarget.current
      const index = currentIndex.current
      if (!target || index == null || activeNpcIndex != null) return

      const data = npcData[index]
      if (!data) return

      const root = target.parent
      if (!root) return

      root.getWorldPosition(worldPosition)
      activeNpcIndex = index

      window.dispatchEvent(new CustomEvent('game-focus-npc', {
        detail: {
          x: worldPosition.x,
          y: worldPosition.y + 1.45,
          z: worldPosition.z,
        },
      }))

      window.dispatchEvent(new CustomEvent('game-npc-dialogue', {
        detail: {
          index,
          name: data.name,
          greeting: data.greeting,
          options: [...data.options],
        },
      }))
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'e') interact()
    }

    window.addEventListener('game-interact', interact)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('game-interact', interact)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [worldPosition])

  useFrame(() => {
    if (activeNpcIndex != null) {
      currentTarget.current = null
      currentIndex.current = null
      if (lastReportedIndex.current !== null) {
        lastReportedIndex.current = null
        window.dispatchEvent(new CustomEvent('game-interact-target', { detail: null }))
      }
      return
    }

    raycaster.setFromCamera(center, camera)
    raycaster.far = 4.5

    const hits = raycaster.intersectObjects(scene.children, true)
    const hit = hits.find((entry) => typeof entry.object.userData.npcIndex === 'number')

    const target = hit?.object ?? null
    const index = target ? Number(target.userData.npcIndex) : null

    currentTarget.current = target
    currentIndex.current = index

    if (index !== lastReportedIndex.current) {
      lastReportedIndex.current = index
      window.dispatchEvent(new CustomEvent('game-interact-target', {
        detail: index == null
          ? null
          : {
              index,
              name: String(target?.userData.npcName ?? npcData[index]?.name ?? 'NPC'),
            },
      }))
    }
  })

  return null
}

function DayNight() {
  const sun = useRef<THREE.DirectionalLight>(null)
  const moon = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const ambient = useRef<THREE.AmbientLight>(null)
  const sunDisc = useRef<THREE.Mesh>(null)
  const moonDisc = useRef<THREE.Mesh>(null)
  const { scene } = useThree()
  const clock = useRef(0.20)
  const night = useMemo(() => new THREE.Color('#02040a'), [])
  const dusk = useMemo(() => new THREE.Color('#8c5960'), [])
  const day = useMemo(() => new THREE.Color('#82b0d6'), [])
  const sky = useMemo(() => new THREE.Color(), [])

  useFrame((_, delta) => {
    clock.current = (clock.current + delta * 0.012) % 1
    const angle = clock.current * Math.PI * 2 - Math.PI / 2
    const sunHeight = Math.sin(angle)
    const daylight = THREE.MathUtils.smoothstep(sunHeight, -0.10, 0.30)
    const twilight = Math.max(0, 1 - Math.abs(sunHeight) * 4)
    worldDaylight = daylight

    const sx = Math.cos(angle) * 70
    const sy = sunHeight * 60
    const sz = Math.sin(angle) * 45

    if (sun.current) {
      sun.current.position.set(sx, sy, sz)
      sun.current.intensity = daylight * 5.2
      sun.current.color.set(daylight < 0.5 ? '#ff9d68' : '#fff2d5')
    }

    if (moon.current) {
      moon.current.position.set(-sx, -sy, -sz)
      moon.current.intensity = (1 - daylight) * 0.65
    }

    if (sunDisc.current) {
      sunDisc.current.position.set(sx * 0.72, Math.max(-28, sy * 0.72), sz * 0.72)
      sunDisc.current.visible = sunHeight > -0.18
    }

    if (moonDisc.current) {
      moonDisc.current.position.set(-sx * 0.66, Math.max(-28, -sy * 0.66), -sz * 0.66)
      moonDisc.current.visible = sunHeight < 0.18
    }

    if (hemi.current) {
      hemi.current.intensity = 0.03 + daylight * 1.0
      hemi.current.color.set(daylight > 0.3 ? '#c8ddf0' : '#2f3b59')
      hemi.current.groundColor.set(daylight > 0.3 ? '#4e4631' : '#080a10')
    }

    if (ambient.current) {
      ambient.current.intensity = 0.005 + daylight * 0.11
    }

    sky.copy(night).lerp(day, daylight)
    if (twilight > 0.02) sky.lerp(dusk, twilight * 0.42)
    scene.background = sky
    scene.fog = new THREE.FogExp2(sky, 0.007 + (1 - daylight) * 0.017)
  })

  return (
    <>
      <ambientLight ref={ambient} intensity={0.04} color="#dce8f2" />
      <hemisphereLight ref={hemi} args={['#c8ddf0', '#4e4631', 0.9]} />
      <directionalLight ref={sun} intensity={4.5} position={[25, 35, 18]} color="#fff2d5" />
      <directionalLight ref={moon} intensity={0.1} position={[-20, 22, -15]} color="#7d91cf" />

      <mesh ref={sunDisc}>
        <sphereGeometry args={[2.4, 12, 12]} />
        <meshBasicMaterial color="#ffd77d" toneMapped={false} />
      </mesh>
      <mesh ref={moonDisc}>
        <sphereGeometry args={[1.7, 12, 12]} />
        <meshBasicMaterial color="#dbe5ff" toneMapped={false} />
      </mesh>
    </>
  )
}

export default function GameWorld() {
  return (
    <>
      <PlayerController />
      <InteractionController />
      <DayNight />
      <Terrain />
      <GrassField />
      <ReedsAndFlowers />
      <VillageProps />
      <AtmosphereMotes />
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

      <mesh position={[0, 0.2, -2]}>
        <boxGeometry args={[3, 0.4, 3]} />
        <meshStandardMaterial color="#777166" roughness={1} flatShading />
      </mesh>

      <mesh position={[0, 1.4, -2.2]}>
        <cylinderGeometry args={[0.05, 0.08, 2.4, 8]} />
        <meshStandardMaterial color="#252525" roughness={0.8} />
      </mesh>
      <mesh position={[0, 2.55, -2.2]}>
        <boxGeometry args={[0.9, 0.38, 0.12]} />
        <meshStandardMaterial color="#f2d38b" emissive="#7b4b18" emissiveIntensity={0.8} roughness={0.5} />
      </mesh>
      <pointLight position={[0, 2.45, -2.2]} color="#ffd58c" intensity={8} distance={6} decay={2} />
    </>
  )
}
