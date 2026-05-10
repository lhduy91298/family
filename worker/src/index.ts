import { handleWebhook }       from './bot';
import { dailySalaryCheck,
         checkIncompleteReminder,
         autoSendEmailTask,
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
  // Nhận webhook từ Telegram hoặc gọi API từ Dashboard
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      const { handleApiOptions } = await import('./api');
      return handleApiOptions(request);
    }

    if (url.pathname === '/api/update' && request.method === 'POST') {
      const { handleApiUpdate } = await import('./api');
      return handleApiUpdate(request, env);
    }

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

    if (cron === '0 * * * *') {
      await autoSendEmailTask(env);
    } else if (cron === '0 15 * * *') {
      await dailySalaryCheck(env);       // 00:00 JST mỗi ngày
      await checkIncompleteReminder(env); // Nhắc nếu chưa nhập đủ sau 3 ngày
    } else if (cron === '0 0 1 * *') {
      await sendMonthlyReport(env);      // 09:00 JST ngày 1
    }
  },
};
