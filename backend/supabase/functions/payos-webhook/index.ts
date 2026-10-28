// PayOS gọi vào đây khi khách thanh toán xong. Kiểm tra chữ ký rồi cộng thời hạn gói.
// Đăng ký URL này trong PayOS: Kênh thanh toán → Webhook URL
//   https://<project>.supabase.co/functions/v1/payos-webhook
import { createClient } from 'npm:@supabase/supabase-js@2';
import { json, hmacHex, signString, safeEqual } from '../_shared/payos.ts';

const env = (k: string) => Deno.env.get(k) ?? '';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: true }); // PayOS có thể gọi thử để kiểm tra URL
  const body = await req.json().catch(() => null);
  if (!body?.data || !body?.signature) return json({ ok: true, note: 'no data' });

  const expected = await hmacHex(env('PAYOS_CHECKSUM_KEY'), signString(body.data));
  if (!safeEqual(expected, String(body.signature))) return json({ error: 'bad signature' }, 400);

  // Chỉ xử lý giao dịch thành công
  if (body.code !== '00' || body.data.code !== '00') return json({ ok: true, note: 'not paid' });

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const { data, error } = await admin.rpc('apply_payment', { p_order_code: Number(body.data.orderCode), p_amount: Number(body.data.amount) });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, result: data });
});
