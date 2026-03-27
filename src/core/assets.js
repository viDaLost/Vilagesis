import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getModelCandidates } from '../data/modelPaths.js';

const loader = new GLTFLoader();
const cache = new Map();

async function loadFirst(paths) {
  let lastError = null;
  for (const path of paths) {
    try {
      const gltf = await loader.loadAsync(path);
      return { scene: gltf.scene, path };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Model not found');
}

export async function loadBuildingModel(filename) {
  if (!filename) return null;
  if (cache.has(filename)) return cache.get(filename).clone(true);

  const { scene } = await loadFirst(getModelCandidates(filename));
  scene.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => { m.depthWrite = true; });
      } else if (obj.material) {
        obj.material.depthWrite = true;
      }
    }
  });
  cache.set(filename, scene);
  return scene.clone(true);
}

export function makeFallbackMesh(color = 0xb4873e) {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1, 1.2),
    new THREE.MeshStandardMaterial({ color, roughness: .86, metalness: .06 })
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}
