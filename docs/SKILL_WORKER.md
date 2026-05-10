# SKILL_WORKER.md — Cloudflare Worker (Bot + Cron)

> Code mẫu đầy đủ. TypeScript. Deploy qua `wrangler deploy`.
> Tương đương toàn bộ GAS cũ: webhook handler + 2 cron jobs.

---

## worker/package.json

```json
{
  "name": "family-expense-bot-worker",
  "private": true,
  "version": "1.0.0",
  "scripts": {
    "dev":    "wrangler dev",
    "deploy": "wrangler deploy",
    "tail":   "wrangler tail"
  },
  "dependencies": {},
  "devDependencies": {
    "wrangler":              "^3.0.0",
    "@cloudflare/workers-types": "^4.0.0",
    "typescript":            "^5.0.0"
  }
}
```

---

## worker/tsconfig.json

```json
{
  "compilerOptions": {
    "target":      "ES2022",
    "module":      "ES2022",
    "moduleResolution": "bundler",
    "lib":         ["ES2022"],
    "types":       ["@cloudflare/workers-types"],
    "strict":      true,
    "noEmit":      true
  },
  "include": ["src/**/*.ts"]
}
```

---

## worker/wrangler.toml

```toml
name            = "family-expense-bot"
main            = "src/index.ts"
compatibility_date = "2024-01-01"

[triggers]
crons = [
  "0 5 * * *",   # 05:00 UTC = 14:00 JST — nhắc lương mỗi ngày
  "0 0 1 * *"    # 00:00 UTC ngày 1 = 09:00 JST — tổng kết tháng
]

# Secrets được set bằng: wrangler secret put SUPABASE_URL
# Không đặt secrets trong file này
```

---

## worker/src/index.ts — Entry Point

```typescript
import { handleWebhook }       from './bot';
import { dailySalaryCheck,
         sendMonthlyReport }   from './cron';

export interface Env {
  SUPABASE_URL:         string;
  SUPABASE_SERVICE_KEY: string;
  TELEGRAM_BOT_TOKEN:   string;
  HUSBAND_ID:           string;
  HUSBAND_NAME?:        string;
  MONTHLY_FOOD_BUDGET?: string;
  MONTHLY_DEBT?:        string;
}

export default {
  // Nhận webhook từ Telegram
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Family Expense Bot is running.', { status: 200 });
    }
    try {
      await handleWebhook(request, env);
    } catch (err) {
      console.error('[fetch ERROR]', err);
    }
    return new Response('OK');
  },

  // Cron triggers
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    const cron = event.cron;
    console.log('[CRON]', cron);

    if (cron === '0 5 * * *') {
      await dailySalaryCheck(env);       // 14:00 JST mỗi ngày
    } else if (cron === '0 0 1 * *') {
      await sendMonthlyReport(env);      // 09:00 JST ngày 1
    }
  },
};
```

---

## worker/src/parser.ts — Parse Số Tiền JPY

```typescript
// Parse chuỗi → số yên nguyên. Trả về null nếu không hợp lệ.
// Nhận: 500 | 500円 | 1万 | 1万円 | 1.5万 | 20万 | 1,500 | ¥3000
export function parseAmount(text: string): number | null {
  const clean = text.trim().replace(/^¥\s*/, '').replace(/,/g, '');

  const manMatch = clean.match(/^([0-9]+(?:\.[0-9]+)?)\s*万\s*円?$/);
  if (manMatch) return Math.round(parseFloat(manMatch[1]) * 10000);

  const yenMatch = clean.match(/^([0-9]+(?:\.[0-9]+)?)\s*円$/);
  if (yenMatch) return Math.round(parseFloat(yenMatch[1]));

  const numMatch = clean.match(/^([0-9]+(?:\.[0-9]+)?)$/);
  if (numMatch) {
    const n = parseFloat(numMatch[1]);
    return isNaN(n) || n <= 0 ? null : Math.round(n);
  }
  return null;
}

// Lấy số tiền từ chuỗi lệnh: "/luong 20万" → 200000
export function parseAmountFromCommand(text: string): number | null {
  const parts = text.trim().split(/\s+/);
  return parts.length >= 2 ? parseAmount(parts[1]) : null;
}

// 10000 → "¥10,000"
export function formatMoney(amount: number): string {
  return '¥' + Math.round(Math.abs(amount)).toLocaleString('en-US');
}

// 200000 → "20万" | 500 → "500円"
export function formatMoneyRaw(amount: number): string {
  if (amount >= 10000) return (amount / 10000) + '万';
  return amount + '円';
}

// Tháng hiện tại JST: "2024-01"
export function getCurrentMonthJST(): string {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y   = now.getUTCFullYear();
  const m   = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// Tháng trước JST: "2023-12"
export function getLastMonthJST(): string {
  const now  = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const d    = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const y    = d.getUTCFullYear();
  const m    = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// "2024-01" → "tháng 01/2024"
export function formatMonthDisplay(monthStr: string): string {
  const [y, m] = monthStr.split('-');
  return `tháng ${m}/${y}`;
}

// Timestamp ISO → "dd/MM/yyyy HH:mm" JST
export function formatTimestampJST(ts: string): string {
  const d = new Date(new Date(ts).getTime() + 9 * 60 * 60 * 1000);
  const dd  = String(d.getUTCDate()).padStart(2, '0');
  const mm  = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yy  = d.getUTCFullYear();
  const hh  = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${min}`;
}

// Tính ngày nhắc lương thực tế.
// Ngày 15 là T7 hoặc CN → dời về thứ 6 ngày 13.
export function getSalaryReminderDay(year: number, month: number): Date {
  // month: 1-indexed. Tạo Date trong UTC+9 context
  const day15 = new Date(Date.UTC(year, month - 1, 15) - 9 * 60 * 60 * 1000);
  const jst15 = new Date(day15.getTime() + 9 * 60 * 60 * 1000);
  const dow   = jst15.getUTCDay(); // 0=CN, 6=T7
  if (dow === 6 || dow === 0) {
    return new Date(Date.UTC(year, month - 1, 13) - 9 * 60 * 60 * 1000);
  }
  return day15;
}

// Hôm nay (JST) có phải ngày nhắc lương không?
export function isTodaySalaryReminderDay(): boolean {
  const nowJST   = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y        = nowJST.getUTCFullYear();
  const m        = nowJST.getUTCMonth() + 1;
  const todayDay = nowJST.getUTCDate();

  const remDay = getSalaryReminderDay(y, m);
  const remJST = new Date(remDay.getTime() + 9 * 60 * 60 * 1000);
  return todayDay === remJST.getUTCDate();
}
```

---

## worker/src/supabase.ts — Tất cả thao tác DB

```typescript
import { Env } from './index';

interface MonthRow {
  thang:          string;
  ngay_luong:     string | null;
  luong:          number;
  tien_an:        number;
  tien_no:        number;
  du_thang:       number;
  tich_luy:       number;
  nhap_luong_luc: string | null;
  nhap_an_luc:    string | null;
  nhap_no_luc:    string | null;
}

function headers(env: Env) {
  return {
    'apikey':        env.SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type':  'application/json',
    'Prefer':        'return=representation',
  };
}

async function supabaseGet(env: Env, path: string): Promise<any[] | null> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    headers: headers(env),
  });
  if (!res.ok) {
    console.error('[SUPA GET]', res.status, await res.text());
    return null;
  }
  return res.json();
}

async function supabasePost(env: Env, path: string, body: object, prefer?: string): Promise<any[] | null> {
  const h = { ...headers(env) };
  if (prefer) h['Prefer'] = prefer;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    method:  'POST',
    headers: h,
    body:    JSON.stringify(body),
  });
  if (!res.ok && res.status !== 201) {
    console.error('[SUPA POST]', res.status, await res.text());
    return null;
  }
  return res.json();
}

async function supabasePatch(env: Env, path: string, body: object): Promise<any[] | null> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    method:  'PATCH',
    headers: headers(env),
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    console.error('[SUPA PATCH]', res.status, await res.text());
    return null;
  }
  return res.json();
}

// Đọc row của tháng
export async function getMonthRow(env: Env, month: string): Promise<MonthRow | null> {
  const rows = await supabaseGet(env, `/theo_doi?thang=eq.${month}&limit=1`);
  return (rows && rows.length > 0) ? rows[0] as MonthRow : null;
}

// Lấy tất cả tháng có lương > 0, sort tăng dần
export async function getAllMonthRows(env: Env): Promise<MonthRow[]> {
  const rows = await supabaseGet(env, '/theo_doi?luong=gt.0&select=*&order=thang.asc');
  return (rows || []) as MonthRow[];
}

// Ghi 1 field cho tháng (upsert)
export async function writeField(
  env: Env, month: string,
  field: 'salary' | 'food' | 'debt',
  value: number,
  reminderDay?: string
): Promise<void> {
  const colMap = { salary: 'luong',   food: 'tien_an',  debt: 'tien_no'  } as const;
  const atMap  = { salary: 'nhap_luong_luc', food: 'nhap_an_luc', debt: 'nhap_no_luc' } as const;

  const nowISO = new Date().toISOString();
  const body: Record<string, any> = {
    thang:          month,
    [colMap[field]]: value,
    [atMap[field]]:  nowISO,
  };
  if (reminderDay) body.ngay_luong = reminderDay;

  await supabasePost(env, '/theo_doi', body, 'resolution=merge-duplicates,return=representation');
  console.log(`[WRITE] month:${month} field:${field} value:${value}`);
}

// Ghi du_thang + tich_luy sau khi đủ 3 khoản
export async function writeSurplus(env: Env, month: string, surplus: number, cumulative: number): Promise<void> {
  await supabasePatch(env, `/theo_doi?thang=eq.${month}`, {
    du_thang: surplus,
    tich_luy: cumulative,
  });
  console.log(`[SURPLUS] month:${month} surplus:${surplus} cumul:${cumulative}`);
}

// Tính tổng tích lũy = Σ du_thang tháng cũ hơn + surplus tháng này
export async function calcCumulativeSurplus(env: Env, currentMonth: string, currentSurplus: number): Promise<number> {
  const rows = await supabaseGet(env, `/theo_doi?thang=lt.${currentMonth}&select=du_thang`);
  if (!rows) return currentSurplus;
  const prev = rows.reduce((sum: number, r: any) => sum + (r.du_thang || 0), 0);
  return prev + currentSurplus;
}

// Tạo chuỗi báo cáo tháng
export function buildMonthReport(
  month: string, salary: number, food: number,
  debt: number, surplus: number, cumulative: number
): string {
  const { formatMoney, formatMonthDisplay } = require('./parser');
  const sign = surplus >= 0 ? '+' : '';
  return (
    `📊 BÁO CÁO ${formatMonthDisplay(month).toUpperCase()}\n\n` +
    `💴 Lương:    +${formatMoney(salary)}\n` +
    `🍱 Tiền ăn:  -${formatMoney(food)}\n` +
    `💳 Tiền nợ:  -${formatMoney(debt)}\n` +
    `─────────────────\n` +
    (surplus >= 0
      ? `💰 Dư tháng này:  +${formatMoney(surplus)}\n`
      : `⚠️ Âm tháng này:  -${formatMoney(Math.abs(surplus))}\n`) +
    `💎 Tổng tích lũy: +${formatMoney(cumulative)}`
  );
}
```

> **Lưu ý**: `buildMonthReport` dùng import từ `parser.ts`. Thực tế khi code, Jules nên import trực tiếp thay vì dùng `require()`. Đây chỉ là mô tả logic — SKILL_WORKER.md là tài liệu tham khảo, code thực tế Jules sẽ viết đúng ES module syntax.

---

## worker/src/telegram.ts — Gửi tin nhắn

```typescript
import { Env } from './index';

export async function sendMessage(env: Env, chatId: string | number, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    console.error('[sendMessage ERROR]', res.status, await res.text());
  }
}
```

---

## worker/src/bot.ts — Xử lý lệnh Telegram

```typescript
import { Env }              from './index';
import { sendMessage }      from './telegram';
import {
  getMonthRow, getAllMonthRows,
  writeField, writeSurplus,
  calcCumulativeSurplus, buildMonthReport,
} from './supabase';
import {
  parseAmount, parseAmountFromCommand,
  formatMoney, formatMoneyRaw,
  getCurrentMonthJST, formatMonthDisplay,
  getSalaryReminderDay,
} from './parser';

export async function handleWebhook(request: Request, env: Env): Promise<void> {
  const update = await request.json() as any;
  if (!update?.message?.text) return;

  const msg    = update.message;
  const userId = String(msg.from.id);
  const chatId = msg.chat.id;
  const text   = msg.text.trim() as string;

  // Whitelist — chỉ chồng
  if (userId !== env.HUSBAND_ID) {
    console.log('[UNAUTHORIZED]', userId);
    return;
  }

  const userName = env.HUSBAND_NAME || 'Chong';
  await routeCommand(env, chatId, userName, text);
}

async function routeCommand(env: Env, chatId: number, userName: string, text: string): Promise<void> {
  const lower = text.toLowerCase().trim();

  if (lower.startsWith('/luong ') || lower.startsWith('/lương ')) {
    await handleSalary(env, chatId, userName, text);
  } else if (lower.startsWith('/an ') || lower.startsWith('/ăn ')) {
    await handleFood(env, chatId, userName, text);
  } else if (lower.startsWith('/no ') || lower.startsWith('/nợ ')) {
    await handleDebt(env, chatId, userName, text);
  } else if (lower === '/tháng' || lower === '/thang') {
    await handleMonthReport(env, chatId, getCurrentMonthJST());
  } else if (lower.startsWith('/tháng ') || lower.startsWith('/thang ')) {
    const parts = text.trim().split(/\s+/);
    const m = (parts[1] && /^\d{4}-\d{2}$/.test(parts[1])) ? parts[1] : getCurrentMonthJST();
    await handleMonthReport(env, chatId, m);
  } else if (lower === '/tích lũy' || lower === '/tich luy' || lower === '/tichluy') {
    await handleCumulative(env, chatId);
  } else if (lower.startsWith('/sửa ') || lower.startsWith('/sua ')) {
    await handleEdit(env, chatId, userName, text);
  } else if (lower === '/giúp đỡ' || lower === '/giupdo' || lower === '/start' || lower === '/help') {
    await handleHelp(env, chatId);
  } else {
    await sendMessage(env, chatId, '❓ Không hiểu lệnh này.\nGõ /giúp đỡ để xem hướng dẫn.');
  }
}

// ── /luong ──────────────────────────────────────────────────

async function handleSalary(env: Env, chatId: number, userName: string, text: string): Promise<void> {
  const amount = parseAmountFromCommand(text);
  if (!amount) {
    await sendMessage(env, chatId, '❌ Không hiểu số tiền.\nVí dụ: /luong 20万');
    return;
  }
  const month = getCurrentMonthJST();
  const row   = await getMonthRow(env, month);
  if (row && row.luong > 0) {
    await sendMessage(env, chatId,
      `⚠️ ${formatMonthDisplay(month)} đã có lương: ${formatMoney(row.luong)}\n` +
      `Dùng /sửa luong ${formatMoneyRaw(amount)} nếu muốn sửa lại.`
    );
    return;
  }

  // Tính ngày nhắc để điền ngay_luong
  const [y, m] = month.split('-').map(Number);
  const remDate = getSalaryReminderDay(y, m);
  const remISO  = new Date(remDate.getTime() + 9*60*60*1000).toISOString().substring(0, 10);

  await writeField(env, month, 'salary', amount, remISO);
  console.log(`[SALARY] ${month} amount:${amount} by:${userName}`);

  const defaultFood = parseFloat(env.MONTHLY_FOOD_BUDGET || '0') || 0;
  let reply = `✅ Đã ghi lương ${formatMonthDisplay(month)}\n💴 Lương: +${formatMoney(amount)}\n\n`;
  reply    += `🍱 Tiếp theo — Nhập tiền ăn:\n/an ${defaultFood > 0 ? formatMoneyRaw(defaultFood) : '5万'}`;
  if (defaultFood > 0) reply += `\n(mặc định: ${formatMoney(defaultFood)})`;
  await sendMessage(env, chatId, reply);
}

// ── /an ─────────────────────────────────────────────────────

async function handleFood(env: Env, chatId: number, userName: string, text: string): Promise<void> {
  const amount = parseAmountFromCommand(text);
  if (!amount) {
    await sendMessage(env, chatId, '❌ Không hiểu số tiền.\nVí dụ: /an 5万');
    return;
  }
  const month = getCurrentMonthJST();
  const row   = await getMonthRow(env, month);
  if (!row || row.luong === 0) {
    await sendMessage(env, chatId, '⚠️ Chưa nhập lương tháng này.\nNhập trước: /luong [số tiền]');
    return;
  }
  if (row.tien_an > 0) {
    await sendMessage(env, chatId,
      `⚠️ Đã ghi tiền ăn: ${formatMoney(row.tien_an)}\n` +
      `Dùng /sửa an ${formatMoneyRaw(amount)} nếu muốn sửa lại.`
    );
    return;
  }
  await writeField(env, month, 'food', amount);
  console.log(`[FOOD] ${month} amount:${amount} by:${userName}`);

  const defaultDebt = parseFloat(env.MONTHLY_DEBT || '0') || 0;
  let reply = `✅ Đã ghi tiền ăn ${formatMonthDisplay(month)}\n🍱 Tiền ăn: -${formatMoney(amount)}\n\n`;
  reply    += `💳 Tiếp theo — Nhập tiền trả nợ:\n/no ${defaultDebt > 0 ? formatMoneyRaw(defaultDebt) : '3万'}`;
  if (defaultDebt > 0) reply += `\n(mặc định: ${formatMoney(defaultDebt)})`;
  await sendMessage(env, chatId, reply);
}

// ── /no ─────────────────────────────────────────────────────

async function handleDebt(env: Env, chatId: number, userName: string, text: string): Promise<void> {
  const amount = parseAmountFromCommand(text);
  if (!amount) {
    await sendMessage(env, chatId, '❌ Không hiểu số tiền.\nVí dụ: /no 3万');
    return;
  }
  const month = getCurrentMonthJST();
  const row   = await getMonthRow(env, month);
  if (!row || row.luong === 0) {
    await sendMessage(env, chatId, '⚠️ Chưa nhập lương tháng này.\nNhập trước: /luong [số tiền]');
    return;
  }
  if (row.tien_an === 0) {
    await sendMessage(env, chatId, '⚠️ Chưa nhập tiền ăn tháng này.\nNhập trước: /an [số tiền]');
    return;
  }
  if (row.tien_no > 0) {
    await sendMessage(env, chatId,
      `⚠️ Đã ghi tiền nợ: ${formatMoney(row.tien_no)}\n` +
      `Dùng /sửa no ${formatMoneyRaw(amount)} nếu muốn sửa lại.`
    );
    return;
  }
  await writeField(env, month, 'debt', amount);
  console.log(`[DEBT] ${month} amount:${amount} by:${userName}`);

  const updated = await getMonthRow(env, month);
  if (!updated) return;
  const surplus = updated.luong - updated.tien_an - updated.tien_no;
  const cumul   = await calcCumulativeSurplus(env, month, surplus);
  await writeSurplus(env, month, surplus, cumul);
  await sendMessage(env, chatId, buildMonthReport(month, updated.luong, updated.tien_an, updated.tien_no, surplus, cumul));
}

// ── /sửa ────────────────────────────────────────────────────

async function handleEdit(env: Env, chatId: number, userName: string, text: string): Promise<void> {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 3) {
    await sendMessage(env, chatId, '❌ Cú pháp:\n/sửa luong 21万\n/sửa an 6万\n/sửa no 4万');
    return;
  }
  const field  = parts[1].toLowerCase();
  const amount = parseAmount(parts[2]);
  if (!amount) {
    await sendMessage(env, chatId, '❌ Số tiền không hợp lệ.');
    return;
  }
  const month = getCurrentMonthJST();
  let fieldName = '';

  if (field === 'luong' || field === 'lương') {
    await writeField(env, month, 'salary', amount); fieldName = 'Lương';
  } else if (field === 'an' || field === 'ăn') {
    await writeField(env, month, 'food', amount);   fieldName = 'Tiền ăn';
  } else if (field === 'no' || field === 'nợ') {
    await writeField(env, month, 'debt', amount);   fieldName = 'Tiền nợ';
  } else {
    await sendMessage(env, chatId, '❌ Chỉ sửa được: luong, an, no');
    return;
  }
  console.log(`[EDIT] ${month} field:${field} amount:${amount} by:${userName}`);

  const updated = await getMonthRow(env, month);
  if (updated && updated.luong > 0 && updated.tien_an > 0 && updated.tien_no > 0) {
    const surplus = updated.luong - updated.tien_an - updated.tien_no;
    const cumul   = await calcCumulativeSurplus(env, month, surplus);
    await writeSurplus(env, month, surplus, cumul);
    await sendMessage(env, chatId,
      `✅ Đã sửa ${fieldName} → ${formatMoney(amount)}\n\n` +
      buildMonthReport(month, updated.luong, updated.tien_an, updated.tien_no, surplus, cumul)
    );
  } else {
    await sendMessage(env, chatId, `✅ Đã sửa ${fieldName} → ${formatMoney(amount)}`);
  }
}

// ── /tháng ──────────────────────────────────────────────────

async function handleMonthReport(env: Env, chatId: number, month: string): Promise<void> {
  const row = await getMonthRow(env, month);
  if (!row || row.luong === 0) {
    await sendMessage(env, chatId, `📊 ${formatMonthDisplay(month)} chưa có dữ liệu.`);
    return;
  }
  const surplus = row.luong - row.tien_an - row.tien_no;
  const cumul   = row.tich_luy || await calcCumulativeSurplus(env, month, surplus);
  await sendMessage(env, chatId, buildMonthReport(month, row.luong, row.tien_an, row.tien_no, surplus, cumul));
}

// ── /tích lũy ───────────────────────────────────────────────

async function handleCumulative(env: Env, chatId: number): Promise<void> {
  const rows = await getAllMonthRows(env);
  if (rows.length === 0) {
    await sendMessage(env, chatId, '📊 Chưa có dữ liệu tháng nào.');
    return;
  }
  let reply = '💎 TIỀN DƯ TÍCH LŨY\n\n';
  for (const r of rows) {
    const surplus = r.du_thang || (r.luong - r.tien_an - r.tien_no);
    reply += `${formatMonthDisplay(r.thang)}: ${surplus >= 0 ? '+' : ''}${formatMoney(surplus)}\n`;
  }
  const latest = rows[rows.length - 1];
  reply += `\n──────────────\n💰 Tổng tích lũy: +${formatMoney(latest.tich_luy || 0)}`;
  await sendMessage(env, chatId, reply);
}

// ── /giúp đỡ ────────────────────────────────────────────────

async function handleHelp(env: Env, chatId: number): Promise<void> {
  const help =
    '💡 HƯỚNG DẪN SỬ DỤNG\n\n' +
    '📋 NHẬP HÀNG THÁNG (theo thứ tự):\n' +
    '1️⃣ /luong 20万  — nhập lương\n' +
    '2️⃣ /an 5万      — nhập tiền ăn\n' +
    '3️⃣ /no 3万      — nhập tiền nợ\n\n' +
    '📊 XEM BÁO CÁO:\n' +
    '/tháng          — báo cáo tháng này\n' +
    '/tháng 2024-01  — báo cáo tháng cụ thể\n' +
    '/tích lũy       — tổng dư các tháng\n\n' +
    '✏️ SỬA NẾU NHẬP SAI:\n' +
    '/sửa luong 21万\n' +
    '/sửa an 6万\n' +
    '/sửa no 4万\n\n' +
    '💴 CÁCH NHẬP SỐ TIỀN:\n' +
    '20万  → ¥200,000\n' +
    '1.5万 → ¥15,000\n' +
    '5000  → ¥5,000\n' +
    '500円 → ¥500';
  await sendMessage(env, chatId, help);
}
```

---

## worker/src/cron.ts — Nhắc lương + Tổng kết

```typescript
import { Env }              from './index';
import { sendMessage }      from './telegram';
import {
  getMonthRow, getAllMonthRows,
  calcCumulativeSurplus, buildMonthReport,
} from './supabase';
import {
  getCurrentMonthJST, getLastMonthJST,
  formatMonthDisplay, isTodaySalaryReminderDay,
  getSalaryReminderDay, formatMoney,
} from './parser';

// Chạy mỗi ngày 14:00 JST (05:00 UTC)
export async function dailySalaryCheck(env: Env): Promise<void> {
  if (!isTodaySalaryReminderDay()) {
    console.log('[SALARY_CHECK] Hom nay khong phai ngay nhac luong.');
    return;
  }
  const month = getCurrentMonthJST();
  const row   = await getMonthRow(env, month);
  if (row && row.luong > 0) {
    console.log('[SALARY_CHECK] Da co luong, bo qua.');
    return;
  }

  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dow15  = new Date(Date.UTC(nowJST.getUTCFullYear(), nowJST.getUTCMonth(), 15)).getUTCDay();
  const note   = (dow15 === 6 || dow15 === 0)
    ? '\n(Ngày 15 là cuối tuần nên nhắc sớm hôm nay)' : '';

  const name = env.HUSBAND_NAME || 'Chong';
  const msg  =
    `💴 NHẮC LƯƠNG ${formatMonthDisplay(month).toUpperCase()}\n\n` +
    `${name} ơi, hôm nay là ngày lãnh lương! 🎉${note}\n\n` +
    `Nhập lương tháng này:\n/luong [số tiền]\n\nVí dụ: /luong 20万`;

  await sendMessage(env, env.HUSBAND_ID, msg);
  console.log('[SALARY_CHECK] Da gui nhac luong', month);
}

// Chạy ngày 1 mỗi tháng 09:00 JST (00:00 UTC)
export async function sendMonthlyReport(env: Env): Promise<void> {
  const lastMonth = getLastMonthJST();
  const row       = await getMonthRow(env, lastMonth);

  if (!row || row.luong === 0) {
    await sendMessage(env, env.HUSBAND_ID,
      `📊 TỔNG KẾT ${formatMonthDisplay(lastMonth).toUpperCase()}\n\n` +
      `⚠️ Tháng này chưa nhập dữ liệu.\nXem lại: /tháng ${lastMonth}`
    );
    return;
  }

  const surplus = row.du_thang || (row.luong - row.tien_an - row.tien_no);
  const cumul   = row.tich_luy || await calcCumulativeSurplus(env, lastMonth, surplus);
  let   report  = buildMonthReport(lastMonth, row.luong, row.tien_an, row.tien_no, surplus, cumul);

  // Thêm ngày nhắc lương tháng mới
  const newMonth = getCurrentMonthJST();
  const [ny, nm] = newMonth.split('-').map(Number);
  const remDay   = getSalaryReminderDay(ny, nm);
  const remJST   = new Date(remDay.getTime() + 9 * 60 * 60 * 1000);
  const remStr   = `${String(remJST.getUTCDate()).padStart(2,'0')}/${String(remJST.getUTCMonth()+1).padStart(2,'0')}/${remJST.getUTCFullYear()}`;
  report += `\n\n📅 Ngày nhắc lương ${formatMonthDisplay(newMonth)}: ${remStr}`;

  await sendMessage(env, env.HUSBAND_ID, report);
  console.log('[MONTHLY] Da gui tong ket', lastMonth);
}
```

---

## Checklist deploy Worker

```
[ ] npm install trong worker/
[ ] wrangler login
[ ] wrangler secret put SUPABASE_URL
[ ] wrangler secret put SUPABASE_SERVICE_KEY
[ ] wrangler secret put TELEGRAM_BOT_TOKEN
[ ] wrangler secret put HUSBAND_ID
[ ] wrangler secret put HUSBAND_NAME
[ ] wrangler secret put MONTHLY_FOOD_BUDGET
[ ] wrangler secret put MONTHLY_DEBT
[ ] wrangler deploy
[ ] Set webhook: api.telegram.org/bot[TOKEN]/setWebhook?url=https://[worker-name].[account].workers.dev
[ ] Test: gõ /start trên Telegram → bot reply
[ ] Test cron thủ công: wrangler tail rồi gửi lệnh curl trigger test
```
