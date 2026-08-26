// camera-agent/doc-man-hinh.js
// -----------------------------------------------------------------------------
// CHƯƠNG TRÌNH ĐỌC MÀN HÌNH (OCR) — chạy trên ĐÚNG MÁY TÍNH đang mở sẵn phần
// mềm "HikCentral Professional Control Client" với khung "Vehicle" (danh sách
// xe vừa nhận diện) hiển thị bên phải màn hình.
//
// KHÁC VỚI index.js (chương trình cầu nối qua AppKey/AppSecret):
//  - KHÔNG cần đăng nhập, KHÔNG cần bật "Open Platform", KHÔNG cần AppKey/
//    AppSecret — chỉ cần máy tính đang BẬT SẴN, MÀN HÌNH ĐANG MỞ đúng khung
//    "Vehicle" hiển thị biển số + thời gian như bình thường mọi khi.
//  - Cách làm: cứ vài giây, chương trình tự chụp lại màn hình (giống bấm
//    Print Screen), rồi dùng công nghệ "nhận dạng chữ trong ảnh" (OCR) để đọc
//    ra biển số + thời gian đang hiển thị trong khung đó, rồi đẩy lên phần
//    mềm quản lý mỏ — KHÔNG can thiệp gì vào phần mềm HikCentral, chỉ "nhìn"
//    vào màn hình giống như người thật đang đọc và chép lại.
//
// ĐÁNH ĐỔI CẦN BIẾT (so với Cách 1 — bấm Export thủ công):
//  - Ưu điểm: hoàn toàn tự động, không cần ai bấm Export mỗi ca.
//  - Nhược điểm: đọc bằng máy (OCR) nên THỈNH THOẢNG CÓ THỂ ĐỌC NHẦM 1 KÝ TỰ
//    (ví dụ nhầm số "8" thành chữ "B"), khác với Cách 1 có bước người xem lại
//    từng biển số trước khi xuất. Vì vậy: (1) nên thỉnh thoảng đối chiếu lại
//    vài lượt xe với đúng ảnh camera để yên tâm, (2) nếu thấy sai nhiều, báo
//    lại để chỉnh quy tắc đọc cho khớp đúng font chữ/độ phân giải máy đang
//    dùng, (3) CỬA SỔ phần mềm HikCentral phải luôn hiển thị trên màn hình,
//    không được thu nhỏ (minimize) hay bị cửa sổ khác che mất.
//
// CẦN GÌ TRƯỚC KHI DÙNG:
//  1. Node.js bản 18 trở lên đã cài trên máy tính này (tải tại nodejs.org).
//  2. Sao chép config.example.json -> config.json (nếu chưa có sẵn từ trước)
//     — với chương trình này CHỈ CẦN giữ đúng dòng "netlifyImportUrl", KHÔNG
//     cần điền AppKey/AppSecret.
//  3. Mở sẵn phần mềm "HikCentral Professional Control Client", vào đúng màn
//     hình đang hiển thị khung "Vehicle" (danh sách xe) như bình thường, để
//     nguyên trên màn hình (không thu nhỏ).
//
// CÁCH CHẠY:
//   cd camera-agent
//   npm install          (chỉ cần làm 1 lần đầu — sẽ tự tải các thư viện chụp
//                          màn hình + đọc chữ trong ảnh cần dùng)
//   node doc-man-hinh.js
//   -> Để chạy NỀN LIÊN TỤC, có thể đặt lệnh này vào Task Scheduler của
//      Windows giống hướng dẫn với index.js trong README.md.
// -----------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const screenshot = require('screenshot-desktop');
const { createWorker } = require('tesseract.js');

const duongDanConfig = path.join(__dirname, 'config.json');
if (!fs.existsSync(duongDanConfig)) {
  console.error('\n❌ Chưa có file config.json.');
  console.error('   Hãy sao chép config.example.json thành config.json rồi chạy lại (chương trình này không cần điền AppKey/AppSecret).\n');
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(duongDanConfig, 'utf8'));

if (!cfg.netlifyImportUrl) {
  console.error('\n❌ Thiếu "netlifyImportUrl" trong config.json.\n');
  process.exit(1);
}

const manHinhSo = Number.isInteger(cfg.manHinhSo) ? cfg.manHinhSo : 0;
const khoangCachGiay = Math.max(5, cfg.khoangCachDocManHinhGiay || 10);
const vungManHinh = cfg.vungManHinh || null; // {x,y,rong,cao} hoặc null = toàn màn hình

// -----------------------------------------------------------------------------
// Nhận dạng biển số xe Việt Nam trong 1 dòng chữ đọc được từ ảnh — chấp nhận
// khá rộng (không cố định số ký tự) vì OCR có thể lẫn khoảng trắng/ký tự lạ.
// Ví dụ khớp: "9A778722", "98A12800", "30A12345".
// -----------------------------------------------------------------------------
function tryLayBienSo(dongChu) {
  const chuoiSach = (dongChu || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const khop = chuoiSach.match(/^[0-9]{1,3}[A-Z]{1,2}[0-9]{3,6}$/);
  return khop ? khop[0] : null;
}

// Nhận dạng dòng thời gian dạng "2026/08/26 14:46:12" (đúng định dạng đang
// thấy trên khung "Vehicle" của HikCentral Control Client).
function tryLayThoiGian(dongChu) {
  const khop = (dongChu || '').match(/(\d{4})\D(\d{2})\D(\d{2})\D+(\d{2}):(\d{2}):(\d{2})/);
  if (!khop) return null;
  const [, nam, thang, ngay, gio, phut, giay] = khop;
  return `${nam}${thang}${ngay}-${gio}${phut}${giay}`;
}

// -----------------------------------------------------------------------------
// Chụp màn hình rồi đọc chữ (OCR) — trả về danh sách các "dòng chữ" đọc được,
// đã sắp theo thứ tự trên-xuống, trái-sang-phải (giống thứ tự hiển thị thật).
// -----------------------------------------------------------------------------
let workerOcr = null;
async function khoiTaoOcr() {
  workerOcr = await createWorker('eng');
}

async function chupVaDocManHinh() {
  let anh = await screenshot({ screen: manHinhSo, format: 'png' });

  if (vungManHinh && vungManHinh.rong && vungManHinh.cao) {
    // Cắt đúng vùng khung "Vehicle" nếu người dùng đã khai báo tọa độ, giúp
    // đọc nhanh hơn và chính xác hơn (bớt lẫn chữ từ video/menu xung quanh).
    const sharp = require('sharp');
    anh = await sharp(anh)
      .extract({ left: vungManHinh.x || 0, top: vungManHinh.y || 0, width: vungManHinh.rong, height: vungManHinh.cao })
      .toBuffer();
  }

  const ket = await workerOcr.recognize(anh, {}, { blocks: true });
  const dong = [];
  for (const block of ket.data.blocks || []) {
    for (const doan of block.paragraphs || []) {
      for (const d of doan.lines || []) {
        dong.push({ text: (d.text || '').trim(), y: d.bbox ? d.bbox.y0 : 0 });
      }
    }
  }
  dong.sort((a, b) => a.y - b.y);
  return dong;
}

// -----------------------------------------------------------------------------
// Ghép mỗi dòng "biển số" với dòng "thời gian" gần nó nhất phía dưới (đúng
// như cách khung "Vehicle" hiển thị: biển số ở trên, thời gian ngay bên dưới)
// để tạo 1 mã định danh riêng cho từng lượt xe — nhờ đó xe cũ vẫn còn hiển thị
// trên màn hình ở vòng quét sau sẽ KHÔNG bị đẩy lên trùng lặp, còn xe cùng
// biển số quay lại vào giờ khác trong ngày vẫn được ghi nhận là 1 lượt mới.
// -----------------------------------------------------------------------------
function ghepBienSoVaThoiGian(danhSachDong) {
  const ketQua = [];
  for (let i = 0; i < danhSachDong.length; i++) {
    const bienSo = tryLayBienSo(danhSachDong[i].text);
    if (!bienSo) continue;
    let thoiGian = null;
    for (let j = i + 1; j < Math.min(i + 4, danhSachDong.length); j++) {
      if (danhSachDong[j].y - danhSachDong[i].y > 120) break; // quá xa, không cùng 1 mục
      thoiGian = tryLayThoiGian(danhSachDong[j].text);
      if (thoiGian) break;
    }
    // Nếu không đọc được dòng thời gian đi kèm (ảnh mờ, font lạ...), vẫn cứ
    // đẩy lên với mốc theo phút hiện tại — tránh bỏ sót, chấp nhận độ chính
    // xác thời gian thấp hơn 1 chút trong trường hợp hiếm này.
    if (!thoiGian) {
      const now = new Date();
      thoiGian = `phut-${now.toISOString().slice(0, 16)}`;
    }
    ketQua.push({ plate: bienSo, excelRowKey: `ocr-${bienSo}-${thoiGian}` });
  }
  return ketQua;
}

async function dayLenPhanMem(danhSachBienSo) {
  if (danhSachBienSo.length === 0) return { added: 0 };
  const res = await fetch(cfg.netlifyImportUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'camera_hikcentral',
      plates: danhSachBienSo.map((r) => ({ plate: r.plate, loaiXe: '25m3', excelRowKey: r.excelRowKey })),
    }),
  });
  if (!res.ok) throw new Error(`Đẩy dữ liệu lên phần mềm thất bại (HTTP ${res.status}): ${await res.text()}`);
  return res.json();
}

async function chayMotVong() {
  try {
    const dongChu = await chupVaDocManHinh();
    const bienSo = ghepBienSoVaThoiGian(dongChu);
    if (bienSo.length === 0) {
      console.log(`[${new Date().toLocaleTimeString('vi-VN')}] Đọc được ${dongChu.length} dòng chữ trên màn hình, chưa thấy biển số nào khớp mẫu.`);
      return;
    }
    const ketQua = await dayLenPhanMem(bienSo);
    console.log(`[${new Date().toLocaleTimeString('vi-VN')}] Đọc được ${bienSo.length} biển số trên màn hình (${bienSo.map((b) => b.plate).join(', ')}) — đã thêm mới ${ketQua.added} vào phần mềm (số còn lại đã có từ vòng quét trước, không trùng lặp).`);
  } catch (e) {
    console.error(`[${new Date().toLocaleTimeString('vi-VN')}] ❌ Lỗi: ${e.message}`);
  }
}

(async () => {
  console.log('✅ Chương trình đọc màn hình đang khởi động (đang tải công cụ nhận dạng chữ, có thể mất khoảng nửa phút lần đầu)...');
  await khoiTaoOcr();
  console.log('✅ Đã sẵn sàng.');
  console.log(`   Phần mềm nhận dữ liệu: ${cfg.netlifyImportUrl}`);
  console.log(`   Màn hình số: ${manHinhSo}${vungManHinh ? ' — chỉ đọc vùng đã khoanh trong config.json' : ' — đọc toàn màn hình'}`);
  console.log(`   Cứ mỗi ${khoangCachGiay} giây sẽ chụp và đọc lại 1 lần. NHỚ giữ nguyên cửa sổ HikCentral Control Client hiển thị trên màn hình, không thu nhỏ. Nhấn Ctrl+C để dừng.\n`);

  await chayMotVong();
  setInterval(chayMotVong, khoangCachGiay * 1000);
})();
