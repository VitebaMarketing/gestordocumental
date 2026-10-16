'use strict';
/* =========================================================================
   Circuito de firmas de diseño · Gafial Group
   Web estática (GitHub Pages). Datos en Supabase si está configurado en
   config.js; si no, en el propio navegador (modo local de demostración).
   ========================================================================= */

const CFG = Object.assign({ appName: 'Circuito de firmas', company: '', supabaseUrl: '', supabaseAnonKey: '' }, window.APP_CONFIG || {});
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
const ST = { INC: 'En circuito', REJ: 'Rechazado', APR: 'Aprobado', OBS: 'Obsoleto' };
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
const enc = encodeURIComponent;
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
      signers: [{ role: 'Dirección - Executive', members: ['ggalimberti@doribac.com', 'cbianchi@viteba.com', 'amanas@viteba.com'] }] },
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
      await store.add('signatures', { id: `${id}|1|${email}`, docId: id, v: 1, email, name: u.name, role: slotRoleFor(c, email), decision: 'OK', comment: '', signature: u.signature, at: iso(ago) });
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
/* Un paso del circuito es una persona { email, role } o un grupo { role, members: [emails] }:
   en un grupo basta con que firme UNA de las personas (p. ej. «Dirección - Executive»). */
const isGroup = s => Array.isArray(s?.members);
const slotEmails = s => isGroup(s) ? s.members : [s.email];
const signerList = v => (v.signers || []).map(s => typeof s === 'string' ? { email: s, role: '' } : s);
const allSignerEmails = v => [...new Set(signerList(v).flatMap(slotEmails))];
const pendEmails = rows => [...new Set(rows.flatMap(slotEmails))];
const memberNames = s => s.members.map(e => uname(e)).join(' / ');
const slotName = r => isGroup(r) ? `${r.role || 'Grupo'} (${memberNames(r)})` : uname(r.email);
const slotRoleFor = (v, email) => signerList(v).find(s => slotEmails(s).includes(email))?.role || '';
function signerRows(d, v) {
  const sigs = sigsOf(d.id, v.n);
  return signerList(v).map((s, i) => {
    if (!isGroup(s)) return { ...s, i, sig: sigs.find(x => x.email === s.email) };
    const sig = sigs.find(x => x.slot === i && s.members.includes(x.email)) || sigs.find(x => x.slot == null && s.members.includes(x.email));
    return { ...s, i, group: true, sig, email: sig?.email || '' };
  });
}
const isObsolete = v => !!(v && (v.obsolete || v.superseded));
function verStatus(d, v) {
  const c = circuitStatus(d, v);
  return c === ST.INC && isObsolete(v) ? ST.OBS : c;
}
function circuitStatus(d, v) {
  const rows = signerRows(d, v);
  if (rows.some(r => r.sig && r.sig.decision !== 'OK')) return ST.REJ;
  if (rows.length && rows.every(r => r.sig && r.sig.decision === 'OK')) return ST.APR;
  return ST.INC;
}
const docStatus = d => verStatus(d, latest(d));
function canSign(d, email) {
  const v = latest(d); if (verStatus(d, v) !== ST.INC) return false;
  if (sigsOf(d.id, v.n).some(x => x.email === email)) return false;
  const rows = signerRows(d, v); const me = rows.find(r => !r.sig && slotEmails(r).includes(email));
  if (!me) return false;
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


/* =========================================================================
   INTERFAZ
   ========================================================================= */

/* ---------- Iconos (trazados de Lucide, licencia ISC) ---------- */
const ICON_PATHS = {
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  fileclock: '<path d="M16 22h2a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><circle cx="8" cy="16" r="6"/><path d="M9.5 17.5 8 16.25V14"/>',
  archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  workflow: '<circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9"/><path d="M12 12v3"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  filetext: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  package: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  pen: '<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  chevrondown: '<path d="m6 9 6 6 6-6"/>',
  chevronright: '<path d="m9 18 6-6-6-6"/>',
  chevronleft: '<path d="m15 18-6-6 6-6"/>',
  updown: '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
  sortup: '<path d="m18 15-6-6-6 6"/>',
  sortdown: '<path d="m6 9 6 6 6-6"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkcircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
  xcircle: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  hourglass: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
  minus: '<path d="M5 12h14"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  arrowup: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  arrowdown: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  arrowright: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  arrowleft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  panel: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
  menu: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  zoomin: '<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/>',
  zoomout: '<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="8" x2="14" y1="11" y2="11"/>',
  maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  fit: '<path d="M21 3 14 10"/><path d="M3 21l7-7"/><path d="M16 3h5v5"/><path d="M8 21H3v-5"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  hash: '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  split: '<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"/><path d="m15 9 6-6"/>',
  listordered: '<line x1="10" x2="21" y1="6" y2="6"/><line x1="10" x2="21" y1="12" y2="12"/><line x1="10" x2="21" y1="18" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  rotate: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  shieldok: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
};
const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[n] || ''}</svg>`;

/* ---------- Piezas reutilizables ---------- */
const AV_COLORS = ['#245DDB', '#0E8A5F', '#C2410C', '#7C3AED', '#0E7490', '#BE185D', '#4D7C0F', '#A16207'];
function initials(e) {
  const parts = String(uname(e)).replace(/@.*/, '').split(/[\s.]+/).filter(Boolean);
  return (((parts[0] || '?')[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
function avatar(e, size = '') {
  let h = 0; for (const c of String(e)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `<span class="av ${size}" style="--av:${AV_COLORS[h % AV_COLORS.length]}" title="${esc(uname(e))}">${esc(initials(e))}</span>`;
}
const avStack = (emails, max = 4) => `<span class="avstack">${emails.slice(0, max).map(e => avatar(e, 'sm')).join('')}${emails.length > max ? `<span class="av sm more">+${emails.length - max}</span>` : ''}</span>`;
const who = (e, size = 'sm') => `<span class="who">${avatar(e, size)}<span>${esc(uname(e))}</span></span>`;
function relTime(d) {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60) return 'ahora mismo';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 172800) return 'ayer';
  if (s < 604800) return `hace ${Math.floor(s / 86400)} días`;
  return fmtDay(d);
}
const STATUS_META = {
  'En circuito': ['info', 'clock'], 'Pendiente de mi firma': ['warn', 'pen'], 'Rechazado': ['danger', 'xcircle'], 'Aprobado': ['ok', 'checkcircle'],
  'Obsoleto': ['muted', 'archive'], 'Vigente': ['ok', 'shieldok'], 'Firmado': ['ok', 'check'], 'Pendiente': ['warn', 'clock'], 'Esperando turno': ['muted', 'hourglass'], '—': ['muted', 'minus'],
};
function sbadge(label) { const [t, i] = STATUS_META[label] || ['muted', 'info']; return `<span class="badge b-${t}">${icon(i)}${esc(label)}</span>`; }
const badge = sbadge;
const docLabel = (d, v = latest(d)) => isObsolete(v) ? ST.OBS : (v.n === latest(d).n && canSign(d, ME.id)) ? 'Pendiente de mi firma' : verStatus(d, v);
const vigBadge = (d, v) => isObsolete(v) ? sbadge(ST.OBS) : circuitStatus(d, v) === ST.APR ? sbadge('Vigente') : '';
const isImg = v => /^image\//.test(v.fileType || '');
const docCell = (d, v = latest(d)) => `<div class="doccell"><span class="fi ${isImg(v) ? 'img' : ''}">${icon(isImg(v) ? 'image' : 'filetext')}</span><span class="min0"><b>${esc(v.title || d.title)}</b><small class="mono">${esc(d.code)} · V${v.n}</small></span></div>`;
function progress(d, v = latest(d)) {
  const rows = signerRows(d, v), ok = rows.filter(r => r.sig?.decision === 'OK').length;
  return `<div class="prog" title="${ok} de ${rows.length} firmas"><span class="prog-bar"><i style="width:${rows.length ? ok / rows.length * 100 : 0}%"></i></span><span>${ok}/${rows.length}</span></div>`;
}
const modeChip = c => (c.order === 'seq')
  ? `<span class="mode">${icon('listordered')}Firma secuencial</span>`
  : `<span class="mode">${icon('split')}Firma en paralelo</span>`;
const modeText = o => o === 'seq' ? 'Cada persona firma después de la anterior, en el orden indicado.' : 'Todas las personas pueden firmar a la vez, en cualquier orden.';
function emptyState(ic, title, text, action = '', compact = false) {
  return `<div class="empty ${compact ? 'compact' : ''}"><span class="empty-ic">${icon(ic)}</span><b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
}
const pageHead = (title, sub, actions = '') => `<div class="page-h"><div class="min0"><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</div>`;
function flowHtml(signers, order) {
  const list = signers.map(s => typeof s === 'string' ? { email: s, role: '' } : s);
  if (!list.length) return `<div class="alert a-warn">${icon('alert')}<div>Este circuito aún no tiene firmantes.</div></div>`;
  return `<ol class="flow ${order === 'seq' ? 'seq' : 'par'}">${list.map((s, i) => isGroup(s)
    ? `<li>${order === 'seq' ? `<span class="f-n">${i + 1}</span>` : avStack(s.members, 3)}<span class="f-who"><b>${esc(s.role || 'Grupo')} <span class="gtag">${icon('users')}Firma 1 de ${s.members.length}</span></b><small>Puede firmar cualquiera: ${esc(memberNames(s))}</small></span></li>`
    : `<li>${order === 'seq' ? `<span class="f-n">${i + 1}</span>` : avatar(s.email)}<span class="f-who"><b>${esc(uname(s.email))}</b><small>${esc(s.role || userOf(s.email)?.role || 'Firmante')} · ${esc(s.email)}</small></span></li>`).join('')}</ol>`;
}
function hflow(c) {
  const list = signerList(c);
  if (!list.length) return `<div class="alert a-warn">${icon('alert')}<div>Sin firmantes: añade al menos una persona.</div></div>`;
  const node = (s, i) => `<div class="node">${c.order === 'seq' ? `<span class="f-n" style="width:28px;height:28px;border-radius:50%;background:var(--primary-soft);color:var(--primary);display:grid;place-items:center;font-weight:700;font-size:12px">${i + 1}</span>` : isGroup(s) ? avStack(s.members, 3) : avatar(s.email, 'sm')}<span>${isGroup(s)
    ? `<b>${esc(s.role || 'Grupo')}</b><small>Cualquiera de ${s.members.length}: ${esc(memberNames(s))}</small>`
    : `<b>${esc(uname(s.email))}</b><small>${esc(s.role || 'Firmante')}</small>`}</span></div>`;
  return c.order === 'seq'
    ? `<div class="hflow">${list.map((s, i) => node(s, i) + (i < list.length - 1 ? `<span class="arrow">${icon('arrowright')}</span>` : '')).join('')}</div>`
    : `<div class="hflow"><div class="group"><span class="group-l">En paralelo</span>${list.map(node).join('')}</div></div>`;
}

function dlBtn(d, v, o = {}) {
  const cls = o.cls || 'icon-btn sm', inner = o.label ? `${icon('download')}${o.label}` : icon('download'), id = o.id ? ` id="${o.id}"` : '';
  if (SPC.enabled && v.sp?.signed) return `<a class="${cls}"${id} href="${esc(spDlUrl(v.sp.signed))}" target="_blank" rel="noopener" title="Descargar PDF firmado desde SharePoint" aria-label="Descargar PDF firmado de ${esc(d.code)} V${v.n}" data-dlog="${d.id}|${v.n}">${inner}</a>`;
  return `<button type="button" class="${cls}"${id} data-dl="${d.id}|${v.n}" title="Descargar PDF firmado" aria-label="Descargar PDF firmado de ${esc(d.code)} V${v.n}">${inner}</button>`;
}

/* ---------- Avisos (toasts) ---------- */
function toast(msg, ms = 3400, type) {
  type = type || (/^(error|no se pudo)/i.test(msg) ? 'error' : /…$/.test(msg) ? 'info' : 'ok');
  let wrap = $('#toasts');
  if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toasts'; wrap.className = 'toasts'; wrap.setAttribute('aria-live', 'polite'); document.body.appendChild(wrap); }
  const t = document.createElement('div'); t.className = 'toast t-' + type; t.setAttribute('role', 'status');
  t.innerHTML = icon(type === 'error' ? 'alert' : type === 'info' ? 'info' : 'checkcircle') + `<span>${esc(msg)}</span>`;
  wrap.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, ms);
}

/* ---------- Menús desplegables y contextuales ---------- */
let openDD = null;
function closeDD() { if (openDD) { openDD.panel.hidden = true; openDD.btn.setAttribute('aria-expanded', 'false'); openDD = null; } }
function bindDD(btn, panel, onOpen) {
  btn.onclick = e => {
    e.stopPropagation();
    const wasOpen = openDD && openDD.panel === panel; closeDD(); closeCtx();
    if (wasOpen) return;
    if (onOpen) onOpen();
    panel.hidden = false; btn.setAttribute('aria-expanded', 'true'); openDD = { btn, panel };
  };
  panel.onclick = e => { if (e.target.closest('a,button')) closeDD(); };
}
function closeCtx() { $('#ctx')?.remove(); }
function openMenu(btn, items) {
  closeCtx(); closeDD();
  const m = document.createElement('div'); m.id = 'ctx'; m.className = 'ctx'; m.setAttribute('role', 'menu');
  m.innerHTML = items.map((it, i) => it === '-' ? '<div class="dd-sep"></div>'
    : `<button type="button" class="dd-item ${it.danger ? 'danger' : ''}" role="menuitem" data-i="${i}" ${it.disabled ? 'aria-disabled="true"' : ''} ${it.title ? `title="${esc(it.title)}"` : ''}>${icon(it.ic)}<span>${esc(it.label)}</span></button>`).join('');
  document.body.appendChild(m); ctxOpenedAt = Date.now();
  const r = btn.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(r.right - mw, innerWidth - mw - 8)) + 'px';
  m.style.top = (r.bottom + mh + 8 > innerHeight ? Math.max(8, r.top - mh - 6) : r.bottom + 6) + 'px';
  m.onclick = e => {
    const b = e.target.closest('[data-i]'); if (!b) return; e.stopPropagation();
    const it = items[+b.dataset.i]; if (it.disabled) return;
    closeCtx(); it.act();
  };
  m.querySelector('[role=menuitem]:not([aria-disabled])')?.focus({ preventScroll: true });
}
document.addEventListener('click', () => { closeDD(); closeCtx(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDD(); closeCtx(); closeNav(); } });
window.addEventListener('resize', closeCtx);
let ctxOpenedAt = 0;
window.addEventListener('scroll', e => { if (Date.now() - ctxOpenedAt > 250 && !(e.target instanceof Element && e.target.closest('#ctx'))) closeCtx(); }, true);

/* ---------- Acceso ---------- */
function loginShell(inner) {
  $('#boot').hidden = true; $('#app').hidden = true;
  const L = $('#login'); L.hidden = false;
  L.innerHTML = `<aside class="login-brand"><img src="assets/logo-white.png" alt="Gafial Group">
      <div><h2>Aprobación de diseños con firma, sin papeles.</h2>
        <p>Sube cada diseño, elige su circuito de firmas y obtén el PDF aprobado con el cuadro de firmas del equipo.</p>
        <ul><li>${icon('upload')}Subida guiada en cuatro pasos</li><li>${icon('eye')}Revisión del documento con zoom antes de firmar</li><li>${icon('shield')}Firmas y registro de actividad que no se pueden alterar</li></ul></div>
      <small>Gafial Group · Circuito de firmas</small></aside>
    <div class="login-form"><div class="login-card"><img class="logo-m" src="assets/logo.png" alt="Gafial Group">${inner}</div></div>`;
}
function showLogin() {
  loginShell(`<h1>Accede a tu cuenta</h1><p class="sub">Entra con tu correo de empresa.</p>
    <form id="lf" class="form" novalidate>
      <label>Correo electrónico<input name="email" type="email" required autocomplete="username" autofocus placeholder="nombre@empresa.com"></label>
      <label>Contraseña<input name="pass" type="password" required minlength="6" autocomplete="current-password"></label>
      <div id="first" hidden><div class="alert a-info" style="margin-bottom:12px">${icon('info')}<div id="firstMsg"></div></div>
        <label>Repite la contraseña<input name="pass2" type="password" minlength="6" autocomplete="new-password"></label></div>
      <div class="err" id="lerr" role="alert"></div>
      <button class="btn primary lg wide" id="lbtn">Entrar</button>
      <div style="text-align:center"><button type="button" class="linkbtn" id="forgot">¿Has olvidado tu contraseña?</button></div>
      <p class="muted" style="font-size:12.5px;text-align:center">La primera vez, escribe tu correo y elige una contraseña (mínimo 6 caracteres). La sesión quedará recordada en este equipo.</p>
    </form>
    ${store.mode === 'local' ? `<div class="demo"><div class="muted" style="font-size:12.5px;text-align:center"><b>Demo</b> · acceso rápido (contraseña <code>demo1234</code>)</div><div class="demo-users" id="demoUsers"></div></div>` : ''}`);
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
      else $('#lerr').innerHTML = `<span style="color:var(--ok)">Te hemos enviado un correo a <b>${esc(email)}</b> con un enlace para crear una nueva contraseña. Ábrelo en este mismo navegador y revisa también la carpeta de spam.</span>`;
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
            : `Si es tu <b>primer acceso</b>, repite la contraseña para crear tu cuenta. Si ya tenías cuenta, la contraseña no es correcta: usa «¿Has olvidado tu contraseña?».`;
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
  loginShell(`<h1>Crea tu nueva contraseña</h1><p class="sub">${esc(email)}</p>
    <form id="npf" class="form" novalidate>
      <label>Nueva contraseña<input name="p1" type="password" minlength="6" autocomplete="new-password" autofocus></label>
      <label>Repite la contraseña<input name="p2" type="password" minlength="6" autocomplete="new-password"></label>
      <div class="err" id="nperr" role="alert"></div>
      <button class="btn primary lg wide" id="npbtn">Guardar y entrar</button>
    </form>`);
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

/* ---------- Estructura de la aplicación ---------- */
const NAV = [
  ['Operaciones', [['home', 'Inicio', 'home'], ['docs', 'Estado de documentos', 'fileclock'], ['historico', 'Histórico aprobados', 'archive']]],
  ['Administración', [['circuits', 'Circuitos de firma', 'workflow'], ['cat/doctypes', 'Tipos de documento', 'file'], ['cat/products', 'Productos', 'package'], ['cat/prodcats', 'Categorías de producto', 'tag'], ['users', 'Usuarios', 'users']]],
  ['Mi cuenta', [['perfil', 'Mi perfil y firma', 'pen']]],
];
function closeNav() { $('#side')?.classList.remove('open'); $('#scrim')?.remove(); }
function buildShell() {
  $('#sideCta').innerHTML = `${icon('plus')}<span>Subir documento</span>`;
  $('#nav').innerHTML = NAV.map(([sec, items]) => `<div class="side-sec">${sec}</div>${items.map(([h, l, ic]) =>
    `<a class="side-link" href="#${h}" data-nav="${h}" title="${esc(l)}">${icon(ic)}<span class="lbl">${esc(l)}</span>${h === 'home' ? '<span class="side-count" id="cntPend" hidden></span>' : ''}</a>`).join('')}`).join('');
  $('#collapseBtn').innerHTML = `${icon('panel')}<span>Contraer menú</span>`;
  $('#menuBtn').innerHTML = icon('menu');
  $('#bellBtn').innerHTML = `${icon('bell')}<span class="bell-count" id="bellCount" hidden></span>`;
  const shell = $('#app');
  try { if (localStorage.getItem('gf_side') === '1') shell.classList.add('collapsed'); } catch { }
  $('#collapseBtn').onclick = () => {
    shell.classList.toggle('collapsed');
    $('#collapseBtn span').textContent = shell.classList.contains('collapsed') ? 'Expandir menú' : 'Contraer menú';
    try { localStorage.setItem('gf_side', shell.classList.contains('collapsed') ? '1' : '0'); } catch { }
  };
  if (shell.classList.contains('collapsed')) $('#collapseBtn span').textContent = 'Expandir menú';
  $('#menuBtn').onclick = e => {
    e.stopPropagation(); const s = $('#side');
    if (s.classList.contains('open')) return closeNav();
    s.classList.add('open'); const sc = document.createElement('div'); sc.id = 'scrim'; sc.className = 'scrim'; sc.onclick = closeNav; document.body.appendChild(sc);
  };
  bindDD($('#bellBtn'), $('#bellDrop'));
  bindDD($('#userBtn'), $('#userDrop'));
}
function setCrumbs(items) {
  $('#crumbs').innerHTML = items.map((it, i) => {
    const last = i === items.length - 1;
    if (last) return `<span aria-current="page">${esc(it[0])}</span>`;
    return (it[1] ? `<a href="${it[1]}">${esc(it[0])}</a>` : `<span>${esc(it[0])}</span>`) + icon('chevronright', 'sep-ic');
  }).join('');
}
function renderTop() {
  renderSpState();
  const mine = sortDocs(D.documents.filter(d => canSign(d, ME.id)));
  const myRejected = sortDocs(D.documents.filter(d => docStatus(d) === ST.REJ && latest(d).uploadedBy === ME.id)).slice(0, 5);
  const c = $('#cntPend'); if (c) { c.textContent = mine.length; c.hidden = !mine.length; }
  $('#bellCount').textContent = mine.length; $('#bellCount').hidden = !mine.length;
  $('#bellBtn').setAttribute('aria-label', mine.length ? `Notificaciones: ${mine.length} pendientes de tu firma` : 'Notificaciones');
  $('#bellDrop').innerHTML = `<div class="dd-head">Notificaciones</div>` + ((mine.length || myRejected.length)
    ? mine.map(d => `<a class="dd-item" href="#doc/${d.id}">${icon('pen', 'ic-warn')}<span class="min0"><b>Pendiente de tu firma</b><small>${esc(d.code)} · V${latest(d).n} · ${esc(latest(d).title || d.title)}</small></span></a>`).join('')
      + myRejected.map(d => { const r = sigsOf(d.id, latest(d).n).find(s => s.decision !== 'OK'); return `<a class="dd-item" href="#doc/${d.id}">${icon('xcircle', 'ic-danger')}<span class="min0"><b>Rechazado por ${esc(uname(r?.email))}</b><small>${esc(d.code)} · V${latest(d).n} · ${relTime(r?.at)}</small></span></a>`; }).join('')
    : `<div class="dd-empty">${icon('checkcircle', 'ic-ok')}<br>No tienes avisos pendientes.</div>`);
  $('#userBtn').innerHTML = `${avatar(ME.id)}<span class="u-name">${esc(ME.name || ME.id)}</span>${icon('chevrondown')}`;
  $('#userDrop').innerHTML = `<div class="dd-who">${avatar(ME.id)}<div class="min0"><b>${esc(ME.name || ME.id)}</b><small>${esc(ME.id)}</small></div></div>
    <a class="dd-item" href="#perfil">${icon('pen')}<span>Mi perfil y firma${ME.signature ? '' : ' <span class="badge b-warn" style="height:20px">Sin firma</span>'}</span></a>
    <button type="button" class="dd-item" id="chpass">${icon('key')}<span>Cambiar contraseña</span></button>
    <div class="dd-sep"></div>
    <button type="button" class="dd-item" id="logout">${icon('logout')}<span>Cerrar sesión</span></button>`;
  $('#chpass').onclick = () => { closeDD(); changePasswordDialog(); };
  $('#logout').onclick = async () => { await store.signOut(); location.hash = ''; location.reload(); };
}

let shellBound = false;
async function afterLogin(email) {
  await seedIfEmpty();
  ME = await ensureUser(email);
  $('#login').hidden = true; $('#boot').hidden = true; $('#app').hidden = false;
  if (!shellBound) {
    shellBound = true;
    buildShell();
    if (store.mode === 'local') $('#banner').innerHTML = `<div class="banner">${icon('info')}<span>${CFG.demoNote ? esc(CFG.demoNote) : 'Modo local de demostración: los datos solo se guardan en este navegador. Para que cada persona firme desde su equipo, conecta Supabase (ver README).'}</span></div>`;
    window.addEventListener('hashchange', render);
  }
  if (/access_token=|type=recovery|error_description=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  if (!ME.signature && !location.hash) location.hash = '#perfil';
  await spInit();
  await render();
  if (spConnected()) spSyncAll();
}

/* ---------- Router ---------- */
const ROUTES = { home: viewHome, upload: viewUpload, doc: viewDoc, docs: viewDocs, historico: viewHistory, circuits: viewCircuits, cat: viewCatalog, users: viewUsers, perfil: viewProfile };
let renderSeq = 0, cleanups = [];
function skeleton() {
  const line = (w, h = 14) => `<div class="sk sk-line" style="width:${w};height:${h}px"></div>`;
  return `<div aria-busy="true" aria-label="Cargando">${line('260px', 26)}${line('380px')}
    <div class="kpis" style="margin-top:22px">${'<div class="sk" style="height:78px;border-radius:14px"></div>'.repeat(4)}</div>
    <div class="card">${line('180px', 18)}${Array.from({ length: 5 }, () => line('100%', 32)).join('')}</div></div>`;
}
function markNav(path) {
  const base = path.startsWith('doc/') ? 'docs' : path;
  $$('[data-nav]').forEach(a => { const h = a.dataset.nav; const on = base === h || base.startsWith(h + '/'); a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  $('#sideCta').classList.toggle('active', path.startsWith('upload'));
}
async function render() {
  if (!ME) return;
  const seq = ++renderSeq;
  const path = location.hash.slice(1) || 'home'; const [r, ...args] = path.split('/');
  markNav(path); closeNav(); closeDD(); closeCtx();
  if ($('#dlg').open) $('#dlg').close();
  if ($('#dlg2').open) $('#dlg2').close();
  cleanups.forEach(f => { try { f(); } catch { } }); cleanups = [];
  const main = $('#main');
  const skT = setTimeout(() => { if (seq === renderSeq) main.innerHTML = skeleton(); }, 150);
  try { await refresh(); } catch (e) { toast('Error al cargar los datos: ' + e.message, 6000, 'error'); }
  clearTimeout(skT);
  if (seq !== renderSeq) return;
  renderTop();
  main.innerHTML = '';
  await (ROUTES[r] || viewHome)(main, ...args.map(decodeURIComponent));
  window.scrollTo(0, 0);
}
function bindRows(m) {
  $$('tr[data-href]', m).forEach(tr => {
    tr.onclick = e => { if (!e.target.closest('button,a,input,select')) location.hash = tr.dataset.href; };
    tr.onkeydown = e => { if (e.key === 'Enter' && e.target === tr) location.hash = tr.dataset.href; };
  });
  $$('[data-dl]', m).forEach(b => { b.onclick = e => { e.stopPropagation(); const [id, n] = b.dataset.dl.split('|'); const d = byId('documents', id); downloadSigned(d, d.versions.find(x => x.n === +n)); }; });
  $$('[data-dlog]', m).forEach(a => { a.onclick = e => { e.stopPropagation(); const [id, n] = a.dataset.dlog.split('|'); addEvent(id, `PDF firmado descargado · V${n}`, 'Desde SharePoint'); }; });
  $$('[data-menu]', m).forEach(b => { b.onclick = e => { e.stopPropagation(); const [id, n] = b.dataset.menu.split('|'); docMenu(b, byId('documents', id), +n); }; });
}
function docMenu(btn, d, n) {
  const v = d.versions.find(x => x.n === n) || latest(d), apr = circuitStatus(d, v) === ST.APR, pend = n === latest(d).n ? pendingSigners(d) : [];
  openMenu(btn, [
    { label: 'Ver detalle', ic: 'eye', act: () => { location.hash = '#doc/' + d.id; } },
    { label: 'Copiar enlace', ic: 'link', act: async () => { const ok = await copyText(docLink(d)); toast(ok ? 'Enlace copiado' : 'No se pudo copiar el enlace', 2500, ok ? 'ok' : 'error'); } },
    ...(pend.length ? [{ label: 'Avisar a pendientes', ic: 'mail', act: () => shareDialog(d, false) }] : []),
    { label: 'Subir nueva versión', ic: 'refresh', act: () => { location.hash = '#upload/' + d.id; } },
    '-',
    { label: 'Descargar PDF firmado', ic: 'download', disabled: !apr, title: apr ? '' : 'Disponible cuando hayan firmado todas las personas', act: () => downloadSigned(d, v) },
    ...(apr ? [{ label: 'Vista previa del PDF firmado', ic: 'eye', act: () => downloadSigned(d, v, { preview: true }) }] : []),
    ...(SPC.enabled && v.sp?.file ? [{ label: 'Abrir en SharePoint', ic: 'cloud', act: () => window.open((v.sp.signed || v.sp.file).webUrl, '_blank', 'noopener') }] : []),
    '-',
    n === latest(d).n
      ? (isObsolete(v) ? { label: 'Marcar como vigente', ic: 'rotate', act: () => setVigencia(d, false) } : { label: 'Marcar como obsoleto', ic: 'archive', act: () => setVigencia(d, true) })
      : { label: 'Versión obsoleta (hay una más reciente)', ic: 'archive', disabled: true },
  ]);
}

/* ---------- Inicio ---------- */
function heroArt() {
  return `<svg class="hero-art" viewBox="0 0 220 160" aria-hidden="true">
    <rect x="44" y="30" width="108" height="124" rx="10" fill="#fff" stroke="#C9D6F2" transform="rotate(-7 98 92)"/>
    <rect x="66" y="16" width="112" height="132" rx="10" fill="#fff" stroke="#BFD0F3"/>
    <rect x="82" y="36" width="58" height="7" rx="3.5" fill="#D6E2FA"/><rect x="82" y="52" width="80" height="6" rx="3" fill="#E6EDFB"/>
    <rect x="82" y="64" width="72" height="6" rx="3" fill="#E6EDFB"/><rect x="82" y="76" width="78" height="6" rx="3" fill="#E6EDFB"/>
    <path d="M86 118c8-14 14-16 12-4s6 10 12-2 10-8 8 2 8 6 18-4" fill="none" stroke="#245DDB" stroke-width="2.4" stroke-linecap="round"/>
    <line x1="82" y1="128" x2="162" y2="128" stroke="#D6E2FA" stroke-width="2"/>
    <circle cx="176" cy="34" r="22" fill="#157F3C"/><path d="m166 34 7 7 13-14" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function pendingTable(list) {
  return `<div class="tablewrap"><table class="tbl"><thead><tr><th>Documento</th><th>Tipo</th><th>Solicitante</th><th>Fecha de solicitud</th><th>Estado</th><th class="act"><span class="sr">Acción</span></th></tr></thead><tbody>
    ${list.map(d => { const v = latest(d); return `<tr data-href="#doc/${d.id}" tabindex="0"><td>${docCell(d, v)}</td><td>${esc(byId('doctypes', d.docTypeId)?.name || '—')}</td><td>${who(v.uploadedBy)}</td>
      <td class="nowrap">${fmtDay(v.uploadedAt)}<small>${relTime(v.uploadedAt)}</small></td><td>${sbadge(docLabel(d))}</td>
      <td class="act"><a class="btn primary sm" href="#doc/${d.id}">${icon('pen')}Revisar y firmar</a></td></tr>`; }).join('')}</tbody></table></div>`;
}
function approvedTable(items) {
  return `<div class="tablewrap"><table class="tbl"><thead><tr><th>Documento</th><th>Tipo</th><th>Participantes</th><th>Aprobado</th><th>Vigencia</th><th class="act"></th></tr></thead><tbody>
    ${items.map(({ d, v, at }) => `<tr data-href="#doc/${d.id}" tabindex="0"><td>${docCell(d, v)}</td><td>${esc(byId('doctypes', d.docTypeId)?.name || '—')}</td>
      <td>${avStack(allSignerEmails(v))}</td><td class="nowrap">${fmtDay(at)}<small>${fmtTime(at).slice(0, 5)}</small></td><td>${vigBadge(d, v)}</td>
      <td class="act">${dlBtn(d, v)}</td></tr>`).join('')}</tbody></table></div>`;
}
function eventInfo(e) {
  const a = e.action || '';
  if (/^SharePoint/.test(a)) return ['info', 'cloud', 'SharePoint ·'];
  if (/^Marcado obsoleto/.test(a)) return ['', 'archive', 'ha marcado como obsoleto'];
  if (/^Marcado vigente/.test(a)) return ['ok', 'rotate', 'ha marcado como vigente'];
  if (/^Firmado OK/.test(a)) return ['ok', 'check', 'ha firmado'];
  if (/^Rechazado/.test(a)) return ['ko', 'xcircle', 'ha rechazado'];
  if (/^APROBADO/.test(a)) return ['ok', 'checkcircle', 'Documento aprobado:'];
  if (/^Subida/.test(a)) return ['info', 'upload', `ha subido la ${a.replace('Subida ', '')} de`];
  if (/PDF firmado descargado/.test(a)) return ['', 'download', 'ha descargado el PDF firmado de'];
  if (/Aviso por correo/.test(a)) return ['', 'mail', 'ha avisado por correo sobre'];
  return ['', 'activity', a];
}
function feedItem(e) {
  const d = byId('documents', e.docId); const [, , verb] = eventInfo(e);
  const system = /^APROBADO/.test(e.action);
  return `<li>${system ? `<span class="av" style="--av:#157F3C">${icon('check')}</span>` : avatar(e.email)}<div class="f-b">${system ? '' : `<b>${esc(uname(e.email))}</b> `}${esc(verb)} ${d ? `<a href="#doc/${d.id}" class="mono">${esc(d.code)}</a>` : ''}
    ${e.detail && /^Rechazado/.test(e.action) ? `<div class="f-t">«${esc(e.detail)}»</div>` : ''}<div class="f-t">${relTime(e.at)}</div></div></li>`;
}
function viewHome(m) {
  setCrumbs([['Inicio']]);
  const mine = sortDocs(D.documents.filter(d => canSign(d, ME.id)));
  const inCirc = sortDocs(D.documents.filter(d => docStatus(d) === ST.INC));
  const rej = D.documents.filter(d => docStatus(d) === ST.REJ);
  const appr = approvedList();
  const name = ME.name || ME.id.split('@')[0];
  const kpi = (n, label, ic, tone, href) => `<a class="kpi k-${tone}" href="${href}"><span class="kpi-ic">${icon(ic)}</span><span class="kpi-body"><b>${n}</b><span>${label}</span></span>${icon('chevronright', 'kpi-go')}</a>`;
  const events = D.events.filter(e => byId('documents', e.docId) && e.action !== 'SharePoint').sort((a, b) => b.at.localeCompare(a.at)).slice(0, 7);
  m.innerHTML = `
    ${ME.signature ? '' : `<div class="alert a-warn">${icon('alert')}<div><b>Aún no has registrado tu firma.</b> La necesitas para firmar documentos.</div><a class="btn sm" href="#perfil">Crear mi firma</a></div>`}
    <section class="hero"><div><h1>Hola, ${esc(name)}</h1><p>Gestiona aquí los documentos que requieren firma y sigue su estado en tiempo real.</p>
      <a class="btn primary" href="#upload">${icon('plus')}Subir documento</a></div>${heroArt()}</section>
    <div class="kpis">
      ${kpi(mine.length, 'Pendientes de mi firma', 'pen', 'warn', '#docs/pendientes')}
      ${kpi(inCirc.length, 'En circuito', 'clock', 'info', '#docs/circuito')}
      ${kpi(rej.length, 'Rechazados', 'xcircle', 'danger', '#docs/rechazado')}
      ${kpi(appr.length, 'Versiones aprobadas', 'checkcircle', 'ok', '#historico')}
    </div>
    <section class="card" id="pend"><div class="card-h"><h2>Mis pendientes ${mine.length ? `<span class="cnt">${mine.length}</span>` : ''}</h2>${mine.length > 5 ? `<a class="lnk" href="#docs/pendientes">Ver todos ${icon('arrowright')}</a>` : ''}</div>
      ${mine.length ? pendingTable(mine.slice(0, 5)) : emptyState('inbox', 'No tienes documentos pendientes de firmar', 'Cuando alguien te incluya en un circuito de firma, aparecerá aquí.', '', true)}</section>
    <div class="grid-2">
      <section class="card"><div class="card-h"><h2>Documentos en curso</h2>${inCirc.length ? `<a class="lnk" href="#docs/circuito">Ver todos ${icon('arrowright')}</a>` : ''}</div>
        ${inCirc.length ? `<ul class="plist">${inCirc.slice(0, 5).map(d => { const p = pendingSigners(d); return `<li><a href="#doc/${d.id}">${docCell(d)}${sbadge(docLabel(d))}<span class="pl-sub">${progress(d)}<span class="min0">Falta: ${esc(p.map(slotName).join(', ') || '—')}</span></span></a></li>`; }).join('')}</ul>`
          : emptyState('clock', 'Nada en circuito', 'Los documentos enviados a firma aparecen aquí hasta que se aprueban.', '', true)}</section>
      <section class="card"><div class="card-h"><h2>Actividad reciente</h2></div>
        ${events.length ? `<ul class="feed">${events.map(feedItem).join('')}</ul>` : emptyState('activity', 'Sin actividad todavía', 'Aquí verás subidas, firmas y aprobaciones.', '', true)}</section>
    </div>
    <section class="card"><div class="card-h"><h2>Últimos aprobados</h2>${appr.length ? `<a class="lnk" href="#historico">Ver histórico ${icon('arrowright')}</a>` : ''}</div>
      ${appr.length ? approvedTable(appr.slice(0, 5)) : emptyState('checkcircle', 'Aún no hay documentos aprobados', 'Cuando todas las personas de un circuito firmen, el documento aparecerá aquí listo para descargar.', '', true)}</section>`;
  bindRows(m);
}

/* ---------- Listados: estado de documentos e histórico ---------- */
const LS = {};
const DOC_FILTERS = { pendientes: 'Pendiente de mi firma', circuito: ST.INC, rechazado: ST.REJ, aprobado: ST.APR, todos: '' };
const PAGE = 12;
function listPage(m, cfg) {
  const s = LS[cfg.key] || (LS[cfg.key] = { q: '', status: '', vig: '', type: '', circ: '', d1: '', d2: '', sort: 'date', dir: 'desc', page: 1 });
  if (cfg.forceStatus !== undefined) { s.status = cfg.forceStatus; s.page = 1; }
  const statusOpts = ['Pendiente de mi firma', ST.INC, ST.REJ, ST.APR, ST.OBS];
  m.innerHTML = pageHead(cfg.title, cfg.sub, `<a class="btn primary" href="#upload">${icon('plus')}Subir documento</a>`) + `
    <section class="card flush"><div class="filters" role="search">
      <div class="search">${icon('search')}<input id="fq" type="search" placeholder="${esc(cfg.ph)}" value="${esc(s.q)}" aria-label="Buscar"></div>
      ${cfg.approved ? `<select id="fv" aria-label="Vigencia"><option value="">Vigentes y obsoletos</option><option value="vig" ${s.vig === 'vig' ? 'selected' : ''}>Solo vigentes</option><option value="obs" ${s.vig === 'obs' ? 'selected' : ''}>Solo obsoletos</option></select>` : `<select id="fs" aria-label="Estado"><option value="">Todos los estados</option>${statusOpts.map(x => `<option ${x === s.status ? 'selected' : ''}>${x}</option>`).join('')}</select>`}
      <select id="ft" aria-label="Tipo de documento"><option value="">Todos los tipos</option>${D.doctypes.map(t => `<option value="${esc(t.id)}" ${t.id === s.type ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
      <select id="fc" aria-label="Circuito"><option value="">Todos los circuitos</option>${D.circuits.map(c => `<option value="${esc(c.id)}" ${c.id === s.circ ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <div class="daterange" title="${cfg.approved ? 'Fecha de aprobación' : 'Fecha de solicitud'}">${icon('calendar')}<input type="date" id="fd1" value="${s.d1}" aria-label="Desde"><span>–</span><input type="date" id="fd2" value="${s.d2}" aria-label="Hasta"></div>
      <button type="button" class="btn ghost sm" id="fclear">Limpiar filtros</button>
    </div><div id="res"></div></section>`;
  const sortVal = (it, k) => {
    const { d, v } = it;
    if (k === 'name') return (v.title || d.title || '').toLowerCase();
    if (k === 'type') return (byId('doctypes', d.docTypeId)?.name || '').toLowerCase();
    if (k === 'req') return uname(v.uploadedBy).toLowerCase();
    if (k === 'ver') return v.n;
    if (k === 'prog') { const r = signerRows(d, v); return r.length ? r.filter(x => x.sig?.decision === 'OK').length / r.length : 0; }
    if (k === 'status') return docLabel(d, v);
    return cfg.approved ? it.at : v.uploadedAt;
  };
  const th = (k, label) => `<th ${s.sort === k ? `aria-sort="${s.dir === 'asc' ? 'ascending' : 'descending'}"` : ''}><button type="button" class="th-sort" data-sort="${k}">${label}${icon(s.sort === k ? (s.dir === 'asc' ? 'sortup' : 'sortdown') : 'updown')}</button></th>`;
  const draw = () => {
    const q = s.q.trim().toLowerCase();
    const base = cfg.approved ? approvedList() : D.documents.map(d => ({ d, v: latest(d) }));
    const list = base.filter(it => {
      const { d, v } = it;
      if (s.status) {
        if (s.status === 'Pendiente de mi firma') { if (!canSign(d, ME.id)) return false; }
        else if (s.status === ST.OBS) { if (!isObsolete(v)) return false; }
        else if (isObsolete(v) || verStatus(d, v) !== s.status) return false;
      }
      if (s.vig && (s.vig === 'obs') !== isObsolete(v)) return false;
      if (s.type && d.docTypeId !== s.type) return false;
      if (s.circ && d.circuitId !== s.circ) return false;
      if (q) {
        const p = productOf(d);
        const hay = [d.code, d.title, v.title, v.fileName, p?.name, p?.description, ...allSignerEmails(v).map(e => uname(e) + ' ' + e), ...signerList(v).map(x => x.role || ''), uname(v.uploadedBy)].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (s.d1 || s.d2) { const day = localDay(cfg.approved ? it.at : v.uploadedAt); if (s.d1 && day < s.d1) return false; if (s.d2 && day > s.d2) return false; }
      return true;
    });
    list.sort((a, b) => { const x = sortVal(a, s.sort), y = sortVal(b, s.sort); const c = x < y ? -1 : x > y ? 1 : 0; return s.dir === 'asc' ? c : -c; });
    const pages = Math.max(1, Math.ceil(list.length / PAGE)); s.page = Math.min(s.page, pages);
    const slice = list.slice((s.page - 1) * PAGE, s.page * PAGE);
    const anyFilter = s.q || s.status || s.vig || s.type || s.circ || s.d1 || s.d2;
    $('#fclear').hidden = !anyFilter;
    if (!list.length) {
      $('#res').innerHTML = anyFilter ? emptyState('search', 'Ningún documento coincide con los filtros', 'Prueba con otra búsqueda o limpia los filtros.', `<button type="button" class="btn" id="fclear2">Limpiar filtros</button>`)
        : emptyState(cfg.approved ? 'archive' : 'fileclock', cfg.emptyTitle, cfg.emptyText, `<a class="btn primary" href="#upload">${icon('plus')}Subir documento</a>`);
      if ($('#fclear2')) $('#fclear2').onclick = clear;
      return;
    }
    const head = cfg.approved
      ? `${th('name', 'Documento')}${th('type', 'Tipo')}${th('ver', 'Versión')}<th>Participantes</th>${th('date', 'Aprobado')}<th>Vigencia</th><th class="act"></th>`
      : `${th('name', 'Documento')}${th('type', 'Tipo')}${th('req', 'Solicitante')}${th('date', 'Fecha')}${th('prog', 'Firmas')}${th('status', 'Estado')}<th class="act"></th>`;
    const row = it => {
      const { d, v } = it; const dt = esc(byId('doctypes', d.docTypeId)?.name || '—');
      return cfg.approved
        ? `<tr data-href="#doc/${d.id}" tabindex="0"><td>${docCell(d, v)}</td><td>${dt}</td><td><span class="ver">V${v.n}</span>${v.n !== latest(d).n ? `<small>vigente: V${latest(d).n}</small>` : ''}</td>
           <td>${avStack(allSignerEmails(v))}</td><td class="nowrap">${fmtDay(it.at)}<small>${fmtTime(it.at).slice(0, 5)}</small></td><td>${vigBadge(d, v)}</td>
           <td class="act">${dlBtn(d, v)}<button class="icon-btn sm" data-menu="${d.id}|${v.n}" aria-label="Más acciones">${icon('more')}</button></td></tr>`
        : `<tr data-href="#doc/${d.id}" tabindex="0"><td>${docCell(d, v)}</td><td>${dt}</td><td>${who(v.uploadedBy)}</td><td class="nowrap">${fmtDay(v.uploadedAt)}<small>${fmtTime(v.uploadedAt).slice(0, 5)}</small></td>
           <td>${progress(d, v)}</td><td>${sbadge(docLabel(d, v))}</td><td class="act"><button class="icon-btn sm" data-menu="${d.id}|${v.n}" aria-label="Acciones de ${esc(d.code)}">${icon('more')}</button></td></tr>`;
    };
    $('#res').innerHTML = `<div class="tablewrap"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${slice.map(row).join('')}</tbody></table></div>
      <div class="pager"><span>Mostrando ${(s.page - 1) * PAGE + 1}–${Math.min(s.page * PAGE, list.length)} de ${list.length} ${cfg.approved ? 'versiones aprobadas' : 'documentos'}</span>
      ${pages > 1 ? `<div><button type="button" class="icon-btn sm" id="pgPrev" ${s.page === 1 ? 'disabled' : ''} aria-label="Página anterior">${icon('chevronleft')}</button><span>Página ${s.page} de ${pages}</span><button type="button" class="icon-btn sm" id="pgNext" ${s.page === pages ? 'disabled' : ''} aria-label="Página siguiente">${icon('chevronright')}</button></div>` : ''}</div>`;
    bindRows($('#res'));
    $$('[data-sort]', $('#res')).forEach(b => { b.onclick = () => { const k = b.dataset.sort; if (s.sort === k) s.dir = s.dir === 'asc' ? 'desc' : 'asc'; else { s.sort = k; s.dir = (k === 'date' || k === 'ver' || k === 'prog') ? 'desc' : 'asc'; } draw(); }; });
    if ($('#pgPrev')) { $('#pgPrev').onclick = () => { s.page--; draw(); }; $('#pgNext').onclick = () => { s.page++; draw(); }; }
  };
  const clear = () => { Object.assign(s, { q: '', status: '', vig: '', type: '', circ: '', d1: '', d2: '', page: 1 }); ['fq', 'fs', 'fv', 'ft', 'fc', 'fd1', 'fd2'].forEach(id => { if ($('#' + id)) $('#' + id).value = ''; }); draw(); };
  const bindF = (id, k) => { const e = $('#' + id); if (e) e.oninput = () => { s[k] = e.value; s.page = 1; draw(); }; };
  bindF('fq', 'q'); bindF('fs', 'status'); bindF('fv', 'vig'); bindF('ft', 'type'); bindF('fc', 'circ'); bindF('fd1', 'd1'); bindF('fd2', 'd2');
  $('#fclear').onclick = clear;
  draw();
}
function viewDocs(m, f) {
  setCrumbs([['Estado de documentos']]);
  let force;
  if (f !== undefined) { const k = String(f).toLowerCase(); force = k in DOC_FILTERS ? DOC_FILTERS[k] : ([ST.INC, ST.REJ, ST.APR].find(x => x.toLowerCase() === k) ?? ''); }
  return listPage(m, { key: 'docs', title: 'Estado de documentos', sub: 'Consulta y filtra todos los documentos enviados a firma.', ph: 'Buscar por nombre, código, producto o persona…',
    forceStatus: force, emptyTitle: 'Todavía no hay documentos', emptyText: 'Sube el primer diseño para iniciar su circuito de firma.' });
}
function viewHistory(m) {
  setCrumbs([['Histórico aprobados']]);
  return listPage(m, { key: 'hist', approved: true, title: 'Histórico aprobados', sub: 'Documentos firmados por todas las personas de su circuito, con sus versiones y su vigencia.', ph: 'Buscar por nombre, código, producto o firmante…',
    emptyTitle: 'Aún no hay documentos aprobados', emptyText: 'Cuando todas las personas de un circuito firmen un documento, aparecerá aquí.' });
}

/* ---------- Subir documento (asistente en 4 pasos) ---------- */
const fmtSize = b => b >= 1048576 ? (b / 1048576).toFixed(2) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
function viewUpload(m, fromId) {
  const from = fromId ? byId('documents', fromId) : null;
  setCrumbs(from ? [['Estado de documentos', '#docs'], [from.code, '#doc/' + from.id], ['Nueva versión']] : [['Subir documento']]);
  const w = {
    step: 1, file: null, busy: false,
    code: from?.code || '', title: from ? (latest(from).title || from.title) : '',
    docTypeId: from?.docTypeId || (byId('doctypes', 'dt-aaff') ? 'dt-aaff' : D.doctypes[0]?.id || ''),
    circuitId: from?.circuitId || D.circuits[0]?.id || '', note: '',
  };
  const STEPS = ['Documento', 'Información', 'Circuito de firma', 'Revisar y enviar'];
  m.innerHTML = pageHead(from ? `Nueva versión de <span class="mono">${esc(from.code)}</span>` : 'Subir documento', 'Añade el documento, completa su información y elige el circuito de firma.') + `
    <section class="card wz"><ol class="stepper" id="wzSteps" aria-label="Pasos"></ol><div class="wz-body" id="wzBody"></div>
    <div class="wz-foot"><button type="button" class="btn" id="wzCancel">Cancelar</button><span class="sep"></span><span class="wz-hint" id="wzHint" aria-live="polite"></span>
      <button type="button" class="btn" id="wzBack">${icon('arrowleft')}Anterior</button><button type="button" class="btn primary" id="wzNext"></button></div></section>
    <datalist id="codes">${D.products.map(p => `<option value="${esc(p.code)}">${esc(p.name)}</option>`).join('')}</datalist>`;
  const body = $('#wzBody');
  const product = () => D.products.find(p => p.code.toLowerCase() === w.code.trim().toLowerCase());
  const circuit = () => byId('circuits', w.circuitId);
  const verInfo = () => { const ex = w.code.trim() && w.circuitId ? findExisting(w.code, w.circuitId) : null; return ex ? { n: latest(ex).n + 1, ex, supersede: docStatus(ex) === ST.INC, obsoletes: !isObsolete(latest(ex)) } : { n: 1 }; };
  const missing = step => {
    if (step >= 1 && !w.file) return 'Selecciona el documento.';
    if (step >= 2) {
      if (!w.code.trim()) return 'Indica el código de material.';
      if (!w.title.trim()) return 'Escribe el nombre del documento.';
      if (!byId('doctypes', w.docTypeId)) return 'Elige el tipo de documento.';
    }
    if (step >= 3) { const c = circuit(); if (!c) return 'Elige un circuito de firma.'; if (!signerList(c).length) return 'El circuito elegido no tiene firmantes.'; }
    if (step >= 4 && SPC.enabled && !spConnected()) return 'Conecta SharePoint para enviar el documento.';
    return '';
  };
  const fileCard = (f, removable = true) => `<div class="filecard"><span class="fi">${icon(/^image\//.test(f.type) ? 'image' : 'filetext')}</span><div><b>${esc(f.name)}</b><small>${fmtSize(f.size)} · ${/pdf/.test(f.type) || /\.pdf$/i.test(f.name) ? 'PDF' : f.type.replace('image/', '').toUpperCase()}</small></div>
    ${removable ? `<button type="button" class="icon-btn sm" id="rmFile" aria-label="Quitar archivo">${icon('x')}</button>` : icon('checkcircle', 'ok-ic')}</div>`;
  const upd = () => {
    const miss = missing(w.step);
    $('#wzNext').disabled = w.busy || !!miss;
    $('#wzHint').innerHTML = miss && !w.busy ? `${icon('alert')}${esc(miss)}` : '';
  };
  const go = n => { w.step = n; draw(); };
  const drawSteps = () => {
    $('#wzSteps').innerHTML = STEPS.map((s, i) => { const n = i + 1, cls = n < w.step ? 'done' : n === w.step ? 'current' : '';
      return `<li class="${cls}"><button type="button" data-go="${n}" ${n < w.step ? '' : 'disabled'} ${n === w.step ? 'aria-current="step"' : ''}><span class="st-n">${n < w.step ? icon('check') : n}</span><span class="st-l">${s}</span></button></li>`; }).join('');
    $$('[data-go]').forEach(b => { b.onclick = () => go(+b.dataset.go); });
  };
  const setFile = fl => {
    if (!fl) return;
    if (!/^(application\/pdf|image\/png|image\/jpeg)$/.test(fl.type) && !/\.pdf$/i.test(fl.name)) return uiAlert('Formato no admitido. Sube un archivo PDF, JPG o PNG.');
    if (fl.size > 50 * 1048576) return uiAlert('El archivo supera el máximo de 50 MB.');
    w.file = fl; if (!w.title) w.title = fl.name.replace(/\.[^.]+$/, '');
    draw();
  };
  const steps = {
    1() {
      const vi = from ? { n: latest(from).n + 1, sup: docStatus(from) === ST.INC } : null;
      body.innerHTML = `<div class="wz-grid"><div>
        <div class="drop" id="drop" tabindex="0" role="button" aria-label="Seleccionar archivo">
          <input type="file" id="file" accept="application/pdf,.pdf,image/png,image/jpeg" hidden>
          <span class="drop-ic">${icon('upload')}</span><b>Arrastra y suelta tu archivo aquí</b><span class="muted">o haz clic para seleccionarlo</span>
          <span class="btn primary sm">Seleccionar archivo</span><small class="muted">PDF, JPG o PNG · máximo 50 MB</small></div>
        ${w.file ? fileCard(w.file) : ''}
        ${vi ? `<div class="alert a-info" style="margin-top:14px">${icon('info')}<div>Se subirá como <b>V${vi.n}</b> de <b class="mono">${esc(from.code)}</b>. La V${vi.n - 1} pasará a <b>Obsoleto</b>${vi.sup ? ' y sus firmas pendientes dejarán de pedirse' : ''}.</div></div>` : ''}
        </div>
        <aside class="tips"><h3>${icon('bulb')}Consejos</h3><ul>
          <li>Sube el arte final definitivo: es exactamente lo que se revisará y firmará.</li>
          <li>Usa PDF siempre que puedas; el PDF firmado conserva el documento original.</li>
          <li>Para corregir un diseño, súbelo con el mismo código de material y circuito: se registrará como nueva versión (V2, V3…).</li></ul></aside></div>`;
      const drop = $('#drop');
      drop.onclick = () => $('#file').click();
      drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file').click(); } };
      drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
      drop.ondragleave = () => drop.classList.remove('over');
      drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); setFile(e.dataTransfer.files[0]); };
      $('#file').onchange = e => setFile(e.target.files[0]);
      if ($('#rmFile')) $('#rmFile').onclick = () => { w.file = null; draw(); };
    },
    2() {
      body.innerHTML = `<div class="form-grid">
        <label class="fld">Código de material <em>*</em><input id="fCode" list="codes" class="mono" value="${esc(w.code)}" placeholder="MA.EST.COL.BEAUTY" autocomplete="off"></label>
        <label class="fld">Nombre del documento <em>*</em><input id="fTitle" value="${esc(w.title)}" maxlength="160" placeholder="Ej.: Arte final estuche · cara frontal"></label>
        <div class="fld"><label for="fType" style="display:inline">Tipo de documento <em>*</em></label><div class="inline"><select id="fType">${D.doctypes.slice().sort((a, b) => a.name.localeCompare(b.name)).map(t => `<option value="${esc(t.id)}" ${t.id === w.docTypeId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
          <button type="button" class="btn" id="newType">${icon('plus')}Nuevo tipo</button></div></div>
        <div class="fld"><span>Producto y categoría</span><div class="ro" id="fProd"></div></div>
        <label class="fld span2">Comentario para los firmantes <span class="muted" style="font-weight:400">(opcional)</span><textarea id="fNote" rows="3" placeholder="Indica qué deben revisar o qué ha cambiado respecto a la versión anterior.">${esc(w.note)}</textarea></label>
      </div>`;
      const prodInfo = () => {
        const p = product(), cat = p && byId('prodcats', p.categoryId);
        $('#fProd').innerHTML = !w.code.trim() ? 'Se completa al indicar el código de material.'
          : p ? `${icon('package')}<b>${esc(p.name)}</b>${cat ? ` · ${esc(cat.name)}` : ''}` : `${icon('plus')}Código nuevo: se añadirá al catálogo de Productos.`;
      };
      $('#fCode').oninput = e => { w.code = e.target.value; prodInfo(); upd(); };
      $('#fTitle').oninput = e => { w.title = e.target.value; upd(); };
      $('#fType').onchange = e => { w.docTypeId = e.target.value; upd(); };
      $('#fNote').oninput = e => { w.note = e.target.value; };
      $('#newType').onclick = async () => {
        const name = (await uiPrompt('Nombre del nuevo tipo de documento', '', 'Crear tipo') || '').trim(); if (!name) return;
        if (D.doctypes.some(t => t.name.toLowerCase() === name.toLowerCase())) { w.docTypeId = D.doctypes.find(t => t.name.toLowerCase() === name.toLowerCase()).id; return draw(); }
        const t = { id: 'dt-' + uid(), name, description: '', createdAt: now() };
        await store.put('doctypes', t); D.doctypes.push(t); w.docTypeId = t.id; toast('Tipo de documento creado'); draw();
      };
      prodInfo();
    },
    3() {
      const c = circuit(), vi = verInfo();
      body.innerHTML = `<div class="circ-pick" role="radiogroup" aria-label="Circuito de firma">${D.circuits.map(x => `<label class="pick ${x.id === w.circuitId ? 'on' : ''}"><input type="radio" name="circ" value="${esc(x.id)}" ${x.id === w.circuitId ? 'checked' : ''}>
          <span class="pick-b"><b>${esc(x.name)}</b>${x.description ? `<small>${esc(x.description)}</small>` : ''}<span class="pick-m">${modeChip(x)}${avStack(allSignerEmails(x))}</span></span></label>`).join('')}
        <button type="button" class="pick add" id="newCirc">${icon('plus')}<span>Crear circuito</span></button></div>
        ${c ? `<div class="card" style="margin:0;background:var(--surface-2)"><div class="card-h"><h2>Participantes · ${esc(c.name)}</h2><button type="button" class="btn sm" id="editCirc">${icon('pencil')}Editar circuito</button></div>
          <p class="muted" style="font-size:13px">${modeChip(c)} — ${modeText(c.order)}</p>${flowHtml(signerList(c), c.order)}</div>
          <div class="alert ${vi.supersede ? 'a-warn' : 'a-info'}" style="margin:16px 0 0">${icon(vi.supersede ? 'alert' : 'layers')}<div>${vi.ex
            ? `Ya existe <b class="mono">${esc(vi.ex.code)}</b> en este circuito (V${vi.n - 1} · ${esc(docStatus(vi.ex))}). Este archivo se registrará como <b>V${vi.n}</b>${vi.obsoletes ? ` y la V${vi.n - 1} pasará a <b>Obsoleto</b>${vi.supersede ? ' (sus firmas pendientes dejarán de pedirse)' : ''}` : ''}.`
            : 'Se registrará como <b>V1</b> de este código de material en este circuito.'}</div></div>` : ''}`;
      $$('input[name=circ]', body).forEach(r => { r.onchange = () => { w.circuitId = r.value; draw(); }; });
      $('#newCirc').onclick = async () => { const nc = await editCircuit(null); if (nc && nc.id) w.circuitId = nc.id; draw(); };
      if ($('#editCirc')) $('#editCirc').onclick = async () => { await editCircuit(circuit()); draw(); };
    },
    4() {
      const c = circuit(), p = product(), vi = verInfo(), dt = byId('doctypes', w.docTypeId), cat = p && byId('prodcats', p.categoryId);
      body.innerHTML = `<div class="review"><div>
          <h3>Documento</h3>${fileCard(w.file, false)}
          <dl class="dl">
            <dt>Código de material</dt><dd class="mono"><b>${esc(w.code.trim())}</b></dd>
            <dt>Nombre</dt><dd>${esc(w.title.trim())}</dd>
            <dt>Tipo</dt><dd>${esc(dt?.name || '—')}</dd>
            <dt>Producto</dt><dd>${p ? esc(p.name) + (cat ? ` · ${esc(cat.name)}` : '') : '<span class="muted">Código nuevo · se añadirá a Productos</span>'}</dd>
            <dt>Versión</dt><dd><span class="ver">V${vi.n}</span></dd>
            <dt>Comentario</dt><dd>${w.note.trim() ? esc(w.note.trim()) : '<span class="muted">Sin comentario</span>'}</dd></dl>
          ${vi.obsoletes ? `<div class="alert ${vi.supersede ? 'a-warn' : 'a-info'}" style="margin-top:16px">${icon(vi.supersede ? 'alert' : 'archive')}<div>Al enviar, la <b>V${vi.n - 1}</b> pasará a <b>Obsoleto</b>${vi.supersede ? ' y sus firmas pendientes dejarán de pedirse' : ''}${SPC.enabled ? ' y sus archivos se moverán a la carpeta de obsoletos en SharePoint' : ''}.</div></div>` : ''}
          ${SPC.enabled ? (spConnected() ? `<div class="alert a-info" style="margin-top:16px">${icon('cloud')}<div>Se guardará en SharePoint en <b>${esc(spFolderLabel([SPC.folders.circuit, dt?.name || 'Sin tipo', w.code.trim()].map(spSafe).join('/')))}</b>.</div></div>`
            : `<div class="alert a-warn" style="margin-top:16px">${icon('cloud')}<div><b>Conecta SharePoint para enviar.</b> Los documentos se guardan en la biblioteca de la empresa.</div><button type="button" class="btn sm" id="wzSp">Conectar SharePoint</button></div>`) : ''}
        </div><div><h3>Circuito: ${esc(c.name)}</h3><p class="muted" style="font-size:13px">${modeChip(c)} — ${modeText(c.order)}</p>${flowHtml(signerList(c), c.order)}
          <div class="alert a-info" style="margin:16px 0 0">${icon('mail')}<div>Al enviar podrás copiar el enlace del documento y avisar por correo a los firmantes.</div></div></div></div>`;
      if ($('#wzSp')) $('#wzSp').onclick = async () => { await connectSharePoint({ rerender: false }); draw(); };
    },
  };
  const draw = () => {
    drawSteps();
    $('#wzBack').hidden = w.step === 1;
    $('#wzNext').innerHTML = w.step === 4 ? `${icon('send')}Enviar a firma` : `Siguiente${icon('arrowright')}`;
    steps[w.step](); upd();
    if (w.step > 1) body.querySelector('input:not([type=radio]),select')?.focus({ preventScroll: true });
  };
  $('#wzBack').onclick = () => go(w.step - 1);
  $('#wzCancel').onclick = async () => {
    if (w.file && !(await uiConfirm('Se perderá lo que has rellenado en este asistente.', 'Descartar', { title: '¿Cancelar la subida?', tone: 'warn' }))) return;
    location.hash = from ? '#doc/' + from.id : '#home';
  };
  $('#wzNext').onclick = async () => {
    if (missing(w.step)) return upd();
    if (w.step < 4) return go(w.step + 1);
    const vi = verInfo();
    if (vi.supersede && !(await uiConfirm(`La V${vi.n - 1} de ${w.code.trim()} sigue en circuito. Pasará a Obsoleto y sus firmas pendientes dejarán de pedirse.`, 'Enviar nueva versión', { title: '¿Dejar obsoleta la versión en curso?', tone: 'warn' }))) return;
    await submit();
  };
  const submit = async () => {
    const btn = $('#wzNext'); w.busy = true; btn.classList.add('busy'); btn.innerHTML = `${icon('refresh')}Enviando…`; upd();
    const code = w.code.trim(), title = w.title.trim(), c = circuit(), dt = byId('doctypes', w.docTypeId), file = w.file;
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
      const keepCopy = !SPC.enabled || SPC.keepBackup !== false;
      const path = keepCopy ? `docs/${doc.id}/v${n}/${Date.now()}_${safeName(file.name)}` : null;
      if (keepCopy) await store.putFile(path, buf, type);
      let obsoleted = false;
      if (prev && !isObsolete(prev)) { prev.obsolete = { at: now(), by: ME.id, reason: `Nueva versión V${n}` }; obsoleted = true; }
      doc.versions.push({ n, fileName: file.name, fileType: type, path, hash, size: file.size, uploadedBy: ME.id, uploadedAt: now(),
        title, note: w.note.trim(), signers: signerList(c).map(s => isGroup(s) ? { role: s.role || 'Grupo', members: [...s.members] } : { email: s.email, role: s.role || userOf(s.email)?.role || '' }), order: c.order || 'any', circuitName: c.name });
      doc.title = title; doc.docTypeId = dt.id;
      await store.put('documents', doc);
      if (!D.products.some(p => p.code.toLowerCase() === code.toLowerCase()))
        await store.put('products', { id: 'p-' + uid(), code, name: title, categoryId: '', description: '', createdAt: now() });
      await addEvent(doc.id, `Subida V${n}`, `${file.name} · circuito ${c.name}${obsoleted ? ` · V${prev.n} pasa a obsoleto` : ''}`);
      if (SPC.enabled) {
        btn.innerHTML = `${icon('cloud')}Guardando en SharePoint…`;
        const r = await spSync(doc.id, { bytes: { [n]: buf } });
        if (!r.ok) toast('El documento se ha enviado, pero no se pudo guardar en SharePoint: ' + (r.error?.message || 'conecta SharePoint') + '. Se reintentará automáticamente.', 8000, 'error');
      }
      pendingShare = doc.id;
      location.hash = '#doc/' + doc.id;
    } catch (err) {
      console.error(err); w.busy = false; btn.classList.remove('busy'); btn.innerHTML = `${icon('send')}Enviar a firma`; upd();
      uiAlert('No se pudo subir el documento: ' + err.message, { title: 'Error al enviar', tone: 'danger' });
    }
  };
  draw();
}

/* ---------- Detalle del documento y firma ---------- */
function viewDoc(m, id) {
  const d = byId('documents', id);
  if (!d) { setCrumbs([['Estado de documentos', '#docs'], ['No encontrado']]); m.innerHTML = emptyState('file', 'Documento no encontrado', 'Puede que el enlace no sea correcto o que el documento se haya eliminado.', `<a class="btn" href="#docs">Ver documentos</a>`); return; }
  const v = latest(d), st = verStatus(d, v), rows = signerRows(d, v), ok = rows.filter(r => r.sig?.decision === 'OK').length;
  const dt = byId('doctypes', d.docTypeId), c = byId('circuits', d.circuitId), p = productOf(d), cat = p && byId('prodcats', p.categoryId);
  const mine = canSign(d, ME.id), pend = pendingSigners(d), label = docLabel(d);
  const meRow = rows.find(r => slotEmails(r).includes(ME.id));
  const rowState = r => r.sig ? (r.sig.decision === 'OK' ? 'Firmado' : 'Rechazado') : st !== ST.INC ? '—'
    : (v.order === 'seq' && !rows.slice(0, r.i).every(x => x.sig?.decision === 'OK') ? 'Esperando turno' : 'Pendiente');
  const events = D.events.filter(e => e.docId === d.id).sort((a, b) => b.at.localeCompare(a.at));
  const rejSig = rows.find(r => r.sig && r.sig.decision !== 'OK')?.sig;
  setCrumbs([['Estado de documentos', '#docs'], [d.code]]);

  let actionBox = '';
  const obs = isObsolete(v);
  if (obs) actionBox = `<div class="alert a-warn">${icon('archive')}<div><b>Documento obsoleto</b>${v.obsolete?.by ? ` · marcado por ${esc(uname(v.obsolete.by))}` : ''}${v.obsolete?.at ? ` el ${fmtDT(v.obsolete.at)}` : ''}.${st === ST.OBS ? ' Sus firmas pendientes ya no se piden.' : ''}<div style="margin-top:8px"><button type="button" class="btn sm" id="setVig">${icon('rotate')}Marcar como vigente</button></div></div></div>`;
  else if (mine) actionBox = `<section class="card sign-box" id="signBox"><h2>Tu firma</h2><p class="muted" style="font-size:13px;margin-top:4px">Revisa el documento en la vista previa. Si está correcto, firma con tu OK.</p>
      <div class="mysig">${ME.signature ? `<img src="${ME.signature}" alt="Tu firma">` : `<span class="muted">${icon('alert', 'ic-warn')} Aún no tienes firma registrada</span>`}<button type="button" class="linkbtn" id="editSig">${ME.signature ? 'Cambiar' : 'Crear firma'}</button></div>
      <label class="fld">Comentario <span class="muted" style="font-weight:400">(obligatorio si rechazas)</span><textarea id="cmt" rows="2" placeholder="Opcional al firmar"></textarea></label>
      <div class="sign-actions"><button type="button" class="btn danger" id="signKo">${icon('x')}Rechazar</button><button type="button" class="btn primary" id="signOk">${icon('pen')}Firmar documento</button></div></section>`;
  else if (st === ST.INC && meRow && !meRow.sig) actionBox = `<div class="alert a-info">${icon('hourglass')}<div><b>Aún no es tu turno.</b> Podrás firmar cuando firme ${esc(pend.map(slotName).join(', '))}.</div></div>`;
  else if (st === ST.APR) actionBox = `<div class="alert a-ok">${icon('checkcircle')}<div><b>Documento aprobado</b> el ${fmtDT(approvedAt(d, v))} por todas las personas del circuito.</div></div>`;
  else if (st === ST.REJ) actionBox = `<div class="alert a-danger">${icon('xcircle')}<div><b>Rechazado por ${esc(uname(rejSig?.email))}</b> el ${fmtDT(rejSig?.at)}.${rejSig?.comment ? `<br>«${esc(rejSig.comment)}»` : ''}<div style="margin-top:8px"><a class="btn sm" href="#upload/${d.id}">${icon('refresh')}Subir versión corregida</a></div></div></div>`;
  else if (st === ST.INC) actionBox = `<div class="alert a-info">${icon('clock')}<div><b>Esperando firmas</b> de ${esc(pend.map(slotName).join(', '))}.<div style="margin-top:8px"><button type="button" class="btn sm" id="notify">${icon('mail')}Avisar a pendientes</button></div></div></div>`;

  const flow = `<ol class="sf">${rows.map(r => { const s = rowState(r), cls = s === 'Firmado' ? 'done' : s === 'Rechazado' ? 'ko' : s === 'Pendiente' ? 'now' : '';
    const nm = r.group && !r.sig ? (r.role || 'Grupo') : uname(r.email), mine = r.email === ME.id || (r.group && !r.sig && r.members.includes(ME.id));
    return `<li class="${cls} ${mine && s === 'Pendiente' ? 'me' : ''}"><span class="sf-n">${s === 'Firmado' ? icon('check') : s === 'Rechazado' ? icon('x') : r.i + 1}</span>
      <div class="sf-b"><div class="sf-top"><b>${esc(nm)}${r.email === ME.id ? ' <span class="muted" style="font-weight:400">(tú)</span>' : ''}</b>${sbadge(s)}</div>
      <small>${r.group ? `${r.sig ? esc(r.role || 'Grupo') + ' · ' : ''}${icon('users', 'ic-xs')} Firma cualquiera de: ${esc(memberNames(r))}${!r.sig && r.members.includes(ME.id) ? ' (tú incluido)' : ''}` : esc(r.role || 'Firmante')}</small>
      ${r.sig ? `<small>${r.sig.decision === 'OK' ? 'Firmado' : 'Rechazado'} el ${fmtDT(r.sig.at)}</small>` : ''}
      ${r.sig?.signature ? `<img class="sf-sig" src="${r.sig.signature}" alt="Firma de ${esc(uname(r.email))}">` : ''}
      ${r.sig?.comment ? `<div class="sf-cmt">«${esc(r.sig.comment)}»</div>` : ''}</div></li>`; }).join('')}</ol>`;

  m.innerHTML = `
    <div class="page-h doc-h"><div class="min0">
        <div class="eyebrow mono">${esc(d.code)}</div>
        <h1 class="doc-title"><span>${esc(v.title || d.title)}</span><span id="docStatus">${sbadge(label)}</span>${!obs && circuitStatus(d, v) === ST.APR ? sbadge('Vigente') : ''}</h1>
        <div class="meta"><span>${icon('file')}<b>${esc(dt?.name || '—')}</b></span><span>${icon('user')}Solicitante: <b>${esc(uname(v.uploadedBy))}</b></span>
          <span>${icon('calendar')}${fmtDT(v.uploadedAt)}</span><span>${icon('layers')}Versión <b>V${v.n}</b></span>
          ${SPC.enabled ? `<span id="spMeta">${icon('cloud')}${v.sp?.file ? `SharePoint: <a href="${esc(v.sp.file.webUrl)}" target="_blank" rel="noopener"><b>${esc(SPC.folders[spStage(d, v)])}</b></a>${spNeedsSync(d) ? ' <span class="badge b-warn">Pendiente de mover</span>' : ''}` : '<span class="badge b-warn">Pendiente de guardar en SharePoint</span>'}</span>` : ''}</div></div>
      <div class="page-actions">
        ${circuitStatus(d, v) === ST.APR ? dlBtn(d, v, { cls: 'btn primary', label: 'Descargar PDF firmado', id: 'dl' }) : ''}
        <button type="button" class="btn" id="share">${icon('link')}Compartir</button>
        <button type="button" class="btn" id="moreAct" aria-haspopup="menu">Acciones${icon('chevrondown')}</button></div></div>
    <div class="doc-grid">
      <section class="card viewer-card"><div class="card-h"><h2>Vista previa del documento</h2>
        ${d.versions.length > 1 ? `<select id="vsel" aria-label="Versión">${d.versions.slice().reverse().map(x => `<option value="${x.n}">V${x.n} · ${verStatus(d, x)}</option>`).join('')}</select>` : ''}</div>
        <div id="viewer"><div class="sk" style="height:60vh"></div></div></section>
      <aside class="side-panel">
        ${actionBox}
        <section class="card"><div class="panel-h"><h2>Circuito de firma</h2><span class="muted" style="font-size:13px;font-weight:600">${ok}/${rows.length}</span></div>
          <div class="panel-sub">${modeChip(v)}<span>${esc(v.circuitName || c?.name || '')}</span></div>${flow}</section>
      </aside></div>
    <section class="card"><div class="tabs" role="tablist">
        <button type="button" role="tab" class="tab on" data-tab="hist" aria-selected="true">${icon('history')}Historial <span class="cnt">${events.length}</span></button>
        <button type="button" role="tab" class="tab" data-tab="vers" aria-selected="false">${icon('layers')}Versiones <span class="cnt">${d.versions.length}</span></button>
        <button type="button" role="tab" class="tab" data-tab="info" aria-selected="false">${icon('info')}Detalles</button></div>
      <div id="tabBody" role="tabpanel"></div></section>`;

  const tabs = {
    hist: () => events.length ? `<ol class="tl">${events.map(e => { const [tone, ic, verb] = eventInfo(e); const sys = /^APROBADO/.test(e.action);
      return `<li><span class="tl-ic ${tone}">${icon(ic)}</span><div class="tl-b">${sys ? `<b>Documento aprobado</b> · ${esc(e.action.replace('APROBADO · ', ''))}` : `<b>${esc(uname(e.email))}</b> ${esc(verb.replace(/ (de|sobre)$/, ''))}${/^(Firmado|Rechazado)/.test(e.action) ? ` la ${esc(e.action.split('· ')[1] || '')}` : ''}`}
        ${e.detail && !/^APROBADO/.test(e.action) ? `<small>${esc(e.detail)}</small>` : ''}<small>${fmtDTs(e.at)}</small></div></li>`; }).join('')}</ol>` : emptyState('history', 'Sin actividad registrada', '', '', true),
    vers: () => `<div class="tablewrap" style="margin:0 -20px -20px;border-top:1px solid var(--border)"><table class="tbl"><thead><tr><th>Versión</th><th>Archivo</th><th>Subido por</th><th>Fecha</th><th>Firmas</th><th>Estado</th><th class="act"></th></tr></thead><tbody>
      ${d.versions.slice().reverse().map(x => { const s = verStatus(d, x), ca = circuitStatus(d, x) === ST.APR; return `<tr><td><span class="ver">V${x.n}</span></td><td>${esc(x.fileName)}<small>${x.size ? fmtSize(x.size) : ''}</small></td><td>${who(x.uploadedBy)}</td><td class="nowrap">${fmtDT(x.uploadedAt)}</td>
        <td>${progress(d, x)}</td><td>${sbadge(s)} ${s !== ST.OBS ? vigBadge(d, x) : ''}</td><td class="act">${ca ? dlBtn(d, x, { cls: 'btn sm', label: 'PDF firmado' }) : ''}</td></tr>`; }).join('')}</tbody></table></div>`,
    info: () => `<dl class="dl">
      <dt>Código de material</dt><dd class="mono">${esc(d.code)}</dd>
      <dt>Producto</dt><dd>${p ? esc(p.name) + (cat ? ' · ' + esc(cat.name) : '') : '—'}</dd>
      <dt>Tipo de documento</dt><dd>${esc(dt?.name || '—')}</dd>
      <dt>Circuito</dt><dd>${esc(v.circuitName || c?.name || '—')} · ${v.order === 'seq' ? 'firma secuencial' : 'firma en paralelo'}</dd>
      <dt>Archivo original</dt><dd>${esc(v.fileName)}${v.size ? ` · ${fmtSize(v.size)}` : ''}</dd>
      ${v.note ? `<dt>Comentario</dt><dd>${esc(v.note)}</dd>` : ''}
      ${st === ST.APR ? `<dt>Aprobado</dt><dd>${fmtDTs(approvedAt(d, v))}</dd>` : ''}
      <dt>Vigencia</dt><dd>${obs ? `Obsoleto${v.obsolete?.reason ? ` · ${esc(v.obsolete.reason)}` : ''}` : circuitStatus(d, v) === ST.APR ? 'Vigente' : 'En curso'}</dd>
      ${SPC.enabled ? `<dt>SharePoint</dt><dd>${v.sp?.file ? `<a href="${esc(v.sp.file.webUrl)}" target="_blank" rel="noopener">${esc(v.sp.file.name)}</a><small class="muted" style="display:block">${esc(spFolderLabel(v.sp.file.folder))}</small>` : '<span class="muted">Pendiente de guardar</span>'}
        ${v.sp?.signed ? `<div style="margin-top:6px"><a href="${esc(v.sp.signed.webUrl)}" target="_blank" rel="noopener">${esc(v.sp.signed.name)}</a><small class="muted" style="display:block">${esc(spFolderLabel(v.sp.signed.folder))}</small></div>` : ''}
        ${spNeedsSync(d) ? `<div style="margin-top:8px"><button type="button" class="btn sm" id="spSyncNow">${icon('refresh')}Sincronizar ahora</button></div>` : ''}</dd>` : ''}
      <dt>Huella SHA-256</dt><dd class="mono" style="font-size:12px;word-break:break-all">${v.hash}</dd></dl>
      <div class="alert a-info" style="margin:16px 0 0">${icon('shield')}<div>La huella identifica el archivo original. Si el archivo cambiara lo más mínimo, la huella sería distinta.</div></div>`,
  };
  const showTab = k => {
    $$('[data-tab]', m).forEach(b => { const on = b.dataset.tab === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    $('#tabBody').innerHTML = tabs[k]();
    bindRows($('#tabBody'));
    if ($('#spSyncNow')) $('#spSyncNow').onclick = async () => { await spSyncReport(d.id); render(); };
  };
  $$('[data-tab]', m).forEach(b => { b.onclick = () => showTab(b.dataset.tab); });
  showTab('hist');

  bindRows($('.page-actions', m));
  if ($('#setVig')) $('#setVig').onclick = () => setVigencia(d, false);
  if ($('#notify')) $('#notify').onclick = () => shareDialog(d, false);
  $('#share').onclick = () => shareDialog(d, false);
  $('#moreAct').onclick = e => { e.stopPropagation(); docMenu(e.currentTarget, d, v.n); };
  if (pendingShare === d.id) { pendingShare = null; shareDialog(d, true); }
  if ($('#editSig')) $('#editSig').onclick = async () => { if (await editSignatureDialog()) render(); };
  if ($('#signOk')) $('#signOk').onclick = async () => {
    let sig = ME.signature;
    if (!sig) { sig = await editSignatureDialog(); if (!sig) return; }
    if (!(await uiConfirm(`Vas a firmar con tu OK «${v.title || d.title}» (${d.code} · V${v.n}). Tu firma quedará registrada con fecha y hora y no se podrá deshacer.`, 'Firmar documento', { title: 'Confirmar firma', tone: 'info', ic: 'pen' }))) return;
    const b = $('#signOk'); b.classList.add('busy'); $('#signKo').disabled = true;
    await doSign(d, 'OK', $('#cmt').value.trim());
  };
  if ($('#signKo')) $('#signKo').onclick = async () => {
    const cm = $('#cmt').value.trim();
    if (!cm) { $('#cmt').focus(); $('#cmt').setAttribute('aria-invalid', 'true'); toast('Escribe en «Comentario» el motivo del rechazo', 3500, 'error'); return; }
    if (!(await uiConfirm(`Vas a rechazar ${d.code} · V${v.n}. El circuito se detendrá y quien lo subió deberá enviar una versión corregida.`, 'Rechazar documento', { title: '¿Rechazar el documento?', tone: 'danger', ic: 'xcircle' }))) return;
    const b = $('#signKo'); b.classList.add('busy'); $('#signOk').disabled = true;
    await doSign(d, 'Rechazado', cm);
  };
  const loadVersion = async n => {
    const x = d.versions.find(y => y.n === n); const box = $('#viewer');
    box.innerHTML = '<div class="sk" style="height:60vh"></div>';
    try {
      let r = await getVersionBytes(x), stop;
      try { stop = await mountViewer(box, r.buf, x.fileType); }
      catch (e) { if (r.source !== 'sp' || !x.path) throw e; console.warn('Copia de SharePoint no legible, se usa la copia interna', e); r = await getVersionBytes(x, { preferBackup: true }); stop = await mountViewer(box, r.buf, x.fileType); }
      if (stop) cleanups.push(stop);
      if (SPC.enabled) $('.vinfo', box).insertAdjacentHTML('beforebegin', `<span class="vsrc ${r.source}" title="${r.source === 'sp' ? 'Leído desde SharePoint' : 'Copia interna de la plataforma'}">${icon(r.source === 'sp' ? 'cloud' : 'archive')}${r.source === 'sp' ? 'SharePoint' : 'Copia interna'}</span>`);
    } catch (e) { box.innerHTML = `<div class="alert a-danger">${icon('alert')}<div>No se pudo mostrar el documento: ${esc(e.message)}</div></div>`; }
  };
  if ($('#vsel')) $('#vsel').onchange = e => loadVersion(+e.target.value);
  loadVersion(v.n);
  if (spConnected() && spNeedsSync(d) && !SP.busy.has(d.id)) spSyncReport(d.id, true).then(r => { if (r?.log?.length && location.hash === '#doc/' + d.id) render(); });
}

async function setVigencia(d, obsolete) {
  const fresh = (await store.get('documents', d.id)) || d, v = latest(fresh);
  const inCirc = circuitStatus(fresh, v) === ST.INC;
  const ok = obsolete
    ? await uiConfirm(`${d.code} · V${v.n} pasará a Obsoleto${inCirc ? ' y sus firmas pendientes dejarán de pedirse' : ''}.${SPC.enabled ? ' Sus archivos se moverán a la carpeta de obsoletos en SharePoint.' : ''}`, 'Marcar como obsoleto', { title: '¿Marcar como obsoleto?', tone: 'warn', ic: 'archive' })
    : await uiConfirm(`${d.code} · V${v.n} volverá a estar vigente${inCirc ? ' y el circuito de firma continuará' : ''}.${SPC.enabled ? ' Sus archivos volverán a su carpeta en SharePoint.' : ''}`, 'Marcar como vigente', { title: '¿Marcar como vigente?', ic: 'rotate' });
  if (!ok) return;
  if (obsolete) v.obsolete = { at: now(), by: ME.id, reason: 'Marcado manualmente' };
  else { delete v.obsolete; delete v.superseded; }
  await store.put('documents', fresh);
  const i = D.documents.findIndex(x => x.id === d.id); if (i >= 0) D.documents[i] = fresh;
  await addEvent(d.id, obsolete ? `Marcado obsoleto · V${v.n}` : `Marcado vigente · V${v.n}`);
  toast(obsolete ? 'Documento marcado como obsoleto' : 'Documento marcado como vigente');
  await spSyncReport(d.id, true);
  render();
}

async function doSign(d, decision, comment) {
  const fresh = (await store.get('documents', d.id)) || d;
  const v = latest(fresh);
  if (v.n !== latest(d).n) { uiAlert('Se ha subido una versión nueva mientras revisabas. Se mostrará la última.'); return render(); }
  if (!canSign(fresh, ME.id)) { uiAlert('Este documento ya no está pendiente de tu firma.'); return render(); }
  const slot = signerRows(fresh, v).find(r => !r.sig && slotEmails(r).includes(ME.id));
  const s = { id: `${d.id}|${v.n}|${ME.id}`, docId: d.id, v: v.n, email: ME.id, name: ME.name || ME.id, role: slot?.role || '', slot: slot ? slot.i : null,
    decision, comment, signature: decision === 'OK' ? ME.signature : null, at: now() };
  try { await store.add('signatures', s); } catch (e) { uiAlert('No se pudo registrar la firma: ' + e.message, { tone: 'danger', title: 'Error' }); return render(); }
  D.signatures.push(s);
  await addEvent(d.id, decision === 'OK' ? `Firmado OK · V${v.n}` : `Rechazado · V${v.n}`, comment);
  const approved = verStatus(fresh, v) === ST.APR;
  if (approved) await addEvent(d.id, `APROBADO · V${v.n}`, 'Todas las firmas completadas');
  if (approved && SPC.enabled) {
    if (spConnected()) {
      toast('Documento aprobado. Guardando el PDF firmado en SharePoint…', 3000, 'info');
      const r = await spSync(d.id);
      toast(r.ok ? 'PDF firmado guardado en SharePoint' : 'No se pudo guardar en SharePoint: ' + (r.error?.message || '') + '. Se reintentará.', r.ok ? 4000 : 7000, r.ok ? 'ok' : 'error');
    } else toast('Documento aprobado. Se guardará en SharePoint cuando alguien con la cuenta conectada lo abra.', 6000, 'info');
  } else if (approved) toast('Documento aprobado: ya puedes descargar el PDF firmado', 5000);
  else toast(decision === 'OK' ? 'Firma registrada' : 'Documento rechazado', 3400, decision === 'OK' ? 'ok' : 'info');
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
  const v = latest(d), link = docLink(d), pend = pendingSigners(d), to = pendEmails(pend.length ? pend : signerRows(d, v));
  openDialog(dlgHead(justUploaded ? `${esc(d.code)} enviado a firma` : 'Compartir documento', justUploaded ? `Versión V${v.n} registrada. Avisa al equipo de que está listo para firmar.` : 'Copia el enlace o avisa por correo a las personas que faltan por firmar.') + `
    ${justUploaded ? `<div class="alert a-ok">${icon('checkcircle')}<div><b>${esc(v.title || d.title)}</b> ya está en el circuito «${esc(v.circuitName)}».</div></div>` : ''}
    <label class="fld">Enlace al documento<div class="copyrow"><input id="shLink" readonly value="${esc(link)}"><button type="button" class="btn primary" id="shCopy">${icon('copy')}Copiar enlace</button></div></label>
    <div style="margin-top:16px"><div class="muted" style="font-size:13px;margin-bottom:8px">${pend.length ? 'Pendientes de firmar' : 'Personas del circuito'}</div><div class="chips">${to.map(e => `<span class="chip">${avatar(e, 'xs')}${esc(uname(e))}</span>`).join('')}</div></div>
    <div class="dlg-foot"><button type="button" class="btn" data-x>Cerrar</button><a class="btn primary" id="shMail" href="${esc(shareMail(d, to))}" target="_blank" rel="noopener">${icon('mail')}Avisar por correo</a></div>`, 'wide');
  $('#shLink').onclick = e => e.target.select();
  $('#shCopy').onclick = async () => { const ok = await copyText(link); $('#shCopy').innerHTML = ok ? `${icon('check')}Copiado` : 'Selecciona y copia'; if (!ok) $('#shLink').select(); };
  $('#shMail').onclick = () => { addEvent(d.id, 'Aviso por correo preparado', to.join(', ')); };
}


/* =========================================================================
   SHAREPOINT (Microsoft Graph, permisos delegados de cada usuario)
   Los archivos viven en SharePoint y se mueven entre carpetas según el estado:
     <raíz>/<En circuito | Aprobados | Obsoletos>/<Tipo de documento>/<Código>/
   Los originales de versiones aprobadas u obsoletas van a la subcarpeta «Originales».
   ========================================================================= */
const SPC = Object.assign({
  enabled: false, tenantId: '', clientId: '', siteUrl: '', library: '', rootFolder: 'Aprobaciones', rootShareUrl: '',
  folders: {}, keepBackup: true, scopes: ['Sites.ReadWrite.All'],
  msalUrl: 'https://cdn.jsdelivr.net/npm/@azure/msal-browser@2.39.0/lib/msal-browser.min.js',
}, CFG.sharepoint || {});
SPC.folders = Object.assign({ circuit: 'En circuito', approved: 'Aprobados', obsolete: 'Obsoletos', originals: 'Originales' }, SPC.folders || {});
SPC.enabled = !!(SPC.enabled && SPC.tenantId && SPC.clientId && (SPC.siteUrl || SPC.rootShareUrl));
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SP = { app: null, account: null, drive: null, rootPath: '', folders: new Map(), busy: new Set(), ready: false, error: '' };

const spNeedLogin = () => { const e = new Error('Conecta tu cuenta de Microsoft para acceder a SharePoint.'); e.needLogin = true; return e; };
const spConnected = () => !!(SPC.enabled && SP.account);
const spRedirectUri = () => location.origin + location.pathname.replace(/[^/]*$/, '') + 'redirect.html';
async function spInit() {
  if (!SPC.enabled || SP.app) return;
  try {
    if (!window.msal) await loadScript(SPC.msalUrl);
    SP.app = new msal.PublicClientApplication({
      auth: { clientId: SPC.clientId, authority: `https://login.microsoftonline.com/${SPC.tenantId}`, redirectUri: spRedirectUri() },
      cache: { cacheLocation: 'localStorage' },
    });
    if (SP.app.initialize) await SP.app.initialize();
    const accs = SP.app.getAllAccounts();
    SP.account = accs.find(a => normEmail(a.username) === ME?.id) || accs[0] || null;
    SP.ready = true;
  } catch (e) { console.error(e); SP.error = 'No se pudo cargar el inicio de sesión de Microsoft: ' + e.message; }
}
async function spToken() {
  if (!SP.app || !SP.account) throw spNeedLogin();
  try { return (await SP.app.acquireTokenSilent({ scopes: SPC.scopes, account: SP.account })).accessToken; }
  catch (e) { console.warn(e); throw spNeedLogin(); }
}
async function spConnect() {
  if (!SP.app) await spInit();
  if (!SP.app) throw new Error(SP.error || 'Microsoft no está disponible.');
  const r = await SP.app.loginPopup({ scopes: SPC.scopes, loginHint: ME?.id, prompt: 'select_account' });
  SP.account = r.account;
  return r.account;
}
async function spDisconnect() {
  const acc = SP.account; SP.account = null; SP.drive = null; SP.rootPath = ''; SP.folders.clear();
  try { if (acc && SP.app.logoutPopup) await SP.app.logoutPopup({ account: acc, mainWindowRedirectUri: spRedirectUri() }); } catch (e) { console.warn(e); }
}
async function gfetch(path, opts = {}) {
  const token = await spToken();
  const res = await fetch(path.startsWith('http') ? path : GRAPH + path, { ...opts, headers: { Authorization: 'Bearer ' + token, ...(opts.body && !(opts.body instanceof ArrayBuffer) && !(opts.body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) } });
  if (!res.ok) {
    let msg = ''; try { const j = await res.json(); msg = j.error?.message || ''; } catch { }
    const e = new Error(res.status === 403 ? 'No tienes permiso para escribir en esta carpeta de SharePoint.' : res.status === 401 ? 'La sesión de Microsoft ha caducado.' : `SharePoint (${res.status}) ${msg}`);
    e.status = res.status; if (res.status === 401) e.needLogin = true; throw e;
  }
  return res.status === 204 ? null : res.json();
}
const encPath = p => p.split('/').map(encodeURIComponent).join('/');
const spSafe = s => String(s ?? '').replace(/["*:<>?/\\|#%~&{}]/g, '-').replace(/\s+/g, ' ').trim().replace(/^[.\s]+|[.\s]+$/g, '') || 'Sin nombre';
async function spDrive() {
  if (SP.drive) return SP.drive;
  if (SPC.rootShareUrl) {
    const enc = 'u!' + btoa(unescape(encodeURIComponent(SPC.rootShareUrl.trim()))).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
    let it;
    try { it = await gfetch(`/shares/${enc}/driveItem?$select=id,name,webUrl,parentReference`); }
    catch (e) { if (e.status === 403 || e.status === 404) throw new Error('No tienes acceso a la carpeta de circuitos de firma en SharePoint. Pide a IT que te añada al grupo.'); throw e; }
    const parent = decodeURIComponent((it.parentReference?.path || '').replace(/^.*?root:/, '')).replace(/^\/+/, '');
    SP.rootPath = [parent, it.name].filter(Boolean).join('/');
    const drv = await gfetch(`/drives/${it.parentReference.driveId}?$select=id,webUrl`);
    SP.drive = { id: drv.id, webUrl: drv.webUrl, siteUrl: SPC.siteUrl || drv.webUrl.replace(/\/[^/]+$/, ''), rootWebUrl: it.webUrl };
    SP.folders.set(SP.rootPath, it.id);
    return SP.drive;
  }
  SP.rootPath = SPC.rootFolder ? spSafe(SPC.rootFolder) : '';
  const u = new URL(SPC.siteUrl);
  const site = await gfetch(`/sites/${u.hostname}:${u.pathname.replace(/\/$/, '')}?$select=id,webUrl`);
  let drive;
  if (SPC.library) {
    const ds = (await gfetch(`/sites/${site.id}/drives?$select=id,name,webUrl`)).value || [];
    const want = SPC.library.trim().toLowerCase();
    drive = ds.find(x => x.name.toLowerCase() === want || decodeURIComponent(x.webUrl || '').toLowerCase().replace(/\/$/, '').endsWith('/' + want));
    if (!drive) throw new Error(`No se encuentra la biblioteca «${SPC.library}» en el sitio de SharePoint.`);
  } else drive = await gfetch(`/sites/${site.id}/drive?$select=id,name,webUrl`);
  SP.drive = { id: drive.id, webUrl: drive.webUrl, siteUrl: site.webUrl };
  return SP.drive;
}
async function spEnsureFolder(rel) {
  const dr = await spDrive();
  return spEnsureFull([SP.rootPath, rel].filter(Boolean).join('/'), dr);
}
async function spEnsureFull(path, dr) {
  if (!path) return 'root';
  if (SP.folders.has(path)) return SP.folders.get(path);
  let id;
  try { id = (await gfetch(`/drives/${dr.id}/root:/${encPath(path)}?$select=id`)).id; }
  catch (e) {
    if (e.status !== 404) throw e;
    const i = path.lastIndexOf('/'), parent = i > 0 ? path.slice(0, i) : '', name = path.slice(i + 1);
    const pid = parent ? await spEnsureFull(parent, dr) : null;
    const url = pid ? `/drives/${dr.id}/items/${pid}/children` : `/drives/${dr.id}/root/children`;
    try { id = (await gfetch(url, { method: 'POST', body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }) })).id; }
    catch (e2) { if (e2.status !== 409) throw e2; id = (await gfetch(`/drives/${dr.id}/root:/${encPath(path)}?$select=id`)).id; }
  }
  SP.folders.set(path, id);
  return id;
}
async function spMeta(id, folder) {
  const dr = await spDrive();
  const it = await gfetch(`/drives/${dr.id}/items/${id}?$select=id,name,webUrl,sharepointIds,size`);
  return { id: it.id, name: it.name, webUrl: it.webUrl, uid: it.sharepointIds?.listItemUniqueId || '', siteUrl: it.sharepointIds?.siteUrl || dr.siteUrl, folder, size: it.size };
}
async function spUpload(folder, name, buf, type) {
  const dr = await spDrive(), fid = await spEnsureFolder(folder);
  const data = buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  let item;
  if (data.byteLength <= 4 * 1048576) {
    item = await gfetch(`/drives/${dr.id}/items/${fid}:/${encodeURIComponent(name)}:/content?@microsoft.graph.conflictBehavior=replace`, { method: 'PUT', body: data, headers: { 'Content-Type': type || 'application/octet-stream' } });
  } else {
    const ses = await gfetch(`/drives/${dr.id}/items/${fid}:/${encodeURIComponent(name)}:/createUploadSession`, { method: 'POST', body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }) });
    const CH = 320 * 1024 * 12;
    for (let off = 0; off < data.byteLength; off += CH) {
      const end = Math.min(off + CH, data.byteLength);
      const r = await fetch(ses.uploadUrl, { method: 'PUT', body: data.slice(off, end), headers: { 'Content-Range': `bytes ${off}-${end - 1}/${data.byteLength}` } });
      if (!r.ok) throw new Error(`SharePoint: error al subir el archivo (${r.status})`);
      if (end === data.byteLength) item = await r.json();
    }
  }
  return spMeta(item.id, folder);
}
async function spMove(file, folder, name) {
  const dr = await spDrive(), fid = await spEnsureFolder(folder);
  const body = JSON.stringify({ parentReference: { id: fid }, name });
  try { await gfetch(`/drives/${dr.id}/items/${file.id}`, { method: 'PATCH', body }); }
  catch (e) {
    if (e.status === 404) return null;
    if (e.status !== 409) throw e;
    await gfetch(`/drives/${dr.id}/items/${file.id}?@microsoft.graph.conflictBehavior=rename`, { method: 'PATCH', body });
  }
  return spMeta(file.id, folder);
}
async function spDownload(file) {
  const dr = await spDrive();
  const it = await gfetch(`/drives/${dr.id}/items/${file.id}`);
  const url = it['@microsoft.graph.downloadUrl'];
  if (!url) throw new Error('SharePoint no ha devuelto el enlace de descarga.');
  const r = await fetch(url); if (!r.ok) throw new Error(`SharePoint: no se pudo leer el archivo (${r.status})`);
  return r.arrayBuffer();
}
const spDlUrl = f => f?.uid && f?.siteUrl ? `${f.siteUrl.replace(/\/$/, '')}/_layouts/15/download.aspx?UniqueId=${f.uid}` : f?.webUrl;

/* ---------- Dónde debe estar cada archivo ---------- */
function spStage(d, v) { return isObsolete(v) ? 'obsolete' : circuitStatus(d, v) === ST.APR ? 'approved' : 'circuit'; }
function spFolder(d, v, kind) {
  const st = spStage(d, v);
  const parts = [SPC.folders[st], byId('doctypes', d.docTypeId)?.name || 'Sin tipo', d.code].filter(Boolean).map(spSafe);
  if (kind === 'original' && st !== 'circuit') parts.push(spSafe(SPC.folders.originals));
  return parts.join('/');
}
function spName(d, v, kind) {
  if (kind === 'signed') return spSafe(`${d.code}_V${v.n}_APROBADO`) + '.pdf';
  const m = /^(.*?)(\.[^.]+)?$/.exec(v.fileName || 'documento');
  return spSafe(`${d.code}_V${v.n}_${m[1]}`) + (m[2] || '').toLowerCase();
}
const spFolderLabel = f => !f ? '' : f.split('/').join(' › ');
function spNeedsSync(d) {
  if (!SPC.enabled) return false;
  return d.versions.some(v => {
    const sp = v.sp || {};
    if (!sp.file) return !!v.path;
    if (sp.file.folder !== spFolder(d, v, 'original')) return true;
    if (circuitStatus(d, v) === ST.APR) return !sp.signed || sp.signed.folder !== spFolder(d, v, 'signed');
    return false;
  });
}
/* Lleva los archivos de un documento a su carpeta. Es idempotente: se puede repetir sin riesgo. */
async function spSync(docId, opts = {}) {
  if (!SPC.enabled) return { ok: true, skipped: true };
  if (!SP.account) return { ok: false, needLogin: true };
  if (SP.busy.has(docId)) return { ok: true, busy: true };
  SP.busy.add(docId);
  const log = [];
  try {
    const d = await store.get('documents', docId); if (!d) return { ok: true };
    for (const v of d.versions) {
      v.sp = v.sp || {};
      const of = spFolder(d, v, 'original'), on = spName(d, v, 'original');
      if (!v.sp.file || (opts.force && !v.sp.file)) {
        const buf = opts.bytes?.[v.n] || (v.path ? await store.getFile(v.path) : null);
        if (buf) { v.sp.file = await spUpload(of, on, buf, v.fileType); log.push(`V${v.n}: archivo guardado en ${spFolderLabel(of)}`); }
      } else if (v.sp.file.folder !== of) {
        const moved = await spMove(v.sp.file, of, on);
        if (moved) { v.sp.file = moved; log.push(`V${v.n}: archivo movido a ${spFolderLabel(of)}`); }
        else { const buf = v.path ? await store.getFile(v.path) : null; if (buf) { v.sp.file = await spUpload(of, on, buf, v.fileType); log.push(`V${v.n}: archivo restaurado en ${spFolderLabel(of)}`); } }
      }
      if (circuitStatus(d, v) === ST.APR) {
        const sf = spFolder(d, v, 'signed'), sn = spName(d, v, 'signed');
        let moved = null;
        if (v.sp.signed && v.sp.signed.folder !== sf) { moved = await spMove(v.sp.signed, sf, sn); if (moved) { v.sp.signed = moved; log.push(`V${v.n}: PDF firmado movido a ${spFolderLabel(sf)}`); } else v.sp.signed = null; }
        if (!v.sp.signed) {
          const bytes = await buildSignedPdf(d, v);
          v.sp.signed = await spUpload(sf, sn, bytes, 'application/pdf'); log.push(`V${v.n}: PDF firmado guardado en ${spFolderLabel(sf)}`);
        }
      }
    }
    if (log.length) {
      const fresh = await store.get('documents', docId);
      fresh.versions.forEach(fv => { const m = d.versions.find(x => x.n === fv.n); if (m?.sp) fv.sp = m.sp; });
      await store.put('documents', fresh);
      const i = D.documents.findIndex(x => x.id === docId); if (i >= 0) D.documents[i] = fresh;
      for (const l of log) await addEvent(docId, 'SharePoint', l);
    }
    return { ok: true, log };
  } catch (e) { console.error(e); return { ok: false, error: e, needLogin: !!e.needLogin }; }
  finally { SP.busy.delete(docId); }
}
async function spSyncReport(docId, quiet = false) {
  if (!SPC.enabled) return;
  if (!SP.account) { if (!quiet) toast('Conecta SharePoint para guardar los cambios en las carpetas', 4500, 'info'); renderSpState(); return; }
  if (!quiet) toast('Sincronizando con SharePoint…', 1500, 'info');
  const r = await spSync(docId);
  if (!r.ok) toast(r.needLogin ? 'Vuelve a conectar SharePoint' : 'SharePoint: ' + (r.error?.message || 'error'), 6000, 'error');
  else if (r.log?.length && !quiet) toast('SharePoint actualizado', 2500);
  renderSpState();
  return r;
}
async function spSyncAll() {
  if (!spConnected()) return;
  const docs = D.documents.filter(spNeedsSync);
  if (!docs.length) return;
  toast(`Sincronizando ${docs.length} documento${docs.length > 1 ? 's' : ''} con SharePoint…`, 2500, 'info');
  let ok = 0, fail = 0;
  for (const d of docs) { const r = await spSync(d.id); r.ok ? ok++ : fail++; if (r.needLogin) break; }
  toast(fail ? `SharePoint: ${ok} sincronizados, ${fail} con error` : `${ok} documento${ok > 1 ? 's' : ''} sincronizado${ok > 1 ? 's' : ''} con SharePoint`, 4000, fail ? 'error' : 'ok');
  renderSpState();
}
/* Lee el archivo de una versión: SharePoint primero; la copia interna solo si SharePoint no está disponible. */
async function getVersionBytes(v, { preferBackup = false } = {}) {
  const fromSp = async () => ({ buf: await spDownload(v.sp.file), source: 'sp' });
  if (SPC.enabled && v.sp?.file && !preferBackup && SP.account) { try { return await fromSp(); } catch (e) { if (!v.path) throw e; console.warn(e); } }
  if (v.path) { const b = await store.getFile(v.path); if (b) return { buf: b, source: 'backup' }; }
  if (SPC.enabled && v.sp?.file) { if (!SP.account) throw spNeedLogin(); return fromSp(); }
  throw new Error('No se encuentra el archivo.');
}
function renderSpState() {
  const chip = $('#spChip'); if (!chip) return;
  if (!SPC.enabled) { chip.hidden = true; $('#spBanner')?.remove(); return; }
  chip.hidden = false;
  const pending = D.documents.filter(spNeedsSync).length;
  chip.innerHTML = spConnected()
    ? `<button type="button" class="sp-chip on" id="spBtn" title="Conectado como ${esc(SP.account.username)}">${icon('cloud')}<span>SharePoint</span>${pending ? `<b class="sp-pend">${pending}</b>` : ''}</button>`
    : `<button type="button" class="sp-chip off" id="spBtn">${icon('cloud')}<span>Conectar SharePoint</span></button>`;
  $('#spBtn').onclick = e => { e.stopPropagation(); spMenu(e.currentTarget, pending); };
  let b = $('#spBanner');
  if (!spConnected()) {
    if (!b) { b = document.createElement('div'); b.id = 'spBanner'; $('#banner').after(b); }
    b.innerHTML = `<div class="banner sp-banner">${icon('cloud')}<span>Conecta tu cuenta de Microsoft para que los documentos se guarden y se lean desde SharePoint.</span><button type="button" class="btn sm" id="spBannerBtn">Conectar SharePoint</button></div>`;
    $('#spBannerBtn').onclick = () => connectSharePoint({ rerender: !location.hash.startsWith('#upload') });
  } else b?.remove();
}
function spMenu(btn, pending) {
  if (!spConnected()) return connectSharePoint({ rerender: !location.hash.startsWith('#upload') });
  openMenu(btn, [
    { label: `Conectado como ${SP.account.username}`, ic: 'checkcircle', disabled: true },
    { label: 'Abrir carpeta de aprobaciones', ic: 'cloud', act: async () => { try { const dr = await spDrive(); window.open(dr.rootWebUrl || `${dr.webUrl}/${encPath(SP.rootPath)}`, '_blank', 'noopener'); } catch (e) { toast(e.message, 5000, 'error'); } } },
    { label: pending ? `Sincronizar ahora (${pending} pendientes)` : 'Todo sincronizado', ic: 'refresh', disabled: !pending, act: spSyncAll },
    '-',
    { label: 'Desconectar cuenta de Microsoft', ic: 'logout', act: async () => { await spDisconnect(); renderSpState(); toast('Cuenta de Microsoft desconectada', 2500, 'info'); } },
  ]);
}
async function connectSharePoint(o = {}) {
  try {
    await spConnect(); await spDrive();
    toast('SharePoint conectado'); renderSpState(); await spSyncAll(); if (o.rerender !== false) render();
  } catch (e) {
    console.error(e);
    if (/user_cancelled|popup_window_error|cancel/i.test(e.errorCode || e.message)) toast('No se completó el inicio de sesión con Microsoft. Si el navegador bloquea ventanas emergentes, permítelas para esta web.', 6000, 'error');
    else uiAlert('No se pudo conectar con SharePoint: ' + e.message, { tone: 'danger', title: 'SharePoint' });
    renderSpState();
  }
}

/* ---------- Motor del visor PDF ---------- */
function pdfjsReady() {
  if (!window.pdfjsLib) return false;
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc && CFG.pdfWorkerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = CFG.pdfWorkerSrc;
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    const s = [...document.scripts].find(x => /\/pdf(\.min)?\.js$/.test(x.src));
    pdfjsLib.GlobalWorkerOptions.workerSrc = s ? s.src.replace(/pdf(\.min)?\.js$/, 'pdf.worker.min.js') : '';
  }
  return true;
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
  const { buf } = await getVersionBytes(v, { preferBackup: true });
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
async function saveMySignature(sig) {
  const u = (await store.get('users', ME.id)) || ME; u.signature = sig; u.signatureAt = now();
  await store.put('users', u); ME = u; const i = D.users.findIndex(x => x.id === u.id); if (i >= 0) D.users[i] = u;
}


/* ---------- Visor con zoom y desplazamiento ---------- */
async function mountViewer(box, buf, type) {
  box.innerHTML = `<div class="viewer"><div class="vbar" role="toolbar" aria-label="Controles del visor">
      <button type="button" class="icon-btn sm" data-a="out" title="Alejar" aria-label="Alejar">${icon('zoomout')}</button><span class="zl" aria-live="polite">100%</span>
      <button type="button" class="icon-btn sm" data-a="in" title="Acercar" aria-label="Acercar">${icon('zoomin')}</button><span class="vsep"></span>
      <button type="button" class="btn ghost sm" data-a="fit">${icon('fit')}Ajustar</button><button type="button" class="btn ghost sm" data-a="one">100%</button>
      <button type="button" class="icon-btn sm" data-a="full" title="Pantalla completa" aria-label="Pantalla completa">${icon('maximize')}</button><span class="vinfo"></span></div>
    <div class="vscroll" tabindex="0" aria-label="Documento: arrastra para moverte, Ctrl + rueda para zoom"><div class="vpages"></div></div></div>`;
  const root = $('.viewer', box), scroll = $('.vscroll', box), pages = $('.vpages', box), zl = $('.zl', box);
  let scale = 1, baseW = 1, token = 0, pdf = null, img = null, url = null;
  if (/pdf/.test(type)) {
    if (!pdfjsReady()) throw new Error('el visor de PDF no se ha cargado (¿sin conexión?)');
    pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
    baseW = (await pdf.getPage(1)).getViewport({ scale: 1 }).width;
    $('.vinfo', box).textContent = `${pdf.numPages} página${pdf.numPages > 1 ? 's' : ''}`;
  } else {
    url = URL.createObjectURL(new Blob([buf], { type }));
    img = await loadImage(url); baseW = img.naturalWidth; img.draggable = false; img.alt = 'Documento';
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
  const fit = () => Math.max(0.2, (scroll.clientWidth - 40) / baseW);
  $$('[data-a]', box).forEach(b => { b.onclick = () => {
    const a = b.dataset.a;
    if (a === 'in') zoomTo(scale * 1.25); else if (a === 'out') zoomTo(scale / 1.25); else if (a === 'fit') zoomTo(fit()); else if (a === 'one') zoomTo(1);
    else if (a === 'full') { if (document.fullscreenElement) document.exitFullscreen(); else root.requestFullscreen?.().then(() => setTimeout(() => zoomTo(fit()), 120)).catch(() => { }); }
  }; });
  scroll.addEventListener('keydown', e => { if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomTo(scale * 1.25); } else if (e.key === '-') { e.preventDefault(); zoomTo(scale / 1.25); } });
  scroll.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomTo(scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12)); } }, { passive: false });
  let drag = null;
  scroll.addEventListener('pointerdown', e => { if (e.pointerType === 'touch' || e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, l: scroll.scrollLeft, t: scroll.scrollTop }; scroll.setPointerCapture(e.pointerId); scroll.classList.add('grabbing'); });
  scroll.addEventListener('pointermove', e => { if (!drag) return; scroll.scrollLeft = drag.l - (e.clientX - drag.x); scroll.scrollTop = drag.t - (e.clientY - drag.y); });
  const end = () => { drag = null; scroll.classList.remove('grabbing'); };
  scroll.addEventListener('pointerup', end); scroll.addEventListener('pointercancel', end);
  scale = fit(); await layout();
  return () => { token++; if (url) URL.revokeObjectURL(url); if (pdf) pdf.destroy(); };
}

async function downloadSigned(d, v = latest(d), o = {}) {
  if (!d || !v) return;
  if (circuitStatus(d, v) !== ST.APR) return uiAlert('El PDF firmado solo se puede descargar cuando todas las personas han firmado.', { title: 'Aún no disponible' });
  if (SPC.enabled && !o.preview) {
    if (!v.sp?.signed) {
      if (!spConnected()) return uiAlert('El PDF firmado se descarga desde SharePoint. Conecta tu cuenta de Microsoft para continuar.', { title: 'Conecta SharePoint', ic: 'cloud' }).then(connectSharePoint);
      toast('Guardando el PDF firmado en SharePoint…', 2000, 'info');
      const r = await spSync(d.id);
      if (!r.ok) return uiAlert('No se pudo guardar en SharePoint: ' + (r.error?.message || ''), { tone: 'danger', title: 'SharePoint' });
      d = byId('documents', d.id); v = d.versions.find(x => x.n === v.n);
    }
    const f = v.sp.signed;
    openDialog(dlgHead('PDF firmado en SharePoint', 'Se descarga desde SharePoint, con la etiqueta de privacidad de la empresa.') + `
      <div class="filecard" style="margin-top:0"><span class="fi">${icon('filetext')}</span><div><b>${esc(f.name)}</b><small>${esc(spFolderLabel(f.folder))}</small></div>${icon('cloud', 'ok-ic')}</div>
      <div class="dlg-foot"><button type="button" class="btn" id="pvw">${icon('eye')}Vista previa</button><span class="sep"></span><a class="btn" href="${esc(f.webUrl)}" target="_blank" rel="noopener">${icon('cloud')}Abrir en SharePoint</a>
        <a class="btn primary" id="spDl" href="${esc(spDlUrl(f))}" target="_blank" rel="noopener">${icon('download')}Descargar</a></div>`, 'small');
    $('#spDl').onclick = () => { addEvent(d.id, `PDF firmado descargado · V${v.n}`, 'Desde SharePoint'); setTimeout(() => $('#dlg').close(), 300); };
    $('#pvw').onclick = () => downloadSigned(d, v, { preview: true });
    return;
  }
  try {
    toast('Generando PDF firmado…', 1500, 'info');
    const bytes = await buildSignedPdf(d, v);
    const name = `${safeName(d.code)}_V${v.n}_APROBADO.pdf`, blob = new Blob([bytes], { type: 'application/pdf' });
    const spf = SPC.enabled && v.sp?.signed;
    const dlg = openDialog(`<div class="dlg-h"><div class="min0"><h2>${spf ? 'Vista previa del PDF firmado' : 'PDF firmado'}</h2><p><b>${esc(name)}</b> · portada con el cuadro de firmas + documento original</p></div>
      <div class="page-actions">${spf ? `<a class="btn primary" href="${esc(spDlUrl(spf))}" target="_blank" rel="noopener" id="pdfDl">${icon('download')}Descargar desde SharePoint</a>` : SPC.enabled ? '' : `<button type="button" class="btn primary" id="pdfDl">${icon('download')}Descargar PDF</button>`}<button type="button" class="icon-btn" data-x aria-label="Cerrar">${icon('x')}</button></div></div>
      <div id="pdfPrev"><div class="sk" style="height:50vh"></div></div>`, 'xl');
    dlg.bindClose();
    if ($('#pdfDl')) $('#pdfDl').onclick = async () => { if (!spf) { download(blob, name); toast('PDF descargado'); } await addEvent(d.id, `PDF firmado descargado · V${v.n}`, spf ? 'Desde SharePoint' : ''); };
    const stop = await mountViewer($('#pdfPrev'), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), 'application/pdf');
    dlg.onclose = () => { if (stop) stop(); };
  } catch (e) { console.error(e); uiAlert('No se pudo generar el PDF: ' + e.message, { tone: 'danger', title: 'Error' }); }
}

/* ---------- Editor de firma ---------- */
const sigEditorHtml = () => `<div class="seg-tabs" role="tablist"><button type="button" class="seg-tab active" data-t="draw" role="tab">${icon('pen')}Dibujar</button><button type="button" class="seg-tab" data-t="img" role="tab">${icon('image')}Adjuntar imagen</button></div>
  <div data-p="draw"><div class="sigwrap"><canvas class="sigc" aria-label="Zona para dibujar tu firma"></canvas></div><div class="actions" style="display:flex;justify-content:space-between;align-items:center;margin-top:8px"><span class="muted" style="font-size:12.5px">Firma con el ratón, el dedo o un lápiz.</span><button type="button" class="btn ghost sm" data-clear>${icon('trash')}Borrar</button></div></div>
  <div data-p="img" hidden><input type="file" accept="image/png,image/jpeg" class="sigfile" aria-label="Imagen de tu firma"><p class="muted" style="font-size:12.5px;margin-top:8px">Foto o escaneo de tu firma sobre fondo blanco: el fondo se elimina automáticamente.</p><div class="sigprev">Vista previa</div></div>`;
function mountSigEditor(root) {
  let mode = 'draw', imgData = null; const pad = signaturePad($('.sigc', root));
  $$('.seg-tab', root).forEach(t => { t.onclick = () => {
    mode = t.dataset.t; $$('.seg-tab', root).forEach(x => x.classList.toggle('active', x === t));
    $$('[data-p]', root).forEach(p => { p.hidden = p.dataset.p !== mode; });
  }; });
  $('[data-clear]', root).onclick = () => pad.clear();
  $('.sigfile', root).onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { imgData = await imageToSignature(f); $('.sigprev', root).innerHTML = `<img src="${imgData}" alt="Firma">`; } catch (err) { uiAlert(err.message); }
  };
  return { get: () => mode === 'draw' ? (pad.isEmpty() ? null : trimCanvas(pad.canvas).toDataURL('image/png')) : imgData };
}

/* ---------- Diálogos ---------- */
const dlgHead = (title, sub = '') => `<div class="dlg-h"><div class="min0"><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div><button type="button" class="icon-btn" data-x aria-label="Cerrar">${icon('x')}</button></div>`;
function uiDialog(html, setup) {
  return new Promise(res => {
    const d = $('#dlg2'); d.innerHTML = `<div class="dlg-body">${html}</div>`;
    let val = null; const done = v => { val = v; d.close(); };
    d.onclose = () => res(val); setup(d, done); d.showModal();
    d.querySelector('[data-ok]')?.focus();
  });
}
const toneIcon = { info: 'info', warn: 'alert', danger: 'alert' };
const msgBlock = (msg, o) => `${o.title ? `<h2 style="font-size:17px;margin-bottom:10px">${esc(o.title)}</h2>` : ''}<div class="dlg-msg"><span class="ic-wrap ${o.tone || ''}">${icon(o.ic || toneIcon[o.tone] || 'info')}</span><p style="padding-top:8px">${esc(msg)}</p></div>`;
const uiAlert = (msg, o = {}) => uiDialog(`${msgBlock(msg, o)}<div class="dlg-foot"><button type="button" class="btn primary" data-ok>Entendido</button></div>`,
  (d, done) => { $('[data-ok]', d).onclick = () => done(true); });
const uiConfirm = (msg, ok = 'Confirmar', o = {}) => uiDialog(`${msgBlock(msg, o)}<div class="dlg-foot"><button type="button" class="btn" data-no>Cancelar</button><button type="button" class="btn ${o.tone === 'danger' ? 'danger-solid' : 'primary'}" data-ok>${esc(ok)}</button></div>`,
  (d, done) => { $('[data-ok]', d).onclick = () => done(true); $('[data-no]', d).onclick = () => done(false); }).then(v => !!v);
const uiPrompt = (msg, def = '', ok = 'Aceptar') => uiDialog(`<form class="form" data-f novalidate><label>${esc(msg)}<input data-in value="${esc(def)}"></label><div class="dlg-foot" style="margin-top:4px"><button type="button" class="btn" data-no>Cancelar</button><button class="btn primary">${esc(ok)}</button></div></form>`,
  (d, done) => { $('[data-f]', d).onsubmit = e => { e.preventDefault(); done($('[data-in]', d).value); }; $('[data-no]', d).onclick = () => done(null); setTimeout(() => $('[data-in]', d).focus(), 30); });

function openDialog(html, cls = '') {
  const dlg = $('#dlg'); dlg.className = cls; dlg.innerHTML = `<div class="dlg-body">${html}</div>`;
  const api = { el: dlg, body: $('.dlg-body', dlg), onclose: null, close() { dlg.close(); } };
  dlg.onclose = () => { if (api.onclose) api.onclose(); };
  api.bindClose = () => $$('[data-x]', dlg).forEach(b => { b.onclick = () => dlg.close(); });
  api.bindClose(); dlg.showModal(); return api;
}
function changePasswordDialog() {
  const dlg = openDialog(dlgHead('Cambiar contraseña', 'Usa al menos 6 caracteres.') + `<form id="cpd" class="form" novalidate>
    <label>Nueva contraseña<input name="p1" type="password" minlength="6" autocomplete="new-password"></label>
    <label>Repite la contraseña<input name="p2" type="password" minlength="6" autocomplete="new-password"></label>
    <div class="err" id="cpderr" role="alert"></div>
    <div class="dlg-foot" style="margin-top:0"><button type="button" class="btn" data-x>Cancelar</button><button class="btn primary">Guardar contraseña</button></div></form>`, 'small');
  dlg.bindClose();
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
    const dlg = openDialog(dlgHead('Mi firma', 'Se incorporará al cuadro de firmas de cada documento que apruebes.') + `<div id="sigDlgEd">${sigEditorHtml()}</div>
      <div class="dlg-foot"><button type="button" class="btn" data-x>Cancelar</button><button type="button" class="btn primary" data-save>Guardar firma</button></div>`, 'wide');
    dlg.bindClose();
    const ed = mountSigEditor($('#sigDlgEd')); let result = null;
    dlg.onclose = () => res(result);
    $('[data-save]', dlg.body).onclick = async () => {
      const s = ed.get(); if (!s) return uiAlert('Dibuja tu firma o adjunta una imagen.');
      await saveMySignature(s); toast('Firma guardada'); result = s; dlg.close();
    };
  });
}

/* ---------- Circuitos ---------- */
function viewCircuits(m) {
  setCrumbs([['Administración'], ['Circuitos de firma']]);
  m.innerHTML = pageHead('Circuitos de firma', 'Define quién debe firmar y en qué orden. Al subir un documento se elige su circuito.', `<button type="button" class="btn primary" id="addC">${icon('plus')}Nuevo circuito</button>`)
    + (D.circuits.length ? D.circuits.map(c => {
      const docs = D.documents.filter(d => d.circuitId === c.id);
      const types = [...new Set(docs.map(d => byId('doctypes', d.docTypeId)?.name).filter(Boolean))];
      return `<section class="card circ-card"><div class="card-h"><div class="min0"><h2>${esc(c.name)}</h2>${c.description ? `<p class="c-desc">${esc(c.description)}</p>` : ''}</div>
          <button type="button" class="btn sm" data-edit="${esc(c.id)}">${icon('pencil')}Editar</button></div>
        <p class="muted" style="font-size:13px;margin:-4px 0 12px">${modeChip(c)} — ${modeText(c.order)}</p>
        ${hflow(c)}
        <div class="circ-stats"><span>${icon('users', '')} <b>${signerList(c).length}</b> participantes</span><span><b>${docs.filter(d => docStatus(d) === ST.INC).length}</b> en circuito</span><span><b>${docs.filter(d => docStatus(d) === ST.APR).length}</b> aprobados</span>
          ${types.length ? `<span>Tipos usados:</span><span class="chips">${types.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</span>` : ''}</div></section>`;
    }).join('') : emptyState('workflow', 'No hay circuitos todavía', 'Crea el primero para poder enviar documentos a firma.', `<button type="button" class="btn primary" id="addC2">${icon('plus')}Nuevo circuito</button>`));
  $('#addC').onclick = async () => { if (await editCircuit(null)) render(); };
  if ($('#addC2')) $('#addC2').onclick = async () => { if (await editCircuit(null)) render(); };
  $$('[data-edit]', m).forEach(b => { b.onclick = async () => { if (await editCircuit(byId('circuits', b.dataset.edit))) render(); }; });
}
function editCircuit(c) {
  return new Promise(res => {
    const isNew = !c;
    const w = c ? structuredClone(c) : { id: 'c-' + uid(), name: '', description: '', order: 'any', signers: [], createdBy: ME.id, createdAt: now() };
    w.signers = signerList(w);
    const dlg = openDialog('', 'wide'); let result = null; dlg.onclose = () => res(result);
    let showNew = false, gEdit = null; // gEdit: índice del grupo que se edita o 'new'
    const used = (skip = -1) => new Set(w.signers.flatMap((s, i) => i === skip ? [] : slotEmails(s)));
    const sync = () => {
      w.name = $('#cName').value.trim(); w.description = $('#cDesc').value.trim();
      w.order = $('input[name=cOrder]:checked', dlg.body)?.value || 'any';
      $$('[data-role]', dlg.body).forEach(i => { w.signers[+i.dataset.role].role = i.value.trim(); });
    };
    const draw = () => {
      const taken = used(), sorted = D.users.slice().sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
      const avail = sorted.filter(u => !taken.has(u.id));
      const g = gEdit === 'new' ? { role: '', members: [] } : gEdit != null ? w.signers[gEdit] : null, gTaken = gEdit != null ? used(gEdit === 'new' ? -1 : gEdit) : null;
      dlg.body.innerHTML = dlgHead(isNew ? 'Nuevo circuito de firma' : 'Editar circuito', 'Los cambios se aplican a los documentos que se suban a partir de ahora.') + `<div class="form">
        <div class="form-grid"><label>Nombre del circuito <em>*</em><input id="cName" value="${esc(w.name)}" placeholder="Ej.: Aprobación de diseños AAFF"></label>
          <label>Descripción<input id="cDesc" value="${esc(w.description || '')}" placeholder="Para qué se usa este circuito"></label></div>
        <div class="fld"><span>Orden de firma</span><div class="seg" role="radiogroup">
          <label class="pick ${w.order !== 'seq' ? 'on' : ''}"><input type="radio" name="cOrder" value="any" ${w.order !== 'seq' ? 'checked' : ''}><span class="pick-b"><b>${icon('split')} En paralelo</b><small>Todas las personas firman a la vez, en cualquier orden.</small></span></label>
          <label class="pick ${w.order === 'seq' ? 'on' : ''}"><input type="radio" name="cOrder" value="seq" ${w.order === 'seq' ? 'checked' : ''}><span class="pick-b"><b>${icon('listordered')} Secuencial</b><small>Cada persona firma después de la anterior.</small></span></label></div></div>
        <div class="fld"><span>Participantes <em>*</em> <span class="muted" style="font-weight:400">· el rol es el título de su recuadro en el cuadro de firmas del PDF</span></span>
          <ul class="slist">${w.signers.map((s, i) => `<li class="${isGroup(s) ? 'grp' : ''}"><span class="num">${i + 1}</span>${isGroup(s)
            ? `${avStack(s.members, 3)}<span class="who-b"><b><span class="gtag">${icon('users')}Grupo · firma 1 de ${s.members.length}</span></b><small>${esc(memberNames(s))}</small></span>
            <input data-role="${i}" value="${esc(s.role || '')}" placeholder="Nombre (p. ej. Dirección - Executive)" aria-label="Nombre del grupo">
            <button type="button" class="icon-btn sm" data-gedit="${i}" aria-label="Editar personas del grupo" title="Editar personas del grupo">${icon('pencil')}</button>`
            : `${avatar(s.email, 'sm')}<span class="who-b"><b>${esc(uname(s.email))}</b><small>${esc(s.email)}</small></span>
            <input data-role="${i}" value="${esc(s.role || '')}" placeholder="Rol (p. ej. Product)" aria-label="Rol de ${esc(uname(s.email))}">`}
            <button type="button" class="icon-btn sm" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">${icon('arrowup')}</button><button type="button" class="icon-btn sm" data-down="${i}" ${i === w.signers.length - 1 ? 'disabled' : ''} aria-label="Bajar">${icon('arrowdown')}</button><button type="button" class="icon-btn sm" data-del="${i}" aria-label="Quitar">${icon('trash')}</button></li>`).join('') || '<li class="empty-row">Aún no hay participantes. Añade al menos uno.</li>'}</ul>
          <div class="add-row"><select id="cAdd" aria-label="Añadir participante"><option value="">Añadir participante…</option>${avail.map(u => `<option value="${esc(u.id)}">${esc(u.name || u.id)} · ${esc(u.role || u.id)}</option>`).join('')}</select>
            <button type="button" class="btn" id="cNewG" title="Un paso que puede firmar cualquiera de varias personas">${icon('users')}Añadir grupo</button>
            <button type="button" class="btn" id="cNewP">${icon('plus')}Nueva persona</button></div>
          ${g ? `<div class="newp" id="grpBox"><b style="display:block;margin-bottom:4px">${gEdit === 'new' ? 'Nuevo grupo de firma' : 'Editar grupo de firma'}</b>
            <p class="muted" style="font-size:13px;margin:0 0 10px">Basta con que firme <b>una</b> de las personas marcadas. En el cuadro de firmas del PDF aparece el nombre del grupo con la firma de quien lo haya firmado.</p>
            <label class="fld">Nombre del grupo <em>*</em><input id="gRole" value="${esc(g.role || '')}" placeholder="Ej.: Dirección - Executive"></label>
            <div class="gpick">${sorted.map(u => { const dis = gTaken.has(u.id); return `<label class="${dis ? 'dis' : ''}" ${dis ? 'title="Ya está en otro paso del circuito"' : ''}><input type="checkbox" value="${esc(u.id)}" ${g.members.includes(u.id) ? 'checked' : ''} ${dis ? 'disabled' : ''}>${avatar(u.id, 'xs')}<span><b>${esc(u.name || u.id)}</b><small>${esc(u.role || u.id)}</small></span></label>`; }).join('')}</div>
            <div class="err" id="gErr"></div>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px"><button type="button" class="btn" id="gCancel">Cancelar</button><button type="button" class="btn primary" id="gSave">${gEdit === 'new' ? 'Añadir grupo al circuito' : 'Guardar grupo'}</button></div></div>` : ''}
          <div class="newp" id="newP" ${showNew ? '' : 'hidden'}><div class="form-grid">
            <label>Correo <em>*</em><input id="npE" type="email" placeholder="nombre@empresa.com"></label><label>Nombre y apellido<input id="npN"></label>
            <label>Rol / cargo<input id="npR" placeholder="Graphic designer, Product…"></label><div class="fld" style="display:flex;align-items:flex-end"><button type="button" class="btn primary" id="npAdd">Añadir al circuito</button></div></div><div class="err" id="npErr"></div></div>
        </div>
        ${w.signers.length ? `<div class="fld"><span>Vista previa del flujo</span>${hflow(w)}</div>` : ''}
      </div>
      <div class="dlg-foot">${isNew ? '' : `<button type="button" class="btn danger" id="cDel">${icon('trash')}Eliminar</button><span class="sep"></span>`}<button type="button" class="btn" data-x>Cancelar</button><button type="button" class="btn primary" id="cSave">Guardar circuito</button></div>`;
      dlg.bindClose();
      $$('input[name=cOrder]', dlg.body).forEach(r => { r.onchange = () => { sync(); draw(); }; });
      $('#cAdd').onchange = e => { sync(); const em = e.target.value; if (em && !w.signers.some(s => s.email === em)) w.signers.push({ email: em, role: userOf(em)?.role || '' }); draw(); };
      $('#cNewP').onclick = () => { sync(); showNew = !showNew; gEdit = null; draw(); if (showNew) $('#npE').focus(); };
      $('#cNewG').onclick = () => { sync(); gEdit = gEdit === 'new' ? null : 'new'; showNew = false; draw(); if (gEdit) $('#gRole').focus(); };
      $$('[data-gedit]', dlg.body).forEach(b => { b.onclick = () => { sync(); gEdit = +b.dataset.gedit; showNew = false; draw(); }; });
      if ($('#gCancel')) $('#gCancel').onclick = () => { sync(); gEdit = null; draw(); };
      if ($('#gSave')) $('#gSave').onclick = () => {
        const role = $('#gRole').value.trim(), members = $$('#grpBox input[type=checkbox]:checked', dlg.body).map(x => x.value);
        if (!role) { $('#gErr').textContent = 'Pon un nombre al grupo (p. ej. Dirección - Executive).'; return; }
        if (members.length < 2) { $('#gErr').textContent = 'Marca al menos dos personas: el grupo lo firma cualquiera de ellas.'; return; }
        sync();
        if (gEdit === 'new') w.signers.push({ role, members }); else w.signers[gEdit] = { role, members };
        gEdit = null; draw();
      };
      if ($('#npAdd')) $('#npAdd').onclick = async () => {
        const em = normEmail($('#npE').value); if (!isEmail(em)) { $('#npErr').textContent = 'Escribe un correo válido.'; return; }
        sync(); await ensureUser(em, $('#npN').value.trim(), $('#npR').value.trim());
        if (!w.signers.some(s => s.email === em)) w.signers.push({ email: em, role: $('#npR').value.trim() || userOf(em)?.role || '' });
        showNew = false; draw();
      };
      $$('[data-up]', dlg.body).forEach(b => { b.onclick = () => { sync(); const i = +b.dataset.up; if (i > 0) [w.signers[i - 1], w.signers[i]] = [w.signers[i], w.signers[i - 1]]; draw(); }; });
      $$('[data-down]', dlg.body).forEach(b => { b.onclick = () => { sync(); const i = +b.dataset.down; if (i < w.signers.length - 1) [w.signers[i + 1], w.signers[i]] = [w.signers[i], w.signers[i + 1]]; draw(); }; });
      $$('[data-del]', dlg.body).forEach(b => { b.onclick = () => { sync(); w.signers.splice(+b.dataset.del, 1); gEdit = null; draw(); }; });
      $('#cSave').onclick = async () => {
        sync();
        if (!w.name) { $('#cName').focus(); return uiAlert('Pon un nombre al circuito.'); }
        if (!w.signers.length) return uiAlert('Añade al menos una persona que deba firmar.');
        if (w.signers.some(s => isGroup(s) && !s.role)) return uiAlert('Pon un nombre a cada grupo de firma.');
        const b = $('#cSave'); b.classList.add('busy');
        await store.put('circuits', w);
        const i = D.circuits.findIndex(x => x.id === w.id); if (i >= 0) D.circuits[i] = w; else D.circuits.push(w);
        toast('Circuito guardado'); result = w; dlg.close();
      };
      if (!isNew) $('#cDel').onclick = async () => {
        if (D.documents.some(d => d.circuitId === w.id)) return uiAlert('No se puede eliminar: hay documentos que pertenecen a este circuito.', { tone: 'warn' });
        if (!(await uiConfirm(`Se eliminará el circuito «${w.name}».`, 'Eliminar', { title: '¿Eliminar el circuito?', tone: 'danger' }))) return;
        await store.del('circuits', w.id); D.circuits = D.circuits.filter(x => x.id !== w.id); result = { deleted: true }; dlg.close();
      };
    };
    draw();
  });
}

/* ---------- Catálogos (tipos de documento, productos, categorías) ---------- */
const CATS = {
  doctypes: { title: 'Tipos de documento', one: 'tipo de documento', ic: 'file', intro: 'Tipos que se eligen al subir un documento (Diseño AAFF, Packaging, Etiqueta…).',
    fields: [{ k: 'name', l: 'Nombre', req: 1 }, { k: 'description', l: 'Descripción' }], used: x => D.documents.some(d => d.docTypeId === x.id), count: x => D.documents.filter(d => d.docTypeId === x.id).length },
  products: { title: 'Productos', one: 'producto', ic: 'package', intro: 'Catálogo de códigos de material. Al subir un documento con un código nuevo, se añade aquí automáticamente.',
    fields: [{ k: 'code', l: 'Código de material', req: 1, mono: 1 }, { k: 'name', l: 'Nombre', req: 1 }, { k: 'categoryId', l: 'Categoría', ref: 'prodcats' }, { k: 'description', l: 'Descripción', area: 1 }],
    used: x => D.documents.some(d => d.code.toLowerCase() === x.code.toLowerCase()), count: x => D.documents.filter(d => d.code.toLowerCase() === x.code.toLowerCase()).length },
  prodcats: { title: 'Categorías de producto', one: 'categoría', ic: 'tag', intro: 'Agrupan los productos del catálogo.',
    fields: [{ k: 'name', l: 'Nombre', req: 1 }, { k: 'description', l: 'Descripción' }], used: x => D.products.some(p => p.categoryId === x.id), count: x => D.products.filter(p => p.categoryId === x.id).length, countL: 'Productos' },
};
function viewCatalog(m, coll) {
  const C = CATS[coll]; if (!C) return viewHome(m);
  setCrumbs([['Administración'], [C.title]]);
  const rows = D[coll].slice().sort((a, b) => String(a.code || a.name || '').localeCompare(String(b.code || b.name || '')));
  m.innerHTML = pageHead(C.title, C.intro, `<button type="button" class="btn primary" id="add">${icon('plus')}Añadir ${C.one}</button>`) + `
    <section class="card flush"><div class="filters"><div class="search">${icon('search')}<input id="cq" type="search" placeholder="Buscar…" aria-label="Buscar"></div><span class="muted" style="font-size:13px">${rows.length} registro${rows.length === 1 ? '' : 's'}</span></div>
    <div class="tablewrap"><table class="tbl"><thead><tr>${C.fields.filter(f => !f.area).map(f => `<th>${f.l}</th>`).join('')}<th>${C.countL || 'Documentos'}</th><th class="act"></th></tr></thead><tbody id="cb"></tbody></table></div></section>`;
  const txt = (f, x) => f.ref ? (byId(f.ref, x[f.k])?.name || '') : (x[f.k] || '');
  const draw = () => {
    const q = $('#cq').value.trim().toLowerCase();
    const list = rows.filter(x => !q || C.fields.some(f => String(txt(f, x)).toLowerCase().includes(q)));
    $('#cb').innerHTML = list.map(x => { const n = C.count(x); return `<tr>
      ${C.fields.filter(f => !f.area).map((f, i) => `<td class="${f.mono ? 'mono' : ''}">${i === 0 ? `<b>${esc(txt(f, x) || '—')}</b>` : esc(txt(f, x) || '—')}${i === 0 && x.description && coll === 'products' ? `<small>${esc(x.description)}</small>` : ''}</td>`).join('')}
      <td>${coll === 'products' && n ? `<a href="#docs/todos" data-q="${esc(x.code)}" class="lnk">${n}</a>` : `<span class="muted">${n}</span>`}</td>
      <td class="act"><button type="button" class="icon-btn sm" data-e="${esc(x.id)}" aria-label="Editar">${icon('pencil')}</button></td></tr>`; }).join('')
      || `<tr><td colspan="9">${emptyState(C.ic, q ? 'Sin resultados' : 'Aún no hay registros', q ? 'Prueba con otra búsqueda.' : '', '', true)}</td></tr>`;
    $$('[data-e]', m).forEach(b => { b.onclick = () => editRecord(coll, byId(coll, b.dataset.e)); });
    $$('[data-q]', m).forEach(a => { a.onclick = () => { LS.docs = Object.assign(LS.docs || { sort: 'date', dir: 'desc' }, { q: a.dataset.q, status: '', type: '', circ: '', d1: '', d2: '', page: 1 }); }; });
  };
  $('#cq').oninput = draw; draw();
  $('#add').onclick = () => editRecord(coll, null);
}
function editRecord(coll, x) {
  const C = CATS[coll], isNew = !x, w = x ? { ...x } : { id: coll.slice(0, 2) + '-' + uid(), createdAt: now() };
  const dlg = openDialog(dlgHead(`${isNew ? 'Nuevo' : 'Editar'} ${C.one}`) + `<form id="rf" class="form" novalidate>
    ${C.fields.map(f => `<label>${f.l}${f.req ? ' <em>*</em>' : ''}${f.ref ? `<select name="${f.k}"><option value="">Sin categoría</option>${D[f.ref].map(o => `<option value="${esc(o.id)}" ${o.id === w[f.k] ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>`
      : f.area ? `<textarea name="${f.k}" rows="3">${esc(w[f.k] || '')}</textarea>` : `<input name="${f.k}" value="${esc(w[f.k] || '')}" class="${f.mono ? 'mono' : ''}">`}</label>`).join('')}
    <div class="dlg-foot" style="margin-top:4px">${isNew ? '' : `<button type="button" class="btn danger" id="rdel">${icon('trash')}Eliminar</button><span class="sep"></span>`}<button type="button" class="btn" data-x>Cancelar</button><button class="btn primary">Guardar</button></div></form>`);
  dlg.bindClose();
  const f = $('#rf');
  setTimeout(() => f.querySelector('input,select')?.focus(), 30);
  f.onsubmit = async e => {
    e.preventDefault();
    for (const fl of C.fields) { w[fl.k] = f.elements[fl.k].value.trim(); if (fl.req && !w[fl.k]) { f.elements[fl.k].focus(); return uiAlert(`Rellena «${fl.l}».`); } }
    if (coll === 'products' && D.products.some(p => p.id !== w.id && p.code.toLowerCase() === w.code.toLowerCase())) return uiAlert('Ya existe un producto con ese código.');
    await store.put(coll, w); dlg.close(); toast('Guardado'); render();
  };
  if (!isNew) $('#rdel').onclick = async () => {
    if (C.used(w)) return uiAlert('No se puede eliminar porque está en uso.', { tone: 'warn' });
    if (!(await uiConfirm('Esta acción no se puede deshacer.', 'Eliminar', { title: `¿Eliminar este ${C.one}?`, tone: 'danger' }))) return;
    await store.del(coll, w.id); dlg.close(); toast('Eliminado'); render();
  };
}

/* ---------- Usuarios ---------- */
function viewUsers(m) {
  setCrumbs([['Administración'], ['Usuarios']]);
  const rows = D.users.slice().sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  m.innerHTML = pageHead('Usuarios', 'Personas que pueden participar en los circuitos. Cada una entra con su correo; la primera vez elige su contraseña y registra su firma.', `<button type="button" class="btn primary" id="addU">${icon('plus')}Añadir persona</button>`) + `
    <section class="card flush"><div class="filters"><div class="search">${icon('search')}<input id="uq" type="search" placeholder="Buscar por nombre, correo o rol…" aria-label="Buscar"></div><span class="muted" style="font-size:13px">${rows.length} personas</span></div>
    <div class="tablewrap"><table class="tbl"><thead><tr><th>Persona</th><th>Rol / cargo</th><th>Firma</th><th>Circuitos</th><th class="act"></th></tr></thead><tbody id="ub"></tbody></table></div></section>`;
  const draw = () => {
    const q = $('#uq').value.trim().toLowerCase();
    $('#ub').innerHTML = rows.filter(u => !q || [u.name, u.id, u.role].join(' ').toLowerCase().includes(q)).map(u => `<tr>
      <td><span class="who">${avatar(u.id)}<span><b>${esc(u.name || '—')}</b>${u.id === ME.id ? ' <span class="badge b-info" style="height:20px">Tú</span>' : ''}<small class="muted" style="display:block">${esc(u.id)}</small></span></span></td>
      <td>${esc(u.role || '—')}</td>
      <td>${u.signature ? `<img class="sigthumb" src="${u.signature}" alt="Firma de ${esc(u.name || u.id)}">` : '<span class="badge b-warn">Sin firma</span>'}</td>
      <td><div class="chips">${D.circuits.filter(c => allSignerEmails(c).includes(u.id)).map(c => `<span class="chip">${esc(c.name)}</span>`).join('') || '<span class="muted">—</span>'}</div></td>
      <td class="act"><button type="button" class="icon-btn sm" data-u="${esc(u.id)}" aria-label="Editar">${icon('pencil')}</button></td></tr>`).join('')
      || `<tr><td colspan="5">${emptyState('users', 'Sin resultados', 'Prueba con otra búsqueda.', '', true)}</td></tr>`;
    $$('[data-u]', m).forEach(b => { b.onclick = () => editUser(userOf(b.dataset.u)); });
  };
  $('#uq').oninput = draw; draw();
  $('#addU').onclick = () => editUser(null);
}
function editUser(u) {
  const isNew = !u;
  const dlg = openDialog(dlgHead(isNew ? 'Añadir persona' : 'Editar persona', isNew ? 'Podrá entrar con este correo y elegir su contraseña la primera vez.' : '') + `<form id="uf" class="form" novalidate>
    <label>Correo electrónico <em>*</em><input name="email" type="email" value="${esc(u?.id || '')}" ${isNew ? '' : 'readonly'}></label>
    <label>Nombre y apellido<input name="name" value="${esc(u?.name || '')}"></label>
    <label>Rol / cargo<input name="role" value="${esc(u?.role || '')}" placeholder="Graphic designer, Product, Executives…"></label>
    <div class="dlg-foot" style="margin-top:4px">${isNew || u.id === ME.id ? '' : `<button type="button" class="btn danger" id="udel">${icon('trash')}Eliminar</button><span class="sep"></span>`}<button type="button" class="btn" data-x>Cancelar</button><button class="btn primary">Guardar</button></div></form>`);
  dlg.bindClose();
  const f = $('#uf');
  f.onsubmit = async e => {
    e.preventDefault();
    const email = normEmail(f.elements.email.value); if (!isEmail(email)) return uiAlert('Escribe un correo válido.');
    if (isNew && userOf(email)) return uiAlert('Esa persona ya existe.');
    const rec = (await store.get('users', email)) || { id: email, email, createdAt: now() };
    rec.name = f.elements.name.value.trim(); rec.role = f.elements.role.value.trim();
    await store.put('users', rec); dlg.close(); toast('Guardado'); render();
  };
  if ($('#udel')) $('#udel').onclick = async () => {
    if (D.circuits.some(c => allSignerEmails(c).includes(u.id))) return uiAlert('Quita antes a esta persona de los circuitos en los que participa.', { tone: 'warn' });
    if (D.documents.some(d => pendEmails(pendingSigners(d)).includes(u.id))) return uiAlert('Tiene documentos pendientes de firma.', { tone: 'warn' });
    if (!(await uiConfirm(`Se eliminará a ${u.name || u.id}.`, 'Eliminar', { title: '¿Eliminar a esta persona?', tone: 'danger' }))) return;
    await store.del('users', u.id); dlg.close(); toast('Eliminado'); render();
  };
}

/* ---------- Perfil y firma ---------- */
function viewProfile(m) {
  setCrumbs([['Mi cuenta'], ['Mi perfil y firma']]);
  m.innerHTML = pageHead('Mi perfil y firma', 'Tus datos y la firma que se incorporará al cuadro de firmas de los documentos que apruebes.') + `
    ${ME.signature ? '' : `<div class="alert a-warn">${icon('alert')}<div><b>Registra tu firma.</b> La necesitas para firmar documentos.</div></div>`}
    <div class="grid-2">
      <div>
        <section class="card"><div class="profile-id">${avatar(ME.id, 'lg')}<div class="min0"><h2 style="font-size:17px">${esc(ME.name || ME.id)}</h2><small>${esc(ME.id)}</small></div></div>
          <form id="pf" class="form" novalidate>
            <label>Nombre y apellido<input name="name" value="${esc(ME.name || '')}"></label>
            <label>Rol / cargo<input name="role" value="${esc(ME.role || '')}" placeholder="Graphic designer, Product, Executives…"></label>
            <div><button class="btn primary">Guardar datos</button></div></form></section>
        <section class="card"><div class="card-h"><h2>${icon('key')}Contraseña</h2></div><form id="cpf" class="form" novalidate><div class="form-grid">
          <label>Nueva contraseña<input name="p1" type="password" minlength="6" autocomplete="new-password"></label>
          <label>Repite la contraseña<input name="p2" type="password" minlength="6" autocomplete="new-password"></label></div>
          <div class="err" id="cperr" role="alert"></div><div><button class="btn">Cambiar contraseña</button></div></form></section>
      </div>
      <section class="card"><div class="card-h"><h2>${icon('pen')}Mi firma</h2>${ME.signatureAt ? `<span class="muted" style="font-size:12.5px">Registrada el ${fmtDT(ME.signatureAt)}</span>` : ''}</div>
        <div class="sigprev" style="margin:0 0 18px">${ME.signature ? `<img src="${ME.signature}" alt="Mi firma">` : 'Aún no has registrado tu firma'}</div>
        <h3>${ME.signature ? 'Cambiar mi firma' : 'Crear mi firma'}</h3><div id="sigEd">${sigEditorHtml()}</div>
        <div style="margin-top:14px"><button type="button" class="btn primary" id="saveSig">${icon('check')}Guardar firma</button></div></section>
    </div>`;
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
