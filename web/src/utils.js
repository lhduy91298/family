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

// "2024-01" → "01/24" (Cho chart)
export function formatMonthShort(monthStr) {
  const [y, m] = monthStr.split('-');
  return `${m}/${y.substring(2)}`;
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

// Parse chi tiết "tiền khác" từ chuỗi ten_khac
// Format mới: "+50000:Thưởng|-20000:Mua quà"
// Format cũ (fallback): "Thưởng, Mua quà"
export function parseOtherEntries(tenKhac) {
  if (!tenKhac) return [];

  // Thử parse format mới (pipe-delimited)
  if (tenKhac.includes('|') || /^[+-]?\d+:/.test(tenKhac)) {
    const parts = tenKhac.split('|');
    return parts.map(part => {
      const match = part.match(/^([+-]?\d+):(.+)$/);
      if (match) {
        return { amount: parseInt(match[1]), name: match[2].trim() };
      }
      return null;
    }).filter(Boolean);
  }

  // Fallback: format cũ — chỉ hiện tên, không có số tiền riêng
  return tenKhac.split(',').map(s => s.trim()).filter(Boolean).map(name => ({
    amount: null,
    name: name,
  }));
}
