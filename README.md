# UNO cùng bạn bè 🃏

Web chơi UNO nhiều người theo thời gian thực, có animation và hiệu ứng cho từng loại lá bài.

## Tính năng
- Tạo phòng bằng mã 5 ký tự và gửi link mời. Mỗi phòng 2 đến 10 người, có thể thêm bot.
- Luật đầy đủ: cấm lượt, đổi chiều, +2, đổi màu, +4, **cộng dồn** (bật/tắt được), hô **UNO** và **bắt lỗi** người quên hô.
- Luật tuỳ chọn (chủ phòng bật/tắt trong phòng chờ, có sẵn chế độ **Cổ điển** và **Hỗn loạn**):
  - **Rút đến khi đánh được**: rút liên tục tới khi được lá hợp lệ, rồi bắt buộc đánh lá đó.
  - **7-0**: đánh 7 thì đổi cả bài với một người tự chọn; đánh 0 thì cả bàn chuyền bài theo chiều chơi.
  - **Chặn ngang**: có lá giống hệt lá trên bàn thì đánh chen ngay, không cần tới lượt.
  - **Không về bằng lá chức năng**: lá cuối cùng phải là lá số.
  - Số lá chia (5/7/10) và điểm vô địch (200/500 hoặc không giới hạn).
- Giới hạn thời gian mỗi lượt (15/30/60 giây hoặc không giới hạn). Hết giờ thì tự rút bài.
- F5 hoặc rớt mạng thì tự vào lại đúng ghế. Người mất kết nối được máy đánh thay để ván không bị kẹt.
- Tính điểm qua nhiều ván, người đánh đầu xoay vòng sau mỗi ván.
- Animation: chia bài, lá bay theo đường cong, +4 làm tối màn hình kèm vòng 4 màu và pháo giấy, +2 làm rung màn hình, dấu 🚫 khi bị cấm lượt, vòng xoay khi đổi chiều, sóng màu khi đổi màu, bộ đếm cộng dồn, chữ "UNO!" bung ra, pháo giấy khi thắng.
- Âm thanh tổng hợp bằng Web Audio, có nút tắt. Có biểu cảm emoji.

## Cấu trúc
```
shared/          kiểu dữ liệu, hàm luật, giao thức tin nhắn dùng chung
server/src/
  worker.ts      Cloudflare Worker + Durable Object RoomDO (mỗi phòng 1 object, WebSocket)
  room.ts        quản lý phòng: người chơi, đồng hồ, bot, gửi trạng thái cho từng người
  round.ts       engine luật chơi (thuần logic, có test)
  bot.ts         bot
client/          React + Vite + Framer Motion
  src/net.ts       kết nối WebSocket, tự kết nối lại, heartbeat
  src/director.ts  biến sự kiện game thành chuỗi animation
wrangler.jsonc   cấu hình Cloudflare
```
Server (Durable Object) giữ toàn bộ luật chơi; client chỉ gửi hành động và không thấy bài người khác.

## Chạy trên máy (dev)
```bash
npm install
npm run dev        # Worker (wrangler dev) :8787 + giao diện (Vite) :5173
```
Mở http://localhost:5173. Muốn thử nhiều người thì mở thêm tab ẩn danh, mỗi tab là một người chơi. Điện thoại cùng wifi vào `http://<IP-máy>:5173`.

## Lệnh khác
```bash
npm test           # test luật chơi
npm run typecheck
npm run deploy     # build + deploy lên Cloudflare
```

## Deploy
Chạy trên **Cloudflare Workers + Durable Objects** (gói miễn phí). Xem [DEPLOY.md](DEPLOY.md).

## Hình lá bài
Lấy từ [Card Asset Pack](https://natomarcacini.itch.io/card-asset-pack) của natomarcacini, giấy phép **CC0** (public domain), xem `client/public/cards/LICENSE.txt`.
Tên file theo dạng `<màu>-<giá trị>.png`, ví dụ `red-7.png`, `blue-skip.png`, `wild-wild4.png`, `back.png`.
