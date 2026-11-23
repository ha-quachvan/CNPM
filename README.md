# Smart E-Mobility Hub

Ứng dụng web quản lý phương tiện điện, chỗ đỗ và sạc tại các Hub trong khu đô thị ĐHQG-HCM. Frontend HTML/CSS/JavaScript; backend TypeScript, Node.js và Express; dữ liệu trong RAM, không cần cơ sở dữ liệu hoặc phần cứng.

MVP hoàn thiện các luồng thuê một chiều, gửi–lấy xe cá nhân, hàng đợi sạc và phân tích What-if. UI sử dụng nền trắng, màu `#1488D8` và `#030391`, ưu tiên bảng dữ liệu, nhãn và nút thao tác; giảm icon trang trí. Tài liệu Submission 3 được giữ nguyên.

## Chạy ứng dụng

Cần Node.js **22.9 trở lên** và Git:

```bash
git clone --branch develop https://github.com/ha-quachvan/CNPM.git
cd CNPM
npm ci
npm run build
npm start
```

Mở **http://localhost:3000**. Nếu đã có repo:

```bash
git switch develop
git pull --ff-only origin develop
npm ci
npm run build
npm start
```

Phát triển: `npm run dev`. Dừng server bằng `Ctrl+C`. Có thể sao chép `.env.example` thành `.env` để đổi `PORT` hoặc `HOST`; mặc định lắng nghe `127.0.0.1`.

## Tài khoản demo

Mật khẩu chung: **`Demo@12345`**.

| Vai trò               | Tài khoản                                       |
| --------------------- | ----------------------------------------------- |
| Customer chính        | `customer@hub.local`                            |
| Customer thứ hai      | `customer2@hub.local`                           |
| Khách nền cho sạc, đỗ | `customer3@hub.local` đến `customer8@hub.local` |
| Operator              | `operator@hub.local`                            |
| Technician            | `technician@hub.local`, `technician2@hub.local` |

Dùng các hồ sơ trình duyệt khác nhau để ba vai trò làm việc đồng thời. Các tab trong cùng hồ sơ dùng chung cookie.

Google/Clerk và mã khôi phục mật khẩu là **giả lập**; không gửi email/SMS hay kết nối nhà cung cấp thật.

## Các luồng chính

- **Bản đồ Hub:** sơ đồ tương tác từ tọa độ mẫu, chọn được từng Hub, xem tài nguyên và thời gian di chuyển giả định. Bản đồ và What-if dùng cùng bảng thời gian; không tải bản đồ ngoài hoặc xin vị trí người dùng. Bộ lọc Hub áp dụng đồng thời cho sơ đồ và danh sách.
- **Thuê xe:** chọn xe và Hub trả; giữ xe cùng chỗ đích trong một giao dịch. Giữ xe nhận trong 15 phút; chỗ trả tiếp tục được giữ sau khi nhận. Có thể đổi Hub trả nếu giữ được chỗ mới. Phạt chỉ khi trả khác **Hub đã đăng ký**, không phải khác Hub nhận.
- **Xe cá nhân:** đặt chỗ → xác nhận đỗ → sạc nếu cần → ngắt kết nối → lấy xe. Lịch sử vào/ra được giữ; lấy xe giải phóng chỗ.
- **Sạc:** công suất Hub bằng tổng định mức các cổng, không cấu hình một giới hạn thấp hơn. Mỗi cổng chỉ phục vụ một xe; hàng chờ xét hạn cần xe → pin thấp → yêu cầu đến trước, cấp khi có cổng trống phù hợp. Cổng được giữ 15 phút để bắt đầu. Đạt mục tiêu hoặc dừng sạc vẫn phải rút dây để giải phóng cổng. Customer thao tác xe cá nhân; Operator giám sát và đăng ký yêu cầu cho đội xe; Technician bắt đầu/dừng/ngắt sạc xe dùng chung tại Hub. Nhật ký Operator là nhật ký toàn hệ thống, chỉ đọc và mặc định thu gọn.
- **Thông báo:** được cấp cổng, đạt mục tiêu, dừng/ngắt sạc và hoàn tất dịch vụ. Lưu trong RAM, có trạng thái đã đọc; giao diện cập nhật định kỳ 3 giây khi đủ điều kiện.
- **Sự cố:** báo → Technician nhận → kiểm tra mô phỏng → hoàn tất; không tự giải phóng tài nguyên còn bận.
- **Điều phối:** Operator giữ xe nguồn và chỗ nhận; Technician nhận, vận chuyển và bàn giao sau xác minh vị trí.
- **What-if:** bước đầu chỉ so sánh bình thường / có tình huống, kèm một kết luận. Nhóm thuê xe hiển thị tổng yêu cầu và lượt chưa phục vụ; nhóm sạc hiển thị phiên đạt pin mục tiêu và thời gian chờ lớn nhất. Có thể bấm **Thử đề xuất này** để chạy riêng một lệnh điều chuyển và xem hiệu quả trên đúng bản sao ban đầu. Tối đa 12 phương án được xét, mỗi phương án 1–3 xe; chỉ đề xuất khi cải thiện lượt phục vụ và không tăng thiếu chỗ trả hoặc sạc trễ. Không tự tạo lệnh, tự đổi Hub trả hoặc sửa cổng. Chi tiết kỹ thuật mặc định thu gọn.

Trong mô hình không có phần cứng, xác nhận đến nơi trong hộp trả/bàn giao xe cung cấp sự kiện vị trí mô phỏng. Công cụ Operator chỉ có tiến thời gian và đặt lại dữ liệu. Bộ mô phỏng thiết bị vẫn được dùng trong backend và kiểm thử nhánh lỗi, không cần thao tác UNLOCK/LOCK/CHECK trong buổi demo.

## Dữ liệu mẫu

| Hub                            |  Chỗ đỗ | Xe chung | Xe cá nhân đang đỗ | Cổng sạc |
| ------------------------------ | ------: | -------: | -----------------: | -------: |
| Ga Metro ĐHQG                  |      20 |        4 |                  2 |        4 |
| KTX Khu A                      |      20 |       14 |                  3 |        4 |
| KTX Khu B                      |      20 |        8 |                  2 |        3 |
| Đại học Bách khoa              |      16 |        9 |                  1 |        3 |
| Thư viện Trung tâm             |      16 |        7 |                  2 |        2 |
| Nhà văn hóa Sinh viên, bảo trì |       8 |        0 |                  0 |        2 |
| **Tổng**                       | **100** |   **42** |             **10** |   **18** |

Thêm 2 xe cá nhân ngoài Hub: tổng **54 xe, 11 tài khoản**. Xe tại Hub gồm cả xe pin thấp, lỗi hoặc đang sạc; số khả dụng được tính riêng.

- `personal-1`, biển `59-T1 123.45`: của Customer chính, pin 35%, đang ở Metro; phù hợp demo sạc.
- `personal-2`, biển `59-T2 678.90`: của Customer chính, đang ngoài Hub; phù hợp demo gửi–lấy.
- KTX A: tổng công suất lắp đặt **12.1 kW**, ba cổng đang sạc (**8.8 kW**) và một cổng lỗi. Cổng c1 phục vụ xe của `customer3`; c2/c3 phục vụ hai xe dùng chung. Hai yêu cầu của `customer4` và `customer5` chờ vì hết cổng sử dụng được. Yêu cầu customer5 được ưu tiên dù gửi sau, vì hạn cần xe sớm hơn. Technician có thể dừng rồi ngắt c2 để minh họa cấp cổng cho hàng chờ.
- Có hai sự cố và lịch sử thuê, gửi xe, điều phối. Khu bảo trì không được cấp tài nguyên mới.

Backend khởi động lại hoặc Operator đặt lại demo sẽ nạp lại dữ liệu và thu hồi các phiên. Công cụ tiến thời gian ảnh hưởng mọi tài khoản; What-if có đồng hồ riêng và không làm hết hạn các đặt chỗ thật.

## Kiểm tra

```bash
npm run typecheck
npm test
npm run build
```

Kiểm tra trình duyệt:

```bash
npx playwright install chromium
npm run test:ui
```

Có thể đặt `PLAYWRIGHT_CHROMIUM_EXECUTABLE` để dùng Chromium đã cài. Kiểm tra UI gồm các luồng ba vai trò, cả năm What-if và 75 tổ hợp trang/kích thước; ảnh ở `artifacts/`, không đưa vào Git.

## Tài liệu

- [Demo 8 phút và Q&A](docs/DEMO.md)
- [Cơ chế What-if, giả định và giới hạn](docs/WHAT_IF.md)
- [API và trạng thái](docs/API.md)
- [Đối chiếu thiết kế gốc và phần bổ sung MVP](docs/DESIGN_MAPPING.md)

Mã nguồn ở `src/`, tài nguyên giao diện ở `public/`; `dist/` sinh từ TypeScript khi build. Không sửa tài liệu Submission 3 hoặc thêm báo cáo Test case bonus.
