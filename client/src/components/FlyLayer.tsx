/** Lớp chứa lá bài đang bay. Lá bay được director tạo trực tiếp bằng DOM + Web Animations API
 *  (chạy trên compositor của trình duyệt → không bị giật khi React đang render). */
export function FlyLayer() {
  return <div className="fly-layer" id="fly-layer" />;
}
