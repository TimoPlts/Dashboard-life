const COOKIE_NAME = 'ld_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// Public paths that never require auth (login page assets only)
const PUBLIC_PATHS = ['/login', '/__netlify_edge_functions'];

// ── Constant-time string comparison to prevent timing attacks ──
async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const ka = await crypto.subtle.importKey('raw', enc.encode(a), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const kb = await crypto.subtle.importKey('raw', enc.encode(b), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const dummy = enc.encode('compare');
  const [sa, sb] = await Promise.all([
    crypto.subtle.sign('HMAC', ka, dummy),
    crypto.subtle.sign('HMAC', kb, dummy),
  ]);
  const va = new Uint8Array(sa), vb = new Uint8Array(sb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

// ── HMAC-SHA256 cookie signing ──
async function signValue(secret, value) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return value + '.' + b64;
}

async function verifyValue(secret, signed) {
  const dot = signed.lastIndexOf('.');
  if (dot === -1) return false;
  const value = signed.slice(0, dot);
  const expected = await signValue(secret, value);
  return safeEqual(expected, signed);
}

// ── Cookie helpers ──
function getCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k.trim() === name) return rest.join('=');
  }
  return null;
}

function makeAuthCookie(value) {
  return `${COOKIE_NAME}=${value}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Strict`;
}

function clearAuthCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

// ── Simple in-memory rate limiter (per edge instance) ──
const attempts = new Map(); // ip → { count, resetAt }
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

function clearRateLimit(ip) {
  attempts.delete(ip);
}

// ── Login page HTML ──
function loginPage(error) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Life Dashboard</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,Helvetica,Arial,sans-serif}
body{
  background:#080809;
  color:#FAFAFA;
  display:flex;align-items:center;justify-content:center;
  min-height:100vh;
  padding:20px;
  position:relative;
  overflow:hidden;
}
body::before{
  content:'';position:fixed;inset:0;
  background:radial-gradient(ellipse at 80% 10%,rgba(224,118,88,0.12) 0%,transparent 52%),
             radial-gradient(ellipse at 15% 88%,rgba(107,227,164,0.05) 0%,transparent 50%);
  filter:blur(60px);pointer-events:none;z-index:0;
}
body::after{
  content:'';position:fixed;inset:0;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'%3E%3Crect width='1' height='1' fill='rgba(255,255,255,0.010)'/%3E%3C/svg%3E");
  background-size:4px 4px;pointer-events:none;z-index:0;
}
.card{
  position:relative;z-index:1;
  background:rgba(255,255,255,0.038);
  border:1px solid rgba(255,255,255,0.07);
  border-radius:20px;
  padding:36px 32px 32px;
  width:100%;max-width:360px;
  box-shadow:0 16px 48px rgba(0,0,0,0.55);
}
.logo{font-size:28px;margin-bottom:6px;}
h1{
  font-size:24px;font-weight:800;letter-spacing:-0.03em;
  background:linear-gradient(160deg,#FFFFFF 0%,#9E9C96 130%);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  line-height:1.1;margin-bottom:4px;
}
.sub{font-size:12px;color:#5C5A54;font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:28px;}
label{display:block;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#5C5A54;margin-bottom:6px;font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;}
input[type=password]{
  width:100%;padding:12px 14px;
  border-radius:10px;border:1px solid rgba(255,255,255,0.07);
  background:rgba(255,255,255,0.04);color:#FAFAFA;
  font-size:15px;font-family:inherit;outline:none;
  transition:border-color 0.2s,background 0.2s;
  margin-bottom:14px;
}
input[type=password]:focus{border-color:rgba(255,255,255,0.14);background:rgba(255,255,255,0.07);}
input[type=password]::placeholder{color:#5C5A54;}
button{
  width:100%;padding:13px;border:none;border-radius:10px;
  background:linear-gradient(180deg,#E07658 0%,#C9623F 100%);
  color:#fff;font-size:14px;font-weight:700;font-family:inherit;
  cursor:pointer;letter-spacing:0.01em;
  box-shadow:0 1px 0 rgba(255,255,255,0.15) inset,0 4px 16px rgba(0,0,0,0.4);
  transition:transform 0.12s,box-shadow 0.12s;
}
button:hover{transform:translateY(-1px);box-shadow:0 1px 0 rgba(255,255,255,0.2) inset,0 6px 20px rgba(0,0,0,0.5);}
button:active{transform:scale(0.99);}
.error{
  background:rgba(255,107,107,0.1);border:1px solid rgba(255,107,107,0.25);
  color:#FF6B6B;border-radius:8px;padding:10px 12px;
  font-size:12.5px;font-weight:600;margin-bottom:14px;text-align:center;
}
</style>
</head>
<body>
<div class="card">
  <div class="logo">◆</div>
  <h1>Life Dashboard</h1>
  <div class="sub">Private dashboard</div>
  ${error ? `<div class="error">Incorrect password.</div>` : ''}
  <form method="POST" action="/login">
    <label for="pw">Password</label>
    <input type="password" id="pw" name="password" placeholder="Enter password" autocomplete="current-password" autofocus required>
    <button type="submit">Unlock</button>
  </form>
</div>
</body>
</html>`;
}

// ── Edge function handler ──
export default async function handler(request, context) {
  const url = new URL(request.url);
  const path = url.pathname;
  const secret = context.env.LIFE_DASHBOARD_AUTH_SECRET;
  const password = context.env.LIFE_DASHBOARD_PASSWORD;

  // Must have env vars configured
  if (!secret || !password) {
    return new Response('Server misconfigured: missing environment variables.', { status: 500 });
  }

  // ── Handle logout ──
  if (path === '/logout') {
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/login',
        'Set-Cookie': clearAuthCookie(),
      },
    });
  }

  // ── Handle login POST ──
  if (path === '/login' && request.method === 'POST') {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

    if (!checkRateLimit(ip)) {
      return new Response(loginPage(true), {
        status: 429,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    let body;
    try {
      body = await request.formData();
    } catch {
      return new Response(loginPage(true), { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    const submitted = body.get('password') || '';
    const valid = await safeEqual(submitted, password);

    if (!valid) {
      return new Response(loginPage(true), {
        status: 401,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // Correct password — clear rate limit, issue signed cookie, redirect
    clearRateLimit(ip);
    const expires = String(Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE);
    const cookieValue = await signValue(secret, 'auth:' + expires);

    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/',
        'Set-Cookie': makeAuthCookie(cookieValue),
      },
    });
  }

  // ── Handle login GET ──
  if (path === '/login') {
    return new Response(loginPage(false), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // ── All other requests: verify auth cookie ──
  const cookie = getCookie(request, COOKIE_NAME);
  if (cookie) {
    const valid = await verifyValue(secret, cookie);
    if (valid) {
      // Check expiry embedded in cookie value
      const dot = cookie.lastIndexOf('.');
      const value = cookie.slice(0, dot); // "auth:1234567890"
      const parts = value.split(':');
      const exp = parseInt(parts[1], 10);
      if (!isNaN(exp) && Math.floor(Date.now() / 1000) < exp) {
        return context.next(); // ✅ Authenticated — serve the file
      }
    }
  }

  // Not authenticated — redirect to login
  return new Response(null, {
    status: 302,
    headers: { 'Location': '/login' },
  });
}

export const config = { path: '/*' };
