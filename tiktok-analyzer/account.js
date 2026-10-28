// Trang Tài khoản: đăng ký, đăng nhập, xem gói, mua / gia hạn, quản lý thiết bị.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vnd = (n) => Number(n).toLocaleString('vi-VN') + 'đ';
const next = new URLSearchParams(location.search).get('next');
let mode = 'login';

const FEATURES = {
  free: ['3 lượt tìm từ khoá / ngày, quét nhanh (~100 video)', 'Xem 20 video đầu của báo cáo', 'Phân tích kênh, nội dung, bình luận'],
  pro: ['Tìm từ khoá không giới hạn, quét rất sâu', 'Báo cáo đầy đủ, điểm xu hướng, công thức video', 'Theo dõi 10 từ khoá hằng ngày + thông báo', 'Lời thoại hàng loạt, xuất CSV', 'Dùng trên 2 máy'],
  team: ['Toàn bộ tính năng Pro', 'Theo dõi 50 từ khoá hằng ngày', 'Dùng trên 5 máy'],
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
      if (next === 'dashboard') { location.href = chrome.runtime.getURL('dashboard.html#keyword'); return; }
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
$('#toDash').onclick = () => (location.href = chrome.runtime.getURL('dashboard.html#keyword'));

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
    ${st.reason === 'checking' || st.reason === 'offline' ? '<p class="warn">⚠️ Chưa kiểm tra được gói với máy chủ (mất mạng?). Bấm “Kiểm tra lại”.</p>' : ''}
    <p class="muted">${st.paidPlan && st.paidPlan !== 'free' && exp ? (daysLeft > 0 ? `Gói ${esc(st.paidPlan.toUpperCase())} còn hạn đến <b>${exp.toLocaleDateString('vi-VN')}</b> (còn ${daysLeft} ngày).` : `Gói ${esc(st.paidPlan.toUpperCase())} đã hết hạn ngày ${exp.toLocaleDateString('vi-VN')}.`) : 'Bạn đang dùng gói Miễn phí.'}
      Máy đang dùng: ${st.devicesUsed ?? '–'} / ${st.deviceLimit ?? '–'}.</p>
    <div class="toolbar"><button id="recheck">🔄 Kiểm tra lại gói</button><span class="muted small">${st.checkedAt ? 'Kiểm tra lúc ' + new Date(st.checkedAt).toLocaleString('vi-VN') : ''}${st.error ? ' · ' + esc(st.error) : ''}</span></div>`;
  $('#recheck').onclick = async () => { await Auth.refresh(true); render(); };

  const P = TTA_CONFIG.PRICES || {};
  $('#plans').innerHTML = ['free', 'pro', 'team'].map((p) => `<div class="plan${st.plan === p ? ' cur' : ''}">
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
      chrome.tabs.create({ url: r.checkoutUrl });
      $('#payMsg').className = 'msg ok';
      $('#payMsg').textContent = `Đã mở trang thanh toán (mã đơn ${r.orderCode}, ${vnd(r.amount)}). Thanh toán xong quay lại đây, gói sẽ tự cập nhật trong vài giây.`;
      pollAfterPay();
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
