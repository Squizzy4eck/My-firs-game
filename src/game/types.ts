export type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type LaneIndex = 0 | 1 | 2;

export type CameraMode = 'third' | 'first';

export type TimeOfDay = 'night' | 'day';

export type PlayerCarId = 'crimson' | 'cobalt' | 'amber' | 'emerald';

export interface PlayerCarOption {
  id: PlayerCarId;
  name: string;
  bodyColor: string;
  accentColor: string;
  stripeColor: string;
}

export const PLAYER_CARS: PlayerCarOption[] = [
  {
    id: 'crimson',
    name: 'Спорткар',
    bodyColor: '#DC2626',
    accentColor: '#991B1B',
    stripeColor: '#F8FAFC',
  },
  {
    id: 'cobalt',
    name: 'Купе GT',
    bodyColor: '#2563EB',
    accentColor: '#1E40AF',
    stripeColor: '#FACC15',
  },
  {
    id: 'amber',
    name: 'Маслкар',
    bodyColor: '#D97706',
    accentColor: '#92400E',
    stripeColor: '#111827',
  },
  {
    id: 'emerald',
    name: 'Родстер',
    bodyColor: '#059669',
    accentColor: '#065F46',
    stripeColor: '#E2E8F0',
  },
];

export type TrafficKind = 'sedan' | 'taxi' | 'suv' | 'coupe' | 'truck';

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

export interface CalloutNotice {
  id: number;
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
