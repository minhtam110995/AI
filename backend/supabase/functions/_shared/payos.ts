// Tiện ích chung cho thanh toán (PayOS / chuyển khoản SePay): bảng giá, ký HMAC-SHA256, CORS.
// Bảng giá (VND) — sửa tại đây rồi deploy lại các function.
export const PRICES: Record<string, Record<number, number>> = {
  pro: { 1: 199000, 3: 537000, 12: 1910000 },   // 3 tháng giảm 10%, 12 tháng giảm 20%
  team: { 1: 499000, 3: 1347000, 12: 4790000 },
};

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export async function hmacHex(key: string, text: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Chuỗi ký của PayOS: các trường xếp theo tên (a→z), dạng key=value nối bằng &
export function signString(data: Record<string, unknown>): string {
  return Object.keys(data).sort().map((k) => {
    const v = data[k];
    return `${k}=${v === null || v === undefined || v === 'null' || v === 'undefined' ? '' : Array.isArray(v) ? JSON.stringify(v) : v}`;
  }).join('&');
}

// So sánh chữ ký không lộ thời gian
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Mã đơn: luôn đúng 9 chữ số, ngắn để khách dễ ghi khi chuyển khoản tay
export const newOrderCode = () => 100_000_000 + Math.floor(Math.random() * 900_000_000);
// Nội dung chuyển khoản: chỉ chữ + số (ngân hàng hay bỏ dấu cách / ký tự đặc biệt)
export const TRANSFER_PREFIX = 'TTA';
export const transferContent = (orderCode: number) => `${TRANSFER_PREFIX}${orderCode}`;
// Tìm mã đơn trong nội dung ngân hàng gửi về (cho phép dấu cách / chấm / gạch giữa TTA và số)
export const findOrderCode = (text: string): number | null => {
  const m = String(text || '').toUpperCase().match(new RegExp(TRANSFER_PREFIX + '[\\s.\\-_]*(\\d{9})(?!\\d)'));
  return m ? Number(m[1]) : null;
};
