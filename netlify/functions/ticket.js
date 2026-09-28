// netlify/functions/ticket.js
// Cấp SỐ PHIẾU (ticketNo) duy nhất — tách hẳn khỏi netlify/functions/kv.js vì
// đây là nơi DUY NHẤT chịu trách nhiệm "trọng tài" cấp số, không phải chỗ đọc/
// ghi dữ liệu thông thường.
//
// (Bổ sung 28/09 — SỬA TẬN GỐC lỗi VẪN còn trùng số phiếu dù các máy xúc xác
// nhận cách nhau 1-2 giây, theo phản ánh Chủ tịch HĐQT) Cách làm 26/09 (ghi 1
// "dấu vân tay" rồi CHỜ một khoảng ngắn rồi ĐỌC LẠI xem có đúng của mình không)
// chỉ là "PHỎNG ĐOÁN CÓ XÁC SUẤT", không phải đảm bảo tuyệt đối: nếu 1 yêu cầu
// bị mạng làm chậm bất thường (VD "cold start"), việc GHI của nó có thể đến
// TRỄ hơn cả lúc 1 yêu cầu KHÁC đã "chờ xong, đọc lại, thấy đúng của mình, và
// trả kết quả" — khi đó yêu cầu đến trễ ghi ĐÈ lên sau, rồi tự đọc lại thấy
// đúng dấu vân tay của mình, cũng tưởng mình thắng -> CẤP TRÙNG SỐ. Vì cách
// làm cũ không có cách nào phân biệt "chưa ai từng thắng số này" với "có ai đó
// ĐÃ thắng số này rồi nhưng xong việc rồi", nên dù chờ bao lâu cũng còn khe hở.
//
// Nay chuyển sang dùng đúng tính năng GHI CÓ ĐIỀU KIỆN thật sự của Netlify
// Blobs: store.set(key, value, { onlyIfNew: true }) — máy chủ Netlify Blobs
// (không phải trình duyệt/hàm này tự đoán) đảm bảo: trong số nhiều yêu cầu ghi
// cùng 1 khoá cùng lúc, CHỈ ĐÚNG 1 yêu cầu nhận được modified:true (được tạo
// mới), tất cả yêu cầu còn lại nhận modified:false NGAY LẬP TỨC — không cần
// "chờ rồi đoán" nữa, không còn khe hở nào dù độ trễ mạng lớn đến đâu. Tính
// năng này cần @netlify/blobs bản 11.1.0 trở lên (bản cũ 7.4.0 trước đây CHƯA
// hỗ trợ — xem package.json), đã nâng cấp kèm theo bản sửa lỗi này.
//
// Với mỗi số ứng viên N, chỉ cần thử tạo mới khoá "da_cap_N" — nếu tạo được
// (modified:true) nghĩa là CHẮC CHẮN chưa ai từng được cấp số N, số N thuộc về
// yêu cầu này; nếu không tạo được (modified:false, do đã tồn tại — dù là từ 1
// mili-giây trước hay từ nhiều ngày trước) thì bỏ qua, thử số tiếp theo.
import { getStore } from '@netlify/blobs';

const TEN_KHO_CHINH = 'mo-khuon-gian-v6';
const TEN_KHO_SO_PHIEU = 'mo-khuon-gian-v6-ticketno';
const TEN_KHO_PHIEN = 'mo-khuon-gian-v6-sessions';
const THOI_HAN_PHIEN_MS = 30 * 24 * 60 * 60 * 1000; // 30 ngày — khớp với kv.js

const KHOA_BO_DEM = 'bo_dem_so_phieu';
const SO_LAN_THU_TOI_DA = 60; // đủ dư cho vài chục máy xúc cùng bấm 1 lúc — mỗi
// lần thử giờ rất rẻ (không phải chờ) nên có thể để dư nhiều hơn trước.

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

  // Bộ đếm này CHỈ còn là "gợi ý" giúp đỡ mất công dò lại từ số 1 mỗi lần —
  // KHÔNG còn là nơi quyết định đúng/sai như trước. Dù bộ đếm có bị lệch/cũ
  // đến đâu, việc "tạo mới có điều kiện" bên dưới vẫn đảm bảo không bao giờ
  // cấp trùng, chỉ có thể khiến tốn thêm vài lần thử vô hại.
  let hienTai = await store.get(KHOA_BO_DEM, { type: 'json' });
  if (hienTai === null || hienTai === undefined) {
    hienTai = await locSoLonNhatTuDuLieuChinh();
  }

  for (let lan = 0; lan < SO_LAN_THU_TOI_DA; lan++) {
    const ungVien = hienTai + 1;
    const khoaDaCap = `da_cap_${ungVien}`;
    try {
      const { modified } = await store.set(khoaDaCap, String(Date.now()), { onlyIfNew: true });
      if (modified) {
        // Máy chủ Netlify Blobs xác nhận CHẮC CHẮN chính yêu cầu này là nơi
        // ĐẦU TIÊN VÀ DUY NHẤT tạo được khoá này — không cần chờ/đoán thêm.
        await store.setJSON(KHOA_BO_DEM, ungVien).catch(() => {});
        const ticketNo = String(ungVien).padStart(9, '0');
        return json(200, { ticketNo });
      }
      // modified:false -> số này đã có người khác được cấp (từ trước đó rất
      // lâu, hoặc chỉ vừa 1 mili-giây trước) -> bỏ qua, không bao giờ tranh
      // chấp lại số này, thử ngay số tiếp theo.
    } catch {
      // Lỗi tạm thời khi ghi -> coi như thua lượt này, thử số tiếp theo.
    }
    hienTai = ungVien;
  }

  return json(503, { error: 'Có quá nhiều máy xúc cùng xác nhận trong 1 khoảnh khắc — vui lòng bấm lại.' });
};
