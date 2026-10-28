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
