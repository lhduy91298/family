import { Env } from './index';
import { formatMoney, formatMonthDisplay } from './parser';

const DASHBOARD_URL = 'https://family-expense-dashboard.pages.dev';

export async function sendMonthlyEmailToWife(
  env: Env,
  month: string,
  luong: number,
  tienAn: number,
  tienNo: number,
  tienKhac: number,
  tenKhac: string | null,
  surplus: number,
  cumul: number,
): Promise<void> {
  if (!env.RESEND_API_KEY || !env.WIFE_EMAIL) {
    console.log('[EMAIL] Missing RESEND_API_KEY or WIFE_EMAIL, skipping.');
    return;
  }

  const monthLabel = formatMonthDisplay(month);
  const surplusColor = surplus >= 0 ? '#10b981' : '#ef4444';
  const surplusSign  = surplus >= 0 ? '+' : '-';

  const otherRow = tienKhac !== 0
    ? `<tr>
        <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;color:#6b7280;">
          📦 Tiền khác${tenKhac ? ` (${tenKhac})` : ''}
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;color:${tienKhac >= 0 ? '#10b981' : '#ef4444'};">
          ${tienKhac >= 0 ? '+' : '-'}${formatMoney(tienKhac)}
        </td>
      </tr>`
    : '';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f0f2f5;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="max-width:480px;margin:32px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#10b981 0%,#06b6d4 100%);padding:28px 24px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">🏠 Xây Chuồng</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Báo cáo chi tiêu ${monthLabel}</p>
    </div>

    <!-- Body -->
    <div style="padding:24px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;color:#6b7280;">💰 Lương</td>
          <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;color:#1e1e1e;">+${formatMoney(luong)}</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;color:#6b7280;">🍜 Tiền ăn</td>
          <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;color:#ef4444;">-${formatMoney(tienAn)}</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;color:#6b7280;">💳 Tiền nợ</td>
          <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;color:#ef4444;">-${formatMoney(tienNo)}</td>
        </tr>
        ${otherRow}
        <tr style="background:#f8fafc;">
          <td style="padding:14px 16px;font-weight:600;color:#1e1e1e;">📊 Dư tháng này</td>
          <td style="padding:14px 16px;text-align:right;font-weight:700;font-size:18px;color:${surplusColor};">${surplusSign}${formatMoney(surplus)}</td>
        </tr>
      </table>

      <!-- Cumulative -->
      <div style="background:linear-gradient(135deg,#10b981 0%,#06b6d4 100%);border-radius:12px;padding:20px;text-align:center;margin-bottom:20px;">
        <p style="margin:0 0 4px;color:rgba(255,255,255,0.85);font-size:12px;text-transform:uppercase;letter-spacing:1px;">Tổng tích lũy</p>
        <p style="margin:0;color:#fff;font-size:28px;font-weight:700;">${cumul >= 0 ? '+' : ''}${formatMoney(cumul)}</p>
      </div>

      <!-- CTA Button -->
      <a href="${DASHBOARD_URL}" style="display:block;text-align:center;background:linear-gradient(135deg,#10b981,#06b6d4);color:#fff;text-decoration:none;padding:14px 24px;border-radius:12px;font-weight:600;font-size:15px;">
        📈 Xem Dashboard chi tiết
      </a>
    </div>

    <!-- Footer -->
    <div style="padding:16px 24px;text-align:center;color:#9ca3af;font-size:12px;border-top:1px solid #f0f0f0;">
      Email tự động từ Xây Chuồng 🏠
    </div>
  </div>
</body>
</html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Xây Chuồng <onboarding@resend.dev>',
        to: [env.WIFE_EMAIL],
        subject: `🏠 Báo cáo chi tiêu ${monthLabel} — Dư: ${surplusSign}${formatMoney(surplus)}`,
        html: html,
      }),
    });

    if (res.ok) {
      console.log(`[EMAIL] Sent monthly report for ${month} to ${env.WIFE_EMAIL}`);
    } else {
      const errText = await res.text();
      console.error(`[EMAIL] Failed to send: ${res.status}`, errText);
    }
  } catch (err) {
    console.error('[EMAIL] Error sending email:', err);
  }
}
