import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';
import {
  Building2, Truck, Shield, Calculator, LayoutDashboard, LogOut, RefreshCw,
  Download, Plus, CheckCircle2, AlertTriangle, Users, Printer, Radio,
  ClipboardCheck, Camera, Search, Clock, ImageOff, FileWarning, KeyRound,
  MapPin, Wallet, ArrowRightLeft, LogIn, Ban, Bell, Eye, EyeOff, Ruler, History,
  FileSpreadsheet, FileText, Link2, RotateCw,
} from 'lucide-react';

// ============================================================================
// BẢN V3 — áp dụng "Bảng hiệu chỉnh V2.0" (29/07/2026). Thay đổi lớn nhất:
// (1) ĐĂNG NHẬP THẬT bằng tài khoản/mật khẩu (không còn chỉ chọn vai trò)
// (2) Thêm KHÁCH HÀNG + công nợ ứng trước, cảnh báo vàng/đỏ (đã BỎ nhắc nhở "báo dừng" theo V5.0)
// (3) Đảo thứ tự: Kỹ thuật khai báo kích thước/khối lượng/khách hàng NGAY SAU
//     khi xe qua cổng — TRƯỚC khi lái máy xúc xúc (không phải sau như bản cũ)
// (4) Bảo vệ: thêm ghi nhận xe RA cổng + xử lý xe vào không qua cổng
// (5) Lái máy xúc: báo "xe lạ" khi chọn phải xe chưa có trên hệ thống
// (6) Kế toán/Giám đốc/Trụ sở: tổng hợp theo khách hàng, tra soát, máy xúc
// (7) Giám đốc: kiểm soát tọa độ khai thác so với tọa độ cấp phép
//
// Đây vẫn là BẢN XEM TRƯỚC để chạy thử & góp ý tiếp — chưa phải bản chính thức.
// ============================================================================

const ROLES_INFO = {
  banlanhdao: { label: 'Ban lãnh đạo trụ sở (chỉ xem)', icon: Building2 },
  ketoancongty: { label: 'Kế toán công ty (trụ sở)', icon: Wallet },
  giamdoc: { label: 'Giám đốc mỏ', icon: LayoutDashboard },
  kythuat: { label: 'Kỹ thuật — Kiểm tra khối lượng, kích thước xe', icon: ClipboardCheck },
  ketoan: { label: 'Kế toán mỏ', icon: Calculator },
  baove: { label: 'Bảo vệ cổng', icon: Shield },
  laixuc: { label: 'Lái máy xúc', icon: Truck },
};
const DASHBOARD_ROLES = ['banlanhdao', 'ketoancongty', 'giamdoc'];

const LOAI_XE = [
  { id: '25m3', ten: 'Xe ben 25m³ (tiêu chuẩn)', kichThuoc: 'Dài 6,2m × Rộng 2,3m × Cao 1,5m', khoiLuong: 25 },
  { id: '22m3', ten: 'Xe ben 22m³', kichThuoc: 'Dài 5,8m × Rộng 2,3m × Cao 1,4m', khoiLuong: 22 },
  { id: '27m3', ten: 'Xe ben 27m³', kichThuoc: 'Dài 6,6m × Rộng 2,3m × Cao 1,6m', khoiLuong: 27 },
];
const LOAI_XE_MAP = Object.fromEntries(LOAI_XE.map((x) => [x.id, x]));

const DEFAULT_CONFIG = {
  vehicleCapacity: 25,
  excavators: [
    { id: 'XUC-01', name: 'Máy xúc 01' }, { id: 'XUC-02', name: 'Máy xúc 02' },
    { id: 'XUC-03', name: 'Máy xúc 03' }, { id: 'XUC-04', name: 'Máy xúc 04' },
  ],
  operators: [
    { id: 'LX-01', name: 'Lái máy xúc 01' }, { id: 'LX-02', name: 'Lái máy xúc 02' },
    { id: 'LX-03', name: 'Lái máy xúc 03' }, { id: 'LX-04', name: 'Lái máy xúc 04' },
    { id: 'LX-05', name: 'Lái máy xúc 05' }, { id: 'LX-06', name: 'Lái máy xúc 06' },
    { id: 'LX-07', name: 'Lái máy xúc 07' }, { id: 'LX-08', name: 'Lái máy xúc 08' },
  ],
  // Khách hàng — mỗi khách có đơn giá riêng; số dư ứng trước tính bằng sổ cái
  // (customer_deposit trừ dần theo ticket_print), không lưu số dư cứng ở đây.
  customers: [
    { id: 'KH-01', name: 'Cty TNHH Xây dựng Bắc Ninh', donGia: 65000 },
    { id: 'KH-02', name: 'Cty CP San lấp Kép', donGia: 60000 },
  ],
  canhBaoVang: 100000000, // còn dư ≤ mức này -> cảnh báo vàng
  canhBaoDo: 50000000,    // còn dư ≤ mức này -> cảnh báo đỏ
  donGiaBanDat: 65000,
  thietKe: {
    tongTruLuongNguyenKhoi: 831112,
    heSoNoRoi: 1.27,
    theoNam: [
      { nam: 1, nguyenKhoi: 350000 }, { nam: 2, nguyenKhoi: 250000 }, { nam: 3, nguyenKhoi: 231112 },
    ],
  },
  // (Đã bỏ mục kiểm soát tọa độ theo Bảng hiệu chỉnh V4.0)
};

const HAN_KIEM_TRA_NGAY = 3;

// ---------------------------------------------------------------------------
// Tiện ích
// ---------------------------------------------------------------------------
function genId(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function soVN(n) { return Number(n || 0).toLocaleString('vi-VN'); }
function tienVN(n) { return Number(n || 0).toLocaleString('vi-VN') + ' đ'; }
function todayStr() { const d = new Date(Date.now() + 7 * 60 * 60 * 1000); return d.toISOString().slice(0, 10); }
function dayStrOf(iso) { const d = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000); return d.toISOString().slice(0, 10); }
// Chuyển "YYYY-MM-DD" -> "DD/MM/YYYY" đúng chuẩn Việt Nam — sửa lỗi ngày bị
// hiển thị ngược theo Bảng hiệu chỉnh V7.0 (mục IV, VI).
function ngayVN(yyyyMmDd) {
  if (!yyyyMmDd || typeof yyyyMmDd !== 'string') return yyyyMmDd || '';
  const p = yyyyMmDd.split('-');
  if (p.length !== 3) return yyyyMmDd;
  return `${p[2]}/${p[1]}/${p[0]}`;
}
// Bỏ dấu tiếng Việt, dùng để tự sinh username từ họ tên khi thêm tài khoản mới
function boDauTV(s) {
  return (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function taoUsernameTuHoTen(hoTen) {
  return boDauTV(hoTen).replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');
}
function gioVN(iso) {
  try {
    const d = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${hh}:${mm} ${dd}/${mo}`;
  } catch { return iso; }
}
function lastNDays(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(Date.now() + 7 * 60 * 60 * 1000 - i * 86400000); out.push(d.toISOString().slice(0, 10)); }
  return out;
}
function ngayConLai(fromIso) {
  const ms = Date.now() - new Date(fromIso).getTime();
  return Math.round((HAN_KIEM_TRA_NGAY - ms / 86400000) * 10) / 10;
}
function dinhDangGio(ms) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(totalMin / 60)}h ${totalMin % 60}p`;
}

// ---------------------------------------------------------------------------
// Xuất file Excel THẬT (không phải .csv) bằng SheetJS — sheets = { "Tên sheet":
// [[hàng1], [hàng2], ...] }. Theo Bảng hiệu chỉnh V5.0: các báo cáo phải xuất
// được ra Excel để in/lưu, không dùng .csv nữa.
// ---------------------------------------------------------------------------
function xuatExcel(sheets, tenFile) {
  const wb = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([tenSheet, rows]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, tenSheet.slice(0, 31));
  });
  XLSX.writeFile(wb, `${tenFile}.xlsx`);
}

// ---------------------------------------------------------------------------
// Xuất file Word (.doc) từ nội dung HTML — dùng thủ thuật MIME chuẩn để Word
// mở trực tiếp được, không cần thư viện docx nặng chạy trong trình duyệt.
// ---------------------------------------------------------------------------
// Mở 1 CỬA SỔ MỚI cho việc xuất Word — không dùng cách tải ẩn (Blob + click)
// trực tiếp trên trang chính, vì cách đó có thể bị CHẶN trong môi trường an
// toàn (sandbox) mà Claude Artifact chạy. Mở cửa sổ mới giúp thoát khỏi giới
// hạn đó; nội dung LUÔN hiển thị được để người dùng tự lưu thủ công (Ctrl+S)
// ngay cả khi trình duyệt chặn việc tự động tải xuống.
function xuatWord(html, tenFile) {
  const noiDung = `<!DOCTYPE html><html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset='utf-8'><title>${tenFile}</title><style>
      body{font-family:'Times New Roman',serif;font-size:13pt;color:#000;background:#fff;margin:0;padding:14mm}
      table{border-collapse:collapse;width:100%} td,th{border:1px solid #000;padding:4px}
      .ct{text-align:center} .khonvien,.khonvien td,.khonvien th{border:none}
      .goi-y{font-family:Arial,sans-serif;font-size:10pt;color:#a15c00;background:#fff6e5;border:1px solid #f0c078;padding:8px 10px;margin-bottom:14px}
    </style></head><body>
      <div class="goi-y">💡 Để lưu thành file Word: nhấn <b>Ctrl+S</b> (hoặc File → Save As) rồi chọn nơi lưu — file sẽ tự tải xuống ngay, dòng ghi chú này sẽ không có trong file.</div>
      ${html}
    </body></html>`;
  const cuaSo = window.open('', '_blank');
  if (!cuaSo) { console.error('Trình duyệt chặn cửa sổ mới khi xuất Word'); return; }
  cuaSo.document.write(noiDung);
  cuaSo.document.close();
  // Thử tự tải xuống NGAY TỪ cửa sổ mới (thường không bị chặn vì đây là cửa
  // sổ độc lập, không nằm trong khung sandbox) — nếu vẫn bị chặn, người dùng
  // vẫn thấy đầy đủ nội dung và tự lưu bằng Ctrl+S như gợi ý phía trên.
  setTimeout(() => {
    try {
      const blob = new cuaSo.Blob(['\ufeff', noiDung], { type: 'application/msword' });
      const url = cuaSo.URL.createObjectURL(blob);
      const a = cuaSo.document.createElement('a');
      a.href = url; a.download = `${tenFile}.doc`;
      cuaSo.document.body.appendChild(a);
      a.click();
    } catch (e) { console.error('Không tự tải xuống được, người dùng cần tự lưu bằng Ctrl+S', e); }
  }, 200);
}

// In TRỰC TIẾP bằng 1 cửa sổ riêng chỉ chứa đúng nội dung cần in — sửa đúng
// lỗi "ấn In không ra được / in cả trang" vì window.print() trên trang chính
// in luôn toàn bộ giao diện phần mềm phía sau, không chỉ riêng biên bản/báo
// cáo. Khổ giấy mặc định A4 — truyền khoGiay='80mm' cho phiếu nhiệt.
function inTrucTiep(html, tieuDe, khoGiay) {
  const cuaSo = window.open('', '_blank', 'width=800,height=900');
  if (!cuaSo) { console.error('Trình duyệt chặn cửa sổ in — cần cho phép popup'); return false; }
  const khoGiayCSS = khoGiay === '80mm' ? '@page{size:80mm auto;margin:4mm}' : '@page{size:A4;margin:14mm}';
  cuaSo.document.write(`<!DOCTYPE html><html><head><meta charset='utf-8'><title>${tieuDe}</title><style>
    ${khoGiayCSS}
    body{font-family:'Times New Roman',serif;font-size:${khoGiay === '80mm' ? '10pt' : '13pt'};color:#000;margin:0;padding:${khoGiay === '80mm' ? '4mm' : '10mm'}}
    table{border-collapse:collapse;width:100%} td,th{border:1px solid #000;padding:4px;font-size:inherit}
    .ct{text-align:center} .khonvien,.khonvien td,.khonvien th{border:none}
  </style></head><body>${html}</body></html>`);
  cuaSo.document.close();
  cuaSo.onload = () => { cuaSo.focus(); cuaSo.print(); };
  setTimeout(() => { try { cuaSo.focus(); cuaSo.print(); } catch {} }, 400);
  return true;
}

// ---------------------------------------------------------------------------
// Lưu trữ dùng chung (window.storage — bộ nhớ dùng chung của Artifact)
// ---------------------------------------------------------------------------
// Hoạt động ở CẢ 2 môi trường: bản xem trước trong Claude Artifact (dùng
// window.storage có sẵn) VÀ bản triển khai thật trên Netlify (gọi API
// /api/kv do Netlify Functions + Netlify Blobs cung cấp — xem thư mục
// netlify-deploy/ đi kèm để triển khai thật).
// Hoạt động ở CẢ 2 môi trường: bản xem trước trong Claude Artifact (dùng
// window.storage có sẵn) VÀ bản triển khai thật trên Netlify (gọi API
// /api/kv do Netlify Functions + Netlify Blobs cung cấp). Trên Netlify thật,
// lần gọi đầu tiên sau khi vừa deploy có thể bị "khởi động nguội" (cold
// start) hoặc lỗi mạng thoáng qua — nên THỬ LẠI vài lần trước khi coi là
// không có dữ liệu, tránh lỗi giả "Không tìm thấy tài khoản".
const CO_ARTIFACT_STORAGE = typeof window !== 'undefined' && typeof window.storage !== 'undefined';
function cho(ms) { return new Promise((r) => setTimeout(r, ms)); }
// QUAN TRỌNG: window.storage của Claude Artifact CŨNG là bộ nhớ dùng chung
// qua mạng giữa nhiều người dùng/thiết bị cùng lúc — CŨNG có độ trễ đồng bộ
// giống hệt Netlify Blobs, không phải bộ nhớ tức thời trên máy. Trước đây chỉ
// nhánh Netlify được thử lại khi lỗi, còn nhánh Artifact chỉ thử 1 lần rồi
// báo lỗi ngay — đây chính là nguyên nhân lỗi "Không tìm thấy tài khoản" vẫn
// xảy ra ngay trên bản demo trực tiếp (không chỉ trên Netlify). Nay CẢ 2
// nhánh đều thử lại nhiều lần trước khi coi là thất bại thật sự.
async function storageGet(key, shared, fallback) {
  let loiCuoi = null;
  for (let lan = 0; lan < 5; lan++) {
    try {
      if (CO_ARTIFACT_STORAGE) {
        const res = await window.storage.get(key, shared);
        return res ? JSON.parse(res.value) : fallback;
      }
      const res = await fetch(`/api/kv?key=${encodeURIComponent(key)}`);
      if (!res.ok) { loiCuoi = new Error('HTTP ' + res.status); await cho(400 * (lan + 1)); continue; }
      const data = await res.json();
      return data.value === undefined || data.value === null ? fallback : data.value;
    } catch (e) {
      loiCuoi = e;
      // window.storage báo "not found" khi key chưa từng tồn tại — đây là
      // trường hợp HỢP LỆ (không phải lỗi mạng), trả fallback ngay, không thử lại.
      if (CO_ARTIFACT_STORAGE && /not found/i.test(String(e?.message || e))) return fallback;
      await cho(300 * (lan + 1));
    }
  }
  console.error('storageGet thất bại sau nhiều lần thử:', key, loiCuoi);
  return fallback;
}
async function storageSet(key, value, shared) {
  let loiCuoi = null;
  for (let lan = 0; lan < 5; lan++) {
    try {
      if (CO_ARTIFACT_STORAGE) { await window.storage.set(key, JSON.stringify(value), shared); return; }
      const res = await fetch('/api/kv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }) });
      if (res.ok) return;
      loiCuoi = new Error('HTTP ' + res.status);
    } catch (e) { loiCuoi = e; }
    await cho(300 * (lan + 1));
  }
  console.error('storageSet thất bại sau nhiều lần thử:', key, loiCuoi);
}

// ---------------------------------------------------------------------------
// Mật khẩu — băm bằng Web Crypto (SHA-256 + salt). CHỈ dùng cho bản demo xem
// trước; bản chính thức (Netlify) đã dùng scrypt phía máy chủ, an toàn hơn.
// ---------------------------------------------------------------------------
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
// Đúng 20 tài khoản cá nhân theo "Danh sách tài khoản đăng nhập vào phần
// mềm" công ty cung cấp (Bảng hiệu chỉnh V7.0, mục I.1) — mỗi người 1 tài
// khoản riêng, không dùng chung nữa. [username, họ tên, chức danh, phân hệ]
// CHỈ 1 tài khoản khởi tạo duy nhất để đăng nhập lần đầu (Tổng Giám đốc) —
// theo Bảng hiệu chỉnh V10.0: "Xóa hết các tài khoản giả định ban đầu".
// Toàn bộ tài khoản khác (Bảo vệ, Kỹ thuật, Lái xúc, Kế toán...) phải được
// Ban lãnh đạo tự thêm qua "Quản lý tài khoản", hoặc qua luồng "Yêu cầu tài
// khoản mới" ở màn đăng nhập — không còn dữ liệu giả định sẵn nữa.
const TAI_KHOAN_MAC_DINH = [
  ['nguyenvanthong', 'Nguyễn Văn Thống', 'Tổng Giám đốc', 'banlanhdao'],
];
// Tự động VÁ danh sách tài khoản nếu thiếu bất kỳ tài khoản mặc định nào — sự
// cố "mất tài khoản Trụ sở chính" từng gặp là do dữ liệu cũ (từ bản trước khi
// có tài khoản này) chưa từng được bổ sung; hàm này đảm bảo dù dữ liệu cũ đến
// đâu, các tài khoản mặc định luôn tồn tại đầy đủ mà không xóa/ghi đè tài
// khoản khác đã có (VD: tài khoản do Ban lãnh đạo tự thêm sau này).
//
// SỬA LỖI NGHIÊM TRỌNG (đã xảy ra thực tế qua video): nếu đọc "users" gặp
// trục trặc mạng thoáng qua và trả về rỗng, hàm CŨ hiểu nhầm là "chưa từng có
// ai dùng" rồi GHI ĐÈ tạo lại từ đầu — XOÁ SẠCH mọi tài khoản thật đã tạo
// trước đó (kể cả vừa tạo xong). Nay dùng thêm 1 cờ "users_bootstrap_done":
// MỘT KHI đã khởi tạo thành công lần đầu, tuyệt đối không bao giờ ghi đè lại
// theo kiểu "tạo mới từ đầu" nữa, dù lần đọc sau có thất bại đến đâu.
async function seedUsersIfNeeded() {
  const make = async (username, hoTen, chucDanh, role) => {
    const { salt, hash } = await hashPassword('ThongNhat@123');
    return { id: username, username, name: hoTen, chucDanh, role, salt, hash, mustChangePassword: true, active: true };
  };
  const daKhoiTao = await storageGet('users_bootstrap_done', true, false);
  const existing = await storageGet('users', true, null);

  if (existing) {
    const thieuTaiKhoan = TAI_KHOAN_MAC_DINH.filter(([u]) => !existing.some((x) => x.username === u));
    if (thieuTaiKhoan.length === 0) return existing;
    const boSung = await Promise.all(thieuTaiKhoan.map(([u, n, c, r]) => make(u, n, c, r)));
    const daVa = [...existing, ...boSung];
    await storageSet('users', daVa, true);
    if (!daKhoiTao) await storageSet('users_bootstrap_done', true, true);
    return daVa;
  }

  // Đọc ra rỗng — nếu ĐÃ TỪNG khởi tạo trước đó, đây gần như chắc chắn là lỗi
  // đọc tạm thời (mạng chậm/đồng bộ trễ), TUYỆT ĐỐI không ghi đè để tránh mất
  // dữ liệu thật — trả về mảng rỗng, màn hình gọi hàm này tự xử lý (báo lỗi/
  // thử lại) thay vì coi đây là danh sách tài khoản thật.
  if (daKhoiTao) {
    console.error('CẢNH BÁO: đọc "users" thất bại dù đã từng khởi tạo trước đó — KHÔNG ghi đè để tránh xoá mất tài khoản thật. Vui lòng thử lại.');
    return null;
  }

  // Thật sự lần đầu tiên chưa từng khởi tạo — tạo tài khoản mặc định đầu tiên.
  const users = await Promise.all(TAI_KHOAN_MAC_DINH.map(([u, n, c, r]) => make(u, n, c, r)));
  await storageSet('users', users, true);
  await storageSet('users_bootstrap_done', true, true);
  return users;
}

// Nén ảnh nhỏ để lưu demo (không dùng cho lưu trữ lâu dài quy mô lớn)
function fileToThumbnail(file, maxW = 220) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.55));
      };
      img.onerror = reject; img.src = e.target.result;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}

function PseudoQR({ seed, size = 80 }) {
  const cells = 10;
  const rnd = (i) => { let h = 0; const s = seed + '-' + i; for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) >>> 0; return h % 2 === 0; };
  const cellSize = size / cells; const boxes = [];
  for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) if (rnd(y * cells + x)) boxes.push(<rect key={`${x}-${y}`} x={x * cellSize} y={y * cellSize} width={cellSize} height={cellSize} fill="#111" />);
  return <svg width={size} height={size} className="bg-white rounded p-1">{boxes}</svg>;
}

// ---------------------------------------------------------------------------
// Thành phần dùng chung
// ---------------------------------------------------------------------------
function TopBar({ session, onLogout, onChangePassword, onlineCount, syncing }) {
  const info = ROLES_INFO[session.role];
  const Icon = info?.icon || Users;
  return (
    <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur border-b-2 border-orange-600 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-orange-800 flex items-center justify-center font-black text-white text-sm">TN</div>
        <div>
          <div className="font-bold text-white text-sm leading-tight">MỎ ĐẤT KHUÔN GIÀN — BẢN XEM TRƯỚC V3</div>
          <div className="text-slate-400 text-xs leading-tight">Công ty CP Dịch vụ và Thương mại Thống Nhất</div>
        </div>
      </div>
      <div className="flex items-center gap-2.5 text-xs flex-wrap">
        <div className="flex items-center gap-1.5 text-emerald-400" title="Số người đang mở liên kết này trong 60 giây qua">
          <Radio className="w-3.5 h-3.5" /><span>{onlineCount} người đang xem</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-400">
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} /><span>{syncing ? 'Đang đồng bộ...' : 'Đã đồng bộ'}</span>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-full px-3 py-1.5">
          <Icon className="w-3.5 h-3.5 text-orange-500" /><span className="text-slate-200">{session.name}{session.chucDanh ? ` — ${session.chucDanh}` : ''}</span>
        </div>
        <button onClick={onChangePassword} className="flex items-center gap-1 text-slate-400 hover:text-white"><KeyRound className="w-3.5 h-3.5" /> Đổi MK</button>
        <button onClick={onLogout} className="flex items-center gap-1 text-slate-400 hover:text-white"><LogOut className="w-3.5 h-3.5" /> Đăng xuất</button>
      </div>
    </div>
  );
}
function Toast({ msg, err }) {
  if (!msg) return null;
  return <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-lg font-semibold text-sm shadow-2xl max-w-[90vw] text-center ${err ? 'bg-red-600 text-white' : 'bg-emerald-500 text-emerald-950'}`}>{msg}</div>;
}
function Card({ children, className = '' }) { return <div className={`bg-slate-800 border border-slate-700 rounded-xl p-4 ${className}`}>{children}</div>; }
function StatBox({ label, value, sub }) {
  return (
    <div className="bg-slate-800 border border-slate-700 border-l-4 border-l-orange-600 rounded-xl px-4 py-3">
      <div className="text-2xl font-extrabold text-white tabular-nums">{value}</div>
      <div className="text-slate-400 text-xs mt-0.5">{label}</div>
      {sub && <div className="text-slate-500 text-[11px] mt-0.5">{sub}</div>}
    </div>
  );
}
function SectionTitle({ children }) { return <h2 className="text-amber-400 font-bold border-l-4 border-orange-600 pl-3 mt-6 mb-3">{children}</h2>; }
function useToast() {
  const [toast, setToast] = useState(null);
  const notify = (msg, err) => { setToast({ msg, err }); setTimeout(() => setToast(null), 2600); };
  return [toast, notify];
}
// Thay thế TOÀN BỘ prompt()/confirm() gốc của trình duyệt — các hộp thoại này
// bị CHẶN trong môi trường sandbox mà Claude Artifact chạy, khiến các nút
// "Thêm khách hàng", "Nạp tiền", "Thêm tài khoản"... bấm không có phản ứng gì
// (Bảng hiệu chỉnh V9.0). Hook này dựng hộp thoại nhập liệu/xác nhận ngay
// trong giao diện ứng dụng, không phụ thuộc API trình duyệt bị chặn.
function useHopThoai() {
  const [hopThoai, setHopThoai] = useState(null);
  const [giaTriNhap, setGiaTriNhap] = useState({});

  const hoi = (tieuDe, truong) => new Promise((resolve) => {
    const gt = {}; truong.forEach((t) => { gt[t.key] = t.giaTri ?? ''; });
    setGiaTriNhap(gt);
    setHopThoai({ tieuDe, truong, resolve });
  });
  const hoiXacNhan = (tieuDe) => new Promise((resolve) => setHopThoai({ tieuDe, xacNhan: true, resolve }));
  const dong = (ketQua) => { if (hopThoai) hopThoai.resolve(ketQua); setHopThoai(null); };

  const ModalHopThoai = !hopThoai ? null : (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[999] p-4" onClick={() => dong(hopThoai.xacNhan ? false : null)}>
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="text-white text-sm mb-3 whitespace-pre-line font-semibold">{hopThoai.tieuDe}</div>
        {!hopThoai.xacNhan && hopThoai.truong.map((t, idx) => (
          <div key={t.key} className="mb-2">
            {t.nhan && <label className="block text-slate-400 text-xs mb-1">{t.nhan}</label>}
            {t.kieu === 'chon' ? (
              <select autoFocus={idx === 0} value={giaTriNhap[t.key] ?? ''} onChange={(e) => setGiaTriNhap({ ...giaTriNhap, [t.key]: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm">
                {t.tuyChon.map((o) => <option key={o.value} value={o.value}>{o.nhan}</option>)}
              </select>
            ) : (
              <input autoFocus={idx === 0} type={t.kieu || 'text'} value={giaTriNhap[t.key] ?? ''}
                onChange={(e) => setGiaTriNhap({ ...giaTriNhap, [t.key]: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') dong(giaTriNhap); }}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" />
            )}
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button onClick={() => dong(hopThoai.xacNhan ? false : null)} className="bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm font-semibold">Hủy</button>
          <button onClick={() => dong(hopThoai.xacNhan ? true : giaTriNhap)} className="bg-orange-600 hover:bg-orange-700 text-white py-2 rounded-lg text-sm font-bold">Đồng ý</button>
        </div>
      </div>
    </div>
  );
  return { hoi, hoiXacNhan, ModalHopThoai };
}
function canhBaoCongNo(soDu, cfg) {
  if (soDu >= cfg.canhBaoVang) return 'do';
  if (soDu >= cfg.canhBaoDo) return 'vang';
  return 'ok';
}
// Ô nhập mật khẩu có biểu tượng con mắt để hiện/ẩn — theo yêu cầu V3.0
function PasswordInput({ value, onChange, onKeyDown, placeholder, className }) {
  const [hien, setHien] = useState(false);
  return (
    <div className="relative">
      <input type={hien ? 'text' : 'password'} value={value} onChange={onChange} onKeyDown={onKeyDown} placeholder={placeholder}
        className={className || 'w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 pr-10 text-white outline-none focus:border-orange-500'} />
      <button type="button" tabIndex={-1} onClick={() => setHien(!hien)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
        {hien ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ĐĂNG NHẬP (thay cho chọn vai trò đơn thuần)
// ---------------------------------------------------------------------------
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loi, setLoi] = useState('');
  const [dangXuLy, setDangXuLy] = useState(false);
  const [moYeuCau, setMoYeuCau] = useState(false);
  const [ycHoTen, setYcHoTen] = useState('');
  const [ycChucDanh, setYcChucDanh] = useState('');
  const [ycPhanHe, setYcPhanHe] = useState('baove');
  const [ganDay, setGanDay] = useState(null); // null = đang tải; [] = chưa có ai đăng nhập trên máy này
  const [chonThuCong, setChonThuCong] = useState(false);
  const [toast, notify] = useToast();

  // Danh sách "tài khoản gần đây trên THIẾT BỊ NÀY" — lưu ở bộ nhớ RIÊNG
  // (shared:false, chỉ máy này thấy), khác hẳn danh sách công khai đã bỏ ở
  // V8.0 vì lý do bảo mật. Theo Bảng hiệu chỉnh V9.0 mục I.1.
  useEffect(() => { (async () => { setGanDay(await storageGet('recent_logins', false, [])); })(); }, []);

  const dangNhap = async (tenDangNhap) => {
    setLoi('');
    const u2 = (tenDangNhap ?? username).trim();
    if (!u2 || !password) { setLoi('Vui lòng nhập tài khoản và mật khẩu'); return; }
    setDangXuLy(true);
    const users = await seedUsersIfNeeded();
    setDangXuLy(false);
    if (!users) { setLoi('Không kết nối được tới máy chủ lúc này — vui lòng thử lại sau vài giây.'); return; }
    const u = users.find((x) => x.username === u2.toLowerCase());
    if (!u) { setLoi('Sai tài khoản hoặc mật khẩu'); return; }
    if (!u.active) { setLoi('Tài khoản này đã bị KHOÁ — liên hệ Ban lãnh đạo để mở lại.'); return; }
    const ok = await verifyPassword(password, u.salt, u.hash);
    if (!ok) { setLoi('Sai tài khoản hoặc mật khẩu'); return; }
    // Ghi lại vào danh sách "gần đây trên thiết bị này"
    const dsHienTai = ganDay || [];
    const daCo = dsHienTai.some((g) => g.username === u.username);
    if (!daCo) {
      const dsMoi = [{ username: u.username, name: u.name, chucDanh: u.chucDanh }, ...dsHienTai].slice(0, 10);
      storageSet('recent_logins', dsMoi, false);
    }
    onLogin({ id: u.id, username: u.username, name: u.name, chucDanh: u.chucDanh, role: u.role, mustChangePassword: u.mustChangePassword });
  };

  const guiYeuCau = async () => {
    if (!ycHoTen.trim() || !ycChucDanh.trim()) return notify('Nhập đủ họ tên và chức danh', true);
    const yeuCau = await storageGet('account_requests', true, []);
    const moi = { id: genId('YC'), hoTen: ycHoTen.trim(), chucDanh: ycChucDanh.trim(), phanHe: ycPhanHe, trangThai: 'cho_duyet', time: new Date().toISOString() };
    await storageSet('account_requests', [...yeuCau, moi], true);
    notify('Đã gửi yêu cầu — chờ Ban lãnh đạo phê duyệt, sẽ có tài khoản sau khi được duyệt.');
    setYcHoTen(''); setYcChucDanh(''); setMoYeuCau(false);
  };

  const hienDanhSachChon = ganDay && ganDay.length > 0 && !chonThuCong && !username;

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-5">
      <div className="w-full max-w-sm">
        <div className="text-center mb-7">
          <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-800 flex items-center justify-center font-black text-2xl text-white shadow-lg shadow-orange-900/40">TN</div>
          <div className="text-white font-extrabold tracking-wide">CÔNG TY CP DỊCH VỤ VÀ THƯƠNG MẠI THỐNG NHẤT</div>
          <div className="text-slate-400 text-sm mt-1">Đăng nhập bản xem trước — Mỏ đất Khuôn Giàn 3</div>
        </div>

        {hienDanhSachChon ? (
          <Card>
            <div className="text-slate-400 text-xs mb-2">Tài khoản đã dùng trên máy này — bấm chọn rồi nhập mật khẩu:</div>
            <div className="space-y-1.5 mb-3">
              {ganDay.map((g) => (
                <button key={g.username} onClick={() => setUsername(g.username)} className="w-full flex items-center justify-between bg-slate-950 border border-slate-700 hover:border-orange-500 rounded-lg px-3 py-2.5 text-left">
                  <span className="text-white text-sm font-semibold">{g.name} <span className="text-slate-500 font-normal">— {g.chucDanh}</span></span>
                  <span className="text-orange-400 text-xs">Chọn</span>
                </button>
              ))}
            </div>
            <button onClick={() => setChonThuCong(true)} className="w-full text-orange-400 text-xs underline">Đăng nhập tài khoản khác</button>
          </Card>
        ) : (
          <Card>
            <label className="block text-slate-400 text-xs mb-1.5">Tài khoản cá nhân</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Tài khoản do Ban lãnh đạo cấp"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white outline-none focus:border-orange-500 mb-3" />
            <label className="block text-slate-400 text-xs mb-1.5">Mật khẩu</label>
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && dangNhap()} />
            {loi && <div className="text-red-400 text-xs mt-2">{loi}</div>}
            <button disabled={dangXuLy} onClick={() => dangNhap()} className="w-full mt-3 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2">
              <LogIn className="w-4 h-4" /> {dangXuLy ? 'Đang kiểm tra...' : 'Đăng nhập'}
            </button>
            {ganDay && ganDay.length > 0 && <button onClick={() => { setChonThuCong(false); setUsername(''); }} className="w-full mt-2 text-slate-500 text-xs underline">← Quay lại danh sách đã dùng</button>}
          </Card>
        )}

        <button onClick={() => setMoYeuCau(!moYeuCau)} className="w-full mt-3 text-orange-400 text-xs underline">{moYeuCau ? 'Đóng' : 'Chưa có tài khoản? Yêu cầu tài khoản mới'}</button>
        {moYeuCau && (
          <Card className="mt-2">
            <label className="block text-slate-400 text-xs mb-1">Họ và tên</label>
            <input value={ycHoTen} onChange={(e) => setYcHoTen(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm mb-2" />
            <label className="block text-slate-400 text-xs mb-1">Chức danh</label>
            <input value={ycChucDanh} onChange={(e) => setYcChucDanh(e.target.value)} placeholder="VD: Bảo vệ, Lái máy xúc..." className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm mb-2" />
            <label className="block text-slate-400 text-xs mb-1">Phân hệ công việc</label>
            <select value={ycPhanHe} onChange={(e) => setYcPhanHe(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm mb-3">
              {Object.entries(NHAN_PHAN_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button onClick={guiYeuCau} className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2.5 rounded-lg text-sm">Gửi yêu cầu — chờ Ban lãnh đạo duyệt</button>
          </Card>
        )}

        <div className="mt-4 bg-amber-500/10 border border-amber-600 rounded-lg p-3 text-amber-300 text-xs">
          <b>Bản demo:</b> mật khẩu ban đầu của tài khoản do Ban lãnh đạo cấp đều là <code>ThongNhat@123</code>, bắt buộc đổi ngay lần đăng nhập đầu.
        </div>
        <Toast msg={toast?.msg} err={toast?.err} />
      </div>
    </div>
  );
}

function ChangePasswordScreen({ session, onDone, batBuoc }) {
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPass2, setNewPass2] = useState('');
  const [toast, notify] = useToast();
  const [dangThuLai, setDangThuLai] = useState(false);

  // Đọc "users" kèm THỬ LẠI THÊM ở chính bước quan trọng này (ngoài số lần
  // storageGet đã tự thử) — lần deploy đầu tiên lên Netlify có thể có độ trễ
  // khởi động nguội (cold start) dài hơn bình thường. TUYỆT ĐỐI không dùng
  // fallback rỗng [] để rồi hiểu nhầm "không tìm thấy tài khoản" — phải phân
  // biệt rõ "đọc thất bại" (null) với "tài khoản thật sự không có" (mảng có
  // dữ liệu nhưng không khớp id).
  const docUsersChacChan = async () => {
    for (let lan = 0; lan < 3; lan++) {
      const users = await storageGet('users', true, null);
      if (users) return users;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return null;
  };

  const doiMatKhau = async () => {
    if (newPass.length < 6) return notify('Mật khẩu mới phải từ 6 ký tự', true);
    if (newPass !== newPass2) return notify('Nhập lại mật khẩu không khớp', true);
    setDangThuLai(true);
    const users = await docUsersChacChan();
    setDangThuLai(false);
    if (!users) return notify('Không kết nối được máy chủ lúc này — vui lòng đợi vài giây rồi bấm lại "Cập nhật mật khẩu".', true);
    const u = users.find((x) => x.id === session.id);
    if (!u) return notify('Không tìm thấy tài khoản', true);
    if (!batBuoc) {
      const ok = await verifyPassword(oldPass, u.salt, u.hash);
      if (!ok) return notify('Mật khẩu hiện tại không đúng', true);
    }
    const { salt, hash } = await hashPassword(newPass);
    const next = users.map((x) => (x.id === u.id ? { ...x, salt, hash, mustChangePassword: false } : x));
    await storageSet('users', next, true);
    notify('Đổi mật khẩu thành công');
    setTimeout(() => onDone(), 900);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-5">
      <div className="w-full max-w-sm">
        {batBuoc && (
          <div className="mb-4 bg-amber-500/10 border border-amber-600 rounded-lg p-3 text-amber-300 text-xs">
            ⚠️ Đây là mật khẩu mặc định — vui lòng đổi trước khi tiếp tục sử dụng hệ thống.
          </div>
        )}
        <h1 className="text-white font-bold text-lg mb-3">Đổi mật khẩu — {session.name}</h1>
        <Card>
          {!batBuoc && (
            <>
              <label className="block text-slate-400 text-xs mb-1.5">Mật khẩu hiện tại</label>
              <PasswordInput value={oldPass} onChange={(e) => setOldPass(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 pr-10 text-white mb-3" />
            </>
          )}
          <label className="block text-slate-400 text-xs mb-1.5">Mật khẩu mới (từ 6 ký tự)</label>
          <PasswordInput value={newPass} onChange={(e) => setNewPass(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 pr-10 text-white mb-3" />
          <label className="block text-slate-400 text-xs mb-1.5">Nhập lại mật khẩu mới</label>
          <PasswordInput value={newPass2} onChange={(e) => setNewPass2(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 pr-10 text-white" />
          <button disabled={dangThuLai} onClick={doiMatKhau} className="w-full mt-3 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-bold py-3 rounded-lg">{dangThuLai ? 'Đang kiểm tra...' : 'Cập nhật mật khẩu'}</button>
          {!batBuoc && <button onClick={onDone} className="w-full mt-2 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2.5 rounded-lg text-sm">Hủy, quay lại</button>}
        </Card>
        <Toast msg={toast?.msg} err={toast?.err} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bảo vệ cổng — thêm: xe RA cổng, cảnh báo xe chưa ghi nhận (báo từ hiện trường)
// ---------------------------------------------------------------------------
function GateScreen({ events, addEvent, addEvents }) {
  const [plate, setPlate] = useState('');
  const [loaiXe, setLoaiXe] = useState(LOAI_XE[0].id);
  const [photo, setPhoto] = useState(null);
  const [plateRa, setPlateRa] = useState('');
  const [xemCauHinhCam, setXemCauHinhCam] = useState(false);
  const [xemLogCam, setXemLogCam] = useState(false);
  const [logCamera, setLogCamera] = useState(null);
  const taiLogCamera = async () => { setLogCamera(await storageGet('camera_log', true, [])); };
  useEffect(() => { if (xemLogCam && logCamera === null) taiLogCamera(); }, [xemLogCam]);
  const [toast, notify] = useToast();

  // (I.1) Kết nối file Excel danh sách xe — theo Bảng hiệu chỉnh V5.0, kết nối
  // QUAN TRỌNG NHẤT của bản này. Ưu tiên File System Access API (Chrome/Edge,
  // đọc lại được file liên tục không cần chọn lại) — nếu trình duyệt không hỗ
  // trợ (Firefox/Safari, hoặc mở qua file://), dùng <input type=file> thường,
  // cần bảo vệ bấm "Chọn lại file" mỗi khi muốn lấy dữ liệu mới nhất.
  const [excelStatus, setExcelStatus] = useState({ ten: null, dongBoLuc: null, soHangMoiNhat: 0, loi: null, dangDongBo: false });
  const fileHandleRef = useRef(null);
  const inputFileRef = useRef(null);
  const hoTroFSA = typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';

  const boDauTV = (s) => (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const nhapDuLieuTuSheet = useCallback((wb) => {
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    if (aoa.length === 0) return { soHang: 0, soMoi: 0 };
    const header = aoa[0].map((h) => boDauTV(h));
    let colPlate = header.findIndex((h) => h.includes('bien so'));
    if (colPlate === -1) colPlate = 0;
    let colLoai = header.findIndex((h) => h.includes('loai xe'));

    const daNhapKeys = new Set(events.filter((e) => e.type === 'gate_in' && e.excelRowKey).map((e) => e.excelRowKey));
    const evsMoi = [];
    for (let r = 1; r < aoa.length; r++) {
      const row = aoa[r];
      const plateRaw = (row[colPlate] || '').toString().trim().toUpperCase();
      if (!plateRaw) continue;
      const key = `${sheetName}-${r}`;
      if (daNhapKeys.has(key)) continue;
      const loaiRaw = colLoai > -1 ? boDauTV(row[colLoai]) : '';
      const loaiXeId = LOAI_XE.find((x) => loaiRaw.includes(x.id.replace('m3', '')))?.id || LOAI_XE[0].id;
      evsMoi.push({ id: genId('GI'), type: 'gate_in', plate: plateRaw, source: 'excel', loaiXe: loaiXeId, photo: null, excelRowKey: key, time: new Date().toISOString() });
    }
    if (evsMoi.length > 0) addEvents(evsMoi);
    return { soHang: aoa.length - 1, soMoi: evsMoi.length };
  }, [events, addEvents]);

  const dongBoTuHandle = useCallback(async (handle) => {
    setExcelStatus((s) => ({ ...s, dangDongBo: true }));
    try {
      const file = await handle.getFile();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const { soHang, soMoi } = nhapDuLieuTuSheet(wb);
      setExcelStatus({ ten: file.name, dongBoLuc: new Date().toISOString(), soHangMoiNhat: soHang, loi: null, dangDongBo: false });
      if (soMoi > 0) notify(`Đã nhập ${soMoi} biển số xe mới từ file Excel`);
    } catch (err) {
      setExcelStatus((s) => ({ ...s, dangDongBo: false, loi: 'Không đọc được file — kiểm tra lại file có đang mở/đúng định dạng .xlsx không.' }));
    }
  }, [nhapDuLieuTuSheet, notify]);

  const ketNoiExcel = async () => {
    if (hoTroFSA) {
      try {
        const [handle] = await window.showOpenFilePicker({ types: [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }] });
        fileHandleRef.current = handle;
        await dongBoTuHandle(handle);
      } catch { /* người dùng hủy chọn file */ }
    } else {
      inputFileRef.current?.click();
    }
  };
  const chonFileThuong = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setExcelStatus((s) => ({ ...s, dangDongBo: true }));
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const { soHang, soMoi } = nhapDuLieuTuSheet(wb);
      setExcelStatus({ ten: f.name, dongBoLuc: new Date().toISOString(), soHangMoiNhat: soHang, loi: null, dangDongBo: false });
      if (soMoi > 0) notify(`Đã nhập ${soMoi} biển số xe mới từ file Excel`);
    } catch { setExcelStatus((s) => ({ ...s, dangDongBo: false, loi: 'Không đọc được file — kiểm tra định dạng .xlsx.' })); }
  };

  // Tự động đồng bộ lại mỗi 10 giây nếu đang giữ handle (chỉ hoạt động ở trình
  // duyệt hỗ trợ File System Access API — Chrome/Edge, trên Netlify https).
  useEffect(() => {
    if (!fileHandleRef.current) return;
    const t = setInterval(() => { if (fileHandleRef.current) dongBoTuHandle(fileHandleRef.current); }, 10000);
    return () => clearInterval(t);
  }, [excelStatus.ten, dongBoTuHandle]);

  const onChonAnh = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { setPhoto(await fileToThumbnail(f)); } catch { notify('Không đọc được ảnh, thử lại', true); }
  };
  const ghiNhan = (plateOverride) => {
    const p = (plateOverride || plate).trim().toUpperCase();
    if (!p) return notify('Vui lòng nhập biển số xe', true);
    addEvent({ id: genId('GI'), type: 'gate_in', plate: p, source: 'thu_cong', loaiXe, photo: photo || null, time: new Date().toISOString() });
    setPlate(''); setPhoto(null);
    notify(`Đã ghi nhận xe ${p} vào cổng`);
  };
  const moPhongCameraDoc = () => {
    const p = `${Math.floor(Math.random() * 99)}${['A','B','C','H','K'][Math.floor(Math.random()*5)]}-${Math.floor(10000+Math.random()*89999)}`;
    addEvent({ id: genId('GI'), type: 'gate_in', plate: p, source: 'camera', loaiXe: LOAI_XE[0].id, photo: null, time: new Date().toISOString() });
    notify(`Camera nhận diện: ${p}`);
  };
  const moPhongCameraCanhBao = () => {
    addEvent({ id: genId('GI'), type: 'gate_in', plate: null, source: 'camera_canhbao', loaiXe: LOAI_XE[0].id, photo: null, needsManualPlate: true, time: new Date().toISOString() });
    notify('⚠ Camera KHÔNG đọc được biển số — cần bảo vệ bổ sung thủ công', true);
  };

  const today = todayStr();
  const homNay = events.filter((e) => e.type === 'gate_in' && dayStrOf(e.time) === today);
  const canBoSung = homNay.filter((e) => e.needsManualPlate).slice().reverse();
  const daXacDinh = homNay.filter((e) => !e.needsManualPlate).slice().reverse();
  const xeRaHomNay = events.filter((e) => e.type === 'gate_out' && dayStrOf(e.time) === today).slice().reverse();

  const canhBaoXeLa = events.filter((e) => e.type === 'missing_plate_alert' && !events.some((r) => r.type === 'missing_plate_resolved' && r.alertId === e.id)).slice().reverse();

  const xuLyCanhBaoXeLa = (alert) => {
    const p = alert.plate.trim().toUpperCase();
    const gateEv = { id: genId('GI'), type: 'gate_in', plate: p, source: 'thu_cong', loaiXe: LOAI_XE[0].id, photo: photo || null, time: new Date().toISOString() };
    const resolvedEv = { id: genId('MR'), type: 'missing_plate_resolved', alertId: alert.id, plate: p, time: new Date().toISOString() };
    addEvents([gateEv, resolvedEv]);
    notify(`Đã bổ sung ghi nhận xe ${p} vào cổng`);
  };

  // Xe đang trong mỏ (đã vào, chưa ra) — để gợi ý khi ghi xe ra cổng
  const tatCaGateIn = events.filter((e) => e.type === 'gate_in' && e.plate);
  const dangTrongMo = tatCaGateIn.filter((g) => !events.some((o) => o.type === 'gate_out' && o.plate === g.plate && o.time > g.time));
  // (I.1) Camera tự động đối chiếu: xe vào cổng từ NGÀY TRƯỚC mà vẫn chưa ra -> cảnh báo ĐỎ
  const xeQuaHanChuaRa = dangTrongMo.filter((g) => dayStrOf(g.time) !== today);

  // (II.1) Đối chiếu phiếu khi cho xe ra cổng — chỉ để BẢO VỆ XEM tham khảo,
  // không cần thao tác ký gì thêm. Theo Bảng hiệu chỉnh V7.0: bỏ bước bảo vệ
  // ký/xác nhận, chỉ còn lái xe ký khi nhận phiếu từ Kế toán mỏ.
  const phieuDoiChieu = plateRa.trim()
    ? events.filter((e) => e.type === 'ticket_print' && e.plate === plateRa.trim().toUpperCase()).sort((a, b) => b.time.localeCompare(a.time))[0]
    : null;
  const daKyNhanPhieu = (ticketId) => events.some((e) => e.type === 'phieu_lai_xe_ky' && e.ticketId === ticketId);

  const xeRaCong = () => {
    const p = plateRa.trim().toUpperCase();
    if (!p) return notify('Nhập biển số xe ra cổng', true);
    const laXeLa = !dangTrongMo.some((g) => g.plate === p);
    const gateOutEv = { id: genId('GO'), type: 'gate_out', plate: p, anomaly: laXeLa, time: new Date().toISOString() };
    addEvent(gateOutEv);
    notify(laXeLa ? `⚠ Xe ${p} ra cổng nhưng KHÔNG có ghi nhận vào trước đó — đã đánh dấu bất thường` : `Đã ghi nhận xe ${p} ra cổng`);
    setPlateRa('');
  };

  return (
    <div className="max-w-lg mx-auto p-4">
      <h1 className="text-xl font-bold text-white mt-2">🚧 Cổng vào / ra mỏ</h1>
      <p className="text-slate-400 text-sm mb-4">Nhận biển số xe từ file Excel cố định — Camera/nhập tay chỉ dùng khi cần bổ sung.</p>

      <Card className="mb-4 border-emerald-600/50">
        <div className="flex items-center gap-2 font-bold text-white text-sm mb-1"><Link2 className="w-4 h-4 text-emerald-400" /> Kết nối file Excel danh sách xe</div>
        <p className="text-slate-400 text-xs mb-2">
          Đường dẫn cố định: <code className="text-emerald-400">D:\Mo khuon gian 3\Quan ly xe mo khuon gian 3.xlsx</code> — file này để mở liên tục trên máy, phần mềm tự đọc cột <b>"Biển số xe"</b> ở sheet đầu tiên.
        </p>
        {excelStatus.ten ? (
          <div className="bg-slate-950 border border-emerald-600/40 rounded-lg p-3 mb-2">
            <div className="text-emerald-400 text-xs font-bold">✅ Đã kết nối: {excelStatus.ten}</div>
            <div className="text-slate-400 text-[11px] mt-0.5">Đồng bộ lúc {excelStatus.dongBoLuc ? gioVN(excelStatus.dongBoLuc) : '—'} · {excelStatus.soHangMoiNhat} dòng dữ liệu trong file</div>
            {!hoTroFSA && <div className="text-amber-400 text-[11px] mt-1">⚠ Trình duyệt này không tự đồng bộ liên tục được — bấm "Chọn lại file" mỗi khi cần lấy dữ liệu mới.</div>}
          </div>
        ) : (
          <div className="text-slate-500 text-xs mb-2">Chưa kết nối file nào.</div>
        )}
        {excelStatus.loi && <div className="text-red-400 text-xs mb-2">{excelStatus.loi}</div>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={ketNoiExcel} className="bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2">{excelStatus.dangDongBo ? <RotateCw className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />} {excelStatus.ten ? 'Chọn lại file' : 'Kết nối file Excel'}</button>
          <button onClick={() => fileHandleRef.current && dongBoTuHandle(fileHandleRef.current)} disabled={!hoTroFSA || !excelStatus.ten} className="bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2"><RotateCw className="w-4 h-4" /> Làm mới ngay</button>
        </div>
        <input ref={inputFileRef} type="file" accept=".xlsx" onChange={chonFileThuong} className="hidden" />
        <button onClick={() => setXemCauHinhCam(!xemCauHinhCam)} className="text-orange-400 text-xs underline mt-3">{xemCauHinhCam ? 'Ẩn' : 'Xem'} hướng dẫn kết nối chi tiết</button>
        {xemCauHinhCam && (
          <div className="text-slate-300 text-xs leading-relaxed mt-2 bg-slate-950 border border-slate-700 rounded-lg p-3">
            <b>1)</b> Đặt file Excel đúng đường dẫn <code>D:\Mo khuon gian 3\Quan ly xe mo khuon gian 3.xlsx</code>, sheet đầu tiên có cột tiêu đề chứa chữ "Biển số" ở hàng 1 (VD: "Biển số xe"), có thể thêm cột "Loại xe" tùy chọn.<br />
            <b>2)</b> Bấm nút "Kết nối file Excel" phía trên, chọn đúng file này — trình duyệt Chrome/Edge sẽ tự đọc lại mỗi 10 giây, không cần thao tác lại.<br />
            <b>3)</b> Mỗi dòng mới thêm vào Excel (biển số ở cột đã nhận diện) sẽ tự động thành 1 lượt xe vào cổng — không nhập trùng dòng đã đọc.<br />
            <b>4)</b> Nếu dùng trình duyệt không hỗ trợ (Firefox/Safari), bấm "Chọn lại file" mỗi khi cần cập nhật.<br />
            <b>Lưu ý quan trọng:</b> đây là kết nối qua trình duyệt (cần mở phần mềm trên đúng máy có ổ D: chứa file). Nếu muốn hoàn toàn tự động kể cả khi không mở trình duyệt, cần bổ sung 1 agent nhỏ chạy nền (Power Automate Desktop hoặc script Python) để tự đẩy dữ liệu lên — có thể trao đổi thêm nếu cần.
          </div>
        )}
      </Card>

      <p className="text-slate-400 text-sm mb-1">Camera đọc biển số tự động gửi dữ liệu về đây. Bảo vệ nhập tay + chụp ảnh khi cần.</p>
      <div className="flex gap-3 mb-4">
        <button onClick={() => setXemCauHinhCam(!xemCauHinhCam)} className="text-orange-400 text-xs underline">{xemCauHinhCam ? 'Ẩn' : 'Xem'} hướng dẫn kết nối Camera thật</button>
        <button onClick={() => setXemLogCam(!xemLogCam)} className="text-orange-400 text-xs underline">{xemLogCam ? 'Ẩn' : 'Xem'} log camera gần đây (chẩn đoán)</button>
      </div>
      {xemCauHinhCam && (
        <Card className="mb-4">
          <div className="text-slate-300 text-xs leading-relaxed space-y-2">
            <p><b className="text-white">Địa chỉ camera cần gửi dữ liệu tới (khi đã triển khai trên Netlify):</b><br/>
              <code className="text-emerald-400 break-all">{(typeof window !== 'undefined' ? window.location.origin : '[địa-chỉ-web-cua-anh]')}/api/camera-webhook</code></p>
            <p><b className="text-white">Cách cấu hình trên đầu ghi/camera Hikvision:</b></p>
            <p>1) Đăng nhập trang quản trị camera/đầu ghi (thường qua trình duyệt, địa chỉ IP nội bộ của thiết bị).<br/>
              2) Vào <b>Configuration → Network → Advanced Settings → HTTP(S) Listening</b> (hoặc <b>Event → Basic Event/Smart Event → ANPR → Linkage Method → Notify Surveillance Center / HTTP(S) Post</b> tuỳ dòng máy).<br/>
              3) Dán đúng địa chỉ ở trên vào ô "Destination IP/URL", chọn phương thức <b>POST</b>, định dạng <b>JSON</b> nếu có tuỳ chọn.<br/>
              4) Lưu lại — mỗi lần camera đọc được biển số sẽ tự động gửi thẳng vào phần mềm, không cần bảo vệ thao tác.</p>
            <p><b className="text-amber-400">Nếu không tìm thấy đúng mục trên (tuỳ model/firmware), hoặc camera nằm trong mạng nội bộ không gửi thẳng ra internet được:</b> dùng bấm "Xem log camera gần đây" bên cạnh sau khi thử gửi 1 lần để xem dữ liệu thật camera gửi lên là gì — gửi ảnh log đó cho tôi để tôi chỉnh lại đúng, hoặc dùng phương án chương trình cầu nối chạy trên máy tính (giống chương trình đồng bộ Excel đã có).</p>
          </div>
        </Card>
      )}
      {xemLogCam && (
        <Card className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="font-bold text-white text-sm">Log dữ liệu camera gửi lên gần đây</div>
            <button onClick={taiLogCamera} className="text-[11px] bg-slate-700 hover:bg-slate-600 text-white px-2.5 py-1 rounded-lg font-semibold">Tải lại</button>
          </div>
          {logCamera === null ? <div className="text-slate-500 text-xs">Đang tải...</div> : logCamera.length === 0 ? (
            <div className="text-slate-500 text-xs">Chưa có dữ liệu nào camera gửi lên — cần triển khai trên Netlify thật (không xem được trong bản demo trực tiếp này) rồi thử cấu hình camera gửi thử 1 lần.</div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {logCamera.map((l, i) => (
                <div key={i} className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-[11px]">
                  <div className="text-slate-400">{gioVN(l.time)} · {l.contentType || '(không rõ content-type)'}</div>
                  <div className={l.nhanDangDuoc ? 'text-emerald-400 font-bold' : 'text-red-400'}>{l.nhanDangDuoc ? 'Đã nhận diện được biển số' : 'KHÔNG nhận diện được biển số'}</div>
                  <div className="text-slate-500 mt-1 break-all">{l.raw?.slice(0, 300)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {xeQuaHanChuaRa.length > 0 && (
        <Card className="mb-4 border-red-500">
          <div className="flex items-center gap-2 text-red-400 font-bold text-sm mb-2"><AlertTriangle className="w-4 h-4" /> Xe vào cổng đã quá 1 ngày vẫn CHƯA RA ({xeQuaHanChuaRa.length})</div>
          <p className="text-slate-400 text-xs mb-2">Camera đối chiếu tự động phát hiện bất thường — cần kiểm tra thực tế ngay.</p>
          {xeQuaHanChuaRa.map((g) => <div key={g.id} className="text-red-300 text-sm border-t border-slate-700 py-1.5 first:border-0">{g.plate} — vào lúc {gioVN(g.time)}</div>)}
        </Card>
      )}

      {canhBaoXeLa.length > 0 && (
        <Card className="mb-4 border-red-500">
          <div className="flex items-center gap-2 text-red-400 font-bold text-sm mb-2"><Bell className="w-4 h-4" /> Cảnh báo xe chưa qua cổng ({canhBaoXeLa.length})</div>
          <p className="text-slate-400 text-xs mb-2">Lái máy xúc phát hiện xe không có trên hệ thống — bổ sung ghi nhận vào cổng ngay để xe được xúc tiếp.</p>
          {canhBaoXeLa.map((a) => (
            <div key={a.id} className="flex justify-between items-center border-t border-slate-700 py-2 first:border-0">
              <div><span className="text-white font-bold tabular-nums">{a.plate}</span><span className="text-slate-500 text-xs"> · báo lúc {gioVN(a.time)}</span></div>
              <button onClick={() => xuLyCanhBaoXeLa(a)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg">Bổ sung ghi nhận</button>
            </div>
          ))}
        </Card>
      )}

      {canBoSung.length > 0 && (
        <Card className="mb-4 border-red-500">
          <div className="flex items-center gap-2 text-red-400 font-bold text-sm mb-2"><FileWarning className="w-4 h-4" /> Camera không đọc được biển số ({canBoSung.length})</div>
          {canBoSung.map((e) => (
            <div key={e.id} className="border-t border-slate-700 pt-3 mt-3 first:border-0 first:pt-0 first:mt-0">
              <div className="text-slate-400 text-xs mb-2">Camera cảnh báo lúc {gioVN(e.time)} — bổ sung thủ công:</div>
              <input placeholder="Nhập biển số xe" onKeyDown={(ev) => { if (ev.key === 'Enter') ghiNhan(ev.target.value); }}
                onBlur={(ev) => { if (ev.target.value.trim()) ghiNhan(ev.target.value); }}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white" />
            </div>
          ))}
        </Card>
      )}

      <Card>
        <label className="block text-slate-400 text-xs mb-1.5">Biển số xe VÀO cổng</label>
        <input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="VD: 98H-123.45" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white mb-3" />
        <label className="block text-slate-400 text-xs mb-1.5">Loại xe</label>
        <select value={loaiXe} onChange={(e) => setLoaiXe(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white mb-3">
          {LOAI_XE.map((x) => <option key={x.id} value={x.id}>{x.ten}</option>)}
        </select>
        <label className="block text-slate-400 text-xs mb-1.5 flex items-center gap-1.5"><Camera className="w-3.5 h-3.5" /> Ảnh xe (không bắt buộc)</label>
        <input type="file" accept="image/*" capture="environment" onChange={onChonAnh} className="text-xs text-slate-400 w-full mb-2" />
        {photo && <img src={photo} alt="ảnh xe" className="rounded-lg mb-2 max-h-32" />}
        <button onClick={() => ghiNhan()} className="w-full mt-1 bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-lg">✅ Xác nhận xe vào cổng</button>
      </Card>

      <Card className="mt-4">
        <div className="font-bold text-white text-sm mb-1">🚪 Ghi nhận xe RA cổng — đối chiếu phiếu</div>
        <div className="flex flex-wrap gap-2 mb-2">
          {dangTrongMo.slice(0, 8).map((g) => (
            <button key={g.id} onClick={() => setPlateRa(g.plate)} className="px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs font-bold text-white tabular-nums">{g.plate}</button>
          ))}
        </div>
        <input value={plateRa} onChange={(e) => setPlateRa(e.target.value)} placeholder="Biển số xe ra cổng" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white" />

        {plateRa.trim() && (
          phieuDoiChieu ? (
            <div className="mt-3 bg-slate-950 border border-emerald-600/50 rounded-lg p-3">
              <div className="text-emerald-400 text-xs font-bold mb-1">✅ Đối chiếu: có phiếu {phieuDoiChieu.ticketNo}</div>
              <div className="text-slate-300 text-xs">{soVN(phieuDoiChieu.volume)} m³ · KH: {phieuDoiChieu.customerName || '—'} · in lúc {gioVN(phieuDoiChieu.time)}</div>
              <div className="text-slate-500 text-[11px] mt-1">
                {daKyNhanPhieu(phieuDoiChieu.id) ? 'Lái xe đã ký nhận phiếu này (Kế toán mỏ đã ghi nhận).' : 'Chỉ cần lái xe ký nhận trực tiếp với Kế toán mỏ — Bảo vệ không cần xử lý gì thêm.'}
              </div>
            </div>
          ) : (
            <div className="mt-3 bg-red-900/20 border border-red-600/50 rounded-lg p-3 text-red-300 text-xs">⚠ Không tìm thấy phiếu nào cho biển số này hôm nay — kiểm tra kỹ trước khi cho xe ra.</div>
          )
        )}

        <button onClick={xeRaCong} className="w-full mt-2 bg-orange-600 hover:bg-orange-700 text-white font-bold py-2.5 rounded-lg text-sm">Ghi nhận xe ra cổng</button>
        {xeRaHomNay.length > 0 && <div className="text-slate-500 text-xs mt-2">{xeRaHomNay.length} xe đã ra cổng hôm nay</div>}
      </Card>

      <Card className="mt-4">
        <div className="font-bold text-white text-sm mb-1">🎥 Mô phỏng Camera ANPR</div>
        <div className="grid grid-cols-1 gap-2 mt-2">
          <button onClick={moPhongCameraDoc} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2.5 rounded-lg text-sm">Mô phỏng: đọc được biển số</button>
          <button onClick={moPhongCameraCanhBao} className="w-full bg-red-900/40 border border-red-600 hover:bg-red-900/60 text-red-300 font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2"><ImageOff className="w-4 h-4" /> Mô phỏng: KHÔNG đọc được biển số</button>
        </div>
      </Card>

      <SectionTitle>Xe vào cổng hôm nay ({daXacDinh.length}) · đang trong mỏ ({dangTrongMo.length})</SectionTitle>
      {daXacDinh.length === 0 ? <Card><div className="text-slate-500 text-sm text-center py-6">Chưa có xe nào.</div></Card> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {daXacDinh.map((e) => {
            const daRa = events.some((o) => o.type === 'gate_out' && o.plate === e.plate && o.time > e.time);
            return (
              <div key={e.id} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                {e.photo ? <img src={e.photo} alt={e.plate} className="w-full h-20 object-cover" /> : <div className="w-full h-20 bg-slate-900 flex items-center justify-center text-slate-600"><Camera className="w-5 h-5" /></div>}
                <div className="p-2">
                  <div className="font-extrabold text-white text-base tabular-nums leading-tight">{e.plate}</div>
                  <div className="text-slate-500 text-[10px]">{gioVN(e.time)}</div>
                  <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full font-bold ${daRa ? 'bg-slate-600 text-slate-300' : 'bg-emerald-500/20 text-emerald-400'}`}>{daRa ? 'Đã ra cổng' : 'Đang trong mỏ'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Toast msg={toast?.msg} err={toast?.err} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kỹ thuật — MỚI: khai báo TRƯỚC khi xúc (kích thước, khối lượng dự kiến,
// gán khách hàng), không còn là bước kiểm tra sau xúc.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Mẫu "BIÊN BẢN KIỂM TRA KHỐI LƯỢNG" đúng khuôn công ty (theo Bảng hiệu chỉnh
// V5.0, khổ A4) — dùng chung cho xem trên màn hình lẫn xuất file Word.
// ---------------------------------------------------------------------------
function bienBanHTML(khaiBao) {
  const t = new Date(khaiBao.time);
  const vn = new Date(t.getTime() + 7 * 3600 * 1000);
  return `
    <table class="khonvien" style="margin-bottom:16px"><tr>
      <td class="khonvien" style="width:50%"><b>CÔNG TY CP DV VÀ TM<br/>THỐNG NHẤT<br/>MỎ KHUÔN GIÀN 3</b></td>
      <td class="khonvien ct" style="width:50%"><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br/><b>Độc lập – Tự do – Hạnh phúc</b></td>
    </tr></table>
    <h2 class="ct">BIÊN BẢN XÁC NHẬN KHỐI LƯỢNG</h2>
    <p>Ngày ...... tháng ...... năm ${vn.getUTCFullYear()} vào khoảng ${vn.getUTCHours()} giờ ${vn.getUTCMinutes()} phút, chúng tôi cùng nhau kiểm tra khối lượng cụ thể như sau:</p>
    <p><b>Biển số xe:</b> ${khaiBao.plate || '................................'}</p>
    <p><b>Tên lái xe:</b> ${khaiBao.tenLaiXe || '................................'}</p>
    <p><b>Tên khách hàng:</b> ${khaiBao.customerName || '................................'}</p>
    <p><b>Kích thước thùng xe:</b></p>
    <p>Rộng:${khaiBao.rong ?? '........'}&nbsp;&nbsp;&nbsp; Dài:${khaiBao.dai ?? '........'}&nbsp;&nbsp;&nbsp; Cao:${khaiBao.cao ?? '........'}</p>
    <p><b>Khối lượng:</b> ${khaiBao.khoiLuong} m3</p>
    ${khaiBao.viPham ? `<p><b>Lý do kiểm tra lại:</b> Vi phạm vượt khối lượng kích thước thành thùng${khaiBao.ghiChuViPham ? ' — ' + khaiBao.ghiChuViPham : ''}</p>` : ''}
    <p>Hai bên xác nhận khối lượng trên là chính xác và để thực hiện trong việc tính khối lượng xúc lên xe, đưa vào công nợ.</p>
    <p>Nếu sau có thay đổi về khối lượng thì bên mua sẽ thông báo. Hai bên cùng nhau lập biên bản và xác nhận lại khối lượng, khối lượng đó sẽ được tính từ thời điểm kiểm tra.</p>
    <br/>
    <table class="khonvien"><tr>
      <td class="khonvien ct"><b>NGƯỜI KIỂM TRA</b></td><td class="khonvien ct"><b>KẾ TOÁN MỎ</b></td>
      <td class="khonvien ct"><b>BẢO VỆ</b></td><td class="khonvien ct"><b>XÁC NHẬN CỦA LÁI XE</b></td>
    </tr><tr><td class="khonvien" style="height:60px"></td><td class="khonvien"></td><td class="khonvien"></td><td class="khonvien"></td></tr></table>
  `;
}
function BienBanModal({ khaiBao, onClose }) {
  if (!khaiBao) return null;
  const html = bienBanHTML(khaiBao);
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white text-black rounded-lg p-6 w-full max-w-md max-h-[85vh] overflow-y-auto text-sm" onClick={(e) => e.stopPropagation()} dangerouslySetInnerHTML={{ __html: html }} />
      <div className="fixed bottom-6 flex gap-2" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => xuatWord(html, `bien-ban-${khaiBao.plate}-${todayStr()}`)} className="flex items-center gap-1.5 bg-blue-700 hover:bg-blue-600 text-white text-sm font-bold px-4 py-2.5 rounded-lg"><FileText className="w-4 h-4" /> Xuất Word</button>
        <button onClick={() => inTrucTiep(html, `Biên bản ${khaiBao.plate}`)} className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold px-4 py-2.5 rounded-lg">🖨️ In (A4)</button>
        <button onClick={onClose} className="bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold px-4 py-2.5 rounded-lg">Đóng</button>
      </div>
    </div>
  );
}

function KyThuatScreen({ events, addEvent, addEvents, config, myName }) {
  const [toast, notify] = useToast();
  const [form, setForm] = useState({});
  const [checked, setChecked] = useState({});
  const [xemLichSuPlate, setXemLichSuPlate] = useState(null);
  const [xemBienBanViPham, setXemBienBanViPham] = useState(null); // đối tượng ky_thuat_khai_bao có viPham
  const [xuLyXeLa, setXuLyXeLa] = useState(null); // {alert, khoiLuong, customerId}
  const [dangXuLyKhongRa, setDangXuLyKhongRa] = useState(null); // plate đang lập biên bản không ra

  const today = todayStr();
  const gateIns = events.filter((e) => e.type === 'gate_in' && e.plate && dayStrOf(e.time) === today);
  const khaiBaos = events.filter((e) => e.type === 'ky_thuat_khai_bao');
  const bienBans = events.filter((e) => e.type === 'bien_ban');
  const daLapBienBanIds = new Set(bienBans.flatMap((b) => b.khaiBaoIds));

  const kichThuocBanDauTheoPlate = {};
  khaiBaos.slice().sort((a, b) => a.time.localeCompare(b.time)).forEach((k) => { if (!kichThuocBanDauTheoPlate[k.plate]) kichThuocBanDauTheoPlate[k.plate] = k; });

  // Xe hôm nay: nếu có khai báo còn hiệu lực (trong hạn 3 ngày, không có báo cơi
  // nới sau đó) -> MIỄN, không cần thao tác gì (theo Bảng hiệu chỉnh V4.0 mục II.2)
  const list = gateIns.map((g) => {
    const hopLe = khaiBaoHopLe(g.plate, events);
    const khaiBaoRieng = khaiBaos.find((k) => k.gateInId === g.id);
    const conLai = ngayConLai(g.time);
    let trangThai;
    if (khaiBaoRieng) trangThai = 'xanh';
    else if (hopLe) trangThai = 'mien';
    else trangThai = conLai < 0 ? 'do' : 'vang';
    const soLanKiemTraTruoc = khaiBaos.filter((k) => k.plate === g.plate).length;
    return { ...g, khaiBao: khaiBaoRieng, hopLe, trangThai, conLai, soLanKiemTraTruoc };
  }).sort((a, b) => (a.trangThai === 'do' ? -1 : 1) - (b.trangThai === 'do' ? -1 : 1) || b.time.localeCompare(a.time));

  const capNhatForm = (id, field, value) => setForm({ ...form, [id]: { ...form[id], [field]: value } });

  const khaiBao = (g) => {
    const f = form[g.id] || {};
    const loaiXeId = f.loaiXe || LOAI_XE[0].id;
    const khoiLuong = Number(f.khoiLuong) || LOAI_XE_MAP[loaiXeId].khoiLuong;
    const dai = Number(f.dai) || null, rong = Number(f.rong) || null, cao = Number(f.cao) || null;
    const customerId = f.customerId || goiYKhachHangTheoPlate(g.plate, events) || config.customers[0]?.id;
    const customer = config.customers.find((c) => c.id === customerId);
    if (!customer) return notify('Chưa có khách hàng nào trong hệ thống — Kế toán/Giám đốc cần thêm khách hàng trước', true);
    // LƯU Ý: khách hàng hết số dư ứng trước VẪN khai báo được xe bình thường —
    // theo Bảng hiệu chỉnh V4.0 mục II.2 ("Khách hàng hết số dư vẫn khai báo
    // được xe"). Cảnh báo công nợ chỉ hiển thị ở Kế toán/Giám đốc/Trụ sở để con
    // người quyết định, phần mềm không tự động chặn ở bước này.
    addEvent({
      id: genId('KB'), type: 'ky_thuat_khai_bao', gateInId: g.id, plate: g.plate,
      loaiXe: loaiXeId, khoiLuong, dai, rong, cao, customerId, customerName: customer.name,
      tenLaiXe: f.tenLaiXe || '', viPham: f.viPham || false, ghiChuViPham: f.viPham ? (f.ghiChuViPham || '') : '',
      inspectorName: myName, time: new Date().toISOString(),
    });
    notify(f.viPham ? `⚠ Đã lập biên bản vi phạm & xác nhận lại khối lượng xe ${g.plate}` : `Đã khai báo xe ${g.plate}: ${khoiLuong} m³ — KH: ${customer.name}`);
  };

  const daKhaiBaoChuaLapBB = list.filter((l) => l.khaiBao && !daLapBienBanIds.has(l.khaiBao.id));
  const selectedIds = Object.keys(checked).filter((id) => checked[id]);
  const lapBienBan = () => {
    if (selectedIds.length === 0) return notify('Chọn ít nhất 1 xe đã khai báo để lập biên bản', true);
    addEvent({ id: genId('BB'), type: 'bien_ban', inspectorName: myName, khaiBaoIds: selectedIds, soLuongXe: selectedIds.length, time: new Date().toISOString() });
    notify(`Đã lập biên bản cho ${selectedIds.length} xe, chuyển Kế toán mỏ lưu hồ sơ`);
    setChecked({});
  };

  // Cảnh báo xe không qua cổng (lái máy xúc báo) — Kỹ thuật cũng xử lý được tại đây
  const canhBaoXeLa = events.filter((e) => e.type === 'missing_plate_alert' && !events.some((r) => r.type === 'missing_plate_resolved' && r.alertId === e.id));
  // Cảnh báo xe vào cổng nhưng hết ngày (hôm qua trở về trước) chưa ghi nhận ra cổng
  const homQuaTroVeTruoc = events.filter((e) => e.type === 'gate_in' && e.plate && dayStrOf(e.time) < today);
  const xeChuaRaQuaNgay = homQuaTroVeTruoc.filter((g) => !events.some((o) => o.type === 'gate_out' && o.plate === g.plate && o.time > g.time) && !events.some((b) => b.type === 'bien_ban_khong_ra' && b.plate === g.plate && b.time > g.time)).slice(-10);

  // (III) Xử lý ngay cảnh báo xe không qua cổng: lập biên bản + xác nhận khối
  // lượng tại chỗ -> khối lượng nhảy thẳng vào bảng tổng hợp khách hàng, không
  // cần chờ Bảo vệ bổ sung ghi nhận trước.
  const xacNhanXuLyXeLa = () => {
    if (!xuLyXeLa) return;
    const customer = config.customers.find((c) => c.id === xuLyXeLa.customerId);
    if (!customer) return notify('Chưa chọn khách hàng', true);
    const khoiLuong = Number(xuLyXeLa.khoiLuong) || config.vehicleCapacity;
    const p = xuLyXeLa.alert.plate;
    const gateEv = { id: genId('GI'), type: 'gate_in', plate: p, source: 'ky_thuat_xu_ly', loaiXe: LOAI_XE[0].id, photo: null, time: new Date().toISOString() };
    const resolvedEv = { id: genId('MR'), type: 'missing_plate_resolved', alertId: xuLyXeLa.alert.id, plate: p, time: new Date().toISOString() };
    const khaiBaoEv = { id: genId('KB'), type: 'ky_thuat_khai_bao', gateInId: gateEv.id, plate: p, loaiXe: LOAI_XE[0].id, khoiLuong, dai: null, rong: null, cao: null, customerId: customer.id, customerName: customer.name, xuLyTaiCong: true, inspectorName: myName, time: new Date().toISOString() };
    const bbEv = { id: genId('BB'), type: 'bien_ban', inspectorName: myName, khaiBaoIds: [khaiBaoEv.id], soLuongXe: 1, ghiChu: `Xe ${p} không qua cổng — xử lý tại chỗ`, time: new Date().toISOString() };
    addEvents([gateEv, resolvedEv, khaiBaoEv, bbEv]);
    setXuLyXeLa(null);
    notify(`Đã lập biên bản, xác nhận ${khoiLuong} m³ cho xe ${p} — đã nhảy vào bảng khách hàng ${customer.name}`);
  };

  const lapBienBanKhongRa = (plate) => {
    addEvent({ id: genId('BKR'), type: 'bien_ban_khong_ra', plate, inspectorName: myName, time: new Date().toISOString() });
    setDangXuLyKhongRa(null);
    notify(`Đã lập biên bản xe ${plate} vào cổng nhưng chưa ra`);
  };

  const homNayBienBan = bienBans.filter((b) => dayStrOf(b.time) === today).slice().reverse();
  const mauTrangThai = { do: 'border-red-500 bg-red-500/5', vang: 'border-amber-500 bg-amber-500/5', xanh: 'border-emerald-500 bg-emerald-500/5', mien: 'border-slate-700' };
  const nhanTrangThai = { do: 'QUÁ HẠN', vang: 'Chờ khai báo', xanh: 'Đã khai báo', mien: 'Miễn (trong hạn 3 ngày)' };
  const mauNhan = { do: 'bg-red-500/20 text-red-400', vang: 'bg-amber-500/20 text-amber-400', xanh: 'bg-emerald-500/20 text-emerald-400', mien: 'bg-slate-600/30 text-slate-300' };

  const lichSuCuaPlate = xemLichSuPlate ? khaiBaos.filter((k) => k.plate === xemLichSuPlate).sort((a, b) => b.time.localeCompare(a.time)) : [];

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-xl font-bold text-white mt-2 flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-orange-500" /> Khai báo kích thước, khối lượng &amp; khách hàng</h1>
      <p className="text-slate-400 text-sm mb-4">
        <b>Bắt buộc</b> khai báo tại đây trước khi lái máy xúc được phép xúc. Xe đã khai báo trong {HAN_KIEM_TRA_NGAY} ngày làm việc gần nhất được <b>miễn</b> khai báo lại. Quá hạn hoặc có báo cơi nới thùng thì phải khai báo lại.
      </p>

      {canhBaoXeLa.length > 0 && (
        <Card className="mb-4 border-red-500">
          <div className="flex items-center gap-2 text-red-400 font-bold text-sm mb-1"><Bell className="w-4 h-4" /> {canhBaoXeLa.length} xe không qua cổng — Lái máy xúc báo</div>
          <p className="text-slate-400 text-xs mb-2">Có thể chờ Bảo vệ bổ sung, hoặc Kỹ thuật xử lý ngay tại đây (lập biên bản + xác nhận khối lượng).</p>
          {canhBaoXeLa.map((a) => (
            <div key={a.id} className="border-t border-slate-700 pt-2 mt-2 first:border-0 first:pt-0 first:mt-0">
              <div className="flex justify-between items-center">
                <span className="text-white font-bold tabular-nums">{a.plate}</span>
                {xuLyXeLa?.alert.id !== a.id && <button onClick={() => setXuLyXeLa({ alert: a, khoiLuong: config.vehicleCapacity, customerId: config.customers[0]?.id })} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg">Xử lý ngay</button>}
              </div>
              {xuLyXeLa?.alert.id === a.id && (
                <div className="mt-2 bg-slate-950 border border-red-600/50 rounded-lg p-3">
                  <label className="block text-slate-400 text-xs mb-1">Khối lượng (m³)</label>
                  <input type="number" value={xuLyXeLa.khoiLuong} onChange={(e) => setXuLyXeLa({ ...xuLyXeLa, khoiLuong: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-white text-sm mb-2" />
                  <label className="block text-slate-400 text-xs mb-1">Khách hàng</label>
                  <select value={xuLyXeLa.customerId} onChange={(e) => setXuLyXeLa({ ...xuLyXeLa, customerId: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-white text-sm">
                    {config.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <button onClick={() => setXuLyXeLa(null)} className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold py-2 rounded-lg">Hủy</button>
                    <button onClick={xacNhanXuLyXeLa} className="bg-red-600 hover:bg-red-700 text-white text-sm font-bold py-2 rounded-lg">Lập biên bản & xác nhận</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
      {xeChuaRaQuaNgay.length > 0 && (
        <Card className="mb-4 border-amber-500">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm mb-1"><Bell className="w-4 h-4" /> {xeChuaRaQuaNgay.length} xe vào cổng nhưng hết ngày chưa ghi nhận ra</div>
          {xeChuaRaQuaNgay.map((g) => (
            <div key={g.id} className="flex justify-between items-center border-t border-slate-700 py-1.5 first:border-0 text-sm">
              <span className="text-amber-300 font-bold tabular-nums">{g.plate}</span>
              <button onClick={() => lapBienBanKhongRa(g.plate)} className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1 rounded-lg">Lập biên bản</button>
            </div>
          ))}
        </Card>
      )}

      {list.length === 0 ? <Card><div className="text-slate-500 text-sm text-center py-6">Chưa có xe nào vào cổng hôm nay.</div></Card> : list.map((g) => {
        const kichThuocBanDau = kichThuocBanDauTheoPlate[g.plate];
        return (
        <Card key={g.id} className={`mb-3 border ${mauTrangThai[g.trangThai]}`}>
          <div className="flex justify-between items-start gap-2">
            <div>
              <div className="text-white font-extrabold text-lg tabular-nums flex items-center gap-2">
                {g.plate}
                {g.soLanKiemTraTruoc > 0 && <button onClick={() => setXemLichSuPlate(g.plate)} className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded-full flex items-center gap-1"><History className="w-3 h-3" /> {g.soLanKiemTraTruoc} lần trước</button>}
              </div>
              <div className="text-slate-400 text-xs">Vào cổng lúc {gioVN(g.time)}</div>
              {kichThuocBanDau && <div className="text-slate-500 text-[11px] mt-0.5">Kích thước ban đầu (lần đầu ghi nhận): {kichThuocBanDau.dai || '?'}×{kichThuocBanDau.rong || '?'}×{kichThuocBanDau.cao || '?'} m</div>}
            </div>
            <span className={`text-[11px] px-2 py-1 rounded-full font-bold whitespace-nowrap ${mauNhan[g.trangThai]}`}>{nhanTrangThai[g.trangThai]}{g.trangThai === 'vang' && ` (còn ${g.conLai} ngày)`}</span>
          </div>

          {g.trangThai === 'mien' && (
            <div className="mt-3 text-sm text-slate-300">Dùng khai báo trước đó: {g.hopLe.khoiLuong} m³ · KH: <b className="text-white">{g.hopLe.customerName}</b> — lái máy xúc có thể xúc ngay, không cần thao tác thêm.</div>
          )}

          {!g.khaiBao && g.trangThai !== 'mien' ? (
            <>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div>
                  <label className="block text-slate-400 text-xs mb-1">Loại xe (gợi ý nhanh)</label>
                  <select value={form[g.id]?.loaiXe || LOAI_XE[0].id} onChange={(e) => { capNhatForm(g.id, 'loaiXe', e.target.value); capNhatForm(g.id, 'khoiLuong', LOAI_XE_MAP[e.target.value].khoiLuong); }} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-white text-sm">
                    {LOAI_XE.map((x) => <option key={x.id} value={x.id}>{x.ten}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1">Khối lượng dự kiến (m³)</label>
                  <input type="number" value={form[g.id]?.khoiLuong ?? LOAI_XE_MAP[form[g.id]?.loaiXe || LOAI_XE[0].id].khoiLuong} onChange={(e) => capNhatForm(g.id, 'khoiLuong', e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-white text-sm" />
                </div>
              </div>
              <label className="block text-slate-400 text-xs mb-1 mt-2 flex items-center gap-1"><Ruler className="w-3.5 h-3.5" /> Kích thước đo thực tế lần này (m) — không bắt buộc</label>
              <div className="grid grid-cols-3 gap-2">
                <input type="number" step="0.1" placeholder="Dài" value={form[g.id]?.dai || ''} onChange={(e) => capNhatForm(g.id, 'dai', e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-white text-sm" />
                <input type="number" step="0.1" placeholder="Rộng" value={form[g.id]?.rong || ''} onChange={(e) => capNhatForm(g.id, 'rong', e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-white text-sm" />
                <input type="number" step="0.1" placeholder="Cao" value={form[g.id]?.cao || ''} onChange={(e) => capNhatForm(g.id, 'cao', e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-white text-sm" />
              </div>
              <label className="block text-slate-400 text-xs mb-1 mt-2">Khách hàng (đối tượng mua đất)</label>
              <select value={form[g.id]?.customerId || goiYKhachHangTheoPlate(g.plate, events) || config.customers[0]?.id || ''} onChange={(e) => capNhatForm(g.id, 'customerId', e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-white text-sm">
                {config.customers.length === 0 && <option value="">— Chưa có khách hàng, thêm ở màn Kế toán/Giám đốc —</option>}
                {config.customers.map((c) => {
                  const soDu = tinhSoDuKhachHang(c.id, events, config);
                  return <option key={c.id} value={c.id}>{c.name}{soDu <= 0 ? ' (⚠ hết số dư — vẫn khai báo được)' : ''}</option>;
                })}
              </select>
              <label className="block text-slate-400 text-xs mb-1 mt-2">Tên lái xe (để in biên bản nếu cần)</label>
              <input value={form[g.id]?.tenLaiXe || ''} onChange={(e) => capNhatForm(g.id, 'tenLaiXe', e.target.value)} placeholder="Họ tên lái xe tải" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-white text-sm" />
              <label className="flex items-center gap-2 mt-3 text-sm text-amber-300">
                <input type="checkbox" checked={!!form[g.id]?.viPham} onChange={(e) => capNhatForm(g.id, 'viPham', e.target.checked)} className="w-4 h-4" />
                Phát hiện cơi nới thùng / khối lượng vượt mà lái xe không báo trước
              </label>
              {form[g.id]?.viPham && (
                <input value={form[g.id]?.ghiChuViPham || ''} onChange={(e) => capNhatForm(g.id, 'ghiChuViPham', e.target.value)} placeholder="Ghi chú vi phạm (VD: cơi nới thêm 0.3m thành thùng)"
                  className="w-full mt-2 bg-slate-950 border border-amber-600 rounded-lg px-2 py-2 text-white text-sm" />
              )}
              <button onClick={() => khaiBao(g)} className={`w-full mt-2 font-bold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 text-white ${form[g.id]?.viPham ? 'bg-amber-600 hover:bg-amber-700' : 'bg-orange-600 hover:bg-orange-700'}`}>
                <CheckCircle2 className="w-4 h-4" /> {form[g.id]?.viPham ? 'Lập biên bản vi phạm & xác nhận lại' : 'Xác nhận khai báo'}
              </button>
            </>
          ) : g.khaiBao ? (
            <>
              <div className="mt-3 text-sm text-slate-300">{g.khaiBao.khoiLuong} m³ · KH: <b className="text-white">{g.khaiBao.customerName}</b> · {LOAI_XE_MAP[g.khaiBao.loaiXe]?.ten}{g.khaiBao.dai ? ` · ${g.khaiBao.dai}×${g.khaiBao.rong}×${g.khaiBao.cao}m` : ''}</div>
              {g.khaiBao.viPham && <div className="mt-2 text-amber-400 text-xs">⚠ Biên bản vi phạm: {g.khaiBao.ghiChuViPham || 'cơi nới thùng không báo trước'}</div>}
              <div className="flex items-center gap-3 mt-2">
                <button onClick={() => setXemBienBanViPham(g.khaiBao)} className="text-[11px] bg-slate-700 hover:bg-slate-600 text-white px-2.5 py-1 rounded-full font-semibold">Xem / In biên bản</button>
                {!daLapBienBanIds.has(g.khaiBao.id) && (
                  <label className="flex items-center gap-2 text-sm text-white">
                    <input type="checkbox" checked={!!checked[g.khaiBao.id]} onChange={(e) => { setChecked({ ...checked, [g.khaiBao.id]: e.target.checked }); if (e.target.checked) setXemBienBanViPham(g.khaiBao); }} className="w-4 h-4" />
                    Chọn đưa vào biên bản
                  </label>
                )}
              </div>
            </>
          ) : null}
        </Card>
      );})}

      {daKhaiBaoChuaLapBB.length > 0 && (
        <div className="sticky bottom-4 mt-4">
          <button onClick={lapBienBan} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg shadow-lg">📋 Lập biên bản cho {selectedIds.length || 0} xe đã chọn — chuyển Kế toán mỏ</button>
        </div>
      )}

      <SectionTitle>Biên bản đã lập hôm nay ({homNayBienBan.length})</SectionTitle>
      <Card>
        {homNayBienBan.length === 0 ? <div className="text-slate-500 text-sm text-center py-6">Chưa lập biên bản nào.</div> : (
          <div className="divide-y divide-slate-700 text-sm">
            {homNayBienBan.map((b) => <div key={b.id} className="py-2 flex justify-between"><span className="text-white">{b.soLuongXe} xe · {b.inspectorName}</span><span className="text-slate-400">{gioVN(b.time)}</span></div>)}
          </div>
        )}
      </Card>
      <Toast msg={toast?.msg} err={toast?.err} />

      {xemLichSuPlate && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-40 p-4" onClick={() => setXemLichSuPlate(null)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 w-full max-w-sm max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-white font-bold mb-3"><History className="w-4 h-4 text-orange-500" /> Lịch sử kiểm tra xe {xemLichSuPlate}</div>
            <div className="divide-y divide-slate-700 text-sm">
              {lichSuCuaPlate.map((k) => (
                <div key={k.id} className="py-2">
                  <div className="text-white font-semibold">{gioVN(k.time)} · {k.inspectorName}</div>
                  <div className="text-slate-400 text-xs">{k.khoiLuong} m³ · KH: {k.customerName}{k.dai ? ` · Kích thước: ${k.dai}×${k.rong}×${k.cao}m` : ' · (chưa đo kích thước)'}{k.viPham ? ' · ⚠ Có vi phạm' : ''}</div>
                </div>
              ))}
            </div>
            <button onClick={() => setXemLichSuPlate(null)} className="w-full mt-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded-lg text-sm">Đóng</button>
          </div>
        </div>
      )}
      <BienBanModal khaiBao={xemBienBanViPham} onClose={() => setXemBienBanViPham(null)} />
    </div>
  );
}
function DriverScreen({ events, addEvent, addEvents, config, myName, claims, setClaim, clearClaim, buildTicket }) {
  const [session, setSession] = useState(null);
  const [operatorName, setOperatorName] = useState(myName || config.operators[0]?.name || '');
  const [excavatorId, setExcavatorId] = useState(config.excavators[0]?.id);
  const [shift, setShift] = useState('sáng');
  const [search, setSearch] = useState('');
  const [selectedPlate, setSelectedPlate] = useState(null);
  const [vol, setVol] = useState(config.vehicleCapacity);
  const [baoXeLa, setBaoXeLa] = useState('');
  const [toast, notify] = useToast();
  const [now, setNow] = useState(Date.now());

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  const nhanCa = () => {
    const ten = operatorName.trim();
    if (!ten) return notify('Nhập họ tên lái máy xúc', true);
    const ex = config.excavators.find((x) => x.id === excavatorId);
    const opId = taoUsernameTuHoTen(ten) || ten;
    const ev = { id: genId('SS'), type: 'shift_start', operatorId: opId, operatorName: ten, excavatorId, excavatorName: ex.name, shift, time: new Date().toISOString() };
    addEvent(ev);
    setSession({ sessionId: ev.id, operatorId: opId, operatorName: ten, excavatorId, excavatorName: ex.name, shift, startTime: ev.time });
    notify('Đã nhận ca thành công');
  };
  const traMay = () => { addEvent({ id: genId('SE'), type: 'shift_end', sessionId: session.sessionId, time: new Date().toISOString() }); setSession(null); };

  const today = todayStr();
  const gateIns = events.filter((e) => e.type === 'gate_in' && e.plate && dayStrOf(e.time) === today);
  const loadsToday = events.filter((e) => e.type === 'load_confirm' && dayStrOf(e.time) === today);

  const xeChoXuc = gateIns.filter((g) => !loadsToday.some((l) => l.plate === g.plate && l.time > g.time)).sort((a, b) => b.time.localeCompare(a.time));
  const ketQuaTimKiem = xeChoXuc.filter((e) => {
    if (!search.trim()) return true;
    const s = search.trim().toLowerCase();
    const kb = khaiBaoHopLe(e.plate, events);
    return e.plate.toLowerCase().includes(s) || (kb?.customerName || '').toLowerCase().includes(s);
  });
  const xeDangChon = xeChoXuc.find((e) => e.plate === selectedPlate);
  const khaiBaoCuaXeDangChon = xeDangChon ? khaiBaoHopLe(xeDangChon.plate, events) : null;

  const chonXe = (plate) => {
    setSelectedPlate(plate);
    setClaim(plate, session.operatorName);
    const kb = khaiBaoHopLe(plate, events);
    setVol(kb ? kb.khoiLuong : config.vehicleCapacity);
  };

  const xacNhan = () => {
    if (!selectedPlate) return notify('Vui lòng chọn xe để xúc', true);
    // BẮT BUỘC phải có khai báo kỹ thuật còn hiệu lực mới được xúc (V4.0, mục II.2)
    if (!khaiBaoCuaXeDangChon) return notify('⛔ Xe này CHƯA được Kỹ thuật xác nhận (hoặc đã quá hạn 3 ngày) — không thể xúc. Báo Kỹ thuật kiểm tra trước.', true);
    const kb = khaiBaoCuaXeDangChon;
    const loadEv = {
      id: genId('LD'), type: 'load_confirm', plate: selectedPlate,
      excavatorId: session.excavatorId, excavatorName: session.excavatorName,
      operatorId: session.operatorId, operatorName: session.operatorName,
      sessionId: session.sessionId, estVolume: Number(vol) || config.vehicleCapacity,
      customerId: kb?.customerId || null, customerName: kb?.customerName || null,
      time: new Date().toISOString(),
    };
    const ticket = buildTicket(loadEv);
    addEvents([loadEv, ticket]);
    clearClaim(selectedPlate);
    setSelectedPlate(null); setSearch('');
    notify(`Đã xác nhận xúc đầy xe ${selectedPlate} — hệ thống tự động lập phiếu ${ticket.ticketNo} (3 liên)`);
  };

  const guiBaoXeLa = () => {
    const p = baoXeLa.trim().toUpperCase();
    if (!p) return notify('Nhập biển số xe cần báo', true);
    addEvent({ id: genId('MA'), type: 'missing_plate_alert', plate: p, reportedBy: myName, excavatorName: session?.excavatorName, operatorName: session?.operatorName, time: new Date().toISOString() });
    setBaoXeLa('');
    notify(`Đã gửi cảnh báo xe ${p} tới Bảo vệ / Kỹ thuật / Giám đốc / Kế toán — chờ ghi nhận trước khi xúc`);
  };

  const baoCoiNoi = () => {
    if (!xeDangChon) return notify('Chọn xe cần báo trước', true);
    addEvent({ id: genId('CN'), type: 'bao_coi_noi', plate: xeDangChon.plate, reportedBy: myName, time: new Date().toISOString() });
    notify(`Đã báo Kỹ thuật kiểm tra lại xe ${xeDangChon.plate} do cơi nới thùng`);
  };

  const luotCuaToi = session ? loadsToday.filter((e) => e.operatorId === session.operatorId && e.excavatorId === session.excavatorId) : [];
  const thoiGianLamViec = session ? now - new Date(session.startTime).getTime() : 0;

  if (!session) {
    return (
      <div className="max-w-lg mx-auto p-4">
        <h1 className="text-xl font-bold text-white mt-2">🚜 Nhận ca vận hành</h1>
        <p className="text-slate-400 text-sm mb-4">Chọn đúng tên và máy xúc trước khi bắt đầu.</p>
        <Card>
          <label className="block text-slate-400 text-xs mb-1.5">Họ tên lái máy xúc — có thể sửa lại cho đúng tên chuẩn</label>
          <input value={operatorName} onChange={(e) => setOperatorName(e.target.value)} list="ds-ten-lai-xuc" placeholder="Nhập họ tên"
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white outline-none focus:border-orange-500" />
          <datalist id="ds-ten-lai-xuc">{config.operators.map((o) => <option key={o.id} value={o.name} />)}</datalist>
          <label className="block text-slate-400 text-xs mb-1.5 mt-3">Máy xúc đảm nhận</label>
          <select value={excavatorId} onChange={(e) => setExcavatorId(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white">{config.excavators.map((x) => <option key={x.id} value={x.id}>{x.name}{x.chuSoHuu ? ` — ${x.chuSoHuu}` : ''}</option>)}</select>
          <label className="block text-slate-400 text-xs mb-1.5 mt-3">Ca làm việc</label>
          <select value={shift} onChange={(e) => setShift(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white"><option value="sáng">Ca sáng</option><option value="chiều">Ca chiều</option></select>
          <button onClick={nhanCa} className="w-full mt-3 bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-lg">✅ Nhận ca / Nhận máy</button>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-4">
      <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500 rounded-lg px-4 py-3 mb-4">
        <div>
          <div className="text-white font-bold text-sm">{session.operatorName} — {session.excavatorName}</div>
          <div className="text-slate-400 text-xs flex items-center gap-1.5"><Clock className="w-3 h-3" /> Ca {session.shift} · Đã làm việc {dinhDangGio(thoiGianLamViec)}</div>
        </div>
        <button onClick={traMay} className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg font-semibold">Trả máy</button>
      </div>

      <h1 className="text-xl font-bold text-white">Xác nhận lượt xúc đầy xe</h1>
      <p className="text-slate-400 text-sm mb-3">Chỉ hiện xe đã qua cổng và có trên hệ thống.</p>
      <Card>
        <label className="block text-slate-400 text-xs mb-1.5 flex items-center gap-1.5"><Search className="w-3.5 h-3.5" /> Tìm biển số xe</label>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo biển số hoặc tên khách hàng..." className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white mb-3" />

        <div className="max-h-64 overflow-y-auto border border-slate-700 rounded-lg divide-y divide-slate-700">
          {ketQuaTimKiem.length === 0 && <div className="text-slate-500 text-xs text-center py-6">Không có xe nào đang chờ xúc.</div>}
          {ketQuaTimKiem.map((e) => {
            const dangDuocChon = claims[e.plate] && claims[e.plate].operatorName !== session.operatorName;
            const chonBoiToi = selectedPlate === e.plate;
            const kb = khaiBaoHopLe(e.plate, events);
            return (
              <button key={e.id} onClick={() => chonXe(e.plate)} className={`w-full flex items-center gap-3 px-3 py-2.5 text-left ${chonBoiToi ? 'bg-orange-600/20' : 'hover:bg-slate-700/50'}`}>
                {e.photo ? <img src={e.photo} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" /> : <div className="w-10 h-10 rounded bg-slate-700 flex-shrink-0 flex items-center justify-center text-slate-500"><Truck className="w-4 h-4" /></div>}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white tabular-nums">{e.plate}</div>
                  <div className="text-slate-500 text-[11px] truncate">{kb ? <span className="text-emerald-400">{kb.khoiLuong} m³ · KH: {kb.customerName}</span> : <span className="text-red-400">⛔ Chưa được Kỹ thuật xác nhận</span>}</div>
                </div>
                {chonBoiToi && <CheckCircle2 className="w-5 h-5 text-orange-400 flex-shrink-0" />}
                {!chonBoiToi && dangDuocChon && <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full flex-shrink-0">{claims[e.plate].operatorName} đang chọn</span>}
              </button>
            );
          })}
        </div>

        {xeDangChon && (
          <div className="mt-3 bg-slate-950 border border-orange-600/50 rounded-lg p-3">
            <div className="text-white font-bold text-sm mb-1">Thông tin xe {xeDangChon.plate}</div>
            {xeDangChon.photo && <img src={xeDangChon.photo} alt="" className="rounded-lg mb-2 max-h-32 w-full object-cover" />}
            {khaiBaoCuaXeDangChon ? (
              <>
                <div className="text-emerald-400 text-xs">✅ Đã xác nhận kỹ thuật: {LOAI_XE_MAP[khaiBaoCuaXeDangChon.loaiXe]?.ten} — Khách hàng: {khaiBaoCuaXeDangChon.customerName}</div>
                <button onClick={baoCoiNoi} className="mt-2 text-[11px] text-amber-400 underline">🚩 Báo xe này bị cơi nới thùng (yêu cầu Kỹ thuật kiểm tra lại)</button>
              </>
            ) : (
              <div className="text-red-400 text-xs font-semibold">⛔ Xe CHƯA được Kỹ thuật xác nhận (hoặc đã quá hạn 3 ngày) — không thể xúc. Báo Kỹ thuật kiểm tra trước.</div>
            )}
          </div>
        )}

        <label className="block text-slate-400 text-xs mb-1.5 mt-3">Khối lượng (m³ nở rời / xe) {khaiBaoCuaXeDangChon && <span className="text-emerald-400">— tự động theo khai báo kỹ thuật</span>}</label>
        <input type="number" value={vol} onChange={(e) => setVol(e.target.value)} disabled={!khaiBaoCuaXeDangChon} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white disabled:opacity-50" />
        <button onClick={xacNhan} disabled={!selectedPlate || !khaiBaoCuaXeDangChon} className="w-full mt-3 bg-orange-600 hover:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg">✅ Xác nhận đã xúc đầy xe (tự động in phiếu)</button>
      </Card>

      <Card className="mt-4 border-red-500/50">
        <div className="flex items-center gap-2 text-red-400 font-bold text-sm mb-1"><Bell className="w-4 h-4" /> Xe không có trong danh sách?</div>
        <p className="text-slate-400 text-xs mb-2">Xe vào không qua cổng hoặc Camera không ghi nhận được — báo ngay để Bảo vệ/Giám đốc/Kế toán bổ sung.</p>
        <div className="flex gap-2">
          <input value={baoXeLa} onChange={(e) => setBaoXeLa(e.target.value)} placeholder="Biển số xe" className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" />
          <button onClick={guiBaoXeLa} className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 rounded-lg text-sm">Báo ngay</button>
        </div>
      </Card>

      <SectionTitle>Lượt xúc của tôi hôm nay</SectionTitle>
      <Card>
        {luotCuaToi.length === 0 ? <div className="text-slate-500 text-sm text-center py-6">Chưa có lượt xúc nào.</div> : (
          <>
            <div className="text-white font-bold mb-2">{luotCuaToi.length} xe · {soVN(luotCuaToi.reduce((s, l) => s + l.estVolume, 0))} m³ · đã làm việc {dinhDangGio(thoiGianLamViec)}</div>
            <div className="divide-y divide-slate-700">
              {luotCuaToi.slice().reverse().map((l) => (
                <div key={l.id} className="flex justify-between py-2 text-sm"><span className="text-white font-bold tabular-nums">{l.plate}</span><span className="text-slate-400">{soVN(l.estVolume)} m³</span><span className="text-slate-400">{gioVN(l.time)}</span></div>
              ))}
            </div>
          </>
        )}
      </Card>
      <Toast msg={toast?.msg} err={toast?.err} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Báo cáo tổng hợp dùng chung (Kế toán / Giám đốc / Trụ sở) — theo khách hàng,
// theo máy xúc, tra soát
// ---------------------------------------------------------------------------
function bangKhachHang(tickets, config) {
  const map = {};
  config.customers.forEach((c) => { map[c.id] = { id: c.id, name: c.name, donGia: c.donGia, m3: 0, soPhieu: 0 }; });
  tickets.forEach((t) => {
    if (!t.customerId) return;
    if (!map[t.customerId]) map[t.customerId] = { id: t.customerId, name: t.customerName || 'Không rõ', donGia: 0, m3: 0, soPhieu: 0 };
    map[t.customerId].m3 += t.volume; map[t.customerId].soPhieu += 1;
  });
  return Object.values(map);
}
// Công nợ khách hàng = TIỀN KHÁCH CÒN NỢ (khách lấy đất trước, trả tiền sau)
// — công nợ TĂNG khi phát sinh khối lượng xuất, GIẢM khi khách thanh toán.
// Đúng theo mẫu "Báo cáo công nợ khách hàng" của công ty (Bảng hiệu chỉnh
// V7.0): Dư cuối kỳ = Dư đầu kỳ + Thành tiền phát sinh − Đã thanh toán.
function tinhSoDuKhachHang(customerId, events, config) {
  const cus = config.customers.find((c) => c.id === customerId);
  const donGia = cus?.donGia || 0;
  const thanhTien = events.filter((e) => e.type === 'ticket_print' && e.customerId === customerId).reduce((s, e) => s + e.volume * donGia, 0);
  const daThanhToan = events.filter((e) => e.type === 'customer_deposit' && e.customerId === customerId).reduce((s, e) => s + e.amount, 0);
  return thanhTien - daThanhToan;
}
// Sổ công nợ theo kỳ [tuNgay, denNgay] (chuỗi YYYY-MM-DD) — đúng mẫu công ty:
// Dư đầu kỳ / Phát sinh (khối lượng, đơn giá, thành tiền) / Đã thanh toán
// trong kỳ / Dư cuối kỳ = Dư đầu kỳ + Thành tiền phát sinh − Đã thanh toán.
function tinhCongNoTheoKy(customerId, tuNgay, denNgay, events, config) {
  const cus = config.customers.find((c) => c.id === customerId);
  const donGia = cus?.donGia || 0;
  const truoc = (e) => dayStrOf(e.time) < tuNgay;
  const trongKy = (e) => dayStrOf(e.time) >= tuNgay && dayStrOf(e.time) <= denNgay;
  const thanhTienTruocKy = events.filter((e) => e.type === 'ticket_print' && e.customerId === customerId && truoc(e)).reduce((s, e) => s + e.volume * donGia, 0);
  const thanhToanTruocKy = events.filter((e) => e.type === 'customer_deposit' && e.customerId === customerId && truoc(e)).reduce((s, e) => s + e.amount, 0);
  const duDauKy = thanhTienTruocKy - thanhToanTruocKy;
  const ticketsTrongKy = events.filter((e) => e.type === 'ticket_print' && e.customerId === customerId && trongKy(e));
  const khoiLuong = ticketsTrongKy.reduce((s, e) => s + e.volume, 0);
  const thanhTien = khoiLuong * donGia;
  const daThanhToan = events.filter((e) => e.type === 'customer_deposit' && e.customerId === customerId && trongKy(e)).reduce((s, e) => s + e.amount, 0);
  const duCuoiKy = duDauKy + thanhTien - daThanhToan;
  return { customerName: cus?.name || '—', duDauKy, khoiLuong, donGia, thanhTien, daThanhToan, duCuoiKy, soChuyen: ticketsTrongKy.length };
}
// Khai báo kỹ thuật còn HIỆU LỰC cho 1 biển số = lần khai báo gần nhất (bất kỳ
// lượt vào cổng nào) còn trong hạn 3 ngày làm việc, VÀ sau đó không có báo cáo
// "cơi nới thùng" nào mới hơn (nếu có báo cơi nới thì bắt buộc khai báo lại dù
// chưa hết hạn 3 ngày). Theo Bảng hiệu chỉnh V4.0 mục II.2.
function khaiBaoHopLe(plate, events) {
  const khaiBaoGanNhat = events.filter((e) => e.type === 'ky_thuat_khai_bao' && e.plate === plate).sort((a, b) => b.time.localeCompare(a.time))[0];
  if (!khaiBaoGanNhat) return null;
  if (ngayConLai(khaiBaoGanNhat.time) < 0) return null; // quá 3 ngày kể từ lần khai báo gần nhất
  const baoCoiNoiSauDo = events.some((e) => e.type === 'bao_coi_noi' && e.plate === plate && e.time > khaiBaoGanNhat.time);
  if (baoCoiNoiSauDo) return null; // có báo cơi nới sau lần khai báo -> bắt buộc khai báo lại
  return khaiBaoGanNhat;
}
// lần khai báo gần nhất trước đó của chính biển số này (nếu xe quay lại nhiều lần)
function goiYKhachHangTheoPlate(plate, events) {
  const dangKy = events.filter((e) => e.type === 'dang_ky_xe_khach_hang' && e.plate === plate).sort((a, b) => b.time.localeCompare(a.time))[0];
  if (dangKy) return dangKy.customerId;
  const khaiBaoTruoc = events.filter((e) => e.type === 'ky_thuat_khai_bao' && e.plate === plate).sort((a, b) => b.time.localeCompare(a.time))[0];
  if (khaiBaoTruoc) return khaiBaoTruoc.customerId;
  return null;
}

function BaoCaoKhachHangVaTraSoat({ events, config, setConfig, choSuaDonGia }) {
  const [range, setRange] = useState('day');
  const [search, setSearch] = useState('');
  const [xemChiTiet, setXemChiTiet] = useState(null); // customerId đang xem chi tiết
  const [tuTuyChinh, setTuTuyChinh] = useState(todayStr());
  const [denTuyChinh, setDenTuyChinh] = useState(todayStr());
  const { hoi, ModalHopThoai } = useHopThoai();

  const now = new Date(Date.now() + 7 * 3600 * 1000);
  const today = todayStr();
  let tuNgay = today, denNgay = today;
  if (range === 'week') { const day = now.getUTCDay() || 7; const mon = new Date(now); mon.setUTCDate(now.getUTCDate() - day + 1); tuNgay = mon.toISOString().slice(0, 10); denNgay = today; }
  else if (range === 'month') { tuNgay = today.slice(0, 8) + '01'; denNgay = today; }
  else if (range === 'year') { tuNgay = today.slice(0, 4) + '-01-01'; denNgay = today; }
  else if (range === 'all') { tuNgay = '2020-01-01'; denNgay = today; }
  else if (range === 'tuychinh') { tuNgay = tuTuyChinh; denNgay = denTuyChinh; }

  const inRange = (e, r) => { const d = dayStrOf(e.time); return d >= tuNgay && d <= denNgay; };

  const tickets = events.filter((e) => e.type === 'ticket_print' && inRange(e, range));

  const soCongNo = config.customers.map((c) => tinhCongNoTheoKy(c.id, tuNgay, denNgay, events, config)).map((r, i) => ({ ...r, id: config.customers[i].id }));
  const tongCong = soCongNo.reduce((s, r) => ({ khoiLuong: s.khoiLuong + r.khoiLuong, thanhTien: s.thanhTien + r.thanhTien, daThanhToan: s.daThanhToan + r.daThanhToan }), { khoiLuong: 0, thanhTien: 0, daThanhToan: 0 });

  const suaDonGia = async (c) => {
    const kq = await hoi(`Sửa đơn giá — ${c.customerName}`, [{ key: 'donGia', nhan: 'Đơn giá mới (đ/m³)', kieu: 'number', giaTri: String(c.donGia) }]);
    if (!kq) return;
    const soMoi = Number((kq.donGia || '').toString().replace(/\D/g, ''));
    if (!soMoi) return;
    setConfig({ ...config, customers: config.customers.map((x) => (x.id === c.id ? { ...x, donGia: soMoi } : x)) });
  };

  const traSoatKQ = events.filter((e) => e.type === 'ticket_print').filter((t) => {
    if (!search.trim()) return false;
    const s = search.trim().toLowerCase();
    return (t.plate || '').toLowerCase().includes(s) || (t.excavatorName || '').toLowerCase().includes(s) || (t.customerName || '').toLowerCase().includes(s);
  }).slice().reverse().slice(0, 30);

  const theoMayXuc = {};
  tickets.forEach((t) => { theoMayXuc[t.excavatorName || '—'] = theoMayXuc[t.excavatorName || '—'] || { name: t.excavatorName || '—', m3: 0, soPhieu: 0, laiXucSet: new Set() }; theoMayXuc[t.excavatorName || '—'].m3 += t.volume; theoMayXuc[t.excavatorName || '—'].soPhieu += 1; if (t.operatorName) theoMayXuc[t.excavatorName || '—'].laiXucSet.add(t.operatorName); });
  const caLamViecTrongKy = events.filter((e) => e.type === 'shift_start' && inRange(e, range));
  Object.values(theoMayXuc).forEach((m) => { m.soCa = caLamViecTrongKy.filter((c) => c.excavatorName === m.name).length; });

  // Chi tiết theo khách hàng đang xem: từng ngày/biển số trong kỳ
  const chiTietKH = xemChiTiet ? events.filter((e) => e.type === 'ticket_print' && e.customerId === xemChiTiet && inRange(e, range)).slice().reverse() : [];
  const khDangXem = config.customers.find((c) => c.id === xemChiTiet);
  const donGiaXem = khDangXem?.donGia || 0;

  const xuatCongNoExcel = () => {
    const rows = [
      ['CÔNG TY CP DV VÀ TM THỐNG NHẤT — MỎ KHUÔN GIÀN 3'], ['BÁO CÁO CÔNG NỢ KHÁCH HÀNG'], [`Từ ngày ${ngayVN(tuNgay)} đến ngày ${ngayVN(denNgay)}`], [],
      ['STT', 'Tên khách hàng', 'Dư đầu kỳ', 'Khối lượng (m3)', 'Đơn giá', 'Thành tiền', 'Đã thanh toán', 'Dư cuối kỳ'],
    ];
    soCongNo.forEach((r, i) => rows.push([i + 1, r.customerName, r.duDauKy, r.khoiLuong, r.donGia, r.thanhTien, r.daThanhToan, r.duCuoiKy]));
    rows.push(['', 'Cộng', '', tongCong.khoiLuong, '', tongCong.thanhTien, tongCong.daThanhToan, '']);
    xuatExcel({ 'Công nợ': rows }, `bao-cao-cong-no-${tuNgay}_${denNgay}`);
  };
  const congNoHTML = () => {
    const hang = soCongNo.map((r, i) => `<tr><td>${i + 1}</td><td>${r.customerName}</td><td>${tienVN(r.duDauKy)}</td><td>${soVN(r.khoiLuong)}</td><td>${tienVN(r.donGia)}</td><td>${tienVN(r.thanhTien)}</td><td>${tienVN(r.daThanhToan)}</td><td>${tienVN(r.duCuoiKy)}</td></tr>`).join('');
    return `
      <p class="ct"><b>CÔNG TY CP DV VÀ TM THỐNG NHẤT — MỎ KHUÔN GIÀN 3</b></p>
      <h2 class="ct">BÁO CÁO CÔNG NỢ KHÁCH HÀNG</h2>
      <p class="ct">Từ ngày ${ngayVN(tuNgay)} đến ngày ${ngayVN(denNgay)}</p>
      <table><tr><th>STT</th><th>Tên khách hàng</th><th>Dư đầu kỳ</th><th>Khối lượng (m3)</th><th>Đơn giá</th><th>Thành tiền</th><th>Đã thanh toán</th><th>Dư cuối kỳ</th></tr>${hang}
      <tr><td colspan="3"></td><td><b>Cộng</b></td><td>${soVN(tongCong.khoiLuong)}</td><td></td><td>${tienVN(tongCong.thanhTien)}</td><td>${tienVN(tongCong.daThanhToan)}</td></tr></table>
      <br/><table class="khonvien"><tr><td class="khonvien ct"><b>Kế toán mỏ</b></td><td class="khonvien ct"><b>Kỹ thuật</b></td><td class="khonvien ct"><b>Giám đốc mỏ</b></td></tr></table>
    `;
  };
  const xuatCongNoWord = () => xuatWord(congNoHTML(), `bao-cao-cong-no-${tuNgay}_${denNgay}`);
  const inCongNo = () => inTrucTiep(congNoHTML(), 'Báo cáo công nợ khách hàng');
  const xuatChiTietExcel = () => {
    const rows = [['STT', 'Ngày', 'Biển số xe', 'Số phiếu', 'Khối lượng (m3)', 'Đơn giá', 'Thành tiền']];
    chiTietKH.forEach((t, i) => rows.push([i + 1, gioVN(t.time), t.plate, t.ticketNo, t.volume, donGiaXem, t.volume * donGiaXem]));
    const tongM3 = chiTietKH.reduce((s, t) => s + t.volume, 0);
    rows.push(['', '', '', 'Cộng', tongM3, '', tongM3 * donGiaXem]);
    xuatExcel({ 'Chi tiết': rows }, `chi-tiet-cong-no-${khDangXem?.name || ''}-${tuNgay}_${denNgay}`);
  };
  const inChiTiet = () => {
    const hang = chiTietKH.map((t, i) => `<tr><td>${i + 1}</td><td>${gioVN(t.time)}</td><td>${t.plate}</td><td>${t.ticketNo}</td><td>${soVN(t.volume)}</td><td>${tienVN(donGiaXem)}</td><td>${tienVN(t.volume * donGiaXem)}</td></tr>`).join('');
    const tongM3 = chiTietKH.reduce((s, t) => s + t.volume, 0);
    inTrucTiep(`
      <p class="ct"><b>CÔNG TY CP DV VÀ TM THỐNG NHẤT — MỎ KHUÔN GIÀN 3</b></p>
      <h2 class="ct">CHI TIẾT CÔNG NỢ KHÁCH HÀNG</h2>
      <p class="ct">Tên khách hàng: ${khDangXem?.name || ''}</p>
      <table><tr><th>STT</th><th>Ngày</th><th>Biển số xe</th><th>Số phiếu</th><th>Khối lượng (m3)</th><th>Đơn giá</th><th>Thành tiền</th></tr>${hang}
      <tr><td colspan="4"><b>Cộng</b></td><td>${soVN(tongM3)}</td><td></td><td>${tienVN(tongM3 * donGiaXem)}</td></tr></table>
      <br/><table class="khonvien"><tr><td class="khonvien ct"><b>Xác nhận của khách hàng</b></td><td class="khonvien ct"><b>Kế toán</b></td><td class="khonvien ct"><b>Giám đốc</b></td></tr></table>
    `, `Chi tiết công nợ ${khDangXem?.name || ''}`);
  };

  return (
    <div>
      <div className="flex gap-2 mb-3 flex-wrap">
        {[['day','Ngày'],['week','Tuần'],['month','Tháng'],['year','Năm'],['all','Từ đầu'],['tuychinh','Tùy chọn']].map(([id,label]) => (
          <button key={id} onClick={() => setRange(id)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${range === id ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}>{label}</button>
        ))}
      </div>
      {range === 'tuychinh' && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-slate-400 text-xs">Từ ngày</span>
          <input type="date" value={tuTuyChinh} onChange={(e) => setTuTuyChinh(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" />
          <span className="text-slate-400 text-xs">đến ngày</span>
          <input type="date" value={denTuyChinh} onChange={(e) => setDenTuyChinh(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" />
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2 mt-6 mb-3">
        <h2 className="text-amber-400 font-bold border-l-4 border-orange-600 pl-3">Báo cáo công nợ khách hàng ({ngayVN(tuNgay)} → {ngayVN(denNgay)})</h2>
        <div className="flex gap-2">
          <button onClick={xuatCongNoExcel} className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg"><FileSpreadsheet className="w-3.5 h-3.5" /> Excel</button>
          <button onClick={xuatCongNoWord} className="flex items-center gap-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg"><FileText className="w-3.5 h-3.5" /> Word</button>
          <button onClick={inCongNo} className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg">🖨️ In</button>
        </div>
      </div>
      <Card>
        {soCongNo.length === 0 ? <div className="text-slate-500 text-sm text-center py-4">Chưa có khách hàng.</div> : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[820px]">
            <thead><tr className="text-slate-500 text-xs uppercase">
              <th className="text-left pb-2">Tên khách hàng</th><th className="text-right pb-2">Dư đầu kỳ</th>
              <th className="text-right pb-2">Khối lượng (m³)</th><th className="text-right pb-2">Đơn giá</th>
              <th className="text-right pb-2">Thành tiền</th><th className="text-right pb-2">Đã thanh toán</th>
              <th className="text-right pb-2">Dư cuối kỳ</th><th></th>
            </tr></thead>
            <tbody>
              {soCongNo.map((r) => {
                const mucCanhBao = canhBaoCongNo(r.duCuoiKy, config);
                return (
                  <tr key={r.id} className="border-t border-slate-700">
                    <td className="py-2 text-white font-semibold">{r.customerName}</td>
                    <td className="py-2 text-right text-slate-300">{tienVN(r.duDauKy)}</td>
                    <td className="py-2 text-right text-white font-bold">{soVN(r.khoiLuong)}</td>
                    <td className="py-2 text-right text-slate-300">
                      {choSuaDonGia ? <button onClick={() => suaDonGia(r)} className="underline decoration-dotted hover:text-orange-400">{tienVN(r.donGia)}</button> : tienVN(r.donGia)}
                    </td>
                    <td className="py-2 text-right text-slate-300">{tienVN(r.thanhTien)}</td>
                    <td className="py-2 text-right text-slate-300">{tienVN(r.daThanhToan)}</td>
                    <td className="py-2 text-right"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${mucCanhBao === 'do' ? 'bg-red-500/20 text-red-400' : mucCanhBao === 'vang' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>{tienVN(r.duCuoiKy)}</span></td>
                    <td className="py-2 text-right"><button onClick={() => setXemChiTiet(r.id)} className="text-orange-400 text-xs underline">Chi tiết</button></td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-slate-600 font-bold">
                <td className="py-2 text-white">Cộng</td><td></td>
                <td className="py-2 text-right text-white">{soVN(tongCong.khoiLuong)}</td><td></td>
                <td className="py-2 text-right text-white">{tienVN(tongCong.thanhTien)}</td>
                <td className="py-2 text-right text-white">{tienVN(tongCong.daThanhToan)}</td><td></td><td></td>
              </tr>
            </tbody>
          </table></div>
        )}
      </Card>

      {xemChiTiet && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-40 p-4" onClick={() => setXemChiTiet(null)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-white font-bold">Chi tiết công nợ — {khDangXem?.name}</div>
              <button onClick={xuatChiTietExcel} className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg"><FileSpreadsheet className="w-3.5 h-3.5" /> Excel</button>
              <button onClick={inChiTiet} className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg">🖨️ In</button>
            </div>
            {chiTietKH.length === 0 ? <div className="text-slate-500 text-sm text-center py-6">Không có phiếu nào trong kỳ.</div> : (
              <table className="w-full text-sm"><thead><tr className="text-slate-500 text-xs uppercase"><th className="text-left pb-2">Ngày</th><th className="text-left pb-2">Biển số</th><th className="text-left pb-2">Số phiếu</th><th className="text-right pb-2">m³</th><th className="text-right pb-2">Thành tiền</th></tr></thead>
                <tbody>{chiTietKH.map((t) => (<tr key={t.id} className="border-t border-slate-700"><td className="py-1.5 text-slate-300">{gioVN(t.time)}</td><td className="py-1.5 text-white font-bold">{t.plate}</td><td className="py-1.5 text-slate-400">{t.ticketNo}</td><td className="py-1.5 text-right text-white">{soVN(t.volume)}</td><td className="py-1.5 text-right text-slate-300">{tienVN(t.volume * donGiaXem)}</td></tr>))}</tbody>
              </table>
            )}
            <button onClick={() => setXemChiTiet(null)} className="w-full mt-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded-lg text-sm">Đóng</button>
          </div>
        </div>
      )}

      <SectionTitle>Chi tiết máy xúc làm việc</SectionTitle>
      <Card>
        {Object.values(theoMayXuc).length === 0 ? <div className="text-slate-500 text-sm text-center py-4">Chưa có dữ liệu.</div> : (
          <div className="divide-y divide-slate-700">
            {Object.values(theoMayXuc).sort((a, b) => b.m3 - a.m3).map((r, i) => (
              <div key={i} className="py-2.5">
                <div className="flex justify-between items-baseline">
                  <span className="text-white font-semibold">{r.name}</span>
                  <span className="text-white font-bold">{soVN(r.m3)} m³ <span className="text-slate-400 font-normal text-xs">· {r.soPhieu} phiếu · {r.soCa} ca</span></span>
                </div>
                {r.laiXucSet.size > 0 && <div className="text-slate-500 text-xs mt-0.5">Lái máy xúc: {Array.from(r.laiXucSet).join(', ')}</div>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <SectionTitle>Tra soát nhanh (biển số / máy xúc / khách hàng)</SectionTitle>
      <Card>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nhập biển số, tên máy xúc, hoặc tên khách hàng..." className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white mb-3" />
        {search.trim() && (traSoatKQ.length === 0 ? <div className="text-slate-500 text-sm text-center py-4">Không tìm thấy.</div> : (
          <div className="divide-y divide-slate-700 text-sm">
            {traSoatKQ.map((t) => (
              <div key={t.id} className="py-2 flex justify-between"><div><span className="text-white font-bold tabular-nums">{t.plate}</span><span className="text-slate-500 text-xs"> · {t.excavatorName} · {t.customerName || 'Chưa gán KH'}</span></div><span className="text-slate-400">{soVN(t.volume)} m³ · {gioVN(t.time)}</span></div>
            ))}
          </div>
        ))}
      </Card>
      {ModalHopThoai}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kế toán mỏ
// ---------------------------------------------------------------------------
function AccountantScreen({ events, addEvent, addEvents, config, setConfig }) {
  const [tab, setTab] = useState('phieu');
  const [xemLai, setXemLai] = useState(null);
  const [xemBienBan, setXemBienBan] = useState(null);
  const today = todayStr();
  const tickets = events.filter((e) => e.type === 'ticket_print' && dayStrOf(e.time) === today).slice().reverse();
  const khaiBaoHomNay = events.filter((e) => e.type === 'ky_thuat_khai_bao' && dayStrOf(e.time) === today).slice().reverse();
  const xuatBaoCaoCuoiCa = () => {
    const rows = [
      ['Số phiếu', 'Biển số', 'Khối lượng (m3)', 'Máy xúc', 'Lái máy xúc', 'Khách hàng', 'Thời gian', 'Lái xe đã ký'],
    ];
    tickets.forEach((t) => rows.push([
      t.ticketNo, t.plate, t.volume, t.excavatorName || '', t.operatorName || '', t.customerName || '',
      gioVN(t.time), events.some((e) => e.type === 'phieu_lai_xe_ky' && e.ticketId === t.id) ? 'Có' : 'Chưa',
    ]));
    xuatExcel({ 'Báo cáo cuối ca': rows }, `bao-cao-cuoi-ca-${today}`);
  };
  const bienBans = events.filter((e) => e.type === 'bien_ban' && dayStrOf(e.time) === today).slice().reverse();
  const canhBaoXeLa = events.filter((e) => e.type === 'missing_plate_alert' && !events.some((r) => r.type === 'missing_plate_resolved' && r.alertId === e.id));

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-xl font-bold text-white mt-2">🧾 Kế toán mỏ</h1>
      <p className="text-slate-400 text-sm mb-4">Phiếu do hệ thống tự động lập ngay khi lái máy xúc xác nhận.</p>

      {canhBaoXeLa.length > 0 && (
        <Card className="mb-4 border-red-500">
          <div className="flex items-center gap-2 text-red-400 font-bold text-sm mb-1"><Bell className="w-4 h-4" /> {canhBaoXeLa.length} cảnh báo xe chưa qua cổng đang chờ Bảo vệ xử lý</div>
        </Card>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {[['phieu','Phiếu hôm nay'],['bcao','Theo khách hàng / tra soát'],['maysuc','Báo cáo máy xúc'],['quanlymay','Quản lý máy xúc'],['khachhang','Khách hàng & biển số mới']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === id ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}>{label}</button>
        ))}
      </div>

      {tab === 'phieu' && (
        <>
          <Card>
            <div className="text-white font-bold mb-2">{tickets.length} phiếu hôm nay · {soVN(tickets.reduce((s, t) => s + t.volume, 0))} m³</div>
            {tickets.length === 0 ? <div className="text-slate-500 text-sm text-center py-6">Chưa có phiếu nào.</div> : (
              <div className="divide-y divide-slate-700 text-sm">
                {tickets.map((t) => {
                  const daKy = events.some((e) => e.type === 'phieu_lai_xe_ky' && e.ticketId === t.id);
                  return (
                    <div key={t.id} className="py-2.5">
                      <button onClick={() => setXemLai(t)} className="w-full flex justify-between items-center text-left hover:bg-slate-700/30 px-1 rounded">
                        <div><div className="text-white font-bold tabular-nums">{t.plate}</div><div className="text-slate-500 text-[11px]">{t.ticketNo} · {t.customerName || 'Chưa gán KH'} · {gioVN(t.time)}</div></div>
                        <div className="text-right"><div className="text-white">{soVN(t.volume)} m³</div><div className="text-slate-500 text-[11px] flex items-center gap-1 justify-end"><Printer className="w-3 h-3" /> Xem 3 liên</div></div>
                      </button>
                      <div className="flex items-center gap-2 mt-1 px-1">
                        {daKy ? <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">✓ Lái xe đã ký nhận</span>
                          : <button onClick={() => addEvent({ id: genId('PK'), type: 'phieu_lai_xe_ky', ticketId: t.id, ticketNo: t.ticketNo, plate: t.plate, time: new Date().toISOString() })} className="text-[10px] bg-slate-700 hover:bg-slate-600 text-white px-2 py-1 rounded-full font-semibold">Đánh dấu lái xe đã ký nhận</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
          <SectionTitle>Biên bản kỹ thuật liên quan ({bienBans.length})</SectionTitle>
          <Card>
            {bienBans.length === 0 ? <div className="text-slate-500 text-sm text-center py-6">Chưa có biên bản nào hôm nay.</div> : (
              <div className="divide-y divide-slate-700 text-sm">{bienBans.map((b) => <div key={b.id} className="py-2 flex justify-between"><span className="text-white">{b.soLuongXe} xe · {b.inspectorName}</span><span className="text-slate-400">{gioVN(b.time)}</span></div>)}</div>
            )}
          </Card>
          {khaiBaoHomNay.length > 0 && (
            <>
              <SectionTitle>📋 Biên bản xác nhận khối lượng hôm nay — chỉ cần in ký ({khaiBaoHomNay.length})</SectionTitle>
              <Card>
                <div className="divide-y divide-slate-700 text-sm">
                  {khaiBaoHomNay.map((k) => (
                    <div key={k.id} className="py-2 flex justify-between items-center">
                      <div><span className="text-white font-bold tabular-nums">{k.plate}</span><span className="text-slate-500 text-xs"> · {k.khoiLuong} m³{k.viPham ? ' · ⚠ vi phạm' : ''}</span></div>
                      <button onClick={() => setXemBienBan(k)} className="text-[11px] bg-slate-700 hover:bg-slate-600 text-white px-2.5 py-1 rounded-full font-semibold">Xem / In</button>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}
        </>
      )}
      {tab === 'bcao' && (
        <>
          <SectionTitle>📊 Báo cáo cuối ca</SectionTitle>
          <Card>
            <p className="text-slate-400 text-xs mb-3">Xuất toàn bộ phiếu hôm nay ra file Excel để in, đối chiếu và trình ký với Kỹ thuật và Bảo vệ trước khi kết ca.</p>
            <button onClick={xuatBaoCaoCuoiCa} className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold px-3 py-2.5 rounded-lg"><FileSpreadsheet className="w-4 h-4" /> Xuất báo cáo cuối ca — Excel ({tickets.length} phiếu)</button>
          </Card>
          <BaoCaoKhachHangVaTraSoat events={events} config={config} setConfig={setConfig} choSuaDonGia={true} />
        </>
      )}
      {tab === 'maysuc' && <BaoCaoMayXuc events={events} />}
      {tab === 'quanlymay' && <QuanLyMayXuc config={config} setConfig={setConfig} />}
      {tab === 'khachhang' && (
        <>
          <SectionTitle>Quản lý khách hàng</SectionTitle>
          <QuanLyKhachHang config={config} setConfig={setConfig} events={events} addEvent={addEvent} />
          <SectionTitle>🔀 Đăng ký biển số mới / Điều chuyển xe giữa các khách hàng</SectionTitle>
          <p className="text-slate-400 text-xs mb-2 -mt-2">Đăng ký biển số chưa có, hoặc chọn lại khách hàng khác cho 1 biển số đã có — áp dụng từ lần khai báo/xúc tiếp theo. Giám đốc mỏ có thể cùng thực hiện.</p>
          <DangKyBienSoKhachHang config={config} events={events} addEvent={addEvent} />
        </>
      )}

      {xemLai && (() => {
        const gateIn = events.filter((e) => e.type === 'gate_in' && e.plate === xemLai.plate && dayStrOf(e.time) === dayStrOf(xemLai.time)).sort((a, b) => a.time.localeCompare(b.time))[0];
        const gateOut = events.filter((e) => e.type === 'gate_out' && e.plate === xemLai.plate && e.time > xemLai.time).sort((a, b) => a.time.localeCompare(b.time))[0];
        return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-40 p-4" onClick={() => setXemLai(null)}>
          <div className="flex gap-3 flex-wrap justify-center" onClick={(e) => e.stopPropagation()}>
            {['Liên 1 — Kế toán mỏ lưu', 'Liên 2 — Cấp khách hàng', 'Liên 3 — Lái xe ký nhận, giữ lại'].map((tieuDe) => (
              <div key={tieuDe} className="bg-white text-slate-900 rounded-lg p-4 w-full max-w-[300px] font-mono text-xs" style={{ width: '80mm' }}>
                <div className="text-center font-bold text-[13px]">CÔNG TY CP DV VÀ TM THỐNG NHẤT</div>
                <div className="text-center text-[11px] mb-2">Mỏ Khuôn Giàn 3</div>
                <div className="text-center font-bold text-sm mb-1">PHIẾU XUẤT KHO BÁN HÀNG</div>
                <div className="text-center text-[10px] font-bold text-orange-700 mb-2">({tieuDe})</div>
                <div className="border-t border-dashed border-slate-400 my-2" />
                <div>Số phiếu: <b>{xemLai.ticketNo}</b></div>
                <div className="flex justify-between"><span>Ngày vào: {gateIn ? ngayVN(dayStrOf(gateIn.time)) : '.........'}</span><span>Giờ vào: {gateIn ? gioVN(gateIn.time).split(' ')[0] : '......'}</span></div>
                <div className="flex justify-between"><span>Ngày ra: {gateOut ? ngayVN(dayStrOf(gateOut.time)) : '.........'}</span><span>Giờ ra: {gateOut ? gioVN(gateOut.time).split(' ')[0] : '......'}</span></div>
                <div>Bên mua: <b>{xemLai.customerName || '—'}</b></div>
                <div>Biển số xe: <b className="text-base">{xemLai.plate}</b></div>
                <div className="font-bold text-sm mt-1">Khối lượng: {soVN(xemLai.volume)} m3</div>
                <div className="border-t border-dashed border-slate-400 my-2" />
                <div className="flex justify-center my-2"><PseudoQR seed={xemLai.ticketNo + tieuDe} /></div>
                <div className="flex justify-between mt-3 text-[11px]"><b>Kế toán mỏ</b><b>Lái xe ký nhận</b></div>
              </div>
            ))}
          </div>
        </div>
        );
      })()}
      <BienBanModal khaiBao={xemBienBan} onClose={() => setXemBienBan(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quản lý khách hàng (chỉ Giám đốc sửa) — thêm/nạp tiền ứng trước
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Báo cáo xác nhận khối lượng máy xúc — theo ngày (từng ca) & theo tháng
// (tổng hợp theo kỳ), đúng khuôn mẫu công ty (Bảng hiệu chỉnh V5.0, khổ A5).
// ---------------------------------------------------------------------------
function phienCaLamViec(events, tuNgay, denNgay) {
  const starts = events.filter((e) => e.type === 'shift_start' && dayStrOf(e.time) >= tuNgay && dayStrOf(e.time) <= denNgay);
  return starts.map((s) => {
    const end = events.find((e) => e.type === 'shift_end' && e.sessionId === s.id);
    const loads = events.filter((e) => e.type === 'load_confirm' && e.sessionId === s.id);
    const thoiGianLamViec = end ? dinhDangGio(new Date(end.time) - new Date(s.time)) : 'đang làm việc';
    return { ...s, ketThuc: end?.time || null, thoiGianLamViec, soChuyen: loads.length, tongKhoiLuong: loads.reduce((t, l) => t + l.estVolume, 0) };
  });
}
function BaoCaoMayXuc({ events }) {
  const [tab, setTab] = useState('ngay');
  const [ngay, setNgay] = useState(todayStr());
  const [tuThang, setTuThang] = useState(todayStr().slice(0, 8) + '01');
  const [denThang, setDenThang] = useState(todayStr());
  const [xemChiTietMay, setXemChiTietMay] = useState(null); // excavatorId đang xem chi tiết theo biển số

  const phienNgay = phienCaLamViec(events, ngay, ngay);

  const bcNgayHTML = (p) => `
      <p><b>Công ty CP DV và TM Thống Nhất</b></p><p>Mỏ khuôn giàn 3</p>
      <h2 class="ct">BÁO CÁO XÁC NHẬN KHỐI LƯỢNG MÁY XÚC</h2>
      <p>Ngày ${p.time.slice(8,10)} tháng ${p.time.slice(5,7)} năm ${p.time.slice(0,4)}</p>
      <p><b>Máy xúc:</b> ${p.excavatorName}</p>
      <p><b>Tên lái máy:</b> ${p.operatorName}</p>
      <p><b>Ca làm việc:</b> ${p.shift} &nbsp;&nbsp;&nbsp; <b>Thời gian làm việc:</b> ${p.thoiGianLamViec}</p>
      <p><b>Số chuyến:</b> ${p.soChuyen}</p>
      <p><b>Tổng khối lượng:</b> ${soVN(p.tongKhoiLuong)} m3</p>
      <br/><table class="khonvien"><tr><td class="khonvien ct"><b>KẾ TOÁN MỎ</b></td><td class="khonvien ct"><b>GIÁM ĐỐC MỎ</b></td><td class="khonvien ct"><b>LÁI MÁY</b></td></tr>
      <tr><td class="khonvien" style="height:60px"></td><td class="khonvien"></td><td class="khonvien"></td></tr></table>`;
  const xuatWordNgay = (p) => xuatWord(bcNgayHTML(p), `bao-cao-may-xuc-${p.excavatorName}-${ngay}`);
  const inNgay = (p) => inTrucTiep(bcNgayHTML(p), `Báo cáo ${p.excavatorName}`);
  const xuatExcelMotCa = (p) => {
    const rows = [
      ['Máy xúc', 'Lái máy', 'Ca', 'Thời gian làm việc', 'Số chuyến', 'Tổng khối lượng (m3)'],
      [p.excavatorName, p.operatorName, p.shift, p.thoiGianLamViec, p.soChuyen, p.tongKhoiLuong],
    ];
    xuatExcel({ [`${ngay}`]: rows }, `bao-cao-may-xuc-${p.excavatorName}-${p.operatorName}-${ngay}`);
  };
  const xuatExcelNgay = () => {
    const rows = [['Máy xúc', 'Lái máy', 'Ca', 'Thời gian làm việc', 'Số chuyến', 'Tổng khối lượng (m3)']];
    phienNgay.forEach((p) => rows.push([p.excavatorName, p.operatorName, p.shift, p.thoiGianLamViec, p.soChuyen, p.tongKhoiLuong]));
    xuatExcel({ [`Ngày ${ngay}`]: rows }, `bao-cao-may-xuc-ngay-${ngay}`);
  };

  const phienThang = phienCaLamViec(events, tuThang, denThang);
  const theoMayThang = {};
  phienThang.forEach((p) => {
    theoMayThang[p.excavatorId] = theoMayThang[p.excavatorId] || { excavatorId: p.excavatorId, excavatorName: p.excavatorName, laiXe: new Set(), soChuyen: 0, tongKhoiLuong: 0 };
    theoMayThang[p.excavatorId].laiXe.add(p.operatorName);
    theoMayThang[p.excavatorId].soChuyen += p.soChuyen;
    theoMayThang[p.excavatorId].tongKhoiLuong += p.tongKhoiLuong;
  });
  const dsMayThang = Object.values(theoMayThang);
  const tongThang = dsMayThang.reduce((s, m) => ({ soChuyen: s.soChuyen + m.soChuyen, tongKhoiLuong: s.tongKhoiLuong + m.tongKhoiLuong }), { soChuyen: 0, tongKhoiLuong: 0 });

  const bcThangHTML = () => {
    const hang = dsMayThang.map((m, i) => `<tr><td>${i + 1}</td><td>${m.excavatorName}</td><td>${Array.from(m.laiXe).join(', ')}</td><td>${soVN(m.soChuyen)}</td><td>${soVN(m.tongKhoiLuong)}</td><td></td></tr>`).join('');
    return `
      <p><b>Công ty Cp DV và TM Thống Nhất</b></p><p>Mỏ khuôn giàn 3</p>
      <h2 class="ct">BÁO CÁO TỔNG HỢP KHỐI LƯỢNG MÁY XÚC</h2>
      <p class="ct">Từ ngày ${ngayVN(tuThang)} đến ngày ${ngayVN(denThang)}</p>
      <table><tr><th>STT</th><th>Tên máy xúc</th><th>Tên lái máy</th><th>Số chuyến</th><th>Tổng khối lượng (m3)</th><th>Ghi chú</th></tr>${hang}
      <tr><td colspan="3"><b>Cộng</b></td><td>${soVN(tongThang.soChuyen)}</td><td>${soVN(tongThang.tongKhoiLuong)}</td><td></td></tr></table>
      <br/><table class="khonvien"><tr><td class="khonvien ct"><b>Xác nhận của lái máy</b></td><td class="khonvien ct"><b>Kế toán mỏ</b></td><td class="khonvien ct"><b>Kỹ thuật</b></td></tr></table>`;
  };
  const xuatWordThang = () => xuatWord(bcThangHTML(), `bao-cao-tong-hop-may-xuc-${tuThang}_${denThang}`);
  const inThang = () => inTrucTiep(bcThangHTML(), 'Báo cáo tổng hợp khối lượng máy xúc');
  const xuatExcelThang = () => {
    const rows = [['STT', 'Tên máy xúc', 'Tên lái máy', 'Số chuyến', 'Tổng khối lượng (m3)', 'Ghi chú']];
    dsMayThang.forEach((m, i) => rows.push([i + 1, m.excavatorName, Array.from(m.laiXe).join(', '), m.soChuyen, m.tongKhoiLuong, '']));
    rows.push(['', 'Cộng', '', tongThang.soChuyen, tongThang.tongKhoiLuong, '']);
    xuatExcel({ [`${tuThang}_${denThang}`]: rows }, `bao-cao-tong-hop-may-xuc-${tuThang}_${denThang}`);
  };

  // Chi tiết khối lượng theo TỪNG BIỂN SỐ trong 1 máy xúc — đúng mẫu ảnh 11
  const mayDangXem = dsMayThang.find((m) => m.excavatorId === xemChiTietMay);
  const veTheoBienSo = {};
  if (mayDangXem) {
    events.filter((e) => e.type === 'ticket_print' && e.excavatorId === xemChiTietMay && dayStrOf(e.time) >= tuThang && dayStrOf(e.time) <= denThang)
      .forEach((t) => { veTheoBienSo[t.plate] = veTheoBienSo[t.plate] || { plate: t.plate, soChuyen: 0, khoiLuong: 0 }; veTheoBienSo[t.plate].soChuyen += 1; veTheoBienSo[t.plate].khoiLuong += t.volume; });
  }
  const dsBienSo = Object.values(veTheoBienSo);
  const tongBienSo = dsBienSo.reduce((s, b) => ({ soChuyen: s.soChuyen + b.soChuyen, khoiLuong: s.khoiLuong + b.khoiLuong }), { soChuyen: 0, khoiLuong: 0 });
  const chiTietMayHTML = () => {
    const hang = dsBienSo.map((b, i) => `<tr><td>${i + 1}</td><td>${b.plate}</td><td>${soVN(b.soChuyen)}</td><td>${soVN(b.khoiLuong)}</td></tr>`).join('');
    return `
      <p><b>Công ty Cp DV và TM Thống Nhất</b></p><p>Mỏ khuôn giàn 3</p>
      <h2 class="ct">BÁO CÁO CHI TIẾT KHỐI LƯỢNG MÁY XÚC</h2>
      <p>máy xúc:....${mayDangXem?.excavatorName || ''}.... &nbsp;&nbsp; Lái máy xúc:....${Array.from(mayDangXem?.laiXe || []).join(', ')}....</p>
      <p class="ct">Từ ngày ${ngayVN(tuThang)} đến ngày ${ngayVN(denThang)}</p>
      <table><tr><th>STT</th><th>Biển số xe</th><th>Số chuyến</th><th>Khối lượng (m3)</th></tr>${hang}
      <tr><td colspan="2"><b>Cộng</b></td><td>${soVN(tongBienSo.soChuyen)}</td><td>${soVN(tongBienSo.khoiLuong)}</td></tr></table>
      <br/><table class="khonvien"><tr><td class="khonvien ct"><b>Xác nhận của lái máy</b></td><td class="khonvien ct"><b>Kế toán mỏ</b></td><td class="khonvien ct"><b>Kỹ thuật</b></td></tr></table>`;
  };

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('ngay')} className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === 'ngay' ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}>Theo ngày</button>
        <button onClick={() => setTab('thang')} className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === 'thang' ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}>Theo kỳ / tháng</button>
      </div>

      {tab === 'ngay' && (
        <>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <input type="date" value={ngay} onChange={(e) => setNgay(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" />
            <button onClick={xuatExcelNgay} className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold px-2.5 py-2 rounded-lg"><FileSpreadsheet className="w-3.5 h-3.5" /> Xuất Excel cả ngày</button>
          </div>
          {phienNgay.length === 0 ? <Card><div className="text-slate-500 text-sm text-center py-6">Không có ca làm việc nào ngày này.</div></Card> : phienNgay.map((p) => (
            <Card key={p.id} className="mb-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-white font-bold">{p.excavatorName} · {p.operatorName}</div>
                  <div className="text-slate-400 text-xs">Ca {p.shift} · {p.thoiGianLamViec} · {p.soChuyen} chuyến · {soVN(p.tongKhoiLuong)} m³</div>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => xuatExcel({ [`${p.excavatorName}-${ngay}`]: [['Máy xúc', 'Lái máy', 'Ca', 'Thời gian làm việc', 'Số chuyến', 'Tổng khối lượng (m3)'], [p.excavatorName, p.operatorName, p.shift, p.thoiGianLamViec, p.soChuyen, p.tongKhoiLuong]] }, `bao-cao-${p.excavatorName}-${p.operatorName}-${ngay}`)} className="flex items-center gap-1 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg"><FileSpreadsheet className="w-3.5 h-3.5" /></button>
                  <button onClick={() => xuatExcelMotCa(p)} className="flex items-center gap-1 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg"><FileSpreadsheet className="w-3.5 h-3.5" /></button>
                  <button onClick={() => xuatWordNgay(p)} className="flex items-center gap-1 bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg"><FileText className="w-3.5 h-3.5" /> Word</button>
                  <button onClick={() => inNgay(p)} className="flex items-center gap-1 bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg">🖨️</button>
                </div>
              </div>
            </Card>
          ))}
        </>
      )}

      {tab === 'thang' && (
        <>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <input type="date" value={tuThang} onChange={(e) => setTuThang(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" />
            <span className="text-slate-400">→</span>
            <input type="date" value={denThang} onChange={(e) => setDenThang(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" />
            <button onClick={xuatExcelThang} className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold px-2.5 py-2 rounded-lg"><FileSpreadsheet className="w-3.5 h-3.5" /> Excel</button>
            <button onClick={xuatWordThang} className="flex items-center gap-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold px-2.5 py-2 rounded-lg"><FileText className="w-3.5 h-3.5" /> Word</button>
            <button onClick={inThang} className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold px-2.5 py-2 rounded-lg">🖨️ In</button>
          </div>
          <Card>
            {dsMayThang.length === 0 ? <div className="text-slate-500 text-sm text-center py-4">Chưa có dữ liệu.</div> : (
              <div className="divide-y divide-slate-700">
                {dsMayThang.map((m, i) => (
                  <div key={i} className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="text-white font-semibold">{m.excavatorName}</div>
                      <div className="text-slate-400 text-xs">Lái máy: {Array.from(m.laiXe).join(', ')} · {m.soChuyen} chuyến · {soVN(m.tongKhoiLuong)} m³</div>
                    </div>
                    <button onClick={() => setXemChiTietMay(m.excavatorId)} className="text-orange-400 text-xs underline flex-shrink-0">Chi tiết theo xe</button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {xemChiTietMay && mayDangXem && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-40 p-4" onClick={() => setXemChiTietMay(null)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-white font-bold">Chi tiết theo xe — {mayDangXem.excavatorName}</div>
              <div className="flex gap-1.5">
                <button onClick={() => xuatExcel({ 'Chi tiết': [['STT', 'Biển số xe', 'Số chuyến', 'Khối lượng (m3)'], ...dsBienSo.map((b, i) => [i + 1, b.plate, b.soChuyen, b.khoiLuong]), ['', 'Cộng', tongBienSo.soChuyen, tongBienSo.khoiLuong]] }, `chi-tiet-${mayDangXem.excavatorName}-${tuThang}_${denThang}`)} className="flex items-center gap-1 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg"><FileSpreadsheet className="w-3.5 h-3.5" /></button>
                <button onClick={() => inTrucTiep(chiTietMayHTML(), `Chi tiết ${mayDangXem.excavatorName}`)} className="flex items-center gap-1 bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg">🖨️</button>
              </div>
            </div>
            {dsBienSo.length === 0 ? <div className="text-slate-500 text-sm text-center py-6">Không có dữ liệu.</div> : (
              <table className="w-full text-sm"><thead><tr className="text-slate-500 text-xs uppercase"><th className="text-left pb-2">Biển số</th><th className="text-right pb-2">Số chuyến</th><th className="text-right pb-2">m³</th></tr></thead>
                <tbody>{dsBienSo.map((b) => (<tr key={b.plate} className="border-t border-slate-700"><td className="py-1.5 text-white font-bold">{b.plate}</td><td className="py-1.5 text-right text-slate-300">{b.soChuyen}</td><td className="py-1.5 text-right text-white">{soVN(b.khoiLuong)}</td></tr>))}</tbody>
              </table>
            )}
            <button onClick={() => setXemChiTietMay(null)} className="w-full mt-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded-lg text-sm">Đóng</button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuanLyKhachHang({ config, setConfig, events, addEvent }) {
  const [toast, notify] = useToast();
  const { hoi, ModalHopThoai } = useHopThoai();
  const themKH = async () => {
    const kq = await hoi('Thêm khách hàng mới', [
      { key: 'ten', nhan: 'Tên khách hàng' },
      { key: 'donGia', nhan: 'Đơn giá (đ/m³)', kieu: 'number', giaTri: '65000' },
    ]);
    if (!kq || !kq.ten || !kq.ten.trim()) return;
    setConfig({ ...config, customers: [...config.customers, { id: genId('KH'), name: kq.ten.trim(), donGia: Number(kq.donGia) || 65000 }] });
    notify(`Đã thêm khách hàng "${kq.ten.trim()}"`);
  };
  const napTien = async (c) => {
    const kq = await hoi(`Khách "${c.name}" nộp thêm bao nhiêu?`, [{ key: 'soTien', nhan: 'Số tiền (đ)', kieu: 'number', giaTri: '100000000' }]);
    if (!kq) return;
    const amount = Number((kq.soTien || '').toString().replace(/\D/g, ''));
    if (!amount) return notify('Số tiền không hợp lệ', true);
    addEvent({ id: genId('DP'), type: 'customer_deposit', customerId: c.id, amount, time: new Date().toISOString() });
    notify(`Đã ghi nhận ${c.name} nộp thêm ${tienVN(amount)}`);
  };
  return (
    <Card>
      <div className="font-bold text-white text-sm mb-3">Danh sách khách hàng</div>
      {config.customers.map((c) => {
        const soDu = tinhSoDuKhachHang(c.id, events, config);
        const mucCanhBao = canhBaoCongNo(soDu, config);
        return (
          <div key={c.id} className="flex items-center justify-between py-2 border-b border-slate-700 last:border-0">
            <div><div className="text-white font-semibold text-sm">{c.name}</div><div className="text-slate-500 text-xs">Đơn giá {tienVN(c.donGia)}/m³ · Số dư: <span className={mucCanhBao === 'do' ? 'text-red-400' : mucCanhBao === 'vang' ? 'text-amber-400' : 'text-emerald-400'}>{tienVN(soDu)}</span></div></div>
            <button onClick={() => napTien(c)} className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1"><Wallet className="w-3.5 h-3.5" /> Nạp tiền</button>
          </div>
        );
      })}
      <button onClick={themKH} className="w-full mt-3 flex items-center justify-center gap-1 bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold py-2 rounded-lg"><Plus className="w-4 h-4" /> Thêm khách hàng</button>
      <Toast msg={toast?.msg} err={toast?.err} />
      {ModalHopThoai}
    </Card>
  );
}

// Đăng ký trước cặp Biển số xe ↔ Khách hàng — giúp Kỹ thuật khai báo nhanh hơn
// (tự gợi ý đúng khách hàng khi gặp biển số đã đăng ký), theo Bảng hiệu chỉnh
// V3.0 mục IV.4.2 "thêm phần khai báo khách hàng và biển số xe mới".
// Quản lý danh sách máy xúc — Kế toán mỏ khai báo tên máy + chủ sở hữu (máy
// của nhà cung cấp/cá nhân nào), theo Bảng hiệu chỉnh V10.0 mục III.3/IV.4.
function QuanLyMayXuc({ config, setConfig }) {
  const [toast, notify] = useToast();
  const { hoi, ModalHopThoai } = useHopThoai();

  const themMay = async () => {
    const kq = await hoi('Thêm máy xúc mới', [
      { key: 'name', nhan: 'Tên máy xúc (VD: Máy xúc 03)' },
      { key: 'chuSoHuu', nhan: 'Máy của ai / nhà cung cấp nào' },
    ]);
    if (!kq || !kq.name?.trim()) return;
    const id = genId('MX');
    setConfig({ ...config, excavators: [...config.excavators, { id, name: kq.name.trim(), chuSoHuu: kq.chuSoHuu?.trim() || '' }] });
    notify(`Đã thêm "${kq.name.trim()}"`);
  };
  const suaChuSoHuu = async (x) => {
    const kq = await hoi(`Sửa chủ sở hữu — ${x.name}`, [{ key: 'chuSoHuu', nhan: 'Máy của ai / nhà cung cấp nào', giaTri: x.chuSoHuu || '' }]);
    if (!kq) return;
    setConfig({ ...config, excavators: config.excavators.map((m) => (m.id === x.id ? { ...m, chuSoHuu: kq.chuSoHuu?.trim() || '' } : m)) });
    notify('Đã cập nhật chủ sở hữu');
  };

  return (
    <Card>
      <div className="font-bold text-white text-sm mb-3">Danh sách máy xúc hoạt động trong mỏ</div>
      <div className="divide-y divide-slate-700">
        {config.excavators.map((x) => (
          <div key={x.id} className="flex items-center justify-between py-2">
            <div>
              <div className="text-white font-semibold text-sm">{x.name}</div>
              <div className="text-slate-500 text-xs">Chủ sở hữu: {x.chuSoHuu || <span className="italic">chưa khai báo</span>}</div>
            </div>
            <button onClick={() => suaChuSoHuu(x)} className="text-[11px] bg-slate-700 hover:bg-slate-600 text-white px-2.5 py-1.5 rounded-lg font-semibold">Sửa</button>
          </div>
        ))}
      </div>
      <button onClick={themMay} className="w-full mt-3 flex items-center justify-center gap-1 bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold py-2 rounded-lg"><Plus className="w-4 h-4" /> Thêm máy xúc</button>
      <Toast msg={toast?.msg} err={toast?.err} />
      {ModalHopThoai}
    </Card>
  );
}

function DangKyBienSoKhachHang({ config, events, addEvent }) {
  const [plate, setPlate] = useState('');
  const [customerId, setCustomerId] = useState(config.customers[0]?.id || '');
  const [toast, notify] = useToast();

  const dangKy = () => {
    const p = plate.trim().toUpperCase();
    if (!p) return notify('Nhập biển số xe', true);
    const customer = config.customers.find((c) => c.id === customerId);
    if (!customer) return notify('Chưa có khách hàng để gán', true);
    addEvent({ id: genId('DK'), type: 'dang_ky_xe_khach_hang', plate: p, customerId, customerName: customer.name, time: new Date().toISOString() });
    setPlate('');
    notify(`Đã đăng ký xe ${p} thuộc khách hàng ${customer.name}`);
  };

  const daDangKy = events.filter((e) => e.type === 'dang_ky_xe_khach_hang').slice().reverse().slice(0, 10);

  return (
    <Card>
      <div className="grid grid-cols-2 gap-2">
        <input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="Biển số xe" className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" />
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm">
          {config.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <button onClick={dangKy} className="w-full mt-2 bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 rounded-lg text-sm">Đăng ký</button>
      {daDangKy.length > 0 && (
        <div className="mt-3 divide-y divide-slate-700 text-sm">
          {daDangKy.map((d) => <div key={d.id} className="py-1.5 flex justify-between"><span className="text-white font-bold tabular-nums">{d.plate}</span><span className="text-slate-400">{d.customerName}</span></div>)}
        </div>
      )}
      <Toast msg={toast?.msg} err={toast?.err} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Dashboard dùng chung cho Giám đốc mỏ và Trụ sở chính
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Nhật ký hoạt động — tra cứu được TOÀN BỘ lịch sử mọi hành động trên phần
// mềm (Bảng hiệu chỉnh V5.0, mục VII). Nhờ kiến trúc lưu theo sự kiện (event-
// sourcing), mọi thao tác từ trước đến nay đều đã được lưu vết đầy đủ sẵn —
// màn này chỉ là nơi tra cứu trực quan lại toàn bộ.
// ---------------------------------------------------------------------------
const NHAN_LOAI_SU_KIEN = {
  gate_in: 'Xe vào cổng', gate_out: 'Xe ra cổng', missing_plate_alert: 'Cảnh báo xe chưa qua cổng',
  missing_plate_resolved: 'Xử lý cảnh báo xe', ky_thuat_khai_bao: 'Kỹ thuật khai báo', bien_ban: 'Lập biên bản',
  bien_ban_khong_ra: 'Biên bản xe không ra', bao_coi_noi: 'Báo cơi nới thùng', shift_start: 'Nhận ca',
  shift_end: 'Trả ca', load_confirm: 'Xác nhận xúc đầy xe', ticket_print: 'Tự động lập phiếu',
  phieu_lai_xe_ky: 'Lái xe ký nhận phiếu', customer_deposit: 'Khách hàng thanh toán',
  dang_ky_xe_khach_hang: 'Đăng ký/điều chuyển biển số',
};
function NhatKyHoatDong({ events }) {
  const [tuNgay, setTuNgay] = useState(todayStr());
  const [denNgay, setDenNgay] = useState(todayStr());
  const [search, setSearch] = useState('');
  const [loaiLoc, setLoaiLoc] = useState('');

  const ketQua = events.filter((e) => {
    const d = dayStrOf(e.time);
    if (d < tuNgay || d > denNgay) return false;
    if (loaiLoc && e.type !== loaiLoc) return false;
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      const noiDung = JSON.stringify(e).toLowerCase();
      if (!noiDung.includes(s)) return false;
    }
    return true;
  }).slice().reverse().slice(0, 200);

  const xuatExcelNhatKy = () => {
    const rows = [['Thời gian', 'Loại sự kiện', 'Biển số', 'Người thực hiện', 'Chi tiết']];
    ketQua.forEach((e) => rows.push([gioVN(e.time), NHAN_LOAI_SU_KIEN[e.type] || e.type, e.plate || '', e.inspectorName || e.operatorName || e.reportedBy || e.myName || '', JSON.stringify(e)]));
    xuatExcel({ 'Nhật ký': rows }, `nhat-ky-hoat-dong-${tuNgay}_${denNgay}`);
  };

  return (
    <div>
      <p className="text-slate-400 text-sm mb-3">Tra cứu toàn bộ lịch sử thao tác trên phần mềm — mọi hành động đều được lưu vết vĩnh viễn, không thể xóa/sửa.</p>
      <div className="flex flex-wrap gap-2 mb-3">
        <input type="date" value={tuNgay} onChange={(e) => setTuNgay(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" />
        <span className="text-slate-400 self-center">→</span>
        <input type="date" value={denNgay} onChange={(e) => setDenNgay(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" />
        <select value={loaiLoc} onChange={(e) => setLoaiLoc(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm">
          <option value="">Tất cả loại</option>
          {Object.entries(NHAN_LOAI_SU_KIEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button onClick={xuatExcelNhatKy} className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold px-2.5 py-2 rounded-lg"><FileSpreadsheet className="w-3.5 h-3.5" /> Xuất Excel</button>
      </div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo biển số, tên người thực hiện..." className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white mb-3" />
      <Card>
        <div className="text-slate-400 text-xs mb-2">{ketQua.length} kết quả (tối đa hiển thị 200 gần nhất)</div>
        {ketQua.length === 0 ? <div className="text-slate-500 text-sm text-center py-6">Không có dữ liệu trong khoảng đã chọn.</div> : (
          <div className="divide-y divide-slate-700 text-sm max-h-[60vh] overflow-y-auto">
            {ketQua.map((e) => (
              <div key={e.id} className="py-2">
                <div className="flex justify-between"><span className="text-white font-semibold">{NHAN_LOAI_SU_KIEN[e.type] || e.type}</span><span className="text-slate-500 text-xs">{gioVN(e.time)}</span></div>
                <div className="text-slate-400 text-xs">{e.plate && `Biển số: ${e.plate} · `}{(e.inspectorName || e.operatorName || e.reportedBy) && `Người thực hiện: ${e.inspectorName || e.operatorName || e.reportedBy}`}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quản lý tài khoản — CHỈ Ban lãnh đạo (TGĐ/Giám đốc điều hành) truy cập.
// Theo Bảng hiệu chỉnh V7.0 mục I.1: mỗi người 1 tài khoản riêng, việc thêm
// mới/khoá tài khoản phải do Ban lãnh đạo thực hiện — vì màn này chỉ Ban
// lãnh đạo vào được nên mọi thao tác ở đây MẶC NHIÊN đã qua phê duyệt.
// ---------------------------------------------------------------------------
const NHAN_PHAN_HE = {
  baove: 'Bảo vệ', kythuat: 'Kỹ thuật', laixuc: 'Lái xúc', ketoan: 'Kế toán mỏ',
  giamdoc: 'Giám đốc mỏ', ketoancongty: 'Kế toán công ty', banlanhdao: 'Ban lãnh đạo',
};
function QuanLyTaiKhoan() {
  const [users, setUsers] = useState(null);
  const [yeuCau, setYeuCau] = useState([]);
  const [dangTai, setDangTai] = useState(true);
  const [toast, notify] = useToast();
  const { hoi, hoiXacNhan, ModalHopThoai } = useHopThoai();

  const taiLai = async () => {
    setDangTai(true);
    const ds = await seedUsersIfNeeded();
    setUsers(ds);
    if (ds) {
      const yc = await storageGet('account_requests', true, []);
      setYeuCau(yc.filter((y) => y.trangThai === 'cho_duyet'));
    }
    setDangTai(false);
  };
  useEffect(() => { taiLai(); }, []);

  const taoTaiKhoanTu = async (hoTen, chucDanh, phanHe) => {
    let username = taoUsernameTuHoTen(hoTen);
    const trung = users.some((u) => u.username === username);
    if (trung) username = username + Math.floor(10 + Math.random() * 89);
    const { salt, hash } = await hashPassword('ThongNhat@123');
    return { id: username, username, name: hoTen.trim(), chucDanh: chucDanh.trim(), role: phanHe, salt, hash, mustChangePassword: true, active: true };
  };

  const duyetYeuCau = async (yc) => {
    const moi = await taoTaiKhoanTu(yc.hoTen, yc.chucDanh, yc.phanHe);
    const nextUsers = [...users, moi];
    await storageSet('users', nextUsers, true);
    setUsers(nextUsers);
    const tatCaYC = await storageGet('account_requests', true, []);
    const nextYC = tatCaYC.map((y) => (y.id === yc.id ? { ...y, trangThai: 'da_duyet' } : y));
    await storageSet('account_requests', nextYC, true);
    setYeuCau(nextYC.filter((y) => y.trangThai === 'cho_duyet'));
    notify(`Đã duyệt — tạo tài khoản "${moi.username}" cho ${yc.hoTen}, mật khẩu mặc định ThongNhat@123`);
  };
  const tuChoiYeuCau = async (yc) => {
    const tatCaYC = await storageGet('account_requests', true, []);
    const nextYC = tatCaYC.map((y) => (y.id === yc.id ? { ...y, trangThai: 'tu_choi' } : y));
    await storageSet('account_requests', nextYC, true);
    setYeuCau(nextYC.filter((y) => y.trangThai === 'cho_duyet'));
    notify(`Đã từ chối yêu cầu của ${yc.hoTen}`);
  };

  const themTaiKhoan = async () => {
    const kq = await hoi('Thêm tài khoản mới', [
      { key: 'hoTen', nhan: 'Họ và tên đầy đủ' },
      { key: 'chucDanh', nhan: 'Chức danh' },
      { key: 'phanHe', nhan: 'Phân hệ', kieu: 'chon', giaTri: 'baove', tuyChon: Object.entries(NHAN_PHAN_HE).map(([k, v]) => ({ value: k, nhan: v })) },
    ]);
    if (!kq || !kq.hoTen?.trim() || !kq.chucDanh?.trim()) return;
    const moi = await taoTaiKhoanTu(kq.hoTen, kq.chucDanh, kq.phanHe);
    const next = [...users, moi];
    await storageSet('users', next, true);
    setUsers(next);
    notify(`Đã thêm tài khoản "${moi.username}" cho ${kq.hoTen} — mật khẩu mặc định ThongNhat@123`);
  };

  const doiTrangThai = async (u) => {
    if (u.role === 'banlanhdao' && u.active) {
      const dongY = await hoiXacNhan(`Khoá tài khoản Ban lãnh đạo "${u.name}"?\nHãy chắc chắn còn ít nhất 1 tài khoản Ban lãnh đạo khác đang hoạt động.`);
      if (!dongY) return;
    }
    const next = users.map((x) => (x.id === u.id ? { ...x, active: !x.active } : x));
    await storageSet('users', next, true);
    setUsers(next);
    notify(u.active ? `Đã khoá tài khoản ${u.name}` : `Đã mở khoá tài khoản ${u.name}`);
  };

  const xoaTaiKhoan = async (u) => {
    const dongY = await hoiXacNhan(`XOÁ HẲN tài khoản "${u.name}" (${u.username})?\nKhông thể hoàn tác. Dùng để dọn tài khoản giả định/trùng lặp không còn dùng.`);
    if (!dongY) return;
    const next = users.filter((x) => x.id !== u.id);
    await storageSet('users', next, true);
    setUsers(next);
    notify(`Đã xoá tài khoản "${u.name}"`);
  };

  if (dangTai) return <Card><div className="text-slate-500 text-sm text-center py-6">Đang tải danh sách tài khoản...</div></Card>;
  if (!users) return (
    <Card>
      <div className="text-red-400 text-sm text-center py-4">Không tải được danh sách tài khoản do lỗi kết nối tạm thời.</div>
      <button onClick={taiLai} className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2.5 rounded-lg text-sm">Thử lại</button>
    </Card>
  );

  const theoNhom = {};
  users.forEach((u) => { (theoNhom[u.role] = theoNhom[u.role] || []).push(u); });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-slate-400 text-sm">Chỉ Ban lãnh đạo mới thêm/khoá được tài khoản. Mật khẩu mặc định cho tài khoản mới: <code className="text-emerald-400">ThongNhat@123</code>.</p>
      </div>

      {yeuCau.length > 0 && (
        <Card className="mb-4 border-amber-500">
          <div className="font-bold text-white text-sm mb-2">🔔 Yêu cầu tài khoản mới chờ duyệt ({yeuCau.length})</div>
          <div className="divide-y divide-slate-700">
            {yeuCau.map((yc) => (
              <div key={yc.id} className="py-2.5 flex items-center justify-between gap-2">
                <div>
                  <div className="text-white font-semibold text-sm">{yc.hoTen} — {yc.chucDanh}</div>
                  <div className="text-slate-500 text-xs">Phân hệ: {NHAN_PHAN_HE[yc.phanHe] || yc.phanHe} · {gioVN(yc.time)}</div>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button onClick={() => duyetYeuCau(yc)} className="text-[11px] bg-emerald-700 hover:bg-emerald-600 text-white px-2.5 py-1.5 rounded-lg font-semibold">Duyệt</button>
                  <button onClick={() => tuChoiYeuCau(yc)} className="text-[11px] bg-red-900/50 hover:bg-red-900/70 text-red-300 px-2.5 py-1.5 rounded-lg font-semibold">Từ chối</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <button onClick={themTaiKhoan} className="w-full mb-2 flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-bold py-2.5 rounded-lg text-sm"><Plus className="w-4 h-4" /> Thêm tài khoản mới</button>
      {users.some((u) => u.role !== 'banlanhdao') && (
        <button onClick={async () => {
          const soLuong = users.filter((u) => u.role !== 'banlanhdao').length;
          const dongY = await hoiXacNhan(`XOÁ HẲN toàn bộ ${soLuong} tài khoản KHÔNG PHẢI Ban lãnh đạo?\nDùng để dọn sạch tài khoản giả định/thử nghiệm trước khi đưa vào dùng thật. Không thể hoàn tác.`);
          if (!dongY) return;
          const next = users.filter((u) => u.role === 'banlanhdao');
          await storageSet('users', next, true);
          setUsers(next);
          notify(`Đã xoá ${soLuong} tài khoản, chỉ giữ lại Ban lãnh đạo`);
        }} className="w-full mb-4 text-red-400 hover:text-red-300 text-xs underline">Xoá tất cả tài khoản giả định (chỉ giữ Ban lãnh đạo)</button>
      )}

      {Object.entries(NHAN_PHAN_HE).map(([role, nhan]) => (
        theoNhom[role] && (
          <Card key={role} className="mb-3">
            <div className="font-bold text-white text-sm mb-2">{nhan} ({theoNhom[role].length})</div>
            <div className="divide-y divide-slate-700">
              {theoNhom[role].map((u) => (
                <div key={u.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className={`text-sm font-semibold ${u.active ? 'text-white' : 'text-slate-500 line-through'}`}>{u.name} <span className="text-slate-500 font-normal">— {u.chucDanh}</span></div>
                    <div className="text-slate-500 text-[11px]">tài khoản: <code>{u.username}</code>{!u.active && <span className="text-red-400 ml-2">ĐÃ KHOÁ</span>}</div>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => doiTrangThai(u)} className={`text-[11px] px-2.5 py-1.5 rounded-full font-semibold ${u.active ? 'bg-red-900/40 text-red-300 hover:bg-red-900/60' : 'bg-emerald-900/40 text-emerald-300 hover:bg-emerald-900/60'}`}>{u.active ? 'Khoá' : 'Mở khoá'}</button>
                    <button onClick={() => xoaTaiKhoan(u)} className="text-[11px] px-2.5 py-1.5 rounded-full font-semibold bg-slate-700 text-slate-300 hover:bg-slate-600">Xoá</button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )
      ))}
      <Toast msg={toast?.msg} err={toast?.err} />
      {ModalHopThoai}
    </div>
  );
}

function DashboardScreen({ events, addEvent, config, setConfig, vaiTro }) {
  const [range, setRange] = useState('day');
  const [donGia, setDonGia] = useState(config.donGiaBanDat);
  const [tab, setTab] = useState('tongquan');
  const [toast, notify] = useToast();
  const { hoi, ModalHopThoai } = useHopThoai();
  const isHeadOffice = vaiTro !== 'giamdoc';
  const dcSuaKhachHang = vaiTro === 'giamdoc' || vaiTro === 'ketoancongty'; // được thêm KH / nạp tiền / điều chuyển xe
  const dcCauHinh = vaiTro === 'giamdoc'; // chỉ Giám đốc sửa máy xúc/lái máy xúc/sản lượng năm

  const inRange = (e, r) => {
    const d = dayStrOf(e.time);
    const now = new Date(Date.now() + 7 * 3600 * 1000);
    if (r === 'day') return d === todayStr();
    if (r === 'week') { const day = now.getUTCDay() || 7; const mon = new Date(now); mon.setUTCDate(now.getUTCDate() - day + 1); return d >= mon.toISOString().slice(0, 10) && d <= todayStr(); }
    if (r === 'month') return d.slice(0, 7) === todayStr().slice(0, 7);
    if (r === 'year') return d.slice(0, 4) === todayStr().slice(0, 4);
    return true;
  };

  const filtered = events.filter((e) => inRange(e, range));
  const loads = filtered.filter((e) => e.type === 'load_confirm');
  const tickets = filtered.filter((e) => e.type === 'ticket_print');
  const gateIns = filtered.filter((e) => e.type === 'gate_in' && e.plate);

  const tongKhoiLuongXuc = loads.reduce((s, l) => s + l.estVolume, 0);
  const tongKhoiLuongPhieu = tickets.reduce((s, t) => s + t.volume, 0);
  const chenhLech = tongKhoiLuongXuc - tongKhoiLuongPhieu;

  const allLoads = events.filter((e) => e.type === 'load_confirm');
  const tongLuyKeM3 = allLoads.reduce((s, l) => s + l.estVolume, 0);
  const thietKe = config.thietKe || DEFAULT_CONFIG.thietKe;
  const tongLuyKeNguyenKhoi = tongLuyKeM3 / thietKe.heSoNoRoi;
  const phanTram = Math.min(100, Math.round((tongLuyKeNguyenKhoi / thietKe.tongTruLuongNguyenKhoi) * 1000) / 10);

  const days = lastNDays(range === 'all' ? 30 : 14);
  const chartData = days.map((d) => { const dayLoads = events.filter((e) => e.type === 'load_confirm' && dayStrOf(e.time) === d); return { ngay: d.slice(5), m3: dayLoads.reduce((s, l) => s + l.estVolume, 0) }; });

  const xuatCSV = () => {
    const rows = [['Số phiếu', 'Biển số', 'Khối lượng (m3)', 'Máy xúc', 'Khách hàng', 'Thời gian']];
    tickets.forEach((t) => rows.push([t.ticketNo, t.plate, t.volume, t.excavatorName || '', t.customerName || '', gioVN(t.time)]));
    xuatExcel({ 'Báo cáo': rows }, `bao-cao-${range}-${todayStr()}`);
  };
  const themMayXuc = async () => {
    const kq = await hoi('Thêm máy xúc mới', [{ key: 'id', nhan: 'Mã máy xúc' }, { key: 'name', nhan: 'Tên hiển thị' }]);
    if (!kq || !kq.id?.trim() || !kq.name?.trim()) return;
    setConfig({ ...config, excavators: [...config.excavators, { id: kq.id.trim(), name: kq.name.trim() }] });
    notify(`Đã thêm máy xúc "${kq.name.trim()}"`);
  };
  const themLaiXuc = async () => {
    const kq = await hoi('Thêm lái máy xúc mới', [{ key: 'id', nhan: 'Mã lái máy xúc' }, { key: 'name', nhan: 'Họ tên' }]);
    if (!kq || !kq.id?.trim() || !kq.name?.trim()) return;
    setConfig({ ...config, operators: [...config.operators, { id: kq.id.trim(), name: kq.name.trim() }] });
    notify(`Đã thêm lái máy xúc "${kq.name.trim()}"`);
  };
  const suaSanLuongNam = async (nam) => {
    const cur = thietKe.theoNam.find((n) => n.nam === nam);
    const kq = await hoi(`Sản lượng mục tiêu năm ${nam} (m³ nguyên khối)`, [{ key: 'v', nhan: '', kieu: 'number', giaTri: String(cur?.nguyenKhoi || 0) }]);
    if (!kq) return;
    const so = Number((kq.v || '').toString().replace(/\./g, '').replace(/,/g, '')); if (!Number.isFinite(so) || so < 0) return notify('Số không hợp lệ', true);
    const theoNamMoi = thietKe.theoNam.map((n) => (n.nam === nam ? { ...n, nguyenKhoi: so } : n));
    setConfig({ ...config, thietKe: { ...thietKe, theoNam: theoNamMoi, tongTruLuongNguyenKhoi: theoNamMoi.reduce((s, n) => s + n.nguyenKhoi, 0) } });
    notify(`Đã cập nhật sản lượng năm ${nam}`);
  };

  const TIEU_DE = { giamdoc: 'Giám đốc mỏ — Hiện trường', ketoancongty: 'Kế toán công ty — Trụ sở', banlanhdao: 'Ban lãnh đạo trụ sở (chỉ xem)' };

  return (
    <div className="max-w-5xl mx-auto p-4">
      <h1 className="text-xl font-bold text-white mt-2 flex items-center gap-2">
        {isHeadOffice ? <Building2 className="w-5 h-5 text-orange-500" /> : <LayoutDashboard className="w-5 h-5 text-orange-500" />} {TIEU_DE[vaiTro]}
      </h1>
      {vaiTro === 'banlanhdao' && <p className="text-slate-400 text-xs mb-2">Chỉ xem báo cáo tổng quan — không có quyền chỉnh sửa dữ liệu.</p>}

      <div className="flex gap-2 mb-4 flex-wrap">
        {[['tongquan','Tổng quan'],['khachhang','Khách hàng / tra soát'],['nhatky','Nhật ký hoạt động'],['taikhoan','Quản lý tài khoản'],['cauhinh','Cấu hình']].map(([id, label]) => {
          if (id === 'cauhinh' && !dcCauHinh && !dcSuaKhachHang) return null;
          if (id === 'taikhoan' && vaiTro !== 'banlanhdao') return null;
          return <button key={id} onClick={() => setTab(id)} className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === id ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}>{id === 'cauhinh' ? (dcCauHinh ? 'Cấu hình' : 'Khách hàng & điều chuyển xe') : label}</button>;
        })}
      </div>

      {tab === 'tongquan' && (
        <>
          <div className="flex gap-2 mb-4 flex-wrap">
            {[['day','Hôm nay'],['week','Tuần này'],['month','Tháng này'],['year','Năm nay'],['all','📌 Từ đầu dự án']].map(([id,label]) => (
              <button key={id} onClick={() => setRange(id)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${range === id ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}>{label}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatBox label="Lượt xúc" value={soVN(loads.length)} />
            <StatBox label="m³ đã xúc" value={soVN(tongKhoiLuongXuc)} />
            <StatBox label="Phiếu đã in" value={soVN(tickets.length)} sub={`${soVN(tongKhoiLuongPhieu)} m³`} />
            <StatBox label="Lượt xe vào cổng" value={soVN(gateIns.length)} />
          </div>

          {isHeadOffice && (
            <>
              <SectionTitle>Đối chiếu số liệu (kiểm soát nội bộ)</SectionTitle>
              <Card className={chenhLech !== 0 ? 'border-amber-500' : 'border-emerald-500'}>
                <div className="flex items-start gap-3">
                  {chenhLech === 0 ? <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />}
                  <div className="text-white font-semibold text-sm">{chenhLech === 0 ? 'Khớp: khối lượng lái máy xúc xác nhận = khối lượng phiếu đã tự động lập.' : `Chênh lệch ${soVN(Math.abs(chenhLech))} m³.`}</div>
                </div>
              </Card>
              <SectionTitle>Doanh thu ước tính (tham khảo)</SectionTitle>
              <Card>
                <div className="flex items-center gap-3 flex-wrap"><label className="text-slate-400 text-xs">Đơn giá bình quân (đ/m³):</label><input type="number" disabled={!dcSuaKhachHang} value={donGia} onChange={(e) => { setDonGia(e.target.value); setConfig({ ...config, donGiaBanDat: Number(e.target.value) }); }} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white w-40 disabled:opacity-50" /></div>
                <div className="text-2xl font-extrabold text-emerald-400 mt-3">{tienVN(tongKhoiLuongPhieu * Number(donGia || 0))}</div>
              </Card>
            </>
          )}

          <SectionTitle>Tiến độ khai thác so với thiết kế mỏ</SectionTitle>
          <Card>
            <div className="flex justify-between items-baseline mb-2"><div><span className="text-2xl font-extrabold text-white">{phanTram}</span><span className="text-slate-400"> % trữ lượng thiết kế</span></div><div className="text-slate-400 text-xs">{soVN(Math.round(tongLuyKeNguyenKhoi))} / {soVN(thietKe.tongTruLuongNguyenKhoi)} m³</div></div>
            <div className="bg-slate-950 border border-slate-700 rounded-full h-4 overflow-hidden"><div className="h-full bg-gradient-to-r from-orange-600 to-amber-400" style={{ width: `${phanTram}%` }} /></div>
            <div className="flex flex-wrap gap-2 mt-3">{thietKe.theoNam.map((n) => (<div key={n.nam} className="text-xs bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 flex items-center gap-2"><span className="text-slate-400">Năm {n.nam}:</span><span className="text-white font-semibold">{soVN(n.nguyenKhoi)} m³</span>{dcCauHinh && <button onClick={() => suaSanLuongNam(n.nam)} className="text-orange-400 hover:text-orange-300">Sửa</button>}</div>))}</div>
          </Card>

          <SectionTitle>Sản lượng theo ngày</SectionTitle>
          <Card>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#383d46" /><XAxis dataKey="ngay" stroke="#9aa0aa" fontSize={11} /><YAxis stroke="#9aa0aa" fontSize={11} /><Tooltip contentStyle={{ background: '#1c1f24', border: '1px solid #383d46', color: '#fff' }} /><Bar dataKey="m3" fill="#c1622a" name="m³ đã xúc" radius={[4, 4, 0, 0]} /></BarChart>
            </ResponsiveContainer>
          </Card>

          <div className="flex items-center justify-between mt-6 mb-3 flex-wrap gap-2">
            <h2 className="text-amber-400 font-bold border-l-4 border-orange-600 pl-3">Chi tiết phiếu xuất ({tickets.length})</h2>
            <button onClick={xuatCSV} className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold px-3 py-2 rounded-lg"><FileSpreadsheet className="w-4 h-4" /> Xuất Excel</button>
          </div>
          <Card>
            {tickets.length === 0 ? <div className="text-slate-500 text-sm text-center py-6">Chưa có phiếu nào.</div> : (
              <div className="overflow-x-auto"><table className="w-full text-sm min-w-[500px]"><thead><tr className="text-slate-500 text-xs uppercase"><th className="text-left pb-2">Số phiếu</th><th className="text-left pb-2">Biển số</th><th className="text-right pb-2">m³</th><th className="text-left pb-2">Khách hàng</th><th className="text-left pb-2">Thời gian</th></tr></thead>
                <tbody>{tickets.slice().reverse().map((t) => (<tr key={t.id} className="border-t border-slate-700"><td className="py-2 text-slate-300">{t.ticketNo}</td><td className="py-2 text-white font-bold">{t.plate}</td><td className="py-2 text-right text-white">{soVN(t.volume)}</td><td className="py-2 text-slate-400">{t.customerName || '—'}</td><td className="py-2 text-slate-400">{gioVN(t.time)}</td></tr>))}</tbody>
              </table></div>
            )}
          </Card>
        </>
      )}

      {tab === 'khachhang' && <BaoCaoKhachHangVaTraSoat events={events} config={config} setConfig={setConfig} choSuaDonGia={dcSuaKhachHang} />}
      {tab === 'nhatky' && <NhatKyHoatDong events={events} />}
      {tab === 'taikhoan' && vaiTro === 'banlanhdao' && <QuanLyTaiKhoan />}

      {tab === 'cauhinh' && (
        <>
          {dcSuaKhachHang && (
            <>
              <SectionTitle>💰 Khách hàng</SectionTitle>
              <QuanLyKhachHang config={config} setConfig={setConfig} events={events} addEvent={addEvent} />
              <SectionTitle>🔀 Điều chuyển biển số xe giữa các khách hàng</SectionTitle>
              <p className="text-slate-400 text-xs mb-2 -mt-2">Chọn lại khách hàng cho 1 biển số đã có — áp dụng ngay cho lần khai báo/xúc tiếp theo.</p>
              <DangKyBienSoKhachHang config={config} events={events} addEvent={addEvent} />
            </>
          )}
          {dcCauHinh && (
            <>
              <SectionTitle>⚙️ Máy xúc / lái máy xúc</SectionTitle>
              <div className="grid md:grid-cols-2 gap-4">
                <Card><div className="font-bold text-white text-sm mb-2">Danh sách máy xúc</div>{config.excavators.map((x) => <div key={x.id} className="text-sm text-slate-300 py-1 border-b border-slate-700 last:border-0">{x.name} <span className="text-slate-500">({x.id})</span></div>)}<button onClick={themMayXuc} className="w-full mt-3 flex items-center justify-center gap-1 bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold py-2 rounded-lg"><Plus className="w-4 h-4" /> Thêm máy xúc</button></Card>
                <Card><div className="font-bold text-white text-sm mb-2">Danh sách lái máy xúc</div>{config.operators.map((o) => <div key={o.id} className="text-sm text-slate-300 py-1 border-b border-slate-700 last:border-0">{o.name} <span className="text-slate-500">({o.id})</span></div>)}<button onClick={themLaiXuc} className="w-full mt-3 flex items-center justify-center gap-1 bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold py-2 rounded-lg"><Plus className="w-4 h-4" /> Thêm lái máy xúc</button></Card>
              </div>
            </>
          )}
        </>
      )}
      <div className="h-8" />
      <Toast msg={toast?.msg} err={toast?.err} />
      {ModalHopThoai}
    </div>
  );
}

// ---------------------------------------------------------------------------
// App gốc
// ---------------------------------------------------------------------------
export default function App() {
  const [session, setSession] = useState(null); // {id, username, name, role, mustChangePassword}
  const [doiMK, setDoiMK] = useState(false);
  const [events, setEvents] = useState([]);
  const [config, setConfigState] = useState(DEFAULT_CONFIG);
  const [claims, setClaims] = useState({});
  const [syncing, setSyncing] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const [ready, setReady] = useState(false);
  const mySessionId = useRef(genId('sess'));
  const ticketCounterRef = useRef(0);
  const persistEventsRef = useRef(null);

  useEffect(() => {
    (async () => {
      await seedUsersIfNeeded();
      const cfg = await storageGet('config', true, null);
      const mergedCfg = cfg ? { ...DEFAULT_CONFIG, ...cfg, thietKe: { ...DEFAULT_CONFIG.thietKe, ...(cfg.thietKe || {}) } } : DEFAULT_CONFIG;
      setConfigState(mergedCfg);
      const evs = await storageGet('events', true, []);
      setEvents(evs || []);
      ticketCounterRef.current = (evs || []).filter((e) => e.type === 'ticket_print' && dayStrOf(e.time) === todayStr()).length;
      const cl = await storageGet('claims', true, {});
      setClaims(cl || {});
      setReady(true);
    })();
  }, []);

  const refresh = useCallback(async () => {
    setSyncing(true);
    const evs = await storageGet('events', true, []);
    // GỘP thay vì ghi đè: nếu lần đọc định kỳ này (server) chưa kịp thấy
    // sự kiện vừa tạo cục bộ (do lan truyền dữ liệu có độ trễ), vẫn giữ lại
    // sự kiện đó — không để biến mất khỏi màn hình. Đây là nguyên nhân lỗi
    // "lượt xúc của tôi hôm nay tự mất" theo Bảng hiệu chỉnh V7.0 mục III.3.
    setEvents((prev) => {
      const idsServer = new Set((evs || []).map((e) => e.id));
      const thieuOLocal = prev.filter((e) => !idsServer.has(e.id));
      if (thieuOLocal.length === 0) return evs || [];
      // Có sự kiện cục bộ chưa thấy trên server -> gộp lại, ghi bù lên server luôn
      const gop = [...(evs || []), ...thieuOLocal];
      persistEventsRef.current?.(gop);
      return gop;
    });
    const cfg = await storageGet('config', true, null);
    if (cfg) setConfigState({ ...DEFAULT_CONFIG, ...cfg, thietKe: { ...DEFAULT_CONFIG.thietKe, ...(cfg.thietKe || {}) } });
    const cl = await storageGet('claims', true, {}); setClaims(cl || {});
    setSyncing(false);
  }, []);

  useEffect(() => { if (!session) return; const t = setInterval(refresh, 6000); return () => clearInterval(t); }, [session, refresh]);

  useEffect(() => {
    if (!session) return;
    const beat = async () => {
      const all = await storageGet('presence', true, {});
      all[mySessionId.current] = { time: Date.now(), role: session.role };
      const now = Date.now();
      Object.keys(all).forEach((k) => { if (now - all[k].time > 45000) delete all[k]; });
      await storageSet('presence', all, true);
      setOnlineCount(Object.keys(all).length);
    };
    beat(); const t = setInterval(beat, 15000); return () => clearInterval(t);
  }, [session]);

  // SỬA LỖI QUAN TRỌNG (theo Bảng hiệu chỉnh V3.0, mục IV.4.1 "phiếu không nhảy
  // sang kế toán"): trước đây mỗi addEvent() ghi thẳng lên bộ nhớ dùng chung
  // ngay lập tức — khi 2 sự kiện liên quan được tạo liên tiếp trong cùng 1 thao
  // tác (VD: xác nhận xúc đầy xe -> vừa tạo "lượt xúc" vừa tự động tạo "phiếu"),
  // 2 lệnh ghi độc lập chạy gần như đồng thời có thể HOÀN THÀNH KHÔNG ĐÚNG THỨ TỰ
  // trên mạng thực tế, khiến lệnh ghi cũ hơn đè lên lệnh ghi mới hơn -> mất dữ
  // liệu (đúng như phiếu bị "mất" không đến được màn Kế toán). Nay dùng HÀNG ĐỢI
  // GHI TUẦN TỰ (writeChainRef): mọi lần ghi 'events' phải đợi lần ghi trước đó
  // xong mới được bắt đầu, đảm bảo không bao giờ ghi đè sai thứ tự.
  const writeChainRef = useRef(Promise.resolve());
  const persistEvents = useCallback((next) => {
    writeChainRef.current = writeChainRef.current.then(() => storageSet('events', next, true));
    return writeChainRef.current;
  }, []);
  persistEventsRef.current = persistEvents;
  // Thêm NHIỀU sự kiện liên quan trong 1 lần ghi duy nhất (atomic) — dùng khi 1
  // thao tác của người dùng phải tạo ra hơn 1 sự kiện cùng lúc (VD: xác nhận
  // xúc đầy xe -> tạo cả "lượt xúc" lẫn "phiếu" trong đúng 1 lần ghi).
  const addEvents = useCallback((evs) => {
    setEvents((prev) => { const next = [...prev, ...evs]; persistEvents(next); return next; });
  }, [persistEvents]);
  const addEvent = useCallback((ev) => addEvents([ev]), [addEvents]);
  const setConfig = useCallback((newCfg) => { setConfigState(newCfg); storageSet('config', newCfg, true); }, []);

  // Chỉ TẠO đối tượng phiếu (không tự ghi) — nơi gọi phải addEvents([loadEv, ticket])
  // trong CÙNG một lần để đảm bảo 2 sự kiện luôn được ghi atomically với nhau.
  const buildTicket = useCallback((loadEv) => {
    ticketCounterRef.current += 1;
    const ticketNo = `PKG-${todayStr().replace(/-/g, '').slice(2)}-${String(ticketCounterRef.current).padStart(5, '0')}`;
    return { id: genId('TK'), type: 'ticket_print', loadId: loadEv.id, plate: loadEv.plate, volume: loadEv.estVolume, ticketNo, soLien: 3, excavatorName: loadEv.excavatorName, operatorName: loadEv.operatorName, customerId: loadEv.customerId, customerName: loadEv.customerName, autoGenerated: true, time: new Date().toISOString() };
  }, []);

  const setClaim = useCallback((plate, operatorName) => { setClaims((prev) => { const next = { ...prev, [plate]: { operatorName, time: Date.now() } }; storageSet('claims', next, true); return next; }); }, []);
  const clearClaim = useCallback((plate) => { setClaims((prev) => { const next = { ...prev }; delete next[plate]; storageSet('claims', next, true); return next; }); }, []);

  const onLogin = (s) => { setSession(s); if (s.mustChangePassword) setDoiMK(true); };
  const dangXuat = () => { setSession(null); setDoiMK(false); };

  if (!ready) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">Đang tải dữ liệu dùng chung...</div>;
  if (!session) return <LoginScreen onLogin={onLogin} />;
  if (doiMK) return <ChangePasswordScreen session={session} batBuoc={session.mustChangePassword} onDone={() => { setSession({ ...session, mustChangePassword: false }); setDoiMK(false); }} />;

  const role = session.role;
  return (
    <div className="min-h-screen bg-slate-950">
      <TopBar session={session} onLogout={dangXuat} onChangePassword={() => setDoiMK(true)} onlineCount={onlineCount} syncing={syncing} />
      {role === 'baove' && <GateScreen events={events} addEvent={addEvent} addEvents={addEvents} />}
      {role === 'laixuc' && <DriverScreen events={events} addEvent={addEvent} addEvents={addEvents} config={config} myName={session.name} claims={claims} setClaim={setClaim} clearClaim={clearClaim} buildTicket={buildTicket} />}
      {role === 'kythuat' && <KyThuatScreen events={events} addEvent={addEvent} addEvents={addEvents} config={config} myName={session.name} />}
      {role === 'ketoan' && <AccountantScreen events={events} addEvent={addEvent} addEvents={addEvents} config={config} setConfig={setConfig} />}
      {role === 'giamdoc' && <DashboardScreen events={events} addEvent={addEvent} config={config} setConfig={setConfig} vaiTro="giamdoc" />}
      {role === 'ketoancongty' && <DashboardScreen events={events} addEvent={addEvent} config={config} setConfig={setConfig} vaiTro="ketoancongty" />}
      {role === 'banlanhdao' && <DashboardScreen events={events} addEvent={addEvent} config={config} setConfig={setConfig} vaiTro="banlanhdao" />}
    </div>
  );
}
