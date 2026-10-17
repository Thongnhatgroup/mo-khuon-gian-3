// netlify/lib/auth.js — dùng chung: kiểm tra token đăng nhập (giống kv.js).
import { getStore } from '@netlify/blobs';

export const TEN_KHO_CHINH = 'mo-khuon-gian-v6';
const TEN_KHO_PHIEN = 'mo-khuon-gian-v6-sessions';
const THOI_HAN_PHIEN_MS = 30 * 24 * 60 * 60 * 1000; // 30 ngày — khớp kv.js

export function json(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Cache-Control': 'no-store',
    },
  });
}

export async function tokenHopLe(req) {
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
