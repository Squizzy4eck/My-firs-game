export type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type LaneIndex = 0 | 1 | 2;

export type CameraMode = 'third' | 'first';

export type TimeOfDay = 'night' | 'day';

export type PlayerCarId =
  | 'starter'
  | 'crimson'
  | 'audi'
  | 'pickup'
  | 'bmw'
  | 'amber'
  | 'hayabusa'
  | 'mercedes'
  | 'emerald'
  | 'yamaha'
  | 'gwagon'
  | 'police'
  | 'ducati'
  | 'porsche'
  | 'cobalt'
  | 'h2r'
  | 'tank'
  | 'f1';

export type PlayerArchetype =
  | 'sedan'
  | 'sport'
  | 'audi'
  | 'pickup'
  | 'bmw'
  | 'muscle'
  | 'hayabusa'
  | 'mercedes'
  | 'suv'
  | 'yamaha'
  | 'gwagon'
  | 'police'
  | 'ducati'
  | 'porsche'
  | 'hyper'
  | 'h2r'
  | 'tank'
  | 'f1';

export function isMotorcycleArchetype(arch: PlayerArchetype | TrafficKind): boolean {
  return arch === 'hayabusa' || arch === 'yamaha' || arch === 'ducati' || arch === 'h2r';
}

export interface PlayerCarOption {
  id: PlayerCarId;
  archetype: PlayerArchetype;
  name: string;
  price: number;
  cruiseSpeedKmh: number;
  maxSpeedKmh: number;
  nitroSpeedKmh: number;
  bodyColor: string;
  accentColor: string;
  stripeColor: string;
  cockpitOffsetY: number;
  cockpitOffsetZ: number;
  isMotorcycle?: boolean;
  hitboxWidth?: number;
  hitboxLength?: number;
}

export const PLAYER_CARS: PlayerCarOption[] = [
  {
    id: 'starter',
    archetype: 'sedan',
    name: 'Классик Седан',
    price: 0,
    cruiseSpeedKmh: 104,
    maxSpeedKmh: 150,
    nitroSpeedKmh: 172,
    bodyColor: '#64748B',
    accentColor: '#475569',
    stripeColor: '#94A3B8',
    cockpitOffsetY: 0.02,
    cockpitOffsetZ: 0,
  },
  {
    id: 'crimson',
    archetype: 'sport',
    name: 'Спорткар',
    price: 450,
    cruiseSpeedKmh: 112,
    maxSpeedKmh: 165,
    nitroSpeedKmh: 194,
    bodyColor: '#DC2626',
    accentColor: '#991B1B',
    stripeColor: '#F8FAFC',
    cockpitOffsetY: 0,
    cockpitOffsetZ: 0,
  },
  {
    id: 'audi',
    archetype: 'audi',
    name: 'Audi R8',
    price: 750,
    cruiseSpeedKmh: 116,
    maxSpeedKmh: 175,
    nitroSpeedKmh: 205,
    bodyColor: '#6B7280',
    accentColor: '#1F2937',
    stripeColor: '#E5E7EB',
    cockpitOffsetY: 0.01,
    cockpitOffsetZ: 0,
  },
  {
    id: 'pickup',
    archetype: 'pickup',
    name: 'Пикап Трак',
    price: 1050,
    cruiseSpeedKmh: 120,
    maxSpeedKmh: 184,
    nitroSpeedKmh: 216,
    bodyColor: '#7C3AED',
    accentColor: '#4C1D95',
    stripeColor: '#E2E8F0',
    cockpitOffsetY: 0.24,
    cockpitOffsetZ: -0.08,
  },
  {
    id: 'bmw',
    archetype: 'bmw',
    name: 'BMW M5',
    price: 1350,
    cruiseSpeedKmh: 124,
    maxSpeedKmh: 194,
    nitroSpeedKmh: 228,
    bodyColor: '#1D4ED8',
    accentColor: '#1E3A8A',
    stripeColor: '#F8FAFC',
    cockpitOffsetY: 0.01,
    cockpitOffsetZ: 0,
  },
  {
    id: 'amber',
    archetype: 'muscle',
    name: 'Маслкар V8',
    price: 1700,
    cruiseSpeedKmh: 128,
    maxSpeedKmh: 203,
    nitroSpeedKmh: 239,
    bodyColor: '#D97706',
    accentColor: '#78350F',
    stripeColor: '#111827',
    cockpitOffsetY: 0.02,
    cockpitOffsetZ: 0.02,
  },
  {
    id: 'hayabusa',
    archetype: 'hayabusa',
    name: 'Suzuki Hayabusa',
    price: 1900,
    cruiseSpeedKmh: 145,
    maxSpeedKmh: 265,
    nitroSpeedKmh: 310,
    bodyColor: '#1E3A8A',
    accentColor: '#CBD5E1',
    stripeColor: '#38BDF8',
    cockpitOffsetY: 0,
    cockpitOffsetZ: 0,
    isMotorcycle: true,
    hitboxWidth: 0.92,
    hitboxLength: 2.3,
  },
  {
    id: 'mercedes',
    archetype: 'mercedes',
    name: 'Mercedes AMG',
    price: 2100,
    cruiseSpeedKmh: 132,
    maxSpeedKmh: 212,
    nitroSpeedKmh: 250,
    bodyColor: '#94A3B8',
    accentColor: '#0F172A',
    stripeColor: '#E2E8F0',
    cockpitOffsetY: 0,
    cockpitOffsetZ: 0,
  },
  {
    id: 'emerald',
    archetype: 'suv',
    name: 'Внедорожник',
    price: 2500,
    cruiseSpeedKmh: 135,
    maxSpeedKmh: 220,
    nitroSpeedKmh: 260,
    bodyColor: '#059669',
    accentColor: '#064E3B',
    stripeColor: '#E2E8F0',
    cockpitOffsetY: 0.18,
    cockpitOffsetZ: -0.02,
  },
  {
    id: 'yamaha',
    archetype: 'yamaha',
    name: 'Yamaha YZF-R1',
    price: 2700,
    cruiseSpeedKmh: 152,
    maxSpeedKmh: 282,
    nitroSpeedKmh: 328,
    bodyColor: '#1D4ED8',
    accentColor: '#0F172A',
    stripeColor: '#F8FAFC',
    cockpitOffsetY: 0,
    cockpitOffsetZ: 0,
    isMotorcycle: true,
    hitboxWidth: 0.88,
    hitboxLength: 2.25,
  },
  {
    id: 'gwagon',
    archetype: 'gwagon',
    name: 'Mercedes G63',
    price: 2950,
    cruiseSpeedKmh: 138,
    maxSpeedKmh: 228,
    nitroSpeedKmh: 270,
    bodyColor: '#18181B',
    accentColor: '#09090B',
    stripeColor: '#D4D4D8',
    cockpitOffsetY: 0.22,
    cockpitOffsetZ: -0.02,
  },
  {
    id: 'police',
    archetype: 'police',
    name: 'Полиция',
    price: 3450,
    cruiseSpeedKmh: 141,
    maxSpeedKmh: 236,
    nitroSpeedKmh: 279,
    bodyColor: '#111827',
    accentColor: '#1E293B',
    stripeColor: '#F8FAFC',
    cockpitOffsetY: 0.02,
    cockpitOffsetZ: 0,
  },
  {
    id: 'ducati',
    archetype: 'ducati',
    name: 'Ducati Panigale V4 R',
    price: 3800,
    cruiseSpeedKmh: 162,
    maxSpeedKmh: 300,
    nitroSpeedKmh: 348,
    bodyColor: '#DC2626',
    accentColor: '#18181B',
    stripeColor: '#F8FAFC',
    cockpitOffsetY: 0,
    cockpitOffsetZ: 0,
    isMotorcycle: true,
    hitboxWidth: 0.88,
    hitboxLength: 2.25,
  },
  {
    id: 'porsche',
    archetype: 'porsche',
    name: 'Porsche 911',
    price: 4100,
    cruiseSpeedKmh: 144,
    maxSpeedKmh: 244,
    nitroSpeedKmh: 288,
    bodyColor: '#EAB308',
    accentColor: '#111827',
    stripeColor: '#111827',
    cockpitOffsetY: -0.04,
    cockpitOffsetZ: -0.02,
  },
  {
    id: 'cobalt',
    archetype: 'hyper',
    name: 'Гиперкар GT',
    price: 5000,
    cruiseSpeedKmh: 147,
    maxSpeedKmh: 252,
    nitroSpeedKmh: 298,
    bodyColor: '#2563EB',
    accentColor: '#1E3A8A',
    stripeColor: '#FACC15',
    cockpitOffsetY: -0.05,
    cockpitOffsetZ: -0.04,
  },
  {
    id: 'h2r',
    archetype: 'h2r',
    name: 'Kawasaki Ninja H2R',
    price: 5800,
    cruiseSpeedKmh: 174,
    maxSpeedKmh: 312,
    nitroSpeedKmh: 360,
    bodyColor: '#16A34A',
    accentColor: '#111827',
    stripeColor: '#22C55E',
    cockpitOffsetY: 0,
    cockpitOffsetZ: 0,
    isMotorcycle: true,
    hitboxWidth: 0.9,
    hitboxLength: 2.3,
  },
  {
    id: 'tank',
    archetype: 'tank',
    name: 'Боевой танк',
    price: 6500,
    cruiseSpeedKmh: 56,
    maxSpeedKmh: 75,
    nitroSpeedKmh: 75,
    bodyColor: '#4B5842',
    accentColor: '#2F3829',
    stripeColor: '#D97706',
    cockpitOffsetY: 0.26,
    cockpitOffsetZ: -0.14,
  },
  {
    id: 'f1',
    archetype: 'f1',
    name: 'Болид F1',
    price: 8500,
    cruiseSpeedKmh: 188,
    maxSpeedKmh: 315,
    nitroSpeedKmh: 370,
    bodyColor: '#DC2626',
    accentColor: '#111827',
    stripeColor: '#F8FAFC',
    cockpitOffsetY: -0.22,
    cockpitOffsetZ: 0.1,
  },
];

export type TrafficKind =
  | 'sedan'
  | 'taxi'
  | 'suv'
  | 'coupe'
  | 'truck'
  | 'van'
  | 'sport'
  | 'police'
  | 'bus'
  | 'audi'
  | 'bmw'
  | 'mercedes'
  | 'gwagon'
  | 'porsche'
  | 'lambo'
  | 'hayabusa'
  | 'yamaha'
  | 'ducati'
  | 'h2r';

export interface TrafficVehicle {
  id: number;
  kind: TrafficKind;
  lane: LaneIndex;
  targetLane: LaneIndex;
  x: number;
  z: number; // negative = ahead of player, positive = behind
  yaw: number;
  width: number;
  length: number;
  speed: number; // km/h
  baseSpeed: number;
  color: string;
  secondaryColor: string;
  braking: boolean;
  nearMissed: boolean;
  hornReactionTimer: number;
  laneChangePrepTimer: number;
  laneChangeCooldown: number;
  turnSignal: -1 | 0 | 1;
}

export type PickupKind = 'nitro' | 'repair';

export interface PickupItem {
  id: number;
  kind: PickupKind;
  lane: LaneIndex;
  x: number;
  z: number;
  radius: number;
  phase: number;
}

export interface Particle3D {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export type CalloutKey =
  | 'nearMiss'
  | 'distance'
  | 'nitro'
  | 'repair'
  | 'bonus'
  | 'hit'
  | 'curb'
  | 'crash';

export interface CalloutNotice {
  id: number;
  key: CalloutKey;
  text: string;
  tone: 'amber' | 'sky' | 'emerald' | 'red';
}

export interface GameHudSnapshot {
  score: number;
  bestScore: number;
  speedKmh: number;
  gear: number;
  distanceKm: number;
  lives: number;
  maxLives: number;
  nitro: number;
  isNitroActive: boolean;
  nearMissCount: number;
  overtakenCount: number;
  runCash: number;
}

// 3D World Highway Geometry (1 unit = 1 meter)
export const LANE_WIDTH_3D = 3.8;
export const ROAD_WIDTH_3D = LANE_WIDTH_3D * 3; // 11.4m
export const SHOULDER_WIDTH_3D = 1.6;
export const TOTAL_ASPHALT_WIDTH_3D = ROAD_WIDTH_3D + SHOULDER_WIDTH_3D * 2; // 14.6m
export const PLAYER_WIDTH_3D = 2.05;
export const PLAYER_LENGTH_3D = 4.5;
export const PLAYER_Z = 0;
export const SPAWN_Z = -195;
export const DESPAWN_Z = 28;
export const MAX_LIVES = 3;

export function getLaneX3D(lane: LaneIndex): number {
  return (lane - 1) * LANE_WIDTH_3D; // -3.8, 0, +3.8
}

export type GraphicsQuality = 'high' | 'medium' | 'low';

export type ControlAction =
  | 'steerLeft'
  | 'steerRight'
  | 'accelerate'
  | 'brake'
  | 'nitro'
  | 'horn'
  | 'camera';

export type ControlPresetId = 'both' | 'wasd' | 'arrows' | 'custom';

export type KeyBindings = Record<ControlAction, string[]>;

export const CONTROL_ACTIONS_ORDER: ControlAction[] = [
  'steerLeft',
  'steerRight',
  'accelerate',
  'brake',
  'nitro',
  'horn',
  'camera',
];

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  steerLeft: ['KeyA', 'ArrowLeft'],
  steerRight: ['KeyD', 'ArrowRight'],
  accelerate: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  nitro: ['Space', 'ShiftLeft', 'ShiftRight'],
  horn: ['KeyH'],
  camera: ['KeyC'],
};

export const CONTROL_PRESETS: Record<Exclude<ControlPresetId, 'custom'>, KeyBindings> = {
  both: DEFAULT_KEY_BINDINGS,
  wasd: {
    steerLeft: ['KeyA'],
    steerRight: ['KeyD'],
    accelerate: ['KeyW'],
    brake: ['KeyS'],
    nitro: ['Space', 'ShiftLeft'],
    horn: ['KeyH'],
    camera: ['KeyC'],
  },
  arrows: {
    steerLeft: ['ArrowLeft'],
    steerRight: ['ArrowRight'],
    accelerate: ['ArrowUp'],
    brake: ['ArrowDown'],
    nitro: ['Space', 'ShiftRight'],
    horn: ['KeyH'],
    camera: ['KeyC'],
  },
};

