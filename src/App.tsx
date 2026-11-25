import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Car,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Coins,
  Flame,
  Gauge,
  Globe,
  Keyboard,
  Lock,
  Megaphone,
  Monitor,
  Moon,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Shield,
  SlidersHorizontal,
  Sun,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { Highway3DEngine } from './game/engine';
import {
  formatControlsHint,
  formatKeyCode,
  formatKeyList,
  LANGUAGE_OPTIONS,
  Language,
  TRANSLATIONS,
  TranslationBundle,
} from './game/i18n';
import { soundEngine } from './game/sound';
import { Highway3DRenderer } from './game/threeScene';
import {
  CONTROL_ACTIONS_ORDER,
  CONTROL_PRESETS,
  CalloutKey,
  CalloutNotice,
  CameraMode,
  ControlAction,
  ControlPresetId,
  DEFAULT_KEY_BINDINGS,
  GameHudSnapshot,
  GameState,
  GraphicsQuality,
  KeyBindings,
  MAX_LIVES,
  PLAYER_CARS,
  PlayerCarId,
  TimeOfDay,
} from './game/types';

const BEST_SCORE_STORAGE_KEY = 'trassa3_3d_best_score_v1';
const SETTINGS_STORAGE_KEY = 'trassa3_settings_v1';

interface PersistedSettings {
  language: Language;
  selectedCar: PlayerCarId;
  cameraMode: CameraMode;
  timeOfDay: TimeOfDay;
  isMuted: boolean;
  showFps: boolean;
  graphicsQuality: GraphicsQuality;
  steeringSensitivity: number;
  keyBindings: KeyBindings;
  walletCash: number;
  unlockedCars: PlayerCarId[];
}

function readStoredBestScore(): number {
  try {
    const raw = localStorage.getItem(BEST_SCORE_STORAGE_KEY);
    const parsed = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeStoredBestScore(score: number) {
  try {
    localStorage.setItem(BEST_SCORE_STORAGE_KEY, String(score));
  } catch {
    // Ignore storage errors
  }
}

function sanitizeKeyBindings(raw: unknown): KeyBindings {
  const result: KeyBindings = {
    steerLeft: [...DEFAULT_KEY_BINDINGS.steerLeft],
    steerRight: [...DEFAULT_KEY_BINDINGS.steerRight],
    accelerate: [...DEFAULT_KEY_BINDINGS.accelerate],
    brake: [...DEFAULT_KEY_BINDINGS.brake],
    nitro: [...DEFAULT_KEY_BINDINGS.nitro],
    horn: [...DEFAULT_KEY_BINDINGS.horn],
    camera: [...DEFAULT_KEY_BINDINGS.camera],
  };
  if (!raw || typeof raw !== 'object') return result;
  const obj = raw as Record<string, unknown>;
  for (const action of CONTROL_ACTIONS_ORDER) {
    const val = obj[action];
    if (Array.isArray(val)) {
      result[action] = val.filter((k): k is string => typeof k === 'string' && k.length > 0);
    }
  }
  return result;
}

function readStoredSettings(): PersistedSettings {
  const fallback: PersistedSettings = {
    language: 'ru',
    selectedCar: 'starter',
    cameraMode: 'third',
    timeOfDay: 'night',
    isMuted: false,
    showFps: false,
    graphicsQuality: 'high',
    steeringSensitivity: 1.0,
    keyBindings: sanitizeKeyBindings(null),
    walletCash: 0,
    unlockedCars: ['starter'],
  };
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PersistedSettings>;

    const unlockedSet = new Set<PlayerCarId>(['starter']);
    if (Array.isArray(parsed.unlockedCars)) {
      for (const id of parsed.unlockedCars) {
        if (PLAYER_CARS.some((c) => c.id === id)) {
          unlockedSet.add(id as PlayerCarId);
        }
      }
    }
    const unlockedCars = Array.from(unlockedSet);

    const validCar =
      parsed.selectedCar && unlockedSet.has(parsed.selectedCar as PlayerCarId)
        ? (parsed.selectedCar as PlayerCarId)
        : fallback.selectedCar;
    const validLang: Language =
      parsed.language === 'ru' || parsed.language === 'de' || parsed.language === 'en'
        ? parsed.language
        : fallback.language;
    const validCam: CameraMode =
      parsed.cameraMode === 'first' || parsed.cameraMode === 'third'
        ? parsed.cameraMode
        : fallback.cameraMode;
    const validTod: TimeOfDay =
      parsed.timeOfDay === 'day' || parsed.timeOfDay === 'night'
        ? parsed.timeOfDay
        : fallback.timeOfDay;
    const validQuality: GraphicsQuality =
      parsed.graphicsQuality === 'low' ||
      parsed.graphicsQuality === 'medium' ||
      parsed.graphicsQuality === 'high'
        ? parsed.graphicsQuality
        : fallback.graphicsQuality;
    const rawSens = typeof parsed.steeringSensitivity === 'number' ? parsed.steeringSensitivity : 1.0;
    const validSens = Number.isFinite(rawSens)
      ? Math.max(0.5, Math.min(1.8, Math.round(rawSens * 20) / 20))
      : fallback.steeringSensitivity;
    const rawCash = typeof parsed.walletCash === 'number' ? Math.floor(parsed.walletCash) : 0;
    const validCash = Number.isFinite(rawCash) && rawCash >= 0 ? rawCash : 0;

    return {
      language: validLang,
      selectedCar: validCar,
      cameraMode: validCam,
      timeOfDay: validTod,
      isMuted: Boolean(parsed.isMuted),
      showFps: Boolean(parsed.showFps),
      graphicsQuality: validQuality,
      steeringSensitivity: validSens,
      keyBindings: sanitizeKeyBindings(parsed.keyBindings),
      walletCash: validCash,
      unlockedCars,
    };
  } catch {
    return fallback;
  }
}

function writeStoredSettings(settings: PersistedSettings) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

function detectControlPreset(bindings: KeyBindings): ControlPresetId {
  const eq = (a: string[], b: string[]) =>
    a.length === b.length && a.every((v, idx) => v === b[idx]);
  for (const presetId of ['both', 'wasd', 'arrows'] as const) {
    const preset = CONTROL_PRESETS[presetId];
    if (CONTROL_ACTIONS_ORDER.every((act) => eq(bindings[act], preset[act]))) {
      return presetId;
    }
  }
  return 'custom';
}

function getCalloutLabel(key: CalloutKey, t: TranslationBundle): string {
  switch (key) {
    case 'nearMiss':
      return t.calloutNearMiss;
    case 'distance':
      return t.calloutDistance;
    case 'nitro':
      return t.calloutNitro;
    case 'repair':
      return t.calloutRepair;
    case 'bonus':
      return t.calloutBonus;
    case 'hit':
      return t.calloutHit;
    case 'curb':
      return t.calloutCurb;
    case 'crash':
      return t.calloutCrash;
  }
}

interface SettingsPanelProps {
  t: TranslationBundle;
  language: Language;
  setLanguage: (lang: Language) => void;
  graphicsQuality: GraphicsQuality;
  setGraphicsQuality: (q: GraphicsQuality) => void;
  cameraMode: CameraMode;
  setCameraModeDirect: (mode: CameraMode) => void;
  timeOfDay: TimeOfDay;
  setTimeOfDay: (tod: TimeOfDay) => void;
  isMuted: boolean;
  toggleMute: () => void;
  showFps: boolean;
  setShowFps: (v: boolean) => void;
  steeringSensitivity: number;
  setSteeringSensitivity: (value: number) => void;
  keyBindings: KeyBindings;
  setKeyBindings: (next: KeyBindings) => void;
  listeningAction: ControlAction | null;
  setListeningAction: (action: ControlAction | null) => void;
}

function SettingsPanel({
  t,
  language,
  setLanguage,
  graphicsQuality,
  setGraphicsQuality,
  cameraMode,
  setCameraModeDirect,
  timeOfDay,
  setTimeOfDay,
  isMuted,
  toggleMute,
  showFps,
  setShowFps,
  steeringSensitivity,
  setSteeringSensitivity,
  keyBindings,
  setKeyBindings,
  listeningAction,
  setListeningAction,
}: SettingsPanelProps) {
  const activePreset = detectControlPreset(keyBindings);
  const sensPct = Math.round(steeringSensitivity * 100);

  return (
    <div className="space-y-4">
      {/* Language */}
      <div>
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
          <Globe className="w-3.5 h-3.5 text-amber-400" />
          <span>{t.settingLanguage}</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#171C28] border border-white/10 rounded-xl">
          {LANGUAGE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setLanguage(opt.id)}
              className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                language === opt.id
                  ? 'bg-[#262E40] text-white border border-amber-400/50'
                  : 'text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Graphics Quality + Sound */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
            <Monitor className="w-3.5 h-3.5 text-sky-400" />
            <span>{t.settingGraphics}</span>
          </div>
          <div className="grid grid-cols-3 gap-1 p-1 bg-[#171C28] border border-white/10 rounded-xl">
            <button
              type="button"
              onClick={() => setGraphicsQuality('high')}
              className={`py-1.5 px-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                graphicsQuality === 'high'
                  ? 'bg-[#262E40] text-white border border-amber-400/50'
                  : 'text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              {t.graphicsHigh}
            </button>
            <button
              type="button"
              onClick={() => setGraphicsQuality('medium')}
              className={`py-1.5 px-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                graphicsQuality === 'medium'
                  ? 'bg-[#262E40] text-white border border-amber-400/50'
                  : 'text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              {t.graphicsMedium}
            </button>
            <button
              type="button"
              onClick={() => setGraphicsQuality('low')}
              className={`py-1.5 px-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                graphicsQuality === 'low'
                  ? 'bg-[#262E40] text-white border border-amber-400/50'
                  : 'text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              {t.graphicsLow}
            </button>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
            {isMuted ? (
              <VolumeX className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>{t.settingSound}</span>
          </div>
          <div className="grid grid-cols-2 gap-1 p-1 bg-[#171C28] border border-white/10 rounded-xl">
            <button
              type="button"
              onClick={() => {
                if (isMuted) toggleMute();
              }}
              className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                !isMuted ? 'bg-[#262E40] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t.soundOn}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!isMuted) toggleMute();
              }}
              className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                isMuted ? 'bg-[#262E40] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t.soundOff}
            </button>
          </div>
        </div>
      </div>

      {/* Camera & Lighting */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs font-medium text-slate-400 mb-1.5">{t.settingCamera}</div>
          <div className="grid grid-cols-2 gap-1 p-1 bg-[#171C28] border border-white/10 rounded-xl">
            <button
              type="button"
              onClick={() => setCameraModeDirect('third')}
              className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                cameraMode === 'third' ? 'bg-[#262E40] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t.cameraThird}
            </button>
            <button
              type="button"
              onClick={() => setCameraModeDirect('first')}
              className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                cameraMode === 'first' ? 'bg-[#262E40] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t.cameraFirst}
            </button>
          </div>
        </div>

        <div>
          <div className="text-xs font-medium text-slate-400 mb-1.5">{t.settingLighting}</div>
          <div className="grid grid-cols-2 gap-1 p-1 bg-[#171C28] border border-white/10 rounded-xl">
            <button
              type="button"
              onClick={() => setTimeOfDay('night')}
              className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                timeOfDay === 'night' ? 'bg-[#262E40] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>{t.lightingNight}</span>
            </button>
            <button
              type="button"
              onClick={() => setTimeOfDay('day')}
              className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                timeOfDay === 'day' ? 'bg-[#262E40] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>{t.lightingDay}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Show FPS */}
      <div className="flex items-center justify-between gap-3 p-2 rounded-xl bg-[#171C28] border border-white/10">
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-300 pl-1">
          <Gauge className="w-3.5 h-3.5 text-emerald-400" />
          <span>{t.settingShowFps}</span>
        </div>
        <div className="grid grid-cols-2 gap-1 p-0.5 bg-[#111520] border border-white/10 rounded-lg min-w-[144px]">
          <button
            type="button"
            onClick={() => setShowFps(true)}
            className={`py-1 px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              showFps ? 'bg-[#262E40] text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.fpsOn}
          </button>
          <button
            type="button"
            onClick={() => setShowFps(false)}
            className={`py-1 px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              !showFps ? 'bg-[#262E40] text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.fpsOff}
          </button>
        </div>
      </div>

      {/* Steering Sensitivity */}
      <div className="pt-1 border-t border-white/10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
            <span>{t.settingSteeringSensitivity}</span>
          </div>
          <span className="font-mono-tabular text-xs font-bold text-amber-400">{sensPct}%</span>
        </div>

        <div className="p-2.5 rounded-xl bg-[#171C28] border border-white/10 space-y-2.5">
          <input
            type="range"
            min={0.5}
            max={1.8}
            step={0.05}
            value={steeringSensitivity}
            onChange={(e) => setSteeringSensitivity(parseFloat(e.target.value))}
            aria-label={t.settingSteeringSensitivity}
            className="w-full h-1.5 rounded-lg bg-[#262E40] accent-amber-400 cursor-pointer"
          />
          <div className="grid grid-cols-3 gap-1">
            {(
              [
                [0.7, t.steeringSoft],
                [1.0, t.steeringNormal],
                [1.45, t.steeringSharp],
              ] as const
            ).map(([val, label]) => {
              const isMatch = Math.abs(steeringSensitivity - val) < 0.03;
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => setSteeringSensitivity(val)}
                  className={`py-1 px-2 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    isMatch
                      ? 'bg-[#262E40] text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Controls Customization */}
      <div className="pt-1 border-t border-white/10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <Keyboard className="w-3.5 h-3.5 text-amber-400" />
            <span>{t.settingControls}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setListeningAction(null);
              setKeyBindings(sanitizeKeyBindings(DEFAULT_KEY_BINDINGS));
            }}
            className="text-[11px] font-medium text-slate-400 hover:text-amber-300 transition-colors cursor-pointer"
          >
            {t.resetControls}
          </button>
        </div>

        {/* Presets */}
        <div className="grid grid-cols-3 gap-1 p-1 mb-2.5 bg-[#171C28] border border-white/10 rounded-xl">
          {(
            [
              ['both', t.presetBoth],
              ['wasd', t.presetWasd],
              ['arrows', t.presetArrows],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setListeningAction(null);
                setKeyBindings(sanitizeKeyBindings(CONTROL_PRESETS[id]));
              }}
              className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activePreset === id
                  ? 'bg-[#262E40] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Individual Keybind Rows */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {CONTROL_ACTIONS_ORDER.map((action) => {
            const isListening = listeningAction === action;
            return (
              <div
                key={action}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[#171C28] border border-white/10"
              >
                <span className="text-xs text-slate-300 truncate">
                  {t.controlActions[action]}
                </span>
                <button
                  type="button"
                  onClick={() => setListeningAction(isListening ? null : action)}
                  className={`px-2 py-1 rounded-md text-[11px] font-mono-tabular font-semibold transition-colors cursor-pointer shrink-0 ${
                    isListening
                      ? 'bg-amber-500 text-slate-950 animate-pulse'
                      : 'bg-[#232B3D] hover:bg-[#2F3950] text-amber-300 border border-white/10'
                  }`}
                >
                  {isListening ? t.pressKeyPrompt : formatKeyList(keyBindings[action], language)}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const initialSettingsRef = useRef<PersistedSettings | null>(null);
  if (!initialSettingsRef.current) {
    initialSettingsRef.current = readStoredSettings();
  }
  const initial = initialSettingsRef.current;

  const mountRef = useRef<HTMLDivElement | null>(null);
  const renderer3DRef = useRef<Highway3DRenderer | null>(null);
  const engineRef = useRef<Highway3DEngine | null>(null);

  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const gameStateRef = useRef<GameState>('TITLE_MENU');

  const [menuTab, setMenuTab] = useState<'garage' | 'settings'>('garage');
  const [pauseSubView, setPauseSubView] = useState<'menu' | 'settings'>('menu');

  const [language, setLanguage] = useState<Language>(initial.language);
  const [graphicsQuality, setGraphicsQuality] = useState<GraphicsQuality>(initial.graphicsQuality);
  const graphicsQualityRef = useRef<GraphicsQuality>(initial.graphicsQuality);

  const [steeringSensitivity, setSteeringSensitivity] = useState<number>(initial.steeringSensitivity);

  const [keyBindings, setKeyBindings] = useState<KeyBindings>(initial.keyBindings);
  const keyBindingsRef = useRef<KeyBindings>(initial.keyBindings);

  const [listeningAction, setListeningAction] = useState<ControlAction | null>(null);
  const listeningActionRef = useRef<ControlAction | null>(null);

  const [cameraMode, setCameraMode] = useState<CameraMode>(initial.cameraMode);
  const cameraModeRef = useRef<CameraMode>(initial.cameraMode);

  const [selectedCar, setSelectedCar] = useState<PlayerCarId>(initial.selectedCar);
  const selectedCarRef = useRef<PlayerCarId>(initial.selectedCar);

  const [walletCash, setWalletCash] = useState<number>(initial.walletCash);
  const [unlockedCars, setUnlockedCars] = useState<PlayerCarId[]>(initial.unlockedCars);

  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(initial.timeOfDay);
  const timeOfDayRef = useRef<TimeOfDay>(initial.timeOfDay);

  const [isMuted, setIsMuted] = useState<boolean>(initial.isMuted);
  const [showFps, setShowFps] = useState<boolean>(initial.showFps);
  const showFpsRef = useRef<boolean>(initial.showFps);
  const [fps, setFps] = useState<number>(60);

  const [isHornActive, setIsHornActive] = useState<boolean>(false);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [isNewRecord, setIsNewRecord] = useState<boolean>(false);
  const [webglError, setWebglError] = useState<boolean>(false);
  const [callouts, setCallouts] = useState<CalloutNotice[]>([]);

  const [hud, setHud] = useState<GameHudSnapshot>(() => ({
    score: 0,
    bestScore: readStoredBestScore(),
    speedKmh: PLAYER_CARS.find((c) => c.id === initial.selectedCar)?.cruiseSpeedKmh ?? 104,
    gear: 3,
    distanceKm: 0,
    lives: MAX_LIVES,
    maxLives: MAX_LIVES,
    nitro: 65,
    isNitroActive: false,
    nearMissCount: 0,
    overtakenCount: 0,
    runCash: 0,
  }));

  const inputRef = useRef({
    accelerate: false,
    brake: false,
    nitro: false,
    steerLeft: false,
    steerRight: false,
  });

  const pointerSteerActiveRef = useRef<'left' | 'right' | null>(null);
  const settingsPayloadRef = useRef<PersistedSettings>(initial);
  const calloutTimersRef = useRef<Set<number>>(new Set());

  if (!engineRef.current) {
    const eng = new Highway3DEngine(readStoredBestScore());
    const initCar = PLAYER_CARS.find((c) => c.id === initial.selectedCar) ?? PLAYER_CARS[0];
    eng.setVehicleSpecs(
      initCar.cruiseSpeedKmh,
      initCar.maxSpeedKmh,
      initCar.nitroSpeedKmh,
      initCar.hitboxWidth,
      initCar.hitboxLength,
      Boolean(initCar.isMotorcycle)
    );
    eng.setSteeringSensitivity(initial.steeringSensitivity);
    engineRef.current = eng;
  }

  const t = TRANSLATIONS[language];
  const numberLocale = language === 'de' ? 'de-DE' : language === 'en' ? 'en-US' : 'ru-RU';

  // Persist user settings and progression (truly debounced so cash gains never stall gameplay frames)
  useEffect(() => {
    const payload: PersistedSettings = {
      language,
      selectedCar,
      cameraMode,
      timeOfDay,
      isMuted,
      showFps,
      graphicsQuality,
      steeringSensitivity,
      keyBindings,
      walletCash,
      unlockedCars,
    };
    settingsPayloadRef.current = payload;
    const timer = window.setTimeout(() => {
      writeStoredSettings(settingsPayloadRef.current);
    }, 450);
    return () => {
      window.clearTimeout(timer);
    };
  }, [
    language,
    selectedCar,
    cameraMode,
    timeOfDay,
    isMuted,
    showFps,
    graphicsQuality,
    steeringSensitivity,
    keyBindings,
    walletCash,
    unlockedCars,
  ]);

  useEffect(() => {
    const flush = () => writeStoredSettings(settingsPayloadRef.current);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  useEffect(() => {
    showFpsRef.current = showFps;
  }, [showFps]);

  useEffect(() => {
    engineRef.current?.setSteeringSensitivity(steeringSensitivity);
  }, [steeringSensitivity]);

  useEffect(() => {
    keyBindingsRef.current = keyBindings;
  }, [keyBindings]);

  useEffect(() => {
    listeningActionRef.current = listeningAction;
  }, [listeningAction]);

  useEffect(() => {
    document.title = t.appName;
    renderer3DRef.current?.applyLanguage(language);
  }, [language, t.appName]);

  useEffect(() => {
    graphicsQualityRef.current = graphicsQuality;
    renderer3DRef.current?.applyGraphicsQuality(graphicsQuality);
  }, [graphicsQuality]);

  useEffect(() => {
    soundEngine.setMuted(isMuted);
  }, [isMuted]);

  const syncGameState = useCallback((next: GameState) => {
    gameStateRef.current = next;
    setGameState(next);
  }, []);

  const setCameraModeDirect = useCallback((mode: CameraMode) => {
    cameraModeRef.current = mode;
    setCameraMode(mode);
  }, []);

  const toggleCameraMode = useCallback(() => {
    setCameraMode((prev) => {
      const next: CameraMode = prev === 'third' ? 'first' : 'third';
      cameraModeRef.current = next;
      soundEngine.playCameraSwitch();
      return next;
    });
  }, []);

  const setHornPressed = useCallback((pressed: boolean) => {
    engineRef.current?.setHorn(pressed);
    setIsHornActive(pressed);
  }, []);

  const startGame = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    pointerSteerActiveRef.current = null;
    inputRef.current.steerLeft = false;
    inputRef.current.steerRight = false;
    inputRef.current.accelerate = false;
    inputRef.current.brake = false;
    inputRef.current.nitro = false;
    setListeningAction(null);
    setPauseSubView('menu');
    engine.resetRun();
    setIsNewRecord(false);
    setCallouts([]);
    setHud(engine.getHudSnapshot());
    syncGameState('PLAYING');
    if (!soundEngine.isMuted()) {
      soundEngine.startEngine();
    }
  }, [syncGameState]);

  const togglePause = useCallback(() => {
    setListeningAction(null);
    if (gameStateRef.current === 'PLAYING') {
      engineRef.current?.setHorn(false);
      setIsHornActive(false);
      soundEngine.stopEngine();
      setPauseSubView('menu');
      syncGameState('PAUSED');
    } else if (gameStateRef.current === 'PAUSED') {
      setPauseSubView('menu');
      syncGameState('PLAYING');
      if (!soundEngine.isMuted()) {
        soundEngine.startEngine();
      }
    }
  }, [syncGameState]);

  const returnToMenu = useCallback(() => {
    setListeningAction(null);
    setPauseSubView('menu');
    setMenuTab('garage');
    engineRef.current?.setHorn(false);
    setIsHornActive(false);
    soundEngine.stopEngine();
    engineRef.current?.resetRun();
    if (engineRef.current) {
      setHud(engineRef.current.getHudSnapshot());
    }
    syncGameState('TITLE_MENU');
  }, [syncGameState]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      soundEngine.setMuted(next);
      if (!next && gameStateRef.current === 'PLAYING') {
        soundEngine.startEngine();
      }
      return next;
    });
  }, []);

  useEffect(() => {
    selectedCarRef.current = selectedCar;
    const opt = PLAYER_CARS.find((c) => c.id === selectedCar) ?? PLAYER_CARS[0];
    engineRef.current?.setVehicleSpecs(
      opt.cruiseSpeedKmh,
      opt.maxSpeedKmh,
      opt.nitroSpeedKmh,
      opt.hitboxWidth,
      opt.hitboxLength,
      Boolean(opt.isMotorcycle)
    );
    renderer3DRef.current?.applyCarStyle(selectedCar);
  }, [selectedCar]);

  const handleCarOptionClick = useCallback(
    (carId: PlayerCarId) => {
      if (unlockedCars.includes(carId)) {
        setSelectedCar(carId);
        return;
      }
      const car = PLAYER_CARS.find((c) => c.id === carId);
      if (!car) return;
      if (walletCash >= car.price) {
        setWalletCash((prev) => prev - car.price);
        setUnlockedCars((prev) => (prev.includes(carId) ? prev : [...prev, carId]));
        setSelectedCar(carId);
        soundEngine.playPickup();
      }
    },
    [unlockedCars, walletCash]
  );

  useEffect(() => {
    timeOfDayRef.current = timeOfDay;
    renderer3DRef.current?.applyAtmosphere(timeOfDay);
  }, [timeOfDay]);

  // Subscribe to floating callout events
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const timers = calloutTimersRef.current;
    const unsub = engine.onCallout((notice) => {
      setCallouts((prev) => [...prev.slice(-2), notice]);
      const id = window.setTimeout(() => {
        timers.delete(id);
        setCallouts((prev) => prev.filter((item) => item.id !== notice.id));
      }, 1150);
      timers.add(id);
    });
    return () => {
      unsub();
      for (const id of timers) {
        window.clearTimeout(id);
      }
      timers.clear();
    };
  }, []);

  // Keyboard Controls (dynamic custom keybindings using physical e.code)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.code;

      // Key rebinding capture mode
      const activeListen = listeningActionRef.current;
      if (activeListen) {
        e.preventDefault();
        if (code === 'Escape') {
          setListeningAction(null);
          return;
        }
        setKeyBindings((prev) => {
          const updated: KeyBindings = { ...prev };
          for (const action of CONTROL_ACTIONS_ORDER) {
            updated[action] = prev[action].filter((c) => c !== code);
          }
          updated[activeListen] = [code];
          return updated;
        });
        setListeningAction(null);
        return;
      }

      const kb = keyBindingsRef.current;
      const matches = (action: ControlAction) => kb[action].includes(code);

      if (matches('steerLeft')) {
        e.preventDefault();
        inputRef.current.steerLeft = true;
      }
      if (matches('steerRight')) {
        e.preventDefault();
        inputRef.current.steerRight = true;
      }
      if (matches('accelerate')) {
        e.preventDefault();
        inputRef.current.accelerate = true;
      }
      if (matches('brake')) {
        e.preventDefault();
        inputRef.current.brake = true;
      }
      if (matches('horn')) {
        e.preventDefault();
        if (!e.repeat) {
          setHornPressed(true);
        }
      }
      if (matches('camera')) {
        e.preventDefault();
        if (!e.repeat) {
          toggleCameraMode();
        }
      }
      if (matches('nitro')) {
        e.preventDefault();
        if (gameStateRef.current === 'GAME_OVER') {
          if (!e.repeat) startGame();
        } else if (gameStateRef.current === 'PLAYING') {
          inputRef.current.nitro = true;
        }
      }

      if (code === 'Enter') {
        if (gameStateRef.current === 'TITLE_MENU' || gameStateRef.current === 'GAME_OVER') {
          startGame();
        } else if (gameStateRef.current === 'PAUSED') {
          togglePause();
        }
      } else if (code === 'KeyP' || code === 'Escape') {
        if (gameStateRef.current === 'PLAYING' || gameStateRef.current === 'PAUSED') {
          togglePause();
        }
      } else if (code === 'KeyM') {
        if (!e.repeat) toggleMute();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      const kb = keyBindingsRef.current;
      if (kb.steerLeft.includes(code)) {
        inputRef.current.steerLeft = false;
      }
      if (kb.steerRight.includes(code)) {
        inputRef.current.steerRight = false;
      }
      if (kb.accelerate.includes(code)) {
        inputRef.current.accelerate = false;
      }
      if (kb.brake.includes(code)) {
        inputRef.current.brake = false;
      }
      if (kb.nitro.includes(code)) {
        inputRef.current.nitro = false;
      }
      if (kb.horn.includes(code)) {
        setHornPressed(false);
      }
    };

    const handleBlur = () => {
      pointerSteerActiveRef.current = null;
      inputRef.current.accelerate = false;
      inputRef.current.brake = false;
      inputRef.current.nitro = false;
      inputRef.current.steerLeft = false;
      inputRef.current.steerRight = false;
      setHornPressed(false);
      setListeningAction(null);
      if (gameStateRef.current === 'PLAYING') {
        soundEngine.stopEngine();
        syncGameState('PAUSED');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      soundEngine.stopEngine();
      soundEngine.stopHorn();
    };
  }, [setHornPressed, startGame, syncGameState, toggleCameraMode, toggleMute, togglePause]);

  // Mount Three.js 3D Scene once
  useEffect(() => {
    const container = mountRef.current;
    const engine = engineRef.current;
    if (!container || !engine) return;

    let scene3D: Highway3DRenderer;
    try {
      scene3D = new Highway3DRenderer(container);
      renderer3DRef.current = scene3D;
      scene3D.applyLanguage(language);
      scene3D.applyGraphicsQuality(graphicsQualityRef.current);
      scene3D.applyCarStyle(selectedCarRef.current);
      scene3D.applyAtmosphere(timeOfDayRef.current);
    } catch {
      setWebglError(true);
      return;
    }

    const canvasEl = container.querySelector('canvas');
    const onContextLost = (ev: Event) => {
      ev.preventDefault();
      setWebglError(true);
    };
    const onContextRestored = () => {
      setWebglError(false);
    };
    canvasEl?.addEventListener('webglcontextlost', onContextLost);
    canvasEl?.addEventListener('webglcontextrestored', onContextRestored);

    const handleResize = () => {
      scene3D.resize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    let hudSyncAccum = 0;
    scene3D.syncAndRender(engine, 0.016, cameraModeRef.current, false, true);

    scene3D.startLoop(
      (dt) => {
        const currentState = gameStateRef.current;
        if (currentState === 'TITLE_MENU') {
          engine.updateAmbient(dt);
        } else if (currentState === 'PLAYING') {
          const result = engine.update(dt, inputRef.current);
          if (result.cashDelta > 0) {
            setWalletCash((prev) => prev + result.cashDelta);
          }
          if (result.newBest) {
            setIsNewRecord(true);
            writeStoredBestScore(engine.bestScore);
          }
          if (result.crashedOut) {
            pointerSteerActiveRef.current = null;
            inputRef.current.steerLeft = false;
            inputRef.current.steerRight = false;
            inputRef.current.accelerate = false;
            inputRef.current.brake = false;
            inputRef.current.nitro = false;
            engine.setHorn(false);
            setIsHornActive(false);
            soundEngine.stopEngine();
            setHud(engine.getHudSnapshot());
            syncGameState('GAME_OVER');
          } else {
            hudSyncAccum += dt;
            if (hudSyncAccum >= 0.08) {
              hudSyncAccum = 0;
              setHud(engine.getHudSnapshot());
            }
          }
        }

        scene3D.syncAndRender(
          engine,
          dt,
          cameraModeRef.current,
          inputRef.current.brake && currentState === 'PLAYING'
        );
      },
      (nextFps) => {
        if (showFpsRef.current) {
          setFps((prev) => (prev === nextFps ? prev : nextFps));
        }
      }
    );

    return () => {
      window.removeEventListener('resize', handleResize);
      canvasEl?.removeEventListener('webglcontextlost', onContextLost);
      canvasEl?.removeEventListener('webglcontextrestored', onContextRestored);
      scene3D.dispose();
      renderer3DRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncGameState]);

  // Continuous pointer hold steering on left/right side of 3D viewport
  const updateViewportSteerFromX = (clientX: number) => {
    const w = window.innerWidth;
    if (clientX < w * 0.45) {
      pointerSteerActiveRef.current = 'left';
      inputRef.current.steerLeft = true;
      inputRef.current.steerRight = false;
    } else if (clientX > w * 0.55) {
      pointerSteerActiveRef.current = 'right';
      inputRef.current.steerRight = true;
      inputRef.current.steerLeft = false;
    } else {
      pointerSteerActiveRef.current = null;
      inputRef.current.steerLeft = false;
      inputRef.current.steerRight = false;
    }
  };

  const handleViewportPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (gameStateRef.current !== 'PLAYING') return;
    updateViewportSteerFromX(e.clientX);
  };

  const handleViewportPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (gameStateRef.current !== 'PLAYING' || !pointerSteerActiveRef.current) return;
    updateViewportSteerFromX(e.clientX);
  };

  const handleViewportPointerUp = () => {
    if (pointerSteerActiveRef.current === 'left') {
      inputRef.current.steerLeft = false;
    } else if (pointerSteerActiveRef.current === 'right') {
      inputRef.current.steerRight = false;
    }
    pointerSteerActiveRef.current = null;
  };

  const nitroPercent = Math.max(0, Math.min(100, hud.nitro));
  const hornKeyBadge = formatKeyCode(keyBindings.horn[0] ?? 'KeyH', language);
  const cameraKeyBadge = formatKeyCode(keyBindings.camera[0] ?? 'KeyC', language);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#090D16] text-[#F1F5F9] select-none">
      {/* Isolated Full-Viewport WebGL Mount */}
      <div
        ref={mountRef}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={handleViewportPointerUp}
        onPointerLeave={handleViewportPointerUp}
        onPointerCancel={handleViewportPointerUp}
        className="absolute inset-0 cursor-pointer"
      />

      {/* WebGL Fallback */}
      {webglError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#0D1017] p-6">
          <div className="max-w-md rounded-2xl border border-white/10 bg-[#151A24] p-6 text-center space-y-3">
            <h2 className="font-display text-2xl font-bold text-white">
              {t.webglUnavailableTitle}
            </h2>
            <p className="text-sm text-slate-300">{t.webglUnavailableBody}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold cursor-pointer"
            >
              {t.reloadBtn}
            </button>
          </div>
        </div>
      )}

      {/* Top Compact HUD Strip (Zero Obstruction of 3D Center) */}
      <header className="pointer-events-none absolute top-3 inset-x-3 sm:inset-x-6 z-20 flex justify-center">
        <div className="pointer-events-auto w-full max-w-[960px] flex items-center justify-between gap-3 sm:gap-5 px-3.5 sm:px-5 py-2.5 rounded-2xl bg-[#0E121B]/88 border border-white/10 shadow-xl">
          {/* Brand + Active Camera */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="font-display text-lg sm:text-xl font-extrabold text-white whitespace-nowrap">
              {t.appName}
            </span>
            <span className="hidden sm:inline text-slate-600">·</span>
            <button
              type="button"
              onClick={toggleCameraMode}
              title={`${t.settingCamera} (${cameraKeyBadge})`}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1A202E] hover:bg-[#232B3D] border border-white/10 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Camera className="w-3.5 h-3.5 text-amber-400" />
              <span>{cameraMode === 'first' ? t.cameraFirst : t.cameraThird}</span>
            </button>
          </div>

          {/* Core Metrics */}
          <div className="flex items-center gap-3.5 sm:gap-6 min-w-0">
            <div>
              <div className="text-[10px] sm:text-[11px] text-slate-400 leading-none">
                {t.hudScore}
              </div>
              <div className="font-mono-tabular text-sm sm:text-lg font-bold text-white leading-tight">
                {hud.score.toLocaleString(numberLocale)}
              </div>
            </div>

            <div className="hidden md:block">
              <div className="text-[11px] text-slate-400 leading-none">{t.hudBest}</div>
              <div className="font-mono-tabular text-lg font-bold text-amber-400 leading-tight">
                {hud.bestScore.toLocaleString(numberLocale)}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1 text-[10px] sm:text-[11px] text-slate-400 leading-none">
                <Gauge className="w-3 h-3 text-amber-400 hidden sm:inline" />
                <span>{t.hudSpeed}</span>
              </div>
              <div className="font-mono-tabular text-sm sm:text-lg font-bold text-amber-400 leading-tight flex items-baseline gap-1.5">
                <span>
                  {hud.speedKmh}{' '}
                  <span className="text-[10px] sm:text-xs font-normal text-slate-400">
                    {t.hudUnitKmh}
                  </span>
                </span>
                <span className="text-[11px] font-semibold text-sky-300/90">
                  M{hud.gear}
                </span>
              </div>
            </div>

            <div className="hidden sm:block">
              <div className="text-[11px] text-slate-400 leading-none">{t.hudDistance}</div>
              <div className="font-mono-tabular text-base font-semibold text-slate-100 leading-tight">
                {hud.distanceKm.toFixed(2)}{' '}
                <span className="text-xs font-normal text-slate-400">{t.hudUnitKm}</span>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1 text-[10px] sm:text-[11px] text-slate-400 leading-none">
                <Coins className="w-3 h-3 text-emerald-400 hidden sm:inline" />
                <span>{t.hudCash}</span>
              </div>
              <div className="font-mono-tabular text-sm sm:text-base font-bold text-emerald-400 leading-tight">
                ${walletCash.toLocaleString(numberLocale)}
              </div>
            </div>
          </div>

          {/* Lives + Nitro */}
          <div className="flex items-center gap-3 shrink-0">
            <div
              className="flex items-center gap-1"
              aria-label={t.hudLivesAria(hud.lives, hud.maxLives)}
            >
              {Array.from({ length: hud.maxLives }).map((_, i) => (
                <Shield
                  key={i}
                  className={`w-4 h-4 ${
                    i < hud.lives ? 'text-emerald-400 fill-emerald-400/20' : 'text-slate-600'
                  }`}
                />
              ))}
              <span className="hidden md:inline font-mono-tabular text-xs text-slate-300 ml-1">
                {hud.lives}/{hud.maxLives}
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-sky-400" />
              <div className="w-16 h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-75 ${
                    hud.isNitroActive ? 'bg-sky-300' : 'bg-sky-500'
                  }`}
                  style={{ width: `${nitroPercent}%` }}
                />
              </div>
              <span className="font-mono-tabular text-xs text-sky-400 w-8 text-right">
                {nitroPercent}%
              </span>
            </div>

            {showFps && (
              <div className="px-2 py-0.5 rounded-md bg-[#171C28] border border-white/10 font-mono-tabular text-[11px] font-bold text-emerald-400 whitespace-nowrap shrink-0">
                {fps} {t.hudFps}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Floating Event Callouts */}
      {callouts.length > 0 && gameState === 'PLAYING' && (
        <div className="pointer-events-none absolute top-20 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1">
          {callouts.map((c) => {
            const colorClass =
              c.tone === 'amber'
                ? 'text-amber-300 border-amber-400/30'
                : c.tone === 'sky'
                ? 'text-sky-300 border-sky-400/30'
                : c.tone === 'emerald'
                ? 'text-emerald-300 border-emerald-400/30'
                : 'text-red-300 border-red-400/30';
            return (
              <div
                key={c.id}
                className={`px-3 py-1 rounded-lg bg-[#0E121B]/90 border text-xs sm:text-sm font-display font-bold shadow-lg ${colorClass}`}
              >
                {getCalloutLabel(c.key, t)}
              </div>
            );
          })}
        </div>
      )}

      {/* TITLE MENU OVERLAY WITH GARAGE & SETTINGS TABS */}
      {gameState === 'TITLE_MENU' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-[#090D16]/65">
          <div className="w-full max-w-lg max-h-[86vh] flex flex-col rounded-2xl bg-[#121620] border border-white/10 p-5 sm:p-6 shadow-2xl">
            {/* Header + Tabs */}
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-white/10 shrink-0">
              <div>
                <div className="text-xs font-medium text-amber-400">{t.subtitle}</div>
                <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white mt-0.5 tracking-tight">
                  {t.appName}
                </h1>
              </div>

              <div className="grid grid-cols-2 gap-1 p-1 bg-[#171C28] border border-white/10 rounded-xl shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setListeningAction(null);
                    setMenuTab('garage');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    menuTab === 'garage' ? 'bg-[#262E40] text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Car className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t.tabGarage}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMenuTab('settings')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    menuTab === 'settings' ? 'bg-[#262E40] text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5 text-sky-400" />
                  <span>{t.tabSettings}</span>
                </button>
              </div>
            </div>

            {/* Tab Body */}
            <div className="flex-1 overflow-y-auto py-4 pr-0.5 space-y-4">
              {menuTab === 'garage' ? (
                <>
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-medium text-slate-400">{t.garageTitle}</span>
                      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#171C28] border border-emerald-400/30 text-xs font-mono-tabular font-bold text-emerald-400">
                        <Coins className="w-3.5 h-3.5" />
                        <span>
                          {t.garageBalance}: ${walletCash.toLocaleString(numberLocale)}
                        </span>
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {PLAYER_CARS.map((car) => {
                        const isUnlocked = unlockedCars.includes(car.id);
                        const active = car.id === selectedCar;
                        const canAfford = walletCash >= car.price;
                        const loc = t.vehicles[car.id];
                        return (
                          <button
                            key={car.id}
                            type="button"
                            onClick={() => handleCarOptionClick(car.id)}
                            title={
                              !isUnlocked && !canAfford ? t.notEnoughCash : undefined
                            }
                            className={`flex items-center gap-2 px-2.5 py-2.5 rounded-xl border text-left transition-colors ${
                              active
                                ? 'bg-[#202636] border-amber-400/75 text-white cursor-pointer'
                                : isUnlocked
                                ? 'bg-[#171C28] border-white/10 text-slate-200 hover:bg-[#1E2434] cursor-pointer'
                                : canAfford
                                ? 'bg-[#15221E] border-emerald-400/45 text-slate-100 hover:bg-[#192B25] cursor-pointer'
                                : 'bg-[#131722] border-white/5 text-slate-400 opacity-75 cursor-not-allowed'
                            }`}
                          >
                            <span
                              className="w-3.5 h-6 rounded-sm shrink-0 border border-white/20"
                              style={{ backgroundColor: car.bodyColor }}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs sm:text-sm font-semibold truncate">
                                {loc.name}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate">
                                {loc.tag} · {car.maxSpeedKmh} {t.hudUnitKmh}
                              </div>
                            </div>
                            {active ? (
                              <Check className="w-4 h-4 text-amber-400 shrink-0" />
                            ) : isUnlocked ? (
                              <span className="text-[10px] font-medium text-slate-400 shrink-0">
                                {t.ownedLabel}
                              </span>
                            ) : (
                              <span
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono-tabular font-bold shrink-0 ${
                                  canAfford
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                                    : 'bg-slate-800/80 text-slate-400'
                                }`}
                              >
                                {!canAfford && <Lock className="w-2.5 h-2.5" />}
                                <span>${car.price.toLocaleString(numberLocale)}</span>
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {hud.bestScore > 0 && (
                    <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#171C28] border border-white/10 text-sm">
                      <span className="text-slate-400">{t.bestScoreLabel}</span>
                      <span className="font-mono-tabular font-bold text-amber-400">
                        {hud.bestScore.toLocaleString(numberLocale)}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <SettingsPanel
                  t={t}
                  language={language}
                  setLanguage={setLanguage}
                  graphicsQuality={graphicsQuality}
                  setGraphicsQuality={setGraphicsQuality}
                  cameraMode={cameraMode}
                  setCameraModeDirect={setCameraModeDirect}
                  timeOfDay={timeOfDay}
                  setTimeOfDay={setTimeOfDay}
                  isMuted={isMuted}
                  toggleMute={toggleMute}
                  showFps={showFps}
                  setShowFps={setShowFps}
                  steeringSensitivity={steeringSensitivity}
                  setSteeringSensitivity={setSteeringSensitivity}
                  keyBindings={keyBindings}
                  setKeyBindings={setKeyBindings}
                  listeningAction={listeningAction}
                  setListeningAction={setListeningAction}
                />
              )}
            </div>

            {/* Footer CTA */}
            <div className="pt-3 border-t border-white/10 space-y-2.5 shrink-0">
              <button
                type="button"
                onClick={startGame}
                className="w-full py-3.5 px-6 rounded-xl bg-red-600 hover:bg-red-500 active:scale-[0.99] text-white font-display font-bold text-base tracking-wide transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-950/50 cursor-pointer"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>{t.startDrive}</span>
              </button>
              <div className="text-center text-[11px] text-slate-400 leading-relaxed">
                {formatControlsHint(keyBindings, language)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PAUSE OVERLAY WITH INLINE SETTINGS */}
      {gameState === 'PAUSED' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-[#090D16]/65">
          {pauseSubView === 'menu' ? (
            <div className="w-full max-w-xs rounded-2xl bg-[#121620] border border-white/10 p-6 text-center space-y-5 shadow-2xl">
              <div>
                <h2 className="font-display text-2xl font-bold text-white">{t.pauseTitle}</h2>
                <p className="text-sm text-slate-400 mt-1">
                  {t.hudScore}:{' '}
                  <span className="font-mono-tabular text-white font-semibold">
                    {hud.score.toLocaleString(numberLocale)}
                  </span>
                </p>
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={togglePause}
                  className="w-full py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>{t.resumeDrive}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPauseSubView('settings')}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#1E2432] hover:bg-[#283044] text-slate-200 font-medium text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Settings className="w-4 h-4 text-sky-400" />
                  <span>{t.tabSettings}</span>
                </button>
                <button
                  type="button"
                  onClick={startGame}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#1E2432] hover:bg-[#283044] text-slate-200 font-medium text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{t.restartDrive}</span>
                </button>
                <button
                  type="button"
                  onClick={returnToMenu}
                  className="w-full py-2 px-4 rounded-xl text-slate-400 hover:text-white font-medium text-sm transition-colors cursor-pointer"
                >
                  {t.backToMenu}
                </button>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-lg max-h-[86vh] flex flex-col rounded-2xl bg-[#121620] border border-white/10 p-5 sm:p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
                <h2 className="font-display text-xl font-bold text-white">{t.settingsTitle}</h2>
                <button
                  type="button"
                  onClick={() => {
                    setListeningAction(null);
                    setPauseSubView('menu');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#1E2432] hover:bg-[#283044] text-xs font-semibold text-slate-200 cursor-pointer"
                >
                  {t.backToPause}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto py-4 pr-0.5">
                <SettingsPanel
                  t={t}
                  language={language}
                  setLanguage={setLanguage}
                  graphicsQuality={graphicsQuality}
                  setGraphicsQuality={setGraphicsQuality}
                  cameraMode={cameraMode}
                  setCameraModeDirect={setCameraModeDirect}
                  timeOfDay={timeOfDay}
                  setTimeOfDay={setTimeOfDay}
                  isMuted={isMuted}
                  toggleMute={toggleMute}
                  showFps={showFps}
                  setShowFps={setShowFps}
                  steeringSensitivity={steeringSensitivity}
                  setSteeringSensitivity={setSteeringSensitivity}
                  keyBindings={keyBindings}
                  setKeyBindings={setKeyBindings}
                  listeningAction={listeningAction}
                  setListeningAction={setListeningAction}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* GAME OVER OVERLAY */}
      {gameState === 'GAME_OVER' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-[#090D16]/70">
          <div className="w-full max-w-sm rounded-2xl bg-[#121620] border border-white/10 p-6 space-y-5 shadow-2xl">
            <div className="text-center">
              {isNewRecord && (
                <div className="text-xs font-semibold text-amber-400 mb-1">
                  {t.newRecordBadge}
                </div>
              )}
              <h2 className="font-display text-3xl font-extrabold text-white">
                {t.gameOverTitle}
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-xl bg-[#1A1F2C] border border-white/5">
                <div className="text-xs text-slate-400">{t.hudScore}</div>
                <div className="font-mono-tabular text-xl font-bold text-white mt-0.5">
                  {hud.score.toLocaleString(numberLocale)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#1A1F2C] border border-white/5">
                <div className="text-xs text-slate-400">{t.hudBest}</div>
                <div className="font-mono-tabular text-xl font-bold text-amber-400 mt-0.5">
                  {hud.bestScore.toLocaleString(numberLocale)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#1A1F2C] border border-white/5">
                <div className="text-xs text-slate-400">{t.hudDistance}</div>
                <div className="font-mono-tabular text-base font-semibold text-slate-100 mt-0.5">
                  {hud.distanceKm.toFixed(2)} {t.hudUnitKm}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#1A1F2C] border border-white/5">
                <div className="text-xs text-slate-400">{t.overtakenRisk}</div>
                <div className="font-mono-tabular text-base font-semibold text-slate-100 mt-0.5">
                  {hud.overtakenCount} / {hud.nearMissCount}
                </div>
              </div>
              <div className="col-span-2 flex items-center justify-between p-3 rounded-xl bg-[#16221E] border border-emerald-400/25">
                <div>
                  <div className="text-xs text-emerald-300/80">{t.runEarned}</div>
                  <div className="font-mono-tabular text-lg font-bold text-emerald-400">
                    +${hud.runCash.toLocaleString(numberLocale)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">{t.garageBalance}</div>
                  <div className="font-mono-tabular text-base font-semibold text-white">
                    ${walletCash.toLocaleString(numberLocale)}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={startGame}
                className="w-full py-3.5 px-5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-display font-bold text-base flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{t.playAgain}</span>
              </button>
              <button
                type="button"
                onClick={returnToMenu}
                className="w-full py-2.5 px-4 rounded-xl bg-[#1E2432] hover:bg-[#283044] text-slate-200 font-medium text-sm transition-colors cursor-pointer"
              >
                {t.chooseVehicle}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collapsible Unified Bottom Control Dock */}
      <div className="pointer-events-none fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center max-w-[94vw]">
        <button
          type="button"
          onClick={() => setDockCollapsed((v) => !v)}
          className="pointer-events-auto mb-1.5 px-3 py-1 rounded-lg bg-[#0E121B]/90 border border-white/10 text-[11px] font-medium text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
        >
          {dockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>{dockCollapsed ? t.dockShow : t.dockHide}</span>
        </button>

        {!dockCollapsed && (
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 px-3 py-2.5 rounded-2xl bg-[#0E121B]/92 border border-white/10 shadow-2xl">
            {/* Lane & Speed Controls */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onPointerDown={() => {
                  inputRef.current.steerLeft = true;
                }}
                onPointerUp={() => {
                  inputRef.current.steerLeft = false;
                }}
                onPointerLeave={() => {
                  inputRef.current.steerLeft = false;
                }}
                onPointerCancel={() => {
                  inputRef.current.steerLeft = false;
                }}
                aria-label={t.dockLeft}
                className="h-11 w-11 rounded-xl bg-[#191F2C] hover:bg-[#232B3D] active:bg-[#2D374E] border border-white/10 flex items-center justify-center text-white cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <button
                type="button"
                onPointerDown={() => {
                  inputRef.current.brake = true;
                }}
                onPointerUp={() => {
                  inputRef.current.brake = false;
                }}
                onPointerLeave={() => {
                  inputRef.current.brake = false;
                }}
                onPointerCancel={() => {
                  inputRef.current.brake = false;
                }}
                className="h-11 px-3 rounded-xl bg-[#191F2C] hover:bg-[#232B3D] active:bg-red-900/60 border border-white/10 text-xs font-semibold text-slate-200 cursor-pointer whitespace-nowrap"
              >
                {t.dockBrake}
              </button>

              <button
                type="button"
                onPointerDown={() => {
                  inputRef.current.nitro = true;
                }}
                onPointerUp={() => {
                  inputRef.current.nitro = false;
                }}
                onPointerLeave={() => {
                  inputRef.current.nitro = false;
                }}
                onPointerCancel={() => {
                  inputRef.current.nitro = false;
                }}
                className="h-11 px-3 rounded-xl bg-sky-600/90 hover:bg-sky-500 active:bg-sky-400 border border-sky-400/30 flex items-center gap-1.5 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
              >
                <Flame className="w-4 h-4" />
                <span>{t.dockNitro}</span>
              </button>

              <button
                type="button"
                onPointerDown={() => {
                  inputRef.current.accelerate = true;
                }}
                onPointerUp={() => {
                  inputRef.current.accelerate = false;
                }}
                onPointerLeave={() => {
                  inputRef.current.accelerate = false;
                }}
                onPointerCancel={() => {
                  inputRef.current.accelerate = false;
                }}
                className="h-11 px-3 rounded-xl bg-[#191F2C] hover:bg-[#232B3D] active:bg-emerald-900/60 border border-white/10 text-xs font-semibold text-slate-200 cursor-pointer whitespace-nowrap"
              >
                {t.dockGas}
              </button>

              <button
                type="button"
                onPointerDown={() => {
                  inputRef.current.steerRight = true;
                }}
                onPointerUp={() => {
                  inputRef.current.steerRight = false;
                }}
                onPointerLeave={() => {
                  inputRef.current.steerRight = false;
                }}
                onPointerCancel={() => {
                  inputRef.current.steerRight = false;
                }}
                aria-label={t.dockRight}
                className="h-11 w-11 rounded-xl bg-[#191F2C] hover:bg-[#232B3D] active:bg-[#2D374E] border border-white/10 flex items-center justify-center text-white cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <div className="hidden sm:block h-7 w-px bg-white/10" />

            {/* Horn, Camera Switch, Lighting, Audio, Pause/Settings */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onPointerDown={() => setHornPressed(true)}
                onPointerUp={() => setHornPressed(false)}
                onPointerLeave={() => setHornPressed(false)}
                onPointerCancel={() => setHornPressed(false)}
                className={`h-11 px-3.5 rounded-xl border flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  isHornActive
                    ? 'bg-amber-500 text-slate-950 border-amber-300'
                    : 'bg-[#191F2C] hover:bg-[#232B3D] text-amber-300 border-white/10'
                }`}
              >
                <Megaphone className="w-4 h-4" />
                <span>
                  {t.controlActions.horn} ({hornKeyBadge})
                </span>
              </button>

              <button
                type="button"
                onClick={toggleCameraMode}
                className="h-11 px-3.5 rounded-xl bg-[#191F2C] hover:bg-[#232B3D] border border-white/10 flex items-center gap-1.5 text-xs font-semibold text-slate-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Camera className="w-4 h-4 text-sky-400" />
                <span>
                  {cameraMode === 'first' ? t.cameraFirst : t.cameraThird} ({cameraKeyBadge})
                </span>
              </button>

              <button
                type="button"
                onClick={() => setTimeOfDay((tod) => (tod === 'night' ? 'day' : 'night'))}
                aria-label={timeOfDay === 'night' ? t.dockLightTooltipDay : t.dockLightTooltipNight}
                title={timeOfDay === 'night' ? t.dockLightTooltipDay : t.dockLightTooltipNight}
                className="h-11 w-11 rounded-xl bg-[#191F2C] hover:bg-[#232B3D] border border-white/10 flex items-center justify-center text-slate-200 cursor-pointer"
              >
                {timeOfDay === 'night' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={toggleMute}
                aria-label={isMuted ? t.dockSoundOn : t.dockSoundOff}
                title={t.settingSound}
                className="h-11 w-11 rounded-xl bg-[#191F2C] hover:bg-[#232B3D] border border-white/10 flex items-center justify-center text-slate-200 cursor-pointer"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              {(gameState === 'PLAYING' || gameState === 'PAUSED') && (
                <button
                  type="button"
                  onClick={togglePause}
                  aria-label={gameState === 'PAUSED' ? t.dockResume : t.dockPause}
                  title={`${t.dockPause} (P)`}
                  className="h-11 w-11 rounded-xl bg-[#191F2C] hover:bg-[#232B3D] border border-white/10 flex items-center justify-center text-slate-200 cursor-pointer"
                >
                  {gameState === 'PAUSED' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
