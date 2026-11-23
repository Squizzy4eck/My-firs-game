import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Highway3DEngine } from './engine';
import {
  CameraMode,
  PLAYER_CARS,
  PlayerCarId,
  PickupItem,
  TimeOfDay,
  TOTAL_ASPHALT_WIDTH_3D,
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
  // Base medium roughness (~115 -> ~0.45)
  ctx.fillStyle = 'rgb(122, 122, 122)';
  ctx.fillRect(0, 0, 256, 256);

  // Polished tire tracks (darker = smoother -> brighter specular glint from Moon/Sun!)
  const shoulderPx = (1.6 / TOTAL_ASPHALT_WIDTH_3D) * 256;
  const roadPx = 256 - shoulderPx * 2;
  const lanePx = roadPx / 3;
  ctx.fillStyle = 'rgb(64, 64, 64)';
  for (let lane = 0; lane < 3; lane++) {
    const cx = shoulderPx + lane * lanePx + lanePx / 2;
    ctx.fillRect(cx - 12, 0, 7, 256);
    ctx.fillRect(cx + 5, 0, 7, 256);
  }

  for (let i = 0; i < 1200; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const v = 80 + Math.floor(Math.random() * 80);
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
  isNitro: boolean
) {
  ctx.fillStyle = '#07111E';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = isNitro ? '#38BDF8' : '#0284C7';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

  ctx.fillStyle = '#94A3B8';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('ПЕРЕДАЧА', 16, 30);

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
    ctx.fillText('НИТРО', 165, 118);
  }

  tex.needsUpdate = true;
}

function buildDriverHand(
  side: 'left' | 'right',
  accentMat: THREE.Material
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

  // Accent racing strap across wrist
  const strap = new THREE.Mesh(
    new THREE.BoxGeometry(0.034, 0.068, 0.014),
    accentMat
  );
  strap.position.set(-inward * 0.004, 0, -0.005);
  hand.add(strap);

  // Sport watch on left wrist
  if (side === 'left') {
    const watchBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.017, 0.017, 0.01, 12),
      new THREE.MeshStandardMaterial({ color: '#CBD5E1', metalness: 0.85, roughness: 0.2 })
    );
    watchBody.rotation.z = Math.PI / 2;
    watchBody.position.set(-0.034, 0.01, 0.012);
    hand.add(watchBody);
  }

  // Sculpted glove palm (extends forward along -Z)
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.068, 0.074), gloveMat);
  palm.position.set(0, 0, -0.042);
  hand.add(palm);

  // Inner grip pad & outer knuckle protector
  const innerPad = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.058, 0.058), palmPadMat);
  innerPad.position.set(inward * 0.013, -0.002, -0.044);
  hand.add(innerPad);

  const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.064, 0.024), accentMat);
  knuckle.position.set(-inward * 0.013, 0.002, -0.064);
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
  root: THREE.Group;
  bodyGroup: THREE.Group;
  bodyMat: THREE.MeshPhysicalMaterial;
  accentMat: THREE.MeshStandardMaterial;
  stripeMat: THREE.MeshStandardMaterial;
  tailLightMat: THREE.MeshStandardMaterial;
  headLightMat: THREE.MeshStandardMaterial;
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
  shadowTex: THREE.CanvasTexture,
  beamTex: THREE.CanvasTexture,
  isSoftwareGl: boolean
): PlayerCarRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: '#DC2626',
    metalness: 0.55,
    roughness: 0.22,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: '#991B1B',
    metalness: 0.4,
    roughness: 0.45,
  });
  const stripeMat = new THREE.MeshStandardMaterial({
    color: '#F8FAFC',
    roughness: 0.35,
    metalness: 0.15,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: '#1E293B',
    roughness: 0.75,
    metalness: 0.25,
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

  // Contact shadow
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 5.2),
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

  // 1. Lower sculpted chassis
  const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.48, 4.35), bodyMat);
  lowerHull.position.set(0, 0.5, 0);
  lowerHull.castShadow = true;
  lowerHull.receiveShadow = true;
  bodyGroup.add(lowerHull);

  // 2. Sculpted sloped hood
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.14, 1.55), bodyMat);
  hood.position.set(0, 0.76, -1.25);
  hood.rotation.x = 0.055;
  hood.castShadow = true;
  bodyGroup.add(hood);

  // 3. Dual Racing Stripes on hood & trunk
  for (const sx of [-0.22, 0.22]) {
    const hoodStripe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 1.56), stripeMat);
    hoodStripe.position.set(sx, 0.83, -1.25);
    hoodStripe.rotation.x = 0.055;
    bodyGroup.add(hoodStripe);

    const trunkStripe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.9), stripeMat);
    trunkStripe.position.set(sx, 0.76, 1.65);
    bodyGroup.add(trunkStripe);
  }

  // 4. Cabin structure (Roof + Windshield + Pillars)
  const roofMesh = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.08, 1.58), bodyMat);
  roofMesh.position.set(0, 1.32, 0.26);
  roofMesh.castShadow = true;
  bodyGroup.add(roofMesh);

  const windshieldMesh = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.62, 0.04), windshieldMat);
  windshieldMesh.position.set(0, 1.05, -0.58);
  windshieldMesh.rotation.x = -0.6;
  bodyGroup.add(windshieldMesh);

  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 0.06), glassMat);
  rearGlass.position.set(0, 1.04, 1.15);
  rearGlass.rotation.x = 0.62;
  bodyGroup.add(rearGlass);

  // Side pillars (slim so 1st person view has wide visibility!)
  for (const px of [-0.76, 0.76]) {
    const aPillar = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.62, 0.065), trimMat);
    aPillar.position.set(px, 1.05, -0.58);
    aPillar.rotation.x = -0.6;
    bodyGroup.add(aPillar);

    const cPillar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.56, 0.09), bodyMat);
    cPillar.position.set(px, 1.04, 1.13);
    cPillar.rotation.x = 0.62;
    bodyGroup.add(cPillar);
  }

  // 5. Front Grille & Splitters
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.22, 0.08), trimMat);
  grille.position.set(0, 0.42, -2.18);
  bodyGroup.add(grille);

  const frontLip = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.08, 0.24), trimMat);
  frontLip.position.set(0, 0.24, -2.14);
  bodyGroup.add(frontLip);

  // 6. Headlights & Taillights
  for (const lx of [-0.68, 0.68]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.08), headLightMat);
    hl.position.set(lx, 0.56, -2.16);
    bodyGroup.add(hl);

    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.08), tailLightMat);
    tl.position.set(lx, 0.58, 2.16);
    bodyGroup.add(tl);
  }

  // 7. Side Mirrors
  for (const mx of [-1.05, 1.05]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.14), accentMat);
    mirror.position.set(mx, 0.86, -0.45);
    bodyGroup.add(mirror);
  }

  // 8. Rear Spoiler
  const spoilerWing = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.06, 0.28), accentMat);
  spoilerWing.position.set(0, 0.96, 2.02);
  spoilerWing.castShadow = true;
  bodyGroup.add(spoilerWing);

  for (const sx of [-0.58, 0.58]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.14), trimMat);
    strut.position.set(sx, 0.83, 2.02);
    bodyGroup.add(strut);
  }

  // 9. Detailed Driver Cabin Interior (Dashboard, Speedometer, Center Console, Rearview Mirror, Steering Wheel)
  const cabinInteriorGroup = new THREE.Group();
  bodyGroup.add(cabinInteriorGroup);

  // Full width dashboard cowl
  const dash = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.26, 0.48),
    new THREE.MeshStandardMaterial({ color: '#111622', roughness: 0.78, metalness: 0.12 })
  );
  dash.position.set(0, 0.81, -0.5);
  cabinInteriorGroup.add(dash);

  // Upper dashboard visor / gauge hood over left driver binnacle
  const binnacle = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.13, 0.22),
    new THREE.MeshStandardMaterial({ color: '#0B0F19', roughness: 0.7 })
  );
  binnacle.position.set(-0.34, 0.96, -0.39);
  cabinInteriorGroup.add(binnacle);

  // Glowing instrument gauge face (Speedometer & Tachometer)
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

  // Live Speedometer Needle
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

  // Center infotainment / telemetry screen with live gear indicator
  const centerScreenCanvas = document.createElement('canvas');
  centerScreenCanvas.width = 256;
  centerScreenCanvas.height = 128;
  const centerScreenCtx = centerScreenCanvas.getContext('2d')!;
  const centerScreenTex = new THREE.CanvasTexture(centerScreenCanvas);
  centerScreenTex.colorSpace = THREE.SRGBColorSpace;
  drawCenterScreen(centerScreenCanvas, centerScreenCtx, centerScreenTex, 3, false);

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

  // Center console & articulated H-pattern sport gear shifter
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
    new THREE.MeshStandardMaterial({ color: '#E2E8F0', metalness: 0.9, roughness: 0.18 })
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

  // Left & Right Door Sills (frames the side of cabin view)
  for (const dx of [-0.82, 0.82]) {
    const doorSill = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.34, 1.35),
      new THREE.MeshStandardMaterial({ color: '#141924', roughness: 0.75 })
    );
    doorSill.position.set(dx, 0.78, 0.08);
    cabinInteriorGroup.add(doorSill);
  }

  // Interior Rearview Mirror hanging from upper windshield frame
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

  // Driver Steering Wheel (mounted in front of left driver seat at x = -0.34)
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

  // Hand grip anchors on 9:30 and 2:30 wheel rim positions
  const leftGripAnchor = new THREE.Object3D();
  leftGripAnchor.position.set(-0.165, 0.022, 0.045);
  leftGripAnchor.rotation.set(0.12, -0.14, -0.14);
  steeringWheel.add(leftGripAnchor);

  const rightGripAnchor = new THREE.Object3D();
  rightGripAnchor.position.set(0.165, 0.022, 0.045);
  rightGripAnchor.rotation.set(0.12, 0.14, 0.14);
  steeringWheel.add(rightGripAnchor);

  bodyGroup.add(steeringWheel);

  // Driver Arms & Gloved Hands (visible in 1st-person mode)
  const driverArmsGroup = new THREE.Group();
  driverArmsGroup.visible = false;
  const sleeveMat = new THREE.MeshStandardMaterial({
    color: '#0F172A',
    roughness: 0.78,
    metalness: 0.08,
  });
  const forearmGeo = new THREE.CylinderGeometry(0.034, 0.046, 1, 10);
  const leftForearmMesh = new THREE.Mesh(forearmGeo, sleeveMat);
  const rightForearmMesh = new THREE.Mesh(forearmGeo, sleeveMat);
  const leftHandGroup = buildDriverHand('left', accentMat);
  const rightHandGroup = buildDriverHand('right', accentMat);
  driverArmsGroup.add(leftForearmMesh, rightForearmMesh, leftHandGroup, rightHandGroup);
  bodyGroup.add(driverArmsGroup);

  // 10. Nitro Twin Exhaust Flames
  const nitroFlames = new THREE.Group();
  nitroFlames.visible = false;
  const flameGeo = new THREE.ConeGeometry(0.13, 0.95, 10);
  flameGeo.rotateX(Math.PI / 2);
  const flameMat = new THREE.MeshBasicMaterial({
    color: '#38BDF8',
    transparent: true,
    opacity: 0.85,
  });
  for (const fx of [-0.45, 0.45]) {
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(fx, 0.35, 2.55);
    nitroFlames.add(flame);
  }
  bodyGroup.add(nitroFlames);

  // 11. 4 Wheels (Front two pivot when steering)
  const frontWheelPivots: THREE.Group[] = [];
  const wheelSpinMeshes: THREE.Mesh[] = [];
  const wheelRadius = 0.36;
  const wheelWidth = 0.26;
  const positions: Array<{ x: number; z: number; front: boolean }> = [
    { x: -0.98, z: -1.38, front: true },
    { x: 0.98, z: -1.38, front: true },
    { x: -0.98, z: 1.42, front: false },
    { x: 0.98, z: 1.42, front: false },
  ];

  for (const wp of positions) {
    const pivot = new THREE.Group();
    pivot.position.set(wp.x, wheelRadius, wp.z);
    const wMesh = createWheelMesh(wheelRadius, wheelWidth);
    pivot.add(wMesh);
    root.add(pivot);
    if (wp.front) frontWheelPivots.push(pivot);
    wheelSpinMeshes.push(wMesh.children[0] as THREE.Mesh);
  }

  // 12. Real Headlight SpotLights + Diffused Road Light Pool (active in Night mode)
  const headlightLeft = new THREE.SpotLight('#FEF9C3', isSoftwareGl ? 115 : 145, 115, Math.PI / 3.8, 0.95, 0.85);
  headlightLeft.position.set(-0.68, 0.65, -2.15);
  headlightLeft.target.position.set(-1.3, 0, -34);
  bodyGroup.add(headlightLeft);
  bodyGroup.add(headlightLeft.target);

  const headlightRight = new THREE.SpotLight('#FEF9C3', isSoftwareGl ? 115 : 145, 115, Math.PI / 3.8, 0.95, 0.85);
  headlightRight.position.set(0.68, 0.65, -2.15);
  headlightRight.target.position.set(1.3, 0, -34);
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

  return {
    root,
    bodyGroup,
    bodyMat,
    accentMat,
    stripeMat,
    tailLightMat,
    headLightMat,
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
    nitroFlames,
    headlightLeft,
    headlightRight,
    headlightBeamPlane,
  };
}

interface TrafficMeshRig {
  group: THREE.Group;
  tailLightMat: THREE.MeshStandardMaterial;
  wheels: THREE.Object3D[];
}

function buildTrafficCarRig(car: TrafficVehicle, shadowTex: THREE.CanvasTexture): TrafficMeshRig {
  const group = new THREE.Group();
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

  // Contact shadow
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(car.width * 1.25, car.length * 1.15),
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
  const wRad = car.kind === 'truck' ? 0.44 : 0.35;

  if (car.kind === 'truck') {
    // Cab (front at -Z)
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.25, 2.05, 2.2), roofMat);
    cab.position.set(0, 1.38, -car.length * 0.35);
    cab.castShadow = true;
    group.add(cab);

    const cabGlass = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.72, 0.08), glassMat);
    cabGlass.position.set(0, 1.78, -car.length * 0.35 - 1.08);
    group.add(cabGlass);

    // Cargo trailer
    const trailer = new THREE.Mesh(
      new THREE.BoxGeometry(2.42, 2.55, car.length * 0.68),
      bodyMat
    );
    trailer.position.set(0, 1.68, car.length * 0.15);
    trailer.castShadow = true;
    trailer.receiveShadow = true;
    group.add(trailer);

    // Bumper
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.25, 0.2), trimMat);
    bumper.position.set(0, 0.45, car.length * 0.49);
    group.add(bumper);

    for (const lx of [-0.85, 0.85]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.08), headMat);
      hl.position.set(lx, 0.68, -car.length * 0.35 - 1.11);
      group.add(hl);

      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.08), tailLightMat);
      tl.position.set(lx, 0.65, car.length * 0.49 + 0.02);
      group.add(tl);
    }

    const zOffsets = [-car.length * 0.36, car.length * 0.12, car.length * 0.36];
    for (const wz of zOffsets) {
      for (const wx of [-1.14, 1.14]) {
        const w = createWheelMesh(wRad, 0.3);
        w.position.set(wx, wRad, wz);
        group.add(w);
        wheels.push(w);
      }
    }
  } else {
    const bodyHeight = car.kind === 'suv' ? 0.65 : 0.5;
    const cabinHeight = car.kind === 'suv' ? 0.66 : 0.54;
    const cabinLen = car.kind === 'suv' ? car.length * 0.6 : car.length * 0.48;

    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(car.width, bodyHeight, car.length),
      bodyMat
    );
    chassis.position.set(0, wRad + bodyHeight * 0.45, 0);
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    group.add(chassis);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(car.width * 0.82, cabinHeight, cabinLen),
      roofMat
    );
    cabin.position.set(0, wRad + bodyHeight * 0.85 + cabinHeight * 0.45, 0.15);
    cabin.castShadow = true;
    group.add(cabin);

    const windshield = new THREE.Mesh(
      new THREE.BoxGeometry(car.width * 0.78, cabinHeight * 0.85, cabinLen + 0.05),
      glassMat
    );
    windshield.position.set(0, wRad + bodyHeight * 0.85 + cabinHeight * 0.42, 0.15);
    group.add(windshield);

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
      group.add(sign);
    }

    // Coupe stripe
    if (car.kind === 'coupe') {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.02, car.length - 0.1),
        new THREE.MeshStandardMaterial({ color: '#F8FAFC', roughness: 0.3 })
      );
      stripe.position.set(0, wRad + bodyHeight * 0.91, 0);
      group.add(stripe);
    }

    for (const lx of [-car.width * 0.33, car.width * 0.33]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.08), headMat);
      hl.position.set(lx, wRad + bodyHeight * 0.48, -car.length / 2 - 0.01);
      group.add(hl);

      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.13, 0.08), tailLightMat);
      tl.position.set(lx, wRad + bodyHeight * 0.5, car.length / 2 + 0.01);
      group.add(tl);
    }

    for (const wz of [-car.length * 0.31, car.length * 0.31]) {
      for (const wx of [-car.width * 0.5, car.width * 0.5]) {
        const w = createWheelMesh(wRad, 0.24);
        w.position.set(wx, wRad, wz);
        group.add(w);
        wheels.push(w);
      }
    }
  }

  return { group, tailLightMat, wheels };
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

  private particlePool: THREE.Mesh[] = [];
  private particleGeo: THREE.BoxGeometry;

  private envRTNight: THREE.WebGLRenderTarget;
  private envRTDay: THREE.WebGLRenderTarget;
  private lastTimeOfDay: TimeOfDay | null = null;
  private lastCarId: PlayerCarId | null = null;
  private hornWaveMesh: THREE.Mesh;

  private frameId: number = 0;
  private disposed: boolean = false;

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
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

    // 3-Lane Highway Asphalt Surface with calibrated PBR roughnessMap for physical Moon/Sun road glint
    this.roadMat = new THREE.MeshStandardMaterial({
      map: this.roadTextureNight,
      roughnessMap: this.roadRoughnessTex,
      roughness: 0.44,
      metalness: 0.16,
      envMapIntensity: 1.25,
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

    // 4 pooled PointLights that illuminate road & traffic under nearest street lamps
    for (let i = 0; i < 4; i++) {
      const pl = new THREE.PointLight('#FDE68A', 58, 34, 1.05);
      pl.position.set(0, 5.6, -20 * i);
      this.scene.add(pl);
      this.lampPointLights.push(pl);
    }

    // Player Car Rig
    this.playerRig = buildPlayerCar(this.shadowTex, this.beamTex, this.isSoftwareGl);
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

    // Pre-allocated Particle Pool
    this.particleGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 48; i++) {
      const mesh = new THREE.Mesh(
        this.particleGeo,
        new THREE.MeshBasicMaterial({ color: '#FBBF24' })
      );
      mesh.visible = false;
      this.scene.add(mesh);
      this.particlePool.push(mesh);
    }

    // Pre-warm shaders on GPU
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.applyAtmosphere('night');
    this.applyCarStyle('crimson');
  }

  public resize(width: number, height: number) {
    if (this.disposed || width <= 0 || height <= 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
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
    this.scene.environment = isNight ? this.envRTNight.texture : this.envRTDay.texture;

    if (isNight) {
      this.hemiLight.color.set('#7DD3FC');
      this.hemiLight.groundColor.set('#1E293B');
      this.hemiLight.intensity = 1.15;
      this.keyLight.color.set('#DBEAFE');
      this.keyLight.intensity = 1.45;
      this.rimLight.intensity = 0.75;
      this.lampHeadMat.emissiveIntensity = 3.6;
      this.lampGlowCones.visible = true;
      this.playerRig.headlightBeamPlane.visible = true;
      this.playerRig.headlightLeft.intensity = this.isSoftwareGl ? 115 : 145;
      this.playerRig.headlightRight.intensity = this.isSoftwareGl ? 115 : 145;
      for (const pl of this.lampPointLights) {
        pl.intensity = 58;
      }
    } else {
      this.hemiLight.color.set('#BAE6FD');
      this.hemiLight.groundColor.set('#3F6212');
      this.hemiLight.intensity = 1.25;
      this.keyLight.color.set('#FFFBEB');
      this.keyLight.intensity = 2.4;
      this.rimLight.intensity = 0.55;
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

  public applyCarStyle(carId: PlayerCarId) {
    if (this.lastCarId === carId) return;
    this.lastCarId = carId;
    const opt = PLAYER_CARS.find((c) => c.id === carId) ?? PLAYER_CARS[0];
    this.playerRig.bodyMat.color.set(opt.bodyColor);
    this.playerRig.accentMat.color.set(opt.accentColor);
    this.playerRig.stripeMat.color.set(opt.stripeColor);
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
    for (let i = 0; i < this.treePositions.length; i++) {
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
    this.treeTrunks.instanceMatrix.needsUpdate = true;
    this.treeCanopies.instanceMatrix.needsUpdate = true;

    const lampLoop = 228;
    const lampMinZ = 20 - lampLoop; // -208..+20
    let activePointLightIdx = 0;
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

      if (activePointLightIdx < this.lampPointLights.length && z > -65 && z < 14) {
        this.lampPointLights[activePointLightIdx++].position.set(headX, 5.4, z);
      }
    }
    this.lampPoles.instanceMatrix.needsUpdate = true;
    this.lampHeads.instanceMatrix.needsUpdate = true;
    this.lampGlowCones.instanceMatrix.needsUpdate = true;

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
        engine.isNitroActive
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
    this.playerRig.driverArmsGroup.visible = isFirst;
    if (isFirst) {
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
    for (const p of this.playerRig.frontWheelPivots) {
      p.rotation.y = -engine.steerInput * 0.24;
    }
    for (const w of this.playerRig.wheelSpinMeshes) {
      w.rotation.x = -engine.wheelSpinAngle;
    }

    // Brake lights & Horn headlight flash
    this.playerRig.tailLightMat.emissiveIntensity = isBraking ? 4.2 : 1.1;
    const hornFlash = engine.hornActive || engine.hornFlashTimer > 0;
    this.playerRig.headLightMat.emissiveIntensity = hornFlash ? 5.5 : 2.6;
    if (this.lastTimeOfDay === 'night') {
      const baseBeam = this.isSoftwareGl ? 115 : 145;
      const beamVal = hornFlash ? baseBeam * 1.55 : baseBeam;
      this.playerRig.headlightLeft.intensity = beamVal;
      this.playerRig.headlightRight.intensity = beamVal;
      (this.playerRig.headlightBeamPlane.material as THREE.MeshBasicMaterial).opacity = hornFlash ? 0.92 : 0.72;
    }

    // Horn acoustic ring pulse
    if (engine.hornActive || engine.hornFlashTimer > 0) {
      const t = (performance.now() * 0.006) % 1;
      this.hornWaveMesh.visible = true;
      this.hornWaveMesh.scale.setScalar(1 + t * 2.2);
      this.hornWaveMesh.position.z = -2.4 - t * 2.6;
      (this.hornWaveMesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.75;
    } else {
      this.hornWaveMesh.visible = false;
    }

    // Nitro exhaust flames
    this.playerRig.nitroFlames.visible = engine.isNitroActive;
    if (engine.isNitroActive) {
      this.playerRig.nitroFlames.scale.z = 0.8 + Math.random() * 0.65;
    }

    // Keep cabin roof & glass windshield visible in 1st-person mode (lower glass opacity so cabin & reflections look crisp)
    this.playerRig.roofMesh.visible = true;
    this.playerRig.windshieldMesh.visible = true;
    this.playerRig.windshieldMat.opacity = isFirst ? 0.14 : 0.42;

    // 4. Sync Traffic Cars
    const activeIds = new Set<number>();
    for (const car of engine.traffic) {
      activeIds.add(car.id);
      let rig = this.trafficRigs.get(car.id);
      if (!rig) {
        rig = buildTrafficCarRig(car, this.shadowTex);
        this.scene.add(rig.group);
        this.trafficRigs.set(car.id, rig);
      }
      rig.group.position.set(car.x, 0, car.z);
      const flashHazard =
        car.hornReactionTimer > 0 && Math.floor(car.hornReactionTimer * 12) % 2 === 0;
      rig.tailLightMat.emissiveIntensity = car.braking || flashHazard ? 3.8 : 0.8;
    }

    for (const [id, rig] of this.trafficRigs) {
      if (!activeIds.has(id)) {
        this.scene.remove(rig.group);
        this.trafficRigs.delete(id);
      }
    }

    // 5. Sync 3D Pickups
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

    // 6. Sync Particles
    for (let i = 0; i < this.particlePool.length; i++) {
      const mesh = this.particlePool[i];
      const p = engine.particles[i];
      if (!p) {
        mesh.visible = false;
      } else {
        mesh.visible = true;
        mesh.position.set(p.x, p.y, p.z);
        const s = p.size * Math.max(0.2, p.life / p.maxLife);
        mesh.scale.setScalar(s);
        (mesh.material as THREE.MeshBasicMaterial).color.set(p.color);
      }
    }

    // 7. Smooth Camera Choreography (3rd-Person Chase vs 1st-Person Cockpit)
    const shakeX =
      engine.shakeTimer > 0 ? (Math.random() - 0.5) * 0.45 * (engine.shakeTimer / 0.38) : 0;
    const shakeY =
      engine.shakeTimer > 0 ? (Math.random() - 0.5) * 0.32 * (engine.shakeTimer / 0.38) : 0;

    if (cameraMode === 'first') {
      // 1st-person driver seat inside cabin: exact rotated transform of (-0.34, 1.11, 0.25)
      const cosY = Math.cos(engine.playerYaw);
      const sinY = Math.sin(engine.playerYaw);
      const driverOffsetX = -0.34 * cosY + 0.25 * sinY;
      const driverOffsetZ = 0.34 * sinY + 0.25 * cosY;
      _targetPos.set(
        engine.playerX + driverOffsetX + shakeX * 0.35,
        1.11 + shakeY * 0.35,
        driverOffsetZ
      );
      _targetLook.set(
        engine.playerX - 0.34 * cosY - 22 * sinY,
        0.95,
        0.34 * sinY - 28 * cosY
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
      this.camera.rotation.z = engine.playerRoll * 0.45;
    } else {
      // 3rd-person chase cam behind car
      _targetPos.set(engine.playerX * 0.92 + shakeX, 3.65 + shakeY, 8.2);
      _targetLook.set(engine.playerX * 0.96, 1.0, -15);
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
      this.camera.rotation.z = engine.playerRoll * 0.4;
    }

    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }

  private createPickupMesh(item: PickupItem): THREE.Group {
    const g = new THREE.Group();
    if (item.kind === 'nitro') {
      const core = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.55, 0),
        new THREE.MeshStandardMaterial({
          color: '#38BDF8',
          emissive: '#0284C7',
          emissiveIntensity: 1.5,
          roughness: 0.2,
          metalness: 0.4,
        })
      );
      g.add(core);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.74, 0.06, 8, 24),
        new THREE.MeshBasicMaterial({ color: '#BAE6FD' })
      );
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
    } else {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, 0.85, 0.85),
        new THREE.MeshStandardMaterial({
          color: '#10B981',
          emissive: '#059669',
          emissiveIntensity: 1.2,
          roughness: 0.25,
        })
      );
      g.add(box);
      const crossMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.18, 0.9), crossMat));
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.58, 0.9), crossMat));
    }
    return g;
  }

  public startLoop(onFrame: (dt: number) => void) {
    let last = performance.now();
    const afterDraw = (cb: () => void) => {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (this.disposed) return;
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
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;

      onFrame(dt);

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
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

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

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
