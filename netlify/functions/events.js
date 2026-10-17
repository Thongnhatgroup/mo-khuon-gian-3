// netlify/functions/events.js
// (Bổ sung 17/10) API sự kiện vận hành GỬI/NHẬN TỪNG PHẦN — thay cho việc mỗi
// thao tác gửi lại TOÀN BỘ dữ liệu từ đầu tới nay qua /api/kv (vài MB, mạng
// yếu tại mỏ gửi không kịp -> thao tác bị mất) và mỗi máy tải lại toàn bộ dữ
// liệu 6 giây/lần.
//
//  GET  /api/events?n=<số sự kiện máy đang có>&last=<id sự kiện cuối>&limit=<tối đa>
//       -> nếu sự kiện thứ n trên máy chủ đúng là "last": chỉ trả PHẦN MỚI
//          (từ vị trí n); ngược lại trả lại từ đầu (full: true). Trả theo
//          từng trang (limit) để không vượt giới hạn 6 MB của hàm Netlify.
//          Kèm "epoch" (mốc đặt lại dữ liệu) và "resetLock" để máy khỏi gọi riêng.
//  POST /api/events { append: [sự kiện...] }
//       -> nối thêm (bỏ trùng id), KHÔNG BAO GIỜ ghi đè/làm mất dữ liệu đang có.
import { getStore } from '@netlify/blobs';
import { json, tokenHopLe, TEN_KHO_CHINH } from '../lib/auth.js';
import { KHOA_SU_KIEN, noiThemSuKien } from '../lib/events-store.js';

const GIOI_HAN_MAC_DINH = 2000;
const GIOI_HAN_TOI_DA = 4000;

export default async (req) => {
  if (req.method === 'OPTIONS') return json(200, {});
  if (!(await tokenHopLe(req))) return json(401, { error: 'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn' });
  const store = getStore({ name: TEN_KHO_CHINH, consistency: 'strong' });

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const n = Math.max(0, parseInt(url.searchParams.get('n') || '0', 10) || 0);
    const last = url.searchParams.get('last') || '';
    const limit = Math.min(GIOI_HAN_TOI_DA, Math.max(100, parseInt(url.searchParams.get('limit') || '', 10) || GIOI_HAN_MAC_DINH));
    const [ev0, epoch, resetLock] = await Promise.all([
      store.get(KHOA_SU_KIEN, { type: 'json' }),
      store.get('data_epoch', { type: 'json' }).catch(() => null),
      store.get('reset_lock', { type: 'json' }).catch(() => null),
    ]);
    const events = Array.isArray(ev0) ? ev0 : [];
    // Máy đang có đúng n sự kiện đầu (kiểm tra bằng id của sự kiện thứ n)?
    const khop = n === 0 || (n <= events.length && events[n - 1] && events[n - 1].id === last);
    const tu = khop ? n : 0;
    const trang = events.slice(tu, tu + limit);
    return json(200, {
      full: !khop || n === 0,
      tu,
      events: trang,
      total: events.length,
      more: tu + trang.length < events.length,
      epoch: Number(epoch) || 0,
      resetLock: Number(resetLock) || 0,
    });
  }

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json(400, { error: 'Body không hợp lệ' }); }
    const moi = Array.isArray(body?.append) ? body.append : [];
    if (moi.length === 0) return json(200, { ok: true, them: 0 });
    if (moi.length > 500) return json(400, { error: 'Gửi quá nhiều sự kiện trong 1 lần' });
    const [khoa, epoch] = await Promise.all([
      store.get('reset_lock', { type: 'json' }).catch(() => null),
      store.get('data_epoch', { type: 'json' }).catch(() => null),
    ]);
    // Đang "Đặt lại dữ liệu vận hành" -> báo bận, máy tự gửi lại sau (không mất)
    if (khoa && Date.now() - Number(khoa) < 90000) return json(503, { error: 'Đang đặt lại dữ liệu, gửi lại sau' });
    try {
      const kq = await noiThemSuKien(store, moi, epoch);
      return json(200, { ok: true, ...kq, ids: moi.map((e) => e && e.id).filter(Boolean) });
    } catch (e) {
      return json(500, { error: 'Không lưu được', message: e.message });
    }
  }

  return json(405, { error: 'Phương thức không được hỗ trợ' });
};
