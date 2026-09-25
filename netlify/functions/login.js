// netlify/functions/login.js
// (Bổ sung 25/09 — xử lý lỗ hổng bảo mật /api/kv, theo yêu cầu Chủ tịch HĐQT)
// Xác thực đăng nhập THẬT ở phía máy chủ — trước đây màn hình đăng nhập tự
// đọc thẳng toàn bộ danh sách tài khoản (kèm mật khẩu đã băm) qua /api/kv
// (không xác thực) rồi so sánh ngay trên trình duyệt — bất kỳ ai biết đường
// dẫn /api/kv đều lấy được danh sách đó mà không cần đăng nhập. Nay việc so
// khớp mật khẩu chỉ diễn ra Ở ĐÂY, trên máy chủ — trình duyệt không bao giờ
// nhận được danh sách tài khoản hay mật khẩu đã băm của bất kỳ ai nữa. Đăng
// nhập đúng sẽ được cấp 1 "token" ngẫu nhiên, dùng để gọi /api/kv (xem
// netlify/functions/kv.js) — không có token hợp lệ thì không đọc/ghi được dữ
// liệu chung nữa (trừ đúng 1 khoá "recent_logins" chỉ cho đọc).
import { getStore } from '@netlify/blobs';

const TEN_KHO_CHINH = 'mo-khuon-gian-v6';
const TEN_KHO_PHIEN = 'mo-khuon-gian-v6-sessions';

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

// Giống HỆT hashPassword()/verifyPassword() phía trình duyệt (src/App.jsx) —
// SHA-256(salt + ':' + password) — để mật khẩu THẬT đã có từ trước vẫn đăng
// nhập được bình thường, không cần đổi lại mật khẩu hàng loạt. crypto.subtle
// và crypto.getRandomValues có sẵn toàn cục trên Netlify Functions (Node 24),
// không cần import gì thêm.
async function hashPassword(password, saltHex) {
  const salt = saltHex || Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, '0')).join('');
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(salt + ':' + password));
  const hash = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return { salt, hash };
}
async function verifyPassword(password, salt, hash) {
  const { hash: check } = await hashPassword(password, salt);
  return check === hash;
}

function taoToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32))).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Giống HỆT seedUsersIfNeeded() phía trình duyệt (src/App.jsx) — chuyển hẳn
// vào đây (chạy Ở MÁY CHỦ) vì đây là chỗ DUY NHẤT còn được phép đọc "users"
// trước khi có token. Giữ nguyên đúng logic gốc (kể cả cờ "users_bootstrap_done"
// chống ghi đè nhầm khi đọc rỗng do lỗi mạng thoáng qua) để không thay đổi
// hành vi khởi tạo tài khoản mặc định lần đầu.
const TAI_KHOAN_MAC_DINH = [['nguyenvanthong', 'Nguyễn Văn Thống', 'Tổng Giám đốc', 'banlanhdao']];
async function seedUsersIfNeeded(store) {
  const make = async (username, hoTen, chucDanh, role) => {
    const { salt, hash } = await hashPassword('ThongNhat@123');
    return { id: username, username, name: hoTen, chucDanh, role, salt, hash, mustChangePassword: true, active: true };
  };
  const daKhoiTao = await store.get('users_bootstrap_done', { type: 'json' });
  const existing = await store.get('users', { type: 'json' });

  if (existing) {
    const thieuTaiKhoan = TAI_KHOAN_MAC_DINH.filter(([u]) => !existing.some((x) => x.username === u));
    if (thieuTaiKhoan.length === 0) return existing;
    const boSung = await Promise.all(thieuTaiKhoan.map(([u, n, c, r]) => make(u, n, c, r)));
    const daVa = [...existing, ...boSung];
    await store.setJSON('users', daVa);
    if (!daKhoiTao) await store.setJSON('users_bootstrap_done', true);
    return daVa;
  }
  if (daKhoiTao) return null; // đọc rỗng bất thường dù đã từng khởi tạo — không ghi đè, coi như lỗi tạm thời
  const users = await Promise.all(TAI_KHOAN_MAC_DINH.map(([u, n, c, r]) => make(u, n, c, r)));
  await store.setJSON('users', users);
  await store.setJSON('users_bootstrap_done', true);
  return users;
}

export default async (req) => {
  if (req.method === 'OPTIONS') return json(200, {});
  if (req.method !== 'POST') return json(405, { error: 'Phương thức không được hỗ trợ' });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Yêu cầu không hợp lệ' }); }

  const phienStore = getStore({ name: TEN_KHO_PHIEN, consistency: 'strong' });

  // ĐĂNG XUẤT — xoá phiên thật trên máy chủ để token cũ không dùng lại được
  // nữa, kể cả khi bị lộ ra ngoài (trước đây bấm "Đăng xuất" chỉ xoá dữ liệu
  // ở trình duyệt, token vẫn còn nguyên hiệu lực trên máy chủ).
  if (body?.action === 'logout') {
    if (body?.token) { try { await phienStore.delete(`session_${body.token}`); } catch {} }
    return json(200, { ok: true });
  }

  const username = String(body?.username || '').trim().toLowerCase();
  const password = String(body?.password || '');
  if (!username || !password) return json(400, { error: 'Vui lòng nhập tài khoản và mật khẩu' });

  const store = getStore({ name: TEN_KHO_CHINH, consistency: 'strong' });
  const users = await seedUsersIfNeeded(store);
  if (!users) return json(503, { error: 'Không kết nối được tới máy chủ lúc này — vui lòng thử lại sau vài giây.' });

  const u = users.find((x) => x.username === username);
  if (!u) return json(401, { error: 'Sai tài khoản hoặc mật khẩu' });
  if (!u.active) return json(403, { error: 'Tài khoản này đã bị KHOÁ — liên hệ Ban lãnh đạo để mở lại.' });
  const ok = await verifyPassword(password, u.salt, u.hash);
  if (!ok) return json(401, { error: 'Sai tài khoản hoặc mật khẩu' });

  const token = taoToken();
  // Lưu phiên trong kho RIÊNG (khác kho dữ liệu vận hành chính) — để công cụ
  // "Đặt lại dữ liệu vận hành" không vô tình đăng xuất mọi người, và ngược
  // lại việc quản lý phiên đăng nhập không ảnh hưởng gì tới dữ liệu vận hành.
  await phienStore.setJSON(`session_${token}`, { userId: u.id, username: u.username, createdAt: Date.now() });

  // (Bổ sung 25/09 lần 2 — khắc phục lỗi "F5 bị đẩy ra khỏi phiên đăng nhập")
  // Đọc lại NGAY để chắc chắn phiên vừa ghi đã thực sự đọc lại được, trước khi
  // trả token về cho trình duyệt — phòng trường hợp có độ trễ rất ngắn giữa
  // lúc ghi và lúc đọc lại được (dù đã dùng consistency:'strong'), khiến yêu
  // cầu /api/kv đầu tiên ngay sau khi đăng nhập bị từ chối nhầm là "chưa đăng
  // nhập", buộc người dùng phải đăng nhập lại ngay lập tức.
  let daXacNhanDoc = false;
  for (let lan = 0; lan < 5; lan++) {
    const kt = await phienStore.get(`session_${token}`, { type: 'json' });
    if (kt) { daXacNhanDoc = true; break; }
    await new Promise((r) => setTimeout(r, 150));
  }
  if (!daXacNhanDoc) {
    return json(503, { error: 'Không khởi tạo được phiên đăng nhập lúc này — vui lòng thử lại sau vài giây.' });
  }

  return json(200, {
    token,
    user: { id: u.id, username: u.username, name: u.name, chucDanh: u.chucDanh, role: u.role, mustChangePassword: u.mustChangePassword },
  });
};
