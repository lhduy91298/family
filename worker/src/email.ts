import { Env } from './index';
import { formatMoney, formatMonthDisplay } from './parser';
import { getFilePath, downloadTelegramFile } from './telegram';

const DASHBOARD_URL = 'https://xay-chuong.pages.dev';

// Helper: ArrayBuffer → Base64 (Cloudflare Workers compatible)
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

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
  payslipFileId?: string | null,
): Promise<boolean> {
  if (!env.APPSCRIPT_WEBHOOK_URL || !env.WIFE_EMAIL) {
    console.log('[EMAIL] Missing APPSCRIPT_WEBHOOK_URL or WIFE_EMAIL, skipping.');
    return false;
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

  // Chuẩn bị payload gửi sang AppScript
  const payload: Record<string, any> = {
    to: env.WIFE_EMAIL,
    subject: `🏠 Báo cáo chi tiêu ${monthLabel} — Dư: ${surplusSign}${formatMoney(surplus)}`,
    html: html,
  };

  // Nếu có file bảng lương PDF, tải về và đính kèm dạng Base64
  if (payslipFileId) {
    try {
      const filePath = await getFilePath(env, payslipFileId);
      if (filePath) {
        const fileBuffer = await downloadTelegramFile(env, filePath);
        if (fileBuffer) {
          const [y, m] = month.split('-');
          payload.attachmentBase64 = arrayBufferToBase64(fileBuffer);
          payload.attachmentName = `Bang_luong_${m}_${y}.pdf`;
          console.log(`[EMAIL] Attached payslip PDF for ${month} (${fileBuffer.byteLength} bytes)`);
        }
      }
    } catch (err) {
      console.error('[EMAIL] Error downloading payslip PDF, sending without attachment:', err);
      // Vẫn gửi email bình thường, chỉ không có file đính kèm
    }
  }

  try {
    const res = await fetch(env.APPSCRIPT_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await res.json() as any;

    if (result && result.success) {
      console.log(`[EMAIL] Sent monthly report for ${month} to ${env.WIFE_EMAIL} via AppScript`);
      return true;
    } else {
      console.error(`[EMAIL] Failed to send via AppScript:`, result);
      return false;
    }
  } catch (err) {
    console.error('[EMAIL] Error sending email:', err);
    return false;
  }
}
