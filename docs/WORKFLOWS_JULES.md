# WORKFLOWS_JULES.md — Quy Trình Với Jules

---

## Cấu trúc repo (Jules cần biết)

```
family-expense-bot/       ← 1 repo GitHub
├── JULES_CONTEXT.md      ← Jules đọc đầu tiên (ROOT)
├── worker/               ← Cloudflare Workers (bot + cron)
└── web/                  ← Cloudflare Pages (dashboard)
```

Jules làm việc trên cả 2 phần. Mỗi task cần nói rõ phần nào.

---

## Workflow 1 — Setup lần đầu (chạy 1 lần)

### Phase 1: Supabase
```
1. Supabase Dashboard → SQL Editor → paste sql/schema.sql → Run
2. Copy: Project URL, anon key, service_role key
```

### Phase 2: GitHub repo
```
3. Tạo repo private: family-expense-bot
4. Push toàn bộ project lên
```

### Phase 3: Cloudflare account
```
5. Tạo Cloudflare account (cloudflare.com)
6. Cài wrangler CLI: npm install -g wrangler
7. wrangler login
```

### Phase 4: Deploy Worker (bot + cron)
```
8.  cd worker && npm install
9.  Set secrets:
    wrangler secret put SUPABASE_URL
    wrangler secret put SUPABASE_SERVICE_KEY
    wrangler secret put TELEGRAM_BOT_TOKEN
    wrangler secret put HUSBAND_ID
    wrangler secret put HUSBAND_NAME
    wrangler secret put MONTHLY_FOOD_BUDGET
    wrangler secret put MONTHLY_DEBT
10. wrangler deploy
    → Nhận URL dạng: https://family-expense-bot.[account].workers.dev
11. Set webhook Telegram:
    https://api.telegram.org/bot[TOKEN]/setWebhook?url=[WORKER_URL]
    → {"ok":true,...}
12. Test: gõ /start trên Telegram → bot reply ✅
```

### Phase 5: Deploy Web Dashboard
```
13. Cloudflare Dashboard → Pages → Create project
14. Connect GitHub repo → chọn repo family-expense-bot
    Root directory: web
    Build command: npm run build
    Output: dist
15. Environment variables:
    VITE_SUPABASE_URL      = [url]
    VITE_SUPABASE_ANON_KEY = [anon key]
16. Save and deploy
17. Mở URL Pages → verify data tải được
18. Share link cho vợ
```

---

## Workflow 2 — Iterate với Jules (vòng lặp chuẩn)

```
[Bạn] Mô tả thay đổi + nói rõ phần nào (worker hay web)
    ↓
[Jules] Đọc JULES_CONTEXT.md + RULES.md + SKILL liên quan
    ↓
[Jules] Tạo PR
    ↓
[Bạn] Review theo checklist Workflow 3
    ↓
Merge → Cloudflare tự deploy cả worker lẫn Pages
```

### Deploy tự động sau merge

Sau khi setup Cloudflare GitHub integration:
- Push/merge vào `main` → Cloudflare tự build và deploy
- Worker: khoảng 30 giây
- Pages: khoảng 60 giây
- Không cần làm gì thêm

---

## Workflow 3 — Checklist review PR

### PR thay đổi worker/
```
[ ] Import dùng ES modules (không require)
[ ] Tất cả env qua Env interface (không hardcode)
[ ] Supabase gọi bằng fetch thuần (không SDK)
[ ] Timezone tính UTC+9 thủ công
[ ] Tên cột Supabase: luong/tien_an/tien_no/du_thang/tich_luy
[ ] Có await trước mọi async call
[ ] fetch handler trả về Response
[ ] Bot messages tiếng Việt, tiền ¥
[ ] console.log (không Logger.log)
```

### PR thay đổi web/
```
[ ] Vanilla JS (không React/Vue)
[ ] import.meta.env.VITE_* cho env vars
[ ] Supabase SDK + anon key, chỉ SELECT
[ ] Timezone tính UTC+9
[ ] CSS variables + dark mode
[ ] Loading state + error state
```

---

## Workflow 4 — Khi Jules làm sai

**Jules dùng require() hoặc CommonJS:**
```
"Workers dùng ES modules. Thay require() → import,
module.exports → export default."
```

**Jules import @supabase/supabase-js trong worker:**
```
"Không dùng Supabase SDK trong worker/ — Workers runtime
không có Node.js APIs. Gọi thẳng fetch() đến Supabase REST API."
```

**Jules dùng Intl/toLocaleDateString cho timezone:**
```
"Không ổn định trong Workers. Tính JST thủ công:
const jst = new Date(Date.now() + 9*60*60*1000)"
```

**Jules dùng tên cột tiếng Anh (salary, food, debt):**
```
"Tên cột Supabase là tiếng Việt không dấu:
luong, tien_an, tien_no, du_thang, tich_luy, thang"
```

**Jules thêm backend server riêng:**
```
"Không cần server riêng. Worker IS the server.
Web đọc thẳng từ Supabase anon API."
```

---

## Workflow 5 — Debug production

### Worker lỗi
```
wrangler tail                 # stream log realtime
# Xem lỗi → tạo Jules task fix
```

### Kiểm tra webhook
```
https://api.telegram.org/bot[TOKEN]/getWebhookInfo
# Xem last_error_message nếu có
```

### Kiểm tra cron
```
# Cloudflare Dashboard → Workers → [tên worker] → Triggers
# Xem lịch sử lần chạy gần nhất
```

### Web lỗi
```
# Cloudflare Dashboard → Pages → [project] → Deployments → xem build log
```

---

## Thứ tự chạy lệnh setup (copy và chạy)

```bash
# 1. Cài wrangler
npm install -g wrangler

# 2. Login Cloudflare
wrangler login

# 3. Cài dependencies worker
cd worker && npm install

# 4. Set secrets (chạy từng lệnh, nhập giá trị khi được hỏi)
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put HUSBAND_ID
wrangler secret put HUSBAND_NAME
wrangler secret put MONTHLY_FOOD_BUDGET
wrangler secret put MONTHLY_DEBT

# 5. Deploy worker
wrangler deploy
# → In ra URL worker

# 6. Set webhook (thay TOKEN và URL)
curl "https://api.telegram.org/bot[TOKEN]/setWebhook?url=[WORKER_URL]"
# → {"ok":true,...}

# 7. Test bot
# Gõ /start trên Telegram
```
