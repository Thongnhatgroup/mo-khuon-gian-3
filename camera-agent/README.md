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

## Nên thử trước tiên — để camera tự gửi thẳng, không cần chạy chương trình nào ở đây

Theo đúng tài liệu kỹ thuật chính hãng Hikvision cho camera ANPR (ISAPI Traffic Cameras —
Urban Road/ANPR Cameras), **mỗi camera đọc biển số có thể tự động gửi kết quả ra 1 địa chỉ
máy chủ ngoài** mỗi khi nhận diện được xe — không cần chạy chương trình nào, không cần máy
tính nào luôn bật. Việc này cấu hình **trực tiếp trên từng camera** (qua địa chỉ IP riêng
của camera, KHÔNG phải qua trang quản trị HikCentral Professional chung), và cần tài khoản
quản trị của chính camera đó — nên nhờ đơn vị đã lắp đặt hệ thống hoặc kỹ thuật Hikvision
thực hiện. Các bước kỹ thuật (gọi bằng công cụ như Postman, hoặc qua đúng mục cấu hình nếu
giao diện web của camera có sẵn):

1. Kiểm tra camera có hỗ trợ: `GET /ISAPI/Event/notification/httpHosts/capabilities` — nếu
   kết quả trả về có mục `ANPR` thì camera hỗ trợ.
2. Khai báo địa chỉ nhận dữ liệu: `PUT /ISAPI/Event/notification/httpHosts`, trỏ tới:
   ```
   https://mo-khuon-gian-3.netlify.app/api/camera-webhook
   ```
   (cổng 443, giao thức HTTPS — tên trường cụ thể trong nội dung PUT có thể khác chút theo
   từng model, cần xem đúng kết quả trả về ở bước 1 để biết tên trường chính xác).
3. Bật tính năng gửi cảnh báo biển số theo giao thức chuẩn: `PUT /ISAPI/Traffic/ANPR/alarmHttpPushProtocol`
   với nội dung:
   ```xml
   <AlarmHttpPushProtocol version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
     <baseLineProtocolEnabled>true</baseLineProtocolEnabled>
   </AlarmHttpPushProtocol>
   ```

Hàm `netlify/functions/camera-webhook.js` đã được viết lại theo đúng định dạng dữ liệu thật
mà camera Hikvision gửi lên (xác nhận theo tài liệu chính hãng): gói tin dạng
`multipart/form-data` gồm 1 phần `anpr.xml` chứa dữ liệu XML (biển số nằm ở thẻ
`<ANPR><licensePlate>`) kèm theo các ảnh JPEG liên quan — hàm chỉ đọc đúng phần XML, không
cố đọc phần ảnh. Hàm cũng vẫn hỗ trợ đọc JSON nếu có cấu hình trung gian nào gửi định dạng
khác. LUÔN LƯU LẠI dữ liệu nhận được vào mục "Xem log camera gần đây" trong phần mềm quản lý
mỏ — nếu cấu hình xong mà chưa thấy nhận diện được biển số, xem đúng log đó gửi lại để chỉnh
cho khớp đúng model/firmware. Các bước trên **chưa được thử trực tiếp trên camera thật tại
mỏ** (chưa xác nhận được với chính phiên bản/model camera đang dùng) — nếu chưa nhờ được kỹ
thuật hỗ trợ ngay, dùng 1 trong 2 chương trình bên dưới.

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

