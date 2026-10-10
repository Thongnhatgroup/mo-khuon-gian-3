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
import { docThongTinAnpr, xuLyLuotDoc, capNhatNguyenTu } from '../lib/camera-logic.js';

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
        ipAddress: x.ipAddress || x.ip || null,
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

  const luot = (goi.luot || []).filter((l) => !(l.eventType && !/anpr|vehicle|traffic/i.test(l.eventType))); // bỏ nhịp tim / sự kiện khác
  const nhanLucIso = new Date(nowMs).toISOString();

  // (Bổ sung 10/10) Lưu BẢN GỐC từng lượt đọc vào 1 khoá riêng (không bao giờ
  // bị ghi đè) — dùng để đối soát khi nghi ngờ mất dữ liệu.
  const ngayVN = new Date(nowMs + 7 * 3600 * 1000).toISOString().slice(0, 10);
  await Promise.all(luot.map((l, i) => store.setJSON(`camera_doc/${ngayVN}/${nowMs}-${i}-${Math.random().toString(36).slice(2, 7)}`, {
    nhanLuc: nhanLucIso, dang: goi.dang, plate: l.plate || null, direction: l.direction || null,
    dateTime: l.dateTime || null, uuid: l.uuid || null, confidence: l.confidence ?? null, ip: l.ipAddress || null,
  }).catch(() => null)));

  // Ghi sự kiện "nguyên tử": nếu 2 lượt camera (hoặc trình duyệt Bảo vệ) ghi
  // cùng lúc thì lượt sau tự đọc lại và làm lại, không ghi đè mất của nhau.
  let ketQuaTungLuot = [];
  try {
    ketQuaTungLuot = await capNhatNguyenTu(store, 'events', (hienTai) => {
      let events = Array.isArray(hienTai) ? hienTai : [];
      const uuidDaCo = new Set(events.map((e) => e.cameraUuid).filter(Boolean));
      const kq = []; let coMoi = false;
      for (const l of luot) {
        if (l.uuid && uuidDaCo.has(l.uuid)) { kq.push({ l, ketQua: 'trung', thongDiep: `Lượt đọc ${l.plate || ''} đã nhận trước đó (gửi lại) — bỏ qua`, iso: nhanLucIso }); continue; }
        const r = xuLyLuotDoc({ events, plate: l.plate, direction: l.direction, dateTime: l.dateTime, uuid: l.uuid, nowMs });
        if (r.suKienMoi.length) { events = [...events, ...r.suKienMoi]; coMoi = true; }
        if (l.uuid) uuidDaCo.add(l.uuid);
        kq.push({ l, ketQua: r.ketQua, thongDiep: r.thongDiep, iso: r.iso });
      }
      return { giaTri: coMoi ? events : undefined, ketQua: kq };
    });
  } catch (e) {
    // Trả lỗi để chương trình cầu nối / camera gửi lại lần sau
    return json(500, { error: 'Không lưu được sự kiện', message: e.message });
  }

  const dongLog = luot.length === 0
    ? [{ time: nhanLucIso, contentType: goi.dang, nhanDangDuoc: false, ketQua: 'loi', thongDiep: goi.loi || 'Không tìm thấy dữ liệu biển số trong gói tin', raw: goi.raw }]
    : ketQuaTungLuot.map(({ l, ketQua, thongDiep, iso }) => ({
      time: iso, nhanLuc: nhanLucIso, contentType: goi.dang,
      nhanDangDuoc: !!l.plate && ketQua !== 'bo_qua',
      plate: l.plate || null, direction: l.direction || null, confidence: l.confidence, uuid: l.uuid || null, ip: l.ipAddress || null,
      ketQua, thongDiep,
      raw: goi.dang === 'json' ? undefined : goi.raw?.slice(0, 300),
    }));
  try {
    await capNhatNguyenTu(store, 'camera_log', (hienTai) => ({ giaTri: [...(Array.isArray(hienTai) ? hienTai : []), ...dongLog].slice(-SO_LOG_TOI_DA) }));
  } catch { /* log là phụ */ }
  const ketQuaTraVe = ketQuaTungLuot.map(({ l, ketQua, thongDiep }) => ({ plate: l.plate, direction: l.direction, ketQua, thongDiep }));

  return json(200, { ok: true, ketQua: ketQuaTraVe });
};
