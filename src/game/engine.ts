import { soundEngine } from './sound';
import {
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
];

export class Highway3DEngine {
  public targetLane: LaneIndex = 1;
  public playerX: number = getLaneX3D(1);
  public playerVx: number = 0;
  public steerInput: number = 0;
  public playerYaw: number = 0;
  public playerRoll: number = 0;
  public speedKmh: number = 124;
  public nitro: number = 65;
  public isNitroActive: boolean = false;
  public lives: number = MAX_LIVES;
  public score: number = 0;
  public bestScore: number = 0;
  public distanceKm: number = 0;
  public nearMissCount: number = 0;
  public overtakenCount: number = 0;
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

  constructor(bestScore: number) {
    this.bestScore = bestScore;
    this.seedAmbientTraffic();
  }

  public onCallout(cb: (c: CalloutNotice) => void): () => void {
    this.calloutListeners.push(cb);
    return () => {
      this.calloutListeners = this.calloutListeners.filter((fn) => fn !== cb);
    };
  }

  private emitCallout(text: string, tone: CalloutNotice['tone']) {
    const notice: CalloutNotice = { id: this.nextId++, text, tone };
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
    this.speedKmh = 124;
    this.nitro = 65;
    this.isNitroActive = false;
    this.lives = MAX_LIVES;
    this.score = 0;
    this.distanceKm = 0;
    this.nearMissCount = 0;
    this.overtakenCount = 0;
    this.invulnerableTimer = 0;
    this.shakeTimer = 0;
    this.hornActive = false;
    this.hornFlashTimer = 0;
    this.gear = 3;
    this.prevGear = 3;
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
      { lane: 0, z: -48, bpIndex: 0 },
      { lane: 2, z: -92, bpIndex: 1 },
      { lane: 1, z: -140, bpIndex: 2 },
    ];
    for (const p of presets) {
      const bp = TRAFFIC_BLUEPRINTS[p.bpIndex];
      const palette = bp.colors[0];
      this.traffic.push({
        id: this.nextId++,
        kind: bp.kind,
        lane: p.lane,
        x: getLaneX3D(p.lane),
        z: p.z,
        width: bp.width,
        length: bp.length,
        speed: 65,
        baseSpeed: 65,
        color: palette.body,
        secondaryColor: palette.roof,
        braking: false,
        nearMissed: false,
        hornReactionTimer: 0,
      });
    }
  }

  private seedStarterTraffic() {
    const bp0 = TRAFFIC_BLUEPRINTS[0];
    const bp1 = TRAFFIC_BLUEPRINTS[1];
    this.traffic.push(
      {
        id: this.nextId++,
        kind: bp0.kind,
        lane: 0,
        x: getLaneX3D(0),
        z: -85,
        width: bp0.width,
        length: bp0.length,
        speed: 66,
        baseSpeed: 66,
        color: bp0.colors[1].body,
        secondaryColor: bp0.colors[1].roof,
        braking: false,
        nearMissed: false,
        hornReactionTimer: 0,
      },
      {
        id: this.nextId++,
        kind: bp1.kind,
        lane: 2,
        x: getLaneX3D(2),
        z: -130,
        width: bp1.width,
        length: bp1.length,
        speed: 68,
        baseSpeed: 68,
        color: bp1.colors[0].body,
        secondaryColor: bp1.colors[0].roof,
        braking: false,
        nearMissed: false,
        hornReactionTimer: 0,
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
  ): { crashedOut: boolean; newBest: boolean } {
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

    const difficultyBonus = Math.min(28, this.distanceKm * 1.4);
    let targetSpeed = 124 + difficultyBonus * 0.4;
    if (this.isNitroActive) {
      targetSpeed = 268;
    } else if (input.accelerate) {
      targetSpeed = 198 + difficultyBonus * 0.45;
    } else if (input.brake) {
      targetSpeed = 88;
    }

    const accelRate = this.isNitroActive ? 290 : input.brake ? 260 : 165;
    if (this.speedKmh < targetSpeed) {
      this.speedKmh = Math.min(targetSpeed, this.speedKmh + accelRate * dt);
    } else if (this.speedKmh > targetSpeed) {
      this.speedKmh = Math.max(targetSpeed, this.speedKmh - accelRate * dt);
    }

    // 2. Realistic Speed-Coupled Steering Physics across full highway width
    const steerDir = (input.steerRight ? 1 : 0) - (input.steerLeft ? 1 : 0);
    const steerRate = steerDir !== 0 ? 5.2 : 6.8;
    this.steerInput += (steerDir - this.steerInput) * (1 - Math.exp(-steerRate * dt));

    const speedMps = Math.max(15, this.speedKmh * KMH_TO_MPS);
    // Speed-sensitive max yaw (~9.5 deg at 124 km/h, firmer at 200+ km/h, wider at lower speed)
    const maxYaw = Math.max(0.115, Math.min(0.22, 0.165 * Math.pow(40 / speedMps, 0.5)));
    const targetYaw = -this.steerInput * maxYaw;
    const yawBlend = 1 - Math.exp(-(steerDir !== 0 ? 6.5 : 8.5) * dt);
    this.playerYaw += (targetYaw - this.playerYaw) * yawBlend;

    // Car moves in the direction its nose is pointing (tire compliance lag)
    const targetVx = -speedMps * Math.sin(this.playerYaw);
    this.playerVx += (targetVx - this.playerVx) * (1 - Math.exp(-14 * dt));
    this.playerX += this.playerVx * dt;

    const maxPlayerX = TOTAL_ASPHALT_WIDTH_3D / 2 - PLAYER_WIDTH_3D / 2 - 0.25;
    if (this.playerX < -maxPlayerX) {
      this.playerX = -maxPlayerX;
      if (this.playerVx < 0) this.playerVx = 0;
      if (this.playerYaw > 0) this.playerYaw *= Math.exp(-14 * dt);
    } else if (this.playerX > maxPlayerX) {
      this.playerX = maxPlayerX;
      if (this.playerVx > 0) this.playerVx = 0;
      if (this.playerYaw < 0) this.playerYaw *= Math.exp(-14 * dt);
    }

    const nearestLane = Math.max(
      0,
      Math.min(2, Math.round(this.playerX / LANE_WIDTH_3D) + 1)
    ) as LaneIndex;
    this.targetLane = nearestLane;

    // Outward suspension roll from centrifugal force (turning right leans roof left -> +roll)
    const targetRoll = Math.max(
      -0.048,
      Math.min(0.048, this.playerVx * 0.0045 + this.steerInput * 0.014)
    );
    const rollBlend = 1 - Math.exp(-9 * dt);
    this.playerRoll += (targetRoll - this.playerRoll) * rollBlend;

    // 3. Road Scroll & Telemetry
    const scrollM = this.speedKmh * KMH_TO_MPS * dt;
    this.worldScrollMeters += scrollM;
    this.wheelSpinAngle += scrollM / 0.36;

    const kmDelta = (this.speedKmh / 3600) * dt;
    this.distanceKm += kmDelta;
    this.score += (this.speedKmh * 0.14 + (this.isNitroActive ? 14 : 0)) * dt;

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

    // Nitro exhaust particles
    if (this.isNitroActive && Math.random() < 0.75) {
      this.particles.push({
        x: this.playerX + (Math.random() > 0.5 ? 0.45 : -0.45) + (Math.random() - 0.5) * 0.12,
        y: 0.38,
        z: PLAYER_Z + PLAYER_LENGTH_3D * 0.5 + 0.15,
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
      this.spawnCooldown = baseInterval * speedFactor * (0.78 + Math.random() * 0.44);
    }

    this.pickupCooldown -= dt;
    if (this.pickupCooldown <= 0) {
      this.trySpawnPickup();
      this.pickupCooldown = 6.0 + Math.random() * 4.5;
    }

    // 5. Prevent Traffic Rear-End Overlaps per Lane
    for (let lane = 0; lane < 3; lane++) {
      const laneCars = this.traffic
        .filter((c) => c.lane === lane)
        .sort((a, b) => a.z - b.z); // farthest ahead (-Z) first

      for (let i = 0; i < laneCars.length; i++) {
        const car = laneCars[i];
        if (car.hornReactionTimer > 0) {
          car.hornReactionTimer = Math.max(0, car.hornReactionTimer - dt);
        }

        const ahead = i > 0 ? laneCars[i - 1] : null;
        if (ahead) {
          const gap = car.z - car.length / 2 - (ahead.z + ahead.length / 2);
          if (gap < 7.5) {
            car.speed = Math.min(car.speed, ahead.speed);
            car.braking = true;
          } else {
            car.speed = Math.min(car.baseSpeed, car.speed + 20 * dt);
            car.braking = false;
          }
        } else {
          car.speed = Math.min(car.baseSpeed, car.speed + 20 * dt);
          car.braking = false;
        }
      }
    }

    // 6. Move Traffic & Check Collisions / Near-Misses
    let crashedOut = false;
    const remainingTraffic: TrafficVehicle[] = [];

    for (const car of this.traffic) {
      const relMeters = (this.speedKmh - car.speed) * KMH_TO_MPS * dt;
      car.z += relMeters;

      const hitX = (PLAYER_WIDTH_3D + car.width) / 2 - 0.25;
      const hitZ = (PLAYER_LENGTH_3D + car.length) / 2 - 0.35;
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
        if (this.speedKmh >= 115) {
          car.nearMissed = true;
          this.nearMissCount += 1;
          this.score += 50;
          this.nitro = Math.min(100, this.nitro + 18);
          soundEngine.playNearMiss();
          this.emitCallout('+50 Опасный обгон', 'amber');
        }
      }

      if (car.z > DESPAWN_Z) {
        this.overtakenCount += 1;
        this.score += 15;
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
      if (dist < item.radius + PLAYER_WIDTH_3D * 0.8) {
        soundEngine.playPickup();
        if (item.kind === 'nitro') {
          this.nitro = Math.min(100, this.nitro + 36);
          this.score += 30;
          this.emitCallout('+Нитро заряд', 'sky');
        } else {
          if (this.lives < MAX_LIVES) {
            this.lives += 1;
            this.emitCallout('+1 Жизнь', 'emerald');
          } else {
            this.score += 60;
            this.emitCallout('+60 Бонус', 'emerald');
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

    return { crashedOut, newBest };
  }

  private handleCollision(car: TrafficVehicle) {
    this.lives = Math.max(0, this.lives - 1);
    this.invulnerableTimer = 1.65;
    this.speedKmh = Math.max(88, this.speedKmh * 0.62);
    this.isNitroActive = false;
    this.shakeTimer = 0.38;
    soundEngine.playCrash();

    car.z -= 4.5;

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

    this.emitCallout(this.lives > 0 ? 'Столкновение!' : 'Авария!', 'red');
  }

  private trySpawnTraffic() {
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
      }
    }
    if (occupiedInBand.size >= 2) {
      return;
    }

    for (const lane of candidateLanes) {
      const tooClose = this.traffic.some(
        (c) => c.lane === lane && c.z - c.length / 2 < -162
      );
      if (tooClose) continue;

      const bp = TRAFFIC_BLUEPRINTS[Math.floor(Math.random() * TRAFFIC_BLUEPRINTS.length)];
      const palette = bp.colors[Math.floor(Math.random() * bp.colors.length)];
      const speed = bp.minSpeed + Math.random() * (bp.maxSpeed - bp.minSpeed);

      this.traffic.push({
        id: this.nextId++,
        kind: bp.kind,
        lane,
        x: getLaneX3D(lane),
        z: SPAWN_Z - bp.length / 2,
        width: bp.width,
        length: bp.length,
        speed,
        baseSpeed: speed,
        color: palette.body,
        secondaryColor: palette.roof,
        braking: false,
        nearMissed: false,
        hornReactionTimer: 0,
      });
      return;
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
    };
  }
}
