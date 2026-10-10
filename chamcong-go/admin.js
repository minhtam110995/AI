'use strict';
/* ChấmCông Go — trang quản trị cho bộ phận nhân sự. */
(() => {
  const C = window.CCG_CORE, API = window.CCG;
  const { pad, esc, hm, dmy, dayKey, fromKey, keyToDmy, num, initials, relTime, KIND, REQ_TYPES, LEAVE_TYPES, STATUS, ROLES, DOW_SHORT } = C;
  const $root = document.getElementById('admin');

  const A = { session: null, me: null, company: null, users: [], locations: [], shifts: [], reqs: [], logs: [], range: null };
  const ui = { reqTab: 'pending', reqType: '', userQ: '', userDept: '', locSel: null, month: null };

  // ---------------------------------------------------------------- utils
  let toastTimer;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }
  const errMsg = e => (e && (e.userMessage || e.message)) || 'Có lỗi xảy ra';
  async function busy(btn, fn) {
    if (!btn || btn.disabled) return fn && !btn ? fn() : undefined;
    const html = btn.innerHTML; btn.disabled = true;
    btn.innerHTML = '<i class="icon-loader-circle spin"></i>Đang xử lý';
    try { return await fn(); } catch (e) { toast(errMsg(e)); } finally { if (btn.isConnected) { btn.disabled = false; btn.innerHTML = html; } }
  }
  const chip = s => { const [cls, txt] = STATUS[s] || STATUS.pending; return `<span class="chip ${cls}">${txt}</span>`; };
  const userBy = uid => A.users.find(u => u.uid === uid) || { name: '(đã xoá)', uid };
  const shiftOf = u => C.shiftFor(u, A.shifts);
  const startKeyOf = u => u.createdAt ? dayKey(u.createdAt) : null;
  const activeUsers = () => A.users.filter(u => u.active !== false);
  const logsOf = uid => A.logs.filter(l => l.uid === uid);
  const reqsOf = uid => A.reqs.filter(r => r.uid === uid);
  const reqTitle = r => r.type === 'leave' ? 'Nghỉ phép · ' + (LEAVE_TYPES[r.leaveType] || 'Phép năm') : REQ_TYPES[r.type].name;
  const monthKey = () => ui.month || dayKey(new Date()).slice(0, 7);
  const monthOptions = () => {
    const now = new Date(), out = [];
    for (let i = 0; i < 12; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); }
    return out.map(k => `<option value="${k}"${k === monthKey() ? ' selected' : ''}>Tháng ${+k.slice(5)}/${k.slice(0, 4)}</option>`).join('');
  };
  const pendingLogs = () => A.logs.filter(l => l.status === 'pending');

  async function loadBase() {
    const [company, users, locations, shifts, reqs] = await Promise.all([API.getCompany(), API.listUsers(), API.listLocations(), API.listShifts(), API.allRequests()]);
    Object.assign(A, { company, users, locations, shifts, reqs });
  }
  async function loadLogs(from, to) {
    if (A.range && A.range[0] <= from && A.range[1] >= to) return;
    A.logs = await API.logsRange(from, to);
    A.range = [from, to];
  }
  const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return dayKey(d); };

  function modal(title, body, footer, { size = '' } = {}) {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal ${size}" role="dialog" aria-label="${esc(title)}">
      <div class="modal-h"><h3>${esc(title)}</h3><button class="icon-b" data-close aria-label="Đóng"><i class="icon-x"></i></button></div>
      ${body}${footer ? `<div class="modal-f">${footer}</div>` : ''}</div>`;
    bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-close]')) bg.remove(); });
    document.body.appendChild(bg);
    const first = bg.querySelector('input, select, textarea');
    if (first && !first.disabled) first.focus();
    return bg;
  }
  const confirmModal = (title, msg, okText, onOk) => {
    const m = modal(title, `<div class="modal-b"><div class="full">${esc(msg)}</div></div>`, `<button class="btn btn-o" data-close>Hủy</button><button class="btn btn-p" id="okBtn">${esc(okText)}</button>`, { size: 'sm' });
    m.querySelector('#okBtn').onclick = e => busy(e.currentTarget, async () => { await onOk(); m.remove(); });
  };

  // ---------------------------------------------------------------- router / shell
  const NAV = [
    ['overview', 'layout-dashboard', 'Tổng quan'], ['users', 'users', 'Nhân viên'], ['locations', 'map-pin', 'Địa điểm chấm công'],
    ['shifts', 'calendar-clock', 'Ca làm việc'], ['approvals', 'file-check-2', 'Duyệt đơn'], ['timesheet', 'table-2', 'Bảng công'],
    ['reports', 'chart-column', 'Báo cáo'], ['settings', 'settings', 'Cài đặt']
  ];
  const route = () => (location.hash.replace(/^#\/?/, '') || 'overview').split('?')[0];
  window.addEventListener('hashchange', () => render());

  function shell(active) {
    const pend = A.reqs.filter(r => r.status === 'pending').length + pendingLogs().length;
    const title = (NAV.find(n => n[0] === active) || NAV[0])[2];
    $root.innerHTML = `<div class="shell">
      <aside class="side">
        <div class="brand"><div class="logo"><i class="icon-scan-face"></i></div><div><b>ChấmCông Go</b><small>${esc(A.company.name)}</small></div></div>
        <nav class="nav">${NAV.map(([k, icon, label]) => `<a href="#/${k}" class="${k === active ? 'on' : ''}"><i class="icon-${icon}"></i>${label}${k === 'approvals' && pend ? `<span class="cnt">${pend}</span>` : ''}</a>`).join('')}</nav>
        <div class="side-foot">
          <a class="side-app" href="index.html"><i class="icon-smartphone"></i>Mở app chấm công</a>
          <div class="mode-note">${API.mode === 'demo' ? 'Chế độ dùng thử · dữ liệu lưu trong trình duyệt này' : 'Đang kết nối Firebase · mã công ty ' + esc(A.company.code)}</div>
        </div>
      </aside>
      <main class="main">
        <header class="top">
          <div><h1>${title}</h1><div class="crumb">${esc(A.company.name)} · ${C.longDate(new Date())}</div></div>
          <div class="sp"></div>
          <button class="btn btn-o btn-sm" id="refresh" title="Tải lại dữ liệu"><i class="icon-refresh-cw"></i>Tải lại</button>
          <div class="me" id="me" tabindex="0">
            <div class="av">${esc(initials(A.me.name))}</div>
            <div><b>${esc(A.me.name)}</b><small>${esc(A.me.title || 'Quản trị')}</small></div>
            <i class="icon-chevron-down muted"></i>
            <div class="menu" id="meMenu">
              <a href="index.html"><i class="icon-smartphone"></i>App chấm công</a>
              <a href="#/settings"><i class="icon-settings"></i>Cài đặt</a>
              <button id="logout"><i class="icon-log-out"></i>Đăng xuất</button>
            </div>
          </div>
        </header>
        <div class="page" id="page"><div class="empty"><i class="icon-loader-circle spin"></i>Đang tải...</div></div>
      </main>
    </div>`;
    document.getElementById('me').onclick = e => { if (!e.target.closest('.menu')) document.getElementById('meMenu').classList.toggle('open'); };
    document.getElementById('logout').onclick = async () => { await API.signOut(); A.session = null; render(); };
    document.getElementById('refresh').onclick = e => busy(e.currentTarget, async () => { A.range = null; await loadBase(); render(); toast('Đã tải lại dữ liệu'); });
    return document.getElementById('page');
  }
  document.addEventListener('click', e => { const m = document.getElementById('meMenu'); if (m && !e.target.closest('#me')) m.classList.remove('open'); });

  async function render() {
    document.querySelectorAll('.modal-bg').forEach(m => m.remove());
    if (!A.session) return renderLogin();
    const r = route();
    const page = shell(r);
    const pages = { overview: pOverview, users: pUsers, locations: pLocations, shifts: pShifts, approvals: pApprovals, timesheet: pTimesheet, reports: pReports, settings: pSettings };
    try { await (pages[r] || pOverview)(page); }
    catch (e) { console.error(e); page.innerHTML = `<div class="card empty"><i class="icon-circle-alert"></i>${esc(errMsg(e))}</div>`; }
  }

  // ---------------------------------------------------------------- login
  function renderLogin(msg) {
    const lastCode = localStorage.getItem('ccg.lastCode') || (API.mode === 'demo' ? 'DEMO' : '');
    $root.innerHTML = `<div class="login-page">
      <div class="login-art">
        <div class="logo"><i class="icon-scan-face"></i></div>
        <div><h1>Quản lý chấm công<br>cho cả công ty</h1><p>Theo dõi ai có mặt, ai đi muộn, duyệt đơn từ và xuất bảng công cuối tháng trên một màn hình.</p></div>
        <div style="font-size:13px;opacity:.8">ChấmCông Go · Trang quản trị</div>
        <span class="ring" style="width:520px;height:520px;right:-180px;top:-140px"></span>
        <span class="ring" style="width:340px;height:340px;right:-90px;top:-50px"></span>
      </div>
      <div class="login-form">
        <form id="aLogin">
          <h2>Đăng nhập quản trị</h2>
          <div class="sub">Dành cho bộ phận nhân sự và quản lý.</div>
          ${msg ? `<div class="chip bad" style="white-space:normal;padding:10px 12px;border-radius:12px">${esc(msg)}</div>` : ''}
          <div class="field"><label for="aCode">Mã công ty</label><input class="input" id="aCode" name="code" required value="${esc(lastCode)}"></div>
          <div class="field"><label for="aAcc">Tài khoản</label><input class="input" id="aAcc" name="account" required autocomplete="username" value="${esc(localStorage.getItem('ccg.lastAccount') || '')}"></div>
          <div class="field"><label for="aPw">Mật khẩu</label><input class="input" id="aPw" name="password" type="password" required autocomplete="current-password"></div>
          <button class="btn btn-p" style="height:46px" type="submit">Đăng nhập</button>
          <a class="link" href="index.html#/company" style="text-align:center">Chưa có công ty? Tạo công ty mới</a>
          ${API.mode === 'demo' ? '<div class="demo-box"><b>Chế độ dùng thử:</b> mã công ty <b>DEMO</b>, tài khoản <b>admin</b>, mật khẩu <b>123456</b>.</div>' : ''}
        </form>
      </div>
    </div>`;
    const f = document.getElementById('aLogin');
    f.addEventListener('submit', e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      busy(f.querySelector('[type=submit]'), async () => {
        const s = await API.signIn(d.code, d.account, d.password);
        try { localStorage.setItem('ccg.lastCode', API.normCode(d.code)); localStorage.setItem('ccg.lastAccount', d.account.trim().toLowerCase()); } catch (err) { /* ignore */ }
        await enter(s);
      });
    });
  }
  async function enter(s) {
    if (s.user.role !== 'admin') { await API.signOut(); A.session = null; return renderLogin(`Tài khoản ${s.user.name} không có quyền quản trị. Hãy dùng app chấm công.`); }
    A.session = s; A.me = s.user;
    await loadBase();
    render();
  }

  // ---------------------------------------------------------------- overview
  function todayStatus(u, today = dayKey(new Date())) {
    const sh = shiftOf(u);
    const st = C.dayStatus({ logs: logsOf(u.uid), reqs: reqsOf(u.uid), key: today, shift: sh, startKey: startKeyOf(u), today });
    const now = new Date(), started = now.getHours() * 60 + now.getMinutes() > C.mins(sh.start) + (sh.grace || 0);
    let state;
    if (!C.isWorkday(now, sh)) state = st.s.in ? 'present' : 'off';
    else if (['leave', 'trip'].includes(st.code)) state = st.code;
    else if (st.s.in) state = st.s.lateBy ? 'late' : 'present';
    else state = started ? 'absent' : 'waiting';
    return { state, st, sh };
  }
  function dayCounts(key) {
    let ok = 0, late = 0, absent = 0;
    activeUsers().forEach(u => {
      const sh = shiftOf(u);
      if (!C.isWorkday(fromKey(key), sh)) return;
      const sk = startKeyOf(u);
      if (sk && key < sk) return;
      const st = C.dayStatus({ logs: logsOf(u.uid), reqs: reqsOf(u.uid), key, shift: sh, startKey: sk });
      if (['leave', 'trip', 'half'].includes(st.code)) return;
      if (st.s.in) { if (st.s.lateBy) late++; else ok++; } else if (key < dayKey(new Date())) absent++;
      else if (todayStatus(u).state === 'absent') absent++;
    });
    return { ok, late, absent };
  }

  async function pOverview(page) {
    const today = dayKey(new Date());
    await loadLogs(daysAgo(13), today);
    if (!page.isConnected) return; // người dùng đã chuyển trang trong lúc tải
    const states = activeUsers().map(u => ({ u, ...todayStatus(u) }));
    const cnt = s => states.filter(x => x.state === s).length;
    const expected = states.filter(x => !['off', 'leave', 'trip'].includes(x.state)).length;
    const present = cnt('present') + cnt('late');
    const pend = A.reqs.filter(r => r.status === 'pending');
    const pct = expected ? Math.round(present / expected * 100) : 0;
    const days = [];
    for (let i = 13; i >= 0; i--) days.push(daysAgo(i));
    const series = days.map(k => ({ key: k, ...dayCounts(k) }));
    const todayLogs = A.logs.filter(l => l.day === today).sort((a, b) => b.ts - a.ts).slice(0, 8);
    const notIn = states.filter(x => x.state === 'absent');
    page.innerHTML = `
      <div class="stats">
        <div class="card stat hero">
          <div class="row"><div class="ico"><i class="icon-user-check"></i></div><div class="grow"></div><span class="lbl">${pct}% có mặt</span></div>
          <div class="lbl">Có mặt hôm nay</div>
          <div class="val">${present}<small> / ${expected}</small></div>
          <div class="bar"><span style="width:${pct}%"></span></div>
        </div>
        <div class="card stat">
          <div class="ico" style="background:var(--late-soft);color:#A86A0C"><i class="icon-clock-alert"></i></div>
          <div class="lbl">Đi muộn</div><div class="val">${cnt('late')}</div>
          <div class="foot">${cnt('late') ? esc(states.filter(x => x.state === 'late').map(x => x.u.name.split(' ').pop()).slice(0, 3).join(', ')) + (cnt('late') > 3 ? '…' : '') : 'Chưa có ai đi muộn'}</div>
        </div>
        <div class="card stat">
          <div class="ico" style="background:var(--absent-soft);color:var(--absent)"><i class="icon-user-x"></i></div>
          <div class="lbl">Vắng mặt</div><div class="val">${cnt('absent')}</div>
          <div class="foot">${cnt('leave') + cnt('trip')} nghỉ phép / công tác${cnt('waiting') ? ` · ${cnt('waiting')} chưa đến giờ` : ''}</div>
        </div>
        <a class="card stat" href="#/approvals" style="color:inherit">
          <div class="ico" style="background:var(--orange-soft);color:var(--orange)"><i class="icon-file-clock"></i></div>
          <div class="lbl">Đơn chờ duyệt</div><div class="val">${pend.length + pendingLogs().length}</div>
          <div class="foot">${pend.length} đơn từ · ${pendingLogs().length} lượt chấm Wifi</div>
        </a>
      </div>
      <div class="grid-2">
        <div class="col">
          <div class="card">
            <div class="card-h"><div class="grow"><h2>Chuyên cần 14 ngày gần nhất</h2><div class="sub">Số người theo trạng thái mỗi ngày làm việc</div></div>
              <div class="legend"><span><i style="background:var(--ok)"></i>Đúng giờ</span><span><i style="background:var(--late)"></i>Đi muộn</span><span><i style="background:var(--absent)"></i>Vắng</span></div></div>
            <div class="card-b"><div class="chart-wrap" id="chart"></div></div>
          </div>
          <div class="card">
            <div class="card-h"><h2 class="grow">Chấm công hôm nay</h2><a class="link" href="#/timesheet">Xem bảng công</a></div>
            <div class="card-b" style="padding:8px 0 4px">${todayLogs.length ? todayLogs.map(l => { const u = userBy(l.uid); return `
              <div class="li"><div class="av sm">${esc(initials(u.name))}</div>
                <div class="m"><div class="t1">${esc(u.name)}</div><div class="t2">${KIND[l.kind].type} · ${esc(l.method)}${l.dist != null ? ' · cách ' + C.fmtDist(l.dist) : ''}${l.status === 'pending' ? ' · chờ duyệt' : ''}</div></div>
                <div class="tm">${hm(l.ts)}</div></div>`; }).join('') : '<div class="empty"><i class="icon-clock"></i>Chưa có lượt chấm công nào hôm nay</div>'}</div>
          </div>
        </div>
        <div class="col">
          <div class="card">
            <div class="card-h"><h2 class="grow">Đơn chờ duyệt</h2><a class="link" href="#/approvals">Xem tất cả</a></div>
            <div class="card-b" style="padding:8px 0 4px">${pend.length ? pend.sort((a, b) => b.created - a.created).slice(0, 5).map(r => { const u = userBy(r.uid); return `
              <div class="li"><div class="av sm">${esc(initials(u.name))}</div>
                <div class="m"><div class="t1">${esc(u.name)} · ${esc(reqTitle(r))}</div><div class="t2">${esc(C.reqSummary(r, shiftOf(u)))}</div></div>
                <button class="icon-b" title="Duyệt" data-decide="approved" data-id="${r.id}" style="color:var(--ok)"><i class="icon-check"></i></button>
                <button class="icon-b" title="Từ chối" data-decide="rejected" data-id="${r.id}" style="color:var(--absent)"><i class="icon-x"></i></button></div>`; }).join('') : '<div class="empty"><i class="icon-inbox"></i>Không có đơn nào đang chờ</div>'}</div>
          </div>
          <div class="card">
            <div class="card-h"><h2 class="grow">Chưa chấm công</h2><span class="chip bad">${notIn.length}</span></div>
            <div class="card-b" style="padding:8px 0 4px">${notIn.length ? notIn.map(x => `
              <div class="li"><div class="av sm">${esc(initials(x.u.name))}</div><div class="m"><div class="t1">${esc(x.u.name)}</div><div class="t2">${esc(x.u.dept || '')} · ca ${esc(x.sh.start)}</div></div></div>`).join('') : '<div class="empty"><i class="icon-party-popper"></i>Mọi người đã chấm công</div>'}</div>
          </div>
        </div>
      </div>`;
    drawChart(page.querySelector('#chart'), series);
    bindDecide(page);
  }

  function drawChart(el, data) {
    const W = 760, H = 260, padL = 34, padB = 30, padT = 10, padR = 8;
    const max = Math.max(4, ...data.map(d => d.ok + d.late + d.absent));
    const step = Math.ceil(max / 4);
    const top = step * 4;
    const y = v => padT + (H - padT - padB) * (1 - v / top);
    const bw = (W - padL - padR) / data.length, barW = Math.min(30, bw * 0.56);
    const cols = { ok: 'var(--ok)', late: 'var(--late)', absent: 'var(--absent)' };
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const v = step * i;
      g += `<line class="gridline" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${padL - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    }
    data.forEach((d, i) => {
      const cx = padL + bw * i + bw / 2, x = cx - barW / 2;
      let base = 0;
      const segs = ['ok', 'late', 'absent'].filter(k => d[k] > 0);
      segs.forEach((k, si) => {
        const y0 = y(base), y1 = y(base + d[k]);
        const h = Math.max(0, y0 - y1 - (si > 0 ? 2 : 0));
        const yy = y1;
        const last = si === segs.length - 1;
        // Phần trên cùng bo góc 4px, các phần cách nhau 2px.
        g += last ? `<path d="M${x},${yy + h} V${yy + 4} Q${x},${yy} ${x + 4},${yy} H${x + barW - 4} Q${x + barW},${yy} ${x + barW},${yy + 4} V${yy + h} Z" fill="${cols[k]}"/>`
          : `<rect x="${x}" y="${yy}" width="${barW}" height="${h}" fill="${cols[k]}"/>`;
        base += d[k];
      });
      const dt = fromKey(d.key);
      const lbl = `${dt.getDate()}/${dt.getMonth() + 1}`;
      g += `<text class="axis" x="${cx}" y="${H - 10}" text-anchor="middle" ${d.key === dayKey(new Date()) ? 'style="fill:var(--orange);font-weight:700"' : ''}>${lbl}</text>`;
      g += `<rect class="hit" data-i="${i}" x="${padL + bw * i}" y="${padT}" width="${bw}" height="${H - padT - padB}" rx="6"/>`;
    });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Biểu đồ chuyên cần 14 ngày">${g}</svg><div class="tip" hidden></div>`;
    const tip = el.querySelector('.tip'), svg = el.querySelector('svg');
    svg.addEventListener('mousemove', e => {
      const h = e.target.closest('.hit');
      if (!h) { tip.hidden = true; return; }
      const d = data[+h.dataset.i], dt = fromKey(d.key);
      tip.innerHTML = `<b>${DOW_SHORT[dt.getDay()]}, ${dmy(dt)}</b>
        <div class="r"><i style="background:var(--ok)"></i><span>Đúng giờ</span><em>${d.ok}</em></div>
        <div class="r"><i style="background:var(--late)"></i><span>Đi muộn</span><em>${d.late}</em></div>
        <div class="r"><i style="background:var(--absent)"></i><span>Vắng</span><em>${d.absent}</em></div>`;
      const r = el.getBoundingClientRect(), hr = h.getBoundingClientRect();
      tip.style.left = `${hr.left - r.left + hr.width / 2}px`; tip.style.top = `${hr.top - r.top + 6}px`;
      tip.hidden = false;
    });
    svg.addEventListener('mouseleave', () => { tip.hidden = true; });
  }

  // ---------------------------------------------------------------- approvals
  function bindDecide(scope) {
    scope.querySelectorAll('[data-decide]').forEach(b => { b.onclick = () => decideModal(b.dataset.id, b.dataset.decide); });
    scope.querySelectorAll('[data-view]').forEach(b => { b.onclick = () => viewRequest(b.dataset.view); });
  }
  function decideModal(id, status) {
    const r = A.reqs.find(x => x.id === id), u = userBy(r.uid);
    const ok = status === 'approved';
    const m = modal(ok ? 'Duyệt đơn' : 'Từ chối đơn', `<div class="modal-b">
      <div class="full kv"><span>Nhân viên</span><b>${esc(u.name)}</b><span>Loại đơn</span><b>${esc(reqTitle(r))}</b><span>Chi tiết</span><b>${esc(C.reqSummary(r, shiftOf(u)))}</b><span>Lý do</span><b>${esc(r.reason)}</b></div>
      <div class="field full"><label for="cmt">Ý kiến ${ok ? '(không bắt buộc)' : '<em>*</em>'}</label><textarea class="input" id="cmt" placeholder="${ok ? 'VD: Đồng ý' : 'Lý do từ chối để nhân viên biết'}"></textarea></div>
      ${ok && r.type === 'explain' && r.time ? `<div class="full hint"><i class="icon-info"></i> Khi duyệt, hệ thống tự thêm lượt chấm ${r.issue === 'Quên chấm công vào' ? 'vào ca' : r.issue === 'Quên chấm công ra' ? 'ra ca' : ''} lúc ${esc(r.time)} ngày ${keyToDmy(r.date)} cho nhân viên.</div>` : ''}
    </div>`, `<button class="btn btn-o" data-close>Hủy</button><button class="btn ${ok ? 'btn-ok' : 'btn-bad'}" id="go"><i class="icon-${ok ? 'check' : 'x'}"></i>${ok ? 'Duyệt đơn' : 'Từ chối'}</button>`, { size: 'sm' });
    m.querySelector('#go').onclick = e => {
      const cmt = m.querySelector('#cmt').value.trim();
      if (!ok && !cmt) { toast('Nhập lý do từ chối'); return; }
      busy(e.currentTarget, async () => {
        const upd = await API.decideRequest(id, status, cmt);
        Object.assign(r, upd, { status });
        if (ok && r.type === 'explain' && r.time && r.date) {
          const kind = r.issue === 'Quên chấm công vào' ? 'in' : r.issue === 'Quên chấm công ra' ? 'out' : (r.kind || 'in');
          const [h, mi] = r.time.split(':').map(Number);
          const d = fromKey(r.date); d.setHours(h, mi, 0, 0);
          const log = await API.addLog({ uid: r.uid, ts: d.getTime(), kind, method: 'Giải trình', status: 'ok', reqId: r.id });
          if (A.range && log.day >= A.range[0] && log.day <= A.range[1]) A.logs.push(log);
        }
        m.remove();
        toast(ok ? 'Đã duyệt đơn và gửi thông báo cho nhân viên' : 'Đã từ chối đơn');
        render();
      });
    };
  }
  async function viewRequest(id) {
    const r = A.reqs.find(x => x.id === id), u = userBy(r.uid);
    const rows = [['Nhân viên', `${u.name}${u.code ? ' · ' + u.code : ''}`], ['Phòng ban', u.dept || '—'], ['Loại đơn', reqTitle(r)], ['Chi tiết', C.reqSummary(r, shiftOf(u))], ['Lý do', r.reason],
      ['Người duyệt', userBy(r.approverUid).name], ['Gửi lúc', `${hm(r.created)} ${dmy(r.created)}`]];
    if (r.decidedAt) rows.push(['Xử lý', `${STATUS[r.status][1]} · ${userBy(r.decidedBy).name} · ${hm(r.decidedAt)} ${dmy(r.decidedAt)}`]);
    if (r.comment) rows.push(['Ý kiến', r.comment]);
    const m = modal('Chi tiết đơn', `<div class="modal-b"><div class="full kv">${rows.map(([k, v]) => `<span>${k}</span><b>${esc(v)}</b>`).join('')}<span>Trạng thái</span><b>${chip(r.status)}</b></div>
      ${r.hasAttachment ? '<div class="full" id="att"><div class="empty"><i class="icon-loader-circle spin"></i>Đang tải ảnh...</div></div>' : ''}</div>`,
      r.status === 'pending' ? `<button class="btn btn-bad" data-decide="rejected" data-id="${r.id}"><i class="icon-x"></i>Từ chối</button><button class="btn btn-ok" data-decide="approved" data-id="${r.id}"><i class="icon-check"></i>Duyệt</button>` : '<button class="btn btn-o" data-close>Đóng</button>');
    m.querySelectorAll('[data-decide]').forEach(b => { b.onclick = () => { m.remove(); decideModal(b.dataset.id, b.dataset.decide); }; });
    if (r.hasAttachment) {
      try { const data = await API.getAttachment(id); const el = m.querySelector('#att'); if (el) el.innerHTML = data ? `<img class="attach-img" src="${esc(data)}" alt="Ảnh đính kèm">` : '<div class="empty">Không có ảnh</div>'; }
      catch (e) { const el = m.querySelector('#att'); if (el) el.innerHTML = `<div class="empty">${esc(errMsg(e))}</div>`; }
    }
  }

  async function pApprovals(page) {
    await loadLogs(daysAgo(62), dayKey(new Date()));
    if (!page.isConnected) return; // người dùng đã chuyển trang trong lúc tải
    const tabs = [['pending', 'Chờ duyệt'], ['approved', 'Đã duyệt'], ['rejected', 'Từ chối'], ['all', 'Tất cả'], ['logs', 'Chấm công chờ duyệt']];
    const count = k => k === 'logs' ? pendingLogs().length : A.reqs.filter(r => k === 'all' || r.status === k).length;
    let body;
    if (ui.reqTab === 'logs') {
      const list = pendingLogs().sort((a, b) => b.ts - a.ts);
      body = list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nhân viên</th><th>Thời điểm</th><th>Loại</th><th>Phương thức</th><th>Ghi chú</th><th></th></tr></thead><tbody>
        ${list.map(l => { const u = userBy(l.uid); return `<tr><td><div class="who"><div class="av sm">${esc(initials(u.name))}</div><div><b>${esc(u.name)}</b><small>${esc(u.dept || '')}</small></div></div></td>
          <td class="num">${hm(l.ts)} · ${dmy(l.ts)}</td><td>${KIND[l.kind].type}</td><td>${esc(l.method)}${l.ssid ? ' · ' + esc(l.ssid) : ''}</td>
          <td class="muted wrap">Trình duyệt không xác minh được tên Wifi</td>
          <td><div class="acts"><button class="btn btn-sm btn-bad" data-log="${l.id}" data-st="rejected">Từ chối</button><button class="btn btn-sm btn-ok" data-log="${l.id}" data-st="ok">Duyệt</button></div></td></tr>`; }).join('')}
        </tbody></table></div>` : '<div class="empty"><i class="icon-circle-check"></i>Không có lượt chấm công nào cần duyệt</div>';
    } else {
      const list = A.reqs.filter(r => (ui.reqTab === 'all' || r.status === ui.reqTab) && (!ui.reqType || r.type === ui.reqType)).sort((a, b) => b.created - a.created);
      body = list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nhân viên</th><th>Loại đơn</th><th>Chi tiết</th><th>Lý do</th><th>Gửi lúc</th><th>Trạng thái</th><th></th></tr></thead><tbody>
        ${list.map(r => { const u = userBy(r.uid); return `<tr><td><div class="who"><div class="av sm">${esc(initials(u.name))}</div><div><b>${esc(u.name)}</b><small>${esc(u.dept || '')}</small></div></div></td>
          <td>${esc(reqTitle(r))}${r.hasAttachment ? ' <i class="icon-paperclip muted" title="Có ảnh đính kèm"></i>' : ''}</td>
          <td class="wrap">${esc(C.reqSummary(r, shiftOf(u)))}</td><td class="muted wrap" style="max-width:260px">${esc(r.reason)}</td>
          <td class="muted num">${relTime(r.created)}</td><td>${chip(r.status)}</td>
          <td><div class="acts"><button class="btn btn-sm btn-o" data-view="${r.id}">Xem</button>${r.status === 'pending' ? `<button class="btn btn-sm btn-bad" data-decide="rejected" data-id="${r.id}">Từ chối</button><button class="btn btn-sm btn-ok" data-decide="approved" data-id="${r.id}">Duyệt</button>` : ''}</div></td></tr>`; }).join('')}
        </tbody></table></div>` : '<div class="empty"><i class="icon-inbox"></i>Không có đơn nào</div>';
    }
    page.innerHTML = `<div class="row">
        <div class="tabs">${tabs.map(([k, n]) => `<button class="${ui.reqTab === k ? 'on' : ''}" data-tab="${k}">${n}<em>${count(k)}</em></button>`).join('')}</div>
        <div class="grow"></div>
        ${ui.reqTab !== 'logs' ? `<select class="select" id="rType"><option value="">Tất cả loại đơn</option>${Object.entries(REQ_TYPES).map(([k, t]) => `<option value="${k}"${ui.reqType === k ? ' selected' : ''}>${t.name}</option>`).join('')}</select>` : ''}
      </div>
      <div class="card">${body}</div>`;
    page.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { ui.reqTab = b.dataset.tab; pApprovals(page); }; });
    const rt = page.querySelector('#rType'); if (rt) rt.onchange = () => { ui.reqType = rt.value; pApprovals(page); };
    page.querySelectorAll('[data-log]').forEach(b => {
      b.onclick = () => busy(b, async () => {
        const l = A.logs.find(x => x.id === b.dataset.log);
        await API.updateLog(l.id, { status: b.dataset.st });
        l.status = b.dataset.st;
        await API.notify(l.uid, `Lượt chấm công ${KIND[l.kind].type.toLowerCase()} lúc ${hm(l.ts)} ${dmy(l.ts)} ${b.dataset.st === 'ok' ? 'đã được duyệt' : 'bị từ chối'}.`).catch(() => {});
        toast(b.dataset.st === 'ok' ? 'Đã duyệt lượt chấm công' : 'Đã từ chối lượt chấm công');
        render();
      });
    });
    bindDecide(page);
  }

  // ---------------------------------------------------------------- users
  async function pUsers(page) {
    const depts = [...new Set(A.users.map(u => u.dept).filter(Boolean))].sort();
    const q = ui.userQ.toLowerCase();
    const list = A.users.filter(u => (!q || [u.name, u.account, u.code, u.title].join(' ').toLowerCase().includes(q)) && (!ui.userDept || u.dept === ui.userDept));
    page.innerHTML = `<div class="row">
        <div class="search"><i class="icon-search"></i><input class="input" id="uq" placeholder="Tìm theo tên, tài khoản, mã NV" value="${esc(ui.userQ)}"></div>
        <select class="select" id="ud"><option value="">Tất cả phòng ban</option>${depts.map(d => `<option${d === ui.userDept ? ' selected' : ''}>${esc(d)}</option>`).join('')}</select>
        <div class="grow"></div>
        <span class="muted">${A.users.filter(u => u.active !== false).length} đang làm · ${A.users.filter(u => u.active === false).length} đã khoá</span>
        <button class="btn btn-o" id="importU"><i class="icon-file-spreadsheet"></i>Nhập danh sách</button>
        <button class="btn btn-p" id="addU"><i class="icon-user-plus"></i>Thêm nhân viên</button>
      </div>
      <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nhân viên</th><th>Tài khoản</th><th>Phòng ban</th><th>Chức danh</th><th>Ca làm việc</th><th>Địa điểm</th><th>Quyền</th><th>Trạng thái</th><th></th></tr></thead><tbody>
      ${list.map(u => { const sh = shiftOf(u); const locs = (u.locationIds || []).length ? u.locationIds.map(id => (A.locations.find(l => l.id === id) || {}).name).filter(Boolean).join(', ') : 'Tất cả'; return `<tr>
        <td><div class="who"><div class="av sm">${esc(initials(u.name))}</div><div><b>${esc(u.name)}</b><small>${esc(u.code || '—')}</small></div></div></td>
        <td>${esc(u.account || '')}</td><td>${esc(u.dept || '—')}</td><td>${esc(u.title || '—')}</td>
        <td>${esc(sh.name)} <span class="muted">${esc(sh.start)}–${esc(sh.end)}</span></td><td>${esc(locs)}</td>
        <td><span class="chip ${u.role === 'admin' ? 'admin' : 'gray'}">${ROLES[u.role] || u.role}</span>${u.uid === A.company.ownerUid ? ' <span class="chip blue">Chủ</span>' : ''}</td>
        <td>${u.active === false ? '<span class="chip bad">Đã khoá</span>' : u.mustChangePassword ? '<span class="chip pending" title="Chưa đăng nhập lần đầu / chưa đổi mật khẩu tạm">Chưa kích hoạt</span>' : '<span class="chip ok">Đang làm</span>'}</td>
        <td><div class="acts"><button class="icon-b" data-edit="${u.uid}" title="Sửa"><i class="icon-pencil"></i></button>
          ${u.uid !== A.company.ownerUid && u.uid !== A.me.uid ? `<button class="icon-b" data-lock="${u.uid}" title="${u.active === false ? 'Mở khoá' : 'Khoá tài khoản'}"><i class="icon-${u.active === false ? 'lock-open' : 'lock'}"></i></button>` : ''}</div></td></tr>`; }).join('') || '<tr><td colspan="9"><div class="empty">Không có nhân viên phù hợp</div></td></tr>'}
      </tbody></table></div></div>`;
    const uq = page.querySelector('#uq');
    uq.oninput = () => { ui.userQ = uq.value; clearTimeout(uq._t); uq._t = setTimeout(() => { pUsers(page).then(() => { const n = page.querySelector('#uq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }); }, 250); };
    page.querySelector('#ud').onchange = e => { ui.userDept = e.target.value; pUsers(page); };
    page.querySelector('#addU').onclick = () => userModal(null);
    page.querySelector('#importU').onclick = () => importModal();
    page.querySelectorAll('[data-edit]').forEach(b => { b.onclick = () => userModal(A.users.find(u => u.uid === b.dataset.edit)); });
    page.querySelectorAll('[data-lock]').forEach(b => {
      const u = A.users.find(x => x.uid === b.dataset.lock);
      b.onclick = () => confirmModal(u.active === false ? 'Mở khoá tài khoản' : 'Khoá tài khoản',
        u.active === false ? `Cho phép ${u.name} đăng nhập và chấm công trở lại?` : `${u.name} sẽ không đăng nhập và chấm công được nữa. Dữ liệu cũ vẫn được giữ.`,
        u.active === false ? 'Mở khoá' : 'Khoá', async () => { await API.updateUser(u.uid, { active: u.active === false }); u.active = u.active === false; toast('Đã cập nhật'); pUsers(page); });
    });
  }
  function userModal(u) {
    const isNew = !u; u = u || { role: 'employee', locationIds: [], shiftId: (A.shifts[0] || {}).id, leaveTotal: A.company.settings.leavePerYear };
    const m = modal(isNew ? 'Thêm nhân viên' : 'Sửa thông tin nhân viên', `<form class="modal-b" id="uf">
      <div class="field"><label for="u_name">Họ và tên <em>*</em></label><input class="input" id="u_name" name="name" required value="${esc(u.name || '')}"></div>
      <div class="field"><label for="u_code">Mã nhân viên</label><input class="input" id="u_code" name="code" value="${esc(u.code || '')}" placeholder="NV-0001"></div>
      <div class="field"><label for="u_acc">Tài khoản đăng nhập <em>*</em></label><input class="input" id="u_acc" name="account" ${isNew ? 'required' : 'disabled'} value="${esc(u.account || '')}" placeholder="vd: an.nguyen hoặc email" autocomplete="off"></div>
      <div class="field"><label for="u_pw">${isNew ? 'Mật khẩu <em>*</em>' : 'Đặt lại mật khẩu'}</label><input class="input" id="u_pw" name="password" type="text" ${isNew ? `required minlength="6" value="${genPassword()}"` : ''} placeholder="${isNew ? 'Ít nhất 6 ký tự' : (API.mode === 'demo' ? 'Để trống nếu không đổi' : 'Chỉ đổi được qua email (Firebase)')}" ${!isNew && API.mode !== 'demo' ? 'disabled' : ''} autocomplete="new-password"></div>
      <div class="field"><label for="u_dept">Phòng ban</label><input class="input" id="u_dept" name="dept" value="${esc(u.dept || '')}" list="deptList"><datalist id="deptList">${[...new Set(A.users.map(x => x.dept).filter(Boolean))].map(d => `<option value="${esc(d)}">`).join('')}</datalist></div>
      <div class="field"><label for="u_title">Chức danh</label><input class="input" id="u_title" name="title" value="${esc(u.title || '')}"></div>
      <div class="field"><label for="u_shift">Ca làm việc</label><select class="select" id="u_shift" name="shiftId">${A.shifts.map(s => `<option value="${s.id}"${s.id === u.shiftId ? ' selected' : ''}>${esc(s.name)} ${s.start}–${s.end}</option>`).join('')}</select></div>
      <div class="field"><label for="u_role">Quyền</label><select class="select" id="u_role" name="role" ${u.uid === A.company.ownerUid ? 'disabled' : ''}>${Object.entries(ROLES).map(([k, n]) => `<option value="${k}"${k === u.role ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="field"><label for="u_leave">Số ngày phép năm</label><input class="input" id="u_leave" name="leaveTotal" type="number" min="0" max="60" step="0.5" value="${u.leaveTotal ?? 12}"></div>
      <div class="field"><label>Địa điểm được chấm</label><div class="days">${A.locations.map(l => `<label><input type="checkbox" name="loc" value="${l.id}"${(u.locationIds || []).includes(l.id) ? ' checked' : ''}>${esc(l.name)}</label>`).join('') || '<span class="hint">Chưa có địa điểm</span>'}</div><div class="hint">Không chọn = được chấm ở mọi địa điểm.</div></div>
      ${isNew ? `<div class="full hint">Tài khoản tự gợi ý theo họ tên, mật khẩu tạm tạo sẵn (có thể sửa). Lần đầu đăng nhập, nhân viên phải đặt mật khẩu riêng.</div>` : ''}
    </form>`, `<button class="btn btn-o" data-close>Hủy</button><button class="btn btn-p" id="saveU">${isNew ? 'Thêm nhân viên' : 'Lưu thay đổi'}</button>`);
    if (isNew) {
      const nameIn = m.querySelector('#u_name'), accIn = m.querySelector('#u_acc');
      let touched = false;
      accIn.addEventListener('input', () => { touched = true; });
      nameIn.addEventListener('input', () => { if (!touched) accIn.value = suggestAccount(nameIn.value, takenAccounts()); });
    }
    m.querySelector('#saveU').onclick = e => {
      const f = m.querySelector('#uf'), fd = new FormData(f), d = Object.fromEntries(fd);
      if (!String(d.name || '').trim()) return toast('Nhập họ và tên');
      if (isNew && !String(d.account || '').trim()) return toast('Nhập tài khoản đăng nhập');
      if (isNew && String(d.password || '').length < 6) return toast('Mật khẩu cần ít nhất 6 ký tự');
      const data = { name: d.name.trim(), code: d.code.trim(), dept: d.dept.trim(), title: d.title.trim(), shiftId: d.shiftId || '', leaveTotal: Number(d.leaveTotal) || 0, locationIds: fd.getAll('loc') };
      if (d.role) data.role = d.role;
      busy(e.currentTarget, async () => {
        if (isNew) {
          const nu = await API.createUser({ ...data, account: d.account, password: d.password });
          A.users.push(nu); m.remove(); render();
          credentialsModal([{ name: nu.name, account: nu.account, password: d.password }]);
          return;
        }
        if (d.password) data.password = d.password;
        await API.updateUser(u.uid, data);
        delete data.password; Object.assign(u, data);
        if (d.password) u.mustChangePassword = true;
        m.remove(); render();
        if (d.password) credentialsModal([{ name: u.name, account: u.account, password: d.password }], 'Mật khẩu mới');
        else toast('Đã lưu thông tin');
      });
    };
  }

  // ---------------------------------------------------------------- cấp tài khoản hàng loạt
  const takenAccounts = () => new Set(A.users.map(u => String(u.account || '').toLowerCase()));
  const unaccent = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  /** "Nguyễn Văn An" -> "an.nguyen" (thêm số nếu trùng). */
  function suggestAccount(name, taken) {
    const w = unaccent(name).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (!w.length) return '';
    const base = w.length > 1 ? `${w[w.length - 1]}.${w[0]}` : w[0];
    let acc = base, i = 2;
    while (taken.has(acc)) acc = base + i++;
    return acc;
  }
  /** Mật khẩu tạm dễ đọc, dễ gõ trên điện thoại (bỏ các ký tự dễ nhầm như 0/o, 1/l). */
  function genPassword() {
    const L = 'abcdefghjkmnpqrstuvwxyz', D = '23456789';
    const r = n => crypto.getRandomValues(new Uint32Array(1))[0] % n;
    let p = '';
    for (let i = 0; i < 4; i++) p += L[r(L.length)];
    for (let i = 0; i < 4; i++) p += D[r(D.length)];
    return p;
  }
  const appUrl = () => new URL('index.html', location.href).href;
  const coName = () => /^(c[oô]ng ty|cty)\b/i.test(A.company.name) ? A.company.name : 'công ty ' + A.company.name;
  const credMessage = c => `Chào ${c.name}, ${coName()} đã tạo tài khoản chấm công cho bạn.
• Mở app: ${appUrl()}
• Mã công ty: ${A.company.code}
• Tài khoản: ${c.account}
• Mật khẩu tạm: ${c.password}
Lần đầu đăng nhập, app sẽ yêu cầu bạn đặt mật khẩu mới. Trên điện thoại: mở link › Chia sẻ › Thêm vào Màn hình chính để dùng như app.`;
  async function copyText(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg); }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast(okMsg); } catch (err) { toast('Không sao chép được, hãy bôi đen để chép tay'); }
      ta.remove();
    }
  }
  /** Hiện thông tin đăng nhập để gửi cho nhân viên (mật khẩu tạm chỉ hiện một lần). */
  function credentialsModal(list, pwLabel = 'Mật khẩu tạm') {
    const m = modal(list.length > 1 ? `Đã tạo ${list.length} tài khoản` : `Tài khoản của ${list[0].name}`, `<div class="modal-b">
      <div class="full cred-note"><i class="icon-triangle-alert"></i><span><b>Mật khẩu tạm chỉ hiện lần này.</b> Hãy gửi cho nhân viên ngay (Zalo, tin nhắn) hoặc tải danh sách về trước khi đóng.</span></div>
      <div class="full"><div class="kv" style="grid-template-columns:150px 1fr"><span>Link app</span><b>${esc(appUrl())}</b><span>Mã công ty</span><b>${esc(A.company.code)}</b></div></div>
      <div class="full tbl-wrap" style="max-height:340px;overflow:auto;border:1px solid var(--line);border-radius:12px"><table class="tbl"><thead><tr><th>Họ tên</th><th>Tài khoản</th><th>${pwLabel}</th><th></th></tr></thead><tbody>
        ${list.map((c, i) => `<tr><td><b>${esc(c.name)}</b></td><td class="mono">${esc(c.account)}</td><td class="mono">${esc(c.password)}</td>
          <td><div class="acts"><button class="btn btn-sm btn-o" data-copy="${i}"><i class="icon-copy"></i>Chép tin nhắn</button></div></td></tr>`).join('')}
      </tbody></table></div>
      <div class="full hint">"Chép tin nhắn" sao chép sẵn lời nhắn kèm link, mã công ty, tài khoản và mật khẩu để dán vào Zalo.</div>
    </div>`, `<button class="btn btn-o" id="credCsv"><i class="icon-download"></i>Tải danh sách (Excel)</button>${list.length > 1 ? '<button class="btn btn-o" id="credAll"><i class="icon-copy"></i>Chép tất cả</button>' : ''}<button class="btn btn-p" data-close>Xong</button>`);
    m.querySelectorAll('[data-copy]').forEach(b => { b.onclick = () => copyText(credMessage(list[+b.dataset.copy]), `Đã chép tin nhắn cho ${list[+b.dataset.copy].name}`); });
    const all = m.querySelector('#credAll');
    if (all) all.onclick = () => copyText(list.map(credMessage).join('\n\n———\n\n'), `Đã chép ${list.length} tin nhắn`);
    m.querySelector('#credCsv').onclick = () => C.csvDownload(`tai-khoan-${A.company.code}-${dayKey(new Date())}.csv`,
      [['Họ tên', 'Mã công ty', 'Tài khoản', pwLabel, 'Link app'], ...list.map(c => [c.name, A.company.code, c.account, c.password, appUrl()])]);
  }

  /** Đọc bảng dán từ Excel (cột cách nhau bằng Tab) hoặc file CSV. */
  function parseTable(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n').filter(l => l.trim());
    if (!lines.length) return [];
    const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
    const split = line => {
      if (sep === '\t') return line.split('\t');
      const out = []; let cur = '', q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
        else if (ch === '"') q = true; else if (ch === sep) { out.push(cur); cur = ''; } else cur += ch;
      }
      out.push(cur); return out;
    };
    let rows = lines.map(l => split(l).map(c => c.trim()));
    if (/h[ọo].*t[êe]n|name/i.test(unaccent(rows[0][0])) || /ho ?ten|ten/i.test(unaccent(rows[0][0]).toLowerCase())) rows = rows.slice(1);
    return rows.filter(r => r[0]);
  }
  function importModal() {
    const m = modal('Nhập danh sách nhân viên', `<div class="modal-b">
      <div class="full hint" style="font-size:13px">Chép bảng từ Excel / Google Sheets rồi dán vào ô dưới. Thứ tự cột:
        <b>Họ tên</b> · Mã NV · Phòng ban · Chức danh · Quyền (ghi "Quản trị" nếu là quản trị) · Tài khoản · Mật khẩu · Số ngày phép.
        Chỉ <b>Họ tên</b> là bắt buộc; tài khoản và mật khẩu tạm để trống sẽ được tạo tự động.
        <a href="#" id="tpl">Tải file mẫu</a></div>
      <div class="field full"><textarea class="input mono" id="imText" style="min-height:140px" placeholder="Nguyễn Văn An&#9;NV-0248&#9;Phòng Kinh doanh&#9;Nhân viên kinh doanh&#10;Lê Minh Châu&#9;NV-0251&#9;Phòng Kế toán&#9;Kế toán"></textarea></div>
      <div class="field"><label for="imFile">Hoặc chọn file CSV</label><input class="input" id="imFile" type="file" accept=".csv,text/csv" style="padding-top:8px"></div>
      <div class="field"><label for="imShift">Ca làm việc cho tất cả</label><select class="select" id="imShift">${A.shifts.map(s => `<option value="${s.id}">${esc(s.name)} ${s.start}–${s.end}</option>`).join('')}</select></div>
      <div class="field"><label for="imLeave">Số ngày phép (khi không có cột riêng)</label><input class="input" id="imLeave" type="number" min="0" max="60" step="0.5" value="${A.company.settings.leavePerYear}"></div>
      <div class="field"><label>Địa điểm được chấm</label><div class="days">${A.locations.map(l => `<label><input type="checkbox" name="imLoc" value="${l.id}">${esc(l.name)}</label>`).join('') || '<span class="hint">Chưa có địa điểm</span>'}</div><div class="hint">Không chọn = mọi địa điểm.</div></div>
      <div class="full" id="imPreview"></div>
    </div>`, `<button class="btn btn-o" data-close>Hủy</button><button class="btn btn-p" id="imGo" disabled>Tạo tài khoản</button>`);
    m.querySelector('.modal').style.maxWidth = '860px';
    let rows = [];
    const preview = () => {
      const taken = takenAccounts(), seen = new Set();
      rows = parseTable(m.querySelector('#imText').value).map(r => {
        const [name, code = '', dept = '', title = '', role = '', account = '', password = '', leave = ''] = r;
        const leaveDays = leave === '' ? null : Number(String(leave).replace(',', '.'));
        const acc = (account || suggestAccount(name, new Set([...taken, ...seen]))).toLowerCase();
        let err = '';
        if (!/^[a-z0-9._@-]+$/.test(acc)) err = 'Tài khoản chỉ gồm chữ không dấu, số, dấu chấm';
        else if (taken.has(acc) || seen.has(acc)) err = 'Tài khoản đã tồn tại';
        else if (password && password.length < 6) err = 'Mật khẩu cần ít nhất 6 ký tự';
        else if (leaveDays != null && !(leaveDays >= 0 && leaveDays <= 60)) err = 'Số ngày phép không hợp lệ';
        seen.add(acc);
        return { name, code, dept, title, role: /qu[aả]n tr[iị]|admin/i.test(role) ? 'admin' : 'employee', account: acc, password: password || genPassword(), leave: leaveDays, err };
      });
      const ok = rows.filter(r => !r.err).length;
      m.querySelector('#imPreview').innerHTML = rows.length ? `<div class="tbl-wrap" style="max-height:260px;overflow:auto;border:1px solid var(--line);border-radius:12px"><table class="tbl"><thead><tr><th>#</th><th>Kiểm tra</th><th>Họ tên</th><th>Tài khoản</th><th>Mật khẩu tạm</th><th>Quyền</th><th>Phép</th><th>Mã NV</th><th>Phòng ban</th><th>Chức danh</th></tr></thead><tbody>
        ${rows.map((r, i) => `<tr><td class="muted">${i + 1}</td><td>${r.err ? `<span class="chip bad">${esc(r.err)}</span>` : '<span class="chip ok">Hợp lệ</span>'}</td>
          <td><b>${esc(r.name)}</b></td><td class="mono">${esc(r.account)}</td><td class="mono">${esc(r.password)}</td><td>${ROLES[r.role]}</td><td class="num">${r.leave != null ? num(r.leave) : '<span class="muted">chung</span>'}</td><td>${esc(r.code)}</td><td>${esc(r.dept)}</td><td>${esc(r.title)}</td></tr>`).join('')}
      </tbody></table></div><div class="hint" style="margin-top:8px">${ok}/${rows.length} dòng hợp lệ${rows.length > ok ? ' · dòng lỗi sẽ được bỏ qua' : ''}${API.mode !== 'demo' && ok > 90 ? ' · Firebase giới hạn khoảng 100 tài khoản mới mỗi giờ, hãy chia làm nhiều lần' : ''}.</div>` : '';
      const go = m.querySelector('#imGo');
      go.disabled = !ok; go.textContent = ok ? `Tạo ${ok} tài khoản` : 'Tạo tài khoản';
    };
    m.querySelector('#imText').addEventListener('input', preview);
    m.querySelector('#imFile').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      m.querySelector('#imText').value = (await f.text()).replace(/^﻿/, ''); preview();
    };
    m.querySelector('#tpl').onclick = e => {
      e.preventDefault();
      C.csvDownload('mau-danh-sach-nhan-vien.csv', [['Họ tên', 'Mã NV', 'Phòng ban', 'Chức danh', 'Quyền', 'Tài khoản', 'Mật khẩu', 'Số ngày phép'],
        ['Nguyễn Văn An', 'NV-0001', 'Phòng Kinh doanh', 'Nhân viên kinh doanh', '', '', '', '12'], ['Trần Thị Hương', 'NV-0002', 'Phòng Nhân sự', 'Trưởng phòng', 'Quản trị', '', '', '']]);
    };
    m.querySelector('#imGo').onclick = async e => {
      const btn = e.currentTarget, todo = rows.filter(r => !r.err);
      const common = { shiftId: m.querySelector('#imShift').value, leaveTotal: Number(m.querySelector('#imLeave').value) || 0,
        locationIds: [...m.querySelectorAll('input[name=imLoc]:checked')].map(i => i.value) };
      btn.disabled = true;
      m.querySelectorAll('textarea, input, select').forEach(i => { i.disabled = true; });
      const done = [], failed = [];
      for (let i = 0; i < todo.length; i++) {
        const r = todo[i];
        btn.innerHTML = `<i class="icon-loader-circle spin"></i>Đang tạo ${i + 1}/${todo.length}`;
        try {
          const nu = await API.createUser({ ...common, ...(r.leave != null ? { leaveTotal: r.leave } : {}), name: r.name, code: r.code, dept: r.dept, title: r.title, role: r.role, account: r.account, password: r.password });
          A.users.push(nu); done.push({ name: r.name, account: r.account, password: r.password });
        } catch (err) { failed.push(`${r.name}: ${errMsg(err)}`); }
      }
      m.remove(); render();
      if (done.length) credentialsModal(done);
      if (failed.length) toast(`${failed.length} người chưa tạo được: ${failed.slice(0, 2).join('; ')}${failed.length > 2 ? '…' : ''}`);
    };
  }

  // ---------------------------------------------------------------- locations
  async function pLocations(page) {
    const locs = A.locations;
    if (!ui.locSel || (ui.locSel !== 'new' && !locs.find(l => l.id === ui.locSel))) ui.locSel = locs[0] ? locs[0].id : 'new';
    const cur = ui.locSel === 'new' ? { id: '', name: '', address: '', lat: 21.0285, lng: 105.8542, radius: 150, wifi: '' } : { ...locs.find(l => l.id === ui.locSel) };
    const using = id => A.users.filter(u => (u.locationIds || []).includes(id)).length;
    page.innerHTML = `<div class="loc-grid">
      <div class="card loc-list">
        <div class="card-h"><h2 class="grow">Địa điểm (${locs.length})</h2><button class="btn btn-p btn-sm" id="newLoc"><i class="icon-plus"></i>Thêm</button></div>
        <div class="card-b" style="padding:10px 0 6px">
          ${locs.map(l => `<div class="li ${l.id === ui.locSel ? 'on' : ''}" data-loc="${l.id}"><div class="pin"><i class="icon-building-2"></i></div>
            <div class="m"><div class="t1">${esc(l.name)}</div><div class="t2">Bán kính ${l.radius}m${l.wifi ? ' · Wifi ' + esc(l.wifi) : ''}${using(l.id) ? ` · ${using(l.id)} NV riêng` : ''}</div></div></div>`).join('')}
          ${ui.locSel === 'new' ? '<div class="li on"><div class="pin"><i class="icon-plus"></i></div><div class="m"><div class="t1">Địa điểm mới</div><div class="t2">Bấm lên bản đồ để đặt ghim</div></div></div>' : ''}
          ${!locs.length && ui.locSel !== 'new' ? '<div class="empty">Chưa có địa điểm nào</div>' : ''}
        </div>
      </div>
      <div class="card loc-editor">
        <div class="loc-map" id="lmap"><div class="hint-top">Bấm vào bản đồ hoặc kéo ghim để đặt vị trí văn phòng</div></div>
        <form class="loc-form" id="lf">
          <div class="field"><label for="l_name">Tên địa điểm <em>*</em></label><input class="input" id="l_name" name="name" required value="${esc(cur.name)}" placeholder="VD: Văn phòng Hà Nội"></div>
          <div class="field"><label for="l_wifi">Tên Wifi văn phòng</label><input class="input" id="l_wifi" name="wifi" value="${esc(cur.wifi || '')}" placeholder="VD: Office-5G"></div>
          <div class="field full"><label for="l_addr">Địa chỉ</label><input class="input" id="l_addr" name="address" value="${esc(cur.address || '')}" placeholder="Số nhà, đường, quận, thành phố"></div>
          <div class="field full"><label>Bán kính chấm công</label>
            <div class="radius-row"><input type="range" id="l_rad" name="radius" min="50" max="500" step="10" value="${cur.radius}" aria-label="Bán kính"><span class="radius-val" id="radV">${cur.radius}m</span></div>
            <div class="radius-scale"><span>50m</span><span>150m</span><span>250m</span><span>350m</span><span>500m</span></div></div>
          <div class="field"><label for="l_lat">Vĩ độ</label><input class="input num" id="l_lat" name="lat" value="${cur.lat}" inputmode="decimal"></div>
          <div class="field"><label for="l_lng">Kinh độ</label><input class="input num" id="l_lng" name="lng" value="${cur.lng}" inputmode="decimal"></div>
          <div class="full row">
            <button type="button" class="btn btn-o" id="here"><i class="icon-locate-fixed"></i>Dùng vị trí của tôi</button>
            <span class="hint grow">Có thể dán toạ độ từ Google Maps (nhấn chuột phải vào bản đồ › bấm dòng toạ độ để sao chép).</span>
            ${cur.id ? '<button type="button" class="btn btn-bad" id="delLoc"><i class="icon-trash-2"></i>Xoá</button>' : ''}
            <button type="submit" class="btn btn-p"><i class="icon-save"></i>${cur.id ? 'Lưu địa điểm' : 'Thêm địa điểm'}</button>
          </div>
        </form>
      </div>
    </div>`;
    page.querySelectorAll('[data-loc]').forEach(el => { el.onclick = () => { ui.locSel = el.dataset.loc; pLocations(page); }; });
    page.querySelector('#newLoc').onclick = () => { ui.locSel = 'new'; pLocations(page); };
    const f = page.querySelector('#lf'), rad = f.querySelector('#l_rad'), radV = page.querySelector('#radV');
    let map = null, marker = null, circle = null;
    if (window.L) {
      map = L.map('lmap', { zoomControl: true }).setView([cur.lat, cur.lng], 16);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles © Esri' }).addTo(map);
      map.attributionControl.setPrefix(false);
      locs.filter(l => l.id !== cur.id).forEach(l => {
        L.circle([l.lat, l.lng], { radius: l.radius, color: '#9AA0AE', weight: 1, fillOpacity: .08, interactive: false }).addTo(map);
        L.marker([l.lat, l.lng], { interactive: false, icon: L.divIcon({ className: 'leaflet-div-icon plain', html: '<div class="office-pin other"><div class="head"><i class="icon-building-2"></i></div><div class="stem"></div></div>', iconSize: [30, 39], iconAnchor: [15, 39] }) }).addTo(map);
      });
      circle = L.circle([cur.lat, cur.lng], { radius: cur.radius, color: 'rgba(242,87,43,.8)', weight: 2, fillColor: '#F2572B', fillOpacity: .16 }).addTo(map);
      marker = L.marker([cur.lat, cur.lng], { draggable: true, icon: L.divIcon({ className: 'leaflet-div-icon plain', html: '<div class="office-pin"><div class="head"><i class="icon-building-2"></i></div><div class="stem"></div></div>', iconSize: [38, 50], iconAnchor: [19, 50] }) }).addTo(map);
      const moved = ll => { circle.setLatLng(ll); f.lat.value = ll.lat.toFixed(6); f.lng.value = ll.lng.toFixed(6); };
      marker.on('drag', e => moved(e.target.getLatLng()));
      map.on('click', e => { marker.setLatLng(e.latlng); moved(e.latlng); });
      map.fitBounds(circle.getBounds(), { padding: [60, 60], maxZoom: 17 });
      setTimeout(() => map.invalidateSize(), 60);
    }
    rad.oninput = () => { radV.textContent = rad.value + 'm'; if (circle) circle.setRadius(+rad.value); };
    const fromInputs = () => {
      const lat = Number(String(f.lat.value).replace(',', '.')), lng = Number(String(f.lng.value).replace(',', '.'));
      if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && marker) { marker.setLatLng([lat, lng]); circle.setLatLng([lat, lng]); map.panTo([lat, lng]); }
    };
    f.lat.onchange = fromInputs; f.lng.onchange = fromInputs;
    // Dán "21.0227, 105.8463" vào ô vĩ độ: tự tách thành hai ô.
    f.lat.addEventListener('paste', e => {
      const t = (e.clipboardData || window.clipboardData).getData('text');
      const mm = t.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
      if (mm) { e.preventDefault(); f.lat.value = mm[1]; f.lng.value = mm[2]; fromInputs(); }
    });
    page.querySelector('#here').onclick = e => {
      const btn = e.currentTarget;
      if (!navigator.geolocation) return toast('Trình duyệt không hỗ trợ định vị');
      btn.disabled = true;
      navigator.geolocation.getCurrentPosition(p => { btn.disabled = false; f.lat.value = p.coords.latitude.toFixed(6); f.lng.value = p.coords.longitude.toFixed(6); fromInputs(); map && map.setView([p.coords.latitude, p.coords.longitude], 17); },
        () => { btn.disabled = false; toast('Không lấy được vị trí. Hãy cho phép quyền Vị trí.'); }, { enableHighAccuracy: true, timeout: 15000 });
    };
    const del = page.querySelector('#delLoc');
    if (del) del.onclick = () => confirmModal('Xoá địa điểm', `Xoá "${cur.name}"? Nhân viên sẽ không chấm công ở địa điểm này được nữa.`, 'Xoá', async () => {
      await API.deleteLocation(cur.id); A.locations = A.locations.filter(l => l.id !== cur.id); ui.locSel = null; toast('Đã xoá địa điểm'); pLocations(page);
    });
    f.addEventListener('submit', e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      const lat = Number(String(d.lat).replace(',', '.')), lng = Number(String(d.lng).replace(',', '.'));
      if (!d.name.trim()) return toast('Nhập tên địa điểm');
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return toast('Toạ độ không hợp lệ');
      const loc = { id: cur.id || undefined, name: d.name.trim(), address: d.address.trim(), wifi: d.wifi.trim(), lat, lng, radius: Number(d.radius) };
      busy(f.querySelector('[type=submit]'), async () => {
        const id = await API.saveLocation(loc);
        loc.id = id;
        const i = A.locations.findIndex(l => l.id === id);
        if (i >= 0) A.locations[i] = loc; else A.locations.push(loc);
        ui.locSel = id; toast('Đã lưu địa điểm'); pLocations(page);
      });
    });
  }

  // ---------------------------------------------------------------- shifts
  async function pShifts(page) {
    const using = id => A.users.filter(u => shiftOf(u).id === id).length;
    page.innerHTML = `<div class="row"><div class="grow muted">Ca làm việc quyết định giờ tính đi muộn, về sớm và ngày công của nhân viên.</div><button class="btn btn-p" id="addS"><i class="icon-plus"></i>Thêm ca</button></div>
      <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tên ca</th><th>Giờ vào</th><th>Giờ ra</th><th>Số giờ</th><th>Ngày làm việc</th><th>Cho phép muộn</th><th class="n">Nhân viên</th><th></th></tr></thead><tbody>
      ${A.shifts.map(s => { const h = (C.mins(s.end) - C.mins(s.start) + 1440) % 1440 / 60; return `<tr><td><b>${esc(s.name)}</b></td><td class="num">${s.start}</td><td class="num">${s.end}</td><td class="num">${num(h)} giờ</td>
        <td>${[1, 2, 3, 4, 5, 6, 0].map(i => `<span class="chip ${(s.workdays || []).includes(i) ? 'admin' : 'gray'}" style="margin-right:3px;padding:2px 7px">${DOW_SHORT[i]}</span>`).join('')}</td>
        <td>${s.grace ? s.grace + ' phút' : 'Không'}</td><td class="n">${using(s.id)}</td>
        <td><div class="acts"><button class="icon-b" data-es="${s.id}" title="Sửa"><i class="icon-pencil"></i></button><button class="icon-b" data-ds="${s.id}" title="${A.shifts.length > 1 ? 'Xoá ca' : 'Cần ít nhất 1 ca: hãy sửa ca này hoặc thêm ca mới trước khi xoá'}" ${A.shifts.length > 1 ? '' : 'disabled style="opacity:.35;cursor:not-allowed"'}><i class="icon-trash-2"></i></button></div></td></tr>`; }).join('') || '<tr><td colspan="8"><div class="empty">Chưa có ca nào</div></td></tr>'}
      </tbody></table></div></div>`;
    page.querySelector('#addS').onclick = () => shiftModal(null, page);
    page.querySelectorAll('[data-es]').forEach(b => { b.onclick = () => shiftModal(A.shifts.find(s => s.id === b.dataset.es), page); });
    page.querySelectorAll('[data-ds]').forEach(b => {
      const s = A.shifts.find(x => x.id === b.dataset.ds);
      b.onclick = () => {
        if (A.shifts.length < 2) return toast('Cần ít nhất 1 ca. Hãy sửa ca này, hoặc thêm ca mới trước khi xoá.');
        const affected = A.users.filter(u => shiftOf(u).id === s.id);
        if (!affected.length) {
          return confirmModal('Xoá ca', `Xoá ca "${s.name}"?`, 'Xoá', async () => { await API.deleteShift(s.id); A.shifts = A.shifts.filter(x => x.id !== s.id); toast('Đã xoá ca'); pShifts(page); });
        }
        // Ca đang có người dùng: chuyển họ sang ca khác rồi mới xoá.
        const others = A.shifts.filter(x => x.id !== s.id);
        const m = modal('Xoá ca', `<div class="modal-b">
          <div class="full">Ca <b>${esc(s.name)}</b> đang được dùng bởi ${affected.length} nhân viên: ${affected.slice(0, 5).map(u => esc(u.name)).join(', ')}${affected.length > 5 ? '…' : ''}.</div>
          <div class="field full"><label for="moveTo">Chuyển những người này sang ca</label><select class="select" id="moveTo">${others.map(x => `<option value="${x.id}">${esc(x.name)} ${x.start}–${x.end}</option>`).join('')}</select></div>
        </div>`, '<button class="btn btn-o" data-close>Hủy</button><button class="btn btn-bad" id="doDel"><i class="icon-trash-2"></i>Chuyển và xoá ca</button>', { size: 'sm' });
        m.querySelector('#doDel').onclick = e => busy(e.currentTarget, async () => {
          const to = m.querySelector('#moveTo').value;
          for (const u of affected) { await API.updateUser(u.uid, { shiftId: to }); u.shiftId = to; }
          await API.deleteShift(s.id);
          A.shifts = A.shifts.filter(x => x.id !== s.id);
          m.remove(); toast(`Đã chuyển ${affected.length} nhân viên và xoá ca "${s.name}"`); pShifts(page);
        });
      };
    });
  }
  function shiftModal(s, page) {
    const isNew = !s; s = s || { name: '', start: '08:00', end: '17:00', workdays: [1, 2, 3, 4, 5], grace: 0 };
    const m = modal(isNew ? 'Thêm ca làm việc' : 'Sửa ca làm việc', `<form class="modal-b" id="sf">
      <div class="field full"><label for="s_name">Tên ca <em>*</em></label><input class="input" id="s_name" name="name" required value="${esc(s.name)}" placeholder="VD: Ca sáng"></div>
      <div class="field"><label for="s_start">Giờ vào ca</label><input class="input" id="s_start" type="time" name="start" required value="${s.start}"></div>
      <div class="field"><label for="s_end">Giờ ra ca</label><input class="input" id="s_end" type="time" name="end" required value="${s.end}"></div>
      <div class="field full"><label>Ngày làm việc</label><div class="days">${[1, 2, 3, 4, 5, 6, 0].map(i => `<label><input type="checkbox" name="wd" value="${i}"${(s.workdays || []).includes(i) ? ' checked' : ''}>${DOW_SHORT[i]}</label>`).join('')}</div></div>
      <div class="field"><label for="s_grace">Cho phép đến muộn (phút)</label><input class="input" id="s_grace" type="number" name="grace" min="0" max="60" value="${s.grace || 0}"><div class="hint">Đến muộn trong khoảng này không bị tính đi muộn.</div></div>
    </form>`, `<button class="btn btn-o" data-close>Hủy</button><button class="btn btn-p" id="saveS">${isNew ? 'Thêm ca' : 'Lưu'}</button>`, { size: 'sm' });
    m.querySelector('#saveS').onclick = e => {
      const fd = new FormData(m.querySelector('#sf')), d = Object.fromEntries(fd);
      if (!d.name.trim()) return toast('Nhập tên ca');
      const wd = fd.getAll('wd').map(Number);
      if (!wd.length) return toast('Chọn ít nhất một ngày làm việc');
      const sh = { id: s.id || undefined, name: d.name.trim(), start: d.start, end: d.end, workdays: wd, grace: Number(d.grace) || 0 };
      busy(e.currentTarget, async () => {
        const id = await API.saveShift(sh); sh.id = id;
        const i = A.shifts.findIndex(x => x.id === id);
        if (i >= 0) A.shifts[i] = sh; else A.shifts.push(sh);
        m.remove(); toast('Đã lưu ca làm việc'); pShifts(page);
      });
    };
  }

  // ---------------------------------------------------------------- timesheet
  const CODE = { full: '✓', late: 'M', missing: 'T', absent: 'V', leave: 'P', half: '½P', trip: 'CT', off: '', future: '', none: '' };
  async function pTimesheet(page) {
    const mk = monthKey(), y = +mk.slice(0, 4), m = +mk.slice(5) - 1;
    const last = new Date(y, m + 1, 0).getDate(), today = dayKey(new Date());
    await loadLogs(`${mk}-01`, `${mk}-${pad(last)}`);
    if (!page.isConnected) return; // người dùng đã chuyển trang trong lúc tải
    const users = A.users.filter(u => u.active !== false || logsOf(u.uid).some(l => l.day.startsWith(mk)));
    const days = Array.from({ length: last }, (_, i) => new Date(y, m, i + 1));
    const rows = users.map(u => {
      const sh = shiftOf(u), logs = logsOf(u.uid), reqs = reqsOf(u.uid), sk = startKeyOf(u);
      const cells = days.map(d => C.dayStatus({ logs, reqs, key: dayKey(d), shift: sh, startKey: sk, today }));
      const sum = C.monthSummary({ logs, reqs, y, m, shift: sh, startKey: sk });
      return { u, sh, cells, sum };
    });
    page.innerHTML = `<div class="row">
        <select class="select" id="mon">${monthOptions()}</select>
        <div class="ts-legend">
          <span><b class="c-full">✓</b>Đủ công</span><span><b class="c-late">M</b>Muộn / về sớm</span><span><b class="c-missing">T</b>Thiếu giờ chấm</span>
          <span><b class="c-absent">V</b>Vắng</span><span><b class="c-leave">P</b>Nghỉ phép</span><span><b class="c-trip">CT</b>Công tác</span><span><b class="c-off">&nbsp;</b>Ngày nghỉ</span>
        </div>
        <div class="grow"></div>
        <button class="btn btn-o" id="csv"><i class="icon-download"></i>Xuất Excel (CSV)</button>
      </div>
      <div class="card ts-wrap"><table class="ts"><thead><tr><th class="name">Nhân viên</th>
        ${days.map(d => `<th class="${d.getDay() === 0 ? 'off' : ''}">${DOW_SHORT[d.getDay()]}<br>${d.getDate()}</th>`).join('')}
        <th>Công</th><th>Phép</th><th>Muộn</th><th>Vắng</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td class="name"><b>${esc(r.u.name)}</b><small>${esc(r.u.code || '')} · ${esc(r.sh.name)}</small></td>
          ${r.cells.map((st, i) => { const key = dayKey(days[i]); const code = st.code === 'off' && st.s.in ? 'full' : st.code; return `<td class="cell c-${code}${key === today ? ' c-today' : ''}"><button data-cell="${r.u.uid}|${key}" title="${esc(r.u.name)} · ${dmy(days[i])}">${CODE[code] ?? ''}</button></td>`; }).join('')}
          <td class="tot">${num(r.sum.work)}</td><td class="tot">${num(r.sum.leave)}</td><td class="tot">${r.sum.late}</td><td class="tot">${r.sum.absent}</td></tr>`).join('')}
      </tbody></table></div>`;
    page.querySelector('#mon').onchange = e => { ui.month = e.target.value; pTimesheet(page); };
    page.querySelectorAll('[data-cell]').forEach(b => { b.onclick = () => { const [uid, key] = b.dataset.cell.split('|'); dayModal(uid, key, page); }; });
    page.querySelector('#csv').onclick = () => {
      const head = ['Mã NV', 'Họ tên', 'Phòng ban', ...days.map(d => `${d.getDate()}/${m + 1}`), 'Công', 'Nghỉ phép', 'Đi muộn (lần)', 'Vắng'];
      C.csvDownload(`bang-cong-${mk}.csv`, [head, ...rows.map(r => [r.u.code, r.u.name, r.u.dept, ...r.cells.map(st => CODE[st.code] || ''), num(r.sum.work), num(r.sum.leave), r.sum.late, r.sum.absent])]);
    };
  }
  function dayModal(uid, key, page) {
    const u = userBy(uid), sh = shiftOf(u);
    const st = C.dayStatus({ logs: logsOf(uid), reqs: reqsOf(uid), key, shift: sh, startKey: startKeyOf(u) });
    const logs = A.logs.filter(l => l.uid === uid && l.day === key).sort((a, b) => a.ts - b.ts);
    const m = modal(`${u.name} · ${C.longDate(fromKey(key))}`, `<div class="modal-b">
      <div class="full kv"><span>Ca làm việc</span><b>${esc(sh.name)} ${sh.start} – ${sh.end}</b>
        <span>Giờ vào</span><b>${st.s.in ? hm(st.s.in.ts) + (st.s.lateBy ? ` · <span style="color:var(--absent)">muộn ${st.s.lateBy} phút</span>` : '') : '—'}</b>
        <span>Giờ ra</span><b>${st.s.out ? hm(st.s.out.ts) + (st.s.earlyBy ? ` · <span style="color:var(--absent)">sớm ${st.s.earlyBy} phút</span>` : '') : '—'}</b>
        <span>Công</span><b>${num(st.work)}${st.leave ? ` · nghỉ phép ${num(st.leave)}` : ''}</b></div>
      <div class="full"><table class="tbl"><thead><tr><th>Giờ</th><th>Loại</th><th>Phương thức</th><th>Trạng thái</th></tr></thead><tbody>
        ${logs.map(l => `<tr><td class="num">${hm(l.ts)}</td><td>${KIND[l.kind].type}</td><td>${esc(l.method)}${l.dist != null ? ' · ' + C.fmtDist(l.dist) : ''}</td><td>${l.status === 'ok' ? '<span class="chip ok">Hợp lệ</span>' : l.status === 'pending' ? '<span class="chip pending">Chờ duyệt</span>' : '<span class="chip bad">Từ chối</span>'}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Không có lượt chấm nào</td></tr>'}
      </tbody></table></div>
      <div class="field"><label for="addKind">Thêm lượt chấm thủ công</label><select class="select" id="addKind"><option value="in">Vào ca</option><option value="out">Ra ca</option></select></div>
      <div class="field"><label for="addTime">Giờ</label><input class="input" type="time" id="addTime" value="${sh.start}"></div>
    </div>`, `<button class="btn btn-o" data-close>Đóng</button><button class="btn btn-p" id="addLog"><i class="icon-plus"></i>Thêm lượt chấm</button>`);
    m.querySelector('#addLog').onclick = e => busy(e.currentTarget, async () => {
      const [h, mi] = m.querySelector('#addTime').value.split(':').map(Number);
      const d = fromKey(key); d.setHours(h, mi, 0, 0);
      const log = await API.addLog({ uid, ts: d.getTime(), kind: m.querySelector('#addKind').value, method: 'Quản trị', status: 'ok' });
      A.logs.push(log);
      await API.notify(uid, `Quản trị ${A.me.name} đã thêm lượt chấm ${KIND[log.kind].type.toLowerCase()} lúc ${hm(log.ts)} ngày ${dmy(log.ts)} cho bạn.`).catch(() => {});
      m.remove(); toast('Đã thêm lượt chấm công'); pTimesheet(page);
    });
  }

  // ---------------------------------------------------------------- reports
  async function pReports(page) {
    const mk = monthKey(), y = +mk.slice(0, 4), m = +mk.slice(5) - 1, last = new Date(y, m + 1, 0).getDate();
    await loadLogs(`${mk}-01`, `${mk}-${pad(last)}`);
    if (!page.isConnected) return; // người dùng đã chuyển trang trong lúc tải
    const rows = A.users.filter(u => u.active !== false).map(u => ({ u, s: C.monthSummary({ logs: logsOf(u.uid), reqs: reqsOf(u.uid), y, m, shift: shiftOf(u), startKey: startKeyOf(u) }) }));
    const tot = rows.reduce((a, r) => { Object.keys(r.s).forEach(k => { a[k] = (a[k] || 0) + r.s[k]; }); return a; }, {});
    const depts = {};
    rows.forEach(r => { const k = r.u.dept || 'Chưa phân phòng'; (depts[k] = depts[k] || { work: 0, need: 0, n: 0 }); depts[k].work += r.s.work; depts[k].need += Math.max(0, elapsedWorkdays(r.u, y, m) - r.s.leave); depts[k].n++; });
    const deptRows = Object.entries(depts).map(([k, v]) => ({ k, n: v.n, pct: v.need ? Math.min(100, Math.round(v.work / v.need * 100)) : 0 })).sort((a, b) => b.pct - a.pct);
    const topLate = rows.filter(r => r.s.late).sort((a, b) => b.s.lateMin - a.s.lateMin).slice(0, 5);
    page.innerHTML = `<div class="row"><select class="select" id="mon">${monthOptions()}</select><div class="grow"></div><button class="btn btn-o" id="csv"><i class="icon-download"></i>Xuất Excel (CSV)</button></div>
      <div class="stats">
        <div class="card stat"><div class="lbl">Tổng ngày công</div><div class="val">${num(tot.work || 0)}</div><div class="foot">${rows.length} nhân viên</div></div>
        <div class="card stat"><div class="lbl">Nghỉ phép</div><div class="val">${num(tot.leave || 0)}<small> ngày</small></div><div class="foot">Đơn nghỉ đã duyệt</div></div>
        <div class="card stat"><div class="lbl">Đi muộn</div><div class="val">${tot.late || 0}<small> lần</small></div><div class="foot">Tổng ${tot.lateMin || 0} phút</div></div>
        <div class="card stat"><div class="lbl">Làm thêm giờ</div><div class="val">${num(tot.ot || 0)}<small> giờ</small></div><div class="foot">Đơn làm thêm đã duyệt</div></div>
      </div>
      <div class="col">
        <div class="card"><div class="card-h"><h2 class="grow">Tổng hợp theo nhân viên</h2><span class="sub">Tháng ${m + 1}/${y}</span></div>
          <div class="card-b" style="padding:12px 0 0"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nhân viên</th><th class="n">Công chuẩn</th><th class="n">Công thực tế</th><th class="n">Phép</th><th class="n">Muộn</th><th class="n">Phút muộn</th><th class="n">Về sớm</th><th class="n">Vắng</th><th class="n">Thiếu chấm</th><th class="n">Làm thêm (giờ)</th></tr></thead><tbody>
          ${rows.map(r => `<tr><td><div class="who"><div class="av sm">${esc(initials(r.u.name))}</div><div><b>${esc(r.u.name)}</b><small>${esc(r.u.dept || '')}</small></div></div></td>
            <td class="n">${r.s.workdays}</td><td class="n"><b>${num(r.s.work)}</b></td><td class="n">${num(r.s.leave)}</td><td class="n">${r.s.late}</td><td class="n">${r.s.lateMin}</td><td class="n">${r.s.early}</td><td class="n">${r.s.absent}</td><td class="n">${r.s.missing}</td><td class="n">${num(r.s.ot)}</td></tr>`).join('')}
          </tbody><tfoot><tr><td>Tổng</td><td class="n"></td><td class="n">${num(tot.work || 0)}</td><td class="n">${num(tot.leave || 0)}</td><td class="n">${tot.late || 0}</td><td class="n">${tot.lateMin || 0}</td><td class="n">${tot.early || 0}</td><td class="n">${tot.absent || 0}</td><td class="n">${tot.missing || 0}</td><td class="n">${num(tot.ot || 0)}</td></tr></tfoot></table></div></div></div>
        <div class="grid-2b">
          <div class="card"><div class="card-h"><div class="grow"><h2>Tỉ lệ chuyên cần theo phòng ban</h2><div class="sub">Công thực tế / công cần có (đã trừ nghỉ phép)</div></div></div>
            <div class="card-b" style="display:flex;flex-direction:column;gap:14px">${deptRows.map(d => `<div><div class="row" style="justify-content:space-between;margin-bottom:6px"><span style="font-weight:600">${esc(d.k)} <span class="muted" style="font-weight:400">· ${d.n} người</span></span><b class="num">${d.pct}%</b></div>
              <div style="height:8px;background:var(--line-2);border-radius:4px"><div style="height:8px;width:${d.pct}%;background:var(--orange);border-radius:4px"></div></div></div>`).join('') || '<div class="empty">Chưa có dữ liệu</div>'}</div></div>
          <div class="card"><div class="card-h"><h2 class="grow">Đi muộn nhiều nhất</h2></div>
            <div class="card-b" style="padding:8px 0 4px">${topLate.map(r => `<div class="li"><div class="av sm">${esc(initials(r.u.name))}</div><div class="m"><div class="t1">${esc(r.u.name)}</div><div class="t2">${r.s.late} lần · ${r.s.lateMin} phút</div></div></div>`).join('') || '<div class="empty"><i class="icon-thumbs-up"></i>Không ai đi muộn tháng này</div>'}</div></div>
        </div>
      </div>`;
    page.querySelector('#mon').onchange = e => { ui.month = e.target.value; pReports(page); };
    page.querySelector('#csv').onclick = () => C.csvDownload(`bao-cao-cong-${mk}.csv`, [['Mã NV', 'Họ tên', 'Phòng ban', 'Công chuẩn', 'Công thực tế', 'Nghỉ phép', 'Đi muộn (lần)', 'Phút muộn', 'Về sớm (lần)', 'Vắng', 'Thiếu chấm', 'Làm thêm (giờ)'],
      ...rows.map(r => [r.u.code, r.u.name, r.u.dept, r.s.workdays, num(r.s.work), num(r.s.leave), r.s.late, r.s.lateMin, r.s.early, r.s.absent, r.s.missing, num(r.s.ot)])]);
  }
  function elapsedWorkdays(u, y, m) {
    const sh = shiftOf(u), sk = startKeyOf(u), today = dayKey(new Date());
    let n = 0;
    for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) { const dt = new Date(y, m, d), k = dayKey(dt); if (k < today && (!sk || k >= sk) && C.isWorkday(dt, sh)) n++; }
    return n;
  }

  // ---------------------------------------------------------------- settings
  async function pSettings(page) {
    const s = A.company.settings;
    page.innerHTML = `<div class="grid-2">
      <div class="col">
        <form class="card" id="cf"><div class="card-h"><h2 class="grow">Thông tin công ty</h2></div>
          <div class="card-b" style="display:grid;grid-template-columns:1fr 1fr;gap:14px 16px">
            <div class="field"><label for="c_name">Tên công ty</label><input class="input" id="c_name" name="name" value="${esc(A.company.name)}" required></div>
            <div class="field"><label for="c_code">Mã công ty</label><input class="input" id="c_code" value="${esc(A.company.code)}" disabled><div class="hint">Nhân viên nhập mã này khi đăng nhập. Không đổi được.</div></div>
            <div class="field"><label for="c_leave">Số ngày phép năm mặc định</label><input class="input" id="c_leave" name="leavePerYear" type="number" min="0" max="60" step="0.5" value="${s.leavePerYear}"><div class="hint">Áp dụng cho nhân viên thêm mới; sửa riêng từng người ở mục Nhân viên.</div></div>
            <div class="field"><label>Chấm công bằng Wifi</label><label class="switch"><input type="checkbox" name="allowWifi"${s.allowWifi !== false ? ' checked' : ''}>Cho phép nhân viên chọn Wifi</label><div class="hint">Lượt chấm Wifi không xác minh được sẽ vào mục Duyệt đơn › Chấm công chờ duyệt.</div></div>
            <div style="grid-column:1/-1;display:flex;justify-content:flex-end"><button class="btn btn-p" type="submit">Lưu cài đặt</button></div>
          </div></form>
        <form class="card" id="pf"><div class="card-h"><h2 class="grow">Đổi mật khẩu của bạn</h2></div>
          <div class="card-b" style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:14px;align-items:end">
            <div class="field"><label for="p0">Mật khẩu hiện tại</label><input class="input" id="p0" name="old" type="password" required autocomplete="current-password"></div>
            <div class="field"><label for="p1">Mật khẩu mới</label><input class="input" id="p1" name="n1" type="password" required minlength="6" autocomplete="new-password"></div>
            <div class="field"><label for="p2">Nhập lại</label><input class="input" id="p2" name="n2" type="password" required autocomplete="new-password"></div>
            <button class="btn btn-o" type="submit">Đổi mật khẩu</button>
          </div></form>
      </div>
      <div class="col">
        <div class="card"><div class="card-h"><h2 class="grow">Kết nối dữ liệu</h2>${API.mode === 'demo' ? '<span class="chip pending">Dùng thử</span>' : '<span class="chip ok">Firebase</span>'}</div>
          <div class="card-b hint" style="font-size:13px;line-height:1.6">${API.mode === 'demo'
            ? 'App đang chạy <b>chế độ dùng thử</b>: dữ liệu mẫu chỉ lưu trong trình duyệt này, người khác không thấy. Để cả công ty dùng chung, tạo dự án Firebase miễn phí và dán cấu hình vào file <b>config.js</b> (hướng dẫn trong README).<div style="margin-top:14px"><button class="btn btn-bad btn-sm" id="resetDemo"><i class="icon-rotate-ccw"></i>Đặt lại dữ liệu mẫu</button></div>'
            : 'Dữ liệu lưu trên Cloud Firestore, phân quyền theo file <b>firestore.rules</b>: nhân viên chỉ xem được dữ liệu của mình, quản trị xem được toàn công ty.'}</div></div>
        <div class="card"><div class="card-h"><h2 class="grow">Mời nhân viên dùng app</h2></div>
          <div class="card-b hint" style="font-size:13px;line-height:1.7">1. Thêm nhân viên ở mục <a href="#/users">Nhân viên</a>.<br>2. Gửi cho họ đường link app, <b>mã công ty ${esc(A.company.code)}</b>, tài khoản và mật khẩu.<br>3. Trên điện thoại: mở link › Chia sẻ › <b>Thêm vào MH chính</b> để dùng như app.
            <div class="row" style="margin-top:12px"><input class="input grow" id="appUrl" readonly value="${esc(new URL('index.html', location.href).href)}"><button class="btn btn-o btn-sm" id="copyUrl"><i class="icon-copy"></i>Sao chép</button></div></div></div>
      </div></div>`;
    page.querySelector('#cf').addEventListener('submit', e => {
      e.preventDefault();
      const f = e.currentTarget, d = Object.fromEntries(new FormData(f));
      busy(f.querySelector('[type=submit]'), async () => {
        const settings = { leavePerYear: Number(d.leavePerYear) || 0, allowWifi: !!d.allowWifi };
        await API.updateCompany({ name: d.name.trim(), settings });
        A.company.name = d.name.trim(); A.company.settings = { ...A.company.settings, ...settings };
        toast('Đã lưu cài đặt'); render();
      });
    });
    page.querySelector('#pf').addEventListener('submit', e => {
      e.preventDefault();
      const f = e.currentTarget, d = Object.fromEntries(new FormData(f));
      if (d.n1.length < 6) return toast('Mật khẩu cần ít nhất 6 ký tự');
      if (d.n1 !== d.n2) return toast('Hai mật khẩu mới không khớp');
      busy(f.querySelector('[type=submit]'), async () => { await API.changePassword(d.old, d.n1); f.reset(); toast('Đã đổi mật khẩu'); });
    });
    page.querySelector('#copyUrl').onclick = () => {
      const inp = page.querySelector('#appUrl');
      (navigator.clipboard ? navigator.clipboard.writeText(inp.value) : Promise.reject()).then(() => toast('Đã sao chép link')).catch(() => { inp.select(); toast('Nhấn Ctrl+C để sao chép'); });
    };
    const rd = page.querySelector('#resetDemo');
    if (rd) rd.onclick = () => confirmModal('Đặt lại dữ liệu mẫu', 'Xoá mọi thay đổi và tạo lại dữ liệu mẫu ban đầu?', 'Đặt lại', async () => {
      await API.resetDemo(); const s2 = await API.signIn('DEMO', 'admin', '123456'); A.range = null; await enter(s2); toast('Đã đặt lại dữ liệu mẫu');
    });
  }

  // ---------------------------------------------------------------- boot
  (async () => {
    $root.innerHTML = '<div class="empty" style="padding-top:30vh"><i class="icon-loader-circle spin"></i>Đang tải...</div>';
    try { const s = await API.ready(); if (s) await enter(s); else renderLogin(); }
    catch (e) { renderLogin(errMsg(e)); }
  })();
})();
