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
