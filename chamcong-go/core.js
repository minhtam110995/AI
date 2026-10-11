'use strict';
/* ChấmCông Go — hàm dùng chung cho app nhân viên và trang quản trị. */
(() => {
  const pad = n => String(n).padStart(2, '0');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DOW = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const DOW_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const hm = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const dmy = d => { d = new Date(d); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
  const longDate = d => { d = new Date(d); return `${DOW[d.getDay()]}, ${dmy(d)}`; };
  const dayKey = d => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const fromKey = k => { const [y, m, d] = String(k).split('-').map(Number); return new Date(y, m - 1, d); };
  const keyToDmy = k => k ? dmy(fromKey(k)) : '';
  const mins = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
  const minsOfTs = ts => { const d = new Date(ts); return d.getHours() * 60 + d.getMinutes(); };
  const fmtDist = m => m == null ? '--' : m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
  const num = n => String(Math.round(n * 10) / 10).replace('.', ',');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  function initials(name) {
    const w = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!w.length) return '?';
    return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[w.length - 1][0]).toUpperCase();
  }
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
  function eachDay(fromK, toK, fn) {
    for (let d = fromKey(fromK); dayKey(d) <= toK; d.setDate(d.getDate() + 1)) fn(new Date(d), dayKey(d));
  }

  const KIND = {
    in: { label: 'Giờ vào', type: 'Vào ca', cta: 'Xác nhận chấm công vào ca', done: 'giờ vào ca' },
    out: { label: 'Giờ ra', type: 'Ra ca', cta: 'Xác nhận chấm công ra ca', done: 'giờ ra ca' },
    ot: { label: 'Làm thêm giờ', type: 'Làm thêm giờ', cta: 'Xác nhận chấm làm thêm giờ', done: 'giờ làm thêm' },
    duty: { label: 'Trực ca kíp', type: 'Trực ca kíp', cta: 'Xác nhận chấm trực ca kíp', done: 'ca trực' }
  };
  const REQ_TYPES = {
    leave: { icon: 'calendar-days', name: 'Nghỉ phép', hue: 28 },
    lateearly: { icon: 'clock-alert', name: 'Đi muộn về sớm', hue: 145 },
    ot: { icon: 'timer', name: 'Làm thêm giờ', hue: 250 },
    trip: { icon: 'briefcase-business', name: 'Làm việc ngoài công ty / công tác', hue: 300 },
    explain: { icon: 'file-text', name: 'Giải trình chấm công', hue: 20 },
    shift: { icon: 'repeat', name: 'Đổi ca', hue: 190 }
  };
  // Loại nghỉ chọn được trong form: phép năm, không lương. (sick/personal giữ để hiển thị đơn cũ.)
  const LEAVE_TYPES = { annual: 'Phép năm', unpaid: 'Nghỉ không lương', sick: 'Nghỉ ốm', personal: 'Việc riêng' };
  const LEAVE_FORM_TYPES = ['annual', 'unpaid'];
  /** Lý do nghỉ đột xuất hợp lệ theo quy định công ty. */
  const SUDDEN_GROUPS = {
    health: { name: 'Sức khoẻ', cases: 'Ốm đau, tai nạn đột ngột; đi khám / điều trị theo lịch hẹn của cơ sở y tế' },
    family: { name: 'Gia đình', cases: 'Người thân ốm nặng cần chăm sóc; tang lễ; việc quan trọng trong gia đình không thể báo trước' },
    force: { name: 'Bất khả kháng', cases: 'Tai nạn giao thông trên đường đi làm; phương tiện gặp sự cố nghiêm trọng; thiên tai, sự kiện khách quan' }
  };
  /** Quy định nghỉ mặc định (sửa được ở Cài đặt của trang quản trị). */
  const DEFAULT_POLICY = { maxLeavePerMonth: 2, noticeDays: 3, longLeaveDays: 2, kpiSteps: [2, 4, 6] };
  const policyOf = settings => ({ ...DEFAULT_POLICY, ...((settings || {}).policy || {}) });
  const STATUS = { pending: ['pending', 'Chờ duyệt'], approved: ['ok', 'Đã duyệt'], rejected: ['bad', 'Từ chối'] };
  const ROLES = { employee: 'Nhân viên', admin: 'Quản trị' };
  const reqBg = h => `oklch(0.95 0.04 ${h})`, reqFg = h => `oklch(0.58 0.16 ${h})`;

  const DEFAULT_SHIFT = { id: '', name: 'Hành chính', start: '08:00', end: '17:30', workdays: [1, 2, 3, 4, 5, 6], grace: 0 };
  const shiftFor = (user, shifts) => (shifts || []).find(s => s.id === user?.shiftId) || (shifts || [])[0] || DEFAULT_SHIFT;
  const locationsFor = (user, locs) => {
    const ids = user?.locationIds || [];
    const list = (locs || []).filter(l => !ids.length || ids.includes(l.id));
    return list.length ? list : (locs || []);
  };
  const isWorkday = (d, shift) => (shift.workdays || DEFAULT_SHIFT.workdays).includes(new Date(d).getDay());

  /** Số ngày của một đơn nghỉ phép / công tác (chỉ tính ngày làm việc). */
  function leaveDays(r, shift = DEFAULT_SHIFT) {
    if (!r.from) return 0;
    const to = r.to || r.from;
    if (r.part && r.part !== 'Cả ngày' && to === r.from) return isWorkday(fromKey(r.from), shift) ? 0.5 : 0;
    let n = 0;
    eachDay(r.from, to, d => { if (isWorkday(d, shift)) n++; });
    return n;
  }
  function reqSummary(r, shift) {
    const range = `${keyToDmy(r.from)}${r.to && r.to !== r.from ? ' – ' + keyToDmy(r.to) : ''}`;
    switch (r.type) {
      case 'leave': return `${LEAVE_TYPES[r.leaveType] || 'Phép năm'}${r.sudden ? ` · Đột xuất (${(SUDDEN_GROUPS[r.suddenGroup] || {}).name || 'khác'})` : ''} · ${range} · ${r.part || 'Cả ngày'} · ${num(leaveDays(r, shift))} ngày`;
      case 'lateearly': return `${keyToDmy(r.date)} · ${r.mode} ${r.minutes} phút`;
      case 'ot': return `${keyToDmy(r.date)} · ${r.start} – ${r.end}`;
      case 'trip': return `${range} · ${r.place}`;
      case 'explain': return `${keyToDmy(r.date)} · ${r.issue}${r.time ? ' · ' + r.time : ''}`;
      case 'shift': return `${keyToDmy(r.date)} · ${r.target}`;
    }
    return '';
  }
  /** Phép năm đã dùng trong năm (đơn đang chờ duyệt cũng bị trừ tạm). */
  /** Số ngày (làm việc) của đơn nghỉ rơi vào tháng y-m. */
  function leaveDaysInMonth(r, y, m, shift = DEFAULT_SHIFT) {
    if (!r.from) return 0;
    const prefix = `${y}-${pad(m + 1)}`, to = r.to || r.from;
    if (r.part && r.part !== 'Cả ngày' && to === r.from) return r.from.startsWith(prefix) && isWorkday(fromKey(r.from), shift) ? 0.5 : 0;
    let n = 0;
    eachDay(r.from, to, (d, k) => { if (k.startsWith(prefix) && isWorkday(d, shift)) n++; });
    return n;
  }
  /**
   * Tổng hợp nghỉ trong tháng theo quy định: ngày tính hạn mức / KPI (phép năm + không lương, trừ đột xuất hợp lệ),
   * ngày đột xuất, và % KPI bị trừ. statuses: các trạng thái đơn được tính (mặc định chỉ đơn đã duyệt).
   */
  function monthLeave({ reqs, y, m, shift, settings, statuses = ['approved'], extra = null }) {
    const pol = policyOf(settings);
    const out = { counted: 0, sudden: 0, annual: 0, unpaid: 0, kpi: 0, max: pol.maxLeavePerMonth };
    const list = reqs.filter(r => r.type === 'leave' && statuses.includes(r.status));
    if (extra) list.push(extra);
    list.forEach(r => {
      const d = leaveDaysInMonth(r, y, m, shift);
      if (!d) return;
      if ((r.leaveType || 'annual') === 'unpaid') out.unpaid += d; else out.annual += d;
      if (r.sudden) out.sudden += d; else out.counted += d;
    });
    out.kpi = kpiDeduction(out.counted, pol);
    return out;
  }
  /** % KPI bị trừ: mỗi ngày vượt hạn mức trừ theo bậc (VD ngày 3: 2%, ngày 4: 4%, từ ngày 5: 6%/ngày); nửa ngày tính một nửa. */
  function kpiDeduction(days, pol = DEFAULT_POLICY) {
    let total = 0, slot = pol.maxLeavePerMonth, i = 0;
    while (days > slot && i < 60) {
      const part = Math.min(1, days - slot);
      total += part * pol.kpiSteps[Math.min(i, pol.kpiSteps.length - 1)];
      slot += 1; i++;
    }
    return Math.round(total * 10) / 10;
  }
  function leaveUsed(reqs, year, shift) {
    return reqs.filter(r => r.type === 'leave' && (r.leaveType || 'annual') === 'annual' && r.status !== 'rejected' && String(r.from).startsWith(String(year)))
      .reduce((s, r) => s + leaveDays(r, shift), 0);
  }

  /** Tóm tắt một ngày của một người: giờ vào đầu tiên, giờ ra cuối cùng, muộn/sớm. */
  function daySummary(logs, key, shift) {
    const list = logs.filter(l => l.day === key && l.status !== 'rejected').sort((a, b) => a.ts - b.ts);
    const ins = list.filter(l => l.kind === 'in'), outs = list.filter(l => l.kind === 'out');
    const first = ins[0] || null, last = outs[outs.length - 1] || null;
    const lateBy = first ? Math.max(0, minsOfTs(first.ts) - mins(shift.start) - (shift.grace || 0)) : 0;
    const earlyBy = last ? Math.max(0, mins(shift.end) - minsOfTs(last.ts)) : 0;
    return { logs: list, in: first, out: last, lateBy, earlyBy, extras: list.filter(l => l.kind === 'ot' || l.kind === 'duty') };
  }
  const approvedOn = (reqs, key, types) => reqs.find(r => types.includes(r.type) && r.status === 'approved' && r.from <= key && key <= (r.to || r.from));

  /**
   * Trạng thái công của một ngày.
   * code: future | off | full | late | missing | absent | leave | half | trip | none
   * work: số công thực tế (0 / 0,5 / 1), leave: số ngày phép.
   */
  function dayStatus({ logs, reqs, key, shift, startKey, today = dayKey(new Date()) }) {
    const date = fromKey(key);
    const s = daySummary(logs, key, shift);
    const res = { code: 'none', work: 0, leave: 0, s };
    if (key > today) { res.code = 'future'; return res; }
    const leave = approvedOn(reqs, key, ['leave']);
    const trip = approvedOn(reqs, key, ['trip']);
    if (!isWorkday(date, shift)) { res.code = s.in ? 'full' : 'off'; res.work = s.in && s.out ? 1 : 0; return res; }
    if (trip) { res.code = 'trip'; res.work = 1; return res; }
    if (leave) {
      const half = leave.part && leave.part !== 'Cả ngày';
      res.leave = half ? 0.5 : 1;
      if (!half) { res.code = 'leave'; return res; }
      res.code = 'half'; res.work = s.in || s.out ? 0.5 : 0; return res;
    }
    if (s.in && s.out) { res.code = s.lateBy || s.earlyBy ? 'late' : 'full'; res.work = 1; return res; }
    if (s.in || s.out) { res.code = key === today ? (s.lateBy ? 'late' : 'full') : 'missing'; res.work = key === today ? 0 : 0.5; return res; }
    if (key < today && (!startKey || key >= startKey)) res.code = 'absent';
    return res;
  }

  function monthSummary({ logs, reqs, y, m, shift, startKey }) {
    const today = dayKey(new Date());
    const days = new Date(y, m + 1, 0).getDate();
    const out = { workdays: 0, work: 0, leave: 0, late: 0, lateMin: 0, early: 0, absent: 0, missing: 0, ot: 0 };
    for (let d = 1; d <= days; d++) {
      const date = new Date(y, m, d), key = dayKey(date);
      if (isWorkday(date, shift)) out.workdays++;
      const st = dayStatus({ logs, reqs, key, shift, startKey, today });
      out.work += st.work; out.leave += st.leave;
      if (st.s.in && st.s.lateBy) { out.late++; out.lateMin += st.s.lateBy; }
      if (st.s.out && st.s.earlyBy && key < today) out.early++;
      if (st.code === 'absent') out.absent++;
      if (st.code === 'missing') out.missing++;
    }
    const prefix = `${y}-${pad(m + 1)}`;
    reqs.filter(r => r.type === 'ot' && r.status === 'approved' && String(r.date).startsWith(prefix))
      .forEach(r => { out.ot += Math.max(0, mins(r.end) - mins(r.start)) / 60; });
    return out;
  }

  /** Thu nhỏ ảnh đính kèm thành JPEG (data URL) để lưu gọn trong cơ sở dữ liệu. */
  function compressImage(file, max = 1000, quality = 0.72) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        let q = quality, data = c.toDataURL('image/jpeg', q);
        while (data.length > 700000 && q > 0.3) { q -= 0.1; data = c.toDataURL('image/jpeg', q); }
        resolve(data);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Không đọc được ảnh')); };
      img.src = url;
    });
  }

  /**
   * IP công cộng (IPv4) của mạng thiết bị đang dùng. Máy bắt Wifi văn phòng sẽ ra Internet bằng IP của văn phòng,
   * nên so IP này với IP văn phòng đã lưu để biết nhân viên có đang dùng Wifi công ty không.
   */
  async function publicIp() {
    const tries = [
      ['https://api.ipify.org?format=json', r => r.json().then(j => j.ip)],
      ['https://ipv4.icanhazip.com', r => r.text()],
      ['https://api4.my-ip.io/v2/ip.json', r => r.json().then(j => j.ip)]
    ];
    for (const [url, read] of tries) {
      try {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
        const r = await fetch(url, { cache: 'no-store', signal: ctl.signal }); clearTimeout(t);
        if (!r.ok) continue;
        const ip = String(await read(r)).trim();
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip;
      } catch (e) { /* thử dịch vụ tiếp theo */ }
    }
    throw new Error('Không kiểm tra được mạng. Hãy kiểm tra kết nối Internet rồi thử lại.');
  }
  const ipList = s => String(s || '').split(/[\s,;]+/).map(x => x.trim()).filter(x => /^\d{1,3}(\.\d{1,3}){3}$/.test(x));

  function csvDownload(filename, rows) {
    const csv = '﻿' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  window.CCG_CORE = {
    pad, esc, DOW, DOW_SHORT, hm, dmy, longDate, dayKey, fromKey, keyToDmy, mins, minsOfTs, fmtDist, num, uid,
    initials, relTime, haversine, eachDay, KIND, REQ_TYPES, LEAVE_TYPES, LEAVE_FORM_TYPES, SUDDEN_GROUPS, DEFAULT_POLICY, policyOf,
    leaveDaysInMonth, monthLeave, kpiDeduction, STATUS, ROLES, reqBg, reqFg,
    DEFAULT_SHIFT, shiftFor, locationsFor, isWorkday, leaveDays, reqSummary, leaveUsed, daySummary, dayStatus,
    monthSummary, compressImage, csvDownload, publicIp, ipList
  };
})();
