# Bộ 600 câu hỏi sát hạch lái xe (2025)

- Văn bản gốc: Bộ 600 câu hỏi dùng cho sát hạch lái xe cơ giới đường bộ, Cục Cảnh sát giao thông (Bộ Công an), áp dụng từ 01/06/2025.
- Dữ liệu có cấu trúc (`questions.json`, `images/`) lấy từ
  https://github.com/rinaheart/tdytools-gplx @ `8553ebcbef49dd04dbc6fd62ed902338f2140402`
  (repo không có license — cần xin phép tác giả nếu dùng cho mục đích thương mại).

## Bộ câu hỏi theo hạng (Công văn 2262/CSGT-P5)

| Trường | Ý nghĩa | Số câu |
|---|---|---|
| `isCritical` | 60 câu điểm liệt (Phụ lục III) — dùng cho đề ô tô | 60 |
| `inSetA` / `isCriticalA` | Bộ 250 câu hạng A1, A (Phụ lục I) / nhóm điểm liệt của bộ | 250 / 20 |
| `inSetB1` / `isCriticalB1` | Bộ 300 câu hạng B1 (Phụ lục II) / nhóm điểm liệt của bộ | 300 / 30 |

Trong đề A1/A, B1 chỉ câu thuộc nhóm điểm liệt của bộ đó mới là điểm liệt; các câu khác trong 60 câu
(ví dụ câu 32) xuất hiện như câu thường. Danh sách đã kiểm tra: số câu từng nhóm khớp công văn,
mọi câu nằm đúng chương, nhóm điểm liệt là tập con của bộ và của 60 câu.

## Đối chiếu với tài liệu chính thức (05/10/2026)

Nguồn đối chiếu:
- PDF "600 câu hỏi dùng cho sát hạch lái xe cơ giới đường bộ" bản ngày 19/05/2025 (188 trang). Đáp án đúng là phần gạch chân.
- Công văn 2262/CSGT-P5 ngày 07/05/2025 (cấu trúc chương, Phụ lục III: 60 câu điểm liệt).

Kết quả (đối chiếu tự động từng câu, đáp án đọc từ nét gạch chân trong PDF):

| Hạng mục | Kết quả |
|---|---|
| Đáp án đúng | 600/600 khớp |
| Số lượng đáp án mỗi câu | 600/600 khớp |
| Nội dung câu hỏi + đáp án | Khớp (bỏ qua khoảng trắng) |
| 60 câu điểm liệt | Khớp Phụ lục III |
| Ảnh minh hoạ | 318 câu, khớp vị trí và nội dung với PDF |

## Đã chỉnh sửa so với nguồn

| Câu | Lỗi | Sửa |
|---|---|---|
| 59 câu (167–180, 193–205, 249–263, 284–300) | Phân chương theo bộ 2020 (166/26/56/35/202/115) | Theo bộ 2025: I 1–180, II 181–205, III 206–263, IV 264–300, V 301–485, VI 486–600; tên chương theo PDF |
| 301, 302 | Đáp án 2 cột bị gộp | Tách 4 đáp án (đáp án đúng đã xác nhận với PDF) |
| 352 | 3 đáp án gộp thành 1 | Tách 3 đáp án (đáp án đúng đã xác nhận với PDF) |
| 362 | Nhãn hình "1  2" lẫn vào câu hỏi; ảnh bị cắt dính chữ | Xoá phần thừa; cắt lại ảnh từ PDF |
| 180, 485 | Tiêu đề chương kế tiếp dính vào cuối đáp án 3 | Xoá phần thừa |
| 123–126 | "cm3" | "cm³" như PDF |
