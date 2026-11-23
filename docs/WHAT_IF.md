# What-if: kiểm tra tài nguyên tại một thời điểm

What-if trả lời câu hỏi: **Với tài nguyên hiện có và một nhu cầu giả định rõ ràng, hệ thống đáp ứng được bao nhiêu và có thể phân bổ lại thế nào?**

Không tạo lịch thuê giả, không sinh Hub trả, không chạy theo bước thời gian. Các số như “48 lượt bình thường”, “61 lượt trong 60 phút”, seed, thời gian chờ hoặc dự báo sạc trễ đã được bỏ. Bản đồ Hub vẫn có thời gian tham khảo riêng, không dùng để tính What-if.

## Cơ sở số liệu đầu vào

Dữ liệu lấy từ bản sao RAM tại lúc bấm **Tính phương án**:

- Các Hub đang hoạt động, xe dùng chung đủ pin và thực sự còn rảnh.
- Chỗ trống chưa có người giữ, kể cả các cam kết trả xe và điều phối.
- Cổng sạc, sự cố, xe đang cắm, phiên sạc, yêu cầu đang chờ và hạn cần xe.
- Giả định do Operator nhập: số xe cần có, số chỗ muốn giải phóng, mức xe tối thiểu hoặc số yêu cầu sạc mới.

Không dùng số xe rảnh để tự suy ra nhu cầu. Mặc định giữ **3 xe rảnh tại mỗi Hub nguồn** là chính sách demo, không phải kết quả dự báo. Mỗi xe chỉ phục vụ một yêu cầu trong đợt cấp xe giả định.

## Năm tình huống

| Tình huống trên UI         | Đầu vào                                                          | Kết quả chính                                             | Phương án                                                          |
| -------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| Nhu cầu cấp xe tại Hub     | Hub và số xe cần có; hoặc nhu cầu nền × hệ số do người dùng nhập | Hiện có, cần có, thiếu và chỗ nhận                        | Lấy từ nguồn có nhiều xe có thể cho đi nhất                        |
| Giải phóng chỗ đỗ          | Hub và số chỗ trống muốn đạt                                     | Chỗ trống, còn thiếu, xe chung có thể chuyển              | Chuyển xe rảnh sang Hub có nhiều chỗ nhận nhất                     |
| Cân bằng xe toàn mạng lưới | Mức xe tối thiểu tại mỗi Hub                                     | Hub dưới mức, tổng thiếu và tổng xe khả dụng              | Bổ sung Hub ít xe trước, lấy từ nguồn dư nhiều nhất                |
| Thêm yêu cầu sạc           | Hub và số yêu cầu giả định thêm                                  | Tổng yêu cầu chờ, cấp ngay được, còn phải chờ             | Cấp cổng; thử khôi phục cổng lỗi hoặc rút dây phiên đã dừng nếu có |
| Cổng sạc lỗi               | Hub và mã một cổng cụ thể                                        | Cổng còn dùng được, phiên/giữ cổng bị ảnh hưởng, hàng chờ | Thử khôi phục cổng đã chọn; cấp các cổng thực sự trống             |

## 1. Nhu cầu cấp xe và thuật toán điều phối

Gọi `R` là số xe cần có, `F` là số xe dùng chung khả dụng của Hub đích:

```text
Thiếu = max(0, R − F)
Nguồn có thể cho đi = max(0, xe rảnh tại nguồn − 3)
Số chuyển = min(thiếu còn lại, nguồn có thể cho đi, chỗ nhận còn trống, 50)
```

Giới hạn 50 là số xe tối đa của một lệnh điều phối. Nếu cần, phương án có thể gồm nhiều lệnh; không dùng một xe hoặc chỗ hai lần.

Thuật toán tham lam:

1. Đếm nguồn lực hợp lệ của toàn mạng lưới, loại Hub tạm ngừng.
2. Chọn nguồn có nhiều xe có thể cho đi nhất; nếu bằng nhau, dùng thứ tự mã Hub để kết quả ổn định.
3. Tính số chuyển theo các giới hạn trên và cập nhật bản sao kế hoạch.
4. Tiếp tục với phần thiếu còn lại đến khi đủ hoặc hết nguồn/chỗ nhận.
5. Hiển thị từng nguồn–đích–số xe. **Thử phương án** cho biết trạng thái sau khi đã bàn giao, trước khi cấp xe cho khách.

Không chọn xe cá nhân, xe đã đặt/đang thuê/đang điều phối/đang sạc/chờ sạc, xe lỗi hoặc pin dưới 20%. Chỗ đã giữ cho khách trả xe hoặc cho lệnh điều phối không được dùng lại. Không giả định khách trả xe tại Hub nào vì bước này chỉ đánh giá nguồn lực trước khi cấp xe.

### Ví dụ kiểm tra được trên dữ liệu mới khởi động

Chọn Metro, nhập cần **8 xe**:

- Metro có **4 xe** khả dụng, nên thiếu `8 − 4 = 4` xe; còn **14 chỗ nhận**.
- KTX A có **12 xe** khả dụng, có thể cho đi `12 − 3 = 9` xe, nhiều nhất trong các nguồn.
- Đề xuất KTX A → Metro: `min(4, 9, 14, 50) = 4` xe.
- Sau thử: KTX A còn **8 xe**, Metro có **8 xe**, thiếu **0**, Metro còn **10 chỗ nhận**.

Nếu chọn nhập theo hệ số: **nhu cầu nền 4 × hệ số 2 = cần 8 xe**. Số nền 4 là giả định người nhập, dù tình cờ bằng lượng xe rảnh Metro ban đầu. Không lấy số xe rảnh làm dự báo lượt thuê.

Nhu cầu không nguyên sau phép nhân được làm tròn lên: nền 3 × 1,5 = 4,5 → cần 5 xe. Nếu nhập cần 100 xe, bản sao chỉ bổ sung được 14 vì Metro chỉ có 14 chỗ nhận: có 18 xe, vẫn thiếu 82. Kết quả không hứa giải quyết được mọi nhu cầu.

Số liệu sẽ thay đổi nếu đã đặt xe, sạc, tạo lệnh hoặc thao tác demo trước đó. Bảng **Cơ sở từ toàn mạng lưới** trong mục **Chi tiết dữ liệu và giả định** là dữ liệu thật của lần tính đó.

## 2. Giải phóng chỗ và cân bằng

**Giải phóng chỗ:** thiếu chỗ = `max(0, số chỗ muốn đạt − chỗ đang trống)`. Mỗi xe chung đủ điều kiện chuyển ra giải phóng một chỗ. Chọn Hub nhận có nhiều chỗ trống nhất, giữ dự phòng 3 xe tại nguồn. Không di dời xe cá nhân để làm đẹp kết quả.

Ví dụ KTX A ban đầu trống 3 chỗ, muốn trống 6: cần giải phóng 3; chuyển 3 xe hợp lệ đến nơi còn chỗ. Nếu không đủ xe có thể chuyển hoặc không còn nơi nhận, vẫn báo số chỗ còn thiếu.

**Cân bằng:** thiếu từng Hub = `max(0, mức tối thiểu − xe rảnh tại Hub)`. Tổng thiếu là tổng các Hub đang hoạt động. Ưu tiên Hub ít xe trước. Nguồn phải giữ `max(3, mức tối thiểu)` xe, tránh vừa bổ sung nơi này lại tạo thiếu ở nơi khác. Tổng xe toàn mạng lưới không đổi.

Với dữ liệu ban đầu, mức tối thiểu 6: Metro có 4 nên thiếu 2, các Hub khác đã đủ. Chuyển 2 xe từ KTX A đáp ứng mức này. Đây là cân bằng theo chính sách tồn xe, không phải tối ưu tuyến đường hoặc dự báo nhu cầu.

## 3. Thêm yêu cầu sạc

Số yêu cầu mới là giả định Operator nhập. Engine chọn đúng số **xe có thật, đang đỗ tại Hub, chưa có yêu cầu/phiên khác, không lỗi và pin dưới mục tiêu 80%**, ưu tiên xe pin thấp. Số vượt lượng xe hợp lệ bị từ chối; không tạo thêm xe tưởng tượng. Yêu cầu giả định mới chỉ tồn tại trong bản sao, không có hạn cần xe tự bịa.

```text
Tổng cần xét = yêu cầu đang chờ tại Hub + yêu cầu giả định mới
Có thể cấp ngay = số cặp yêu cầu–cổng trống hợp lệ ghép được
Còn phải chờ = tổng cần xét − có thể cấp ngay
```

Ghép theo quy tắc vận hành hiện có:

1. Hạn cần xe sớm hơn; yêu cầu không có hạn đứng sau yêu cầu có hạn.
2. Nếu cùng hạn, pin thấp hơn trước.
3. Nếu cùng pin, yêu cầu được tạo trước trước.
4. Chỉ dùng cổng khỏe, trống, đúng Hub; nếu yêu cầu chọn cổng cụ thể thì phải chờ đúng cổng đó. Một cổng chỉ cấp một xe.

Không tính thời gian sạc hoặc tốc độ tăng pin ở What-if. Nghiệp vụ sạc thật vẫn cập nhật pin bình thường; thay đổi này chỉ bỏ dự báo theo thời gian trong phần phân tích.

### Đề xuất và cách đọc kết quả thử

- **Cấp cổng theo thứ tự ưu tiên:** chỉ xuất hiện khi có cặp ghép được; nêu rõ xe và cổng.
- **Giả định khôi phục cổng lỗi:** kỹ thuật viên cần sửa thật. Bản sao kiểm tra cổng đó đang trống, đang giữ hay đang có xe cắm rồi tính lại.
- **Giả định rút dây:** chỉ với phiên đã dừng, đang chờ ngắt kết nối; cần chủ xe hoặc kỹ thuật viên đội xe thực hiện. Không cắt ngang phiên đang sạc để lấy cổng.
- Không có nguồn lực phù hợp thì giữ hàng chờ; thay đổi thứ tự không tạo thêm cổng. Không tự chuyển xe cá nhân sang Hub khác.

**Phân biệt hai bảng:** bảng đánh giá ban đầu cho biết _khả năng cấp ngay_. Nút thử mới giả định biến yêu cầu WAITING thành HELD trên bản sao. Bảng trước/sau vì vậy so sánh **số còn trong hàng chờ** và **số đã được giữ cổng theo phương án**, không đếm lại cổng đã giữ như cổng trống.

Ví dụ KTX A mới khởi động có 2 yêu cầu chờ, 3 cổng bận và c4 lỗi đang trống. Giả định thêm 2 yêu cầu hợp lệ:

- Tổng cần xét `2 + 2 = 4`; cấp ngay 0; còn chờ 4.
- Thử khôi phục c4: giữ c4 cho một yêu cầu, còn chờ 3, số được giữ thêm 1.
- Yêu cầu đang chờ `charge-seed-wait-2` được chọn trước vì có hạn cần xe sớm. Cổng không được coi là trống sau khi đã giữ.

## 4. Cổng sạc lỗi

Phải chọn một mã cổng, không nhập chung “lỗi 1 cổng” rồi để hệ thống tự chọn. Chỉ các phiên đang sạc tại cổng đó mới tính vào **phiên đang sạc bị ảnh hưởng**; giữ cổng chưa bắt đầu được thống kê riêng. Phiên đã dừng nhưng còn cắm được ghi rõ, không tính thành phiên đang sạc mới bị gián đoạn.

Tại KTX A ban đầu:

- Chọn **hub-a-c1** đang sạc xe của customer3: cổng dùng được từ 3 còn 2, một phiên bị ảnh hưởng. Thử khôi phục: dùng được lại 3, phiên đó được khôi phục, nhưng c1 vẫn bận; **không cấp thêm xe chờ**.
- Chọn **hub-a-c4** vốn đã lỗi và đang trống: hệ thống ghi nhận trạng thái lỗi hiện có, không trừ hai lần. Thử khôi phục: cổng dùng được từ 3 lên 4; c4 có thể giữ cho một xe chờ.
- Cổng lỗi đang HELD sau khôi phục vẫn HELD cho xe cũ. Cổng có xe đã dừng, chưa rút dây sau khôi phục vẫn CONNECTED. Sự cố riêng của xe chưa giải quyết thì sửa cổng không tự chữa lỗi xe.

## Giới hạn và tính an toàn của bản sao

- Đây là thuật toán quy tắc + tham lam + ghép hàng chờ, không có học máy hoặc bảo đảm tối ưu toàn cục. Mục đích là giải thích được từng phép tính trong demo 8 phút.
- Không dự đoán lượt thuê thành công, điểm đến, quãng đường, thời gian chờ, thời điểm xe tới hoặc sạc xong. Tồn xe sau điều phối là trạng thái khi đã hoàn tất bàn giao theo giả định.
- Phân tích và thử không ghi repository thật, không tạo lệnh/phiên/thông báo, không đóng sự cố thật. Các nguồn lực đang cam kết được bảo toàn.
- Server lưu bản sao và phương án của đúng Operator trong RAM tối đa 10 phút theo đồng hồ demo, giữ tối đa 20 phân tích. Đây là thời hạn lưu kết quả, không phải khoảng dự báo. Hết hạn/reset/khởi động lại cần tính mới.
- Lần thử dùng cùng bản sao và cùng nhu cầu ban đầu, kể cả có người đặt xe thật sau đó. Muốn phương án theo trạng thái mới, bấm Tính phương án lại.
- Sửa đầu vào khiến kết quả cũ được đánh dấu chưa cập nhật và khóa nút thử. Chọn hướng xử lý khác sẽ bỏ bảng thử của hướng trước.

Mã chính: `src/simulation/WhatIfEngine.ts`, `src/services/WhatIfService.ts`. Các kiểm tra tĩnh và bảo toàn nguồn lực ở `tests/what-if.test.ts`, cùng kiểm tra HTTP và giao diện.
