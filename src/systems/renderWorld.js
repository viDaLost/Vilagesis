import * as THREE from 'three';
import { TERRAIN_TYPES, DECOR_MODELS, GAME_CONFIG } from '../config.js';
import { loadDecorModel, loadUnitModel } from '../core/assets.js';

const terrainMaterials = new Map();
const edgeMaterial = null;
const raycaster = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);

function getTerrainMaterial(type) {
  if (terrainMaterials.has(type)) return terrainMaterials.get(type);
  const cfg = TERRAIN_TYPES[type];
  const mat = new THREE.MeshStandardMaterial({
    color: cfg.color,
    roughness: type === 'river' || type === 'water' ? .28 : .98,
    metalness: 0,
    emissive: type === 'water' ? 0x356d93 : 0x000000,
    emissiveIntensity: type === 'water' ? .12 : 0,
  });
  terrainMaterials.set(type, mat);
  return mat;
}

function makeOrganicShape(tile) {
  const size = GAME_CONFIG.hexSize * 1.05;
  const shape = new THREE.Shape();
  for (let i = 0; i < 12; i++) {
    const sector = Math.floor((i / 12) * 6);
    const local = ((i / 12) * 6) - sector;
    const angle = Math.PI / 3 * sector + Math.PI / 6 + local * (Math.PI / 3);
    const radius = size * (0.985 + Math.sin((tile.q * 7 + tile.r * 11 + i) * 0.7) * 0.022);
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function makeHexMesh(tile) {
  const depth = tile.type === 'water' ? .04 : .08 + Math.max(0, tile.height * .006);
  const shape = makeOrganicShape(tile);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(tile.pos.x, tile.height - depth, tile.pos.z);
  const mesh = new THREE.Mesh(geo, getTerrainMaterial(tile.type));
  mesh.receiveShadow = true;
  mesh.userData.tileId = tile.id;
  mesh.rotation.y = tile.noise * .035;
  return mesh;
}

function addDistantMountains(group) {
  group.clear();
  const mat = new THREE.MeshStandardMaterial({ color: 0xbcb2a1, roughness: 1, transparent: true, opacity: .96 });
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    const radius = 52 + (i % 5) * 4 + Math.random() * 2;
    const height = 14 + Math.random() * 10;
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(7 + Math.random() * 4, height, 4), mat.clone());
    mountain.position.set(Math.cos(angle) * radius, -1.2 + height / 2, Math.sin(angle) * radius);
    group.add(mountain);
  }
}

export function clearDecorOnTile(sceneCtx, tile) {
  if (!tile?.decorMeshes?.length) return;
  for (const mesh of tile.decorMeshes) sceneCtx.groups.decor.remove(mesh);
  tile.decorMeshes.length = 0;
}

export function sampleTileSurfaceY(tile, x = tile.pos.x, z = tile.pos.z) {
  if (!tile?.mesh) return tile?.height || 0;
  raycaster.set(new THREE.Vector3(x, tile.height + 8, z), down);
  const hits = raycaster.intersectObject(tile.mesh, true);
  if (hits.length) return hits[0].point.y;
  return tile.height;
}

function decorChoices(tile) {
  const r = (salt) => {
    const x = Math.sin(tile.q * 127.1 + tile.r * 311.7 + salt * 74.7) * 43758.5453123;
    return x - Math.floor(x);
  };
  const list = [];
  switch (tile.type) {
    case 'forest':
      list.push(r(1) > .45 ? 'pine' : 'tree', r(2) > .55 ? 'bush' : 'bushSmall', r(3) > .65 ? 'flowerYellow' : 'grass');
      if (r(4) > .72) list.push('logLarge');
      break;
    case 'grass':
      if (r(1) > .58) list.push('oak');
      list.push(r(2) > .5 ? 'grass' : 'bushSmall');
      if (r(3) > .7) list.push('flowerRed');
      break;
    case 'fertile':
      list.push('wheat', r(2) > .45 ? 'corn' : 'dirtRow');
      if (r(3) > .55) list.push('fence');
      break;
    case 'rock':
      list.push('rockLarge', r(2) > .55 ? 'rockLargeB' : 'rockSmall');
      if (r(3) > .65) list.push('rockFlat');
      break;
    case 'hill':
      list.push('rockSmall', r(2) > .48 ? 'bushSmall' : 'grass');
      if (r(3) > .7) list.push('logStack');
      break;
    case 'river':
      list.push(r(1) > .5 ? 'lily' : 'grass', 'bushSmall');
      if (r(2) > .72) list.push('dirtSingle');
      break;
    case 'sacred':
      list.push(r(1) > .5 ? 'wizard' : 'cleric', 'flowerYellow');
      break;
  }
  return list.filter(Boolean).slice(0, GAME_CONFIG.decorPerTileSoftCap || 4);
}

export function renderTiles(sceneCtx, state) {
  const { groups } = sceneCtx;
  groups.tiles.clear();
  groups.decor.clear();
  groups.overlays.clear();
  addDistantMountains(groups.backdrop);

  const ringGeo = new THREE.RingGeometry(state.territoryRadius - .15, state.territoryRadius + .1, 128);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd66b, transparent: true, opacity: .14, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = .08;
  ring.name = 'territory-ring';
  groups.overlays.add(ring);

  state.map.forEach((tile) => {
    tile.decorMeshes = [];
    const mesh = makeHexMesh(tile);
    groups.tiles.add(mesh);
    tile.mesh = mesh;
  });
}

export function updateTerritoryOverlay(sceneCtx, state) {
  const ring = sceneCtx.groups.overlays.getObjectByName('territory-ring');
  if (!ring) return;
  ring.geometry.dispose();
  ring.geometry = new THREE.RingGeometry(state.territoryRadius - .15, state.territoryRadius + .1, 128);
}

export function renderRoads(sceneCtx, state) {
  const { groups } = sceneCtx;
  groups.roads.clear();
  const roadMat = new THREE.MeshStandardMaterial({ color: 0xcaa66a, roughness: 1 });
  state.roads.forEach((road) => {
    const a = state.mapIndex.get(road.a);
    const b = state.mapIndex.get(road.b);
    if (!a || !b) return;
    const dir = new THREE.Vector3().subVectors(b.pos, a.pos);
    const len = dir.length();
    const midX = (a.pos.x + b.pos.x) / 2;
    const midZ = (a.pos.z + b.pos.z) / 2;
    const y = (sampleTileSurfaceY(a, a.pos.x, a.pos.z) + sampleTileSurfaceY(b, b.pos.x, b.pos.z)) / 2 + 0.04;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(.28, .04, len), roadMat);
    mesh.position.set(midX, y, midZ);
    mesh.lookAt(b.pos.x, y, b.pos.z);
    mesh.rotateY(Math.PI);
    mesh.receiveShadow = true;
    groups.roads.add(mesh);
  });
}

async function spawnDecorModel(sceneCtx, tile, key, slot = 0) {
  if (!key || tile.buildingId) return;
  const cfg = DECOR_MODELS[key];
  if (!cfg) return;
  try {
    const root = cfg.root === 'units' ? 'units' : (cfg.root || 'decor');
    const modelData = root === 'units' ? await loadUnitModel(cfg.file) : { scene: await loadDecorModel(cfg.file, root) };
    const model = modelData.scene;
    if (!model) return;
    const seed = Math.sin(tile.q * 53.2 + tile.r * 71.9 + slot * 19.3) * 43758.5453;
    const rand = seed - Math.floor(seed);
    const angle = rand * Math.PI * 2;
    const radius = slot === 0 ? 0.18 : 0.35 + slot * 0.16;
    const x = tile.pos.x + Math.cos(angle) * radius;
    const z = tile.pos.z + Math.sin(angle) * radius;
    const y = sampleTileSurfaceY(tile, x, z) + (cfg.y || 0.0);
    model.scale.setScalar((cfg.scale || 0.018) * (0.88 + rand * 0.22));
    model.position.set(x, y, z);
    model.rotation.y = rand * Math.PI * 2;
    model.traverse((obj) => {
      if (obj.isMesh || obj.isSkinnedMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    model.userData.baseY = y;
    sceneCtx.groups.decor.add(model);
    tile.decorMeshes.push(model);
  } catch (err) {
    console.warn('Decor load failed', key, err);
  }
}

export async function populateDecorModels(sceneCtx, state) {
  const tasks = [];
  for (const tile of state.map) {
    if (tile.buildingId || tile.type === 'water') continue;
    const choices = decorChoices(tile);
    choices.forEach((c, idx) => {
      const density = Math.abs(Math.sin(tile.q * 17.7 + tile.r * 9.3 + idx));
      if (density < (1 - GAME_CONFIG.decorModelDensity)) return;
      tasks.push(spawnDecorModel(sceneCtx, tile, c, idx));
    });
  }
  // avoid blocking on any single failed asset
  await Promise.allSettled(tasks);
}
