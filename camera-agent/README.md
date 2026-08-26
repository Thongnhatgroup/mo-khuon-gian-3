# Cầu nối camera nhận diện biển số (HikCentral Professional) → Phần mềm quản lý mỏ

Thư mục này chứa **2 chương trình nhỏ độc lập** (chọn dùng 1 trong 2), chạy trên **1 máy
tính đặt trong mạng nội bộ của mỏ** (khác với phần mềm chính đang chạy trên Netlify), có
nhiệm vụ: tự động lấy biển số xe do camera HikCentral Professional nhận diện được, rồi đẩy
lên phần mềm quản lý mỏ — y hệt như khi Bảo vệ quét/nhập tay ở cổng vào.

| | `doc-man-hinh.js` (khuyến nghị dùng trước) | `index.js` (nâng cao) |
|---|---|---|
| Cần AppKey/AppSecret? | Không | Có — phải bật "Open Platform" trong HikCentral |
| Cách hoạt động | Tự chụp lại màn hình máy tính đang mở sẵn phần mềm HikCentral Control Client, rồi "đọc chữ trong ảnh" (OCR) để lấy biển số | Gọi thẳng API của HikCentral bằng khóa AppKey/AppSecret |
| Độ chính xác | Có thể thỉnh thoảng đọc nhầm 1 ký tự (là OCR) | Chính xác 100% (lấy đúng dữ liệu gốc) nếu kết nối đúng |
| Đã kiểm thử với máy chủ thật của mỏ? | Chưa — mới viết theo đúng định dạng chữ thấy trong ảnh mẫu | Chưa — mới viết theo đúng tài liệu chuẩn Hikvision |
| Yêu cầu khác | Máy tính phải luôn mở sẵn, hiển thị đúng khung "Vehicle", không thu nhỏ cửa sổ | Không cần mở phần mềm, chạy ngầm được |

## Vì sao cần chương trình riêng này, không nối thẳng từ Netlify?

- Trang camera dùng địa chỉ nội bộ với chứng chỉ bảo mật tự ký (trình duyệt báo "Không bảo
  mật") — máy chủ Netlify (đám mây) không thể gọi vào đó một cách an toàn.
- Khóa API của camera (AppKey/AppSecret, nếu dùng `index.js`) cần được giữ kín — không đưa
  lên GitHub/Netlify (mã nguồn ở đó công khai xem được), mà chỉ nằm trong 1 file trên đúng
  máy tính này.

## Cách 1 (khuyến nghị) — Đọc màn hình tự động, không cần AppKey/AppSecret

1. Cài **Node.js bản 18 trở lên** trên máy tính đang mở sẵn phần mềm HikCentral Professional
   Control Client (tải tại https://nodejs.org, chọn bản "LTS").
2. Sao chép file `config.example.json` thành `config.json` — KHÔNG cần điền AppKey/AppSecret,
   chỉ cần giữ nguyên dòng `netlifyImportUrl`.
3. Mở Command Prompt tại đúng thư mục `camera-agent`, gõ `npm install` (chỉ cần 1 lần đầu —
   sẽ tự tải các thư viện chụp màn hình + đọc chữ trong ảnh, cần có mạng internet).
4. Mở sẵn phần mềm HikCentral Control Client, để nguyên khung "Vehicle" hiển thị trên màn
   hình (không thu nhỏ), rồi gõ:

   ```
   node doc-man-hinh.js
   ```

5. Chương trình sẽ tự chụp lại màn hình mỗi 10 giây (có thể chỉnh trong config.json) và đẩy
   biển số đọc được lên phần mềm quản lý mỏ. Xem chi tiết cách hoạt động, ưu/nhược điểm ngay
   trong phần chú thích đầu file `doc-man-hinh.js`.

## Cách 2 (nâng cao) — Qua AppKey/AppSecret

### Chuẩn bị (làm 1 lần)

1. Cài **Node.js bản 18 trở lên** trên máy tính sẽ chạy chương trình này (tải tại
   https://nodejs.org, chọn bản "LTS").
2. Trong phần mềm **HikCentral Professional**, vào mục cấu hình hệ thống, tìm và **bật
   "Open Platform" / "Nền tảng mở"**, sau đó tạo 1 ứng dụng (application) để lấy **1 cặp
   AppKey + AppSecret**.
   - Đây **KHÔNG PHẢI** là tài khoản `admin` / mật khẩu đăng nhập trang web đang dùng —
     mà là 1 cặp khóa **riêng cho việc kết nối phần mềm**, an toàn hơn vì có thể thu hồi
     riêng mà không ảnh hưởng tài khoản đăng nhập chính.
   - Nếu không thấy mục này hoặc không tự bật được, cần liên hệ **đơn vị đã lắp đặt hệ
     thống camera / kỹ thuật Hikvision** để được hỗ trợ bật lần đầu — đây là bước làm
     ngoài phạm vi phần mềm của Claude vì cần quyền quản trị cao nhất trên hệ thống camera.
3. Sao chép file `config.example.json` thành `config.json` (cùng thư mục), rồi mở bằng
   Notepad, điền `appKey` và `appSecret` thật vừa lấy được ở bước 2.

### Chạy chương trình

Mở Command Prompt / PowerShell tại đúng thư mục `camera-agent` này rồi gõ:

```
node index.js
```

Nếu chạy đúng, màn hình sẽ hiện dòng "✅ Chương trình cầu nối camera đã khởi động." và cứ
vài giây báo 1 lần đã quét được bao nhiêu biển số. Để dừng, nhấn `Ctrl + C`.

### Nếu gặp lỗi khi chạy lần đầu

Chương trình sẽ in thẳng nội dung lỗi ra màn hình (ví dụ lỗi xác thực 401/403, hoặc không
tìm thấy endpoint). Vì phần "ký" gọi API (chữ ký AppKey/AppSecret) được viết theo đúng
tài liệu chuẩn Hikvision công bố nhưng **chưa được thử trên máy chủ thật của mỏ**, nên rất
có thể cần chỉnh lại đôi chỗ (tên endpoint, tên trường dữ liệu trả về...) cho khớp đúng
phiên bản HikCentral Professional đang dùng tại mỏ. Hãy chụp lại/gửi đúng nội dung lỗi in
ra để được chỉnh sửa chính xác.

## Để chương trình TỰ CHẠY khi bật máy (không cần mở tay mỗi ngày)

Dùng **Task Scheduler** có sẵn trên Windows — cách làm giống nhau cho cả 2 chương trình,
chỉ khác tên file ở bước "Add arguments":

1. Mở "Task Scheduler" → "Create Task".
2. Tab "Triggers" → "New" → chọn "At log on" (chạy mỗi khi đăng nhập Windows).
3. Tab "Actions" → "New" → Program/script: đường dẫn tới `node.exe` (thường là
   `C:\Program Files\nodejs\node.exe`); "Add arguments": `doc-man-hinh.js` (Cách 1) hoặc
   `index.js` (Cách 2); "Start in": đường dẫn tới thư mục `camera-agent` này.
4. Lưu lại. Có thể nhờ Claude hướng dẫn hoặc thao tác cụ thể hơn khi cần.

## Phương án thay thế (nếu HikCentral hỗ trợ)

Một số bản HikCentral Professional có sẵn tính năng "gửi sự kiện ra URL ngoài" (Event
Notification / Linkage → HTTP). Nếu có, có thể cấu hình NGAY TRONG HikCentral để mỗi khi
nhận diện được biển số, hệ thống tự gửi thẳng dữ liệu tới:

```
https://mo-khuon-gian-3.netlify.app/api/import-plates
```

Cách này đơn giản hơn (không cần chạy chương trình cầu nối này), nhưng cần kiểm tra xem
phiên bản đang dùng có tính năng đó không, và định dạng dữ liệu HikCentral gửi lên có thể
cần chỉnh lại API `import-plates` cho khớp.
