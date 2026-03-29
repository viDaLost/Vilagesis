import { $ } from './dom.js';

const recent = new Map();

export function notify(text, ttl = 2500) {
  const now = performance.now();
  const last = recent.get(text) || 0;
  if (now - last < 700) return;
  recent.set(text, now);
  const root = $('#notifications');
  const el = document.createElement('div');
  el.className = 'notice';
  el.textContent = text;
  root.appendChild(el);
  setTimeout(() => el.remove(), ttl);
}
