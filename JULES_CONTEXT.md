# JULES_CONTEXT.md
# ĐỌC FILE NÀY TRƯỚC KHI LÀM BẤT CỨ ĐIỀU GÌ

---

## Dự án

**Family Expense Bot** — Quản lý tài chính gia đình 2 vợ chồng tại Nhật.
Toàn bộ stack chạy trên **Cloudflare**. Không dùng Google (không GAS, không Sheet).

| Thành phần | Nền tảng | Mô tả |
|---|---|---|
| Bot Telegram | Cloudflare Workers | Nhận webhook + xử lý lệnh |
| Cron jobs | Cloudflare Workers | Nhắc lương + tổng kết tháng |
| Database | Supabase (PostgreSQL) | Source of truth |
| Web dashboard | Cloudflare Pages | Vợ xem qua link |

---

## Cấu trúc repo

```
family-expense-bot/
│
├── .github/                 ← GitHub Actions (CI/CD workflows)
│   └── workflows/
│       ├── 1-setup.yml
│       ├── 2-iterate.yml
│       ├── 3-pr-review.yml
│       ├── 4-ai-linter.yml
│       └── 5-debug.yml
│
├── JULES_CONTEXT.md
│
├── worker/                  ← Cloudflare Workers (bot + cron)
│   ├── src/
│   │   ├── index.ts         ← entry: fetch handler + scheduled handler
│   │   ├── bot.ts           ← routeCommand + tất cả handle* functions
│   │   ├── supabase.ts      ← đọc/ghi Supabase (service_role)
│   │   ├── telegram.ts      ← sendMessage
│   │   ├── parser.ts        ← parseAmount, formatMoney, ngày lương
│   │   └── cron.ts          ← dailySalaryCheck, sendMonthlyReport
│   ├── wrangler.toml        ← config Workers, cron triggers, secrets ref
│   ├── package.json
│   └── tsconfig.json
│
├── web/                     ← Cloudflare Pages (dashboard)
│   ├── public/
│   │   └── index.html       ← HTML + CSS
│   ├── src/
│   │   ├── main.js
│   │   ├── api.js           ← Supabase anon, chỉ SELECT
│   │   ├── ui.js
│   │   └── utils.js
│   └── package.json
│
├── sql/
│   └── schema.sql
│
└── docs/
    ├── RULES.md
    ├── SKILL_WORKER.md      ← code mẫu worker
    ├── SKILL_WEB.md         ← code mẫu web dashboard
    ├── WORKFLOWS_JULES.md
    └── PROMPTS.md
```

---

## Logic nghiệp vụ (giống hệt GAS cũ)

```
Hàng tháng:
  /luong 20万  →  /an 5万  →  /no 3万
  → du_thang = luong - tien_an - tien_no
  → tich_luy  = cộng dồn tất cả tháng
  → Báo cáo gửi Telegram cho chồng

Cron tự động:
  Mỗi ngày 14:00 JST  → check ngày nhắc lương
  Ngày 1 mỗi tháng 09:00 JST → tổng kết tháng trước
```

---

## Supabase access

| Mode | Key | Nơi lưu | Dùng ở đâu |
|------|-----|---------|-----------|
| service_role | SUPABASE_SERVICE_KEY | Cloudflare Worker Secret | worker/ |
| anon | SUPABASE_ANON_KEY | Cloudflare Pages Env | web/ |

---

## Schema bảng `theo_doi`

```
thang           TEXT PRIMARY KEY  — 'YYYY-MM' (JST)
ngay_luong      DATE
luong           INTEGER   — ¥
tien_an         INTEGER   — ¥
tien_no         INTEGER   — ¥
du_thang        INTEGER   — tự tính
tich_luy        INTEGER   — cộng dồn
nhap_luong_luc  TIMESTAMPTZ
nhap_an_luc     TIMESTAMPTZ
nhap_no_luc     TIMESTAMPTZ
```

---

## Worker Secrets (set bằng wrangler CLI)

```
SUPABASE_URL         — https://[project].supabase.co
SUPABASE_SERVICE_KEY — service_role key
TELEGRAM_BOT_TOKEN   — token @BotFather
HUSBAND_ID           — Telegram User ID chồng
HUSBAND_NAME         — Tên hiển thị (optional)
MONTHLY_FOOD_BUDGET  — gợi ý tiền ăn ¥ (optional)
MONTHLY_DEBT         — gợi ý tiền nợ ¥ (optional)
```

## Cloudflare Pages Env Vars (web)

```
VITE_SUPABASE_URL      — https://[project].supabase.co
VITE_SUPABASE_ANON_KEY — anon key
```

---

## Cron schedule (wrangler.toml)

```toml
[triggers]
crons = [
  "0 5 * * *",    # 05:00 UTC = 14:00 JST — dailySalaryCheck
  "0 0 1 * *"     # 00:00 UTC ngày 1 = 09:00 JST — sendMonthlyReport
]
```

---

## Parse số tiền JPY

```
500 / 500円  → 500    | 1万 / 1万円  → 10000
1.5万        → 15000  | 20万         → 200000
1,500        → 1500   | ¥3000        → 3000
```

---

## Rules cứng

```typescript
// WORKER: TypeScript, ES modules
export default { async fetch(...) {}, async scheduled(...) {} }
// Không dùng CommonJS (require/module.exports)

// ENV: chỉ qua Env interface, không hardcode
env.HUSBAND_ID   // ✅
'123456789'      // ❌

// TIMEZONE: tính thủ công JST (UTC+9)
const nowJST = new Date(Date.now() + 9*60*60*1000)  // ✅
new Date().toLocaleDateString('ja-JP', {timeZone:'Asia/Tokyo'})  // ❌ unreliable

// SUPABASE trong worker: service_role key, có thể ghi
// SUPABASE trong web: anon key, chỉ SELECT

// BOT MESSAGES: Tiếng Việt | ¥ format
// KHÔNG có Google Sheet, KHÔNG có GAS
```

---

## Tài liệu

```
docs/RULES.md          — rules đầy đủ
docs/SKILL_WORKER.md   — code mẫu worker TypeScript
docs/SKILL_WEB.md      — code mẫu web dashboard
docs/WORKFLOWS_JULES.md — quy trình
docs/PROMPTS.md        — thư viện prompt
```
