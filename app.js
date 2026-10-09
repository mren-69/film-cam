'use strict';

// ===== フィルム（加工の種類）の設定 =====
// css: 撮影前のプレビュー用のおおまかな色味
// fx : 撮影後に1ピクセルずつかける本番の加工
//   gamma/gain/offset: R,G,B ごとの色の曲げ方 / fade: 黒を浮かせる / roll: 白を抑える
//   sat: 彩度 / shadowTint・highTint: 暗部・明部に乗せる色 / grain: 粒子 / vignette: 周辺減光
//   leak: 光漏れが入る確率 / dust: ほこり / soft: 解像感を落とす割合
const FILMS = {
  koda: {
    label: 'KODA', sub: 'あたたかい', stamp: 'film',
    css: 'sepia(.22) saturate(1.35) contrast(1.06) brightness(1.04) hue-rotate(-6deg)',
    tint: 'rgba(255,170,60,.18)',
    fx: {
      contrast: 1.08, gamma: [0.94, 1.0, 1.1], gain: [1.06, 1.0, 0.88], offset: [0.02, 0.005, -0.01],
      fade: 0.06, roll: 0.05, sat: 1.15,
      shadowTint: [0.03, 0.0, -0.02], highTint: [0.04, 0.02, -0.05],
      grain: 0.07, vignette: 0.38, leak: 0.55, dust: true, soft: 0.85,
    },
  },
  fuji: {
    label: 'FUJI', sub: 'すっきり緑', stamp: 'film',
    css: 'saturate(1.1) contrast(1.08) brightness(1.03) hue-rotate(6deg)',
    tint: 'rgba(80,200,170,.12)',
    fx: {
      contrast: 1.1, gamma: [1.02, 0.97, 0.98], gain: [0.97, 1.02, 1.0], offset: [0, 0.01, 0.01],
      fade: 0.05, roll: 0.04, sat: 1.05,
      shadowTint: [-0.02, 0.02, 0.035], highTint: [0.02, 0.02, -0.01],
      grain: 0.06, vignette: 0.3, leak: 0.25, dust: true, soft: 0.85,
    },
  },
  instant: {
    label: 'INSTANT', sub: 'チェキ風', stamp: 'hand', frame: true,
    css: 'contrast(.9) brightness(1.1) saturate(.85) sepia(.15)',
    tint: 'rgba(120,180,255,.12)',
    fx: {
      contrast: 0.92, gamma: [1.0, 0.98, 0.95], gain: [1.02, 1.0, 0.96], offset: [0, 0, 0.02],
      fade: 0.12, roll: 0.06, sat: 0.85,
      shadowTint: [0, 0.02, 0.05], highTint: [0.03, 0.02, -0.02],
      grain: 0.04, vignette: 0.25, leak: 0, dust: false, soft: 0.8,
    },
  },
  vhs: {
    label: 'VHS', sub: 'ビデオ風', stamp: 'vhs',
    css: 'saturate(1.3) contrast(1.15) blur(.6px)',
    tint: 'rgba(255,0,120,.06)',
    fx: {
      contrast: 1.12, gamma: [1, 1, 1], gain: [1.02, 1.0, 1.04], offset: [0, 0, 0],
      fade: 0.04, roll: 0.04, sat: 1.3,
      shadowTint: [0.0, 0.0, 0.02], highTint: [0.02, 0.0, 0.0],
      grain: 0.05, vignette: 0.2, leak: 0, dust: false, lowres: 420, vhs: true,
    },
  },
  mono: {
    label: 'MONO', sub: 'モノクロ', stamp: 'film',
    css: 'grayscale(1) contrast(1.2) brightness(1.02)',
    tint: 'transparent',
    fx: {
      contrast: 1.2, gamma: [1, 1, 1], gain: [1, 1, 1], offset: [0, 0, 0],
      fade: 0.05, roll: 0.05, sat: 0, mono: true,
      shadowTint: [0, 0, 0], highTint: [0, 0, 0],
      grain: 0.12, vignette: 0.42, leak: 0, dust: true, soft: 0.85,
    },
  },
};

const MONTHS = ['JAN.', 'FEB.', 'MAR.', 'APR.', 'MAY', 'JUN.', 'JUL.', 'AUG.', 'SEP.', 'OCT.', 'NOV.', 'DEC.'];
const MAX_SIZE = 2000; // 保存する写真の長辺の最大ピクセル数

// ===== 状態（設定はスマホ内に記憶） =====
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 保存できない環境では無視 */ }
  },
};

const state = {
  film: FILMS[store.get('film', 'koda')] ? store.get('film', 'koda') : 'koda',
  stampOn: store.get('stampOn', true),
  timer: store.get('timer', 0),
  facing: 'environment',
  gpsPlace: store.get('gpsPlace', ''),
  manualPlace: store.get('manualPlace', null), // null = 自動(GPS)
  gpsInfo: '',
  stream: null,
  busy: false,
  lastBlob: null,
  lastUrl: null,
};

const $ = (id) => document.getElementById(id);
const el = {
  video: $('video'), viewfinder: $('viewfinder'), previewStamp: $('previewStamp'), handStamp: $('handStamp'),
  vhsPlay: $('vhsPlay'), filmTint: $('filmTint'), films: $('films'), shutter: $('shutter'), flipBtn: $('flipBtn'),
  thumbBtn: $('thumbBtn'), timerBtn: $('timerBtn'), timerLabel: $('timerLabel'), stampBtn: $('stampBtn'),
  importBtn: $('importBtn'), fileInput: $('fileInput'), placeBtn: $('placeBtn'), placeText: $('placeText'),
  countdown: $('countdown'), flash: $('flash'), camMsg: $('camMsg'), camMsgText: $('camMsgText'),
  camStartBtn: $('camStartBtn'), developing: $('developing'), result: $('result'), resultImg: $('resultImg'),
  saveBtn: $('saveBtn'), backBtn: $('backBtn'), placeModal: $('placeModal'), placeInput: $('placeInput'),
  gpsInfo: $('gpsInfo'), placeAuto: $('placeAuto'), placeOk: $('placeOk'),
};

// ===== 日付・場所の文字 =====
function currentPlace() {
  return (state.manualPlace !== null ? state.manualPlace : state.gpsPlace).trim().toUpperCase();
}

function dateParts(d) {
  const h = d.getHours();
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return {
    date: `${MONTHS[d.getMonth()]} ${dd} ${d.getFullYear()}`,            // OCT. 10 2026
    time: `${ampm} ${h12}:${mm}`,                                        // PM 2:12
    hand: `${titleCase(MONTHS[d.getMonth()])} ${d.getDate()}, ${d.getFullYear()}`, // Oct. 10, 2026
  };
}

function titleCase(s) {
  return s.toLowerCase().replace(/(^|[\s,.-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
}

function stampLines(type, d, place) {
  const p = dateParts(d);
  if (type === 'hand') return [place ? titleCase(place) : '', `${p.hand}  ${p.time.toLowerCase()}`].filter(Boolean);
  if (type === 'vhs') return [place, p.time, p.date].filter(Boolean);
  return [place, `${p.date}  ${p.time}`].filter(Boolean);
}

// ===== 画面の更新 =====
function renderFilms() {
  el.films.innerHTML = '';
  for (const [key, f] of Object.entries(FILMS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'film' + (key === state.film ? ' active' : '');
    b.innerHTML = `<b>${f.label}</b><small>${f.sub}</small>`;
    b.onclick = () => { state.film = key; store.set('film', key); renderFilms(); renderPreview(); };
    el.films.appendChild(b);
  }
}

function renderPreview() {
  const f = FILMS[state.film];
  el.video.style.filter = f.css;
  el.filmTint.style.background = f.tint;
  el.viewfinder.classList.toggle('instant', !!f.frame);
  el.viewfinder.classList.toggle('mirror', state.facing === 'user');
  el.vhsPlay.classList.toggle('hidden', f.stamp !== 'vhs');

  const lines = state.stampOn ? stampLines(f.stamp, new Date(), currentPlace()) : [];
  el.previewStamp.className = 'preview-stamp stamp-' + f.stamp;
  el.previewStamp.textContent = f.stamp === 'hand' ? '' : lines.join('\n');
  el.handStamp.textContent = f.stamp === 'hand' ? lines.join('\n') : '';

  el.stampBtn.classList.toggle('on', state.stampOn);
  el.timerBtn.classList.toggle('on', state.timer > 0);
  el.timerLabel.textContent = state.timer ? state.timer + 's' : 'OFF';

  const place = currentPlace();
  el.placeText.textContent = place || (state.manualPlace !== null ? '場所なし' : '位置を取得中…');
  el.placeBtn.classList.toggle('manual', state.manualPlace !== null);
}

// ===== カメラ =====
async function startCamera() {
  stopCamera();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showCamMsg('このブラウザではカメラが使えません。（https のページで開いてください）', false);
    return;
  }
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.facing, width: { ideal: 4032 }, height: { ideal: 3024 } },
      audio: false,
    });
    el.video.srcObject = state.stream;
    await el.video.play();
    el.camMsg.classList.add('hidden');
  } catch (err) {
    console.error(err);
    showCamMsg('カメラを起動できませんでした。設定でカメラの使用を許可してから、もう一度押してください。', true);
  }
  renderPreview();
}

function stopCamera() {
  if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
  state.stream = null;
}

function showCamMsg(text, showButton) {
  el.camMsgText.textContent = text;
  el.camStartBtn.classList.toggle('hidden', !showButton);
  el.camMsg.classList.remove('hidden');
}

// 映像の中央を 3:4 に切り抜いてキャンバスに写す
function grabFrame() {
  const v = el.video;
  const vw = v.videoWidth, vh = v.videoHeight;
  if (!vw || !vh) return null;
  const aspect = 3 / 4;
  let cw = vw, ch = vh;
  if (vw / vh > aspect) cw = vh * aspect; else ch = vw / aspect;
  const scale = Math.min(1, MAX_SIZE / ch);
  const W = Math.round(cw * scale), H = Math.round(ch * scale);
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  if (state.facing === 'user') { ctx.translate(W, 0); ctx.scale(-1, 1); }
  ctx.drawImage(v, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, W, H);
  return c;
}

// ライブラリの写真を縦なら3:4、横なら4:3に切り抜く
function imageToCanvas(img) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const aspect = iw >= ih ? 4 / 3 : 3 / 4;
  let cw = iw, ch = ih;
  if (iw / ih > aspect) cw = ih * aspect; else ch = iw / aspect;
  const scale = Math.min(1, MAX_SIZE / Math.max(cw, ch));
  const W = Math.round(cw * scale), H = Math.round(ch * scale);
  const c = makeCanvas(W, H);
  c.getContext('2d').drawImage(img, (iw - cw) / 2, (ih - ch) / 2, cw, ch, 0, 0, W, H);
  return c;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// ===== 現像（フィルム加工） =====
function buildLut(fx, ch) {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    let x = Math.pow(i / 255, fx.gamma[ch]);
    x = (x - 0.5) * fx.contrast + 0.5;
    x = x * fx.gain[ch] + fx.offset[ch];
    x = Math.min(1, Math.max(0, x));
    x = fx.fade + x * (1 - fx.fade - fx.roll);
    lut[i] = x * 255;
  }
  return lut;
}

function develop(src, film, info) {
  const fx = film.fx;
  const W = src.width, H = src.height;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d', { willReadFrequently: true });

  // 1) 解像感を落とす（小さく描いてから引き伸ばす）
  const soft = fx.lowres ? Math.min(1, fx.lowres / W) : (fx.soft || 1);
  if (soft < 1) {
    const sw = Math.max(2, Math.round(W * soft)), sh = Math.max(2, Math.round(H * soft));
    const s = makeCanvas(sw, sh);
    const sctx = s.getContext('2d');
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(src, 0, 0, sw, sh);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(s, 0, 0, W, H);
  } else {
    ctx.drawImage(src, 0, 0);
  }

  // 2) 1ピクセルずつ色・粒子・周辺減光を加える
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const lr = buildLut(fx, 0), lg = buildLut(fx, 1), lb = buildLut(fx, 2);
  const orig = fx.vhs ? new Uint8ClampedArray(d) : null;
  const shift = fx.vhs ? Math.max(2, Math.round(W / 250)) : 0;
  const scanPeriod = Math.max(2, Math.round(H / 300));
  const cx = W / 2, cy = H / 2, maxR2 = cx * cx + cy * cy;
  const sat = fx.sat, vig = fx.vignette, grain = fx.grain * 255;
  const st = fx.shadowTint.map((v) => v * 255), ht = fx.highTint.map((v) => v * 255);

  for (let y = 0; y < H; y++) {
    const dy2 = (y - cy) * (y - cy);
    const scan = fx.vhs && (y % (scanPeriod * 2) < scanPeriod) ? 0.9 : 1;
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const i = (row + x) * 4;
      let r, g, b;
      if (orig) {
        // VHS: 赤と青を左右にずらして色にじみを出す
        r = orig[(row + Math.max(0, x - shift)) * 4];
        g = orig[i + 1];
        b = orig[(row + Math.min(W - 1, x + shift)) * 4 + 2];
      } else {
        r = d[i]; g = d[i + 1]; b = d[i + 2];
      }
      r = lr[r]; g = lg[g]; b = lb[b];

      const l = 0.3 * r + 0.59 * g + 0.11 * b;
      if (fx.mono) {
        r = g = b = l;
      } else {
        r = l + (r - l) * sat;
        g = l + (g - l) * sat;
        b = l + (b - l) * sat;
        const t = l / 255, sh = (1 - t) * (1 - t), hi = t * t;
        r += st[0] * sh + ht[0] * hi;
        g += st[1] * sh + ht[1] * hi;
        b += st[2] * sh + ht[2] * hi;
      }

      const dist2 = ((x - cx) * (x - cx) + dy2) / maxR2;
      const v = (1 - vig * dist2 * Math.sqrt(dist2)) * scan;
      const n = (Math.random() + Math.random() - 1) * grain;
      d[i] = r * v + n;
      d[i + 1] = g * v + n;
      d[i + 2] = b * v + n;
    }
  }
  ctx.putImageData(img, 0, 0);

  // 3) 仕上げのエフェクト
  if (fx.vhs) addVhsArtifacts(ctx, c, W, H);
  if (Math.random() < fx.leak) addLightLeak(ctx, W, H);
  if (fx.dust) addDust(ctx, W, H);

  // 4) 日付の写し込み
  const lines = info.stampOn ? stampLines(film.stamp, info.date, info.place) : [];
  if (lines.length && film.stamp === 'film') drawFilmStamp(ctx, W, H, lines);
  if (lines.length && film.stamp === 'vhs') drawVhsStamp(ctx, W, H, lines);

  // 5) チェキ風のフチ
  if (film.frame) return addInstantFrame(c, W, H, film.stamp === 'hand' ? lines : []);
  return c;
}

function addVhsArtifacts(ctx, c, W, H) {
  // 下のほうの映像の乱れ（トラッキングノイズ）
  const bandH = Math.round(H * (0.02 + Math.random() * 0.03));
  const bandY = Math.round(H * (0.82 + Math.random() * 0.12));
  ctx.drawImage(c, 0, bandY, W, bandH, Math.round(W * 0.015), bandY, W, bandH);
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  ctx.fillRect(0, bandY, W, bandH);
  // ところどころに走る細い白線
  const lines = 3 + Math.floor(Math.random() * 5);
  for (let k = 0; k < lines; k++) {
    const y = Math.random() * H;
    const x = Math.random() * W * 0.6;
    ctx.fillStyle = `rgba(255,255,255,${0.08 + Math.random() * 0.15})`;
    ctx.fillRect(x, y, W * (0.1 + Math.random() * 0.4), Math.max(1, H / 600));
  }
}

function addLightLeak(ctx, W, H) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const fromRight = Math.random() < 0.5;
  const x = fromRight ? W * (1.0 + Math.random() * 0.1) : -W * Math.random() * 0.1;
  const y = H * (0.5 + Math.random() * 0.5);
  const r = Math.max(W, H) * (0.45 + Math.random() * 0.3);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  const warm = Math.random() < 0.5;
  g.addColorStop(0, warm ? 'rgba(255,150,40,.75)' : 'rgba(255,220,60,.6)');
  g.addColorStop(0.35, warm ? 'rgba(255,80,20,.35)' : 'rgba(150,255,80,.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function addDust(ctx, W, H) {
  const s = W / 1000;
  ctx.save();
  const count = 25 + Math.floor(Math.random() * 45);
  for (let k = 0; k < count; k++) {
    ctx.fillStyle = `rgba(255,253,245,${0.15 + Math.random() * 0.45})`;
    ctx.beginPath();
    ctx.arc(Math.random() * W, Math.random() * H, (0.4 + Math.random() * 1.6) * s, 0, Math.PI * 2);
    ctx.fill();
  }
  const hairs = Math.floor(Math.random() * 3);
  for (let k = 0; k < hairs; k++) {
    const x = Math.random() * W, y = Math.random() * H, len = (20 + Math.random() * 50) * s;
    ctx.strokeStyle = 'rgba(255,255,250,.25)';
    ctx.lineWidth = Math.max(1, s);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + len * 0.3, y - len * 0.4, x + len * 0.6, y + len * 0.4, x + len, y);
    ctx.stroke();
  }
  ctx.restore();
}

// オレンジに光るフィルムカメラ風の日付
function drawFilmStamp(ctx, W, H, lines) {
  const fs = Math.round(W * 0.042);
  ctx.save();
  ctx.font = `700 ${fs}px "DIN Condensed", "DIN Alternate", "Arial Narrow", sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(fs * 0.08)}px`; // 文字の間を少しあける
  const x = W * 0.94;
  let y = H * 0.95 - (lines.length - 1) * fs * 1.15;
  for (const text of lines) {
    ctx.shadowColor = 'rgba(255,80,0,.95)';
    ctx.shadowBlur = fs * 0.5;
    ctx.fillStyle = 'rgba(255,120,30,.9)';
    ctx.fillText(text, x, y);
    ctx.shadowBlur = fs * 0.15;
    ctx.fillStyle = '#ffb067';
    ctx.fillText(text, x, y);
    y += fs * 1.15;
  }
  ctx.restore();
}

// ビデオカメラ風のドット文字（小さく描いて拡大＝ドットが粗くなる）
function drawVhsStamp(ctx, W, H, lines) {
  const lw = 300;
  const k = W / lw;
  const lh = Math.round(H / k);
  const s = makeCanvas(lw, lh);
  const sctx = s.getContext('2d');
  const fs = 14;
  sctx.font = `700 ${fs}px "Courier New", ui-monospace, monospace`;
  sctx.textBaseline = 'alphabetic';
  const drawText = (t, x, y) => {
    sctx.fillStyle = 'rgba(0,0,0,.55)';
    sctx.fillText(t, x + 1, y + 1);
    sctx.fillStyle = '#fff';
    sctx.fillText(t, x, y);
  };
  drawText('PLAY ▶', 16, 22);
  let y = lh - 14 - (lines.length - 1) * (fs + 2);
  for (const line of lines) { drawText(line, 16, y); y += fs + 2; }
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(s, 0, 0, lw, lh, 0, 0, W, lh * k);
  ctx.restore();
}

// チェキ風の白いフチ（下が広い）と手書き風の文字
function addInstantFrame(photo, W, H, lines) {
  const u = W <= H ? W / 46 : H / 62;
  const side = Math.round(4 * u), top = Math.round(6 * u), bottom = Math.round(18 * u);
  const c = makeCanvas(W + side * 2, H + top + bottom);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f7f5ef';
  ctx.fillRect(0, 0, c.width, c.height);
  // 紙の質感
  for (let k = 0; k < 600; k++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.035})`;
    ctx.fillRect(Math.random() * c.width, Math.random() * c.height, 1.5 * u / 10, 1.5 * u / 10);
  }
  ctx.drawImage(photo, side, top);
  ctx.strokeStyle = 'rgba(0,0,0,.12)';
  ctx.lineWidth = Math.max(1, W / 700);
  ctx.strokeRect(side, top, W, H);

  if (lines.length) {
    const fs = Math.round(u * 3.4);
    ctx.save();
    ctx.translate(side + u * 2, top + H + bottom * 0.5);
    ctx.rotate(-0.025);
    ctx.font = `${fs}px "Marker Felt", "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive`;
    ctx.fillStyle = 'rgba(40,40,60,.85)';
    ctx.textBaseline = 'middle';
    const startY = -((lines.length - 1) * fs * 1.25) / 2;
    lines.forEach((line, idx) => ctx.fillText(line, 0, startY + idx * fs * 1.25));
    ctx.restore();
  }
  return c;
}

// ===== 撮影の流れ =====
async function shoot() {
  if (state.busy) return;
  if (!state.stream) { startCamera(); return; }
  state.busy = true;
  el.shutter.disabled = true;
  try {
    if (state.timer > 0) await countdown(state.timer);
    el.flash.classList.remove('go');
    void el.flash.offsetWidth; // アニメーションを毎回やり直すため
    el.flash.classList.add('go');
    const frame = grabFrame();
    if (!frame) throw new Error('映像がまだ準備できていません');
    await processAndShow(frame, new Date());
  } catch (err) {
    console.error(err);
    alert('撮影に失敗しました: ' + err.message);
  } finally {
    state.busy = false;
    el.shutter.disabled = false;
  }
}

function countdown(sec) {
  return new Promise((resolve) => {
    let n = sec;
    el.countdown.textContent = n;
    const timer = setInterval(() => {
      n -= 1;
      if (n <= 0) { clearInterval(timer); el.countdown.textContent = ''; resolve(); }
      else el.countdown.textContent = n;
    }, 1000);
  });
}

async function processAndShow(src, date) {
  el.developing.classList.remove('hidden');
  await new Promise((r) => setTimeout(r, 50)); // 「現像中…」を先に表示させる
  try {
    const out = develop(src, FILMS[state.film], { stampOn: state.stampOn, date, place: currentPlace() });
    const blob = await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.92));
    if (!blob) throw new Error('画像を作れませんでした');
    if (state.lastUrl) URL.revokeObjectURL(state.lastUrl);
    state.lastBlob = blob;
    state.lastDate = date;
    state.lastUrl = URL.createObjectURL(blob);
    el.resultImg.src = state.lastUrl;
    el.thumbBtn.style.backgroundImage = `url(${state.lastUrl})`;
    el.thumbBtn.classList.remove('empty');
    el.result.classList.remove('hidden');
  } finally {
    el.developing.classList.add('hidden');
  }
}

function fileName(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `FILM_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.jpg`;
}

async function savePhoto() {
  if (!state.lastBlob) return;
  const file = new File([state.lastBlob], fileName(state.lastDate || new Date()), { type: 'image/jpeg' });
  // iPhone: 共有シート →「画像を保存」で写真アプリに保存できる
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // 共有シートを閉じただけ
      console.error(err);
    }
  }
  // PCなど: ふつうにダウンロード
  const a = document.createElement('a');
  a.href = state.lastUrl;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ライブラリの写真を加工
function importPhoto(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = async () => {
    try {
      await processAndShow(imageToCanvas(img), new Date(file.lastModified || Date.now()));
    } catch (err) {
      alert('加工に失敗しました: ' + err.message);
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  img.onerror = () => { URL.revokeObjectURL(url); alert('この画像は読み込めませんでした'); };
  img.src = url;
}

// ===== 位置情報（GPSは電波がなくても使える） =====
function updateLocation() {
  if (!navigator.geolocation) { state.gpsInfo = 'この端末では位置情報が使えません'; return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const found = lookupPlace(latitude, longitude);
      state.gpsPlace = found.label;
      store.set('gpsPlace', found.label);
      state.gpsInfo = `GPS: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}（誤差 約${Math.round(accuracy)}m）→ ${found.label || '近くに登録地点なし'}`;
      renderPreview();
    },
    (err) => {
      state.gpsInfo = err.code === 1 ? '位置情報が許可されていません（設定から許可できます）' : '位置を取得できませんでした';
      if (!state.gpsPlace) el.placeText.textContent = '場所なし';
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 5 * 60 * 1000 },
  );
}

function openPlaceModal() {
  el.placeInput.value = currentPlace();
  el.gpsInfo.textContent = state.gpsInfo || 'GPSの情報を待っています…';
  el.placeModal.classList.remove('hidden');
}

// ===== ボタンの設定 =====
el.shutter.onclick = shoot;
el.camStartBtn.onclick = startCamera;
el.flipBtn.onclick = () => { state.facing = state.facing === 'user' ? 'environment' : 'user'; startCamera(); };
el.stampBtn.onclick = () => { state.stampOn = !state.stampOn; store.set('stampOn', state.stampOn); renderPreview(); };
el.timerBtn.onclick = () => {
  state.timer = state.timer === 0 ? 3 : state.timer === 3 ? 10 : 0;
  store.set('timer', state.timer);
  renderPreview();
};
el.importBtn.onclick = () => el.fileInput.click();
el.fileInput.onchange = () => { const f = el.fileInput.files[0]; el.fileInput.value = ''; if (f) importPhoto(f); };
el.thumbBtn.onclick = () => { if (state.lastUrl) el.result.classList.remove('hidden'); };
el.backBtn.onclick = () => el.result.classList.add('hidden');
el.saveBtn.onclick = savePhoto;

el.placeBtn.onclick = openPlaceModal;
el.placeOk.onclick = () => {
  state.manualPlace = el.placeInput.value.trim().toUpperCase();
  store.set('manualPlace', state.manualPlace);
  el.placeModal.classList.add('hidden');
  renderPreview();
};
el.placeAuto.onclick = () => {
  state.manualPlace = null;
  store.set('manualPlace', null);
  el.placeModal.classList.add('hidden');
  updateLocation();
  renderPreview();
};
el.placeModal.onclick = (e) => { if (e.target === el.placeModal) el.placeModal.classList.add('hidden'); };

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopCamera();
  else { startCamera(); updateLocation(); }
});

// ===== 起動 =====
renderFilms();
renderPreview();
startCamera();
updateLocation();
setInterval(renderPreview, 15 * 1000);          // 時刻の表示を更新
setInterval(updateLocation, 3 * 60 * 1000);      // 3分ごとに場所を更新

// オフラインで動くようにファイルを保存しておく仕組み（サービスワーカー）
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW登録失敗', err));
}
