import { migrateFromLocalStorage } from './db.js';
import { updateDashDate, updateDayBar, startTicker, trRefreshTiles } from './dashboard.js';
import { trRenderWorkout, stopRest } from './workout.js';
import { trRenderProgression } from './progression.js';
import { trRenderNutrition } from './nutrition.js';
import { trRenderBody } from './body.js';
import { trRenderHistory } from './history.js';
import { renderFinance } from './finance.js';

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

function trNav(viewId) {
  if (viewId !== 'workout') stopRest();
  document.querySelectorAll('#viewGym .tr-view').forEach(v => v.classList.remove('tr-active'));
  const idMap = { hub:'trHub', workout:'trWorkout', progression:'trProgression', nutrition:'trNutrition', body:'trBody', history:'trHistory' };
  const target = document.getElementById(idMap[viewId]);
  if (!target) return;
  target.classList.add('tr-active');
  localStorage.setItem('training:lastView', viewId);

  const refreshCb = () => trRefreshTiles();
  const navHistoryCb = () => trNav('history');

  if (viewId === 'hub')         trRefreshTiles();
  else if (viewId === 'workout')     trRenderWorkout(navHistoryCb, refreshCb);
  else if (viewId === 'progression') trRenderProgression();
  else if (viewId === 'nutrition')   trRenderNutrition(refreshCb);
  else if (viewId === 'body')        trRenderBody(refreshCb);
  else if (viewId === 'history')     trRenderHistory(refreshCb);
}

// ── Event listeners ──
document.getElementById('gymTile').addEventListener('click', () => {
  showView('viewGym');
  trNav('hub');
});
document.getElementById('gymTile').addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    showView('viewGym');
    trNav('hub');
  }
});

document.getElementById('gymBackBtn').addEventListener('click', () => {
  showView('viewDash');
});

document.getElementById('financeTile').addEventListener('click', () => {
  showView('viewFinance');
  renderFinance();
});
document.getElementById('financeTile').addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    showView('viewFinance');
    renderFinance();
  }
});

document.getElementById('financeBackBtn').addEventListener('click', () => {
  showView('viewDash');
});

document.querySelectorAll('.hub-nav-tile[data-nav]').forEach(tile => {
  tile.addEventListener('click', () => trNav(tile.dataset.nav));
});

document.querySelectorAll('.back-btn[data-back]').forEach(btn => {
  btn.addEventListener('click', () => trNav(btn.dataset.back));
});

// ── Init ──
async function init() {
  updateDashDate();
  updateDayBar();
  setInterval(updateDayBar, 60 * 1000);
  startTicker();
  await migrateFromLocalStorage();
  await trRefreshTiles();
}

init();
