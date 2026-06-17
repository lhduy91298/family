import { Env }              from './index';
import { sendMessage, answerCallbackQuery }      from './telegram';
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
  getSalaryPaymentDay,
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

  if (update.callback_query) {
    const cb = update.callback_query;
    const userId = String(cb.from.id);
    if (userId !== env.HUSBAND_ID) return;
    const chatId = cb.message.chat.id;
    await handleCallback(env, chatId, cb.data, cb.id);
    return;
  }

  const msg = update?.message;
  if (!msg) return;

  const userId = String(msg.from.id);
  const chatId = msg.chat.id;

  // Whitelist — chỉ chồng
  if (userId !== env.HUSBAND_ID) {
    console.log('[UNAUTHORIZED]', userId);
    return;
  }

  // Xử lý file PDF bảng lương
  if (msg.document) {
    const doc = msg.document;
    const mime = doc.mime_type || '';
    const fileName = (doc.file_name || '').toLowerCase();

    if (mime === 'application/pdf' || fileName.endsWith('.pdf')) {
      const { savePayslipFileId } = await import('./supabase');
      const { formatMonthDisplay } = await import('./parser');

      // Xác định tháng: từ caption (VD: /bangluong 2026-04) hoặc tháng hiện tại
      const { getCurrentMonthJST } = await import('./parser');
      let month = getCurrentMonthJST();
      const caption = (msg.caption || '').trim();
      const monthMatch = caption.match(/(\d{4}-\d{2})/);
      if (monthMatch) {
        month = monthMatch[1];
      }

      await savePayslipFileId(env, month, doc.file_id);
      await sendMessage(env, chatId,
        `✅ Đã lưu file bảng lương cho ${formatMonthDisplay(month)}\n` +
        `📄 File: ${doc.file_name || 'PDF'}\n\n` +
        `File này sẽ được đính kèm khi gửi email báo cáo cho vợ.`
      );
      return;
    }
  }

  if (!msg.text) return;
  const text = msg.text.trim() as string;

  const userName = env.HUSBAND_NAME || 'Chong';

  if (msg.reply_to_message && msg.reply_to_message.from.is_bot) {
    const prompt = msg.reply_to_message.text || '';
    if (prompt.includes('tiền Lương')) {
      await routeCommand(env, chatId, userName, `/luong ${text}`);
      return;
    }
    if (prompt.includes('tiền Ăn')) {
      await routeCommand(env, chatId, userName, `/an ${text}`);
      return;
    }
    if (prompt.includes('tiền Nợ')) {
      await routeCommand(env, chatId, userName, `/no ${text}`);
      return;
    }
    if (prompt.includes('Tiền Khác')) {
      await routeCommand(env, chatId, userName, `/khac ${text}`);
      return;
    }
  }

  await routeCommand(env, chatId, userName, text);
}

async function routeCommand(env: Env, chatId: number, userName: string, text: string): Promise<void> {
  const lower = text.toLowerCase().trim();

  if (lower.startsWith('/luong ')) {
    await handleSalary(env, chatId, userName, text);
  } else if (lower.startsWith('/an ')) {
    await handleFood(env, chatId, userName, text);
  } else if (lower.startsWith('/no ')) {
    await handleDebt(env, chatId, userName, text);
  } else if (lower.startsWith('/khac ')) {
    await handleOther(env, chatId, userName, text);
  } else if (lower === '/thang') {
    await handleMonthReport(env, chatId, getCurrentMonthJST());
  } else if (lower.startsWith('/thang ')) {
    const parts = text.trim().split(/\s+/);
    const m = (parts[1] && /^\d{4}-\d{2}$/.test(parts[1])) ? parts[1] : getCurrentMonthJST();
    await handleMonthReport(env, chatId, m);
  } else if (lower === '/tichluy') {
    await handleCumulative(env, chatId);
  } else if (lower.startsWith('/sualuong ')) {
    await handleEdit(env, chatId, userName, 'luong', text);
  } else if (lower.startsWith('/suaan ')) {
    await handleEdit(env, chatId, userName, 'an', text);
  } else if (lower.startsWith('/suano ')) {
    await handleEdit(env, chatId, userName, 'no', text);
  } else if (lower.startsWith('/suakhac ')) {
    await handleEdit(env, chatId, userName, 'khac', text);
  } else if (lower.startsWith('/xoaan ') || lower === '/xoaan') {
    await handleDeleteFood(env, chatId, text);
  } else if (lower.startsWith('/xoakhac ') || lower === '/xoakhac') {
    await handleDeleteOther(env, chatId, text);
  } else if (lower === '/nam') {
    await handleYearReport(env, chatId);
  } else if (lower === '/sosanh') {
    await handleCompare(env, chatId);
  } else if (lower === '/guimail') {
    await handleSendEmail(env, chatId);
  } else if (lower === '/web' || lower === '/link' || lower === '/dashboard') {
    await handleWeb(env, chatId);
  } else if (lower === '/menu') {
    await sendMenu(env, chatId);
  } else if (lower === '/giupdo' || lower === '/start' || lower === '/help') {
    await sendMenu(env, chatId);
    await handleHelp(env, chatId);
  } else {
    await sendMessage(env, chatId, '❓ Không hiểu lệnh này.\nGõ /giupdo để xem hướng dẫn.');
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
  const remDate = getSalaryPaymentDay(y, m);
  const remISO  = new Date(remDate.getTime() + 9*60*60*1000).toISOString().substring(0, 10);

  await writeField(env, month, 'salary', amount, remISO);
  console.log(`[SALARY] ${month} amount:${amount} by:${userName}`);

  const reply = `✅ Đã ghi lương ${formatMonthDisplay(month)}\n💴 Lương: +${formatMoney(amount)}`;
  const keyboard = {
    inline_keyboard: [[{ text: '🍱 Nhập Tiền Ăn', callback_data: 'btn_an' }]]
  };
  await sendMessage(env, chatId, reply, keyboard);
}

// ── /an ─────────────────────────────────────────────────────
async function handleFood(env: Env, chatId: number, userName: string, text: string): Promise<void> {
  const { amount, name } = parseOtherCommand(text);
  if (!amount) {
    await sendMessage(env, chatId, '❌ Không hiểu cú pháp.\nVí dụ: /an 5万 Siêu thị');
    return;
  }
  const month = getCurrentMonthJST();
  const row   = await getMonthRow(env, month);
  if (!row || row.luong === 0) {
    await sendMessage(env, chatId, '⚠️ Chưa nhập lương tháng này.\nNhập trước: /luong [số tiền]');
    return;
  }
  
  const oldAmount = row.tien_an || 0;
  
  if (oldAmount === 0) {
    await writeField(env, month, 'food', amount, '');
    console.log(`[FOOD BUDGET SET] ${month} amount:${amount} by:${userName}`);

    const reply = `✅ Đã thiết lập ngân sách tiền ăn ${formatMonthDisplay(month)}\n🍱 Tiền ăn: -${formatMoney(amount)}`;
    const keyboard = {
      inline_keyboard: [[{ text: '💳 Nhập Tiền Nợ', callback_data: 'btn_no' }]]
    };
    await sendMessage(env, chatId, reply, keyboard);
  } else {
    const newAmount = oldAmount + amount;
    const entryStr = `${amount}:${name || 'Ăn uống'}`;
    let newName = row.chi_tiet_an || '';
    newName = newName ? `${newName}|${entryStr}` : entryStr;

    await writeField(env, month, 'food', newAmount, newName);
    console.log(`[FOOD DETAIL ADD] ${month} amount:${amount} name:${newName} by:${userName}`);

    await recalcSurplus(env, month);

    const reply = `✅ Đã ghi chi tiết tiền ăn ${formatMonthDisplay(month)}\n🛒 Thêm: ${formatMoney(amount)} (${name || 'Ăn uống'})\n(Tổng tiền ăn: ${formatMoney(newAmount)})`;
    const keyboard = {
      inline_keyboard: [[{ text: '💳 Nhập Tiền Nợ', callback_data: 'btn_no' }]]
    };
    await sendMessage(env, chatId, reply, keyboard);
  }
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
  await sendMessage(env, chatId, buildMonthReport(month, updated.luong, updated.tien_an, updated.tien_no, updated.tien_khac || 0, updated.ten_khac || null, surplus, cumul, updated.chi_tiet_an || null));

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
    await sendMessage(env, chatId, buildMonthReport(month, result.row.luong, result.row.tien_an, result.row.tien_no, result.row.tien_khac || 0, result.row.ten_khac || null, result.surplus, result.cumul, result.row.chi_tiet_an || null));
  } else {
    await sendMessage(env, chatId, `✅ Đã ghi tiền khác: ${amount >= 0 ? '+' : ''}${formatMoney(amount)}`);
  }
}

// ── /xoaan ───────────────────────────────────────────────
async function handleDeleteFood(env: Env, chatId: number, text: string): Promise<void> {
  const parts = text.trim().split(/\s+/);

  const month = getCurrentMonthJST();
  const row   = await getMonthRow(env, month);
  if (!row || !row.chi_tiet_an) {
    await sendMessage(env, chatId, '🍱 Tháng này chưa có chi tiết tiền ăn nào.');
    return;
  }

  const entries = row.chi_tiet_an.split('|').map(part => {
    const match = part.match(/^([+-]?\d+):(.+)$/);
    if (match) return { amount: parseInt(match[1]), name: match[2].trim(), raw: part };
    return null;
  }).filter(Boolean) as { amount: number; name: string; raw: string }[];

  if (entries.length === 0) {
    await sendMessage(env, chatId, '🍱 Tháng này chưa có chi tiết tiền ăn nào.');
    return;
  }

  const indexStr = parts[1];
  
  if (!indexStr) {
    let list = '🍱 DANH SÁCH TIỀN ĂN\n\n';
    entries.forEach((e, i) => {
      list += `${i + 1}. ${e.name}: ${formatMoney(e.amount)}\n`;
    });
    list += `\n🗑 Để xóa, gõ: /xoaan [số thứ tự]\nVí dụ: /xoaan 1`;
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

  const newTotal = row.tien_an - deleted.amount;
  const newName  = entries.map(e => `${e.amount}:${e.name}`).join('|');

  await writeField(env, month, 'food', newTotal, newName);
  await recalcSurplus(env, month);

  await sendMessage(env, chatId,
    `🗑 Đã xóa: ${deleted.name} (${formatMoney(deleted.amount)})\n` +
    `🍱 Tổng tiền ăn còn lại: ${formatMoney(newTotal)}`
  );
}

// ── /xoakhac ───────────────────────────────────────────────
async function handleDeleteOther(env: Env, chatId: number, text: string): Promise<void> {
  const parts = text.trim().split(/\s+/);
  // parts[0] is '/xoakhac', parts[1] is the index


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

  const indexStr = parts[1];
  
  // Nếu không có số → hiện danh sách
  if (!indexStr) {
    let list = '📦 DANH SÁCH TIỀN KHÁC\n\n';
    entries.forEach((e, i) => {
      const sign = e.amount >= 0 ? '+' : '';
      list += `${i + 1}. ${e.name}: ${sign}${formatMoney(e.amount)}\n`;
    });
    list += `\n🗑 Để xóa, gõ: /xoakhac [số thứ tự]\nVí dụ: /xoakhac 1`;
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


async function handleEdit(env: Env, chatId: number, userName: string, field: string, text: string): Promise<void> {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) {
    await sendMessage(env, chatId, '❌ Cú pháp:\n/sualuong 21万\n/suaan 6万\n/suano 4万\n/suakhac +1万 Thưởng');
    return;
  }
  const amount = parseAmount(parts[1]);
  if (!amount) {
    await sendMessage(env, chatId, '❌ Số tiền không hợp lệ.');
    return;
  }
  const month = getCurrentMonthJST();
  const row   = await getMonthRow(env, month);
  let fieldName = '';

  if (field === 'luong') {
    await writeField(env, month, 'salary', amount); fieldName = 'Lương';
  } else if (field === 'an') {
    await writeField(env, month, 'food', amount, row?.chi_tiet_an || undefined); fieldName = 'Ngân sách tiền ăn';
  } else if (field === 'no') {
    await writeField(env, month, 'debt', amount);   fieldName = 'Tiền nợ';
  } else if (field === 'khac') {
    const partsWithoutCmd = parts.slice(1).join(' '); // Re-join to parse amount and name
    const { name } = parseOtherCommand('/khac ' + partsWithoutCmd); // Trick parseOtherCommand by prepending /khac
    const entryStr = `${amount >= 0 ? '+' : ''}${amount}:${name || 'Không tên'}`;
    await writeField(env, month, 'other', amount, entryStr); fieldName = 'Tiền khác';
  } else {
    await sendMessage(env, chatId, '❌ Chỉ sửa được: luong, an, no, khac');
    return;
  }
  console.log(`[EDIT] ${month} field:${field} amount:${amount} by:${userName}`);

  const result = await recalcSurplus(env, month);
  if (result) {
    await sendMessage(env, chatId,
      `✅ Đã sửa ${fieldName} → ${formatMoney(amount)}\n\n` +
      buildMonthReport(month, result.row.luong, result.row.tien_an, result.row.tien_no, result.row.tien_khac || 0, result.row.ten_khac || null, result.surplus, result.cumul, result.row.chi_tiet_an || null)
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
  await sendMessage(env, chatId, buildMonthReport(month, row.luong, row.tien_an, row.tien_no, row.tien_khac || 0, row.ten_khac || null, surplus, cumul, row.chi_tiet_an || null));
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
  const success = await sendMonthlyEmailToWife(env, month, row.luong, row.tien_an, row.tien_no, row.tien_khac || 0, row.ten_khac || null, surplus, row.tich_luy, row.bang_luong_file_id);
  
  if (success) {
    const { markEmailSent, buildMonthReport } = await import('./supabase');
    await markEmailSent(env, month);
    const reportText = buildMonthReport(month, row.luong, row.tien_an, row.tien_no, row.tien_khac || 0, row.ten_khac || null, surplus, row.tich_luy, row.chi_tiet_an || null);
    const attachNote = row.bang_luong_file_id ? '\n📎 Đã đính kèm file bảng lương PDF.' : '\n📎 Không có file bảng lương đính kèm.';
    await sendMessage(env, chatId, `✅ Đã gửi email báo cáo thủ công cho vợ (${env.WIFE_EMAIL})!${attachNote}\n\nNội dung đã gửi:\n${reportText}`);
  } else {
    await sendMessage(env, chatId, `❌ Lỗi khi gửi email! Chưa gửi được cho ${env.WIFE_EMAIL}. Hãy kiểm tra lại biến môi trường APPSCRIPT_WEBHOOK_URL hoặc script trên Google Apps Script.`);
  }
}

// ── /web ───────────────────────────────────────────────────
async function handleWeb(env: Env, chatId: number): Promise<void> {
  await sendMessage(env, chatId, 
    '🌐 **WEB DASHBOARD**\n\n' +
    'Truy cập link bên dưới để xem biểu đồ và nhập dữ liệu:\n' +
    '👉 https://xay-chuong.pages.dev/'
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

// ── /menu & Callbacks ──────────────────────────────────────
async function sendMenu(env: Env, chatId: number): Promise<void> {
  const keyboard = {
    inline_keyboard: [
      [
        { text: '💴 Nhập Lương', callback_data: 'btn_luong' },
        { text: '🍱 Tiền Ăn', callback_data: 'btn_an' }
      ],
      [
        { text: '💳 Tiền Nợ', callback_data: 'btn_no' },
        { text: '📦 Tiền Khác', callback_data: 'btn_khac' }
      ]
    ]
  };
  await sendMessage(env, chatId, '👇 Chọn mục bạn muốn nhập (hoặc gõ lệnh trực tiếp):', keyboard);
}

async function handleCallback(env: Env, chatId: number, data: string, cbId: string): Promise<void> {
  await answerCallbackQuery(env, cbId);

  if (data === 'btn_luong') {
    await sendMessage(env, chatId, '💴 Vui lòng nhập số tiền Lương (ví dụ: 20万, 200000):', { force_reply: true });
  } else if (data === 'btn_an') {
    await sendMessage(env, chatId, '🍱 Vui lòng nhập số tiền Ăn (ví dụ: 5万, 50000):', { force_reply: true });
  } else if (data === 'btn_no') {
    await sendMessage(env, chatId, '💳 Vui lòng nhập số tiền Nợ (ví dụ: 3万, 30000):', { force_reply: true });
  } else if (data === 'btn_khac') {
    await sendMessage(env, chatId, '📦 Vui lòng nhập Tiền Khác (ví dụ: +1万 Thưởng, -5000 Mua đồ):', { force_reply: true });
  }
}

// ── /giupdo ────────────────────────────────────────────────
async function handleHelp(env: Env, chatId: number): Promise<void> {
  const help =
    '💡 HƯỚNG DẪN SỬ DỤNG\n\n' +
    '📋 NHẬP HÀNG THÁNG (theo thứ tự):\n' +
    '1️⃣ /luong 20万  — nhập lương\n' +
    '2️⃣ /an 5万      — nhập tiền ăn\n' +
    '3️⃣ /no 3万      — nhập tiền nợ\n' +
    '4️⃣ /khac -2万 Mua quà (Tuỳ chọn)\n\n' +
    '📊 XEM BÁO CÁO:\n' +
    '/thang          — báo cáo tháng này\n' +
    '/thang 2024-01  — báo cáo tháng cụ thể\n' +
    '/tichluy       — tổng dư các tháng\n' +
    '/nam            — báo cáo năm hiện tại\n' +
    '/sosanh        — so sánh với tháng trước\n\n' +
    '✏️ SỬA / XÓA:\n' +
    '/sualuong 21万\n' +
    '/suaan 6万\n' +
    '/suano 4万\n' +
    '/suakhac +1万\n' +
    '/xoakhac 1     — xóa mục tiền khác số 1\n' +
    '/web            — lấy link xem web dashboard\n' +
    '/guimail       — gửi email báo cáo ngay cho vợ\n\n' +
    '💴 CÁCH NHẬP SỐ TIỀN:\n' +
    '20万  → ¥200,000\n' +
    '1.5万 → ¥15,000\n' +
    '5000  → ¥5,000\n' +
    '500円 → ¥500';
  await sendMessage(env, chatId, help);
}
