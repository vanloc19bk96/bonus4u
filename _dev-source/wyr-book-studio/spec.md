# SPEC — "WYR Book Studio": công cụ tạo sách *Would You Rather* chuẩn Amazon KDP

> Tài liệu này dành cho Claude Code để code. Đọc hết trước khi code. Mọi mục có nhãn **[BẮT BUỘC]** là không được bỏ qua.

---

## 0. Tóm tắt sản phẩm

Ứng dụng web **offline, 1 trang**, chỉ HTML/CSS/JS thuần. User mở `index.html` bằng double-click (giao thức `file://`) là dùng được, không cần server, không cần cài đặt.

Luồng 4 bước:

1. **Thiết lập** — user chọn vài tuỳ chọn (đối tượng, chủ đề, số câu…).
2. **Copy prompt** — app sinh prompt; user dán vào ChatGPT / Claude / Gemini / Grok.
3. **Dán kết quả** — user copy JSON mà AI trả về, dán vào app (có thể dán nhiều lần theo từng đợt).
4. **Xem trước & tải PDF** — app dàn trang theo chuẩn KDP, preview bên phải, tải PDF interior.

Sách gồm: trang tiêu đề, trang bản quyền, hướng dẫn chơi + cách tính điểm, các trang câu hỏi, **phần đáp án ("Behind the Choices")**, trang tự sáng tác, trang cảm ơn.

---

## 1. Kết quả nghiên cứu thị trường (dùng để thiết kế prompt & bố cục)

### 1.1 Sách Would You Rather bán chạy trên Amazon trông như thế nào
- Bán chạy nhất ở các nhóm **Children's Party Games**, **Activity Books**, quà tặng. Ví dụ: *Would You Rather Book For Kids — Silly Scenarios, Challenging Choices, and Hilarious Situations the Whole Family Will Love* (Sunny Panda, #1 Best Seller Children's Party Games).
- **Số câu**: thường 100–700, phổ biến nhất **200–300+** ("300+ Silly and Challenging Questions").
- **Khổ**: **6" x 9"** phổ biến nhất; 8.5" x 11" cho bản có minh hoạ. Thường **1–2 câu/trang**.
- **Các "edition" theo mùa/chủ đề** bán rất tốt: Christmas, Easter, Valentine's, Halloween, Summer/Travel (road trip), bản **Yuck/Gross**, bản **Scary** (cho preteen), bản **Teens**, **Adults (clean)**, **Couples**, **Family game night**.
- **Tiêu đề điển hình** dạng: *"Would You Rather Book for Kids: 300 Hilarious, Silly and Challenging Questions for Family Game Night, Road Trips and Parties"* → AI nên đề xuất title/subtitle theo khuôn này.
- **Điểm khác biệt được review khen**: có **luật chơi thành game thật** (tính điểm, ví dụ "Lord of the Laughs": ai làm đối phương cười thì được điểm), trang trình bày dễ nhìn, câu hỏi sáng tạo hơn mặt bằng chung.
- **Điểm bị chê**: lỗi chính tả, thiếu chữ, câu diễn đạt lạ; câu trùng lặp / lặp ý; câu không hợp lứa tuổi; câu quá dễ chọn (một phương án rõ ràng tốt hơn) → prompt phải chặn tất cả những lỗi này.

### 1.2 Thế nào là một câu Would You Rather "hay"
- **Cân bằng**: hai phương án hấp dẫn ngang nhau HOẶC tệ ngang nhau. Tiêu chí: ~40–60% người sẽ chọn mỗi bên. Nếu >75% chọn 1 bên → loại.
- **Tương phản rõ**: hai phương án khác nhau về *một trục* dễ thấy (lớn ↔ nhỏ, quá khứ ↔ tương lai, nổi tiếng ↔ riêng tư, sức mạnh ↔ cái giá phải trả, bây giờ ↔ sau này, nóng ↔ lạnh…).
- **Có "cái giá" (the catch)**: kiểu mạnh nhất là *lợi ích + nhược điểm buồn cười*: "be able to fly **but only 2 feet off the ground**" vs "be invisible **but only when no one is looking**".
- **Cụ thể, dễ hình dung**: có hình ảnh, số liệu, chi tiết buồn cười ("sneeze glitter", "a pet dinosaur the size of a hamster").
- **Cấu trúc song song**, cùng độ dài, bắt đầu bằng động từ, đọc to lên nghe vui.
- **Không an toàn → không bán được**: tránh thương hiệu/người nổi tiếng/nhân vật có bản quyền (rủi ro IP trên KDP), chính trị, tôn giáo, bạo lực, cái chết, vũ khí, hẹn hò (với bản kids), chê ngoại hình, thử thách nguy hiểm có thể bắt chước.

### 1.3 "Đáp án" cho sách Would You Rather
Would You Rather không có đáp án đúng/sai. Để sách có phần đáp án **có giá trị bán hàng**, mỗi câu có mục **"Behind the Choice"** ở cuối sách:
- `why_hard`: vì sao câu này khó chọn (≤ 25 từ).
- `a_plus` / `b_plus`: lý do hay nhất để chọn A / chọn B (≤ 15 từ mỗi cái).
- `bonus`: 1 câu hỏi mở rộng để bàn tiếp ("What would you do first?").

Phần này đặt ở cuối sách (mặc định) để người chơi tự tranh luận trước rồi mới lật xem.

---

## 2. Yêu cầu kỹ thuật **[BẮT BUỘC]**

| Yêu cầu | Chi tiết |
|---|---|
| Công nghệ | HTML5 + CSS3 + JavaScript thuần (ES2017+). Không framework, không build step, không npm. |
| Chạy | Double-click `index.html` → chạy trên Chrome/Edge/Firefox mới nhất. |
| **Không ES modules** | `file://` chặn `<script type="module">` và `fetch()` file local do CORS. → dùng `<script src>` thường, gom mọi thứ vào 1 namespace global `window.WYR`. |
| Không phụ thuộc internet | Mọi thư viện & font phải nằm local trong thư mục `lib/` và `fonts/`. Không dùng CDN. |
| Thư viện PDF | **jsPDF 2.5.x** bản UMD (`lib/jspdf.umd.min.js`), tải một lần về repo. **KHÔNG dùng html2canvas** (sẽ biến chữ thành ảnh, mờ và nặng). PDF phải là **chữ vector**. |
| Font | Nhúng TTF vào PDF (KDP yêu cầu embed font). Không dùng font chuẩn Helvetica/Times của jsPDF vì chúng **không được embed**. |
| Lưu trạng thái | `localStorage` (bọc try/catch) — tự lưu setup + dữ liệu câu hỏi, mở lại không mất. |
| Clipboard | Dùng `navigator.clipboard.writeText`, fallback `document.execCommand('copy')` qua textarea ẩn (vì `file://` có thể không phải secure context). |

### 2.1 Cấu trúc thư mục

```
wyr-book-studio/
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── namespace.js        // window.WYR = {}
│   ├── config.js           // hằng số: trim sizes, bảng margin KDP, presets
│   ├── state.js            // state + localStorage
│   ├── prompt.js           // sinh prompt theo setup
│   ├── parser.js           // làm sạch + parse + validate JSON từ AI
│   ├── kdp.js              // tính margin/gutter theo số trang
│   ├── layout.js           // engine dàn trang → "display list"
│   ├── render-preview.js   // vẽ display list ra DOM (preview)
│   ├── render-pdf.js       // vẽ display list ra jsPDF
│   ├── ui.js               // form, stepper, toast, modal
│   └── app.js              // khởi động
├── fonts/
│   ├── baloo2-bold.js      // window.WYR.fonts['Baloo2-Bold'] = '<base64 TTF>'
│   ├── nunito-regular.js
│   ├── nunito-bold.js
│   └── nunito-italic.js
├── lib/
│   └── jspdf.umd.min.js
├── sample/
│   └── sample-data.js      // 30 câu mẫu để user bấm "Dùng dữ liệu mẫu"
└── README.md               // hướng dẫn cho người dùng (tiếng Việt)
```

### 2.2 Font **[BẮT BUỘC]**
- **Baloo 2 Bold** (tiêu đề, "OR", số câu) + **Nunito** Regular/Bold/Italic (nội dung). Cả hai là **SIL OFL 1.1** (dùng thương mại được) và **hỗ trợ tiếng Việt**.
- Tải TTF tĩnh từ repo `github.com/google/fonts` (thư mục `ofl/baloo2`, `ofl/nunito`; nếu chỉ có variable font thì dùng bản static hoặc tạo instance). Chuyển sang base64 và bọc trong file `.js` để load bằng `<script>` (không `fetch` được trên `file://`).
- Đăng ký với jsPDF: `doc.addFileToVFS(name + '.ttf', base64); doc.addFont(name + '.ttf', family, style);`.
- Preview dùng cùng font qua `@font-face` với `src: url(data:font/ttf;base64,...)` được inject từ chính biến base64 đó → preview và PDF **giống hệt nhau**.
- Kèm file `fonts/OFL.txt`.
- Kiểm tra glyph: mọi ký tự trong dữ liệu phải có trong font; ký tự lạ (emoji, ký hiệu hiếm) → parser thay thế hoặc cảnh báo.

---

## 3. Chuẩn Amazon KDP (paperback interior) **[BẮT BUỘC]**

Nguồn: KDP *Set Trim Size, Bleed, and Margins* và *Paperback Submission Guidelines*.

### 3.1 Khổ sách hỗ trợ (không bleed)
| Khổ | Ghi chú | Mặc định số câu/trang |
|---|---|---|
| **6" x 9"** | **Mặc định**, phổ biến nhất cho thể loại này | 1 |
| 5.5" x 8.5" | nhỏ gọn, quà tặng | 1 |
| 7" x 10" | | 2 |
| 8" x 10" | | 2 |
| 8.5" x 11" | khổ lớn | 2 |

Không bleed → kích thước trang PDF **đúng bằng** khổ sách. (Không cần hỗ trợ bleed vì thiết kế không in tràn lề. Nếu sau này thêm bleed: cộng 0.125" chiều rộng, 0.25" chiều cao, và lề ngoài tối thiểu 0.375".)

### 3.2 Lề — phụ thuộc số trang
| Số trang | Lề trong (gutter) tối thiểu | Lề ngoài tối thiểu (no bleed) |
|---|---|---|
| 24–150 | 0.375" | 0.25" |
| 151–300 | 0.5" | 0.25" |
| 301–500 | 0.625" | 0.25" |
| 501–700 | 0.75" | 0.25" |
| 701–828 | 0.875" | 0.25" |

**Quy tắc app áp dụng (an toàn hơn tối thiểu):**
- `gutter = minGutter(pageCount) + 0.125"`
- `outside = top = bottom = 0.5"` (khổ ≥ 8": 0.6")
- **Lề đối xứng gương**: trang lẻ (bên phải) gutter ở **trái**; trang chẵn (bên trái) gutter ở **phải**. Trang 1 là trang lẻ.
- **Tính 2 lượt**: dàn trang với gutter giả định → đếm số trang → tra bảng → nếu gutter đổi thì dàn lại. Lặp tối đa 3 lần.
- Số trang, header, footer **cũng phải nằm trong vùng an toàn**.

### 3.3 Quy định khác
- **Cỡ chữ tối thiểu 7pt** theo KDP → app đặt sàn **9pt** cho mọi chữ (đọc được với trẻ em).
- **Nét kẻ tối thiểu 0.75pt** (khung, ô tick, đường kẻ).
- **Số trang**: tối thiểu **24**, tối đa **828**. Nếu < 24 → cảnh báo, gợi ý tăng số câu hoặc bật "trang tự sáng tác".
- Không crop marks, không bookmark/outline, không annotation, không comment, không lớp trong suốt (không dùng opacity/GState trong jsPDF).
- Trang lẻ bên phải, chẵn bên trái; đánh số trang ở trang nội dung (trang tiêu đề/bản quyền không hiện số nhưng vẫn được đếm).
- Tránh nhiều trang trắng liên tiếp (KDP liệt "excessive blank pages" là lỗi phổ biến): tối đa 1 trang trắng liên tiếp, chỉ dùng để đẩy chương bắt đầu sang trang phải nếu bật tuỳ chọn đó.
- Màu: mặc định **đen trắng** (in rẻ nhất). Chữ đen dùng `#000000` thuần; nền xám nhạt ≥ 10% để in ra thấy được.
- Tên file tải về: không dấu, không emoji, ví dụ `would-you-rather-kids-6x9-interior.pdf`.
- Hiển thị cho user sau khi tạo: số trang, khổ, gutter đang dùng, và nhắc "Chọn đúng khổ X, No bleed, Black & white interior khi upload lên KDP".

---

## 4. Giao diện (UI/UX)

### 4.1 Bố cục
```
┌──────────────────────────┬──────────────────────────────────────────┐
│ LEFT BAR (380px, cuộn)   │ CONTENT (preview)                        │
│                          │  Thanh công cụ: [◀ Trang 3/128 ▶]        │
│  ① Thiết lập   ✓         │   Zoom [-][100%][+]  [☐ Hiện lề]         │
│  ② Copy prompt           │   [⬇ Tải PDF]                            │
│  ③ Dán kết quả  120/200  │                                          │
│  ④ Bố cục & tải PDF      │   ┌────────┐  ┌────────┐                 │
│                          │   │ trang  │  │ trang  │  (xem 2 trang    │
│  (nội dung bước đang mở) │   │  chẵn  │  │  lẻ    │   như sách mở)   │
│                          │   └────────┘  └────────┘                 │
└──────────────────────────┴──────────────────────────────────────────┘
```
- Left bar là **stepper dạng accordion**: mỗi lúc chỉ mở 1 bước, bước xong có dấu ✓, bấm tiêu đề bước để quay lại.
- Màn hình < 900px: left bar lên trên, preview xuống dưới.
- Trạng thái rỗng của preview (chưa có dữ liệu): minh hoạ đơn giản + 3 dòng hướng dẫn + nút **"Xem thử với dữ liệu mẫu"**.

### 4.2 Nguyên tắc UX
- Ngôn ngữ UI: **tiếng Việt**, câu ngắn, không thuật ngữ kỹ thuật (nói "Dán kết quả từ AI", không nói "Paste JSON").
- Mỗi bước có 1 **nút chính** duy nhất (màu nổi bật); các thứ khác là phụ.
- Có giá trị mặc định tốt cho mọi field → user chỉ cần bấm "Tạo prompt" là chạy được.
- Tooltip "?" nhỏ cạnh field khó hiểu.
- Toast xác nhận: "Đã copy prompt ✓", "Đã thêm 50 câu (tổng 150/200)".
- Lỗi hiển thị bằng tiếng người: "Kết quả dán vào bị thiếu phần cuối — có thể AI bị cắt ngang. Hãy gõ `continue` trong AI và dán tiếp."
- Font UI: system font stack. Màu: 1 màu chính (ví dụ tím `#6D4AFF`), nền xám rất nhạt, bo góc 10px. Hỗ trợ dark mode không bắt buộc.
- Mọi thay đổi ở bước ④ cập nhật preview ngay (debounce 300ms).

### 4.3 Chi tiết từng bước

#### Bước ① Thiết lập nội dung (quyết định prompt)
Chỉ 5 field:

| Field | Kiểu | Giá trị | Mặc định |
|---|---|---|---|
| Đối tượng | select | Kids 6–8 · Kids 8–12 · Teens 13–17 · Family (mọi lứa tuổi) · Adults (clean) · Couples (clean) | Kids 8–12 |
| Chủ đề / phiên bản | select + ô "Khác…" | General mix · Silly & Funny · Gross & Yuck · Spooky (nhẹ) · Christmas · Halloween · Easter · Valentine's · Summer & Road Trip · Animals · Food · Sports · School · Superpowers & Fantasy · Khác (tự nhập) | General mix |
| Số câu hỏi | number + chip nhanh [100] [200] [300] | 20–500 | 200 |
| Phong cách | segmented | 😂 Vui nhộn · ⚖️ Cân bằng · 🤔 Suy ngẫm | Cân bằng |
| Ngôn ngữ trong sách | select | English (US) · Tiếng Việt · Español · Français · Deutsch | English (US) |

Nút chính: **"Tạo prompt →"**.

#### Bước ② Copy prompt
- Hiển thị: "Sách của bạn cần **4 lượt** hỏi AI (mỗi lượt 50 câu)."
- Ô prompt read-only (thu gọn, có nút "Xem toàn bộ") + nút chính **"📋 Copy prompt"**.
- Hướng dẫn 3 dòng: "1. Mở ChatGPT/Claude/Gemini/Grok → 2. Dán prompt và gửi → 3. Copy toàn bộ câu trả lời rồi sang bước ③".
- Nút phụ **"📋 Copy lệnh 'next'"** (copy chữ `next`) để lấy lượt tiếp theo.
- Mẹo nhỏ: "Nên dùng model mạnh nhất (GPT-5/Claude/Gemini Pro) để câu hỏi hay hơn."

#### Bước ③ Dán kết quả
- Textarea lớn, placeholder "Dán toàn bộ câu trả lời của AI vào đây (dán cả chữ thừa cũng được)".
- Nút chính **"Thêm vào sách"** → parse → thêm vào danh sách (không ghi đè), dedupe.
- Thanh tiến độ: **150 / 200 câu**. Khi chưa đủ: "Gõ `next` trong AI để lấy tiếp, rồi dán vào đây". Khi đủ: tự chuyển sang bước ④.
- Danh sách câu (cuộn, gọn): mỗi dòng `#12 [Silly] Fly 2 ft high … / Be invisible …` với nút ✏️ sửa (modal sửa A, B, why_hard, a_plus, b_plus, bonus, category) và 🗑 xoá.
- Nút phụ: "Xoá tất cả" (có xác nhận), "Xuất JSON" (sao lưu), "Nhập JSON" (từ file sao lưu), **"Tạo prompt thay thế"** cho các câu đã tick chọn (sinh mini-prompt yêu cầu AI viết lại đúng các id đó; khi dán về thì **thay** theo id thay vì thêm mới).
- Cảnh báo không chặn: câu trùng/na ná, câu quá dài, thiếu đáp án.

#### Bước ④ Bố cục & tải PDF
| Field | Kiểu | Mặc định |
|---|---|---|
| Tên sách | text (gợi ý từ AI, bấm để chọn 1 trong 3 gợi ý) | gợi ý #1 |
| Phụ đề | text | gợi ý #1 |
| Tác giả / thương hiệu | text | "" |
| Khổ sách | select (mục 3.1) | 6" x 9" |
| Số câu mỗi trang | segmented 1 · 2 | theo khổ |
| Thành phần sách | checkbox: ☑ Hướng dẫn chơi & bảng điểm · ☑ Đáp án "Behind the Choices" · ☑ Chia chương theo chủ đề · ☑ Trang tự sáng tác (5 trang) · ☑ Trang cảm ơn | tất cả bật |
| Nâng cao (thu gọn) | Năm bản quyền; Kiểu ô chọn: "☐ Player 1 / ☐ Player 2" hoặc "☐ đơn"; Đáp án: cuối sách / cuối mỗi chương | cuối sách |

Khu thông tin: `128 trang · Gutter 0.5" · Lề ngoài 0.5" · Khổ 6"x9" · ✓ Đạt chuẩn KDP`.
Nút chính: **"⬇ Tải PDF"** (hiện tiến trình "Đang tạo trang 45/128…", không đơ UI — tạo theo lô với `await new Promise(r => setTimeout(r))`).

---

## 5. Prompt cho AI

### 5.1 Định dạng dữ liệu trả về: JSON
Lý do chọn JSON: mọi AI đều sinh tốt, parse chính xác, có field đáp án rõ ràng. Key ngắn gọn để tiết kiệm token (AI ít bị cắt giữa chừng).

**Schema mỗi lượt:**
```json
{
  "batch": 1,
  "total_batches": 4,
  "book": {
    "title_ideas": [
      {"title": "Would You Rather Book for Kids", "subtitle": "200 Hilarious, Silly and Challenging Questions for Family Game Night, Road Trips and Parties"}
    ]
  },
  "questions": [
    {
      "id": 1,
      "cat": "Superpowers",
      "a": "be able to fly, but only 2 feet off the ground",
      "b": "be invisible, but only when nobody is looking",
      "why_hard": "Both powers sound amazing until you realize nobody will ever see you use them.",
      "a_plus": "You'd never have to walk through mud again.",
      "b_plus": "Perfect for sneaking cookies at midnight.",
      "bonus": "Where is the first place you'd go?"
    }
  ]
}
```
- `book` chỉ bắt buộc ở lượt 1 (3 ý tưởng title/subtitle).
- `a`, `b` **không** chứa "Would you rather" và không có dấu "?" — app tự thêm "Would you rather…" và "OR".

### 5.2 Chia lượt (batch)
- `BATCH_SIZE = 50` (đủ nhỏ để AI không bị cắt output). `total_batches = ceil(count / 50)`, lượt cuối có thể ít hơn.
- App tính sẵn **phân bổ category** cho cả sách (ví dụ General mix 200 câu → 8 category × 25 câu) và đưa vào prompt; mỗi lượt trộn đều category.
- Prompt dặn: sau mỗi lượt dừng lại; khi user gõ `next` thì làm lượt kế, id nối tiếp, **không lặp ý tưởng đã dùng**.

### 5.3 Bảng category mặc định theo chủ đề (trong `config.js`)
- **General mix**: Superpowers, Silly & Funny, Gross & Yuck (nhẹ), Animals, Food, School, Adventure & Travel, Future & Fantasy.
- **Silly & Funny**: Weird Bodies, Talking Things, Silly Jobs, Upside-Down Days, Funny Food, Pet Chaos.
- **Gross & Yuck**: Slimy, Smelly, Icky Food, Bugs & Critters, Bathroom Humor (nhẹ, không thô tục).
- **Holiday editions** (Christmas / Halloween / Easter / Valentine's / Summer): 5–6 category theo chủ đề + 20% General.
- **Teens**: Social Life, School, Tech & Internet, Future, Money, Superpowers, Food, Travel.
- **Adults/Couples (clean)**: Life Choices, Money, Travel, Relationships (clean), Work, Hypothetical, Food.
- **Khác (tự nhập)**: để AI tự đề xuất 6–8 category rồi dùng xuyên suốt.

### 5.4 Map đối tượng → quy tắc ngôn ngữ
| Đối tượng | Độ dài mỗi phương án | Từ vựng | Giới hạn nội dung |
|---|---|---|---|
| Kids 6–8 | 5–14 từ | rất đơn giản (lớp 1–2) | không gì đáng sợ, không bạo lực |
| Kids 8–12 | 6–18 từ | đơn giản | gross nhẹ OK, sợ nhẹ OK, không hẹn hò |
| Teens | 8–22 từ | tự nhiên | không rượu/ma tuý/tình dục |
| Family | 6–18 từ | đơn giản | phù hợp mọi tuổi |
| Adults/Couples (clean) | 8–25 từ | tự nhiên | không tục, không 18+ |

### 5.5 Map phong cách
- 😂 **Vui nhộn**: 70% silly/absurd, 20% gross/weird, 10% suy nghĩ.
- ⚖️ **Cân bằng**: 45% silly, 35% dilemma khó chọn, 20% suy ngẫm/tưởng tượng.
- 🤔 **Suy ngẫm**: 60% dilemma thật, 25% tưởng tượng, 15% vui.

### 5.6 Template prompt (tiếng Anh — AI làm tốt nhất; nội dung sách viết bằng ngôn ngữ đã chọn)

Các biến `{{...}}` do `prompt.js` điền.

````text
You are a best-selling author of "Would You Rather" game books on Amazon, known for questions that make families laugh out loud and argue happily for minutes over every single choice.

## BOOK
- Audience: {{audienceLabel}} ({{audienceRules}})
- Theme / edition: {{themeLabel}}
- Style mix: {{styleMix}}
- Book language: {{language}} (write ALL question text and answers in this language; natural, native phrasing; {{spellingNote}})
- Total questions: {{count}}, delivered in {{totalBatches}} batches of up to {{batchSize}}.
- Category plan for the WHOLE book (keep these exact category names):
{{categoryPlanLines}}   // ví dụ: "- Superpowers: 25"

## WHAT MAKES A GREAT QUESTION (follow strictly)
1. BALANCED: both options must be equally tempting OR equally awful. Aim for a 50/50 split of opinions. If most people would instantly pick one side, throw it away and write a better one.
2. CLEAR CONTRAST: the two options differ along one obvious axis (big vs small, past vs future, famous vs secret, power vs price, now vs later, hot vs cold, alone vs crowd...).
3. THE CATCH: the best questions give each option an upside AND a funny or painful downside ("fly, but only 2 feet off the ground").
4. VIVID & SPECIFIC: concrete images, numbers, sounds, smells. Something you can picture instantly.
5. PARALLEL: both options have similar length and grammar, each starts with a verb (e.g. "have…", "be…", "eat…"), each is {{wordRange}} words.
6. VARIETY: never reuse the same premise, the same superpower, the same animal or the same punchline twice in the whole book. Mix silly, gross, imaginative and thought-provoking questions.
7. READ-ALOUD FUN: it should sound funny when a kid/parent reads it out loud.
8. PERFECT WRITING: zero typos, no missing words, no awkward phrasing.

## NEVER INCLUDE
- Brand names, real celebrities, real people, copyrighted characters, movies, games or songs.
- Politics, religion, death, serious injury, weapons, drugs, alcohol, romance/dating{{extraBans}}.
- Body shaming, insults about groups of people, anything scary beyond {{scaryLevel}}.
- Dangerous actions a child could copy.
- The words "Would you rather" or a question mark inside options (the book adds them).

## ANSWER KEY FIELDS (the "Behind the Choice" section printed at the back)
- "why_hard": why this choice is genuinely tough (max 25 words, fun tone).
- "a_plus": the single best argument for option A (max 15 words).
- "b_plus": the single best argument for option B (max 15 words).
- "bonus": one short follow-up question to keep the conversation going (max 15 words).

## OUTPUT FORMAT (critical)
- Reply with ONE ```json code block and nothing else — no intro, no notes.
- Valid JSON: double quotes, no trailing commas, no comments.
- Schema:
{
  "batch": <number>,
  "total_batches": {{totalBatches}},
  "book": { "title_ideas": [ { "title": "...", "subtitle": "..." } ] },   // ONLY in batch 1: 3 Amazon-style title ideas in the book language (subtitle mentions the number {{count}}, the audience and uses like family game night, road trips, parties)
  "questions": [
    { "id": <number>, "cat": "<category from the plan>", "a": "...", "b": "...", "why_hard": "...", "a_plus": "...", "b_plus": "...", "bonus": "..." }
  ]
}

## BATCHING
- Now write BATCH 1 only: ids 1 to {{batch1End}}, mixing the categories in proportion to the plan (do not group them).
- Before writing, silently brainstorm ~2x more ideas than needed, then keep only the most balanced and funniest ones.
- Then STOP. When I reply "next", write the following batch with ids continuing from the last one, still following every rule and never repeating an idea from earlier batches. The final batch must bring the total to exactly {{count}} questions and complete every category count in the plan.
````

### 5.7 Prompt thay thế câu (bước ③)
```text
Rewrite ONLY these questions for the same book (same audience, theme, language and rules as before). Keep the same ids and categories. Make each one more balanced, funnier and totally different from the old version.
Old questions:
{{json các câu được chọn: id, cat, a, b}}
Reply with ONE ```json code block: {"replace": true, "questions": [ ...same schema... ]}
```
(Nếu AI là cuộc hội thoại mới, prompt này tự kèm lại đoạn "WHAT MAKES A GREAT QUESTION" + "NEVER INCLUDE" + schema.)

---

## 6. Parser (`parser.js`) **[BẮT BUỘC chịu lỗi tốt]**

Input là "bất cứ thứ gì user dán". Các bước:
1. Chuẩn hoá: bỏ BOM, đổi smart quotes `“ ” ‘ ’` **bên ngoài chuỗi JSON** → `"`/`'` (cẩn thận: bên trong nội dung câu giữ nguyên dấu nháy đơn cong `’` được, vì font có glyph).
2. Tìm tất cả khối ```json … ``` ; nếu không có, lấy đoạn từ `{` đầu tiên đến `}` cuối cùng (hoặc `[`…`]`).
3. `JSON.parse`; nếu lỗi → sửa nhẹ: xoá dấu phẩy thừa trước `}`/`]`, xoá comment `//`, thay newline thô trong chuỗi; thử lại.
4. Nếu vẫn lỗi vì **bị cắt giữa chừng**: cắt về object câu hỏi hoàn chỉnh cuối cùng, đóng ngoặc, parse; báo "Đã lấy được 37 câu, phần cuối bị cắt — gõ `continue` trong AI".
5. Chấp nhận các hình dạng: `{questions:[…]}`, mảng trần `[…]`, key dài (`option_a`/`optionA`/`a`), thiếu field đáp án (đánh dấu ⚠).
6. Validate mỗi câu: `a`,`b` là chuỗi không rỗng; bỏ tiền tố "Would you rather", bỏ "?" / "." cuối, viết thường chữ cái đầu (trừ ngôn ngữ/danh từ riêng — chỉ hạ nếu chữ thứ 2 là chữ thường); trim khoảng trắng; loại ký tự không có trong font (emoji) và báo.
7. **Dedupe**: chuẩn hoá (lowercase, bỏ dấu câu) rồi so Jaccard trên tập từ của `a+b`; ≥ 0.7 → coi là trùng, bỏ và báo.
8. Gán lại `id` tuần tự trong sách (giữ `sourceId` để thay thế). Với `{"replace": true}` → thay theo id.
9. Lưu `book.title_ideas` nếu có.

Viết unit test nhỏ (`tests/parser-tests.html` mở bằng trình duyệt, chạy assert và in PASS/FAIL) cho: có code fence, chữ thừa trước/sau, trailing comma, bị cắt, mảng trần, key dài, trùng lặp.

---

## 7. Engine dàn trang

### 7.1 Kiến trúc: 1 layout → 2 renderer **[BẮT BUỘC]**
- `layout.js` nhận `(questions, settings)` và trả về `pages[]`, mỗi trang là danh sách lệnh vẽ, đơn vị **inch**:
  - `{type:'text', x, y, w, text, font, style, size, align, color, lineHeight}` (text đã xuống dòng sẵn → mảng dòng)
  - `{type:'rect', x, y, w, h, stroke, fill, radius, lineWidth}`
  - `{type:'circle', cx, cy, r, stroke, fill, lineWidth}`
  - `{type:'line', x1, y1, x2, y2, lineWidth, dash}`
- **Đo chữ để xuống dòng** bằng jsPDF (`doc.getStringUnitWidth` / `getTextWidth` với font đã đăng ký) trong một instance jsPDF "đo" dùng chung → preview và PDF xuống dòng **giống hệt**.
- `render-preview.js`: mỗi trang là `<div class="page">` kích thước `trimW*96*zoom px`, các phần tử absolute. Ảo hoá: chỉ render trang gần viewport (IntersectionObserver) để 300+ trang vẫn mượt.
- `render-pdf.js`: `new jsPDF({unit:'in', format:[trimW, trimH], orientation:'portrait', compress:true})`, duyệt lệnh vẽ, `addPage` mỗi trang. Không dùng `setGState`/opacity, không outline.
- Toggle "Hiện lề" trong preview: vẽ vùng an toàn bằng viền đứt nét đỏ (chỉ preview, không vào PDF).

### 7.2 Auto-fit cỡ chữ
Với mỗi khối câu hỏi, thử cỡ chữ từ max xuống min (bước 0.5pt) đến khi vừa khung. Nếu ở min vẫn không vừa → cho câu đó chiếm riêng 1 trang (chế độ 2 câu/trang) hoặc báo lỗi "câu #x quá dài" kèm nút sửa.

| Thành phần | 1 câu/trang (6x9) | 2 câu/trang (6x9) | khổ ≥ 8" |
|---|---|---|---|
| "Would you rather…" (Baloo 2 Bold) | 26pt | 18pt | ×1.2 |
| Phương án A/B (Nunito Bold) | 20 → 14pt | 15 → 11pt | ×1.2 |
| "OR" trong vòng tròn (Baloo 2 Bold) | 22pt | 16pt | ×1.2 |
| Nhãn category + số câu | 10pt | 9pt | 11pt |
| Đáp án (Nunito) | 10pt (tối thiểu 9) | | 11pt |
| Số trang | 9pt | 9pt | 10pt |

Line-height 1.25. Sàn tuyệt đối 9pt.

### 7.3 Thứ tự trang trong sách
1. **Title page** (trang 1, lẻ): tên sách, phụ đề, tác giả — căn giữa. Không số trang.
2. **Copyright page** (trang 2): "Copyright © {{year}} {{author}}. All rights reserved. No part of this book may be reproduced … without permission." (câu chữ theo ngôn ngữ sách). Không số trang.
3. **How to Play** (bắt đầu trang lẻ): luật chơi ngắn + 2 chế độ:
   - *Classic*: đọc to câu hỏi, mỗi người chọn và giải thích vì sao.
   - *Score mode* ("Laugh Challenge"): Người hỏi đọc câu một cách hài hước nhất; nếu người kia cười → người hỏi được 1 điểm. Đổi lượt. Ai đạt 10 điểm trước thắng.
   - Nhắc: "Answers & fun arguments are in the *Behind the Choices* section at the back."
4. **Score Sheet** (1 trang): bảng 2 cột Player 1 / Player 2 × 20 hàng (vẽ bằng line ≥ 0.75pt).
5. **Question pages**: nếu "Chia chương" bật → trước mỗi category có 1 trang tiêu đề chương (tên category lớn + mô tả 1 dòng); nếu tắt → trộn theo thứ tự id.
6. **Your Turn!** (5 trang, tuỳ chọn): khung "Would you rather ____ OR ____" với dòng kẻ để tự viết (2 câu/trang).
7. **Behind the Choices** (đáp án): tiêu đề phần, rồi dòng chảy liên tục 1 cột (6x9) / 2 cột (khổ ≥ 8"): 
   ```
   #12  Fly 2 ft high  vs  Be invisible
   Why it's hard: …
   A: …   B: …
   Bonus: …
   ```
   Không cắt một mục đáp án giữa 2 trang (keep-together).
8. **Thank you page**: "Thank you for playing! If your family had fun, a short review on Amazon helps us a lot." (không chèn link/QR).

### 7.4 Thiết kế trang câu hỏi (B&W)
```
┌───────────────────────────────┐
│ SUPERPOWERS              #12  │  ← nhãn category (chữ hoa, xám 60%) + số câu
│                               │
│     Would you rather…         │  ← Baloo 2, căn giữa
│                               │
│ ┌───────────────────────────┐ │
│ │ be able to fly, but only  │ │  ← khung bo góc 0.12", viền 1pt,
│ │ 2 feet off the ground     │ │    nền xám 8–10%
│ │           ☐ P1  ☐ P2      │ │  ← ô tick vẽ bằng rect, không dùng ký tự ☐
│ └───────────────────────────┘ │
│            ( OR )             │  ← vòng tròn đen, chữ trắng
│ ┌───────────────────────────┐ │
│ │ be invisible, but only    │ │
│ │ when nobody is looking    │ │
│ │           ☐ P1  ☐ P2      │ │
│ └───────────────────────────┘ │
│                               │
│              37               │  ← số trang, căn giữa trong vùng an toàn
└───────────────────────────────┘
```
- Khối nội dung **căn giữa theo chiều dọc** trong vùng an toàn.
- 2 câu/trang: chia đôi vùng an toàn, đường kẻ đứt giữa.
- Chữ trong khung căn giữa, padding 0.2".

---

## 8. State & lưu trữ
```js
WYR.state = {
  setup:   { audience, theme, customTheme, count, style, language },
  book:    { title, subtitle, author, year, titleIdeas: [] },
  layout:  { trim: '6x9', perPage: 1, sections: { howTo, answers, chapters, yourTurn, thankYou },
             checkboxStyle: 'players', answersPlacement: 'end' },
  questions: [ { id, sourceId, cat, a, b, why_hard, a_plus, b_plus, bonus, warnings: [] } ],
  ui:      { step: 1, zoom: 1, showMargins: false }
}
```
- Lưu `localStorage['wyr-book-studio-v1']` sau mỗi thay đổi (debounce 500ms). Có version để migrate.
- Nút "Dự án mới" (xác nhận trước khi xoá).

---

## 9. Tiêu chí nghiệm thu (Claude Code tự kiểm tra trước khi báo xong)

1. Double-click `index.html` (file://), tắt mạng → mọi chức năng chạy, console không lỗi.
2. Bấm "Xem thử với dữ liệu mẫu" → preview hiện sách hoàn chỉnh ngay.
3. Để mặc định, bấm "Tạo prompt" → prompt có đủ biến đã điền, không còn `{{`.
4. Dán lần lượt 4 output mẫu (tự tạo trong test: có code fence, có chữ thừa, 1 output bị cắt) → đủ 200 câu, trùng lặp bị loại và báo.
5. PDF tải về:
   - Kích thước trang đúng khổ (6x9 → 432×648 pt).
   - Font được embed (kiểm bằng `pdffonts` nếu có, hoặc mở PDF → Document Properties → Fonts: "Embedded Subset").
   - Chữ là vector (bôi đen/copy được).
   - Mọi phần tử nằm trong lề an toàn (viết hàm `assertInSafeArea(page)` chạy trên display list, log vi phạm).
   - Gutter đúng bảng theo số trang; lề gương trang chẵn/lẻ đúng.
   - Không chữ nào < 9pt, không nét nào < 0.75pt.
   - Số trang ≥ 24.
6. Preview và PDF xuống dòng giống nhau (so sánh vài trang).
7. Sách tiếng Việt hiển thị dấu đúng trong cả preview và PDF.
8. 500 câu, 2 câu/trang, 8.5x11 → tạo PDF không treo trình duyệt (< 20s), có thanh tiến trình.
9. Màn hình 375px vẫn dùng được (left bar xếp trên).

---

## 10. Thứ tự làm việc gợi ý cho Claude Code
1. Tải `jspdf.umd.min.js` + font TTF, tạo file font base64 `.js`, kiểm tra đăng ký font.
2. `config.js`, `kdp.js` (bảng lề + test).
3. `parser.js` + `tests/parser-tests.html`.
4. `layout.js` → `render-preview.js` (dùng sample data).
5. `render-pdf.js` + kiểm tra tiêu chí 5.
6. `prompt.js` + UI 4 bước + localStorage.
7. `README.md` tiếng Việt (cách dùng + checklist upload KDP: chọn khổ, No bleed, B&W, "Low-content book" = **No** vì sách có nội dung chữ thật).
8. Chạy toàn bộ tiêu chí nghiệm thu mục 9.

---

## Phụ lục A — Checklist upload KDP (hiện trong app sau khi tải PDF)
- Paperback → Trim size: đúng khổ đã chọn · Bleed: **No bleed** · Interior: **Black & white, white paper** (hoặc cream).
- Upload file PDF interior vừa tải.
- Cover: làm riêng (app này chỉ tạo interior). Độ dày gáy tính theo số trang app hiển thị (KDP cover calculator).
- Chạy **Print Previewer** của KDP, kiểm tra không có cảnh báo lề.

## Phụ lục B — Nguồn tham khảo
- KDP — Set Trim Size, Bleed, and Margins: https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6
- KDP — Paperback Submission Guidelines: https://kdp.amazon.com/en_US/help/topic/G201857950
- Ví dụ sản phẩm bán chạy: https://www.amazon.com/Would-You-Rather-Book-Kids/dp/1072630575 · https://www.amazon.com/Ultimate-Would-Rather-Book-Kids/dp/B0D8LFHD1X/ · https://www.amazon.com/Would-Rather-Game-Book-Kids/dp/1707962421 (Yuck! edition) · https://www.amazon.com/Would-Rather-Fearless-Adventurous-Preteens/dp/B0DQJ1R4N6 (Scary edition)
- Luật chơi / tính điểm: https://gameonfamily.com/blogs/tutorials/would-you-rather · https://www.amazon.com/Would-You-Rather-Game-Book/dp/1687795347
