# Deploy lên Cloudflare Workers

Game chạy hoàn toàn trên Cloudflare:
- **Worker**: phục vụ giao diện + hình lá bài, cấp mã phòng.
- **Durable Object** (`RoomDO`): mỗi phòng chơi là một object riêng, giữ WebSocket của mọi người trong phòng, trạng thái ván và các đồng hồ (bot, tự rút bài, hết giờ).

Không cần VPS, không cần tên miền, HTTPS có sẵn.

## 1. Chuẩn bị (làm một lần)

1. Tạo tài khoản miễn phí tại https://dash.cloudflare.com/sign-up
2. Đăng nhập Wrangler trên máy (mở trình duyệt để xác nhận):
   ```bash
   npx wrangler login
   ```
3. Lần đầu deploy, Cloudflare sẽ hỏi tạo **subdomain workers.dev** cho tài khoản (ví dụ `tenban.workers.dev`). Chọn tên tuỳ ý.

## 2. Deploy

```bash
npm install
npm run deploy
```

Lệnh này build giao diện rồi chạy `wrangler deploy`. Kết quả in ra link dạng:

```
https://uno-web.<subdomain>.workers.dev
```

Gửi link này cho bạn bè là chơi được. Muốn đổi phần `uno-web` trong link, sửa `"name"` trong `wrangler.jsonc`.

## 3. Cập nhật phiên bản mới

Sửa code xong chỉ cần chạy lại:
```bash
npm run deploy
```
> Phòng đang chơi sẽ bị ngắt khi deploy (Durable Object khởi động lại). Hãy cập nhật lúc không ai chơi.

## 4. Xem log khi có lỗi

```bash
npx wrangler tail
```
Hoặc vào Dashboard → Workers & Pages → `uno-web` → **Logs**.

## 5. Dùng tên miền riêng (tuỳ chọn)

Nếu có tên miền đang quản lý trên Cloudflare: Dashboard → Workers & Pages → `uno-web` → **Settings → Domains & Routes → Add → Custom domain**, nhập ví dụ `uno.tenmien.com`. Cloudflare tự cấp HTTPS.

## Chi phí & giới hạn

Gói **Workers Free** có Durable Objects (loại SQLite). Giới hạn tính theo ngày (reset 07:00 sáng giờ Việt Nam), vượt thì báo lỗi chứ **không tự tính tiền**. Xem số liệu chính thức: https://developers.cloudflare.com/durable-objects/platform/pricing

Ước tính cho nhóm bạn bè:
- Mỗi phòng đang có người kết nối tính thời gian chạy (duration). Với giới hạn miễn phí khoảng 13.000 GB-giây/ngày và 128MB mỗi object, đủ cho khoảng **28 giờ phòng chơi mỗi ngày**.
- Tin nhắn người chơi gửi lên được tính 20 tin = 1 request; tin server gửi xuống miễn phí.

## Lưu ý

| Hành vi | Chi tiết |
|---|---|
| Phòng tự xoá | Không còn ai kết nối trong 10 phút → phòng bị xoá. Mã phòng vừa tạo mà không ai vào trong 1 phút cũng được nhả lại |
| Vị trí phòng | Durable Object được tạo ở trung tâm dữ liệu gần người tạo phòng (ở Việt Nam thường là Singapore / Hồng Kông) |
| Rớt mạng | Trình duyệt gửi heartbeat mỗi 15 giây; mất kết nối thì tự kết nối lại (0.5s → 5s) và vào lại đúng ghế |

## Xử lý sự cố

| Triệu chứng | Cách xử lý |
|---|---|
| `npm run deploy` báo chưa đăng nhập | Chạy `npx wrangler login` |
| Báo lỗi Durable Objects / migrations | Kiểm tra `wrangler.jsonc` còn khối `migrations` với `new_sqlite_classes: ["RoomDO"]` |
| Vào web được nhưng tạo phòng lỗi | Xem `npx wrangler tail` khi bấm tạo phòng |
| Link mời mở ra trang trắng | Chạy lại `npm run deploy` (có thể bản build giao diện bị thiếu) |
