import { Env } from './index';

export async function sendMessage(env: Env, chatId: string | number, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    console.error('[sendMessage ERROR]', res.status, await res.text());
  }
}
