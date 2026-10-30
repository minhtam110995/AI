// Tạo đơn thanh toán cho người dùng đang đăng nhập.
// Body: { plan: 'pro' | 'team', months: 1 | 3 | 12 }
// PAYMENT_PROVIDER = 'bank' (mặc định): chuyển khoản vào tài khoản ngân hàng (cá nhân) + mã VietQR, SePay xác nhận tự động
//   → { orderCode, amount, transfer: { bankId, account, accountName, content, qrUrl } }
// PAYMENT_PROVIDER = 'payos': link thanh toán PayOS → { orderCode, amount, checkoutUrl }
import { createClient } from 'npm:@supabase/supabase-js@2';
import { PRICES, cors, json, hmacHex, newOrderCode, transferContent } from '../_shared/payos.ts';

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

  const provider = env('PAYMENT_PROVIDER') || 'bank';
  const orderCode = newOrderCode();

  // ---------- Chuyển khoản ngân hàng (tài khoản cá nhân) ----------
  if (provider === 'bank') {
    // Mặc định: tài khoản nhận tiền của Viral Finder (đặt BANK_* trong Secrets để đổi)
    const bankId = env('BANK_ID') || 'BIDV', account = env('BANK_ACCOUNT') || '1590410793', accountName = env('BANK_ACCOUNT_NAME') || 'NGUYEN MINH TAM';
    if (!bankId || !account) return json({ error: 'Máy chủ chưa cấu hình tài khoản nhận tiền.' }, 500);
    // Đơn chờ thanh toán cùng gói trong 30 phút qua → dùng lại, tránh khách chuyển 2 lần cho 2 mã khác nhau
    const { data: open } = await admin.from('payments').select('order_code, amount, transfer_content')
      .eq('user_id', user.id).eq('plan', plan).eq('months', Number(months)).eq('status', 'pending')
      .gte('created_at', new Date(Date.now() - 30 * 60e3).toISOString()).order('created_at', { ascending: false }).limit(1);
    let code = open?.[0]?.order_code ?? orderCode;
    const content = open?.[0]?.transfer_content ?? transferContent(code);
    if (!open?.[0]) {
      const { error } = await admin.from('payments').insert({ order_code: code, user_id: user.id, plan, months: Number(months), amount, transfer_content: content });
      if (error) return json({ error: 'Không tạo được đơn: ' + error.message }, 500);
    }
    // Ảnh VietQR (chuẩn Napas, mọi app ngân hàng quét được) — dịch vụ ảnh công khai của VietQR.io
    const qrUrl = `https://img.vietqr.io/image/${encodeURIComponent(bankId)}-${encodeURIComponent(account)}-compact2.png?amount=${amount}`
      + `&addInfo=${encodeURIComponent(content)}&accountName=${encodeURIComponent(accountName)}`;
    return json({ orderCode: code, amount, transfer: { bankId, bankName: env('BANK_NAME') || bankId, account, accountName, content, qrUrl } });
  }

  // ---------- PayOS ----------
  const description = `VF ${plan.toUpperCase()} ${months}T`.slice(0, 25);
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
      items: [{ name: `Viral Finder ${plan.toUpperCase()} ${months} tháng`, quantity: 1, price: amount }],
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
