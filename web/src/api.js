import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY chưa được set');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Lấy tất cả tháng, sắp xếp mới nhất trước
export async function fetchAllMonths() {
  const { data, error } = await supabase
    .from('theo_doi')
    .select('*')
    .order('thang', { ascending: false });

  if (error) throw error;
  return data || [];
}

// Lấy 1 tháng cụ thể
export async function fetchMonth(monthStr) {
  const { data, error } = await supabase
    .from('theo_doi')
    .select('*')
    .eq('thang', monthStr)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
  return data || null;
}
