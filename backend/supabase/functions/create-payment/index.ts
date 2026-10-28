// Tạo link thanh toán PayOS cho người dùng đang đăng nhập.
// Body: { plan: 'pro' | 'team', months: 1 | 3 | 12 } → { checkoutUrl, orderCode, amount }
import { createClient } from 'npm:@supabase/supabase-js@2';
import { PRICES, cors, json, hmacHex } from '../_shared/payos.ts';

const env = (k: string) => Deno.env.get(k) ?? '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  // Xác thực người dùng bằng access token gửi từ tiện ích
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return json({ error: 'Phiên đăng nhập hết hạn, hãy đăng nhập lại.' }, 401);

  const { plan, months } = await req.json().catch(() => ({}));
  const amount = PRICES[plan]?.[Number(months)];
  if (!amount) return json({ error: 'Gói không hợp lệ.' }, 400);

  // Mã đơn: số nguyên duy nhất (PayOS yêu cầu ≤ 9007199254740991)
  const orderCode = Number(String(Date.now()).slice(-10) + String(Math.floor(Math.random() * 900) + 100));
  const description = `TTA ${plan.toUpperCase()} ${months}T`.slice(0, 25);
  const returnUrl = env('PAYMENT_RETURN_URL');
  const cancelUrl = env('PAYMENT_CANCEL_URL') || returnUrl;
  const signature = await hmacHex(env('PAYOS_CHECKSUM_KEY'),
    `amount=${amount}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${orderCode}&returnUrl=${returnUrl}`);

  const { error: insErr } = await admin.from('payments').insert({ order_code: orderCode, user_id: user.id, plan, months: Number(months), amount });
  if (insErr) return json({ error: 'Không tạo được đơn: ' + insErr.message }, 500);

  const res = await fetch('https://api-merchant.payos.vn/v2/payment-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-client-id': env('PAYOS_CLIENT_ID'), 'x-api-key': env('PAYOS_API_KEY') },
    body: JSON.stringify({
      orderCode, amount, description, returnUrl, cancelUrl, signature,
      buyerEmail: user.email, expiredAt: Math.floor(Date.now() / 1000) + 30 * 60,
      items: [{ name: `TikTok Analyzer ${plan.toUpperCase()} ${months} tháng`, quantity: 1, price: amount }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (body?.code !== '00' || !body?.data?.checkoutUrl) {
    await admin.from('payments').update({ status: 'cancelled' }).eq('order_code', orderCode);
    return json({ error: 'PayOS từ chối tạo đơn: ' + (body?.desc || res.status) }, 502);
  }
  await admin.from('payments').update({ checkout_url: body.data.checkoutUrl }).eq('order_code', orderCode);
  return json({ checkoutUrl: body.data.checkoutUrl, orderCode, amount });
});
