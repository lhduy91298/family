# PROMPTS.md — Thư Viện Prompt Cho Jules

> Header chuẩn dán vào đầu MỌI prompt:

```
Đọc JULES_CONTEXT.md và docs/RULES.md trước.
Xác nhận đã đọc xong, sau đó thực hiện task.
```

---

## NHÓM 1 — KHỞI TẠO

### P-INIT-WORKER — Tạo toàn bộ Worker từ SKILL

```
[Header chuẩn]

Task: Tạo toàn bộ files cho Cloudflare Worker theo docs/SKILL_WORKER.md.

Tạo đúng các files sau:
- worker/package.json
- worker/tsconfig.json
- worker/wrangler.toml
- worker/src/index.ts
- worker/src/parser.ts
- worker/src/supabase.ts
- worker/src/telegram.ts
- worker/src/bot.ts
- worker/src/cron.ts

Yêu cầu:
- TypeScript, ES modules (import/export)
- Không dùng @supabase/supabase-js trong worker (dùng fetch thuần)
- Tên cột Supabase: luong, tien_an, tien_no, du_thang, tich_luy, thang
- Timezone JST = UTC+9, tính thủ công
- Tất cả env qua Env interface, không hardcode

Sau khi tạo, tự review theo RULES Phần A.

PR title: "feat: initial cloudflare worker"
```

### P-INIT-WEB — Tạo toàn bộ Web Dashboard từ SKILL

```
[Header chuẩn]

Task: Tạo toàn bộ files cho Web Dashboard theo docs/SKILL_WEB.md.

Tạo đúng:
- web/package.json
- web/public/index.html
- web/src/main.js
- web/src/api.js
- web/src/ui.js
- web/src/utils.js

Yêu cầu:
- Vanilla JS + Vite, KHÔNG framework
- Supabase SDK (@supabase/supabase-js) + anon key, chỉ SELECT
- import.meta.env.VITE_* cho env vars
- CSS variables + dark mode
- Timezone JST = UTC+9 thủ công
- Tiếng Việt, ¥ format

PR title: "feat: initial web dashboard"
```

### P-VERIFY — Kiểm tra toàn bộ project

```
[Header chuẩn]

Task: Audit toàn bộ repo. Không sửa gì, chỉ báo cáo.

Kiểm tra worker/ theo RULES A-01 đến A-10:
- ES modules? (không require/module.exports)
- Env qua interface? (không hardcode)
- Supabase dùng fetch? (không SDK)
- Timezone UTC+9 thủ công?
- Tên cột đúng? (luong/tien_an/tien_no...)
- Có await? Có return Response?
- console.log (không Logger.log)?

Kiểm tra web/ theo RULES B-01 đến B-05:
- Vanilla JS? import.meta.env.VITE_*?
- Supabase SDK anon, chỉ SELECT?
- CSS variables + dark mode?

Output: "[file:hàm] — [vi phạm]" hoặc "Không phát hiện vi phạm."
```

---

## NHÓM 2 — FIX BUG

### P-BUG-WORKER — Fix bug Worker

```
[Header chuẩn]

BUG: [mô tả lỗi]

Phần: worker/
File: worker/src/[file].ts
Hàm: [tên hàm]

Log từ wrangler tail:
[paste log]

Chỉ sửa lỗi này. Không thay đổi logic khác.
PR title: "fix(worker): [mô tả ngắn]"
```

### P-BUG-WEB — Fix bug Web

```
[Header chuẩn]

BUG: [mô tả]
Phần: web/
File: web/src/[file].js

Chỉ sửa lỗi. Không thay đổi khác.
PR title: "fix(web): [mô tả]"
```

---

## NHÓM 3 — TÍNH NĂNG WORKER

### P-FEAT-WORKER — Template tính năng mới

```
[Header chuẩn]

Tính năng: [tên]
Phần: worker/

Mô tả:
[User gõ gì, bot reply gì]

File cần sửa:
- worker/src/bot.ts — thêm route + handler
- [file khác nếu cần]

Yêu cầu kỹ thuật:
- TypeScript, ES modules
- Async/await
- Tên cột Supabase: luong/tien_an/tien_no/du_thang/tich_luy
- Timezone: UTC+9 thủ công
- Bot messages: tiếng Việt, tiền ¥

PR title: "feat(worker): [tên]"
```

### P-FEAT-LENH-NAM — Thêm lệnh /nam

```
[Header chuẩn]

Task: Thêm lệnh /nam vào bot để xem tổng kết cả năm hiện tại.

User gõ: /nam
Bot reply:
📊 TỔNG KẾT NĂM 2024

💴 Tổng lương:    +¥X,XXX,XXX
🍱 Tổng tiền ăn:  -¥X,XXX,XXX
💳 Tổng tiền nợ:  -¥X,XXX,XXX
──────────────────
💰 Tổng dư:       +¥X,XXX,XXX
📅 Số tháng đã nhập: X tháng

File cần sửa:
- worker/src/bot.ts — thêm route '/nam' → handleYearReport()
- worker/src/supabase.ts — thêm getYearRows(env, year)

getYearRows:
  GET /theo_doi?thang=like.YYYY-*&luong=gt.0&select=*
  (thang LIKE '2024-%')

getCurrentYearJST():
  const nowJST = new Date(Date.now() + 9*60*60*1000)
  return String(nowJST.getUTCFullYear())
  (thêm vào parser.ts)

PR title: "feat(worker): lenh /nam tong ket ca nam"
```

### P-FEAT-SO-SANH — Thêm lệnh /so sanh

```
[Header chuẩn]

Task: Thêm lệnh /so sanh để so sánh tháng này vs tháng trước.

User gõ: /so sanh
Bot reply:
📊 SO SÁNH THÁNG NÀY / THÁNG TRƯỚC

               Tháng trước    Tháng này
💴 Lương:      ¥200,000      ¥210,000  (+5%)
🍱 Tiền ăn:    ¥50,000       ¥52,000   (+4%)
💳 Tiền nợ:    ¥30,000       ¥30,000   (±0%)
💰 Dư:         ¥120,000      ¥128,000  (+7%)

File: worker/src/bot.ts
Route: '/so sanh', '/sosanh', '/so\_sanh'

Logic:
- Lấy getMonthRow cho getCurrentMonthJST() và getLastMonthJST()
- Nếu thiếu dữ liệu 1 tháng → thông báo tháng nào thiếu
- % thay đổi: Math.round((b-a)/a*100), nếu a=0 thì "N/A"
- Dùng padEnd hoặc Intl.NumberFormat để căn cột (ký tự đơn giản)

PR title: "feat(worker): lenh /so sanh"
```

---

## NHÓM 4 — TÍNH NĂNG WEB

### P-FEAT-WEB — Template tính năng web

```
[Header chuẩn]

Tính năng: [tên]
Phần: web/

Mô tả:
[Giải thích muốn thêm gì vào dashboard]

File cần sửa:
- web/src/ui.js  — [hàm cần thêm/sửa]
- web/public/index.html — [CSS mới nếu cần]

Ràng buộc:
- Vanilla JS, không framework
- CSS variables, dark mode
- Tiếng Việt, ¥ format
- Mobile-friendly (max-width 480px)

PR title: "feat(web): [tên]"
```

### P-FEAT-CHART — Thêm biểu đồ dư hàng tháng

```
[Header chuẩn]

Task: Thêm bar chart hiển thị du_thang 6 tháng gần nhất
vào dashboard, bên dưới card tổng tích lũy.

Yêu cầu:
- <canvas> + Chart.js từ CDN: https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js
- Bar màu xanh (#1D9E75) nếu dương, đỏ (#d93025) nếu âm
- Label X: "01/24", "02/24"...
- Responsive width: 100%
- Không render nếu < 2 tháng có dữ liệu

File cần sửa:
- web/public/index.html — thêm script CDN + canvas container
- web/src/ui.js — thêm renderChart(rows)
- web/src/main.js — gọi renderChart(rows) sau renderApp(rows, month)

Không thêm npm package mới.

PR title: "feat(web): bar chart du thang"
```

---

## NHÓM 5 — SQL

### P-SQL — Thay đổi schema/policy

```
[Header chuẩn]

Task: [mô tả thay đổi]
File: sql/schema.sql

Giữ nguyên:
- Policy "anon_read_only" (FOR SELECT TO anon)
- service_role bypass RLS (không cần policy riêng)

Thêm: [yêu cầu cụ thể]

Thêm câu verify SQL ở cuối file.

PR title: "sql: [mô tả]"
```

---

## Tips

**Nói rõ phần nào:**
```
✅ "Sửa worker/src/bot.ts hàm handleDebt()"
✅ "Thêm vào web/src/ui.js hàm renderChart()"
❌ "Thêm biểu đồ vào project"
```

**Nếu Jules dùng Supabase SDK trong worker:**
```
"Worker dùng fetch() thuần đến Supabase REST API.
Không import @supabase/supabase-js trong worker/."
```

**Nếu Jules thêm server Node.js riêng:**
```
"Không cần server. Worker IS the server.
Web đọc thẳng Supabase anon API."
```

**Nếu Jules dùng tên cột tiếng Anh:**
```
"Tên cột Supabase phải đúng: luong, tien_an, tien_no,
du_thang, tich_luy, thang — không phải salary/food/debt."
```
