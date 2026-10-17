// netlify/lib/events-store.js
// (Sửa 17/10 — xử lý lỗi "khai báo xong lại mất, dữ liệu không sang phân hệ
// khác" sau khi chuyển lán trại, mạng yếu) Quy tắc DUY NHẤT để thêm sự kiện vào
// khoá "events": CHỈ NỐI THÊM sự kiện chưa có (so theo id) — KHÔNG BAO GIỜ làm
// mất sự kiện đang có trên máy chủ, dù nơi gửi lên có bản dữ liệu cũ/thiếu.
import { capNhatNguyenTu } from './camera-logic.js';

export const KHOA_SU_KIEN = 'events';

function mocDatLaiMs(epoch) { const n = Number(epoch); return Number.isFinite(n) && n > 0 ? n : 0; }

// Lọc sự kiện mới: bỏ trùng id, bỏ sự kiện "cũ hơn lần đặt lại dữ liệu gần
// nhất" (do 1 tab cũ còn mở từ trước khi đặt lại gửi lên — không được khôi phục).
export function locSuKienMoi(hienTai, moi, epoch) {
  const daCo = new Set(hienTai.map((e) => e && e.id));
  const moc = mocDatLaiMs(epoch);
  const them = [];
  for (const e of moi) {
    if (!e || typeof e !== 'object' || !e.id || !e.type) continue;
    if (daCo.has(e.id)) continue;
    if (moc) {
      const t = Date.parse(e.time || '');
      if (Number.isFinite(t) && t < moc && !(e.createdAt && e.createdAt > moc)) continue;
    }
    daCo.add(e.id);
    them.push(e);
  }
  return them;
}

// Nối thêm "nguyên tử" (ghi có điều kiện, tự làm lại nếu có nơi khác vừa ghi).
export async function noiThemSuKien(store, moi, epoch) {
  return capNhatNguyenTu(store, KHOA_SU_KIEN, (hienTai0) => {
    const hienTai = Array.isArray(hienTai0) ? hienTai0 : [];
    const them = locSuKienMoi(hienTai, moi, epoch);
    return { giaTri: them.length ? [...hienTai, ...them] : undefined, ketQua: { them: them.length, tong: hienTai.length + them.length } };
  }, 15);
}
