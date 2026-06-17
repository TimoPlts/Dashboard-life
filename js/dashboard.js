import {
  trGetRoutine, trGetAllSessions, trGetPRs,
  dbGetSession, dbGetNutritionTargets, dbGetNutritionLog, dbGetBodyWeight,
  storeGet
} from './db.js';
import { pad2, getActiveDateString, formatDate, fmtHM, fmtClock, formatDateLong } from './ui.js';

const WAKE_HOUR = 8;
const SLEEP_HOUR = 24;
const CIRC = 2 * Math.PI * 52;
const SUN_PALETTE = [
  [255,216,158],[255,205,121],[255,227,143],[255,183,106],
  [255,149,89],[243,111,79],[226,93,122],[123,91,176],[47,58,102]
];

let tickerInterval = null;
let cycleIdx = 0;

function buildTickerItems() {
  const key = 'goals:' + getActiveDateString();
  const goals = storeGet(key) || [];
  const total = goals.length;
  const done = goals.filter(g => g.done).length;
  let items;
  if (total === 0) {
    items = [{ status: 'empty', text: 'No goals set for today.' }];
  } else if (done === total) {
    items = [{ status: 'done', text: '✓ All goals done — solid day.' }];
  } else {
    items = goals.filter(g => !g.done).map(g => ({ status: 'pending', text: g.text }));
  }
  return { items, meta: `${done}/${total}` };
}

function makeTickerRow(item) {
  const row = document.createElement('div');
  row.className = 'ticker-row';
  const statusSpan = document.createElement('span');
  statusSpan.className = 'ticker-status';
  statusSpan.setAttribute('data-status', item.status);
  statusSpan.textContent = item.status === 'done' ? '✓' : item.status === 'pending' ? '○' : '·';
  const textSpan = document.createElement('span');
  textSpan.className = 'ticker-text';
  textSpan.textContent = item.text;
  row.appendChild(statusSpan);
  row.appendChild(textSpan);
  return row;
}

function tick(isFirst) {
  const { items, meta } = buildTickerItems();
  document.getElementById('goalTickerMeta').textContent = meta;
  if (cycleIdx >= items.length) cycleIdx = 0;
  const item = items[cycleIdx];
  cycleIdx = (cycleIdx + 1) % items.length;
  const stage = document.getElementById('goalTickerStage');
  const newRow = makeTickerRow(item);
  if (isFirst) {
    stage.innerHTML = '';
    stage.appendChild(newRow);
  } else {
    const oldRow = stage.querySelector('.ticker-row');
    if (oldRow) {
      oldRow.classList.add('is-leaving');
      setTimeout(() => { if (oldRow.parentNode) oldRow.parentNode.removeChild(oldRow); }, 420);
    }
    newRow.classList.add('is-entering');
    stage.appendChild(newRow);
  }
}

export function startTicker() {
  cycleIdx = 0;
  tick(true);
  if (tickerInterval) clearInterval(tickerInterval);
  tickerInterval = setInterval(() => tick(false), 5000);
}

export function updateDashDate() {
  const d = getActiveDateString();
  document.getElementById('dashDate').textContent = formatDateLong(d);
}

function interpColor(pct) {
  const t = Math.max(0, Math.min(1, pct / 100));
  const scaled = t * (SUN_PALETTE.length - 1);
  const lo = Math.floor(scaled);
  const hi = Math.min(lo + 1, SUN_PALETTE.length - 1);
  const f = scaled - lo;
  return SUN_PALETTE[lo].map((v, i) => Math.round(v + (SUN_PALETTE[hi][i] - v) * f));
}

export function updateDayBar() {
  const now = new Date();
  const ringFill = document.getElementById('ringFill');
  const ringPct = document.getElementById('ringPct');
  const ringPhase = document.getElementById('ringPhase');
  const ringClock = document.getElementById('ringClock');
  const ringStatus = document.getElementById('ringStatus');
  const ringRemaining = document.getElementById('ringRemaining');
  ringClock.textContent = fmtClock(now);
  const hours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  if (hours < WAKE_HOUR) {
    ringFill.style.stroke = '#3A3836';
    ringFill.setAttribute('stroke-dasharray', CIRC);
    ringFill.setAttribute('stroke-dashoffset', CIRC);
    ringPct.textContent = '—';
    ringPhase.textContent = 'SLEEPING';
    ringStatus.textContent = '😴 Still sleeping';
    ringRemaining.textContent = fmtHM((WAKE_HOUR - hours) * 60) + ' until wake-up';
  } else if (hours < SLEEP_HOUR) {
    const pct = (hours - WAKE_HOUR) / (SLEEP_HOUR - WAKE_HOUR) * 100;
    const [r,g,b] = interpColor(pct);
    ringFill.style.stroke = `rgb(${r},${g},${b})`;
    ringFill.setAttribute('stroke-dasharray', CIRC);
    ringFill.setAttribute('stroke-dashoffset', CIRC * (1 - pct / 100));
    ringPct.textContent = Math.round(pct) + '%';
    let phase, status;
    if (pct < 25)      { phase = 'MORNING';   status = '☀️ Morning — fresh start'; }
    else if (pct < 50) { phase = 'MIDDAY';    status = '⚡ Midday — keep moving'; }
    else if (pct < 75) { phase = 'AFTERNOON'; status = '🔥 Afternoon — push it'; }
    else if (pct < 90) { phase = 'EVENING';   status = '⏳ Evening — wrap up'; }
    else               { phase = 'BEDTIME';   status = '🌙 Bedtime soon'; }
    ringPhase.textContent = phase;
    ringStatus.textContent = status;
    ringRemaining.textContent = fmtHM((SLEEP_HOUR - hours) * 60) + ' left today';
  } else {
    ringFill.style.stroke = 'rgb(226,93,122)';
    ringFill.setAttribute('stroke-dasharray', CIRC);
    ringFill.setAttribute('stroke-dashoffset', 0);
    ringPct.textContent = '100%';
    ringPhase.textContent = 'PAST BEDTIME';
    ringStatus.textContent = '⚠️ Past bedtime';
    ringRemaining.textContent = 'Time to sleep!';
  }
}

export async function trRefreshTiles() {
  const [routine, allSessions, prs, todaySession, nutTargets, nutLog, bodyRows] = await Promise.all([
    trGetRoutine(),
    trGetAllSessions(),
    trGetPRs(),
    dbGetSession(getActiveDateString()),
    dbGetNutritionTargets(),
    dbGetNutritionLog(getActiveDateString()),
    dbGetBodyWeight()
  ]);
  const today = getActiveDateString();

  // ── Workout tile ──
  let ws = 'Tap to log today';
  if (todaySession) {
    const done = todaySession.exercises.reduce((a, ex) => a + ex.sets.filter(s => s.done).length, 0);
    const total = todaySession.exercises.reduce((a, ex) => a + ex.sets.length, 0);
    ws = todaySession.done ? '✓ Session complete' : done + '/' + total + ' sets done';
  }
  document.getElementById('trTileWorkout').textContent = ws;

  // ── Progression tile ──
  const prCount = Object.keys(prs).length;
  document.getElementById('trTileProgression').textContent = prCount > 0 ? prCount + ' exercises tracked' : 'No sessions yet';

  // ── Nutrition tile ──
  if (nutTargets && nutLog) {
    const p = nutLog.protein || 0, c = nutLog.carbs || 0, f = nutLog.fat || 0;
    document.getElementById('trTileNutrition').textContent = p + 'g P · ' + c + 'g C · ' + f + 'g F';
  } else if (nutTargets) {
    document.getElementById('trTileNutrition').textContent = 'Targets set — log today';
  } else {
    document.getElementById('trTileNutrition').textContent = 'No targets set';
  }

  // ── Body tile ──
  if (bodyRows.length > 0) {
    const last = bodyRows[bodyRows.length - 1];
    const u = routine.units || 'kg';
    document.getElementById('trTileBody').textContent = u === 'lb' ? (last.kg * 2.20462).toFixed(1) + ' lb' : last.kg + ' kg';
  } else {
    document.getElementById('trTileBody').textContent = 'No entries yet';
  }

  // ── Dashboard gym tile stat ──
  document.getElementById('gymTileStat').textContent = ws !== 'Tap to log today' ? ws : 'Workout · Nutrition · Body';

  // Build a date→session data lookup from allSessions rows
  const sessionByDate = {};
  allSessions.forEach(row => { if (row.data) sessionByDate[row.date] = row.data; });

  // ── Hub: weekly volume bar chart ──
  const barChart = document.getElementById('hubBarChart');
  if (barChart) {
    const days7 = [];
    const DAY_ABBR = ['Su','Mo','Tu','We','Th','Fr','Sa'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate());
      const s = sessionByDate[ds];
      const vol = s ? s.exercises.reduce((a, ex) => a + ex.sets.filter(x => x.done).reduce((b, x) => b + x.weight * x.reps, 0), 0) : 0;
      days7.push({ ds, vol, label: DAY_ABBR[d.getDay()], isToday: i === 0 });
    }
    const maxVol = Math.max(...days7.map(d => d.vol), 1);
    const totalWeekVol = days7.reduce((a, d) => a + d.vol, 0);
    const weekEl = document.getElementById('hubWeekTotal');
    if (weekEl) weekEl.textContent = totalWeekVol > 0 ? (totalWeekVol / 1000).toFixed(1) + 't this week' : 'No data this week';
    barChart.innerHTML = '';
    days7.forEach(({ vol, label, isToday }) => {
      const wrap = document.createElement('div');
      wrap.className = 'hub-bar-wrap';
      const bar = document.createElement('div');
      const h = vol > 0 ? Math.max(6, Math.round((vol / maxVol) * 62)) : 3;
      bar.className = 'hub-bar' + (isToday ? ' today' : (vol > 0 ? ' has-data' : ''));
      bar.style.height = h + 'px';
      const lbl = document.createElement('div');
      lbl.className = 'hub-bar-label' + (isToday ? ' today' : '');
      lbl.textContent = label;
      wrap.appendChild(bar);
      wrap.appendChild(lbl);
      barChart.appendChild(wrap);
    });
  }

  // ── Hub: stats strip ──
  const totalSessions = allSessions.length;
  let totalVol = 0;
  allSessions.forEach(row => {
    const s = row.data;
    if (!s) return;
    totalVol += s.exercises.reduce((a, ex) => a + ex.sets.filter(x => x.done).reduce((b, x) => b + x.weight * x.reps, 0), 0);
  });

  const allDates = allSessions.map(r => r.date).sort();
  let bestStreak = 0, curStreak = 0;
  if (allDates.length > 0) {
    curStreak = 1; bestStreak = 1;
    for (let i = 1; i < allDates.length; i++) {
      const diff = (new Date(allDates[i]) - new Date(allDates[i-1])) / 86400000;
      if (diff === 1) { curStreak++; bestStreak = Math.max(bestStreak, curStreak); }
      else { curStreak = 1; }
    }
  }

  const ssEl = document.getElementById('hubStatSessions');
  const svEl = document.getElementById('hubStatVolume');
  const stEl = document.getElementById('hubStatStreak');
  if (ssEl) ssEl.textContent = totalSessions || '0';
  if (svEl) svEl.textContent = totalVol > 0 ? (totalVol / 1000).toFixed(1) + 't' : '0t';
  if (stEl) stEl.textContent = bestStreak > 0 ? bestStreak + 'd' : '0d';

  // ── Hub: recent PRs ──
  const prsList = document.getElementById('hubPRsList');
  if (prsList) {
    const prEntries = Object.values(prs)
      .filter(p => p.date && p.maxWeight > 0)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 3);
    if (prEntries.length === 0) {
      prsList.innerHTML = '<div class="empty-state" style="padding:10px 0 2px;">No PRs recorded yet.</div>';
    } else {
      prsList.innerHTML = '';
      prEntries.forEach(p => {
        const row = document.createElement('div');
        row.className = 'hub-pr-row';
        row.innerHTML =
          '<div class="hub-pr-name">' + (p.name || 'Unknown') + '</div>' +
          '<div class="hub-pr-weight">' + p.maxWeight + 'kg</div>' +
          '<div class="hub-pr-date">' + (p.date ? formatDate(p.date) : '') + '</div>';
        prsList.appendChild(row);
      });
    }
  }
}
