// Parse chuỗi → số yên nguyên. Trả về null nếu không hợp lệ.
// Nhận: 500 | 500円 | 1万 | 1万円 | 1.5万 | 20万 | 1,500 | ¥3000
export function parseAmount(text: string): number | null {
  const clean = text.trim().replace(/^¥\s*/, '').replace(/,/g, '');

  const manMatch = clean.match(/^([+-]?)\s*([0-9]+(?:\.[0-9]+)?)\s*万\s*円?$/);
  if (manMatch) {
    const sign = manMatch[1] === '-' ? -1 : 1;
    return Math.round(parseFloat(manMatch[2]) * 10000) * sign;
  }

  const yenMatch = clean.match(/^([+-]?)\s*([0-9]+(?:\.[0-9]+)?)\s*円$/);
  if (yenMatch) {
    const sign = yenMatch[1] === '-' ? -1 : 1;
    return Math.round(parseFloat(yenMatch[2])) * sign;
  }

  const numMatch = clean.match(/^([+-]?)\s*([0-9]+(?:\.[0-9]+)?)$/);
  if (numMatch) {
    const sign = numMatch[1] === '-' ? -1 : 1;
    const n = parseFloat(numMatch[2]);
    return isNaN(n) ? null : Math.round(n) * sign;
  }
  return null;
}

// Lấy số tiền từ chuỗi lệnh: "/luong 20万" → 200000
export function parseAmountFromCommand(text: string): number | null {
  const parts = text.trim().split(/\s+/);
  return parts.length >= 2 ? parseAmount(parts[1]) : null;
}

// Phân tách lệnh /khac: "/khac -2万 Mua quà sinh nhật"
export function parseOtherCommand(text: string): { amount: number | null, name: string } {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) return { amount: null, name: '' };
  const amount = parseAmount(parts[1]);
  const name = parts.slice(2).join(' ');
  return { amount, name };
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

// Năm hiện tại JST: "2024"
export function getCurrentYearJST(): string {
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return String(nowJST.getUTCFullYear());
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
