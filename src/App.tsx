import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Flame,
  Gauge,
  Megaphone,
  Moon,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Sun,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { Highway3DEngine } from './game/engine';
import { soundEngine } from './game/sound';
import { Highway3DRenderer } from './game/threeScene';
import {
  CalloutNotice,
  CameraMode,
  GameHudSnapshot,
  GameState,
  MAX_LIVES,
  PLAYER_CARS,
  PlayerCarId,
  TimeOfDay,
} from './game/types';

const BEST_SCORE_STORAGE_KEY = 'trassa3_3d_best_score_v1';

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

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const renderer3DRef = useRef<Highway3DRenderer | null>(null);
  const engineRef = useRef<Highway3DEngine | null>(null);

  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const gameStateRef = useRef<GameState>('TITLE_MENU');

  const [cameraMode, setCameraMode] = useState<CameraMode>('third');
  const cameraModeRef = useRef<CameraMode>('third');

  const [selectedCar, setSelectedCar] = useState<PlayerCarId>('crimson');
  const selectedCarRef = useRef<PlayerCarId>('crimson');

  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('night');
  const timeOfDayRef = useRef<TimeOfDay>('night');

  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isHornActive, setIsHornActive] = useState<boolean>(false);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [isNewRecord, setIsNewRecord] = useState<boolean>(false);
  const [webglError, setWebglError] = useState<boolean>(false);
  const [callouts, setCallouts] = useState<CalloutNotice[]>([]);

  const [hud, setHud] = useState<GameHudSnapshot>(() => ({
    score: 0,
    bestScore: readStoredBestScore(),
    speedKmh: 124,
    gear: 3,
    distanceKm: 0,
    lives: MAX_LIVES,
    maxLives: MAX_LIVES,
    nitro: 65,
    isNitroActive: false,
    nearMissCount: 0,
    overtakenCount: 0,
  }));

  const inputRef = useRef({
    accelerate: false,
    brake: false,
    nitro: false,
    steerLeft: false,
    steerRight: false,
  });

  const pointerSteerActiveRef = useRef<'left' | 'right' | null>(null);

  if (!engineRef.current) {
    engineRef.current = new Highway3DEngine(readStoredBestScore());
  }

  const syncGameState = useCallback((next: GameState) => {
    gameStateRef.current = next;
    setGameState(next);
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
    if (gameStateRef.current === 'PLAYING') {
      engineRef.current?.setHorn(false);
      setIsHornActive(false);
      soundEngine.stopEngine();
      syncGameState('PAUSED');
    } else if (gameStateRef.current === 'PAUSED') {
      syncGameState('PLAYING');
      if (!soundEngine.isMuted()) {
        soundEngine.startEngine();
      }
    }
  }, [syncGameState]);

  const returnToMenu = useCallback(() => {
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
    renderer3DRef.current?.applyCarStyle(selectedCar);
  }, [selectedCar]);

  useEffect(() => {
    timeOfDayRef.current = timeOfDay;
    renderer3DRef.current?.applyAtmosphere(timeOfDay);
  }, [timeOfDay]);

  // Subscribe to floating callout events
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    return engine.onCallout((notice) => {
      setCallouts((prev) => [...prev.slice(-2), notice]);
      window.setTimeout(() => {
        setCallouts((prev) => prev.filter((item) => item.id !== notice.id));
      }, 1150);
    });
  }, []);

  // Keyboard Controls (using physical e.code so EN and RU layouts both work!)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.code;

      if (code === 'ArrowLeft' || code === 'KeyA') {
        e.preventDefault();
        inputRef.current.steerLeft = true;
      } else if (code === 'ArrowRight' || code === 'KeyD') {
        e.preventDefault();
        inputRef.current.steerRight = true;
      } else if (code === 'ArrowUp' || code === 'KeyW') {
        e.preventDefault();
        inputRef.current.accelerate = true;
      } else if (code === 'ArrowDown' || code === 'KeyS') {
        e.preventDefault();
        inputRef.current.brake = true;
      } else if (code === 'KeyH') {
        e.preventDefault();
        if (!e.repeat) {
          setHornPressed(true);
        }
      } else if (code === 'KeyC') {
        e.preventDefault();
        if (!e.repeat) {
          toggleCameraMode();
        }
      } else if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') {
        e.preventDefault();
        if (gameStateRef.current === 'TITLE_MENU' || gameStateRef.current === 'GAME_OVER') {
          if (!e.repeat) startGame();
        } else {
          inputRef.current.nitro = true;
        }
      } else if (code === 'Enter') {
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
      if (code === 'ArrowLeft' || code === 'KeyA') {
        inputRef.current.steerLeft = false;
      } else if (code === 'ArrowRight' || code === 'KeyD') {
        inputRef.current.steerRight = false;
      } else if (code === 'ArrowUp' || code === 'KeyW') {
        inputRef.current.accelerate = false;
      } else if (code === 'ArrowDown' || code === 'KeyS') {
        inputRef.current.brake = false;
      } else if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') {
        inputRef.current.nitro = false;
      } else if (code === 'KeyH') {
        setHornPressed(false);
      }
    };

    const handleBlur = () => {
      inputRef.current.accelerate = false;
      inputRef.current.brake = false;
      inputRef.current.nitro = false;
      inputRef.current.steerLeft = false;
      inputRef.current.steerRight = false;
      setHornPressed(false);
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

    scene3D.startLoop((dt) => {
      const currentState = gameStateRef.current;
      if (currentState === 'TITLE_MENU') {
        engine.updateAmbient(dt);
      } else if (currentState === 'PLAYING') {
        const result = engine.update(dt, inputRef.current);
        if (result.newBest) {
          setIsNewRecord(true);
          writeStoredBestScore(engine.bestScore);
        }
        if (result.crashedOut) {
          engine.setHorn(false);
          setIsHornActive(false);
          soundEngine.stopEngine();
          setHud(engine.getHudSnapshot());
          syncGameState('GAME_OVER');
        } else {
          hudSyncAccum += dt;
          if (hudSyncAccum >= 0.06) {
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
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      canvasEl?.removeEventListener('webglcontextlost', onContextLost);
      canvasEl?.removeEventListener('webglcontextrestored', onContextRestored);
      scene3D.dispose();
      renderer3DRef.current = null;
    };
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
              3D-графика недоступна
            </h2>
            <p className="text-sm text-slate-300">
              Браузер не смог инициализировать WebGL. Попробуйте обновить страницу или включить аппаратное ускорение.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold cursor-pointer"
            >
              Перезагрузить
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
              Трасса 3
            </span>
            <span className="hidden sm:inline text-slate-600">·</span>
            <button
              type="button"
              onClick={toggleCameraMode}
              title="Переключить камеру (C)"
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1A202E] hover:bg-[#232B3D] border border-white/10 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Camera className="w-3.5 h-3.5 text-amber-400" />
              <span>{cameraMode === 'first' ? '1-е лицо' : 'Сзади'}</span>
            </button>
          </div>

          {/* Core Metrics */}
          <div className="flex items-center gap-3.5 sm:gap-6 min-w-0">
            <div>
              <div className="text-[10px] sm:text-[11px] text-slate-400 leading-none">Очки</div>
              <div className="font-mono-tabular text-sm sm:text-lg font-bold text-white leading-tight">
                {hud.score.toLocaleString('ru-RU')}
              </div>
            </div>

            <div className="hidden md:block">
              <div className="text-[11px] text-slate-400 leading-none">Рекорд</div>
              <div className="font-mono-tabular text-lg font-bold text-amber-400 leading-tight">
                {hud.bestScore.toLocaleString('ru-RU')}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1 text-[10px] sm:text-[11px] text-slate-400 leading-none">
                <Gauge className="w-3 h-3 text-amber-400 hidden sm:inline" />
                <span>Скорость</span>
              </div>
              <div className="font-mono-tabular text-sm sm:text-lg font-bold text-amber-400 leading-tight flex items-baseline gap-1.5">
                <span>
                  {hud.speedKmh}{' '}
                  <span className="text-[10px] sm:text-xs font-normal text-slate-400">км/ч</span>
                </span>
                <span className="text-[11px] font-semibold text-sky-300/90">
                  M{hud.gear}
                </span>
              </div>
            </div>

            <div className="hidden sm:block">
              <div className="text-[11px] text-slate-400 leading-none">Дистанция</div>
              <div className="font-mono-tabular text-base font-semibold text-slate-100 leading-tight">
                {hud.distanceKm.toFixed(2)} <span className="text-xs font-normal text-slate-400">км</span>
              </div>
            </div>
          </div>

          {/* Lives + Nitro */}
          <div className="flex items-center gap-3 shrink-0">
            <div
              className="flex items-center gap-1"
              aria-label={`Жизни: ${hud.lives} из ${hud.maxLives}`}
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
                {c.text}
              </div>
            );
          })}
        </div>
      )}

      {/* TITLE MENU OVERLAY */}
      {gameState === 'TITLE_MENU' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-[#090D16]/65">
          <div className="w-full max-w-md rounded-2xl bg-[#121620] border border-white/10 p-6 sm:p-7 shadow-2xl space-y-5">
            <div>
              <div className="text-xs font-medium text-amber-400">
                3D-трасса · свободное руление
              </div>
              <h1 className="font-display text-4xl font-extrabold text-white mt-1 tracking-tight">
                Трасса 3
              </h1>
              <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">
                Свободно маневрируйте по всей ширине дороги и между полосами, переключайте вид из салона и сзади, подавайте сигнал.
              </p>
            </div>

            {/* Car Selection */}
            <div>
              <div className="text-xs font-medium text-slate-400 mb-2">Выбор автомобиля</div>
              <div className="grid grid-cols-2 gap-2">
                {PLAYER_CARS.map((car) => {
                  const active = car.id === selectedCar;
                  return (
                    <button
                      key={car.id}
                      type="button"
                      onClick={() => setSelectedCar(car.id)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#202636] border-amber-400/75 text-white'
                          : 'bg-[#171C28] border-white/10 text-slate-300 hover:bg-[#1E2434]'
                      }`}
                    >
                      <span
                        className="w-4 h-6 rounded-sm shrink-0 border border-white/20"
                        style={{ backgroundColor: car.bodyColor }}
                      />
                      <span className="text-sm font-semibold truncate">{car.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Camera & Time of Day */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-medium text-slate-400 mb-1.5">Камера (C)</div>
                <div className="grid grid-cols-2 gap-1 p-1 bg-[#171C28] border border-white/10 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      cameraModeRef.current = 'third';
                      setCameraMode('third');
                    }}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      cameraMode === 'third' ? 'bg-[#262E40] text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Сзади
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      cameraModeRef.current = 'first';
                      setCameraMode('first');
                    }}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      cameraMode === 'first' ? 'bg-[#262E40] text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    1-е лицо
                  </button>
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-400 mb-1.5">Освещение</div>
                <div className="grid grid-cols-2 gap-1 p-1 bg-[#171C28] border border-white/10 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setTimeOfDay('night')}
                    className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      timeOfDay === 'night' ? 'bg-[#262E40] text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    <span>Ночь</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeOfDay('day')}
                    className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      timeOfDay === 'day' ? 'bg-[#262E40] text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    <span>День</span>
                  </button>
                </div>
              </div>
            </div>

            {hud.bestScore > 0 && (
              <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#171C28] border border-white/10 text-sm">
                <span className="text-slate-400">Лучший результат</span>
                <span className="font-mono-tabular font-bold text-amber-400">
                  {hud.bestScore.toLocaleString('ru-RU')}
                </span>
              </div>
            )}

            <div className="space-y-3 pt-1">
              <button
                type="button"
                onClick={startGame}
                className="w-full py-3.5 px-6 rounded-xl bg-red-600 hover:bg-red-500 active:scale-[0.99] text-white font-display font-bold text-base tracking-wide transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-950/50 cursor-pointer"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Начать поездку</span>
              </button>
              <div className="text-center text-xs text-slate-400 leading-relaxed">
                A / D или ← / → плавное руление · W / S газ и тормоз · Пробел нитро · H гудок · C камера
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PAUSE OVERLAY */}
      {gameState === 'PAUSED' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-[#090D16]/65">
          <div className="w-full max-w-xs rounded-2xl bg-[#121620] border border-white/10 p-6 text-center space-y-5 shadow-2xl">
            <div>
              <h2 className="font-display text-2xl font-bold text-white">Пауза</h2>
              <p className="text-sm text-slate-400 mt-1">
                Очки: <span className="font-mono-tabular text-white font-semibold">{hud.score.toLocaleString('ru-RU')}</span>
              </p>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={togglePause}
                className="w-full py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Продолжить</span>
              </button>
              <button
                type="button"
                onClick={startGame}
                className="w-full py-2.5 px-4 rounded-xl bg-[#1E2432] hover:bg-[#283044] text-slate-200 font-medium text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Начать заново</span>
              </button>
              <button
                type="button"
                onClick={returnToMenu}
                className="w-full py-2 px-4 rounded-xl text-slate-400 hover:text-white font-medium text-sm transition-colors cursor-pointer"
              >
                Выйти в меню
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GAME OVER OVERLAY */}
      {gameState === 'GAME_OVER' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-[#090D16]/70">
          <div className="w-full max-w-sm rounded-2xl bg-[#121620] border border-white/10 p-6 space-y-5 shadow-2xl">
            <div className="text-center">
              {isNewRecord && (
                <div className="text-xs font-semibold text-amber-400 mb-1">
                  Новый рекорд трассы
                </div>
              )}
              <h2 className="font-display text-3xl font-extrabold text-white">
                Заезд завершён
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-xl bg-[#1A1F2C] border border-white/5">
                <div className="text-xs text-slate-400">Очки</div>
                <div className="font-mono-tabular text-xl font-bold text-white mt-0.5">
                  {hud.score.toLocaleString('ru-RU')}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#1A1F2C] border border-white/5">
                <div className="text-xs text-slate-400">Рекорд</div>
                <div className="font-mono-tabular text-xl font-bold text-amber-400 mt-0.5">
                  {hud.bestScore.toLocaleString('ru-RU')}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#1A1F2C] border border-white/5">
                <div className="text-xs text-slate-400">Дистанция</div>
                <div className="font-mono-tabular text-base font-semibold text-slate-100 mt-0.5">
                  {hud.distanceKm.toFixed(2)} км
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#1A1F2C] border border-white/5">
                <div className="text-xs text-slate-400">Обгоны / Риск</div>
                <div className="font-mono-tabular text-base font-semibold text-slate-100 mt-0.5">
                  {hud.overtakenCount} / {hud.nearMissCount}
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
                <span>Сыграть снова</span>
              </button>
              <button
                type="button"
                onClick={returnToMenu}
                className="w-full py-2.5 px-4 rounded-xl bg-[#1E2432] hover:bg-[#283044] text-slate-200 font-medium text-sm transition-colors cursor-pointer"
              >
                Выбор автомобиля
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
          <span>{dockCollapsed ? 'Показать управление' : 'Скрыть панель'}</span>
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
                aria-label="Влево"
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
                className="h-11 px-3 rounded-xl bg-[#191F2C] hover:bg-[#232B3D] active:bg-red-900/60 border border-white/10 text-xs font-semibold text-slate-200 cursor-pointer whitespace-nowrap"
              >
                Тормоз
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
                className="h-11 px-3 rounded-xl bg-sky-600/90 hover:bg-sky-500 active:bg-sky-400 border border-sky-400/30 flex items-center gap-1.5 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
              >
                <Flame className="w-4 h-4" />
                <span>Нитро</span>
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
                className="h-11 px-3 rounded-xl bg-[#191F2C] hover:bg-[#232B3D] active:bg-emerald-900/60 border border-white/10 text-xs font-semibold text-slate-200 cursor-pointer whitespace-nowrap"
              >
                Газ
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
                aria-label="Вправо"
                className="h-11 w-11 rounded-xl bg-[#191F2C] hover:bg-[#232B3D] active:bg-[#2D374E] border border-white/10 flex items-center justify-center text-white cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <div className="hidden sm:block h-7 w-px bg-white/10" />

            {/* Horn (H), Camera Switch (C), Lighting, Audio, Pause */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onPointerDown={() => setHornPressed(true)}
                onPointerUp={() => setHornPressed(false)}
                onPointerLeave={() => setHornPressed(false)}
                className={`h-11 px-3.5 rounded-xl border flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  isHornActive
                    ? 'bg-amber-500 text-slate-950 border-amber-300'
                    : 'bg-[#191F2C] hover:bg-[#232B3D] text-amber-300 border-white/10'
                }`}
              >
                <Megaphone className="w-4 h-4" />
                <span>Гудок (H)</span>
              </button>

              <button
                type="button"
                onClick={toggleCameraMode}
                className="h-11 px-3.5 rounded-xl bg-[#191F2C] hover:bg-[#232B3D] border border-white/10 flex items-center gap-1.5 text-xs font-semibold text-slate-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Camera className="w-4 h-4 text-sky-400" />
                <span>{cameraMode === 'first' ? '1-е лицо (C)' : 'Сзади (C)'}</span>
              </button>

              <button
                type="button"
                onClick={() => setTimeOfDay((t) => (t === 'night' ? 'day' : 'night'))}
                aria-label="Сменить освещение"
                title={timeOfDay === 'night' ? 'Дневной режим' : 'Ночной режим'}
                className="h-11 w-11 rounded-xl bg-[#191F2C] hover:bg-[#232B3D] border border-white/10 flex items-center justify-center text-slate-200 cursor-pointer"
              >
                {timeOfDay === 'night' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={toggleMute}
                aria-label={isMuted ? 'Включить звук' : 'Выключить звук'}
                title="Звук (M)"
                className="h-11 w-11 rounded-xl bg-[#191F2C] hover:bg-[#232B3D] border border-white/10 flex items-center justify-center text-slate-200 cursor-pointer"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              {(gameState === 'PLAYING' || gameState === 'PAUSED') && (
                <button
                  type="button"
                  onClick={togglePause}
                  aria-label={gameState === 'PAUSED' ? 'Продолжить' : 'Пауза'}
                  title="Пауза (P)"
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
