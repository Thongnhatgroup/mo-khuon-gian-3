// netlify/functions/import-plates.js
// API riêng cho chương trình nền (Windows agent) đẩy biển số xe lên — tách
// khỏi kv.js để xử lý atomically ngay tại máy chủ (đọc-thêm mới-ghi trong
// đúng 1 lần gọi hàm), giảm tối đa rủi ro ghi đè mất dữ liệu so với việc để
// agent tự đọc/ghi toàn bộ mảng events qua kv.js.
const { getStore } = require('@netlify/blobs');

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Chỉ hỗ trợ POST' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Body không hợp lệ' }); }
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
      source: 'excel_agent',
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
