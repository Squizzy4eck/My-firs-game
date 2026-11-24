import { soundEngine } from './sound';
import {
  CalloutKey,
  CalloutNotice,
  DESPAWN_Z,
  GameHudSnapshot,
  getLaneX3D,
  LANE_WIDTH_3D,
  LaneIndex,
  MAX_LIVES,
  Particle3D,
  PickupItem,
  PLAYER_LENGTH_3D,
  PLAYER_WIDTH_3D,
  PLAYER_Z,
  SPAWN_Z,
  TOTAL_ASPHALT_WIDTH_3D,
  TrafficKind,
  TrafficVehicle,
} from './types';

const KMH_TO_MPS = 1.18 / 3.6;

interface TrafficBlueprint3D {
  kind: TrafficKind;
  width: number;
  length: number;
  minSpeed: number;
  maxSpeed: number;
  colors: Array<{ body: string; roof: string }>;
}

const TRAFFIC_BLUEPRINTS: TrafficBlueprint3D[] = [
  {
    kind: 'sedan',
    width: 1.95,
    length: 4.3,
    minSpeed: 56,
    maxSpeed: 74,
    colors: [
      { body: '#64748B', roof: '#475569' },
      { body: '#3B82F6', roof: '#1D4ED8' },
      { body: '#E2E8F0', roof: '#CBD5E1' },
      { body: '#8B5CF6', roof: '#6D28D9' },
    ],
  },
  {
    kind: 'taxi',
    width: 1.95,
    length: 4.3,
    minSpeed: 60,
    maxSpeed: 76,
    colors: [{ body: '#FACC15', roof: '#EAB308' }],
  },
  {
    kind: 'suv',
    width: 2.15,
    length: 4.75,
    minSpeed: 52,
    maxSpeed: 68,
    colors: [
      { body: '#0F766E', roof: '#115E59' },
      { body: '#334155', roof: '#1E293B' },
      { body: '#9A3412', roof: '#7C2D12' },
    ],
  },
  {
    kind: 'coupe',
    width: 2.0,
    length: 4.25,
    minSpeed: 68,
    maxSpeed: 82,
    colors: [
      { body: '#EC4899', roof: '#BE185D' },
      { body: '#06B6D4', roof: '#0E7490' },
    ],
  },
  {
    kind: 'truck',
    width: 2.45,
    length: 8.6,
    minSpeed: 44,
    maxSpeed: 58,
    colors: [
      { body: '#CBD5E1', roof: '#DC2626' },
      { body: '#94A3B8', roof: '#1D4ED8' },
      { body: '#E2E8F0', roof: '#047857' },
    ],
  },
  {
    kind: 'van',
    width: 2.15,
    length: 5.2,
    minSpeed: 54,
    maxSpeed: 68,
    colors: [
      { body: '#F1F5F9', roof: '#CBD5E1' },
      { body: '#1E40AF', roof: '#1E3A8A' },
      { body: '#D97706', roof: '#B45309' },
    ],
  },
  {
    kind: 'sport',
    width: 2.04,
    length: 4.35,
    minSpeed: 72,
    maxSpeed: 88,
    colors: [
      { body: '#EF4444', roof: '#B91C1C' },
      { body: '#10B981', roof: '#047857' },
      { body: '#F97316', roof: '#C2410C' },
    ],
  },
  {
    kind: 'police',
    width: 2.0,
    length: 4.5,
    minSpeed: 68,
    maxSpeed: 82,
    colors: [{ body: '#111827', roof: '#F8FAFC' }],
  },
  {
    kind: 'bus',
    width: 2.48,
    length: 9.2,
    minSpeed: 42,
    maxSpeed: 54,
    colors: [
      { body: '#F59E0B', roof: '#D97706' },
      { body: '#0284C7', roof: '#E0F2FE' },
    ],
  },
  {
    kind: 'audi',
    width: 2.02,
    length: 4.55,
    minSpeed: 72,
    maxSpeed: 88,
    colors: [
      { body: '#6B7280', roof: '#1F2937' },
      { body: '#1D4ED8', roof: '#1E3A8A' },
      { body: '#B91C1C', roof: '#7F1D1D' },
      { body: '#18181B', roof: '#09090B' },
    ],
  },
  {
    kind: 'bmw',
    width: 2.02,
    length: 4.55,
    minSpeed: 74,
    maxSpeed: 90,
    colors: [
      { body: '#1D4ED8', roof: '#1E3A8A' },
      { body: '#E2E8F0', roof: '#94A3B8' },
      { body: '#111827', roof: '#0F172A' },
      { body: '#047857', roof: '#064E3B' },
    ],
  },
  {
    kind: 'mercedes',
    width: 2.04,
    length: 4.65,
    minSpeed: 74,
    maxSpeed: 90,
    colors: [
      { body: '#0F172A', roof: '#1E293B' },
      { body: '#94A3B8', roof: '#64748B' },
      { body: '#065F46', roof: '#064E3B' },
      { body: '#991B1B', roof: '#7F1D1D' },
    ],
  },
  {
    kind: 'gwagon',
    width: 2.18,
    length: 4.75,
    minSpeed: 64,
    maxSpeed: 80,
    colors: [
      { body: '#18181B', roof: '#09090B' },
      { body: '#F1F5F9', roof: '#CBD5E1' },
      { body: '#4D5D43', roof: '#36422E' },
    ],
  },
  {
    kind: 'porsche',
    width: 2.02,
    length: 4.35,
    minSpeed: 78,
    maxSpeed: 96,
    colors: [
      { body: '#EAB308', roof: '#CA8A04' },
      { body: '#DC2626', roof: '#991B1B' },
      { body: '#CBD5E1', roof: '#94A3B8' },
      { body: '#0EA5E9', roof: '#0284C7' },
    ],
  },
  {
    kind: 'lambo',
    width: 2.08,
    length: 4.4,
    minSpeed: 82,
    maxSpeed: 102,
    colors: [
      { body: '#22C55E', roof: '#15803D' },
      { body: '#F97316', roof: '#C2410C' },
      { body: '#FACC15', roof: '#CA8A04' },
      { body: '#18181B', roof: '#09090B' },
    ],
  },
  {
    kind: 'hayabusa',
    width: 0.92,
    length: 2.22,
    minSpeed: 84,
    maxSpeed: 104,
    colors: [{ body: '#1E3A8A', roof: '#CBD5E1' }],
  },
  {
    kind: 'yamaha',
    width: 0.88,
    length: 2.18,
    minSpeed: 86,
    maxSpeed: 106,
    colors: [{ body: '#1D4ED8', roof: '#0F172A' }],
  },
  {
    kind: 'ducati',
    width: 0.88,
    length: 2.18,
    minSpeed: 88,
    maxSpeed: 108,
    colors: [{ body: '#DC2626', roof: '#18181B' }],
  },
  {
    kind: 'h2r',
    width: 0.9,
    length: 2.2,
    minSpeed: 90,
    maxSpeed: 110,
    colors: [{ body: '#16A34A', roof: '#111827' }],
  },
];

export class Highway3DEngine {
  public targetLane: LaneIndex = 1;
  public playerX: number = getLaneX3D(1);
  public playerVx: number = 0;
  public steerInput: number = 0;
  public playerYaw: number = 0;
  public playerRoll: number = 0;
  public steeringSensitivity: number = 1.0;
  public cruiseSpeedKmh: number = 104;
  public maxSpeedKmh: number = 150;
  public nitroSpeedKmh: number = 172;
  public playerWidth: number = PLAYER_WIDTH_3D;
  public playerLength: number = PLAYER_LENGTH_3D;
  public isMotorcycle: boolean = false;
  public speedKmh: number = 104;
  public nitro: number = 65;
  public isNitroActive: boolean = false;
  public lives: number = MAX_LIVES;
  public score: number = 0;
  public bestScore: number = 0;
  public distanceKm: number = 0;
  public nearMissCount: number = 0;
  public overtakenCount: number = 0;
  public runCash: number = 0;
  private nextDistanceCashKm: number = 0.5;
  public invulnerableTimer: number = 0;
  public worldScrollMeters: number = 0;
  public wheelSpinAngle: number = 0;
  public shakeTimer: number = 0;
  public hornActive: boolean = false;
  public hornFlashTimer: number = 0;
  public gear: number = 3;
  public prevGear: number = 3;
  public gearShiftTimer: number = 0;
  public readonly gearShiftDuration: number = 0.54;
  private gearShiftCooldown: number = 0;

  public traffic: TrafficVehicle[] = [];
  public pickups: PickupItem[] = [];
  public particles: Particle3D[] = [];

  private spawnCooldown: number = 0.65;
  private pickupCooldown: number = 6.5;
  private nextId: number = 1;
  private calloutListeners: Array<(c: CalloutNotice) => void> = [];
  private blockedBySlowAhead = new Set<number>();
  private laneCarsScratch: [TrafficVehicle[], TrafficVehicle[], TrafficVehicle[]] = [[], [], []];

  constructor(bestScore: number) {
    this.bestScore = bestScore;
    this.seedAmbientTraffic();
  }

  public setVehicleSpecs(
    cruiseSpeedKmh: number,
    maxSpeedKmh: number,
    nitroSpeedKmh: number,
    playerWidth: number = PLAYER_WIDTH_3D,
    playerLength: number = PLAYER_LENGTH_3D,
    isMotorcycle: boolean = false
  ) {
    this.cruiseSpeedKmh = cruiseSpeedKmh;
    this.maxSpeedKmh = maxSpeedKmh;
    this.nitroSpeedKmh = nitroSpeedKmh;
    this.playerWidth = playerWidth;
    this.playerLength = playerLength;
    this.isMotorcycle = isMotorcycle;
  }

  public setSteeringSensitivity(value: number) {
    if (!Number.isFinite(value)) return;
    this.steeringSensitivity = Math.max(0.5, Math.min(1.8, value));
  }

  public onCallout(cb: (c: CalloutNotice) => void): () => void {
    this.calloutListeners.push(cb);
    return () => {
      this.calloutListeners = this.calloutListeners.filter((fn) => fn !== cb);
    };
  }

  private emitCallout(key: CalloutKey, text: string, tone: CalloutNotice['tone']) {
    const notice: CalloutNotice = { id: this.nextId++, key, text, tone };
    for (const cb of this.calloutListeners) {
      cb(notice);
    }
  }

  public resetRun() {
    this.targetLane = 1;
    this.playerX = getLaneX3D(1);
    this.playerVx = 0;
    this.steerInput = 0;
    this.playerYaw = 0;
    this.playerRoll = 0;
    this.speedKmh = this.cruiseSpeedKmh;
    this.nitro = 65;
    this.isNitroActive = false;
    this.lives = MAX_LIVES;
    this.score = 0;
    this.distanceKm = 0;
    this.nearMissCount = 0;
    this.overtakenCount = 0;
    this.runCash = 0;
    this.nextDistanceCashKm = 0.5;
    this.invulnerableTimer = 0;
    this.shakeTimer = 0;
    this.hornActive = false;
    this.hornFlashTimer = 0;
    this.gear = this.cruiseSpeedKmh < 85 ? 1 : 3;
    this.prevGear = this.gear;
    this.gearShiftTimer = 0;
    this.gearShiftCooldown = 0;
    this.spawnCooldown = 0.7;
    this.pickupCooldown = 5.5;
    this.traffic = [];
    this.pickups = [];
    this.particles = [];
    this.seedStarterTraffic();
  }

  private seedAmbientTraffic() {
    this.traffic = [];
    const presets: Array<{ lane: LaneIndex; z: number; bpIndex: number }> = [
      { lane: 0, z: -48, bpIndex: 9 },
      { lane: 2, z: -92, bpIndex: 10 },
      { lane: 1, z: -140, bpIndex: 11 },
    ];
    for (const p of presets) {
      const bp = TRAFFIC_BLUEPRINTS[p.bpIndex] ?? TRAFFIC_BLUEPRINTS[0];
      const palette = bp.colors[0];
      this.traffic.push({
        id: this.nextId++,
        kind: bp.kind,
        lane: p.lane,
        targetLane: p.lane,
        x: getLaneX3D(p.lane),
        z: p.z,
        yaw: 0,
        width: bp.width,
        length: bp.length,
        speed: 70,
        baseSpeed: 70,
        color: palette.body,
        secondaryColor: palette.roof,
        braking: false,
        nearMissed: false,
        hornReactionTimer: 0,
        laneChangePrepTimer: 0,
        laneChangeCooldown: 3.5 + Math.random() * 3.0,
        turnSignal: 0,
      });
    }
  }

  private seedStarterTraffic() {
    const bp0 = TRAFFIC_BLUEPRINTS[9] ?? TRAFFIC_BLUEPRINTS[0]; // Audi
    const bp1 = TRAFFIC_BLUEPRINTS[10] ?? TRAFFIC_BLUEPRINTS[1]; // BMW
    this.traffic.push(
      {
        id: this.nextId++,
        kind: bp0.kind,
        lane: 0,
        targetLane: 0,
        x: getLaneX3D(0),
        z: -85,
        yaw: 0,
        width: bp0.width,
        length: bp0.length,
        speed: 68,
        baseSpeed: 68,
        color: bp0.colors[0].body,
        secondaryColor: bp0.colors[0].roof,
        braking: false,
        nearMissed: false,
        hornReactionTimer: 0,
        laneChangePrepTimer: 0,
        laneChangeCooldown: 3.5 + Math.random() * 3.0,
        turnSignal: 0,
      },
      {
        id: this.nextId++,
        kind: bp1.kind,
        lane: 2,
        targetLane: 2,
        x: getLaneX3D(2),
        z: -130,
        yaw: 0,
        width: bp1.width,
        length: bp1.length,
        speed: 72,
        baseSpeed: 72,
        color: bp1.colors[0].body,
        secondaryColor: bp1.colors[0].roof,
        braking: false,
        nearMissed: false,
        hornReactionTimer: 0,
        laneChangePrepTimer: 0,
        laneChangeCooldown: 4.0 + Math.random() * 3.0,
        turnSignal: 0,
      }
    );
  }

  public shiftLane(delta: -1 | 1): boolean {
    const next = Math.max(0, Math.min(2, this.targetLane + delta)) as LaneIndex;
    if (next !== this.targetLane) {
      this.targetLane = next;
      soundEngine.playLaneShift();
      return true;
    }
    return false;
  }

  public setLane(lane: LaneIndex): boolean {
    if (lane !== this.targetLane) {
      this.targetLane = lane;
      soundEngine.playLaneShift();
      return true;
    }
    return false;
  }

  public setHorn(active: boolean) {
    if (active && !this.hornActive) {
      this.hornActive = true;
      this.hornFlashTimer = 0.35;
      soundEngine.startHorn();
      // React traffic cars ahead near player's lateral position
      for (const car of this.traffic) {
        if (Math.abs(car.x - this.playerX) < 2.8 && car.z < -4 && car.z > -58) {
          car.hornReactionTimer = 0.7;
          car.speed = Math.min(82, car.speed + 8);
        }
      }
    } else if (!active && this.hornActive) {
      this.hornActive = false;
      soundEngine.stopHorn();
    }
  }

  public updateAmbient(dt: number) {
    const scrollM = 110 * KMH_TO_MPS * dt;
    this.worldScrollMeters += scrollM;
    this.wheelSpinAngle += (scrollM / 0.38);

    for (const car of this.traffic) {
      const relM = (110 - car.speed) * KMH_TO_MPS * dt;
      car.z += relM;
      if (car.z > DESPAWN_Z) {
        car.z = SPAWN_Z;
      }
    }
  }

  public update(
    dt: number,
    input: {
      accelerate: boolean;
      brake: boolean;
      nitro: boolean;
      steerLeft: boolean;
      steerRight: boolean;
    }
  ): { crashedOut: boolean; newBest: boolean; cashDelta: number } {
    let cashDelta = 0;

    // 1. Nitro & Longitudinal Speed
    const wantsNitro = input.nitro && this.nitro > 4;
    if (wantsNitro) {
      this.isNitroActive = true;
      this.nitro = Math.max(0, this.nitro - 26 * dt);
    } else {
      this.isNitroActive = false;
      const chargeRate = this.speedKmh > 150 ? 4.8 : 2.2;
      this.nitro = Math.min(100, this.nitro + chargeRate * dt);
    }

    let targetSpeed = this.cruiseSpeedKmh;
    if (this.isNitroActive) {
      targetSpeed = this.nitroSpeedKmh;
    } else if (input.accelerate) {
      targetSpeed = this.maxSpeedKmh;
    } else if (input.brake) {
      targetSpeed = Math.min(78, Math.max(36, Math.round(this.cruiseSpeedKmh * 0.68)));
    }

    const accelRate = this.isNitroActive ? 310 : input.brake ? 260 : 185;
    if (this.speedKmh < targetSpeed) {
      this.speedKmh = Math.min(targetSpeed, this.speedKmh + accelRate * dt);
    } else if (this.speedKmh > targetSpeed) {
      this.speedKmh = Math.max(targetSpeed, this.speedKmh - accelRate * dt);
    }
    this.speedKmh = Math.min(this.speedKmh, Math.max(this.maxSpeedKmh, this.nitroSpeedKmh));

    const safeDt = Number.isFinite(dt) ? Math.max(0.0005, Math.min(0.05, dt)) : 0.016;
    dt = safeDt;

    // 2. Realistic Speed-Coupled Steering Physics across full highway width
    const sens = this.steeringSensitivity;
    const steerDir = (input.steerRight ? 1 : 0) - (input.steerLeft ? 1 : 0);
    const steerRate = steerDir !== 0 ? 2.4 + 2.8 * sens : 6.8;
    this.steerInput += (steerDir - this.steerInput) * (1 - Math.exp(-steerRate * dt));

    const speedMps = Math.max(15, this.speedKmh * KMH_TO_MPS);
    // Speed-sensitive max yaw scaled by user steering sensitivity
    const baseMaxYaw = Math.max(0.115, Math.min(0.22, 0.165 * Math.pow(40 / speedMps, 0.5)));
    const maxYaw = Math.min(0.34, baseMaxYaw * sens);
    const targetYaw = -this.steerInput * maxYaw;
    const yawRate = steerDir !== 0 ? 3.2 + 3.3 * sens : 8.5;
    const yawBlend = 1 - Math.exp(-yawRate * dt);
    this.playerYaw += (targetYaw - this.playerYaw) * yawBlend;

    // Car moves in the direction its nose is pointing (tire compliance lag)
    const targetVx = -speedMps * Math.sin(this.playerYaw);
    this.playerVx += (targetVx - this.playerVx) * (1 - Math.exp(-14 * dt));
    this.playerX += this.playerVx * dt;

    if (!Number.isFinite(this.playerX)) this.playerX = 0;
    if (!Number.isFinite(this.playerVx)) this.playerVx = 0;
    if (!Number.isFinite(this.playerYaw)) this.playerYaw = 0;

    let crashedOut = false;
    const maxPlayerX = TOTAL_ASPHALT_WIDTH_3D / 2 - this.playerWidth / 2 - 0.25;
    const curbTriggerX = TOTAL_ASPHALT_WIDTH_3D / 2 - this.playerWidth / 2 - 0.36;

    if (Math.abs(this.playerX) >= curbTriggerX) {
      const side: -1 | 1 = this.playerX >= 0 ? 1 : -1;
      if (Math.abs(this.playerX) > maxPlayerX) {
        this.playerX = side * maxPlayerX;
      }
      if (this.invulnerableTimer <= 0) {
        this.handleCurbHit(side);
        if (this.lives <= 0) {
          crashedOut = true;
        }
      } else {
        if (side < 0 && this.playerVx < 0) this.playerVx = 0;
        if (side > 0 && this.playerVx > 0) this.playerVx = 0;
        if (side < 0 && this.playerYaw > 0) this.playerYaw *= Math.exp(-14 * dt);
        if (side > 0 && this.playerYaw < 0) this.playerYaw *= Math.exp(-14 * dt);
      }
    }

    const nearestLane = Math.max(
      0,
      Math.min(2, Math.round(this.playerX / LANE_WIDTH_3D) + 1)
    ) as LaneIndex;
    this.targetLane = nearestLane;

    // Motorcycles lean deeply into the turn; cars lean slightly outward from centrifugal force
    const targetRoll = this.isMotorcycle
      ? Math.max(-0.34, Math.min(0.34, -this.playerVx * 0.032 - this.steerInput * 0.14))
      : Math.max(-0.048, Math.min(0.048, this.playerVx * 0.0045 + this.steerInput * 0.014));
    const rollBlend = 1 - Math.exp(-(this.isMotorcycle ? 11 : 9) * dt);
    this.playerRoll += (targetRoll - this.playerRoll) * rollBlend;

    // 3. Road Scroll & Telemetry
    const scrollM = this.speedKmh * KMH_TO_MPS * dt;
    this.worldScrollMeters += scrollM;
    this.wheelSpinAngle += scrollM / 0.36;

    const kmDelta = (this.speedKmh / 3600) * dt;
    this.distanceKm += kmDelta;
    this.score += (this.speedKmh * 0.14 + (this.isNitroActive ? 14 : 0)) * dt;

    while (this.distanceKm >= this.nextDistanceCashKm) {
      this.nextDistanceCashKm += 0.5;
      this.runCash += 50;
      cashDelta += 50;
      this.emitCallout('distance', '+0.5 км · +$50', 'emerald');
    }

    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);
    }
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    }
    if (this.hornFlashTimer > 0) {
      this.hornFlashTimer = Math.max(0, this.hornFlashTimer - dt);
    }
    if (this.gearShiftTimer > 0) {
      this.gearShiftTimer = Math.max(0, this.gearShiftTimer - dt);
    }
    if (this.gearShiftCooldown > 0) {
      this.gearShiftCooldown = Math.max(0, this.gearShiftCooldown - dt);
    }

    // 3b. Automatic 6-Speed Gearbox with Hysteresis
    if (this.gearShiftCooldown <= 0) {
      let desiredGear = this.gear;
      const spd = this.speedKmh;
      if (this.gear === 1 && spd >= 96) desiredGear = 2;
      else if (this.gear === 2) {
        if (spd >= 128) desiredGear = 3;
        else if (spd < 89) desiredGear = 1;
      } else if (this.gear === 3) {
        if (spd >= 160) desiredGear = 4;
        else if (spd < 118) desiredGear = 2;
      } else if (this.gear === 4) {
        if (spd >= 194) desiredGear = 5;
        else if (spd < 150) desiredGear = 3;
      } else if (this.gear === 5) {
        if (spd >= 230) desiredGear = 6;
        else if (spd < 184) desiredGear = 4;
      } else if (this.gear === 6 && spd < 218) {
        desiredGear = 5;
      }

      if (desiredGear !== this.gear) {
        this.prevGear = this.gear;
        this.gear = desiredGear;
        this.gearShiftTimer = this.gearShiftDuration;
        this.gearShiftCooldown = 0.56;
        soundEngine.playGearShift(desiredGear > this.prevGear);
      }
    }

    // Nitro exhaust particles (capped cleanly at 48)
    if (this.isNitroActive && this.particles.length < 44 && Math.random() < 0.75) {
      const sideOffset = this.isMotorcycle ? 0 : Math.random() > 0.5 ? 0.45 : -0.45;
      this.particles.push({
        x: this.playerX + sideOffset + (Math.random() - 0.5) * 0.12,
        y: 0.38,
        z: PLAYER_Z + this.playerLength * 0.5 + 0.15,
        vx: (Math.random() - 0.5) * 0.6,
        vy: 0.3 + Math.random() * 0.6,
        vz: 14 + Math.random() * 8,
        life: 0.18 + Math.random() * 0.12,
        maxLife: 0.3,
        size: 0.22,
        color: Math.random() > 0.4 ? '#38BDF8' : '#E0F2FE',
      });
    }

    // 4. Spawn Traffic & Pickups
    this.spawnCooldown -= dt;
    if (this.spawnCooldown <= 0) {
      this.trySpawnTraffic();
      const baseInterval = Math.max(0.45, 1.18 - this.distanceKm * 0.032);
      const speedFactor = 130 / Math.max(95, this.speedKmh);
      this.spawnCooldown = Math.max(
        0.24,
        baseInterval * speedFactor * (0.78 + Math.random() * 0.44)
      );
    }

    this.pickupCooldown -= dt;
    if (this.pickupCooldown <= 0) {
      this.trySpawnPickup();
      this.pickupCooldown = 6.0 + Math.random() * 4.5;
    }

    // 5. Prevent Traffic Rear-End Overlaps & Execute NPC Lane Changes
    const blockedBySlowAhead = this.blockedBySlowAhead;
    blockedBySlowAhead.clear();
    this.laneCarsScratch[0].length = 0;
    this.laneCarsScratch[1].length = 0;
    this.laneCarsScratch[2].length = 0;
    for (const c of this.traffic) {
      this.laneCarsScratch[c.lane].push(c);
      if (c.targetLane !== c.lane) {
        this.laneCarsScratch[c.targetLane].push(c);
      }
    }

    for (let lane = 0; lane < 3; lane++) {
      const laneCars = this.laneCarsScratch[lane];
      laneCars.sort((a, b) => a.z - b.z); // farthest ahead (-Z) first

      for (let i = 0; i < laneCars.length; i++) {
        const car = laneCars[i];
        if (car.hornReactionTimer > 0) {
          car.hornReactionTimer = Math.max(0, car.hornReactionTimer - dt);
        }

        const ahead = i > 0 ? laneCars[i - 1] : null;
        if (ahead) {
          const gap = car.z - car.length / 2 - (ahead.z + ahead.length / 2);
          if (gap < 8.0) {
            car.speed = Math.min(car.speed, ahead.speed);
            car.braking = true;
          } else {
            car.speed = Math.min(car.baseSpeed, car.speed + 20 * dt);
            car.braking = false;
          }
          if (gap < 18 && ahead.baseSpeed < car.baseSpeed - 3) {
            blockedBySlowAhead.add(car.id);
          }
        } else {
          car.speed = Math.min(car.baseSpeed, car.speed + 20 * dt);
          car.braking = false;
        }
      }
    }

    this.updateTrafficLaneChanges(dt, blockedBySlowAhead);

    // 6. Move Traffic & Check Collisions / Near-Misses
    const remainingTraffic: TrafficVehicle[] = [];

    for (const car of this.traffic) {
      const relMeters = (this.speedKmh - car.speed) * KMH_TO_MPS * dt;
      car.z += relMeters;

      const hitX = (this.playerWidth + car.width) / 2 - 0.22;
      const hitZ = (this.playerLength + car.length) / 2 - 0.3;
      const absDx = Math.abs(this.playerX - car.x);
      const absDz = Math.abs(PLAYER_Z - car.z);

      if (absDx < hitX && absDz < hitZ) {
        if (this.invulnerableTimer <= 0) {
          this.handleCollision(car);
          if (this.lives <= 0) {
            crashedOut = true;
          }
        }
      } else if (!car.nearMissed && absDz < hitZ + 0.9 && absDx < hitX + LANE_WIDTH_3D * 0.45) {
        const minNearMissSpeed = Math.min(115, Math.round(this.maxSpeedKmh * 0.85));
        if (this.speedKmh >= minNearMissSpeed) {
          car.nearMissed = true;
          this.nearMissCount += 1;
          this.score += 50;
          this.runCash += 20;
          cashDelta += 20;
          this.nitro = Math.min(100, this.nitro + 18);
          soundEngine.playNearMiss();
          this.emitCallout('nearMiss', '+50 Риск · +$20', 'amber');
        }
      }

      if (car.z > DESPAWN_Z) {
        this.overtakenCount += 1;
        this.score += 15;
        this.runCash += 10;
        cashDelta += 10;
      } else if (car.z < SPAWN_Z - 65) {
        // Despawn cars that pulled far ahead (e.g. when driving slower vehicles like Tank)
      } else {
        remainingTraffic.push(car);
      }
    }
    this.traffic = remainingTraffic;

    // 7. Pickups
    const remainingPickups: PickupItem[] = [];
    for (const item of this.pickups) {
      item.z += scrollM;
      item.phase += dt * 3.5;

      const dist = Math.hypot(this.playerX - item.x, PLAYER_Z - item.z);
      if (dist < item.radius + Math.max(0.75, this.playerWidth * 0.8)) {
        soundEngine.playPickup();
        if (item.kind === 'nitro') {
          this.nitro = Math.min(100, this.nitro + 36);
          this.score += 30;
          this.emitCallout('nitro', '+Нитро заряд', 'sky');
        } else {
          if (this.lives < MAX_LIVES) {
            this.lives += 1;
            this.emitCallout('repair', '+1 Жизнь', 'emerald');
          } else {
            this.score += 60;
            this.emitCallout('bonus', '+60 Бонус', 'emerald');
          }
        }
      } else if (item.z < DESPAWN_Z) {
        remainingPickups.push(item);
      }
    }
    this.pickups = remainingPickups;

    // 8. Update 3D Particles
    this.particles = this.particles.filter((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 12 * dt;
      if (p.y < 0.08) {
        p.y = 0.08;
        p.vy *= -0.35;
      }
      p.life -= dt;
      return p.life > 0;
    });

    soundEngine.updateEngine(this.speedKmh, this.isNitroActive, this.gear);

    let newBest = false;
    const roundedScore = Math.floor(this.score);
    if (roundedScore > this.bestScore) {
      this.bestScore = roundedScore;
      newBest = true;
    }

    return { crashedOut, newBest, cashDelta };
  }

  private handleCollision(car: TrafficVehicle) {
    this.lives = Math.max(0, this.lives - 1);
    this.invulnerableTimer = 1.65;
    const minRecoverySpeed = Math.min(88, Math.round(this.cruiseSpeedKmh * 0.72));
    this.speedKmh = Math.max(minRecoverySpeed, this.speedKmh * 0.62);
    this.isNitroActive = false;
    this.shakeTimer = 0.38;
    soundEngine.playCrash();

    car.z -= 4.5;

    if (this.particles.length > 24) {
      this.particles.splice(0, this.particles.length - 24);
    }
    for (let i = 0; i < 24; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 4 + Math.random() * 11;
      this.particles.push({
        x: (this.playerX + car.x) / 2,
        y: 0.7 + Math.random() * 0.6,
        z: (PLAYER_Z + car.z) / 2,
        vx: Math.cos(angle) * spd,
        vy: 3 + Math.random() * 6,
        vz: Math.sin(angle) * spd + 6,
        life: 0.35 + Math.random() * 0.25,
        maxLife: 0.6,
        size: 0.16,
        color: Math.random() > 0.35 ? '#FBBF24' : '#F87171',
      });
    }

    this.emitCallout(this.lives > 0 ? 'hit' : 'crash', this.lives > 0 ? 'Столкновение!' : 'Авария!', 'red');
  }

  private handleCurbHit(side: -1 | 1) {
    this.lives = Math.max(0, this.lives - 1);
    this.invulnerableTimer = 1.45;
    const minRecoverySpeed = Math.min(82, Math.round(this.cruiseSpeedKmh * 0.72));
    this.speedKmh = Math.max(minRecoverySpeed, this.speedKmh * 0.72);
    this.isNitroActive = false;
    this.shakeTimer = 0.34;
    soundEngine.playCrash();

    // Gently deflect vehicle back inside the asphalt shoulder so it doesn't stick to the curb
    const safeClearX = TOTAL_ASPHALT_WIDTH_3D / 2 - this.playerWidth / 2 - 0.65;
    this.playerX = side * Math.max(0, safeClearX);
    this.playerVx = -side * 3.4;
    this.playerYaw = side * 0.08;

    if (this.particles.length > 30) {
      this.particles.splice(0, this.particles.length - 30);
    }
    const sparkX = side * (TOTAL_ASPHALT_WIDTH_3D / 2 - 0.25);
    for (let i = 0; i < 16; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 8;
      this.particles.push({
        x: sparkX,
        y: 0.35 + Math.random() * 0.45,
        z: PLAYER_Z + (Math.random() - 0.5) * 1.4,
        vx: -side * (2 + Math.random() * 4) + Math.cos(angle) * 2,
        vy: 2 + Math.random() * 5,
        vz: Math.sin(angle) * spd + 5,
        life: 0.28 + Math.random() * 0.2,
        maxLife: 0.48,
        size: 0.14,
        color: Math.random() > 0.35 ? '#FBBF24' : '#FB7185',
      });
    }

    this.emitCallout(
      this.lives > 0 ? 'curb' : 'crash',
      this.lives > 0 ? 'Наезд на бордюр!' : 'Авария!',
      'red'
    );
  }

  private trySpawnTraffic() {
    if (this.traffic.length >= 12) return;
    const candidateLanes: LaneIndex[] = [0, 1, 2];
    for (let i = candidateLanes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidateLanes[i], candidateLanes[j]] = [candidateLanes[j], candidateLanes[i]];
    }

    // Guarantee at least 1 open lane in the spawn band (z < -150)
    const occupiedInBand = new Set<LaneIndex>();
    for (const c of this.traffic) {
      if (c.z - c.length / 2 < -150) {
        occupiedInBand.add(c.lane);
        occupiedInBand.add(c.targetLane);
      }
    }
    if (occupiedInBand.size >= 2) {
      return;
    }

    for (const lane of candidateLanes) {
      const tooClose = this.traffic.some(
        (c) => (c.lane === lane || c.targetLane === lane) && c.z - c.length / 2 < -162
      );
      if (tooClose) continue;

      const bp = TRAFFIC_BLUEPRINTS[Math.floor(Math.random() * TRAFFIC_BLUEPRINTS.length)];
      const palette = bp.colors[Math.floor(Math.random() * bp.colors.length)];
      const speed = bp.minSpeed + Math.random() * (bp.maxSpeed - bp.minSpeed);

      this.traffic.push({
        id: this.nextId++,
        kind: bp.kind,
        lane,
        targetLane: lane,
        x: getLaneX3D(lane),
        z: SPAWN_Z - bp.length / 2,
        yaw: 0,
        width: bp.width,
        length: bp.length,
        speed,
        baseSpeed: speed,
        color: palette.body,
        secondaryColor: palette.roof,
        braking: false,
        nearMissed: false,
        hornReactionTimer: 0,
        laneChangePrepTimer: 0,
        laneChangeCooldown: 2.2 + Math.random() * 4.5,
        turnSignal: 0,
      });
      return;
    }
  }

  private canSafelyChangeLane(car: TrafficVehicle, destLane: LaneIndex): boolean {
    const destX = getLaneX3D(destLane);

    // Never cut right in front of the player
    if (car.z > -46 && Math.abs(this.playerX - destX) < 2.8) {
      return false;
    }

    for (const other of this.traffic) {
      if (other.id === car.id) continue;
      const occupiesDest =
        other.lane === destLane ||
        other.targetLane === destLane ||
        Math.abs(other.x - destX) < 2.25;
      if (!occupiesDest) continue;

      const minGap = (car.length + other.length) / 2 + 10.5;
      if (Math.abs(car.z - other.z) < minGap) {
        return false;
      }
    }
    return true;
  }

  private updateTrafficLaneChanges(dt: number, blockedBySlowAhead: Set<number>) {
    for (const car of this.traffic) {
      // 1. Pre-merge blinker warning before steering laterally
      if (car.laneChangePrepTimer > 0) {
        car.laneChangePrepTimer = Math.max(0, car.laneChangePrepTimer - dt);
        const intended = (car.lane + car.turnSignal) as LaneIndex;
        if (
          intended < 0 ||
          intended > 2 ||
          car.z > -22 ||
          !this.canSafelyChangeLane(car, intended)
        ) {
          car.laneChangePrepTimer = 0;
          car.turnSignal = 0;
          car.laneChangeCooldown = 1.8 + Math.random() * 2.0;
        } else if (car.laneChangePrepTimer === 0) {
          car.targetLane = intended;
        }
        continue;
      }

      // 2. Actively steering smoothly across into targetLane
      if (car.lane !== car.targetLane) {
        const destX = getLaneX3D(car.targetLane);
        const dx = destX - car.x;
        const lateralSpeed = 3.55;
        const step = lateralSpeed * dt;

        if (Math.abs(dx) <= step) {
          car.x = destX;
          car.lane = car.targetLane;
          car.turnSignal = 0;
          car.laneChangeCooldown =
            car.kind === 'truck' || car.kind === 'bus'
              ? 6.0 + Math.random() * 5.0
              : 2.8 + Math.random() * 4.5;
        } else {
          car.x += Math.sign(dx) * step;
          const targetYaw = -Math.sign(dx) * Math.min(0.095, Math.abs(dx) * 0.048);
          car.yaw += (targetYaw - car.yaw) * (1 - Math.exp(-10 * dt));
        }
        continue;
      }

      // 3. Centered in lane: smoothly level yaw & evaluate next lane change
      car.yaw *= Math.exp(-11 * dt);
      if (Math.abs(car.yaw) < 0.001) car.yaw = 0;

      if (car.laneChangeCooldown > 0) {
        car.laneChangeCooldown = Math.max(0, car.laneChangeCooldown - dt);
      }

      const wantsOvertake = blockedBySlowAhead.has(car.id);
      if ((wantsOvertake || car.laneChangeCooldown <= 0) && car.z < -28 && car.z > -158) {
        // Trucks & buses mostly stay in lane unless overtaking
        if ((car.kind === 'truck' || car.kind === 'bus') && !wantsOvertake && Math.random() < 0.65) {
          car.laneChangeCooldown = 4.5 + Math.random() * 3.5;
          continue;
        }

        const candidates: LaneIndex[] = [];
        if (car.lane > 0) candidates.push((car.lane - 1) as LaneIndex);
        if (car.lane < 2) candidates.push((car.lane + 1) as LaneIndex);
        if (candidates.length === 2 && Math.random() < 0.5) {
          [candidates[0], candidates[1]] = [candidates[1], candidates[0]];
        }

        let started = false;
        for (const dest of candidates) {
          if (this.canSafelyChangeLane(car, dest)) {
            car.turnSignal = dest < car.lane ? -1 : 1;
            car.laneChangePrepTimer = 0.55;
            started = true;
            break;
          }
        }
        if (!started) {
          car.laneChangeCooldown = 1.4 + Math.random() * 1.8;
        }
      }
    }
  }

  private trySpawnPickup() {
    const lanes: LaneIndex[] = [0, 1, 2];
    const openLanes = lanes.filter(
      (lane) => !this.traffic.some((c) => c.lane === lane && c.z < -155)
    );
    if (openLanes.length === 0) return;

    const lane = openLanes[Math.floor(Math.random() * openLanes.length)];
    const kind = this.lives < MAX_LIVES && Math.random() < 0.35 ? 'repair' : 'nitro';

    this.pickups.push({
      id: this.nextId++,
      kind,
      lane,
      x: getLaneX3D(lane),
      z: SPAWN_Z,
      radius: 0.72,
      phase: Math.random() * Math.PI * 2,
    });
  }

  public getHudSnapshot(): GameHudSnapshot {
    return {
      score: Math.floor(this.score),
      bestScore: this.bestScore,
      speedKmh: Math.round(this.speedKmh),
      gear: this.gear,
      distanceKm: this.distanceKm,
      lives: this.lives,
      maxLives: MAX_LIVES,
      nitro: Math.round(this.nitro),
      isNitroActive: this.isNitroActive,
      nearMissCount: this.nearMissCount,
      overtakenCount: this.overtakenCount,
      runCash: this.runCash,
    };
  }
}
