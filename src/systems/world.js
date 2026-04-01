import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { GAME_CONFIG, TERRAIN_TYPES } from '../config.js';
import { tileKey } from '../utils/helpers.js';

const HEX_DIRS = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];

export function axialToWorld(q, r, size = GAME_CONFIG.hexSize) {
  return new THREE.Vector3(
    size * Math.sqrt(3) * (q + r / 2) * GAME_CONFIG.axialScaleX,
    0,
    size * 1.5 * r * GAME_CONFIG.axialScaleZ
  );
}

export function createHexShape(size = GAME_CONFIG.hexSize * 1.04) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 3 * i + Math.PI / 6;
    const x = Math.cos(angle) * size;
    const y = Math.sin(angle) * size;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

export function generateWorld(state) {
  const noise2D = createNoise2D();
  const radius = GAME_CONFIG.mapRadius;
  state.map.length = 0;
  state.mapIndex.clear();

  // Задаем случайное, но плавное направление для реки
  const riverAngle = noise2D(11.4, -7.2) * 0.5;
  const riverDir = new THREE.Vector2(Math.cos(riverAngle), Math.sin(riverAngle));
  const riverNormal = new THREE.Vector2(-riverDir.y, riverDir.x);

  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      const s = -q - r;
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) > radius) continue;
      
      const pos = axialToWorld(q, r);
      const d = Math.hypot(pos.x, pos.z); // Расстояние до центра
      
      // Генерируем макро-зоны (крупные участки)
      const moisture = noise2D(q * 0.08, r * 0.08); // Влажность (для лесов)
      const elevationNoise = noise2D(q * 0.06 + 100, r * 0.06 - 50); // Высота (для гор)
      const detail = noise2D(q * 0.2, r * 0.2); // Мелкие неровности

      const worldPos = new THREE.Vector2(pos.x, pos.z);
      const along = worldPos.dot(riverDir);
      
      // Извилистость реки
      const meander = Math.sin(along * 0.15) * 2.5 + noise2D(q * 0.1, r * 0.1) * 1.5;
      const across = Math.abs(worldPos.dot(riverNormal) + meander);
      const riverWidth = 2.0 + Math.max(0, (radius - Math.abs(along / 10)) * 0.02);

      let type = 'grass';
      let height = 0.16 + detail * 0.04;

      // Модификатор "безопасной зоны" в центре (d < 7)
      const centerFactor = Math.max(0, 1 - d / 7);
      const finalElevation = elevationNoise - centerFactor * 0.8; // В центре гор нет

      // Определяем биомы
      if (across < riverWidth * 0.6) {
        // Вода
        type = 'river';
        height = GAME_CONFIG.terrain.waterLevel + 0.02;
      } else if (across < riverWidth + 1.8) {
        // Берега реки всегда плодородны
        type = 'fertile';
        height = 0.1 + detail * 0.03;
      } else if (finalElevation > 0.45 && d > 6) {
        // Высокие горы (только вдали от центра)
        type = 'rock';
        height = 0.8 + finalElevation * 0.4 + detail * 0.1;
      } else if (finalElevation > 0.25 && d > 5) {
        // Холмы
        type = 'hill';
        height = 0.4 + finalElevation * 0.2 + detail * 0.05;
      } else if (moisture > 0.2 && d > 4) {
        // Густые леса группами
        type = 'forest';
        height = 0.18 + detail * 0.04;
      } else if (moisture < -0.3 && finalElevation < 0) {
        // Равнинные плодородные земли
        type = 'fertile';
        height = 0.14 + detail * 0.03;
      }

      // Небольшая священная поляна рядом со стартом
      if (d < 5 && d > 2 && type === 'grass' && noise2D(q, r) > 0.7) {
        type = 'sacred';
        height = 0.15;
      }

      const tile = {
        id: tileKey(q, r), q, r, type, pos, height,
        noise: detail,
        riverDistance: across,
        buildingId: null,
        roadLinks: new Set(),
        selected: false,
        mesh: null,
        decorMeshes: []
      };
      state.map.push(tile);
      state.mapIndex.set(tile.id, tile);
    }
  }
}

export function getTile(state, q, r) {
  return state.mapIndex.get(tileKey(q, r)) || null;
}

export function getNeighbors(state, tile) {
  return HEX_DIRS.map(([dq, dr]) => getTile(state, tile.q + dq, tile.r + dr)).filter(Boolean);
}

export function isTileInsideTerritory(state, tile) {
  return Math.hypot(tile.pos.x, tile.pos.z) <= state.territoryRadius;
}

export function terrainColor(type) {
  return TERRAIN_TYPES[type].color;
}
