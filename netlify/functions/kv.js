// netlify/functions/kv.js
// Kho lưu trữ dùng chung, thay thế đúng vai trò của window.storage trong bản
// xem trước Claude Artifact — dùng Netlify Blobs (không cần cấu hình database
// ngoài, Netlify tự cấp phát khi deploy).
//
// Viết theo chuẩn Netlify Functions V2 (export default, dùng Request/Response
// chuẩn web) thay vì chuẩn V1 cũ (exports.handler) — vì V2 được Netlify tự
// động cấp context cho Netlify Blobs đáng tin cậy hơn, tránh lỗi
// "MissingBlobsEnvironmentError" từng gặp với hàm viết theo chuẩn V1.
//
// (Bổ sung 25/09 — XỬ LÝ LỖ HỔNG BẢO MẬT, theo yêu cầu Chủ tịch HĐQT) TRƯỚC
// ĐÂY hàm này không hề kiểm tra danh tính — bất kỳ ai biết đúng đường dẫn
// (kể cả không đăng nhập vào phần mềm) đều đọc/ghi được TOÀN BỘ dữ liệu vận
// hành và tài chính công ty. Nay MỌI request (trừ đúng 1 trường hợp: ĐỌC khoá
// "recent_logins" — chỉ chứa tên hiển thị "tài khoản đã dùng trên máy này",
// phục vụ màn đăng nhập trước khi có token, không có mật khẩu hay dữ liệu
// nhạy cảm) đều bắt buộc phải có token đăng nhập hợp lệ (được cấp bởi
// netlify/functions/login.js sau khi xác thực mật khẩu thật) gửi kèm ở header
// "Authorization: Bearer <token>". Token vô hiệu/hết hạn -> trả về lỗi 401.
import { getStore } from '@netlify/blobs';

const TEN_KHO_CHINH = 'mo-khuon-gian-v6';
const TEN_KHO_PHIEN = 'mo-khuon-gian-v6-sessions';
const THOI_HAN_PHIEN_MS = 30 * 24 * 60 * 60 * 1000; // 30 ngày — khớp với việc phiên đăng nhập vốn đã lưu ở localStorage không giới hạn thời gian trước đây (chỉ mất khi tự đăng xuất)

// Duy nhất khoá này được phép ĐỌC mà KHÔNG cần đăng nhập.
const KHOA_DUOC_DOC_KHONG_CAN_DANG_NHAP = new Set(['recent_logins']);

function json(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    },
  });
}

async function tokenHopLe(req) {
  const auth = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (!m) return false;
  const token = m[1].trim();
  if (!token) return false;
  try {
    const phienStore = getStore({ name: TEN_KHO_PHIEN, consistency: 'strong' });
    const phien = await phienStore.get(`session_${token}`, { type: 'json' });
    if (!phien) return false;
    if (Date.now() - (phien.createdAt || 0) > THOI_HAN_PHIEN_MS) return false;
    return true;
  } catch {
    return false;
  }
}

export default async (req) => {
  if (req.method === 'OPTIONS') return json(200, {});
  // consistency: 'strong' — đảm bảo luôn đọc đúng dữ liệu mới nhất (không dùng
  // bản lưu tạm/bị trễ), tránh trường hợp đọc thấy dữ liệu CŨ hơn 1 nhịp so với
  // ghi gần nhất (có thể xảy ra khi nhiều nơi cùng ghi vào cùng 1 dữ liệu —
  // camera, agent đọc màn hình, phần mềm bảo vệ) rồi ghi đè mất dữ liệu đó.
  const store = getStore({ name: TEN_KHO_CHINH, consistency: 'strong' });

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const key = url.searchParams.get('key');
    if (!key) return json(400, { error: 'Thiếu tham số key' });
    if (!KHOA_DUOC_DOC_KHONG_CAN_DANG_NHAP.has(key)) {
      const hopLe = await tokenHopLe(req);
      if (!hopLe) return json(401, { error: 'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn' });
    }
    const value = await store.get(key, { type: 'json' });
    return json(200, { value: value === null ? undefined : value });
  }

  if (req.method === 'POST') {
    const hopLe = await tokenHopLe(req);
    if (!hopLe) return json(401, { error: 'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn' });
    let body;
    try { body = await req.json(); } catch { return json(400, { error: 'Body không hợp lệ' }); }
    const { key, value } = body || {};
    if (!key) return json(400, { error: 'Thiếu tham số key' });
    await store.setJSON(key, value);
    return json(200, { ok: true });
  }

  return json(405, { error: 'Phương thức không được hỗ trợ' });
};
