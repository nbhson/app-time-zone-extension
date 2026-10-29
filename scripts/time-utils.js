// Pure, DOM-free helpers shared by the popup and the node test-suite.
// Giữ module này không phụ thuộc DOM/moment instance toàn cục: mọi hàm
// nhận tham số đầu vào rõ ràng để test được bằng node.

/**
 * Escape một chuỗi để nội suy an toàn vào innerHTML (văn bản lẫn attribute).
 */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Tách timezone IANA thành { city, region }.
 * "America/Argentina/Buenos_Aires" -> { city: "Buenos Aires", region: "America / Argentina" }
 * "UTC" -> { city: "UTC", region: "" }
 */
export function splitZone(tz) {
  const parts = String(tz).split("/");
  const city = parts[parts.length - 1].replace(/_/g, " ");
  const region = parts.length > 1 ? parts.slice(0, -1).join(" / ") : "";
  return { city, region };
}

/**
 * Chuẩn hoá chuỗi query/timezone cho so khớp tìm kiếm:
 * lowercase, bỏ khoảng trắng, underscore và dấu "/".
 * Giúp "buenosaires" khớp "America/Argentina/Buenos_Aires".
 */
export function normalizeQuery(value) {
  return String(value ?? "").toLowerCase().replace(/[\s_/]/g, "");
}

/**
 * Format chênh lệch múi giờ (phút) thành nhãn ngắn gọn.
 * 330 -> "+5.5h", -150 -> "-2.5h", 0 -> "Same time", 45 -> "+0.75h"
 */
export function formatOffsetDiff(diffMinutes) {
  if (!Number.isFinite(diffMinutes) || diffMinutes === 0) return "Same time";
  const diffHours = diffMinutes / 60;
  const sign = diffHours > 0 ? "+" : "";
  return `${sign}${Number(diffHours.toFixed(2))}h`;
}

/**
 * Phân loại khung giờ cho meeting planner:
 * - "work": 09:00–16:59 (giờ làm việc chung lý tưởng)
 * - "evening": 07:00–08:59 và 17:00–21:59 (chấp nhận được)
 * - "night": phần còn lại (tránh)
 */
export function dayCategory(hour) {
  const h = Number(hour);
  if (!Number.isInteger(h) || h < 0 || h > 23) return "night";
  if (h >= 9 && h <= 16) return "work";
  if ((h >= 7 && h < 9) || (h > 16 && h < 22)) return "evening";
  return "night";
}

/**
 * Số ngày lệch giữa hai mốc (dạng "YYYY-MM-DD") — dùng cho badge +1d/-1d.
 * Trả về số nguyên (to > from => dương).
 */
export function dayDiff(fromDateStr, toDateStr) {
  const from = new Date(`${fromDateStr}T00:00:00Z`);
  const to = new Date(`${toDateStr}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.round((to - from) / 86400000);
}
