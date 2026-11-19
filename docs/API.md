# API và quy ước triển khai

Mọi đường dẫn dưới đây có tiền tố `/api`. JSON được dùng cho yêu cầu và phản hồi. Express phục vụ giao diện và API cùng origin.

## Phiên đăng nhập và lỗi

`POST /auth/login` nhận `{identifier, password}`. Thành công trả `SessionDTO` và đặt cookie `hub_session` có `HttpOnly`, `SameSite=Strict`. Trình duyệt gửi cookie cho các API tiếp theo. Có thể dùng `Authorization: Bearer <token>` khi kiểm tra bằng HTTP client.

Backend lấy người thao tác từ Session, không tin `userId`, `operatorId`, `technicianId` do client tự khai báo để thay đổi danh tính. Vai trò và quyền sở hữu/phân công được kiểm tra trong Service.

Lỗi có dạng:

```json
{ "error": { "code": "ResourceConflict", "message": "Xe không còn khả dụng.", "details": {} } }
```

- `400`: đầu vào không hợp lệ.
- `401`: thông tin đăng nhập hoặc Session không hợp lệ.
- `403`: sai vai trò/quyền sở hữu/phân công/nguồn yêu cầu.
- `404`: không tìm thấy dữ liệu/API.
- `409`: xung đột tài nguyên hoặc trạng thái.
- `408`: What-if quá thời gian.
- `413`: JSON vượt giới hạn 32 KiB.

`Map` trong kết quả What-if được chuyển thành object JSON. Thông tin mật khẩu băm không nằm trong DTO trả cho UI.

## Tài khoản

| Method | URL                            | Nội dung                                                     |
| ------ | ------------------------------ | ------------------------------------------------------------ |
| GET    | `/health`                      | Kiểm tra ứng dụng đang chạy                                  |
| GET    | `/auth/demo-accounts`          | Tài khoản và mật khẩu mẫu của môi trường demo                |
| POST   | `/auth/register`               | `RegisterDTO`: họ tên, email hoặc SĐT, mật khẩu, xác nhận    |
| POST   | `/auth/login`                  | `{identifier,password}`                                      |
| POST   | `/auth/provider`               | `{token}`: `google-demo-customer` hoặc `clerk-demo-customer` |
| POST   | `/auth/logout`                 | Thu hồi Session; gọi lặp không có tác động phụ               |
| POST   | `/auth/password-reset/request` | `{identifier}` → mã thử nghiệm có thời hạn                   |
| POST   | `/auth/password-reset`         | `{challengeId,code,newPassword,confirmPassword}`             |
| GET    | `/me`                          | Hồ sơ của chủ Session                                        |
| PATCH  | `/me`                          | Cập nhật `fullName`, `email`, `phone` theo Submission 3      |

## Tra cứu và dữ liệu giao diện

| Method | URL          | Nội dung                                                                                                                       |
| ------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/workspace` | Dữ liệu theo vai trò để render trang; tài nguyên, đặt chỗ/phiên/lệnh/sự cố phù hợp quyền; thời gian backend và chính sách demo |
| GET    | `/hubs`      | Lọc `area`, `vehicleType`, `minBattery`, `needsParking`, `needsCharging`, `routeHubIds` phân tách dấu phẩy                     |
| GET    | `/hubs/:id`  | Chi tiết xe dùng chung, chỗ đỗ và cổng sạc của một Hub                                                                         |
| GET    | `/network`   | Thông tin tổng hợp mạng, chỉ Operator                                                                                          |

Giao diện cập nhật dữ liệu mỗi 10 giây khi trang đang hiển thị và không mở hộp thao tác; có nút làm mới thủ công. Bộ đếm giữ chỗ cập nhật mỗi giây; backend là nguồn quyết định bản đặt còn hiệu lực.

## Customer: đặt chỗ, thuê và sạc

| Method | URL                                 | JSON                                                  |
| ------ | ----------------------------------- | ----------------------------------------------------- |
| POST   | `/reservations/vehicle`             | `{vehicleId}`                                         |
| POST   | `/reservations/parking`             | `{vehicleId,hubId,spaceId}`                           |
| DELETE | `/reservations/:id`                 | Hủy bản đặt còn được phép hủy                         |
| POST   | `/reservations/:id/extend`          | `{extraMinutes}`                                      |
| POST   | `/reservations/:id/resource`        | `{newResourceId}`                                     |
| POST   | `/reservations/:id/confirm-parking` | `{}`                                                  |
| POST   | `/rentals/pickup`                   | `{reservationId,code}`                                |
| POST   | `/rentals/:id/return`               | `{hubId,spaceId}`                                     |
| POST   | `/charging/requests`                | `{vehicleId,hubId,portId?,targetBattery,requiredBy?}` |
| POST   | `/charging/:reservationId/start`    | `{}`                                                  |

`schedule`, `advance`, `expire` được BackgroundJobs gọi trong backend, không cho client tự truyền thời gian để thay đổi nghiệp vụ. Những thao tác mô phỏng thời gian dành riêng cho Operator nằm ở nhóm `/demo`.

## Sự cố

| Method | URL                      | JSON/quyền                                                                   |
| ------ | ------------------------ | ---------------------------------------------------------------------------- |
| GET    | `/incidents`             | Bộ lọc `status`, `hubId`, `technicianId`; Customer chỉ thấy báo cáo của mình |
| POST   | `/incidents`             | `{target:{kind,id},description}`; kind là VEHICLE hoặc CHARGING_PORT         |
| POST   | `/incidents/:id/accept`  | `{}`; Technician, chỉ nhận khi OPEN                                          |
| POST   | `/incidents/:id/resolve` | `{notes}`; đúng Technician đã nhận                                           |

Đóng sự cố không xóa bỏ phiên thuê/sạc hoặc lệnh đang chiếm dụng tài nguyên. Trạng thái được khôi phục dựa trên các quan hệ hiện hành.

## Điều phối

| Method | URL                      | JSON/quyền                                                                                                             |
| ------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| GET    | `/dispatch`              | Operator xem lịch sử; Technician xem lệnh chờ hoặc liên quan mình; lọc `hubId`, `status`, `technicianId`, `from`, `to` |
| GET    | `/dispatch/:id`          | Chi tiết trong phạm vi quyền                                                                                           |
| POST   | `/dispatch`              | `{fromHubId,toHubId,quantity}`; Operator                                                                               |
| PATCH  | `/dispatch/:id`          | Cùng DTO, chỉ lệnh PENDING; Operator                                                                                   |
| DELETE | `/dispatch/:id`          | Chỉ lệnh PENDING; Operator                                                                                             |
| POST   | `/dispatch/:id/accept`   | `{}`; Technician                                                                                                       |
| POST   | `/dispatch/:id/complete` | `{}`; đúng Technician đã nhận                                                                                          |

`quantity` là số nguyên dương. Tạo/sửa lệnh giữ đủ xe và chỗ nhận trong cùng `transact`. Nhận lệnh giải phóng chỗ nguồn; chỗ đích vẫn do lệnh giữ. Hoàn tất cần vị trí mô phỏng đúng Hub đích và toàn bộ chỗ nhận hợp lệ. Gửi lặp hoàn tất bởi đúng người nhận không cộng tồn hai lần.

## What-if

`POST /what-if`, chỉ Operator, nhận:

```json
{
  "type": "DEMAND_SURGE",
  "targetHubId": "hub-a",
  "parameters": { "multiplier": 2 },
  "horizonMinutes": 60,
  "seed": 42
}
```

| Kịch bản          | Tham số                               |
| ----------------- | ------------------------------------- |
| DEMAND_SURGE      | `multiplier`: 1–10                    |
| HUB_FULL          | `additionalVehicles`: số nguyên 0–100 |
| CHARGING_SURGE    | `multiplier`: 1–10                    |
| PORT_FAILURE      | `failedPorts`: số nguyên 0–100        |
| VEHICLE_IMBALANCE | `vehicleLoss`: số nguyên 0–100        |

Engine là mô hình quy tắc có biến động giả lập theo PRNG seed. Mỗi phút dự báo đóng góp nhu cầu xe/sạc; các kịch bản thay đổi hệ số nhu cầu hoặc số nguồn lực được khảo sát. Các chỉ số giúp trình diễn luồng phân tích, không phải mô hình AI đã huấn luyện. Snapshot độc lập, kết quả không tự áp dụng vào nguồn lực đang vận hành.

## Điều khiển mô phỏng

| Method | URL               | Quyền và tác động                                                                                                                               |
| ------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/demo/telemetry` | `{vehicleId,hubId,batteryLevel?}`; Operator, chủ xe cá nhân, khách có Rental ACTIVE hoặc Technician đang vận chuyển đúng xe trong lệnh của mình |
| POST   | `/demo/command`   | `{target:{kind,id},command,success}`; chỉ Operator; command: LOCK/UNLOCK/CHECK                                                                  |
| POST   | `/demo/advance`   | `{seconds}` từ 1–3600; chỉ Operator; tiến đồng hồ demo và chạy một lượt Jobs                                                                    |
| POST   | `/demo/reset`     | `{}`; chỉ Operator; tạo lại toàn bộ System và thu hồi các Session                                                                               |

Các API mô phỏng tồn tại để thay thế vị trí/cảm biến/phản hồi vật lý trong buổi demo; không gọi thiết bị hoặc dịch vụ bên ngoài.

## Quy ước trạng thái khi triển khai

- Giữ xe: `VehicleReservation HELD`, `Vehicle RESERVED`, chỗ đang chứa xe vẫn `OCCUPIED`.
- Nhận xe thành công: `Rental ACTIVE`, bản đặt `CONFIRMED`, xe `IN_USE`, giải phóng chỗ nguồn. Mở khóa thất bại không lưu các thay đổi này.
- Trả xe đã xác minh: hoàn tất Rental/bản đặt, lưu phí/phạt, đưa xe vào đúng chỗ nhận. Nếu vị trí/chỗ đỗ chưa xác nhận, trả `ParkingConflict` với `details.returnConfirmed=false`, phí/phạt dự tính và tiếp tục phiên thuê; không cộng tồn Hub chưa xác nhận. UI hiển thị kết quả và yêu cầu xử lý tiếp.
- Yêu cầu sạc tự phân bổ: `WAITING` chưa có cổng; khi cấp cổng chuyển `HELD` và bắt đầu hạn giữ 15 phút.
- Bắt đầu sạc: bản đặt `CONFIRMED`, phiên `ACTIVE`, xe/cổng `CHARGING`. Khi đạt mục tiêu: phiên và bản đặt `COMPLETED`, khôi phục xe/cổng theo ràng buộc hiện hành.
- `advance` trả số phiên được cập nhật pin trong lượt gọi. `updatedAt` được cập nhật cả khi tạm dừng vì sự cố để không cộng bù thời gian lỗi.
- `requiredBy` không có được xếp sau các yêu cầu có hạn cần xe; sau đó xét pin thấp và thời điểm tạo.
- Công suất Hub tính cả các cổng đang giữ và các phiên đang hoạt động. Một giữ chỗ liên quan cổng lỗi vẫn giữ cam kết cho đến khi được giải phóng/hết hạn.
- Repository trả bản sao; `transact` chạy callback đồng bộ trên draft, commit khi thành công và bỏ draft khi lỗi. Snapshot tách sâu Map, mảng và object.
- Các bộ giả lập không tự ghi thay đổi nghiệp vụ vào Repository. Đặt vị trí mô phỏng là thay đổi quan sát; Service tiếp tục xác minh trước khi cập nhật trạng thái.
