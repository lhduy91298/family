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

// Tháng hiện tại JST (Theo chu kỳ tài chính: từ ngày nhận lương tháng hiện tại)
export function getCurrentMonthJST(): string {
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const currentY = nowJST.getUTCFullYear();
  const currentM = nowJST.getUTCMonth() + 1;
  const todayDay = nowJST.getUTCDate();
  
  const payDay = getSalaryPaymentDay(currentY, currentM);
  const payDayJST = new Date(payDay.getTime() + 9 * 60 * 60 * 1000);
  
  if (todayDay < payDayJST.getUTCDate()) {
    // Nếu chưa đến ngày lương của tháng này, thì vẫn tính là kỳ của tháng trước
    const lastMonth = new Date(Date.UTC(currentY, currentM - 2, 1));
    return `${lastMonth.getUTCFullYear()}-${String(lastMonth.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  
  return `${currentY}-${String(currentM).padStart(2, '0')}`;
}

// Tháng trước JST (Theo chu kỳ tài chính)
export function getLastMonthJST(): string {
  const curStr = getCurrentMonthJST();
  const [y, m] = curStr.split('-');
  const d = new Date(Date.UTC(parseInt(y), parseInt(m) - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Tháng tiếp theo JST (Dành cho việc kiểm tra lương kỳ tới)
export function getNextMonthJST(): string {
  const curStr = getCurrentMonthJST();
  const [y, m] = curStr.split('-');
  const d = new Date(Date.UTC(parseInt(y), parseInt(m), 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
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

// Tính ngày thực tế nhận lương (ngày công ty chuyển lương).
// Ngày 15 là T7 → dời về thứ 6 (14), CN → dời về thứ 6 (13).
export function getSalaryPaymentDay(year: number, month: number): Date {
  // month: 1-indexed. Tạo Date trong UTC+9 context
  const day15 = new Date(Date.UTC(year, month - 1, 15) - 9 * 60 * 60 * 1000);
  const jst15 = new Date(day15.getTime() + 9 * 60 * 60 * 1000);
  const dow   = jst15.getUTCDay(); // 0=CN, 6=T7
  if (dow === 6) {
    // T7 → lùi về thứ 6 (ngày 14)
    return new Date(Date.UTC(year, month - 1, 14) - 9 * 60 * 60 * 1000);
  }
  if (dow === 0) {
    // CN → lùi về thứ 6 (ngày 13)
    return new Date(Date.UTC(year, month - 1, 13) - 9 * 60 * 60 * 1000);
  }
  return day15;
}

// Tính ngày nhắc nhập lương = 1 ngày TRƯỚC ngày nhận lương thực tế.
// VD: 15 là weekday → nhắc ngày 14
//     15 là T7 → lương ngày 14 → nhắc ngày 13 (Thứ 5)
//     15 là CN → lương ngày 13 → nhắc ngày 12 (Thứ 5)
export function getSalaryReminderDay(year: number, month: number): Date {
  const payDay = getSalaryPaymentDay(year, month);
  // Lùi 1 ngày (24h)
  return new Date(payDay.getTime() - 24 * 60 * 60 * 1000);
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
