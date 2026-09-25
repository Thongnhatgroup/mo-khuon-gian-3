// netlify/functions/account-request.js
// (Bổ sung 25/09 — xử lý lỗ hổng bảo mật /api/kv, theo yêu cầu Chủ tịch HĐQT)
// Cho phép người CHƯA CÓ tài khoản gửi "yêu cầu tài khoản mới" ngay ở màn
// đăng nhập — đây là hành động HỢP LỆ không cần đăng nhập trước (đúng bản
// chất: người gửi yêu cầu chưa hề có tài khoản để đăng nhập). Điểm này CHỈ
// được phép THÊM đúng 1 bản ghi vào danh sách "account_requests", không đọc
// và không ghi được bất kỳ dữ liệu nào khác — khác hẳn /api/kv (đã bắt buộc
// đăng nhập, xem netlify/functions/kv.js), nên không mở lại lỗ hổng cũ.
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

function genId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default async (req) => {
  if (req.method === 'OPTIONS') return json(200, {});
  if (req.method !== 'POST') return json(405, { error: 'Phương thức không được hỗ trợ' });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Yêu cầu không hợp lệ' }); }

  const hoTen = String(body?.hoTen || '').trim().slice(0, 200);
  const chucDanh = String(body?.chucDanh || '').trim().slice(0, 200);
  const phanHe = String(body?.phanHe || '').trim().slice(0, 100);
  if (!hoTen || !chucDanh) return json(400, { error: 'Nhập đủ họ tên và chức danh' });

  const store = getStore({ name: 'mo-khuon-gian-v6', consistency: 'strong' });
  const hienTai = (await store.get('account_requests', { type: 'json' })) || [];
  const moi = { id: genId('YC'), hoTen, chucDanh, phanHe, trangThai: 'cho_duyet', time: new Date().toISOString() };
  await store.setJSON('account_requests', [...hienTai, moi]);
  return json(200, { ok: true });
};
