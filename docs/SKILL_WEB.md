# SKILL_WEB.md — Web Dashboard (Cloudflare Pages)

> Code mẫu đầy đủ cho web dashboard.
> Stack: Vanilla JS + Vite + Supabase JS client
> Deploy: Cloudflare Pages (tự động từ GitHub)

---

## Cấu trúc files

```
web/
├── public/
│   └── index.html       ← HTML shell, mount point cho JS
├── src/
│   ├── main.js          ← Entry point, khởi tạo + điều phối
│   ├── api.js           ← Tất cả gọi Supabase
│   ├── ui.js            ← Render HTML components
│   └── utils.js         ← Helpers: format tiền, ngày, tháng
└── package.json
```

---

## package.json

```json
{
  "name": "family-expense-dashboard",
  "private": true,
  "version": "1.0.0",
  "scripts": {
    "dev":   "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0"
  },
  "devDependencies": {
    "vite": "^5.0.0"
  }
}
```

---

## web/public/index.html

```html
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chi tiêu gia đình</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --c-bg:        #f8f8f6;
      --c-card:      #ffffff;
      --c-border:    #e8e6e0;
      --c-text:      #2c2c2a;
      --c-muted:     #888780;
      --c-accent:    #1D9E75;
      --c-red:       #d93025;
      --c-red-bg:    #fce8e6;
      --c-green-bg:  #e6f4ea;
      --radius:      12px;
      --shadow:      0 1px 3px rgba(0,0,0,0.08);
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --c-bg:     #1a1a18;
        --c-card:   #242422;
        --c-border: #3a3a38;
        --c-text:   #e8e6e0;
        --c-muted:  #888780;
      }
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--c-bg);
      color: var(--c-text);
      min-height: 100vh;
      padding: 0 0 40px;
    }

    header {
      background: var(--c-card);
      border-bottom: 1px solid var(--c-border);
      padding: 20px 20px 16px;
    }

    header h1 {
      font-size: 18px;
      font-weight: 600;
      letter-spacing: -0.3px;
    }

    header p {
      font-size: 13px;
      color: var(--c-muted);
      margin-top: 2px;
    }

    .container {
      max-width: 480px;
      margin: 0 auto;
      padding: 20px 16px 0;
    }

    .section-label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      color: var(--c-muted);
      margin: 24px 0 10px;
    }

    .card {
      background: var(--c-card);
      border: 1px solid var(--c-border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
    }

    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      border-bottom: 1px solid var(--c-border);
    }

    .row:last-child { border-bottom: none; }

    .row-label {
      font-size: 14px;
      color: var(--c-muted);
    }

    .row-value {
      font-size: 16px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }

    .row-value.surplus  { color: var(--c-accent); }
    .row-value.deficit  { color: var(--c-red); }
    .row-value.pending  { color: var(--c-muted); font-weight: 400; font-size: 14px; }

    .cumul-card {
      background: var(--c-accent);
      border-radius: var(--radius);
      padding: 20px 16px;
      color: #fff;
      box-shadow: var(--shadow);
    }

    .cumul-card .label {
      font-size: 12px;
      opacity: 0.8;
      margin-bottom: 4px;
    }

    .cumul-card .value {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.5px;
      font-variant-numeric: tabular-nums;
    }

    .history-table {
      width: 100%;
      border-collapse: collapse;
    }

    .history-table th {
      font-size: 11px;
      font-weight: 600;
      color: var(--c-muted);
      text-align: left;
      padding: 10px 16px 8px;
      border-bottom: 1px solid var(--c-border);
    }

    .history-table th:last-child { text-align: right; }

    .history-table td {
      font-size: 14px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--c-border);
      font-variant-numeric: tabular-nums;
    }

    .history-table tr:last-child td { border-bottom: none; }

    .history-table td:last-child {
      text-align: right;
      font-weight: 500;
    }

    .history-table .deficit { color: var(--c-red); }
    .history-table .surplus { color: var(--c-accent); }
    .history-table .deficit-row { background: var(--c-red-bg); }

    .skeleton {
      background: var(--c-border);
      border-radius: 6px;
      animation: pulse 1.4s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.4; }
    }

    .tag-incomplete {
      font-size: 11px;
      color: var(--c-muted);
      background: var(--c-bg);
      border: 1px solid var(--c-border);
      border-radius: 4px;
      padding: 2px 6px;
    }

    #app { display: none; }
    #loading { padding: 40px 16px; text-align: center; color: var(--c-muted); font-size: 14px; }
    #error   { padding: 40px 16px; text-align: center; color: var(--c-red);   font-size: 14px; display: none; }
  </style>
</head>
<body>
  <header>
    <h1>Chi tiêu gia đình</h1>
    <p id="updated-at">Đang tải...</p>
  </header>

  <div class="container">
    <div id="loading">Đang tải dữ liệu...</div>
    <div id="error">Không tải được dữ liệu. Thử lại sau.</div>
    <div id="app"></div>
  </div>

  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

---

## web/src/utils.js

```javascript
// Định dạng số tiền JPY: 200000 → "¥200,000"
export function formatMoney(amount) {
  if (amount === null || amount === undefined) return '—';
  const n = Math.round(Number(amount));
  return '¥' + Math.abs(n).toLocaleString('ja-JP');
}

// Tháng hiện tại theo JST: "2024-01"
export function getCurrentMonthJST() {
  const now = new Date();
  // JST = UTC+9
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y   = jst.getUTCFullYear();
  const m   = String(jst.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// "2024-01" → "Tháng 01/2024"
export function formatMonthDisplay(monthStr) {
  const [y, m] = monthStr.split('-');
  return `Tháng ${m}/${y}`;
}

// Timestamp → "15/01/2024 14:32"
export function formatTimestamp(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const dd  = String(jst.getUTCDate()).padStart(2, '0');
  const mm  = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const yy  = jst.getUTCFullYear();
  const hh  = String(jst.getUTCHours()).padStart(2, '0');
  const min = String(jst.getUTCMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${min}`;
}

// Kiểm tra tháng đã nhập đủ 3 khoản chưa
export function isComplete(row) {
  return row.luong > 0 && row.tien_an > 0 && row.tien_no > 0;
}
```

---

## web/src/api.js

```javascript
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY chưa được set');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Lấy tất cả tháng, sắp xếp mới nhất trước
export async function fetchAllMonths() {
  const { data, error } = await supabase
    .from('theo_doi')
    .select('*')
    .order('thang', { ascending: false });

  if (error) throw error;
  return data || [];
}

// Lấy 1 tháng cụ thể
export async function fetchMonth(monthStr) {
  const { data, error } = await supabase
    .from('theo_doi')
    .select('*')
    .eq('thang', monthStr)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
  return data || null;
}
```

---

## web/src/ui.js

```javascript
import { formatMoney, formatMonthDisplay, formatTimestamp, isComplete } from './utils.js';

// Render toàn bộ app vào #app
export function renderApp(rows, currentMonth) {
  const app = document.getElementById('app');
  app.style.display = 'block';
  document.getElementById('loading').style.display = 'none';

  const current = rows.find(r => r.thang === currentMonth) || null;
  const latest  = rows.find(r => r.tich_luy > 0) || rows[0] || null;

  app.innerHTML = `
    ${renderCurrentMonth(current, currentMonth)}
    ${renderCumulative(latest)}
    ${renderHistory(rows)}
  `;
}

// Card tháng hiện tại
function renderCurrentMonth(row, currentMonth) {
  const label = formatMonthDisplay(currentMonth);
  const complete = row && isComplete(row);

  const val = (amount, field) => {
    if (!row || row[field] === 0) {
      return `<span class="pending tag-incomplete">chưa nhập</span>`;
    }
    return `<span class="row-value">${formatMoney(amount)}</span>`;
  };

  const surplusVal = () => {
    if (!complete) return `<span class="pending tag-incomplete">—</span>`;
    const s = row.du_thang;
    const cls = s >= 0 ? 'surplus' : 'deficit';
    const sign = s >= 0 ? '+' : '';
    return `<span class="row-value ${cls}">${sign}${formatMoney(s)}</span>`;
  };

  return `
    <p class="section-label">${label}</p>
    <div class="card">
      <div class="row">
        <span class="row-label">Lương</span>
        ${val(row?.luong, 'luong')}
      </div>
      <div class="row">
        <span class="row-label">Tiền ăn</span>
        ${val(row?.tien_an, 'tien_an')}
      </div>
      <div class="row">
        <span class="row-label">Tiền nợ</span>
        ${val(row?.tien_no, 'tien_no')}
      </div>
      <div class="row">
        <span class="row-label" style="font-weight:500">Dư tháng này</span>
        ${surplusVal()}
      </div>
    </div>
  `;
}

// Card tổng tích lũy
function renderCumulative(latest) {
  const total = latest?.tich_luy || 0;
  const sign  = total >= 0 ? '+' : '';
  return `
    <p class="section-label">Tổng tích lũy</p>
    <div class="cumul-card">
      <div class="label">Tổng dư tất cả tháng</div>
      <div class="value">${sign}${formatMoney(total)}</div>
    </div>
  `;
}

// Bảng lịch sử các tháng
function renderHistory(rows) {
  if (!rows || rows.length === 0) {
    return `<p class="section-label">Chưa có dữ liệu</p>`;
  }

  const trs = rows.map(row => {
    const surplus   = row.du_thang;
    const complete  = isComplete(row);
    const sign      = surplus >= 0 ? '+' : '';
    const cls       = !complete ? '' : surplus >= 0 ? 'surplus' : 'deficit';
    const rowCls    = !complete ? '' : surplus < 0 ? 'deficit-row' : '';
    const surplusStr = complete
      ? `<span class="${cls}">${sign}${formatMoney(surplus)}</span>`
      : `<span class="tag-incomplete">chưa đủ</span>`;

    return `
      <tr class="${rowCls}">
        <td>${formatMonthDisplay(row.thang)}</td>
        <td>${complete ? formatMoney(row.luong) : '—'}</td>
        <td style="text-align:right">${surplusStr}</td>
      </tr>
    `;
  }).join('');

  return `
    <p class="section-label">Lịch sử các tháng</p>
    <div class="card" style="overflow:hidden">
      <table class="history-table">
        <thead>
          <tr>
            <th>Tháng</th>
            <th>Lương</th>
            <th>Dư</th>
          </tr>
        </thead>
        <tbody>${trs}</tbody>
      </table>
    </div>
  `;
}

export function showError(msg) {
  document.getElementById('loading').style.display = 'none';
  const errEl = document.getElementById('error');
  errEl.style.display = 'block';
  errEl.textContent = msg || 'Không tải được dữ liệu. Thử lại sau.';
}

export function updateTimestamp() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const hh  = String(jst.getUTCHours()).padStart(2, '0');
  const min = String(jst.getUTCMinutes()).padStart(2, '0');
  document.getElementById('updated-at').textContent =
    `Cập nhật lúc ${hh}:${min} JST`;
}
```

---

## web/src/main.js

```javascript
import { fetchAllMonths }         from './api.js';
import { renderApp, showError, updateTimestamp } from './ui.js';
import { getCurrentMonthJST }     from './utils.js';

async function init() {
  try {
    const rows         = await fetchAllMonths();
    const currentMonth = getCurrentMonthJST();
    renderApp(rows, currentMonth);
    updateTimestamp();
  } catch (err) {
    console.error('Lỗi tải dữ liệu:', err);
    showError('Không tải được dữ liệu. Kiểm tra kết nối mạng và thử lại.');
  }
}

init();
```

---

## Cloudflare Pages — cấu hình build

Trong Cloudflare Pages dashboard:

| Setting | Giá trị |
|---------|---------|
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `web` |
| Node.js version | 18 |

Environment variables (Production):
```
VITE_SUPABASE_URL      = https://[project].supabase.co
VITE_SUPABASE_ANON_KEY = [anon key]
```

---

## Checklist deploy web

```
[ ] schema.sql đã chạy lại — có policy "anon_read_only"
[ ] Cloudflare Pages account tạo xong
[ ] GitHub repo connect với Cloudflare Pages
[ ] Root directory = "web" đã set
[ ] VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY đã set
[ ] Build thành công (không có lỗi)
[ ] Mở URL deploy → thấy dashboard tải được dữ liệu
[ ] Test trên điện thoại (mobile-friendly)
[ ] Share link cho vợ
```
