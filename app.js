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
function formatPrice(p) {
  return Number(p).toLocaleString('ru-RU', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  }) + ' ₽';
}
function formatPriceShort(p) {
  return Number(p).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽';
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

let toastTimer;
function toast(msg, isError = false) {
  const el = $('#toast');
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
  const current = prices[prices.length - 1];
  
  const sortedPrices = [...prices].sort((a, b) => a - b);
  const median = sortedPrices[Math.floor(sortedPrices.length / 2)];
  
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
    const sumXY = xs.reduce((s, x, i) => s + x * win[i], 0);
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
      forecastText = `Прогноз на 3 шага: ${formatPriceShort(nextPrice)}`;
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

  if (color === 'neutral' && trend === 'down' && !isCurrentAnomaly) advice = 'Цена падает — стоит подождать.';
  if (color === 'good' && trend === 'up') advice = 'Цена растёт — лучше брать сейчас.';

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

const chartFilters = {}; 
const FILTER_OPTIONS = [
  { label: '7д', days: 7 },
  { label: '1м', days: 30 },
  { label: '3м', days: 90 },
  { label: 'Всё', days: 0 }
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
reader.onloadend = () => resolve(reader.result.split(',')[1]);
reader.onerror = reject;
reader.readAsDataURL(blob);
});
}
async function ghRequest(path, options = {}) {
const url = https://github.com{ghConfig.owner}/${ghConfig.repo}/contents/${path};
const res = await fetch(url, {
...options,
headers: {
'Authorization': Bearer ${ghConfig.token},
'Accept': 'application/vnd.github+json',
'X-GitHub-Api-Version': '2022-11-28',
...(options.headers || {})
}
});
if (!res.ok) {
if (res.status === 404) return null;
const errData = await res.json().catch(() => ({}));
throw new Error(errData.message || Ошибка GitHub (${res.status}));
}
return res.json();
}
async function readDataFile() {
const fileData = await ghRequest(${DATA_FILE}?t=${Date.now()});
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
const filename = photos/photo-${Date.now()}-${uid()}.jpg;
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
const url = https://githubusercontent.com{ghConfig.owner}/${ghConfig.repo}/main/${filename};
photoUrlCache.set(filename, url);
return url;
}
// ==================================================
// НАСТРОЙКА ПОДКЛЮЧЕНИЯ К GITHUB
// ==================================================
function showSetupScreen() {
$('#app-screen').style.display = 'none';
const setup = $('#setup-screen');
setup.style.display = 'flex';
setup.innerHTML = `

☁️
Подключение к GitHub
Укажите данные вашего репозитория, чтобы синхронизировать цены между устройствами.

Ваш логин GitHub
Название репозитория
Personal Access Token
Сохранить и подключить


`;
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
$('#setup-screen').style.display = 'none';
$('#app-screen').style.display = 'block';
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
const PLACEHOLDER_IMG =  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"> <rect x="3" y="3" width="18" height="18" rx="3"/> <circle cx="9" cy="9" r="2"/> <path d="M21 15l-5-5L5 21"/> </svg> <span>Загрузить</span>;
photoInput.addEventListener('change', e => {
const file = e.target.files[0];
if (!file) return;
pendingPhotoFile = file;
const reader = new FileReader();
reader.onload = ev => {
photoPreview.innerHTML = <img src="${ev.target.result}" alt="preview">;
photoRemove.hidden = false;
};
reader.readAsDataURL(file);
e.target.value = '';
});
photoRemove.addEventListener('click', e => {
e.preventDefault();
e.stopPropagation();
resetPhotoPicker();
});
function resetPhotoPicker() {
pendingPhotoFile = null;
photoPreview.innerHTML = PLACEHOLDER_IMG;
photoRemove.hidden = true;
}
// ==================================================
// ДОБАВЛЕНИЕ ТОВАРА
// ==================================================
$('#product-form').addEventListener('submit', async e => {
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
// ==================================================
// ГРАФИК
// ==================================================
function buildChart(hist, productId, activeFilter = 0) {
if (hist.length < 2) {
return  <div class="chart-wrap chart-empty"> <div class="chart-hint">Запишите цены хотя бы дважды — появится график</div> </div>;
}
let filteredHist = [...hist];
if (activeFilter > 0) {
const cutoff = Date.now() - activeFilter * 24 * 60 * 60 * 1000;
filteredHist = hist.filter(h => new Date(h.date).getTime() >= cutoff);
if (filteredHist.length < 2) filteredHist = [...hist];
}
const prices = filteredHist.map(h => h.price);
const W = 100, H = 40, PAD_Y = 4;
const min = Math.min(...prices);
const max = Math.max(...prices);
const range = max - min || 1;
const pts = prices.map((p, i) => {
const x = (i / (prices.length - 1)) * W;
const y = H - PAD_Y - ((p - min) / range) * (H - PAD_Y * 2);
return [x, y];
});
let linePath = M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)};
for (let i = 0; i < pts.length - 1; i++) {
const p0 = pts[i];
const p1 = pts[i + 1];
const cx = (p0[0] + p1[0]) / 2;
linePath +=  C${cx.toFixed(2)},${p0[1].toFixed(2)} ${cx.toFixed(2)},${p1[1].toFixed(2)} ${p1[0].toFixed(2)},${p1[1].toFixed(2)};
}
const areaPath = linePath +  L${W},${H} L0,${H} Z;
const gid = 'g-' + Math.random().toString(36).slice(2, 8);
const aid = 'a-' + gid;
const hoverZones = filteredHist.map((h, i) => {
const x = (i / (filteredHist.length - 1)) * W;
const zoneW = W / (filteredHist.length - 1);
return <rect class="chart-hover-zone"  data-x="${x}" data-y="${pts[i][1]}"  data-price="${h.price}" data-date="${h.date}"  x="${x - zoneW/2}" y="0" width="${zoneW}" height="${H}" />;
}).join('');
const tabsHtml = FILTER_OPTIONS.map(opt => <button class="chart-tab ${activeFilter === opt.days ? 'active' : ''}"  data-product-id="${productId}"  data-days="${opt.days}"> ${opt.label} </button>).join('');
return `

${tabsHtml}
${hoverZones}

${formatPriceShort(max)}
${formatPriceShort(min)}


${formatDate(filteredHist[0].date)}
${formatDate(filteredHist[filteredHist.length - 1].date)}

`;
}
// ==================================================
// РЕНДЕР
// ==================================================
async function render() {
const container = $('#products');
if (!data.products || data.products.length === 0) {
container.innerHTML =  <div class="empty glass-panel"> <div class="empty-icon">📈</div> <p>Пока нет ни одного товара.<br>Добавьте первый, чтобы начать отслеживать цены.</p> </div>;
return;
}
const photoUrls = new Map();
for (const p of data.products) {
if (p.photo) {
const url = await getPhotoURL(p.photo);
if (url) photoUrls.set(p.id, url);
}
}
container.innerHTML = data.products.map(p => renderProduct(p, photoUrls.get(p.id))).join('');
attachHandlers();
attachTooltips();
}
function renderProduct(product, photoURL) {
const hist = [...product.history].sort((a, b) => new Date(a.date) - new Date(b.date));
const current = hist[hist.length - 1].price;
const first = hist[0].price;
const maxPrice = Math.max(...hist.map(h => h.price));
const minPrice = Math.min(...hist.map(h => h.price));
const analysis = analyzePrices(hist);
const diff = current - first;
const diffPercent = first ? ((diff / first) * 100).toFixed(1) : '0.0';
const diffClass = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
const diffSign = diff > 0 ? '+' : '';
const activeFilter = chartFilters[product.id] || 0;
const chart = buildChart(hist, product.id, activeFilter);
const thumb = photoURL
? <div class="product-thumb" data-lightbox="${photoURL}" data-tooltip="Нажмите, чтобы увеличить"> <img src="${photoURL}" alt=""> <div class="thumb-overlay">Открыть</div> </div>
: <div class="product-thumb"> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"> <rect x="3" y="3" width="18" height="18" rx="3"/> <circle cx="9" cy="9" r="2"/> <path d="M21 15l-5-5L5 21"/> </svg> </div>;
const rows = [...hist].reverse().map(h => `
${formatDate(h.date)}
${formatPrice(h.price)}`).join('');
const diffIcon = diff > 0
? ''
: diff < 0
? ''
: '';
const forecastBadge = analysis && analysis.forecastText
? <div class="forecast-badge">🔮 ${analysis.forecastText}</div>
: '';
return <article class="product glass-panel"> <div class="product-header"> <div class="product-head-inner"> ${thumb} <div class="product-title-wrap"> <div class="product-title">${escapeHtml(product.name)}</div> <div class="badges-row"> <div class="product-badge ${diffClass}" data-tooltip="Изменение от первой до текущей цены"> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;"> ${diffIcon} </svg> ${diffSign}${formatPriceShort(diff)} · ${diffSign}${diffPercent}% </div> ${analysis ?

${adviceIcon(analysis.color)}
${escapeHtml(analysis.verdict)}

` : ''}









Текущая
${formatPrice(current)}


Минимум
${formatPrice(minPrice)}


Средняя
${formatPrice(analysis ? analysis.avg : first)}


Максимум
${formatPrice(maxPrice)}


Тренд
${trendLabel(analysis)}

${forecastBadge}
${chart}
Записать

${rows}

Дата и время	Цена	

`;
}
// ==================================================
// ОБРАБОТЧИКИ
// ==================================================
function attachChartHover(wrap) {
const svg = wrap.querySelector('svg');
const tooltip = wrap.querySelector('.chart-tooltip');
const interaction = wrap.querySelector('.chart-interaction');
const hoverLine = wrap.querySelector('.chart-hover-line');
const hoverDot = wrap.querySelector('.chart-hover-dot');
const ttPrice = wrap.querySelector('.tt-price');
const ttDate = wrap.querySelector('.tt-date');
if (!svg || !tooltip) return;
const zones = wrap.querySelectorAll('.chart-hover-zone');
zones.forEach(zone => {
zone.addEventListener('mouseenter', () => {
interaction.style.display = 'block';
tooltip.style.display = 'flex';
const x = parseFloat(zone.dataset.x);
const y = parseFloat(zone.dataset.y);
const price = parseFloat(zone.dataset.price);
const date = zone.dataset.date;
hoverLine.setAttribute('x1', x);
hoverLine.setAttribute('x2', x);
hoverDot.setAttribute('cx', x);
hoverDot.setAttribute('cy', y);
ttPrice.textContent = formatPrice(price);
ttDate.textContent = formatDate(date);
tooltip.style.left = ${x}%;
const topPercent = (y / 40) * 100;
tooltip.style.top = ${topPercent}%;
});
});
svg.addEventListener('mouseleave', () => {
interaction.style.display = 'none';
tooltip.style.display = 'none';
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
if (!confirm(Удалить товар "${product.name}" со всей историей и фото?)) return;
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
document.querySelectorAll('.chart-wrap').forEach(wrap => attachChartHover(wrap));
document.querySelectorAll('.chart-tab').forEach(btn => {
btn.addEventListener('click', (e) => {
e.preventDefault();
const productId = btn.dataset.productId;
const days = parseInt(btn.dataset.days);
chartFilters[productId] = days;
const product = data.products.find(p => p.id === productId);
if (!product) return;
const productEl = btn.closest('.product');
const chartWrap = productEl.querySelector('.chart-wrap');
const hist = [...product.history].sort((a, b) => new Date(a.date) - new Date(b.date));
const newChartHtml = buildChart(hist, product.id, days);
const tempDiv = document.createElement('div');
tempDiv.innerHTML = newChartHtml;
const newChartEl = tempDiv.firstElementChild;
chartWrap.replaceWith(newChartEl);
attachChartHover(newChartEl);
});
});
}
// ==================================================
// LIGHTBOX
// ==================================================
function openLightbox(src) {
const lb = document.createElement('div');
lb.className = 'lightbox show';
lb.innerHTML = <img src="${src}" alt="">;
lb.addEventListener('click', () => lb.remove());
document.body.appendChild(lb);
}
// ==================================================
// СТАРТ
// ==================================================
(async function boot() {
initThemeToggle();
initViewToggle();
const folderBtn = $('#folder-btn');
if (folderBtn) folderBtn.onclick = showSetupScreen;
if (ghConfig && ghConfig.owner && ghConfig.repo && ghConfig.token) {
await initApp();
} else {
showSetupScreen();
}
})();