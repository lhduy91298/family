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
    const { field, amount: rawAmount, name, index } = data;
    
    if (!field) {
      return new Response(JSON.stringify({ error: 'Thiếu trường dữ liệu' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const month = getCurrentMonthJST();

    if (field === 'food_delete') {
      if (index === undefined) {
        return new Response(JSON.stringify({ error: 'Thiếu index để xóa' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const row = await getMonthRow(env, month);
      if (!row || !row.chi_tiet_an) {
        return new Response(JSON.stringify({ error: 'Không có chi tiết tiền ăn nào để xóa' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const entries = row.chi_tiet_an.split('|').map(part => {
        const match = part.match(/^([+-]?\d+):(.+)$/);
        if (match) return { amount: parseInt(match[1]), name: match[2].trim(), raw: part };
        return null;
      }).filter(Boolean) as { amount: number; name: string; raw: string }[];

      if (index < 0 || index >= entries.length) {
        return new Response(JSON.stringify({ error: 'Index không hợp lệ' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const deleted = entries[index];
      entries.splice(index, 1);

      const newName  = entries.map(e => `${e.amount}:${e.name}`).join('|');
      const newTotal = row.tien_an - deleted.amount;

      await writeField(env, month, 'food', newTotal, newName);
    } else if (field === 'other_delete') {
      if (index === undefined) {
        return new Response(JSON.stringify({ error: 'Thiếu index để xóa' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const row = await getMonthRow(env, month);
      if (!row || !row.ten_khac) {
        return new Response(JSON.stringify({ error: 'Không có mục tiền khác nào để xóa' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const entries = row.ten_khac.split('|').map(part => {
        const match = part.match(/^([+-]?\d+):(.+)$/);
        if (match) return { amount: parseInt(match[1]), name: match[2].trim(), raw: part };
        return null;
      }).filter(Boolean) as { amount: number; name: string; raw: string }[];

      if (index < 0 || index >= entries.length) {
        return new Response(JSON.stringify({ error: 'Index không hợp lệ' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      entries.splice(index, 1);

      const newTotal = entries.reduce((sum, e) => sum + e.amount, 0);
      const newName  = entries.map(e => `${e.amount >= 0 ? '+' : ''}${e.amount}:${e.name}`).join('|');

      await writeField(env, month, 'other', newTotal, newName || '');
    } else {
      if (rawAmount === undefined) {
        return new Response(JSON.stringify({ error: 'Thiếu số tiền' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const amount = Number(rawAmount);
      if (isNaN(amount)) {
        return new Response(JSON.stringify({ error: 'Số tiền không hợp lệ' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (field === 'salary' || field === 'debt' || field === 'food') {
        await writeField(env, month, field, amount);
      } else if (field === 'food_add') {
        const row = await getMonthRow(env, month);
        const oldAmount = row?.tien_an || 0;
        const newAmount = oldAmount + amount;
        
        const entryStr = `${amount}:${name || 'Ăn uống'}`;
        let newName = row?.chi_tiet_an || '';
        newName = newName ? `${newName}|${entryStr}` : entryStr;
        
        await writeField(env, month, 'food', newAmount, newName);
      } else if (field === 'other') {
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
