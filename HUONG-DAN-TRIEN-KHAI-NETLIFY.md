# Hướng dẫn đẩy phần mềm quản lý khai thác Mỏ Khuôn Giàn 3 lên Netlify

Bộ mã nguồn trong thư mục này **chính là bản demo** anh đang chạy thử trong
Claude (file `src/App.jsx`) — chỉ khác duy nhất 1 chỗ: thay vì lưu dữ liệu
tạm trong bộ nhớ demo của Claude, nó lưu vào **Netlify Blobs** (kho dữ liệu
thật, không mất khi tắt trình duyệt, mọi người cùng truy cập được).

## Vì sao dùng Netlify (không cần thuê máy chủ riêng)

- Netlify tự động build và phát hành trang web mỗi khi mã nguồn thay đổi.
- **Netlify Functions**: chạy đoạn mã phía máy chủ (ở đây là 1 hàm duy nhất
  `kv.js`) mà không cần tự dựng máy chủ riêng.
- **Netlify Blobs**: kho lưu trữ dữ liệu có sẵn, đi kèm miễn phí, không cần
  đăng ký thêm dịch vụ nào khác.

## Cấu trúc thư mục (đã chuẩn bị sẵn, không cần sửa gì thêm)

```
netlify-deploy/
├── netlify.toml           ← cấu hình Netlify (lệnh build, đường dẫn API)
├── package.json            ← khai báo thư viện cần cài
├── build.js                 ← script tự đóng gói khi Netlify build
├── src/
│   ├── App.jsx               ← TOÀN BỘ mã nguồn phần mềm (giống bản demo)
│   └── input.css
├── tailwind.config.js
├── netlify/functions/
│   └── kv.js                ← "bộ nhớ dùng chung" thay cho window.storage
└── public/
    └── index.html
```

## Cách triển khai — 3 lựa chọn, chọn 1

### Cách 1 — Kéo thả (nhanh nhất, không cần biết lập trình)

1. Nén toàn bộ thư mục `netlify-deploy` thành 1 file .zip.
2. Vào **app.netlify.com** → đăng nhập/đăng ký tài khoản (miễn phí).
3. Vào mục **"Deploys"** → kéo thả file .zip vào ô **"Drag and drop your site
   folder here"**.
   - ⚠️ Lưu ý: cách kéo-thả chỉ deploy được **file tĩnh có sẵn**, KHÔNG tự
     chạy được lệnh `npm run build`. Vì vậy trước khi nén, cần tự build 1 lần
     trên máy có Node.js:
     ```
     npm install
     npm run build
     ```
     Sau đó nén **toàn bộ thư mục** (gồm cả `public/bundle.js` và
     `public/tailwind.css` vừa được tạo ra) rồi mới kéo-thả.
   - Cách này **không có Netlify Functions** (không lưu được dữ liệu thật) —
     chỉ dùng để xem giao diện nhanh. Muốn chạy đầy đủ, dùng Cách 2 hoặc 3.

### Cách 2 — Kết nối GitHub (khuyến nghị — tự build đúng, tự động cập nhật)

1. Tạo 1 kho chứa mã (repository) trên **github.com** (miễn phí), đặt tên ví
   dụ `mo-khuon-gian-3`.
2. Tải toàn bộ nội dung thư mục `netlify-deploy` lên kho đó (dùng GitHub
   Desktop nếu chưa quen dòng lệnh — kéo thả file vào là được).
3. Vào **app.netlify.com** → **"Add new site"** → **"Import an existing
   project"** → chọn **GitHub** → chọn đúng kho `mo-khuon-gian-3`.
4. Netlify tự nhận diện file `netlify.toml` có sẵn — **không cần sửa gì**,
   bấm **"Deploy site"**.
5. Đợi 1-2 phút, Netlify tự chạy `npm install` + `npm run build` + bật
   Function `kv.js` + cấp phát Netlify Blobs — xong sẽ có 1 đường link dạng
   `https://ten-ngau-nhien.netlify.app`.
6. Mỗi lần cần sửa gì trong `src/App.jsx`, chỉ cần cập nhật file trên GitHub
   — Netlify tự build và cập nhật lại trang, không cần thao tác gì thêm.

### Cách 3 — Dùng Netlify CLI (dành cho người quen dùng dòng lệnh)

```bash
npm install -g netlify-cli
cd netlify-deploy
npm install
netlify login
netlify deploy --prod
```

## Sau khi triển khai xong — cần làm ngay

1. **Đổi mật khẩu mặc định** cho cả 7 tài khoản ngay khi đăng nhập lần đầu
   (hệ thống sẽ tự bắt buộc đổi, không thao tác thêm gì).
2. **Đặt tên miền riêng** (không bắt buộc): vào **Site settings → Domain
   management** để gắn tên miền của công ty (VD: `mokhuongian.thongnhat.vn`)
   thay vì dùng tên miền `.netlify.app` mặc định.
3. **Bật lại quyền Netlify Blobs** (thường tự bật sẵn khi deploy qua GitHub):
   vào **Site settings → Environment variables** kiểm tra không cần thêm biến
   nào — Blobs tự hoạt động cùng site, không cần cấu hình thêm.
4. **Cấu hình camera ANPR / kết nối file Excel thật**: xem hướng dẫn ngay
   trong màn hình Bảo vệ của phần mềm (mục "Xem hướng dẫn kết nối chi tiết").

## Câu hỏi thường gặp

**Dữ liệu cũ trong bản demo Claude có tự chuyển sang không?**
Không — bản demo trong Claude và bản Netlify là 2 nơi lưu trữ độc lập. Khi
triển khai bản Netlify, hệ thống sẽ tự tạo lại 7 tài khoản mặc định (mật khẩu
`ThongNhat@123`, bắt buộc đổi ngay từ đầu) và dữ liệu bắt đầu từ con số 0 —
đúng như một hệ thống mới đưa vào vận hành thật.

**Có tốn phí không?**
Ở quy mô 1 mỏ (vài chục xe/ngày), dung lượng dữ liệu rất nhỏ (đã tính toán
trong tài liệu trước — dưới 200MB cho cả 3 năm) — nằm gọn trong gói miễn phí
của Netlify. Nếu công ty dùng nhiều site/nhiều dự án khác trên cùng tài
khoản Netlify, có thể cần nâng gói — kiểm tra tại netlify.com/pricing khi
gần đạt hạn mức.

**Kết nối file Excel có hoạt động trên điện thoại không?**
Tính năng tự động đọc lại file Excel liên tục cần trình duyệt Chrome/Edge
trên máy tính (Windows/Mac) — vì cần quyền truy cập file cố định trên máy.
Trên điện thoại, Bảo vệ vẫn dùng được các cách nhập khác (chọn lại file thủ
công, nhập tay, hoặc camera) bình thường.
