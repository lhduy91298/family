import { handleWebhook }       from './bot';
import { dailySalaryCheck,
         checkIncompleteReminder,
         sendMonthlyReport }   from './cron';

export interface Env {
  SUPABASE_URL:         string;
  SUPABASE_SERVICE_KEY: string;
  TELEGRAM_BOT_TOKEN:   string;
  HUSBAND_ID:           string;
  HUSBAND_NAME?:        string;
  MONTHLY_FOOD_BUDGET?: string;
  MONTHLY_DEBT?:        string;
  RESEND_API_KEY?:      string;
  WIFE_EMAIL?:          string;
}

export default {
  // Nhận webhook từ Telegram
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Family Expense Bot is running.', { status: 200 });
    }
    try {
      await handleWebhook(request, env);
    } catch (err) {
      console.error('[fetch ERROR]', err);
    }
    return new Response('OK');
  },

  // Cron triggers
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    const cron = event.cron;
    console.log('[CRON]', cron);

    if (cron === '0 15 * * *') {
      await dailySalaryCheck(env);       // 00:00 JST mỗi ngày
      await checkIncompleteReminder(env); // Nhắc nếu chưa nhập đủ sau 3 ngày
    } else if (cron === '0 0 1 * *') {
      await sendMonthlyReport(env);      // 09:00 JST ngày 1
    }
  },
};
