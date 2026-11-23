# API và quy tắc MVP

Base: `/api`. JSON object cho POST/PATCH, cookie `hub_session` HttpOnly/SameSite=Strict hoặc Bearer token. Backend lấy actor từ session, không lấy `userId/operatorId` trong body. Dữ liệu trong RAM dùng chung cho một tiến trình.

Mã lỗi chính: 400 dữ liệu sai; 401 hết phiên; 403 sai quyền; 404 ID không tồn tại; 409 xung đột trạng thái/tài nguyên; 413 body quá 32 KiB. Origin khác host bị từ chối. Lỗi không có thay đổi trạng thái nghiệp vụ từ giao dịch bị thất bại.

## Tài khoản và tra cứu

| Method    | Path                           | Dữ liệu / quyền                                                                                                     |
| --------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| GET       | `/health`                      | Trạng thái HTTP                                                                                                     |
| GET       | `/auth/demo-accounts`          | Tài khoản/mật khẩu demo                                                                                             |
| POST      | `/auth/register`               | `{fullName,email?,phone?,password,confirmPassword}`; luôn tạo Customer                                              |
| POST      | `/auth/login`                  | `{identifier,password}`                                                                                             |
| POST      | `/auth/provider`               | `{token}` giả lập Google/Clerk                                                                                      |
| POST      | `/auth/logout`                 | `{}`                                                                                                                |
| POST      | `/auth/password-reset/request` | `{identifier}`; trả mã demo, không gửi email/SMS                                                                    |
| POST      | `/auth/password-reset`         | `{challengeId,code,newPassword,confirmPassword}`                                                                    |
| GET/PATCH | `/me`                          | Xem/sửa fullName, email, phone                                                                                      |
| GET       | `/hubs`                        | `area,vehicleType,minBattery,needsParking,needsCharging,routeHubIds`                                                |
| GET       | `/hubs/:id`                    | Xe, chỗ đỗ, cổng của Hub                                                                                            |
| GET       | `/network`                     | Operator, thống kê toàn mạng                                                                                        |
| GET       | `/workspace`                   | Dữ liệu hiện hành được lọc theo vai trò/sở hữu; có parkingVisits, notifications, công suất và ma trận thời gian Hub |

Workspace không trả passwordHash. Customer chỉ nhận xe cá nhân của mình, bản đặt/phiên thuê/sạc/lượt gửi và thông báo thuộc mình. Operator xem nguồn lực và hàng đợi toàn mạng.

## Đặt và thuê xe

| Method | Path                            | Body / quyền                                                    |
| ------ | ------------------------------- | --------------------------------------------------------------- |
| POST   | `/reservations/vehicle`         | Customer: `{vehicleId,returnHubId}`                             |
| POST   | `/reservations/:id/destination` | Chủ bản đặt/chuyến đang chạy: `{hubId}`                         |
| DELETE | `/reservations/:id`             | Chủ bản đặt WAITING/HELD                                        |
| POST   | `/reservations/:id/resource`    | Chủ bản đặt HELD: `{newResourceId}`; đổi cùng Hub, giữ thời hạn |
| POST   | `/reservations/:id/extend`      | Chủ bản đặt đỗ/sạc còn hiệu lực: `{extraMinutes}`               |
| POST   | `/rentals/pickup`               | `{reservationId,code}`                                          |
| POST   | `/rentals/:id/return`           | `{hubId,spaceId}`                                               |

- `VehicleReservation` và `Rental` có `plannedReturnHubId`, `plannedReturnSpaceId`.
- Giữ xe và chỗ đích trong cùng giao dịch; `returnSpaceHolds` ghi chủ thể giữ. Chỗ đó không được cấp cho gửi xe hoặc điều phối khác.
- Hủy/hết hạn nhận: giải phóng xe và chỗ trả; chỗ nguồn đang chứa xe vẫn OCCUPIED.
- Nhận: kiểm tra mã, khóa, Hub và chỗ trả; bản đặt CONFIRMED, Rental ACTIVE, xe IN_USE, giải phóng chỗ nguồn. Cam kết chỗ đích tiếp tục tồn tại.
- Đổi đích: giữ chỗ mới trước, giải phóng chỗ cũ sau; cập nhật cả bản đặt và Rental. Thất bại giữ nguyên cam kết cũ.
- Trả: xác minh vị trí quan sát, Hub hoạt động và chỗ đỗ FREE hoặc HELD đúng chủ thể. Trả đúng Hub đăng ký không phạt; khác Hub đăng ký tính 30.000 đồng. Phí thuê 1.000 đồng/phút, làm tròn lên và tối thiểu một phút.
- Trả thành công: giải phóng cam kết cũ, ghi chỗ thực tế OCCUPIED và kết thúc Rental/bản đặt. Trả lặp bởi đúng chủ thể không cộng tồn lần nữa.

## Xe cá nhân

| Method | Path                                | Body                                  |
| ------ | ----------------------------------- | ------------------------------------- |
| POST   | `/reservations/parking`             | Customer: `{vehicleId,hubId,spaceId}` |
| POST   | `/reservations/:id/confirm-parking` | Chủ bản đặt: `{}`                     |
| POST   | `/vehicles/:id/checkout`            | Chủ xe: `{}`                          |

Xác nhận đỗ tạo ParkingVisit, chỗ OCCUPIED và bản đặt COMPLETED. COMPLETED của bản đặt nghĩa là đã đến đỗ, không phải xe đã rời bãi. Checkout đóng ParkingVisit, giải phóng chỗ và đưa xe ra ngoài Hub. Có yêu cầu đang chờ/giữ hoặc còn kết nối sạc thì phải xử lý trước.

## Sạc

| Method | Path                              | Body / quyền                                                                                     |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------------------ |
| POST   | `/charging/requests`              | Chủ xe cá nhân hoặc Operator cho xe chung: `{vehicleId,hubId,targetBattery,requiredBy?,portId?}` |
| POST   | `/charging/:reservationId/start`  | Customer sở hữu xe cá nhân hoặc Technician cho xe dùng chung: `{}`                               |
| POST   | `/charging/:sessionId/stop`       | Customer sở hữu xe cá nhân hoặc Technician cho xe dùng chung: `{}`                               |
| POST   | `/charging/:sessionId/disconnect` | Customer sở hữu xe cá nhân hoặc Technician cho xe dùng chung: `{}`                               |

`portId` nếu có là cổng ưu tiên, không phải cấp cổng trực tiếp. Mọi yêu cầu đều WAITING. Giao diện mặc định tự động phân bổ để không vượt hàng đợi.

- WAITING → HELD: theo thời điểm cần xe sớm → pin thấp → tạo trước → ID; chỉ cấp cổng trống, không lỗi và đúng cổng ưu tiên nếu có. Cổng đang giữ, đang sạc hoặc còn kết nối chưa thể cấp lại. Không có giới hạn công suất riêng thấp hơn tổng định mức các cổng.
- Operator chỉ đăng ký yêu cầu sạc xe dùng chung, hủy yêu cầu của mình và giám sát toàn mạng lưới; không bắt đầu/dừng/ngắt phiên. Technician thao tác các phiên xe dùng chung, không thao tác xe cá nhân của khách.
- `/workspace`: Operator thấy toàn bộ nhật ký; Technician thấy yêu cầu/phiên sạc xe dùng chung; Customer chỉ thấy của mình. Mỗi yêu cầu có `requesterName` và `queuePosition` nếu đang WAITING; vị trí tính trên toàn bộ hàng chờ tại Hub, kể cả khi người xem chỉ thấy xe của mình.
- Hub trả `chargingTotalKw` là tổng định mức lắp đặt, gồm cổng lỗi; `chargingActiveKw` là tổng định mức các cổng thực sự đang cấp điện trong mô hình; `chargingAvailableKw` là tổng định mức cổng trống có thể cấp tại Hub hoạt động. `chargingBudgetKw` giữ tương thích API và luôn được tính lại bằng `chargingTotalKw`, không dùng làm hạn mức độc lập; `chargingUsedKw` gồm cổng đang giữ và phiên đang hoạt động. Có thêm tổng cổng và số cổng từng trạng thái.
- Không có requiredBy: xếp sau yêu cầu có hạn. requiredBy là độ ưu tiên, không phải bảo đảm hoàn thành đúng hạn.
- HELD có 15 phút để bắt đầu; WAITING có 60 phút hiệu lực. Gia hạn đỗ/sạc tối đa 2 lần, 1–15 phút/lần.
- Bắt đầu: bản đặt CONFIRMED, phiên ACTIVE, xe/cổng CHARGING.
- Đạt mục tiêu hoặc dừng sớm: phiên AWAITING_DISCONNECT, ngừng cấp điện; cổng CONNECTED, xe vẫn chưa được lấy hoặc cấp lại.
- Ngắt: phiên COMPLETED nếu đạt mục tiêu, CANCELLED nếu chủ động dừng; bản đặt COMPLETED, cổng/xe khôi phục theo các quan hệ và sự cố còn tồn tại.
- Cổng/xe lỗi tạm dừng tăng pin. Có thể dừng và ngắt để xử lý; đóng sự cố không xóa phiên/giữ chỗ còn sống.

## Thông báo

`GET /workspace` trả thông báo của actor, mới nhất trước. `POST /notifications/read` với `{id}` đánh dấu một thông báo thuộc mình; `{}` đánh dấu toàn bộ của mình. Các thông báo cấp cổng, đạt mục tiêu, dừng và ngắt được sinh một lần cho mỗi sự kiện. Lưu RAM, không gửi email/SMS/push ngoài ứng dụng.

## Sự cố và điều phối

| Method    | Path                     | Quyền / body                                                                       |
| --------- | ------------------------ | ---------------------------------------------------------------------------------- |
| GET/POST  | `/incidents`             | Lọc `status,hubId,technicianId`; tạo `{target:{kind,id},description}`              |
| POST      | `/incidents/:id/accept`  | Technician; chỉ khi OPEN                                                           |
| POST      | `/incidents/:id/resolve` | Technician đã nhận: `{notes}`, CHECK thành công                                    |
| GET/POST  | `/dispatch`              | Operator tạo `{fromHubId,toHubId,quantity}`; Operator/Technician xem trong phạm vi |
| GET/PATCH | `/dispatch/:id`          | Xem chi tiết; Operator chỉ sửa lệnh PENDING                                        |
| DELETE    | `/dispatch/:id`          | Operator chỉ hủy PENDING                                                           |
| POST      | `/dispatch/:id/accept`   | Technician, bắt đầu IN_TRANSIT                                                     |
| POST      | `/dispatch/:id/complete` | Đúng Technician, xác minh toàn bộ vị trí/chỗ nhận                                  |

Sửa lệnh giữ tài nguyên nguyên tử; thất bại giữ nguyên lệnh cũ. Giữ chỗ trả và giữ chỗ điều phối không được chồng nhau.

## What-if tĩnh

`POST /what-if`, Operator:

```json
{
  "type": "DEMAND_SURGE",
  "targetHubId": "hub-metro",
  "parameters": { "requiredVehicles": 8 }
}
```

| Type              | Parameters                                                                                          | Hub                                      |
| ----------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| DEMAND_SURGE      | `requiredVehicles`: nguyên 1–1000; **hoặc** `baselineDemand`: nguyên 1–1000 và `multiplier`: số 1–3 | Bắt buộc, đang hoạt động                 |
| HUB_FULL          | `requiredFreeSpaces`: nguyên từ 0 đến tổng chỗ của Hub                                              | Bắt buộc, đang hoạt động                 |
| VEHICLE_IMBALANCE | `minimumVehicles`: nguyên 1–1000                                                                    | Bỏ qua `targetHubId`, xét toàn mạng lưới |
| CHARGING_SURGE    | `newRequests`: nguyên 0–1000 và không vượt số xe hợp lệ hiện có                                     | Bắt buộc, đang hoạt động                 |
| PORT_FAILURE      | `portId`: ID cổng cụ thể thuộc Hub được chọn                                                        | Bắt buộc, đang hoạt động                 |

Chỉ nhận ba khóa `type`, `targetHubId`, `parameters`. Các tham số cũ như `horizonMinutes`, `seed`, `failedPorts`, `additionalVehicles` hoặc hệ số không có nhu cầu nền đều bị từ chối với `400`; không dùng ngầm cách tính cũ. Không được nhập lẫn hai cách khai báo nhu cầu xe. Phép nhân nhu cầu được làm tròn lên.

Response gồm:

- `scenarioId`, `generatedAt`, `type`, `targetHubId?`, `targetHubName`, `inputs` (nhãn và giá trị giả định).
- `metrics`: JSON object từ Map, ví dụ `{requiredVehicles:8,availableVehicles:4,shortage:4,freeSpaces:14}`.
- `assessment`: `{summary,metrics,hubs,allocations,waiting,affected,calculations,notes}`. `metrics` là danh sách `{key,label,value,unit,previous?}`; `hubs` chứa nguồn lực thực của toàn mạng lưới. `allocations` là các cặp có thể cấp ngay; `waiting` là phần chưa ghép được sau khi xét các cặp đó.
- `proposals`: danh sách `{id,title,description,actions,assumptions}`; có thể rỗng. Một phương án điều phối có thể gồm nhiều nguồn nếu cần. Sạc có các hướng thay thế để người dùng chọn.
- `recommendations`, `assumptions` giải thích quy tắc và điều kiện thực hiện.

Actions gồm `RELOCATE` (nguồn, đích, số xe, danh sách xe thật), `ALLOCATE` (Hub, yêu cầu, xe, cổng), `RECOVER_PORT` (Hub, cổng), `DISCONNECT` (Hub, phiên đã dừng, xe, cổng). Không còn `timeline`, `comparison` hay số lượt thuê tự sinh. Không tự áp dụng kết quả. Xem [WHAT_IF.md](WHAT_IF.md).

### Thử một phương án đã lưu

`POST /what-if/trial`, Operator:

```json
{
  "scenarioId": "ID nhận từ POST /what-if",
  "proposalId": "ID trong proposals"
}
```

`proposalId` có thể bỏ để thử phương án đầu tiên. Server chỉ chấp nhận phương án thuộc phân tích đã lưu; không dùng actions client gửi thêm. Trả `{scenarioId,proposalId,evaluatedAt,proposal,before,after}`; `before` và `after` có cấu trúc `assessment`, cùng bản sao và cùng nhu cầu.

- Phân tích thuộc đúng Operator, tồn tại tối đa 10 phút tính theo đồng hồ demo; giữ tối đa 20 phân tích trong RAM. Hết hạn, bị thay thế hoặc sau reset/khởi động lại: `404 AnalysisExpired`, cần tính lại. Đây là thời hạn lưu, không phải thời gian dự báo.
- Phân tích không có phương án: `409 NoSimulationProposal`; mã phương án không thuộc phân tích: `400 InvalidSimulationPlan`; sai quyền: `403`; mã sai kiểu hoặc quá dài: `400`.
- Với sạc, `totalWaiting` là số còn ở trạng thái WAITING trước/sau thử, `assignedByPlan` là số được chuyển thành HELD bởi phương án. `canAllocate` chỉ là số có thể cấp ngay từ cổng trống của trạng thái tương ứng; không cộng lại cổng đã HELD. Sửa cổng bận không tạo cổng trống.
- Không cập nhật repository thật, không tạo lệnh, phiên sạc hay đóng sự cố. Thử lại dùng đúng bản sao cũ kể cả mạng lưới đã có đặt chỗ mới. Kết quả sau điều chuyển là khi đã bàn giao, trước khi cấp xe cho khách.

## Dữ liệu bản đồ Hub

Mọi Hub summary/detail trả thêm `travelMinutesTo: {[hubId]: number}`. Thời gian tới chính Hub bằng 0; hai chiều dùng cùng giá trị. Các tuyến cấu hình trong `src/data/hubTravel.ts` dùng 5/10/15 phút, cặp chưa cấu hình mặc định 10 phút. Bản đồ chỉ bố trí vị trí tương đối từ `position.lat/lng`, chưa tính km hoặc đường đi thực tế. Thời gian này chỉ phục vụ tham khảo trên bản đồ, độc lập với What-if tĩnh.

## Điều khiển demo

- `POST /demo/telemetry`: `{vehicleId,hubId,batteryLevel?}`; Operator, chủ xe cá nhân, chủ Rental đang chạy hoặc Technician đang vận chuyển xe đó. Chỉ cập nhật quan sát, không ghi đè nghiệp vụ.
- `POST /demo/command`: điểm kiểm thử backend, Operator, `{target:{kind,id},command,success}`; UNLOCK/LOCK/CHECK. Không có biểu mẫu điều khiển này trên giao diện demo.
- `POST /demo/advance`: Operator, `{seconds}` 1–3600; tiến thời gian toàn buổi demo và chạy Jobs.
- `POST /demo/reset`: Operator; tạo lại System và thu hồi mọi session.

Background Jobs: hết hạn giữ chỗ → cập nhật sạc → lập lịch. What-if chỉ đọc bản sao tại thời điểm phân tích, không chạy đồng hồ mô phỏng. Thao tác nghiệp vụ dùng `transact` đồng bộ trên bản draft, lỗi thì bỏ draft; bảo đảm trong một tiến trình, không phải giao dịch cơ sở dữ liệu phân tán.
