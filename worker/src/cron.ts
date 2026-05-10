import { Env }              from './index';
import { sendMessage }      from './telegram';
import {
  getMonthRow,
  calcCumulativeSurplus, buildMonthReport,
} from './supabase';
import {
  getCurrentMonthJST, getLastMonthJST,
  formatMonthDisplay, isTodaySalaryReminderDay,
  getSalaryReminderDay
} from './parser';

// Chạy mỗi ngày 14:00 JST (05:00 UTC)
export async function dailySalaryCheck(env: Env): Promise<void> {
  if (!isTodaySalaryReminderDay()) {
    console.log('[SALARY_CHECK] Hom nay khong phai ngay nhac luong.');
    return;
  }
  const month = getCurrentMonthJST();
  const row   = await getMonthRow(env, month);
  if (row && row.luong > 0) {
    console.log('[SALARY_CHECK] Da co luong, bo qua.');
    return;
  }

  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dow15  = new Date(Date.UTC(nowJST.getUTCFullYear(), nowJST.getUTCMonth(), 15)).getUTCDay();
  const note   = (dow15 === 6 || dow15 === 0)
    ? '\n(Ngày 15 là cuối tuần nên nhắc sớm hôm nay)' : '';

  await sendMessage(env, env.HUSBAND_ID,
    `🔔 Hôm nay là ngày nhận lương! ${note}\n\n` +
    `Nhập nhanh qua web: https://family-expense-dashboard.pages.dev/\n` +
    `Hoặc gõ /luong [số tiền] để ghi nhận ngay!`
  );
  console.log('[SALARY_CHECK] Da gui nhac luong', month);
}

// Chạy mỗi giờ (0 * * * *)
export async function autoSendEmailTask(env: Env): Promise<void> {
  const { getUnsentCompletedMonths, markEmailSent } = await import('./supabase');
  const { sendMonthlyEmailToWife } = await import('./email');
  const { getSalaryReminderDay, formatMonthDisplay } = await import('./parser');
  const { sendMessage } = await import('./telegram');
  
  const rows = await getUnsentCompletedMonths(env);
  for (const row of rows) {
    if (row.luong > 0 && row.tien_an > 0 && row.tien_no > 0) {
      const updatedAt = row.cap_nhat_luc ? new Date(row.cap_nhat_luc).getTime() : 0;
      const now = Date.now();
      const diffHours = (now - updatedAt) / (1000 * 60 * 60);
      
      const [yearStr, monthStr] = row.thang.split('-');
      const salaryDate = getSalaryReminderDay(parseInt(yearStr), parseInt(monthStr));
      
      if (diffHours >= 2 && now >= salaryDate.getTime()) {
        const surplus = row.luong - row.tien_an - row.tien_no + (row.tien_khac || 0);
        await sendMonthlyEmailToWife(env, row.thang, row.luong, row.tien_an, row.tien_no, row.tien_khac || 0, row.ten_khac || null, surplus, row.tich_luy);
        await markEmailSent(env, row.thang);
        await sendMessage(env, env.HUSBAND_ID, `🤖 Đã tự động gửi email báo cáo tháng ${formatMonthDisplay(row.thang)} cho vợ (do đã đến ngày lương và đã nhập xong được hơn 2 tiếng).`);
      }
    }
  }
}

// Nhắc nếu chưa nhập đủ sau 3 ngày kể từ ngày lương
export async function checkIncompleteReminder(env: Env): Promise<void> {
  const month = getCurrentMonthJST();
  const row   = await getMonthRow(env, month);
  
  // Nếu chưa có row hoặc chưa nhập lương → không nhắc (dailySalaryCheck lo)
  if (!row || row.luong === 0) return;
  
  // Nếu đã nhập đủ → không nhắc
  if (row.luong > 0 && row.tien_an > 0 && row.tien_no > 0) return;
  
  // Kiểm tra đã qua 3 ngày kể từ ngày nhập lương chưa
  if (!row.nhap_luong_luc) return;
  const salaryDate = new Date(row.nhap_luong_luc);
  const now = new Date();
  const daysSince = Math.floor((now.getTime() - salaryDate.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysSince < 3) return;
  
  const missing: string[] = [];
  if (row.tien_an === 0) missing.push('🍜 Tiền ăn (/an)');
  if (row.tien_no === 0) missing.push('💳 Tiền nợ (/no)');
  
  const name = env.HUSBAND_NAME || 'Chong';
  const msg = 
    `⏰ NHẮC NHỞ NHẬP DỮ LIỆU\n\n` +
    `${name} ơi, ${formatMonthDisplay(month)} đã nhập lương nhưng chưa đủ:\n\n` +
    missing.join('\n') +
    `\n\nNhập ngay để hoàn tất báo cáo tháng này! 📊`;
  
  await sendMessage(env, env.HUSBAND_ID, msg);
  console.log('[INCOMPLETE_REMINDER] Da gui nhac', month, missing);
}

// Chạy ngày 1 mỗi tháng 09:00 JST (00:00 UTC)
export async function sendMonthlyReport(env: Env): Promise<void> {
  const lastMonth = getLastMonthJST();
  const row       = await getMonthRow(env, lastMonth);

  if (!row || row.luong === 0) {
    await sendMessage(env, env.HUSBAND_ID,
      `📊 TỔNG KẾT ${formatMonthDisplay(lastMonth).toUpperCase()}\n\n` +
      `⚠️ Tháng này chưa nhập dữ liệu.\nXem lại: /tháng ${lastMonth}`
    );
    return;
  }

  const surplus = row.du_thang || (row.luong - row.tien_an - row.tien_no + (row.tien_khac || 0));
  const cumul   = row.tich_luy || await calcCumulativeSurplus(env, lastMonth, surplus);
  let   report  = buildMonthReport(lastMonth, row.luong, row.tien_an, row.tien_no, row.tien_khac || 0, row.ten_khac || null, surplus, cumul);

  // Thêm ngày nhắc lương tháng mới
  const newMonth = getCurrentMonthJST();
  const [ny, nm] = newMonth.split('-').map(Number);
  const remDay   = getSalaryReminderDay(ny, nm);
  const remJST   = new Date(remDay.getTime() + 9 * 60 * 60 * 1000);
  const remStr   = `${String(remJST.getUTCDate()).padStart(2,'0')}/${String(remJST.getUTCMonth()+1).padStart(2,'0')}/${remJST.getUTCFullYear()}`;
  report += `\n\n📅 Ngày nhắc lương ${formatMonthDisplay(newMonth)}: ${remStr}`;

  await sendMessage(env, env.HUSBAND_ID, report);
  console.log('[MONTHLY] Da gui tong ket', lastMonth);
}
