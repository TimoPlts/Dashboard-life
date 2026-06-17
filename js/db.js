import { showToast, getActiveDateString } from './ui.js';

const SUPABASE_URL = 'https://qoflumocndwzegzbjpkm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvZmx1bW9jbmR3emVnemJqcGttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NDk4MDIsImV4cCI6MjA5NzEyNTgwMn0.yot7wHj6ScpnBwOGg_Ted4jsonKJL32vFuvNtCXYKEo';

function sbHeaders(extra) {
  return Object.assign({ 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }, extra || {});
}
async function sbSelect(table, query) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + table + (query ? '?' + query : ''), { headers: sbHeaders() });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function sbUpsert(table, data) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
    method: 'POST',
    headers: sbHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error(await r.text());
}
async function sbInsert(table, data) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
    method: 'POST',
    headers: sbHeaders({ 'Prefer': 'return=minimal' }),
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error(await r.text());
}
async function sbDelete(table, query) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + query, {
    method: 'DELETE',
    headers: sbHeaders()
  });
  if (!r.ok) throw new Error(await r.text());
}

// ── localStorage helpers (used only during migration) ──
export function storeGet(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
export function storeSet(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
export function storeDelete(key) { localStorage.removeItem(key); }
export function storeListKeys(prefix) {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) keys.push(k);
  }
  return keys;
}

// ── Supabase data layer ──
export async function dbGetSession(date) {
  try {
    const rows = await sbSelect('sessions', 'date=eq.' + date);
    return rows[0]?.data || null;
  } catch(e) { showToast('Load session failed: ' + e.message, 'error'); return null; }
}
export async function dbSaveSession(date, session) {
  await sbUpsert('sessions', { id: date, date, day_name: session.day || '', done: !!session.done, data: session });
}
export async function dbListSessions() {
  try {
    return await sbSelect('sessions', 'order=date.desc');
  } catch(e) { showToast('Load sessions failed', 'error'); return []; }
}
export async function dbDeleteSession(date) {
  await sbDelete('sessions', 'date=eq.' + date);
}

export async function dbGetPRs() {
  try {
    const rows = await sbSelect('prs');
    const out = {};
    rows.forEach(r => {
      out[r.exercise_id] = { maxWeight: r.max_weight, maxE1RM: r.max_e1rm, name: r.exercise_name, date: r.pr_date };
    });
    return out;
  } catch(e) { return {}; }
}
export async function dbSavePR(exId, pr) {
  await sbUpsert('prs', { exercise_id: exId, exercise_name: pr.name || '', max_weight: pr.maxWeight || 0, max_e1rm: pr.maxE1RM || 0, pr_date: pr.date || '' });
}

export async function dbGetRoutine() {
  try {
    const rows = await sbSelect('routine', 'id=eq.1');
    if (!rows[0]) return { units: 'kg', days: [] };
    return { units: rows[0].units || 'kg', days: rows[0].data || [] };
  } catch(e) { return { units: 'kg', days: [] }; }
}
export async function dbSaveRoutine(r) {
  await sbUpsert('routine', { id: 1, units: r.units || 'kg', data: r.days || [] });
}

export async function dbGetBodyWeight() {
  try { return await sbSelect('body_weight', 'order=date.asc'); } catch(e) { return []; }
}
export async function dbAddBodyWeight(entry) {
  await sbInsert('body_weight', { date: entry.date, kg: entry.kg, measurements: entry.measurements || null });
}
export async function dbDeleteBodyWeight(id) {
  await sbDelete('body_weight', 'id=eq.' + id);
}

export async function dbGetNutritionLog(date) {
  try {
    const rows = await sbSelect('nutrition_log', 'date=eq.' + date);
    return rows[0] || null;
  } catch(e) { return null; }
}
export async function dbSaveNutritionLog(date, entry) {
  await sbUpsert('nutrition_log', { date, kcal: entry.kcal||0, protein: entry.protein||0, carbs: entry.carbs||0, fat: entry.fat||0 });
}

export async function dbGetNutritionTargets() {
  try {
    const rows = await sbSelect('nutrition_targets', 'id=eq.1');
    return rows[0] || null;
  } catch(e) { return null; }
}
export async function dbSaveNutritionTargets(t) {
  await sbUpsert('nutrition_targets', { id: 1, mode: t.mode||'maintain', kcal: t.kcal||2200, protein: t.protein||170, carbs: t.carbs||220, fat: t.fat||60 });
}

// ── In-memory cache ──
let _routineCache = null;
let _prsCache = null;
let _sessionsCache = null;

export function invalidateCaches() {
  _routineCache = null;
  _prsCache = null;
  _sessionsCache = null;
}
export function setPRsCache(p) { _prsCache = p; }
export function setSessionsCache(v) { _sessionsCache = v; }

export async function trGetRoutine() {
  if (_routineCache) return _routineCache;
  _routineCache = await dbGetRoutine();
  return _routineCache;
}
export async function trSaveRoutine(r) {
  _routineCache = r;
  await dbSaveRoutine(r);
}

export async function trGetSession(date) {
  return dbGetSession(date);
}
export async function trSaveSession(date, s) {
  await dbSaveSession(date, s);
  _sessionsCache = null;
}

export async function trGetPRs() {
  if (_prsCache) return _prsCache;
  _prsCache = await dbGetPRs();
  return _prsCache;
}
export async function trSavePRs(p) {
  _prsCache = p;
  for (const [exId, pr] of Object.entries(p)) {
    await dbSavePR(exId, pr);
  }
}

export async function trGetAllSessions() {
  if (_sessionsCache) return _sessionsCache;
  _sessionsCache = await dbListSessions();
  return _sessionsCache;
}

export function trGenId() { return Math.random().toString(36).slice(2, 10); }
export function epley(w, r) { return r === 1 ? w : w * (1 + r / 30); }

// ── One-time migration from localStorage → Supabase ──
export async function migrateFromLocalStorage() {
  if (localStorage.getItem('sb_migrated')) return;
  const sessionKeys = storeListKeys('training:session:');
  if (sessionKeys.length === 0 && !storeGet('training:prs') && !storeGet('training:routine')) {
    localStorage.setItem('sb_migrated', '1');
    return;
  }
  showToast('Migrating local data to Supabase…', 'ok');
  try {
    for (const k of sessionKeys) {
      const s = storeGet(k);
      if (s) await dbSaveSession(k.slice(17), s);
    }
    const prs = storeGet('training:prs') || {};
    for (const [exId, pr] of Object.entries(prs)) await dbSavePR(exId, pr);
    const routine = storeGet('training:routine');
    if (routine) await dbSaveRoutine(routine);
    const bw = storeGet('body:weight') || [];
    for (const e of bw) await dbAddBodyWeight(e);
    const targets = storeGet('nutrition:targets');
    if (targets) await dbSaveNutritionTargets(targets);
    const today = getActiveDateString();
    const nlog = storeGet('nutrition:log:' + today);
    if (nlog) await dbSaveNutritionLog(today, nlog);
    localStorage.setItem('sb_migrated', '1');
    showToast('Migration complete ✓', 'ok');
  } catch(e) {
    showToast('Migration error: ' + e.message, 'error');
  }
}
