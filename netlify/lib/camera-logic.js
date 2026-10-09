// netlify/lib/camera-logic.js
// (Bổ sung 09/10 — yêu cầu Chủ tịch HĐQT) Logic xử lý 1 lượt camera ANPR đọc
// được biển số — tách riêng khỏi camera-webhook.js để kiểm thử được độc lập.
//
// QUY TẮC (theo yêu cầu):
//  - Xe vào mỏ chủ yếu là xe đầu kéo: đầu xe và đuôi xe mang 2 biển số khác
//    nhau. Chỉ ghi nhận XE VÀO bằng BIỂN ĐUÔI — tức đúng các lượt camera báo
//    chiều di chuyển (Driving Direction / <direction>) là "reverse".
//  - Xe RA: camera báo chiều "forward" (xe tiến về phía camera, camera đọc
//    được BIỂN ĐẦU). Vì biển đầu khác biển đuôi đã ghi lúc vào, phần mềm ghép
//    theo thứ tự ưu tiên:
//      1) Biển đọc được trùng đúng 1 xe đang trong mỏ (xe thường, đầu = đuôi)
//         -> tự ghi nhận ra cổng.
//      2) Biển đầu đã từng được Bảo vệ ghép với biển đuôi ở các lần trước
//         (phần mềm tự "học") và đúng 1 biển đuôi đó đang trong mỏ -> tự ghi
//         nhận ra cổng.
//      3) Còn lại -> đưa vào danh sách "Camera ghi nhận xe ra — chờ ghép biển
//         đuôi" trên màn Bảo vệ; Bảo vệ chọn 1 lần, các lần sau tự động.
//  - Chiều "unknown"/không rõ -> chỉ ghi log, không ghi nhận.

export const CUA_SO_CHONG_TRUNG_MS = 10 * 60 * 1000; // cùng biển + cùng chiều trong 10 phút = 1 lượt
export const THOI_GIAN_TOI_THIEU_TRONG_MO_MS = 3 * 60 * 1000; // vào chưa đến 3 phút mà "ra" -> nghi đọc nhầm, chờ Bảo vệ xác nhận

export function chuanHoaBienSo(p) {
  return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function bienSoHopLe(p) {
  const s = chuanHoaBienSo(p);
  if (!s || s.length < 4) return false;
  if (/^(NOPLATE|UNKNOWN|NONE|NULL)$/.test(s)) return false;
  return true;
}

// Lấy giá trị 1 thẻ XML (bỏ qua chú thích <!-- --> nếu có, bỏ namespace).
function layTheXml(xml, ten) {
  const re = new RegExp(`<(?:[A-Za-z0-9_]+:)?${ten}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[A-Za-z0-9_]+:)?${ten}>`, 'i');
  const m = re.exec(xml);
  if (!m) return null;
  return m[1].replace(/<!--[\s\S]*?-->/g, '').trim();
}

// Đọc thông tin ANPR từ nội dung XML (EventNotificationAlert) hoặc JSON.
export function docThongTinAnpr(noiDung) {
  const s = String(noiDung || '');
  if (!s.trim()) return null;
  const t = s.trim();
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t);
      const a = j.ANPR || j.anpr || j.EventNotificationAlert?.ANPR || j;
      return {
        eventType: j.eventType || j.EventNotificationAlert?.eventType || 'ANPR',
        plate: a.licensePlate || a.plate || j.plate || null,
        direction: (a.direction || j.direction || '').toString().toLowerCase() || null,
        dateTime: j.dateTime || a.dateTime || null,
        uuid: j.UUID || j.uuid || a.UUID || null,
        confidence: a.confidenceLevel != null ? Number(a.confidenceLevel) : null,
        line: a.line != null ? String(a.line) : null,
        ipAddress: j.ipAddress || null,
      };
    } catch { return null; }
  }
  const anpr = layTheXml(t, 'ANPR') || t;
  return {
    eventType: layTheXml(t, 'eventType') || null,
    plate: layTheXml(anpr, 'licensePlate'),
    direction: (layTheXml(anpr, 'direction') || '').toLowerCase() || null,
    dateTime: layTheXml(t, 'dateTime'),
    uuid: layTheXml(t, 'UUID'),
    confidence: layTheXml(anpr, 'confidenceLevel') != null ? Number(layTheXml(anpr, 'confidenceLevel')) : null,
    line: layTheXml(anpr, 'line'),
    ipAddress: layTheXml(t, 'ipAddress'),
  };
}

// Thời điểm ghi nhận: ưu tiên giờ camera (đúng lúc xe qua, kể cả khi gửi bù
// sau mất mạng) nếu hợp lý; giờ camera lệch bất thường -> dùng giờ máy chủ.
export function chonThoiDiem(dateTimeCamera, nowMs) {
  if (dateTimeCamera) {
    const ms = Date.parse(dateTimeCamera);
    if (!Number.isNaN(ms) && ms <= nowMs + 5 * 60 * 1000 && ms >= nowMs - 48 * 60 * 60 * 1000) {
      return { iso: new Date(ms).toISOString(), dungGioCamera: true };
    }
  }
  return { iso: new Date(nowMs).toISOString(), dungGioCamera: false };
}

// Giống apDungSuaBienSo() trong src/App.jsx — áp các lần Kỹ thuật sửa biển số.
function apDungSuaBienSo(events) {
  const sua = {};
  events.forEach((e) => { if (e.type === 'sua_bien_so' && e.gateInId) sua[e.gateInId] = e; });
  if (!Object.keys(sua).length) return events;
  return events.map((e) => (e.type === 'gate_in' && sua[e.id] ? { ...e, plate: sua[e.id].plateMoi } : e));
}

// Giống ghepVaoRaTheoXe() trong src/App.jsx — danh sách lượt vào chưa có lượt ra.
export function xeDangTrongMo(rawEvents) {
  const events = apDungSuaBienSo(rawEvents);
  const cmp = (a, b) => (a.time || '').localeCompare(b.time || '');
  const ins = events.filter((e) => e.type === 'gate_in' && e.plate && e.time).sort(cmp);
  const outs = events.filter((e) => e.type === 'gate_out' && e.plate).sort(cmp);
  const theoBien = {};
  outs.forEach((o) => { (theoBien[o.plate] = theoBien[o.plate] || []).push(o); });
  const daDung = new Set();
  const conTrong = [];
  ins.forEach((g) => {
    const m = (theoBien[g.plate] || []).find((o) => o.time > g.time && !daDung.has(o.id));
    if (m) daDung.add(m.id); else conTrong.push(g);
  });
  return conTrong;
}

// Bảng "biển đầu -> các biển đuôi" đã học được từ các lần ra cổng trước.
export function bangDauDuoi(events) {
  const bang = {};
  events.forEach((e) => {
    if (e.type === 'gate_out' && e.bienSoDauXe && e.plate) {
      const k = chuanHoaBienSo(e.bienSoDauXe);
      (bang[k] = bang[k] || new Set()).add(e.plate);
    }
  });
  return bang;
}

function genId(prefix, nowMs) {
  return `${prefix}-${nowMs}-${Math.random().toString(36).slice(2, 8)}`;
}

function phieuXucSauLuotVao(events, plate, tuThoiDiem) {
  return events
    .filter((e) => e.type === 'ticket_print' && e.plate === plate && e.time > tuThoiDiem)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''))[0] || null;
}

export function taoSuKienXeRa({ events, gateIn, bienDau, iso, nowMs, cachGhep }) {
  const ve = phieuXucSauLuotVao(events, gateIn.plate, gateIn.time);
  return {
    id: genId('GO', nowMs),
    type: 'gate_out',
    plate: gateIn.plate,
    gateInId: gateIn.id,
    bienSoDauXe: bienDau,
    source: 'camera_hikcentral',
    cachGhep, // 'trung_bien' | 'da_hoc' | 'bao_ve_xac_nhan'
    coHang: !!ve,
    ...(ve ? { ticketId: ve.id, ticketNo: ve.ticketNo } : { ghiChu: 'Camera tự ghi nhận ra cổng — chưa có phiếu xúc hàng' }),
    mayChuTao: true,
    createdAt: nowMs,
    time: iso,
  };
}

/**
 * Xử lý 1 lượt đọc biển số.
 * @returns {{ ketQua: string, thongDiep: string, suKienMoi: object[] }}
 */
export function xuLyLuotDoc({ events, plate, direction, dateTime, nowMs = Date.now() }) {
  const huong = String(direction || '').toLowerCase();
  const bien = String(plate || '').trim().toUpperCase();
  const { iso, dungGioCamera } = chonThoiDiem(dateTime, nowMs);
  const tMs = Date.parse(iso);
  const nb = chuanHoaBienSo(bien);

  if (!bienSoHopLe(bien)) {
    return { ketQua: 'bo_qua', thongDiep: 'Camera không đọc được biển số — chỉ ghi log', suKienMoi: [], iso, dungGioCamera };
  }
  if (huong !== 'reverse' && huong !== 'forward') {
    return { ketQua: 'bo_qua', thongDiep: `Chiều di chuyển "${direction || 'không rõ'}" — bỏ qua (chỉ nhận reverse = xe vào, forward = xe ra)`, suKienMoi: [], iso, dungGioCamera };
  }

  const ganDay = (e) => Math.abs(Date.parse(e.time || 0) - tMs) < CUA_SO_CHONG_TRUNG_MS;

  // ---------------- XE VÀO (biển đuôi, chiều reverse) ----------------
  if (huong === 'reverse') {
    const trung = events.some((e) => e.type === 'gate_in' && chuanHoaBienSo(e.plate) === nb && ganDay(e));
    if (trung) return { ketQua: 'trung', thongDiep: `Xe ${bien} đã được ghi nhận vào trong 10 phút gần đây — bỏ qua lượt đọc trùng`, suKienMoi: [], iso, dungGioCamera };
    const ev = {
      id: genId('GI', nowMs),
      type: 'gate_in',
      plate: bien,
      source: 'camera_hikcentral',
      loaiXe: '25m3',
      photo: null,
      huongCamera: 'reverse',
      mayChuTao: true,
      createdAt: nowMs,
      time: iso,
    };
    return { ketQua: 'xe_vao', thongDiep: `Đã ghi nhận xe ${bien} VÀO cổng (biển đuôi)`, suKienMoi: [ev], iso, dungGioCamera };
  }

  // ---------------- XE RA (biển đầu, chiều forward) ----------------
  const daRaGanDay = events.some((e) => e.type === 'gate_out' && (chuanHoaBienSo(e.bienSoDauXe) === nb || chuanHoaBienSo(e.plate) === nb) && ganDay(e));
  const daChoGanDay = events.some((e) => e.type === 'camera_xe_ra_cho_ghep' && chuanHoaBienSo(e.plateDau) === nb && ganDay(e));
  if (daRaGanDay || daChoGanDay) {
    return { ketQua: 'trung', thongDiep: `Biển ${bien} vừa được ghi nhận ra trong 10 phút gần đây — bỏ qua lượt đọc trùng`, suKienMoi: [], iso, dungGioCamera };
  }

  const trongMo = xeDangTrongMo(events).filter((g) => g.time <= iso);
  const duLau = (g) => tMs - Date.parse(g.time) >= THOI_GIAN_TOI_THIEU_TRONG_MO_MS;

  // 1) Trùng đúng biển (xe thường, biển đầu = biển đuôi)
  const trungBien = trongMo.filter((g) => chuanHoaBienSo(g.plate) === nb);
  // 2) Đã học: biển đầu -> biển đuôi
  const duoiDaHoc = bangDauDuoi(events)[nb];
  const theoHoc = duoiDaHoc ? trongMo.filter((g) => [...duoiDaHoc].some((p) => chuanHoaBienSo(p) === chuanHoaBienSo(g.plate))) : [];

  let ungVien = null; let cachGhep = null;
  if (trungBien.length) { ungVien = trungBien; cachGhep = 'trung_bien'; } else if (theoHoc.length) { ungVien = theoHoc; cachGhep = 'da_hoc'; }

  if (ungVien) {
    // Nhiều lượt vào cùng biển còn mở -> ghép với lượt vào SỚM nhất (đúng thứ tự)
    const bienDuoiKhacNhau = new Set(ungVien.map((g) => chuanHoaBienSo(g.plate)));
    const gateIn = ungVien[0];
    if (bienDuoiKhacNhau.size === 1 && duLau(gateIn)) {
      const ev = taoSuKienXeRa({ events, gateIn, bienDau: bien, iso, nowMs, cachGhep });
      const cach = cachGhep === 'trung_bien' ? 'trùng biển' : `biển đầu ${bien} đã học`;
      return { ketQua: 'xe_ra', thongDiep: `Đã ghi nhận xe ${gateIn.plate} RA cổng (${cach})${ev.coHang ? ` — phiếu ${ev.ticketNo || ''}` : ' — chưa có phiếu xúc'}`, suKienMoi: [ev], iso, dungGioCamera };
    }
  }

  const lyDo = ungVien
    ? (new Set(ungVien.map((g) => chuanHoaBienSo(g.plate))).size > 1 ? 'biển đầu này từng kéo nhiều rơ-moóc đang cùng trong mỏ' : 'xe vào chưa đến 3 phút')
    : 'chưa biết biển đầu này thuộc biển đuôi nào';
  const cho = {
    id: genId('CXR', nowMs),
    type: 'camera_xe_ra_cho_ghep',
    plateDau: bien,
    goiY: ungVien ? ungVien.map((g) => g.plate) : [],
    lyDo,
    mayChuTao: true,
    createdAt: nowMs,
    time: iso,
  };
  return { ketQua: 'cho_ghep', thongDiep: `Camera thấy xe ${bien} RA cổng — ${lyDo}, chờ Bảo vệ ghép biển đuôi`, suKienMoi: [cho], iso, dungGioCamera };
}
