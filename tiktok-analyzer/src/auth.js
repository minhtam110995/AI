// Đăng nhập / gói cước cho tiện ích. Dùng chung cho popup, Dashboard, trang Tài khoản và nền.
// Máy chủ: Supabase (Auth + hàm check_access + function create-payment). Xem thư mục backend/.
const Auth = (() => {
  const C = (typeof TTA_CONFIG !== 'undefined' && TTA_CONFIG) || {};
  const base = String(C.SUPABASE_URL || '').replace(/\/+$/, '');
  const configured = () => !!(base && C.SUPABASE_ANON_KEY);

  // Quyền của từng gói. 'none' = chưa đăng nhập / máy vượt giới hạn; 'dev' = chưa cấu hình máy chủ.
  const PLANS = {
    dev: { name: 'Nội bộ', searchesPerDay: Infinity, maxDepth: 100, watch: 50, bulkTranscript: true, csv: true, kwRows: Infinity },
    none: { name: 'Chưa đăng nhập', searchesPerDay: 0, maxDepth: 0, watch: 0, bulkTranscript: false, csv: false, kwRows: 0 },
    free: { name: 'Miễn phí', searchesPerDay: 3, maxDepth: 10, watch: 0, bulkTranscript: false, csv: false, kwRows: 20 },
    pro: { name: 'Pro', searchesPerDay: Infinity, maxDepth: 100, watch: 10, bulkTranscript: true, csv: true, kwRows: Infinity },
    team: { name: 'Team', searchesPerDay: Infinity, maxDepth: 100, watch: 50, bulkTranscript: true, csv: true, kwRows: Infinity },
  };
  const RECHECK_MS = 6 * 3600e3;      // hỏi lại máy chủ mỗi 6 giờ
  const OFFLINE_GRACE_MS = 3 * 86400e3; // mất mạng vẫn dùng gói đã biết tối đa 3 ngày

  const get = (k) => chrome.storage.local.get(k).then((o) => o[k]);
  const set = (o) => chrome.storage.local.set(o);

  async function deviceId() {
    let id = await get('ttDevice');
    if (!id) { id = 'd-' + crypto.randomUUID(); await set({ ttDevice: id }); }
    return id;
  }
  function deviceName() {
    const ua = navigator.userAgent;
    const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'Máy tính';
    return `Chrome · ${os}`;
  }

  // ---------- gọi máy chủ ----------
  async function call(path, { method = 'GET', body, token, headers = {} } = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { apikey: C.SUPABASE_ANON_KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    if (!res.ok) {
      const msg = data?.error_description || data?.msg || data?.message || data?.error || `Lỗi máy chủ (${res.status})`;
      const err = new Error(viMsg(msg));
      err.status = res.status;
      throw err;
    }
    return data;
  }
  // Dịch thông báo lỗi thường gặp của Supabase
  function viMsg(m) {
    const s = String(m);
    if (/invalid login credentials/i.test(s)) return 'Sai email hoặc mật khẩu.';
    if (/email not confirmed/i.test(s)) return 'Email chưa được xác nhận. Hãy mở hộp thư và bấm link xác nhận.';
    if (/already registered|already been registered/i.test(s)) return 'Email này đã có tài khoản. Hãy đăng nhập.';
    if (/password should be at least/i.test(s)) return 'Mật khẩu cần ít nhất 6 ký tự.';
    if (/rate limit|too many/i.test(s)) return 'Thao tác quá nhanh, hãy thử lại sau ít phút.';
    if (/invalid.*email|unable to validate email/i.test(s)) return 'Email không hợp lệ.';
    return s;
  }

  async function saveSession(s) {
    if (!s?.access_token) return null;
    const sess = {
      access_token: s.access_token, refresh_token: s.refresh_token,
      expires_at: (s.expires_at ? s.expires_at * 1000 : Date.now() + (s.expires_in || 3600) * 1000),
      user: { id: s.user?.id, email: s.user?.email },
    };
    await set({ ttAuth: sess });
    return sess;
  }

  // Access token còn hạn (tự làm mới khi sắp hết)
  async function token(force = false) {
    const s = await get('ttAuth');
    if (!s) return null;
    if (!force && s.expires_at - Date.now() > 60e3) return s.access_token;
    try {
      const r = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token } });
      return (await saveSession(r)).access_token;
    } catch (e) {
      if (e.status === 400 || e.status === 401) { await set({ ttAuth: null, ttAccess: null }); return null; } // phiên bị thu hồi
      throw e; // mất mạng: giữ phiên
    }
  }
  async function authed(path, opts = {}) {
    let t = await token();
    if (!t) throw Object.assign(new Error('Bạn chưa đăng nhập.'), { status: 401 });
    try { return await call(path, { ...opts, token: t }); } catch (e) {
      if (e.status !== 401) throw e;
      t = await token(true);
      if (!t) throw e;
      return call(path, { ...opts, token: t });
    }
  }

  // ---------- tài khoản ----------
  async function signIn(email, password) {
    const r = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: email.trim(), password } });
    await saveSession(r);
    await set({ ttAccess: null });
    return refresh(true);
  }
  async function signUp(email, password) {
    const r = await call('/auth/v1/signup', { method: 'POST', body: { email: email.trim(), password } });
    if (r?.access_token) { await saveSession(r); return { needConfirm: false, state: await refresh(true) }; }
    return { needConfirm: true }; // dự án bật xác nhận email
  }
  async function resetPassword(email) {
    await call('/auth/v1/recover', { method: 'POST', body: { email: email.trim() } });
  }
  async function signOut() {
    const s = await get('ttAuth');
    if (s?.access_token) await call('/auth/v1/logout', { method: 'POST', token: s.access_token }).catch(() => {});
    await set({ ttAuth: null, ttAccess: null });
  }

  // Hỏi máy chủ gói hiện tại (và ghi nhận máy này)
  async function refresh(force = false) {
    if (!configured()) return state();
    const cur = await get('ttAccess');
    if (!force && cur && Date.now() - cur.checkedAt < RECHECK_MS) return state();
    try {
      const a = await authed('/rest/v1/rpc/check_access', { method: 'POST', body: { p_device_id: await deviceId(), p_device_name: deviceName() } });
      await set({ ttAccess: { ...a, checkedAt: Date.now() } });
    } catch (e) {
      if (e.status === 401) await set({ ttAccess: null });
      else if (cur) await set({ ttAccess: { ...cur, error: e.message } }); // mất mạng: giữ kết quả cũ
    }
    return state();
  }

  // Trạng thái hiện tại (đọc nhanh từ bộ nhớ, không gọi mạng)
  async function state() {
    if (!configured()) return { configured: false, loggedIn: true, plan: 'dev', limits: PLANS.dev };
    const [s, a] = await Promise.all([get('ttAuth'), get('ttAccess')]);
    if (!s) return { configured: true, loggedIn: false, plan: 'none', limits: PLANS.none, reason: 'login' };
    const base0 = { configured: true, loggedIn: true, email: s.user?.email };
    if (!a) return { ...base0, plan: 'none', limits: PLANS.none, reason: 'checking' };
    if (Date.now() - a.checkedAt > OFFLINE_GRACE_MS) return { ...base0, plan: 'none', limits: PLANS.none, reason: 'offline' };
    if (!a.device_ok) return { ...base0, ...pick(a), plan: 'none', limits: PLANS.none, reason: 'device' };
    const plan = PLANS[a.plan] ? a.plan : 'free';
    return { ...base0, ...pick(a), plan, limits: PLANS[plan] };
  }
  const pick = (a) => ({ paidPlan: a.paid_plan, expiresAt: a.expires_at, deviceLimit: a.device_limit, devicesUsed: a.devices_used, checkedAt: a.checkedAt, error: a.error });

  // Đếm lượt tìm từ khoá trong ngày (gói Miễn phí bị giới hạn)
  async function useSearch() {
    const st = await refresh();
    const day = new Date().toDateString();
    const u = (await get('ttUsage')) || {};
    const n = u.day === day ? u.searches || 0 : 0;
    if (n >= st.limits.searchesPerDay) return { ok: false, st, used: n };
    await set({ ttUsage: { day, searches: n + 1 } });
    return { ok: true, st, used: n + 1 };
  }

  // ---------- thanh toán, thiết bị ----------
  const createPayment = (plan, months) => authed('/functions/v1/create-payment', { method: 'POST', body: { plan, months } });
  const payments = () => authed('/rest/v1/payments?select=order_code,plan,months,amount,status,created_at,paid_at&order=created_at.desc&limit=20');
  const devices = () => authed('/rest/v1/devices?select=device_id,name,last_seen&order=last_seen.desc');
  const removeDevice = (id) => authed(`/rest/v1/devices?device_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });

  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('vi-VN') : '–');
  const accountUrl = (next) => chrome.runtime.getURL('account.html' + (next ? '?next=' + encodeURIComponent(next) : ''));

  return { PLANS, configured, state, refresh, signIn, signUp, signOut, resetPassword, useSearch, createPayment, payments, devices, removeDevice, deviceId, fmtDate, accountUrl };
})();
