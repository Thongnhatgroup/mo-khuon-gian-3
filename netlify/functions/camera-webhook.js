// netlify/functions/camera-webhook.js
// -----------------------------------------------------------------------------
// Nhận dữ liệu do CHÍNH camera/đầu ghi Hikvision (ANPR) TỰ GỬI LÊN khi nhận diện
// được biển số — đây là cách KHÔNG CẦN CÀI BẤT KỲ CHƯƠNG TRÌNH NÀO trên máy tính
// nào cả: chỉ cần cấu hình 1 lần NGAY TRÊN THIẾT BỊ CAMERA (mục "Notification" /
// "Event Linkage" / hoặc qua lệnh ISAPI kỹ thuật), trỏ tới đúng địa chỉ hàm này.
//
// ĐỊNH DẠNG DỮ LIỆU THẬT (đã xác nhận theo đúng tài liệu kỹ thuật chính hãng
// "ISAPI Traffic Cameras — Urban Road/ANPR Cameras" do Hikvision công bố, mục
// 9.1.4 "Baseline Flow Message Format and Example"):
//   - Camera gửi POST dạng multipart/form-data, gồm 1 phần tên "anpr.xml" chứa
//     dữ liệu XML (gốc <EventNotificationAlert>), kèm theo nhiều phần ảnh JPEG
//     khác (licensePlatePicture.jpg, detectionPicture.jpg...) — hàm này CHỈ tách
//     và đọc đúng phần "anpr.xml", không cố đọc phần ảnh nhị phân thành chữ.
//   - Trong phần XML đó, biển số xe nằm ở thẻ <ANPR><licensePlate>...</licensePlate>
//     — đây là tên trường CHÍNH THỨC theo tài liệu (không phải "plateNo" như suy
//     đoán trước đây). Hàm này ưu tiên tìm đúng thẻ này trước, sau đó mới thử các
//     tên trường khác (đề phòng một số dòng máy/phiên bản cũ dùng tên khác).
//   - Một số cấu hình/phần mềm trung gian có thể gửi JSON thay vì multipart+XML —
//     hàm này vẫn hỗ trợ đọc JSON để không bỏ sót trường hợp đó.
//
// VÌ SAO CHƯA CHẮC DÙNG ĐƯỢC NGAY: việc đăng ký địa chỉ máy chủ nhận (bước
// "PUT /ISAPI/Event/notification/httpHosts") cần thực hiện trực tiếp trên từng
// camera/đầu ghi (qua địa chỉ IP nội bộ của thiết bị, hoặc qua lệnh ISAPI kỹ
// thuật) — không chắc phiên bản/model camera đang dùng có hỗ trợ, và cần người
// có quyền quản trị thiết bị camera thực hiện (xem hướng dẫn trong phần mềm).
// Hàm này LUÔN LƯU LẠI dữ liệu nhận được (mục "Xem log camera gần đây" trong
// phần mềm) để biết chính xác cần chỉnh lại chỗ nào cho khớp nếu chưa đúng.
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

// Dò tìm biển số trong 1 object JSON (đệ quy qua mọi field/mảng), ưu tiên các
// tên field theo đúng tài liệu ANPR của Hikvision trước ("licensePlate"), sau đó
// tới các tên field từng thấy ở phiên bản/hãng khác.
const TEN_FIELD_UU_TIEN = ['licensePlate', 'LicensePlate', 'plateNo', 'plateNumber', 'PlateNumber', 'plate'];
function timBienSoTrongJson(obj, depth = 0) {
  if (!obj || depth > 8) return null;
  if (typeof obj === 'string') return laBienSoHopLe(obj);
  if (Array.isArray(obj)) {
    // Dạng JSON hợp nhất hay dùng ở dòng camera mới: mảng { description: "plateNo", value: "..." }
    for (const phanTu of obj) {
      if (phanTu && typeof phanTu === 'object' && /plate ?no/i.test(phanTu.description || '')) {
        const bs = laBienSoHopLe(phanTu.value);
        if (bs) return bs;
      }
    }
    for (const phanTu of obj) {
      const bs = timBienSoTrongJson(phanTu, depth + 1);
      if (bs) return bs;
    }
    return null;
  }
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

// Dò tìm biển số trong text thường/XML — ưu tiên tuyệt đối thẻ <licensePlate>
// (đúng tên trường chính thức theo tài liệu ISAPI ANPR của Hikvision), sau đó
// mới thử các tên thẻ khác, cuối cùng mới quét từng "từ" xem có khớp dáng biển
// số xe hay không (phòng khi tên trường thực tế khác mọi phỏng đoán ở trên).
function timBienSoTrongXmlHoacText(text) {
  if (!text) return null;
  const khopLicensePlate = text.match(/<licensePlate>([^<]*)<\/licensePlate>/i);
  if (khopLicensePlate) {
    const bs = laBienSoHopLe(khopLicensePlate[1]);
    if (bs) return bs;
  }
  const khopKhac = text.match(/<(?:plateNo|plateNumber|PlateNumber)>([^<]*)<\//i);
  if (khopKhac) {
    const bs = laBienSoHopLe(khopKhac[1]);
    if (bs) return bs;
  }
  for (const tu of text.split(/[^A-Za-z0-9]+/)) {
    const bs = laBienSoHopLe(tu);
    if (bs) return bs;
  }
  return null;
}

// Lấy đúng giá trị boundary khai báo trong header Content-Type của multipart/form-data.
function boundaryTuContentType(contentType) {
  const m = contentType.match(/boundary="?([^";]+)"?/i);
  return m ? m[1].trim() : null;
}

// Tách riêng phần "anpr.xml" (dữ liệu biển số dạng XML) ra khỏi toàn bộ nội dung
// multipart/form-data — xử lý trực tiếp trên dữ liệu nhị phân (không decode cả
// khối làm text) để không làm hỏng/lẫn dữ liệu với các phần ảnh JPEG đi kèm.
function timPhanXmlTrongMultipart(bufferGoc, boundary) {
  const bytes = new Uint8Array(bufferGoc);
  const dashBoundary = new TextEncoder().encode('--' + boundary);

  const viTriCacBoundary = [];
  for (let i = 0; i <= bytes.length - dashBoundary.length; i++) {
    let khop = true;
    for (let j = 0; j < dashBoundary.length; j++) {
      if (bytes[i + j] !== dashBoundary[j]) { khop = false; break; }
    }
    if (khop) viTriCacBoundary.push(i);
  }
  if (viTriCacBoundary.length < 2) return null;

  const decoder = new TextDecoder('utf-8', { fatal: false });
  for (let k = 0; k < viTriCacBoundary.length - 1; k++) {
    const batDauPhan = viTriCacBoundary[k] + dashBoundary.length;
    const ketThucPhan = viTriCacBoundary[k + 1];
    if (ketThucPhan <= batDauPhan) continue;
    const phan = bytes.subarray(batDauPhan, ketThucPhan);

    // Header của mỗi phần (Content-Disposition, Content-Type...) kết thúc bằng \r\n\r\n
    let viTriHetHeader = -1;
    for (let i = 0; i < phan.length - 3; i++) {
      if (phan[i] === 13 && phan[i + 1] === 10 && phan[i + 2] === 13 && phan[i + 3] === 10) { viTriHetHeader = i; break; }
    }
    if (viTriHetHeader === -1) continue;

    const header = decoder.decode(phan.subarray(0, viTriHetHeader));
    const laPhanXml = /name="?anpr\.xml"?/i.test(header) || /Content-Type:\s*text\/xml/i.test(header);
    if (laPhanXml) {
      const noiDung = phan.subarray(viTriHetHeader + 4);
      return decoder.decode(noiDung).trim();
    }
  }
  return null;
}

export default async (req) => {
  if (req.method === 'OPTIONS') return json(200, {});
  if (req.method !== 'POST') return json(405, { error: 'Chỉ hỗ trợ POST' });

  const contentType = req.headers.get('content-type') || '';
  let bienSo = null;
  let noiDungGhiLog = '';

  if (contentType.includes('multipart/form-data')) {
    // Định dạng thật camera Hikvision gửi lên (đã xác nhận theo tài liệu chính hãng).
    let buf;
    try { buf = await req.arrayBuffer(); } catch { buf = new ArrayBuffer(0); }
    const boundary = boundaryTuContentType(contentType);
    const xmlText = boundary ? timPhanXmlTrongMultipart(buf, boundary) : null;
    if (xmlText) {
      bienSo = timBienSoTrongXmlHoacText(xmlText);
      noiDungGhiLog = xmlText;
    } else {
      noiDungGhiLog = `[multipart/form-data, ${buf.byteLength} byte — không tách được phần "anpr.xml", kiểm tra lại boundary/định dạng]`;
    }
  } else {
    let raw = '';
    try { raw = await req.text(); } catch { raw = ''; }
    if (contentType.includes('json')) {
      try { bienSo = timBienSoTrongJson(JSON.parse(raw)); } catch { /* không phải JSON hợp lệ, thử cách khác bên dưới */ }
    }
    if (!bienSo) bienSo = timBienSoTrongXmlHoacText(raw);
    noiDungGhiLog = raw;
  }

  const store = getStore('mo-khuon-gian-v6');

  // Luôn ghi lại log để chẩn đoán (mục "Xem log camera gần đây" trong phần
  // mềm) — kể cả khi không đọc được biển số, để biết đúng dữ liệu camera gửi
  // lên là gì mà chỉnh lại cho khớp.
  try {
    const logCu = (await store.get('camera_log', { type: 'json' })) || [];
    const logMoi = [
      ...logCu,
      { time: new Date().toISOString(), contentType, nhanDangDuoc: !!bienSo, plate: bienSo || null, raw: noiDungGhiLog.slice(0, 2000) },
    ].slice(-50); // chỉ giữ 50 log gần nhất, tránh phình dữ liệu
    await store.setJSON('camera_log', logMoi);
  } catch (e) {
    console.error('Không ghi được camera_log:', e.message);
  }

  if (!bienSo) return json(200, { nhanDuocNhungKhongThayBienSo: true });

  // Tạo 1 lượt xe vào cổng, chống trùng bằng khoá dựa trên biển số + phút
  // hiện tại (nếu camera gửi lặp lại nhiều lần cho cùng 1 lượt xe trong cùng
  // khoảng vài giây — thiết bị sẽ gửi lại nếu không nhận được phản hồi 200 OK
  // đúng lúc — sẽ không bị nhân đôi).
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
