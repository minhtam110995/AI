// SePay gọi vào đây mỗi khi tài khoản ngân hàng nhận tiền.
// Tìm mã đơn (TTA + số) trong nội dung chuyển khoản → kích hoạt / cộng hạn gói.
// Cấu hình trong SePay: Tích hợp Webhooks → URL: https://<project>.supabase.co/functions/v1/sepay-webhook
//   Kiểu chứng thực: API Key → điền đúng giá trị SEPAY_API_KEY đã đặt cho function.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { json, findOrderCode, safeEqual } from '../_shared/payos.ts';

const env = (k: string) => Deno.env.get(k) ?? '';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ success: true });
  // SePay gửi header: Authorization: Apikey <SEPAY_API_KEY>
  const got = (req.headers.get('Authorization') ?? '').replace(/^Apikey\s+/i, '');
  const key = env('SEPAY_API_KEY');
  if (!key || !safeEqual(got, key)) return json({ success: false, error: 'unauthorized' }, 401);

  const t = await req.json().catch(() => null);
  if (!t) return json({ success: false, error: 'bad body' }, 400);
  if (t.transferType !== 'in') return json({ success: true, note: 'not incoming' });

  const orderCode = findOrderCode(`${t.code ?? ''} ${t.content ?? ''} ${t.description ?? ''}`);
  if (!orderCode) return json({ success: true, note: 'no order code' }); // tiền vào không phải của tiện ích

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const ref = String(t.id ?? t.referenceCode ?? '');
  const { data, error } = await admin.rpc('apply_payment', { p_order_code: orderCode, p_amount: Number(t.transferAmount) });
  if (error) return json({ success: false, error: error.message }, 500);
  if (data?.ok && ref) await admin.from('payments').update({ bank_ref: ref }).eq('order_code', orderCode).is('bank_ref', null);
  return json({ success: true, result: data });
});
