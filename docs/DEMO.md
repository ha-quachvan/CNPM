# Demo 8 phút + 2 phút Q&A

## Chuẩn bị trước buổi trình bày

1. `npm ci`, `npm run build`, `npm start`; mở `http://localhost:3000`.
2. Dùng ba hồ sơ/cửa sổ trình duyệt tách biệt: Customer, Operator, Technician. Các tab cùng hồ sơ chia sẻ cookie.
3. Đăng nhập bằng các nút tài khoản mẫu, mật khẩu `Demo@12345`.
4. Nếu cần dữ liệu ban đầu: Operator → Công cụ demo → Đặt lại dữ liệu; đăng nhập lại cả ba cửa sổ. Không đặt lại giữa chừng.
5. Chuẩn bị sẵn trang Tìm Hub, Điều phối và Xử lý sự cố. Không dùng thời gian trình bày để cài đặt hoặc gõ tài khoản.
6. Diễn tập trước; kết quả What-if phụ thuộc trạng thái tại lúc chạy. Dùng cùng quy trình thao tác nếu muốn tái hiện cùng số liệu.

## 0:00–0:40 — Phạm vi và kiến trúc

“Hệ thống quản lý xe, chỗ đỗ và sạc tại sáu Hub. Ba vai trò dùng chung backend TypeScript/Express. Trạng thái được lưu trong RAM; vị trí và phản hồi khóa xe được mô phỏng. What-if phân tích một bản sao riêng.”

## 0:40–2:20 — Thuê xe một chiều

1. Customer → Tìm Hub → Ga Metro ĐHQG → chọn một xe đủ pin.
2. Bấm Giữ xe, chọn Hub trả **Đại học Bách khoa**, xác nhận.
3. Chỉ vào mã nhận xe, thời hạn 15 phút và chỗ trả được giữ.
4. Bấm Nhận xe, nhập mã đúng. Có thể nhập sai một lần nếu còn thời gian.
5. Vào Chuyến đi → Trả xe tại Hub. Mặc định là Hub/chỗ đã đăng ký.
6. Tích xác nhận xe đã đến, xác nhận trả. Phạt bằng 0 dù Hub nhận và trả khác nhau.

Điểm giải thích: xe và chỗ đích được giữ cùng lúc; nhận xe giải phóng chỗ nguồn. Hết thời gian nhận thì giải phóng cả hai. Sau khi nhận, chỗ đích vẫn được giữ. Đổi Hub trả thành công thì Hub mới là nơi trả hợp lệ.

## 2:20–3:50 — Xe cá nhân, sạc và lấy xe

1. Customer → Xe cá nhân → Đặt chỗ đỗ cho **59-T2 678.90**, chọn KTX B, giữ và xác nhận đỗ.
2. Lấy xe ngay để cho thấy chỗ được giải phóng và có lịch sử vào/ra.
3. Sang Sạc xe → yêu cầu sạc **59-T1 123.45** đang ở Metro. Chọn mục tiêu **36%** để minh họa chuyển trạng thái nhanh; đây là mục tiêu minh họa, không phải lịch sạc sử dụng thông thường.
4. Được cấp cổng → Bắt đầu sạc.
5. Operator → Công cụ demo → +1 phút. Quay lại Customer và làm mới.
6. Phiên chuyển sang Chờ ngắt kết nối; mở thông báo đạt mục tiêu. Ngắt kết nối rồi có thể lấy xe tại Xe cá nhân.

Nếu thiếu thời gian, chỉ minh họa đặt–đỗ–lấy và phiên sạc được cấp cổng; dùng dữ liệu hàng đợi sẵn ở Operator để giải thích ưu tiên.

## 3:50–4:40 — Sự cố

Dùng báo cáo mẫu `incident-demo` về khóa xe tại Bách khoa. Technician nhận xử lý, ghi chú kết quả và hoàn tất. Chỉ rõ cùng một báo cáo không thể có hai người nhận; đóng báo cáo không được giải phóng xe còn đang thuê hoặc đang sạc.

## 4:40–5:50 — Điều phối

1. Operator → Điều phối xe → tạo lệnh **KTX A → Metro, 2 xe**.
2. Mở chi tiết để thấy xe và chỗ nhận được giữ.
3. Technician nhận lệnh; chỗ nguồn được giải phóng, chỗ đích vẫn giữ.
4. Bàn giao, xác nhận xe đã đến Hub đích và hoàn tất.
5. Operator làm mới để thấy số xe thay đổi.

## 5:50–6:50 — What-if

1. Operator → What-if → Nhu cầu di chuyển tăng tại Metro, hệ số 2, 60 phút, seed 42.
2. Bấm chạy một lần. Ba lượt tính nội bộ trả bảng so sánh.
3. Đọc lượt phục vụ/chưa phục vụ trước và sau phương án.
4. Chỉ vào một lệnh: nguồn, đích, số xe và phút đến.
5. Nếu có cảnh báo đánh đổi hoặc phương án chưa cải thiện, đọc đúng kết quả. Không khẳng định mọi tình huống đều có giải pháp tốt hơn.

Câu giải thích ngắn: “Mô hình tiến mỗi bước 5 phút, cập nhật xe đi–đến và sạc. Khi thiếu xe hoặc chỗ, thử phương án trong giới hạn nguồn lực rồi chạy lại. Kết quả không tự áp dụng vào mạng lưới.”

Có thể thay bằng Hub đầy tại KTX A để thấy chuyển hướng sang một Hub còn chỗ. Không cần chạy cả năm tình huống trong 8 phút.

## 6:50–7:20 — Một nhánh lỗi

Chọn **một** trong các nhánh đã diễn tập:

- Mã nhận sai không tạo chuyến đi.
- Lấy xe đang sạc bị từ chối.
- Operator tạo lệnh vượt xe/chỗ bị từ chối; lệnh cũ không bị thay đổi.

## 7:20–8:00 — Kết luận và đệm

Chốt ba ý: quản lý trạng thái nhất quán; phân bổ tài nguyên có giới hạn; mô phỏng phục vụ quyết định. Dành khoảng đệm cho chuyển cửa sổ hoặc thao tác chậm.

## Hàng đợi sạc: chuẩn bị cho Q&A

KTX A có cổng `hub-a-c1` đang sạc xe của `customer3`, ngân sách 3.3 kW dùng hết. Yêu cầu `charge-seed-wait-2` cần xe sớm hơn `charge-seed-wait-1`, nên được cấp trước dù không chỉ xét thứ tự tạo.

Operator → Quản lý sạc → Dừng phiên nền rồi ngắt kết nối. Quan sát yêu cầu đến hạn sớm được cấp cổng trước. Các cổng trống khác vẫn có thể phải chờ vì ngân sách công suất đã được giữ. Một cổng chờ ngắt kết nối không được cấp lại cho xe khác.

## Q&A nên nắm

- Dữ liệu chung nằm ở đâu, mất khi nào? RAM của backend; khởi động lại/reset nạp dữ liệu mẫu.
- Hai khách đặt cùng xe? Backend kiểm tra và cập nhật đồng bộ qua bản draft; chỉ một yêu cầu thành công trong một tiến trình.
- Làm sao biết xe đến? Trong demo, xác nhận đến nơi cung cấp quan sát giả lập; Service kiểm tra trước khi cập nhật nghiệp vụ.
- Vì sao pin đủ nhưng cổng chưa rảnh? Còn đầu nối; phải ngắt kết nối mới giải phóng.
- Vì sao cổng trống nhưng chưa cấp? Còn điều kiện công suất, quyền sử dụng và ưu tiên.
- What-if có phải AI? Không; mô hình theo bước thời gian, lịch nhu cầu giả lập và heuristic có ràng buộc.
- Có bảo đảm tối ưu? Không. Kết quả được chạy lại, thể hiện cả đánh đổi và khả năng chưa tìm được phương án cải thiện.
- Tại sao không lấy lượt thuê trừ số xe? Lượt trong cả kỳ khác lượng xe tại một thời điểm; xe có thể phục vụ lại sau khi đến nơi.

Khai báo việc sử dụng Generative AI theo yêu cầu môn học; mỗi thành viên cần hiểu và giải thích phần triển khai của nhóm.
