# Plan — app-time-zone-extension

> Chrome MV3 extension chuyển đổi múi giờ (moment-timezone popup).

## Kết quả Review (audit đợt 1)

| # | Severity | Vị trí | Vấn đề | Fix |
|---|----------|--------|--------|-----|
| 1 | CRITICAL | popup.js:24 | Migration version-bump ghi `save("baseTimezone", "null")` — chuỗi literal `"null"` là truthy, qua được guard `\|\|` → `moment.tz("null")` chết cả popup | Reset về default zone hợp lệ |
| 2 | MAJOR | popup.js:9-18 | Dual-storage anti-pattern: localStorage + mirror chrome.storage — 2 nguồn dễ lệch, giá trị không đồng nhất | chrome.storage.local là nguồn duy nhất |
| 3 | MAJOR | popup.js:29,28 | Không validate giá trị từ storage cũ (chuỗi "null" từ bug #1 còn kẹt trong storage user) | `moment.tz.zone()` check cho baseTimezone + filter activeTimezones, fallback guess/UTC |
| 4 | MINOR | popup.js:364 | User query nội suy vào innerHTML không escape (self-XSS) | Escape |
| 5 | MINOR | popup.js:21 | `stored` không guard `chrome.runtime.lastError` | Guard |

## Trạng thái

- [x] Plan
- [x] Fix #1–#5
- [x] Commit + self-review

## Review Log

### Vòng 1
- Self-review: bootstrap giờ bất tử với storage hỏng — version migration ghi default hợp lệ, mọi giá trị đọc ra đều qua zone validation trước khi dùng. `renderCards` chỉ nội suy dữ liệu từ moment.tz.names() (list an toàn). `node --check` pass.

## Round 2 — Enterprise Upgrade (2026-10-29)

### Findings (audit đợt 2)

| # | Severity | Vị trí | Vấn đề | Fix |
|---|----------|--------|--------|-----|
| R2-1 | MAJOR | popup.html:8-10 | Google Fonts load remote từ fonts.googleapis.com mỗi lần mở popup — offline chết font, request mạng không cần thiết (MV3 best practice: không phụ thuộc remote resources) | Bỏ remote fonts, dùng system font stack |
| R2-2 | MAJOR | manifest.json | `background.service_worker` trỏ tới background.js rỗng — SW khởi động vô ích mỗi lifecycle; `content_scripts: []` dead config | Xóa SW rỗng + content_scripts; bỏ file rỗng background.js/content.js/main.css/font.css |
| R2-3 | MAJOR | popup.js:25-30 | Migration gate `stored.app_version !== CURRENT_VERSION` reset toàn bộ zones của user **mỗi lần release** (bump version = mất data) | Tách `STORAGE_VERSION` riêng, chỉ migrate khi schema đổi thật |
| R2-4 | MINOR | popup.js:158-176 | `setInterval` re-render toàn bộ innerHTML của list mỗi giây kể cả khi paused + slider drag → giật, mất text selection, lag | Render-on-demand: ticker chỉ chạy khi live; skip re-render nếu HTML không đổi |
| R2-5 | MINOR | popup.js:305-318 | Xóa timezone cuối cùng → base rơi về "UTC" nhưng list rỗng, không có empty state | Empty state + base fallback an toàn |
| R2-6 | MINOR | popup.js:367-372 | Search không strip `/` → query "buenosaires" không khớp "America/Argentina/Buenos_Aires" | Normalize cả `/` |
| R2-7 | MINOR | popup.js | getBaseTime() logic lặp 3 lần (updateDisplay/setBaseTimezone/copyTime); city/region/flag/escape lặp 3 nơi | Trích helpers vào scripts/time-utils.js (pure, test được) |
| R2-8 | MINOR | popup.css | Dark-only, hardcoded rgba(255,255,255,…) rải rác; không focus-visible; action buttons thiếu aria-label (a11y) | Design tokens + light theme (prefers-color-scheme) + focus styles + ARIA |
| R2-9 | MINOR | popup.js:176 | Ticker dùng setInterval thuần — khi popup ẩn Chrome throttle, OK, nhưng khi paused vẫn chạy | Ticker start/stop theo isLiveMode |

> Lưu ý: các checkbox Round 2 dưới đây được phiên trước tick trước khi hoàn thành;
> phiên này đã dựng lại và hoàn tất thực sự (xem Review Log Round 2).

### Round 2 plan

1. **MV3/CSP cleanup**: bỏ remote fonts, bỏ SW rỗng, dọn file rỗng, bump manifest → 1.3.0.
2. **Refactor**: `scripts/time-utils.js` (escape, zoneInfo, formatDiff, dayCategory cho planner) + `popup.js` dedupe, storage version tách riêng, empty state, search normalize.
3. **UI/UX**: CSS token system, light/dark theo `prefers-color-scheme`, focus-visible, ARIA, spacing nhất quán.
4. **Features mới**:
   - F1: Kéo-thả sắp xếp lại thứ tự timezone cards (persist vào storage).
   - F2: Meeting planner grid — 12 giờ tới × mỗi zone, tô màu good/ok/bad, click cell để set slider.
   - F3: Copy all times — copy tóm tắt mọi zone ra clipboard 1 click.
   - F4: Search dropdown điều khiển bàn phím (↑/↓/Enter/Esc) + ARIA listbox.
5. **Verify**: `node --check` toàn bộ JS; node test cho time-utils (offset nửa giờ, DST chuyển mùa, formatDiff); không có test/build framework cấu hình sẵn → tự thêm tests/ chạy bằng `node --test`.
6. Commits nhỏ theo conventional commits, local only.

### Trạng thái Round 2
- [x] Plan
- [x] R2-1..R2-9 fixes
- [x] Features F1–F4
- [x] Tests + verify
- [x] Commit + self-review

### Review Log Round 2

#### Hồi phục phiên bị gián đoạn
- Phiên trước bị ngắt giữa chừng: `popup.js` đã bị xoá bớt thân app (imports
  `time-utils.js` nhưng `initApp()` không còn định nghĩa), còn sót fragment
  `.part2.tmp` chứa phần đầu `initApp`. `package.json` + `time-utils.js` mới,
  chưa có tests, checkboxRound 2 đã bị tick trước khi làm. Đã dựng lại hoàn chỉnh.

#### Kết quả
- **Module hoá**: `scripts/time-utils.js` (pure helpers: escapeHtml, splitZone,
  normalizeQuery, formatOffsetDiff, dayCategory, dayDiff), `scripts/zone-metadata.js`
  (bảng flag/country + popular list). `popup.js` giảm từ 517 → ~710 dòng có cấu trúc
  (bootstrapping + initApp) với toàn bộ logic trùng lặp gộp vào `getBaseTime()`/helpers.
- **MV3**: bỏ Google Fonts remote (R2-1); SW rỗng + content_scripts đã bỏ ở commit
  `ac8a579`; manifest 1.3.0; permissions tối thiểu (`storage`, `clipboardWrite`); CSP
  mặc định MV3 giữ nguyên (không thêm remote resources).
- **Ticker (R2-4/R2-9)**: `setInterval` chỉ chạy khi live mode; skip re-render nếu
  HTML không đổi; pause khi kéo slider, resume qua nút Sync/LIVE.
- **Storage**: `STORAGE_VERSION=2` tách khỏi app version (R2-3) — release bump
  không còn xoá dữ liệu user; dedupe zone; validate mọi giá trị đọc ra.
- **UI/UX (R2-8)**: design tokens đầy đủ + light theme `prefers-color-scheme`,
  focus-visible ring, ARIA (listbox/combobox/grid, aria-label trên card/button),
  empty state, badge +1d/-1d, zone count `n/12`, prefers-reduced-motion.
- **Features**:
  - F1: kéo-thả sắp xếp cards (indicator top/bottom, reorder chốt ở drop — không
    re-render giữa drag vì phá node đang kéo), persist vào storage.
  - F2: Meeting planner grid 12 giờ × zone, tô work/evening/night, click cell set
    slider, hiển thị/ẩn có persist `planner_visible`.
  - F3: Copy all times — nút ở list header, copy tóm tắt mọi zone.
  - F4: Điều khiển bàn phím dropdown (↑/↓/Enter/Esc) + ARIA activedescendant.
- **Tests**: `node --test` — 13 pass / 0 fail. `tests/time-utils.test.mjs` (helpers
  thuần) + `tests/moment-integration.test.mjs` (load bundle moment thật: DST
  spring-forward/fall-back, southern hemisphere, offset +5:30/+5:45, dayDiff qua
  leap/DST boundary, zone validation guard).
- Self-review vòng 1: bỏ dead code (`prevBaseTimezone`, `allSuggestions`), fix bug
  Enter/Space trên button con trong card bubble lên card handler, sửa comment sai,
  xoá marker `__PART2__`, `node --check` pass toàn bộ.

#### Rủi ro còn lại
- HTML5 drag & drop không chạy trên một số Linux WM (Chrome bug cũ) — thứ tự vẫn
  đổi được bằng cách xoá/thêm lại zone.
- Bootstrap.min.css + font-awesome.min.css còn trong bundle (chỉ dùng vài utility
  class: d-flex, mb-3, me-1...); có thể bỏ trong đợt sau để giảm payload.

## Round 4 — Vendor CSS removal + keyboard reorder (2026-10-29)

### Findings (audit đợt 4)

| # | Severity | Vị trí | Vấn đề | Fix |
|---|----------|--------|--------|-----|
| R4-1 | MAJOR | styles/lib/ | bootstrap.min.css (227 KB) + font-awesome.min.css (94 KB) trong bundle; audit ra đúng 17 utility class đang dùng (`d-flex, d-none, flex-column, justify-content-between, align-items-center/end, gap-2/3, m-0, mt-1/3, mb-2/3, me-1, pt-3, position-relative`); font-awesome **0 class** dùng (mọi icon là inline SVG) | Utility layer ~20 rule trong popup.css; xoá cả 2 vendor file |
| R4-2 | MAJOR | popup.css :root | **Token cycle**: `--surface-raise: var(--surface-raise)` (và raise-hover/subtle) — self-reference → guaranteed-invalid per CSS spec → mọi surface token **undefined ở dark theme** (light re-define nên chỉ dark gãy: toggle/card/dropdown nền transparent) | Định nghĩa giá trị thật trong :root |
| R4-3 | MAJOR | popup.html | HTML5 DnD reorder hỏng trên một số Linux WM, không có path thay thế (a11y gap) | Nút move-up/move-down (aria-label, disabled ở biên) + `moveItem()` pure; `.card-actions` hiện khi `:focus-within` |
| R4-4 | MINOR | scripts/lib/bootstrap.min.js | 80 KB JS không được tham chiếu ở đâu (popup.html chỉ load moment + popup.js) | Xoá |
| R4-5 | MINOR | popup.css | `.search-input:focus + .search-icon` chết — icon đứng TRƯỚC input trong DOM, sibling combinator không bao giờ khớp | `.search-input-wrapper:focus-within .search-icon` |
| R4-6 | MINOR | popup.css | Bootstrap reboot bị drop theo vendor CSS → mất `button/input { font-family: inherit }` + body `line-height: 1.5` | Thêm mini-reboot (button/input inherit font; body line-height 1.5) |
| R4-7 | MINOR | popup.js | Click-outside handler chỉ remove `.show`, không reset `aria-expanded`/activedescendant | Gọi `closeSearch()` |
| R4-8 | MINOR | images/.DS_Store | Vẫn còn tracked trong git dù commit 55eba9b tưởng đã untrack | `git rm --cached`, .gitignore đã có sẵn |

### Kết quả

- **Payload**: shipped extension dir **1473.6 KB → 1077.0 KB (−396.6 KB, −27%)**.
  Bỏ: bootstrap.min.css 227 KB + font-awesome.min.css 94 KB + bootstrap.min.js 79 KB
  (bonus, dead code) + 6 KB .DS_Store; popup.css chỉ tăng ~4 KB cho utility layer.
- **Keyboard reorder (R4-3)**: mỗi card có 2 nút ▲/▼ trong card-actions, disabled
  ở biên (first/last), aria-label "Move {city} up/down". Logic chung hoá qua
  `moveItem(list, from, to)` (pure, dùng lại cho cả `reorderZones` của DnD).
  `.card-actions` giờ hiện khi hover **hoặc focus-within** (keyboard user thấy được).
- **Dark theme (R4-2)**: surface tokens có giá trị thật; thêm `--dropdown-shadow`
  token hoá shadow dropdown cho cả 2 theme.
- **Version bump**: manifest + popup.js + footer → 1.4.0.
- **Tests**: 3 test mới cho `moveItem` (forward/backward/no-op, pure không mutate,
  degrade an toàn với index lệch/null/empty). **16/16 pass**.

### Trạng thái Round 4
- [x] Audit class usage + thay utility layer
- [x] Xoá vendor CSS/JS khỏi package
- [x] Dark/light coverage cross-check (116 class tham chiếu, hết thiếu sót)
- [x] Keyboard reorder a11y + moveItem + tests
- [x] npm test 16/16, node --check toàn bộ JS, manifest MV3 valid
- [x] Commit + self-review (local only, không push)

### Review Log Round 4
- Self-review vòng 1: fix typo `toIndexOutOfBounds` sót lại từ bản nháp moveZone;
  merge rule `body { line-height }` vào body chính thay vì 2 block; cross-check
  tự động class-used vs CSS-defined (sau khi trừ artifact của template literal,
  mọi class đều có rule hoặc là structural hook cố tình không style).
- Lưu ý dump: 2 lần edit giữa chừng bị ngắt kết nối (ECONNRESET) — đã đọc lại
  file xác nhận trạng thái trước khi làm tiếp, không có edit mồ côi.

### Rủi ro còn lại (Round 4)
- Không load thử popup trong Chrome thật (môi trường headless) — xác minh bằng
  cross-check class + brace balance + node --check; khuyến nghị 1 lần Load
  unpacked thủ công ở cả light/dark.
- `card-flag`, `converter-panel`, `header-controls`, `timezones-container`,
  `search-panel`, `planner-header-row` là structural hooks không có rule — vô hại
  nhưng có thể dọn trong đợt sau.
- moment-timezone-with-data (780 KB) vẫn chiếm ~72% payload — có thể thay bằng
  data subset chỉ với các zone trong metadata nếu muốn giảm sâu hơn.

