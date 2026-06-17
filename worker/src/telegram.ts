import { Env } from './index';

export async function sendMessage(env: Env, chatId: string | number, text: string, reply_markup?: any): Promise<void> {
  const body: any = { chat_id: chatId, text };
  if (reply_markup) {
    body.reply_markup = reply_markup;
  }
  
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    console.error('[sendMessage ERROR]', res.status, await res.text());
  }
}

export async function answerCallbackQuery(env: Env, callbackQueryId: string, text?: string): Promise<void> {
  const body: any = { callback_query_id: callbackQueryId };
  if (text) {
    body.text = text;
  }

  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    console.error('[answerCallbackQuery ERROR]', res.status, await res.text());
  }
}

// Lấy file_path từ file_id của Telegram
export async function getFilePath(env: Env, fileId: string): Promise<string | null> {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
  if (!res.ok) {
    console.error('[getFilePath ERROR]', res.status, await res.text());
    return null;
  }
  const data = await res.json() as any;
  return data?.result?.file_path || null;
}

// Tải file từ Telegram về dạng ArrayBuffer
export async function downloadTelegramFile(env: Env, filePath: string): Promise<ArrayBuffer | null> {
  const url = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error('[downloadTelegramFile ERROR]', res.status);
    return null;
  }
  return res.arrayBuffer();
}
