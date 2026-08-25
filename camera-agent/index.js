// camera-agent/index.js
// -----------------------------------------------------------------------------
// CHƯƠNG TRÌNH CẦU NỐI chạy trên 1 MÁY TÍNH TRONG MỎ (không chạy trên Netlify) —
// định kỳ hỏi máy chủ camera nhận diện biển số (HikCentral Professional) xem có
// biển số nào mới quét được, rồi đẩy lên phần mềm quản lý mỏ trên Netlify qua
// API sẵn có (netlify/functions/import-plates.js — API này vốn đã được thiết kế
// riêng cho đúng việc "chương trình nền đẩy biển số xe lên").
//
// VÌ SAO CẦN CHƯƠNG TRÌNH RIÊNG NÀY (không gọi thẳng từ trình duyệt/Netlify)?
//  - Netlify (máy chủ đám mây) không thể tự kết nối vào trang camera nội bộ có
//    chứng chỉ bảo mật tự ký (https://113.175.129.251) một cách an toàn/ổn định.
//  - Mật khẩu/khóa API của camera KHÔNG được đưa lên Netlify hay GitHub (ai xem
//    mã nguồn công khai cũng thấy) — chỉ nằm trong file config.json trên ĐÚNG
//    máy tính này, do người quản lý mỏ tự điền, Claude không hề thấy hay nhập.
//
// CẦN GÌ TRƯỚC KHI DÙNG:
//  1. Node.js bản 18 trở lên đã cài trên máy tính này (tải tại nodejs.org).
//  2. Trong HikCentral Professional, bật "Open Platform" / "Nền tảng mở" (mục
//     Cấu hình hệ thống) và lấy 1 cặp AppKey + AppSecret — đây là khóa API
//     RIÊNG, KHÁC với tài khoản admin/mật khẩu đăng nhập trang web. Nếu không
//     tự bật được, cần nhờ đơn vị lắp đặt / kỹ thuật Hikvision hỗ trợ bật lần
//     đầu (theo tài liệu OpenAPI Developer Guide của HikCentral Professional).
//  3. Sao chép config.example.json -> config.json rồi điền AppKey/AppSecret,
//     địa chỉ trang camera, và giữ nguyên đường link API import-plates.
//
// CÁCH CHẠY:
//   cd camera-agent
//   npm install          (chỉ cần làm 1 lần đầu — không cần gói ngoài nào ngoài
//                          Node.js gốc, lệnh này chỉ để chắc chắn thư mục sẵn sàng)
//   node index.js
//   -> Để chạy NỀN LIÊN TỤC theo giờ làm việc, đặt lệnh "node index.js" vào
//      Task Scheduler của Windows (chạy khi khởi động máy), hoặc dùng công cụ
//      như "pm2" / "NSSM" để chạy như 1 dịch vụ nền — có thể nhờ Claude thiết
//      lập cụ thể trên máy tính đó khi cần.
//
// LƯU Ý QUAN TRỌNG:
//  - Phần ký (chữ ký) gọi API theo đúng chuẩn "Hikvision Artemis OpenAPI"
//    (AppKey/AppSecret + HMAC-SHA256) được cài đặt dựa trên tài liệu chuẩn
//    Hikvision công bố công khai — NHƯNG CHƯA ĐƯỢC KIỂM THỬ TRÊN MÁY CHỦ THẬT
//    của mỏ (vì cần có AppKey/AppSecret thật mới gọi thử được). Lần đầu chạy,
//    hãy xem kỹ log in ra màn hình: nếu báo lỗi xác thực (401/403), có thể do
//    endpoint hoặc cách ký hơi khác so với bản HikCentral đang dùng — gửi lại
//    đúng nội dung lỗi in ra để được chỉnh cho khớp.
// -----------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const duongDanConfig = path.join(__dirname, 'config.json');
if (!fs.existsSync(duongDanConfig)) {
  console.error('\n❌ Chưa có file config.json.');
  console.error('   Hãy sao chép config.example.json thành config.json rồi điền thông tin thật, sau đó chạy lại.\n');
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(duongDanConfig, 'utf8'));

if (!cfg.appKey || cfg.appKey.includes('DIEN_APPKEY') || !cfg.appSecret || cfg.appSecret.includes('DIEN_APPSECRET')) {
  console.error('\n❌ Chưa điền AppKey / AppSecret thật vào config.json.');
  console.error('   Lấy 2 giá trị này từ mục "Open Platform / Nền tảng mở" trong HikCentral Professional (xem hướng dẫn trong config.example.json).\n');
  process.exit(1);
}

// Đồng ý bỏ qua lỗi chứng chỉ tự ký của trang camera nội bộ (nếu được bật) —
// KHÔNG ảnh hưởng gì tới việc gọi Netlify (Netlify luôn dùng https chuẩn).
const agentBoQuaTLS = cfg.boQuaLoiChungChiTLS ? new https.Agent({ rejectUnauthorized: false }) : undefined;

// -----------------------------------------------------------------------------
// Ký request theo chuẩn Hikvision Artemis OpenAPI (AppKey/AppSecret, HMAC-SHA256)
// -----------------------------------------------------------------------------
function kyRequestArtemis({ method, path: duongDan, body }) {
  const accept = 'application/json';
  const contentType = 'application/json;charset=UTF-8';
  const now = Date.now().toString();
  const nonce = crypto.randomUUID();
  const bodyStr = body ? JSON.stringify(body) : '';
  const contentMd5 = bodyStr ? crypto.createHash('md5').update(bodyStr, 'utf8').digest('base64') : '';

  const tenHeaderDaKy = ['x-ca-key', 'x-ca-nonce', 'x-ca-timestamp'];
  const headersDeKy = { 'x-ca-key': cfg.appKey, 'x-ca-nonce': nonce, 'x-ca-timestamp': now };
  const chuoiHeaderDaKy = tenHeaderDaKy.map((h) => `${h}:${headersDeKy[h]}\n`).join('');

  const chuoiCanKy = [method, accept, contentMd5, contentType, '', chuoiHeaderDaKy + duongDan].join('\n');
  const chuKy = crypto.createHmac('sha256', cfg.appSecret).update(chuoiCanKy, 'utf8').digest('base64');

  return {
    headers: {
      Accept: accept,
      'Content-Type': contentType,
      ...(contentMd5 ? { 'Content-MD5': contentMd5 } : {}),
      'X-Ca-Key': cfg.appKey,
      'X-Ca-Nonce': nonce,
      'X-Ca-Timestamp': now,
      'X-Ca-Signature-Headers': tenHeaderDaKy.join(','),
      'X-Ca-Signature': chuKy,
    },
    bodyStr,
  };
}

async function goiArtemis(duongDan, body) {
  const { headers, bodyStr } = kyRequestArtemis({ method: 'POST', path: duongDan, body });
  const res = await fetch(cfg.hikcentralBaseUrl.replace(/\/$/, '') + duongDan, {
    method: 'POST',
    headers,
    body: bodyStr,
    // @ts-ignore - Node fetch hỗ trợ agent qua dispatcher trong bản mới; nếu lỗi
    // chứng chỉ vẫn xảy ra, cân nhắc chạy thêm NODE_TLS_REJECT_UNAUTHORIZED=0.
    agent: agentBoQuaTLS,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  if (!res.ok || (json && json.code && json.code !== '0')) {
    throw new Error(`HikCentral trả lỗi (HTTP ${res.status}): ${text.slice(0, 500)}`);
  }
  return json;
}

// Tra cứu bản ghi xe qua (ANPR) trong N phút gần nhất — endpoint theo tài liệu
// HikCentral Professional OpenAPI: POST /artemis/api/pms/v1/crossRecords/page
async function layBienSoMoiQuetDuoc() {
  const now = new Date();
  const tu = new Date(now.getTime() - cfg.soPhutQuetLaiMoiLan * 60000);
  const data = await goiArtemis('/artemis/api/pms/v1/crossRecords/page', {
    pageNo: 1,
    pageSize: 200,
    startTime: tu.toISOString(),
    endTime: now.toISOString(),
  });
  const danhSach = data?.data?.list || data?.data?.records || [];
  return danhSach
    .map((r) => ({
      plate: (r.plateNo || r.plateNumber || r.licensePlate || '').toString().trim().toUpperCase(),
      thoiGian: r.crossTime || r.passTime || r.recordTime || now.toISOString(),
      idBanGhi: r.crossRecordId || r.recordId || r.id,
    }))
    .filter((r) => r.plate);
}

// -----------------------------------------------------------------------------
// Đẩy các biển số mới lên phần mềm quản lý mỏ (API đã có sẵn, dùng chung với
// luồng "kết nối Excel" cũ — dữ liệu sẽ tự thành sự kiện "gate_in" trên phần
// mềm, y hệt như bảo vệ quét cổng vào bằng tay).
// -----------------------------------------------------------------------------
async function dayLenPhanMem(danhSachBienSo) {
  if (danhSachBienSo.length === 0) return { added: 0 };
  const res = await fetch(cfg.netlifyImportUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plates: danhSachBienSo.map((r) => ({
        plate: r.plate,
        loaiXe: '25m3',
        // excelRowKey dùng để chống trùng — vốn dùng cho luồng đọc file Excel,
        // ở đây tận dụng lại bằng id bản ghi camera (hoặc biển số+thời gian).
        excelRowKey: `camera-${r.idBanGhi || r.plate + '-' + r.thoiGian}`,
      })),
    }),
  });
  if (!res.ok) throw new Error(`Đẩy dữ liệu lên phần mềm thất bại (HTTP ${res.status}): ${await res.text()}`);
  return res.json();
}

async function chayMotVong() {
  try {
    const bienSo = await layBienSoMoiQuetDuoc();
    if (bienSo.length === 0) { console.log(`[${new Date().toLocaleTimeString('vi-VN')}] Không có biển số mới.`); return; }
    const ketQua = await dayLenPhanMem(bienSo);
    console.log(`[${new Date().toLocaleTimeString('vi-VN')}] Quét được ${bienSo.length} biển số (${bienSo.map((b) => b.plate).join(', ')}) — đã thêm mới ${ketQua.added} vào phần mềm.`);
  } catch (e) {
    console.error(`[${new Date().toLocaleTimeString('vi-VN')}] ❌ Lỗi: ${e.message}`);
  }
}

console.log('✅ Chương trình cầu nối camera đã khởi động.');
console.log(`   Trang camera: ${cfg.hikcentralBaseUrl}`);
console.log(`   Phần mềm nhận dữ liệu: ${cfg.netlifyImportUrl}`);
console.log(`   Cứ mỗi ${cfg.khoangCachKiemTraGiay} giây sẽ kiểm tra 1 lần. Nhấn Ctrl+C để dừng.\n`);

chayMotVong();
setInterval(chayMotVong, Math.max(3, cfg.khoangCachKiemTraGiay) * 1000);
