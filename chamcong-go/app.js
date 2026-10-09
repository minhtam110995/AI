'use strict';
/* ChấmCông Go — app chấm công GPS (PWA, dữ liệu lưu trên máy). */
(() => {
  const VERSION = '1.0.0';
  const KEY = 'chamcong-go.v1';
  const $app = document.getElementById('app');

  // ---------------------------------------------------------------- data
  const defaults = () => ({
    profile: null, // { name, role, code, dept }
    createdAt: null,
    office: {
      name: 'Văn phòng Hà Nội',
      address: 'Tầng 12, 72 Trần Hưng Đạo, P. Trần Hưng Đạo, Q. Hoàn Kiếm, Hà Nội',
      lat: 21.0227, lng: 105.8463, radius: 150, wifi: ''
    },
    shift: { name: 'Hành chính', start: '08:00', end: '17:30', workdays: [1, 2, 3, 4, 5, 6] },
    leaveTotal: 12,
    logs: [],       // { id, ts, kind: in|out|ot|duty, method: GPS|Wifi, dist, acc, status: ok|pending }
    proposals: [],  // { id, type, created, status, ...fields }
    notis: []       // { id, ts, text, read }
  });

  let db = load();
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = Object.assign(defaults(), JSON.parse(raw));
        d.office = Object.assign(defaults().office, d.office);
        d.shift = Object.assign(defaults().shift, d.shift);
        return d;
      }
    } catch (e) { /* storage unavailable */ }
    return defaults();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (e) { toast('Không lưu được dữ liệu trên máy này'); }
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------------------------------------------------------------- helpers
  const DOW = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const DOW_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const pad = n => String(n).padStart(2, '0');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hm = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const dmy = d => { d = new Date(d); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
  const longDate = d => { d = new Date(d); return `${DOW[d.getDay()]}, ${dmy(d)}`; };
  const dayKey = d => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const keyToDmy = k => k ? dmy(fromKey(k)) : '';
  const mins = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
  const minsOfTs = ts => { const d = new Date(ts); return d.getHours() * 60 + d.getMinutes(); };
  const fmtDist = m => m == null ? '--' : m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
  const initials = name => {
    const w = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!w.length) return '?';
    return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[w.length - 1][0]).toUpperCase();
  };
  function relTime(ts) {
    const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return 'Vừa xong';
    if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
    if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
    if (s < 86400 * 30) return `${Math.floor(s / 86400)} ngày trước`;
    return dmy(ts);
  }
  function haversine(a, b) {
    const R = 6371000, rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  let toastTimer;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function addNoti(text) {
    db.notis.unshift({ id: uid(), ts: Date.now(), text, read: false });
    db.notis = db.notis.slice(0, 200);
  }

  // ---------------------------------------------------------------- attendance logic
  const KIND = {
    in: { label: 'Giờ vào', type: 'Vào ca', cta: 'Xác nhận chấm công vào ca', done: 'giờ vào ca' },
    out: { label: 'Giờ ra', type: 'Ra ca', cta: 'Xác nhận chấm công ra ca', done: 'giờ ra ca' },
    ot: { label: 'Làm thêm giờ', type: 'Làm thêm giờ', cta: 'Xác nhận chấm làm thêm giờ', done: 'giờ làm thêm' },
    duty: { label: 'Trực ca kíp', type: 'Trực ca kíp', cta: 'Xác nhận chấm trực ca kíp', done: 'ca trực' }
  };
  const logsOn = key => db.logs.filter(l => dayKey(l.ts) === key).sort((a, b) => a.ts - b.ts);
  function daySummary(key) {
    const logs = logsOn(key);
    const ins = logs.filter(l => l.kind === 'in');
    const outs = logs.filter(l => l.kind === 'out');
    const first = ins[0] || null, last = outs[outs.length - 1] || null;
    const lateBy = first ? Math.max(0, minsOfTs(first.ts) - mins(db.shift.start)) : 0;
    const earlyBy = last ? Math.max(0, mins(db.shift.end) - minsOfTs(last.ts)) : 0;
    const extras = logs.filter(l => l.kind === 'ot' || l.kind === 'duty');
    return { logs, in: first, out: last, lateBy, earlyBy, extras };
  }
  const nextMainKind = () => logsOn(dayKey(new Date())).some(l => l.kind === 'in') ? 'out' : 'in';
  const isWorkday = d => db.shift.workdays.includes(new Date(d).getDay());

  function monthStats(y, m) {
    const today = dayKey(new Date());
    const days = new Date(y, m + 1, 0).getDate();
    let work = 0, full = 0, late = 0;
    for (let d = 1; d <= days; d++) {
      const date = new Date(y, m, d), key = dayKey(date);
      if (isWorkday(date)) work++;
      if (key > today) continue;
      const s = daySummary(key);
      if (s.in && s.out) full++;
      if (s.in && s.lateBy > 0) late++;
    }
    return { work, full, late };
  }

  // Trạng thái chấm của một ngày cho chấm màu trên lịch.
  function dayDot(date) {
    const key = dayKey(date), today = dayKey(new Date());
    if (key > today) return '';
    const s = daySummary(key);
    const hasLog = s.logs.length > 0;
    if (!isWorkday(date)) return hasLog ? 'green' : '';
    const start = db.createdAt ? dayKey(db.createdAt) : today;
    if (!hasLog) return key < today && key >= start ? (onLeave(key) ? 'amber' : 'red') : '';
    if (key === today) return s.in && !s.lateBy ? 'green' : 'red';
    return s.in && s.out && !s.lateBy ? 'green' : 'red';
  }
  const onLeave = key => db.proposals.some(p => (p.type === 'leave' || p.type === 'trip') && p.from <= key && key <= (p.to || p.from));

  // ---------------------------------------------------------------- geolocation
  const geo = { fix: null, err: null, at: 0, watchId: null, listeners: new Set() };
  function geoErrText(e) {
    if (!('geolocation' in navigator)) return 'Thiết bị không hỗ trợ định vị GPS';
    if (!window.isSecureContext) return 'Cần mở app qua HTTPS để dùng GPS';
    if (e && e.code === 1) return 'Bạn chưa cho phép truy cập vị trí. Hãy bật quyền Vị trí cho trình duyệt.';
    if (e && e.code === 3) return 'Hết thời gian chờ định vị. Hãy thử lại ở nơi thoáng.';
    return 'Không xác định được vị trí. Hãy bật GPS và thử lại.';
  }
  function onFix(p) {
    geo.fix = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, ts: p.timestamp || Date.now() };
    geo.err = null; geo.at = Date.now();
    geo.listeners.forEach(fn => fn());
  }
  function onGeoErr(e) {
    geo.err = geoErrText(e);
    geo.listeners.forEach(fn => fn());
  }
  function locateOnce() {
    if (!('geolocation' in navigator) || !window.isSecureContext) { onGeoErr(null); return; }
    navigator.geolocation.getCurrentPosition(onFix, onGeoErr, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }
  function startWatch() {
    stopWatch();
    if (!('geolocation' in navigator) || !window.isSecureContext) { onGeoErr(null); return; }
    geo.watchId = navigator.geolocation.watchPosition(onFix, onGeoErr, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }
  function stopWatch() {
    if (geo.watchId != null) navigator.geolocation.clearWatch(geo.watchId);
    geo.watchId = null;
  }
  const officeDist = () => geo.fix ? haversine(geo.fix, db.office) : null;
  const MAX_ACC = 150; // Độ chính xác tối thiểu (m) để chấp nhận lượt chấm

  // ---------------------------------------------------------------- router
  const ui = { popup: null, histTab: 'cong', histMonth: null, histSel: null };
  let cleanup = [];
  function route() {
    const h = location.hash.replace(/^#\/?/, '') || 'home';
    const [path, q] = h.split('?');
    return { parts: path.split('/'), params: Object.fromEntries(new URLSearchParams(q || '')) };
  }
  const go = h => { location.hash = '#/' + h; };
  window.addEventListener('hashchange', () => { ui.popup = null; render(); window.scrollTo(0, 0); });

  function render() {
    cleanup.forEach(fn => fn()); cleanup = [];
    if (!db.profile) return renderLogin();
    const { parts, params } = route();
    const screens = {
      home: renderHome, gps: () => renderGps(params.kind), wifi: () => renderWifi(params.kind),
      success: () => renderSuccess(parts[1]), proposals: renderProposals,
      proposal: () => renderProposalForm(parts[1], params), notis: renderNotis,
      history: renderHistory, profile: renderProfile, settings: () => renderSettings(parts[1])
    };
    (screens[parts[0]] || renderHome)();
  }

  // ---------------------------------------------------------------- shared pieces
  function tabbar(active) {
    const unread = db.notis.some(n => !n.read);
    const tabs = [['home', 'house', 'Trang chủ'], ['proposals', 'square-pen', 'Đề xuất'], ['notis', 'bell', 'Thông báo'], ['profile', 'user-round', 'Cá nhân']];
    return `<nav class="tabbar">${tabs.map(([r, icon, label]) => `
      <button class="${r === active ? 'on' : ''}" data-go="${r}">
        <i class="icon-${icon}">${r === 'notis' && unread ? '<b class="tab-badge"></b>' : ''}</i><span>${label}</span>
      </button>`).join('')}</nav>`;
  }
  function topbar(title, { back, right, extra = '' } = {}) {
    return `<header class="topbar">
      <div class="topbar-row">
        ${back ? `<button class="tb-left" data-act="back" data-to="${esc(back)}" aria-label="Quay lại"><i class="icon-arrow-left"></i></button>` : ''}
        ${esc(title)}
        ${right || ''}
      </div>${extra || '<div class="topbar-pad"></div>'}
    </header>`;
  }
  function confirmDialog(title, msg, okText, onOk, danger) {
    const wrap = document.createElement('div');
    wrap.className = 'overlay';
    wrap.innerHTML = `<div class="dialog" role="dialog">
      <div class="dialog-head"><b>${esc(title)}</b></div>
      <div class="dialog-msg">${esc(msg)}</div>
      <div class="dialog-actions">
        <button class="btn-ghost" data-x>Hủy</button>
        <button class="${danger ? 'btn-danger' : 'btn-primary'}" style="height:46px;border-radius:12px;font-size:15px" data-ok>${esc(okText)}</button>
      </div></div>`;
    wrap.addEventListener('click', e => {
      if (e.target === wrap || e.target.closest('[data-x]')) wrap.remove();
      else if (e.target.closest('[data-ok]')) { wrap.remove(); onOk(); }
    });
    document.body.appendChild(wrap);
  }

  // ---------------------------------------------------------------- login
  function renderLogin() {
    $app.innerHTML = `<div class="login">
      <div class="login-hero">
        <div class="logo"><i class="icon-scan-face"></i></div>
        <h1>ChấmCông Go</h1>
        <p>Chấm công bằng GPS hoặc Wifi văn phòng, xem bảng công và gửi đề xuất ngay trên điện thoại.</p>
      </div>
      <form class="form" id="loginForm" autocomplete="on">
        <div class="field"><label>Họ và tên <em>*</em></label><input name="name" required placeholder="VD: Nguyễn Văn An" autocomplete="name"></div>
        <div class="row2">
          <div class="field"><label>Mã nhân viên</label><input name="code" placeholder="NV-0248"></div>
          <div class="field"><label>Phòng ban</label><input name="dept" placeholder="Phòng Kinh doanh"></div>
        </div>
        <div class="field"><label>Chức danh</label><input name="role" placeholder="Nhân viên kinh doanh" autocomplete="organization-title"></div>
        <button class="btn-primary" type="submit" style="margin-top:6px">Bắt đầu</button>
        <button class="link-btn" type="button" data-act="demo">Dùng thử với dữ liệu mẫu</button>
      </form>
    </div>`;
    document.getElementById('loginForm').addEventListener('submit', e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      if (!f.name.trim()) return;
      db.profile = { name: f.name.trim(), code: f.code.trim(), dept: f.dept.trim(), role: f.role.trim() || 'Nhân viên' };
      db.createdAt = Date.now();
      addNoti(`Chào mừng ${db.profile.name} đến với ChấmCông Go. Hãy kiểm tra vị trí văn phòng trong mục Cá nhân › Văn phòng chấm công.`);
      save(); go('home'); render();
    });
  }

  function seedDemo() {
    db = defaults();
    db.profile = { name: 'Nguyễn Văn An', code: 'NV-0248', dept: 'Phòng Kinh doanh', role: 'Nhân viên kinh doanh' };
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    db.createdAt = start.getTime();
    let i = 0;
    for (let d = new Date(start); dayKey(d) < dayKey(now); d.setDate(d.getDate() + 1)) {
      if (!isWorkday(d)) continue;
      i++;
      const at = (h, m) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
      const late = i % 9 === 4;
      db.logs.push({ id: uid(), ts: late ? at(8, 17) : at(7, 50 + (i * 7) % 9), kind: 'in', method: 'GPS', dist: 20 + (i * 13) % 90, acc: 8, status: 'ok' });
      if (i % 11 !== 6) db.logs.push({ id: uid(), ts: at(17, 30 + (i % 8)), kind: 'out', method: i % 2 ? 'Wifi' : 'GPS', dist: 30, acc: 10, status: 'ok' });
      if (i % 10 === 3) db.logs.push({ id: uid(), ts: at(18, 5), kind: 'ot', method: 'GPS', dist: 25, acc: 9, status: 'ok' });
    }
    const t = now.getTime();
    db.notis = [
      { id: uid(), ts: t - 8 * 60e3, text: 'Đơn nghỉ phép của bạn đã được gửi tới quản lý, đang chờ phê duyệt.', read: false },
      { id: uid(), ts: t - 26 * 3600e3, text: `Dữ liệu chấm công ra lúc 17:35 ${dmy(t - 86400e3)} hợp lệ.`, read: true },
      { id: uid(), ts: t - 3 * 86400e3, text: 'Nhắc nhở: Bạn có 1 ngày chưa chấm công ra ca. Hãy gửi giải trình.', read: true }
    ];
    const next = new Date(now); next.setDate(next.getDate() + 7);
    db.proposals = [{ id: uid(), type: 'leave', created: t - 8 * 60e3, status: 'pending', from: dayKey(next), to: dayKey(next), part: 'Cả ngày', reason: 'Việc gia đình' }];
    save();
  }

  // ---------------------------------------------------------------- home
  function homeLocLine() {
    const d = officeDist();
    if (geo.fix && d != null) {
      const inside = d <= db.office.radius;
      return `<button class="loc-line ${inside ? 'ok' : 'bad'}" data-act="locate"><span class="pulse"></span>Bạn đang cách văn phòng ${fmtDist(d)} – ${inside ? 'Trong vùng chấm công' : 'Ngoài vùng chấm công'}</button>`;
    }
    if (geo.err) return `<button class="loc-line bad" data-act="locate"><span class="pulse"></span>${esc(geo.err)}</button>`;
    return `<button class="loc-line idle" data-act="locate"><span class="pulse"></span>Chưa xác định vị trí – bấm để định vị</button>`;
  }

  function renderHome() {
    const p = db.profile, today = new Date();
    const unread = db.notis.some(n => !n.read);
    const logs = logsOn(dayKey(today));
    const kind = nextMainKind();
    $app.innerHTML = `<div class="screen with-tabs">
      <div class="hero">
        <div class="hero-user">
          <div class="avatar">${esc(initials(p.name))}</div>
          <div style="flex:1;min-width:0">
            <div class="hero-hello">Xin chào,</div>
            <div class="hero-name">${esc(p.name)}</div>
            <div class="hero-role">${esc(p.role)}</div>
          </div>
          <button class="icon-btn-glass" data-go="notis" aria-label="Thông báo"><i class="icon-bell"></i>${unread ? '<span class="badge-dot"></span>' : ''}</button>
        </div>
      </div>
      <div class="content lift">
        <div class="card raised shift-card">
          <div class="row-head"><b>Ca làm việc hôm nay</b><span>${longDate(today)}</span></div>
          ${isWorkday(today) ? `<div class="shift-grid">
            <div><div class="lbl">Vào ca</div><div class="val">${esc(db.shift.start)}</div></div>
            <div class="sep"></div>
            <div style="text-align:right"><div class="lbl">Ra ca</div><div class="val">${esc(db.shift.end)}</div></div>
          </div>` : `<div style="font-size:14px;color:var(--muted);padding:8px 0">Hôm nay là ngày nghỉ theo lịch làm việc.</div>`}
        </div>
        <button class="cta-big tap" data-act="popup" data-kind="${kind}">
          <div class="ico"><i class="icon-scan-face"></i></div>
          <div class="txt"><b>Chấm công</b><small>${kind === 'in' ? 'Chấm vào ca' : 'Chấm ra ca'}</small></div>
          <i class="icon-chevron-right"></i>
        </button>
        <div class="loc-status">
          <div id="locLine">${homeLocLine()}</div>
          <div class="loc-office"><i class="icon-map-pin"></i>${esc(db.office.name)} · ${esc(db.office.address)}</div>
        </div>
        <div class="quick-grid">
          <button class="quick tap" data-act="popup" data-kind="ot"><div class="ico"><i class="icon-timer"></i></div><span>Chấm làm thêm giờ</span></button>
          <button class="quick tap" data-act="popup" data-kind="duty"><div class="ico"><i class="icon-shield-check"></i></div><span>Chấm trực ca kíp</span></button>
        </div>
        <div class="section-head"><b>Chi tiết chấm công hôm nay</b><button data-go="history">Xem lịch sử</button></div>
        ${logs.length ? logs.map(l => `
          <div class="log-item">
            <i class="icon-clock"></i>
            <div class="main">
              <div class="t1">${KIND[l.kind].label}: ${hm(l.ts)}</div>
              <div class="t2">Trạng thái: <b style="color:${l.status === 'ok' ? 'var(--green)' : 'var(--red)'}">${l.status === 'ok' ? 'Thành công' : 'Chờ phê duyệt'}</b></div>
            </div>
            <span class="meth">${esc(l.method)}</span>
          </div>`).join('') : `<div class="card empty"><i class="icon-calendar-clock"></i>Bạn chưa chấm công hôm nay</div>`}
      </div>
      ${tabbar('home')}
    </div>`;
    if (ui.popup) showMethodPopup(ui.popup);

    const refresh = () => { const el = document.getElementById('locLine'); if (el) el.innerHTML = homeLocLine(); };
    geo.listeners.add(refresh);
    cleanup.push(() => geo.listeners.delete(refresh));
    // Lấy vị trí khi đã được cấp quyền, để hiện khoảng cách tới văn phòng.
    if (!geo.fix || Date.now() - geo.at > 60e3) {
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' }).then(s => { if (s.state === 'granted') locateOnce(); }).catch(() => {});
      }
    }
  }

  function showMethodPopup(kind) {
    ui.popup = kind;
    const title = kind === 'ot' ? 'Chấm làm thêm giờ' : kind === 'duty' ? 'Chấm trực ca kíp' : 'Chấm công';
    const wrap = document.createElement('div');
    wrap.className = 'overlay'; wrap.id = 'methodPopup';
    wrap.innerHTML = `<div class="dialog" role="dialog" aria-label="${title}">
      <div class="dialog-head"><b>${title}</b><button class="dialog-close" data-x aria-label="Đóng"><i class="icon-x"></i></button></div>
      <div class="dialog-sub">Chọn cách xác thực vị trí</div>
      <div class="dialog-body">
        <button class="opt tap" data-m="wifi">
          <div class="sq" style="background:var(--blue-soft);color:var(--blue)"><i class="icon-wifi"></i></div>
          <div class="main"><b>Wifi</b><small>Kết nối mạng Wifi văn phòng</small></div><i class="icon-chevron-right"></i>
        </button>
        <button class="opt tap" data-m="gps">
          <div class="sq" style="background:var(--orange-soft);color:var(--orange)"><i class="icon-locate-fixed"></i></div>
          <div class="main"><b>GPS</b><small>Xác định vị trí hiện tại của bạn</small></div><i class="icon-chevron-right"></i>
        </button>
      </div></div>`;
    const close = () => { wrap.remove(); ui.popup = null; };
    wrap.addEventListener('click', e => {
      const m = e.target.closest('[data-m]');
      if (e.target === wrap || e.target.closest('[data-x]')) close();
      else if (m) { close(); go(`${m.dataset.m}?kind=${kind}`); }
    });
    document.body.appendChild(wrap);
    cleanup.push(() => wrap.remove());
  }

  // ---------------------------------------------------------------- GPS check-in
  function renderGps(kind) {
    kind = KIND[kind] ? kind : nextMainKind();
    const o = db.office;
    $app.innerHTML = `<div class="gps-screen">
      <div id="map" class="gps-map"></div>
      <div class="gps-top">
        <button class="float-btn" data-act="back" data-to="home" aria-label="Quay lại"><i class="icon-arrow-left"></i></button>
        <div class="float-pill">${kind === 'in' || kind === 'out' ? 'Chấm công GPS' : esc(KIND[kind].label) + ' · GPS'}</div>
      </div>
      <button class="float-btn gps-locate" id="recenter" aria-label="Về vị trí của tôi"><i class="icon-locate-fixed"></i></button>
      <div class="gps-sheet">
        <div class="grabber"></div>
        <div class="place">
          <div class="sq"><i class="icon-map-pin"></i></div>
          <div><b>${esc(o.name)}</b><small>${esc(o.address)}</small></div>
        </div>
        <div class="stats3">
          <div><div class="lbl">Khoảng cách</div><div class="val" id="gDist">--</div></div>
          <div><div class="lbl">Độ chính xác</div><div class="val" id="gAcc">--</div></div>
          <div><div class="lbl">Bán kính</div><div class="val">${Math.round(o.radius)}m</div></div>
        </div>
        <div class="banner idle" id="gBanner"></div>
        <div class="spacer"></div>
        <button class="btn-primary" id="gCta" disabled></button>
        <button class="btn-outline" id="gRetry" style="margin-top:-4px;display:none"><i class="icon-refresh-cw"></i>Định vị lại</button>
      </div>
    </div>`;

    // Bản đồ
    let map = null, userMarker = null, accCircle = null, fitted = false;
    if (window.L) {
      map = L.map('map', { zoomControl: false, attributionControl: true }).setView([o.lat, o.lng], 16);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, attribution: 'Tiles © Esri'
      }).addTo(map);
      map.attributionControl.setPrefix(false);
      L.circle([o.lat, o.lng], { radius: o.radius, color: 'rgba(242,87,43,.7)', weight: 2, fillColor: '#F2572B', fillOpacity: .18 }).addTo(map);
      L.marker([o.lat, o.lng], {
        icon: L.divIcon({ className: 'leaflet-div-icon plain', html: '<div class="office-pin"><div class="head"><i class="icon-building-2"></i></div><div class="stem"></div></div>', iconSize: [34, 42], iconAnchor: [17, 42] })
      }).addTo(map);
      // Chừa chỗ cho thanh tiêu đề phía trên và tấm thông tin phía dưới.
      setTimeout(() => map && map.invalidateSize(), 50);
    } else {
      document.getElementById('map').innerHTML = '<div class="empty" style="padding-top:120px"><i class="icon-map"></i>Không tải được bản đồ (kiểm tra kết nối mạng)</div>';
    }

    const update = () => {
      const fix = geo.fix, d = officeDist();
      const $dist = document.getElementById('gDist');
      if (!$dist) return;
      const $acc = document.getElementById('gAcc'), $b = document.getElementById('gBanner');
      const $cta = document.getElementById('gCta'), $retry = document.getElementById('gRetry');
      let state;
      if (fix && Date.now() - geo.at < 120e3) {
        state = fix.acc > MAX_ACC ? 'weak' : d <= o.radius ? 'in' : 'out';
      } else state = geo.err ? 'err' : 'loading';

      $dist.textContent = fix ? fmtDist(d) : '--';
      $dist.style.color = state === 'in' ? 'var(--green)' : state === 'out' ? 'var(--red)' : '';
      $acc.textContent = fix ? `±${Math.round(fix.acc)}m` : '--';

      const banners = {
        loading: ['idle', 'loader-circle spin', 'Đang xác định vị trí của bạn...'],
        err: ['bad', 'circle-alert', geo.err],
        weak: ['warn', 'triangle-alert', `Tín hiệu GPS yếu (±${fix ? Math.round(fix.acc) : '--'}m). Hãy ra chỗ thoáng rồi định vị lại.`],
        in: ['ok', 'circle-check', 'Bạn đang trong vùng chấm công'],
        out: ['bad', 'circle-alert', `Bạn đang ngoài vùng chấm công (cách ${fmtDist(d)})`]
      };
      const [cls, icon, text] = banners[state];
      $b.className = 'banner ' + cls;
      $b.innerHTML = `<i class="icon-${icon}"></i><span>${esc(text)}</span>`;

      if (state === 'in') { $cta.disabled = false; $cta.dataset.mode = 'confirm'; $cta.innerHTML = `<i class="icon-fingerprint"></i>${KIND[kind].cta}`; }
      else if (state === 'out' || state === 'err') { $cta.disabled = false; $cta.dataset.mode = 'explain'; $cta.innerHTML = '<i class="icon-file-pen-line"></i>Gửi giải trình'; }
      else { $cta.disabled = true; $cta.dataset.mode = ''; $cta.innerHTML = state === 'weak' ? '<i class="icon-fingerprint"></i>Chờ tín hiệu GPS tốt hơn' : '<i class="icon-loader-circle spin"></i>Đang định vị...'; }
      $retry.style.display = state === 'out' || state === 'err' || state === 'weak' ? '' : 'none';

      if (map && fix) {
        const ll = [fix.lat, fix.lng];
        if (!userMarker) {
          accCircle = L.circle(ll, { radius: fix.acc, color: '#3B82F6', weight: 1, opacity: .35, fillOpacity: .08, interactive: false }).addTo(map);
          userMarker = L.marker(ll, { icon: L.divIcon({ className: 'leaflet-div-icon plain', html: '<div class="user-dot"></div>', iconSize: [44, 44], iconAnchor: [22, 22] }) }).addTo(map);
        } else { userMarker.setLatLng(ll); accCircle.setLatLng(ll).setRadius(fix.acc); }
        if (!fitted) { fitted = true; fitBoth(); }
      }
    };
    const fitBoth = () => {
      if (!map) return;
      const pts = [[o.lat, o.lng]];
      if (geo.fix) pts.push([geo.fix.lat, geo.fix.lng]);
      const office = L.latLng(o.lat, o.lng);
      const b = L.latLngBounds(pts).extend(office.toBounds(o.radius * 2));
      map.fitBounds(b, { paddingTopLeft: [30, 80], paddingBottomRight: [30, 50], maxZoom: 17 });
    };

    // Không dùng vị trí cũ khi vào màn hình chấm công: luôn lấy vị trí mới.
    geo.fix = null; geo.err = null;
    geo.listeners.add(update);
    startWatch();
    update();
    const tick = setInterval(update, 15e3);
    cleanup.push(() => { geo.listeners.delete(update); stopWatch(); clearInterval(tick); if (map) map.remove(); map = null; });

    document.getElementById('recenter').onclick = () => {
      if (map && geo.fix) map.setView([geo.fix.lat, geo.fix.lng], Math.max(map.getZoom(), 17));
      else fitBoth();
    };
    document.getElementById('gRetry').onclick = () => { geo.fix = null; geo.err = null; fitted = false; update(); startWatch(); };
    document.getElementById('gCta').onclick = e => {
      const mode = e.currentTarget.dataset.mode;
      if (mode === 'confirm') {
        const d = officeDist();
        if (!geo.fix || d > o.radius) return update();
        const log = { id: uid(), ts: Date.now(), kind, method: 'GPS', dist: Math.round(d), acc: Math.round(geo.fix.acc), status: 'ok' };
        db.logs.push(log);
        addNoti(`Chấm công ${KIND[kind].type.toLowerCase()} lúc ${hm(log.ts)} ${dmy(log.ts)} được ghi nhận qua GPS (cách văn phòng ${fmtDist(d)}). Trạng thái: Thành công.`);
        save();
        if (navigator.vibrate) navigator.vibrate(40);
        go('success/' + log.id);
      } else if (mode === 'explain') {
        const reason = geo.fix ? `Chấm công ngoài vùng (cách văn phòng ${fmtDist(officeDist())})` : 'Không xác định được vị trí GPS';
        go(`proposal/explain?issue=${encodeURIComponent(geo.fix ? 'Ngoài vùng chấm công' : 'Lỗi định vị GPS')}&time=${hm(Date.now())}&kind=${kind}&note=${encodeURIComponent(reason)}`);
      }
    };
  }

  // ---------------------------------------------------------------- Wifi check-in
  function renderWifi(kind) {
    kind = KIND[kind] ? kind : nextMainKind();
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const type = c && c.type;
    const ssid = db.office.wifi || 'Wifi văn phòng';
    let state = 'unknown';
    if (!navigator.onLine) state = 'offline';
    else if (type === 'wifi' || type === 'ethernet') state = 'wifi';
    else if (type === 'cellular') state = 'cellular';
    const banners = {
      wifi: ['ok', 'circle-check', 'Thiết bị đang kết nối mạng Wifi.'],
      cellular: ['bad', 'wifi-off', 'Bạn đang dùng dữ liệu di động, chưa kết nối Wifi văn phòng.'],
      offline: ['bad', 'wifi-off', 'Thiết bị đang mất kết nối mạng.'],
      unknown: ['warn', 'info', 'Trình duyệt không cho biết tên mạng Wifi. Lượt chấm sẽ ở trạng thái Chờ phê duyệt để nhân sự kiểm tra.']
    };
    const [cls, icon, text] = banners[state];
    const canSubmit = state === 'wifi' || state === 'unknown';
    $app.innerHTML = `<div class="screen white">
      ${topbar(kind === 'in' || kind === 'out' ? 'Chấm công Wifi' : KIND[kind].label + ' · Wifi', { back: 'home' })}
      <div class="form">
        <div class="place">
          <div class="sq" style="background:var(--blue-soft);color:var(--blue)"><i class="icon-wifi"></i></div>
          <div><b>${esc(ssid)}</b><small>${esc(db.office.name)} · ${esc(db.office.address)}</small></div>
        </div>
        <div class="banner ${cls}"><i class="icon-${icon}"></i><span>${esc(text)}</span></div>
        ${canSubmit ? `<label style="display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.45;color:var(--text-2)">
          <input type="checkbox" id="wConfirm" style="width:20px;height:20px;accent-color:#F2572B;margin-top:1px;flex-shrink:0">
          <span>Tôi xác nhận đang kết nối mạng <b>${esc(ssid)}</b> tại văn phòng.</span></label>` : ''}
        <div style="height:8px"></div>
        ${canSubmit ? `<button class="btn-primary" id="wCta" disabled><i class="icon-fingerprint"></i>${KIND[kind].cta}</button>` : ''}
        <button class="btn-outline" data-act="go" data-to="gps?kind=${kind}"><i class="icon-locate-fixed"></i>Chấm bằng GPS</button>
      </div>
    </div>`;
    const cb = document.getElementById('wConfirm');
    if (cb) {
      const btn = document.getElementById('wCta');
      cb.onchange = () => { btn.disabled = !cb.checked; };
      btn.onclick = () => {
        const status = state === 'wifi' ? 'ok' : 'pending';
        const log = { id: uid(), ts: Date.now(), kind, method: 'Wifi', ssid, status };
        db.logs.push(log);
        addNoti(`Chấm công ${KIND[kind].type.toLowerCase()} lúc ${hm(log.ts)} ${dmy(log.ts)} qua Wifi được ghi nhận. ${status === 'ok' ? 'Trạng thái: Thành công.' : 'Chờ nhân sự phê duyệt.'}`);
        save();
        go('success/' + log.id);
      };
    }
  }

  // ---------------------------------------------------------------- success
  function renderSuccess(id) {
    const l = db.logs.find(x => x.id === id);
    if (!l) return go('home');
    const ok = l.status === 'ok';
    $app.innerHTML = `<div class="success">
      <div class="body">
        <div class="halo ${ok ? 'ok' : 'pending'}"><div><i class="icon-${ok ? 'check' : 'hourglass'}"></i></div></div>
        <h1>${ok ? 'Chấm công thành công' : 'Đã gửi chấm công'}</h1>
        <div class="sub">${ok ? `Đã ghi nhận ${KIND[l.kind].done} của bạn` : 'Lượt chấm đang chờ nhân sự phê duyệt'}</div>
        <div class="clock">${hm(l.ts)}</div>
        <div class="date">${longDate(l.ts)}</div>
        <div class="kv">
          <div><span>Loại chấm công</span><b>${KIND[l.kind].type} · ${esc(db.shift.name)}</b></div>
          <div><span>Địa điểm</span><b>${esc(db.office.name)}</b></div>
          <div><span>Phương thức</span><b>${l.method === 'GPS' ? `GPS · cách ${fmtDist(l.dist)}` : `Wifi · ${esc(l.ssid || '')}`}</b></div>
          ${l.kind === 'in' && minsOfTs(l.ts) > mins(db.shift.start) ? `<div><span>Ghi chú</span><b style="color:var(--red)">Đi muộn ${minsOfTs(l.ts) - mins(db.shift.start)} phút</b></div>` : ''}
        </div>
      </div>
      <div class="foot"><button class="btn-primary" data-go="home">Về trang chủ</button></div>
    </div>`;
  }

  // ---------------------------------------------------------------- proposals
  const PTYPES = {
    leave: { icon: 'calendar-days', name: 'Nghỉ phép', hue: 28 },
    lateearly: { icon: 'clock-alert', name: 'Đi muộn về sớm', hue: 145 },
    ot: { icon: 'timer', name: 'Làm thêm giờ', hue: 250 },
    trip: { icon: 'briefcase-business', name: 'Làm việc ngoài công ty / công tác', hue: 300 },
    explain: { icon: 'file-text', name: 'Giải trình chấm công', hue: 20 },
    shift: { icon: 'repeat', name: 'Đổi ca', hue: 190 }
  };
  const pBg = h => `oklch(0.95 0.04 ${h})`, pFg = h => `oklch(0.58 0.16 ${h})`;
  const STATUS = { pending: ['pending', 'Chờ duyệt'], approved: ['ok', 'Đã duyệt'], rejected: ['bad', 'Từ chối'] };

  function leaveDays(p) {
    if (!p.from) return 0;
    let n = 0;
    for (let d = fromKey(p.from); dayKey(d) <= (p.to || p.from); d.setDate(d.getDate() + 1)) if (isWorkday(d)) n++;
    return p.part && p.part !== 'Cả ngày' ? n * 0.5 : n;
  }
  function proposalSummary(p) {
    switch (p.type) {
      case 'leave': return `${keyToDmy(p.from)}${p.to && p.to !== p.from ? ' – ' + keyToDmy(p.to) : ''} · ${p.part} · ${String(leaveDays(p)).replace('.', ',')} ngày`;
      case 'lateearly': return `${keyToDmy(p.date)} · ${p.mode} ${p.minutes} phút`;
      case 'ot': return `${keyToDmy(p.date)} · ${p.start} – ${p.end}`;
      case 'trip': return `${keyToDmy(p.from)}${p.to && p.to !== p.from ? ' – ' + keyToDmy(p.to) : ''} · ${p.place}`;
      case 'explain': return `${keyToDmy(p.date)} · ${p.issue}${p.time ? ' · ' + p.time : ''}`;
      case 'shift': return `${keyToDmy(p.date)} · ${p.target}`;
    }
    return '';
  }
  function proposalItem(p) {
    const t = PTYPES[p.type], [cls, txt] = STATUS[p.status] || STATUS.pending;
    return `<div class="prop-item">
      <div class="circ" style="width:36px;height:36px;border-radius:50%;background:${pBg(t.hue)};color:${pFg(t.hue)};display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0"><i class="icon-${t.icon}"></i></div>
      <div class="main">
        <div class="t1">${t.name}</div>
        <div class="t2">${esc(proposalSummary(p))}${p.reason ? `<br>Lý do: ${esc(p.reason)}` : ''}</div>
        <div style="margin-top:6px;display:flex;gap:8px;align-items:center"><span class="chip ${cls}">${txt}</span><span style="font-size:11px;color:var(--muted-3)">Gửi ${relTime(p.created).toLowerCase()}</span></div>
      </div>
      ${p.status === 'pending' ? `<button class="del" data-act="delprop" data-id="${p.id}" aria-label="Hủy đề xuất"><i class="icon-trash-2"></i></button>` : ''}
    </div>`;
  }

  function renderProposals() {
    const mine = [...db.proposals].sort((a, b) => b.created - a.created);
    $app.innerHTML = `<div class="screen with-tabs">
      ${topbar('Đề xuất')}
      <div class="content" style="padding-top:20px">
        <div class="label-sm">Tạo đề xuất mới</div>
        <div class="card list">
          ${Object.entries(PTYPES).map(([k, t]) => `
            <button class="list-row tap" data-go="proposal/${k}">
              <div class="circ" style="background:${pBg(t.hue)};color:${pFg(t.hue)}"><i class="icon-${t.icon}"></i></div>
              <span class="name">${t.name}</span><i class="icon-chevron-right"></i>
            </button>`).join('')}
        </div>
        <div class="label-sm" style="margin-top:6px">Đề xuất của tôi (${mine.length})</div>
        <div class="card list">${mine.length ? mine.map(proposalItem).join('') : '<div class="empty"><i class="icon-inbox"></i>Chưa có đề xuất nào</div>'}</div>
      </div>
      ${tabbar('proposals')}
    </div>`;
  }

  function renderProposalForm(type, params) {
    const t = PTYPES[type];
    if (!t) return go('proposals');
    const today = dayKey(new Date());
    const reason = (ph, val = '') => `<div class="field"><label>Lý do <em>*</em></label><textarea name="reason" required placeholder="${ph}">${esc(val)}</textarea></div>`;
    const dateF = (name, label, val = today) => `<div class="field"><label>${label} <em>*</em></label><input type="date" name="${name}" value="${val}" required></div>`;
    const timeF = (name, label, val) => `<div class="field"><label>${label} <em>*</em></label><input type="time" name="${name}" value="${val}" required></div>`;
    const sel = (name, label, opts, val) => `<div class="field"><label>${label}</label><select name="${name}">${opts.map(o => `<option${o === val ? ' selected' : ''}>${o}</option>`).join('')}</select></div>`;
    const fields = {
      leave: `<div class="row2">${dateF('from', 'Từ ngày')}${dateF('to', 'Đến ngày')}</div>
        ${sel('part', 'Thời gian nghỉ', ['Cả ngày', 'Buổi sáng', 'Buổi chiều'], 'Cả ngày')}
        <div class="field"><div class="hint">Ngày phép còn lại: <b>${String(leaveLeft()).replace('.', ',')}</b> / ${db.leaveTotal} ngày</div></div>
        ${reason('VD: Việc gia đình')}`,
      lateearly: `${dateF('date', 'Ngày')}
        <div class="row2">${sel('mode', 'Loại', ['Đi muộn', 'Về sớm'], 'Đi muộn')}
        <div class="field"><label>Số phút <em>*</em></label><input type="number" name="minutes" min="1" max="480" value="30" inputmode="numeric" required></div></div>
        ${reason('VD: Đi gặp khách hàng')}`,
      ot: `${dateF('date', 'Ngày')}
        <div class="row2">${timeF('start', 'Từ giờ', db.shift.end)}${timeF('end', 'Đến giờ', '20:00')}</div>
        ${reason('VD: Hoàn thành báo cáo cuối tháng')}`,
      trip: `<div class="row2">${dateF('from', 'Từ ngày')}${dateF('to', 'Đến ngày')}</div>
        <div class="field"><label>Địa điểm <em>*</em></label><input name="place" required placeholder="VD: Khách hàng ABC, Hải Phòng"></div>
        ${reason('VD: Khảo sát dự án')}`,
      explain: `${dateF('date', 'Ngày cần giải trình', params.date || today)}
        <div class="row2">${sel('issue', 'Vấn đề', ['Quên chấm công vào', 'Quên chấm công ra', 'Ngoài vùng chấm công', 'Lỗi định vị GPS', 'Đi muộn có lý do', 'Khác'], params.issue || 'Quên chấm công ra')}
        <div class="field"><label>Giờ thực tế</label><input type="time" name="time" value="${esc(params.time || '')}"></div></div>
        ${reason('Mô tả lý do', params.note ? params.note + '. ' : '')}`,
      shift: `${dateF('date', 'Ngày đổi ca')}
        ${sel('target', 'Đổi sang ca', ['Ca sáng 06:00 – 14:00', 'Ca chiều 14:00 – 22:00', 'Ca đêm 22:00 – 06:00', 'Hành chính 08:00 – 17:30'], 'Ca chiều 14:00 – 22:00')}
        ${reason('VD: Đổi ca với đồng nghiệp')}`
    }[type];
    $app.innerHTML = `<div class="screen">
      ${topbar(t.name, { back: 'proposals' })}
      <form class="form" id="pForm">
        <div class="form-head"><div class="circ" style="background:${pBg(t.hue)};color:${pFg(t.hue)}"><i class="icon-${t.icon}"></i></div><b>${t.name}</b></div>
        ${fields}
        <div class="field"><div class="hint">Người duyệt: quản lý trực tiếp. Bạn sẽ nhận thông báo khi đề xuất được xử lý.</div></div>
        <button class="btn-primary" type="submit"><i class="icon-send"></i>Gửi đề xuất</button>
      </form>
    </div>`;
    document.getElementById('pForm').addEventListener('submit', e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      for (const k of Object.keys(f)) f[k] = String(f[k]).trim();
      if (f.from && f.to && f.to < f.from) return toast('Ngày kết thúc phải sau ngày bắt đầu');
      if (type === 'ot' && f.end <= f.start) return toast('Giờ kết thúc phải sau giờ bắt đầu');
      if (!f.reason) return toast('Vui lòng nhập lý do');
      const p = Object.assign({ id: uid(), type, created: Date.now(), status: 'pending' }, f);
      if (type === 'leave' && leaveDays(p) > leaveLeft()) return toast('Số ngày nghỉ vượt quá số ngày phép còn lại');
      db.proposals.push(p);
      addNoti(`Đề xuất ${t.name.toLowerCase()} (${proposalSummary(p)}) đã được gửi, đang chờ phê duyệt.`);
      save();
      toast('Đã gửi đề xuất');
      go(type === 'explain' && params.kind ? 'history' : 'proposals');
      if (type === 'explain' && params.kind) ui.histTab = 'gt';
    });
  }
  const leaveLeft = () => {
    const y = String(new Date().getFullYear());
    const used = db.proposals.filter(p => p.type === 'leave' && p.status !== 'rejected' && String(p.from).startsWith(y)).reduce((s, p) => s + leaveDays(p), 0);
    return Math.max(0, db.leaveTotal - used);
  };

  // ---------------------------------------------------------------- notifications
  function renderNotis() {
    const list = db.notis;
    $app.innerHTML = `<div class="screen with-tabs white">
      ${topbar('Thông báo', { right: `<button class="tb-right" data-act="readall" aria-label="Đánh dấu tất cả đã đọc"><i class="icon-check-check"></i></button>` })}
      <div>${list.length ? list.map(n => `
        <button class="noti ${n.read ? '' : 'unread'}" data-act="readone" data-id="${n.id}">
          <span class="dot"></span>
          <div style="flex:1"><div class="t1">${esc(n.text)}</div><div class="t2">${relTime(n.ts)}</div></div>
        </button>`).join('') : '<div class="empty" style="padding-top:80px"><i class="icon-bell"></i>Chưa có thông báo</div>'}</div>
      ${tabbar('notis')}
    </div>`;
  }

  // ---------------------------------------------------------------- history
  function renderHistory() {
    const now = new Date();
    if (!ui.histMonth) ui.histMonth = { y: now.getFullYear(), m: now.getMonth() };
    const { y, m } = ui.histMonth;
    if (!ui.histSel || !ui.histSel.startsWith(`${y}-${pad(m + 1)}`)) {
      ui.histSel = y === now.getFullYear() && m === now.getMonth() ? dayKey(now) : dayKey(new Date(y, m, 1));
    }
    const tab = ui.histTab;
    const months = [];
    for (let i = 0; i < 12; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push([d.getFullYear(), d.getMonth()]); }
    const last = new Date(y, m + 1, 0).getDate();

    let body;
    if (tab === 'cong') {
      const lead = (new Date(y, m, 1).getDay() + 6) % 7; // T2 đứng đầu tuần
      const today = dayKey(now);
      let cells = '';
      for (let i = 0; i < lead; i++) cells += '<div class="cal-cell"></div>';
      for (let d = 1; d <= last; d++) {
        const date = new Date(y, m, d), key = dayKey(date);
        const cls = ['cal-cell', 'tap', !isWorkday(date) && 'off', key > today && 'future', key === today && 'today', key === ui.histSel && 'sel'].filter(Boolean).join(' ');
        cells += `<button class="${cls}" data-act="selday" data-key="${key}"><span class="n">${d}</span><span class="d ${dayDot(date)}"></span></button>`;
      }
      const st = monthStats(y, m);
      const sel = fromKey(ui.histSel), s = daySummary(ui.histSel);
      const future = ui.histSel > today, off = !isWorkday(sel);
      const empty = future ? 'Chưa đến ngày' : off ? 'Ngày nghỉ' : onLeave(ui.histSel) ? 'Nghỉ phép / công tác' : 'Chưa chấm công';
      const place = l => `${l.method} · ${esc(db.office.name.replace('Văn phòng', 'VP'))}${l.status === 'pending' ? ' · Chờ duyệt' : ''}`;
      const inCard = s.in
        ? `<div class="day-card ${s.lateBy ? 'red' : 'green'}"><span class="l"><i class="icon-log-in"></i>Giờ vào</span><span class="t">${hm(s.in.ts)}</span><span class="s">${s.lateBy ? `Đi muộn ${s.lateBy} phút` : place(s.in)}</span></div>`
        : `<div class="day-card gray"><span class="l"><i class="icon-log-in"></i>Giờ vào</span><span class="t">--:--</span><span class="s">${empty}</span></div>`;
      const outCard = s.out
        ? `<div class="day-card blue"><span class="l"><i class="icon-log-out"></i>Giờ ra</span><span class="t">${hm(s.out.ts)}</span><span class="s">${s.earlyBy ? `Về sớm ${s.earlyBy} phút` : place(s.out)}</span></div>`
        : `<div class="day-card gray"><span class="l"><i class="icon-log-out"></i>Giờ ra</span><span class="t">--:--</span><span class="s">${s.in && ui.histSel < today ? 'Thiếu giờ ra' : empty}</span></div>`;
      body = `
        <div class="hist-shift">Ca làm việc: <b>${esc(db.shift.name)} ${esc(db.shift.start)} – ${esc(db.shift.end)}</b></div>
        <div class="selects">
          <div class="select-box"><span>Tháng lương</span><b>Tháng ${m + 1}/${y}</b><i class="icon-chevron-down"></i>
            <select data-act="month" aria-label="Chọn tháng">${months.map(([yy, mm]) => `<option value="${yy}-${mm}"${yy === y && mm === m ? ' selected' : ''}>Tháng ${mm + 1}/${yy}</option>`).join('')}</select>
          </div>
          <div class="select-box"><span>Kỳ lương</span><b>01/${pad(m + 1)} – ${last}/${pad(m + 1)}</b><i class="icon-chevron-down"></i></div>
        </div>
        <div>
          <div class="cal-head">${[1, 2, 3, 4, 5, 6, 0].map(i => `<span>${DOW_SHORT[i]}</span>`).join('')}</div>
          <div class="cal">${cells}</div>
        </div>
        <div class="legend">
          <span class="pill">Số công: ${st.full}/${st.work}</span>
          <span class="lg"><i style="background:var(--green)"></i>Đủ công</span>
          <span class="lg"><i style="background:var(--red)"></i>Thiếu / lỗi</span>
          <span class="lg"><i style="background:var(--amber)"></i>Nghỉ phép</span>
        </div>
        <div class="day-title"><i class="icon-history"></i>Lịch sử chấm công · ${dmy(sel)}</div>
        <div class="day-cards">${inCard}${outCard}</div>
        ${s.extras.length ? `<div class="extra-logs">${s.extras.map(l => `
          <div class="log-item"><i class="icon-${l.kind === 'ot' ? 'timer' : 'shield-check'}"></i>
            <div class="main"><div class="t1">${KIND[l.kind].label}: ${hm(l.ts)}</div><div class="t2">${place(l)}</div></div></div>`).join('')}</div>` : ''}
        ${!future && !off && (!s.in || !s.out || s.lateBy) ? `<button class="btn-outline" data-go="proposal/explain?issue=${encodeURIComponent(!s.in ? 'Quên chấm công vào' : !s.out ? 'Quên chấm công ra' : 'Đi muộn có lý do')}&date=${ui.histSel}"><i class="icon-file-pen-line"></i>Gửi giải trình cho ngày này</button>` : ''}`;
    } else {
      const ex = db.proposals.filter(p => p.type === 'explain').sort((a, b) => b.created - a.created);
      body = `<div class="card list">${ex.length ? ex.map(proposalItem).join('') : '<div class="empty"><i class="icon-file-text"></i>Chưa có giải trình nào</div>'}</div>
        <button class="btn-outline" data-go="proposal/explain"><i class="icon-file-pen-line"></i>Tạo giải trình mới</button>`;
    }
    $app.innerHTML = `<div class="screen white">
      ${topbar('Lịch sử chấm công', { back: 'home', extra: `<div class="tabs2"><button class="${tab === 'cong' ? 'on' : ''}" data-act="htab" data-tab="cong">Bảng công</button><button class="${tab === 'gt' ? 'on' : ''}" data-act="htab" data-tab="gt">Giải trình</button></div>` })}
      <div class="hist">${body}</div>
    </div>`;
    const ms = $app.querySelector('select[data-act="month"]');
    if (ms) ms.onchange = () => { const [yy, mm] = ms.value.split('-').map(Number); ui.histMonth = { y: yy, m: mm }; ui.histSel = null; renderHistory(); };
  }

  // ---------------------------------------------------------------- profile
  function renderProfile() {
    const p = db.profile, now = new Date();
    const st = monthStats(now.getFullYear(), now.getMonth());
    const device = deviceName();
    const meta = [p.code && `Mã NV: ${p.code}`, p.dept].filter(Boolean).join(' · ') || p.role;
    $app.innerHTML = `<div class="screen with-tabs">
      <div class="profile-hero">
        <div class="avatar">${esc(initials(p.name))}</div>
        <div class="nm">${esc(p.name)}</div>
        <div class="meta">${esc(meta)}</div>
      </div>
      <div class="content" style="margin-top:-50px">
        <div class="card raised pstats">
          <div><div class="v" style="color:var(--orange)">${String(leaveLeft()).replace('.', ',')}</div><div class="l">Ngày phép<br>còn lại</div></div>
          <div><div class="v" style="color:var(--green)">${st.full}<small>/${st.work}</small></div><div class="l">Số công<br>tháng này</div></div>
          <div><div class="v" style="color:var(--red)">${st.late}</div><div class="l">Số lần<br>đi muộn</div></div>
        </div>
        <div class="card list">
          ${[
            ['user-round-pen', 'Thông tin cá nhân', '', 'settings/profile'],
            ['calendar-clock', 'Ca làm việc', `${db.shift.start} – ${db.shift.end}`, 'settings/shift'],
            ['building-2', 'Văn phòng chấm công', `${db.office.radius}m`, 'settings/office'],
            ['smartphone', 'Thiết bị đăng ký', device, ''],
            ['languages', 'Ngôn ngữ', 'Tiếng Việt', ''],
            ['download', 'Xuất bảng công (CSV)', '', '']
          ].map(([icon, name, val, to], i) => `
            <button class="list-row tap" ${to ? `data-go="${to}"` : `data-act="${['', '', '', 'device', 'lang', 'csv'][i]}"`}>
              <i class="icon-${icon} lead"></i><span class="name">${name}</span><span class="val">${esc(val)}</span><i class="icon-chevron-right"></i>
            </button>`).join('')}
        </div>
        <div class="card list"><button class="list-row danger tap" data-act="logout"><i class="icon-log-out" style="font-size:20px"></i><span class="name">Đăng xuất</span></button></div>
        <div class="version">Phiên bản ${VERSION}</div>
      </div>
      ${tabbar('profile')}
    </div>`;
  }
  function deviceName() {
    const ua = navigator.userAgent;
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) { const m = ua.match(/Android[^;]*;\s*([^;)]+?)(?:\sBuild|\))/); return m ? m[1].trim() : 'Android'; }
    if (/Mac OS X/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'Windows';
    return 'Trình duyệt';
  }

  function renderSettings(which) {
    let title, fields;
    if (which === 'profile') {
      const p = db.profile;
      title = 'Thông tin cá nhân';
      fields = `
        <div class="field"><label>Họ và tên <em>*</em></label><input name="name" required value="${esc(p.name)}"></div>
        <div class="row2"><div class="field"><label>Mã nhân viên</label><input name="code" value="${esc(p.code)}"></div>
        <div class="field"><label>Phòng ban</label><input name="dept" value="${esc(p.dept)}"></div></div>
        <div class="field"><label>Chức danh</label><input name="role" value="${esc(p.role)}"></div>
        <div class="field"><label>Số ngày phép/năm</label><input type="number" name="leaveTotal" min="0" max="60" step="0.5" value="${db.leaveTotal}"></div>`;
    } else if (which === 'shift') {
      const s = db.shift;
      title = 'Ca làm việc';
      fields = `
        <div class="field"><label>Tên ca</label><input name="name" required value="${esc(s.name)}"></div>
        <div class="row2"><div class="field"><label>Giờ vào ca</label><input type="time" name="start" required value="${esc(s.start)}"></div>
        <div class="field"><label>Giờ ra ca</label><input type="time" name="end" required value="${esc(s.end)}"></div></div>
        <div class="field"><label>Ngày làm việc</label><div class="workdays">${[1, 2, 3, 4, 5, 6, 0].map(i => `<label><input type="checkbox" name="wd" value="${i}"${s.workdays.includes(i) ? ' checked' : ''}>${DOW_SHORT[i]}</label>`).join('')}</div></div>
        <div class="field"><div class="hint">Chấm vào sau giờ vào ca được tính là đi muộn; chấm ra trước giờ ra ca được tính là về sớm.</div></div>`;
    } else if (which === 'office') {
      const o = db.office;
      title = 'Văn phòng chấm công';
      fields = `
        <div class="field"><label>Tên địa điểm <em>*</em></label><input name="name" required value="${esc(o.name)}"></div>
        <div class="field"><label>Địa chỉ</label><textarea name="address" style="min-height:72px">${esc(o.address)}</textarea></div>
        <div class="row2"><div class="field"><label>Vĩ độ (lat) <em>*</em></label><input name="lat" inputmode="decimal" required value="${o.lat}"></div>
        <div class="field"><label>Kinh độ (lng) <em>*</em></label><input name="lng" inputmode="decimal" required value="${o.lng}"></div></div>
        <button type="button" class="btn-outline" id="useHere"><i class="icon-locate-fixed"></i>Dùng vị trí hiện tại của tôi</button>
        <div class="field"><label>Bán kính chấm công: <b id="rv">${o.radius}</b>m</label><input type="range" name="radius" min="50" max="500" step="10" value="${o.radius}" style="padding:0;min-height:32px;border:0;accent-color:#F2572B;appearance:auto;-webkit-appearance:auto"></div>
        <div class="field"><label>Tên Wifi văn phòng</label><input name="wifi" value="${esc(o.wifi)}" placeholder="VD: Office-5G"></div>
        <div class="field"><div class="hint">Mẹo: đứng tại văn phòng rồi bấm "Dùng vị trí hiện tại", hoặc chép toạ độ từ Google Maps (nhấn giữ vào bản đồ để lấy toạ độ).</div></div>`;
    } else return go('profile');
    $app.innerHTML = `<div class="screen">
      ${topbar(title, { back: 'profile' })}
      <form class="form" id="sForm">${fields}<button class="btn-primary" type="submit" style="margin-top:6px">Lưu</button></form>
    </div>`;
    const form = document.getElementById('sForm');
    const range = form.querySelector('input[type=range]');
    if (range) range.oninput = () => { document.getElementById('rv').textContent = range.value; };
    const here = document.getElementById('useHere');
    if (here) here.onclick = () => {
      here.innerHTML = '<i class="icon-loader-circle spin"></i>Đang định vị...';
      if (!('geolocation' in navigator) || !window.isSecureContext) { toast(geoErrText(null)); here.innerHTML = '<i class="icon-locate-fixed"></i>Dùng vị trí hiện tại của tôi'; return; }
      navigator.geolocation.getCurrentPosition(p => {
        form.lat.value = p.coords.latitude.toFixed(6); form.lng.value = p.coords.longitude.toFixed(6);
        here.innerHTML = `<i class="icon-check"></i>Đã lấy vị trí (±${Math.round(p.coords.accuracy)}m)`;
      }, e => { toast(geoErrText(e)); here.innerHTML = '<i class="icon-locate-fixed"></i>Dùng vị trí hiện tại của tôi'; }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    };
    form.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(form), f = Object.fromEntries(fd);
      if (which === 'profile') {
        db.profile = { name: f.name.trim(), code: f.code.trim(), dept: f.dept.trim(), role: f.role.trim() };
        db.leaveTotal = Math.max(0, Number(f.leaveTotal) || 0);
      } else if (which === 'shift') {
        if (f.end <= f.start) return toast('Giờ ra ca phải sau giờ vào ca');
        db.shift = { name: f.name.trim(), start: f.start, end: f.end, workdays: fd.getAll('wd').map(Number) };
      } else {
        const lat = Number(String(f.lat).replace(',', '.')), lng = Number(String(f.lng).replace(',', '.'));
        if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180) || Number.isNaN(lat) || Number.isNaN(lng)) return toast('Toạ độ không hợp lệ');
        db.office = { name: f.name.trim(), address: f.address.trim(), lat, lng, radius: Number(f.radius), wifi: f.wifi.trim() };
      }
      save(); toast('Đã lưu'); go('profile');
    });
  }

  function exportCsv() {
    const rows = [['Ngày', 'Giờ', 'Loại', 'Phương thức', 'Khoảng cách (m)', 'Độ chính xác (m)', 'Trạng thái']];
    [...db.logs].sort((a, b) => a.ts - b.ts).forEach(l => rows.push([dmy(l.ts), hm(l.ts), KIND[l.kind].type, l.method, l.dist ?? '', l.acc ?? '', l.status === 'ok' ? 'Thành công' : 'Chờ phê duyệt']));
    const csv = '﻿' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `bang-cong-${dayKey(new Date())}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------------------------------------------------------------- events
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-go]');
    if (g && $app.contains(g)) { e.preventDefault(); go(g.dataset.go); return; }
    const a = e.target.closest('[data-act]');
    if (!a || a.tagName === 'SELECT') return;
    const act = a.dataset.act;
    switch (act) {
      case 'back': go(a.dataset.to || 'home'); break;
      case 'go': go(a.dataset.to); break;
      case 'popup': showMethodPopup(a.dataset.kind); break;
      case 'locate': geo.err = null; locateOnce(); { const el = document.getElementById('locLine'); if (el) el.innerHTML = '<span class="loc-line idle"><span class="pulse"></span>Đang xác định vị trí...</span>'; } break;
      case 'readall': db.notis.forEach(n => { n.read = true; }); save(); renderNotis(); toast('Đã đánh dấu tất cả là đã đọc'); break;
      case 'readone': { const n = db.notis.find(x => x.id === a.dataset.id); if (n && !n.read) { n.read = true; save(); a.classList.remove('unread'); if (!db.notis.some(x => !x.read)) renderNotis(); } break; }
      case 'htab': ui.histTab = a.dataset.tab; renderHistory(); break;
      case 'selday': ui.histSel = a.dataset.key; renderHistory(); break;
      case 'delprop': confirmDialog('Hủy đề xuất', 'Bạn có chắc muốn hủy đề xuất này?', 'Hủy đề xuất', () => {
        db.proposals = db.proposals.filter(p => p.id !== a.dataset.id); save(); render();
      }, true); break;
      case 'device': toast(`Thiết bị đang dùng: ${deviceName()}`); break;
      case 'lang': toast('Hiện ứng dụng hỗ trợ Tiếng Việt'); break;
      case 'csv': exportCsv(); break;
      case 'demo': seedDemo(); go('home'); render(); toast('Đã tạo dữ liệu mẫu'); break;
      case 'logout': confirmDialog('Đăng xuất', 'Dữ liệu chấm công lưu trên máy này sẽ bị xoá. Hãy xuất bảng công (CSV) trước nếu cần giữ lại.', 'Đăng xuất', () => {
        try { localStorage.removeItem(KEY); } catch (err) { /* ignore */ }
        db = defaults(); location.hash = ''; render();
      }, true); break;
    }
  });

  // ---------------------------------------------------------------- boot
  render();
  if ('serviceWorker' in navigator && window.isSecureContext && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
