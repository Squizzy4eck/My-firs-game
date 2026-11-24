import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  applyRealCarQuality,
  getRealCarModelKeyForPlayer,
  getRealCarModelKeyForTraffic,
  instantiateRealCarModel,
  onRealCarModelReady,
  preloadAllRealCarModels,
  RealCarModelKey,
  setRealCarPaintColor,
} from './carModels';
import { Highway3DEngine } from './engine';
import { Language, TRANSLATIONS } from './i18n';
import {
  CameraMode,
  GraphicsQuality,
  isMotorcycleArchetype,
  PLAYER_CARS,
  PlayerArchetype,
  PlayerCarId,
  PlayerCarOption,
  PickupItem,
  TimeOfDay,
  TOTAL_ASPHALT_WIDTH_3D,
  TrafficKind,
  TrafficVehicle,
} from './types';

// Reusable scratch math helpers (zero GC in render loop)
const _dummy = new THREE.Object3D();
const _targetPos = new THREE.Vector3();
const _targetLook = new THREE.Vector3();
const _currentLook = new THREE.Vector3(0, 1.0, -14);
const _color = new THREE.Color();
const _gripPos = new THREE.Vector3();
const _gripQuat = new THREE.Quaternion();
const _shiftPos = new THREE.Vector3();
const _shiftQuat = new THREE.Quaternion();
const _handPos = new THREE.Vector3();
const _armDir = new THREE.Vector3();
const _armMid = new THREE.Vector3();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _elbowLeft = new THREE.Vector3(-0.56, 0.72, 0.22);
const _elbowRight = new THREE.Vector3(-0.1, 0.7, 0.21);

const GEAR_GATE_ANGLES: Record<number, { rx: number; rz: number }> = {
  1: { rx: -0.18, rz: 0.16 },
  2: { rx: 0.18, rz: 0.16 },
  3: { rx: -0.18, rz: 0.0 },
  4: { rx: 0.18, rz: 0.0 },
  5: { rx: -0.18, rz: -0.16 },
  6: { rx: 0.18, rz: -0.16 },
};

export function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createRoadTexture(maxAnisotropy: number, isNight: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Base shoulder + asphalt
  ctx.fillStyle = isNight ? '#222836' : '#2E333F';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle asphalt aggregate noise
  for (let i = 0; i < 2400; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = Math.random() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${isNight ? 0.03 : 0.045})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Road proportions inside TOTAL_ASPHALT_WIDTH_3D = 14.6m (shoulder 1.6m each side, road 11.4m)
  const shoulderPx = (1.6 / TOTAL_ASPHALT_WIDTH_3D) * 512; // ~56px
  const roadPx = 512 - shoulderPx * 2; // ~400px
  const lanePx = roadPx / 3;

  // Alternating red/white curb strips on outer edge
  const curbW = 14;
  const segH = 64;
  for (let y = 0; y < 512; y += segH) {
    const isRed = Math.floor(y / segH) % 2 === 0;
    ctx.fillStyle = isRed
      ? isNight ? '#991B1B' : '#DC2626'
      : isNight ? '#94A3B8' : '#E2E8F0';
    ctx.fillRect(0, y, curbW, segH);
    ctx.fillRect(512 - curbW, y, curbW, segH);
  }

  // Subtle tire wear tracks along the 3 lanes
  ctx.fillStyle = isNight ? 'rgba(8, 10, 14, 0.35)' : 'rgba(15, 18, 24, 0.2)';
  for (let lane = 0; lane < 3; lane++) {
    const cx = shoulderPx + lane * lanePx + lanePx / 2;
    ctx.fillRect(cx - 24, 0, 14, 512);
    ctx.fillRect(cx + 10, 0, 14, 512);
  }

  // Solid edge lines
  ctx.fillStyle = isNight ? 'rgba(226, 232, 240, 0.8)' : 'rgba(248, 250, 252, 0.92)';
  ctx.fillRect(shoulderPx - 3, 0, 6, 512);
  ctx.fillRect(512 - shoulderPx - 3, 0, 6, 512);

  // Dashed lane lines separating the 3 lanes
  ctx.fillStyle = isNight ? 'rgba(248, 250, 252, 0.85)' : '#FFFFFF';
  for (let div = 1; div <= 2; div++) {
    const lx = shoulderPx + div * lanePx - 3;
    for (let y = 24; y < 512; y += 128) {
      ctx.fillRect(lx, y, 6, 68);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 20);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createTerrainTexture(maxAnisotropy: number, isNight: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = isNight ? '#13201A' : '#2B4229';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.fillStyle = Math.random() > 0.5
      ? isNight ? 'rgba(20, 45, 32, 0.35)' : 'rgba(54, 90, 48, 0.35)'
      : 'rgba(0, 0, 0, 0.14)';
    ctx.fillRect(x, y, 4, 4);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 32);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 14, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.72)');
  grad.addColorStop(0.65, 'rgba(0,0,0,0.32)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createHeadlightBeamTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Draw two overlapping soft elliptical headlight pools with smooth feathered falloff
  for (const cx of [98, 158]) {
    ctx.save();
    ctx.translate(cx, 146);
    ctx.scale(0.68, 1.35);
    const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, 96);
    grad.addColorStop(0, 'rgba(254, 249, 195, 0.36)');
    grad.addColorStop(0.38, 'rgba(254, 243, 199, 0.16)');
    grad.addColorStop(0.75, 'rgba(254, 243, 199, 0.04)');
    grad.addColorStop(1, 'rgba(254, 243, 199, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 96, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createLampGlowConeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(254, 243, 199, 0.52)');
  grad.addColorStop(0.35, 'rgba(253, 230, 138, 0.18)');
  grad.addColorStop(0.75, 'rgba(253, 230, 138, 0.04)');
  grad.addColorStop(1, 'rgba(253, 230, 138, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createRoadRoughnessTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  // Dry matte asphalt roughness (~222 -> ~0.87) to avoid mirror-like road glare
  ctx.fillStyle = 'rgb(222, 222, 222)';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle worn tire tracks (slightly smoother, ~0.75, without wet-mirror reflections)
  const shoulderPx = (1.6 / TOTAL_ASPHALT_WIDTH_3D) * 256;
  const roadPx = 256 - shoulderPx * 2;
  const lanePx = roadPx / 3;
  ctx.fillStyle = 'rgb(192, 192, 192)';
  for (let lane = 0; lane < 3; lane++) {
    const cx = shoulderPx + lane * lanePx + lanePx / 2;
    ctx.fillRect(cx - 12, 0, 7, 256);
    ctx.fillRect(cx + 5, 0, 7, 256);
  }

  for (let i = 0; i < 1200; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const v = 205 + Math.floor(Math.random() * 44);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 20);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createMoonTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(0, 0, 256, 256);

  const craters = [
    [70, 90, 24],
    [150, 72, 18],
    [118, 148, 30],
    [186, 166, 20],
    [62, 178, 15],
    [136, 48, 12],
  ];
  for (const [cx, cy, r] of craters) {
    const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    g.addColorStop(0, 'rgba(148, 163, 184, 0.55)');
    g.addColorStop(0.85, 'rgba(100, 116, 139, 0.35)');
    g.addColorStop(1, 'rgba(226, 232, 240, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createCelestialGlowTexture(innerRgba: string, midRgba: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  grad.addColorStop(0, innerRgba);
  grad.addColorStop(0.35, midRgba);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildSkyEnvironment(
  pmrem: THREE.PMREMGenerator,
  isNight: boolean
): THREE.WebGLRenderTarget {
  const envScene = new RoomEnvironment();
  // Add a bright directional sky-source sphere aligned with the Moon/Sun at (+28, +38, -170)
  const dir = new THREE.Vector3(28, 38, -170).normalize().multiplyScalar(18);
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(isNight ? 1.8 : 2.6, 16, 16),
    new THREE.MeshBasicMaterial({
      color: isNight ? new THREE.Color(1.8, 2.1, 2.8) : new THREE.Color(4.5, 4.0, 2.8),
    })
  );
  orb.position.copy(dir);
  envScene.add(orb);

  if (isNight) {
    envScene.background = new THREE.Color('#131C31');
  } else {
    envScene.background = new THREE.Color('#7EC0EE');
  }

  const rt = pmrem.fromScene(envScene, 0.03);
  orb.geometry.dispose();
  (orb.material as THREE.Material).dispose();
  envScene.dispose();
  return rt;
}

function createSpeedoDialTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#09101D';
  ctx.fillRect(0, 0, 256, 256);

  const cx = 128;
  const cy = 128;
  const grad = ctx.createRadialGradient(cx, cy, 20, cx, cy, 124);
  grad.addColorStop(0, '#0F1E36');
  grad.addColorStop(0.85, '#09101D');
  grad.addColorStop(1, '#38BDF8');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 122, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const angle = Math.PI * 0.75 + t * Math.PI * 1.5;
    const isRed = i >= 8;
    ctx.strokeStyle = isRed ? '#EF4444' : '#7DD3FC';
    ctx.lineWidth = i % 2 === 0 ? 5 : 2.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * 86, cy + Math.sin(angle) * 86);
    ctx.lineTo(cx + Math.cos(angle) * 108, cy + Math.sin(angle) * 108);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function drawCenterScreen(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  tex: THREE.CanvasTexture,
  gear: number,
  isNitro: boolean,
  lang: Language = 'ru'
) {
  const tr = TRANSLATIONS[lang];
  ctx.fillStyle = '#07111E';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = isNitro ? '#38BDF8' : '#0284C7';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

  ctx.fillStyle = '#94A3B8';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(tr.cockpitGear, 16, 30);

  ctx.fillStyle = isNitro ? '#38BDF8' : '#FBBF24';
  ctx.font = 'bold 64px monospace';
  ctx.fillText(`M${gear}`, 16, 102);

  // Mini H-pattern indicator on the right
  const gx = 165;
  const gy = 26;
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(gx, gy + 12);
  ctx.lineTo(gx, gy + 72);
  ctx.moveTo(gx + 32, gy + 12);
  ctx.lineTo(gx + 32, gy + 72);
  ctx.moveTo(gx + 64, gy + 12);
  ctx.lineTo(gx + 64, gy + 72);
  ctx.moveTo(gx, gy + 42);
  ctx.lineTo(gx + 64, gy + 42);
  ctx.stroke();

  const col = Math.floor((gear - 1) / 2);
  const row = (gear - 1) % 2;
  ctx.fillStyle = isNitro ? '#38BDF8' : '#FBBF24';
  ctx.beginPath();
  ctx.arc(gx + col * 32, gy + (row === 0 ? 12 : 72), 9, 0, Math.PI * 2);
  ctx.fill();

  if (isNitro) {
    ctx.fillStyle = '#0EA5E9';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(tr.cockpitNitro, 165, 118);
  }

  tex.needsUpdate = true;
}

function buildDriverHand(
  side: 'left' | 'right'
): THREE.Group {
  const hand = new THREE.Group();
  const inward = side === 'left' ? 1 : -1;

  const gloveMat = new THREE.MeshStandardMaterial({
    color: '#1E293B',
    roughness: 0.56,
    metalness: 0.12,
  });
  const palmPadMat = new THREE.MeshStandardMaterial({
    color: '#0F172A',
    roughness: 0.75,
    metalness: 0.05,
  });
  const cuffMat = new THREE.MeshStandardMaterial({
    color: '#111827',
    roughness: 0.72,
    metalness: 0.1,
  });

  // Wrist cuff at origin (meets forearm cleanly)
  const cuff = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.039, 0.036, 12),
    cuffMat
  );
  cuff.rotation.x = Math.PI / 2;
  cuff.position.set(0, 0, 0.014);
  hand.add(cuff);

  // Clean matte leather wrist strap & padded knuckle (no metallic hardware on hand)
  const strap = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.064, 0.012),
    cuffMat
  );
  strap.position.set(-inward * 0.004, 0, -0.005);
  hand.add(strap);

  // Sculpted glove palm (extends forward along -Z)
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.068, 0.074), gloveMat);
  palm.position.set(0, 0, -0.042);
  hand.add(palm);

  // Inner grip pad & padded matte knuckle protector
  const innerPad = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.058, 0.058), palmPadMat);
  innerPad.position.set(inward * 0.013, -0.002, -0.044);
  hand.add(innerPad);

  const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.062, 0.022), cuffMat);
  knuckle.position.set(-inward * 0.012, 0.002, -0.064);
  hand.add(knuckle);

  // 4 Articulated curled fingers wrapping inward around wheel rim / shift knob
  const fingerYs = [0.024, 0.008, -0.008, -0.024];
  const fingerLens = [0.03, 0.034, 0.032, 0.026];
  for (let i = 0; i < 4; i++) {
    const fRoot = new THREE.Group();
    fRoot.position.set(inward * 0.003, fingerYs[i], -0.076);
    fRoot.rotation.y = inward * 0.42;

    const prox = new THREE.Mesh(
      new THREE.BoxGeometry(0.015, 0.013, fingerLens[i]),
      gloveMat
    );
    prox.position.set(0, 0, -fingerLens[i] * 0.5);
    fRoot.add(prox);

    const distGroup = new THREE.Group();
    distGroup.position.set(0, 0, -fingerLens[i] * 0.92);
    distGroup.rotation.y = inward * 0.98;
    const dist = new THREE.Mesh(
      new THREE.BoxGeometry(0.013, 0.0115, fingerLens[i] * 0.85),
      gloveMat
    );
    dist.position.set(0, 0, -fingerLens[i] * 0.42);
    distGroup.add(dist);
    fRoot.add(distGroup);

    hand.add(fRoot);
  }

  // Articulated thumb resting along upper-inner side of rim / knob
  const thumbRoot = new THREE.Group();
  thumbRoot.position.set(inward * 0.009, 0.032, -0.034);
  thumbRoot.rotation.set(-0.34, inward * 0.48, -inward * 0.22);
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 0.042), gloveMat);
  thumb.position.set(0, 0, -0.02);
  thumbRoot.add(thumb);
  hand.add(thumbRoot);

  return hand;
}

interface PlayerCarRig {
  archetype: PlayerArchetype;
  isMotorcycle: boolean;
  carColor: string;
  realModelKey: RealCarModelKey | null;
  realModelGroup: THREE.Group | null;
  proceduralExteriorGroup: THREE.Group;
  proceduralWheelsGroup: THREE.Group;
  cockpitOffsetY: number;
  cockpitOffsetZ: number;
  root: THREE.Group;
  bodyGroup: THREE.Group;
  bodyMat: THREE.MeshPhysicalMaterial;
  accentMat: THREE.MeshStandardMaterial;
  stripeMat: THREE.MeshStandardMaterial;
  tailLightMat: THREE.MeshStandardMaterial;
  headLightMat: THREE.MeshStandardMaterial;
  policeRedMat: THREE.MeshStandardMaterial | null;
  policeBlueMat: THREE.MeshStandardMaterial | null;
  tankMuzzleFlash: THREE.Mesh | null;
  turretGroup: THREE.Group | null;
  steeringWheel: THREE.Group;
  leftGripAnchor: THREE.Object3D;
  rightGripAnchor: THREE.Object3D;
  gearLeverPivot: THREE.Group;
  shifterGripAnchor: THREE.Object3D;
  driverArmsGroup: THREE.Group;
  leftHandGroup: THREE.Group;
  rightHandGroup: THREE.Group;
  leftForearmMesh: THREE.Mesh;
  rightForearmMesh: THREE.Mesh;
  speedoNeedle: THREE.Group;
  cabinInteriorGroup: THREE.Group;
  centerScreenCanvas: HTMLCanvasElement;
  centerScreenCtx: CanvasRenderingContext2D;
  centerScreenTex: THREE.CanvasTexture;
  speedoDialTex: THREE.CanvasTexture;
  lastScreenGear: number;
  lastScreenNitro: boolean;
  frontWheelPivots: THREE.Group[];
  wheelSpinMeshes: THREE.Mesh[];
  roofMesh: THREE.Mesh;
  windshieldMesh: THREE.Mesh;
  windshieldMat: THREE.MeshPhysicalMaterial;
  shadowPlane: THREE.Mesh;
  nitroFlames: THREE.Group;
  headlightLeft: THREE.SpotLight;
  headlightRight: THREE.SpotLight;
  headlightBeamPlane: THREE.Mesh;
}

function createWheelMesh(radius: number, width: number): THREE.Group {
  const wheel = new THREE.Group();
  const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 18);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({
    color: '#111827',
    roughness: 0.85,
    metalness: 0.1,
  });
  const tire = new THREE.Mesh(tireGeo, tireMat);
  tire.castShadow = true;
  wheel.add(tire);

  const rimGeo = new THREE.CylinderGeometry(radius * 0.6, radius * 0.6, width + 0.02, 12);
  rimGeo.rotateZ(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({
    color: '#CBD5E1',
    roughness: 0.25,
    metalness: 0.88,
  });
  const rim = new THREE.Mesh(rimGeo, rimMat);
  wheel.add(rim);

  return wheel;
}

function buildPlayerCar(
  carOpt: PlayerCarOption,
  shadowTex: THREE.CanvasTexture,
  beamTex: THREE.CanvasTexture,
  isSoftwareGl: boolean,
  lang: Language
): PlayerCarRig {
  const arch = carOpt.archetype;
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  const proceduralExteriorGroup = new THREE.Group();
  const proceduralWheelsGroup = new THREE.Group();
  root.add(bodyGroup);
  bodyGroup.add(proceduralExteriorGroup);
  root.add(proceduralWheelsGroup);

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: carOpt.bodyColor,
    metalness: arch === 'tank' ? 0.28 : arch === 'sedan' ? 0.25 : 0.55,
    roughness: arch === 'tank' ? 0.68 : arch === 'sedan' ? 0.36 : 0.22,
    clearcoat: arch === 'tank' ? 0.12 : arch === 'sedan' ? 0.45 : 1.0,
    clearcoatRoughness: 0.1,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: carOpt.accentColor,
    metalness: arch === 'tank' ? 0.3 : 0.4,
    roughness: arch === 'tank' ? 0.72 : 0.45,
  });
  const stripeMat = new THREE.MeshStandardMaterial({
    color: carOpt.stripeColor,
    roughness: 0.35,
    metalness: 0.15,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: '#1E293B',
    roughness: 0.75,
    metalness: 0.25,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: '#E2E8F0',
    metalness: 0.92,
    roughness: 0.16,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: '#0B1220',
    roughness: 0.05,
    metalness: 0.1,
    transparent: true,
    opacity: 0.44,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
  });
  const windshieldMat = new THREE.MeshPhysicalMaterial({
    color: '#0B1220',
    roughness: 0.04,
    metalness: 0.12,
    transparent: true,
    opacity: 0.42,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    depthWrite: false,
  });
  const headLightMat = new THREE.MeshStandardMaterial({
    color: '#FEF9C3',
    emissive: '#FEF08A',
    emissiveIntensity: 1.8,
    roughness: 0.2,
  });
  const tailLightMat = new THREE.MeshStandardMaterial({
    color: '#DC2626',
    emissive: '#EF4444',
    emissiveIntensity: 1.2,
    roughness: 0.25,
  });

  const isBike = isMotorcycleArchetype(arch);

  // Contact shadow
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(
      arch === 'tank' ? 2.9 : isBike ? 1.35 : 2.6,
      arch === 'tank' ? 5.6 : isBike ? 2.75 : 5.2
    ),
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.025;
  root.add(shadowPlane);

  let policeRedMat: THREE.MeshStandardMaterial | null = null;
  let policeBlueMat: THREE.MeshStandardMaterial | null = null;
  let tankMuzzleFlash: THREE.Mesh | null = null;
  let turretGroup: THREE.Group | null = null;
  const frontWheelPivots: THREE.Group[] = [];
  const wheelSpinMeshes: THREE.Mesh[] = [];

  const yLift = carOpt.cockpitOffsetY;
  const zShift = carOpt.cockpitOffsetZ;

  let roofMesh: THREE.Mesh;
  let windshieldMesh: THREE.Mesh;

  if (arch === 'tank') {
    // === BATTLE TANK EXTERIOR ===
    const armorDarkMat = new THREE.MeshStandardMaterial({
      color: '#2C3527',
      roughness: 0.78,
      metalness: 0.35,
    });
    const trackBeltMat = new THREE.MeshStandardMaterial({
      color: '#181C18',
      roughness: 0.88,
      metalness: 0.25,
    });

    // Lower Hull + Glacis + Skirts + Turret + Barrel
    const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.56, 4.45), bodyMat);
    lowerHull.position.set(0, 0.62, 0.05);
    lowerHull.castShadow = true;
    lowerHull.receiveShadow = true;
    proceduralExteriorGroup.add(lowerHull);

    // Sloped front glacis armor (kept low so driver cupola has clear view!)
    const glacis = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.24, 1.35), bodyMat);
    glacis.position.set(0, 0.78, -1.68);
    glacis.rotation.x = 0.28;
    glacis.castShadow = true;
    proceduralExteriorGroup.add(glacis);

    // Armored side skirts covering upper tracks
    for (const sx of [-1.04, 1.04]) {
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 4.65), armorDarkMat);
      skirt.position.set(sx, 0.66, 0.02);
      skirt.castShadow = true;
      proceduralExteriorGroup.add(skirt);

      const trackBelt = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.52, 4.55), trackBeltMat);
      trackBelt.position.set(sx, 0.36, 0.02);
      proceduralExteriorGroup.add(trackBelt);
    }

    // 6 spinning road wheels per side
    for (const wx of [-1.06, 1.06]) {
      for (let i = 0; i < 6; i++) {
        const wz = -1.75 + i * 0.7;
        const w = createWheelMesh(0.28, 0.32);
        w.position.set(wx, 0.31, wz);
        proceduralWheelsGroup.add(w);
        wheelSpinMeshes.push(w.children[0] as THREE.Mesh);
      }
    }

    // Armored driver cupola visor frame & slim armored viewport glass
    roofMesh = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.08, 1.25), bodyMat);
    roofMesh.position.set(0, 1.32 + yLift, 0.2 + zShift);
    roofMesh.castShadow = true;
    proceduralExteriorGroup.add(roofMesh);

    windshieldMesh = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.54, 0.04), windshieldMat);
    windshieldMesh.position.set(0, 1.07 + yLift, -0.58 + zShift);
    windshieldMesh.rotation.x = -0.55;
    proceduralExteriorGroup.add(windshieldMesh);

    for (const px of [-0.74, 0.74]) {
      const aPillar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.56, 0.08), armorDarkMat);
      aPillar.position.set(px, 1.07 + yLift, -0.58 + zShift);
      aPillar.rotation.x = -0.55;
      proceduralExteriorGroup.add(aPillar);
    }

    // Armored Rotating Turret mounted slightly rearward (+Z) with 125mm Cannon Barrel forward
    turretGroup = new THREE.Group();
    turretGroup.position.set(0.14, 1.18, 0.68);
    const turretMain = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.46, 1.85), bodyMat);
    turretMain.castShadow = true;
    turretGroup.add(turretMain);

    const turretCheek = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.38, 0.55), armorDarkMat);
    turretCheek.position.set(0, -0.02, -0.95);
    turretCheek.rotation.x = 0.24;
    turretGroup.add(turretCheek);

    const commanderHatch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.26, 0.14, 14),
      armorDarkMat
    );
    commanderHatch.position.set(0.32, 0.28, 0.25);
    turretGroup.add(commanderHatch);

    // ERA Reactive armor blocks along turret sides
    for (const ex of [-0.76, 0.76]) {
      for (let k = 0; k < 3; k++) {
        const era = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.42), accentMat);
        era.position.set(ex, 0.02, -0.45 + k * 0.52);
        turretGroup.add(era);
      }
    }

    // Radio whip antenna
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 1.15, 6), trimMat);
    antenna.position.set(-0.56, 0.78, 0.68);
    turretGroup.add(antenna);

    // 125mm Main Gun Barrel + Bore Evacuator + Muzzle Brake (visible ahead on right in 1st-person!)
    const barrelGeo = new THREE.CylinderGeometry(0.072, 0.088, 2.75, 14);
    barrelGeo.rotateX(Math.PI / 2);
    const barrel = new THREE.Mesh(barrelGeo, armorDarkMat);
    barrel.position.set(0, 0.04, -2.35);
    barrel.castShadow = true;
    turretGroup.add(barrel);

    const evacuatorGeo = new THREE.CylinderGeometry(0.115, 0.115, 0.52, 14);
    evacuatorGeo.rotateX(Math.PI / 2);
    const evacuator = new THREE.Mesh(evacuatorGeo, bodyMat);
    evacuator.position.set(0, 0.04, -2.05);
    turretGroup.add(evacuator);

    const muzzleGeo = new THREE.CylinderGeometry(0.105, 0.095, 0.26, 12);
    muzzleGeo.rotateX(Math.PI / 2);
    const muzzle = new THREE.Mesh(muzzleGeo, trimMat);
    muzzle.position.set(0, 0.04, -3.72);
    turretGroup.add(muzzle);

    tankMuzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 12, 12),
      new THREE.MeshBasicMaterial({ color: '#FBBF24', transparent: true, opacity: 0.9 })
    );
    tankMuzzleFlash.position.set(0, 0.04, -3.95);
    tankMuzzleFlash.visible = false;
    turretGroup.add(tankMuzzleFlash);

    proceduralExteriorGroup.add(turretGroup);

    // Tank armored headlights & taillights
    for (const lx of [-0.66, 0.66]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.08), headLightMat);
      hl.position.set(lx, 0.72, -2.2);
      proceduralExteriorGroup.add(hl);

      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.08), tailLightMat);
      tl.position.set(lx, 0.74, 2.28);
      proceduralExteriorGroup.add(tl);
    }
  } else if (arch === 'f1') {
    // === FORMULA 1 PROCEDURAL FALLBACK (while f1.glb loads) ===
    const noseCone = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 4.6), bodyMat);
    noseCone.position.set(0, 0.36, 0.05);
    proceduralExteriorGroup.add(noseCone);

    const fWing = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.08, 0.6), trimMat);
    fWing.position.set(0, 0.22, -2.15);
    proceduralExteriorGroup.add(fWing);

    const rWing = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.08, 0.42), trimMat);
    rWing.position.set(0, 0.84, 2.22);
    proceduralExteriorGroup.add(rWing);

    const sidePods = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.34, 1.85), bodyMat);
    sidePods.position.set(0, 0.38, 0.45);
    proceduralExteriorGroup.add(sidePods);

    roofMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.1), bodyMat);
    roofMesh.visible = false;
    proceduralExteriorGroup.add(roofMesh);

    windshieldMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.1), windshieldMat);
    windshieldMesh.visible = false;
    proceduralExteriorGroup.add(windshieldMesh);

    for (const wp of [
      { x: -0.72, z: -1.38, front: true },
      { x: 0.72, z: -1.38, front: true },
      { x: -0.7, z: 1.82, front: false },
      { x: 0.7, z: 1.82, front: false },
    ]) {
      const pivot = new THREE.Group();
      pivot.position.set(wp.x, 0.34, wp.z);
      const wMesh = createWheelMesh(0.34, wp.front ? 0.3 : 0.38);
      pivot.add(wMesh);
      proceduralWheelsGroup.add(pivot);
      if (wp.front) frontWheelPivots.push(pivot);
      wheelSpinMeshes.push(wMesh.children[0] as THREE.Mesh);
    }
  } else if (isBike) {
    // === SPORT MOTORCYCLE PROCEDURAL FALLBACK (while GLB loads) ===
    const fairing = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 1.36), bodyMat);
    fairing.position.set(0, 0.68, -0.18);
    proceduralExteriorGroup.add(fairing);

    const noseFairing = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.3, 0.52), bodyMat);
    noseFairing.position.set(0, 0.76, -0.74);
    noseFairing.rotation.x = 0.32;
    proceduralExteriorGroup.add(noseFairing);

    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.04), windshieldMat);
    screen.position.set(0, 0.96, -0.66);
    screen.rotation.x = -0.72;
    proceduralExteriorGroup.add(screen);

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.62), trimMat);
    seat.position.set(0, 0.82, 0.36);
    proceduralExteriorGroup.add(seat);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.55), bodyMat);
    tail.position.set(0, 0.88, 0.72);
    tail.rotation.x = -0.25;
    proceduralExteriorGroup.add(tail);

    const handleBar = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.04, 0.05), chromeMat);
    handleBar.position.set(0, 0.95, -0.44);
    proceduralExteriorGroup.add(handleBar);

    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.06), headLightMat);
    hl.position.set(0, 0.72, -0.98);
    proceduralExteriorGroup.add(hl);

    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 0.06), tailLightMat);
    tl.position.set(0, 0.9, 0.98);
    proceduralExteriorGroup.add(tl);

    roofMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.1), bodyMat);
    roofMesh.visible = false;
    proceduralExteriorGroup.add(roofMesh);

    windshieldMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.1), windshieldMat);
    windshieldMesh.visible = false;
    proceduralExteriorGroup.add(windshieldMesh);

    for (const wp of [
      { z: -0.74, front: true },
      { z: 0.74, front: false },
    ]) {
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.32, wp.z);
      const wMesh = createWheelMesh(0.32, wp.front ? 0.13 : 0.19);
      pivot.add(wMesh);
      proceduralWheelsGroup.add(pivot);
      if (wp.front) frontWheelPivots.push(pivot);
      wheelSpinMeshes.push(wMesh.children[0] as THREE.Mesh);
    }
  } else {
    // === WHEELED CAR / HYPER / MUSCLE / SUV / POLICE / PICKUP / AUDI / BMW / MERCEDES / GWAGON / PORSCHE ===
    const isLifted = arch === 'suv' || arch === 'pickup' || arch === 'gwagon';
    const isHyper = arch === 'hyper' || arch === 'porsche';
    const hullY = 0.5 + (isLifted ? 0.16 : isHyper ? -0.05 : 0);
    const hullH = arch === 'gwagon' ? 0.64 : isLifted ? 0.56 : isHyper ? 0.4 : 0.48;
    const hullW = isHyper ? 2.08 : isLifted ? 2.04 : 1.96;

    const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(hullW, hullH, 4.38), bodyMat);
    lowerHull.position.set(0, hullY, 0);
    lowerHull.castShadow = true;
    lowerHull.receiveShadow = true;
    proceduralExteriorGroup.add(lowerHull);

    // Police white doors & roof contrast
    if (arch === 'police') {
      const whiteDoorBand = new THREE.Mesh(
        new THREE.BoxGeometry(hullW + 0.02, hullH * 0.92, 1.55),
        stripeMat
      );
      whiteDoorBand.position.set(0, hullY, 0.05);
      proceduralExteriorGroup.add(whiteDoorBand);
    }

    // Hood
    const hoodY = hullY + hullH * 0.5 + 0.04;
    const hood = new THREE.Mesh(new THREE.BoxGeometry(hullW - 0.16, 0.13, 1.55), bodyMat);
    hood.position.set(0, hoodY, -1.25);
    hood.rotation.x = arch === 'gwagon' ? 0.02 : isHyper ? 0.11 : 0.055;
    hood.castShadow = true;
    proceduralExteriorGroup.add(hood);

    // Dual racing stripes (sport, hyper, muscle)
    if (arch === 'sport' || arch === 'hyper' || arch === 'muscle') {
      for (const sx of [-0.22, 0.22]) {
        const hoodStripe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 1.56), stripeMat);
        hoodStripe.position.set(sx, hoodY + 0.07, -1.25);
        hoodStripe.rotation.x = isHyper ? 0.11 : 0.055;
        proceduralExteriorGroup.add(hoodStripe);

        const trunkStripe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.9), stripeMat);
        trunkStripe.position.set(sx, hullY + hullH * 0.54, 1.65);
        proceduralExteriorGroup.add(trunkStripe);
      }
    }

    // Cabin Roof + Windshield + Pillars
    const roofLen =
      arch === 'suv' || arch === 'gwagon'
        ? 2.15
        : arch === 'audi'
        ? 2.04
        : arch === 'pickup'
        ? 1.28
        : arch === 'porsche'
        ? 1.38
        : 1.58;
    const roofZ =
      arch === 'suv' || arch === 'gwagon'
        ? 0.45
        : arch === 'audi'
        ? 0.38
        : arch === 'pickup'
        ? 0.02
        : arch === 'porsche'
        ? 0.12
        : 0.26;
    const roofMat = arch === 'police' ? stripeMat : bodyMat;

    roofMesh = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.08, roofLen), roofMat);
    roofMesh.position.set(0, 1.32 + yLift, roofZ + zShift);
    roofMesh.castShadow = true;
    proceduralExteriorGroup.add(roofMesh);

    const wsTilt = arch === 'gwagon' ? -0.28 : -0.6;
    windshieldMesh = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.62, 0.04), windshieldMat);
    windshieldMesh.position.set(0, 1.05 + yLift, -0.58 + zShift);
    windshieldMesh.rotation.x = wsTilt;
    proceduralExteriorGroup.add(windshieldMesh);

    const rearZ =
      arch === 'suv' || arch === 'gwagon'
        ? 1.68
        : arch === 'audi'
        ? 1.58
        : arch === 'pickup'
        ? 0.68
        : arch === 'porsche'
        ? 1.25
        : 1.15;
    const rearTilt =
      arch === 'gwagon'
        ? 0.1
        : arch === 'suv'
        ? 0.22
        : arch === 'audi'
        ? 0.38
        : arch === 'pickup'
        ? 0.08
        : arch === 'porsche'
        ? 0.85
        : 0.62;
    const rearGlass = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.5, 0.06),
      glassMat
    );
    rearGlass.position.set(0, 1.04 + yLift, rearZ + zShift);
    rearGlass.rotation.x = rearTilt;
    proceduralExteriorGroup.add(rearGlass);

    for (const px of [-0.76, 0.76]) {
      const aPillar = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.62, 0.065), trimMat);
      aPillar.position.set(px, 1.05 + yLift, -0.58 + zShift);
      aPillar.rotation.x = wsTilt;
      proceduralExteriorGroup.add(aPillar);

      const cPillar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.56, 0.09), bodyMat);
      cPillar.position.set(px, 1.04 + yLift, rearZ - 0.02 + zShift);
      cPillar.rotation.x = rearTilt;
      proceduralExteriorGroup.add(cPillar);
    }

    // Front Grille & Splitter / Bullbar
    const grille = new THREE.Mesh(
      new THREE.BoxGeometry(isLifted ? 1.48 : 1.28, isLifted ? 0.32 : 0.24, 0.08),
      arch === 'pickup' ? chromeMat : trimMat
    );
    grille.position.set(0, hullY - 0.04, -2.19);
    proceduralExteriorGroup.add(grille);

    const frontLip = new THREE.Mesh(
      new THREE.BoxGeometry(hullW + 0.04, 0.09, isHyper ? 0.36 : 0.24),
      trimMat
    );
    frontLip.position.set(0, isLifted ? 0.38 : 0.22, -2.18);
    proceduralExteriorGroup.add(frontLip);

    // Headlights & Taillights
    for (const lx of [-0.68, 0.68]) {
      const hl = new THREE.Mesh(
        arch === 'gwagon' || arch === 'porsche'
          ? new THREE.CylinderGeometry(0.14, 0.14, 0.08, 16)
          : new THREE.BoxGeometry(0.36, 0.14, 0.08),
        headLightMat
      );
      if (arch === 'gwagon' || arch === 'porsche') hl.rotation.x = Math.PI / 2;
      hl.position.set(lx, hullY + 0.08, -2.18);
      proceduralExteriorGroup.add(hl);

      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.08), tailLightMat);
      tl.position.set(lx, hullY + 0.1, 2.18);
      proceduralExteriorGroup.add(tl);
    }

    // Side Mirrors (Audi RS uses brushed aluminum silver caps)
    const mirrorMat = arch === 'audi' ? chromeMat : accentMat;
    for (const mx of [-1.06, 1.06]) {
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.14), mirrorMat);
      mirror.position.set(mx, 0.86 + yLift, -0.45 + zShift);
      proceduralExteriorGroup.add(mirror);
    }

    // === ARCHETYPE-SPECIFIC DETAILS ===
    if (arch === 'sport') {
      const spoilerWing = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.06, 0.28), accentMat);
      spoilerWing.position.set(0, 0.96, 2.02);
      spoilerWing.castShadow = true;
      proceduralExteriorGroup.add(spoilerWing);
      for (const sx of [-0.58, 0.58]) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.14), trimMat);
        strut.position.set(sx, 0.83, 2.02);
        proceduralExteriorGroup.add(strut);
      }
    } else if (arch === 'audi') {
      // Singleframe chrome surround + 4 interlocking rings + RS oval exhausts
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.28, 0.09), trimMat);
      frame.position.set(0, hullY - 0.02, -2.2);
      proceduralExteriorGroup.add(frame);

      for (let r = 0; r < 4; r++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 8, 16), chromeMat);
        ring.position.set(-0.135 + r * 0.09, hullY - 0.02, -2.25);
        proceduralExteriorGroup.add(ring);

        const rearRing = ring.clone();
        rearRing.position.set(-0.105 + r * 0.07, hullY + 0.08, 2.21);
        rearRing.scale.setScalar(0.8);
        proceduralExteriorGroup.add(rearRing);
      }

      const rearLightBar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.06), tailLightMat);
      rearLightBar.position.set(0, hullY + 0.1, 2.19);
      proceduralExteriorGroup.add(rearLightBar);

      for (const ex of [-0.58, 0.58]) {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.16, 12), chromeMat);
        pipe.rotation.x = Math.PI / 2;
        pipe.scale.set(1.4, 1, 0.9);
        pipe.position.set(ex, 0.28, 2.18);
        proceduralExteriorGroup.add(pipe);
      }
    } else if (arch === 'bmw') {
      // Twin kidney grilles + Angel-Eye DRL rings + quad exhausts + M lip spoiler
      for (const kx of [-0.24, 0.24]) {
        const kidneyBorder = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.24, 0.09), chromeMat);
        kidneyBorder.position.set(kx, hullY - 0.01, -2.2);
        proceduralExteriorGroup.add(kidneyBorder);

        const kidneyCore = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.19, 0.1), trimMat);
        kidneyCore.position.set(kx, hullY - 0.01, -2.205);
        proceduralExteriorGroup.add(kidneyCore);
      }
      // Blue/White BMW roundel badge
      const roundel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.02, 16),
        new THREE.MeshStandardMaterial({ color: '#38BDF8', metalness: 0.5, roughness: 0.25 })
      );
      roundel.rotation.x = Math.PI / 2;
      roundel.position.set(0, hoodY + 0.06, -1.96);
      proceduralExteriorGroup.add(roundel);

      const mLip = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.06, 0.14), trimMat);
      mLip.position.set(0, hullY + hullH * 0.53, 2.1);
      proceduralExteriorGroup.add(mLip);

      for (const ex of [-0.62, -0.46, 0.46, 0.62]) {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.14, 10), chromeMat);
        pipe.rotation.x = Math.PI / 2;
        pipe.position.set(ex, 0.28, 2.18);
        proceduralExteriorGroup.add(pipe);
      }
    } else if (arch === 'mercedes') {
      // Panamericana vertical chrome slats + 3-pointed star emblem + quad chrome tips
      const grilleBox = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.26, 0.09), trimMat);
      grilleBox.position.set(0, hullY - 0.02, -2.2);
      proceduralExteriorGroup.add(grilleBox);

      for (let s = -4; s <= 4; s++) {
        if (s === 0) continue;
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.22, 0.1), chromeMat);
        slat.position.set(s * 0.11, hullY - 0.02, -2.205);
        proceduralExteriorGroup.add(slat);
      }

      const starRing = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.016, 8, 20), chromeMat);
      starRing.position.set(0, hullY - 0.02, -2.25);
      proceduralExteriorGroup.add(starRing);

      const rearStar = starRing.clone();
      rearStar.position.set(0, hullY + 0.08, 2.21);
      rearStar.scale.setScalar(0.8);
      proceduralExteriorGroup.add(rearStar);

      for (const ex of [-0.6, -0.45, 0.45, 0.6]) {
        const tip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.14), chromeMat);
        tip.position.set(ex, 0.28, 2.18);
        proceduralExteriorGroup.add(tip);
      }
    } else if (arch === 'gwagon') {
      // Iconic boxy G-Class: fender-top turn indicator pods, bull bar, side exhausts, rear tire cover
      const starRing = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.02, 8, 20), chromeMat);
      starRing.position.set(0, hullY - 0.02, -2.25);
      proceduralExteriorGroup.add(starRing);

      const bullBar = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.34, 0.12), chromeMat);
      bullBar.position.set(0, 0.62, -2.28);
      proceduralExteriorGroup.add(bullBar);

      const blinkerMat = new THREE.MeshStandardMaterial({
        color: '#F59E0B',
        emissive: '#F59E0B',
        emissiveIntensity: 1.2,
      });
      for (const bx of [-0.88, 0.88]) {
        const pod = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.18), blinkerMat);
        pod.position.set(bx, hoodY + 0.1, -1.85);
        proceduralExteriorGroup.add(pod);

        // Twin chrome side-exit exhaust pipes under doors
        const sidePipe = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.65, 10), chromeMat);
        sidePipe.rotation.x = Math.PI / 2;
        sidePipe.position.set(bx > 0 ? 1.06 : -1.06, 0.32, 0.65);
        proceduralExteriorGroup.add(sidePipe);
      }

      const spare = createWheelMesh(0.36, 0.24);
      spare.rotation.y = Math.PI / 2;
      spare.position.set(0, 1.02, 2.27);
      proceduralExteriorGroup.add(spare);
    } else if (arch === 'porsche') {
      // Full-width glowing red taillight bar + swan-neck GT3 wing
      const lightBar = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.06, 0.08), tailLightMat);
      lightBar.position.set(0, hullY + 0.12, 2.2);
      proceduralExteriorGroup.add(lightBar);

      const gtWing = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.06, 0.32), trimMat);
      gtWing.position.set(0, 1.02, 2.04);
      gtWing.castShadow = true;
      proceduralExteriorGroup.add(gtWing);

      for (const sx of [-0.54, 0.54]) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.14), accentMat);
        strut.position.set(sx, 0.84, 2.04);
        proceduralExteriorGroup.add(strut);
      }
    } else if (arch === 'hyper') {
      // Roof air scoop + tall wide carbon wing + front canards
      const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.58), trimMat);
      scoop.position.set(0, 1.38 + yLift, 0.15 + zShift);
      proceduralExteriorGroup.add(scoop);

      const hyperWing = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.06, 0.36), trimMat);
      hyperWing.position.set(0, 1.06, 2.04);
      hyperWing.castShadow = true;
      proceduralExteriorGroup.add(hyperWing);
      for (const sx of [-0.72, 0.72]) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.36, 0.16), accentMat);
        strut.position.set(sx, 0.86, 2.04);
        proceduralExteriorGroup.add(strut);

        const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.42), accentMat);
        endplate.position.set(sx > 0 ? 1.03 : -1.03, 1.04, 2.04);
        proceduralExteriorGroup.add(endplate);
      }
    } else if (arch === 'muscle') {
      // Iconic V8 Supercharger Blower sticking out of hood + Ducktail spoiler
      const blowerBlock = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.52), chromeMat);
      blowerBlock.position.set(0, hoodY + 0.14, -1.2);
      proceduralExteriorGroup.add(blowerBlock);

      const scoopBug = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.36), accentMat);
      scoopBug.position.set(0, hoodY + 0.28, -1.22);
      proceduralExteriorGroup.add(scoopBug);

      for (const bx of [-0.1, 0, 0.1]) {
        const butterfly = new THREE.Mesh(
          new THREE.CylinderGeometry(0.045, 0.045, 0.04, 12),
          new THREE.MeshStandardMaterial({ color: '#DC2626', metalness: 0.4, roughness: 0.3 })
        );
        butterfly.rotation.x = Math.PI / 2;
        butterfly.position.set(bx, hoodY + 0.28, -1.41);
        proceduralExteriorGroup.add(butterfly);
      }

      const ducktail = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.14, 0.18), accentMat);
      ducktail.position.set(0, 0.84, 2.08);
      ducktail.rotation.x = -0.35;
      proceduralExteriorGroup.add(ducktail);
    } else if (arch === 'suv') {
      // Bull bar + Roof rack + LED light bar + Rear spare tire
      const bullBar = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.3, 0.12), chromeMat);
      bullBar.position.set(0, 0.62, -2.28);
      proceduralExteriorGroup.add(bullBar);

      const roofRack = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.08, 1.75), trimMat);
      roofRack.position.set(0, 1.38 + yLift, 0.45 + zShift);
      proceduralExteriorGroup.add(roofRack);

      const ledBar = new THREE.Mesh(
        new THREE.BoxGeometry(1.18, 0.08, 0.08),
        new THREE.MeshStandardMaterial({
          color: '#FEF9C3',
          emissive: '#FEF08A',
          emissiveIntensity: 1.5,
        })
      );
      ledBar.position.set(0, 1.44 + yLift, -0.38 + zShift);
      proceduralExteriorGroup.add(ledBar);

      const spare = createWheelMesh(0.34, 0.22);
      spare.rotation.y = Math.PI / 2;
      spare.position.set(0, 0.96, 2.26);
      proceduralExteriorGroup.add(spare);
    } else if (arch === 'police') {
      // Heavy push bumper + Red/Blue roof lightbar + Twin antennas
      const pushBar = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.32, 0.16), trimMat);
      pushBar.position.set(0, 0.46, -2.26);
      proceduralExteriorGroup.add(pushBar);

      const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.07, 0.22), trimMat);
      barBase.position.set(0, 1.39 + yLift, 0.1 + zShift);
      proceduralExteriorGroup.add(barBase);

      policeRedMat = new THREE.MeshStandardMaterial({
        color: '#EF4444',
        emissive: '#EF4444',
        emissiveIntensity: 3.5,
      });
      policeBlueMat = new THREE.MeshStandardMaterial({
        color: '#3B82F6',
        emissive: '#3B82F6',
        emissiveIntensity: 0.4,
      });

      const redPod = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.1, 0.2), policeRedMat);
      redPod.position.set(-0.32, 1.45 + yLift, 0.1 + zShift);
      proceduralExteriorGroup.add(redPod);

      const bluePod = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.1, 0.2), policeBlueMat);
      bluePod.position.set(0.32, 1.45 + yLift, 0.1 + zShift);
      proceduralExteriorGroup.add(bluePod);

      for (const ax of [-0.62, 0.62]) {
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 0.72, 6), trimMat);
        ant.position.set(ax, 1.08, 2.02);
        proceduralExteriorGroup.add(ant);
      }
    } else if (arch === 'pickup') {
      // Open bed rails + Rollbar + Twin vertical exhaust stacks
      for (const rx of [-0.88, 0.88]) {
        const bedWall = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 1.42), bodyMat);
        bedWall.position.set(rx, hullY + hullH * 0.5 + 0.12, 1.44);
        proceduralExteriorGroup.add(bedWall);

        const stack = new THREE.Mesh(
          new THREE.CylinderGeometry(0.055, 0.055, 1.05, 10),
          chromeMat
        );
        stack.position.set(rx * 0.72, 1.24 + yLift, 0.74 + zShift);
        proceduralExteriorGroup.add(stack);
      }

      const rollBar = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.08, 0.1), chromeMat);
      rollBar.position.set(0, 1.38 + yLift, 0.74 + zShift);
      proceduralExteriorGroup.add(rollBar);
    }

    // 4 Wheels (Front two pivot when steering)
    const wheelRadius = isLifted ? 0.43 : arch === 'sedan' ? 0.34 : 0.36;
    const wheelWidth = isHyper ? 0.31 : isLifted ? 0.3 : arch === 'sedan' ? 0.22 : 0.26;
    const trackX = isHyper ? 1.04 : isLifted ? 1.02 : 0.98;
    const positions: Array<{ x: number; z: number; front: boolean }> = [
      { x: -trackX, z: -1.38, front: true },
      { x: trackX, z: -1.38, front: true },
      { x: -trackX, z: 1.42, front: false },
      { x: trackX, z: 1.42, front: false },
    ];

    for (const wp of positions) {
      const pivot = new THREE.Group();
      pivot.position.set(wp.x, wheelRadius, wp.z);
      const wMesh = createWheelMesh(wheelRadius, wheelWidth);
      pivot.add(wMesh);
      proceduralWheelsGroup.add(pivot);
      if (wp.front) frontWheelPivots.push(pivot);
      wheelSpinMeshes.push(wMesh.children[0] as THREE.Mesh);
    }
  }

  // 9. Cockpit Group (shifted by cockpitOffsetY / cockpitOffsetZ so hands, wheel & shifter always frame identically!)
  const cockpitGroup = new THREE.Group();
  cockpitGroup.position.set(0, yLift, zShift);
  bodyGroup.add(cockpitGroup);

  const cabinInteriorGroup = new THREE.Group();
  cockpitGroup.add(cabinInteriorGroup);

  const dash = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.26, 0.48),
    new THREE.MeshStandardMaterial({ color: '#111622', roughness: 0.78, metalness: 0.12 })
  );
  dash.position.set(0, 0.81, -0.5);
  cabinInteriorGroup.add(dash);

  const binnacle = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.13, 0.22),
    new THREE.MeshStandardMaterial({ color: '#0B0F19', roughness: 0.7 })
  );
  binnacle.position.set(-0.34, 0.96, -0.39);
  cabinInteriorGroup.add(binnacle);

  const speedoDialTex = createSpeedoDialTexture();
  const clusterFace = new THREE.Mesh(
    new THREE.CircleGeometry(0.055, 24),
    new THREE.MeshStandardMaterial({
      map: speedoDialTex,
      emissiveMap: speedoDialTex,
      emissive: '#FFFFFF',
      emissiveIntensity: 0.78,
    })
  );
  clusterFace.position.set(-0.34, 0.95, -0.285);
  clusterFace.rotation.x = -0.2;
  cabinInteriorGroup.add(clusterFace);

  const speedoNeedle = new THREE.Group();
  speedoNeedle.position.set(-0.34, 0.95, -0.28);
  speedoNeedle.rotation.x = -0.2;
  const needleBar = new THREE.Mesh(
    new THREE.BoxGeometry(0.008, 0.042, 0.004),
    new THREE.MeshBasicMaterial({ color: '#F97316' })
  );
  needleBar.position.y = 0.018;
  speedoNeedle.add(needleBar);
  cabinInteriorGroup.add(speedoNeedle);

  const centerScreenCanvas = document.createElement('canvas');
  centerScreenCanvas.width = 256;
  centerScreenCanvas.height = 128;
  const centerScreenCtx = centerScreenCanvas.getContext('2d')!;
  const centerScreenTex = new THREE.CanvasTexture(centerScreenCanvas);
  centerScreenTex.colorSpace = THREE.SRGBColorSpace;
  drawCenterScreen(centerScreenCanvas, centerScreenCtx, centerScreenTex, 3, false, lang);

  const centerScreen = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.12, 0.02),
    new THREE.MeshStandardMaterial({
      map: centerScreenTex,
      emissiveMap: centerScreenTex,
      emissive: '#FFFFFF',
      emissiveIntensity: 0.85,
    })
  );
  centerScreen.position.set(0.02, 0.94, -0.34);
  centerScreen.rotation.x = -0.22;
  cabinInteriorGroup.add(centerScreen);

  const consoleBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.24, 0.85),
    new THREE.MeshStandardMaterial({ color: '#171D2B', roughness: 0.7 })
  );
  consoleBox.position.set(0.0, 0.66, 0.04);
  cabinInteriorGroup.add(consoleBox);

  const shifterGateBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.018, 0.12),
    new THREE.MeshStandardMaterial({ color: '#0F172A', metalness: 0.7, roughness: 0.3 })
  );
  shifterGateBase.position.set(0.0, 0.785, -0.18);
  cabinInteriorGroup.add(shifterGateBase);

  const gearLeverPivot = new THREE.Group();
  gearLeverPivot.position.set(0.0, 0.785, -0.18);
  gearLeverPivot.rotation.set(GEAR_GATE_ANGLES[3].rx, 0, GEAR_GATE_ANGLES[3].rz);

  const shifterBoot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.044, 0.055, 10),
    new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.88 })
  );
  shifterBoot.position.set(0, 0.028, 0);
  gearLeverPivot.add(shifterBoot);

  const shifterShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0085, 0.0095, 0.145, 10),
    chromeMat
  );
  shifterShaft.position.set(0, 0.078, 0);
  gearLeverPivot.add(shifterShaft);

  const gearKnob = new THREE.Mesh(
    new THREE.SphereGeometry(0.027, 14, 14),
    new THREE.MeshStandardMaterial({ color: '#0F172A', metalness: 0.45, roughness: 0.3 })
  );
  gearKnob.scale.set(1, 1.18, 1);
  gearKnob.position.set(0.0, 0.15, 0.0);
  gearLeverPivot.add(gearKnob);

  const gearKnobCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.017, 0.017, 0.008, 12),
    accentMat
  );
  gearKnobCap.position.set(0.0, 0.178, 0.0);
  gearLeverPivot.add(gearKnobCap);

  const shifterGripAnchor = new THREE.Object3D();
  shifterGripAnchor.position.set(-0.018, 0.172, 0.044);
  shifterGripAnchor.rotation.set(-0.18, -0.22, 1.15);
  gearLeverPivot.add(shifterGripAnchor);

  cabinInteriorGroup.add(gearLeverPivot);

  for (const dx of [-0.82, 0.82]) {
    const doorSill = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.34, 1.35),
      new THREE.MeshStandardMaterial({ color: '#141924', roughness: 0.75 })
    );
    doorSill.position.set(dx, 0.78, 0.08);
    cabinInteriorGroup.add(doorSill);
  }

  const mirrorArm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.03), trimMat);
  mirrorArm.position.set(0, 1.26, -0.38);
  cabinInteriorGroup.add(mirrorArm);

  const rearviewMirror = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.06, 0.025),
    new THREE.MeshStandardMaterial({ color: '#0F172A', roughness: 0.4 })
  );
  rearviewMirror.position.set(0, 1.22, -0.36);
  cabinInteriorGroup.add(rearviewMirror);

  const mirrorGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.048),
    new THREE.MeshStandardMaterial({ color: '#475569', metalness: 0.92, roughness: 0.1 })
  );
  mirrorGlass.position.set(0, 1.22, -0.346);
  cabinInteriorGroup.add(mirrorGlass);

  // Steering wheel
  const steeringWheel = new THREE.Group();
  steeringWheel.position.set(-0.34, 0.93, -0.17);
  steeringWheel.rotation.x = -0.34;
  const wheelRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.155, 0.022, 10, 26),
    new THREE.MeshStandardMaterial({ color: '#0F172A', roughness: 0.5, metalness: 0.25 })
  );
  steeringWheel.add(wheelRim);
  const spokeH = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.026, 0.018),
    new THREE.MeshStandardMaterial({ color: '#CBD5E1', roughness: 0.28, metalness: 0.82 })
  );
  steeringWheel.add(spokeH);
  const spokeV = new THREE.Mesh(
    new THREE.BoxGeometry(0.028, 0.13, 0.018),
    new THREE.MeshStandardMaterial({ color: '#CBD5E1', roughness: 0.28, metalness: 0.82 })
  );
  spokeV.position.y = -0.068;
  steeringWheel.add(spokeV);
  const hornCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.044, 0.044, 0.024, 16),
    bodyMat
  );
  hornCap.rotation.x = Math.PI / 2;
  steeringWheel.add(hornCap);

  const leftGripAnchor = new THREE.Object3D();
  leftGripAnchor.position.set(-0.165, 0.022, 0.045);
  leftGripAnchor.rotation.set(0.12, -0.14, -0.14);
  steeringWheel.add(leftGripAnchor);

  const rightGripAnchor = new THREE.Object3D();
  rightGripAnchor.position.set(0.165, 0.022, 0.045);
  rightGripAnchor.rotation.set(0.12, 0.14, 0.14);
  steeringWheel.add(rightGripAnchor);

  cockpitGroup.add(steeringWheel);

  // Driver Arms & Gloved Hands (visible in 1st-person mode)
  const driverArmsGroup = new THREE.Group();
  driverArmsGroup.visible = false;
  const sleeveMat = new THREE.MeshStandardMaterial({
    color: arch === 'tank' ? '#2A3324' : '#0F172A',
    roughness: 0.78,
    metalness: 0.08,
  });
  const forearmGeo = new THREE.CylinderGeometry(0.034, 0.046, 1, 10);
  const leftForearmMesh = new THREE.Mesh(forearmGeo, sleeveMat);
  const rightForearmMesh = new THREE.Mesh(forearmGeo, sleeveMat);
  const leftHandGroup = buildDriverHand('left');
  const rightHandGroup = buildDriverHand('right');
  driverArmsGroup.add(leftForearmMesh, rightForearmMesh, leftHandGroup, rightHandGroup);
  cockpitGroup.add(driverArmsGroup);

  // 10. Nitro Twin Exhaust Flames (single central exhaust for F1 & motorcycles)
  const nitroFlames = new THREE.Group();
  nitroFlames.visible = false;
  const flameGeo = new THREE.ConeGeometry(isBike ? 0.09 : 0.13, isBike ? 0.7 : 0.95, 10);
  flameGeo.rotateX(Math.PI / 2);
  const flameMat = new THREE.MeshBasicMaterial({
    color: '#38BDF8',
    transparent: true,
    opacity: 0.85,
  });
  const flameXs = arch === 'f1' || isBike ? [0] : [-0.45, 0.45];
  for (const fx of flameXs) {
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(
      fx,
      arch === 'tank' ? 0.56 : arch === 'f1' ? 0.46 : isBike ? 0.42 : 0.38,
      isBike ? 1.25 : 2.55
    );
    nitroFlames.add(flame);
  }
  bodyGroup.add(nitroFlames);

  // 12. Real Headlight SpotLights + Diffused Road Light Pool (active in Night mode)
  const headlightLeft = new THREE.SpotLight('#FEF9C3', isSoftwareGl ? 115 : 145, 115, Math.PI / 3.8, 0.95, 0.85);
  headlightLeft.position.set(isBike ? -0.15 : -0.68, 0.7, isBike ? -1.0 : -2.18);
  headlightLeft.target.position.set(isBike ? -0.4 : -1.3, 0, -34);
  bodyGroup.add(headlightLeft);
  bodyGroup.add(headlightLeft.target);

  const headlightRight = new THREE.SpotLight('#FEF9C3', isSoftwareGl ? 115 : 145, 115, Math.PI / 3.8, 0.95, 0.85);
  headlightRight.position.set(isBike ? 0.15 : 0.68, 0.7, isBike ? -1.0 : -2.18);
  headlightRight.target.position.set(isBike ? 0.4 : 1.3, 0, -34);
  bodyGroup.add(headlightRight);
  bodyGroup.add(headlightRight.target);

  const headlightBeamPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(12.5, 32),
    new THREE.MeshBasicMaterial({
      map: beamTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.72,
    })
  );
  headlightBeamPlane.rotation.x = -Math.PI / 2;
  headlightBeamPlane.position.set(0, 0.05, -16.5);
  root.add(headlightBeamPlane);

  const realModelKey = getRealCarModelKeyForPlayer(arch);
  let realModelGroup: THREE.Group | null = null;
  if (realModelKey) {
    realModelGroup = instantiateRealCarModel(realModelKey, carOpt.bodyColor);
    if (realModelGroup) {
      bodyGroup.add(realModelGroup);
      proceduralExteriorGroup.visible = false;
      proceduralWheelsGroup.visible = false;
      cabinInteriorGroup.visible = false;
      steeringWheel.visible = false;
    }
  }

  return {
    archetype: arch,
    isMotorcycle: isBike,
    carColor: carOpt.bodyColor,
    realModelKey,
    realModelGroup,
    proceduralExteriorGroup,
    proceduralWheelsGroup,
    cockpitOffsetY: yLift,
    cockpitOffsetZ: zShift,
    root,
    bodyGroup,
    bodyMat,
    accentMat,
    stripeMat,
    tailLightMat,
    headLightMat,
    policeRedMat,
    policeBlueMat,
    tankMuzzleFlash,
    turretGroup,
    steeringWheel,
    leftGripAnchor,
    rightGripAnchor,
    gearLeverPivot,
    shifterGripAnchor,
    driverArmsGroup,
    leftHandGroup,
    rightHandGroup,
    leftForearmMesh,
    rightForearmMesh,
    speedoNeedle,
    cabinInteriorGroup,
    centerScreenCanvas,
    centerScreenCtx,
    centerScreenTex,
    speedoDialTex,
    lastScreenGear: 3,
    lastScreenNitro: false,
    frontWheelPivots,
    wheelSpinMeshes,
    roofMesh,
    windshieldMesh,
    windshieldMat,
    shadowPlane,
    nitroFlames,
    headlightLeft,
    headlightRight,
    headlightBeamPlane,
  };
}

interface TrafficMeshRig {
  kind: TrafficKind;
  isMotorcycle: boolean;
  appliedQuality?: GraphicsQuality;
  group: THREE.Group;
  proceduralGroup: THREE.Group;
  realModelKey: RealCarModelKey | null;
  realModelGroup: THREE.Group | null;
  color: string;
  bodyMat: THREE.MeshPhysicalMaterial;
  shadowPlane: THREE.Mesh;
  tailLightMat: THREE.MeshStandardMaterial;
  blinkerLeftMat: THREE.MeshStandardMaterial;
  blinkerRightMat: THREE.MeshStandardMaterial;
  blinkerLeftMeshes: THREE.Mesh[];
  blinkerRightMeshes: THREE.Mesh[];
  wheels: THREE.Object3D[];
}

function buildTrafficCarRig(car: TrafficVehicle, shadowTex: THREE.CanvasTexture): TrafficMeshRig {
  const group = new THREE.Group();
  const proceduralGroup = new THREE.Group();
  group.add(proceduralGroup);

  const isBike = isMotorcycleArchetype(car.kind);
  const realModelKey = getRealCarModelKeyForTraffic(car.kind);
  const realModelGroup = realModelKey
    ? instantiateRealCarModel(realModelKey, car.color)
    : null;
  if (realModelGroup) {
    group.add(realModelGroup);
    proceduralGroup.visible = false;
  }

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: car.color,
    metalness: 0.35,
    roughness: 0.3,
    clearcoat: 0.7,
    clearcoatRoughness: 0.2,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: car.secondaryColor,
    roughness: 0.4,
    metalness: 0.25,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#0F172A',
    roughness: 0.12,
    metalness: 0.4,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: '#1E293B',
    roughness: 0.75,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: '#E2E8F0',
    metalness: 0.9,
    roughness: 0.18,
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: '#FEF9C3',
    emissive: '#FEF08A',
    emissiveIntensity: 1.1,
  });
  const tailLightMat = new THREE.MeshStandardMaterial({
    color: '#DC2626',
    emissive: '#DC2626',
    emissiveIntensity: 0.8,
  });
  const blinkerLeftMat = new THREE.MeshStandardMaterial({
    color: '#92400E',
    emissive: '#F59E0B',
    emissiveIntensity: 0.0,
  });
  const blinkerRightMat = new THREE.MeshStandardMaterial({
    color: '#92400E',
    emissive: '#F59E0B',
    emissiveIntensity: 0.0,
  });

  // Contact shadow
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(car.width * (isBike ? 1.45 : 1.25), car.length * 1.15),
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.48,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  group.add(shadow);

  const wheels: THREE.Object3D[] = [];
  const blinkerLeftMeshes: THREE.Mesh[] = [];
  const blinkerRightMeshes: THREE.Mesh[] = [];
  const wRad = car.kind === 'truck' || car.kind === 'bus' ? 0.44 : car.kind === 'gwagon' ? 0.41 : isBike ? 0.31 : 0.35;

  const addCornerBlinkers = (yPos: number) => {
    for (const side of [-1, 1] as const) {
      const mat = side === -1 ? blinkerLeftMat : blinkerRightMat;
      const list = side === -1 ? blinkerLeftMeshes : blinkerRightMeshes;
      const rearB = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.09), mat);
      rearB.position.set(side * (car.width * 0.46), yPos, car.length / 2 + 0.02);
      rearB.visible = false;
      proceduralGroup.add(rearB);

      const frontB = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.09, 0.09), mat);
      frontB.position.set(side * (car.width * 0.46), yPos, -car.length / 2 - 0.02);
      frontB.visible = false;
      proceduralGroup.add(frontB);

      list.push(rearB, frontB);
    }
  };

  if (realModelGroup) {
    // Real GLB model has integrated lighting geometry — never attach floating corner cubes
  } else if (isBike) {
    const fairing = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 1.32), bodyMat);
    fairing.position.set(0, 0.66, -0.15);
    proceduralGroup.add(fairing);

    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.04), glassMat);
    screen.position.set(0, 0.94, -0.62);
    screen.rotation.x = -0.7;
    proceduralGroup.add(screen);

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.62), trimMat);
    seat.position.set(0, 0.8, 0.35);
    proceduralGroup.add(seat);

    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.06), headMat);
    hl.position.set(0, 0.7, -0.94);
    proceduralGroup.add(hl);

    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.06), tailLightMat);
    tl.position.set(0, 0.86, 0.94);
    proceduralGroup.add(tl);

    for (const wz of [-0.72, 0.72]) {
      const w = createWheelMesh(wRad, wz < 0 ? 0.13 : 0.18);
      w.position.set(0, wRad, wz);
      proceduralGroup.add(w);
      wheels.push(w);
    }
  } else if (car.kind === 'truck') {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.25, 2.05, 2.2), roofMat);
    cab.position.set(0, 1.38, -car.length * 0.35);
    cab.castShadow = true;
    proceduralGroup.add(cab);

    const cabGlass = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.72, 0.08), glassMat);
    cabGlass.position.set(0, 1.78, -car.length * 0.35 - 1.08);
    proceduralGroup.add(cabGlass);

    const trailer = new THREE.Mesh(
      new THREE.BoxGeometry(2.42, 2.55, car.length * 0.68),
      bodyMat
    );
    trailer.position.set(0, 1.68, car.length * 0.15);
    trailer.castShadow = true;
    trailer.receiveShadow = true;
    proceduralGroup.add(trailer);

    const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.25, 0.2), trimMat);
    bumper.position.set(0, 0.45, car.length * 0.49);
    proceduralGroup.add(bumper);

    for (const lx of [-0.85, 0.85]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.08), headMat);
      hl.position.set(lx, 0.68, -car.length * 0.35 - 1.11);
      proceduralGroup.add(hl);

      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.08), tailLightMat);
      tl.position.set(lx, 0.65, car.length * 0.49 + 0.02);
      proceduralGroup.add(tl);
    }
    addCornerBlinkers(0.68);

    const zOffsets = [-car.length * 0.36, car.length * 0.12, car.length * 0.36];
    for (const wz of zOffsets) {
      for (const wx of [-1.14, 1.14]) {
        const w = createWheelMesh(wRad, 0.3);
        w.position.set(wx, wRad, wz);
        proceduralGroup.add(w);
        wheels.push(w);
      }
    }
  } else if (car.kind === 'bus') {
    const coach = new THREE.Mesh(
      new THREE.BoxGeometry(2.44, 2.28, car.length - 0.1),
      bodyMat
    );
    coach.position.set(0, 1.54, 0);
    coach.castShadow = true;
    coach.receiveShadow = true;
    proceduralGroup.add(coach);

    const roofCap = new THREE.Mesh(
      new THREE.BoxGeometry(2.32, 0.14, car.length - 0.3),
      roofMat
    );
    roofCap.position.set(0, 2.74, 0);
    proceduralGroup.add(roofCap);

    const winBand = new THREE.Mesh(
      new THREE.BoxGeometry(2.47, 0.82, car.length - 0.45),
      glassMat
    );
    winBand.position.set(0, 1.98, -0.05);
    proceduralGroup.add(winBand);

    for (const lx of [-0.88, 0.88]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), headMat);
      hl.position.set(lx, 0.72, -car.length / 2);
      proceduralGroup.add(hl);

      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.08), tailLightMat);
      tl.position.set(lx, 0.85, car.length / 2);
      proceduralGroup.add(tl);
    }
    addCornerBlinkers(0.85);

    for (const wz of [-car.length * 0.33, car.length * 0.32]) {
      for (const wx of [-1.14, 1.14]) {
        const w = createWheelMesh(wRad, 0.3);
        w.position.set(wx, wRad, wz);
        proceduralGroup.add(w);
        wheels.push(w);
      }
    }
  } else if (car.kind === 'van') {
    const vanBody = new THREE.Mesh(
      new THREE.BoxGeometry(car.width, 1.56, car.length),
      bodyMat
    );
    vanBody.position.set(0, wRad + 0.82, 0);
    vanBody.castShadow = true;
    vanBody.receiveShadow = true;
    proceduralGroup.add(vanBody);

    const vanGlass = new THREE.Mesh(
      new THREE.BoxGeometry(car.width * 0.86, 0.56, 0.08),
      glassMat
    );
    vanGlass.position.set(0, wRad + 1.24, -car.length / 2 - 0.01);
    proceduralGroup.add(vanGlass);

    for (const lx of [-car.width * 0.35, car.width * 0.35]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.08), headMat);
      hl.position.set(lx, wRad + 0.46, -car.length / 2 - 0.01);
      proceduralGroup.add(hl);

      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.08), tailLightMat);
      tl.position.set(lx, wRad + 0.65, car.length / 2 + 0.01);
      proceduralGroup.add(tl);
    }
    addCornerBlinkers(wRad + 0.65);

    for (const wz of [-car.length * 0.32, car.length * 0.32]) {
      for (const wx of [-car.width * 0.48, car.width * 0.48]) {
        const w = createWheelMesh(wRad, 0.25);
        w.position.set(wx, wRad, wz);
        proceduralGroup.add(w);
        wheels.push(w);
      }
    }
  } else {
    const isBoxySuv = car.kind === 'suv' || car.kind === 'gwagon';
    const isLowSport = car.kind === 'sport' || car.kind === 'porsche' || car.kind === 'lambo';
    const bodyHeight = isBoxySuv ? 0.66 : isLowSport ? 0.42 : 0.5;
    const cabinHeight = isBoxySuv ? 0.68 : isLowSport ? 0.44 : 0.54;
    const cabinLen =
      car.kind === 'gwagon' || car.kind === 'suv'
        ? car.length * 0.62
        : car.kind === 'audi'
        ? car.length * 0.58
        : car.length * 0.48;

    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(car.width, bodyHeight, car.length),
      bodyMat
    );
    chassis.position.set(0, wRad + bodyHeight * 0.45, 0);
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    proceduralGroup.add(chassis);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(car.width * 0.82, cabinHeight, cabinLen),
      roofMat
    );
    cabin.position.set(0, wRad + bodyHeight * 0.85 + cabinHeight * 0.45, car.kind === 'lambo' ? -0.1 : 0.15);
    cabin.castShadow = true;
    proceduralGroup.add(cabin);

    const windshield = new THREE.Mesh(
      new THREE.BoxGeometry(car.width * 0.78, cabinHeight * 0.85, cabinLen + 0.05),
      glassMat
    );
    windshield.position.set(0, wRad + bodyHeight * 0.85 + cabinHeight * 0.42, car.kind === 'lambo' ? -0.1 : 0.15);
    proceduralGroup.add(windshield);

    // Taxi roof sign
    if (car.kind === 'taxi') {
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.18, 0.25),
        new THREE.MeshStandardMaterial({
          color: '#FEF08A',
          emissive: '#FACC15',
          emissiveIntensity: 1.0,
        })
      );
      sign.position.set(0, wRad + bodyHeight + cabinHeight + 0.04, 0.05);
      proceduralGroup.add(sign);
    }

    // Police lightbar on traffic patrol car
    if (car.kind === 'police') {
      const pRed = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.11, 0.2),
        new THREE.MeshStandardMaterial({ color: '#EF4444', emissive: '#EF4444', emissiveIntensity: 2.2 })
      );
      pRed.position.set(-0.26, wRad + bodyHeight + cabinHeight + 0.04, 0.05);
      proceduralGroup.add(pRed);

      const pBlue = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.11, 0.2),
        new THREE.MeshStandardMaterial({ color: '#3B82F6', emissive: '#3B82F6', emissiveIntensity: 2.2 })
      );
      pBlue.position.set(0.26, wRad + bodyHeight + cabinHeight + 0.04, 0.05);
      proceduralGroup.add(pBlue);
    }

    // Audi RS6: Singleframe grille + 4 rings front & rear + silver mirrors + rear light bar
    if (car.kind === 'audi') {
      const singleframe = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.24, 0.06), trimMat);
      singleframe.position.set(0, wRad + bodyHeight * 0.4, -car.length / 2 - 0.01);
      proceduralGroup.add(singleframe);

      for (let r = 0; r < 4; r++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 6, 14), chromeMat);
        ring.position.set(-0.105 + r * 0.07, wRad + bodyHeight * 0.4, -car.length / 2 - 0.045);
        proceduralGroup.add(ring);

        const rearRing = ring.clone();
        rearRing.position.set(-0.09 + r * 0.06, wRad + bodyHeight * 0.56, car.length / 2 + 0.03);
        rearRing.scale.setScalar(0.8);
        proceduralGroup.add(rearRing);
      }

      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.05, 0.05), tailLightMat);
      bar.position.set(0, wRad + bodyHeight * 0.5, car.length / 2 + 0.015);
      proceduralGroup.add(bar);
    }

    // BMW M5: Twin kidney grilles + trunk lip + quad exhausts
    if (car.kind === 'bmw') {
      for (const kx of [-0.22, 0.22]) {
        const kid = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.07), chromeMat);
        kid.position.set(kx, wRad + bodyHeight * 0.42, -car.length / 2 - 0.01);
        proceduralGroup.add(kid);
        const core = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.17, 0.08), trimMat);
        core.position.set(kx, wRad + bodyHeight * 0.42, -car.length / 2 - 0.015);
        proceduralGroup.add(core);
      }
      const lip = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.06, 0.14), trimMat);
      lip.position.set(0, wRad + bodyHeight * 0.92, car.length * 0.46);
      proceduralGroup.add(lip);
    }

    // Mercedes AMG: Panamericana grille + 3-pointed star emblem
    if (car.kind === 'mercedes') {
      const grille = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.24, 0.07), trimMat);
      grille.position.set(0, wRad + bodyHeight * 0.42, -car.length / 2 - 0.01);
      proceduralGroup.add(grille);

      for (let s = -3; s <= 3; s++) {
        if (s === 0) continue;
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.2, 0.08), chromeMat);
        slat.position.set(s * 0.12, wRad + bodyHeight * 0.42, -car.length / 2 - 0.015);
        proceduralGroup.add(slat);
      }
      const star = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.015, 6, 16), chromeMat);
      star.position.set(0, wRad + bodyHeight * 0.42, -car.length / 2 - 0.05);
      proceduralGroup.add(star);

      const rearStar = star.clone();
      rearStar.position.set(0, wRad + bodyHeight * 0.56, car.length / 2 + 0.03);
      rearStar.scale.setScalar(0.78);
      proceduralGroup.add(rearStar);
    }

    // Mercedes G-Class (Гелендваген): bullbar, rear spare tire, side pipes, fender blinker pods
    if (car.kind === 'gwagon') {
      const bullBar = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.3, 0.12), chromeMat);
      bullBar.position.set(0, wRad + 0.18, -car.length / 2 - 0.07);
      proceduralGroup.add(bullBar);

      const star = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.018, 6, 16), chromeMat);
      star.position.set(0, wRad + bodyHeight * 0.44, -car.length / 2 - 0.05);
      proceduralGroup.add(star);

      const spare = createWheelMesh(0.35, 0.22);
      spare.rotation.y = Math.PI / 2;
      spare.position.set(0, wRad + bodyHeight * 0.72, car.length / 2 + 0.11);
      proceduralGroup.add(spare);
    }

    // Porsche 911: full-width rear lightbar + GT wing
    if (car.kind === 'porsche') {
      const lightbar = new THREE.Mesh(new THREE.BoxGeometry(car.width * 0.92, 0.06, 0.07), tailLightMat);
      lightbar.position.set(0, wRad + bodyHeight * 0.54, car.length / 2 + 0.015);
      proceduralGroup.add(lightbar);

      const wing = new THREE.Mesh(new THREE.BoxGeometry(car.width * 0.92, 0.06, 0.28), trimMat);
      wing.position.set(0, wRad + bodyHeight + 0.22, car.length * 0.44);
      proceduralGroup.add(wing);
    }

    // Lamborghini supercar: wedge splitter, mid-engine louvers, big carbon wing
    if (car.kind === 'lambo') {
      const splitter = new THREE.Mesh(new THREE.BoxGeometry(car.width + 0.06, 0.07, 0.34), trimMat);
      splitter.position.set(0, 0.2, -car.length / 2 - 0.04);
      proceduralGroup.add(splitter);

      const engineBay = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.05, 0.95), trimMat);
      engineBay.position.set(0, wRad + bodyHeight * 0.92, 0.85);
      proceduralGroup.add(engineBay);

      const wing = new THREE.Mesh(new THREE.BoxGeometry(car.width * 0.98, 0.06, 0.34), trimMat);
      wing.position.set(0, wRad + bodyHeight + 0.28, car.length * 0.44);
      proceduralGroup.add(wing);
    }

    // Coupe / Sport stripe & wing
    if (car.kind === 'coupe' || car.kind === 'sport') {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.02, car.length - 0.1),
        new THREE.MeshStandardMaterial({ color: '#F8FAFC', roughness: 0.3 })
      );
      stripe.position.set(0, wRad + bodyHeight * 0.91, 0);
      proceduralGroup.add(stripe);
    }
    if (car.kind === 'sport') {
      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(car.width * 0.92, 0.06, 0.26),
        trimMat
      );
      wing.position.set(0, wRad + bodyHeight + 0.24, car.length * 0.44);
      proceduralGroup.add(wing);
    }

    for (const lx of [-car.width * 0.33, car.width * 0.33]) {
      const hl = new THREE.Mesh(
        car.kind === 'gwagon' || car.kind === 'porsche'
          ? new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12)
          : new THREE.BoxGeometry(0.32, 0.12, 0.08),
        headMat
      );
      if (car.kind === 'gwagon' || car.kind === 'porsche') hl.rotation.x = Math.PI / 2;
      hl.position.set(lx, wRad + bodyHeight * 0.48, -car.length / 2 - 0.01);
      proceduralGroup.add(hl);

      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.13, 0.08), tailLightMat);
      tl.position.set(lx, wRad + bodyHeight * 0.5, car.length / 2 + 0.01);
      proceduralGroup.add(tl);
    }
    addCornerBlinkers(wRad + bodyHeight * 0.52);

    for (const wz of [-car.length * 0.31, car.length * 0.31]) {
      for (const wx of [-car.width * 0.5, car.width * 0.5]) {
        const w = createWheelMesh(wRad, 0.24);
        w.position.set(wx, wRad, wz);
        proceduralGroup.add(w);
        wheels.push(w);
      }
    }
  }

  return {
    kind: car.kind,
    isMotorcycle: isBike,
    group,
    proceduralGroup,
    realModelKey,
    realModelGroup,
    color: car.color,
    bodyMat,
    shadowPlane: shadow,
    tailLightMat,
    blinkerLeftMat,
    blinkerRightMat,
    blinkerLeftMeshes,
    blinkerRightMeshes,
    wheels,
  };
}

function disposeObjectSafely(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
      if (obj.userData?.isSharedGlbAsset) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m && m.userData?.isOwnedCloneMaterial) {
            m.dispose();
          }
        }
        return;
      }
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose());
      } else {
        obj.material.dispose();
      }
    }
  });
}

export class Highway3DRenderer {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  public readonly isSoftwareGl: boolean;

  private roadTextureNight: THREE.CanvasTexture;
  private roadTextureDay: THREE.CanvasTexture;
  private roadMat: THREE.MeshStandardMaterial;
  private terrainTextureNight: THREE.CanvasTexture;
  private terrainTextureDay: THREE.CanvasTexture;
  private terrainMat: THREE.MeshStandardMaterial;
  private shadowTex: THREE.CanvasTexture;

  private hemiLight: THREE.HemisphereLight;
  private keyLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;

  private playerRig: PlayerCarRig;
  private trafficRigs = new Map<number, TrafficMeshRig>();
  private trafficRigPool = new Map<TrafficKind, TrafficMeshRig[]>();
  private pickupMeshes = new Map<number, THREE.Group>();

  private treeTrunks: THREE.InstancedMesh;
  private treeCanopies: THREE.InstancedMesh;
  private treePositions: Array<{ x: number; z: number; scale: number }> = [];

  private lampPoles: THREE.InstancedMesh;
  private lampHeads: THREE.InstancedMesh;
  private lampGlowCones: THREE.InstancedMesh;
  private lampGlowMat: THREE.MeshBasicMaterial;
  private lampHeadMat: THREE.MeshStandardMaterial;
  private lampPointLights: THREE.PointLight[] = [];
  private lampPositions: Array<{ x: number; z: number; side: -1 | 1 }> = [];
  private beamTex: THREE.CanvasTexture;
  private lampGlowConeTex: THREE.CanvasTexture;
  private roadRoughnessTex: THREE.CanvasTexture;
  private moonTex: THREE.CanvasTexture;
  private moonGlowTex: THREE.CanvasTexture;
  private sunGlowTex: THREE.CanvasTexture;
  private moonGroup: THREE.Group;
  private sunGroup: THREE.Group;

  private postPosts: THREE.InstancedMesh;
  private postZOffsets: number[] = [];

  private particleInstanced: THREE.InstancedMesh;
  private particleGeo: THREE.BoxGeometry;
  private particleMat: THREE.MeshBasicMaterial;
  private readonly maxParticles = 48;

  private pickupNitroCoreGeo: THREE.OctahedronGeometry;
  private pickupNitroCoreMat: THREE.MeshStandardMaterial;
  private pickupNitroRingGeo: THREE.TorusGeometry;
  private pickupNitroRingMat: THREE.MeshBasicMaterial;
  private pickupRepairBoxGeo: THREE.BoxGeometry;
  private pickupRepairBoxMat: THREE.MeshStandardMaterial;
  private pickupCrossHGeo: THREE.BoxGeometry;
  private pickupCrossVGeo: THREE.BoxGeometry;
  private pickupCrossMat: THREE.MeshBasicMaterial;

  private envRTNight: THREE.WebGLRenderTarget;
  private envRTDay: THREE.WebGLRenderTarget;
  private lastTimeOfDay: TimeOfDay | null = null;
  private lastCarId: PlayerCarId | null = null;
  private language: Language = 'ru';
  private graphicsQuality: GraphicsQuality = 'high';
  private hornWaveMesh: THREE.Mesh;

  private frameId: number = 0;
  private disposed: boolean = false;
  private unsubscribeModels: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.isSoftwareGl = detectSoftwareWebGL();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.24;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setSize(container.clientWidth || 800, container.clientHeight || 600);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#101726');
    this.scene.fog = new THREE.FogExp2('#101726', 0.0072);

    const aspect = (container.clientWidth || 800) / (container.clientHeight || 600);
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.06, 320);
    this.camera.position.set(0, 3.6, 8.2);
    this.camera.lookAt(_currentLook);

    // Physical Sky + Celestial Environment Reflections (Night Moon & Day Sun)
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.envRTNight = buildSkyEnvironment(pmremGenerator, true);
    this.envRTDay = buildSkyEnvironment(pmremGenerator, false);
    this.scene.environment = this.envRTNight.texture;
    pmremGenerator.dispose();

    // Celestial Objects in Forward-Right Sky (28, 38, -170)
    this.moonTex = createMoonTexture();
    this.moonGlowTex = createCelestialGlowTexture('rgba(226, 232, 240, 0.85)', 'rgba(148, 197, 255, 0.25)');
    this.sunGlowTex = createCelestialGlowTexture('rgba(255, 251, 235, 0.95)', 'rgba(253, 224, 71, 0.35)');

    this.moonGroup = new THREE.Group();
    this.moonGroup.position.set(28, 38, -170);
    const moonDisc = new THREE.Mesh(
      new THREE.SphereGeometry(5.2, 24, 24),
      new THREE.MeshBasicMaterial({ map: this.moonTex, color: '#F8FAFC', fog: false })
    );
    this.moonGroup.add(moonDisc);
    const moonHalo = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 26),
      new THREE.MeshBasicMaterial({
        map: this.moonGlowTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      })
    );
    this.moonGroup.add(moonHalo);
    this.scene.add(this.moonGroup);

    this.sunGroup = new THREE.Group();
    this.sunGroup.position.set(28, 38, -170);
    const sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(6.0, 24, 24),
      new THREE.MeshBasicMaterial({ color: '#FFFBEB', fog: false })
    );
    this.sunGroup.add(sunDisc);
    const sunHalo = new THREE.Mesh(
      new THREE.PlaneGeometry(36, 36),
      new THREE.MeshBasicMaterial({
        map: this.sunGlowTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      })
    );
    this.sunGroup.add(sunHalo);
    this.sunGroup.visible = false;
    this.scene.add(this.sunGroup);

    // Balanced 3-Point Lighting: KeyLight aligned directly with Moon / Sun vector (28, 38, -170)!
    this.hemiLight = new THREE.HemisphereLight('#7DD3FC', '#1E293B', 1.15);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight('#E2E8F0', 1.35);
    this.keyLight.position.set(14, 19, -85);
    this.keyLight.target.position.set(0, 0, -15);
    this.scene.add(this.keyLight.target);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 10;
    this.keyLight.shadow.camera.far = 150;
    this.keyLight.shadow.camera.left = -28;
    this.keyLight.shadow.camera.right = 28;
    this.keyLight.shadow.camera.top = 34;
    this.keyLight.shadow.camera.bottom = -34;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight('#93C5FD', 0.65);
    this.rimLight.position.set(-18, 14, 24);
    this.scene.add(this.rimLight);

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.roadTextureNight = createRoadTexture(maxAniso, true);
    this.roadTextureDay = createRoadTexture(maxAniso, false);
    this.roadRoughnessTex = createRoadRoughnessTexture(maxAniso);
    this.terrainTextureNight = createTerrainTexture(maxAniso, true);
    this.terrainTextureDay = createTerrainTexture(maxAniso, false);
    this.shadowTex = createContactShadowTexture();
    this.beamTex = createHeadlightBeamTexture();
    this.lampGlowConeTex = createLampGlowConeTexture();

    // Extended Terrain Ground (no void!)
    this.terrainMat = new THREE.MeshStandardMaterial({
      map: this.terrainTextureNight,
      roughness: 0.95,
      metalness: 0.02,
    });
    const terrainMesh = new THREE.Mesh(new THREE.PlaneGeometry(340, 320), this.terrainMat);
    terrainMesh.rotation.x = -Math.PI / 2;
    terrainMesh.position.set(0, 0, -90);
    terrainMesh.receiveShadow = true;
    this.scene.add(terrainMesh);

    // 3-Lane Highway Asphalt Surface — realistic dry matte asphalt with minimal sky reflection
    this.roadMat = new THREE.MeshStandardMaterial({
      map: this.roadTextureNight,
      roughnessMap: this.roadRoughnessTex,
      roughness: 0.9,
      metalness: 0.0,
      envMapIntensity: 0.22,
    });
    const roadMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(TOTAL_ASPHALT_WIDTH_3D, 300),
      this.roadMat
    );
    roadMesh.rotation.x = -Math.PI / 2;
    roadMesh.position.set(0, 0.025, -88);
    roadMesh.receiveShadow = true;
    this.scene.add(roadMesh);

    // Steel Guardrails
    const railMat = new THREE.MeshStandardMaterial({
      color: '#94A3B8',
      roughness: 0.35,
      metalness: 0.78,
    });
    const railGeo = new THREE.BoxGeometry(0.16, 0.28, 300);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(side * (TOTAL_ASPHALT_WIDTH_3D / 2 + 0.35), 0.62, -88);
      rail.castShadow = true;
      this.scene.add(rail);
    }

    // Instanced Guardrail Posts
    const postCount = 96;
    this.postPosts = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.14, 0.78, 0.14),
      railMat,
      postCount
    );
    this.postPosts.frustumCulled = false;
    for (let i = 0; i < postCount / 2; i++) {
      this.postZOffsets.push(24 - i * 5.2);
    }
    this.scene.add(this.postPosts);

    // Instanced Roadside Trees
    const treeCount = 64;
    this.treeTrunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.24, 0.34, 2.2, 8),
      new THREE.MeshStandardMaterial({ color: '#452719', roughness: 0.9 }),
      treeCount
    );
    this.treeCanopies = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(2.0, 1),
      new THREE.MeshStandardMaterial({ color: '#1F5E34', roughness: 0.85 }),
      treeCount
    );
    this.treeTrunks.frustumCulled = false;
    this.treeCanopies.frustumCulled = false;
    this.treeCanopies.castShadow = !this.isSoftwareGl;

    for (let i = 0; i < treeCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (TOTAL_ASPHALT_WIDTH_3D / 2 + 5.5 + Math.random() * 22);
      const z = 25 - (i / treeCount) * 235;
      const scale = 0.8 + Math.random() * 0.65;
      this.treePositions.push({ x, z, scale });

      _color.setHSL(0.35 + (Math.random() - 0.5) * 0.06, 0.45, 0.24 + Math.random() * 0.12);
      this.treeCanopies.setColorAt(i, _color);
    }
    if (this.treeCanopies.instanceColor) {
      this.treeCanopies.instanceColor.needsUpdate = true;
    }
    this.scene.add(this.treeTrunks);
    this.scene.add(this.treeCanopies);

    // Instanced Highway Street Lamps
    const lampCount = 24;
    this.lampPoles = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.08, 0.12, 6.2, 8),
      new THREE.MeshStandardMaterial({ color: '#475569', metalness: 0.7, roughness: 0.35 }),
      lampCount
    );
    this.lampHeadMat = new THREE.MeshStandardMaterial({
      color: '#FEF08A',
      emissive: '#FDE047',
      emissiveIntensity: 3.6,
    });
    this.lampHeads = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.15, 0.2, 0.42),
      this.lampHeadMat,
      lampCount
    );
    this.lampGlowMat = new THREE.MeshBasicMaterial({
      map: this.lampGlowConeTex,
      color: '#FDE68A',
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.lampGlowCones = new THREE.InstancedMesh(
      new THREE.ConeGeometry(4.6, 5.8, 18, 1, true),
      this.lampGlowMat,
      lampCount
    );
    this.lampPoles.frustumCulled = false;
    this.lampHeads.frustumCulled = false;
    this.lampGlowCones.frustumCulled = false;
    for (let i = 0; i < lampCount; i++) {
      const side: -1 | 1 = i % 2 === 0 ? -1 : 1;
      const x = side * (TOTAL_ASPHALT_WIDTH_3D / 2 + 0.9);
      const z = 18 - Math.floor(i / 2) * 19;
      this.lampPositions.push({ x, z, side });
    }
    this.scene.add(this.lampPoles);
    this.scene.add(this.lampHeads);
    this.scene.add(this.lampGlowCones);

    // 2 pooled PointLights that illuminate road & traffic under nearest street lamps
    for (let i = 0; i < 2; i++) {
      const pl = new THREE.PointLight('#FDE68A', 40, 34, 1.15);
      pl.position.set(0, 5.6, -24 * i);
      this.scene.add(pl);
      this.lampPointLights.push(pl);
    }

    // Player Car Rig
    this.playerRig = buildPlayerCar(
      PLAYER_CARS[0],
      this.shadowTex,
      this.beamTex,
      this.isSoftwareGl,
      this.language
    );
    this.lastCarId = PLAYER_CARS[0].id;
    this.scene.add(this.playerRig.root);

    // Subtle visual acoustic horn ring ahead of grille when pressing H
    this.hornWaveMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.05, 24),
      new THREE.MeshBasicMaterial({
        color: '#FBBF24',
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      })
    );
    this.hornWaveMesh.position.set(0, 0.75, -2.5);
    this.playerRig.root.add(this.hornWaveMesh);

    // Pre-allocated single InstancedMesh particle pool (1 draw call, zero crash-frame shader stalls)
    this.particleGeo = new THREE.BoxGeometry(1, 1, 1);
    this.particleMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });
    this.particleInstanced = new THREE.InstancedMesh(
      this.particleGeo,
      this.particleMat,
      this.maxParticles
    );
    this.particleInstanced.frustumCulled = false;
    for (let i = 0; i < this.maxParticles; i++) {
      _dummy.position.set(0, -10, 0);
      _dummy.scale.setScalar(0.0001);
      _dummy.updateMatrix();
      this.particleInstanced.setMatrixAt(i, _dummy.matrix);
      this.particleInstanced.setColorAt(i, _color.set('#FBBF24'));
    }
    this.particleInstanced.instanceMatrix.needsUpdate = true;
    if (this.particleInstanced.instanceColor) {
      this.particleInstanced.instanceColor.needsUpdate = true;
    }
    this.particleInstanced.count = 1;
    this.scene.add(this.particleInstanced);

    // Shared Pickup geometries & materials (pooled so spawning pickups never compiles shaders mid-run)
    this.pickupNitroCoreGeo = new THREE.OctahedronGeometry(0.55, 0);
    this.pickupNitroCoreMat = new THREE.MeshStandardMaterial({
      color: '#38BDF8',
      emissive: '#0284C7',
      emissiveIntensity: 1.5,
      roughness: 0.2,
      metalness: 0.4,
    });
    this.pickupNitroRingGeo = new THREE.TorusGeometry(0.74, 0.06, 8, 24);
    this.pickupNitroRingMat = new THREE.MeshBasicMaterial({ color: '#BAE6FD' });
    this.pickupRepairBoxGeo = new THREE.BoxGeometry(0.85, 0.85, 0.85);
    this.pickupRepairBoxMat = new THREE.MeshStandardMaterial({
      color: '#10B981',
      emissive: '#059669',
      emissiveIntensity: 1.2,
      roughness: 0.25,
    });
    this.pickupCrossHGeo = new THREE.BoxGeometry(0.58, 0.18, 0.9);
    this.pickupCrossVGeo = new THREE.BoxGeometry(0.18, 0.58, 0.9);
    this.pickupCrossMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });

    // Pre-warm shaders on GPU (temporarily toggle dynamic effects visible so compile() caches their programs)
    this.playerRig.nitroFlames.visible = true;
    this.playerRig.nitroFlames.scale.setScalar(0.0001);
    this.hornWaveMesh.visible = true;
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
    this.particleInstanced.count = 0;
    this.playerRig.nitroFlames.visible = false;
    this.playerRig.nitroFlames.scale.setScalar(1);
    this.hornWaveMesh.visible = false;

    this.applyAtmosphere('night');

    preloadAllRealCarModels();
    this.unsubscribeModels = onRealCarModelReady((key) => {
      if (this.disposed) return;
      const quality = this.graphicsQuality;
      if (this.playerRig.realModelKey === key && !this.playerRig.realModelGroup) {
        const realGroup = instantiateRealCarModel(key, this.playerRig.carColor);
        if (realGroup) {
          applyRealCarQuality(realGroup, quality);
          this.playerRig.realModelGroup = realGroup;
          this.playerRig.bodyGroup.add(realGroup);
          this.playerRig.proceduralExteriorGroup.visible = false;
          this.playerRig.proceduralWheelsGroup.visible = false;
          this.playerRig.cabinInteriorGroup.visible = false;
          this.playerRig.steeringWheel.visible = false;
        }
      }
      for (const rig of this.trafficRigs.values()) {
        if (rig.realModelKey === key && !rig.realModelGroup) {
          const realGroup = instantiateRealCarModel(key, rig.color);
          if (realGroup) {
            applyRealCarQuality(realGroup, quality);
            rig.realModelGroup = realGroup;
            rig.group.add(realGroup);
            rig.proceduralGroup.visible = false;
          }
        }
      }
      for (const list of this.trafficRigPool.values()) {
        for (const rig of list) {
          if (rig.realModelKey === key && !rig.realModelGroup) {
            const realGroup = instantiateRealCarModel(key, rig.color);
            if (realGroup) {
              applyRealCarQuality(realGroup, quality);
              rig.realModelGroup = realGroup;
              rig.group.add(realGroup);
              rig.proceduralGroup.visible = false;
            }
          }
        }
      }
    });
  }

  public resize(width: number, height: number) {
    if (this.disposed || width <= 0 || height <= 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private applyMaterialQuality(
    rig: PlayerCarRig,
    quality: GraphicsQuality
  ) {
    const isLow = quality === 'low';
    const isMedium = quality === 'medium';
    const isTank = rig.archetype === 'tank';
    const isSedan = rig.archetype === 'sedan';
    rig.shadowPlane.visible = !isLow;
    rig.bodyMat.clearcoat = isLow
      ? 0
      : isMedium
      ? isTank
        ? 0.06
        : 0.4
      : isTank
      ? 0.12
      : isSedan
      ? 0.45
      : 1.0;
    rig.bodyMat.roughness = isLow ? 0.92 : isTank ? 0.68 : isSedan ? 0.36 : 0.22;
    rig.bodyMat.metalness = isLow ? 0 : isTank ? 0.28 : isSedan ? 0.25 : 0.55;
    rig.bodyMat.envMapIntensity = isLow ? 0 : isMedium ? 0.8 : 1.0;

    rig.windshieldMat.clearcoat = isLow ? 0 : isMedium ? 0.5 : 1.0;
    rig.windshieldMat.roughness = isLow ? 0.85 : 0.04;
    rig.windshieldMat.metalness = isLow ? 0 : 0.12;
    rig.windshieldMat.envMapIntensity = isLow ? 0 : isMedium ? 0.8 : 1.0;

    if (rig.realModelGroup) {
      applyRealCarQuality(rig.realModelGroup, quality);
    }
  }

  private applyTrafficMaterialQuality(rig: TrafficMeshRig, quality: GraphicsQuality) {
    if (rig.appliedQuality === quality) return;
    rig.appliedQuality = quality;
    const isLow = quality === 'low';
    const isMedium = quality === 'medium';
    rig.shadowPlane.visible = !isLow;
    rig.bodyMat.clearcoat = isLow ? 0 : isMedium ? 0.35 : 0.7;
    rig.bodyMat.roughness = isLow ? 0.92 : 0.3;
    rig.bodyMat.metalness = isLow ? 0 : 0.35;
    rig.bodyMat.envMapIntensity = isLow ? 0 : isMedium ? 0.8 : 1.0;

    if (rig.realModelGroup) {
      applyRealCarQuality(rig.realModelGroup, quality);
    }
  }

  private syncDynamicLights() {
    const isNight = this.lastTimeOfDay !== 'day';
    const quality = this.graphicsQuality;
    const isLow = quality === 'low';
    const isHigh = quality === 'high';

    this.rimLight.intensity = isLow ? 0 : isNight ? (isHigh ? 0.75 : 0.5) : (isHigh ? 0.55 : 0.38);
    this.scene.environment = isLow
      ? null
      : isNight
      ? this.envRTNight.texture
      : this.envRTDay.texture;

    if (isNight) {
      this.hemiLight.intensity = isLow ? 1.85 : 1.15;
      this.keyLight.intensity = isLow ? 2.15 : 1.45;
      this.renderer.toneMappingExposure = isLow ? 1.42 : 1.24;

      this.lampHeadMat.emissiveIntensity = isLow ? 2.4 : isHigh ? 3.6 : 3.0;
      this.lampGlowCones.visible = true;
      this.playerRig.headlightBeamPlane.visible = true;
      const beamIntensity = isHigh ? (this.isSoftwareGl ? 115 : 145) : 0;
      this.playerRig.headlightLeft.intensity = beamIntensity;
      this.playerRig.headlightRight.intensity = beamIntensity;
      for (const pl of this.lampPointLights) {
        pl.intensity = isHigh ? 40 : 0;
      }
    } else {
      this.hemiLight.intensity = isLow ? 1.65 : 1.25;
      this.keyLight.intensity = isLow ? 2.75 : 2.4;
      this.renderer.toneMappingExposure = isLow ? 1.34 : 1.24;

      this.lampHeadMat.emissiveIntensity = 0.1;
      this.lampGlowCones.visible = false;
      this.playerRig.headlightBeamPlane.visible = false;
      this.playerRig.headlightLeft.intensity = 0;
      this.playerRig.headlightRight.intensity = 0;
      for (const pl of this.lampPointLights) {
        pl.intensity = 0;
      }
    }
  }

  public applyGraphicsQuality(quality: GraphicsQuality) {
    if (this.graphicsQuality === quality) return;
    this.graphicsQuality = quality;
    const isLow = quality === 'low';
    const isMedium = quality === 'medium';
    const isHigh = quality === 'high';
    const enableShadows = isHigh && !this.isSoftwareGl;

    const pixelRatio =
      isLow || this.isSoftwareGl
        ? 1
        : isMedium
        ? Math.min(window.devicePixelRatio, 1.2)
        : Math.min(window.devicePixelRatio, 1.5);

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(this.container.clientWidth || 800, this.container.clientHeight || 600);
    this.renderer.shadowMap.enabled = enableShadows;
    this.renderer.shadowMap.autoUpdate = enableShadows;
    this.renderer.shadowMap.needsUpdate = enableShadows;

    this.keyLight.castShadow = enableShadows;
    this.treeCanopies.castShadow = enableShadows;

    this.camera.far = isLow ? 210 : isMedium ? 260 : 320;
    this.camera.updateProjectionMatrix();

    // Dry matte road surface on all tiers (zero mirror glare on High, flat on Low)
    this.roadMat.roughnessMap = isHigh ? this.roadRoughnessTex : null;
    this.roadMat.roughness = isLow ? 1.0 : isMedium ? 0.94 : 0.9;
    this.roadMat.metalness = 0.0;
    this.roadMat.envMapIntensity = isLow ? 0.0 : isMedium ? 0.1 : 0.22;
    this.roadMat.needsUpdate = true;

    // Hide sky glow halos in low mode
    if (this.moonGroup.children[1]) this.moonGroup.children[1].visible = !isLow;
    if (this.sunGroup.children[1]) this.sunGroup.children[1].visible = !isLow;

    // Trees: full on High, half on Medium, off on Low; guardrail posts only on High; lamps always visible
    const treeCount = isLow
      ? 0
      : isMedium
      ? Math.floor(this.treePositions.length / 2)
      : this.treePositions.length;
    this.treeTrunks.visible = !isLow;
    this.treeCanopies.visible = !isLow;
    this.treeTrunks.count = treeCount;
    this.treeCanopies.count = treeCount;
    this.postPosts.visible = isHigh;
    this.lampPoles.visible = true;
    this.lampHeads.visible = true;

    this.applyMaterialQuality(this.playerRig, quality);
    for (const rig of this.trafficRigs.values()) {
      this.applyTrafficMaterialQuality(rig, quality);
    }

    this.syncDynamicLights();
  }

  public applyAtmosphere(tod: TimeOfDay) {
    if (this.lastTimeOfDay === tod) return;
    this.lastTimeOfDay = tod;
    const isNight = tod === 'night';

    const bgHex = isNight ? '#101726' : '#7AA7CE';
    (this.scene.background as THREE.Color).set(bgHex);
    (this.scene.fog as THREE.FogExp2).color.set(bgHex);
    (this.scene.fog as THREE.FogExp2).density = isNight ? 0.0072 : 0.006;

    this.roadMat.map = isNight ? this.roadTextureNight : this.roadTextureDay;
    this.roadMat.needsUpdate = true;
    this.terrainMat.map = isNight ? this.terrainTextureNight : this.terrainTextureDay;
    this.terrainMat.needsUpdate = true;

    this.moonGroup.visible = isNight;
    this.sunGroup.visible = !isNight;

    if (isNight) {
      this.hemiLight.color.set('#7DD3FC');
      this.hemiLight.groundColor.set('#1E293B');
      this.keyLight.color.set('#DBEAFE');
    } else {
      this.hemiLight.color.set('#BAE6FD');
      this.hemiLight.groundColor.set('#3F6212');
      this.keyLight.color.set('#FFFBEB');
    }
    this.syncDynamicLights();
  }

  public applyLanguage(lang: Language) {
    if (this.language === lang) return;
    this.language = lang;
    drawCenterScreen(
      this.playerRig.centerScreenCanvas,
      this.playerRig.centerScreenCtx,
      this.playerRig.centerScreenTex,
      this.playerRig.lastScreenGear,
      this.playerRig.lastScreenNitro,
      this.language
    );
  }

  public applyCarStyle(carId: PlayerCarId) {
    if (this.lastCarId === carId) return;
    this.lastCarId = carId;
    const opt = PLAYER_CARS.find((c) => c.id === carId) ?? PLAYER_CARS[0];

    // Cleanly dispose old player vehicle rig and build bespoke 3D archetype
    this.playerRig.root.remove(this.hornWaveMesh);
    this.scene.remove(this.playerRig.root);
    this.playerRig.centerScreenTex.dispose();
    this.playerRig.speedoDialTex.dispose();
    disposeObjectSafely(this.playerRig.root);

    this.playerRig = buildPlayerCar(
      opt,
      this.shadowTex,
      this.beamTex,
      this.isSoftwareGl,
      this.language
    );
    this.playerRig.root.add(this.hornWaveMesh);
    this.scene.add(this.playerRig.root);

    this.applyMaterialQuality(this.playerRig, this.graphicsQuality);
    this.syncDynamicLights();
  }

  public syncAndRender(
    engine: Highway3DEngine,
    dt: number,
    cameraMode: CameraMode,
    isBraking: boolean,
    snapCamera: boolean = false
  ) {
    if (this.disposed) return;

    // 1. Scroll Road & Terrain Textures (1:1 world meters: road height 300 / repeat 20 = 15m, terrain 320 / 32 = 10m)
    const roadOffset = (engine.worldScrollMeters / 15) % 1;
    this.roadTextureNight.offset.y = roadOffset;
    this.roadTextureDay.offset.y = roadOffset;
    this.roadRoughnessTex.offset.y = roadOffset;

    const terrainOffset = (engine.worldScrollMeters / 10) % 1;
    this.terrainTextureNight.offset.y = terrainOffset;
    this.terrainTextureDay.offset.y = terrainOffset;

    // 2. Scroll Instanced Trees, Lamps, and Guardrail Posts toward +Z (toward camera)
    const treeLoop = 235;
    const treeMinZ = 25 - treeLoop; // -210..+25
    const treeVisibleCount = this.treeTrunks.count;
    for (let i = 0; i < treeVisibleCount; i++) {
      const tp = this.treePositions[i];
      const wrapped = (((tp.z + engine.worldScrollMeters - treeMinZ) % treeLoop) + treeLoop) % treeLoop;
      const z = treeMinZ + wrapped;

      _dummy.position.set(tp.x, 1.1 * tp.scale, z);
      _dummy.scale.setScalar(tp.scale);
      _dummy.rotation.set(0, 0, 0);
      _dummy.updateMatrix();
      this.treeTrunks.setMatrixAt(i, _dummy.matrix);

      _dummy.position.set(tp.x, 2.9 * tp.scale, z);
      _dummy.updateMatrix();
      this.treeCanopies.setMatrixAt(i, _dummy.matrix);
    }
    if (treeVisibleCount > 0) {
      this.treeTrunks.instanceMatrix.needsUpdate = true;
      this.treeCanopies.instanceMatrix.needsUpdate = true;
    }

    const lampLoop = 228;
    const lampMinZ = 20 - lampLoop; // -208..+20
    let activePointLightIdx = 0;
    const updateLampPointLights = this.graphicsQuality === 'high';
    for (let i = 0; i < this.lampPositions.length; i++) {
      const lp = this.lampPositions[i];
      const wrapped = (((lp.z + engine.worldScrollMeters - lampMinZ) % lampLoop) + lampLoop) % lampLoop;
      const z = lampMinZ + wrapped;

      _dummy.position.set(lp.x, 3.1, z);
      _dummy.scale.set(1, 1, 1);
      _dummy.rotation.set(0, 0, 0);
      _dummy.updateMatrix();
      this.lampPoles.setMatrixAt(i, _dummy.matrix);

      const headX = lp.x - lp.side * 0.55;
      _dummy.position.set(headX, 6.1, z);
      _dummy.updateMatrix();
      this.lampHeads.setMatrixAt(i, _dummy.matrix);

      _dummy.position.set(headX, 3.05, z);
      _dummy.updateMatrix();
      this.lampGlowCones.setMatrixAt(i, _dummy.matrix);

      if (updateLampPointLights && activePointLightIdx < this.lampPointLights.length && z > -65 && z < 14) {
        this.lampPointLights[activePointLightIdx++].position.set(headX, 5.4, z);
      }
    }
    this.lampPoles.instanceMatrix.needsUpdate = true;
    this.lampHeads.instanceMatrix.needsUpdate = true;
    this.lampGlowCones.instanceMatrix.needsUpdate = true;

    if (this.graphicsQuality === 'high') {
      const postLoop = 249.6;
      const postMinZ = 24 - postLoop; // -225.6..+24
      let postIdx = 0;
      for (let i = 0; i < this.postZOffsets.length; i++) {
        const wrapped = (((this.postZOffsets[i] + engine.worldScrollMeters - postMinZ) % postLoop) + postLoop) % postLoop;
        const z = postMinZ + wrapped;
        for (const side of [-1, 1]) {
          _dummy.position.set(side * (TOTAL_ASPHALT_WIDTH_3D / 2 + 0.35), 0.39, z);
          _dummy.scale.set(1, 1, 1);
          _dummy.updateMatrix();
          this.postPosts.setMatrixAt(postIdx++, _dummy.matrix);
        }
      }
      this.postPosts.instanceMatrix.needsUpdate = true;
    }

    // 3. Player Car Transform, Steering, Lights & Blink
    const blinkHide =
      engine.invulnerableTimer > 0 && Math.floor(engine.invulnerableTimer * 14) % 2 === 0;
    this.playerRig.root.visible = !blinkHide;
    this.playerRig.root.position.set(engine.playerX, 0, 0);
    this.playerRig.root.rotation.y = engine.playerYaw;
    this.playerRig.bodyGroup.rotation.z = engine.playerRoll;

    // Steering wheel rotation driven by steering input & live speedometer needle inside cabin
    this.playerRig.steeringWheel.rotation.z = -engine.steerInput * 0.58;
    const speedNorm = Math.max(0, Math.min(1, (engine.speedKmh - 60) / 215));
    this.playerRig.speedoNeedle.rotation.z = 2.1 - speedNorm * 4.2;

    // Update cockpit center telemetry screen only on gear or nitro state change
    if (
      this.playerRig.lastScreenGear !== engine.gear ||
      this.playerRig.lastScreenNitro !== engine.isNitroActive
    ) {
      this.playerRig.lastScreenGear = engine.gear;
      this.playerRig.lastScreenNitro = engine.isNitroActive;
      drawCenterScreen(
        this.playerRig.centerScreenCanvas,
        this.playerRig.centerScreenCtx,
        this.playerRig.centerScreenTex,
        engine.gear,
        engine.isNitroActive,
        this.language
      );
    }

    // Animate H-pattern gear lever & 1st-person driver arms/hands
    let handToShifter = 0;
    const prevGate = GEAR_GATE_ANGLES[engine.prevGear] ?? GEAR_GATE_ANGLES[3];
    const currGate = GEAR_GATE_ANGLES[engine.gear] ?? GEAR_GATE_ANGLES[3];
    if (engine.gearShiftTimer > 0) {
      const progress = 1 - engine.gearShiftTimer / engine.gearShiftDuration;
      if (progress < 0.28) {
        const k = progress / 0.28;
        handToShifter = k * k * (3 - 2 * k);
        this.playerRig.gearLeverPivot.rotation.set(prevGate.rx, 0, prevGate.rz);
      } else if (progress < 0.68) {
        handToShifter = 1;
        const k = (progress - 0.28) / 0.4;
        const smooth = k * k * (3 - 2 * k);
        this.playerRig.gearLeverPivot.rotation.set(
          THREE.MathUtils.lerp(prevGate.rx, currGate.rx, smooth),
          0,
          THREE.MathUtils.lerp(prevGate.rz, currGate.rz, smooth)
        );
      } else {
        const k = 1 - (progress - 0.68) / 0.32;
        handToShifter = k * k * (3 - 2 * k);
        this.playerRig.gearLeverPivot.rotation.set(currGate.rx, 0, currGate.rz);
      }
    } else {
      this.playerRig.gearLeverPivot.rotation.set(currGate.rx, 0, currGate.rz);
    }

    const isFirst = cameraMode === 'first';
    const isF1 = this.playerRig.archetype === 'f1';
    const isBike = this.playerRig.isMotorcycle;
    this.playerRig.driverArmsGroup.visible = isFirst && !isF1 && !isBike;
    if (isFirst && !isF1 && !isBike) {
      this.playerRig.steeringWheel.updateMatrix();
      this.playerRig.gearLeverPivot.updateMatrix();

      // Left hand: always locked onto 9:30 wheel rim grip
      this.playerRig.leftHandGroup.position
        .copy(this.playerRig.leftGripAnchor.position)
        .applyMatrix4(this.playerRig.steeringWheel.matrix);
      this.playerRig.leftHandGroup.quaternion
        .copy(this.playerRig.steeringWheel.quaternion)
        .multiply(this.playerRig.leftGripAnchor.quaternion);

      // Right hand: smoothly transitions between 2:30 wheel grip and H-pattern shifter knob
      _gripPos
        .copy(this.playerRig.rightGripAnchor.position)
        .applyMatrix4(this.playerRig.steeringWheel.matrix);
      _gripQuat
        .copy(this.playerRig.steeringWheel.quaternion)
        .multiply(this.playerRig.rightGripAnchor.quaternion);

      if (handToShifter > 0.001) {
        _shiftPos
          .copy(this.playerRig.shifterGripAnchor.position)
          .applyMatrix4(this.playerRig.gearLeverPivot.matrix);
        _shiftQuat
          .copy(this.playerRig.gearLeverPivot.quaternion)
          .multiply(this.playerRig.shifterGripAnchor.quaternion);

        _handPos.lerpVectors(_gripPos, _shiftPos, handToShifter);
        // Subtle lift/back arc while hand travels between wheel rim and gear knob
        const transitArc = Math.sin(handToShifter * Math.PI);
        _handPos.y += transitArc * 0.045;
        _handPos.z += transitArc * 0.032;

        this.playerRig.rightHandGroup.position.copy(_handPos);
        this.playerRig.rightHandGroup.quaternion.slerpQuaternions(
          _gripQuat,
          _shiftQuat,
          handToShifter
        );
      } else {
        this.playerRig.rightHandGroup.position.copy(_gripPos);
        this.playerRig.rightHandGroup.quaternion.copy(_gripQuat);
      }

      // Update left forearm cylinder between elbow and wrist
      _armDir.subVectors(this.playerRig.leftHandGroup.position, _elbowLeft);
      const leftLen = Math.max(0.1, _armDir.length());
      _armMid.addVectors(_elbowLeft, this.playerRig.leftHandGroup.position).multiplyScalar(0.5);
      this.playerRig.leftForearmMesh.position.copy(_armMid);
      this.playerRig.leftForearmMesh.scale.set(1, leftLen, 1);
      this.playerRig.leftForearmMesh.quaternion.setFromUnitVectors(_upAxis, _armDir.normalize());

      // Update right forearm cylinder between elbow and wrist
      _armDir.subVectors(this.playerRig.rightHandGroup.position, _elbowRight);
      const rightLen = Math.max(0.1, _armDir.length());
      _armMid.addVectors(_elbowRight, this.playerRig.rightHandGroup.position).multiplyScalar(0.5);
      this.playerRig.rightForearmMesh.position.copy(_armMid);
      this.playerRig.rightForearmMesh.scale.set(1, rightLen, 1);
      this.playerRig.rightForearmMesh.quaternion.setFromUnitVectors(_upAxis, _armDir.normalize());
    }

    // Front wheel turn & wheel spin
    const wheelTurnScale = Math.min(0.38, 0.24 * (0.7 + 0.3 * engine.steeringSensitivity));
    for (const p of this.playerRig.frontWheelPivots) {
      p.rotation.y = -engine.steerInput * wheelTurnScale;
    }
    for (const w of this.playerRig.wheelSpinMeshes) {
      w.rotation.x = -engine.wheelSpinAngle;
    }

    // Brake lights & Horn headlight flash
    this.playerRig.tailLightMat.emissiveIntensity = isBraking ? 4.2 : 1.1;
    const hornFlash = engine.hornActive || engine.hornFlashTimer > 0;
    this.playerRig.headLightMat.emissiveIntensity = hornFlash ? 5.5 : 2.6;
    if (this.lastTimeOfDay === 'night') {
      const baseBeam = this.graphicsQuality === 'high' ? (this.isSoftwareGl ? 115 : 145) : 0;
      const beamVal = hornFlash ? baseBeam * 1.55 : baseBeam;
      this.playerRig.headlightLeft.intensity = beamVal;
      this.playerRig.headlightRight.intensity = beamVal;
      (this.playerRig.headlightBeamPlane.material as THREE.MeshBasicMaterial).opacity = hornFlash ? 0.92 : 0.72;
    }

    // Police emergency lightbar animation
    if (this.playerRig.policeRedMat && this.playerRig.policeBlueMat) {
      const pulseSpeed = engine.hornActive ? 0.018 : 0.008;
      const phase = Math.floor(performance.now() * pulseSpeed) % 2 === 0;
      this.playerRig.policeRedMat.emissiveIntensity = phase ? 4.2 : 0.3;
      this.playerRig.policeBlueMat.emissiveIntensity = phase ? 0.3 : 4.2;
    }

    // Tank turret subtle counter-aim & cannon muzzle flash on Horn (H)
    if (this.playerRig.turretGroup) {
      this.playerRig.turretGroup.rotation.y = -engine.steerInput * 0.08;
    }
    if (this.playerRig.tankMuzzleFlash) {
      this.playerRig.tankMuzzleFlash.visible = engine.hornFlashTimer > 0.15;
    }

    // Horn acoustic ring pulse
    if (engine.hornActive || engine.hornFlashTimer > 0) {
      const t = (performance.now() * 0.006) % 1;
      this.hornWaveMesh.visible = true;
      this.hornWaveMesh.scale.setScalar(1 + t * 2.2);
      const baseZ = this.playerRig.archetype === 'tank' ? -3.3 : isBike ? -1.35 : -2.4;
      this.hornWaveMesh.position.z = baseZ - t * 2.6;
      (this.hornWaveMesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.75;
    } else {
      this.hornWaveMesh.visible = false;
    }

    // Nitro exhaust flames
    this.playerRig.nitroFlames.visible = engine.isNitroActive;
    if (engine.isNitroActive) {
      this.playerRig.nitroFlames.scale.z = 0.8 + Math.random() * 0.65;
    }

    // Switch cleanly between real GLB exterior (3rd-person, F1 & motorcycles) and procedural cockpit (1st-person cars)
    const hasRealModel = this.playerRig.realModelGroup !== null;
    if (hasRealModel && this.playerRig.realModelGroup) {
      const showReal = !isFirst || isF1 || isBike;
      this.playerRig.realModelGroup.visible = showReal;
      this.playerRig.proceduralExteriorGroup.visible = !showReal;
      this.playerRig.proceduralWheelsGroup.visible = !showReal;
      this.playerRig.cabinInteriorGroup.visible = isFirst && !isF1 && !isBike;
      this.playerRig.steeringWheel.visible = isFirst && !isF1 && !isBike;
      this.playerRig.driverArmsGroup.visible = isFirst && !isF1 && !isBike;
    } else {
      this.playerRig.proceduralExteriorGroup.visible = true;
      this.playerRig.proceduralWheelsGroup.visible = true;
      this.playerRig.cabinInteriorGroup.visible = !isF1 && !isBike;
      this.playerRig.steeringWheel.visible = !isF1 && !isBike;
      this.playerRig.driverArmsGroup.visible = isFirst && !isF1 && !isBike;
    }

    // Keep cabin roof & glass windshield visible in 1st-person mode (lower glass opacity so cabin & reflections look crisp)
    if (!isF1 && !isBike) {
      this.playerRig.roofMesh.visible = true;
      this.playerRig.windshieldMesh.visible = true;
      this.playerRig.windshieldMat.opacity = isFirst ? 0.14 : 0.42;
    }

    // 4. Sync Traffic Cars (with zero-churn object pooling)
    const activeIds = new Set<number>();
    const blinkOn = Math.floor(performance.now() * 0.009) % 2 === 0;
    for (const car of engine.traffic) {
      activeIds.add(car.id);
      let rig = this.trafficRigs.get(car.id);
      if (!rig) {
        const pool = this.trafficRigPool.get(car.kind);
        const recycled = pool && pool.length > 0 ? pool.pop() : undefined;
        if (recycled) {
          rig = recycled;
          rig.color = car.color;
          rig.bodyMat.color.set(car.color);
          if (rig.realModelGroup) {
            setRealCarPaintColor(rig.realModelGroup, car.color);
          }
          rig.group.visible = true;
        } else {
          rig = buildTrafficCarRig(car, this.shadowTex);
          this.scene.add(rig.group);
        }
        this.applyTrafficMaterialQuality(rig, this.graphicsQuality);
        this.trafficRigs.set(car.id, rig);
      }
      rig.group.position.set(car.x, 0, car.z);
      rig.group.rotation.y = car.yaw;
      rig.group.rotation.z = rig.isMotorcycle ? -car.yaw * 2.4 : 0;
      const flashHazard =
        car.hornReactionTimer > 0 && Math.floor(car.hornReactionTimer * 12) % 2 === 0;
      rig.tailLightMat.emissiveIntensity = car.braking || flashHazard ? 3.8 : 0.8;
      const leftBlink = car.turnSignal === -1 && blinkOn;
      const rightBlink = car.turnSignal === 1 && blinkOn;
      rig.blinkerLeftMat.emissiveIntensity = leftBlink ? 4.2 : 0.0;
      rig.blinkerRightMat.emissiveIntensity = rightBlink ? 4.2 : 0.0;
      for (const m of rig.blinkerLeftMeshes) m.visible = leftBlink;
      for (const m of rig.blinkerRightMeshes) m.visible = rightBlink;
    }

    for (const [id, rig] of this.trafficRigs) {
      if (!activeIds.has(id)) {
        this.trafficRigs.delete(id);
        let pool = this.trafficRigPool.get(rig.kind);
        if (!pool) {
          pool = [];
          this.trafficRigPool.set(rig.kind, pool);
        }
        if (pool.length < 6) {
          rig.group.visible = false;
          pool.push(rig);
        } else {
          this.scene.remove(rig.group);
          disposeObjectSafely(rig.group);
        }
      }
    }

    // 5. Sync 3D Pickups (shared geometries/materials for zero shader churn)
    const activePickups = new Set<number>();
    for (const item of engine.pickups) {
      activePickups.add(item.id);
      let mesh = this.pickupMeshes.get(item.id);
      if (!mesh) {
        mesh = this.createPickupMesh(item);
        this.scene.add(mesh);
        this.pickupMeshes.set(item.id, mesh);
      }
      mesh.position.set(item.x, 0.85 + Math.sin(item.phase) * 0.16, item.z);
      mesh.rotation.y = item.phase * 0.8;
    }
    for (const [id, mesh] of this.pickupMeshes) {
      if (!activePickups.has(id)) {
        this.scene.remove(mesh);
        this.pickupMeshes.delete(id);
      }
    }

    // 6. Sync Particles via single InstancedMesh
    const pCount = Math.min(this.maxParticles, engine.particles.length);
    this.particleInstanced.count = pCount;
    if (pCount > 0) {
      for (let i = 0; i < pCount; i++) {
        const p = engine.particles[i];
        _dummy.position.set(p.x, p.y, p.z);
        const s = p.size * Math.max(0.2, p.life / p.maxLife);
        _dummy.scale.setScalar(s);
        _dummy.rotation.set(0, 0, 0);
        _dummy.updateMatrix();
        this.particleInstanced.setMatrixAt(i, _dummy.matrix);
        _color.set(p.color);
        this.particleInstanced.setColorAt(i, _color);
      }
      this.particleInstanced.instanceMatrix.needsUpdate = true;
      if (this.particleInstanced.instanceColor) {
        this.particleInstanced.instanceColor.needsUpdate = true;
      }
    }

    // 7. Smooth Camera Choreography (3rd-Person Chase vs 1st-Person Cockpit/Rider)
    const shakeX =
      engine.shakeTimer > 0 ? (Math.random() - 0.5) * 0.45 * (engine.shakeTimer / 0.38) : 0;
    const shakeY =
      engine.shakeTimer > 0 ? (Math.random() - 0.5) * 0.32 * (engine.shakeTimer / 0.38) : 0;

    if (cameraMode === 'first') {
      // 1st-person driver seat inside cabin (centered F1 helmet-cam or motorcycle rider-cam)
      const cosY = Math.cos(engine.playerYaw);
      const sinY = Math.sin(engine.playerYaw);
      const localEyeX = isF1 || isBike ? 0 : -0.34;
      const localEyeY = isBike ? 1.24 : isF1 ? 0.94 : 1.11 + this.playerRig.cockpitOffsetY;
      const localEyeZ = isBike ? 0.14 : isF1 ? 0.25 : 0.25 + this.playerRig.cockpitOffsetZ;
      const driverOffsetX = localEyeX * cosY + localEyeZ * sinY;
      const driverOffsetZ = -localEyeX * sinY + localEyeZ * cosY;
      _targetPos.set(
        engine.playerX + driverOffsetX + shakeX * 0.35,
        localEyeY + shakeY * 0.35,
        driverOffsetZ
      );
      _targetLook.set(
        engine.playerX + localEyeX * cosY - 22 * sinY,
        isBike ? 0.96 : isF1 ? 0.78 : 0.95 + this.playerRig.cockpitOffsetY,
        -localEyeX * sinY - 28 * cosY
      );
      const targetFov = engine.isNitroActive ? 86 : 76 + Math.max(0, (engine.speedKmh - 120) * 0.05);
      if (snapCamera) {
        this.camera.position.copy(_targetPos);
        _currentLook.copy(_targetLook);
        this.camera.fov = targetFov;
      } else {
        this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _targetPos.x, 15, dt);
        this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _targetPos.y, 14, dt);
        this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _targetPos.z, 15, dt);
        _currentLook.x = THREE.MathUtils.damp(_currentLook.x, _targetLook.x, 12, dt);
        _currentLook.y = THREE.MathUtils.damp(_currentLook.y, _targetLook.y, 12, dt);
        _currentLook.z = THREE.MathUtils.damp(_currentLook.z, _targetLook.z, 12, dt);
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 7, dt);
      }
      this.camera.lookAt(_currentLook);
      this.camera.rotation.z = engine.playerRoll * (isBike ? 0.35 : 0.45);
    } else {
      // 3rd-person chase cam behind car / motorcycle
      const isTank = this.playerRig.archetype === 'tank';
      _targetPos.set(
        engine.playerX * 0.92 + shakeX,
        (isTank ? 3.95 : isF1 ? 3.25 : isBike ? 2.65 : 3.65) + shakeY,
        isTank ? 8.8 : isF1 ? 7.9 : isBike ? 5.6 : 8.2
      );
      _targetLook.set(
        engine.playerX * 0.96,
        isTank ? 1.15 : isF1 ? 0.8 : isBike ? 0.78 : 1.0,
        -15
      );
      const targetFov = engine.isNitroActive ? 76 : 62 + Math.max(0, (engine.speedKmh - 120) * 0.06);
      if (snapCamera) {
        this.camera.position.copy(_targetPos);
        _currentLook.copy(_targetLook);
        this.camera.fov = targetFov;
      } else {
        this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _targetPos.x, 7.5, dt);
        this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _targetPos.y, 9, dt);
        this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _targetPos.z, 9, dt);
        _currentLook.x = THREE.MathUtils.damp(_currentLook.x, _targetLook.x, 8.5, dt);
        _currentLook.y = THREE.MathUtils.damp(_currentLook.y, _targetLook.y, 9, dt);
        _currentLook.z = THREE.MathUtils.damp(_currentLook.z, _targetLook.z, 9, dt);
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 7, dt);
      }
      this.camera.lookAt(_currentLook);
      this.camera.rotation.z = engine.playerRoll * (isBike ? 0.24 : 0.4);
    }

    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }

  private createPickupMesh(item: PickupItem): THREE.Group {
    const g = new THREE.Group();
    if (item.kind === 'nitro') {
      const core = new THREE.Mesh(this.pickupNitroCoreGeo, this.pickupNitroCoreMat);
      g.add(core);
      const ring = new THREE.Mesh(this.pickupNitroRingGeo, this.pickupNitroRingMat);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
    } else {
      const box = new THREE.Mesh(this.pickupRepairBoxGeo, this.pickupRepairBoxMat);
      g.add(box);
      g.add(new THREE.Mesh(this.pickupCrossHGeo, this.pickupCrossMat));
      g.add(new THREE.Mesh(this.pickupCrossVGeo, this.pickupCrossMat));
    }
    return g;
  }

  public startLoop(onFrame: (dt: number) => void, onFpsUpdate?: (fps: number) => void) {
    let last = performance.now();
    let fpsFrames = 0;
    let fpsAccum = 0;

    const afterDraw = (cb: () => void) => {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      if (!gl || gl.isContextLost()) return;
      if (typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (this.disposed || gl.isContextLost()) {
            if (sync) gl.deleteSync(sync);
            return;
          }
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            this.frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            this.frameId = window.setTimeout(cb, 80);
          }
        };
        this.frameId = window.setTimeout(poll, 5);
      } else {
        this.frameId = window.setTimeout(cb, 80);
      }
    };

    const tick = () => {
      if (this.disposed) return;
      const now = performance.now();
      const rawDt = Math.max(0.001, (now - last) / 1000);
      const dt = Math.min(0.05, rawDt);
      last = now;

      if (onFpsUpdate) {
        fpsFrames += 1;
        fpsAccum += rawDt;
        if (fpsAccum >= 0.5) {
          onFpsUpdate(Math.round(fpsFrames / fpsAccum));
          fpsFrames = 0;
          fpsAccum = 0;
        }
      }

      try {
        onFrame(dt);
      } catch (err) {
        console.error('Game frame error:', err);
      }

      if (this.isSoftwareGl) {
        afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.frameId = window.setTimeout(tick, 16);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  public dispose() {
    this.disposed = true;
    this.unsubscribeModels?.();
    this.unsubscribeModels = null;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    this.trafficRigs.clear();
    this.trafficRigPool.clear();
    this.pickupMeshes.clear();

    this.roadTextureNight.dispose();
    this.roadTextureDay.dispose();
    this.roadRoughnessTex.dispose();
    this.terrainTextureNight.dispose();
    this.terrainTextureDay.dispose();
    this.shadowTex.dispose();
    this.beamTex.dispose();
    this.lampGlowConeTex.dispose();
    this.moonTex.dispose();
    this.moonGlowTex.dispose();
    this.sunGlowTex.dispose();
    this.envRTNight.dispose();
    this.envRTDay.dispose();
    this.playerRig.centerScreenTex.dispose();
    this.playerRig.speedoDialTex.dispose();
    this.particleGeo.dispose();
    this.particleMat.dispose();
    this.pickupNitroCoreGeo.dispose();
    this.pickupNitroCoreMat.dispose();
    this.pickupNitroRingGeo.dispose();
    this.pickupNitroRingMat.dispose();
    this.pickupRepairBoxGeo.dispose();
    this.pickupRepairBoxMat.dispose();
    this.pickupCrossHGeo.dispose();
    this.pickupCrossVGeo.dispose();
    this.pickupCrossMat.dispose();

    disposeObjectSafely(this.scene);

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
