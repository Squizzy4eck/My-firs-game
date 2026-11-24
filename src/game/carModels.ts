import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GraphicsQuality, PlayerArchetype, TrafficKind } from './types';

export type RealCarModelKey =
  | 'audi'
  | 'bmw'
  | 'mercedes'
  | 'gwagon'
  | 'porsche'
  | 'f1'
  | 'hayabusa'
  | 'yamaha'
  | 'ducati'
  | 'h2r';

interface ModelSpec {
  url: string;
  rotY: number;
  targetLength: number;
  maxWidth?: number;
  paintMatMatcher?: RegExp;
  defaultPlayerColor?: string;
}

const MODEL_SPECS: Record<RealCarModelKey, ModelSpec> = {
  audi: {
    url: '/models/audi.glb',
    rotY: Math.PI,
    targetLength: 4.45,
    paintMatMatcher: /^BodyMaterials/i,
    defaultPlayerColor: '#1E40AF',
  },
  bmw: {
    url: '/models/bmw.glb',
    rotY: Math.PI,
    targetLength: 4.6,
    paintMatMatcher: /^bM_CarPaint_Max1$/i,
    defaultPlayerColor: '#1D4ED8',
  },
  mercedes: {
    url: '/models/mercedes.glb',
    rotY: Math.PI,
    targetLength: 4.55,
  },
  gwagon: {
    url: '/models/gwagon.glb',
    rotY: Math.PI,
    targetLength: 4.7,
    paintMatMatcher: /^MMAT_CarPaint/i,
    defaultPlayerColor: '#18181B',
  },
  porsche: {
    url: '/models/porsche.glb',
    rotY: Math.PI,
    targetLength: 4.2,
    maxWidth: 2.18,
    paintMatMatcher: /^paint$/i,
    defaultPlayerColor: '#EAB308',
  },
  f1: {
    url: '/models/f1.glb',
    rotY: -Math.PI / 2,
    targetLength: 5.1,
    paintMatMatcher: /^Nose & chassis finish$/i,
    defaultPlayerColor: '#DC2626',
  },
  hayabusa: {
    url: '/models/hayabusa.glb',
    rotY: Math.PI,
    targetLength: 2.2,
  },
  yamaha: {
    url: '/models/yamaha_r1.glb',
    rotY: 0,
    targetLength: 2.15,
  },
  ducati: {
    url: '/models/ducati.glb',
    rotY: -Math.PI / 2,
    targetLength: 2.15,
  },
  h2r: {
    url: '/models/h2r.glb',
    rotY: -Math.PI / 2,
    targetLength: 2.18,
  },
};

export function getRealCarModelKeyForPlayer(arch: PlayerArchetype): RealCarModelKey | null {
  if (
    arch === 'audi' ||
    arch === 'bmw' ||
    arch === 'mercedes' ||
    arch === 'gwagon' ||
    arch === 'porsche' ||
    arch === 'f1' ||
    arch === 'hayabusa' ||
    arch === 'yamaha' ||
    arch === 'ducati' ||
    arch === 'h2r'
  ) {
    return arch;
  }
  return null;
}

export function getRealCarModelKeyForTraffic(kind: TrafficKind): RealCarModelKey | null {
  if (
    kind === 'audi' ||
    kind === 'bmw' ||
    kind === 'mercedes' ||
    kind === 'gwagon' ||
    kind === 'porsche' ||
    kind === 'hayabusa' ||
    kind === 'yamaha' ||
    kind === 'ducati' ||
    kind === 'h2r'
  ) {
    return kind;
  }
  return null;
}

const cachedTemplates = new Map<RealCarModelKey, THREE.Group>();
const pendingLoads = new Map<RealCarModelKey, Promise<THREE.Group | null>>();
const readyListeners = new Set<(key: RealCarModelKey) => void>();
let sequentialPreloadStarted = false;

let loaderPromise: Promise<GLTFLoader> | null = null;
function getLoader(): Promise<GLTFLoader> {
  if (!loaderPromise) {
    loaderPromise = (async () => {
      await MeshoptDecoder.ready;
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      return loader;
    })();
  }
  return loaderPromise;
}

function storeBaseMaterialProps(mat: THREE.Material) {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return;
  if (mat.userData.basePropsSaved) return;
  mat.userData.basePropsSaved = true;
  mat.userData.baseRoughness = mat.roughness;
  mat.userData.baseMetalness = mat.metalness;
  mat.userData.baseEnvMapIntensity = mat.envMapIntensity ?? 1;
}

/**
 * Converts heavy MeshPhysicalMaterial (especially KHR_materials_transmission glass,
 * which triggers a second full-scene render pass every frame!) into lean MeshStandardMaterial.
 */
function convertToLeanMaterial(mat: THREE.Material, key: RealCarModelKey): THREE.Material {
  if (mat instanceof THREE.MeshPhysicalMaterial) {
    const isTransmissive = mat.transmission > 0;
    const isAlphaGlass = mat.transparent || isTransmissive;
    const std = new THREE.MeshStandardMaterial({
      name: mat.name,
      color: mat.color.clone(),
      map: mat.map,
      roughness: isTransmissive ? 0.12 : mat.roughness,
      metalness: isTransmissive ? 0.15 : mat.metalness,
      roughnessMap: mat.roughnessMap,
      metalnessMap: mat.metalnessMap,
      normalMap: mat.normalMap,
      normalScale: mat.normalScale ? mat.normalScale.clone() : new THREE.Vector2(1, 1),
      emissive: mat.emissive.clone(),
      emissiveMap: mat.emissiveMap,
      emissiveIntensity: mat.emissiveIntensity,
      alphaMap: mat.alphaMap,
      alphaTest: mat.alphaTest,
      transparent: isAlphaGlass,
      opacity: isTransmissive ? 0.46 : mat.opacity,
      depthWrite: isTransmissive ? false : mat.depthWrite,
      side: mat.side,
      vertexColors: mat.vertexColors,
    });
    if (key !== 'f1' && !isAlphaGlass) {
      std.side = THREE.FrontSide;
    }
    mat.dispose();
    return std;
  }

  if (mat instanceof THREE.MeshStandardMaterial) {
    if (key !== 'f1' && !mat.transparent) {
      mat.side = THREE.FrontSide;
    }
  }
  return mat;
}

function polishAudiMaterials(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!(m instanceof THREE.MeshStandardMaterial)) continue;
      const name = m.name || '';
      if (/^BodyMaterials/i.test(name)) {
        m.color.set('#1E40AF');
        m.metalness = 0.65;
        m.roughness = 0.22;
      } else if (/^Tyre$/i.test(name)) {
        m.color.set('#141820');
        m.metalness = 0.05;
        m.roughness = 0.88;
      } else if (/Chrome|AudiLogo/i.test(name)) {
        m.color.set('#E2E8F0');
        m.metalness = 0.92;
        m.roughness = 0.16;
      } else if (/BrakeDisc/i.test(name)) {
        m.color.set('#94A3B8');
        m.metalness = 0.82;
        m.roughness = 0.32;
      } else if (/^Brake$/i.test(name)) {
        m.color.set('#DC2626');
        m.metalness = 0.3;
        m.roughness = 0.38;
      } else if (/WindscreenGlass|Glass/i.test(name)) {
        m.color.set('#0F172A');
        m.metalness = 0.15;
        m.roughness = 0.08;
        m.transparent = true;
        m.opacity = 0.65;
      } else if (/LightFrontHighlight|FarLight/i.test(name)) {
        m.color.set('#FEF9C3');
        m.emissive.set('#FEF08A');
        m.emissiveIntensity = 1.6;
        m.roughness = 0.15;
      } else if (/LightBackHighlight|NumberPlateLight/i.test(name)) {
        m.color.set('#DC2626');
        m.emissive.set('#EF4444');
        m.emissiveIntensity = 1.4;
        m.roughness = 0.2;
      } else if (/MirrorsLightSouces/i.test(name)) {
        m.color.set('#F59E0B');
        m.emissive.set('#F59E0B');
        m.emissiveIntensity = 0.9;
      } else if (
        /CarbonFibre|BlackGlossy|HoneyComb|undercarriage|Bolt|Centre|RoofCanvas|AirBackOutput|Axe/i.test(
          name
        )
      ) {
        m.color.set('#181C24');
        m.metalness = 0.3;
        m.roughness = 0.52;
      } else if (/Ring\(Light\)/i.test(name)) {
        m.color.set('#E2E8F0');
        m.emissive.set('#F8FAFC');
        m.emissiveIntensity = 1.2;
      }
    }
  });
}

function polishPorscheMaterials(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!(m instanceof THREE.MeshStandardMaterial)) continue;
      if (m.name === 'headlight') {
        m.emissive.set('#FEF9C3');
        m.emissiveIntensity = 1.4;
      } else if (m.name === 'taillight') {
        m.emissive.set('#EF4444');
        m.emissiveIntensity = 1.3;
      } else if (m.name === 'paint') {
        m.metalness = 0.45;
        m.roughness = 0.24;
      }
    }
  });
}

function polishF1Materials(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!m) continue;
      if (!/wing/i.test(m.name || '')) {
        m.side = THREE.FrontSide;
      }
    }
  });
}

function unpackAttributeToFloat32(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): THREE.BufferAttribute {
  const count = attr.count;
  const itemSize = attr.itemSize;
  const out = new Float32Array(count * itemSize);
  for (let i = 0; i < count; i++) {
    const base = i * itemSize;
    if (itemSize >= 1) out[base] = attr.getX(i);
    if (itemSize >= 2) out[base + 1] = attr.getY(i);
    if (itemSize >= 3) out[base + 2] = attr.getZ(i);
    if (itemSize >= 4) out[base + 3] = attr.getW(i);
  }
  return new THREE.BufferAttribute(out, itemSize);
}

/**
 * Unpacks quantized/interleaved glTF attributes (KHR_mesh_quantization Int16/Int8/Uint8)
 * into clean Float32BufferAttributes BEFORE applying worldMatrix, and flips triangle winding
 * when determinant < 0 so mirrored sub-meshes never invert or explode.
 */
function unpackAndBakeGeometry(
  sourceGeom: THREE.BufferGeometry,
  worldMatrix: THREE.Matrix4,
  keepVertexColor: boolean
): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const allowedAttrs = keepVertexColor
    ? ['position', 'normal', 'uv', 'color']
    : ['position', 'normal', 'uv'];

  for (const attrName of allowedAttrs) {
    const attr = sourceGeom.attributes[attrName];
    if (attr) {
      g.setAttribute(attrName, unpackAttributeToFloat32(attr));
    }
  }

  const flipWinding = worldMatrix.determinant() < 0;

  if (sourceGeom.index) {
    const idx = sourceGeom.index;
    const arr = new Uint32Array(idx.count);
    for (let i = 0; i < idx.count; i++) {
      arr[i] = idx.getX(i);
    }
    if (flipWinding) {
      for (let i = 0; i + 2 < arr.length; i += 3) {
        const tmp = arr[i + 1];
        arr[i + 1] = arr[i + 2];
        arr[i + 2] = tmp;
      }
    }
    g.setIndex(new THREE.BufferAttribute(arr, 1));
  } else if (flipWinding) {
    for (const attr of Object.values(g.attributes)) {
      const arr = attr.array as Float32Array;
      const s = attr.itemSize;
      for (let i = 0; i + 2 < attr.count; i += 3) {
        for (let c = 0; c < s; c++) {
          const a = (i + 1) * s + c;
          const b = (i + 2) * s + c;
          const tmp = arr[a];
          arr[a] = arr[b];
          arr[b] = tmp;
        }
      }
    }
  }

  g.applyMatrix4(worldMatrix);
  if (!g.attributes.normal) {
    g.computeVertexNormals();
  }
  return g;
}

function getGeometrySignature(geom: THREE.BufferGeometry): string {
  const attrs = Object.keys(geom.attributes)
    .sort()
    .map((k) => {
      const attr = geom.attributes[k];
      return `${k}:${attr ? attr.itemSize : 0}`;
    })
    .join(',');
  return `${attrs}|${geom.index ? 'I' : 'N'}`;
}

/**
 * Unpacks, transforms, and merges static glTF sub-meshes sharing identical materials
 * & vertex layouts so every vehicle uses a minimum number of draw calls with zero corruption.
 */
function bakeAndMergeStaticMeshes(wrapper: THREE.Group, key: RealCarModelKey): THREE.Group {
  wrapper.updateMatrixWorld(true);
  const baked = new THREE.Group();

  const materialMap = new Map<THREE.Material, THREE.Material>();
  const getCleanMat = (orig: THREE.Material): THREE.Material => {
    const existing = materialMap.get(orig);
    if (existing) return existing;
    const clean = convertToLeanMaterial(orig, key);
    materialMap.set(orig, clean);
    return clean;
  };

  interface MergeBucket {
    material: THREE.Material;
    geometries: THREE.BufferGeometry[];
  }

  const buckets = new Map<string, MergeBucket>();
  const disposedSourceGeometries = new Set<THREE.BufferGeometry>();

  wrapper.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.geometry || !obj.material) return;
    const posAttr = obj.geometry.attributes.position;
    if (!posAttr || posAttr.count === 0) return;

    const det = obj.matrixWorld.determinant();
    if (Math.abs(det) < 1e-12) return;

    if (Array.isArray(obj.material) && obj.geometry.groups.length > 0) {
      const cleanMats = obj.material.map((m) => getCleanMat(m));
      const keepColor = cleanMats.some((m) => (m as THREE.MeshStandardMaterial).vertexColors);
      const bakedGeom = unpackAndBakeGeometry(obj.geometry, obj.matrixWorld, keepColor);
      const mesh = new THREE.Mesh(bakedGeom, cleanMats);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      baked.add(mesh);
      disposedSourceGeometries.add(obj.geometry);
      return;
    }

    const rawMat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    if (!rawMat) return;
    const cleanMat = getCleanMat(rawMat);
    const keepColor = Boolean((cleanMat as THREE.MeshStandardMaterial).vertexColors);
    const bakedGeom = unpackAndBakeGeometry(obj.geometry, obj.matrixWorld, keepColor);

    const sig = `${cleanMat.uuid}|${getGeometrySignature(bakedGeom)}`;
    let bucket = buckets.get(sig);
    if (!bucket) {
      bucket = {
        material: cleanMat,
        geometries: [],
      };
      buckets.set(sig, bucket);
    }
    bucket.geometries.push(bakedGeom);
    disposedSourceGeometries.add(obj.geometry);
  });

  for (const g of disposedSourceGeometries) {
    g.dispose();
  }

  for (const bucket of buckets.values()) {
    if (bucket.geometries.length === 1) {
      const singleGeom = bucket.geometries[0];
      if (singleGeom) {
        const mesh = new THREE.Mesh(singleGeom, bucket.material);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        baked.add(mesh);
      }
      continue;
    }

    const merged = mergeGeometries(bucket.geometries, false);
    if (merged) {
      const mesh = new THREE.Mesh(merged, bucket.material);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      baked.add(mesh);
      for (const g of bucket.geometries) g.dispose();
    } else {
      for (const g of bucket.geometries) {
        const mesh = new THREE.Mesh(g, bucket.material);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        baked.add(mesh);
      }
    }
  }

  return baked;
}

function normalizeModel(key: RealCarModelKey, rawScene: THREE.Object3D): THREE.Group {
  const spec = MODEL_SPECS[key];
  const wrapper = new THREE.Group();
  rawScene.rotation.y = spec.rotY;
  wrapper.add(rawScene);
  wrapper.updateMatrixWorld(true);

  if (key === 'audi') {
    polishAudiMaterials(wrapper);
  } else if (key === 'porsche') {
    polishPorscheMaterials(wrapper);
  } else if (key === 'f1') {
    polishF1Materials(wrapper);
  }

  // Bake & dequantize vertices BEFORE measuring bounding box so rotated child OBBs never skew size/center
  const optimized = bakeAndMergeStaticMeshes(wrapper, key);

  const box = new THREE.Box3().setFromObject(optimized);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scaleLen = spec.targetLength / Math.max(0.001, size.z);
  const scaleWidth = spec.maxWidth ? spec.maxWidth / Math.max(0.001, size.x) : scaleLen;
  const scale = Math.min(scaleLen, scaleWidth);

  const tx = -center.x * scale;
  const ty = -box.min.y * scale;
  const tz = -center.z * scale;

  const transformedGeoms = new Set<THREE.BufferGeometry>();
  optimized.traverse((obj) => {
    obj.userData.isSharedGlbAsset = true;
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = false;
      obj.receiveShadow = false;
      if (!transformedGeoms.has(obj.geometry)) {
        transformedGeoms.add(obj.geometry);
        obj.geometry.scale(scale, scale, scale);
        obj.geometry.translate(tx, ty, tz);
        obj.geometry.computeBoundingBox();
        obj.geometry.computeBoundingSphere();
      }
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m) storeBaseMaterialProps(m);
      }
    }
  });

  return optimized;
}

export function loadRealCarModel(key: RealCarModelKey): Promise<THREE.Group | null> {
  if (cachedTemplates.has(key)) {
    return Promise.resolve(cachedTemplates.get(key)!);
  }
  const existing = pendingLoads.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const loader = await getLoader();
      const gltf = await loader.loadAsync(MODEL_SPECS[key].url);
      const normalized = normalizeModel(key, gltf.scene);
      cachedTemplates.set(key, normalized);
      for (const cb of readyListeners) {
        cb(key);
      }
      return normalized;
    } catch {
      return null;
    }
  })();

  pendingLoads.set(key, promise);
  return promise;
}

/**
 * Loads all real GLB models sequentially with a short idle yield between each
 * so concurrent parsing never stalls the main thread during early driving frames.
 */
export function preloadAllRealCarModels(priorityKey?: RealCarModelKey | null) {
  if (sequentialPreloadStarted) return;
  sequentialPreloadStarted = true;

  const allKeys = Object.keys(MODEL_SPECS) as RealCarModelKey[];
  const ordered = priorityKey
    ? [priorityKey, ...allKeys.filter((k) => k !== priorityKey)]
    : allKeys;

  void (async () => {
    for (const key of ordered) {
      await loadRealCarModel(key);
      await new Promise((resolve) => window.setTimeout(resolve, 24));
    }
  })();
}

export function onRealCarModelReady(cb: (key: RealCarModelKey) => void): () => void {
  readyListeners.add(cb);
  return () => {
    readyListeners.delete(cb);
  };
}

export function instantiateRealCarModel(
  key: RealCarModelKey,
  overrideColor?: string
): THREE.Group | null {
  const template = cachedTemplates.get(key);
  if (!template) {
    void loadRealCarModel(key);
    return null;
  }

  const clone = template.clone();
  const spec = MODEL_SPECS[key];
  const targetColor = overrideColor ?? spec.defaultPlayerColor;

  const matcher = spec.paintMatMatcher;
  if (targetColor && matcher) {
    const clonedPaintMats = new Map<THREE.Material, THREE.Material>();
    clone.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map((m) => {
          if (m && matcher.test(m.name || '')) {
            const existing = clonedPaintMats.get(m);
            if (existing) return existing;
            const cm = m.clone();
            cm.userData = { ...m.userData, isOwnedCloneMaterial: true };
            if (cm instanceof THREE.MeshStandardMaterial) {
              cm.color.set(targetColor);
            }
            clonedPaintMats.set(m, cm);
            return cm;
          }
          return m;
        });
      } else if (obj.material && matcher.test(obj.material.name || '')) {
        const origMat = obj.material;
        const existing = clonedPaintMats.get(origMat);
        if (existing) {
          obj.material = existing;
        } else {
          const cloned = origMat.clone();
          cloned.userData = { ...origMat.userData, isOwnedCloneMaterial: true };
          if (cloned instanceof THREE.MeshStandardMaterial) {
            cloned.color.set(targetColor);
          }
          clonedPaintMats.set(origMat, cloned);
          obj.material = cloned;
        }
      }
    });
  }

  clone.traverse((obj) => {
    obj.userData.isSharedGlbAsset = true;
  });

  return clone;
}

export function setRealCarPaintColor(group: THREE.Group, color: string) {
  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (
        m &&
        m.userData?.isOwnedCloneMaterial &&
        m instanceof THREE.MeshStandardMaterial
      ) {
        m.color.set(color);
      }
    }
  });
}

export function applyRealCarQuality(group: THREE.Group, quality: GraphicsQuality) {
  const isLow = quality === 'low';

  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = false;
    obj.receiveShadow = false;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!(m instanceof THREE.MeshStandardMaterial)) continue;
      if (m.userData.appliedQuality === quality) continue;
      m.userData.appliedQuality = quality;
      storeBaseMaterialProps(m);
      const baseRough = (m.userData.baseRoughness as number) ?? 0.5;
      const baseMetal = (m.userData.baseMetalness as number) ?? 0.3;
      const baseEnv = (m.userData.baseEnvMapIntensity as number) ?? 1.0;

      if (isLow) {
        m.metalness = Math.min(0.18, baseMetal * 0.25);
        m.roughness = Math.max(0.65, baseRough);
        m.envMapIntensity = 0;
      } else if (quality === 'medium') {
        m.metalness = baseMetal;
        m.roughness = baseRough;
        m.envMapIntensity = baseEnv * 0.8;
      } else {
        m.metalness = baseMetal;
        m.roughness = baseRough;
        m.envMapIntensity = baseEnv;
      }
    }
  });
}

export function disposeRealCarInstance(group: THREE.Group) {
  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (m && m.userData?.isOwnedCloneMaterial) {
        m.dispose();
      }
    }
  });
}
