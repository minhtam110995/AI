// Trang Quản trị: chỉ email trong bảng admins (máy chủ tự kiểm tra quyền ở mọi hàm admin_*).
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vnd = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';
const d = (x) => (x ? new Date(x).toLocaleDateString('vi-VN') : '–');
const dt = (x) => (x ? new Date(x).toLocaleString('vi-VN') : '–');
let users = [];
const msg = (t, err) => { $('#msg').textContent = t; $('#msg').style.color = err ? 'var(--bad)' : 'var(--good)'; };

function status(u) {
  const live = u.plan !== 'free' && u.plan_expires_at && new Date(u.plan_expires_at) > Date.now();
  if (u.blocked) return '<span class="pill blocked">Bị khoá</span>';
  if (live && u.is_trial) return `<span class="pill trial">Dùng thử</span> đến ${d(u.plan_expires_at)}`;
  if (live) return `<span class="pill">Pro</span> đến ${d(u.plan_expires_at)}`;
  return `<span class="pill free">Miễn phí</span>${u.plan_expires_at ? ` <span class="muted small">(hết ${d(u.plan_expires_at)})</span>` : ''}`;
}

async function loadStats() {
  const s = await Auth.admin('admin_stats');
  const k = (v, l) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`;
  $('#kpis').innerHTML = k(s.users, 'Tài khoản') + k(s.new_7d, 'Đăng ký 7 ngày') + k(s.paying, 'Đang trả phí') + k(s.trial, 'Đang dùng thử')
    + k(s.expiring_7d, 'Sắp hết hạn (7 ngày)') + k(vnd(s.revenue_today), 'Doanh thu hôm nay') + k(vnd(s.revenue_month), 'Doanh thu tháng này') + k(vnd(s.revenue_all), 'Tổng doanh thu');
  const days = [];
  for (let i = 29; i >= 0; i--) { const x = new Date(Date.now() - i * 86400e3); days.push(x.toISOString().slice(0, 10)); }
  const map = Object.fromEntries((s.by_day || []).map((r) => [r.day, r]));
  const max = Math.max(1, ...days.map((x) => map[x]?.amount || 0));
  $('#bars').innerHTML = days.map((x) => `<div title="${x}: ${vnd(map[x]?.amount)} (${map[x]?.n || 0} đơn)" style="height:${Math.round(((map[x]?.amount || 0) / max) * 100)}%"></div>`).join('');
  $('#barsInfo').textContent = `30 ngày: ${vnd(days.reduce((a, x) => a + (map[x]?.amount || 0), 0))} · rê chuột lên cột để xem từng ngày`;
}

async function loadPending() {
  const list = await Auth.admin('admin_pending');
  $('#pending').innerHTML = list.length ? `<table><thead><tr><th class="l">Khách</th><th>Gói</th><th>Số tiền</th><th>Nội dung CK</th><th>Tạo lúc</th><th></th></tr></thead><tbody>${list.map((p) => `<tr>
    <td class="desc">${esc(p.email)}</td><td>${esc(p.plan.toUpperCase())} ${p.months}th</td><td><b>${vnd(p.amount)}</b></td><td><code>${esc(p.transfer_content || p.order_code)}</code></td><td>${dt(p.created_at)}</td>
    <td><button class="mini primary" data-paid="${p.order_code}" data-info="${esc(p.email)} · ${vnd(p.amount)}">Kích hoạt</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted small">Không có đơn chờ.</p>';
}

async function loadUsers() {
  users = await Auth.admin('admin_users', { p_q: $('#q').value.trim(), p_filter: $('#filter').value, p_limit: 300 });
  $('#users').innerHTML = users.length ? `<table><thead><tr><th class="l">Email</th><th>Trạng thái</th><th>Đã trả</th><th>Máy</th><th>Dùng gần nhất</th><th>Đăng ký</th><th>Ghi chú</th><th>Thao tác</th></tr></thead><tbody>${users.map((u) => `<tr data-row="${u.id}">
    <td class="desc">${esc(u.email)}</td><td>${status(u)}</td><td>${vnd(u.paid_total)}</td><td>${u.devices}</td><td>${dt(u.last_seen)}</td><td>${d(u.created_at)}</td><td class="small">${esc(u.note || '')}</td>
    <td style="white-space:nowrap"><button class="mini" data-ext="30" data-u="${u.id}">+30 ngày</button><button class="mini" data-ext="ask" data-u="${u.id}">+… ngày</button>
      <button class="mini" data-dev="${u.id}">Xoá máy</button><button class="mini" data-block="${u.blocked ? 0 : 1}" data-u="${u.id}">${u.blocked ? 'Mở khoá' : 'Khoá'}</button>
      <button class="mini" data-note="${u.id}">Ghi chú</button><button class="mini" data-detail="${u.id}">Chi tiết</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted small">Không có khách phù hợp.</p>';
}

async function loadAdmins() {
  const list = await Auth.admin('admin_admins', {});
  $('#admins').innerHTML = (list || []).map((e) => `${esc(e)} <button class="mini" data-rmadmin="${esc(e)}">Bỏ</button>`).join(' · ');
}

const act = async (fn, body, okText) => {
  try { await Auth.admin(fn, body); msg(okText); await Promise.all([loadUsers(), loadStats(), loadPending()]); } catch (e) { msg(e.message, true); }
};

document.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const u = b.dataset.u, email = users.find((x) => x.id === (u || b.dataset.dev || b.dataset.note || b.dataset.detail))?.email || '';
  if (b.dataset.ext) {
    const days = b.dataset.ext === 'ask' ? Number(prompt(`Cộng thêm bao nhiêu ngày Pro cho ${email}? (số âm để trừ)`, '7')) : 30;
    if (!days) return;
    const note = b.dataset.ext === 'ask' ? prompt('Lý do (không bắt buộc):', 'tặng') : 'tặng 30 ngày';
    if (confirm(`${days > 0 ? 'Cộng' : 'Trừ'} ${Math.abs(days)} ngày Pro cho ${email}?`)) act('admin_extend', { p_user: u, p_days: days, p_note: note }, `✓ Đã ${days > 0 ? 'cộng' : 'trừ'} ${Math.abs(days)} ngày cho ${email}.`);
  }
  if (b.dataset.dev && confirm(`Xoá toàn bộ máy của ${email}? Khách sẽ đăng nhập lại trên máy mới.`)) act('admin_clear_devices', { p_user: b.dataset.dev }, `✓ Đã xoá máy của ${email}.`);
  if (b.dataset.block) {
    const block = b.dataset.block === '1';
    if (confirm(`${block ? 'Khoá' : 'Mở khoá'} tài khoản ${email}?`)) act('admin_set', { p_user: u, p_blocked: block }, `✓ Đã ${block ? 'khoá' : 'mở khoá'} ${email}.`);
  }
  if (b.dataset.note) {
    const cur = users.find((x) => x.id === b.dataset.note)?.note || '';
    const t = prompt(`Ghi chú cho ${email}:`, cur);
    if (t != null) act('admin_set', { p_user: b.dataset.note, p_note: t }, '✓ Đã lưu ghi chú.');
  }
  if (b.dataset.detail) {
    const row = document.querySelector(`tr[data-row="${b.dataset.detail}"]`);
    if (row.nextElementSibling?.classList.contains('detail')) { row.nextElementSibling.remove(); return; }
    const r = await Auth.admin('admin_user_detail', { p_user: b.dataset.detail });
    const tr = document.createElement('tr');
    tr.className = 'detail';
    tr.innerHTML = `<td colspan="8"><b>Thanh toán:</b> ${r.payments.length ? r.payments.map((p) => `${d(p.created_at)} · ${p.plan.toUpperCase()} ${p.months}th · ${vnd(p.amount)} · ${p.status === 'paid' ? '✅' : p.status === 'pending' ? '⏳' : '✖'} <code>${esc(p.transfer_content || p.order_code)}</code>`).join(' | ') : 'chưa có'}
      <br><b>Máy:</b> ${r.devices.length ? r.devices.map((x) => `${esc(x.name || x.device_id)} (${dt(x.last_seen)})`).join(' | ') : 'chưa có'}</td>`;
    row.after(tr);
  }
  if (b.dataset.paid && confirm(`Kích hoạt đơn ${b.dataset.paid} (${b.dataset.info})? Chỉ bấm khi đã thấy tiền vào tài khoản.`)) act('admin_mark_paid', { p_order_code: Number(b.dataset.paid) }, `✓ Đã kích hoạt đơn ${b.dataset.paid}.`);
  if (b.dataset.rmadmin && confirm(`Bỏ quyền quản trị của ${b.dataset.rmadmin}?`)) { await Auth.admin('admin_admins', { p_remove: b.dataset.rmadmin }).catch((x) => msg(x.message, true)); loadAdmins(); }
});
$('#addAdmin').onclick = async () => { const v = $('#newAdmin').value.trim(); if (!v) return; await Auth.admin('admin_admins', { p_add: v }).catch((x) => msg(x.message, true)); $('#newAdmin').value = ''; loadAdmins(); };
let t;
$('#q').oninput = () => { clearTimeout(t); t = setTimeout(loadUsers, 300); };
$('#filter').onchange = loadUsers;
$('#reload').onclick = () => init();
$('#toAcc').onclick = () => (location.href = Auth.accountUrl());
$('#csv').onclick = () => {
  const q = (x) => { const s = String(x ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = [['email', 'trang_thai', 'het_han', 'dung_thu', 'da_tra', 'so_may', 'dang_ky', 'ghi_chu'],
    ...users.map((u) => [u.email, u.blocked ? 'khoa' : u.plan, u.plan_expires_at || '', u.is_trial ? 1 : 0, u.paid_total, u.devices, u.created_at, u.note || ''])];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + rows.map((r) => r.map(q).join(',')).join('\n')], { type: 'text/csv' }));
  a.download = `khach-hang-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
};

async function init() {
  const st = await Auth.refresh(true);
  if (!st.configured || !st.isAdmin) { $('#deny').classList.remove('hidden'); $('#app').classList.add('hidden'); $('#sub').textContent = st.email || ''; return; }
  $('#sub').textContent = `Đăng nhập: ${st.email}`;
  $('#app').classList.remove('hidden');
  try { await Promise.all([loadStats(), loadPending(), loadUsers(), loadAdmins()]); } catch (e) { msg(e.message, true); }
}
init();
