# JULES_CONTEXT.md
# ĐỌC FILE NÀY TRƯỚC KHI LÀM BẤT CỨ ĐIỀU GÌ

---

## Dự án

**Family Expense Bot** — Quản lý tài chính gia đình 2 vợ chồng tại Nhật.
Toàn bộ stack chạy trên **Cloudflare**. Không dùng Google (không GAS, không Sheet).

| Thành phần | Nền tảng | Mô tả |
|---|---|---|
| Bot Telegram | Cloudflare Workers | Nhận webhook + xử lý lệnh |
| Cron jobs | Cloudflare Workers | Nhắc lương + tự động gửi email báo cáo |
| API Update | Cloudflare Workers | Endpoint /api/update để Web có thể ghi đè dữ liệu |
| Database | Supabase (PostgreSQL) | Source of truth |
| Web dashboard | Cloudflare Pages | Vợ xem qua link & nhập liệu trực tiếp (gọi API) |

---

## Cấu trúc repo

```
family-expense-bot/
│
├── .github/                 ← Thư mục GitHub (đã xóa các workflows CI/CD để tránh lỗi)
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
  /luong 20万  →  /an 5万  →  /no 3万  →  /khac +1万 (nếu có)
  → du_thang = luong - tien_an - tien_no + tien_khac
  → tich_luy = cộng dồn tất cả tháng
  → Báo cáo gửi Telegram cho chồng. Có thể gửi email báo cáo thủ công qua /guimail.
  → Hỗ trợ các lệnh mở rộng: /thang, /tichluy, /nam, /sosanh, /sualuong, /suaan, /suano, /suakhac, /xoakhac...

Cron tự động:
  Mỗi ngày 14:00 JST  → check ngày nhắc lương (đợi đến đúng ngày lương mới auto gửi email cho vợ)
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
ngay_luong      DATE              — Ngày nhắc lương thực tế
luong           INTEGER           — Tiền lương (¥)
tien_an         INTEGER           — Tiền ăn (¥)
tien_no         INTEGER           — Tiền nợ (¥)
tien_khac       INTEGER           — Tiền khác (¥), thu/chi tuỳ dấu
ten_khac        TEXT              — Ghi chú chi tiết các mục tiền khác
du_thang        INTEGER           — luong - tien_an - tien_no + tien_khac
tich_luy        INTEGER           — cộng dồn tất cả tháng
nhap_luong_luc  TIMESTAMPTZ       — (JST)
nhap_an_luc     TIMESTAMPTZ
nhap_no_luc     TIMESTAMPTZ
nhap_khac_luc   TIMESTAMPTZ
cap_nhat_luc    TIMESTAMPTZ
email_da_gui    BOOLEAN           — Trạng thái đã gửi email cho vợ chưa
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
RESEND_API_KEY       — API key của dịch vụ Resend để gửi email
WIFE_EMAIL           — Email người nhận báo cáo tự động
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
  "0 * * * *",   # Mỗi giờ — kiểm tra gửi email tự động sau 2 tiếng
  "0 15 * * *",  # 15:00 UTC = 00:00 JST — nhắc lương & nhắc nếu quên nhập 3 ngày
  "0 0 1 * *"    # 00:00 UTC ngày 1 = 09:00 JST — tổng kết tháng
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

// SUPABASE trong worker: service_role key, có thể đọc/ghi
// SUPABASE trong web: anon key, chỉ SELECT (Ghi dữ liệu gián tiếp qua API /api/update của Worker)

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
