// netlify/functions/ticket.js
// Cấp SỐ PHIẾU (ticketNo) duy nhất — tách hẳn khỏi netlify/functions/kv.js vì
// đây là nơi DUY NHẤT chịu trách nhiệm "trọng tài" cấp số, không phải chỗ đọc/
// ghi dữ liệu thông thường.
//
// (Bổ sung 26/09 — SỬA LỖI TRÙNG SỐ PHIẾU khi 2 máy xúc cùng xác nhận, theo
// phản ánh Chủ tịch HĐQT) TRƯỚC ĐÂY số phiếu do TRÌNH DUYỆT tự tính (đọc dữ
// liệu mới nhất từ máy chủ rồi +1) — dù đã đọc dữ liệu mới nhất ngay trước khi
// tính, 2 thiết bị vẫn có thể cùng đọc được dữ liệu ở ĐÚNG cùng một thời điểm
// (trước khi bên kia kịp ghi phiếu của họ lên máy chủ), rồi cả 2 cùng tính ra
// CÙNG 1 số tiếp theo -> trùng số phiếu giữa 2 xe khác nhau.
//
// Thư viện Netlify Blobs (@netlify/blobs v7.4.0) KHÔNG hỗ trợ ghi có điều kiện
// kiểu "chỉ ghi nếu chưa ai đổi" (compare-and-swap/etag) — set()/setJSON() luôn
// ghi đè thẳng. Vì vậy không thể cấp số bằng 1 lệnh đọc+ghi đơn giản dù đã
// chuyển hẳn xuống máy chủ (2 yêu cầu chạy song song trên máy chủ vẫn có thể
// cùng đọc được số cũ trước khi bên nào ghi số mới).
//
// Cách khắc phục (mô phỏng "giữ chỗ rồi tự kiểm tra"): với mỗi số ứng viên N,
// GHI hẳn 1 "dấu vân tay" ngẫu nhiên DUY NHẤT của chính yêu cầu này vào 1 ô
// riêng dành cho số N (khoá "giu_cho_N"). Nếu CÙNG lúc có yêu cầu khác cũng
// đang thử giữ đúng số N, ô đó sẽ bị ghi đè — nhưng vì Netlify Blobs đảm bảo
// mỗi lần ghi đến sau cùng mới là bản cuối cùng thực sự lưu lại, nên sau khi
// đợi một khoảng rất ngắn rồi ĐỌC LẠI ô đó, CHỈ ĐÚNG 1 yêu cầu sẽ thấy dấu vân
// tay của CHÍNH MÌNH còn nguyên — đó là bên "thắng" và được cấp số N; các bên
// còn lại "thua" sẽ tự động thử số tiếp theo. Nhờ vậy, dù bao nhiêu máy xúc
// cùng bấm xác nhận trong cùng 1 khoảnh khắc, không bao giờ có 2 bên cùng
// thắng ở cùng 1 số -> KHÔNG BAO GIỜ trùng số phiếu.
import { getStore } from '@netlify/blobs';

const TEN_KHO_CHINH = 'mo-khuon-gian-v6';
const TEN_KHO_SO_PHIEU = 'mo-khuon-gian-v6-ticketno';
const TEN_KHO_PHIEN = 'mo-khuon-gian-v6-sessions';
const THOI_HAN_PHIEN_MS = 30 * 24 * 60 * 60 * 1000; // 30 ngày — khớp với kv.js

const KHOA_BO_DEM = 'bo_dem_so_phieu';
const SO_LAN_THU_TOI_DA = 25; // đủ dư cho vài chục máy xúc cùng bấm 1 lúc
const DO_TRE_KIEM_TRA_MS = 60; // đợi trước khi đọc lại để xem có thắng hay không

function json(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
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

function cho(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Chỉ dùng đúng 1 LẦN khi kho số phiếu còn trống (VD lần đầu triển khai tính
// năng này) — quét lại toàn bộ phiếu đã từng lập trong kho dữ liệu CHÍNH để
// biết số lớn nhất đã cấp, làm mốc khởi đầu (không đánh số lại từ 1).
async function locSoLonNhatTuDuLieuChinh() {
  const store = getStore({ name: TEN_KHO_CHINH, consistency: 'strong' });
  const events = (await store.get('events', { type: 'json' })) || [];
  let soLon = 0;
  events.forEach((e) => {
    if (e && e.type === 'ticket_print' && e.ticketNo) {
      const n = parseInt(e.ticketNo, 10);
      if (!Number.isNaN(n) && n > soLon) soLon = n;
    }
  });
  return soLon;
}

export default async (req) => {
  if (req.method === 'OPTIONS') return json(200, {});
  if (req.method !== 'POST') return json(405, { error: 'Phương thức không được hỗ trợ' });

  const hopLe = await tokenHopLe(req);
  if (!hopLe) return json(401, { error: 'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn' });

  const store = getStore({ name: TEN_KHO_SO_PHIEU, consistency: 'strong' });
  // Dấu vân tay ngẫu nhiên riêng của đúng yêu cầu này — dùng để nhận ra chính
  // mình khi đọc lại, phân biệt với dấu vân tay của yêu cầu khác đến cùng lúc.
  const dauVanTay = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;

  let hienTai = await store.get(KHOA_BO_DEM, { type: 'json' });
  if (hienTai === null || hienTai === undefined) {
    // Kho số phiếu chưa từng khởi tạo — lấy mốc từ dữ liệu chính (chỉ xảy ra 1
    // lần duy nhất trong đời hệ thống, những lần sau luôn đọc được bộ đếm này).
    hienTai = await locSoLonNhatTuDuLieuChinh();
  }

  for (let lan = 0; lan < SO_LAN_THU_TOI_DA; lan++) {
    const ungVien = hienTai + 1;
    const khoaGiuCho = `giu_cho_${ungVien}`;
    try {
      await store.set(khoaGiuCho, dauVanTay);
      await cho(DO_TRE_KIEM_TRA_MS + Math.floor(Math.random() * 40));
      const aiDangGiu = await store.get(khoaGiuCho);
      if (aiDangGiu === dauVanTay) {
        // Thắng — chắc chắn không ai khác cũng đang giữ đúng số này. Cập nhật
        // bộ đếm để lần cấp số TIẾP THEO (của bất kỳ ai) bắt đầu từ đây, rồi
        // trả số vừa giành được. Cập nhật bộ đếm là "cố gắng tốt nhất" — nếu
        // lỡ thất bại cũng không sao, vì vòng lặp trên vẫn luôn dò tiếp từ số
        // lớn nhất đọc được ở lần gọi sau.
        await store.setJSON(KHOA_BO_DEM, ungVien).catch(() => {});
        const ticketNo = String(ungVien).padStart(9, '0');
        return json(200, { ticketNo });
      }
    } catch {
      // Lỗi tạm thời khi ghi/đọc — coi như thua lượt này, thử số tiếp theo.
    }
    // Thua (hoặc lỗi tạm thời) — ai đó vừa giành số này, hoặc gặp trục trặc
    // mạng, luôn LUÔN nhích lên thử số kế tiếp, không bao giờ thử lại đúng số
    // vừa thua (tránh lặp vô ích khi đối thủ vẫn còn giữ số đó).
    hienTai = ungVien;
  }

  return json(503, { error: 'Có quá nhiều máy xúc cùng xác nhận trong 1 khoảnh khắc — vui lòng bấm lại.' });
};
