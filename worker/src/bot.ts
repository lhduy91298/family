import { Env }              from './index';
import { sendMessage }      from './telegram';
import { sendMonthlyEmailToWife } from './email';
import {
  getMonthRow, getAllMonthRows, getYearRows,
  writeField, writeSurplus,
  calcCumulativeSurplus, buildMonthReport,
} from './supabase';
import {
  parseAmount, parseAmountFromCommand, parseOtherCommand,
  formatMoney, formatMoneyRaw,
  getCurrentMonthJST, getLastMonthJST, getCurrentYearJST,
  formatMonthDisplay,
  getSalaryReminderDay,
} from './parser';

// Helper: tính lại dư tháng + tích lũy khi có thay đổi bất kỳ
export async function recalcSurplus(env: Env, month: string): Promise<{ surplus: number; cumul: number; row: any } | null> {
  const row = await getMonthRow(env, month);
  if (!row || row.luong === 0 || row.tien_an === 0 || row.tien_no === 0) return null;
  const surplus = row.luong - row.tien_an - row.tien_no + (row.tien_khac || 0);
  const cumul   = await calcCumulativeSurplus(env, month, surplus);
  await writeSurplus(env, month, surplus, cumul);
  return { surplus, cumul, row };
}

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
  } else if (lower.startsWith('/khac ') || lower.startsWith('/khác ')) {
    await handleOther(env, chatId, userName, text);
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
  } else if (lower.startsWith('/xoa ') || lower.startsWith('/xóa ')) {
    await handleDeleteOther(env, chatId, text);
  } else if (lower === '/nam' || lower === '/năm') {
    await handleYearReport(env, chatId);
  } else if (lower === '/so sanh' || lower === '/sosanh' || lower === '/so_sanh') {
    await handleCompare(env, chatId);
  } else if (lower === '/gui mail' || lower === '/gửi mail') {
    await handleSendEmail(env, chatId);
  } else if (lower === '/web' || lower === '/link' || lower === '/dashboard') {
    await handleWeb(env, chatId);
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

  const result = await recalcSurplus(env, month);
  if (!result) return;
  const { surplus, cumul, row: updated } = result;
  await sendMessage(env, chatId, buildMonthReport(month, updated.luong, updated.tien_an, updated.tien_no, updated.tien_khac || 0, updated.ten_khac || null, surplus, cumul));

  // Cảnh báo chi tiêu
  if (surplus < 0) {
    await sendMessage(env, chatId,
      `\n⚠️ CẢNH BÁO: Tháng này ÂM ${formatMoney(Math.abs(surplus))}!\n` +
      `Cần xem lại chi tiêu để cân đối ngân sách. 📉`
    );
  } else {
    const lastMonth = getLastMonthJST();
    const lastRow = await getMonthRow(env, lastMonth);
    if (lastRow && lastRow.du_thang > 0) {
      const diff = surplus - lastRow.du_thang;
      const pct = Math.round(diff / lastRow.du_thang * 100);
      if (pct < -20) {
        await sendMessage(env, chatId,
          `\n📉 Lưu ý: Dư giảm ${Math.abs(pct)}% so với tháng trước (${formatMoney(lastRow.du_thang)} → ${formatMoney(surplus)})`
        );
      }
    }
  }
}

// ── /khac ───────────────────────────────────────────────────
async function handleOther(env: Env, chatId: number, userName: string, text: string): Promise<void> {
  const { amount, name } = parseOtherCommand(text);
  if (amount === null) {
    await sendMessage(env, chatId, '❌ Không hiểu cú pháp.\nVí dụ: /khac +5万 Thưởng dự án\nHoặc: /khac -2万 Mua quà');
    return;
  }
  const month = getCurrentMonthJST();
  const row   = await getMonthRow(env, month);
  if (!row || row.luong === 0) {
    await sendMessage(env, chatId, '⚠️ Chưa nhập lương tháng này.\nNhập trước: /luong [số tiền]');
    return;
  }
  
  const oldAmount = row.tien_khac || 0;
  const newAmount = oldAmount + amount;
  
  // Lưu chi tiết từng mục: "+50000:Thưởng|-20000:Mua quà"
  const entryStr = `${amount >= 0 ? '+' : ''}${amount}:${name || 'Không tên'}`;
  let newName = row.ten_khac || '';
  newName = newName ? `${newName}|${entryStr}` : entryStr;

  await writeField(env, month, 'other', newAmount, newName);
  console.log(`[OTHER] ${month} amount:${newAmount} name:${newName} by:${userName}`);

  const result = await recalcSurplus(env, month);
  if (result) {
    await sendMessage(env, chatId, buildMonthReport(month, result.row.luong, result.row.tien_an, result.row.tien_no, result.row.tien_khac || 0, result.row.ten_khac || null, result.surplus, result.cumul));
  } else {
    await sendMessage(env, chatId, `✅ Đã ghi tiền khác: ${amount >= 0 ? '+' : ''}${formatMoney(amount)}`);
  }
}

// ── /xoa khac ───────────────────────────────────────────────
async function handleDeleteOther(env: Env, chatId: number, text: string): Promise<void> {
  const parts = text.trim().split(/\s+/);
  const sub = (parts[1] || '').toLowerCase();
  
  if (sub !== 'khac' && sub !== 'khác') {
    await sendMessage(env, chatId, '❌ Cú pháp: /xoa khac [số thứ tự]\nVí dụ: /xoa khac 1');
    return;
  }

  const month = getCurrentMonthJST();
  const row   = await getMonthRow(env, month);
  if (!row || !row.ten_khac) {
    await sendMessage(env, chatId, '📦 Tháng này chưa có tiền khác nào.');
    return;
  }

  // Parse entries
  const entries = row.ten_khac.split('|').map(part => {
    const match = part.match(/^([+-]?\d+):(.+)$/);
    if (match) return { amount: parseInt(match[1]), name: match[2].trim(), raw: part };
    return null;
  }).filter(Boolean) as { amount: number; name: string; raw: string }[];

  if (entries.length === 0) {
    await sendMessage(env, chatId, '📦 Tháng này chưa có tiền khác nào.');
    return;
  }

  const indexStr = parts[2];
  
  // Nếu không có số → hiện danh sách
  if (!indexStr) {
    let list = '📦 DANH SÁCH TIỀN KHÁC\n\n';
    entries.forEach((e, i) => {
      const sign = e.amount >= 0 ? '+' : '';
      list += `${i + 1}. ${e.name}: ${sign}${formatMoney(e.amount)}\n`;
    });
    list += `\n🗑 Để xóa, gõ: /xoa khac [số thứ tự]\nVí dụ: /xoa khac 1`;
    await sendMessage(env, chatId, list);
    return;
  }

  const idx = parseInt(indexStr) - 1;
  if (isNaN(idx) || idx < 0 || idx >= entries.length) {
    await sendMessage(env, chatId, `❌ Số thứ tự không hợp lệ. Chọn từ 1 đến ${entries.length}.`);
    return;
  }

  const deleted = entries[idx];
  entries.splice(idx, 1);

  // Tính lại tổng
  const newTotal = entries.reduce((sum, e) => sum + e.amount, 0);
  const newName  = entries.map(e => `${e.amount >= 0 ? '+' : ''}${e.amount}:${e.name}`).join('|');

  await writeField(env, month, 'other', newTotal, newName || '');
  
  // Recalc surplus
  await recalcSurplus(env, month);

  const dSign = deleted.amount >= 0 ? '+' : '';
  await sendMessage(env, chatId,
    `🗑 Đã xóa: ${deleted.name} (${dSign}${formatMoney(deleted.amount)})\n` +
    `📦 Tổng tiền khác còn lại: ${newTotal >= 0 ? '+' : ''}${formatMoney(newTotal)}`
  );
}


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
  } else if (field === 'khac' || field === 'khác') {
    const { name } = parseOtherCommand(text);
    await writeField(env, month, 'other', amount, name); fieldName = 'Tiền khác';
  } else {
    await sendMessage(env, chatId, '❌ Chỉ sửa được: luong, an, no, khac');
    return;
  }
  console.log(`[EDIT] ${month} field:${field} amount:${amount} by:${userName}`);

  const result = await recalcSurplus(env, month);
  if (result) {
    await sendMessage(env, chatId,
      `✅ Đã sửa ${fieldName} → ${formatMoney(amount)}\n\n` +
      buildMonthReport(month, result.row.luong, result.row.tien_an, result.row.tien_no, result.row.tien_khac || 0, result.row.ten_khac || null, result.surplus, result.cumul)
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
  const surplus = row.luong - row.tien_an - row.tien_no + (row.tien_khac || 0);
  const cumul   = row.tich_luy || await calcCumulativeSurplus(env, month, surplus);
  await sendMessage(env, chatId, buildMonthReport(month, row.luong, row.tien_an, row.tien_no, row.tien_khac || 0, row.ten_khac || null, surplus, cumul));
}

// ── /gui mail ────────────────────────────────────────────────
async function handleSendEmail(env: Env, chatId: number): Promise<void> {
  const month = getCurrentMonthJST();
  const row = await getMonthRow(env, month);
  
  if (!row || row.luong === 0 || row.tien_an === 0 || row.tien_no === 0) {
    await sendMessage(env, chatId, '⚠️ Chưa nhập đủ dữ liệu (Lương, Ăn, Nợ) để gửi báo cáo.');
    return;
  }

  if (row.email_da_gui) {
    await sendMessage(env, chatId, '📧 Tháng này đã gửi email rồi. Bạn có chắc chắn muốn gửi lại không? (hiện tại tính năng gửi lại chưa hỗ trợ)');
    // Nếu muốn cho gửi lại thì bỏ if block này
  }

  const surplus = row.luong - row.tien_an - row.tien_no + (row.tien_khac || 0);
  await sendMonthlyEmailToWife(env, month, row.luong, row.tien_an, row.tien_no, row.tien_khac || 0, row.ten_khac || null, surplus, row.tich_luy);
  
  const { markEmailSent } = await import('./supabase');
  await markEmailSent(env, month);
  
  await sendMessage(env, chatId, '✅ Đã gửi email báo cáo thủ công cho vợ!');
}

// ── /web ───────────────────────────────────────────────────
async function handleWeb(env: Env, chatId: number): Promise<void> {
  await sendMessage(env, chatId, 
    '🌐 **WEB DASHBOARD**\n\n' +
    'Truy cập link bên dưới để xem biểu đồ và nhập dữ liệu:\n' +
    '👉 https://family-expense-dashboard.pages.dev/'
  );
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
    const surplus = r.du_thang || (r.luong - r.tien_an - r.tien_no + (r.tien_khac || 0));
    reply += `${formatMonthDisplay(r.thang)}: ${surplus >= 0 ? '+' : ''}${formatMoney(surplus)}\n`;
  }
  const latest = rows[rows.length - 1];
  reply += `\n──────────────\n💰 Tổng tích lũy: +${formatMoney(latest.tich_luy || 0)}`;
  await sendMessage(env, chatId, reply);
}

// ── /nam ──────────────────────────────────────────────────
async function handleYearReport(env: Env, chatId: number): Promise<void> {
  const year = getCurrentYearJST();
  const rows = await getYearRows(env, year);
  
  if (rows.length === 0) {
    await sendMessage(env, chatId, `📊 TỔNG KẾT NĂM ${year}\n\n⚠️ Chưa có dữ liệu trong năm nay.`);
    return;
  }
  
  let tLuong = 0;
  let tAn = 0;
  let tNo = 0;
  let tDu = 0;
  
  for (const r of rows) {
    tLuong += r.luong || 0;
    tAn += r.tien_an || 0;
    tNo += r.tien_no || 0;
    tDu += r.du_thang || (r.luong - r.tien_an - r.tien_no + (r.tien_khac || 0));
  }
  
  const reply = `📊 TỔNG KẾT NĂM ${year}\n\n` +
    `💴 Tổng lương:    +${formatMoney(tLuong)}\n` +
    `🍱 Tổng tiền ăn:  -${formatMoney(tAn)}\n` +
    `💳 Tổng tiền nợ:  -${formatMoney(tNo)}\n` +
    `──────────────────\n` +
    `💰 Tổng dư:       ${tDu >= 0 ? '+' : ''}${formatMoney(tDu)}\n` +
    `📅 Số tháng đã nhập: ${rows.length} tháng`;
    
  await sendMessage(env, chatId, reply);
}

// ── /so sanh ──────────────────────────────────────────────────
async function handleCompare(env: Env, chatId: number): Promise<void> {
  const currentMonth = getCurrentMonthJST();
  const lastMonth = getLastMonthJST();
  
  const curRow = await getMonthRow(env, currentMonth);
  const lastRow = await getMonthRow(env, lastMonth);
  
  if (!curRow || curRow.luong === 0) {
    await sendMessage(env, chatId, `⚠️ Tháng này (${currentMonth}) chưa có dữ liệu để so sánh.`);
    return;
  }
  if (!lastRow || lastRow.luong === 0) {
    await sendMessage(env, chatId, `⚠️ Tháng trước (${lastMonth}) chưa có dữ liệu để so sánh.`);
    return;
  }
  
  const curDu = curRow.du_thang || (curRow.luong - curRow.tien_an - curRow.tien_no + (curRow.tien_khac || 0));
  const lastDu = lastRow.du_thang || (lastRow.luong - lastRow.tien_an - lastRow.tien_no + (lastRow.tien_khac || 0));
  
  const getDiffStr = (lastVal: number, curVal: number) => {
    if (lastVal === 0) return '(N/A)';
    const pct = Math.round((curVal - lastVal) / lastVal * 100);
    return pct >= 0 ? `(+${pct}%)` : `(${pct}%)`;
  };
  
  const reply = `📊 SO SÁNH THÁNG NÀY / THÁNG TRƯỚC\n\n` +
    `               Tháng trước    Tháng này\n` +
    `💴 Lương:      ${formatMoney(lastRow.luong).padEnd(12)}  ${formatMoney(curRow.luong).padEnd(10)} ${getDiffStr(lastRow.luong, curRow.luong)}\n` +
    `🍱 Tiền ăn:    ${formatMoney(lastRow.tien_an).padEnd(12)}  ${formatMoney(curRow.tien_an).padEnd(10)} ${getDiffStr(lastRow.tien_an, curRow.tien_an)}\n` +
    `💳 Tiền nợ:    ${formatMoney(lastRow.tien_no).padEnd(12)}  ${formatMoney(curRow.tien_no).padEnd(10)} ${getDiffStr(lastRow.tien_no, curRow.tien_no)}\n` +
    `💰 Dư:         ${formatMoney(lastDu).padEnd(12)}  ${formatMoney(curDu).padEnd(10)} ${getDiffStr(lastDu, curDu)}`;
    
  await sendMessage(env, chatId, reply);
}

// ── /giúp đỡ ────────────────────────────────────────────────
async function handleHelp(env: Env, chatId: number): Promise<void> {
  const help =
    '💡 HƯỚNG DẪN SỬ DỤNG\n\n' +
    '📋 NHẬP HÀNG THÁNG (theo thứ tự):\n' +
    '1️⃣ /luong 20万  — nhập lương\n' +
    '2️⃣ /an 5万      — nhập tiền ăn\n' +
    '3️⃣ /no 3万      — nhập tiền nợ\n' +
    '4️⃣ /khac -2万 Mua quà (Tuỳ chọn)\n\n' +
    '📊 XEM BÁO CÁO:\n' +
    '/tháng          — báo cáo tháng này\n' +
    '/tháng 2024-01  — báo cáo tháng cụ thể\n' +
    '/tích lũy       — tổng dư các tháng\n' +
    '/nam            — báo cáo năm hiện tại\n' +
    '/so sanh        — so sánh với tháng trước\n\n' +
    '✏️ SỬA / XÓA:\n' +
    '/sửa luong 21万\n' +
    '/sửa an 6万\n' +
    '/sửa no 4万\n' +
    '/sửa khac +1万\n' +
    '/xoa khac 1     — xóa mục tiền khác số 1\n' +
    '/web            — lấy link xem web dashboard\n' +
    '/gui mail       — gửi email báo cáo ngay cho vợ\n\n' +
    '💴 CÁCH NHẬP SỐ TIỀN:\n' +
    '20万  → ¥200,000\n' +
    '1.5万 → ¥15,000\n' +
    '5000  → ¥5,000\n' +
    '500円 → ¥500';
  await sendMessage(env, chatId, help);
}
