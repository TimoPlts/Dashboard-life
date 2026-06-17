const COOKIE_NAME = 'ld_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

// ── HMAC-SHA256 helpers ──
async function hmacSign(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  // base64url encode
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function hmacVerify(secret, message, sig) {
  const expected = await hmacSign(secret, message);
  // Constant-time comparison via HMAC of both strings
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const [a, b] = await Promise.all([
    crypto.subtle.sign('HMAC', key, enc.encode(expected)),
    crypto.subtle.sign('HMAC', key, enc.encode(sig)),
  ]);
  const va = new Uint8Array(a), vb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

// Sign a cookie value: "payload.signature"
async function signCookie(secret, payload) {
  const sig = await hmacSign(secret, payload);
  return payload + '.' + sig;
}

// Verify and return payload, or null
async function verifyCookie(secret, signed) {
  const dot = signed.lastIndexOf('.');
  if (dot === -1) return null;
  const payload = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);
  const ok = await hmacVerify(secret, payload, sig);
  if (!ok) return null;
  return payload;
}

// ── Cookie helpers ──
function getCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    if (trimmed.slice(0, eq).trim() === name) return trimmed.slice(eq + 1);
  }
  return null;
}

function makeAuthCookie(value) {
  return `${COOKIE_NAME}=${value}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Strict`;
}

function clearAuthCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

// ── Rate limiter (per edge instance) ──
const attempts = new Map();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

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

// ── Login page ──
function loginPage(error) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Life Dashboard</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{
  font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  background:#080809;color:#FAFAFA;
  display:flex;align-items:center;justify-content:center;
  min-height:100vh;padding:20px;position:relative;overflow:hidden;
}
body::before{
  content:'';position:fixed;inset:0;pointer-events:none;z-index:0;
  background:radial-gradient(ellipse at 80% 10%,rgba(224,118,88,0.12) 0%,transparent 52%),
             radial-gradient(ellipse at 15% 88%,rgba(107,227,164,0.05) 0%,transparent 50%);
  filter:blur(60px);
}
.card{
  position:relative;z-index:1;
  background:rgba(255,255,255,0.038);
  border:1px solid rgba(255,255,255,0.07);
  border-radius:20px;padding:36px 32px 32px;
  width:100%;max-width:360px;
  box-shadow:0 16px 48px rgba(0,0,0,0.55);
}
.logo{font-size:26px;margin-bottom:8px;}
h1{
  font-size:24px;font-weight:800;letter-spacing:-0.03em;
  background:linear-gradient(160deg,#FFFFFF 0%,#9E9C96 130%);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  line-height:1.1;margin-bottom:4px;
}
.sub{
  font-size:11px;color:#5C5A54;
  font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  letter-spacing:0.10em;text-transform:uppercase;margin-bottom:28px;
}
label{
  display:block;font-size:10px;font-weight:700;
  letter-spacing:0.12em;text-transform:uppercase;color:#5C5A54;
  margin-bottom:6px;
  font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
}
input[type=password]{
  width:100%;padding:12px 14px;border-radius:10px;
  border:1px solid rgba(255,255,255,0.07);
  background:rgba(255,255,255,0.04);color:#FAFAFA;
  font-size:15px;font-family:inherit;outline:none;
  transition:border-color 0.2s,background 0.2s;margin-bottom:14px;
}
input[type=password]:focus{border-color:rgba(255,255,255,0.14);background:rgba(255,255,255,0.07);}
input[type=password]::placeholder{color:#5C5A54;}
button{
  width:100%;padding:13px;border:none;border-radius:10px;
  background:linear-gradient(180deg,#E07658 0%,#C9623F 100%);
  color:#fff;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;
  box-shadow:0 1px 0 rgba(255,255,255,0.15) inset,0 4px 16px rgba(0,0,0,0.4);
  transition:transform 0.12s,box-shadow 0.12s;
}
button:hover{transform:translateY(-1px);}
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
  ${error ? '<div class="error">Incorrect password.</div>' : ''}
  <form method="POST" action="/login">
    <label for="pw">Password</label>
    <input type="password" id="pw" name="password" placeholder="Enter password" autocomplete="current-password" autofocus required>
    <button type="submit">Unlock</button>
  </form>
</div>
</body>
</html>`;
}

// ── Main handler ──
export default async function handler(request, context) {
  try {
    const url = new URL(request.url);
    const path = url.pathname;

    const secret = Deno.env.get('LIFE_DASHBOARD_AUTH_SECRET') || context.env?.LIFE_DASHBOARD_AUTH_SECRET;
    const password = Deno.env.get('LIFE_DASHBOARD_PASSWORD') || context.env?.LIFE_DASHBOARD_PASSWORD;

    if (!secret || !password) {
      return new Response(
        'Configuration error: LIFE_DASHBOARD_PASSWORD and LIFE_DASHBOARD_AUTH_SECRET must be set in Netlify environment variables.',
        { status: 500, headers: { 'Content-Type': 'text/plain' } }
      );
    }

    // ── Logout ──
    if (path === '/logout') {
      return new Response(null, {
        status: 302,
        headers: { 'Location': '/login', 'Set-Cookie': clearAuthCookie() },
      });
    }

    // ── Login POST ──
    if (path === '/login' && request.method === 'POST') {
      const ip = request.headers.get('x-nf-client-connection-ip')
        || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || 'unknown';

      if (!checkRateLimit(ip)) {
        return new Response(loginPage(true), {
          status: 429,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      let formData;
      try {
        formData = await request.formData();
      } catch {
        return new Response(loginPage(true), {
          status: 400,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      const submitted = formData.get('password') || '';

      // Constant-time password comparison via HMAC
      const ok = await hmacVerify(secret, submitted, await hmacSign(secret, password));

      if (!ok) {
        return new Response(loginPage(true), {
          status: 401,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      // Issue signed cookie with expiry
      const exp = String(Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE);
      const cookieValue = await signCookie(secret, 'auth:' + exp);

      return new Response(null, {
        status: 302,
        headers: { 'Location': '/', 'Set-Cookie': makeAuthCookie(cookieValue) },
      });
    }

    // ── Login GET ──
    if (path === '/login') {
      return new Response(loginPage(false), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // ── All other routes: check auth cookie ──
    const cookie = getCookie(request, COOKIE_NAME);
    if (cookie) {
      const payload = await verifyCookie(secret, cookie);
      if (payload) {
        // payload is "auth:TIMESTAMP"
        const exp = parseInt(payload.split(':')[1], 10);
        if (!isNaN(exp) && Math.floor(Date.now() / 1000) < exp) {
          return context.next(); // ✅ Serve the file
        }
      }
    }

    // Not authenticated
    return new Response(null, {
      status: 302,
      headers: { 'Location': '/login' },
    });

  } catch (err) {
    // Last-resort catch — never crash, never expose internals
    return new Response('An error occurred. Please try again.', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

export const config = { path: '/*' };
