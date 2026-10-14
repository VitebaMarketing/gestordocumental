'use strict';
/* =========================================================================
   Circuito de firmas de diseño · Gafial Group
   Web estática (GitHub Pages). Datos en Supabase si está configurado en
   config.js; si no, en el propio navegador (modo local de demostración).
   ========================================================================= */

const CFG = Object.assign({ appName: 'Circuito de firmas', company: '', supabaseUrl: '', supabaseAnonKey: '' }, window.APP_CONFIG || {});
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
const ST = { INC: 'En circuito', REJ: 'Rechazado', APR: 'Aprobado', SUP: 'Sustituida' };
const BADGE = { 'En circuito': 'st-pending', 'Rechazado': 'st-ko', 'Aprobado': 'st-ok', 'Sustituida': 'st-muted', 'Pendiente': 'st-pending', 'Esperando turno': 'st-muted', 'OK': 'st-ok', '—': 'st-muted' };
const COLLS = ['users', 'doctypes', 'prodcats', 'products', 'circuits', 'documents', 'signatures', 'events'];

/* ---------- Utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const now = () => new Date().toISOString();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const normEmail = s => String(s ?? '').trim().toLowerCase();
const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const fmtDT = d => d ? new Date(d).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const fmtDTs = d => d ? new Date(d).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
const fmtDay = d => d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const fmtTime = d => d ? new Date(d).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
const localDay = d => new Date(d).toLocaleDateString('sv-SE');
const badge = s => `<span class="badge ${BADGE[s] || ''}">${esc(s)}</span>`;
const enc = encodeURIComponent;
function toast(msg, ms = 3200) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms); }
async function sha256hex(data) { const h = await crypto.subtle.digest('SHA-256', data); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join(''); }
const sha256str = s => sha256hex(new TextEncoder().encode(s));
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
const safeName = n => String(n).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').slice(-120);
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar ' + src)); document.head.appendChild(s); }); }
function loadImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Imagen no válida')); i.src = src; }); }

const recoverFlag = {
  set(email) { try { localStorage.setItem('gf_recover', JSON.stringify({ email, t: Date.now() })); } catch { } },
  get(email) { try { const f = JSON.parse(localStorage.getItem('gf_recover') || 'null'); return !!f && f.email === email && Date.now() - f.t < 2 * 3600e3; } catch { return false; } },
  clear() { try { localStorage.removeItem('gf_recover'); } catch { } },
};

/* ---------- Almacenamiento: modo local (IndexedDB) ---------- */
function localStore() {
  let db;
  const tx = (st, mode, fn) => new Promise((res, rej) => { const t = db.transaction(st, mode); const q = fn(t.objectStore(st)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); });
  const store = {
    mode: 'local',
    init: () => new Promise((res, rej) => {
      const r = indexedDB.open('gafial-firmas', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('records'); r.result.createObjectStore('files'); };
      r.onsuccess = () => { db = r.result; res(); }; r.onerror = () => rej(r.error);
    }),
    all: coll => tx('records', 'readonly', s => s.getAll(IDBKeyRange.bound(coll + '|', coll + '|￿'))),
    get: (coll, id) => tx('records', 'readonly', s => s.get(coll + '|' + id)),
    put: (coll, obj) => tx('records', 'readwrite', s => s.put(obj, coll + '|' + obj.id)),
    add: (coll, obj) => tx('records', 'readwrite', s => s.add(obj, coll + '|' + obj.id)),
    del: (coll, id) => tx('records', 'readwrite', s => s.delete(coll + '|' + id)),
    putFile: (path, buf, type) => tx('files', 'readwrite', s => s.put({ type, data: buf }, path)),
    async getFile(path) { const f = await tx('files', 'readonly', s => s.get(path)); return f ? f.data : null; },
    async session() { return localStorage.getItem('gf_session'); },
    async signIn(email, pass) {
      const u = await store.get('users', email);
      if (!u || !u.passHash) return { firstTime: true };
      if (u.passHash !== await sha256str(u.salt + pass)) throw new Error('Contraseña incorrecta.');
      localStorage.setItem('gf_session', email); return { email };
    },
    async signUp(email, pass) {
      const u = (await store.get('users', email)) || { id: email, email, name: '', role: '', createdAt: now() };
      if (u.passHash) throw new Error('Este usuario ya tiene contraseña.');
      u.salt = uid(); u.passHash = await sha256str(u.salt + pass);
      await store.put('users', u); localStorage.setItem('gf_session', email); return { email };
    },
    async signOut() { localStorage.removeItem('gf_session'); },
    async resetPassword(email) {
      const u = await store.get('users', email);
      if (u) { delete u.passHash; delete u.salt; await store.put('users', u); }
      return { local: true };
    },
    async updatePassword(pass) {
      const email = localStorage.getItem('gf_session'); const u = await store.get('users', email);
      u.salt = uid(); u.passHash = await sha256str(u.salt + pass); await store.put('users', u);
    },
  };
  return store;
}

/* ---------- Almacenamiento: Supabase (multiusuario) ---------- */
function supaStore() {
  const recoveryInUrl = /type=recovery/.test(location.hash + location.search);
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' } });
  let recovery = recoveryInUrl;
  sb.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY') recovery = true; });
  const BUCKET = 'documentos';
  const chk = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  return {
    mode: 'supabase',
    async init() { },
    async all(coll) {
      const out = [];
      for (let from = 0; ; from += 1000) {
        const d = chk(await sb.from('records').select('data').eq('coll', coll).range(from, from + 999));
        out.push(...d.map(r => r.data)); if (d.length < 1000) break;
      }
      return out;
    },
    async get(coll, id) { const d = chk(await sb.from('records').select('data').eq('coll', coll).eq('id', id).maybeSingle()); return d ? d.data : null; },
    async put(coll, obj) { chk(await sb.from('records').upsert({ coll, id: obj.id, data: obj, updated_at: now() })); },
    async add(coll, obj) { chk(await sb.from('records').insert({ coll, id: obj.id, data: obj, updated_at: now() })); },
    async del(coll, id) { chk(await sb.from('records').delete().eq('coll', coll).eq('id', id)); },
    async putFile(path, buf, type) { chk(await sb.storage.from(BUCKET).upload(path, new Blob([buf], { type }), { contentType: type, upsert: false })); },
    async getFile(path) { const b = chk(await sb.storage.from(BUCKET).download(path)); return b.arrayBuffer(); },
    async session() { const { data } = await sb.auth.getSession(); const e = data.session?.user?.email; return e ? normEmail(e) : null; },
    async signIn(email, pass) {
      const { error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (error) {
        if (/invalid login/i.test(error.message)) return { firstTime: true };
        if (/not confirmed/i.test(error.message)) throw new Error('Tu correo aún no está confirmado: revisa tu bandeja de entrada.');
        throw new Error(error.message);
      }
      recoverFlag.clear();
      return { email };
    },
    async signUp(email, pass) {
      const { data, error } = await sb.auth.signUp({ email, password: pass, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) {
        if (/already registered/i.test(error.message)) throw new Error('Este correo ya tiene cuenta y la contraseña no es correcta. Pulsa «¿Has olvidado tu contraseña?» para crear una nueva.');
        throw new Error(error.message);
      }
      if (!data.session) return { needsConfirm: true };
      return { email };
    },
    async signOut() { await sb.auth.signOut(); },
    isRecovery: () => recovery,
    async resetPassword(email) {
      recoverFlag.set(email);
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (error) throw new Error(/rate limit|security purposes/i.test(error.message) ? 'Se han enviado demasiados correos. Espera unos minutos y vuelve a intentarlo.' : error.message);
      return {};
    },
    async updatePassword(pass) {
      const { error } = await sb.auth.updateUser({ password: pass });
      if (error) throw new Error(/same/i.test(error.message) ? 'La nueva contraseña debe ser distinta de la anterior.' : error.message);
      recovery = false; recoverFlag.clear();
    },
  };
}

/* ---------- Datos iniciales ---------- */
const SEED = {
  users: [
    { id: 'respinosa@viteba.com', email: 'respinosa@viteba.com', name: 'R. Espinosa', role: 'Graphic designer' },
    { id: 'aheredia@viteba.com', email: 'aheredia@viteba.com', name: 'A. Heredia', role: 'Product' },
    { id: 'amanas@viteba.com', email: 'amanas@viteba.com', name: 'A. Mañas', role: 'Executives' },
    { id: 'cbianchi@viteba.com', email: 'cbianchi@viteba.com', name: 'C. Bianchi', role: 'Executives' },
    { id: 'ggalimberti@doribac.com', email: 'ggalimberti@doribac.com', name: 'G. Galimberti', role: 'CEO' },
  ],
  doctypes: [
    { id: 'dt-aaff', name: 'Diseño AAFF', description: 'Artes finales para producción' },
    { id: 'dt-pack', name: 'Packaging', description: 'Estuches, cajas y envases' },
    { id: 'dt-etiq', name: 'Etiqueta', description: '' },
    { id: 'dt-plv', name: 'Material PLV', description: 'Expositores y punto de venta' },
    { id: 'dt-otro', name: 'Otro', description: '' },
  ],
  prodcats: [
    { id: 'pc-beauty', name: 'Beauty', description: '' },
    { id: 'pc-general', name: 'General', description: '' },
  ],
  products: [
    { id: 'p-ma-est-col-beauty', code: 'MA.EST.COL.BEAUTY', name: 'Estuche colección Beauty', categoryId: 'pc-beauty', description: 'Producto de ejemplo: edítalo o elimínalo' },
  ],
  circuits: [
    { id: 'c-aaff', name: 'Aprobación de diseños AAFF', description: 'Revisión y OK de artes finales', order: 'any',
      signers: [{ email: 'respinosa@viteba.com', role: 'Graphic designer' }, { email: 'aheredia@viteba.com', role: 'Product' }] },
    { id: 'c-dir', name: 'Aprobación de Dirección', description: 'OK final de Dirección', order: 'any',
      signers: [{ email: 'amanas@viteba.com', role: 'Executives' }, { email: 'cbianchi@viteba.com', role: 'Executives' }, { email: 'ggalimberti@doribac.com', role: 'CEO' }] },
  ],
};
async function seedIfEmpty() {
  if (await store.get('meta', 'seed')) return;
  for (const [coll, rows] of Object.entries(SEED))
    for (const r of rows) {
      const ex = await store.get(coll, r.id);
      if (!ex) await store.put(coll, { ...r, createdAt: now() });
      else if (coll === 'users' && (!ex.name || !ex.role)) await store.put(coll, { ...ex, name: ex.name || r.name, role: ex.role || r.role });
    }
  await store.put('meta', { id: 'seed', at: now() });
}

/* ---------- Datos de ejemplo para la demo (solo si config.js pide demoSeed) ---------- */
function fakeSignature(seed) {
  const c = document.createElement('canvas'); c.width = 380; c.height = 130; const x = c.getContext('2d');
  let r = seed; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  x.strokeStyle = '#0b1a3a'; x.lineWidth = 3; x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath(); x.moveTo(20, 80);
  for (let i = 0; i < 7; i++) { const bx = 20 + i * 48; x.bezierCurveTo(bx + 10, 10 + rnd() * 30, bx + 30, 120 - rnd() * 20, bx + 48, 50 + rnd() * 40); }
  x.stroke(); x.beginPath(); x.moveTo(30, 105); x.quadraticCurveTo(190, 85 + rnd() * 20, 350, 100); x.lineWidth = 2; x.stroke();
  return trimCanvas(c).toDataURL('image/png');
}
async function demoPdf(title, code, color) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib; const p = await PDFDocument.create();
  const f = await p.embedFont(StandardFonts.HelveticaBold), n = await p.embedFont(StandardFonts.Helvetica);
  const pg = p.addPage([841.89, 595.28]);
  pg.drawRectangle({ x: 40, y: 40, width: 761, height: 515, borderColor: rgb(.75, .77, .8), borderWidth: 1 });
  pg.drawRectangle({ x: 70, y: 130, width: 330, height: 360, color: rgb(...color) });
  pg.drawRectangle({ x: 440, y: 130, width: 330, height: 360, color: rgb(color[0] * .85, color[1] * .85, color[2] * .85) });
  pg.drawText('BEAUTY', { x: 120, y: 330, size: 54, font: f, color: rgb(1, 1, 1) });
  pg.drawText('Colección 2027', { x: 124, y: 295, size: 18, font: n, color: rgb(1, 1, 1) });
  pg.drawText(T(title), { x: 70, y: 520, size: 16, font: f, color: rgb(.1, .12, .2) });
  pg.drawText(T(`${code} · DOCUMENTO DE EJEMPLO PARA LA DEMO`), { x: 70, y: 100, size: 9, font: n, color: rgb(.4, .42, .47) });
  pg.drawText('Texto legal 4 pt: revisa con zoom que se lee correctamente.', { x: 470, y: 150, size: 4, font: n, color: rgb(1, 1, 1) });
  return p.save();
}
async function seedDemo() {
  if (!CFG.demoSeed || !window.PDFLib || await store.get('meta', 'demo')) return;
  const day = 864e5, t = Date.now();
  const iso = ms => new Date(t - ms).toISOString();
  for (const [email, k] of [['respinosa@viteba.com', 11], ['aheredia@viteba.com', 23], ['amanas@viteba.com', 37]]) {
    const u = await store.get('users', email); if (u && !u.signature) { u.signature = fakeSignature(k); u.signatureAt = iso(9 * day); await store.put('users', u); }
  }
  const mk = async (id, code, title, docTypeId, circuitId, color, uploader, upAgo, signs) => {
    const c = await store.get('circuits', circuitId); const bytes = await demoPdf(title, code, color);
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const path = `docs/${id}/v1/ejemplo.pdf`; await store.putFile(path, buf, 'application/pdf');
    const v = { n: 1, title, fileName: 'ejemplo.pdf', fileType: 'application/pdf', path, hash: await sha256hex(buf), size: buf.byteLength,
      uploadedBy: uploader, uploadedAt: iso(upAgo), note: 'Documento de ejemplo de la demo', signers: signerList(c), order: c.order, circuitName: c.name };
    await store.put('documents', { id, code, title, docTypeId, circuitId, createdBy: uploader, createdAt: iso(upAgo), versions: [v] });
    await store.add('events', { id: uid(), docId: id, at: iso(upAgo), email: uploader, action: 'Subida V1', detail: 'ejemplo.pdf · circuito ' + c.name });
    for (const [email, ago] of signs) {
      const u = await store.get('users', email);
      await store.add('signatures', { id: `${id}|1|${email}`, docId: id, v: 1, email, name: u.name, role: signerList(c).find(s => s.email === email)?.role || '', decision: 'OK', comment: '', signature: u.signature, at: iso(ago) });
      await store.add('events', { id: uid(), docId: id, at: iso(ago), email, action: 'Firmado OK · V1', detail: '' });
    }
  };
  await mk('doc-demo-1', 'MA.EST.COL.BEAUTY', 'Estuche colección Beauty · cara frontal (ejemplo)', 'dt-aaff', 'c-aaff', [.78, .28, .47], 'respinosa@viteba.com', 3 * day, [['respinosa@viteba.com', 3 * day - 3600e3], ['aheredia@viteba.com', 2 * day]]);
  await mk('doc-demo-2', 'MA.ETQ.BEAUTY.30ML', 'Etiqueta frontal 30 ml (ejemplo)', 'dt-etiq', 'c-dir', [.16, .33, .52], 'aheredia@viteba.com', 1 * day, [['amanas@viteba.com', 20 * 3600e3]]);
  if (!(await store.get('products', 'p-ma-etq-beauty-30ml'))) await store.put('products', { id: 'p-ma-etq-beauty-30ml', code: 'MA.ETQ.BEAUTY.30ML', name: 'Etiqueta Beauty 30 ml (ejemplo)', categoryId: 'pc-beauty', description: '' });
  await store.put('meta', { id: 'demo', at: now() });
}

/* ---------- Estado y reglas del circuito ---------- */
let store, ME = null;
const D = Object.fromEntries(COLLS.map(c => [c, []]));
async function refresh() {
  const res = await Promise.all(COLLS.map(c => store.all(c)));
  COLLS.forEach((c, i) => { D[c] = res[i]; });
  ME = D.users.find(u => u.id === ME.id) || ME;
}
const byId = (coll, id) => D[coll].find(x => x.id === id);
const userOf = e => D.users.find(u => u.id === e);
const uname = e => userOf(e)?.name || e;
const approvedList = () => D.documents.flatMap(d => d.versions.filter(v => verStatus(d, v) === ST.APR).map(v => ({ d, v, at: approvedAt(d, v) }))).sort((a, b) => b.at.localeCompare(a.at));
const latest = d => d.versions[d.versions.length - 1];
const productOf = d => D.products.find(p => p.code.toLowerCase() === d.code.toLowerCase());
const sigsOf = (docId, n) => D.signatures.filter(s => s.docId === docId && s.v === n);
const signerList = v => v.signers.map(s => typeof s === 'string' ? { email: s, role: '' } : s);
function signerRows(d, v) {
  const sigs = sigsOf(d.id, v.n);
  return signerList(v).map((s, i) => ({ ...s, i, sig: sigs.find(x => x.email === s.email) }));
}
function verStatus(d, v) {
  if (v.superseded) return ST.SUP;
  const rows = signerRows(d, v);
  if (rows.some(r => r.sig && r.sig.decision !== 'OK')) return ST.REJ;
  if (rows.length && rows.every(r => r.sig && r.sig.decision === 'OK')) return ST.APR;
  return ST.INC;
}
const docStatus = d => verStatus(d, latest(d));
function canSign(d, email) {
  const v = latest(d); if (verStatus(d, v) !== ST.INC) return false;
  const rows = signerRows(d, v); const me = rows.find(r => r.email === email);
  if (!me || me.sig) return false;
  return v.order !== 'seq' || rows.slice(0, me.i).every(r => r.sig?.decision === 'OK');
}
function pendingSigners(d) {
  const v = latest(d); if (verStatus(d, v) !== ST.INC) return [];
  const rows = signerRows(d, v).filter(r => !r.sig);
  return v.order === 'seq' ? rows.slice(0, 1) : rows;
}
function approvedAt(d, v) { const s = sigsOf(d.id, v.n).map(x => x.at).sort(); return s.length ? s[s.length - 1] : null; }
const sortDocs = l => l.slice().sort((a, b) => latest(b).uploadedAt.localeCompare(latest(a).uploadedAt));
const findExisting = (code, circuitId) => D.documents.find(d => d.code.toLowerCase() === code.trim().toLowerCase() && d.circuitId === circuitId);
async function addEvent(docId, action, detail = '') { const e = { id: uid(), docId, at: now(), email: ME.id, action, detail }; D.events.push(e); await store.add('events', e); }
async function ensureUser(email, name = '', role = '') {
  let u = await store.get('users', email);
  if (!u) { u = { id: email, email, name: name || email.split('@')[0], role, createdAt: now() }; await store.put('users', u); D.users.push(u); }
  return u;
}

/* ---------- Arranque y acceso ---------- */

function showLogin() {
  $('#boot').hidden = true; $('#app').hidden = true;
  const L = $('#login'); L.hidden = false;
  L.innerHTML = `<div class="login-card">
    <img class="logo" src="assets/logo.png" alt="Gafial Group">
    <div class="sub">Circuito de firmas de diseño</div>
    <form id="lf" class="form" novalidate>
      <label>Correo electrónico<input name="email" type="email" required autocomplete="username" autofocus></label>
      <label>Contraseña<input name="pass" type="password" required minlength="6" autocomplete="current-password"></label>
      <div id="first" hidden><div class="notice" id="firstMsg"></div>
        <label>Repite la contraseña<input name="pass2" type="password" minlength="6" autocomplete="new-password"></label></div>
      <div class="err" id="lerr"></div>
      <button class="btn primary big wide" id="lbtn">Entrar</button>
      <p class="center" style="margin:10px 0 0"><button type="button" class="linkbtn" id="forgot">¿Has olvidado tu contraseña?</button></p>
      <p class="hint center">La primera vez, escribe tu correo y elige una contraseña (mín. 6 caracteres). Quedará recordada en este equipo.</p>
    </form>
    ${store.mode === 'local' ? `<div class="demo"><div class="hint center small"><b>Demo</b> · acceso rápido (contraseña <code>demo1234</code>)</div>
      <div class="demo-users" id="demoUsers"></div></div>` : ''}
  </div>`;
  const f = $('#lf'); const el = n => f.elements[n]; let first = false;
  if (store.mode === 'local') (async () => {
    const users = (await store.all('users')).sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
    $('#demoUsers').innerHTML = users.map(u => `<button type="button" class="btn sm" data-demo="${esc(u.id)}">${esc(u.name || u.id)}<small>${esc(u.role || '')}</small></button>`).join('');
    $$('[data-demo]').forEach(b => { b.onclick = async () => {
      const email = b.dataset.demo, u = await store.get('users', email);
      if (!u.passHash) await store.signUp(email, 'demo1234');
      else { try { await store.signIn(email, 'demo1234'); } catch { el('email').value = email; el('pass').focus(); $('#lerr').textContent = 'Este usuario ya tiene otra contraseña.'; return; } }
      await afterLogin(email);
    }; });
  })();
  const reset = () => { if (first) { first = false; $('#first').hidden = true; $('#lbtn').textContent = 'Entrar'; } };
  el('email').oninput = reset;
  $('#forgot').onclick = async () => {
    const email = normEmail(el('email').value); $('#lerr').textContent = '';
    if (!isEmail(email)) { $('#lerr').textContent = 'Escribe primero tu correo y vuelve a pulsar «¿Has olvidado tu contraseña?».'; el('email').focus(); return; }
    const b = $('#forgot'); b.disabled = true;
    try {
      const r = await store.resetPassword(email);
      reset();
      if (r.local) { el('pass').value = ''; $('#lerr').innerHTML = '<span style="color:var(--ok)">Contraseña borrada. Escribe una nueva y pulsa Entrar.</span>'; el('pass').focus(); }
      else $('#lerr').innerHTML = `<span style="color:var(--ok)">Te hemos enviado un correo a <b>${esc(email)}</b> con un enlace para crear una nueva contraseña. Revisa también la carpeta de spam.</span>`;
    } catch (err) { $('#lerr').textContent = err.message; }
    finally { b.disabled = false; }
  };
  f.onsubmit = async e => {
    e.preventDefault();
    const email = normEmail(el('email').value), pass = el('pass').value; const btn = $('#lbtn'); $('#lerr').textContent = '';
    if (!isEmail(email)) return ($('#lerr').textContent = 'Escribe un correo válido.');
    if (pass.length < 6) return ($('#lerr').textContent = 'La contraseña debe tener al menos 6 caracteres.');
    btn.disabled = true;
    try {
      if (!first) {
        const r = await store.signIn(email, pass);
        if (r.firstTime) {
          first = true; $('#first').hidden = false; btn.textContent = 'Crear mi acceso';
          $('#firstMsg').innerHTML = store.mode === 'local'
            ? `Primer acceso de <b>${esc(email)}</b>: repite la contraseña para crearla.`
            : `Si es tu <b>primer acceso</b>, repite la contraseña para crear tu cuenta. Si ya tenías cuenta, la contraseña no es correcta.`;
          el('pass2').focus(); return;
        }
      } else {
        if (el('pass2').value !== pass) throw new Error('Las contraseñas no coinciden.');
        const r = await store.signUp(email, pass);
        if (r.needsConfirm) { $('#firstMsg').innerHTML = 'Cuenta creada. Confirma tu correo con el enlace que te hemos enviado y vuelve a entrar.'; return; }
      }
      await afterLogin(email);
    } catch (err) { $('#lerr').textContent = err.message; }
    finally { btn.disabled = false; }
  };
}

function showNewPassword(email) {
  $('#boot').hidden = true; $('#app').hidden = true;
  const L = $('#login'); L.hidden = false;
  L.innerHTML = `<div class="login-card">
    <img class="logo" src="assets/logo.png" alt="Gafial Group">
    <div class="sub">Crea tu nueva contraseña</div>
    <form id="npf" class="form" novalidate>
      <label>Correo<input value="${esc(email)}" readonly></label>
      <label>Nueva contraseña<input name="p1" type="password" minlength="6" autocomplete="new-password" autofocus></label>
      <label>Repite la contraseña<input name="p2" type="password" minlength="6" autocomplete="new-password"></label>
      <div class="err" id="nperr"></div>
      <button class="btn primary big wide" id="npbtn">Guardar y entrar</button>
    </form></div>`;
  const f = $('#npf');
  f.onsubmit = async e => {
    e.preventDefault(); $('#nperr').textContent = '';
    const p1 = f.elements.p1.value, p2 = f.elements.p2.value;
    if (p1.length < 6) return ($('#nperr').textContent = 'La contraseña debe tener al menos 6 caracteres.');
    if (p1 !== p2) return ($('#nperr').textContent = 'Las contraseñas no coinciden.');
    const b = $('#npbtn'); b.disabled = true;
    try {
      await store.updatePassword(p1);
      history.replaceState(null, '', location.pathname + location.search);
      toast('Contraseña actualizada'); await afterLogin(email);
    } catch (err) { $('#nperr').textContent = err.message; b.disabled = false; }
  };
}

let shellBound = false;
async function afterLogin(email) {
  await seedIfEmpty();
  ME = await ensureUser(email);
  $('#login').hidden = true; $('#boot').hidden = true; $('#app').hidden = false;
  if (!shellBound) {
    shellBound = true;
    $('#menuBtn').onclick = () => $('#nav').classList.toggle('open');
    $('#userBtn').onclick = e => { e.stopPropagation(); $('#userDrop').hidden = !$('#userDrop').hidden; };
    document.addEventListener('click', () => { $('#userDrop').hidden = true; });
    $('#chpass').onclick = () => { $('#userDrop').hidden = true; changePasswordDialog(); };
    $('#logout').onclick = async () => { await store.signOut(); location.hash = ''; location.reload(); };
    if (store.mode === 'local') $('#banner').innerHTML = `<div class="banner">${CFG.demoNote ? esc(CFG.demoNote) : 'Modo local de demostración: los datos solo se guardan en este navegador. Para que cada persona firme desde su equipo, conecta Supabase (ver README).'}</div>`;
    window.addEventListener('hashchange', render);
  }
  if (/access_token=|type=recovery|error_description=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  if (!ME.signature && !location.hash) location.hash = '#perfil';
  await render();
}

/* ---------- Router ---------- */
const ROUTES = { home: viewHome, upload: viewUpload, doc: viewDoc, docs: viewDocs, historico: viewHistory, circuits: viewCircuits, cat: viewCatalog, users: viewUsers, perfil: viewProfile };
let renderSeq = 0, cleanups = [];
async function render() {
  if (!ME) return;
  const seq = ++renderSeq;
  const path = location.hash.slice(1) || 'home'; const [r, ...args] = path.split('/');
  $$('.nav a').forEach(a => { const h = a.getAttribute('href').slice(1); a.classList.toggle('active', path === h || path.startsWith(h + '/')); });
  $('#nav').classList.remove('open');
  if ($('#dlg').open) $('#dlg').close();
  if ($('#dlg2').open) $('#dlg2').close();
  cleanups.forEach(f => { try { f(); } catch { } }); cleanups = [];
  try { await refresh(); } catch (e) { toast('Error al cargar los datos: ' + e.message, 6000); }
  if (seq !== renderSeq) return;
  $('#userBtn').innerHTML = `${ME.signature ? '' : '<span class="dotwarn" title="Sin firma registrada"></span>'}${esc(ME.name || ME.id)} ▾`;
  $('#cntPend').textContent = D.documents.filter(d => canSign(d, ME.id)).length || '';
  const main = $('#main'); main.innerHTML = '';
  await (ROUTES[r] || viewHome)(main, ...args.map(decodeURIComponent));
  window.scrollTo(0, 0);
}

/* ---------- Tablas de documentos ---------- */
function docRow(it, o = {}) {
  const { d, v } = it, cur = latest(d), st = verStatus(d, v), rows = signerRows(d, v), ok = rows.filter(r => r.sig?.decision === 'OK').length;
  const dt = byId('doctypes', d.docTypeId), c = byId('circuits', d.circuitId);
  const pend = pendingSigners(d);
  return `<tr data-href="#doc/${d.id}">
    <td class="mono nowrap"><b>${esc(d.code)}</b></td><td>${esc(v.title || d.title)}${cur.n !== v.n ? `<div class="hint small">Versión vigente: V${cur.n} · ${verStatus(d, cur)}</div>` : ''}</td><td><span class="ver">V${v.n}</span></td>
    <td>${esc(dt?.name || '—')}</td><td>${esc(c?.name || v.circuitName || '—')}</td>
    <td class="nowrap"><span class="prog"><i style="width:${rows.length ? ok / rows.length * 100 : 0}%"></i></span><span class="hint">${ok}/${rows.length}</span>
      ${pend.length && cur.n === v.n ? `<div class="hint small">Falta: ${pend.map(p => esc(uname(p.email))).join(', ')}</div>` : ''}</td>
    <td>${o.approved ? fmtDT(approvedAt(d, v)) : `${esc(uname(v.uploadedBy))}<div class="hint small">${fmtDT(v.uploadedAt)}</div>`}</td>
    <td>${badge(st)}</td>
    ${o.dl ? `<td>${st === ST.APR ? `<button class="btn sm" data-dl="${d.id}|${v.n}">⬇ PDF</button>` : ''}</td>` : ''}</tr>`;
}
function docTable(list, empty, o = {}) {
  if (!list.length) return `<div class="empty">${empty}</div>`;
  list = list.map(x => x.d ? x : { d: x, v: latest(x) });
  return `<div class="tablewrap"><table class="tbl"><thead><tr><th>Código</th><th>Documento</th><th>Ver.</th><th>Tipo</th><th>Circuito</th><th>Firmas</th>
    <th>${o.approved ? 'Aprobado' : 'Subido'}</th><th>Estado</th>${o.dl ? '<th></th>' : ''}</tr></thead><tbody>${list.map(d => docRow(d, o)).join('')}</tbody></table></div>`;
}
function bindTable(m) {
  $$('tr[data-href]', m).forEach(tr => { tr.onclick = e => { if (!e.target.closest('button')) location.hash = tr.dataset.href; }; });
  $$('[data-dl]', m).forEach(b => { b.onclick = () => { const [id, n] = b.dataset.dl.split('|'); const d = byId('documents', id); downloadSigned(d, d.versions.find(x => x.n === +n)); }; });
}

/* ---------- Inicio ---------- */
function viewHome(m) {
  const mine = sortDocs(D.documents.filter(d => canSign(d, ME.id)));
  const inCirc = sortDocs(D.documents.filter(d => docStatus(d) === ST.INC));
  const approved = approvedList();
  const rejected = D.documents.filter(d => docStatus(d) === ST.REJ);
  const last = approved[0];
  const firstName = ME.name || ME.id.split('@')[0];
  m.innerHTML = `
    ${ME.signature ? '' : '<div class="notice warn">Aún no has registrado tu firma. <a href="#perfil"><b>Crear mi firma</b></a> — la necesitas para firmar documentos.</div>'}
    <section class="hero"><div><h1>Hola, ${esc(firstName)}</h1><p>Sube un diseño, elige su circuito de firmas y la plataforma recogerá el OK de cada persona implicada.</p></div>
      <a class="btn primary big" href="#upload">⬆ Subir diseño a firma</a></section>
    <div class="cards">
      <a class="stat ${mine.length ? 'alert' : ''}" href="#home" data-scroll="pend"><b>${mine.length}</b><span>Pendientes de mi firma</span></a>
      <a class="stat" href="#docs"><b>${inCirc.length}</b><span>En circuito</span></a>
      <a class="stat" href="#docs/Rechazado"><b>${rejected.length}</b><span>Rechazados</span></a>
      <a class="stat" href="#historico"><b>${approved.length}</b><span>Versiones aprobadas</span></a>
    </div>
    <h2 class="sec" id="pend">Pendiente de tu firma</h2>
    ${docTable(mine, 'No tienes nada pendiente de firmar. 👍')}
    <h2 class="sec">Último aprobado</h2>
    ${last ? lastCard(last) : '<div class="empty">Todavía no hay documentos aprobados.</div>'}
    <h2 class="sec">En circuito ahora <a href="#docs">Ver estado de todos →</a></h2>
    ${docTable(inCirc.slice(0, 8), 'No hay documentos esperando firmas.')}
    <h2 class="sec">Histórico de firmados <a href="#historico">Buscar en el histórico →</a></h2>
    ${docTable(approved.slice(0, 10), 'Aún no hay histórico.', { approved: true, dl: true })}`;
  bindTable(m);
  if (last) { $('#lastDl').onclick = () => downloadSigned(last.d, last.v); $('#lastOpen').onclick = () => { location.hash = '#doc/' + last.d.id; }; }
  $$('[data-scroll]', m).forEach(a => { a.onclick = e => { e.preventDefault(); $('#' + a.dataset.scroll).scrollIntoView({ behavior: 'smooth' }); }; });
}
function lastCard({ d, v }) {
  const p = productOf(d);
  return `<section class="card last"><div>
    <div class="mono code-lg"><b>${esc(d.code)}</b> <span class="ver">V${v.n}</span> ${badge(ST.APR)}</div>
    <div style="font-size:17px;font-weight:600;margin-top:4px">${esc(v.title || d.title)}</div>
    <div class="hint">${esc(p?.name || '')}${p ? ' · ' : ''}${esc(byId('doctypes', d.docTypeId)?.name || '')} · aprobado el ${fmtDT(approvedAt(d, v))}</div>
    <div class="sigrow">${signerRows(d, v).map(r => `<div class="minisig">${r.sig?.signature ? `<img src="${r.sig.signature}" alt="">` : ''}<b>${esc(uname(r.email))}</b><br><span class="hint">OK · ${fmtDT(r.sig?.at)}</span></div>`).join('')}</div>
  </div><div class="actions" style="flex-direction:column;align-items:stretch"><button class="btn primary" id="lastDl">⬇ Descargar PDF firmado</button><button class="btn" id="lastOpen">Ver detalle</button></div></section>`;
}

/* ---------- Listados con filtros ---------- */
function listView(m, o) {
  m.innerHTML = `<div class="head"><h1>${o.title}</h1><a class="btn primary" href="#upload">⬆ Subir diseño a firma</a></div>
    <div class="card filters">
      <input id="fq" placeholder="Buscar código de material, documento, producto, persona…">
      ${o.fixed ? '' : `<select id="fs"><option value="">Todos los estados</option>${[ST.INC, ST.REJ, ST.APR].map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select>`}
      <select id="ft"><option value="">Todos los tipos</option>${D.doctypes.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select>
      <select id="fc"><option value="">Todos los circuitos</option>${D.circuits.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select>
      ${o.dates ? '<label class="inl">Desde <input type="date" id="fd1"></label><label class="inl">Hasta <input type="date" id="fd2"></label>' : ''}
    </div><div id="res"></div>`;
  const val = id => $('#' + id)?.value || '';
  const draw = () => {
    const q = val('fq').trim().toLowerCase(), s = o.fixed || val('fs'), t = val('ft'), c = val('fc'), d1 = val('fd1'), d2 = val('fd2');
    const base = o.approved ? approvedList() : D.documents.map(d => ({ d, v: latest(d) }));
    const list = base.filter(({ d, v }) => {
      if (s && verStatus(d, v) !== s) return false;
      if (t && d.docTypeId !== t) return false;
      if (c && d.circuitId !== c) return false;
      if (q) {
        const p = productOf(d);
        const hay = [d.code, d.title, v.title, p?.name, p?.description, ...signerList(v).map(x => uname(x.email) + ' ' + x.email), uname(v.uploadedBy)].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (d1 || d2) { const day = localDay(approvedAt(d, v) || v.uploadedAt); if (d1 && day < d1) return false; if (d2 && day > d2) return false; }
      return true;
    });
    const sorted = o.approved ? list : list.sort((a, b) => b.v.uploadedAt.localeCompare(a.v.uploadedAt));
    $('#res').innerHTML = `<p class="hint">${list.length} ${o.approved ? 'versión(es) aprobada(s)' : 'documento(s)'}</p>` + docTable(sorted, 'No hay documentos con estos filtros.', o);
    bindTable($('#res'));
  };
  $$('#fq,#fs,#ft,#fc,#fd1,#fd2').forEach(e => { e.oninput = draw; }); draw();
}
function viewDocs(m, status) { return listView(m, { title: 'Estado de documentos', status: status || ST.INC, dl: true }); }
function viewHistory(m) { return listView(m, { title: 'Histórico de aprobados', fixed: ST.APR, dates: true, dl: true, approved: true }); }

/* ---------- Subir documento ---------- */
const doctypeOpts = sel => D.doctypes.slice().sort((a, b) => a.name.localeCompare(b.name)).map(t => `<option value="${esc(t.id)}" ${t.id === sel ? 'selected' : ''}>${esc(t.name)}</option>`).join('') + '<option value="__new">+ Crear nueva categoría…</option>';
const circuitOpts = sel => D.circuits.map(c => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('') + '<option value="__new">+ Crear nuevo circuito…</option>';

function viewUpload(m, fromId) {
  const from = fromId ? byId('documents', fromId) : null;
  m.innerHTML = `<a class="back" href="${from ? '#doc/' + from.id : '#home'}">← Volver</a>
  <h1>${from ? `Nueva versión de ${esc(from.code)}` : 'Subir diseño a firma'}</h1>
  <form id="up" class="card form" novalidate>
    <div class="drop" id="drop" tabindex="0" role="button">
      <input type="file" id="file" accept="application/pdf,.pdf,image/png,image/jpeg" hidden>
      <div class="drop-ico">⬆</div><div><b>Arrastra aquí el documento</b> o haz clic para elegirlo</div>
      <div class="hint">PDF, JPG o PNG · máx. 50 MB</div><div id="fileInfo" class="fileinfo"></div>
    </div>
    <div class="row">
      <label>Código de material<input name="code" list="codes" required class="mono" placeholder="MA.EST.COL.BEAUTY" autocomplete="off"></label>
      <label class="grow2">Descripción del documento<input name="title" required maxlength="160" placeholder="Ej.: Arte final estuche · cara frontal"></label>
    </div>
    <div id="prodInfo" class="hint" style="margin:-6px 0 12px"></div>
    <div class="row">
      <label>Tipo de documento<select name="docType">${doctypeOpts(from?.docTypeId || 'dt-aaff')}</select></label>
      <label>Circuito de firmas<select name="circuit">${circuitOpts(from?.circuitId || D.circuits[0]?.id)}</select></label>
    </div>
    <div id="circInfo"></div><div id="verInfo"></div>
    <label>Comentario para los firmantes (opcional)<textarea name="note" rows="2"></textarea></label>
    <div class="actions"><button class="btn primary big" id="sendBtn">Enviar a firma</button></div>
  </form>
  <datalist id="codes">${D.products.map(p => `<option value="${esc(p.code)}">${esc(p.name)}</option>`).join('')}</datalist>`;
  const f = $('#up'); const el = n => f.elements[n]; let file = null;
  if (from) { el('code').value = from.code; el('title').value = from.title; }
  const setFile = fl => {
    if (!fl) return;
    if (!/^(application\/pdf|image\/png|image\/jpeg)$/.test(fl.type) && !/\.pdf$/i.test(fl.name)) return uiAlert('Formato no admitido. Usa PDF, JPG o PNG.');
    if (fl.size > 50 * 1048576) return uiAlert('El archivo supera 50 MB.');
    file = fl; $('#drop').classList.add('has');
    $('#fileInfo').innerHTML = `📄 <b>${esc(fl.name)}</b> · ${(fl.size / 1048576).toFixed(2)} MB`;
    if (!el('title').value) el('title').value = fl.name.replace(/\.[^.]+$/, '');
  };
  const drop = $('#drop');
  drop.onclick = () => $('#file').click();
  drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file').click(); } };
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); setFile(e.dataTransfer.files[0]); };
  $('#file').onchange = e => setFile(e.target.files[0]);

  const upd = () => {
    const code = el('code').value.trim(); const p = D.products.find(x => x.code.toLowerCase() === code.toLowerCase());
    const cat = p && byId('prodcats', p.categoryId);
    $('#prodInfo').innerHTML = !code ? '' : p ? `Producto: <b>${esc(p.name)}</b>${cat ? ' · ' + esc(cat.name) : ''}` : 'Código nuevo: se añadirá al catálogo de <i>Productos</i>, donde podrás completar nombre y descripción.';
    const c = byId('circuits', el('circuit').value);
    $('#circInfo').innerHTML = c ? `<div class="chips"><span class="hint">Firmarán${c.order === 'seq' ? ' en este orden' : ''}:</span>${signerList(c).map((s, i) => `<span class="chip">${c.order === 'seq' ? (i + 1) + '. ' : ''}${esc(uname(s.email))}${s.role ? ` <small>· ${esc(s.role)}</small>` : ''}</span>`).join('') || '<span class="err">Este circuito no tiene firmantes</span>'}</div>` : '';
    const ex = code && c && findExisting(code, c.id);
    $('#verInfo').innerHTML = ex
      ? `<div class="notice">Ya existe <b>${esc(ex.code)}</b> en este circuito (V${latest(ex).n} · ${docStatus(ex)}). Este archivo se subirá como <b>V${latest(ex).n + 1}</b>${docStatus(ex) === ST.INC ? ' y la versión en curso quedará sustituida' : ''}.</div>`
      : (code && c ? '<div class="notice ok">Se registrará como <b>V1</b>.</div>' : '');
  };
  el('code').oninput = upd;
  el('circuit').onchange = async () => {
    if (el('circuit').value === '__new') { const c = await editCircuit(null); el('circuit').innerHTML = circuitOpts(c ? c.id : D.circuits[0]?.id); }
    upd();
  };
  el('docType').onchange = async () => {
    if (el('docType').value !== '__new') return;
    const name = (await uiPrompt('Nombre de la nueva categoría de documento:') || '').trim();
    if (name) { const t = { id: 'dt-' + uid(), name, description: '', createdAt: now() }; await store.put('doctypes', t); D.doctypes.push(t); el('docType').innerHTML = doctypeOpts(t.id); toast('Categoría creada'); }
    else el('docType').innerHTML = doctypeOpts('dt-aaff');
  };
  upd();

  f.onsubmit = async e => {
    e.preventDefault();
    const code = el('code').value.trim(), title = el('title').value.trim();
    const c = byId('circuits', el('circuit').value), dt = byId('doctypes', el('docType').value);
    if (!file) return uiAlert('Elige el documento que quieres enviar a firma.');
    if (!code) return uiAlert('Indica el código de material.');
    if (!title) return uiAlert('Escribe una descripción del documento.');
    if (!dt) return uiAlert('Elige el tipo de documento.');
    if (!c) return uiAlert('Elige el circuito de firmas.');
    if (!c.signers.length) return uiAlert('El circuito elegido no tiene firmantes.');
    const btn = $('#sendBtn'); btn.disabled = true; btn.textContent = 'Subiendo…';
    try {
      const buf = await file.arrayBuffer();
      const type = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : 'application/octet-stream');
      if (/pdf/.test(type) && window.PDFLib) {
        try { await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true }); } catch { throw new Error('El PDF no se puede leer (¿está dañado o protegido?).'); }
      }
      const hash = await sha256hex(buf);
      let doc = findExisting(code, c.id);
      if (doc) doc = (await store.get('documents', doc.id)) || doc;
      else doc = { id: 'doc-' + uid(), code, title, docTypeId: dt.id, circuitId: c.id, createdBy: ME.id, createdAt: now(), versions: [] };
      const prev = doc.versions.length ? latest(doc) : null;
      const n = prev ? prev.n + 1 : 1;
      const path = `docs/${doc.id}/v${n}/${Date.now()}_${safeName(file.name)}`;
      await store.putFile(path, buf, type);
      let superseded = false;
      if (prev && verStatus(doc, prev) === ST.INC) { prev.superseded = true; superseded = true; }
      doc.versions.push({ n, fileName: file.name, fileType: type, path, hash, size: file.size, uploadedBy: ME.id, uploadedAt: now(),
        title, note: el('note').value.trim(), signers: signerList(c).map(s => ({ email: s.email, role: s.role || userOf(s.email)?.role || '' })), order: c.order || 'any', circuitName: c.name });
      doc.title = title; doc.docTypeId = dt.id;
      await store.put('documents', doc);
      if (!D.products.some(p => p.code.toLowerCase() === code.toLowerCase()))
        await store.put('products', { id: 'p-' + uid(), code, name: title, categoryId: '', description: '', createdAt: now() });
      await addEvent(doc.id, `Subida V${n}`, `${file.name} · circuito ${c.name}${superseded ? ` · V${prev.n} sustituida` : ''}`);
      pendingShare = doc.id;
      location.hash = '#doc/' + doc.id;
    } catch (err) {
      console.error(err); uiAlert('No se pudo subir: ' + err.message);
      btn.disabled = false; btn.textContent = 'Enviar a firma';
    }
  };
}

/* ---------- Detalle del documento y firma ---------- */
function viewDoc(m, id) {
  const d = byId('documents', id);
  if (!d) { m.innerHTML = '<div class="empty">Documento no encontrado. <a href="#docs">Volver</a></div>'; return; }
  const v = latest(d), st = verStatus(d, v), rows = signerRows(d, v), ok = rows.filter(r => r.sig?.decision === 'OK').length;
  const dt = byId('doctypes', d.docTypeId), c = byId('circuits', d.circuitId), p = productOf(d), cat = p && byId('prodcats', p.categoryId);
  const mine = canSign(d, ME.id), pend = pendingSigners(d);
  const rowState = r => r.sig ? (r.sig.decision === 'OK' ? 'OK' : 'Rechazado') : st === ST.SUP ? '—' : st !== ST.INC ? '—'
    : (v.order === 'seq' && !rows.slice(0, r.i).every(x => x.sig?.decision === 'OK') ? 'Esperando turno' : 'Pendiente');
  const events = D.events.filter(e => e.docId === d.id).sort((a, b) => b.at.localeCompare(a.at));

  const signBox = mine ? `<section class="card signbox">
    <div><h2>Tu firma es necesaria</h2>
      <p style="margin-top:0">Revisa el documento en el visor (zoom con <b>+ / −</b> o Ctrl + rueda del ratón, arrastra para moverte, <b>⛶</b> para pantalla completa). Cuando esté correcto, firma con tu OK.</p>
      <label class="f">Comentario (obligatorio si rechazas)<textarea id="cmt" rows="2"></textarea></label>
      <div class="actions"><button class="btn primary big" id="signOk">✔ Firmar OK</button><button class="btn danger" id="signKo">✕ Rechazar</button></div></div>
    <div class="signbox-sig"><div class="hint">Tu firma</div>${ME.signature ? `<img class="sigimg lg" src="${ME.signature}" alt="Tu firma">` : '<div class="nosig">Aún no tienes firma</div>'}
      <button class="btn sm" id="editSig" type="button">${ME.signature ? 'Cambiar firma' : 'Crear mi firma'}</button></div></section>` : '';

  const viewerCard = `<section class="card" id="viewerCard"><div class="head"><h2>Revisar documento</h2>
    ${d.versions.length > 1 ? `<select id="vsel" style="width:auto">${d.versions.slice().reverse().map(x => `<option value="${x.n}">V${x.n} · ${verStatus(d, x)}</option>`).join('')}</select>` : ''}</div>
    <div id="viewer"><p class="hint">Cargando documento…</p></div></section>`;

  m.innerHTML = `<a class="back" href="#docs">← Estado de documentos</a>
  <div class="head"><div><div class="mono code-lg"><b>${esc(d.code)}</b></div><h1>${esc(d.title)}</h1></div>
    <div class="headright"><span class="ver lg">V${v.n}</span>${badge(st)}</div></div>
  ${signBox}
  ${mine ? viewerCard : ''}
  <div class="grid2">
    <section class="card"><h2>Firmas · ${ok}/${rows.length}</h2>
      <ul class="signers">${rows.map(r => `<li><div>
          ${r.role ? `<div class="role">${esc(r.role)}</div>` : ''}<b>${esc(uname(r.email))}</b><div class="hint">${esc(r.email)}</div>
          ${r.sig ? `<div class="hint">${r.sig.decision === 'OK' ? 'Firmado' : 'Rechazado'} el ${fmtDTs(r.sig.at)}</div>` : ''}
          ${r.sig?.comment ? `<div class="cmt">«${esc(r.sig.comment)}»</div>` : ''}</div>
        <div class="sg-side">${badge(rowState(r))}${r.sig?.signature ? `<img class="sigimg" src="${r.sig.signature}" alt="Firma">` : ''}</div></li>`).join('')}</ul>
      <div class="actions">
        ${st === ST.APR ? '<button class="btn primary" id="dl">⬇ Descargar PDF firmado</button>' : '<button class="btn" disabled title="Disponible cuando hayan firmado todas las personas">⬇ PDF firmado · cuando firmen todos</button>'}
        ${pend.length ? '<button class="btn" id="notify">✉ Avisar a pendientes</button>' : ''}
        <button class="btn" id="share">🔗 Copiar enlace</button><a class="btn" href="#upload/${d.id}">⬆ Subir nueva versión</a></div></section>
    <section class="card"><h2>Datos</h2><dl class="dl">
      <dt>Código de material</dt><dd class="mono">${esc(d.code)}</dd>
      <dt>Producto</dt><dd>${p ? esc(p.name) + (cat ? ' · ' + esc(cat.name) : '') : '—'}</dd>
      <dt>Tipo de documento</dt><dd>${esc(dt?.name || '—')}</dd>
      <dt>Circuito</dt><dd>${esc(c?.name || v.circuitName)} · ${v.order === 'seq' ? 'firma en orden' : 'firma en cualquier orden'}</dd>
      <dt>Subido por</dt><dd>${esc(uname(v.uploadedBy))} · ${fmtDT(v.uploadedAt)}</dd>
      ${st === ST.APR ? `<dt>Aprobado</dt><dd>${fmtDTs(approvedAt(d, v))}</dd>` : ''}
      <dt>Archivo</dt><dd>${esc(v.fileName)}</dd>
      ${v.note ? `<dt>Comentario</dt><dd>${esc(v.note)}</dd>` : ''}
      <dt>Huella SHA-256</dt><dd class="mono tiny">${v.hash}</dd></dl></section>
  </div>
  ${mine ? '' : viewerCard}
  <section class="card"><h2>Versiones</h2><div class="tablewrap"><table class="tbl"><thead><tr><th>Versión</th><th>Archivo</th><th>Subido por</th><th>Fecha</th><th>Firmas</th><th>Estado</th><th></th></tr></thead><tbody>
    ${d.versions.slice().reverse().map(x => { const s = verStatus(d, x), rr = signerRows(d, x); return `<tr><td><span class="ver">V${x.n}</span></td><td>${esc(x.fileName)}</td><td>${esc(uname(x.uploadedBy))}</td><td>${fmtDT(x.uploadedAt)}</td>
      <td>${rr.filter(r => r.sig?.decision === 'OK').length}/${rr.length}</td><td>${badge(s)}</td><td>${s === ST.APR ? `<button class="btn sm" data-dlv="${x.n}">⬇ PDF</button>` : ''}</td></tr>`; }).join('')}
  </tbody></table></div></section>
  <section class="card"><h2>Historial</h2>${events.length ? `<div class="tablewrap"><table class="tbl"><tbody>${events.map(e => `<tr><td class="nowrap">${fmtDTs(e.at)}</td><td>${esc(uname(e.email))}</td><td><b>${esc(e.action)}</b>${e.detail ? ' — ' + esc(e.detail) : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">Sin actividad.</p>'}</section>`;

  if ($('#dl')) $('#dl').onclick = () => downloadSigned(d);
  if ($('#notify')) $('#notify').onclick = () => shareDialog(d, false);
  $('#share').onclick = () => shareDialog(d, false);
  if (pendingShare === d.id) { pendingShare = null; shareDialog(d, true); }
  $$('[data-dlv]', m).forEach(b => { b.onclick = () => downloadSigned(d, d.versions.find(x => x.n === +b.dataset.dlv)); });
  if ($('#editSig')) $('#editSig').onclick = async () => { if (await editSignatureDialog()) render(); };
  if ($('#signOk')) $('#signOk').onclick = async () => {
    let sig = ME.signature;
    if (!sig) { sig = await editSignatureDialog(); if (!sig) return; }
    if (!(await uiConfirm(`¿Firmar con tu OK el documento ${d.code} (V${v.n})?`, '✔ Firmar OK'))) return;
    await doSign(d, 'OK', $('#cmt').value.trim());
  };
  if ($('#signKo')) $('#signKo').onclick = async () => {
    const cm = $('#cmt').value.trim();
    if (!cm) { uiAlert('Escribe en «Comentario» el motivo del rechazo.'); $('#cmt').focus(); return; }
    if (!(await uiConfirm(`¿Rechazar ${d.code} (V${v.n})?`, 'Rechazar'))) return;
    await doSign(d, 'Rechazado', cm);
  };
  const loadVersion = async n => {
    const x = d.versions.find(y => y.n === n); const box = $('#viewer');
    box.innerHTML = '<p class="hint">Cargando documento…</p>';
    try {
      const buf = await store.getFile(x.path); if (!buf) throw new Error('Archivo no encontrado');
      const stop = await mountViewer(box, buf, x.fileType); if (stop) cleanups.push(stop);
    } catch (e) { box.innerHTML = `<p class="err">No se pudo mostrar el documento: ${esc(e.message)}</p>`; }
  };
  if ($('#vsel')) $('#vsel').onchange = e => loadVersion(+e.target.value);
  loadVersion(v.n);
}

async function doSign(d, decision, comment) {
  const fresh = (await store.get('documents', d.id)) || d;
  const v = latest(fresh);
  if (v.n !== latest(d).n) { uiAlert('Se ha subido una versión nueva mientras revisabas. Se mostrará la última.'); return render(); }
  if (!canSign(fresh, ME.id)) { uiAlert('Este documento ya no está pendiente de tu firma.'); return render(); }
  const s = { id: `${d.id}|${v.n}|${ME.id}`, docId: d.id, v: v.n, email: ME.id, name: ME.name || ME.id, role: signerList(v).find(x => x.email === ME.id)?.role || '',
    decision, comment, signature: decision === 'OK' ? ME.signature : null, at: now() };
  try { await store.add('signatures', s); } catch (e) { uiAlert('No se pudo registrar la firma: ' + e.message); return; }
  D.signatures.push(s);
  await addEvent(d.id, decision === 'OK' ? `Firmado OK · V${v.n}` : `Rechazado · V${v.n}`, comment);
  if (verStatus(fresh, v) === ST.APR) { await addEvent(d.id, `APROBADO · V${v.n}`, 'Todas las firmas completadas'); toast('Documento APROBADO: ya se puede descargar el PDF firmado', 5000); }
  else toast(decision === 'OK' ? 'Firma registrada. ¡Gracias!' : 'Documento rechazado');
  render();
}

/* ---------- Compartir enlace ---------- */
let pendingShare = null;
const docLink = d => location.origin + location.pathname + '#doc/' + d.id;
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { }
  const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch { } ta.remove(); return ok;
}
function shareMail(d, to) {
  const v = latest(d), link = docLink(d);
  const body = `Hola,\n\nEstá listo para firmar el documento ${d.code} – ${v.title || d.title} (V${v.n}).\n` +
    `Tipo: ${byId('doctypes', d.docTypeId)?.name || '—'} · Circuito: ${v.circuitName}\n\nRevísalo y fírmalo aquí:\n${link}\n\nGracias.\n${ME.name || ME.id}`;
  return `mailto:${to.join(',')}?subject=${enc(`Listo para firmar: ${d.code} V${v.n}`)}&body=${enc(body)}`;
}
function shareDialog(d, justUploaded) {
  const v = latest(d), link = docLink(d), pend = pendingSigners(d), to = (pend.length ? pend : signerRows(d, v)).map(x => x.email);
  openDialog(`<h2>${justUploaded ? `✔ ${esc(d.code)} enviado a firma (V${v.n})` : 'Compartir documento'}</h2>
    <p class="hint">Copia el enlace y envíalo al equipo, o prepara directamente el correo para avisar de que está listo para firmar.</p>
    <label class="f">Enlace al documento<div class="row" style="flex-wrap:nowrap;gap:8px"><input id="shLink" readonly value="${esc(link)}"><button type="button" class="btn primary" id="shCopy">📋 Copiar enlace</button></div></label>
    <div class="chips"><span class="hint">Se avisará a:</span>${to.map(e => `<span class="chip">${esc(uname(e))} <small>${esc(e)}</small></span>`).join('')}</div>
    <div class="actions end"><button type="button" class="btn" data-x>Cerrar</button><a class="btn primary" id="shMail" href="${esc(shareMail(d, to))}" target="_blank" rel="noopener">✉ Avisar al equipo por correo</a></div>`, 'wide');
  $('#shLink').onclick = e => e.target.select();
  $('#shCopy').onclick = async () => { const ok = await copyText(link); $('#shCopy').textContent = ok ? '✔ Copiado' : 'Selecciona y copia'; if (!ok) $('#shLink').select(); };
  $('#shMail').onclick = () => { addEvent(d.id, 'Aviso por correo preparado', to.join(', ')); };
}

function notifySigners(d) {
  const p = pendingSigners(d); if (!p.length) return;
  const v = latest(d); const link = location.origin + location.pathname + '#doc/' + d.id;
  const body = `Hola,\n\nTienes pendiente revisar y firmar el documento ${d.code} – ${d.title} (V${v.n}).\n\nÁbrelo aquí: ${link}\n\nGracias.\n${ME.name || ME.id}`;
  location.href = `mailto:${p.map(x => x.email).join(',')}?subject=${enc(`Firma pendiente: ${d.code} V${v.n}`)}&body=${enc(body)}`;
}

/* ---------- Visor con zoom y desplazamiento ---------- */
function pdfjsReady() {
  if (!window.pdfjsLib) return false;
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc && CFG.pdfWorkerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = CFG.pdfWorkerSrc;
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    const s = [...document.scripts].find(x => /\/pdf(\.min)?\.js$/.test(x.src));
    pdfjsLib.GlobalWorkerOptions.workerSrc = s ? s.src.replace(/pdf(\.min)?\.js$/, 'pdf.worker.min.js') : '';
  }
  return true;
}
async function mountViewer(box, buf, type) {
  box.innerHTML = `<div class="viewer"><div class="vbar">
      <button type="button" class="btn sm" data-a="out" title="Alejar">−</button><span class="zl">100%</span>
      <button type="button" class="btn sm" data-a="in" title="Acercar">+</button>
      <button type="button" class="btn sm" data-a="fit">Ajustar ancho</button><button type="button" class="btn sm" data-a="one">100%</button>
      <button type="button" class="btn sm" data-a="full" title="Pantalla completa">⛶</button><span class="vinfo hint"></span></div>
    <div class="vscroll"><div class="vpages"></div></div></div>`;
  const root = $('.viewer', box), scroll = $('.vscroll', box), pages = $('.vpages', box), zl = $('.zl', box);
  let scale = 1, baseW = 1, token = 0, pdf = null, img = null, url = null;
  if (/pdf/.test(type)) {
    if (!pdfjsReady()) throw new Error('el visor de PDF no se ha cargado (¿sin conexión?)');
    pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
    baseW = (await pdf.getPage(1)).getViewport({ scale: 1 }).width;
    $('.vinfo', box).textContent = `${pdf.numPages} página${pdf.numPages > 1 ? 's' : ''}`;
  } else {
    url = URL.createObjectURL(new Blob([buf], { type }));
    img = await loadImage(url); baseW = img.naturalWidth; img.draggable = false;
    $('.vinfo', box).textContent = `${img.naturalWidth} × ${img.naturalHeight} px`;
  }
  const layout = async () => {
    const my = ++token; zl.textContent = Math.round(scale * 100) + '%';
    if (img) { img.style.width = baseW * scale + 'px'; if (!img.parentNode) pages.appendChild(img); return; }
    const dpr = window.devicePixelRatio || 1; const items = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i); if (my !== token) return;
      const css = page.getViewport({ scale });
      const rs = Math.min(scale * dpr, Math.sqrt(16e6 / (css.width / scale * css.height / scale)));
      const vp = page.getViewport({ scale: rs });
      const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
      cv.style.width = css.width + 'px'; cv.style.height = css.height + 'px';
      items.push([page, vp, cv]);
    }
    pages.replaceChildren(...items.map(x => x[2]));
    (async () => { for (const [page, vp, cv] of items) { if (my !== token) return; await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise; } })();
  };
  const zoomTo = async s => {
    const fx = (scroll.scrollLeft + scroll.clientWidth / 2) / Math.max(1, pages.scrollWidth);
    const fy = (scroll.scrollTop + scroll.clientHeight / 2) / Math.max(1, pages.scrollHeight);
    scale = Math.max(0.2, Math.min(6, s)); await layout();
    scroll.scrollLeft = fx * pages.scrollWidth - scroll.clientWidth / 2; scroll.scrollTop = fy * pages.scrollHeight - scroll.clientHeight / 2;
  };
  const fit = () => Math.max(0.2, (scroll.clientWidth - 36) / baseW);
  $$('[data-a]', box).forEach(b => { b.onclick = () => {
    const a = b.dataset.a;
    if (a === 'in') zoomTo(scale * 1.25); else if (a === 'out') zoomTo(scale / 1.25); else if (a === 'fit') zoomTo(fit()); else if (a === 'one') zoomTo(1);
    else if (a === 'full') { if (document.fullscreenElement) document.exitFullscreen(); else root.requestFullscreen?.().then(() => setTimeout(() => zoomTo(fit()), 120)); }
  }; });
  scroll.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomTo(scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12)); } }, { passive: false });
  let drag = null;
  scroll.addEventListener('pointerdown', e => { if (e.pointerType === 'touch' || e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, l: scroll.scrollLeft, t: scroll.scrollTop }; scroll.setPointerCapture(e.pointerId); scroll.classList.add('grabbing'); });
  scroll.addEventListener('pointermove', e => { if (!drag) return; scroll.scrollLeft = drag.l - (e.clientX - drag.x); scroll.scrollTop = drag.t - (e.clientY - drag.y); });
  const end = () => { drag = null; scroll.classList.remove('grabbing'); };
  scroll.addEventListener('pointerup', end); scroll.addEventListener('pointercancel', end);
  scale = fit(); await layout();
  return () => { token++; if (url) URL.revokeObjectURL(url); if (pdf) pdf.destroy(); };
}

/* ---------- PDF firmado: portada con cuadro de firmas ---------- */
const WIN_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const T = s => [...String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[ -​ ]/g, ' ')]
  .map(ch => { const k = ch.charCodeAt(0); return (k >= 32 && k <= 126) || (k >= 160 && k <= 255) || WIN_EXTRA.includes(ch) ? ch : '?'; }).join('');
function wrap(text, font, size, maxW) {
  const out = []; let line = ''; const fits = s => font.widthOfTextAtSize(s, size) <= maxW;
  for (const word of text.split(' ')) {
    let w = word;
    while (!fits(w)) { let i = w.length; while (i > 1 && !fits(w.slice(0, i))) i--; if (line) { out.push(line); line = ''; } out.push(w.slice(0, i)); w = w.slice(i); }
    const cand = line ? line + ' ' + w : w; if (fits(cand)) line = cand; else { out.push(line); line = w; }
  }
  if (line) out.push(line); return out.length ? out : [''];
}
let logoBytes = null;
async function getLogo() { if (!logoBytes) { try { logoBytes = await (await fetch('assets/logo.png')).arrayBuffer(); } catch { logoBytes = false; } } return logoBytes; }

async function buildSignedPdf(d, v) {
  if (!window.PDFLib) throw new Error('No se ha podido cargar la librería PDF (¿sin conexión?).');
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const buf = await store.getFile(v.path); if (!buf) throw new Error('No se encuentra el archivo original.');
  let pdf;
  if (/pdf/.test(v.fileType)) pdf = await PDFDocument.load(buf, { ignoreEncryption: true });
  else {
    pdf = await PDFDocument.create();
    const im = /png/.test(v.fileType) ? await pdf.embedPng(buf) : await pdf.embedJpg(buf);
    const [pw, ph] = im.width > im.height ? [841.89, 595.28] : [595.28, 841.89];
    const pg = pdf.addPage([pw, ph]); const sc = Math.min((pw - 60) / im.width, (ph - 60) / im.height, 1);
    pg.drawImage(im, { x: (pw - im.width * sc) / 2, y: (ph - im.height * sc) / 2, width: im.width * sc, height: im.height * sc });
  }
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const grey = rgb(.42, .45, .5), dark = rgb(.09, .11, .18), navy = rgb(.106, .165, .306), boxC = rgb(.267, .275, .271), white = rgb(1, 1, 1), green = rgb(.08, .5, .24);
  const n0 = pdf.getPageCount();
  pdf.getPages().forEach((pg, i) => pg.drawText(T(`${d.code} · V${v.n} · APROBADO · pág. ${i + 1}/${n0}`), { x: 18, y: 8, size: 6.5, font, color: grey }));

  const W = 595.28, H = 841.89, M = 42;
  const rows = signerRows(d, v), dt = byId('doctypes', d.docTypeId), p = productOf(d), cat = p && byId('prodcats', p.categoryId);
  const logo = await getLogo(); const logoImg = logo ? await pdf.embedPng(logo) : null;

  // Cuadro de firmas: tarjetas blancas sobre fondo gris, 3 por fila
  const cols = Math.min(3, Math.max(1, rows.length)); const gap = 14, pad = 18;
  const cardW = (W - 2 * M - 2 * pad - (cols - 1) * gap) / cols, cardH = 168;
  const nRows = Math.ceil(rows.length / cols);
  let coverIdx = 0, page = pdf.insertPage(0, [W, H]), y;

  const header = () => {
    if (logoImg) { const lh = 46, lw = logoImg.width * lh / logoImg.height; page.drawImage(logoImg, { x: M, y: H - M - lh, width: lw, height: lh }); }
    const t1 = 'APROBACIÓN DE DOCUMENTO'; page.drawText(t1, { x: W - M - bold.widthOfTextAtSize(t1, 10), y: H - M - 16, size: 10, font: bold, color: navy });
    const t2 = T(`Generado el ${fmtDTs(now())}`); page.drawText(t2, { x: W - M - font.widthOfTextAtSize(t2, 8), y: H - M - 30, size: 8, font, color: grey });
    page.drawLine({ start: { x: M, y: H - M - 60 }, end: { x: W - M, y: H - M - 60 }, thickness: .8, color: rgb(.85, .87, .9) });
    y = H - M - 84;
  };
  header();
  // Identificación del documento
  page.drawText(T(d.code), { x: M, y, size: 22, font: bold, color: dark });
  const vt = `V${v.n}`; const vx = M + bold.widthOfTextAtSize(T(d.code), 22) + 10;
  page.drawRectangle({ x: vx, y: y - 3, width: bold.widthOfTextAtSize(vt, 12) + 12, height: 20, color: navy });
  page.drawText(vt, { x: vx + 6, y: y + 2, size: 12, font: bold, color: white });
  const ok = 'APROBADO'; const okW = bold.widthOfTextAtSize(ok, 11) + 20;
  page.drawRectangle({ x: W - M - okW, y: y - 3, width: okW, height: 20, color: rgb(.9, .96, .92), borderColor: green, borderWidth: 1 });
  page.drawText(ok, { x: W - M - okW + 10, y: y + 2, size: 11, font: bold, color: green });
  y -= 22;
  for (const ln of wrap(T(v.title || d.title), font, 13, W - 2 * M).slice(0, 2)) { page.drawText(ln, { x: M, y, size: 13, font, color: dark }); y -= 17; }
  y -= 8;
  const kv = [['Producto', p ? p.name + (cat ? ' · ' + cat.name : '') : '—'], ['Tipo de documento', dt?.name || '—'], ['Circuito de firmas', v.circuitName || byId('circuits', d.circuitId)?.name || '—'],
    ['Subido por', `${uname(v.uploadedBy)} · ${fmtDTs(v.uploadedAt)}`], ['Aprobado', fmtDTs(approvedAt(d, v))], ['Archivo original', v.fileName]];
  const colW = (W - 2 * M) / 2;
  kv.forEach(([k, val], i) => {
    const x = M + (i % 2) * colW, yy = y - Math.floor(i / 2) * 30;
    page.drawText(T(k).toUpperCase(), { x, y: yy, size: 7, font: bold, color: grey });
    page.drawText(wrap(T(val), font, 9.5, colW - 12)[0], { x, y: yy - 12, size: 9.5, font, color: dark });
  });
  y -= Math.ceil(kv.length / 2) * 30 + 14;

  const drawBox = (startRow, rowCount) => {
    const boxH = 66 + rowCount * cardH + (rowCount - 1) * gap + pad;
    const top = y; page.drawRectangle({ x: M, y: top - boxH, width: W - 2 * M, height: boxH, color: boxC });
    page.drawText('Cuadro de firmas', { x: M + pad, y: top - 42, size: 24, font: bold, color: white });
    return { top, boxH };
  };
  const drawCard = async (r, x, yTop) => {
    page.drawRectangle({ x, y: yTop - cardH, width: cardW, height: cardH, color: white });
    const ix = x + 12, iw = cardW - 24;
    const role = wrap(T(r.role || 'Firmante'), bold, 10.5, iw)[0];
    page.drawText(role, { x: ix, y: yTop - 24, size: 10.5, font: bold, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: ix, y: yTop - 32 }, end: { x: ix + iw, y: yTop - 32 }, thickness: 1.6, color: rgb(0, 0, 0) });
    if (r.sig?.signature) {
      try {
        const im = await pdf.embedPng(r.sig.signature); const mh = 62, sc = Math.min(iw / im.width, mh / im.height);
        page.drawImage(im, { x: ix, y: yTop - 40 - im.height * sc, width: im.width * sc, height: im.height * sc });
      } catch (e) { console.warn(e); }
    }
    let ly = yTop - cardH + 46;
    page.drawText(wrap(T(uname(r.email)), bold, 9, iw)[0], { x: ix, y: ly, size: 9, font: bold, color: dark }); ly -= 13;
    page.drawText('OK', { x: ix, y: ly, size: 9, font: bold, color: green });
    page.drawText(T(`· ${fmtDay(r.sig?.at)} · ${fmtTime(r.sig?.at)}`), { x: ix + bold.widthOfTextAtSize('OK', 9) + 4, y: ly, size: 8.5, font, color: dark }); ly -= 12;
    page.drawText(wrap(T(r.email), font, 7, iw)[0], { x: ix, y: ly, size: 7, font, color: grey });
  };
  // Distribuye filas de tarjetas en la portada y, si no caben, en páginas siguientes
  let rowIdx = 0;
  while (rowIdx < nRows) {
    const avail = y - M - 40;
    let fitRows = Math.max(1, Math.floor((avail - 66 - pad + gap) / (cardH + gap)));
    fitRows = Math.min(fitRows, nRows - rowIdx);
    if (66 + fitRows * cardH + (fitRows - 1) * gap + pad > avail && rowIdx > 0) { page = pdf.insertPage(++coverIdx, [W, H]); header(); continue; }
    const { top, boxH } = drawBox(rowIdx, fitRows);
    for (let rr = 0; rr < fitRows; rr++) {
      const slice = rows.slice((rowIdx + rr) * cols, (rowIdx + rr + 1) * cols);
      const rowW = slice.length * cardW + (slice.length - 1) * gap;
      const x0 = M + pad + ((W - 2 * M - 2 * pad) - rowW) / 2;
      for (let k = 0; k < slice.length; k++) await drawCard(slice[k], x0 + k * (cardW + gap), top - 66 - rr * (cardH + gap));
    }
    y = top - boxH - 18; rowIdx += fitRows;
    if (rowIdx < nRows) { page = pdf.insertPage(++coverIdx, [W, H]); header(); }
  }
  const foot = T(`Documento aprobado por todas las personas del circuito. Las páginas siguientes reproducen el archivo original V${v.n} sin cambios de contenido. Huella SHA-256 del original: ${v.hash}`);
  wrap(foot, font, 7, W - 2 * M).forEach((ln, i) => page.drawText(ln, { x: M, y: M + 10 - i * 9, size: 7, font, color: grey }));
  return pdf.save();
}
async function downloadSigned(d, v = latest(d)) {
  if (!d || !v) return;
  if (verStatus(d, v) !== ST.APR) return uiAlert('El PDF firmado solo se puede descargar cuando todas las personas han firmado.');
  try {
    toast('Generando PDF firmado…', 1500);
    const bytes = await buildSignedPdf(d, v);
    const name = `${safeName(d.code)}_V${v.n}_APROBADO.pdf`, blob = new Blob([bytes], { type: 'application/pdf' });
    const dlg = openDialog(`<div class="head"><div><h2>PDF firmado</h2><div class="hint"><b>${esc(name)}</b> · portada con cuadro de firmas + documento original</div></div>
      <button type="button" class="btn primary" id="pdfDl">⬇ Descargar PDF</button></div><div id="pdfPrev" style="margin-top:12px"><p class="hint">Cargando vista previa…</p></div>
      <div class="actions end"><button type="button" class="btn" data-x>Cerrar</button></div>`, 'xl');
    $('#pdfDl').onclick = async () => { download(blob, name); await addEvent(d.id, `PDF firmado descargado · V${v.n}`); };
    const stop = await mountViewer($('#pdfPrev'), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), 'application/pdf');
    dlg.onclose = () => { if (stop) stop(); };
  } catch (e) { console.error(e); uiAlert('No se pudo generar el PDF: ' + e.message); }
}

/* ---------- Firma del usuario (dibujada o imagen) ---------- */
function signaturePad(canvas) {
  const ctx = canvas.getContext('2d'); let drawing = false, empty = true, last;
  const r0 = canvas.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, r0.width * dpr); canvas.height = Math.max(1, r0.height * dpr); ctx.scale(dpr, dpr);
  Object.assign(ctx, { lineWidth: 2.4, lineCap: 'round', lineJoin: 'round', strokeStyle: '#0b1a3a' });
  const pos = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('pointerdown', e => { drawing = true; last = pos(e); canvas.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.arc(last.x, last.y, 1.1, 0, 7); ctx.fillStyle = ctx.strokeStyle; ctx.fill(); empty = false; });
  canvas.addEventListener('pointermove', e => { if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; empty = false; });
  ['pointerup', 'pointercancel'].forEach(t => canvas.addEventListener(t, () => { drawing = false; }));
  return { canvas, clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); empty = true; }, isEmpty: () => empty };
}
function trimCanvas(src, padPx = 10) {
  const c = src.getContext('2d'); const { width: w, height: h } = src; const data = c.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return src;
  x0 = Math.max(0, x0 - padPx); y0 = Math.max(0, y0 - padPx); x1 = Math.min(w - 1, x1 + padPx); y1 = Math.min(h - 1, y1 + padPx);
  const out = document.createElement('canvas'); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(src, x0, y0, out.width, out.height, 0, 0, out.width, out.height); return out;
}
async function imageToSignature(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url); const sc = Math.min(1, 900 / img.naturalWidth, 400 / img.naturalHeight);
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, c.width, c.height);
    const id = ctx.getImageData(0, 0, c.width, c.height); const p = id.data;
    for (let i = 0; i < p.length; i += 4) { const l = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; if (l > 200) p[i + 3] = 0; else if (l > 150) p[i + 3] = Math.round(p[i + 3] * (200 - l) / 50); }
    ctx.putImageData(id, 0, 0); return trimCanvas(c).toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}
const sigEditorHtml = () => `<div class="tabs"><button type="button" class="tab active" data-t="draw">✍ Dibujar con el cursor</button><button type="button" class="tab" data-t="img">🖼 Adjuntar imagen</button></div>
  <div data-p="draw"><div class="sigwrap"><canvas class="sigc"></canvas></div><div class="actions"><button type="button" class="btn sm" data-clear>Borrar</button><span class="hint">Firma con el ratón, el dedo o un lápiz.</span></div></div>
  <div data-p="img" hidden><input type="file" accept="image/png,image/jpeg" class="sigfile"><p class="hint">Foto o escaneo de tu firma sobre fondo blanco: el fondo se elimina automáticamente.</p><div class="sigprev"><span class="hint">Vista previa</span></div></div>`;
function mountSigEditor(root) {
  let mode = 'draw', imgData = null; const pad = signaturePad($('.sigc', root));
  $$('.tab', root).forEach(t => { t.onclick = () => {
    mode = t.dataset.t; $$('.tab', root).forEach(x => x.classList.toggle('active', x === t));
    $$('[data-p]', root).forEach(p => { p.hidden = p.dataset.p !== mode; });
  }; });
  $('[data-clear]', root).onclick = () => pad.clear();
  $('.sigfile', root).onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { imgData = await imageToSignature(f); $('.sigprev', root).innerHTML = `<img src="${imgData}" alt="Firma">`; } catch (err) { uiAlert(err.message); }
  };
  return { get: () => mode === 'draw' ? (pad.isEmpty() ? null : trimCanvas(pad.canvas).toDataURL('image/png')) : imgData };
}
async function saveMySignature(sig) {
  const u = (await store.get('users', ME.id)) || ME; u.signature = sig; u.signatureAt = now();
  await store.put('users', u); ME = u; const i = D.users.findIndex(x => x.id === u.id); if (i >= 0) D.users[i] = u;
}

/* ---------- Diálogos ---------- */
function uiDialog(html, setup) {
  return new Promise(res => {
    const d = $('#dlg2'); d.innerHTML = `<div class="dlg-body">${html}</div>`;
    let val = null; const done = v => { val = v; d.close(); };
    d.onclose = () => res(val); setup(d, done); d.showModal();
  });
}
const uiAlert = msg => uiDialog(`<p class="dlg-msg">${esc(msg)}</p><div class="actions end"><button type="button" class="btn primary" data-ok>Entendido</button></div>`,
  (d, done) => { $('[data-ok]', d).onclick = () => done(true); });
const uiConfirm = (msg, ok = 'Confirmar') => uiDialog(`<p class="dlg-msg">${esc(msg)}</p><div class="actions end"><button type="button" class="btn" data-no>Cancelar</button><button type="button" class="btn primary" data-ok>${esc(ok)}</button></div>`,
  (d, done) => { $('[data-ok]', d).onclick = () => done(true); $('[data-no]', d).onclick = () => done(false); }).then(v => !!v);
const uiPrompt = (msg, def = '') => uiDialog(`<form class="form" data-f novalidate><label>${esc(msg)}<input data-in value="${esc(def)}"></label><div class="actions end"><button type="button" class="btn" data-no>Cancelar</button><button class="btn primary">Aceptar</button></div></form>`,
  (d, done) => { $('[data-f]', d).onsubmit = e => { e.preventDefault(); done($('[data-in]', d).value); }; $('[data-no]', d).onclick = () => done(null); setTimeout(() => $('[data-in]', d).focus(), 30); });

function openDialog(html, cls = '') {
  const dlg = $('#dlg'); dlg.className = cls; dlg.innerHTML = `<div class="dlg-body">${html}</div>`;
  const api = { el: dlg, body: $('.dlg-body', dlg), onclose: null, close() { dlg.close(); } };
  dlg.onclose = () => { if (api.onclose) api.onclose(); };
  api.bindClose = () => $$('[data-x]', dlg).forEach(b => { b.onclick = () => dlg.close(); });
  api.bindClose(); dlg.showModal(); return api;
}
function changePasswordDialog() {
  const dlg = openDialog(`<h2>Cambiar contraseña</h2><form id="cpd" class="form" novalidate>
    <label>Nueva contraseña<input name="p1" type="password" minlength="6" autocomplete="new-password"></label>
    <label>Repite la contraseña<input name="p2" type="password" minlength="6" autocomplete="new-password"></label>
    <div class="err" id="cpderr"></div>
    <div class="actions end"><button type="button" class="btn" data-x>Cancelar</button><button class="btn primary">Guardar contraseña</button></div></form>`, 'small');
  setTimeout(() => $('#cpd input[name=p1]').focus(), 30);
  $('#cpd').onsubmit = async e => {
    e.preventDefault(); const f = e.target; $('#cpderr').textContent = '';
    const p1 = f.elements.p1.value, p2 = f.elements.p2.value;
    if (p1.length < 6) return ($('#cpderr').textContent = 'La contraseña debe tener al menos 6 caracteres.');
    if (p1 !== p2) return ($('#cpderr').textContent = 'Las contraseñas no coinciden.');
    try { await store.updatePassword(p1); dlg.close(); toast('Contraseña actualizada'); } catch (err) { $('#cpderr').textContent = err.message; }
  };
}

function editSignatureDialog() {
  return new Promise(res => {
    const dlg = openDialog(`<h2>Mi firma</h2><p class="hint">Se incorporará en el cuadro de firmas de cada documento que apruebes.</p>${sigEditorHtml()}
      <div class="actions end"><button type="button" class="btn" data-x>Cancelar</button><button type="button" class="btn primary" data-save>Guardar firma</button></div>`, 'wide');
    const ed = mountSigEditor(dlg.body); let result = null;
    dlg.onclose = () => res(result);
    $('[data-save]', dlg.body).onclick = async () => {
      const s = ed.get(); if (!s) return uiAlert('Dibuja tu firma o adjunta una imagen.');
      await saveMySignature(s); toast('Firma guardada'); result = s; dlg.close();
    };
  });
}

/* ---------- Circuitos ---------- */
function viewCircuits(m) {
  m.innerHTML = `<div class="head"><h1>Circuitos de firma</h1><button class="btn primary" id="addC">+ Nuevo circuito</button></div>
    <p class="hint">Cada circuito define quién tiene que firmar y con qué rol aparecerá en el cuadro de firmas. Al subir un documento se elige su circuito.</p>
    ${D.circuits.map(c => {
      const docs = D.documents.filter(d => d.circuitId === c.id);
      return `<section class="card circ"><div><h3>${esc(c.name)}</h3><div class="hint">${esc(c.description || '')}${c.description ? ' · ' : ''}${c.order === 'seq' ? 'Firma en orden' : 'Firma en cualquier orden'} · ${docs.filter(d => docStatus(d) === ST.INC).length} en circuito · ${docs.filter(d => docStatus(d) === ST.APR).length} aprobados</div>
        <div class="chips" style="margin:10px 0 0">${signerList(c).map((s, i) => `<span class="chip">${c.order === 'seq' ? (i + 1) + '. ' : ''}${esc(uname(s.email))}${s.role ? ` <small>· ${esc(s.role)}</small>` : ''}</span>`).join('')}</div></div>
        <div><button class="btn" data-edit="${esc(c.id)}">Editar</button></div></section>`;
    }).join('') || '<div class="empty">No hay circuitos todavía.</div>'}`;
  $('#addC').onclick = async () => { if (await editCircuit(null)) render(); };
  $$('[data-edit]', m).forEach(b => { b.onclick = async () => { if (await editCircuit(byId('circuits', b.dataset.edit))) render(); }; });
}
function editCircuit(c) {
  return new Promise(res => {
    const isNew = !c;
    const w = c ? structuredClone(c) : { id: 'c-' + uid(), name: '', description: '', order: 'any', signers: [], createdBy: ME.id, createdAt: now() };
    w.signers = signerList(w);
    const dlg = openDialog('', 'wide'); let result = null; dlg.onclose = () => res(result);
    const sync = () => {
      w.name = $('#cName').value.trim(); w.description = $('#cDesc').value.trim(); w.order = $('#cOrder').value;
      $$('[data-role]', dlg.body).forEach(i => { w.signers[+i.dataset.role].role = i.value.trim(); });
    };
    const draw = () => {
      dlg.body.innerHTML = `<h2>${isNew ? 'Nuevo circuito de firmas' : 'Editar circuito'}</h2><div class="form">
        <label>Nombre del circuito<input id="cName" value="${esc(w.name)}" placeholder="Ej.: Aprobación de diseños AAFF"></label>
        <label>Descripción<input id="cDesc" value="${esc(w.description || '')}"></label>
        <label>Orden de firma<select id="cOrder"><option value="any" ${w.order !== 'seq' ? 'selected' : ''}>Todos a la vez, en cualquier orden</option><option value="seq" ${w.order === 'seq' ? 'selected' : ''}>En orden: cada persona firma después de la anterior</option></select></label>
        <h3>Personas que deben firmar <span class="hint">· el rol es el título de su recuadro en el cuadro de firmas</span></h3>
        <ul class="slist">${w.signers.map((s, i) => `<li><span class="num">${i + 1}</span><span class="who"><b>${esc(uname(s.email))}</b><div class="hint small">${esc(s.email)}</div></span>
          <input data-role="${i}" value="${esc(s.role || '')}" placeholder="Rol (p. ej. Product)">
          <button type="button" class="icon" data-up="${i}" title="Subir">↑</button><button type="button" class="icon" data-down="${i}" title="Bajar">↓</button><button type="button" class="icon" data-del="${i}" title="Quitar">✕</button></li>`).join('') || '<li class="hint">Aún no hay firmantes.</li>'}</ul>
        <select id="cAdd"><option value="">+ Añadir firmante…</option>${D.users.filter(u => !w.signers.some(s => s.email === u.id)).map(u => `<option value="${esc(u.id)}">${esc(u.name || u.id)} · ${esc(u.id)}</option>`).join('')}<option value="__new">+ Nueva persona (por correo)…</option></select>
      </div>
      <div class="actions end">${isNew ? '' : '<button type="button" class="btn danger" id="cDel">Eliminar</button><span class="sep"></span>'}<button type="button" class="btn" data-x>Cancelar</button><button type="button" class="btn primary" id="cSave">Guardar circuito</button></div>`;
      dlg.bindClose();
      $('#cAdd').onchange = async e => {
        sync(); let em = e.target.value;
        if (em === '__new') {
          em = normEmail(await uiPrompt('Correo electrónico de la persona:') || '');
          if (!em) return draw(); if (!isEmail(em)) { uiAlert('Correo no válido.'); return draw(); }
          const name = (await uiPrompt('Nombre y apellido:') || '').trim(); const role = (await uiPrompt('Rol / cargo (p. ej. Graphic designer, Product, Executives):') || '').trim();
          await ensureUser(em, name, role);
        }
        if (em && !w.signers.some(s => s.email === em)) w.signers.push({ email: em, role: userOf(em)?.role || '' });
        draw();
      };
      $$('[data-up]', dlg.body).forEach(b => { b.onclick = () => { sync(); const i = +b.dataset.up; if (i > 0) [w.signers[i - 1], w.signers[i]] = [w.signers[i], w.signers[i - 1]]; draw(); }; });
      $$('[data-down]', dlg.body).forEach(b => { b.onclick = () => { sync(); const i = +b.dataset.down; if (i < w.signers.length - 1) [w.signers[i + 1], w.signers[i]] = [w.signers[i], w.signers[i + 1]]; draw(); }; });
      $$('[data-del]', dlg.body).forEach(b => { b.onclick = () => { sync(); w.signers.splice(+b.dataset.del, 1); draw(); }; });
      $('#cSave').onclick = async () => {
        sync();
        if (!w.name) return uiAlert('Pon un nombre al circuito.');
        if (!w.signers.length) return uiAlert('Añade al menos una persona que deba firmar.');
        await store.put('circuits', w);
        const i = D.circuits.findIndex(x => x.id === w.id); if (i >= 0) D.circuits[i] = w; else D.circuits.push(w);
        toast('Circuito guardado'); result = w; dlg.close();
      };
      if (!isNew) $('#cDel').onclick = async () => {
        if (D.documents.some(d => d.circuitId === w.id)) return uiAlert('No se puede eliminar: hay documentos que pertenecen a este circuito.');
        if (!(await uiConfirm('¿Eliminar el circuito?'))) return;
        await store.del('circuits', w.id); D.circuits = D.circuits.filter(x => x.id !== w.id); result = { deleted: true }; dlg.close();
      };
    };
    draw();
  });
}

/* ---------- Catálogos (tipos de documento, productos, categorías) ---------- */
const CATS = {
  doctypes: { title: 'Tipos de documento', one: 'tipo de documento', intro: 'Categorías que se eligen al subir un documento (Diseño AAFF, Packaging, Etiqueta…).',
    fields: [{ k: 'name', l: 'Nombre', req: 1 }, { k: 'description', l: 'Descripción' }], used: x => D.documents.some(d => d.docTypeId === x.id) },
  products: { title: 'Productos', one: 'producto', intro: 'Catálogo de códigos de material. Al subir un documento con un código nuevo se añade aquí automáticamente.',
    fields: [{ k: 'code', l: 'Código de material', req: 1, mono: 1 }, { k: 'name', l: 'Nombre', req: 1 }, { k: 'categoryId', l: 'Categoría', ref: 'prodcats' }, { k: 'description', l: 'Descripción', area: 1 }],
    used: x => D.documents.some(d => d.code.toLowerCase() === x.code.toLowerCase()) },
  prodcats: { title: 'Categorías de producto', one: 'categoría', intro: 'Agrupan los productos del catálogo.',
    fields: [{ k: 'name', l: 'Nombre', req: 1 }, { k: 'description', l: 'Descripción' }], used: x => D.products.some(p => p.categoryId === x.id) },
};
function viewCatalog(m, coll) {
  const C = CATS[coll]; if (!C) return viewHome(m);
  const rows = D[coll].slice().sort((a, b) => String(a.code || a.name || '').localeCompare(String(b.code || b.name || '')));
  m.innerHTML = `<div class="head"><h1>${C.title}</h1><button class="btn primary" id="add">+ Añadir ${C.one}</button></div><p class="hint">${C.intro}</p>
    <input id="cq" class="search" placeholder="Buscar…"><div class="tablewrap"><table class="tbl"><thead><tr>${C.fields.map(f => `<th>${f.l}</th>`).join('')}${coll === 'products' ? '<th>Documentos</th>' : ''}<th></th></tr></thead><tbody id="cb"></tbody></table></div>`;
  const txt = (f, x) => f.ref ? (byId(f.ref, x[f.k])?.name || '') : (x[f.k] || '');
  const draw = () => {
    const q = $('#cq').value.trim().toLowerCase();
    $('#cb').innerHTML = rows.filter(x => !q || C.fields.some(f => String(txt(f, x)).toLowerCase().includes(q))).map(x => `<tr>
      ${C.fields.map(f => `<td class="${f.mono ? 'mono' : ''}">${esc(txt(f, x) || '—')}</td>`).join('')}
      ${coll === 'products' ? `<td><a href="#docs" data-q="${esc(x.code)}">${D.documents.filter(d => d.code.toLowerCase() === x.code.toLowerCase()).length}</a></td>` : ''}
      <td><button class="btn sm" data-e="${esc(x.id)}">Editar</button></td></tr>`).join('') || '<tr><td colspan="9" class="hint">Sin registros.</td></tr>';
    $$('[data-e]', m).forEach(b => { b.onclick = () => editRecord(coll, byId(coll, b.dataset.e)); });
  };
  $('#cq').oninput = draw; draw();
  $('#add').onclick = () => editRecord(coll, null);
}
function editRecord(coll, x) {
  const C = CATS[coll], isNew = !x, w = x ? { ...x } : { id: coll.slice(0, 2) + '-' + uid(), createdAt: now() };
  const dlg = openDialog(`<h2>${isNew ? 'Nuevo' : 'Editar'} ${C.one}</h2><form id="rf" class="form" novalidate>
    ${C.fields.map(f => `<label>${f.l}${f.ref ? `<select name="${f.k}"><option value="">—</option>${D[f.ref].map(o => `<option value="${esc(o.id)}" ${o.id === w[f.k] ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>`
      : f.area ? `<textarea name="${f.k}" rows="3">${esc(w[f.k] || '')}</textarea>` : `<input name="${f.k}" value="${esc(w[f.k] || '')}" class="${f.mono ? 'mono' : ''}">`}</label>`).join('')}
    <div class="actions end">${isNew ? '' : '<button type="button" class="btn danger" id="rdel">Eliminar</button><span class="sep"></span>'}<button type="button" class="btn" data-x>Cancelar</button><button class="btn primary">Guardar</button></div></form>`);
  const f = $('#rf');
  f.onsubmit = async e => {
    e.preventDefault();
    for (const fl of C.fields) { w[fl.k] = f.elements[fl.k].value.trim(); if (fl.req && !w[fl.k]) return uiAlert(`Rellena «${fl.l}».`); }
    if (coll === 'products' && D.products.some(p => p.id !== w.id && p.code.toLowerCase() === w.code.toLowerCase())) return uiAlert('Ya existe un producto con ese código.');
    await store.put(coll, w); dlg.close(); toast('Guardado'); render();
  };
  if (!isNew) $('#rdel').onclick = async () => {
    if (C.used(w)) return uiAlert('No se puede eliminar porque está en uso.');
    if (!(await uiConfirm('¿Eliminar definitivamente?'))) return;
    await store.del(coll, w.id); dlg.close(); render();
  };
}

/* ---------- Usuarios ---------- */
function viewUsers(m) {
  const rows = D.users.slice().sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  m.innerHTML = `<div class="head"><h1>Usuarios</h1><button class="btn primary" id="addU">+ Añadir persona</button></div>
    <p class="hint">Personas que pueden formar parte de los circuitos. Cada una entra con su correo; la primera vez elige su contraseña y registra su firma.</p>
    <div class="tablewrap"><table class="tbl"><thead><tr><th>Nombre</th><th>Correo</th><th>Rol / cargo</th><th>Firma</th><th>Circuitos</th><th></th></tr></thead><tbody>
    ${rows.map(u => `<tr><td><b>${esc(u.name || '—')}</b>${u.id === ME.id ? ' <span class="badge st-ok">tú</span>' : ''}</td><td>${esc(u.id)}</td><td>${esc(u.role || '—')}</td>
      <td>${u.signature ? `<img class="sigimg" style="max-height:32px" src="${u.signature}" alt="">` : '<span class="hint">Sin firma</span>'}</td>
      <td>${D.circuits.filter(c => signerList(c).some(s => s.email === u.id)).map(c => esc(c.name)).join('<br>') || '—'}</td>
      <td><button class="btn sm" data-u="${esc(u.id)}">Editar</button></td></tr>`).join('')}</tbody></table></div>`;
  $('#addU').onclick = () => editUser(null);
  $$('[data-u]', m).forEach(b => { b.onclick = () => editUser(userOf(b.dataset.u)); });
}
function editUser(u) {
  const isNew = !u;
  const dlg = openDialog(`<h2>${isNew ? 'Añadir persona' : 'Editar persona'}</h2><form id="uf" class="form" novalidate>
    <label>Correo electrónico<input name="email" type="email" value="${esc(u?.id || '')}" ${isNew ? '' : 'readonly'}></label>
    <label>Nombre y apellido<input name="name" value="${esc(u?.name || '')}"></label>
    <label>Rol / cargo<input name="role" value="${esc(u?.role || '')}" placeholder="Graphic designer, Product, Executives…"></label>
    <div class="actions end">${isNew || u.id === ME.id ? '' : '<button type="button" class="btn danger" id="udel">Eliminar</button><span class="sep"></span>'}<button type="button" class="btn" data-x>Cancelar</button><button class="btn primary">Guardar</button></div></form>`);
  const f = $('#uf');
  f.onsubmit = async e => {
    e.preventDefault();
    const email = normEmail(f.elements.email.value); if (!isEmail(email)) return uiAlert('Correo no válido.');
    if (isNew && userOf(email)) return uiAlert('Esa persona ya existe.');
    const rec = (await store.get('users', email)) || { id: email, email, createdAt: now() };
    rec.name = f.elements.name.value.trim(); rec.role = f.elements.role.value.trim();
    await store.put('users', rec); dlg.close(); toast('Guardado'); render();
  };
  if ($('#udel')) $('#udel').onclick = async () => {
    if (D.circuits.some(c => signerList(c).some(s => s.email === u.id))) return uiAlert('Quita antes a esta persona de los circuitos en los que participa.');
    if (D.documents.some(d => pendingSigners(d).some(p => p.email === u.id))) return uiAlert('Tiene documentos pendientes de firma.');
    if (!(await uiConfirm('¿Eliminar a esta persona?'))) return;
    await store.del('users', u.id); dlg.close(); render();
  };
}

/* ---------- Perfil y firma ---------- */
function viewProfile(m) {
  m.innerHTML = `<h1>Mi perfil y firma</h1>
    ${ME.signature ? '' : '<div class="notice warn">Registra tu firma: se añadirá al cuadro de firmas de cada documento que apruebes.</div>'}
    <div class="grid2">
      <section class="card"><h2>Mis datos</h2><form id="pf" class="form" novalidate>
        <label>Correo<input value="${esc(ME.id)}" readonly></label>
        <label>Nombre y apellido<input name="name" value="${esc(ME.name || '')}"></label>
        <label>Rol / cargo<input name="role" value="${esc(ME.role || '')}" placeholder="Graphic designer, Product, Executives…"></label>
        <div class="actions"><button class="btn primary">Guardar datos</button></div></form></section>
      <section class="card"><h2>Firma actual</h2>
        <div class="sigprev">${ME.signature ? `<img src="${ME.signature}" alt="Mi firma">` : '<span class="hint">Aún no has registrado tu firma</span>'}</div>
        ${ME.signatureAt ? `<p class="hint">Registrada el ${fmtDT(ME.signatureAt)}</p>` : ''}</section>
    </div>
    <section class="card"><h2>Cambiar contraseña</h2><form id="cpf" class="form" novalidate><div class="row">
      <label>Nueva contraseña<input name="p1" type="password" minlength="6" autocomplete="new-password"></label>
      <label>Repite la contraseña<input name="p2" type="password" minlength="6" autocomplete="new-password"></label></div>
      <div class="err" id="cperr"></div><div class="actions" style="margin-top:0"><button class="btn">Cambiar contraseña</button></div></form></section>
    <section class="card"><h2>${ME.signature ? 'Cambiar mi firma' : 'Crear mi firma'}</h2><div id="sigEd">${sigEditorHtml()}</div>
      <div class="actions"><button class="btn primary" id="saveSig">Guardar firma</button></div></section>`;
  const ed = mountSigEditor($('#sigEd'));
  $('#saveSig').onclick = async () => { const s = ed.get(); if (!s) return uiAlert('Dibuja tu firma o adjunta una imagen.'); await saveMySignature(s); toast('Firma guardada'); render(); };
  $('#cpf').onsubmit = async e => {
    e.preventDefault(); const f = e.target; $('#cperr').textContent = '';
    const p1 = f.elements.p1.value, p2 = f.elements.p2.value;
    if (p1.length < 6) return ($('#cperr').textContent = 'La contraseña debe tener al menos 6 caracteres.');
    if (p1 !== p2) return ($('#cperr').textContent = 'Las contraseñas no coinciden.');
    try { await store.updatePassword(p1); f.reset(); toast('Contraseña actualizada'); } catch (err) { $('#cperr').textContent = err.message; }
  };
  $('#pf').onsubmit = async e => {
    e.preventDefault();
    const u = (await store.get('users', ME.id)) || ME; u.name = e.target.elements.name.value.trim(); u.role = e.target.elements.role.value.trim();
    await store.put('users', u); ME = u; toast('Datos guardados'); render();
  };
}

/* ---------- Arranque ---------- */
(async () => {
  try {
    if (CFG.supabaseUrl && CFG.supabaseAnonKey) { await loadScript(SUPABASE_JS); store = supaStore(); }
    else store = localStore();
    await store.init();
    document.title = CFG.appName;
    if (store.mode === 'local') { await seedIfEmpty(); try { await seedDemo(); } catch (e) { console.warn('demo', e); } }
    const email = await store.session();
    if (email && store.mode === 'supabase') await new Promise(r => setTimeout(r, 350));
    if (email && (store.isRecovery?.() || (store.mode === 'supabase' && recoverFlag.get(email)))) showNewPassword(email);
    else if (email) await afterLogin(email); else showLogin();
  } catch (e) {
    console.error(e);
    $('#boot').innerHTML = `<div class="card"><b>No se pudo iniciar la aplicación.</b><p class="err">${esc(e.message)}</p></div>`;
  }
})();
