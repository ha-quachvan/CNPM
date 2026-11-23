# Đối chiếu thiết kế và mã nguồn

Submission 3 là bản thiết kế chính thức. Bảng này giúp nhóm lần từ sơ đồ lớp và mã M01–M45 đến phần cài đặt.

## 30 lớp trong mô hình

| Nhóm              | Số lớp | Tên lớp và vị trí                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------- | -----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dữ liệu           |     17 | `User`, `Session`, `Hub`, `Vehicle`, `ParkingSpace`, `ChargingPort`, `Reservation`, `VehicleReservation`, `ParkingReservation`, `ChargingReservation`, `Rental`, `ChargingSession`, `Incident`, `DispatchOrder`, `Scenario`, `SimulationResult`, `NetworkSnapshot` — [entities.ts](../src/models/entities.ts)                                                                                                                            |
| Nghiệp vụ         |      8 | [AccountService](../src/services/AccountService.ts), [HubService](../src/services/HubService.ts), [ReservationService](../src/services/ReservationService.ts), [RentalService](../src/services/RentalService.ts), [ChargingService](../src/services/ChargingService.ts), [IncidentService](../src/services/IncidentService.ts), [DispatchService](../src/services/DispatchService.ts), [WhatIfService](../src/services/WhatIfService.ts) |
| Hạ tầng / giả lập |      5 | [InMemoryRepository](../src/repositories/InMemoryRepository.ts), [DeviceSimulator](../src/simulation/DeviceSimulator.ts), [WhatIfEngine](../src/simulation/WhatIfEngine.ts), [BackgroundJobs](../src/jobs/BackgroundJobs.ts), [DemoAuthProvider](../src/simulation/DemoAuthProvider.ts)                                                                                                                                                  |

Các Entity giữ dữ liệu, có constructor để thuận tiện tạo đối tượng. Enum và DTO nằm trong [enums.ts](../src/models/enums.ts) và [types.ts](../src/models/types.ts). `DomainError` là lỗi kỹ thuật; constructor, hàm tiện ích và adapter demo không làm thay đổi danh mục phương thức nghiệp vụ được truy vết.

## 45 phương thức

| Mã  | Lớp.phương thức                       | API / nơi sử dụng                            |
| --- | ------------------------------------- | -------------------------------------------- |
| M01 | `AccountService.register`             | `POST /auth/register`                        |
| M02 | `AccountService.login`                | `POST /auth/login`                           |
| M03 | `AccountService.logout`               | `POST /auth/logout`                          |
| M04 | `AccountService.getProfile`           | `GET /me`                                    |
| M05 | `AccountService.updateProfile`        | `PATCH /me`                                  |
| M06 | `AccountService.requestPasswordReset` | `POST /auth/password-reset/request`          |
| M07 | `AccountService.resetPassword`        | `POST /auth/password-reset`                  |
| M08 | `AccountService.loginWithProvider`    | `POST /auth/provider`                        |
| M09 | `HubService.search`                   | `GET /hubs`                                  |
| M10 | `HubService.getDetail`                | `GET /hubs/:id`                              |
| M11 | `HubService.getNetworkStatus`         | `GET /network`                               |
| M12 | `ReservationService.reserveVehicle`   | `POST /reservations/vehicle`                 |
| M13 | `ReservationService.reserveParking`   | `POST /reservations/parking`                 |
| M14 | `ReservationService.cancel`           | `DELETE /reservations/:id`                   |
| M15 | `ReservationService.extend`           | `POST /reservations/:id/extend`              |
| M16 | `ReservationService.changeResource`   | `POST /reservations/:id/resource`            |
| M17 | `ReservationService.confirmParking`   | `POST /reservations/:id/confirm-parking`     |
| M18 | `ReservationService.expire`           | `BackgroundJobs.tick`                        |
| M19 | `RentalService.pickup`                | `POST /rentals/pickup`                       |
| M20 | `RentalService.returnVehicle`         | `POST /rentals/:id/return`                   |
| M21 | `ChargingService.request`             | `POST /charging/requests`                    |
| M22 | `ChargingService.start`               | `POST /charging/:id/start`                   |
| M23 | `ChargingService.schedule`            | `BackgroundJobs.tick`                        |
| M24 | `ChargingService.advance`             | `BackgroundJobs.tick`                        |
| M25 | `IncidentService.report`              | `POST /incidents`                            |
| M26 | `IncidentService.list`                | `GET /incidents`                             |
| M27 | `IncidentService.accept`              | `POST /incidents/:id/accept`                 |
| M28 | `IncidentService.resolve`             | `POST /incidents/:id/resolve`                |
| M29 | `DispatchService.create`              | `POST /dispatch`                             |
| M30 | `DispatchService.list`                | `GET /dispatch`                              |
| M31 | `DispatchService.getDetail`           | `GET /dispatch/:id`                          |
| M32 | `DispatchService.update`              | `PATCH /dispatch/:id`                        |
| M33 | `DispatchService.cancel`              | `DELETE /dispatch/:id`                       |
| M34 | `DispatchService.accept`              | `POST /dispatch/:id/accept`                  |
| M35 | `DispatchService.complete`            | `POST /dispatch/:id/complete`                |
| M36 | `WhatIfService.run`                   | `POST /what-if`                              |
| M37 | `InMemoryRepository.get<T>`           | `Đọc theo mã từ Service/middleware`          |
| M38 | `InMemoryRepository.list<T>`          | `Đọc danh sách từ Service`                   |
| M39 | `InMemoryRepository.transact<T>`      | `Cập nhật nhất quán từ Service`              |
| M40 | `InMemoryRepository.snapshot`         | `WhatIfService.run`                          |
| M41 | `DeviceSimulator.readTelemetry`       | `RentalService / DispatchService`            |
| M42 | `DeviceSimulator.execute`             | `RentalService / IncidentService`            |
| M43 | `WhatIfEngine.simulate`               | `WhatIfService.run`                          |
| M44 | `BackgroundJobs.tick`                 | `server.ts mỗi giây; công cụ tiến thời gian` |
| M45 | `DemoAuthProvider.verify`             | `AccountService.loginWithProvider`           |

## Liên hệ use-case và giao diện

| UC       | Giao diện / luồng                                                  |
| -------- | ------------------------------------------------------------------ |
| UC-01–02 | Đăng nhập, đăng xuất, đăng ký, khôi phục mật khẩu và provider demo |
| UC-03    | Hồ sơ cá nhân: xem/cập nhật fullName, email, phone                 |
| UC-04–05 | Tìm Hub, lọc theo loại xe/pin/tài nguyên, xem chi tiết             |
| UC-06–07 | Giữ/đổi/hủy xe; nhập mã để nhận xe                                 |
| UC-08    | Trả xe, xác minh vị trí và phí/phạt                                |
| UC-09    | Đặt chỗ cho xe cá nhân, đổi/gia hạn/hủy, xác nhận đỗ               |
| UC-10    | Yêu cầu sạc, chờ phân bổ, bắt đầu, cập nhật tiến trình             |
| UC-11    | Gửi/xem báo cáo sự cố                                              |
| UC-12–13 | Tổng quan mạng lưới và tra cứu Hub của Operator                    |
| UC-14–16 | Tạo, xem, sửa và hủy lệnh điều phối                                |
| UC-17    | Năm kịch bản What-if, chỉ số và khuyến nghị                        |
| UC-18    | Technician nhận/xử lý sự cố                                        |
| UC-19    | Technician nhận, vận chuyển và bàn giao xe                         |

## Tổ chức và kiểm tra

- API Layer dùng module hàm Express trong `routes/`, `controllers/` và `middleware/`.
- `system.ts` tạo đúng một repository dùng chung cho mỗi instance backend và truyền vào các Service. Reset demo tạo lại instance này.
- `tests/domain.test.ts` kiểm tra các quy tắc/trạng thái và hoàn tác. `tests/api.test.ts` kiểm tra HTTP, phân quyền và JSON. `tests/browser.mjs` kiểm tra các thao tác qua giao diện ba vai trò, responsive và lỗi JavaScript.
- Mẫu giao diện tham khảo: [shadcn/ui dashboard](https://ui.shadcn.com/examples/dashboard). Cài đặt dùng HTML/CSS/JavaScript thuần theo phạm vi đã thống nhất, với thiết kế mới cho nhóm.

## Bổ sung khi hoàn thiện MVP

Tài liệu Submission 3 gốc được giữ nguyên theo yêu cầu của nhóm. Danh mục M01–M45 ở trên là mã đối chiếu của thiết kế gốc. MVP bổ sung hành vi sau; không coi mã triển khai vẫn chỉ có đúng 45 phương thức:

| Phần bổ sung                           | Nơi triển khai                       | Mục đích                                                                           |
| -------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| `ReservationService.changeDestination` | `POST /reservations/:id/destination` | Giữ chỗ đích mới trước khi giải phóng chỗ cũ; cập nhật chuyến đang chạy            |
| `ReservationService.checkoutParking`   | `POST /vehicles/:id/checkout`        | Kết thúc lượt gửi và giải phóng chỗ cá nhân                                        |
| `ChargingService.stop`                 | `POST /charging/:id/stop`            | Ngừng cấp điện, còn chờ ngắt kết nối                                               |
| `ChargingService.disconnect`           | `POST /charging/:id/disconnect`      | Giải phóng đầu nối sau khi ngừng sạc                                               |
| Thuộc tính đích trả                    | VehicleReservation, Rental           | `plannedReturnHubId`, `plannedReturnSpaceId`; phân biệt nơi đăng ký và nơi thực tế |
| Dữ liệu lượt gửi/thông báo             | `types.ts`, NetworkState             | ParkingVisit, Notification, returnSpaceHolds; không kết nối DB                     |
| Cơ chế phân bổ dùng chung              | `shared/scheduling.ts`               | Ưu tiên và công thức pin được dùng bởi nghiệp vụ vận hành và What-if               |
| Mô hình What-if theo thời gian         | `WhatIfEngine`, `data/demand.ts`     | Phân tích tác động, tìm kiếm lệnh một bước và thử riêng trên bản sao đã lưu        |

`reserveVehicle` bổ sung đầu vào Hub trả; sạc luôn qua hàng đợi, trạng thái AWAITING_DISCONNECT/CONNECTED phân biệt ngừng điện và rảnh cổng. Các thay đổi được giải thích trong README, API và hướng dẫn demo; không sửa PDF/LaTeX Submission 3.

## What-if hai bước và bản đồ Hub

Giao diện What-if trình bày tác động trước, nút thử đề xuất sau. `WhatIfService.trial` và `WhatIfEngine.evaluate` là phương thức bổ sung để đánh giá riêng một lệnh điều chuyển trên bản sao đã lưu. Các phương thức M36/M37 hiện có vẫn giữ đầu vào phân tích tình huống; đối chiếu 30 lớp và 45 phương thức gốc không thay đổi tài liệu Submission 3.

`HubSummaryDTO.travelMinutesTo` dùng chung `travelMinutes` với mô phỏng. `public/js/hub-map.js` bố trí sơ đồ bằng tọa độ mẫu, dùng nút HTML để chọn bằng chuột hoặc bàn phím, lọc cùng danh sách và mở chi tiết Hub hiện có. Không thêm bản đồ ngoài, cơ sở dữ liệu hoặc phần cứng.
