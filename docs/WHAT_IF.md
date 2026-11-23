# What-if: phân tích tác động và thử một đề xuất

## Cách đọc giao diện

1. Chọn tình huống, Hub và mức thay đổi. Mặc định 60 phút; thời gian và seed nằm trong Tùy chọn mô phỏng.
2. Bấm **Phân tích tình huống**. Màn hình chỉ so sánh **Bình thường / Có tình huống**, rồi đưa ra một kết luận. Các chỉ số tính trên **toàn mạng lưới**, tình huống chỉ tác động Hub được chọn.
3. Nếu có một lệnh điều chuyển phù hợp, bấm **Thử đề xuất này**. Kết quả mới so sánh **Giữ nguyên / Thực hiện đề xuất**, cùng nhu cầu khi có tình huống. Chưa tạo lệnh vận hành thật.
4. Chỉ mở **Chi tiết mô phỏng** khi cần giải thích thuật toán, nguyên nhân và diễn biến.

Nhóm nhu cầu thuê/Hub đầy/xe tập trung hiển thị hai hàng: tổng yêu cầu thuê và lượt chưa được phục vụ. Nhóm nhu cầu sạc/cổng lỗi hiển thị phiên đạt pin mục tiêu và thời gian chờ lớn nhất. Cảnh báo ngắn xuất hiện khi có thêm yêu cầu sạc hết hạn hoặc trễ hạn cần xe.

Khi thay đổi thiết lập, kết quả cũ vẫn mang tên và thời gian của tình huống cũ, nút thử bị khóa và yêu cầu phân tích lại. Một phân tích được giữ 10 phút và chỉ Operator đã tạo mới được thử; RAM giữ tối đa 20 phân tích. Reset hoặc khởi động lại xóa các bản sao.

## Dữ liệu và giả định

Engine chỉ làm việc trên bản sao trạng thái. Lịch nhu cầu theo các tuyến trong `src/data/demand.ts` và seed; cùng lịch nền được dùng để so sánh. Đây là nhu cầu giả lập cấu hình sẵn.

- Hub, xe, pin, cổng, các giữ chỗ và phiên đang hoạt động lấy tại lúc bấm phân tích.
- Tuyến có thời gian giả định 5–15 phút; cặp chưa khai báo dùng 10 phút. Bản đồ Hub dùng đúng cùng bảng thời gian qua trường `travelMinutesTo`. Tọa độ chỉ tạo sơ đồ vị trí tương đối; chưa tính đường đi thực tế.
- Xe đang thuê/lệnh đang vận chuyển được giả định tới nơi sau 10 phút; lệnh PENDING không tự bắt đầu.
- Mỗi chuyến thuê dùng 3% pin. Lượt được phục vụ tính khi xuất phát và đã giữ chỗ trả, kể cả chuyến chưa tới cuối kỳ.

## Năm tình huống

| Tình huống             | Tác động trên bản sao                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Nhu cầu di chuyển tăng | Tăng lượt đi ra từ Hub chọn theo hệ số; các tuyến khác giữ nguyên                                                   |
| Hub đầy                | Chuyển các xe hiện có từ nguồn còn dự phòng tới chỗ trống ở Hub chọn; ghi đúng số đã áp dụng, không giả tạo thêm xe |
| Xe tập trung           | Tương tự Hub đầy, nhưng theo số xe bổ sung khai báo và sức chứa thực sự còn lại                                     |
| Nhu cầu sạc tăng       | Tăng nhịp tạo yêu cầu sạc cho các xe đủ điều kiện tại Hub chọn; một xe tối đa một yêu cầu sống                      |
| Cổng lỗi               | Làm lỗi thêm các cổng còn dùng được, gồm cả cổng đang sạc. Không giả định sửa xong trong kỳ                         |

## Một bước 5 phút

1. Hết hạn các yêu cầu WAITING/HELD và giải phóng tài nguyên tương ứng.
2. Xử lý xe tới nơi bằng chỗ đã giữ. Xe điều chuyển chỉ phục vụ được sau lúc đến.
3. Cập nhật pin theo công suất cổng; cổng/xe lỗi không tăng pin. Đạt mục tiêu chuyển sang chờ rút dây, mô hình giả định rút ở bước sau.
4. Bắt đầu các phiên được giữ cổng ở bước trước.
5. Xử lý nhu cầu thuê bằng xe dùng chung đủ điều kiện và chỗ trả có thể cam kết. Thiếu xe hoặc thiếu chỗ thì ghi nhận chưa phục vụ; không tự chuyển hướng sang Hub trả khác.
6. Mỗi đợt 10 phút sinh nhu cầu sạc cho xe đang đỗ dưới 40% pin, mục tiêu 80%, cần xe sau 40 phút. Hệ số lẻ giữ phần dư để tạo nhịp 1,2,1,2 khi hệ số 1.5 và đủ xe.
7. Xếp ưu tiên sạc theo hạn cần xe, pin thấp, tạo trước, ID. Chỉ cấp cổng rảnh, không lỗi, đúng Hub/cổng ưu tiên nếu có. Tổng công suất Hub bằng tổng định mức cổng.
8. Kiểm tra bảo toàn xe, sức chứa, liên kết xe/chỗ, giữ chỗ và một cổng/một xe; ghi diễn biến.

Pin dùng cùng hàm `chargedBattery` với nghiệp vụ vận hành:

`pin mới = min(mục tiêu, 100, pin cũ + công suất kW × thời gian giờ / dung lượng kWh × 100)`.

## Tìm kiếm có giới hạn trên các lệnh điều chuyển

Đối với nhu cầu thuê tăng, thử chuyển xe từ Hub khác về Hub được chọn. Đối với Hub đầy/xe tập trung, thử chuyển xe ra khỏi Hub được chọn. Không tạo lệnh điều chuyển cho tình huống sạc.

Mỗi phương án chỉ có **một lệnh ngay đầu kỳ**. Các cặp Hub được xét theo thời gian tới nơi, rồi ID. Với mỗi cặp, xét số xe từ 1 tới:

`min(3, xe nguồn khả dụng − 2, chỗ nhận trống)`.

Xe đang thuê, sạc, chờ sạc, bị giữ, lỗi hoặc không đủ pin không được chọn. Lệnh phải tới trước khi hết kỳ. Tối đa 12 phương án được chạy độc lập trên cùng tình huống; mỗi lệnh giữ chỗ nhận trước khi xuất phát. Đây là tìm kiếm có giới hạn, không bảo đảm tối ưu đa bước.

Một phương án chỉ được đề xuất nếu:

- Lượt thuê được phục vụ tăng.
- Số từ chối vì thiếu chỗ trả không tăng.
- Số yêu cầu sạc trễ hạn không tăng.

Ưu tiên kết quả phục vụ nhiều hơn, rồi ít từ chối vì thiếu chỗ hơn, ít sạc trễ hơn, tới sớm hơn và dùng ít xe hơn. Nếu chưa có phương án đạt điều kiện thì báo đúng là chưa tìm được; không tự tạo giải pháp giả.

Phân tích ban đầu chạy hai mốc so sánh và các lượt thử ứng viên để chọn một đề xuất. Nút **Thử đề xuất này** chạy lại riêng tình huống không can thiệp và tình huống có đúng lệnh đã chọn trên **bản sao đã lưu**. Vì vậy đặt chỗ mới ở mạng lưới thật không làm sai phép so sánh trước/sau.

## Ví dụ trên dữ liệu mẫu ban đầu

Nhu cầu tại Metro ×2, 60 phút, seed 42:

| Chỉ số                      | Bình thường | Có tình huống |
| --------------------------- | ----------: | ------------: |
| Yêu cầu thuê toàn mạng lưới |          48 |            63 |
| Lượt chưa phục vụ           |           0 |            13 |

Đề xuất được chọn: chuyển 3 xe Bách khoa → Metro ngay đầu kỳ, tới sau 10 phút. Bấm thử:

| Chỉ số            | Giữ nguyên | Thực hiện đề xuất |
| ----------------- | ---------: | ----------------: |
| Lượt chưa phục vụ |         13 |                10 |
| Lượt được phục vụ |         50 |                53 |

Kết luận: phục vụ thêm 3 lượt, còn 10 lượt chưa được đáp ứng. Không tăng từ chối do thiếu chỗ trả hoặc số sạc trễ. Các số phụ thuộc trạng thái đầu vào; không cam kết giữ nguyên sau khi đã vận hành thật.

## Ý nghĩa số liệu bổ sung

- **Lượt chưa phục vụ:** yêu cầu bị từ chối tại lúc xử lý, không có hàng chờ thuê và không phục hồi được các lượt đã mất.
- **Thiếu chỗ trả:** một phần của chưa phục vụ; không cộng thêm lần nữa.
- **Phiên đạt mục tiêu:** đã đạt pin mục tiêu trong khoảng mô phỏng; có thể vẫn đang chờ rút dây.
- **Chờ bắt đầu sạc cuối kỳ:** còn WAITING hoặc HELD. Khác với số WAITING ghi ở từng bước diễn biến.
- **Chờ lâu nhất:** thời gian đã quan sát được trong kỳ, gồm thời gian giữ cổng trước khi bắt đầu; không phải cam kết thời gian chờ cho khách tiếp theo.
- **Sạc trễ:** yêu cầu có hạn cần xe trong kỳ nhưng chưa đạt mục tiêu đúng hạn; không tính phiên chủ động dừng như một thất bại đạt hạn.
- **Yêu cầu sạc hết hạn:** không được coi là đã phục vụ xong; cần đọc cùng số đạt mục tiêu, chờ và trễ.
