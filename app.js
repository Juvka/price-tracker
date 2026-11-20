// ==================================================
// УТИЛИТЫ
// ==================================================
const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function formatDate(iso) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}
function formatDateShort(iso) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: 'short'
  });
}
function formatPrice(p) {
  return Number(p).toLocaleString('ru-RU', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  }) + ' ₽';
}
function formatPriceShort(p) {
  return Number(p).toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₽';
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

let toastTimer;
function toast(msg, isError = false) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ==================================================
// УМНАЯ АНАЛИТИКА
// ==================================================
function analyzePrices(fullHist) {
  if (!fullHist || fullHist.length === 0) return null;

  const now = new Date().getTime();
  const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;
  
  let activeHist = fullHist.filter(h => (now - new Date(h.date).getTime()) <= sixtyDaysMs);
  if (activeHist.length < 5 && fullHist.length > activeHist.length) {
    activeHist = fullHist.slice(-20); 
  }
  if (activeHist.length === 0) activeHist = fullHist;

  const prices = activeHist.map(h => h.price);
  const current = prices.at(-1);
  
  const sortedPrices = [...prices].sort((a, b) => a - b);
  const median = sortedPrices.at(Math.floor(sortedPrices.length / 2));
  
  let cleanPrices = prices.filter(p => p > median * 0.4 && p < median * 2.5);
  let hasAnomaly = cleanPrices.length !== prices.length;
  
  if (cleanPrices.length < 2) {
    cleanPrices = prices;
    hasAnomaly = false;
  }

  const min = Math.min(...cleanPrices);
  const max = Math.max(...cleanPrices);
  const range = max - min;
  const avg = cleanPrices.reduce((a, b) => a + b, 0) / cleanPrices.length;

  const position = range === 0 ? 0.5 : (current - min) / range;

  const win = prices.slice(-5);
  let trend = 'flat';
  let trendSlope = 0;
  if (win.length >= 2) {
    const n = win.length;
    const xs = Array.from({ length: n }, (_, i) => i);
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = win.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((s, x, i) => s + x * win.at(i), 0);
    const sumX2 = xs.reduce((s, x) => s + x * x, 0);
    const denom = n * sumX2 - sumX * sumX;
    trendSlope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
    
    const rel = avg > 0 ? trendSlope / avg : 0;
    if (rel > 0.005) trend = 'up';
    else if (rel < -0.005) trend = 'down';
    else trend = 'flat';
  }

  let forecastText = '';
  if (trend !== 'flat' && win.length >= 3) {
    const nextPrice = current + trendSlope * 3;
    if (nextPrice > 0) {
      forecastText = `Прогноз через 3 замера: ${formatPriceShort(nextPrice)}`;
    }
  }

  let verdict, advice, color;
  const isCurrentAnomaly = current < median * 0.4;
  
  if (isCurrentAnomaly) {
    verdict = 'Вероятно, акция';
    advice = 'Цена резко ниже обычной. Возможно, разовая распродажа.';
    color = 'neutral';
  } else if (range === 0) {
    verdict = 'Стабильно';
    advice = 'Цена не меняется.';
    color = 'neutral';
  } else if (current <= min * 1.02 || position <= 0.1) {
    verdict = 'Отличная цена';
    advice = 'Покупать сейчас. Дешевле не было.';
    color = 'great';
  } else if (position <= 0.35) {
    verdict = 'Хорошая цена';
    advice = 'Хороший момент для покупки.';
    color = 'good';
  } else if (position <= 0.65) {
    verdict = 'Средняя цена';
    advice = 'Можно подождать.';
    color = 'neutral';
  } else {
    verdict = 'Высокая цена';
    advice = 'Лучше подождать. Сейчас дорого.';
    color = 'bad';
  }

  if (trend === 'up') {
    if (color === 'great') {
      verdict = 'Хорошая цена';
      advice = 'Цена растёт — лучше брать сейчас, пока не подорожала.';
      color = 'good';
    } else if (color === 'good') {
      advice = 'Цена растёт — лучше брать сейчас.';
    }
  } else if (trend === 'down') {
    if (color === 'bad') {
      verdict = 'Средняя цена';
      advice = 'Цена падает — стоит подождать ещё.';
      color = 'neutral';
    }
  }

  return {
    current, min, max, avg,
    position, trend, trendSlope,
    verdict, advice, color,
    count: fullHist.length,
    hasAnomaly, isCurrentAnomaly, forecastText
  };
}

function adviceIcon(color) {
  const base = 'width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"';
  switch (color) {
    case 'great':
    case 'good':
      return `<svg ${base}><polyline points="20 6 9 17 4 12"/></svg>`;
    case 'bad':
      return `<svg ${base}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    default:
      return `<svg ${base}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
  }
}

function trendLabel(analysis) {
  if (!analysis) return '—';
  const { trend, count } = analysis;
  if (count < 3) return '→ мало данных';
  const suffix = ` · ${count}`;
  if (trend === 'up') return `↗ растёт${suffix}`;
  if (trend === 'down') return `↘ падает${suffix}`;
  return `→ стабильно${suffix}`;
}

// ==================================================
// ТЕМА И ВИД
// ==================================================
const LIST_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line class="icon-list-line" x1="8" y1="6" x2="21" y2="6"/>
    <line class="icon-list-line" x1="8" y1="12" x2="21" y2="12"/>
    <line class="icon-list-line" x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/>
    <line x1="3" y1="12" x2="3.01" y2="12"/>
    <line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>`;

const GRID_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect class="icon-grid-square" x="3" y="3" width="7" height="7" rx="1.5"/>
    <rect class="icon-grid-square" x="14" y="3" width="7" height="7" rx="1.5"/>
    <rect class="icon-grid-square" x="14" y="14" width="7" height="7" rx="1.5"/>
    <rect class="icon-grid-square" x="3" y="14" width="7" height="7" rx="1.5"/>
  </svg>`;

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('pt-theme', theme);
}

function initThemeToggle() {
  const checkbox = $('#theme-toggle');
  if (!checkbox) return;
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  checkbox.checked = currentTheme === 'light';
  checkbox.addEventListener('change', () => {
    applyTheme(checkbox.checked ? 'light' : 'dark');
  });
}

function applyView(view) {
  document.documentElement.setAttribute('data-view', view);
  localStorage.setItem('pt-view', view);
  const btn = $('#view-toggle');
  if (btn) btn.innerHTML = view === 'grid' ? LIST_ICON : GRID_ICON;
}

function initViewToggle() {
  const btn = $('#view-toggle');
  if (!btn) return;
  const current = document.documentElement.getAttribute('data-view') || 'list';
  btn.innerHTML = current === 'grid' ? LIST_ICON : GRID_ICON;
  btn.addEventListener('click', () => {
    const now = document.documentElement.getAttribute('data-view');
    applyView(now === 'grid' ? 'list' : 'grid');
  });
}

// ==================================================
// КАСТОМНЫЙ ТУЛТИП
// ==================================================
let tooltipEl = null;

function initTooltip() {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'global-tooltip';
    tooltipEl.className = 'custom-tooltip';
    document.body.appendChild(tooltipEl);
  }
}

function attachTooltips() {
  initTooltip();
  let hideTimer;

  document.querySelectorAll('[data-tooltip]').forEach(el => {
    el.removeAttribute('title');

    el.addEventListener('mouseenter', () => {
      clearTimeout(hideTimer);
      const text = el.getAttribute('data-tooltip');
      if (!text) return;

      tooltipEl.textContent = text;
      tooltipEl.style.display = 'block';
      tooltipEl.classList.remove('show');

      const rect = el.getBoundingClientRect();
      const tooltipRect = tooltipEl.getBoundingClientRect();
      
      let top = rect.top - tooltipRect.height - 10;
      let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
      
      if (top < 10) {
        top = rect.bottom + 10;
        tooltipEl.classList.add('bottom');
      } else {
        tooltipEl.classList.remove('bottom');
      }

      if (left < 10) left = 10;
      if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
      }

      tooltipEl.style.top = `${top}px`;
      tooltipEl.style.left = `${left}px`;

      requestAnimationFrame(() => {
        tooltipEl.classList.add('show');
      });
    });

    el.addEventListener('mouseleave', () => {
      tooltipEl.classList.remove('show');
      hideTimer = setTimeout(() => {
        tooltipEl.style.display = 'none';
      }, 200);
    });
  });
}

// ==================================================
// GITHUB API + ДАННЫЕ
// ==================================================
const DATA_FILE = 'data.json';

let ghConfig = JSON.parse(localStorage.getItem('pt-gh-config') || 'null');
let data = { products: [] };
let dataFileSha = null;
let pendingPhotoFile = null;
const photoUrlCache = new Map();
let searchQuery = '';

const FILTER_OPTIONS = [
  { label: '12ч', ms: 12 * 60 * 60 * 1000 },
  { label: '24ч', ms: 24 * 60 * 60 * 1000 },
  { label: '3д', ms: 3 * 24 * 60 * 60 * 1000 },
  { label: '7д', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '14д', ms: 14 * 24 * 60 * 60 * 1000 },
  { label: '1м', ms: 30 * 24 * 60 * 60 * 1000 },
  { label: 'Всё', ms: 0 }
];

function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function base64ToUtf8(str) {
  return decodeURIComponent(escape(atob(str)));
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',').at(1));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function ghRequest(path, options = {}) {
  const url = `https://api.github.com/repos/${ghConfig.owner}/${ghConfig.repo}/contents/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${ghConfig.token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || `Ошибка GitHub (${res.status})`);
  }
  return res.json();
}

async function readDataFile() {
  const fileData = await ghRequest(`${DATA_FILE}?t=${Date.now()}`);
  if (!fileData) {
    dataFileSha = null;
    return { products: [] };
  }
  dataFileSha = fileData.sha;
  const text = base64ToUtf8(fileData.content.replace(/\n/g, ''));
  if (!text.trim()) return { products: [] };
  return JSON.parse(text);
}

async function writeDataFile() {
  const contentBase64 = utf8ToBase64(JSON.stringify(data, null, 2));
  const body = {
    message: 'Обновление цен',
    content: contentBase64
  };
  if (dataFileSha) body.sha = dataFileSha;

  const res = await ghRequest(DATA_FILE, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
  if (res && res.content) {
    dataFileSha = res.content.sha;
  }
}

function compressImage(file, maxSize = 600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round(height * maxSize / width);
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round(width * maxSize / height);
          height = maxSize;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error('Ошибка сжатия'));
        }, 'image/jpeg', quality);
      };
      img.onerror = () => reject(new Error('Не удалось открыть изображение'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
    reader.readAsDataURL(file);
  });
}

async function savePhotoFile(file) {
  const compressed = await compressImage(file);
  const base64 = await blobToBase64(compressed);
  const filename = `photos/photo-${Date.now()}-${uid()}.jpg`;
  
  await ghRequest(filename, {
    method: 'PUT',
    body: JSON.stringify({
      message: 'Добавлено фото товара',
      content: base64
    })
  });
  return filename;
}

async function deletePhotoFile(name) {
  try {
    const fileData = await ghRequest(name);
    if (fileData && fileData.sha) {
      await ghRequest(name, {
        method: 'DELETE',
        body: JSON.stringify({
          message: 'Удалено фото товара',
          sha: fileData.sha
        })
      });
    }
  } catch (e) {
    console.warn('Не удалось удалить фото из GitHub:', e);
  }
  photoUrlCache.delete(name);
}

async function getPhotoURL(filename) {
  if (photoUrlCache.has(filename)) return photoUrlCache.get(filename);
  const url = `https://raw.githubusercontent.com/${ghConfig.owner}/${ghConfig.repo}/main/${filename}`;
  photoUrlCache.set(filename, url);
  return url;
}

// ==================================================
// НАСТРОЙКА ПОДКЛЮЧЕНИЯ К GITHUB
// ==================================================
function showSetupScreen() {
  const appScreen = $('#app-screen');
  if (appScreen) appScreen.style.display = 'none';
  const setup = $('#setup-screen');
  if (!setup) return;
  setup.style.display = 'flex';
  setup.innerHTML = `
    <div class="setup-card glass-panel" style="width: 100%; max-width: 460px;">
      <div class="setup-icon">☁️</div>
      <h2>Подключение к GitHub</h2>
      <p>Укажите данные вашего репозитория, чтобы синхронизировать цены между устройствами.</p>
      <form id="gh-setup-form" style="display:flex; flex-direction:column; gap:12px; text-align:left; margin-top:20px; position:relative; z-index:2;">
        <div class="field">
          <label>Ваш логин GitHub</label>
          <input type="text" id="gh-owner" placeholder="например: Juvka" value="${ghConfig?.owner || ''}" required>
        </div>
        <div class="field">
          <label>Название репозитория</label>
          <input type="text" id="gh-repo" placeholder="например: price-tracker" value="${ghConfig?.repo || ''}" required>
        </div>
        <div class="field">
          <label>Personal Access Token</label>
          <input type="password" id="gh-token" placeholder="github_pat_..." value="${ghConfig?.token || ''}" required>
        </div>
        <button type="submit" class="btn btn-primary" style="justify-content:center; margin-top:8px;">
          <span>Сохранить и подключить</span>
        </button>
      </form>
    </div>`;

  $('#gh-setup-form').addEventListener('submit', async e => {
    e.preventDefault();
    ghConfig = {
      owner: $('#gh-owner').value.trim(),
      repo: $('#gh-repo').value.trim(),
      token: $('#gh-token').value.trim()
    };
    localStorage.setItem('pt-gh-config', JSON.stringify(ghConfig));
    await initApp();
  });
}

async function initApp() {
  try {
    toast('Синхронизация с GitHub...');
    data = await readDataFile();
    if (!data.products) data.products = [];

    const setup = $('#setup-screen');
    const appScreen = $('#app-screen');
    if (setup) setup.style.display = 'none';
    if (appScreen) appScreen.style.display = 'block';
    const folderBtnText = $('#folder-btn-text');
    if (folderBtnText) folderBtnText.textContent = 'Настройки GitHub';

    await render();
    toast('Данные загружены');
  } catch (err) {
    console.error(err);
    toast('Ошибка доступа: ' + err.message, true);
    showSetupScreen();
  }
}

// ==================================================
// ФОТО В ФОРМЕ
// ==================================================
const photoInput = $('#product-photo');
const photoPreview = $('#photo-preview');
const photoRemove = $('#photo-remove');
const PLACEHOLDER_IMG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="3"/>
    <circle cx="9" cy="9" r="2"/>
    <path d="M21 15l-5-5L5 21"/>
  </svg>
  <span>Загрузить</span>`;

if (photoInput) {
  photoInput.addEventListener('change', e => {
    const file = e.target.files.item(0);
    if (!file) return;
    pendingPhotoFile = file;
    const reader = new FileReader();
    reader.onload = ev => {
      photoPreview.innerHTML = `<img src="${ev.target.result}" alt="preview">`;
      photoRemove.hidden = false;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });
}

if (photoRemove) {
  photoRemove.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    resetPhotoPicker();
  });
}

function resetPhotoPicker() {
  pendingPhotoFile = null;
  if (photoPreview) photoPreview.innerHTML = PLACEHOLDER_IMG;
  if (photoRemove) photoRemove.hidden = true;
}

// ==================================================
// ДОБАВЛЕНИЕ ТОВАРА
// ==================================================
const productForm = $('#product-form');
if (productForm) {
  productForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (!ghConfig) { toast('Сначала настройте GitHub', true); return; }

    const name = $('#product-name').value.trim();
    const priceRaw = $('#product-price').value;
    if (!name || !priceRaw) return;

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    try {
      let photoName = null;
      if (pendingPhotoFile) photoName = await savePhotoFile(pendingPhotoFile);

      data.products.push({
        id: uid(),
        name,
        photo: photoName,
        history: [{ id: uid(), price: parseFloat(priceRaw), date: new Date().toISOString() }]
      });

      await writeDataFile();
      e.target.reset();
      resetPhotoPicker();
      await render();
      toast('Товар добавлен');
    } catch (err) {
      console.error(err);
      toast('Ошибка: ' + err.message, true);
    } finally {
      btn.disabled = false;
    }
  });
}

// ==================================================
// ДИЗАЙНЕРСКИЙ ГРАФИК
// ==================================================
function buildChart(hist, productId, activeFilterMs = 0) {
  if (hist.length < 2) {
    return `
      <div class="chart-wrap chart-empty">
        <div class="chart-hint">Запишите цены хотя бы дважды — появится график динамики</div>
      </div>`;
  }

  let filteredHist = [...hist];
  let isFallback = false;
  
  if (activeFilterMs > 0) {
    const cutoff = Date.now() - activeFilterMs;
    filteredHist = hist.filter(h => new Date(h.date).getTime() >= cutoff);
    
    if (filteredHist.length < 2) {
      filteredHist = [...hist];
      isFallback = true;
    }
  }

  const prices = filteredHist.map(h => h.price);
  const firstPrice = prices.at(0);
  const lastPrice = prices.at(-1);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const periodDiff = lastPrice - firstPrice;
  const periodPct = firstPrice ? ((periodDiff / firstPrice) * 100).toFixed(1) : '0.0';
  const periodSign = periodDiff > 0 ? '+' : '';
  const periodClass = periodDiff > 0 ? 'up' : periodDiff < 0 ? 'down' : 'flat';

  const W = 320;
  const H = 135;
  const PAD_L = 14;
  const PAD_R = 14;
  const PAD_T = 22;
  const PAD_B = 22;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const pts = prices.map((p, i) => {
    const x = PAD_L + (i / (prices.length - 1)) * plotW;
    const y = PAD_T + plotH - ((p - min) / range) * plotH;
    return { x, y, price: p, date: filteredHist.at(i).date };
  });

  let linePath = `M${pts.at(0).x.toFixed(2)},${pts.at(0).y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts.at(i);
    const p1 = pts.at(i + 1);
    const cx = (p0.x + p1.x) / 2;
    linePath += ` C${cx.toFixed(2)},${p0.y.toFixed(2)} ${cx.toFixed(2)},${p1.y.toFixed(2)} ${p1.x.toFixed(2)},${p1.y.toFixed(2)}`;
  }
  const bottomY = H - PAD_B + 10;
  const areaPath = `${linePath} L${pts.at(-1).x.toFixed(2)},${bottomY} L${pts.at(0).x.toFixed(2)},${bottomY} Z`;

  const gid = 'g-' + productId;
  const aid = 'a-' + productId;

  const minIdx = prices.indexOf(min);
  const maxIdx = prices.lastIndexOf(max);
  const minPt = pts.at(minIdx);
  const maxPt = pts.at(maxIdx);

  let extremaHtml = '';
  if (max !== min) {
    const maxLeft = Math.max(8, Math.min(92, (maxPt.x / W) * 100));
    const maxTop = (maxPt.y / H) * 100;
    const minLeft = Math.max(8, Math.min(92, (minPt.x / W) * 100));
    const minTop = (minPt.y / H) * 100;

    extremaHtml = `
      <div class="chart-extrema-html">
        <span class="extrema-tag max" style="left:${maxLeft}%; top:${maxTop}%">Макс ${formatPriceShort(max)}</span>
        <span class="extrema-tag min" style="left:${minLeft}%; top:${minTop}%">Мин ${formatPriceShort(min)}</span>
      </div>
    `;
  }

  const hoverZones = pts.map((pt, i) => {
    const zoneW = plotW / (pts.length - 1);
    const diffFromStart = pt.price - firstPrice;
    const pctFromStart = firstPrice ? ((diffFromStart / firstPrice) * 100).toFixed(1) : '0.0';
    return `
      <rect class="chart-hover-zone" 
            data-x="${pt.x}" data-y="${pt.y}" 
            data-x-pct="${(pt.x / W) * 100}" data-y-pct="${(pt.y / H) * 100}"
            data-price="${pt.price}" data-date="${pt.date}"
            data-diff="${diffFromStart}" data-pct="${pctFromStart}"
            x="${pt.x - zoneW / 2}" y="0" width="${zoneW}" height="${H}" />
    `;
  }).join('');

  const tabsHtml = FILTER_OPTIONS.map(opt => `
    <button class="chart-tab ${activeFilterMs === opt.ms ? 'active' : ''}" 
            data-product-id="${productId}" 
            data-ms="${opt.ms}">
      ${opt.label}
    </button>
  `).join('');

  return `
    <div class="chart-wrap">
      <div class="chart-header">
        <div class="chart-period-stat">
          <span class="chart-period-title">${isFallback ? 'Мало данных за период' : 'За период'}</span>
          <span class="chart-period-badge ${periodClass}">
            ${periodSign}${formatPriceShort(periodDiff)} (${periodSign}${periodPct}%)
          </span>
        </div>
        <div class="chart-tabs">${tabsHtml}</div>
      </div>
      
      <div class="chart-canvas">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%; height:100%;">
          <defs>
            <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="var(--accent-2)"/>
              <stop offset="100%" stop-color="var(--accent)"/>
            </linearGradient>
            <linearGradient id="${aid}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.32"/>
              <stop offset="85%" stop-color="var(--accent-2)" stop-opacity="0.04"/>
              <stop offset="100%" stop-color="var(--accent-2)" stop-opacity="0"/>
            </linearGradient>
          </defs>

          <g class="chart-grid">
            <line x1="${PAD_L}" y1="${PAD_T}" x2="${W - PAD_R}" y2="${PAD_T}" />
            <line x1="${PAD_L}" y1="${PAD_T + plotH * 0.5}" x2="${W - PAD_R}" y2="${PAD_T + plotH * 0.5}" />
            <line x1="${PAD_L}" y1="${PAD_T + plotH}" x2="${W - PAD_R}" y2="${PAD_T + plotH}" />
          </g>

          <path class="chart-area" d="${areaPath}" style="fill:url(#${aid})"/>
          <path class="chart-line" d="${linePath}" style="stroke:url(#${gid}); vector-effect:non-scaling-stroke;"/>

          <g class="chart-interaction" style="display:none;">
            <line class="chart-hover-line" x1="0" y1="${PAD_T - 6}" x2="0" y2="${bottomY}" style="vector-effect:non-scaling-stroke;" />
          </g>

          ${hoverZones}
        </svg>

        ${extremaHtml}

        <div class="chart-tooltip" style="display:none;">
          <div class="tt-top">
            <span class="tt-price"></span>
            <span class="tt-diff"></span>
          </div>
          <div class="tt-date"></div>
        </div>
      </div>

      <div class="chart-meta">
        <span>${formatDateShort(filteredHist.at(0).date)}</span>
        <span class="chart-meta-count">${filteredHist.length} зам.</span>
        <span>${formatDateShort(filteredHist.at(-1).date)}</span>
      </div>
    </div>`;
}

// ==================================================
// РЕНДЕР
// ==================================================
async function render() {
  const container = $('#products');
  if (!container) return;

  if (!data.products || data.products.length === 0) {
    container.innerHTML = `
      <div class="empty glass-panel">
        <div class="empty-icon">📈</div>
        <p>Пока нет ни одного товара.<br>Добавьте первый, чтобы начать отслеживать цены.</p>
      </div>`;
    return;
  }

  const filtered = data.products.filter(p => 
    !searchQuery || p.name.toLowerCase().includes(searchQuery)
  );

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty glass-panel">
        <div class="empty-icon">🔍</div>
        <p>Ничего не найдено по запросу «${escapeHtml(searchQuery)}».</p>
      </div>`;
    return;
  }

  const photoUrls = new Map();
  for (const p of filtered) {
    if (p.photo) {
      const url = await getPhotoURL(p.photo);
      if (url) photoUrls.set(p.id, url);
    }
  }

  container.innerHTML = filtered.map(p => renderProduct(p, photoUrls.get(p.id))).join('');
  
  // Ждем кадр, чтобы DOM отрендерился
  requestAnimationFrame(() => {
    attachHandlers();
    attachTooltips();
    // Инициализируем высоту таблицы после того, как всё отрисовалось
    initTableHeights();
  });
}

function renderProduct(product, photoURL) {
  const hist = [...product.history].sort((a, b) => new Date(a.date) - new Date(b.date));
  const current = hist.at(-1).price;
  const first = hist.at(0).price;
  const maxPrice = Math.max(...hist.map(h => h.price));
  const minPrice = Math.min(...hist.map(h => h.price));
  
  const analysis = analyzePrices(hist);

  const diff = current - first;
  const diffPercent = first ? ((diff / first) * 100).toFixed(1) : '0.0';
  const diffClass = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const diffSign = diff > 0 ? '+' : '';

  const savedFilterMs = Number(localStorage.getItem(`pt-filter-${product.id}`));
  const activeFilterMs = !isNaN(savedFilterMs) ? savedFilterMs : 0;
  const chart = buildChart(hist, product.id, activeFilterMs);

  const thumb = photoURL
    ? `<div class="product-thumb" data-lightbox="${photoURL}" data-tooltip="Нажмите, чтобы увеличить">
         <img src="${photoURL}" alt="">
         <div class="thumb-overlay">Открыть</div>
       </div>`
    : `<div class="product-thumb">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
           <rect x="3" y="3" width="18" height="18" rx="3"/>
           <circle cx="9" cy="9" r="2"/>
           <path d="M21 15l-5-5L5 21"/>
         </svg>
       </div>`;

  // Формируем строки таблицы
  const allRowsReversed = [...hist].reverse();
  const hasMore = allRowsReversed.length > 3;

  const rows = allRowsReversed.map((h, index) => {
    const hiddenClass = index >= 3 ? 'hidden-row' : '';
    return `
      <tr class="${hiddenClass}">
        <td class="date-cell">${formatDate(h.date)}</td>
        <td class="price-cell">${formatPrice(h.price)}</td>
        <td class="action-cell">
          <button class="delete-price" data-product="${product.id}" data-entry="${h.id}" data-tooltip="Удалить эту запись">✕</button>
        </td>
      </tr>`;
  }).join('');

  const toggleBtnHtml = hasMore
    ? `<div class="history-toggle-wrap">
         <button class="history-toggle-btn" data-product-toggle="${product.id}">
           <span>Показать все (${allRowsReversed.length})</span>
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;">
             <polyline points="6 9 12 15 18 9"/>
           </svg>
         </button>
       </div>`
    : '';

  const diffIcon = diff > 0
    ? '<polyline points="17 11 12 6 7 11"/><line x1="12" y1="18" x2="12" y2="6"/>'
    : diff < 0
      ? '<polyline points="7 13 12 18 17 13"/><line x1="12" y1="6" x2="12" y2="18"/>'
      : '<line x1="5" y1="12" x2="19" y2="12"/>';

  const forecastBadge = analysis && analysis.forecastText
    ? `<div class="forecast-badge">🔮 ${analysis.forecastText}</div>`
    : '';

  return `
    <article class="product glass-panel">
      <div class="product-header">
        <div class="product-head-inner">
          ${thumb}
          <div class="product-title-wrap">
            <div class="product-title">${escapeHtml(product.name)}</div>
            <div class="badges-row">
              <div class="product-badge ${diffClass}" data-tooltip="Изменение от первой до текущей цены">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;">
                  ${diffIcon}
                </svg>
                ${diffSign}${formatPriceShort(diff)} · ${diffSign}${diffPercent}%
              </div>
              ${analysis ? `
                <div class="advice-badge ${analysis.color}" data-tooltip="${escapeHtml(analysis.advice)}">
                  ${adviceIcon(analysis.color)}
                  <span>${escapeHtml(analysis.verdict)}</span>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
        <button class="del-product" data-delete-product="${product.id}" data-tooltip="Удалить весь товар">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>

      <div class="product-stats">
        <div class="stat stat-primary">
          <span class="stat-label">Текущая</span>
          <span class="stat-value">${formatPrice(current)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Минимум</span>
          <span class="stat-value">${formatPrice(minPrice)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Средняя</span>
          <span class="stat-value">${formatPrice(analysis ? analysis.avg : first)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Максимум</span>
          <span class="stat-value">${formatPrice(maxPrice)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Тренд</span>
          <span class="stat-value trend-value ${analysis ? analysis.trend : 'flat'}">${trendLabel(analysis)}</span>
        </div>
      </div>

      ${forecastBadge}

      ${chart}

      <form class="add-price-form" data-product="${product.id}">
        <input type="number" step="0.01" min="0" placeholder="Введите новую цену, ₽" required>
        <button type="submit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:16px;height:16px;">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          <span>Записать</span>
        </button>
      </form>

      <div class="table-wrap ${hasMore ? 'is-collapsed' : ''}" data-product-table="${product.id}">
        <table>
          <thead><tr><th>Дата и время</th><th>Цена</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${toggleBtnHtml}
    </article>`;
}

// ==================================================
// ОБРАБОТЧИКИ
// ==================================================
function attachChartHover(wrap) {
  const svg = wrap.querySelector('svg');
  const tooltip = wrap.querySelector('.chart-tooltip');
  const interaction = wrap.querySelector('.chart-interaction');
  const hoverLine = wrap.querySelector('.chart-hover-line');
  const ttPrice = wrap.querySelector('.tt-price');
  const ttDiff = wrap.querySelector('.tt-diff');
  const ttDate = wrap.querySelector('.tt-date');
  
  if (!svg || !tooltip) return;
  const zones = wrap.querySelectorAll('.chart-hover-zone');

  const showPoint = (zone) => {
    interaction.style.display = 'block';
    tooltip.style.display = 'flex';

    const x = parseFloat(zone.dataset.x);
    const xPct = parseFloat(zone.dataset.xPct);
    const yPct = parseFloat(zone.dataset.yPct);
    const price = parseFloat(zone.dataset.price);
    const diff = parseFloat(zone.dataset.diff);
    const pct = zone.dataset.pct;
    const date = zone.dataset.date;

    hoverLine.setAttribute('x1', x);
    hoverLine.setAttribute('x2', x);

    ttPrice.textContent = formatPrice(price);
    ttDate.textContent = formatDate(date);

    if (diff === 0) {
      ttDiff.textContent = 'старт';
      ttDiff.className = 'tt-diff flat';
    } else {
      const sign = diff > 0 ? '+' : '';
      ttDiff.textContent = `${sign}${pct}%`;
      ttDiff.className = `tt-diff ${diff > 0 ? 'up' : 'down'}`;
    }

    const clampedX = Math.max(18, Math.min(82, xPct));
    tooltip.style.left = `${clampedX}%`;
    
    if (yPct < 38) {
      tooltip.style.top = `${yPct + 12}%`;
      tooltip.classList.add('below');
    } else {
      tooltip.style.top = `${yPct - 10}%`;
      tooltip.classList.remove('below');
    }
  };

  zones.forEach(zone => {
    zone.addEventListener('mouseenter', () => showPoint(zone));
    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      showPoint(zone);
    }, { passive: false });
  });

  svg.addEventListener('mouseleave', () => {
    interaction.style.display = 'none';
    tooltip.style.display = 'none';
  });
}

function attachChartTabs(productEl, product) {
  productEl.querySelectorAll('.chart-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const ms = parseInt(btn.dataset.ms);
      
      localStorage.setItem(`pt-filter-${product.id}`, ms);
      
      const chartWrap = productEl.querySelector('.chart-wrap');
      const hist = [...product.history].sort((a, b) => new Date(a.date) - new Date(b.date));
      const newChartHtml = buildChart(hist, product.id, ms);
      
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = newChartHtml;
      const newChartEl = tempDiv.firstElementChild;
      
      chartWrap.replaceWith(newChartEl);
      
      attachChartHover(newChartEl);
      attachChartTabs(productEl, product);
    });
  });
}

function initTableHeights() {
  document.querySelectorAll('.product').forEach(productEl => {
    const tableWrap = productEl.querySelector('.table-wrap');
    if (tableWrap && tableWrap.classList.contains('is-collapsed')) {
      const thead = tableWrap.querySelector('thead');
      const tbody = tableWrap.querySelector('tbody');
      if (thead && tbody) {
        const headerHeight = thead.offsetHeight;
        const rows = tbody.querySelectorAll('tr');
        let threeRowsHeight = 0;
        // Берем высоту первых трех строк
        for (let i = 0; i < Math.min(3, rows.length); i++) {
          threeRowsHeight += rows[i].offsetHeight;
        }
        // Добавляем 1px для границы, чтобы 3-я строка не обрезалась
        const collapsedHeight = headerHeight + threeRowsHeight + 1;
        tableWrap.style.setProperty('--collapsed-height', collapsedHeight + 'px');
      }
    }
  });
}

function attachHandlers() {
  document.querySelectorAll('.add-price-form').forEach(form => {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const productId = form.dataset.product;
      const input = form.querySelector('input');
      const price = parseFloat(input.value);
      if (isNaN(price)) return;

      const btn = form.querySelector('button');
      btn.disabled = true;
      try {
        const product = data.products.find(p => p.id === productId);
        if (!product) return;
        product.history.push({ id: uid(), price, date: new Date().toISOString() });
        await writeDataFile();
        await render();
        toast('Цена записана');
      } catch (err) {
        toast('Ошибка: ' + err.message, true);
      } finally {
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll('[data-delete-product]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.deleteProduct;
      const product = data.products.find(p => p.id === id);
      if (!product) return;
      if (!confirm(`Удалить товар "${product.name}" со всей историей и фото?`)) return;

      try {
        if (product.photo) await deletePhotoFile(product.photo);
        data.products = data.products.filter(p => p.id !== id);
        await writeDataFile();
        await render();
        toast('Товар удалён');
      } catch (err) {
        toast('Ошибка: ' + err.message, true);
      }
    });
  });

  document.querySelectorAll('.delete-price').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { product: pid, entry: eid } = btn.dataset;
      const product = data.products.find(p => p.id === pid);
      if (!product) return;
      if (product.history.length <= 1) {
        toast('Нельзя удалить последнюю запись', true);
        return;
      }
      try {
        product.history = product.history.filter(h => h.id !== eid);
        await writeDataFile();
        await render();
        toast('Запись удалена');
      } catch (err) {
        toast('Ошибка: ' + err.message, true);
      }
    });
  });

  document.querySelectorAll('[data-lightbox]').forEach(el => {
    el.addEventListener('click', () => openLightbox(el.dataset.lightbox));
  });

  // Обработчик кнопки "Показать все / Свернуть"
  document.querySelectorAll('[data-product-toggle]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const productEl = btn.closest('.product');
      const tableWrap = productEl.querySelector('.table-wrap');
      const isExpanded = btn.classList.contains('expanded');

      if (!tableWrap) return;

      if (isExpanded) {
        // Сворачиваем
        tableWrap.classList.add('is-collapsed');
        btn.classList.remove('expanded');
        btn.querySelector('span').textContent = btn.dataset.originalText;
      } else {
        // Разворачиваем
        tableWrap.classList.remove('is-collapsed');
        btn.classList.add('expanded');
        btn.dataset.originalText = btn.querySelector('span').textContent;
        btn.querySelector('span').textContent = 'Свернуть';
      }
    });
  });

  // Навешиваем обработчики на графики и табы
  document.querySelectorAll('.product').forEach(productEl => {
    const productId = productEl.querySelector('[data-delete-product]').dataset.deleteProduct;
    const product = data.products.find(p => p.id === productId);
    if (!product) return;
    
    const chartWrap = productEl.querySelector('.chart-wrap');
    if (chartWrap) attachChartHover(chartWrap);
    
    attachChartTabs(productEl, product);
  });
}

// ==================================================
// ПОИСК
// ==================================================
function initSearch() {
  const input = $('#search-input');
  const clearBtn = $('#search-clear');
  if (!input || !clearBtn) return;

  let debounceTimer;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      searchQuery = input.value.trim().toLowerCase();
      clearBtn.hidden = !searchQuery;
      render();
    }, 200);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    searchQuery = '';
    clearBtn.hidden = true;
    render();
  });
}

// ==================================================
// LIGHTBOX
// ==================================================
function openLightbox(src) {
  const lb = document.createElement('div');
  lb.className = 'lightbox show';
  lb.innerHTML = `<img src="${src}" alt="">`;
  lb.addEventListener('click', () => lb.remove());
  document.body.appendChild(lb);
}

// ==================================================
// СТАРТ
// ==================================================
(async function boot() {
  initThemeToggle();
  initViewToggle();
  initSearch();

  const folderBtn = $('#folder-btn');
  if (folderBtn) folderBtn.onclick = showSetupScreen;

  if (ghConfig && ghConfig.owner && ghConfig.repo && ghConfig.token) {
    await initApp();
  } else {
    showSetupScreen();
  }
})();