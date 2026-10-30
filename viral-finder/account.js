// Trang Tài khoản: đăng ký, đăng nhập, xem gói, mua / gia hạn, quản lý thiết bị.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vnd = (n) => Number(n).toLocaleString('vi-VN') + 'đ';
const next = new URLSearchParams(location.search).get('next');
let mode = 'login';

const FEATURES = {
  free: ['Cột 📊 phân tích trên trang kênh TikTok', 'Lời thoại 5 video / ngày', '✨ ChatGPT / Claude 3 lần / ngày', 'Phân tích kênh trên Dashboard 1 kênh / ngày', 'Tìm từ khoá 3 lượt / ngày, xem 20 video', '1 máy'],
  pro: ['Không giới hạn lời thoại, ✨ ChatGPT / Claude, phân tích kênh, tìm từ khoá', 'Brief cho AI, bình luận khán giả, xuất CSV', 'Lấy lời thoại hàng loạt, báo cáo từ khoá đầy đủ, quét sâu', 'Theo dõi 10 từ khoá hằng ngày + thông báo', 'Dùng trên 2 máy'],
};

function setMode(m) {
  mode = m;
  $('#authTitle').textContent = m === 'login' ? 'Đăng nhập' : m === 'signup' ? 'Tạo tài khoản' : 'Lấy lại mật khẩu';
  $('#authBtn').textContent = m === 'login' ? 'Đăng nhập' : m === 'signup' ? 'Đăng ký' : 'Gửi email đặt lại mật khẩu';
  $('#pw').classList.toggle('hidden', m === 'reset');
  $('#pw').required = m !== 'reset';
  $('#pw2').classList.toggle('hidden', m !== 'signup');
  $('#toggle').textContent = m === 'login' ? 'Chưa có tài khoản? Đăng ký' : '← Quay lại đăng nhập';
  $('#forgot').classList.toggle('hidden', m !== 'login');
  msg('');
}
const msg = (t, cls = '') => { $('#authMsg').textContent = t; $('#authMsg').className = 'msg ' + cls; };

$('#toggle').onclick = () => setMode(mode === 'login' ? 'signup' : 'login');
$('#forgot').onclick = () => setMode('reset');
$('#authForm').onsubmit = async (e) => {
  e.preventDefault();
  const email = $('#email').value, pw = $('#pw').value;
  $('#authBtn').disabled = true;
  try {
    if (mode === 'login') {
      await Auth.signIn(email, pw);
      if (next === 'dashboard') { location.href = chrome.runtime.getURL('dashboard.html#content'); return; }
    } else if (mode === 'signup') {
      if (pw !== $('#pw2').value) throw new Error('Hai mật khẩu không khớp.');
      const r = await Auth.signUp(email, pw);
      if (r.needConfirm) { setMode('login'); msg('Đã tạo tài khoản. Hãy mở email và bấm link xác nhận, rồi đăng nhập.', 'ok'); return; }
    } else {
      await Auth.resetPassword(email);
      setMode('login'); msg('Đã gửi email đặt lại mật khẩu. Hãy kiểm tra hộp thư (cả mục Spam).', 'ok'); return;
    }
    await render();
  } catch (err) { msg(err.message, 'err'); } finally { $('#authBtn').disabled = false; }
};
$('#logout').onclick = async () => { await Auth.signOut(); render(); };
$('#toDash').onclick = () => (location.href = chrome.runtime.getURL('dashboard.html#content'));

async function render() {
  const st = await Auth.state();
  $('#dev').classList.toggle('hidden', st.configured);
  $('#authBox').classList.toggle('hidden', !st.configured || st.loggedIn);
  $('#accBox').classList.toggle('hidden', !st.configured || !st.loggedIn);
  $('#logout').classList.toggle('hidden', !st.configured || !st.loggedIn);
  $('#toDash').classList.toggle('hidden', st.configured && !st.loggedIn);
  $('#sub').textContent = st.loggedIn && st.configured ? `${st.email} · gói ${Auth.PLANS[st.plan]?.name || st.plan}` : '';
  if (!st.configured || !st.loggedIn) return;

  const exp = st.expiresAt && new Date(st.expiresAt);
  const daysLeft = exp ? Math.ceil((exp - Date.now()) / 86400e3) : null;
  $('#status').innerHTML = `<h2>Gói hiện tại: <span class="badge">${esc(Auth.PLANS[st.plan]?.name || st.plan)}</span></h2>
    ${st.reason === 'device' ? `<p class="warn">⚠️ Tài khoản đã dùng đủ ${st.deviceLimit} máy của gói. Xoá bớt máy cũ ở mục “Thiết bị đang dùng” rồi bấm “Kiểm tra lại”, hoặc nâng cấp gói.</p>` : ''}
    ${st.reason === 'blocked' ? `<p class="warn">⚠️ Tài khoản đang bị tạm khoá. ${esc(TTA_CONFIG.SUPPORT || '')}</p>` : ''}
    ${st.trialDenied ? '<p class="warn">Máy này đã dùng thử Pro bằng tài khoản khác nên tài khoản này không được dùng thử thêm.</p>' : ''}
    ${st.reason === 'checking' || st.reason === 'offline' ? '<p class="warn">⚠️ Chưa kiểm tra được gói với máy chủ (mất mạng?). Bấm “Kiểm tra lại”.</p>' : ''}
    <p class="muted">${st.isTrial && daysLeft > 0 ? `🎁 Bạn đang <b>dùng thử Pro</b> đến <b>${exp.toLocaleDateString('vi-VN')}</b> (còn ${daysLeft} ngày). Mua gói bất kỳ lúc nào: thời hạn được cộng nối tiếp.` : ''}${!st.isTrial && st.paidPlan && st.paidPlan !== 'free' && exp ? (daysLeft > 0 ? `Gói ${esc(st.paidPlan.toUpperCase())} còn hạn đến <b>${exp.toLocaleDateString('vi-VN')}</b> (còn ${daysLeft} ngày).` : `Gói ${esc(st.paidPlan.toUpperCase())} đã hết hạn ngày ${exp.toLocaleDateString('vi-VN')}.`) : st.isTrial && daysLeft > 0 ? '' : 'Bạn đang dùng gói Miễn phí.'}
      Máy đang dùng: ${st.devicesUsed ?? '–'} / ${st.deviceLimit ?? '–'}.</p>
    <div class="toolbar"><button id="recheck">🔄 Kiểm tra lại gói</button>${st.isAdmin ? '<button id="toAdmin" class="primary">🛠️ Trang Quản trị</button>' : ''}<span class="muted small">${st.checkedAt ? 'Kiểm tra lúc ' + new Date(st.checkedAt).toLocaleString('vi-VN') : ''}${st.error ? ' · ' + esc(st.error) : ''}</span></div>`;
  $('#recheck').onclick = async () => { await Auth.refresh(true); render(); };
  if ($('#toAdmin')) $('#toAdmin').onclick = () => (location.href = chrome.runtime.getURL('admin.html'));

  const P = TTA_CONFIG.PRICES || {};
  $('#plans').innerHTML = ['free', 'pro'].map((p) => `<div class="plan${st.plan === p ? ' cur' : ''}">
    <h3>${Auth.PLANS[p].name}${st.plan === p ? ' · đang dùng' : ''}</h3>
    <div class="price">${p === 'free' ? '0đ' : vnd(P[p]?.[1] || 0) + '<span class="muted small"> / tháng</span>'}</div>
    <ul>${FEATURES[p].map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
    ${p === 'free' ? '' : `<div class="buy">${Object.entries(P[p] || {}).map(([m, a]) => `<button class="${m === '1' ? '' : 'primary'}" data-plan="${p}" data-months="${m}">${m} tháng · ${vnd(a)}${m !== '1' ? ` <span class="small">(~${vnd(Math.round(a / m / 1000) * 1000)}/th)</span>` : ''}</button>`).join('')}</div>`}
  </div>`).join('');
  $('#plans').querySelectorAll('[data-plan]').forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    $('#payMsg').className = 'msg'; $('#payMsg').textContent = 'Đang tạo đơn thanh toán…';
    try {
      const r = await Auth.createPayment(b.dataset.plan, Number(b.dataset.months));
      $('#payMsg').textContent = '';
      if (r.transfer) showTransfer(r, b.dataset.plan, b.dataset.months);
      else {
        chrome.tabs.create({ url: r.checkoutUrl });
        $('#payMsg').className = 'msg ok';
        $('#payMsg').textContent = `Đã mở trang thanh toán (mã đơn ${r.orderCode}, ${vnd(r.amount)}). Thanh toán xong quay lại đây, gói sẽ tự cập nhật trong vài giây.`;
        pollAfterPay();
      }
    } catch (e) { $('#payMsg').className = 'msg err'; $('#payMsg').textContent = e.message; } finally { b.disabled = false; }
  }));

  Auth.devices().then((list) => {
    Auth.deviceId().then((me) => {
      $('#devices').innerHTML = list.length ? `<table><tbody>${list.map((d) => `<tr><td class="desc">${esc(d.name || d.device_id)}${d.device_id === me ? ' <span class="badge">máy này</span>' : ''}<br><span class="muted small">Dùng gần nhất ${new Date(d.last_seen).toLocaleString('vi-VN')}</span></td>
        <td>${d.device_id === me ? '' : `<button class="mini" data-rm="${esc(d.device_id)}">Xoá</button>`}</td></tr>`).join('')}</tbody></table>` : 'Chưa có máy nào.';
      $('#devices').querySelectorAll('[data-rm]').forEach((b) => (b.onclick = async () => {
        if (!confirm('Xoá máy này khỏi tài khoản? Máy đó sẽ phải đăng nhập lại.')) return;
        await Auth.removeDevice(b.dataset.rm).catch((e) => alert(e.message));
        await Auth.refresh(true); render();
      }));
    });
  }).catch((e) => ($('#devices').textContent = e.message));
  Auth.payments().then((list) => {
    const ST = { pending: '⏳ Chờ thanh toán', paid: '✅ Đã thanh toán', cancelled: '✖ Đã huỷ' };
    $('#payments').innerHTML = list.length ? `<table><tbody>${list.map((p) => `<tr><td class="desc">${esc(p.plan.toUpperCase())} ${p.months} tháng · ${vnd(p.amount)}<br><span class="muted small">Mã ${p.order_code} · ${new Date(p.created_at).toLocaleString('vi-VN')}</span></td><td>${ST[p.status] || esc(p.status)}</td></tr>`).join('')}</tbody></table>` : 'Chưa có thanh toán nào.';
  }).catch((e) => ($('#payments').textContent = e.message));
}

// Khung chuyển khoản: mã VietQR + thông tin tài khoản + nội dung, tự chờ xác nhận
function showTransfer(r, plan, months) {
  const t = r.transfer;
  document.getElementById('payModal')?.remove();
  const m = document.createElement('div');
  m.id = 'payModal';
  const row = (k, v, copy) => `<tr><td>${k}</td><td><b${copy ? ' class="hl"' : ''}>${esc(v)}</b>${copy ? ` <button class="mini" data-copy="${esc(v)}">Copy</button>` : ''}</td></tr>`;
  m.innerHTML = `<div class="pm-inner">
    <div class="pm-head"><div><h2>Hoàn tất thanh toán</h2><p class="muted small">Gói ${esc(plan.toUpperCase())} ${months} tháng — <b>${vnd(r.amount)}</b></p></div><button class="pm-x" title="Đóng">✕</button></div>
    <p class="muted small" style="text-align:center">Quét mã QR bằng ứng dụng ngân hàng để thanh toán</p>
    <div class="pm-qr"><img src="${esc(t.qrUrl)}" alt="Mã VietQR"></div>
    <table class="pm-tbl"><tbody>
      ${row('Ngân hàng', t.bankName)}${row('Số tài khoản', t.account, true)}${row('Tên người nhận', t.accountName)}
      ${row('Số tiền', vnd(r.amount))}${row('Nội dung chuyển khoản', t.content, true)}
    </tbody></table>
    <p class="muted small">Chuyển khoản tay thì nhập <b>đúng nội dung ${esc(t.content)}</b> và đúng số tiền. Sau khi chuyển, chờ vài giây — hệ thống tự kích hoạt gói cho <b>${esc($('#sub').textContent.split(' · ')[0])}</b>.</p>
    <p class="pm-wait" id="pmWait"><span class="spin"></span> Đang chờ xác nhận thanh toán…</p>
    <p class="muted small">Đã chuyển hơn 10 phút mà chưa kích hoạt? Liên hệ ${esc(TTA_CONFIG.SUPPORT || 'hỗ trợ')} kèm mã đơn <b>${r.orderCode}</b>.</p>
  </div>`;
  document.body.appendChild(m);
  const close = () => { clearInterval(timer); m.remove(); render(); };
  m.querySelector('.pm-x').onclick = close;
  m.onclick = (e) => { if (e.target === m) close(); };
  m.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => navigator.clipboard.writeText(b.dataset.copy).then(() => (b.textContent = '✓'))));
  m.querySelector('img').onerror = () => (m.querySelector('.pm-qr').innerHTML = '<p class="muted small">Không tải được ảnh QR — hãy chuyển khoản tay theo thông tin bên dưới.</p>');
  // Hỏi máy chủ 5 giây / lần xem đơn đã thanh toán chưa (tối đa 30 phút)
  let n = 0;
  const timer = setInterval(async () => {
    if (++n > 360) { clearInterval(timer); $('#pmWait').textContent = 'Hết thời gian chờ. Nếu đã chuyển khoản, bấm “Kiểm tra lại gói” hoặc liên hệ hỗ trợ.'; return; }
    const list = await Auth.payments().catch(() => []);
    if (list.find((p) => String(p.order_code) === String(r.orderCode))?.status === 'paid') {
      clearInterval(timer);
      await Auth.refresh(true);
      $('#pmWait').innerHTML = '✅ Đã nhận thanh toán — gói đã được kích hoạt!';
      $('#pmWait').classList.add('done');
      setTimeout(close, 2500);
    }
  }, 5000);
}

// Sau khi mở trang thanh toán: hỏi lại máy chủ vài lần để tự cập nhật gói
let polling = null;
function pollAfterPay() {
  clearInterval(polling);
  let n = 0;
  polling = setInterval(async () => {
    const before = (await Auth.state()).expiresAt;
    const st = await Auth.refresh(true);
    if (st.expiresAt !== before || ++n > 60) { clearInterval(polling); render(); }
  }, 10000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) Auth.refresh(true).then(render); });

setMode('login');
Auth.refresh().then(render);
