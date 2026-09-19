// netlify/functions/kv.js
// Kho lưu trữ dùng chung, thay thế đúng vai trò của window.storage trong bản
// xem trước Claude Artifact — dùng Netlify Blobs (không cần cấu hình database
// ngoài, Netlify tự cấp phát khi deploy).
//
// Viết theo chuẩn Netlify Functions V2 (export default, dùng Request/Response
// chuẩn web) thay vì chuẩn V1 cũ (exports.handler) — vì V2 được Netlify tự
// động cấp context cho Netlify Blobs đáng tin cậy hơn, tránh lỗi
// "MissingBlobsEnvironmentError" từng gặp với hàm viết theo chuẩn V1.
import { getStore } from '@netlify/blobs';

function json(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    },
  });
}

export default async (req) => {
  if (req.method === 'OPTIONS') return json(200, {});
  // consistency: 'strong' — đảm bảo luôn đọc đúng dữ liệu mới nhất (không dùng
  // bản lưu tạm/bị trễ), tránh trường hợp đọc thấy dữ liệu CŨ hơn 1 nhịp so với
  // ghi gần nhất (có thể xảy ra khi nhiều nơi cùng ghi vào cùng 1 dữ liệu —
  // camera, agent đọc màn hình, phần mềm bảo vệ) rồi ghi đè mất dữ liệu đó.
  const store = getStore({ name: 'mo-khuon-gian-v6', consistency: 'strong' });

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const key = url.searchParams.get('key');
    if (!key) return json(400, { error: 'Thiếu tham số key' });
    const value = await store.get(key, { type: 'json' });
    return json(200, { value: value === null ? undefined : value });
  }

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json(400, { error: 'Body không hợp lệ' }); }
    const { key, value } = body || {};
    if (!key) return json(400, { error: 'Thiếu tham số key' });
    await store.setJSON(key, value);
    return json(200, { ok: true });
  }

  return json(405, { error: 'Phương thức không được hỗ trợ' });
};
