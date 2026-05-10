-- ============================================================
-- schema.sql — Supabase cho Family Expense Bot + Web Dashboard
-- Chạy trong Supabase Dashboard → SQL Editor
--
-- Thay đổi so với schema cũ:
--   + Thêm policy "anon_read_only" để web dashboard đọc được
--     mà không cần đăng nhập
-- ============================================================

-- Bảng duy nhất: 1 row = 1 tháng
CREATE TABLE IF NOT EXISTS theo_doi (
  thang           TEXT        PRIMARY KEY,        -- 'YYYY-MM' (JST)
  ngay_luong      DATE,                           -- Ngày nhắc lương thực tế
  luong           INTEGER     NOT NULL DEFAULT 0, -- Tiền lương (¥)
  tien_an         INTEGER     NOT NULL DEFAULT 0, -- Tiền ăn (¥)
  tien_no         INTEGER     NOT NULL DEFAULT 0, -- Tiền nợ (¥)
  tien_khac       INTEGER     NOT NULL DEFAULT 0, -- Tiền khác (¥), thu/chi tuỳ dấu
  ten_khac        TEXT,                           -- Ghi chú tiền khác
  du_thang        INTEGER     NOT NULL DEFAULT 0, -- luong - tien_an - tien_no + tien_khac
  tich_luy        INTEGER     NOT NULL DEFAULT 0, -- Cộng dồn tất cả tháng
  nhap_luong_luc  TIMESTAMPTZ,                    -- Thời điểm nhập lương (JST)
  nhap_an_luc     TIMESTAMPTZ,                    -- Thời điểm nhập tiền ăn
  nhap_no_luc     TIMESTAMPTZ,                    -- Thời điểm nhập tiền nợ
  nhap_khac_luc   TIMESTAMPTZ                     -- Thời điểm nhập tiền khác
);

-- Index để query nhanh theo thang
CREATE INDEX IF NOT EXISTS idx_theo_doi_thang ON theo_doi (thang);

-- Bật Row Level Security
ALTER TABLE theo_doi ENABLE ROW LEVEL SECURITY;

-- ── POLICY 1: Service role full access (GAS Bot) ──────────────
-- GAS dùng service_role key → bypass RLS tự động
-- Không cần tạo policy riêng cho service_role

-- ── POLICY 2: Anon read-only (Web Dashboard) ─────────────────
-- Web dashboard dùng anon key → chỉ được SELECT
-- An toàn vì dữ liệu tài chính gia đình không sensitive với
-- người được share link (chỉ vợ có link)
DROP POLICY IF EXISTS "anon_read_only" ON theo_doi;
CREATE POLICY "anon_read_only" ON theo_doi
  FOR SELECT
  TO anon
  USING (true);

-- ── VERIFY ───────────────────────────────────────────────────
-- Kiểm tra policies đã tạo:
-- SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'theo_doi';

-- Kiểm tra anon có đọc được không:
-- SET ROLE anon;
-- SELECT * FROM theo_doi LIMIT 1;
-- RESET ROLE;
