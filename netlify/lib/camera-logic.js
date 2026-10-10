// netlify/lib/camera-logic.js
// (Bổ sung 09/10 — yêu cầu Chủ tịch HĐQT) Logic xử lý 1 lượt camera ANPR đọc
// được biển số — tách riêng khỏi camera-webhook.js để kiểm thử được độc lập.
//
// QUY TẮC (theo yêu cầu):
//  - Xe vào mỏ chủ yếu là xe đầu kéo: đầu xe và đuôi xe mang 2 biển số khác
//    nhau. Chỉ ghi nhận XE VÀO bằng BIỂN ĐUÔI — tức đúng các lượt camera báo
//    chiều di chuyển (Driving Direction / <direction>) là "reverse".
//  - Xe RA (chiều "forward"): camera KHÔNG ghi nhận (tắt hoàn toàn theo yêu
//    cầu 10/10) — chỉ ghi nhật ký; Bảo vệ xác nhận xe ra cổng như trước.
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
// (Bổ sung 10/10) Học cả từ các lượt Bảo vệ ghép "biển đầu ↔ biển đuôi" cho xe
// ĐÃ được ghi ra cổng bằng tay trước đó (sự kiện camera_xe_ra_da_xu_ly).
export function bangDauDuoi(events) {
  const bang = {};
  const them = (dau, duoi) => { const k = chuanHoaBienSo(dau); (bang[k] = bang[k] || new Set()).add(duoi); };
  events.forEach((e) => {
    if (e.type === 'gate_out' && e.bienSoDauXe && e.plate) them(e.bienSoDauXe, e.plate);
    if (e.type === 'camera_xe_ra_da_xu_ly' && !e.boQua && e.plateDau && e.plate) them(e.plateDau, e.plate);
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
export function xuLyLuotDoc({ events, plate, direction, dateTime, uuid = null, nowMs = Date.now() }) {
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
      cameraUuid: uuid || undefined,
      mayChuTao: true,
      createdAt: nowMs,
      time: iso,
    };
    return { ketQua: 'xe_vao', thongDiep: `Đã ghi nhận xe ${bien} VÀO cổng (biển đuôi)`, suKienMoi: [ev], iso, dungGioCamera };
  }

  // ---------------- XE RA (chiều forward) ----------------
  // (Sửa 10/10 lần 2 — yêu cầu Chủ tịch HĐQT) TẮT HOÀN TOÀN việc camera ghi
  // nhận xe ra: mọi lượt chiều forward chỉ ghi vào nhật ký camera, KHÔNG tạo
  // sự kiện ra cổng. Toàn bộ xe ra do Bảo vệ xác nhận ở danh sách "Xe ra cổng".
  return { ketQua: 'bo_qua', thongDiep: `Camera thấy xe ${bien} chiều ra (forward) — camera không ghi xe ra, Bảo vệ xác nhận ra cổng`, suKienMoi: [], iso, dungGioCamera };
}

// ---------------------------------------------------------------------------
// (Bổ sung 10/10) Ghi "nguyên tử" lên Netlify Blobs: đọc kèm mã phiên bản
// (etag) -> tính giá trị mới -> chỉ ghi nếu từ lúc đọc chưa ai ghi đè; nếu đã
// có nơi khác ghi (camera gửi 2 lượt cùng lúc, trình duyệt Bảo vệ đang lưu...)
// thì đọc lại và làm lại, KHÔNG ghi đè làm mất dữ liệu của nhau.
// fn(giaTriHienTai) -> { giaTri, ketQua }; giaTri === undefined nghĩa là không cần ghi.
// ---------------------------------------------------------------------------
export async function capNhatNguyenTu(store, key, fn, soLanThu = 10) {
  for (let lan = 0; lan < soLanThu; lan++) {
    const r = await store.getWithMetadata(key, { type: 'json' });
    const hienTai = r ? r.data : null;
    const { giaTri, ketQua } = fn(hienTai);
    if (giaTri === undefined) return ketQua;
    const w = await store.setJSON(key, giaTri, r && r.etag ? { onlyIfMatch: r.etag } : { onlyIfNew: true });
    if (!w || w.modified !== false) return ketQua;
    await new Promise((ok) => setTimeout(ok, 40 + Math.random() * 120 * (lan + 1)));
  }
  throw new Error(`Không ghi được "${key}" sau ${soLanThu} lần (quá nhiều nơi ghi cùng lúc)`);
}
