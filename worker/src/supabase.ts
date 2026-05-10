import { Env } from './index';
import { formatMoney, formatMonthDisplay } from './parser';

export interface MonthRow {
  thang:          string;
  ngay_luong:     string | null;
  luong:          number;
  tien_an:        number;
  tien_no:        number;
  tien_khac:      number;
  ten_khac:       string | null;
  du_thang:       number;
  tich_luy:       number;
  nhap_luong_luc: string | null;
  nhap_an_luc:    string | null;
  nhap_no_luc:    string | null;
  nhap_khac_luc:  string | null;
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
  const h = { ...headers(env) } as any;
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

// Lấy tất cả row của 1 năm
export async function getYearRows(env: Env, year: string): Promise<MonthRow[]> {
  const rows = await supabaseGet(env, `/theo_doi?thang=like.${year}-*&luong=gt.0&select=*`);
  return (rows || []) as MonthRow[];
}

// Ghi 1 field cho tháng (upsert)
export async function writeField(
  env: Env, month: string,
  field: 'salary' | 'food' | 'debt' | 'other',
  value: number,
  extraStr?: string
): Promise<void> {
  const colMap = { salary: 'luong',   food: 'tien_an',  debt: 'tien_no', other: 'tien_khac' } as const;
  const atMap  = { salary: 'nhap_luong_luc', food: 'nhap_an_luc', debt: 'nhap_no_luc', other: 'nhap_khac_luc' } as const;

  const nowISO = new Date().toISOString();
  const body: Record<string, any> = {
    thang:          month,
    [colMap[field]]: value,
    [atMap[field]]:  nowISO,
  };
  if (field === 'salary' && extraStr) body.ngay_luong = extraStr;
  if (field === 'other' && extraStr) body.ten_khac = extraStr;

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
  debt: number, other: number, otherName: string | null, surplus: number, cumulative: number
): string {
  const sign = surplus >= 0 ? '+' : '';
  let otherStr = '';
  if (other !== 0) {
    const oSign = other >= 0 ? '+' : '-';
    const oName = otherName ? ` (${otherName})` : '';
    otherStr = `🏷 Khác${oName}: ${oSign}${formatMoney(Math.abs(other))}\n`;
  }

  return (
    `📊 BÁO CÁO ${formatMonthDisplay(month).toUpperCase()}\n\n` +
    `💴 Lương:    +${formatMoney(salary)}\n` +
    `🍱 Tiền ăn:  -${formatMoney(food)}\n` +
    `💳 Tiền nợ:  -${formatMoney(debt)}\n` +
    otherStr +
    `─────────────────\n` +
    (surplus >= 0
      ? `💰 Dư tháng này:  +${formatMoney(surplus)}\n`
      : `⚠️ Âm tháng này:  -${formatMoney(Math.abs(surplus))}\n`) +
    `💎 Tổng tích lũy: +${formatMoney(cumulative)}`
  );
}
