// netlify/functions/camera-webhook.js
// (Viết lại 09/10 — yêu cầu Chủ tịch HĐQT) Nhận dữ liệu biển số từ camera ANPR
// Hikvision (192.168.1.199 tại cổng mỏ) và TỰ ĐỘNG ghi nhận xe VÀO / RA cổng.
//
// Bản cũ có LỖI CÚ PHÁP (khai báo biến nằm giữa object) nên hàm không chạy
// được — đây là nguyên nhân chính "phần mềm không nhận dữ liệu từ camera".
// Bản cũ cũng không phân biệt chiều di chuyển (ghi cả biển đầu lẫn biển đuôi
// thành xe vào) và cộng sai 7 tiếng vào giờ.
//
// Nhận 3 dạng dữ liệu:
//  1) JSON từ chương trình cầu nối camera-agent/isapi-agent.js (khuyến nghị):
//       { luotDoc: [{ plate, direction, dateTime, uuid, confidence, line }] }
//     hoặc báo trạng thái kết nối: { loai: 'trang_thai', ... }
//  2) multipart/form-data do camera tự đẩy thẳng (chế độ HTTP Listening):
//       anpr.xml + licensePlatePicture.jpg + detectionPicture.jpg
//  3) XML thô (EventNotificationAlert).
//
// Bảo mật: nếu khai báo biến môi trường CAMERA_WEBHOOK_KEY trên Netlify thì
// mọi lượt gửi phải kèm đúng khoá (header "X-Camera-Key" hoặc ?key=...).
import { getStore } from '@netlify/blobs';
import { docThongTinAnpr, xuLyLuotDoc } from '../lib/camera-logic.js';

const TEN_KHO = 'mo-khuon-gian-v6';
const SO_LOG_TOI_DA = 300;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Camera-Key',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    },
  });
}

function khoaHopLe(req) {
  const can = (process.env.CAMERA_WEBHOOK_KEY || '').trim();
  if (!can) return true;
  const url = new URL(req.url);
  const gui = (req.headers.get('x-camera-key') || url.searchParams.get('key') || '').trim();
  return gui === can;
}

// Tách các phần XML/JSON ra khỏi gói multipart (bỏ qua phần ảnh nhị phân).
export function tachMultipart(buf, contentType) {
  const m = /boundary="?([^";]+)"?/i.exec(contentType || '');
  const latin = buf.toString('latin1');
  let boundary = m ? m[1].trim() : null;
  if (!boundary) {
    const m2 = /^--([^\r\n]+)/.exec(latin);
    if (m2) boundary = m2[1].trim();
  }
  if (!boundary) return [];
  const ketQua = [];
  for (const phan of latin.split(`--${boundary}`)) {
    const cuoiDau = phan.indexOf('\r\n\r\n');
    if (cuoiDau === -1) continue;
    const dau = phan.slice(0, cuoiDau).toLowerCase();
    if (/image\/|\.jpe?g|octet-stream/.test(dau)) continue;
    const than = Buffer.from(phan.slice(cuoiDau + 4).replace(/\r\n$/, ''), 'latin1').toString('utf8');
    if (/<EventNotificationAlert|<ANPR|licensePlate/i.test(than)) ketQua.push(than);
  }
  return ketQua;
}

async function docLuotDoc(req) {
  const ct = (req.headers.get('content-type') || '').toLowerCase();
  const buf = Buffer.from(await req.arrayBuffer());
  if (ct.includes('multipart/')) {
    return { dang: 'multipart', raw: buf.toString('latin1').slice(0, 600), luot: tachMultipart(buf, ct).map(docThongTinAnpr).filter(Boolean) };
  }
  const text = buf.toString('utf8');
  if (ct.includes('json') || text.trim().startsWith('{')) {
    let body = {};
    try { body = JSON.parse(text); } catch { return { dang: 'json', raw: text.slice(0, 600), loi: 'JSON không hợp lệ', luot: [] }; }
    if (body.loai === 'trang_thai') return { dang: 'trang_thai', body };
    const ds = Array.isArray(body.luotDoc) ? body.luotDoc : [body];
    return {
      dang: 'json',
      raw: text.slice(0, 600),
      luot: ds.map((x) => (x.xml ? docThongTinAnpr(x.xml) : {
        plate: x.plate || x.licensePlate || null,
        direction: (x.direction || '').toString().toLowerCase() || null,
        dateTime: x.dateTime || null,
        uuid: x.uuid || x.UUID || null,
        confidence: x.confidence != null ? Number(x.confidence) : null,
        line: x.line != null ? String(x.line) : null,
        eventType: 'ANPR',
      })).filter(Boolean),
    };
  }
  return { dang: 'xml', raw: text.slice(0, 600), luot: [docThongTinAnpr(text)].filter(Boolean) };
}

export default async (req) => {
  if (req.method === 'OPTIONS') return json(200, {});
  if (req.method === 'GET') {
    // Dùng để kiểm tra nhanh địa chỉ có hoạt động không (mở bằng trình duyệt).
    return json(200, { ok: true, thongDiep: 'Địa chỉ nhận dữ liệu camera đang hoạt động', canKhoa: !!process.env.CAMERA_WEBHOOK_KEY });
  }
  if (req.method !== 'POST') return json(405, { error: 'Chỉ hỗ trợ POST' });
  if (!khoaHopLe(req)) return json(401, { error: 'Sai khoá bảo mật camera (X-Camera-Key)' });

  const store = getStore({ name: TEN_KHO, consistency: 'strong' });
  const nowMs = Date.now();
  let goi;
  try { goi = await docLuotDoc(req); } catch (e) { return json(400, { error: 'Không đọc được dữ liệu gửi lên', message: e.message }); }

  // ---- Báo trạng thái kết nối từ chương trình cầu nối ----
  if (goi.dang === 'trang_thai') {
    const b = goi.body;
    await store.setJSON('camera_status', {
      capNhatLuc: new Date(nowMs).toISOString(),
      ketNoiCamera: !!b.ketNoiCamera,
      thongDiep: String(b.thongDiep || '').slice(0, 300),
      cameraIp: b.cameraIp || null,
      cameraModel: b.cameraModel || null,
      congIsapi: b.congIsapi || null,
      lanCuoiNhanSuKien: b.lanCuoiNhanSuKien || null,
      phienBanCauNoi: b.phienBan || null,
    });
    return json(200, { ok: true });
  }

  // Bỏ qua nếu đang trong lúc "Đặt lại dữ liệu vận hành" (giống import-plates.js).
  // Trả 503 để chương trình cầu nối giữ lại và gửi lại sau, không mất lượt xe.
  try {
    const khoa = await store.get('reset_lock', { type: 'json' });
    if (khoa && nowMs - Number(khoa) < 90000) return json(503, { error: 'Đang đặt lại dữ liệu, gửi lại sau' });
  } catch { /* không đọc được khoá -> xử lý bình thường */ }

  const [events0, log0] = await Promise.all([
    store.get('events', { type: 'json' }).catch(() => null),
    store.get('camera_log', { type: 'json' }).catch(() => null),
  ]);
  let events = Array.isArray(events0) ? events0 : [];
  const log = Array.isArray(log0) ? log0 : [];
  const uuidDaXuLy = new Set(log.map((l) => l.uuid).filter(Boolean));

  const ketQuaTraVe = [];
  let coSuKienMoi = false;
  const luot = goi.luot || [];
  if (luot.length === 0) {
    log.push({ time: new Date(nowMs).toISOString(), contentType: goi.dang, nhanDangDuoc: false, ketQua: 'loi', thongDiep: goi.loi || 'Không tìm thấy dữ liệu biển số trong gói tin', raw: goi.raw });
  }
  for (const l of luot) {
    if (l.eventType && !/anpr|vehicle|traffic/i.test(l.eventType)) continue; // nhịp tim / sự kiện khác
    if (l.uuid && uuidDaXuLy.has(l.uuid)) { ketQuaTraVe.push({ plate: l.plate, ketQua: 'trung_uuid' }); continue; }
    const kq = xuLyLuotDoc({ events, plate: l.plate, direction: l.direction, dateTime: l.dateTime, nowMs });
    if (kq.suKienMoi.length) { events = [...events, ...kq.suKienMoi]; coSuKienMoi = true; }
    if (l.uuid) uuidDaXuLy.add(l.uuid);
    log.push({
      time: kq.iso,
      nhanLuc: new Date(nowMs).toISOString(),
      contentType: goi.dang,
      nhanDangDuoc: !!l.plate && kq.ketQua !== 'bo_qua',
      plate: l.plate || null,
      direction: l.direction || null,
      confidence: l.confidence,
      uuid: l.uuid || null,
      ketQua: kq.ketQua,
      thongDiep: kq.thongDiep,
      raw: goi.dang === 'json' ? undefined : goi.raw?.slice(0, 300),
    });
    ketQuaTraVe.push({ plate: l.plate, direction: l.direction, ketQua: kq.ketQua, thongDiep: kq.thongDiep });
  }

  try {
    if (coSuKienMoi) await store.setJSON('events', events);
  } catch (e) {
    // Trả lỗi để chương trình cầu nối / camera gửi lại lần sau
    return json(500, { error: 'Không lưu được sự kiện', message: e.message });
  }
  try { await store.setJSON('camera_log', log.slice(-SO_LOG_TOI_DA)); } catch { /* log là phụ */ }

  return json(200, { ok: true, ketQua: ketQuaTraVe });
};
