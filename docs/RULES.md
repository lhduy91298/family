# RULES.md — Family Expense Bot (Cloudflare Stack)

> Áp dụng cho cả worker/ và web/.
> Jules đọc trước khi code bất kỳ file nào.

---

## Phần A — Worker (worker/src/*.ts)

### A-01 · TypeScript ES Modules — không CommonJS

```typescript
// ✅ ES modules
import { sendMessage }  from './telegram';
export async function handleWebhook(...) {}
export default { async fetch(...) {}, async scheduled(...) {} }

// ❌ CommonJS — Workers không hỗ trợ
const telegram = require('./telegram');
module.exports = { fetch: ... };
```

### A-02 · Env qua interface — không hardcode

```typescript
// ✅ Env interface + inject qua wrangler secrets
export interface Env {
  SUPABASE_URL: string;
  HUSBAND_ID:   string;
}
export default {
  async fetch(request: Request, env: Env) {
    const id = env.HUSBAND_ID;  // ✅
  }
}

// ❌
const HUSBAND_ID = '123456789';  // hardcode
```

### A-03 · Whitelist — chỉ chồng, check đầu tiên

```typescript
// ✅ Check ngay sau khi parse update
const userId = String(msg.from.id);
if (userId !== env.HUSBAND_ID) {
  console.log('[UNAUTHORIZED]', userId);
  return;
}
```

### A-04 · Supabase qua fetch thuần — không SDK

```typescript
// ✅ fetch API (Workers native)
const res = await fetch(`${env.SUPABASE_URL}/rest/v1/theo_doi?...`, {
  headers: { 'apikey': env.SUPABASE_SERVICE_KEY, ... }
});

// ❌ Không import @supabase/supabase-js trong worker
// (SDK dùng Node APIs không có trong Workers)
import { createClient } from '@supabase/supabase-js';  // ❌
```

### A-05 · Timezone JST = UTC+9, tính thủ công

```typescript
// ✅ Đáng tin cậy trong mọi runtime
const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
const y      = nowJST.getUTCFullYear();
const m      = String(nowJST.getUTCMonth() + 1).padStart(2, '0');

// ❌ Không ổn định trong Workers
new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo' }).format(new Date());
```

### A-06 · Flow bắt buộc: luong → an → no

```typescript
// handleFood phải check luong trước
if (!row || row.luong === 0) {
  await sendMessage(env, chatId, '⚠️ Chưa nhập lương...');
  return;
}

// handleDebt phải check tien_an trước
if (row.tien_an === 0) {
  await sendMessage(env, chatId, '⚠️ Chưa nhập tiền ăn...');
  return;
}
```

### A-07 · async/await bắt buộc — không blocking

```typescript
// ✅ Tất cả I/O phải await
const row  = await getMonthRow(env, month);
const rows = await getAllMonthRows(env);
await writeField(env, month, 'salary', amount);
await sendMessage(env, chatId, text);

// ❌ Không dùng blocking sync trong Workers runtime
```

### A-08 · console.log — không Logger

```typescript
// ✅ Workers dùng console.log (xem qua wrangler tail)
console.log('[SALARY] month:', month, 'amount:', amount);
console.error('[ERROR]', err);

// ❌ Không có Logger.log() — đó là GAS API
Logger.log('[SALARY] ...');
```

### A-09 · Trả về Response từ fetch handler

```typescript
// ✅ fetch() phải trả Response
export default {
  async fetch(request, env): Promise<Response> {
    // ...
    return new Response('OK');  // luôn return
  }
}

// ❌ Không return = runtime error
```

### A-10 · Supabase columns: tên tiếng Việt không dấu

```typescript
// ✅ Tên cột đúng theo schema
row.luong     // không phải row.salary
row.tien_an   // không phải row.food
row.tien_no   // không phải row.debt
row.du_thang  // không phải row.surplus
row.tich_luy  // không phải row.cumulative
row.thang     // không phải row.month
```

---

## Phần B — Web Dashboard (web/src/*.js)

### B-01 · Vanilla JS + Vite — không framework

```javascript
// ✅
import { createClient } from '@supabase/supabase-js';
export function renderApp(rows) { ... }

// ❌
import React from 'react';
```

### B-02 · Supabase SDK anon — chỉ SELECT

```javascript
// ✅ web dùng SDK + anon key
const supabase = createClient(url, ANON_KEY);
const { data } = await supabase.from('theo_doi').select('*');

// ❌ Web KHÔNG dùng service_role key
// ❌ Web KHÔNG gọi fetch Supabase trực tiếp với service_role
```

### B-03 · Env vars: import.meta.env.VITE_*

```javascript
// ✅
const url = import.meta.env.VITE_SUPABASE_URL;

// ❌
const url = process.env.SUPABASE_URL;   // Node — không chạy trong browser
const url = 'https://abc.supabase.co';  // hardcode
```

### B-04 · Timezone JST trong browser JS

```javascript
// ✅ Cùng pattern với worker
function getCurrentMonthJST() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y   = now.getUTCFullYear();
  const m   = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
```

### B-05 · CSS variables + dark mode bắt buộc

```css
:root { --c-bg: #f8f8f6; --c-text: #2c2c2a; }
@media (prefers-color-scheme: dark) {
  :root { --c-bg: #1a1a18; --c-text: #e8e6e0; }
}
body { background: var(--c-bg); color: var(--c-text); }
/* ❌ body { background: #f8f8f6; } — vỡ dark mode */
```

---

## Phần C — Chung

### C-01 · Ngôn ngữ bot: Tiếng Việt

```
'✅ Đã ghi lương...'   ✅
'Salary recorded'      ❌
```

### C-02 · Số tiền: ¥ prefix, dấu phẩy nghìn

```
formatMoney(200000) → '¥200,000'   ✅
'200,000đ'  ❌   '200k'  ❌
```

### C-03 · Tháng âm hiển thị màu đỏ, dương màu xanh

```css
.surplus { color: #1D9E75; }
.deficit { color: #d93025; }
```

### C-04 · Không commit secrets

```
.env, .env.local → vào .gitignore
Secrets worker → wrangler secret put
Env vars web   → Cloudflare Pages dashboard
```

### C-05 · 1 repo duy nhất, 2 thư mục

```
worker/ → Cloudflare Workers
web/    → Cloudflare Pages
```

Không tách thành 2 repo riêng.
