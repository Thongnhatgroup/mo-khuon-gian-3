// netlify/functions/camera-webhook.js
// -----------------------------------------------------------------------------
// Nhận dữ liệu do CHÍNH HikCentral Professional TỰ GỬI LÊN (nếu bản đang dùng
// có tính năng "Event Notification" / "Linkage" → "Notify Surveillance Center"
// hoặc "HTTP(S) Post" trong mục cấu hình sự kiện) — đây là cách KHÔNG CẦN CÀI
// BẤT KỲ CHƯƠNG TRÌNH NÀO trên máy tính nào cả, KHÔNG CẦN Node.js, KHÔNG CẦN
// mở Command Prompt: chỉ cần cấu hình 1 lần NGAY TRONG phần mềm HikCentral
// (mục Cấu hình hệ thống → Sự kiện/Event → Liên kết/Linkage) trỏ tới đúng địa
// chỉ của hàm này, thường cần người quản trị camera hoặc kỹ thuật Hikvision
// đã lắp đặt hệ thống hỗ trợ bật (tương tự việc bật "Open Platform").
//
// VÌ SAO CHƯA CHẮC DÙNG ĐƯỢC: không phải bản/gói HikCentral Professional nào
// cũng có tính năng "gửi sự kiện ra URL ngoài" cho riêng sự kiện nhận diện
// biển số (ANPR) — cần tự kiểm tra hoặc hỏi đơn vị lắp đặt. Định dạng dữ liệu
// mỗi hãng/mỗi phiên bản gửi lên cũng khác nhau (JSON, XML, hoặc dạng
// multipart), nên hàm này CỐ GẮNG đọc nhiều kiểu khác nhau, đồng thời LUÔN
// LƯU LẠI NGUYÊN VĂN dữ liệu nhận được (mục "Xem log camera gần đây" trong
// phần mềm) để biết chính xác cần chỉnh lại chỗ nào cho khớp.
// -----------------------------------------------------------------------------
import { getStore } from '@netlify/blobs';

function json(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
    },
  });
}

// Chuẩn hoá + kiểm tra 1 chuỗi có đúng dáng biển số xe Việt Nam hay không.
function laBienSoHopLe(chuoi) {
  const sach = (chuoi || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[0-9]{1,3}[A-Z]{1,2}[0-9]{3,6}$/.test(sach) ? sach : null;
}

// Dò tìm biển số trong 1 object JSON (đệ quy qua mọi field), ưu tiên các tên
// field hay dùng trong tài liệu ANPR của Hikvision/HikCentral trước.
const TEN_FIELD_UU_TIEN = ['plateNo', 'plateNumber', 'PlateNumber', 'licensePlate', 'LicensePlate', 'plate'];
function timBienSoTrongJson(obj, depth = 0) {
  if (!obj || depth > 6) return null;
  if (typeof obj === 'string') return laBienSoHopLe(obj);
  if (typeof obj !== 'object') return null;
  for (const ten of TEN_FIELD_UU_TIEN) {
    if (obj[ten]) {
      const bs = laBienSoHopLe(obj[ten]);
      if (bs) return bs;
    }
  }
  for (const key of Object.keys(obj)) {
    const bs = timBienSoTrongJson(obj[key], depth + 1);
    if (bs) return bs;
  }
  return null;
}

// Dò tìm biển số trong text thường/XML — thử bắt trong thẻ <plateNo>...</...>
// trước, nếu không có thì quét mọi "từ" trong văn bản xem có khớp dáng biển
// số xe hay không (chấp nhận rủi ro bắt nhầm thấp vì dáng biển số khá đặc
// trưng: số-chữ-số).
function timBienSoTrongText(text) {
  const khopThe = text.match(/<(?:plateNo|plateNumber|PlateNumber)>([^<]+)<\//i);
  if (khopThe) {
    const bs = laBienSoHopLe(khopThe[1]);
    if (bs) return bs;
  }
  for (const tu of text.split(/[^A-Za-z0-9]+/)) {
    const bs = laBienSoHopLe(tu);
    if (bs) return bs;
  }
  return null;
}

export default async (req) => {
  if (req.method === 'OPTIONS') return json(200, {});
  if (req.method !== 'POST') return json(405, { error: 'Chỉ hỗ trợ POST' });

  const contentType = req.headers.get('content-type') || '';
  let raw = '';
  try { raw = await req.text(); } catch { raw = ''; }

  let bienSo = null;
  if (contentType.includes('json')) {
    try { bienSo = timBienSoTrongJson(JSON.parse(raw)); } catch { /* không phải JSON hợp lệ, thử cách khác bên dưới */ }
  }
  if (!bienSo) bienSo = timBienSoTrongText(raw);

  const store = getStore('mo-khuon-gian-v6');

  // Luôn ghi lại log để chẩn đoán (mục "Xem log camera gần đây" trong phần
  // mềm) — kể cả khi không đọc được biển số, để biết đúng dữ liệu camera gửi
  // lên là gì mà chỉnh lại cho khớp.
  try {
    const logCu = (await store.get('camera_log', { type: 'json' })) || [];
    const logMoi = [
      ...logCu,
      { time: new Date().toISOString(), contentType, nhanDangDuoc: !!bienSo, raw: raw.slice(0, 2000) },
    ].slice(-50); // chỉ giữ 50 log gần nhất, tránh phình dữ liệu
    await store.setJSON('camera_log', logMoi);
  } catch (e) {
    console.error('Không ghi được camera_log:', e.message);
  }

  if (!bienSo) return json(200, { nhanDuocNhungKhongThayBienSo: true });

  // Tạo 1 lượt xe vào cổng, chống trùng bằng khoá dựa trên biển số + phút
  // hiện tại (nếu HikCentral gửi lặp lại nhiều lần cho cùng 1 lượt xe trong
  // cùng khoảng vài giây, sẽ không bị nhân đôi).
  const nowIso = new Date().toISOString();
  const excelRowKey = `webhook-${bienSo}-${nowIso.slice(0, 16)}`;

  const events = (await store.get('events', { type: 'json' })) || [];
  const daCo = events.some((e) => e.type === 'gate_in' && e.excelRowKey === excelRowKey);
  if (!daCo) {
    events.push({
      id: `GI-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'gate_in',
      plate: bienSo,
      source: 'camera_hikcentral',
      loaiXe: '25m3',
      photo: null,
      excelRowKey,
      time: nowIso,
    });
    await store.setJSON('events', events);
  }

  return json(200, { ok: true, plate: bienSo, added: !daCo });
};
