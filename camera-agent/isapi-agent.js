#!/usr/bin/env node
// camera-agent/isapi-agent.js
// ============================================================================
// CHƯƠNG TRÌNH CẦU NỐI CAMERA ANPR HIKVISION -> PHẦN MỀM QUẢN LÝ MỎ
// (Bổ sung 09/10 — yêu cầu Chủ tịch HĐQT)
//
// Chạy trên 1 máy tính Windows NẰM TRONG MẠNG NỘI BỘ của mỏ (cùng mạng với
// camera 192.168.1.199). Chương trình:
//   1) Đăng nhập camera theo chuẩn ISAPI (xác thực Digest), tự dò cổng ISAPI.
//   2) Mở kết nối "nhận sự kiện liên tục" (GET /ISAPI/Event/notification/
//      alertStream) — camera đọc được biển số nào là đẩy về ngay.
//   3) Lọc sự kiện ANPR, gửi biển số + chiều di chuyển (reverse/forward) lên
//      phần mềm: /api/camera-webhook. Máy chủ quyết định:
//         reverse (biển ĐUÔI)  -> ghi nhận XE VÀO
//         forward (biển ĐẦU)   -> ghi nhận XE RA (ghép với biển đuôi)
//   4) Mất mạng Internet -> giữ lại hàng đợi trong file, có mạng gửi bù.
//      Mất kết nối camera / quá 2 phút không có nhịp tim -> tự kết nối lại.
//
// KHÔNG cần cài thêm thư viện nào — chỉ cần Node.js bản 18 trở lên.
// Mật khẩu camera chỉ lưu trong file cau-hinh-camera.json trên chính máy
// này (file đó đã được loại khỏi GitHub qua .gitignore).
//
// Cách chạy:
//   node isapi-agent.js              chạy thường (để chạy liên tục)
//   node isapi-agent.js --kiem-tra   chỉ kiểm tra kết nối camera + phần mềm rồi thoát
// ============================================================================
'use strict';

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const PHIEN_BAN = '1.1.0 (10/10/2026)';
const CONG_KHOA_CHAY_1_BAN = 47811; // chống chạy 2 cửa sổ cùng lúc
const THU_MUC = __dirname;
const FILE_CAU_HINH = path.join(THU_MUC, 'cau-hinh-camera.json');
const FILE_HANG_DOI = path.join(THU_MUC, 'hang-doi-chua-gui.json');
const FILE_NHAT_KY = path.join(THU_MUC, 'nhat-ky-camera.log');

const MAC_DINH = {
  cameraIp: '192.168.1.199',
  // Cổng ISAPI: thông thường là cổng HTTP 80 (hoặc HTTPS 443). Cổng 8000 của
  // Hikvision thường là cổng SDK riêng (không phải ISAPI) — chương trình sẽ
  // tự thử lần lượt các cổng dưới đây và dùng cổng đầu tiên trả lời đúng.
  cacCongThu: [80, 8000, 443],
  tenDangNhap: 'admin',
  matKhau: '',
  diaChiPhanMem: 'https://mo-khuon-gian-3.netlify.app/api/camera-webhook',
  khoaBaoMat: '',
  doTinCayToiThieu: 0,
  giayChoNhipTim: 120,
};

// ----------------------------------------------------------------------------
// Nhật ký
// ----------------------------------------------------------------------------
function gioVN(d = new Date()) {
  return new Date(d.getTime() + 7 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}
function ghiNhatKy(muc, ...noiDung) {
  const dong = `[${gioVN()}] ${muc} ${noiDung.join(' ')}`;
  console.log(dong);
  try {
    if (fs.existsSync(FILE_NHAT_KY) && fs.statSync(FILE_NHAT_KY).size > 5 * 1024 * 1024) {
      fs.renameSync(FILE_NHAT_KY, FILE_NHAT_KY + '.cu');
    }
    fs.appendFileSync(FILE_NHAT_KY, dong + '\n');
  } catch { /* bỏ qua lỗi ghi file nhật ký */ }
}
const log = {
  info: (...a) => ghiNhatKy('   ', ...a),
  ok: (...a) => ghiNhatKy('[OK]', ...a),
  warn: (...a) => ghiNhatKy('[!] ', ...a),
  err: (...a) => ghiNhatKy('[LỖI]', ...a),
};

// ----------------------------------------------------------------------------
// Cấu hình — lần đầu chạy chưa có file thì hỏi trực tiếp trên màn hình
// ----------------------------------------------------------------------------
function hoi(cauHoi, macDinh) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(`${cauHoi}${macDinh ? ` [${macDinh}]` : ''}: `, (tl) => { rl.close(); resolve((tl || '').trim() || macDinh || ''); }));
}

async function docCauHinh() {
  let ch = {};
  if (fs.existsSync(FILE_CAU_HINH)) {
    try { ch = JSON.parse(fs.readFileSync(FILE_CAU_HINH, 'utf8')); } catch (e) {
      log.err(`File ${path.basename(FILE_CAU_HINH)} bị sai định dạng: ${e.message}`);
      process.exit(1);
    }
  }
  ch = { ...MAC_DINH, ...ch };
  if (!ch.matKhau || /NHAP_MAT_KHAU/i.test(ch.matKhau)) {
    console.log('\n=== CÀI ĐẶT LẦN ĐẦU — nhập thông tin camera (bấm Enter để giữ giá trị trong ngoặc) ===');
    ch.cameraIp = await hoi('Địa chỉ IP camera', ch.cameraIp);
    ch.tenDangNhap = await hoi('Tên đăng nhập camera', ch.tenDangNhap);
    ch.matKhau = await hoi('Mật khẩu camera', '');
    ch.diaChiPhanMem = await hoi('Địa chỉ nhận dữ liệu của phần mềm', ch.diaChiPhanMem);
    if (!ch.matKhau) { log.err('Chưa nhập mật khẩu camera — dừng.'); process.exit(1); }
    fs.writeFileSync(FILE_CAU_HINH, JSON.stringify(ch, null, 2));
    log.ok(`Đã lưu cấu hình vào ${path.basename(FILE_CAU_HINH)} (chỉ nằm trên máy này).`);
  }
  if (!Array.isArray(ch.cacCongThu) || !ch.cacCongThu.length) ch.cacCongThu = MAC_DINH.cacCongThu;
  return ch;
}

// ----------------------------------------------------------------------------
// HTTP + xác thực Digest (RFC 7616 / 2617) theo đúng tài liệu ISAPI
// ----------------------------------------------------------------------------
function phanTichThachThuc(header) {
  const kq = { kieu: /^\s*digest/i.test(header) ? 'digest' : (/^\s*basic/i.test(header) ? 'basic' : 'khac') };
  const re = /(\w+)=(?:"([^"]*)"|([^,\s]*))/g;
  let m;
  while ((m = re.exec(header))) kq[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : m[3];
  return kq;
}

function taoHeaderXacThuc(tc, phuongThuc, uri, user, pass, nc) {
  if (tc.kieu === 'basic') return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  const thuatToan = (tc.algorithm || 'MD5').toUpperCase();
  const h = (s) => crypto.createHash(thuatToan.startsWith('SHA-256') ? 'sha256' : 'md5').update(s).digest('hex');
  const cnonce = crypto.randomBytes(16).toString('hex');
  const ncStr = String(nc).padStart(8, '0');
  let ha1 = h(`${user}:${tc.realm}:${pass}`);
  if (thuatToan.endsWith('-SESS')) ha1 = h(`${ha1}:${tc.nonce}:${cnonce}`);
  const ha2 = h(`${phuongThuc}:${uri}`);
  const qop = tc.qop ? (tc.qop.split(',').map((s) => s.trim()).includes('auth') ? 'auth' : tc.qop.split(',')[0].trim()) : null;
  const response = qop ? h(`${ha1}:${tc.nonce}:${ncStr}:${cnonce}:${qop}:${ha2}`) : h(`${ha1}:${tc.nonce}:${ha2}`);
  let s = `Digest username="${user}", realm="${tc.realm}", nonce="${tc.nonce}", uri="${uri}", response="${response}"`;
  if (tc.algorithm) s += `, algorithm=${tc.algorithm}`;
  if (qop) s += `, qop=${qop}, nc=${ncStr}, cnonce="${cnonce}"`;
  if (tc.opaque) s += `, opaque="${tc.opaque}"`;
  return s;
}

function guiYeuCau({ ip, cong, phuongThuc = 'GET', uri, headers = {}, body = null, timeoutMs = 8000 }) {
  const laHttps = cong === 443;
  const lib = laHttps ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request({
      host: ip, port: cong, method: phuongThuc, path: uri,
      headers: { Connection: 'keep-alive', ...headers },
      // Camera trong mạng nội bộ dùng chứng chỉ tự cấp — chấp nhận để kết nối được
      rejectUnauthorized: false,
      timeout: timeoutMs,
    }, (res) => resolve({ res, req }));
    req.on('timeout', () => req.destroy(new Error(`Hết thời gian chờ (${timeoutMs / 1000}s)`)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function docHet(res) {
  return new Promise((resolve, reject) => {
    const parts = [];
    res.on('data', (c) => parts.push(c));
    res.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
    res.on('error', reject);
  });
}

// Gửi yêu cầu có xác thực: lần 1 không có thông tin để lấy "thách thức",
// lần 2 gửi kèm Authorization. Trả về { res } (res chưa đọc body).
async function yeuCauXacThuc(ch, cong, uri, { phuongThuc = 'GET', timeoutMs = 8000 } = {}) {
  const lan1 = await guiYeuCau({ ip: ch.cameraIp, cong, phuongThuc, uri, timeoutMs });
  if (lan1.res.statusCode !== 401) return lan1;
  const thachThuc = lan1.res.headers['www-authenticate'];
  await docHet(lan1.res).catch(() => {});
  if (!thachThuc) return lan1;
  const tc = phanTichThachThuc(Array.isArray(thachThuc) ? thachThuc[0] : thachThuc);
  const auth = taoHeaderXacThuc(tc, phuongThuc, uri, ch.tenDangNhap, ch.matKhau, 1);
  return guiYeuCau({ ip: ch.cameraIp, cong, phuongThuc, uri, timeoutMs, headers: { Authorization: auth } });
}

// ----------------------------------------------------------------------------
// Dò cổng ISAPI + đọc thông tin thiết bị
// ----------------------------------------------------------------------------
async function doCongIsapi(ch) {
  const loiTheoCong = [];
  for (const cong of ch.cacCongThu) {
    try {
      const { res } = await yeuCauXacThuc(ch, Number(cong), '/ISAPI/System/deviceInfo', { timeoutMs: 6000 });
      const body = await docHet(res);
      if (res.statusCode === 200 && /DeviceInfo/i.test(body)) {
        const lay = (t) => ((new RegExp(`<${t}>([^<]*)</${t}>`, 'i').exec(body) || [])[1] || '').trim();
        return { cong: Number(cong), model: lay('model'), ten: lay('deviceName'), serial: lay('serialNumber'), firmware: lay('firmwareVersion') };
      }
      if (res.statusCode === 401) loiTheoCong.push(`cổng ${cong}: SAI tên đăng nhập hoặc mật khẩu (camera trả lỗi 401)`);
      else loiTheoCong.push(`cổng ${cong}: trả mã ${res.statusCode} — không phải ISAPI`);
    } catch (e) {
      loiTheoCong.push(`cổng ${cong}: ${e.code || ''} ${e.message}`.trim());
    }
  }
  const err = new Error('Không kết nối được ISAPI ở cổng nào:\n   - ' + loiTheoCong.join('\n   - '));
  err.chiTiet = loiTheoCong;
  throw err;
}

// ----------------------------------------------------------------------------
// Đọc thông tin ANPR từ 1 khối XML/JSON sự kiện
// ----------------------------------------------------------------------------
function layThe(xml, ten) {
  const m = new RegExp(`<(?:\\w+:)?${ten}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${ten}>`, 'i').exec(xml);
  return m ? m[1].replace(/<!--[\s\S]*?-->/g, '').trim() : null;
}
function docSuKien(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t);
      const a = j.ANPR || j.anpr || {};
      return { eventType: j.eventType || '', plate: a.licensePlate || null, direction: String(a.direction || '').toLowerCase(), dateTime: j.dateTime || null, uuid: j.UUID || j.uuid || null, confidence: a.confidenceLevel != null ? Number(a.confidenceLevel) : null, line: a.line != null ? String(a.line) : null };
    } catch { return null; }
  }
  const anpr = layThe(t, 'ANPR');
  return {
    eventType: layThe(t, 'eventType') || '',
    plate: anpr ? layThe(anpr, 'licensePlate') : null,
    direction: anpr ? String(layThe(anpr, 'direction') || '').toLowerCase() : '',
    dateTime: layThe(t, 'dateTime'),
    uuid: layThe(t, 'UUID'),
    confidence: anpr && layThe(anpr, 'confidenceLevel') != null ? Number(layThe(anpr, 'confidenceLevel')) : null,
    line: anpr ? layThe(anpr, 'line') : null,
  };
}

// ----------------------------------------------------------------------------
// Bộ tách luồng multipart của alertStream (có cả XML sự kiện và ảnh JPEG)
// ----------------------------------------------------------------------------
class BoTachLuong {
  constructor(boundary, onPhan) {
    this.boundary = boundary ? Buffer.from('--' + boundary.replace(/^--/, '')) : null;
    this.buf = Buffer.alloc(0);
    this.onPhan = onPhan;
  }
  them(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    if (!this.boundary) return this.quetXml();
    for (;;) {
      const dau = this.buf.indexOf(this.boundary);
      if (dau === -1) { if (this.buf.length > 20 * 1024 * 1024) this.buf = Buffer.alloc(0); return; }
      const hetHeader = this.buf.indexOf('\r\n\r\n', dau);
      if (hetHeader === -1) return;
      const headerText = this.buf.slice(dau + this.boundary.length, hetHeader).toString('latin1');
      const loai = ((/content-type:\s*([^\r\n;]+)/i.exec(headerText) || [])[1] || '').toLowerCase();
      const doDai = Number((/content-length:\s*(\d+)/i.exec(headerText) || [])[1]);
      const batDau = hetHeader + 4;
      let ketThuc; let tiepTheo;
      if (Number.isFinite(doDai) && doDai >= 0 && /content-length/i.test(headerText)) {
        if (this.buf.length < batDau + doDai) return;
        ketThuc = batDau + doDai; tiepTheo = ketThuc;
      } else {
        const sau = this.buf.indexOf(this.boundary, batDau);
        if (sau === -1) return;
        ketThuc = sau; tiepTheo = sau;
      }
      const than = this.buf.slice(batDau, ketThuc);
      this.buf = this.buf.slice(tiepTheo);
      if (!/image|octet/.test(loai)) this.onPhan(than.toString('utf8'), loai);
    }
  }
  // Dự phòng khi không biết boundary: tìm thẳng các khối XML sự kiện
  quetXml() {
    const s = this.buf.toString('latin1');
    const re = /<EventNotificationAlert[\s\S]*?<\/EventNotificationAlert>/g;
    let m; let cuoi = 0;
    while ((m = re.exec(s))) { this.onPhan(Buffer.from(m[0], 'latin1').toString('utf8'), 'application/xml'); cuoi = re.lastIndex; }
    if (cuoi) this.buf = this.buf.slice(cuoi);
    if (this.buf.length > 20 * 1024 * 1024) this.buf = Buffer.alloc(0);
  }
}

// ----------------------------------------------------------------------------
// Hàng đợi gửi lên phần mềm (lưu file, mất mạng không mất lượt xe)
// ----------------------------------------------------------------------------
let hangDoi = [];
try { if (fs.existsSync(FILE_HANG_DOI)) hangDoi = JSON.parse(fs.readFileSync(FILE_HANG_DOI, 'utf8')) || []; } catch { hangDoi = []; }
function luuHangDoi() { try { fs.writeFileSync(FILE_HANG_DOI, JSON.stringify(hangDoi)); } catch { /* bỏ qua */ } }

let dangGui = false;
async function guiHangDoi(ch) {
  if (dangGui || hangDoi.length === 0) return;
  dangGui = true;
  try {
    const lo = hangDoi.slice(0, 20);
    const res = await fetch(ch.diaChiPhanMem, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(ch.khoaBaoMat ? { 'X-Camera-Key': ch.khoaBaoMat } : {}) },
      body: JSON.stringify({ luotDoc: lo }),
      signal: AbortSignal.timeout(20000),
    });
    const kq = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Phần mềm trả lỗi ${res.status}: ${kq.error || ''}`);
    hangDoi = hangDoi.slice(lo.length);
    luuHangDoi();
    (kq.ketQua || []).forEach((k) => {
      const f = k.ketQua === 'xe_vao' || k.ketQua === 'xe_ra' ? log.ok : log.info;
      f(`Phần mềm: ${k.thongDiep || k.ketQua} `);
    });
  } catch (e) {
    log.warn(`Chưa gửi được lên phần mềm (còn ${hangDoi.length} lượt chờ, sẽ tự gửi lại): ${e.message}`);
  } finally {
    dangGui = false;
  }
}

async function baoTrangThai(ch, tt) {
  try {
    await fetch(ch.diaChiPhanMem, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(ch.khoaBaoMat ? { 'X-Camera-Key': ch.khoaBaoMat } : {}) },
      body: JSON.stringify({ loai: 'trang_thai', phienBan: PHIEN_BAN, cameraIp: ch.cameraIp, ...tt }),
      signal: AbortSignal.timeout(15000),
    });
  } catch { /* lỗi mạng tạm thời — lần sau báo lại */ }
}

// ----------------------------------------------------------------------------
// Vòng nhận sự kiện từ camera
// ----------------------------------------------------------------------------
const trangThai = { ketNoiCamera: false, thongDiep: 'Đang khởi động', congIsapi: null, cameraModel: null, lanCuoiNhanSuKien: null };
const daThayGanDay = new Map(); // chống gửi trùng trong 60 giây: "BIEN|huong" -> ms

function xuLySuKien(ch, text) {
  const sk = docSuKien(text);
  if (!sk) return;
  if (/heartbeat/i.test(sk.eventType)) return; // nhịp tim
  if (!/anpr|vehicle|traffic/i.test(sk.eventType) && !sk.plate) return; // sự kiện khác, không liên quan
  trangThai.lanCuoiNhanSuKien = new Date().toISOString();
  const bien = String(sk.plate || '').trim();
  const huong = sk.direction || 'unknown';
  if (ch.doTinCayToiThieu && sk.confidence != null && sk.confidence < ch.doTinCayToiThieu) {
    log.info(`Bỏ qua ${bien} (${huong}) — độ tin cậy ${sk.confidence} < ${ch.doTinCayToiThieu}`);
    return;
  }
  const khoa = `${bien.toUpperCase()}|${huong}`;
  const now = Date.now();
  if (daThayGanDay.has(khoa) && now - daThayGanDay.get(khoa) < 60000) return;
  daThayGanDay.set(khoa, now);
  for (const [k, v] of daThayGanDay) if (now - v > 10 * 60000) daThayGanDay.delete(k);

  const docDuoc = bien && !/^(noplate|unknown)$/i.test(bien);
  const nhan = !docDuoc ? 'không đọc được biển số' : huong === 'reverse' ? 'XE VÀO (biển đuôi)' : huong === 'forward' ? 'XE RA (biển đầu)' : 'chiều không rõ — bỏ qua';
  log.info(`Camera đọc: ${bien || '(không đọc được)'} · ${huong} -> ${nhan}${sk.confidence != null ? ` · tin cậy ${sk.confidence}` : ''}`);
  hangDoi.push({ plate: bien, direction: huong, dateTime: sk.dateTime, uuid: sk.uuid, confidence: sk.confidence, line: sk.line });
  luuHangDoi();
  guiHangDoi(ch);
}

async function moLuongSuKien(ch, cong) {
  const uri = '/ISAPI/Event/notification/alertStream';
  const { res, req } = await yeuCauXacThuc(ch, cong, uri, { timeoutMs: 10000 });
  if (res.statusCode !== 200) {
    const body = await docHet(res).catch(() => '');
    throw new Error(`Camera từ chối mở luồng sự kiện (mã ${res.statusCode}) ${body.slice(0, 200)}`);
  }
  req.setTimeout(0);
  const ct = res.headers['content-type'] || '';
  const boundary = (/boundary="?([^";]+)"?/i.exec(ct) || [])[1] || null;
  trangThai.ketNoiCamera = true;
  trangThai.thongDiep = `Đang nhận sự kiện từ camera ${ch.cameraIp}:${cong}`;
  log.ok(`Đã mở luồng nhận sự kiện từ camera (${ct || 'không rõ định dạng'}). Đang chờ xe qua cổng...`);
  baoTrangThai(ch, trangThai);

  return new Promise((resolve) => {
    let lanCuoiCoDuLieu = Date.now();
    const bo = new BoTachLuong(boundary, (text) => xuLySuKien(ch, text));
    const kiemTra = setInterval(() => {
      if (Date.now() - lanCuoiCoDuLieu > ch.giayChoNhipTim * 1000) {
        log.warn(`Quá ${ch.giayChoNhipTim} giây không nhận được nhịp tim từ camera — kết nối lại.`);
        req.destroy();
      }
    }, 10000);
    const ket = (lyDo) => { clearInterval(kiemTra); trangThai.ketNoiCamera = false; trangThai.thongDiep = lyDo; resolve(lyDo); };
    res.on('data', (c) => { lanCuoiCoDuLieu = Date.now(); bo.them(c); });
    res.on('end', () => ket('Camera đóng kết nối'));
    res.on('error', (e) => ket(`Lỗi luồng: ${e.message}`));
    res.on('close', () => ket('Kết nối bị đóng'));
  });
}

async function chayLienTuc(ch) {
  let choLai = 5;
  setInterval(() => guiHangDoi(ch), 15000);
  setInterval(() => baoTrangThai(ch, trangThai), 60000);
  for (;;) {
    try {
      if (!trangThai.congIsapi) {
        const tb = await doCongIsapi(ch);
        trangThai.congIsapi = tb.cong;
        trangThai.cameraModel = tb.model;
        log.ok(`Kết nối camera thành công: ${tb.ten || ''} model ${tb.model || '?'} · firmware ${tb.firmware || '?'} · cổng ISAPI ${tb.cong}`);
      }
      const lyDo = await moLuongSuKien(ch, trangThai.congIsapi);
      log.warn(`Mất kết nối camera: ${lyDo}. Kết nối lại sau 5 giây...`);
      choLai = 5;
    } catch (e) {
      trangThai.ketNoiCamera = false;
      trangThai.thongDiep = e.message.split('\n')[0];
      log.err(e.message);
      if (/401|mật khẩu/i.test(e.message)) log.err('-> Kiểm tra lại tên đăng nhập / mật khẩu trong file cau-hinh-camera.json');
      trangThai.congIsapi = null;
      baoTrangThai(ch, trangThai);
      choLai = Math.min(choLai * 2, 120);
      log.info(`Thử lại sau ${choLai} giây...`);
    }
    await new Promise((r) => setTimeout(r, choLai * 1000));
  }
}

async function kiemTra(ch) {
  console.log('\n=== KIỂM TRA KẾT NỐI ===');
  let datCamera = false; let datPhanMem = false;
  try {
    const tb = await doCongIsapi(ch);
    datCamera = true;
    log.ok(`Camera ${ch.cameraIp}: kết nối ISAPI được ở cổng ${tb.cong} · ${tb.ten || ''} · model ${tb.model} · firmware ${tb.firmware}`);
    if (Number(tb.cong) !== 8000 && ch.cacCongThu.includes(8000)) log.info('(Cổng 8000 là cổng SDK riêng của Hikvision, không dùng cho ISAPI — đây là điều bình thường.)');
  } catch (e) { log.err(e.message); }
  try {
    const res = await fetch(ch.diaChiPhanMem, { signal: AbortSignal.timeout(15000) });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.ok) datPhanMem = true;
    if (res.ok && j.ok) log.ok(`Phần mềm ${ch.diaChiPhanMem}: đang hoạt động${j.canKhoa ? ' (có yêu cầu khoá bảo mật)' : ''}`);
    else log.err(`Phần mềm trả mã ${res.status}`);
  } catch (e) { log.err(`Không kết nối được phần mềm (${ch.diaChiPhanMem}): ${e.message}`); }
  console.log('=== KẾT THÚC KIỂM TRA ===\n');
  if (datCamera && datPhanMem) console.log('>>> KẾT QUẢ: ĐẠT — có thể chạy chương trình.\n');
  else console.log(`>>> KẾT QUẢ: CHƯA ĐẠT — ${!datCamera ? 'chưa kết nối được CAMERA' : ''}${!datCamera && !datPhanMem ? ' và ' : ''}${!datPhanMem ? 'chưa kết nối được PHẦN MỀM (Internet)' : ''}. Xem mục "Xử lý sự cố" trong hướng dẫn.\n`);
  return datCamera && datPhanMem;
}

// Chỉ cho chạy 1 bản: giữ 1 cổng nội bộ trên máy (127.0.0.1), bản thứ 2 sẽ tự thoát.
function giuKhoaChay1Ban() {
  return new Promise((resolve) => {
    const sv = require('net').createServer();
    sv.once('error', () => resolve(false));
    sv.listen(CONG_KHOA_CHAY_1_BAN, '127.0.0.1', () => resolve(true));
  });
}

module.exports = { BoTachLuong, docSuKien, phanTichThachThuc, taoHeaderXacThuc };

if (require.main === module) {
  (async () => {
    console.log(`Cầu nối Camera ANPR -> Phần mềm quản lý mỏ · phiên bản ${PHIEN_BAN}`);
    const ch = await docCauHinh();
    log.info(`Camera: ${ch.cameraIp} · thử các cổng ISAPI: ${ch.cacCongThu.join(', ')} · gửi tới: ${ch.diaChiPhanMem}`);
    if (hangDoi.length) log.info(`Có ${hangDoi.length} lượt xe chưa gửi từ lần chạy trước — sẽ gửi bù.`);
    if (process.argv.includes('--kiem-tra')) { const dat = await kiemTra(ch); process.exit(dat ? 0 : 2); }
    if (!(await giuKhoaChay1Ban())) {
      log.warn('Chương trình cầu nối ĐÃ ĐANG CHẠY ở 1 cửa sổ khác trên máy này — cửa sổ này tự đóng (không cần chạy 2 lần).');
      process.exit(3);
    }
    await chayLienTuc(ch);
  })().catch((e) => { log.err(e.stack || e.message); process.exit(1); });
}
