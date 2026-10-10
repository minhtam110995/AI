'use strict';
/* ChấmCông Go — app nhân viên (PWA). Dữ liệu đi qua window.CCG (data.js). */
(() => {
  const VERSION = '2.0.0';
  const C = window.CCG_CORE, API = window.CCG;
  const { pad, esc, hm, dmy, longDate, dayKey, fromKey, mins, minsOfTs, fmtDist, num, initials, relTime, haversine,
    KIND, REQ_TYPES, LEAVE_TYPES, STATUS, reqBg, reqFg, DOW_SHORT } = C;
  const $app = document.getElementById('app');
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* ignore */ } };

  // ---------------------------------------------------------------- state
  // S giữ dữ liệu của người đang đăng nhập; mọi thay đổi ghi qua API rồi cập nhật S.
  const S = { session: null, company: null, user: null, users: [], locations: [], shifts: [], logs: [], reqs: [], notis: [], locked: false, loadedAt: 0 };
  const shift = () => C.shiftFor(S.user, S.shifts);
  const myLocations = () => C.locationsFor(S.user, S.locations);
  const isAdmin = () => S.user && S.user.role === 'admin';
  const isWorkday = d => C.isWorkday(d, shift());
  const startKey = () => S.user && S.user.createdAt ? dayKey(S.user.createdAt) : null;
  const userName = uid => (S.users.find(u => u.uid === uid) || {}).name || '';

  // Chỉ tải dữ liệu gần đây (tháng này và 2 tháng trước) cho nhẹ và tiết kiệm lượt đọc;
  // tháng cũ hơn được tải khi mở lịch sử tháng đó.
  async function loadAll() {
    const now = new Date();
    const logsFrom = dayKey(new Date(now.getFullYear(), now.getMonth() - 2, 1));
    const [company, me, admins, locations, shifts, logs, reqs, notis] = await Promise.all([
      API.getCompany(), API.getMe(), API.listAdmins(), API.listLocations(), API.listShifts(),
      API.myLogs(logsFrom), API.myRequests(), API.myNotis(Date.now() - 60 * 86400e3)
    ]);
    const users = [me, ...admins.filter(a => a.uid !== me.uid)];
    Object.assign(S, { company, users, locations, shifts, logs, reqs, notis, logsFrom, loadedMonths: new Set(), loadedAt: Date.now() });
    S.user = me;
    if (S.user && S.user.active === false) { await signOut(); toast('Tài khoản đã bị khoá. Liên hệ quản trị.'); }
  }
  const unreadCount = () => S.notis.filter(n => !n.read).length;

  let toastTimer;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  }
  const errMsg = e => (e && (e.userMessage || e.message)) || 'Có lỗi xảy ra';
  async function busy(btn, fn) {
    if (btn.disabled) return;
    const html = btn.innerHTML; btn.disabled = true;
    btn.innerHTML = '<i class="icon-loader-circle spin"></i>Đang xử lý...';
    try { return await fn(); }
    catch (e) { toast(errMsg(e)); }
    finally { if (btn.isConnected) { btn.disabled = false; btn.innerHTML = html; } }
  }

  // ---------------------------------------------------------------- Face ID (WebAuthn)
  // Khoá app bằng Face ID / vân tay của máy: lần sau mở app chỉ cần quét thay vì gõ mật khẩu.
  const FACE_KEY = 'ccg.faceid';
  const faceGet = () => { try { return JSON.parse(lsGet(FACE_KEY)) || null; } catch (e) { return null; } };
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const rand = n => crypto.getRandomValues(new Uint8Array(n));
  async function faceAvailable() {
    try { return !!(window.PublicKeyCredential && window.isSecureContext && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); }
    catch (e) { return false; }
  }
  async function faceRegister(user, account) {
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: rand(32), rp: { name: 'ChấmCông Go' },
      user: { id: new TextEncoder().encode(user.uid.slice(0, 60)), name: account || user.name, displayName: user.name },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000, attestation: 'none'
    } });
    lsSet(FACE_KEY, JSON.stringify({ uid: user.uid, id: b64(cred.rawId), name: user.name }));
  }
  async function faceVerify() {
    const f = faceGet();
    if (!f) return false;
    await navigator.credentials.get({ publicKey: {
      challenge: rand(32), allowCredentials: [{ type: 'public-key', id: unb64(f.id) }], userVerification: 'required', timeout: 60000
    } });
    return true;
  }
  const faceOn = () => { const f = faceGet(); return !!(f && S.session && f.uid === S.session.uid); };

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
    geo.fix = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
    geo.err = null; geo.at = Date.now();
    geo.listeners.forEach(fn => fn());
  }
  function onGeoErr(e) { geo.err = geoErrText(e); geo.listeners.forEach(fn => fn()); }
  const geoOk = () => 'geolocation' in navigator && window.isSecureContext;
  function locateOnce() {
    if (!geoOk()) return onGeoErr(null);
    navigator.geolocation.getCurrentPosition(onFix, onGeoErr, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }
  function startWatch() {
    stopWatch();
    if (!geoOk()) return onGeoErr(null);
    geo.watchId = navigator.geolocation.watchPosition(onFix, onGeoErr, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }
  function stopWatch() { if (geo.watchId != null) navigator.geolocation.clearWatch(geo.watchId); geo.watchId = null; }
  /** Địa điểm gần nhất trong số địa điểm nhân viên được phép chấm. */
  function nearest() {
    const locs = myLocations();
    if (!geo.fix || !locs.length) return { loc: locs[0] || null, dist: null };
    let best = null, dist = Infinity;
    locs.forEach(l => { const d = haversine(geo.fix, l); if (d < dist) { dist = d; best = l; } });
    return { loc: best, dist };
  }
  const MAX_ACC = 150;

  // ---------------------------------------------------------------- router
  const ui = { popup: null, histTab: 'cong', histMonth: null, histSel: null, reqTab: 'all' };
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
    document.querySelectorAll('.overlay').forEach(o => o.remove());
    if (!S.session || S.locked) return renderLogin();
    if (S.user && S.user.mustChangePassword) return renderPassword(true);
    const { parts, params } = route();
    const screens = {
      home: renderHome, gps: () => renderGps(params.kind), wifi: () => renderWifi(params.kind),
      success: () => renderSuccess(parts[1]), proposals: renderProposals,
      proposal: () => renderRequestForm(parts[1], params), requests: renderMyRequests, request: () => renderRequestDetail(parts[1]),
      notis: renderNotis, history: renderHistory, profile: renderProfile, password: renderPassword, info: renderInfo
    };
    (screens[parts[0]] || renderHome)();
  }

  // ---------------------------------------------------------------- shared pieces
  function tabbar(active) {
    const unread = unreadCount();
    const tabs = [['home', 'house', 'Trang chủ'], ['proposals', 'square-pen', 'Đề xuất'], ['notis', 'bell', 'Thông báo'], ['profile', 'user-round', 'Cá nhân']];
    return `<nav class="tabbar">${tabs.map(([r, icon, label]) => `
      <button class="${r === active ? 'on' : ''}" data-go="${r}">
        <i class="icon-${icon}">${r === 'notis' && unread ? '<b class="tab-badge"></b>' : ''}</i><span>${label}</span>
      </button>`).join('')}</nav>`;
  }
  function topbar(title, { back, right, extra = '' } = {}) {
    return `<header class="topbar">
      <div class="topbar-row">
        ${back ? `<button class="tb-left" data-go="${esc(back)}" aria-label="Quay lại"><i class="icon-arrow-left"></i></button>` : ''}
        ${esc(title)}
        ${right || ''}
      </div>${extra || '<div class="topbar-pad"></div>'}
    </header>`;
  }
  function dialog(title, bodyHtml, actions) {
    const wrap = document.createElement('div');
    wrap.className = 'overlay';
    wrap.innerHTML = `<div class="dialog" role="dialog">
      <div class="dialog-head"><b>${esc(title)}</b><button class="dialog-close" data-x aria-label="Đóng"><i class="icon-x"></i></button></div>
      <div class="dialog-msg">${bodyHtml}</div>
      ${actions ? `<div class="dialog-actions">${actions.map((a, i) => `<button class="${a.cls || 'btn-ghost'}" data-i="${i}">${esc(a.text)}</button>`).join('')}</div>` : '<div style="height:12px"></div>'}
    </div>`;
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-i]');
      if (e.target === wrap || e.target.closest('[data-x]')) wrap.remove();
      else if (b) { const a = actions[+b.dataset.i]; wrap.remove(); if (a.on) a.on(); }
    });
    document.body.appendChild(wrap);
    return wrap;
  }
  const confirmDialog = (title, msg, okText, onOk) => dialog(title, esc(msg), [{ text: 'Hủy' }, { text: okText, cls: 'btn-danger', on: onOk }]);
  const chip = status => { const [cls, txt] = STATUS[status] || STATUS.pending; return `<span class="chip ${cls}">${txt}</span>`; };

  // ---------------------------------------------------------------- login / create company
  function renderLogin() {
    const isCreate = route().parts[0] === 'company' && !S.session;
    const lastCode = lsGet('ccg.lastCode') || (API.mode === 'demo' ? 'DEMO' : '');
    const lastAcc = lsGet('ccg.lastAccount') || '';
    const locked = S.session && S.locked;
    $app.innerHTML = `<div class="login2">
      <div class="login2-brand">
        <div class="logo"><i class="icon-scan-face"></i></div>
        <h1>ChấmCông Go</h1>
        <p>${isCreate ? 'Tạo công ty mới và tài khoản quản trị đầu tiên' : locked ? `Xin chào, ${esc(S.user.name)}` : 'Chấm công GPS cho doanh nghiệp'}</p>
      </div>
      <div class="login2-card">
      ${isCreate ? `
        <form class="form" id="createForm" autocomplete="off">
          <div class="field"><label for="cName">Tên công ty <em>*</em></label><input id="cName" name="name" required placeholder="Công ty TNHH ABC"></div>
          <div class="field"><label for="cCode">Mã công ty <em>*</em></label><input id="cCode" name="code" required placeholder="VD: ABC" autocapitalize="characters" maxlength="20">
            <div class="hint">Nhân viên nhập mã này khi đăng nhập. Chỉ gồm chữ, số, dấu gạch ngang.</div></div>
          <div class="field"><label for="cAdmin">Họ tên quản trị <em>*</em></label><input id="cAdmin" name="adminName" required placeholder="Trần Thị Hương"></div>
          <div class="field"><label for="cAcc">Tài khoản quản trị <em>*</em></label><input id="cAcc" name="account" required placeholder="admin hoặc email" autocapitalize="none"></div>
          <div class="field"><label for="cPw">Mật khẩu <em>*</em></label><input id="cPw" name="password" type="password" required minlength="6" placeholder="Ít nhất 6 ký tự" autocomplete="new-password"></div>
          <button class="btn-primary" type="submit">Tạo công ty</button>
          <button class="link-btn" type="button" data-go="home">Đã có tài khoản? Đăng nhập</button>
        </form>` : `
        <form class="form" id="loginForm" autocomplete="on">
          ${locked ? `<button class="face-btn tap" type="button" id="faceBtn"><i class="icon-scan-face"></i><span><b>Đăng nhập bằng Face ID</b><small>hoặc vân tay trên máy này</small></span></button>
            <div class="or"><span>hoặc nhập mật khẩu</span></div>` : ''}
          <div class="field"><label for="lCode">Mã công ty</label>
            <div class="input-ico"><i class="icon-building-2"></i><input id="lCode" name="code" required value="${esc(lastCode)}" placeholder="VD: ABC" autocapitalize="characters"></div></div>
          <div class="field"><label for="lAcc">Tài khoản</label>
            <div class="input-ico"><i class="icon-user-round"></i><input id="lAcc" name="account" required value="${esc(lastAcc)}" placeholder="Tên đăng nhập hoặc email" autocapitalize="none" autocomplete="username"></div></div>
          <div class="field"><label for="lPw">Mật khẩu</label>
            <div class="input-ico"><i class="icon-lock-keyhole"></i><input id="lPw" name="password" type="password" required placeholder="Mật khẩu" autocomplete="current-password">
            <button type="button" class="eye" id="eye" aria-label="Hiện mật khẩu"><i class="icon-eye"></i></button></div></div>
          <div class="login-row">
            <label class="check" id="faceOptWrap" hidden><input type="checkbox" id="faceOpt"> Đăng nhập bằng Face ID</label>
            <button class="link-sm" type="button" id="forgot">Quên mật khẩu?</button>
          </div>
          <button class="btn-primary" type="submit">Đăng nhập</button>
          ${locked ? '<button class="link-btn" type="button" id="otherAcc">Đăng nhập tài khoản khác</button>'
            : '<button class="link-btn" type="button" data-go="company">Chưa có công ty? Tạo công ty mới</button>'}
        </form>`}
      ${API.mode === 'demo' && !isCreate ? `<div class="demo-note"><i class="icon-info"></i><div><b>Chế độ dùng thử</b> (chưa nối Firebase). Mã công ty <b>DEMO</b>, tài khoản <b>admin</b> (quản trị) hoặc <b>nv01</b>…<b>nv05</b> (nhân viên), mật khẩu <b>123456</b>.</div></div>` : ''}
      </div>
    </div>`;

    if (isCreate) {
      const f = document.getElementById('createForm');
      f.addEventListener('submit', e => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(f));
        if (d.password.length < 6) return toast('Mật khẩu cần ít nhất 6 ký tự');
        busy(f.querySelector('[type=submit]'), async () => {
          S.session = await API.createCompany(d);
          lsSet('ccg.lastCode', API.normCode(d.code)); lsSet('ccg.lastAccount', d.account.trim().toLowerCase());
          S.user = S.session.user; S.locked = false;
          await loadAll();
          toast('Đã tạo công ty. Hãy thêm địa điểm và nhân viên ở trang quản trị.');
          go('home'); render();
        });
      });
      return;
    }
    const f = document.getElementById('loginForm');
    document.getElementById('eye').onclick = () => { const p = f.password; p.type = p.type === 'password' ? 'text' : 'password'; };
    document.getElementById('forgot').onclick = async () => {
      if (!f.account.value.trim()) { toast('Nhập mã công ty và tài khoản trước'); f.account.focus(); return; }
      try { dialog('Quên mật khẩu', esc(await API.resetPassword(f.code.value, f.account.value))); }
      catch (e) { toast(errMsg(e)); }
    };
    if (!locked) faceAvailable().then(ok => { const w = document.getElementById('faceOptWrap'); if (w) w.hidden = !ok; });
    const fb = document.getElementById('faceBtn');
    if (fb) {
      fb.onclick = async () => {
        try { if (await faceVerify()) { S.locked = false; go('home'); render(); } }
        catch (e) { toast('Không xác thực được Face ID. Hãy nhập mật khẩu.'); }
      };
    }
    const other = document.getElementById('otherAcc');
    if (other) other.onclick = async () => { lsSet(FACE_KEY, null); await signOut(); };
    f.addEventListener('submit', e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      const wantFace = document.getElementById('faceOpt')?.checked;
      busy(f.querySelector('[type=submit]'), async () => {
        S.session = await API.signIn(d.code, d.account, d.password);
        S.tmpPw = d.password; // để màn đổi mật khẩu lần đầu không phải hỏi lại
        lsSet('ccg.lastCode', API.normCode(d.code)); lsSet('ccg.lastAccount', d.account.trim().toLowerCase());
        S.user = S.session.user; S.locked = false;
        await loadAll();
        if (wantFace) { try { await faceRegister(S.user, d.account); toast('Đã bật đăng nhập bằng Face ID'); } catch (err) { toast('Chưa bật được Face ID trên máy này'); } }
        go('home'); render();
      });
    });
  }
  async function signOut() {
    try { await API.signOut(); } catch (e) { /* ignore */ }
    Object.assign(S, { session: null, user: null, logs: [], reqs: [], notis: [], locked: false, tmpPw: null });
    location.hash = ''; render();
  }

  // ---------------------------------------------------------------- home
  function homeLocLine() {
    const { loc, dist } = nearest();
    if (!myLocations().length) return '<span class="loc-line bad"><span class="pulse"></span>Công ty chưa cài địa điểm chấm công</span>';
    if (geo.fix && dist != null) {
      const inside = dist <= loc.radius;
      return `<button class="loc-line ${inside ? 'ok' : 'bad'}" data-act="locate"><span class="pulse"></span>Bạn đang cách ${esc(loc.name)} ${fmtDist(dist)} – ${inside ? 'Trong vùng chấm công' : 'Ngoài vùng'}</button>`;
    }
    if (geo.err) return `<button class="loc-line bad" data-act="locate"><span class="pulse"></span>${esc(geo.err)}</button>`;
    return '<button class="loc-line idle" data-act="locate"><span class="pulse"></span>Chưa xác định vị trí – bấm để định vị</button>';
  }
  const todayLogs = () => S.logs.filter(l => l.day === dayKey(new Date())).sort((a, b) => a.ts - b.ts);
  const nextMainKind = () => todayLogs().some(l => l.kind === 'in') ? 'out' : 'in';

  function renderHome() {
    const u = S.user, today = new Date(), sh = shift();
    const logs = todayLogs(), kind = nextMainKind();
    const { loc } = nearest();
    $app.innerHTML = `<div class="screen with-tabs">
      <div class="hero">
        <div class="hero-user">
          <div class="avatar">${esc(initials(u.name))}</div>
          <div style="flex:1;min-width:0">
            <div class="hero-hello">Xin chào,</div>
            <div class="hero-name">${esc(u.name)}</div>
            <div class="hero-role">${esc(u.title || C.ROLES[u.role])}</div>
          </div>
          <button class="icon-btn-glass" data-go="notis" aria-label="Thông báo"><i class="icon-bell"></i>${unreadCount() ? '<span class="badge-dot"></span>' : ''}</button>
        </div>
      </div>
      <div class="content lift">
        <div class="card raised shift-card">
          <div class="row-head"><b>Ca làm việc hôm nay</b><span>${longDate(today)}</span></div>
          ${isWorkday(today) ? `<div class="shift-grid">
            <div><div class="lbl">Vào ca</div><div class="val">${esc(sh.start)}</div></div>
            <div class="sep"></div>
            <div style="text-align:right"><div class="lbl">Ra ca</div><div class="val">${esc(sh.end)}</div></div>
          </div>` : '<div style="font-size:14px;color:var(--muted);padding:8px 0">Hôm nay là ngày nghỉ theo lịch làm việc.</div>'}
        </div>
        <button class="cta-big tap" data-act="popup" data-kind="${kind}">
          <div class="ico"><i class="icon-scan-face"></i></div>
          <div class="txt"><b>Chấm công</b><small>${kind === 'in' ? 'Chấm vào ca' : 'Chấm ra ca'}</small></div>
          <i class="icon-chevron-right"></i>
        </button>
        <div class="loc-status">
          <div id="locLine">${homeLocLine()}</div>
          ${loc ? `<div class="loc-office"><i class="icon-map-pin"></i>${esc(loc.name)} · ${esc(loc.address)}</div>` : ''}
        </div>
        <div class="quick-grid">
          <button class="quick tap" data-act="popup" data-kind="ot"><div class="ico"><i class="icon-timer"></i></div><span>Chấm làm thêm giờ</span></button>
          <button class="quick tap" data-act="popup" data-kind="duty"><div class="ico"><i class="icon-shield-check"></i></div><span>Chấm trực ca kíp</span></button>
        </div>
        ${isAdmin() ? '<a class="admin-link tap" href="admin.html"><i class="icon-layout-dashboard"></i><span>Mở trang quản trị</span><i class="icon-chevron-right"></i></a>' : ''}
        <div class="section-head"><b>Chi tiết chấm công hôm nay</b><button data-go="history">Xem lịch sử</button></div>
        ${logs.length ? logs.map(l => `
          <div class="log-item">
            <i class="icon-clock"></i>
            <div class="main">
              <div class="t1">${KIND[l.kind].label}: ${hm(l.ts)}</div>
              <div class="t2">Trạng thái: <b style="color:${l.status === 'ok' ? 'var(--green)' : 'var(--red)'}">${l.status === 'ok' ? 'Thành công' : 'Chờ phê duyệt'}</b></div>
            </div>
            <span class="meth">${esc(l.method)}</span>
          </div>`).join('') : '<div class="card empty"><i class="icon-calendar-clock"></i>Bạn chưa chấm công hôm nay</div>'}
      </div>
      ${tabbar('home')}
    </div>`;
    if (ui.popup) showMethodPopup(ui.popup);
    const refresh = () => { const el = document.getElementById('locLine'); if (el) el.innerHTML = homeLocLine(); };
    geo.listeners.add(refresh);
    cleanup.push(() => geo.listeners.delete(refresh));
    if ((!geo.fix || Date.now() - geo.at > 60e3) && navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then(s => { if (s.state === 'granted') locateOnce(); }).catch(() => {});
    }
  }

  function showMethodPopup(kind) {
    ui.popup = kind;
    const title = kind === 'ot' ? 'Chấm làm thêm giờ' : kind === 'duty' ? 'Chấm trực ca kíp' : 'Chấm công';
    const allowWifi = S.company.settings.allowWifi !== false;
    const wrap = document.createElement('div');
    wrap.className = 'overlay';
    wrap.innerHTML = `<div class="dialog" role="dialog" aria-label="${title}">
      <div class="dialog-head"><b>${title}</b><button class="dialog-close" data-x aria-label="Đóng"><i class="icon-x"></i></button></div>
      <div class="dialog-sub">Chọn cách xác thực vị trí</div>
      <div class="dialog-body">
        ${allowWifi ? `<button class="opt tap" data-m="wifi">
          <div class="sq" style="background:var(--blue-soft);color:var(--blue)"><i class="icon-wifi"></i></div>
          <div class="main"><b>Wifi</b><small>Kết nối mạng Wifi văn phòng</small></div><i class="icon-chevron-right"></i>
        </button>` : ''}
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
  }

  function saveLog(log, btn) {
    return busy(btn, async () => {
      const saved = await API.addLog(log);
      S.logs.push(saved);
      if (navigator.vibrate) navigator.vibrate(40);
      go('success/' + saved.id);
    });
  }

  // ---------------------------------------------------------------- GPS check-in
  function renderGps(kind) {
    kind = KIND[kind] ? kind : nextMainKind();
    const locs = myLocations();
    if (!locs.length) { toast('Công ty chưa cài địa điểm chấm công. Liên hệ quản trị.'); return go('home'); }
    $app.innerHTML = `<div class="gps-screen">
      <div id="map" class="gps-map"></div>
      <div class="gps-top">
        <button class="float-btn" data-go="home" aria-label="Quay lại"><i class="icon-arrow-left"></i></button>
        <div class="float-pill">${kind === 'in' || kind === 'out' ? 'Chấm công GPS' : esc(KIND[kind].label) + ' · GPS'}</div>
      </div>
      <button class="float-btn gps-locate" id="recenter" aria-label="Về vị trí của tôi"><i class="icon-locate-fixed"></i></button>
      <div class="gps-sheet">
        <div class="grabber"></div>
        <div class="place" id="gPlace"></div>
        <div class="stats3">
          <div><div class="lbl">Khoảng cách</div><div class="val" id="gDist">--</div></div>
          <div><div class="lbl">Độ chính xác</div><div class="val" id="gAcc">--</div></div>
          <div><div class="lbl">Bán kính</div><div class="val" id="gRad">--</div></div>
        </div>
        <div class="banner idle" id="gBanner"></div>
        <div class="spacer"></div>
        <button class="btn-primary" id="gCta" disabled></button>
        <button class="btn-outline" id="gRetry" style="margin-top:-4px;display:none"><i class="icon-refresh-cw"></i>Định vị lại</button>
      </div>
    </div>`;

    let map = null, userMarker = null, accCircle = null, fitted = false;
    if (window.L) {
      map = L.map('map', { zoomControl: false }).setView([locs[0].lat, locs[0].lng], 16);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles © Esri' }).addTo(map);
      map.attributionControl.setPrefix(false);
      locs.forEach(o => {
        L.circle([o.lat, o.lng], { radius: o.radius, color: 'rgba(242,87,43,.7)', weight: 2, fillColor: '#F2572B', fillOpacity: .18 }).addTo(map);
        L.marker([o.lat, o.lng], { icon: L.divIcon({ className: 'leaflet-div-icon plain', html: '<div class="office-pin"><div class="head"><i class="icon-building-2"></i></div><div class="stem"></div></div>', iconSize: [34, 42], iconAnchor: [17, 42] }) }).addTo(map);
      });
      setTimeout(() => map && map.invalidateSize(), 50);
    } else {
      document.getElementById('map').innerHTML = '<div class="empty" style="padding-top:120px"><i class="icon-map"></i>Không tải được bản đồ (kiểm tra kết nối mạng)</div>';
    }
    const fitBoth = () => {
      if (!map) return;
      const { loc } = nearest();
      const b = L.latLng(loc.lat, loc.lng).toBounds(loc.radius * 2);
      if (geo.fix) b.extend([geo.fix.lat, geo.fix.lng]);
      map.fitBounds(b, { paddingTopLeft: [30, 80], paddingBottomRight: [30, 50], maxZoom: 17 });
    };
    const update = () => {
      const $dist = document.getElementById('gDist');
      if (!$dist) return;
      const fix = geo.fix, { loc, dist } = nearest();
      let state;
      if (fix && Date.now() - geo.at < 120e3) state = fix.acc > MAX_ACC ? 'weak' : dist <= loc.radius ? 'in' : 'out';
      else state = geo.err ? 'err' : 'loading';
      document.getElementById('gPlace').innerHTML = `<div class="sq"><i class="icon-map-pin"></i></div><div><b>${esc(loc.name)}</b><small>${esc(loc.address)}</small></div>`;
      document.getElementById('gRad').textContent = `${Math.round(loc.radius)}m`;
      $dist.textContent = fix ? fmtDist(dist) : '--';
      $dist.style.color = state === 'in' ? 'var(--green)' : state === 'out' ? 'var(--red)' : '';
      document.getElementById('gAcc').textContent = fix ? `±${Math.round(fix.acc)}m` : '--';
      const banners = {
        loading: ['idle', 'loader-circle spin', 'Đang xác định vị trí của bạn...'],
        err: ['bad', 'circle-alert', geo.err],
        weak: ['warn', 'triangle-alert', `Tín hiệu GPS yếu (±${fix ? Math.round(fix.acc) : '--'}m). Hãy ra chỗ thoáng rồi định vị lại.`],
        in: ['ok', 'circle-check', 'Bạn đang trong vùng chấm công'],
        out: ['bad', 'circle-alert', `Bạn đang ngoài vùng chấm công (cách ${fmtDist(dist)})`]
      };
      const [cls, icon, text] = banners[state];
      const $b = document.getElementById('gBanner');
      $b.className = 'banner ' + cls;
      $b.innerHTML = `<i class="icon-${icon}"></i><span>${esc(text)}</span>`;
      const $cta = document.getElementById('gCta');
      if ($cta.dataset.busy) return;
      if (state === 'in') { $cta.disabled = false; $cta.dataset.mode = 'confirm'; $cta.innerHTML = `<i class="icon-fingerprint"></i>${KIND[kind].cta}`; }
      else if (state === 'out' || state === 'err') { $cta.disabled = false; $cta.dataset.mode = 'explain'; $cta.innerHTML = '<i class="icon-file-pen-line"></i>Gửi giải trình'; }
      else { $cta.disabled = true; $cta.dataset.mode = ''; $cta.innerHTML = state === 'weak' ? '<i class="icon-fingerprint"></i>Chờ tín hiệu GPS tốt hơn' : '<i class="icon-loader-circle spin"></i>Đang định vị...'; }
      document.getElementById('gRetry').style.display = state === 'out' || state === 'err' || state === 'weak' ? '' : 'none';
      if (map && fix) {
        const ll = [fix.lat, fix.lng];
        if (!userMarker) {
          accCircle = L.circle(ll, { radius: fix.acc, color: '#3B82F6', weight: 1, opacity: .35, fillOpacity: .08, interactive: false }).addTo(map);
          userMarker = L.marker(ll, { icon: L.divIcon({ className: 'leaflet-div-icon plain', html: '<div class="user-dot"></div>', iconSize: [44, 44], iconAnchor: [22, 22] }) }).addTo(map);
        } else { userMarker.setLatLng(ll); accCircle.setLatLng(ll).setRadius(fix.acc); }
        if (!fitted) { fitted = true; fitBoth(); }
      }
    };
    geo.fix = null; geo.err = null;
    geo.listeners.add(update);
    startWatch(); update();
    const tick = setInterval(update, 15e3);
    cleanup.push(() => { geo.listeners.delete(update); stopWatch(); clearInterval(tick); if (map) map.remove(); map = null; });

    document.getElementById('recenter').onclick = () => {
      if (map && geo.fix) map.setView([geo.fix.lat, geo.fix.lng], Math.max(map.getZoom(), 17)); else fitBoth();
    };
    document.getElementById('gRetry').onclick = () => { geo.fix = null; geo.err = null; fitted = false; update(); startWatch(); };
    document.getElementById('gCta').onclick = e => {
      const btn = e.currentTarget, mode = btn.dataset.mode;
      const { loc, dist } = nearest();
      if (mode === 'confirm') {
        if (!geo.fix || dist > loc.radius) return update();
        btn.dataset.busy = '1';
        saveLog({ kind, method: 'GPS', dist: Math.round(dist), acc: Math.round(geo.fix.acc), status: 'ok', locationId: loc.id,
          lat: +geo.fix.lat.toFixed(6), lng: +geo.fix.lng.toFixed(6) }, btn).finally(() => { delete btn.dataset.busy; });
      } else if (mode === 'explain') {
        const note = geo.fix ? `Chấm công ngoài vùng (cách ${loc.name} ${fmtDist(dist)})` : 'Không xác định được vị trí GPS';
        go(`proposal/explain?issue=${encodeURIComponent(geo.fix ? 'Ngoài vùng chấm công' : 'Lỗi định vị GPS')}&time=${hm(Date.now())}&kind=${kind}&note=${encodeURIComponent(note)}`);
      }
    };
  }

  // ---------------------------------------------------------------- Wifi check-in
  function renderWifi(kind) {
    kind = KIND[kind] ? kind : nextMainKind();
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const type = c && c.type;
    const locs = myLocations();
    const ssid = locs.map(l => l.wifi).filter(Boolean).join(' / ') || 'Wifi văn phòng';
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
          <div><b>${esc(ssid)}</b><small>${esc(locs.map(l => l.name).join(' · '))}</small></div>
        </div>
        <div class="banner ${cls}"><i class="icon-${icon}"></i><span>${esc(text)}</span></div>
        ${canSubmit ? `<label class="check-line"><input type="checkbox" id="wConfirm"><span>Tôi xác nhận đang kết nối mạng <b>${esc(ssid)}</b> tại văn phòng.</span></label>` : ''}
        <div style="height:8px"></div>
        ${canSubmit ? `<button class="btn-primary" id="wCta" disabled><i class="icon-fingerprint"></i>${KIND[kind].cta}</button>` : ''}
        <button class="btn-outline" data-go="gps?kind=${kind}"><i class="icon-locate-fixed"></i>Chấm bằng GPS</button>
      </div>
    </div>`;
    const cb = document.getElementById('wConfirm');
    if (!cb) return;
    const btn = document.getElementById('wCta');
    cb.onchange = () => { btn.disabled = !cb.checked; };
    btn.onclick = () => saveLog({ kind, method: 'Wifi', ssid, status: state === 'wifi' ? 'ok' : 'pending', locationId: locs[0] ? locs[0].id : '' }, btn);
  }

  // ---------------------------------------------------------------- success
  function renderSuccess(id) {
    const l = S.logs.find(x => x.id === id);
    if (!l) return go('home');
    const ok = l.status === 'ok', sh = shift();
    const loc = S.locations.find(x => x.id === l.locationId);
    const late = l.kind === 'in' ? minsOfTs(l.ts) - mins(sh.start) - (sh.grace || 0) : 0;
    $app.innerHTML = `<div class="success">
      <div class="body">
        <div class="halo ${ok ? 'ok' : 'pending'}"><div><i class="icon-${ok ? 'check' : 'hourglass'}"></i></div></div>
        <h1>${ok ? 'Chấm công thành công' : 'Đã gửi chấm công'}</h1>
        <div class="sub">${ok ? `Đã ghi nhận ${KIND[l.kind].done} của bạn` : 'Lượt chấm đang chờ nhân sự phê duyệt'}</div>
        <div class="clock">${hm(l.ts)}</div>
        <div class="date">${longDate(l.ts)}</div>
        <div class="kv">
          <div><span>Loại chấm công</span><b>${KIND[l.kind].type} · ${esc(sh.name)}</b></div>
          <div><span>Địa điểm</span><b>${esc(loc ? loc.name : '—')}</b></div>
          <div><span>Phương thức</span><b>${l.method === 'GPS' ? `GPS · cách ${fmtDist(l.dist)}` : `Wifi · ${esc(l.ssid || '')}`}</b></div>
          ${late > 0 ? `<div><span>Ghi chú</span><b style="color:var(--red)">Đi muộn ${late} phút</b></div>` : ''}
        </div>
      </div>
      <div class="foot"><button class="btn-primary" data-go="home">Về trang chủ</button></div>
    </div>`;
  }

  // ---------------------------------------------------------------- requests
  const leaveLeft = () => Math.max(0, Number(S.user.leaveTotal ?? S.company.settings.leavePerYear ?? 12) - C.leaveUsed(S.reqs, new Date().getFullYear(), shift()));
  const admins = () => S.users.filter(u => u.role === 'admin' && u.active !== false && u.uid !== S.user.uid);

  function reqCard(r) {
    const t = REQ_TYPES[r.type];
    return `<button class="req-card tap" data-go="request/${r.id}">
      <div class="circ" style="background:${reqBg(t.hue)};color:${reqFg(t.hue)}"><i class="icon-${t.icon}"></i></div>
      <div class="main">
        <div class="t1">${r.type === 'leave' ? 'Nghỉ phép · ' + (LEAVE_TYPES[r.leaveType] || 'Phép năm') : t.name}</div>
        <div class="t2">${esc(C.reqSummary(r, shift()))}</div>
        <div class="t3">${chip(r.status)}<span>Gửi ${relTime(r.created).toLowerCase()}</span>${r.hasAttachment ? '<i class="icon-paperclip"></i>' : ''}</div>
      </div>
      <i class="icon-chevron-right"></i>
    </button>`;
  }

  function renderProposals() {
    const pending = S.reqs.filter(r => r.status === 'pending').length;
    $app.innerHTML = `<div class="screen with-tabs">
      ${topbar('Đề xuất')}
      <div class="content" style="padding-top:20px">
        <button class="card my-req tap" data-go="requests">
          <div class="circ" style="background:var(--orange-soft);color:var(--orange)"><i class="icon-inbox"></i></div>
          <div class="main"><b>Đơn của tôi</b><small>${S.reqs.length} đơn${pending ? ` · ${pending} đang chờ duyệt` : ''}</small></div>
          <i class="icon-chevron-right"></i>
        </button>
        <div class="label-sm">Tạo đề xuất mới</div>
        <div class="card list">
          ${Object.entries(REQ_TYPES).map(([k, t]) => `
            <button class="list-row tap" data-go="proposal/${k}">
              <div class="circ" style="background:${reqBg(t.hue)};color:${reqFg(t.hue)}"><i class="icon-${t.icon}"></i></div>
              <span class="name">${t.name}</span><i class="icon-chevron-right"></i>
            </button>`).join('')}
        </div>
      </div>
      ${tabbar('proposals')}
    </div>`;
  }

  function renderMyRequests() {
    const all = [...S.reqs].sort((a, b) => b.created - a.created);
    const count = s => all.filter(r => s === 'all' || r.status === s).length;
    const tabs = [['all', 'Tất cả'], ['pending', 'Chờ duyệt'], ['approved', 'Đã duyệt'], ['rejected', 'Từ chối']];
    const list = all.filter(r => ui.reqTab === 'all' || r.status === ui.reqTab);
    $app.innerHTML = `<div class="screen">
      ${topbar('Đơn của tôi', { back: 'proposals' })}
      <div class="seg-wrap"><div class="seg">${tabs.map(([k, n]) => `<button class="${ui.reqTab === k ? 'on' : ''} seg-${k}" data-act="reqtab" data-tab="${k}">${n}<em>${count(k)}</em></button>`).join('')}</div></div>
      <div class="content" style="padding-bottom:24px">
        ${list.length ? list.map(reqCard).join('') : '<div class="card empty"><i class="icon-inbox"></i>Không có đơn nào</div>'}
        <button class="btn-outline" data-go="proposals"><i class="icon-square-pen"></i>Tạo đề xuất mới</button>
      </div>
    </div>`;
  }

  async function renderRequestDetail(id) {
    const r = S.reqs.find(x => x.id === id);
    if (!r) return go('requests');
    const t = REQ_TYPES[r.type];
    const rows = [
      ['Loại đơn', r.type === 'leave' ? 'Nghỉ phép · ' + (LEAVE_TYPES[r.leaveType] || 'Phép năm') : t.name],
      ['Chi tiết', C.reqSummary(r, shift())],
      ['Lý do', r.reason],
      ['Người duyệt', userName(r.approverUid) || 'Quản trị'],
      ['Ngày gửi', `${hm(r.created)} ${dmy(r.created)}`]
    ];
    if (r.decidedAt) rows.push([r.status === 'approved' ? 'Duyệt lúc' : 'Từ chối lúc', `${hm(r.decidedAt)} ${dmy(r.decidedAt)} · ${userName(r.decidedBy)}`]);
    if (r.comment) rows.push(['Ý kiến người duyệt', r.comment]);
    $app.innerHTML = `<div class="screen">
      ${topbar('Chi tiết đơn', { back: 'requests' })}
      <div class="content" style="padding-top:20px;padding-bottom:24px">
        <div class="card req-head">
          <div class="circ" style="background:${reqBg(t.hue)};color:${reqFg(t.hue)}"><i class="icon-${t.icon}"></i></div>
          <div style="flex:1"><b>${t.name}</b><div style="margin-top:4px">${chip(r.status)}</div></div>
        </div>
        <div class="card kv2">${rows.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>
        ${r.hasAttachment ? '<div class="card attach-view" id="attView"><div class="empty"><i class="icon-loader-circle spin"></i>Đang tải ảnh đính kèm...</div></div>' : ''}
        ${r.status === 'pending' ? '<button class="btn-outline danger-outline" id="cancelReq"><i class="icon-trash-2"></i>Huỷ đơn</button>' : ''}
      </div>
    </div>`;
    const cb = document.getElementById('cancelReq');
    if (cb) cb.onclick = () => confirmDialog('Huỷ đơn', 'Bạn có chắc muốn huỷ đơn này?', 'Huỷ đơn', async () => {
      try { await API.deleteRequest(id); S.reqs = S.reqs.filter(x => x.id !== id); toast('Đã huỷ đơn'); go('requests'); }
      catch (e) { toast(errMsg(e)); }
    });
    if (r.hasAttachment) {
      const el = () => document.getElementById('attView');
      try {
        const data = await API.getAttachment(id);
        if (el()) el().innerHTML = data ? `<img src="${esc(data)}" alt="Ảnh đính kèm">` : '<div class="empty">Không có ảnh</div>';
      } catch (e) { if (el()) el().innerHTML = `<div class="empty">${esc(errMsg(e))}</div>`; }
    }
  }

  function renderRequestForm(type, params) {
    const t = REQ_TYPES[type];
    if (!t) return go('proposals');
    const today = dayKey(new Date()), sh = shift();
    const reason = (ph, val = '') => `<div class="field"><label for="fReason">Lý do <em>*</em></label><textarea id="fReason" name="reason" required placeholder="${ph}">${esc(val)}</textarea></div>`;
    const dateF = (name, label, val = today) => `<div class="field"><label for="f_${name}">${label} <em>*</em></label><input id="f_${name}" type="date" name="${name}" value="${val}" required></div>`;
    const timeF = (name, label, val) => `<div class="field"><label for="f_${name}">${label} <em>*</em></label><input id="f_${name}" type="time" name="${name}" value="${val}" required></div>`;
    const sel = (name, label, opts, val) => `<div class="field"><label for="f_${name}">${label}</label><select id="f_${name}" name="${name}">${opts.map(o => `<option${o === val ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;
    const chips = (name, opts, val) => `<div class="chips" role="radiogroup">${opts.map(([v, l]) => `<label class="chip-opt"><input type="radio" name="${name}" value="${v}"${v === val ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
    const fields = {
      leave: `
        <div class="field"><label>Loại nghỉ</label>${chips('leaveType', Object.entries(LEAVE_TYPES), 'annual')}</div>
        <div class="row2">${dateF('from', 'Từ ngày')}${dateF('to', 'Đến ngày')}</div>
        <div class="field"><label>Thời gian nghỉ</label>${chips('part', [['Cả ngày', 'Cả ngày'], ['Buổi sáng', 'Nửa ngày sáng'], ['Buổi chiều', 'Nửa ngày chiều']], 'Cả ngày')}
          <div class="hint" id="partHint" hidden>Nghỉ nửa ngày chỉ áp dụng khi từ ngày và đến ngày trùng nhau.</div></div>
        <div class="leave-box"><div><span>Số ngày phép còn lại</span><b id="leaveLeft">${num(leaveLeft())}</b></div><div><span>Đơn này</span><b id="leaveThis">1 ngày</b></div></div>
        ${reason('VD: Việc gia đình')}`,
      lateearly: `${dateF('date', 'Ngày')}
        <div class="row2">${sel('mode', 'Loại', ['Đi muộn', 'Về sớm'], 'Đi muộn')}
        <div class="field"><label for="f_min">Số phút <em>*</em></label><input id="f_min" type="number" name="minutes" min="1" max="480" value="30" inputmode="numeric" required></div></div>
        ${reason('VD: Đi gặp khách hàng')}`,
      ot: `${dateF('date', 'Ngày')}
        <div class="row2">${timeF('start', 'Từ giờ', sh.end)}${timeF('end', 'Đến giờ', '20:00')}</div>
        ${reason('VD: Hoàn thành báo cáo cuối tháng')}`,
      trip: `<div class="row2">${dateF('from', 'Từ ngày')}${dateF('to', 'Đến ngày')}</div>
        <div class="field"><label for="f_place">Địa điểm <em>*</em></label><input id="f_place" name="place" required placeholder="VD: Khách hàng ABC, Hải Phòng"></div>
        ${reason('VD: Khảo sát dự án')}`,
      explain: `${dateF('date', 'Ngày cần giải trình', params.date || today)}
        <div class="row2">${sel('issue', 'Vấn đề', ['Quên chấm công vào', 'Quên chấm công ra', 'Ngoài vùng chấm công', 'Lỗi định vị GPS', 'Đi muộn có lý do', 'Khác'], params.issue || 'Quên chấm công ra')}
        <div class="field"><label for="f_time">Giờ thực tế</label><input id="f_time" type="time" name="time" value="${esc(params.time || '')}"></div></div>
        ${reason('Mô tả lý do', params.note ? params.note + '. ' : '')}`,
      shift: `${dateF('date', 'Ngày đổi ca')}
        ${sel('target', 'Đổi sang ca', S.shifts.filter(s => s.id !== sh.id).map(s => `${s.name} ${s.start} – ${s.end}`).concat(['Khác (ghi trong lý do)']), '')}
        ${reason('VD: Đổi ca với đồng nghiệp')}`
    }[type];
    const ad = admins();
    const approverOpts = ad.length ? ad.map(u => `<option value="${u.uid}">${esc(u.name)}${u.title ? ' · ' + esc(u.title) : ''}</option>`).join('')
      : isAdmin() ? `<option value="${S.user.uid}">Tự duyệt (bạn là quản trị)</option>` : '<option value="">Chưa có quản trị</option>';
    $app.innerHTML = `<div class="screen">
      ${topbar(type === 'leave' ? 'Tạo đơn nghỉ phép' : t.name, { back: 'proposals' })}
      <form class="form" id="pForm" novalidate>
        ${fields}
        <div class="field"><label>Ảnh đính kèm</label>
          <label class="attach" id="attachBox"><input type="file" accept="image/*" id="fFile" hidden>
            <span class="attach-empty"><i class="icon-image-plus"></i>Thêm ảnh (giấy khám bệnh, chứng từ...)</span></label></div>
        <div class="field"><label for="f_appr">Người duyệt <em>*</em></label><select id="f_appr" name="approverUid" required>${approverOpts}</select></div>
        <button class="btn-primary" type="submit"><i class="icon-send"></i>Gửi đề xuất</button>
      </form>
    </div>`;
    const form = document.getElementById('pForm');
    let attachment = null;
    const fileIn = document.getElementById('fFile'), box = document.getElementById('attachBox');
    const renderAttachEmpty = () => {
      box.innerHTML = '<span class="attach-empty"><i class="icon-image-plus"></i>Thêm ảnh (giấy khám bệnh, chứng từ...)</span>';
      box.appendChild(fileIn); fileIn.value = '';
    };
    fileIn.onchange = async () => {
      const f = fileIn.files[0];
      if (!f) return;
      try {
        attachment = await C.compressImage(f);
        box.innerHTML = `<img src="${attachment}" alt="Ảnh đính kèm"><button type="button" class="attach-x" aria-label="Bỏ ảnh"><i class="icon-x"></i></button>`;
        box.appendChild(fileIn);
        box.querySelector('.attach-x').onclick = ev => { ev.preventDefault(); attachment = null; renderAttachEmpty(); };
      } catch (e) { toast(errMsg(e)); }
    };
    if (type === 'leave') {
      const upd = () => {
        const d = Object.fromEntries(new FormData(form));
        const multi = d.to && d.from && d.to !== d.from;
        form.querySelectorAll('input[name=part]').forEach(i => { if (i.value !== 'Cả ngày') i.disabled = multi; });
        if (multi) form.querySelector('input[name=part][value="Cả ngày"]').checked = true;
        document.getElementById('partHint').hidden = !multi;
        const part = form.querySelector('input[name=part]:checked').value;
        const days = C.leaveDays({ from: d.from, to: d.to, part }, sh);
        document.getElementById('leaveThis').textContent = `${num(days)} ngày`;
        const annual = form.querySelector('input[name=leaveType]:checked').value === 'annual';
        document.getElementById('leaveLeft').textContent = annual ? num(leaveLeft()) : `${num(leaveLeft())} (không trừ)`;
      };
      form.addEventListener('change', upd); upd();
    }
    form.addEventListener('submit', e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form));
      for (const k of Object.keys(d)) d[k] = String(d[k]).trim();
      const missing = [...form.querySelectorAll('[required]')].find(i => !String(i.value).trim());
      if (missing) { toast('Vui lòng điền đủ các ô có dấu *'); missing.focus(); return; }
      if (d.from && d.to && d.to < d.from) return toast('Ngày kết thúc phải sau ngày bắt đầu');
      if (type === 'ot' && d.end <= d.start) return toast('Giờ kết thúc phải sau giờ bắt đầu');
      if (!d.approverUid) return toast('Công ty chưa có quản trị để duyệt đơn');
      if (type === 'leave') {
        if (d.to !== d.from) d.part = 'Cả ngày';
        if (!C.leaveDays(d, sh)) return toast('Khoảng ngày đã chọn không có ngày làm việc nào');
        if (d.leaveType === 'annual' && C.leaveDays(d, sh) > leaveLeft()) return toast('Số ngày nghỉ vượt quá số ngày phép còn lại');
      }
      if (type === 'explain' && params.kind) d.kind = params.kind;
      if (type === 'lateearly') d.minutes = Number(d.minutes);
      busy(form.querySelector('[type=submit]'), async () => {
        const saved = await API.createRequest({ type, ...d }, attachment);
        S.reqs.push(saved);
        toast('Đã gửi đề xuất');
        ui.reqTab = 'all';
        go('requests');
      });
    });
  }

  // ---------------------------------------------------------------- notifications
  function renderNotis() {
    const list = [...S.notis].sort((a, b) => b.ts - a.ts);
    $app.innerHTML = `<div class="screen with-tabs white">
      ${topbar('Thông báo', { right: '<button class="tb-right" data-act="readall" aria-label="Đánh dấu tất cả đã đọc"><i class="icon-check-check"></i></button>' })}
      <div>${list.length ? list.map(n => `
        <button class="noti ${n.read ? '' : 'unread'}" data-act="readone" data-id="${n.id}">
          <span class="dot"></span>
          <div style="flex:1"><div class="t1">${esc(n.text)}</div><div class="t2">${relTime(n.ts)}</div></div>
        </button>`).join('') : '<div class="empty" style="padding-top:80px"><i class="icon-bell"></i>Chưa có thông báo</div>'}</div>
      ${tabbar('notis')}
    </div>`;
  }

  // ---------------------------------------------------------------- history
  const DOT = { full: 'green', late: 'red', missing: 'red', absent: 'red', leave: 'amber', half: 'amber', trip: 'blue' };
  function renderHistory() {
    const now = new Date(), sh = shift();
    if (!ui.histMonth) ui.histMonth = { y: now.getFullYear(), m: now.getMonth() };
    const { y, m } = ui.histMonth;
    if (!ui.histSel || !ui.histSel.startsWith(`${y}-${pad(m + 1)}`)) ui.histSel = y === now.getFullYear() && m === now.getMonth() ? dayKey(now) : dayKey(new Date(y, m, 1));
    const months = [];
    for (let i = 0; i < 12; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push([d.getFullYear(), d.getMonth()]); }
    const last = new Date(y, m + 1, 0).getDate(), today = dayKey(now);
    const mStart = `${y}-${pad(m + 1)}-01`, mEnd = `${y}-${pad(m + 1)}-${pad(last)}`;
    if (mStart < S.logsFrom && !S.loadedMonths.has(mStart)) {
      $app.innerHTML = `<div class="screen white">${topbar('Lịch sử chấm công', { back: 'home' })}<div class="empty" style="padding-top:80px"><i class="icon-loader-circle spin"></i>Đang tải tháng ${m + 1}/${y}...</div></div>`;
      API.myLogs(mStart, mEnd).then(more => {
        const have = new Set(S.logs.map(l => l.id));
        S.logs.push(...more.filter(l => !have.has(l.id)));
        S.loadedMonths.add(mStart);
      }).catch(e => { toast(errMsg(e)); S.loadedMonths.add(mStart); }).then(() => { if (route().parts[0] === 'history') renderHistory(); });
      return;
    }
    const stOf = key => C.dayStatus({ logs: S.logs, reqs: S.reqs, key, shift: sh, startKey: startKey(), today });
    let body;
    if (ui.histTab === 'cong') {
      const lead = (new Date(y, m, 1).getDay() + 6) % 7;
      let cells = '';
      for (let i = 0; i < lead; i++) cells += '<div class="cal-cell"></div>';
      for (let d = 1; d <= last; d++) {
        const date = new Date(y, m, d), key = dayKey(date);
        const cls = ['cal-cell', 'tap', !isWorkday(date) && 'off', key > today && 'future', key === today && 'today', key === ui.histSel && 'sel'].filter(Boolean).join(' ');
        cells += `<button class="${cls}" data-act="selday" data-key="${key}"><span class="n">${d}</span><span class="d ${DOT[stOf(key).code] || ''}"></span></button>`;
      }
      const ms = C.monthSummary({ logs: S.logs, reqs: S.reqs, y, m, shift: sh, startKey: startKey() });
      const sel = fromKey(ui.histSel);
      const st = stOf(ui.histSel), s = st.s;
      const empty = { future: 'Chưa đến ngày', off: 'Ngày nghỉ', leave: 'Nghỉ phép', half: 'Nghỉ nửa ngày', trip: 'Công tác', absent: 'Vắng mặt' }[st.code] || 'Chưa chấm công';
      const place = l => `${l.method}${l.status === 'pending' ? ' · Chờ duyệt' : ''}`;
      const inCard = s.in
        ? `<div class="day-card ${s.lateBy ? 'red' : 'green'}"><span class="l"><i class="icon-log-in"></i>Giờ vào</span><span class="t">${hm(s.in.ts)}</span><span class="s">${s.lateBy ? `Đi muộn ${s.lateBy} phút` : place(s.in)}</span></div>`
        : `<div class="day-card gray"><span class="l"><i class="icon-log-in"></i>Giờ vào</span><span class="t">--:--</span><span class="s">${empty}</span></div>`;
      const outCard = s.out
        ? `<div class="day-card blue"><span class="l"><i class="icon-log-out"></i>Giờ ra</span><span class="t">${hm(s.out.ts)}</span><span class="s">${s.earlyBy ? `Về sớm ${s.earlyBy} phút` : place(s.out)}</span></div>`
        : `<div class="day-card gray"><span class="l"><i class="icon-log-out"></i>Giờ ra</span><span class="t">--:--</span><span class="s">${s.in && ui.histSel < today ? 'Thiếu giờ ra' : empty}</span></div>`;
      const needExplain = ['missing', 'absent'].includes(st.code) || (s.in && s.lateBy);
      body = `
        <div class="hist-shift">Ca làm việc: <b>${esc(sh.name)} ${esc(sh.start)} – ${esc(sh.end)}</b></div>
        <div class="selects">
          <div class="select-box"><span>Tháng lương</span><b>Tháng ${m + 1}/${y}</b><i class="icon-chevron-down"></i>
            <select data-act="month" aria-label="Chọn tháng">${months.map(([yy, mm]) => `<option value="${yy}-${mm}"${yy === y && mm === m ? ' selected' : ''}>Tháng ${mm + 1}/${yy}</option>`).join('')}</select></div>
          <div class="select-box"><span>Kỳ lương</span><b>01/${pad(m + 1)} – ${last}/${pad(m + 1)}</b><i class="icon-chevron-down"></i></div>
        </div>
        <div>
          <div class="cal-head">${[1, 2, 3, 4, 5, 6, 0].map(i => `<span>${DOW_SHORT[i]}</span>`).join('')}</div>
          <div class="cal">${cells}</div>
        </div>
        <div class="legend">
          <span class="pill">Số công: ${num(ms.work)}/${ms.workdays}</span>
          <span class="lg"><i style="background:var(--green)"></i>Đủ công</span>
          <span class="lg"><i style="background:var(--red)"></i>Thiếu / lỗi</span>
          <span class="lg"><i style="background:var(--amber)"></i>Nghỉ phép</span>
        </div>
        <div class="day-title"><i class="icon-history"></i>Lịch sử chấm công · ${dmy(sel)}</div>
        <div class="day-cards">${inCard}${outCard}</div>
        ${s.extras.length ? `<div class="extra-logs">${s.extras.map(l => `
          <div class="log-item"><i class="icon-${l.kind === 'ot' ? 'timer' : 'shield-check'}"></i>
            <div class="main"><div class="t1">${KIND[l.kind].label}: ${hm(l.ts)}</div><div class="t2">${place(l)}</div></div></div>`).join('')}</div>` : ''}
        ${needExplain ? `<button class="btn-outline" data-go="proposal/explain?issue=${encodeURIComponent(!s.in ? 'Quên chấm công vào' : !s.out ? 'Quên chấm công ra' : 'Đi muộn có lý do')}&date=${ui.histSel}"><i class="icon-file-pen-line"></i>Gửi giải trình cho ngày này</button>` : ''}`;
    } else {
      const ex = S.reqs.filter(r => r.type === 'explain').sort((a, b) => b.created - a.created);
      body = `${ex.length ? ex.map(reqCard).join('') : '<div class="card empty"><i class="icon-file-text"></i>Chưa có giải trình nào</div>'}
        <button class="btn-outline" data-go="proposal/explain"><i class="icon-file-pen-line"></i>Tạo giải trình mới</button>`;
    }
    $app.innerHTML = `<div class="screen white">
      ${topbar('Lịch sử chấm công', { back: 'home', extra: `<div class="tabs2"><button class="${ui.histTab === 'cong' ? 'on' : ''}" data-act="htab" data-tab="cong">Bảng công</button><button class="${ui.histTab === 'gt' ? 'on' : ''}" data-act="htab" data-tab="gt">Giải trình</button></div>` })}
      <div class="hist">${body}</div>
    </div>`;
    const msel = $app.querySelector('select[data-act="month"]');
    if (msel) msel.onchange = () => { const [yy, mm] = msel.value.split('-').map(Number); ui.histMonth = { y: yy, m: mm }; ui.histSel = null; renderHistory(); };
  }

  // ---------------------------------------------------------------- profile
  function renderProfile() {
    const u = S.user, now = new Date(), sh = shift();
    const ms = C.monthSummary({ logs: S.logs, reqs: S.reqs, y: now.getFullYear(), m: now.getMonth(), shift: sh, startKey: startKey() });
    const meta = [u.code && `Mã NV: ${u.code}`, u.dept].filter(Boolean).join(' · ') || u.title;
    $app.innerHTML = `<div class="screen with-tabs">
      <div class="profile-hero">
        <div class="avatar">${esc(initials(u.name))}</div>
        <div class="nm">${esc(u.name)}</div>
        <div class="meta">${esc(meta)}</div>
        <div class="role-pill">${isAdmin() ? '<i class="icon-shield-check"></i>Quản trị' : '<i class="icon-user-round"></i>Nhân viên'} · ${esc(S.company.name)}</div>
      </div>
      <div class="content" style="margin-top:-50px">
        <div class="card raised pstats">
          <div><div class="v" style="color:var(--orange)">${num(leaveLeft())}</div><div class="l">Ngày phép<br>còn lại</div></div>
          <div><div class="v" style="color:var(--green)">${num(ms.work)}<small>/${ms.workdays}</small></div><div class="l">Số công<br>tháng này</div></div>
          <div><div class="v" style="color:var(--red)">${ms.late}</div><div class="l">Số lần<br>đi muộn</div></div>
        </div>
        ${isAdmin() ? '<a class="card list-row tap admin-row" href="admin.html"><i class="icon-layout-dashboard lead"></i><span class="name">Trang quản trị</span><span class="val">Mở</span><i class="icon-chevron-right"></i></a>' : ''}
        <div class="card list">
          <button class="list-row tap" data-go="info"><i class="icon-user-round-pen lead"></i><span class="name">Thông tin cá nhân</span><span class="val"></span><i class="icon-chevron-right"></i></button>
          <button class="list-row tap" data-go="info"><i class="icon-calendar-clock lead"></i><span class="name">Ca làm việc</span><span class="val">${esc(sh.start)} – ${esc(sh.end)}</span><i class="icon-chevron-right"></i></button>
          <button class="list-row tap" data-go="password"><i class="icon-lock-keyhole lead"></i><span class="name">Đổi mật khẩu</span><span class="val"></span><i class="icon-chevron-right"></i></button>
          <button class="list-row tap" data-act="faceid" id="faceRow" hidden><i class="icon-scan-face lead"></i><span class="name">Đăng nhập bằng Face ID</span><span class="val">${faceOn() ? 'Đang bật' : 'Đang tắt'}</span><i class="icon-chevron-right"></i></button>
          <button class="list-row tap" data-act="device"><i class="icon-smartphone lead"></i><span class="name">Thiết bị đăng ký</span><span class="val">${esc(deviceName())}</span><i class="icon-chevron-right"></i></button>
          <button class="list-row tap" data-act="lang"><i class="icon-languages lead"></i><span class="name">Ngôn ngữ</span><span class="val">Tiếng Việt</span><i class="icon-chevron-right"></i></button>
        </div>
        <div class="card list"><button class="list-row danger tap" data-act="logout"><i class="icon-log-out" style="font-size:20px"></i><span class="name">Đăng xuất</span></button></div>
        <div class="version">Phiên bản ${VERSION}${API.mode === 'demo' ? ' · Chế độ dùng thử' : ''}</div>
      </div>
      ${tabbar('profile')}
    </div>`;
    faceAvailable().then(ok => { const r = document.getElementById('faceRow'); if (r) r.hidden = !ok; });
  }
  function renderInfo() {
    const u = S.user, sh = shift();
    const locs = myLocations().map(l => l.name).join(', ') || '—';
    const rows = [['Họ và tên', u.name], ['Mã nhân viên', u.code || '—'], ['Tài khoản', u.account || '—'], ['Phòng ban', u.dept || '—'], ['Chức danh', u.title || '—'],
      ['Quyền', C.ROLES[u.role] || u.role], ['Công ty', `${S.company.name} (${S.company.code})`], ['Ca làm việc', `${sh.name} ${sh.start} – ${sh.end}`],
      ['Ngày làm việc', (sh.workdays || []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(i => DOW_SHORT[i]).join(', ')], ['Địa điểm chấm công', locs],
      ['Phép năm', `${u.leaveTotal ?? S.company.settings.leavePerYear} ngày`]];
    $app.innerHTML = `<div class="screen">
      ${topbar('Thông tin cá nhân', { back: 'profile' })}
      <div class="content" style="padding-top:20px;padding-bottom:24px">
        <div class="card kv2">${rows.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>
        <div class="hint" style="padding:0 4px">Thông tin do bộ phận nhân sự quản lý. Cần sửa, hãy liên hệ quản trị.</div>
      </div>
    </div>`;
  }
  function renderPassword(force = false) {
    const knowOld = force && S.tmpPw;
    $app.innerHTML = `<div class="screen">
      ${force ? `<header class="topbar"><div class="topbar-row">Đặt mật khẩu mới</div><div class="topbar-pad"></div></header>` : topbar('Đổi mật khẩu', { back: 'profile' })}
      <form class="form" id="pwForm">
        ${force ? `<div class="banner warn"><i class="icon-shield-check"></i><span>Xin chào ${esc(S.user.name)}! Bạn đang dùng mật khẩu tạm do công ty cấp. Hãy đặt mật khẩu riêng để tiếp tục.</span></div>` : ''}
        <div class="field" ${knowOld ? 'hidden' : ''}><label for="pw0">${force ? 'Mật khẩu tạm' : 'Mật khẩu hiện tại'}</label><input id="pw0" name="old" type="password" required autocomplete="current-password" value="${knowOld ? esc(S.tmpPw) : ''}"></div>
        <div class="field"><label for="pw1">Mật khẩu mới</label><input id="pw1" name="new1" type="password" required minlength="6" autocomplete="new-password" placeholder="Ít nhất 6 ký tự"></div>
        <div class="field"><label for="pw2">Nhập lại mật khẩu mới</label><input id="pw2" name="new2" type="password" required autocomplete="new-password"></div>
        <button class="btn-primary" type="submit">${force ? 'Lưu và vào app' : 'Đổi mật khẩu'}</button>
        ${force ? '<button class="link-btn" type="button" id="pwLogout">Đăng xuất</button>' : ''}
      </form>
    </div>`;
    const f = document.getElementById('pwForm');
    const lo = document.getElementById('pwLogout');
    if (lo) lo.onclick = () => signOut();
    f.addEventListener('submit', e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      if (d.new1.length < 6) return toast('Mật khẩu cần ít nhất 6 ký tự');
      if (d.new1 !== d.new2) return toast('Hai mật khẩu mới không khớp');
      busy(f.querySelector('[type=submit]'), async () => {
        await API.changePassword(d.old, d.new1);
        S.tmpPw = null;
        S.user.mustChangePassword = false;
        toast(force ? 'Đã đặt mật khẩu mới. Chào mừng bạn!' : 'Đã đổi mật khẩu');
        if (force) { go('home'); render(); } else go('profile');
      });
    });
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

  // ---------------------------------------------------------------- events
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-go]');
    if (g && $app.contains(g)) { e.preventDefault(); go(g.dataset.go); return; }
    const a = e.target.closest('[data-act]');
    if (!a || a.tagName === 'SELECT') return;
    switch (a.dataset.act) {
      case 'popup': showMethodPopup(a.dataset.kind); break;
      case 'locate': {
        geo.err = null; locateOnce();
        const el = document.getElementById('locLine');
        if (el) el.innerHTML = '<span class="loc-line idle"><span class="pulse"></span>Đang xác định vị trí...</span>';
        break;
      }
      case 'readall':
        API.markAllRead().then(() => { S.notis.forEach(n => { n.read = true; }); renderNotis(); toast('Đã đánh dấu tất cả là đã đọc'); }).catch(err => toast(errMsg(err)));
        break;
      case 'readone': {
        const n = S.notis.find(x => x.id === a.dataset.id);
        if (n && !n.read) { n.read = true; a.classList.remove('unread'); API.markRead(n.id).catch(() => {}); if (!unreadCount()) renderNotis(); }
        break;
      }
      case 'htab': ui.histTab = a.dataset.tab; renderHistory(); break;
      case 'selday': ui.histSel = a.dataset.key; renderHistory(); break;
      case 'reqtab': ui.reqTab = a.dataset.tab; renderMyRequests(); break;
      case 'device': toast(`Thiết bị đang dùng: ${deviceName()}`); break;
      case 'lang': toast('Hiện ứng dụng hỗ trợ Tiếng Việt'); break;
      case 'faceid':
        if (faceOn()) confirmDialog('Face ID', 'Tắt đăng nhập bằng Face ID trên máy này?', 'Tắt', () => { lsSet(FACE_KEY, null); renderProfile(); });
        else faceRegister(S.user, S.user.account).then(() => { toast('Đã bật đăng nhập bằng Face ID'); renderProfile(); }).catch(() => toast('Chưa bật được Face ID trên máy này'));
        break;
      case 'logout': confirmDialog('Đăng xuất', 'Bạn có chắc muốn đăng xuất khỏi tài khoản này?', 'Đăng xuất', () => { lsSet(FACE_KEY, null); signOut(); }); break;
    }
  });

  // Tải lại dữ liệu khi quay lại app (đơn có thể vừa được duyệt).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !S.session || S.locked || Date.now() - S.loadedAt < 30e3) return;
    const p = route().parts[0];
    loadAll().then(() => { if (['home', 'notis', 'requests', 'proposals', 'history', 'profile'].includes(p)) render(); }).catch(() => {});
  });

  // ---------------------------------------------------------------- boot
  (async () => {
    $app.innerHTML = '<div class="boot"><div class="logo"><i class="icon-scan-face"></i></div></div>';
    try {
      S.session = await API.ready();
      if (S.session) {
        S.user = S.session.user;
        await loadAll();
        if (faceOn() && await faceAvailable()) S.locked = true;
      }
    } catch (e) { S.session = null; toast(errMsg(e)); }
    render();
  })();
  if ('serviceWorker' in navigator && window.isSecureContext && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
