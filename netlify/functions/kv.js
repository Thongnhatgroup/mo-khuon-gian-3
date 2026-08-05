// netlify/functions/kv.js
// Kho lưu trữ dùng chung, thay thế đúng vai trò của window.storage trong bản
// xem trước Claude Artifact — dùng Netlify Blobs (không cần cấu hình database
// ngoài, Netlify tự cấp phát khi deploy).
const { getStore } = require('@netlify/blobs');

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});
  const store = getStore('mo-khuon-gian-v6');

  if (event.httpMethod === 'GET') {
    const key = event.queryStringParameters?.key;
    if (!key) return json(400, { error: 'Thiếu tham số key' });
    const value = await store.get(key, { type: 'json' });
    return json(200, { value: value === null ? undefined : value });
  }

  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Body không hợp lệ' }); }
    const { key, value } = body;
    if (!key) return json(400, { error: 'Thiếu tham số key' });
    await store.setJSON(key, value);
    return json(200, { ok: true });
  }

  return json(405, { error: 'Phương thức không được hỗ trợ' });
};
