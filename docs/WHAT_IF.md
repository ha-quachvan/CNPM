# What-if: cách tính và giới hạn của MVP

## Bài toán

What-if trả lời tác động của một tình huống lên khả năng phục vụ của mạng lưới. Nó không lấy tổng lượt thuê trừ số xe ban đầu để suy ra số xe phải điều phối. Một xe có thể phục vụ lại sau khi đến Hub; một cổng có thể lần lượt sạc nhiều xe.

Engine chỉ nhận bản sao trạng thái. Không có tham chiếu tới repository đang vận hành. Một lần chạy gồm ba bản sao độc lập: điều kiện bình thường, có tình huống, có tình huống cộng phương án thử nghiệm.

## Đầu vào

- Tình huống, Hub hoạt động, 30/60/120 phút và seed.
- Nhu cầu theo tuyến trong `src/data/demand.ts`, thời gian giả định 5–15 phút. Có biến động nhỏ theo PRNG seed; cùng lịch nhu cầu nền được dùng giữa các lượt so sánh.
- Xe, chỗ đỗ, cổng, pin, công suất, các giữ chỗ và phiên đang hoạt động từ snapshot.
- Chuyến thuê/lệnh đang vận chuyển được giả định đến đích sau 10 phút kể từ snapshot; lệnh PENDING không tự bắt đầu.

Đây là dữ liệu giả lập cấu hình sẵn; không phải mô hình AI được huấn luyện hay dự báo đã được kiểm chứng trên lịch sử thực tế.

## Một bước 5 phút

1. Hết hạn các cam kết đã đến hạn. Chỗ trả của một chuyến đang chạy không hết hạn theo thời hạn nhận xe.
2. Xử lý xe thuê/điều phối đến đích; chuyển chỗ đã giữ thành có xe.
3. Cập nhật pin của phiên đang sạc. Không cấp điện ở cổng lỗi. Đạt mục tiêu chuyển sang chờ ngắt kết nối; mô hình giả định người dùng ngắt ở bước kế tiếp.
4. Người dùng bắt đầu phiên đã được cấp cổng ở bước trước.
5. Xử lý nhu cầu thuê. Chỉ phục vụ khi có xe dùng chung đủ pin và chỗ trả hợp lệ. Khi xuất phát, chỗ nguồn được giải phóng và chỗ đích được giữ. Xe chỉ có thể thuê tiếp sau khi đến nơi.
6. Sinh nhu cầu sạc cho các xe đang đỗ dưới 40% pin, không tạo hai yêu cầu sống cho một xe. Mỗi đợt 10 phút chọn một xe đủ điều kiện tại mỗi Hub; tình huống tăng nhu cầu tăng số yêu cầu tại Hub chọn. Hệ số lẻ dùng phần dư tích lũy, không tự làm tròn thành gấp đôi.
7. Xếp hàng theo thời điểm cần xe, pin, thời điểm tạo và ID. Chỉ cấp cổng còn rảnh, hợp lệ và đủ công suất; giữ cổng trước khi bắt đầu cũng giữ ngân sách công suất.
8. Nếu là lượt chạy có phương án, thử điều chuyển/chuyển hướng phù hợp, tối đa ba hành động trong cả kỳ.
9. Kiểm tra bảo toàn xe, liên kết chỗ đỗ, giữ chỗ, cổng và công suất; ghi thống kê theo thời điểm.

Công thức sạc dùng chung với nghiệp vụ thật:

`pin mới = min(pin mục tiêu, 100, pin cũ + công suất kW × thời gian giờ / dung lượng kWh × 100)`.

Mỗi chuyến mô phỏng dùng 3% pin. Đây là giả định đơn giản để thể hiện ảnh hưởng của pin, không phải mô hình tiêu thụ năng lượng theo đường thực tế.

## Năm tình huống

| Tình huống             | Cách tác động                                                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nhu cầu di chuyển tăng | Thêm yêu cầu đi ra từ Hub chọn, theo hệ số 1–3; lịch nền giữ nguyên                                                                                                     |
| Hub đầy                | Chuyển xe sẵn sàng từ các Hub khác vào chỗ trống của Hub chọn trước khi chạy; nguồn giữ tối thiểu hai xe. Nếu không đủ xe thì ghi đúng số đã áp dụng, không giả tạo đầy |
| Nhu cầu sạc tăng       | Tăng nhịp yêu cầu sạc tại Hub chọn, giới hạn bởi các xe đủ điều kiện thực sự có trong mô hình                                                                           |
| Cổng lỗi               | Chọn các cổng chưa lỗi, kể cả cổng đang phục vụ, đánh dấu ngừng hoạt động; không giả định sửa xong trong kỳ                                                             |
| Xe tập trung           | Chuyển thêm số xe được khai báo vào Hub chọn, có kiểm tra nguồn, sức chứa và giữ xe dự phòng; không xóa xe ở nơi thiếu                                                  |

## Heuristic điều phối

- Khi Hub đầy và còn xe dùng chung có thể chuyển, chọn một Hub hoạt động còn chỗ để giải phóng sức chứa.
- Khi ghi nhận thiếu xe, chọn nguồn có nhiều xe khả dụng hơn mức dự phòng. Không tiếp tục tạo lệnh vào cùng đích khi lệnh trước chưa đến.
- Mỗi lệnh tối đa ba xe. Số lượng bị giới hạn bởi thiếu hụt ở bước xét, xe nguồn có thể cho đi và chỗ nhận. Không dùng tổng lượt cả giờ làm số xe phải chuyển.
- Xe chuyển đi ngay trong mô hình nhưng chỉ khả dụng ở đích sau thời gian vận chuyển; giữ chỗ đích trong suốt thời gian đó.
- Khi đích của yêu cầu thuê hết chỗ, lượt có phương án có thể chuyển hướng sang Hub thay thế còn chỗ và giữ chỗ trước khi xe xuất phát. Đây là giả định người dùng đồng ý với Hub thay thế.
- Không sửa được các lượt đã bị từ chối trong quá khứ. Phương án chỉ ảnh hưởng các bước tiếp theo.

Heuristic không bảo đảm tối ưu toàn cục. Nó có thể cải thiện tổng lượt phục vụ nhưng tăng tắc nghẽn ở một nơi khác. Engine hiển thị số tính lại và ghi rõ đánh đổi thay vì khẳng định mọi chỉ số đều tốt hơn.

## Đọc kết quả

- **Yêu cầu thuê:** số lượt được sinh trong cả kỳ, không phải số xe cần hiện diện đồng thời.
- **Lượt phục vụ:** đã xuất phát và được cam kết chỗ trả; xe chưa tới cuối kỳ vẫn đang di chuyển.
- **Lượt chưa phục vụ:** bị từ chối vì không có xe hoặc không có chỗ trả.
- **Bị chặn do thiếu chỗ trả:** một phần của lượt chưa phục vụ, không cộng hai lần.
- **Sạc còn chờ:** yêu cầu WAITING hoặc HELD cuối kỳ. Yêu cầu hết hạn được thể hiện qua việc không đạt mốc cần xe, không coi là đã sạc xong.
- **Yêu cầu sạc hết hạn:** hết hạn chờ hoặc hết hạn nhận cổng trong kỳ, không được tính là phục vụ thành công.
- **Chờ sạc lớn nhất:** số phút chờ đã quan sát được trong kỳ, gồm thời gian giữ cổng trước khi bắt đầu; các yêu cầu còn chờ chưa có tổng thời gian chờ cuối cùng.
- **Sạc trễ mốc cần xe:** yêu cầu thuộc kỳ khảo sát có hạn cần xe trong kỳ nhưng chưa đạt mục tiêu đúng hạn; không tính lịch sử đã kết thúc từ trước hoặc yêu cầu chủ động dừng.
- **Có cải thiện:** lượt thuê được phục vụ tăng và số yêu cầu sạc trễ không tăng. Các chỉ số khác vẫn phải đọc riêng; có cảnh báo nếu tắc nghẽn chỗ trả tăng.

Khuyến nghị ở kịch bản sạc có thể là giữ phân bổ theo ưu tiên và cảnh báo không đủ khả năng đáp ứng. Engine không tự tạo thêm cổng, công suất hoặc lợi ích sửa chữa chưa được mô phỏng.

## Ví dụ trình bày

Chọn nhu cầu tăng tại Metro, 60 phút, hệ số 2, seed 42. Đọc số lượt chưa phục vụ và số lượt phục vụ trước/sau; chỉ vào nguồn, đích, số xe và phút đến của lệnh. Mở diễn biến để thấy xe/chỗ giữ thay đổi theo thời gian. Kết quả phụ thuộc snapshot tại lúc bấm chạy nên có thể khác sau khi đã thuê, sạc hoặc điều phối thật.
