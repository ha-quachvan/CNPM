# Kịch bản trình diễn Smart E-Mobility Hub

## Chuẩn bị

1. Chạy `npm ci`, `npm run build`, `npm start`; mở `http://localhost:3000`.
2. Dùng các cửa sổ/hồ sơ trình duyệt tách biệt cho Customer, Operator, Technician để cookie không thay thế nhau.
3. Mật khẩu mọi tài khoản mẫu: `Demo@12345`.
4. Nếu cần bắt đầu từ đầu, đăng nhập Operator → Công cụ demo → Đặt lại dữ liệu demo; sau đó đăng nhập lại các cửa sổ.

## 1. Customer tìm, đặt, nhận và trả xe

1. Đăng nhập `customer@hub.local`.
2. Mở Tìm Hub; thử nhập `Ký túc`, lọc xe đạp điện và mức pin.
3. Mở KTX Khu A, chọn một xe sẵn sàng, bấm Giữ xe và xác nhận.
4. Vào Đặt chỗ của tôi: xem mã nhận và thời gian còn lại.
5. Bấm Nhận xe, thử mã sai rồi nhập mã đúng. Chuyến đi chỉ bắt đầu sau khi mở khóa giả lập thành công.
6. Vào Chuyến đi → Trả xe. Chọn Hub và chỗ trống; giữ lựa chọn mô phỏng vị trí rồi xác nhận.
7. Xem phí và lịch sử. Trả tại Hub khác KTX Khu A để minh họa khoản phạt.
8. Có thể bỏ chọn mô phỏng vị trí và chọn Hub không khớp quan sát để thấy thông báo chưa xác nhận; xe không bị cộng vào Hub sai.

## 2. Hai khách tranh cùng một xe

1. Dùng `customer@hub.local` và `customer2@hub.local` trong hai hồ sơ trình duyệt.
2. Cả hai mở cùng Hub và cùng một xe trước khi đặt.
3. Khách thứ nhất giữ xe thành công.
4. Khách thứ hai thử giữ từ màn hình cũ: backend trả xung đột.
5. Operator nhìn thấy xe đã RESERVED trong cùng kho dữ liệu.

## 3. Đặt chỗ cho xe cá nhân

1. Customer → Đặt chỗ của tôi → Đặt chỗ đỗ.
2. Chọn xe `59-T2 678.90` đang ngoài Hub, chọn một chỗ trống tại KTX Khu B.
3. Thử Gia hạn hoặc Đổi tài nguyên; hạn hiện hành không bị đặt lại khi đổi.
4. Bấm Xác nhận đỗ; chỗ chuyển sang đang sử dụng và xe được liên kết với vị trí.
5. Có thể hủy trước khi xác nhận để minh họa giải phóng giữ chỗ.

## 4. Yêu cầu và theo dõi sạc

1. Customer → Sạc xe → Yêu cầu sạc.
2. Chọn `59-T1 123.45`, pin ban đầu 35%, đang tại KTX Khu A; mục tiêu 80%.
3. Chọn Tự động phân bổ để xem cơ chế hàng chờ. Khi có cổng và ngân sách công suất, yêu cầu được cấp cổng.
4. Bấm Bắt đầu sạc. Xem mức pin, mục tiêu, cổng và trạng thái phiên.
5. Operator → Công cụ demo → +15 phút hoặc +1 giờ. Quay lại Customer, bấm Làm mới để thấy pin tăng/phiên hoàn tất.
6. Sạc đến mục tiêu dừng đúng mục tiêu, cổng được giải phóng. Thời gian 15 phút giữ cổng không đóng một phiên sạc đã bắt đầu.

## 5. Sự cố và kỹ thuật viên

1. Customer → Báo cáo sự cố → chọn xe/cổng, nhập mô tả.
2. Technician đăng nhập `technician@hub.local`, mở Xử lý sự cố.
3. Bấm Nhận xử lý; trạng thái chuyển từ Chưa tiếp nhận sang Đang xử lý.
4. Technician thứ hai thử nhận cùng báo cáo: không được nhận lại.
5. Technician đã nhận bấm Hoàn tất, nhập ghi chú; sau phản hồi CHECK hợp lệ, báo cáo được đóng.
6. Sự cố mẫu có sẵn liên quan xe tại Đại học Bách khoa. Khôi phục tài nguyên xét các phiên/giữ chỗ còn tồn tại.

## 6. Điều phối xe giữa Hub

1. Operator → Điều phối xe → Tạo lệnh.
2. Chọn KTX Khu A → KTX Khu B, số xe 1 hoặc 2.
3. Mở Chi tiết để thấy xe cụ thể và các chỗ nhận được giữ.
4. Khi lệnh đang chờ, thử sửa số xe hoặc hủy. Yêu cầu vượt số xe/chỗ nhận bị từ chối, lệnh cũ vẫn giữ nguyên.
5. Technician → Lệnh điều phối → Nhận lệnh. Xe chuyển sang đang vận chuyển, chỗ nguồn được giải phóng; chỗ đích vẫn đang giữ.
6. Bấm Bàn giao xe, giữ lựa chọn mô phỏng xe đã đến Hub đích và xác nhận.
7. Operator Làm mới để thấy trạng thái hoàn tất và số xe ở Hub đích thay đổi.
8. Bỏ chọn mô phỏng đến đích để minh họa nhánh vị trí không khớp; lệnh không hoàn tất một phần.

## 7. What-if

1. Operator → Mô phỏng What-if.
2. Chọn Nhu cầu di chuyển tăng, Hub A, hệ số 2, khoảng dự báo 60 phút, seed 42.
3. Chạy mô phỏng, đọc nhu cầu dự kiến, nguồn xe và khuyến nghị.
4. Thử Hub đầy, Nhu cầu sạc tăng, Cổng sạc gặp sự cố hoặc Mất cân bằng xe.
5. Dữ liệu đang vận hành không thay đổi theo giả định. Cùng trạng thái đầu vào, tham số và seed cho cùng chỉ số.
6. `60 phút` là thời gian tình huống được khảo sát; giới hạn thực thi phép tính là 15 giây.

## 8. Hết hạn, lỗi thiết bị và tài khoản

- Tạo một đặt xe rồi dùng Operator → Công cụ demo → +15 phút. Customer Làm mới: đặt hết hạn, xe khả dụng trở lại nhưng chỗ đang chứa xe vẫn đang sử dụng.
- Operator cấu hình xe/lệnh Mở khóa trả Thất bại. Customer thử nhận đúng xe: báo lỗi, không tạo chuyến đi và không giải phóng chỗ nguồn. Đặt phản hồi về Thành công để tiếp tục.
- Thử 5 lần mật khẩu sai; tài khoản bị khóa 15 phút. Có thể dùng công cụ tiến thời gian của Operator hoặc đặt lại dữ liệu.
- Chọn Quên mật khẩu ở trang đăng nhập: lấy mã demo, xác minh, đặt mật khẩu mới; các phiên cũ bị thu hồi.
- Thử đăng nhập qua Google/Clerk Demo: đây là danh tính giả lập, không gọi nhà cung cấp thật.

## Mạch báo cáo khoảng 10 phút

- 1 phút: phạm vi, kiến trúc và các vai trò.
- 3 phút: tìm–đặt–nhận–trả xe, chỉ ra trạng thái thay đổi.
- 2 phút: sạc hoặc sự cố.
- 2 phút: điều phối qua Operator và Technician.
- 1 phút: What-if và tính độc lập của snapshot.
- 1 phút: tranh tài nguyên, lỗi mở khóa hoặc hết hạn giữ chỗ.
