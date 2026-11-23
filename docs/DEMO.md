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

1. Customer → Tìm Hub → chỉ vào sơ đồ vị trí các Hub; chọn Metro và xem thời gian tới Hub khác. Bấm Xem chi tiết Hub để chọn xe đủ pin.
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

1. Operator → What-if → **Nhu cầu cấp xe tại Hub**, chọn Metro, cách nhập **Nhập số xe cần có**, nhập **8 xe**.
2. Bấm **Tính phương án**. Đọc ba số: Hub cần bao nhiêu, có bao nhiêu khả dụng, còn thiếu bao nhiêu. Chỉ vào phép trừ ngay dưới bảng.
3. Đọc nguồn/đích/số xe đề xuất. Mở Chi tiết dữ liệu và giả định nếu cần đối chiếu bảng toàn mạng lưới: chọn nguồn nhiều xe có thể cho đi nhất, nhưng giữ ít nhất 3 xe và không vượt chỗ nhận.
4. Bấm **Thử phương án**: so sánh xe tại Hub và số còn thiếu trước/sau. Chỉ rõ đây là trạng thái khi đã bàn giao, chưa tạo lệnh thật.
5. Nếu dùng dữ liệu mới khởi động: Metro có 4, cần 8, thiếu 4 → lấy 4 từ KTX A đang có 12. Sau thử Metro có 8, KTX A còn 8. Sau các bước demo thật ở trên số liệu khác; đọc đúng bảng của lần tính, không đọc thuộc số mẫu.

Câu giải thích: “Đây là kiểm tra tài nguyên tại một thời điểm. Nhu cầu 8 xe do Operator giả định, không dự báo lượt thuê hoặc điểm trả. Hệ thống dùng thuật toán tham lam chọn nơi dư nhiều nhất, giới hạn theo dự phòng và chỗ nhận, rồi thử trên bản sao.”

Chỉ cần một tình huống trong phút này. Nếu có Q&A về sạc: chọn KTX A → **Cổng sạc lỗi** → c4 → Tính phương án → thử khôi phục c4 để cấp thêm một yêu cầu chờ. Phương án chỉ giả định đã sửa xong. Chọn c1 đang có xe sạc thì sửa chỉ khôi phục xe đó, không cấp thêm xe khác. Số thực tế tùy trạng thái demo.

## 6:50–7:20 — Một nhánh lỗi

Chọn **một** trong các nhánh đã diễn tập:

- Mã nhận sai không tạo chuyến đi.
- Lấy xe đang sạc bị từ chối.
- Operator tạo lệnh vượt xe/chỗ bị từ chối; lệnh cũ không bị thay đổi.

## 7:20–8:00 — Kết luận và đệm

Chốt ba ý: quản lý trạng thái nhất quán; phân bổ tài nguyên có giới hạn; mô phỏng phục vụ quyết định. Dành khoảng đệm cho chuyển cửa sổ hoặc thao tác chậm.

## Hàng đợi sạc: chuẩn bị cho Q&A

KTX A có 4 cổng: c1 (3.3 kW) sạc xe cá nhân của `customer3`; c2 (3.3 kW) và c3 (2.2 kW) sạc xe dùng chung; c4 (3.3 kW) bị lỗi. Tổng lắp đặt **12.1 kW**, hiện đang cấp **8.8 kW**. Hai yêu cầu chờ vì hết cổng sử dụng được, dù tổng lắp đặt vẫn lớn hơn công suất đang cấp.

1. Operator → **Giám sát sạc**: xem ba cổng đang sạc, một cổng lỗi; không có nút điều khiển phiên của khách hàng. Nhật ký toàn hệ thống ở cuối trang, mặc định thu gọn.
2. Technician → **Sạc đội xe** → Dừng phiên xe **EB-105** (`session-seed-fleet-1`, cổng c2).
3. Chỉ rõ c2 đã ngừng cấp điện nhưng còn chờ rút dây; hai yêu cầu vẫn chưa được cấp cổng.
4. Technician → Ngắt kết nối. Làm mới Operator: yêu cầu `charge-seed-wait-2` của customer5 được cấp c2 trước yêu cầu `charge-seed-wait-1` của customer4, vì hạn cần xe sớm hơn dù gửi sau.
5. Nếu cần bắt đầu phiên đã cấp này, đăng nhập **customer5@hub.local**, vào Sạc xe rồi Bắt đầu sạc. Technician chỉ thao tác đội xe dùng chung, không thay khách sạc xe cá nhân.

Để demo một phiên đội xe mới: Operator đăng ký sạc cho một xe dùng chung tại Hub còn cổng → Technician vào Sạc đội xe, Bắt đầu sạc → dừng/ngắt khi hoàn tất. Không cần thực hiện toàn bộ nhánh này trong 8 phút; dùng cho Q&A.

## Q&A nên nắm

- Dữ liệu chung nằm ở đâu, mất khi nào? RAM của backend; khởi động lại/reset nạp dữ liệu mẫu.
- Hai khách đặt cùng xe? Backend kiểm tra và cập nhật đồng bộ qua bản draft; chỉ một yêu cầu thành công trong một tiến trình.
- Làm sao biết xe đến? Trong demo, xác nhận đến nơi cung cấp quan sát giả lập; Service kiểm tra trước khi cập nhật nghiệp vụ.
- Vì sao pin đủ nhưng cổng chưa rảnh? Còn đầu nối; phải ngắt kết nối mới giải phóng.
- Vì sao còn công suất mà vẫn chờ? Công suất lắp đặt có thể thuộc cổng lỗi hoặc cổng chưa rút dây; mỗi cổng chỉ phục vụ một xe. Không phải chờ vì hạn mức điện thấp hơn tổng cổng. Nếu cổng thực sự trống, đúng Hub/cổng ưu tiên và xe hợp lệ, bộ lập lịch sẽ cấp theo thứ tự ưu tiên.
- Operator có xe riêng trong nhật ký sạc? Không. Đây là nhật ký toàn hệ thống có tên người yêu cầu và Hub. Operator chỉ giám sát, Technician xử lý sạc đội xe; chủ xe xử lý sạc cá nhân.
- Công cụ demo còn gì? Tiến thời gian và đặt lại dữ liệu. Các phản hồi thiết bị vẫn được giả lập tự động trong backend; không cần thao tác ba lệnh thiết bị trên UI.
- What-if có phải AI? Không; tính thiếu/đủ trên dữ liệu tài nguyên hiện có, thuật toán tham lam điều phối và ghép cổng theo ưu tiên. Nhu cầu là giả định nhập rõ ràng.
- Bản đồ có phải bản đồ thật? Không; sơ đồ vị trí từ tọa độ mẫu, thời gian giả định chỉ để tham khảo trên bản đồ, không tham gia What-if tĩnh. Chọn Hub để xem tài nguyên; không xin vị trí hoặc chỉ đường ngoài đời.
- Có bảo đảm tối ưu? Không. Thuật toán tham lam ưu tiên nguồn dư nhiều, báo rõ phần còn thiếu khi vướng dự phòng, chỗ nhận hoặc cổng. Không tối ưu tuyến vận chuyển.
- Nhu cầu ×2 lấy cơ sở ở đâu? Nếu chọn cách nhập theo hệ số, cả nhu cầu nền và hệ số đều do Operator nhập; ví dụ nền 4 ×2 = cần 8 xe cho một đợt. Không suy nhu cầu từ tồn xe hoặc tự tạo tổng lượt trong một giờ.

Khai báo việc sử dụng Generative AI theo yêu cầu môn học; mỗi thành viên cần hiểu và giải thích phần triển khai của nhóm.
