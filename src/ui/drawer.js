import { BUILDINGS, TECHS, UNITS, TERRAIN_TYPES } from '../config.js';
import { $, $$ } from './dom.js';
import { beginResearch, canResearch } from '../systems/economy.js';

export function closeDrawer() {
  $('#context-drawer').classList.add('hidden');
}

export function openDrawer(title, subtitle, html) {
  $('#drawer-title').textContent = title;
  $('#drawer-subtitle').textContent = subtitle;
  $('#drawer-body').innerHTML = html;
  $('#context-drawer').classList.remove('hidden');
}

export function bindDrawerClose() {
  $('#drawer-close').onclick = closeDrawer;
}

export function openBuildMenu(state, onChoose) {
  const cards = Object.entries(BUILDINGS)
    .filter(([key]) => key !== 'capital')
    .map(([key, cfg]) => {
      const enabled = state.era >= (cfg.minEra ?? 0);
      return `<button class="card-btn" data-build-type="${key}" ${enabled ? '' : 'disabled'}>
        <strong>${cfg.icon} ${cfg.name}</strong>
        <small>${costText(cfg.cost)} • ${cfg.baseBuildTime}с</small>
        <small>${categoryLabel(cfg.category)}</small>
      </button>`;
    }).join('');
  openDrawer('Строительство', 'Выбери тип, затем коснись клетки — или дважды тапни по соте для быстрого строительства', `<div class="card-grid">${cards}</div>`);
  $$('[data-build-type]').forEach((btn) => {
    btn.onclick = () => onChoose(btn.dataset.buildType);
  });
}

export function openQuickBuildMenu(state, tile, onChoose) {
  const candidates = Object.entries(BUILDINGS)
    .filter(([key, cfg]) => key !== 'capital' && (!cfg.minEra || state.era >= cfg.minEra))
    .filter(([, cfg]) => !cfg.terrain || cfg.terrain.includes(tile.type))
    .sort((a, b) => scoreCandidate(a[0], tile.type) - scoreCandidate(b[0], tile.type))
    .slice(0, 4);

  const cards = candidates.map(([key, cfg]) => `
    <button class="card-btn" data-quick-build="${key}">
      <strong>${cfg.icon} ${cfg.name}</strong>
      <small>${costText(cfg.cost)} • ${cfg.baseBuildTime}с</small>
      <small>${quickHint(key, tile.type)}</small>
    </button>`).join('');

  openDrawer(
    `Быстрая постройка`,
    `${TERRAIN_TYPES[tile.type].name} • двойной тап может строить мгновенно последнюю постройку`,
    cards || '<div class="list-item">Для этой клетки пока нет доступных построек.</div>'
  );

  $$('[data-quick-build]').forEach((btn) => {
    btn.onclick = () => onChoose(btn.dataset.quickBuild);
  });
}

export function openTrainMenu(state, onTrain) {
  const barracks = state.buildings.filter((b) => ['capital', 'barracks'].includes(b.type));
  if (!barracks.length) {
    openDrawer('Войска', 'Нет зданий для обучения', '<div class="list-item">Построй столицу или казармы.</div>');
    return;
  }
  const cards = barracks.map((building) => {
    const available = (BUILDINGS[building.type].train || []).map((unitType) => {
      const unit = UNITS[unitType];
      const disabled = state.era < (unit.minEra ?? 0);
      return `<button class="card-btn" data-train-building="${building.id}" data-unit-type="${unitType}" ${disabled ? 'disabled' : ''}>
        <strong>${unit.icon} ${unit.name}</strong>
        <small>${costText(unit.cost)} • ${unit.trainTime}с</small>
        <small>Очередь: ${building.trainQueue.length}</small>
      </button>`;
    }).join('');
    return `<div class="list-item"><strong>${BUILDINGS[building.type].name}</strong><div class="card-grid" style="margin-top:8px">${available}</div></div>`;
  }).join('');
  openDrawer('Войска', 'Обучение идёт в реальном времени', cards);
  $$('[data-unit-type]').forEach((btn) => {
    btn.onclick = () => onTrain(btn.dataset.trainBuilding, btn.dataset.unitType);
  });
}

export function openResearchMenu(state, notify) {
  const cards = TECHS.map((tech) => {
    const learned = state.techs.has(tech.id);
    const allowed = canResearch(state, tech);
    return `<button class="card-btn" data-tech-id="${tech.id}" ${allowed ? '' : 'disabled'}>
      <strong>${learned ? '✓' : '🔬'} ${tech.name}</strong>
      <small>${tech.desc}</small>
      <small>${learned ? 'Изучено' : `Стоимость: ${tech.cost} знания`}</small>
    </button>`;
  }).join('');
  const progress = state.techProgress ? `<div class="list-item">Текущее исследование: <strong>${state.techProgress.id}</strong><div class="progress"><div style="width:${Math.round(state.techProgress.progress / state.techProgress.duration * 100)}%"></div></div></div>` : '';
  openDrawer('Знания', 'Технологии открывают долгие бонусы', `${progress}<div class="card-grid">${cards}</div>`);
  $$('[data-tech-id]').forEach((btn) => {
    btn.onclick = () => {
      const ok = beginResearch(state, btn.dataset.techId);
      notify(ok ? 'Исследование начато' : 'Недостаточно знания или эпоха ещё не открыта');
    };
  });
}

function costText(cost = {}) {
  return Object.entries(cost).map(([k, v]) => `${v} ${k}`).join(', ');
}

function categoryLabel(key) {
  return ({ economy: 'Экономика', military: 'Оборона', culture: 'Культура', core: 'Центр' })[key] || key;
}

function scoreCandidate(type, terrain) {
  const preferred = {
    fertile: ['farm', 'granary', 'market'],
    river: ['farm', 'harbor', 'market'],
    forest: ['lumber', 'tower', 'wall'],
    hill: ['mine', 'tower', 'barracks'],
    rock: ['mine', 'temple', 'tower'],
    sacred: ['temple', 'academy', 'wonder'],
    grass: ['farm', 'market', 'barracks']
  };
  const list = preferred[terrain] || [];
  const idx = list.indexOf(type);
  return idx === -1 ? 99 : idx;
}

function quickHint(type, terrain) {
  if (type === 'farm' && (terrain === 'river' || terrain === 'fertile')) return 'Лучший урожай на этой земле';
  if (type === 'lumber' && terrain === 'forest') return 'Лес рядом ускоряет добычу';
  if (type === 'mine' && (terrain === 'hill' || terrain === 'rock')) return 'Хорошее место для руды и камня';
  if (type === 'temple' && terrain === 'sacred') return 'Священная зона усиливает престиж';
  if (type === 'harbor' && terrain === 'river') return 'Торговля у воды особенно сильна';
  return 'Подходит для текущей зоны';
}
