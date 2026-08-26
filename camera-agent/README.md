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

## Nên thử trước tiên — để HikCentral tự gửi thẳng, không cần chạy chương trình nào ở đây

Trước khi dùng 1 trong 2 chương trình bên dưới, hãy kiểm tra xem chính phần mềm HikCentral
Professional có sẵn tính năng "gửi sự kiện ra URL ngoài" (Event Notification / Linkage →
HTTP(S) Post/Notify Surveillance Center, trong mục Cấu hình hệ thống → Sự kiện/Event → Liên
kết/Linkage) hay không. Nếu có, đây là cách đơn giản nhất — không cần chạy chương trình nào,
không cần máy tính nào luôn bật — chỉ cần cấu hình 1 lần NGAY TRONG HikCentral, trỏ tới:

```
https://mo-khuon-gian-3.netlify.app/api/camera-webhook
```

Thường cần nhờ đơn vị đã lắp đặt hệ thống hoặc kỹ thuật Hikvision hỗ trợ tìm đúng mục (không
phải bản/gói HikCentral nào cũng có tính năng này — cần thử mới biết chắc). Hàm
`netlify/functions/camera-webhook.js` đã được viết để cố gắng đọc nhiều định dạng dữ liệu
khác nhau (JSON hoặc XML) và LUÔN LƯU LẠI NGUYÊN VĂN dữ liệu nhận được vào mục "Xem log
camera gần đây" trong phần mềm quản lý mỏ — nếu cấu hình xong mà chưa thấy nhận diện được
biển số, xem đúng log đó gửi lại để chỉnh cho khớp định dạng thật. Nếu không tìm thấy tính
năng này trong HikCentral, dùng 1 trong 2 chương trình bên dưới.

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
3. Mở sẵn phần mềm HikCentral Control Client, để nguyên khung "Vehicle" hiển thị trên màn
   hình (không thu nhỏ), rồi **bấm đúp chuột vào file `Chay-doc-man-hinh.bat`** trong đúng
   thư mục này — KHÔNG cần mở Command Prompt hay gõ lệnh gì cả. Lần đầu chạy sẽ tự cài thêm
   thư viện cần thiết (mất vài phút, cần có mạng), các lần sau bấm đúp là chạy ngay.
4. Chương trình sẽ tự chụp lại màn hình mỗi 10 giây (có thể chỉnh trong config.json) và đẩy
   biển số đọc được lên phần mềm quản lý mỏ. Xem chi tiết cách hoạt động, ưu/nhược điểm ngay
   trong phần chú thích đầu file `doc-man-hinh.js`. Để dừng, đóng cửa sổ đen hiện ra.
5. Để chương trình tự chạy mỗi khi bật máy (không cần bấm tay mỗi ngày): cách đơn giản nhất
   là tạo 1 shortcut của `Chay-doc-man-hinh.bat` rồi đặt vào thư mục Startup của Windows
   (gõ `shell:startup` vào ô địa chỉ File Explorer để mở đúng thư mục đó, rồi dán shortcut
   vào). Cách bền hơn (chạy cả khi chưa đăng nhập Windows) là dùng Task Scheduler — xem mục
   bên dưới.

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

