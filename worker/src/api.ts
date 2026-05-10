import { Env } from './index';
import { recalcSurplus } from './bot';
import { getMonthRow, writeField } from './supabase';
import { getCurrentMonthJST, parseAmountFromCommand } from './parser';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function handleApiOptions(request: Request): Promise<Response> {
  return new Response(null, { headers: corsHeaders });
}

export async function handleApiUpdate(request: Request, env: Env): Promise<Response> {
  try {
    const data = await request.json() as any;
    const { field, amount: rawAmount, name } = data;
    
    if (!field || rawAmount === undefined) {
      return new Response(JSON.stringify({ error: 'Thiếu trường dữ liệu' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const amount = Number(rawAmount);
    if (isNaN(amount)) {
      return new Response(JSON.stringify({ error: 'Số tiền không hợp lệ' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const month = getCurrentMonthJST();

    if (field === 'salary' || field === 'food' || field === 'debt') {
      await writeField(env, month, field, amount);
    } else if (field === 'other') {
      // Đối với tiền khác nhập từ web, chúng ta cộng dồn giống như bot
      const row = await getMonthRow(env, month);
      const oldAmount = row?.tien_khac || 0;
      const newAmount = oldAmount + amount;
      
      const entryStr = `${amount >= 0 ? '+' : ''}${amount}:${name || 'Không tên'}`;
      let newName = row?.ten_khac || '';
      newName = newName ? `${newName}|${entryStr}` : entryStr;
      
      await writeField(env, month, 'other', newAmount, newName);
    } else {
      return new Response(JSON.stringify({ error: 'Trường không hỗ trợ' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await recalcSurplus(env, month);
    
    return new Response(JSON.stringify({ success: true, message: 'Đã cập nhật thành công!' }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
    
  } catch (err: any) {
    console.error('[API ERROR]', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}
