# Smart E-Mobility Hub — Hướng dẫn cài đặt và chạy

Bài tập lớn môn **Công nghệ phần mềm (CO3001)** — Nhóm **Scout Regiment**, lớp **L02**.

Ứng dụng web quản lý thuê xe điện, gửi–lấy xe cá nhân, sạc pin, sự cố và điều phối phương tiện giữa các Hub trong khu đô thị ĐHQG-HCM. Hệ thống có ba vai trò: **Khách hàng**, **Điều hành** và **Kỹ thuật viên**.

Backend sử dụng TypeScript, Node.js và Express; frontend sử dụng HTML, CSS và JavaScript. Dữ liệu mẫu được nạp tự động vào RAM khi khởi động. **Không cần cài cơ sở dữ liệu, kết nối thiết bị vật lý hoặc cấu hình dịch vụ bên ngoài.**

## 1. Yêu cầu môi trường

- **Node.js từ phiên bản 22.9 trở lên**, kèm **npm**.
- Trình duyệt web, chẳng hạn Chrome hoặc Edge.
- Kết nối Internet để tải các thư viện ở bước `npm ci` lần đầu. Sau khi cài đặt, ứng dụng chạy trên máy cá nhân.

Kiểm tra Node.js và npm trong terminal:

```bash
node --version
npm --version
```

## 2. Cài đặt và khởi chạy từ gói mã nguồn

1. **Giải nén** toàn bộ ZIP mã nguồn vào một thư mục.
2. Mở terminal tại **thư mục chứa `package.json`**. Có thể dùng Command Prompt trên Windows hoặc Terminal trên macOS/Linux.
3. Chạy lần lượt:

```bash
npm ci
npm run build
npm start
```

| Lệnh            | Công dụng                                                 |
| --------------- | --------------------------------------------------------- |
| `npm ci`        | Cài đúng các thư viện được ghi trong `package-lock.json`. |
| `npm run build` | Biên dịch mã nguồn TypeScript, tạo thư mục `dist/`.       |
| `npm start`     | Khởi động backend và phục vụ giao diện web.               |

Khi terminal hiển thị:

```text
Smart E-Mobility Hub: http://127.0.0.1:3000
```

mở **<http://localhost:3000>** để sử dụng. Trang đăng nhập sẽ xuất hiện.

**Giữ terminal đang chạy trong suốt quá trình sử dụng.** Nhấn `Ctrl+C` tại terminal để dừng ứng dụng. Không cần mở trực tiếp các file HTML hoặc chạy frontend bằng Live Server; backend đã phục vụ cả giao diện và API.

Các lần chạy tiếp theo, nếu chưa sửa mã nguồn và đã cài thư viện/build thành công, chỉ cần mở terminal tại thư mục dự án rồi chạy `npm start`.

Không cần tạo file `.env` để chạy với cấu hình mặc định. Thư mục `dist/` được sinh khi build và không bắt buộc có sẵn trong ZIP mã nguồn.

### Nếu lấy mã nguồn từ GitHub

Có thể tải ZIP của nhánh **`develop`**, giải nén và thực hiện các bước trên. Nếu đã cài Git, có thể thay bước tải ZIP bằng:

```bash
git clone --branch develop https://github.com/ha-quachvan/CNPM.git
cd CNPM
```

Sau đó chạy `npm ci`, `npm run build` và `npm start`.

## 3. Tài khoản dùng thử

**Mật khẩu chung của các tài khoản mẫu: `Demo@12345`.** Không cần đăng ký tài khoản mới để kiểm tra các chức năng.

| Vai trò       | Email                  | Chức năng chính                                                                       |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| Khách hàng    | `customer@hub.local`   | Tìm Hub, đặt/nhận/trả xe, gửi–lấy xe cá nhân, đăng ký sạc và báo sự cố.               |
| Điều hành     | `operator@hub.local`   | Xem mạng lưới, tạo lệnh điều phối, giám sát sạc, theo dõi sự cố và phân tích What-if. |
| Kỹ thuật viên | `technician@hub.local` | Tiếp nhận/xử lý sự cố, thực hiện điều phối và thao tác sạc đội xe dùng chung.         |

Tại trang đăng nhập, các nút **Khách hàng**, **Điều hành**, **Kỹ thuật viên** điền sẵn tài khoản mẫu. Chọn vai trò rồi bấm **Đăng nhập**.

Tài khoản bổ sung: `customer2@hub.local` đến `customer8@hub.local` và `technician2@hub.local`, cùng mật khẩu trên.

Để kiểm tra lần lượt các vai trò trong một trình duyệt, bấm **Thoát** rồi đăng nhập tài khoản khác. Để kiểm tra đồng thời, dùng các trình duyệt hoặc hồ sơ trình duyệt riêng, ví dụ Chrome cho Khách hàng và Edge cho Điều hành. Các tab trong cùng một hồ sơ chia sẻ phiên đăng nhập; mở thêm tab thường không tạo phiên độc lập.

Các nút Google/Clerk và quy trình khôi phục mật khẩu là **mô phỏng**, không cần tài khoản dịch vụ thật và không gửi email/SMS.

## 4. Kiểm tra nhanh các chức năng

Các gợi ý dưới đây sử dụng dữ liệu mẫu vừa khởi động. Sau khi thực hiện nhiều thao tác, số xe, chỗ đỗ và cổng sạc sẽ thay đổi; có thể đặt lại dữ liệu theo Mục 5 để kiểm tra từ đầu.

| Chức năng          | Vai trò và cách thao tác                                                                                                                                                     | Kết quả cần quan sát                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tra cứu Hub        | Khách hàng → **Tìm Hub** → chọn một Hub trên sơ đồ hoặc trong danh sách.                                                                                                     | Xem xe khả dụng, chỗ đỗ, cổng sạc và vị trí tương đối của các Hub. Bản đồ là sơ đồ mô phỏng.                                                                      |
| Thuê xe một chiều  | Khách hàng → **Tìm Hub** → chọn xe ở Ga Metro ĐHQG → **Giữ xe**, chọn Hub trả khác → nhận xe bằng mã đang hiển thị → **Chuyến đi** → trả xe tại Hub đã đăng ký.              | Xe và chỗ trả được giữ; nhận xe tạo chuyến đi; trả xe kết thúc chuyến đi và cập nhật vị trí xe. Khi trả, tích xác nhận xe đã đến Hub để cung cấp vị trí mô phỏng. |
| Gửi–lấy xe cá nhân | Khách hàng → **Xe cá nhân** → chọn xe **59-T2 678.90**, đang ngoài Hub → đặt chỗ đỗ → xác nhận đỗ → lấy xe.                                                                  | Chỗ đỗ được sử dụng khi xác nhận đỗ và được giải phóng khi lấy xe; có lịch sử vào/ra.                                                                             |
| Sạc xe cá nhân     | Khách hàng → **Sạc xe** → chọn xe **59-T1 123.45**, đang ở Ga Metro ĐHQG → đăng ký mục tiêu pin → bắt đầu sạc khi được cấp cổng → dừng hoặc chờ đạt mục tiêu → ngắt kết nối. | Theo dõi pin và trạng thái phiên. Cổng chỉ được giải phóng sau khi ngắt kết nối. Điều hành xem trạng thái ở **Giám sát sạc**.                                     |
| Điều phối xe       | Điều hành → **Điều phối xe** → tạo lệnh KTX Khu A → Ga Metro ĐHQG, số lượng 2 xe. Kỹ thuật viên → **Lệnh điều phối** → nhận lệnh → bàn giao và xác nhận xe đã đến Hub đích.  | Xe nguồn và chỗ nhận được giữ; hoàn tất bàn giao cập nhật số xe ở hai Hub.                                                                                        |
| Xử lý sự cố        | Kỹ thuật viên → **Xử lý sự cố** → chọn sự cố mẫu → nhận xử lý → ghi kết quả kiểm tra và hoàn tất.                                                                            | Báo cáo chuyển qua các trạng thái xử lý; Điều hành theo dõi tại **Theo dõi sự cố**.                                                                               |
| What-if            | Điều hành → **Mô phỏng What-if** → **Nhu cầu cấp xe tại Hub** → chọn Metro, cách nhập **Nhập số xe cần có**, nhập 8 → **Tính phương án** → **Thử phương án**.                | Với dữ liệu ban đầu, Metro có 4 xe khả dụng, cần 8, thiếu 4; đề xuất chuyển 4 xe từ KTX Khu A. Kết quả thử chỉ nằm trên bản sao, không tạo lệnh điều phối thật.   |

Để quan sát sạc nhanh hơn, có thể đặt mục tiêu **36%** cho xe **59-T1 123.45** có pin ban đầu **35%**, bắt đầu sạc rồi dùng Điều hành → **Công cụ demo** → **+1 phút**. Quay lại tài khoản Khách hàng và bấm **Làm mới** để xem trạng thái. Sau khi đạt mục tiêu vẫn cần **ngắt kết nối**.

KTX Khu A có sẵn phiên sạc và yêu cầu chờ để kiểm tra hàng đợi: Kỹ thuật viên → **Sạc đội xe** → dừng rồi ngắt kết nối xe **EB-105**. Sau khi cổng được giải phóng, yêu cầu chờ đủ điều kiện được cấp theo thứ tự ưu tiên. Chỉ dừng sạc mà chưa ngắt kết nối thì cổng vẫn đang bị chiếm dụng.

## 5. Dữ liệu mẫu và đặt lại buổi kiểm tra

- Dữ liệu ban đầu gồm **6 Hub, 54 xe (42 xe dùng chung và 12 xe cá nhân), 100 chỗ đỗ, 18 cổng sạc và 11 tài khoản**. Có sẵn lịch sử và tình huống sự cố/hàng đợi sạc.
- Mọi thay đổi được lưu trong **RAM của backend**, dùng chung giữa các tài khoản đang kết nối. Tải lại trang không đặt lại dữ liệu.
- Để trở về dữ liệu ban đầu, dùng một trong hai cách:
  1. Dừng backend bằng `Ctrl+C`, sau đó chạy lại `npm start`.
  2. Đăng nhập Điều hành → **Công cụ demo** → **Đặt lại dữ liệu demo** và xác nhận.
- Cả hai cách đều xóa thay đổi của buổi kiểm tra và làm mất hiệu lực các phiên đăng nhập; cần đăng nhập lại.
- Các nút **+1 phút**, **+15 phút**, **+1 giờ** trong Công cụ demo đẩy thời gian của toàn hệ thống để quan sát pin hoặc hết hạn giữ chỗ. Chúng ảnh hưởng tất cả tài khoản đang sử dụng.
- What-if tính toán trên bản sao dữ liệu tại lúc phân tích. **Tính phương án** và **Thử phương án** không thay đổi dữ liệu vận hành.

## 6. Xử lý một số lỗi thường gặp

| Hiện tượng                                                          | Cách xử lý                                                                                                                                          |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Không nhận diện lệnh `node` hoặc `npm`                              | Cài Node.js kèm npm, đóng terminal rồi mở lại và kiểm tra phiên bản.                                                                                |
| Báo lỗi `ENOENT` liên quan `package.json`                           | Chuyển terminal vào đúng thư mục chứa `package.json`, không phải thư mục cha hoặc thư mục ZIP chưa giải nén.                                        |
| Báo lỗi `--env-file-if-exists` hoặc phiên bản Node.js không phù hợp | Kiểm tra `node --version`; sử dụng Node.js từ 22.9 trở lên theo cấu hình dự án.                                                                     |
| `npm ci` không tải được thư viện                                    | Kiểm tra kết nối Internet, giữ nguyên `package-lock.json` và chạy lại lệnh sau khi kết nối ổn định.                                                 |
| `npm start` báo không tìm thấy `dist/server.js`                     | Chạy `npm run build` thành công trước, rồi chạy lại `npm start`.                                                                                    |
| Không mở được trang web                                             | Kiểm tra backend vẫn đang chạy; mở đúng địa chỉ HTTP hiển thị trong terminal. Có thể dùng `http://127.0.0.1:3000` thay cho `http://localhost:3000`. |
| `EADDRINUSE`: cổng 3000 đã được sử dụng                             | Dừng tiến trình cũ đang chiếm cổng, hoặc đổi cổng theo hướng dẫn bên dưới.                                                                          |
| Bị chuyển về trang đăng nhập sau khi đặt lại dữ liệu/khởi động lại  | Đây là hành vi dự kiến vì phiên cũ đã bị thu hồi; đăng nhập lại bằng tài khoản mẫu.                                                                 |

### Đổi cổng khi cần

Tạo file **`.env`** cạnh `package.json`, với nội dung:

```dotenv
PORT=3001
HOST=127.0.0.1
```

Sau đó chạy lại `npm start` và mở **<http://localhost:3001>**. Đây là cấu hình tùy chọn; không cần thay đổi mã nguồn.

## 7. Cấu trúc mã nguồn

| Thư mục/file                        | Nội dung                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| `src/`                              | Mã nguồn backend TypeScript, xử lý nghiệp vụ, dữ liệu mẫu và các thành phần giả lập. |
| `public/`                           | Giao diện HTML, CSS, JavaScript và tài nguyên frontend.                              |
| `tests/`                            | Mã kiểm thử tự động.                                                                 |
| `package.json`, `package-lock.json` | Các lệnh chạy và danh sách thư viện của dự án.                                       |
| `tsconfig.json`                     | Cấu hình biên dịch TypeScript.                                                       |
| `.env.example`                      | Mẫu cấu hình tùy chọn cho địa chỉ và cổng chạy.                                      |
| `dist/`                             | Backend JavaScript được sinh sau `npm run build`.                                    |

README này chứa đầy đủ hướng dẫn chạy và kiểm tra cơ bản. Thư mục `docs/`, nếu được kèm theo, chỉ chứa tài liệu bổ sung và không cần thiết để khởi chạy ứng dụng.
