export type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type LaneIndex = 0 | 1 | 2;

export type CameraMode = 'third' | 'first';

export type TimeOfDay = 'night' | 'day';

export type PlayerCarId =
  | 'crimson'
  | 'cobalt'
  | 'amber'
  | 'emerald'
  | 'police'
  | 'pickup'
  | 'tank';

export type PlayerArchetype =
  | 'sport'
  | 'hyper'
  | 'muscle'
  | 'suv'
  | 'police'
  | 'pickup'
  | 'tank';

export interface PlayerCarOption {
  id: PlayerCarId;
  archetype: PlayerArchetype;
  name: string;
  bodyColor: string;
  accentColor: string;
  stripeColor: string;
  cockpitOffsetY: number;
  cockpitOffsetZ: number;
}

export const PLAYER_CARS: PlayerCarOption[] = [
  {
    id: 'crimson',
    archetype: 'sport',
    name: 'Спорткар',
    bodyColor: '#DC2626',
    accentColor: '#991B1B',
    stripeColor: '#F8FAFC',
    cockpitOffsetY: 0,
    cockpitOffsetZ: 0,
  },
  {
    id: 'cobalt',
    archetype: 'hyper',
    name: 'Гиперкар GT',
    bodyColor: '#2563EB',
    accentColor: '#1E3A8A',
    stripeColor: '#FACC15',
    cockpitOffsetY: -0.05,
    cockpitOffsetZ: -0.04,
  },
  {
    id: 'amber',
    archetype: 'muscle',
    name: 'Маслкар V8',
    bodyColor: '#D97706',
    accentColor: '#78350F',
    stripeColor: '#111827',
    cockpitOffsetY: 0.02,
    cockpitOffsetZ: 0.02,
  },
  {
    id: 'emerald',
    archetype: 'suv',
    name: 'Внедорожник',
    bodyColor: '#059669',
    accentColor: '#064E3B',
    stripeColor: '#E2E8F0',
    cockpitOffsetY: 0.18,
    cockpitOffsetZ: -0.02,
  },
  {
    id: 'police',
    archetype: 'police',
    name: 'Полиция',
    bodyColor: '#111827',
    accentColor: '#1E293B',
    stripeColor: '#F8FAFC',
    cockpitOffsetY: 0.02,
    cockpitOffsetZ: 0,
  },
  {
    id: 'pickup',
    archetype: 'pickup',
    name: 'Пикап Трак',
    bodyColor: '#7C3AED',
    accentColor: '#4C1D95',
    stripeColor: '#E2E8F0',
    cockpitOffsetY: 0.24,
    cockpitOffsetZ: -0.08,
  },
  {
    id: 'tank',
    archetype: 'tank',
    name: 'Боевой танк',
    bodyColor: '#4B5842',
    accentColor: '#2F3829',
    stripeColor: '#D97706',
    cockpitOffsetY: 0.26,
    cockpitOffsetZ: -0.14,
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
  | 'bus';

export interface TrafficVehicle {
  id: number;
  kind: TrafficKind;
  lane: LaneIndex;
  x: number;
  z: number; // negative = ahead of player, positive = behind
  width: number;
  length: number;
  speed: number; // km/h
  baseSpeed: number;
  color: string;
  secondaryColor: string;
  braking: boolean;
  nearMissed: boolean;
  hornReactionTimer: number;
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
  | 'nitro'
  | 'repair'
  | 'bonus'
  | 'hit'
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

export type GraphicsQuality = 'high' | 'low';

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

