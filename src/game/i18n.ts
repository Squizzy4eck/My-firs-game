import { ControlAction, KeyBindings, PlayerCarId } from './types';

export type Language = 'ru' | 'de' | 'en';

export const LANGUAGE_OPTIONS: Array<{ id: Language; label: string; short: string }> = [
  { id: 'ru', label: 'Русский', short: 'RU' },
  { id: 'de', label: 'Deutsch', short: 'DE' },
  { id: 'en', label: 'English', short: 'EN' },
];

export interface TranslationBundle {
  appName: string;
  subtitle: string;
  tabGarage: string;
  tabSettings: string;
  garageTitle: string;
  startDrive: string;
  resumeDrive: string;
  restartDrive: string;
  backToMenu: string;
  backToPause: string;
  controlsHint: string;
  // Settings tab
  settingsTitle: string;
  settingLanguage: string;
  settingGraphics: string;
  graphicsHigh: string;
  graphicsLow: string;
  settingCamera: string;
  settingLighting: string;
  settingSound: string;
  settingSteeringSensitivity: string;
  steeringSoft: string;
  steeringNormal: string;
  steeringSharp: string;
  cameraThird: string;
  cameraFirst: string;
  lightingNight: string;
  lightingDay: string;
  soundOn: string;
  soundOff: string;
  bestScoreLabel: string;
  // Controls customization
  settingControls: string;
  presetBoth: string;
  presetWasd: string;
  presetArrows: string;
  resetControls: string;
  pressKeyPrompt: string;
  controlActions: Record<ControlAction, string>;
  // HUD
  hudScore: string;
  hudBest: string;
  hudSpeed: string;
  hudUnitKmh: string;
  hudDistance: string;
  hudUnitKm: string;
  hudLivesAria: (lives: number, max: number) => string;
  // Dock
  dockShow: string;
  dockHide: string;
  dockLeft: string;
  dockRight: string;
  dockBrake: string;
  dockNitro: string;
  dockGas: string;
  dockHorn: string;
  dockCameraFirst: string;
  dockCameraThird: string;
  dockLightTooltipDay: string;
  dockLightTooltipNight: string;
  dockSoundOn: string;
  dockSoundOff: string;
  dockPause: string;
  dockResume: string;
  dockSettings: string;
  // Overlays
  pauseTitle: string;
  gameOverTitle: string;
  newRecordBadge: string;
  overtakenRisk: string;
  playAgain: string;
  chooseVehicle: string;
  webglUnavailableTitle: string;
  webglUnavailableBody: string;
  reloadBtn: string;
  // 3D Cockpit
  cockpitGear: string;
  cockpitNitro: string;
  // Callouts
  calloutNearMiss: string;
  calloutNitro: string;
  calloutRepair: string;
  calloutBonus: string;
  calloutHit: string;
  calloutCrash: string;
  // Vehicles
  vehicles: Record<PlayerCarId, { name: string; tag: string }>;
}

export const TRANSLATIONS: Record<Language, TranslationBundle> = {
  ru: {
    appName: 'Трасса 3',
    subtitle: '3D-трасса · свободное руление',
    tabGarage: 'Гараж',
    tabSettings: 'Настройки',
    garageTitle: 'Выбор транспорта',
    startDrive: 'Начать поездку',
    resumeDrive: 'Продолжить',
    restartDrive: 'Начать заново',
    backToMenu: 'Выйти в меню',
    backToPause: 'Назад',
    controlsHint:
      'A / D или ← / → плавное руление · W / S газ и тормоз · Пробел нитро · H гудок · C камера',
    settingsTitle: 'Параметры игры',
    settingLanguage: 'Язык интерфейса',
    settingGraphics: 'Качество графики',
    graphicsHigh: 'Высокая',
    graphicsLow: 'Низкая (FPS)',
    settingCamera: 'Камера по умолчанию',
    settingLighting: 'Время суток',
    settingSound: 'Звук (M)',
    settingSteeringSensitivity: 'Поворотливость руля',
    steeringSoft: 'Плавнее',
    steeringNormal: 'Норма',
    steeringSharp: 'Резче',
    cameraThird: 'Сзади',
    cameraFirst: '1-е лицо',
    lightingNight: 'Ночь',
    lightingDay: 'День',
    soundOn: 'Включён',
    soundOff: 'Выключен',
    bestScoreLabel: 'Лучший результат',
    settingControls: 'Управление',
    presetBoth: 'WASD + ←↑↓→',
    presetWasd: 'WASD',
    presetArrows: 'Стрелки',
    resetControls: 'Сбросить',
    pressKeyPrompt: 'Нажмите клавишу...',
    controlActions: {
      steerLeft: 'Руль влево',
      steerRight: 'Руль вправо',
      accelerate: 'Газ',
      brake: 'Тормоз',
      nitro: 'Нитро',
      horn: 'Гудок',
      camera: 'Камера',
    },
    hudScore: 'Очки',
    hudBest: 'Рекорд',
    hudSpeed: 'Скорость',
    hudUnitKmh: 'км/ч',
    hudDistance: 'Дистанция',
    hudUnitKm: 'км',
    hudLivesAria: (lives, max) => `Жизни: ${lives} из ${max}`,
    dockShow: 'Показать управление',
    dockHide: 'Скрыть панель',
    dockLeft: 'Влево',
    dockRight: 'Вправо',
    dockBrake: 'Тормоз',
    dockNitro: 'Нитро',
    dockGas: 'Газ',
    dockHorn: 'Гудок (H)',
    dockCameraFirst: '1-е лицо (C)',
    dockCameraThird: 'Сзади (C)',
    dockLightTooltipDay: 'Дневной режим',
    dockLightTooltipNight: 'Ночной режим',
    dockSoundOn: 'Включить звук',
    dockSoundOff: 'Выключить звук',
    dockPause: 'Пауза',
    dockResume: 'Продолжить',
    dockSettings: 'Настройки',
    pauseTitle: 'Пауза',
    gameOverTitle: 'Заезд завершён',
    newRecordBadge: 'Новый рекорд трассы',
    overtakenRisk: 'Обгоны / Риск',
    playAgain: 'Сыграть снова',
    chooseVehicle: 'Выбор транспорта',
    webglUnavailableTitle: '3D-графика недоступна',
    webglUnavailableBody:
      'Браузер не смог инициализировать WebGL. Попробуйте обновить страницу или включить аппаратное ускорение.',
    reloadBtn: 'Перезагрузить',
    cockpitGear: 'ПЕРЕДАЧА',
    cockpitNitro: 'НИТРО',
    calloutNearMiss: '+50 Опасный обгон',
    calloutNitro: '+Нитро заряд',
    calloutRepair: '+1 Жизнь',
    calloutBonus: '+60 Бонус',
    calloutHit: 'Столкновение!',
    calloutCrash: 'Авария!',
    vehicles: {
      crimson: { name: 'Спорткар', tag: 'Купе' },
      cobalt: { name: 'Гиперкар GT', tag: 'Аэро' },
      amber: { name: 'Маслкар V8', tag: 'Нагнетатель' },
      emerald: { name: 'Внедорожник', tag: '4×4' },
      police: { name: 'Полиция', tag: 'Мигалки' },
      pickup: { name: 'Пикап Трак', tag: 'Тягач' },
      tank: { name: 'Боевой танк', tag: 'Броня' },
    },
  },
  de: {
    appName: 'Route 3',
    subtitle: '3D-Autobahn · Freies Lenken',
    tabGarage: 'Garage',
    tabSettings: 'Einstellungen',
    garageTitle: 'Fahrzeugwahl',
    startDrive: 'Fahrt starten',
    resumeDrive: 'Fortsetzen',
    restartDrive: 'Neu starten',
    backToMenu: 'Hauptmenü',
    backToPause: 'Zurück',
    controlsHint:
      'A / D oder ← / → Lenken · W / S Gas & Bremse · Leertaste Nitro · H Hupe · C Kamera',
    settingsTitle: 'Spieleinstellungen',
    settingLanguage: 'Sprache',
    settingGraphics: 'Grafikqualität',
    graphicsHigh: 'Hoch',
    graphicsLow: 'Niedrig (FPS)',
    settingCamera: 'Standardkamera',
    settingLighting: 'Tageszeit',
    settingSound: 'Ton (M)',
    settingSteeringSensitivity: 'Lenkempfindlichkeit',
    steeringSoft: 'Sanft',
    steeringNormal: 'Normal',
    steeringSharp: 'Direkt',
    cameraThird: 'Verfolger',
    cameraFirst: 'Cockpit',
    lightingNight: 'Nacht',
    lightingDay: 'Tag',
    soundOn: 'An',
    soundOff: 'Aus',
    bestScoreLabel: 'Highscore',
    settingControls: 'Steuerung',
    presetBoth: 'WASD + Pfeile',
    presetWasd: 'WASD',
    presetArrows: 'Pfeile',
    resetControls: 'Standard',
    pressKeyPrompt: 'Taste drücken...',
    controlActions: {
      steerLeft: 'Links lenken',
      steerRight: 'Rechts lenken',
      accelerate: 'Gas',
      brake: 'Bremse',
      nitro: 'Nitro',
      horn: 'Hupe',
      camera: 'Kamera',
    },
    hudScore: 'Punkte',
    hudBest: 'Rekord',
    hudSpeed: 'Tempo',
    hudUnitKmh: 'km/h',
    hudDistance: 'Distanz',
    hudUnitKm: 'km',
    hudLivesAria: (lives, max) => `Leben: ${lives} von ${max}`,
    dockShow: 'Steuerung zeigen',
    dockHide: 'Leiste ausblenden',
    dockLeft: 'Links',
    dockRight: 'Rechts',
    dockBrake: 'Bremse',
    dockNitro: 'Nitro',
    dockGas: 'Gas',
    dockHorn: 'Hupe (H)',
    dockCameraFirst: 'Cockpit (C)',
    dockCameraThird: 'Verfolger (C)',
    dockLightTooltipDay: 'Tagmodus',
    dockLightTooltipNight: 'Nachtmodus',
    dockSoundOn: 'Ton einschalten',
    dockSoundOff: 'Ton stummschalten',
    dockPause: 'Pause',
    dockResume: 'Fortsetzen',
    dockSettings: 'Einstellungen',
    pauseTitle: 'Pause',
    gameOverTitle: 'Fahrt beendet',
    newRecordBadge: 'Neuer Streckenrekord',
    overtakenRisk: 'Überholt / Knapp',
    playAgain: 'Nochmal fahren',
    chooseVehicle: 'Fahrzeug wählen',
    webglUnavailableTitle: '3D-Grafik nicht verfügbar',
    webglUnavailableBody:
      'WebGL konnte nicht initialisiert werden. Bitte Seite neu laden oder Hardwarebeschleunigung aktivieren.',
    reloadBtn: 'Neu laden',
    cockpitGear: 'GANG',
    cockpitNitro: 'NITRO',
    calloutNearMiss: '+50 Knapp vorbei',
    calloutNitro: '+Nitro-Ladung',
    calloutRepair: '+1 Leben',
    calloutBonus: '+60 Bonus',
    calloutHit: 'Kollision!',
    calloutCrash: 'Unfall!',
    vehicles: {
      crimson: { name: 'Sportwagen', tag: 'Coupé' },
      cobalt: { name: 'Hypercar GT', tag: 'Aero' },
      amber: { name: 'Muscle V8', tag: 'Kompressor' },
      emerald: { name: 'Geländewagen', tag: '4×4' },
      police: { name: 'Polizei', tag: 'Blaulicht' },
      pickup: { name: 'Pickup-Truck', tag: 'Schwer' },
      tank: { name: 'Kampfpanzer', tag: 'Panzerung' },
    },
  },
  en: {
    appName: 'Highway 3',
    subtitle: '3D Highway · Free Steering',
    tabGarage: 'Garage',
    tabSettings: 'Settings',
    garageTitle: 'Select Vehicle',
    startDrive: 'Start Drive',
    resumeDrive: 'Resume',
    restartDrive: 'Restart',
    backToMenu: 'Main Menu',
    backToPause: 'Back',
    controlsHint:
      'A / D or ← / → smooth steer · W / S gas & brake · Space nitro · H horn · C camera',
    settingsTitle: 'Game Settings',
    settingLanguage: 'Language',
    settingGraphics: 'Graphics Quality',
    graphicsHigh: 'High',
    graphicsLow: 'Low (Performance)',
    settingCamera: 'Default Camera',
    settingLighting: 'Time of Day',
    settingSound: 'Audio (M)',
    settingSteeringSensitivity: 'Steering Sensitivity',
    steeringSoft: 'Smooth',
    steeringNormal: 'Normal',
    steeringSharp: 'Sharp',
    cameraThird: 'Chase Cam',
    cameraFirst: '1st Person',
    lightingNight: 'Night',
    lightingDay: 'Day',
    soundOn: 'On',
    soundOff: 'Off',
    bestScoreLabel: 'Best Score',
    settingControls: 'Controls',
    presetBoth: 'WASD + Arrows',
    presetWasd: 'WASD',
    presetArrows: 'Arrows',
    resetControls: 'Reset',
    pressKeyPrompt: 'Press any key...',
    controlActions: {
      steerLeft: 'Steer Left',
      steerRight: 'Steer Right',
      accelerate: 'Gas',
      brake: 'Brake',
      nitro: 'Nitro',
      horn: 'Horn',
      camera: 'Camera',
    },
    hudScore: 'Score',
    hudBest: 'Best',
    hudSpeed: 'Speed',
    hudUnitKmh: 'km/h',
    hudDistance: 'Distance',
    hudUnitKm: 'km',
    hudLivesAria: (lives, max) => `Lives: ${lives} of ${max}`,
    dockShow: 'Show Controls',
    dockHide: 'Hide Panel',
    dockLeft: 'Left',
    dockRight: 'Right',
    dockBrake: 'Brake',
    dockNitro: 'Nitro',
    dockGas: 'Gas',
    dockHorn: 'Horn (H)',
    dockCameraFirst: '1st Person (C)',
    dockCameraThird: 'Chase (C)',
    dockLightTooltipDay: 'Day Mode',
    dockLightTooltipNight: 'Night Mode',
    dockSoundOn: 'Unmute Audio',
    dockSoundOff: 'Mute Audio',
    dockPause: 'Pause',
    dockResume: 'Resume',
    dockSettings: 'Settings',
    pauseTitle: 'Paused',
    gameOverTitle: 'Run Finished',
    newRecordBadge: 'New Track Record',
    overtakenRisk: 'Passed / Near Miss',
    playAgain: 'Drive Again',
    chooseVehicle: 'Select Vehicle',
    webglUnavailableTitle: '3D Graphics Unavailable',
    webglUnavailableBody:
      'Your browser could not initialize WebGL. Try reloading the page or enabling hardware acceleration.',
    reloadBtn: 'Reload',
    cockpitGear: 'GEAR',
    cockpitNitro: 'NITRO',
    calloutNearMiss: '+50 Near Miss',
    calloutNitro: '+Nitro Boost',
    calloutRepair: '+1 Life',
    calloutBonus: '+60 Bonus',
    calloutHit: 'Collision!',
    calloutCrash: 'Wrecked!',
    vehicles: {
      crimson: { name: 'Sportcar', tag: 'Coupe' },
      cobalt: { name: 'Hypercar GT', tag: 'Aero' },
      amber: { name: 'Muscle V8', tag: 'Blower' },
      emerald: { name: 'Off-Roader', tag: '4×4' },
      police: { name: 'Police Cruiser', tag: 'Siren' },
      pickup: { name: 'Heavy Pickup', tag: 'Truck' },
      tank: { name: 'Battle Tank', tag: 'Armored' },
    },
  },
};

export function formatKeyCode(code: string, lang: Language): string {
  if (code === 'ArrowLeft') return '←';
  if (code === 'ArrowRight') return '→';
  if (code === 'ArrowUp') return '↑';
  if (code === 'ArrowDown') return '↓';
  if (code === 'Space') {
    return lang === 'ru' ? 'Пробел' : lang === 'de' ? 'Leertaste' : 'Space';
  }
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl';
  if (code === 'AltLeft' || code === 'AltRight') return 'Alt';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num${code.slice(6)}`;
  return code;
}

export function formatKeyList(codes: string[], lang: Language): string {
  if (!codes || codes.length === 0) return '—';
  return codes.map((c) => formatKeyCode(c, lang)).join(' / ');
}

export function formatControlsHint(bindings: KeyBindings, lang: Language): string {
  const tr = TRANSLATIONS[lang];
  const left = formatKeyCode(bindings.steerLeft[0] ?? 'KeyA', lang);
  const right = formatKeyCode(bindings.steerRight[0] ?? 'KeyD', lang);
  const gas = formatKeyCode(bindings.accelerate[0] ?? 'KeyW', lang);
  const brake = formatKeyCode(bindings.brake[0] ?? 'KeyS', lang);
  const nitro = formatKeyCode(bindings.nitro[0] ?? 'Space', lang);
  const horn = formatKeyCode(bindings.horn[0] ?? 'KeyH', lang);
  const cam = formatKeyCode(bindings.camera[0] ?? 'KeyC', lang);
  return `${left}/${right} · ${gas}/${brake} · ${nitro} ${tr.dockNitro} · ${horn} ${tr.controlActions.horn} · ${cam} ${tr.controlActions.camera}`;
}

