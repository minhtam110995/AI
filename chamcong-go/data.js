'use strict';
/*
 * ChấmCông Go — lớp dữ liệu.
 * Hai chế độ cùng một bộ hàm (đều trả về Promise):
 *   - demo:     dữ liệu mẫu lưu trong trình duyệt (khi config.js chưa có cấu hình Firebase)
 *   - firebase: Firebase Authentication + Cloud Firestore, phân quyền bằng firestore.rules
 */
(() => {
  const C = window.CCG_CORE;
  const cfg = window.CCG_CONFIG || {};
  const CID_KEY = 'ccg.cid';

  const normCode = c => String(c || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  const normAccount = a => String(a || '').trim().toLowerCase();
  const toEmail = (code, account) => account.includes('@') ? account : `${account}@${code.toLowerCase()}.chamcong.app`;
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
  const fail = msg => { const e = new Error(msg); e.userMessage = msg; throw e; };
  const DEFAULT_SETTINGS = { leavePerYear: 12, allowWifi: true };

  // ====================================================================== DEMO
  function demoBackend() {
    const KEY = 'ccg.demo.v1';
    let store = null;
    const load = () => {
      if (store) return store;
      try { store = JSON.parse(lsGet(KEY)); } catch (e) { store = null; }
      if (!store || !store.companies) { store = { companies: {}, session: null }; seed(store); persist(); }
      return store;
    };
    const persist = () => lsSet(KEY, JSON.stringify(store));
    const co = () => { const s = load(); const c = s.session && s.companies[s.session.cid]; if (!c) fail('Phiên đăng nhập đã hết, hãy đăng nhập lại'); return c; };
    const me = () => { const c = co(); return c.users[load().session.uid]; };
    const isAdmin = () => me().role === 'admin';
    const needAdmin = () => { if (!isAdmin()) fail('Bạn không có quyền thực hiện thao tác này'); };
    const pub = u => { const { password, ...rest } = u; return rest; };
    const clone = x => JSON.parse(JSON.stringify(x));
    const delay = v => new Promise(r => setTimeout(() => r(v), 60));

    function seed(s) {
      const id = C.uid;
      const now = new Date(), today = C.dayKey(now);
      const locHN = { id: id(), name: 'Văn phòng Hà Nội', address: 'Tầng 12, 72 Trần Hưng Đạo, P. Trần Hưng Đạo, Q. Hoàn Kiếm, Hà Nội', lat: 21.0227, lng: 105.8463, radius: 150, wifi: 'DEMO-Office' };
      const locHCM = { id: id(), name: 'Chi nhánh TP.HCM', address: '135 Nam Kỳ Khởi Nghĩa, P. Bến Thành, Quận 1, TP.HCM', lat: 10.7745, lng: 106.6990, radius: 200, wifi: 'DEMO-HCM' };
      const shHC = { id: id(), name: 'Hành chính', start: '08:00', end: '17:30', workdays: [1, 2, 3, 4, 5, 6], grace: 0 };
      const shS = { id: id(), name: 'Ca sáng', start: '06:00', end: '14:00', workdays: [1, 2, 3, 4, 5, 6, 0], grace: 5 };
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
      const people = [
        ['admin', 'Trần Thị Hương', 'Trưởng phòng Nhân sự', 'Phòng Nhân sự', 'admin', 'NV-0001'],
        ['nv01', 'Nguyễn Văn An', 'Nhân viên kinh doanh', 'Phòng Kinh doanh', 'employee', 'NV-0248'],
        ['nv02', 'Lê Minh Châu', 'Kế toán', 'Phòng Kế toán', 'employee', 'NV-0251'],
        ['nv03', 'Phạm Quốc Bảo', 'Nhân viên kỹ thuật', 'Phòng Kỹ thuật', 'employee', 'NV-0263'],
        ['nv04', 'Đỗ Thu Hà', 'Chăm sóc khách hàng', 'Phòng Kinh doanh', 'employee', 'NV-0270'],
        ['nv05', 'Vũ Hoàng Nam', 'Nhân viên kho', 'Phòng Vận hành', 'employee', 'NV-0284']
      ];
      const users = {};
      people.forEach(([account, name, title, dept, role, code], i) => {
        const u = { uid: id(), account, password: '123456', name, title, dept, role, code, active: true, shiftId: shHC.id, locationIds: [], leaveTotal: 12, createdAt: start };
        if (i === 5) { u.shiftId = shS.id; }
        if (i === 4) { u.locationIds = [locHCM.id]; }
        users[u.uid] = u;
      });
      const list = Object.values(users);
      const logs = [], reqs = [], notis = [];
      list.forEach((u, ui) => {
        const sh = u.shiftId === shS.id ? shS : shHC;
        const loc = u.locationIds[0] === locHCM.id ? locHCM : locHN;
        let i = 0;
        C.eachDay(C.dayKey(start), today, (d, key) => {
          if (!C.isWorkday(d, sh)) return;
          i++;
          const at = m => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, m).getTime();
          if (key === today && ui % 3 === 2) return;              // hôm nay: vài người chưa đến
          if ((i + ui * 5) % 23 === 7 && key !== today) return;   // vắng không phép
          const late = (i + ui * 3) % 9 === 4;
          const inM = C.mins(sh.start) + (late ? 9 + (i % 4) * 6 : -12 + (i * 7 + ui) % 10);
          const inTs = at(inM);
          if (key === today && inTs > Date.now()) return;
          logs.push({ id: id(), uid: u.uid, ts: inTs, day: key, kind: 'in', method: 'GPS', dist: 15 + (i * 13 + ui * 7) % 110, acc: 6 + i % 9, status: 'ok', locationId: loc.id });
          const outTs = at(C.mins(sh.end) + (i * 3 + ui) % 9);
          if (key === today && outTs > Date.now()) return;
          if ((i + ui) % 13 === 6) return; // quên chấm ra
          const wifi = (i + ui) % 3 === 0;
          logs.push({ id: id(), uid: u.uid, ts: outTs, day: key, kind: 'out', method: wifi ? 'Wifi' : 'GPS', ssid: wifi ? loc.wifi : '', dist: wifi ? null : 30, acc: wifi ? null : 9, status: 'ok', locationId: loc.id });
        });
      });
      const [admin, an, chau, bao, ha] = list;
      const t = Date.now(), plus = n => { const d = new Date(); d.setDate(d.getDate() + n); return C.dayKey(d); };
      const minus = n => { const d = new Date(); d.setDate(d.getDate() - n); return C.dayKey(d); };
      reqs.push(
        { id: id(), uid: an.uid, type: 'leave', leaveType: 'annual', from: plus(6), to: plus(6), part: 'Cả ngày', reason: 'Việc gia đình', status: 'pending', approverUid: admin.uid, created: t - 40 * 60e3 },
        { id: id(), uid: chau.uid, type: 'ot', date: minus(1), start: '17:30', end: '20:00', reason: 'Chốt sổ cuối tháng', status: 'pending', approverUid: admin.uid, created: t - 3 * 3600e3 },
        { id: id(), uid: bao.uid, type: 'explain', date: minus(2), issue: 'Quên chấm công ra', time: '17:40', kind: 'out', reason: 'Điện thoại hết pin lúc về', status: 'pending', approverUid: admin.uid, created: t - 20 * 3600e3 },
        { id: id(), uid: ha.uid, type: 'leave', leaveType: 'sick', from: minus(9), to: minus(8), part: 'Cả ngày', reason: 'Sốt, có giấy khám bệnh', status: 'approved', approverUid: admin.uid, decidedBy: admin.uid, decidedAt: t - 9 * 86400e3, created: t - 10 * 86400e3 },
        { id: id(), uid: an.uid, type: 'trip', from: minus(15), to: minus(15), place: 'Khách hàng ABC, Bắc Ninh', reason: 'Khảo sát lắp đặt', status: 'approved', approverUid: admin.uid, decidedBy: admin.uid, decidedAt: t - 16 * 86400e3, created: t - 17 * 86400e3 },
        { id: id(), uid: an.uid, type: 'lateearly', date: minus(4), mode: 'Về sớm', minutes: 60, reason: 'Đón con ốm', status: 'rejected', comment: 'Đã quá hạn gửi đơn, lần sau báo trước.', approverUid: admin.uid, decidedBy: admin.uid, decidedAt: t - 3 * 86400e3, created: t - 4 * 86400e3 }
      );
      notis.push(
        { id: id(), uid: an.uid, ts: t - 3 * 86400e3, text: 'Đơn đi muộn về sớm ngày ' + C.keyToDmy(minus(4)) + ' bị từ chối: Đã quá hạn gửi đơn, lần sau báo trước.', read: false },
        { id: id(), uid: an.uid, ts: t - 16 * 86400e3, text: 'Đơn công tác ngày ' + C.keyToDmy(minus(15)) + ' đã được Trần Thị Hương phê duyệt.', read: true },
        { id: id(), uid: admin.uid, ts: t - 40 * 60e3, text: 'Nguyễn Văn An gửi đơn nghỉ phép ngày ' + C.keyToDmy(plus(6)) + '.', read: false }
      );
      s.companies.DEMO = {
        id: 'DEMO', name: 'Công ty TNHH ChấmCông Demo', code: 'DEMO', ownerUid: admin.uid, settings: { ...DEFAULT_SETTINGS }, createdAt: start,
        users, locations: { [locHN.id]: locHN, [locHCM.id]: locHCM }, shifts: { [shHC.id]: shHC, [shS.id]: shS },
        logs: Object.fromEntries(logs.map(l => [l.id, l])), requests: Object.fromEntries(reqs.map(r => [r.id, r])), attachments: {}, notis: Object.fromEntries(notis.map(n => [n.id, n]))
      };
    }
    const session = () => {
      const s = load();
      if (!s.session) return null;
      const c = s.companies[s.session.cid], u = c && c.users[s.session.uid];
      if (!u || !u.active) { s.session = null; persist(); return null; }
      return { cid: c.id, uid: u.uid, user: pub(clone(u)), company: companyPub(c) };
    };
    const companyPub = c => ({ id: c.id, name: c.name, code: c.code, ownerUid: c.ownerUid, settings: clone(c.settings) });
    const notify = (c, uid, text) => { const n = { id: C.uid(), uid, ts: Date.now(), text, read: false }; c.notis[n.id] = n; };

    // Mỗi thao tác đọc lại dữ liệu mới nhất, vì trang quản trị và app có thể mở ở hai tab cùng lúc.
    const fresh = api => { Object.keys(api).forEach(k => { const fn = api[k]; if (typeof fn === 'function') api[k] = (...a) => { store = null; return fn(...a); }; }); return api; };
    return fresh({
      mode: 'demo',
      async ready() { return session(); },
      async signIn(code, account, password) {
        code = normCode(code); account = normAccount(account);
        const s = load(), c = s.companies[code];
        const u = c && Object.values(c.users).find(x => x.account === account);
        if (!c) fail('Không tìm thấy mã công ty ' + code);
        if (!u || u.password !== password) fail('Sai tài khoản hoặc mật khẩu');
        if (!u.active) fail('Tài khoản đã bị khoá. Liên hệ quản trị.');
        s.session = { cid: code, uid: u.uid }; persist(); lsSet(CID_KEY, code);
        return delay(session());
      },
      async signOut() { load().session = null; persist(); },
      async createCompany({ name, code, adminName, account, password }) {
        code = normCode(code); account = normAccount(account);
        const s = load();
        if (!code) fail('Mã công ty chỉ gồm chữ, số và dấu gạch ngang');
        if (s.companies[code]) fail('Mã công ty ' + code + ' đã được dùng');
        if (password.length < 6) fail('Mật khẩu cần ít nhất 6 ký tự');
        const u = { uid: C.uid(), account, password, name: adminName, title: 'Quản trị', dept: '', role: 'admin', code: '', active: true, shiftId: '', locationIds: [], leaveTotal: 12, createdAt: Date.now() };
        const sh = { ...C.DEFAULT_SHIFT, id: C.uid() };
        u.shiftId = sh.id;
        s.companies[code] = { id: code, name, code, ownerUid: u.uid, settings: { ...DEFAULT_SETTINGS }, createdAt: Date.now(), users: { [u.uid]: u }, locations: {}, shifts: { [sh.id]: sh }, logs: {}, requests: {}, attachments: {}, notis: {} };
        s.session = { cid: code, uid: u.uid }; persist();
        return session();
      },
      async resetPassword() { return 'Chế độ dùng thử: mật khẩu của mọi tài khoản mẫu là 123456. Tài khoản bạn tự tạo: nhờ quản trị đặt lại trong mục Nhân viên.'; },
      async changePassword(oldPw, newPw) {
        const u = co().users[load().session.uid];
        if (u.password !== oldPw) fail('Mật khẩu hiện tại không đúng');
        if (newPw.length < 6) fail('Mật khẩu cần ít nhất 6 ký tự');
        if (newPw === oldPw) fail('Mật khẩu mới phải khác mật khẩu cũ');
        u.password = newPw; u.mustChangePassword = false; persist();
      },
      async getCompany() { return companyPub(co()); },
      async updateCompany(patch) { needAdmin(); const c = co(); if (patch.name) c.name = patch.name; if (patch.settings) c.settings = { ...c.settings, ...patch.settings }; persist(); return companyPub(c); },
      async listUsers() { return Object.values(co().users).map(u => pub(clone(u))).sort((a, b) => a.name.localeCompare(b.name, 'vi')); },
      async getMe() { return pub(clone(me())); },
      async listAdmins() { return Object.values(co().users).filter(u => u.role === 'admin').map(u => pub(clone(u))); },
      async createUser(d) {
        needAdmin(); const c = co(); const account = normAccount(d.account);
        if (!account) fail('Nhập tài khoản đăng nhập');
        if (Object.values(c.users).some(u => u.account === account)) fail('Tài khoản ' + account + ' đã tồn tại');
        if (String(d.password || '').length < 6) fail('Mật khẩu cần ít nhất 6 ký tự');
        const u = { uid: C.uid(), account, password: d.password, name: d.name, title: d.title || '', dept: d.dept || '', role: d.role || 'employee', code: d.code || '', active: true, shiftId: d.shiftId || '', locationIds: d.locationIds || [], leaveTotal: Number(d.leaveTotal ?? c.settings.leavePerYear), mustChangePassword: true, createdAt: Date.now() };
        c.users[u.uid] = u; persist(); return pub(clone(u));
      },
      async updateUser(uid, patch) {
        needAdmin(); const c = co(); const u = c.users[uid]; if (!u) fail('Không tìm thấy nhân viên');
        if (uid === c.ownerUid && (patch.role === 'employee' || patch.active === false)) fail('Không thể hạ quyền hoặc khoá tài khoản chủ công ty');
        const { password, account, uid: _u, ...rest } = patch;
        Object.assign(u, rest);
        if (password) { if (password.length < 6) fail('Mật khẩu cần ít nhất 6 ký tự'); u.password = password; u.mustChangePassword = true; }
        persist(); return pub(clone(u));
      },
      async listLocations() { return Object.values(co().locations).map(clone); },
      async saveLocation(l) { needAdmin(); const c = co(); const id = l.id || C.uid(); c.locations[id] = { ...l, id }; persist(); return id; },
      async deleteLocation(id) { needAdmin(); delete co().locations[id]; persist(); },
      async listShifts() { return Object.values(co().shifts).map(clone); },
      async saveShift(sh) { needAdmin(); const c = co(); const id = sh.id || C.uid(); c.shifts[id] = { ...sh, id }; persist(); return id; },
      async deleteShift(id) { needAdmin(); delete co().shifts[id]; persist(); },
      async addLog(l) {
        const c = co(), m = me();
        const forOther = l.uid && l.uid !== m.uid;
        if (forOther) needAdmin();
        const log = { ...l, id: C.uid(), uid: l.uid || m.uid, ts: forOther || l.ts ? (isAdmin() && l.ts ? l.ts : Date.now()) : Date.now() };
        log.day = C.dayKey(log.ts);
        c.logs[log.id] = log; persist(); return clone(log);
      },
      async myLogs(from, to) { const uid = me().uid; return Object.values(co().logs).filter(l => l.uid === uid && (!from || l.day >= from) && (!to || l.day <= to)).map(clone); },
      async logsRange(from, to) { needAdmin(); return Object.values(co().logs).filter(l => l.day >= from && l.day <= to).map(clone); },
      async updateLog(id, patch) { needAdmin(); Object.assign(co().logs[id], patch); persist(); },
      async myRequests() { const uid = me().uid; return Object.values(co().requests).filter(r => r.uid === uid).map(clone); },
      async allRequests() { needAdmin(); return Object.values(co().requests).map(clone); },
      async createRequest(r, attachment) {
        const c = co(), m = me();
        const req = { ...r, id: C.uid(), uid: m.uid, status: 'pending', created: Date.now(), hasAttachment: !!attachment };
        c.requests[req.id] = req;
        if (attachment) c.attachments[req.id] = { uid: m.uid, data: attachment };
        if (req.approverUid) notify(c, req.approverUid, `${m.name} gửi đơn ${C.REQ_TYPES[req.type].name.toLowerCase()}: ${C.reqSummary(req)}.`);
        persist(); return clone(req);
      },
      async decideRequest(id, status, comment) {
        needAdmin(); const c = co(), r = c.requests[id], m = me();
        if (!r) fail('Không tìm thấy đơn');
        Object.assign(r, { status, comment: comment || '', decidedBy: m.uid, decidedAt: Date.now() });
        notify(c, r.uid, `Đơn ${C.REQ_TYPES[r.type].name.toLowerCase()} (${C.reqSummary(r)}) ${status === 'approved' ? 'đã được ' + m.name + ' phê duyệt' : 'bị từ chối' + (comment ? ': ' + comment : '')}.`);
        persist(); return clone(r);
      },
      async deleteRequest(id) {
        const c = co(), r = c.requests[id], m = me();
        if (!r) return;
        if (!(isAdmin() || (r.uid === m.uid && r.status === 'pending'))) fail('Chỉ huỷ được đơn đang chờ duyệt');
        delete c.requests[id]; delete c.attachments[id]; persist();
      },
      async getAttachment(id) { const a = co().attachments[id]; return a ? a.data : null; },
      async myNotis(sinceTs) { const uid = me().uid; return Object.values(co().notis).filter(n => n.uid === uid && (!sinceTs || n.ts >= sinceTs)).map(clone); },
      async notify(uid, text) { notify(co(), uid, text); persist(); },
      async markRead(id) { const n = co().notis[id]; if (n) { n.read = true; persist(); } },
      async markAllRead() { const uid = me().uid; Object.values(co().notis).forEach(n => { if (n.uid === uid) n.read = true; }); persist(); },
      async resetDemo() { lsSet(KEY, null); store = null; load(); }
    });
  }

  // ====================================================================== FIREBASE
  function firebaseBackend(conf) {
    const app = firebase.initializeApp(conf);
    const auth = firebase.auth();
    const fs = firebase.firestore();
    if (cfg.emulator) {
      auth.useEmulator('http://127.0.0.1:9099', { disableWarnings: true });
      fs.useEmulator('127.0.0.1', 8080);
    }
    const FV = firebase.firestore.FieldValue;
    let cid = lsGet(CID_KEY), meCache = null;
    const cref = () => { if (!cid) fail('Phiên đăng nhập đã hết, hãy đăng nhập lại'); return fs.collection('companies').doc(cid); };
    const col = name => cref().collection(name);
    const ms = v => v && typeof v.toMillis === 'function' ? v.toMillis() : (typeof v === 'number' ? v : (v ? Date.now() : v));
    const norm = snap => {
      const d = { ...snap.data(), id: snap.id };
      ['ts', 'created', 'decidedAt', 'createdAt'].forEach(k => { if (k in d) d[k] = ms(d[k]); });
      return d;
    };
    const all = q => q.get().then(s => s.docs.map(norm));
    const myUid = () => { const u = auth.currentUser; if (!u) fail('Phiên đăng nhập đã hết, hãy đăng nhập lại'); return u.uid; };

    function wrap(fn) {
      return async (...args) => {
        try { return await fn(...args); }
        catch (e) {
          if (e.userMessage) throw e;
          const code = e.code || '';
          const map = {
            'auth/invalid-credential': 'Sai tài khoản hoặc mật khẩu', 'auth/wrong-password': 'Sai tài khoản hoặc mật khẩu',
            'auth/user-not-found': 'Sai tài khoản hoặc mật khẩu', 'auth/invalid-email': 'Tài khoản không hợp lệ',
            'auth/invalid-login-credentials': 'Sai tài khoản hoặc mật khẩu',
            'auth/too-many-requests': 'Đăng nhập sai quá nhiều lần. Hãy thử lại sau ít phút.',
            'auth/network-request-failed': 'Không có kết nối mạng', 'auth/weak-password': 'Mật khẩu cần ít nhất 6 ký tự',
            'auth/email-already-in-use': 'Tài khoản này đã tồn tại', 'auth/requires-recent-login': 'Hãy đăng xuất rồi đăng nhập lại trước khi đổi mật khẩu',
            'permission-denied': 'Bạn không có quyền thực hiện thao tác này', 'unavailable': 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'
          };
          console.error(e);
          fail(map[code] || 'Có lỗi xảy ra: ' + (e.message || code));
        }
      };
    }
    async function loadSession() {
      const u = auth.currentUser;
      if (!u || !cid) return null;
      const [us, cs] = await Promise.all([cref().collection('users').doc(u.uid).get(), cref().get()]);
      if (!us.exists || !cs.exists) return null;
      const user = norm(us); user.uid = u.uid;
      if (user.active === false) { await auth.signOut(); fail('Tài khoản đã bị khoá. Liên hệ quản trị.'); }
      meCache = user;
      const c = norm(cs);
      return { cid, uid: u.uid, user, company: { ...c, settings: { ...DEFAULT_SETTINGS, ...(c.settings || {}) } } };
    }
    const authReady = new Promise(res => { const off = auth.onAuthStateChanged(() => { off(); res(); }); });

    // Tạo tài khoản mới mà không làm quản trị viên bị đăng xuất.
    let secondary = null;
    const secondaryAuth = () => {
      if (!secondary) {
        secondary = firebase.initializeApp(conf, 'secondary');
        if (cfg.emulator) secondary.auth().useEmulator('http://127.0.0.1:9099', { disableWarnings: true });
      }
      return secondary.auth();
    };
    const notifyDoc = (uid, text) => col('notis').add({ uid, text, read: false, ts: FV.serverTimestamp() });
    const strip = o => { const r = {}; Object.keys(o).forEach(k => { if (o[k] !== undefined) r[k] = o[k]; }); return r; };

    return {
      mode: 'firebase',
      ready: wrap(async () => { await authReady; return loadSession().catch(() => null); }),
      signIn: wrap(async (code, account, password) => {
        code = normCode(code); account = normAccount(account);
        if (!code) fail('Nhập mã công ty');
        await auth.signInWithEmailAndPassword(toEmail(code, account), password);
        cid = code; lsSet(CID_KEY, code);
        const s = await loadSession().catch(e => { if (e.userMessage) throw e; return null; });
        if (!s) { await auth.signOut(); fail('Tài khoản không thuộc công ty ' + code); }
        return s;
      }),
      signOut: wrap(async () => { meCache = null; await auth.signOut(); }),
      createCompany: wrap(async ({ name, code, adminName, account, password }) => {
        code = normCode(code); account = normAccount(account);
        if (!code) fail('Mã công ty chỉ gồm chữ, số và dấu gạch ngang');
        const cred = await auth.createUserWithEmailAndPassword(toEmail(code, account), password);
        const uid = cred.user.uid;
        cid = code; lsSet(CID_KEY, code);
        try {
          await cref().set({ name, code, ownerUid: uid, settings: { ...DEFAULT_SETTINGS }, createdAt: FV.serverTimestamp() });
        } catch (e) {
          await cred.user.delete().catch(() => {});
          if (e.code === 'permission-denied') fail('Mã công ty ' + code + ' đã được dùng');
          throw e;
        }
        const sh = col('shifts').doc();
        await col('users').doc(uid).set({ account, name: adminName, title: 'Quản trị', dept: '', role: 'admin', code: '', active: true, shiftId: sh.id, locationIds: [], leaveTotal: DEFAULT_SETTINGS.leavePerYear, createdAt: FV.serverTimestamp() });
        const { id, ...shift } = C.DEFAULT_SHIFT;
        await sh.set(shift);
        return loadSession();
      }),
      resetPassword: wrap(async (code, account) => {
        account = normAccount(account);
        if (!account.includes('@')) return 'Tài khoản này không gắn email. Hãy liên hệ bộ phận nhân sự (quản trị) để được cấp lại mật khẩu.';
        await auth.sendPasswordResetEmail(account);
        return 'Đã gửi email đặt lại mật khẩu tới ' + account + '. Kiểm tra hộp thư (cả mục Spam).';
      }),
      changePassword: wrap(async (oldPw, newPw) => {
        const u = auth.currentUser;
        await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, oldPw)).catch(e => {
          if (/credential|password/.test(e.code || '')) fail('Mật khẩu hiện tại không đúng');
          throw e;
        });
        if (newPw === oldPw) fail('Mật khẩu mới phải khác mật khẩu cũ');
        await u.updatePassword(newPw);
        if (meCache && meCache.mustChangePassword) {
          await col('users').doc(u.uid).update({ mustChangePassword: false });
          meCache.mustChangePassword = false;
        }
      }),
      getCompany: wrap(async () => { const c = norm(await cref().get()); return { ...c, settings: { ...DEFAULT_SETTINGS, ...(c.settings || {}) } }; }),
      updateCompany: wrap(async patch => {
        const upd = {};
        if (patch.name) upd.name = patch.name;
        if (patch.settings) Object.keys(patch.settings).forEach(k => { upd['settings.' + k] = patch.settings[k]; });
        await cref().update(upd);
      }),
      listUsers: wrap(async () => (await all(col('users'))).map(u => ({ ...u, uid: u.id })).sort((a, b) => a.name.localeCompare(b.name, 'vi'))),
      getMe: wrap(async () => { const d = norm(await col('users').doc(myUid()).get()); d.uid = d.id; meCache = d; return d; }),
      listAdmins: wrap(async () => (await all(col('users').where('role', '==', 'admin'))).map(u => ({ ...u, uid: u.id }))),
      createUser: wrap(async d => {
        const account = normAccount(d.account);
        if (!account) fail('Nhập tài khoản đăng nhập');
        const a2 = secondaryAuth();
        const cred = await a2.createUserWithEmailAndPassword(toEmail(cid, account), d.password);
        const uid = cred.user.uid;
        await a2.signOut();
        const doc = strip({ account, name: d.name, title: d.title || '', dept: d.dept || '', role: d.role || 'employee', code: d.code || '', active: true, shiftId: d.shiftId || '', locationIds: d.locationIds || [], leaveTotal: Number(d.leaveTotal ?? DEFAULT_SETTINGS.leavePerYear), mustChangePassword: true, createdAt: FV.serverTimestamp() });
        await col('users').doc(uid).set(doc);
        return { ...doc, uid, createdAt: Date.now() };
      }),
      updateUser: wrap(async (uid, patch) => {
        const { password, account, uid: _u, id, createdAt, ...rest } = patch;
        if (password) fail('Firebase không cho đổi mật khẩu người khác từ trình duyệt. Hãy dùng email đặt lại mật khẩu, hoặc xoá và tạo lại tài khoản trong Firebase Console.');
        await col('users').doc(uid).update(strip(rest));
      }),
      listLocations: wrap(() => all(col('locations'))),
      saveLocation: wrap(async l => { const { id, ...rest } = l; const ref = id ? col('locations').doc(id) : col('locations').doc(); await ref.set(strip(rest)); return ref.id; }),
      deleteLocation: wrap(id => col('locations').doc(id).delete()),
      listShifts: wrap(() => all(col('shifts'))),
      saveShift: wrap(async sh => { const { id, ...rest } = sh; const ref = id ? col('shifts').doc(id) : col('shifts').doc(); await ref.set(strip(rest)); return ref.id; }),
      deleteShift: wrap(id => col('shifts').doc(id).delete()),
      addLog: wrap(async l => {
        const uid = l.uid || myUid();
        const own = uid === myUid() && !l.ts;
        const ts = own ? Date.now() : l.ts;
        const doc = strip({ ...l, uid, day: C.dayKey(ts), ts: own ? FV.serverTimestamp() : firebase.firestore.Timestamp.fromMillis(ts) });
        delete doc.id;
        const ref = await col('logs').add(doc);
        return { ...doc, id: ref.id, ts };
      }),
      // Chỉ tải khoảng ngày cần xem. Cần chỉ mục (uid, day) trong firestore.indexes.json;
      // khi chưa tạo chỉ mục thì tải hết rồi lọc tại máy để app vẫn chạy.
      myLogs: wrap(async (from, to) => {
        const base = col('logs').where('uid', '==', myUid());
        let q = base;
        if (from) q = q.where('day', '>=', from);
        if (to) q = q.where('day', '<=', to);
        try { return await all(q); }
        catch (e) {
          if (e.code !== 'failed-precondition') throw e;
          console.warn('Thiếu chỉ mục Firestore cho logs (uid, day). Tạo theo link:', e.message);
          return (await all(base)).filter(l => (!from || l.day >= from) && (!to || l.day <= to));
        }
      }),
      logsRange: wrap((from, to) => all(col('logs').where('day', '>=', from).where('day', '<=', to))),
      updateLog: wrap((id, patch) => col('logs').doc(id).update(strip(patch))),
      myRequests: wrap(() => all(col('requests').where('uid', '==', myUid()))),
      allRequests: wrap(() => all(col('requests'))),
      createRequest: wrap(async (r, attachment) => {
        const uid = myUid();
        const ref = col('requests').doc();
        const doc = strip({ ...r, uid, status: 'pending', hasAttachment: !!attachment, created: FV.serverTimestamp() });
        delete doc.id;
        await ref.set(doc);
        if (attachment) await col('attachments').doc(ref.id).set({ uid, data: attachment });
        if (r.approverUid) await notifyDoc(r.approverUid, `${meCache ? meCache.name : 'Nhân viên'} gửi đơn ${C.REQ_TYPES[r.type].name.toLowerCase()}: ${C.reqSummary(r)}.`).catch(() => {});
        return { ...doc, id: ref.id, created: Date.now() };
      }),
      decideRequest: wrap(async (id, status, comment) => {
        const ref = col('requests').doc(id);
        await ref.update({ status, comment: comment || '', decidedBy: myUid(), decidedAt: FV.serverTimestamp() });
        const r = norm(await ref.get());
        await notifyDoc(r.uid, `Đơn ${C.REQ_TYPES[r.type].name.toLowerCase()} (${C.reqSummary(r)}) ${status === 'approved' ? 'đã được ' + (meCache ? meCache.name : 'quản trị') + ' phê duyệt' : 'bị từ chối' + (comment ? ': ' + comment : '')}.`);
        return r;
      }),
      deleteRequest: wrap(async id => {
        const r = await col('requests').doc(id).get();
        if (r.exists && r.data().hasAttachment) await col('attachments').doc(id).delete().catch(() => {});
        await col('requests').doc(id).delete();
      }),
      getAttachment: wrap(async id => { const s = await col('attachments').doc(id).get(); return s.exists ? s.data().data : null; }),
      myNotis: wrap(async sinceTs => {
        const base = col('notis').where('uid', '==', myUid());
        if (!sinceTs) return all(base);
        try { return await all(base.where('ts', '>=', firebase.firestore.Timestamp.fromMillis(sinceTs))); }
        catch (e) {
          if (e.code !== 'failed-precondition') throw e;
          console.warn('Thiếu chỉ mục Firestore cho notis (uid, ts). Tạo theo link:', e.message);
          return (await all(base)).filter(n => n.ts >= sinceTs);
        }
      }),
      notify: wrap((uid, text) => notifyDoc(uid, text)),
      markRead: wrap(id => col('notis').doc(id).update({ read: true })),
      markAllRead: wrap(async () => {
        const s = await col('notis').where('uid', '==', myUid()).where('read', '==', false).get();
        const b = fs.batch(); s.docs.forEach(d => b.update(d.ref, { read: true })); await b.commit();
      })
    };
  }

  window.CCG = cfg.firebase && window.firebase ? firebaseBackend(cfg.firebase) : demoBackend();
  window.CCG.normCode = normCode;
})();
