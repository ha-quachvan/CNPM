# Smart E-Mobility Hub

Ứng dụng web điều phối phương tiện điện trong khu đô thị ĐHQG-HCM, triển khai theo **Submission 3** của nhóm Scout Regiment – CO3001.

Frontend HTML/CSS/JavaScript, backend TypeScript + Express chạy trong một tiến trình Node.js. Giao diện thiết kế mới theo phong cách tối giản của mẫu shadcn/ui, nền trắng, màu `#1488D8` và `#030391`. Không cần React hoặc dịch vụ bên ngoài.

## Chạy nhanh

Cài **Node.js 22.9 trở lên** và Git. Trong Terminal/PowerShell:

```bash
git clone --branch develop https://github.com/ha-quachvan/CNPM.git
cd CNPM
npm ci
npm run build
npm start
```

Mở **http://localhost:3000**. Giữ Terminal đang chạy; nhấn `Ctrl+C` để dừng.

Phát triển với tự động nạp lại backend:

```bash
npm run dev
```

Có thể sao chép `.env.example` thành `.env` để đổi `PORT` hoặc `HOST`. Node nạp `.env` nếu tệp tồn tại. Mặc định chỉ lắng nghe trên `127.0.0.1` của máy demo. Khi đổi cổng, mở URL tương ứng.

## Tài khoản demo

Mật khẩu chung: **`Demo@12345`**. Các nút chọn vai trò ở màn hình đăng nhập điền sẵn tài khoản và mật khẩu.

| Vai trò            | Email                   |
| ------------------ | ----------------------- |
| Customer           | `customer@hub.local`    |
| Customer thứ hai   | `customer2@hub.local`   |
| Operator           | `operator@hub.local`    |
| Technician         | `technician@hub.local`  |
| Technician thứ hai | `technician2@hub.local` |

Google/Clerk là hai luồng **giả lập**. Nút tương ứng đăng nhập tài khoản Customer demo. Khôi phục mật khẩu tạo mã thử nghiệm hiển thị ngay trên màn hình, hiệu lực 5 phút; không gửi email/SMS thật.

Có thể mở các cửa sổ ẩn danh hoặc các hồ sơ trình duyệt khác nhau để demo ba vai trò đồng thời. Các tab trong cùng hồ sơ trình duyệt dùng chung cookie đăng nhập.

## Chức năng

- **Customer:** đăng ký/đăng nhập, hồ sơ, tìm và xem Hub; giữ/đổi/hủy xe; nhập mã nhận, trả xe; đặt/đổi/gia hạn/xác nhận chỗ đỗ xe cá nhân; yêu cầu sạc, chờ phân bổ, bắt đầu và theo dõi sạc; báo và xem sự cố của mình.
- **Operator:** giám sát Hub và nguồn lực; tạo/xem/sửa/hủy lệnh điều phối; theo dõi sự cố; chạy năm kịch bản What-if; dùng công cụ demo thời gian và phản hồi thiết bị.
- **Technician:** xem, nhận và xử lý sự cố; nhận lệnh điều phối, xác minh xe đến đích và hoàn tất bàn giao.

Các thao tác sử dụng API thật trong cùng ứng dụng, kiểm tra vai trò và dữ liệu hiện hành ở backend. UI hiển thị lỗi nghiệp vụ, trạng thái trống, thời gian giữ chỗ và trạng thái đang xử lý.

## Mô hình demo

- Có 4 Hub: 3 Hub hoạt động và 1 Hub bảo trì; 12 xe dùng chung, 3 xe cá nhân, 40 vị trí đỗ, 8 cổng sạc. Tài nguyên ở Hub bảo trì không được phân bổ mới.
- `personal-1` của Customer đang đỗ tại KTX Khu A, pin 35%, dùng cho demo sạc.
- `personal-2` của Customer đang ngoài Hub, dùng cho demo đặt chỗ đỗ.
- Có một sự cố mẫu để Technician có thể nhận việc ngay.
- Dữ liệu trong RAM dùng chung giữa tất cả tài khoản, được nạp lại khi backend khởi động hoặc Operator chọn **Đặt lại dữ liệu demo**. Việc đặt lại thu hồi mọi phiên đăng nhập.
- Device Simulator trả quan sát/kết quả giả lập; Service quyết định thay đổi nghiệp vụ. Trong hộp trả xe/bàn giao xe có lựa chọn rõ ràng để đặt vị trí mô phỏng tại Hub đích trước khi xác nhận. Bỏ chọn để thử nhánh vị trí không khớp.
- Background Jobs chạy mỗi giây: hết hạn giữ chỗ → cập nhật pin → lập lịch sạc. Mở **Operator → Công cụ demo** để tiến thời gian 1 phút, 15 phút hoặc 1 giờ.
- What-if sử dụng bản sao sâu, không tự áp dụng khuyến nghị vào trạng thái đang vận hành.

## Thông số cấu hình

Các giá trị tập trung tại [`src/shared/config.ts`](src/shared/config.ts). Giá trị thiết kế đã quy định được giữ nguyên; các con số demo còn lại được ghi rõ ở đây để nhóm dễ điều chỉnh.

| Thông số                                      | Giá trị                                         |
| --------------------------------------------- | ----------------------------------------------- |
| Giữ xe/chỗ/cổng                               | 15 phút                                         |
| Yêu cầu sạc chưa được cấp cổng                | 60 phút                                         |
| Gia hạn chỗ đỗ/sạc                            | Tối đa 2 lần, mỗi lần 1–15 phút                 |
| Pin tối thiểu để thuê/điều phối xe dùng chung | 20%                                             |
| Phí thuê mô phỏng                             | 1.000 đồng/phút, làm tròn lên, tối thiểu 1 phút |
| Phạt trả khác Hub nhận                        | 30.000 đồng                                     |
| Thời hạn Session                              | 8 giờ                                           |
| Khôi phục mật khẩu                            | Mã 6 số, hiệu lực 5 phút, sử dụng một lần       |
| Khóa đăng nhập                                | 5 lần sai trong cửa sổ 15 phút → khóa 15 phút   |
| Chu kỳ Jobs                                   | 1 giây                                          |
| Giới hạn tính What-if                         | 15 giây; khoảng dự báo tối đa 1.440 phút        |

Thời gian sạc sử dụng công suất cổng (kW), dung lượng pin (kWh) và thời gian tăng thêm từ `updatedAt`. Thao tác tiến thời gian tác động đến toàn bộ buổi demo. Mỗi khoảng thời gian chỉ được cộng pin một lần.

## Cấu trúc

```text
public/
  pages/auth/         Đăng nhập, đăng ký, khôi phục mật khẩu
  pages/customer/     Không gian Customer
  pages/operator/     Không gian Operator
  pages/technician/   Không gian Technician
  css/                Giao diện responsive
  js/                 Gọi API, render trang, biểu mẫu, điều hướng
src/
  app.ts              Express, tài nguyên tĩnh, xử lý lỗi
  server.ts           Lắng nghe HTTP và khởi chạy Jobs
  system.ts           Khởi tạo một kho RAM dùng chung và các Service
  models/             17 lớp dữ liệu, Enum, DTO và NetworkState
  services/           8 Service nghiệp vụ
  repositories/       InMemoryRepository
  simulation/         DeviceSimulator, DemoAuthProvider, WhatIfEngine
  jobs/               BackgroundJobs
  routes/             Định tuyến API
  controllers/        Tiếp nhận và chuyển yêu cầu tới Service
  middleware/         Kiểm tra Session
  data/               Dữ liệu mẫu TypeScript
  shared/             Cấu hình, lỗi, bảo mật và quy tắc dùng chung
tests/                Kiểm tra nghiệp vụ, HTTP và luồng trình duyệt
docs/                 Hướng dẫn demo, đối chiếu lớp/phương thức và API
dist/                 JavaScript sinh sau npm run build, không đưa vào Git
```

## Kiểm tra

```bash
npm run typecheck
npm test
npm run build
```

Kiểm tra giao diện bằng Chromium headless (tùy chọn, máy có thể tải trình duyệt):

```bash
npx playwright install chromium
npm run test:ui
```

`test:ui` tự chạy một backend riêng, kiểm tra các luồng của ba vai trò và các kích thước màn hình. Ảnh kiểm tra nằm ở `artifacts/`, không đưa vào Git. Có thể chỉ định trình duyệt đã cài qua biến `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

Kiểm thử mã nguồn phục vụ xác minh triển khai; không thêm phần báo cáo Test case bonus vào Submission 3.

## Tài liệu

- [Kịch bản demo](docs/DEMO.md)
- [30 lớp và 45 phương thức](docs/DESIGN_MAPPING.md)
- [Hợp đồng API và các quy tắc triển khai](docs/API.md)

Thiết kế lớp/phương thức lấy Submission 3 làm chuẩn. Giao diện mới theo lựa chọn của nhóm, không sử dụng UI Submission 2. Các constructor và hàm hỗ trợ kỹ thuật được bổ sung khi cài đặt như quy ước của thiết kế.
