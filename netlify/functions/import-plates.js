// netlify/functions/import-plates.js
// API riêng cho chương trình nền (Windows agent) đẩy biển số xe lên — tách
// khỏi kv.js để xử lý atomically ngay tại máy chủ (đọc-thêm mới-ghi trong
// đúng 1 lần gọi hàm), giảm tối đa rủi ro ghi đè mất dữ liệu so với việc để
// agent tự đọc/ghi toàn bộ mảng events qua kv.js.
//
// Viết theo chuẩn Netlify Functions V2 (export default, dùng Request/Response
// chuẩn web) thay vì chuẩn V1 cũ (exports.handler) — cùng lý do với kv.js:
// tránh lỗi "MissingBlobsEnvironmentError" khi gọi Netlify Blobs.
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

export default async (req) => {
  if (req.method === 'OPTIONS') return json(200, {});
  if (req.method !== 'POST') return json(405, { error: 'Chỉ hỗ trợ POST' });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Body không hợp lệ' }); }
  const rows = Array.isArray(body.plates) ? body.plates : [];
  if (rows.length === 0) return json(200, { added: 0 });

  const store = getStore('mo-khuon-gian-v6');
  const events = (await store.get('events', { type: 'json' })) || [];
  const existingKeys = new Set(events.filter((e) => e.type === 'gate_in' && e.excelRowKey).map((e) => e.excelRowKey));

  const nowIso = new Date().toISOString();
  const newEvents = [];
  for (const r of rows) {
    if (!r || !r.plate || !r.excelRowKey) continue;
    if (existingKeys.has(r.excelRowKey)) continue;
    existingKeys.add(r.excelRowKey);
    newEvents.push({
      id: `GI-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'gate_in',
      plate: String(r.plate).trim().toUpperCase(),
      // Cho phép chương trình cầu nối tự khai báo nguồn dữ liệu (VD:
      // 'camera_hikcentral' từ camera-agent/) để phần mềm hiển thị đúng trạng
      // thái kết nối theo từng loại — mặc định 'excel_agent' để tương thích
      // ngược với các phiên bản trước.
      source: r.source || body.source || 'excel_agent',
      loaiXe: r.loaiXe || '25m3',
      photo: null,
      excelRowKey: r.excelRowKey,
      time: nowIso,
    });
  }

  if (newEvents.length > 0) {
    await store.setJSON('events', [...events, ...newEvents]);
  }
  return json(200, { added: newEvents.length });
};
