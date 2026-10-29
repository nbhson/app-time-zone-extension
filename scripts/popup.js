import {
  escapeHtml,
  splitZone,
  normalizeQuery,
  formatOffsetDiff,
  dayCategory,
  dayDiff,
  moveItem,
} from "./time-utils.js";
import { timezoneMetadata, popularTimezones } from "./zone-metadata.js";

document.addEventListener("DOMContentLoaded", function () {
  // --- Storage: chrome.storage.local là nguồn DUY NHẤT (MV3 best practice).
  // Round 1 đã bỏ dual-storage (localStorage + mirror). Round 2: tách
  // STORAGE_VERSION khỏi app version — chỉ migrate khi schema đổi thật,
  // không xoá dữ liệu user mỗi lần release bump version.
  const CURRENT_APP_VERSION = "1.4.0";
  const STORAGE_VERSION = 2;
  const FORMAT_12H = "DD-MMM-YYYY hh:mm:ss A";
  const FORMAT_24H = "DD-MMM-YYYY HH:mm:ss";
  const PLANNER_HOURS = 12;
  const MAX_CARDS = 12;

  const DEFAULT_TIMEZONES = ["Asia/Ho_Chi_Minh", "Asia/Kolkata", "Europe/Dublin"];

  let format = FORMAT_12H;
  let activeTimezones = [];
  let baseTimezone = DEFAULT_TIMEZONES[0];

  function save(key, value) {
    chrome.storage.local.set({ [key]: String(value) }, () => {
      if (chrome.runtime.lastError) console.warn("storage.save failed:", chrome.runtime.lastError.message);
    });
  }

  const saveZones = () => save("activeTimezones", JSON.stringify(activeTimezones));

  // Bootstrap từ chrome.storage. Mọi giá trị đọc ra đều qua zone validation
  // trước khi dùng (chống storage hỏng / rác từ phiên bản cũ).
  chrome.storage.local.get(["format", "activeTimezones", "baseTimezone", "app_version", "storage_version", "planner_visible"], (stored) => {
    if (chrome.runtime.lastError) stored = {};

    // Migration schema: chỉ đánh dấu phiên bản storage, KHÔNG reset zones
    // của user (Round 1 từng reset theo app version — mất data mỗi release).
    // Giá trị hỏng sẽ bị validation bên dưới xử lý.
    if (stored.storage_version !== String(STORAGE_VERSION)) {
      save("storage_version", STORAGE_VERSION);
      save("app_version", CURRENT_APP_VERSION);
    }

    format = stored.format === FORMAT_12H || stored.format === FORMAT_24H ? stored.format : FORMAT_12H;
    try { activeTimezones = JSON.parse(stored.activeTimezones ?? "null"); } catch { activeTimezones = null; }
    baseTimezone = stored.baseTimezone || DEFAULT_TIMEZONES[0];

    // Validate baseTimezone: chặn giá trị hỏng từ storage cũ (vd chuỗi "null")
    if (!moment.tz.zone(baseTimezone)) {
      const guessed = moment.tz.guess();
      baseTimezone = DEFAULT_TIMEZONES.includes(guessed) ? guessed : "UTC";
      save("baseTimezone", baseTimezone);
    }

    if (!Array.isArray(activeTimezones)) {
      activeTimezones = DEFAULT_TIMEZONES.slice();
      saveZones();
    }
    // Lọc bỏ timezone không hợp lệ / trùng lặp, giữ thứ tự
    const seen = new Set();
    activeTimezones = activeTimezones.filter(tz => {
      if (!moment.tz.zone(tz) || seen.has(tz)) return false;
      seen.add(tz);
      return true;
    });
    if (!activeTimezones.length) {
      activeTimezones = DEFAULT_TIMEZONES.slice();
      saveZones();
    }
    initApp(stored.planner_visible === "true");
  });

  function initApp(plannerVisibleDefault) {
  const allTimezoneNames = moment.tz.names();

  // --- DOM Elements ---
  const formatCheckbox = document.getElementById("format-checkbox");
  const liveIndicator = document.getElementById("live-indicator");
  const btnSyncTime = document.getElementById("btn-sync-time");
  const sliderTimeLabel = document.getElementById("slider-time-label");
  const sliderDateLabel = document.getElementById("slider-date-label");
  const timeSlider = document.getElementById("time-slider");
  const timezoneSearch = document.getElementById("timezone-search");
  const clearSearchBtn = document.getElementById("clear-search-btn");
  const searchResults = document.getElementById("search-results");
  const timezoneList = document.getElementById("timezone-list");
  const zoneCount = document.getElementById("zone-count");
  const btnCopyAll = document.getElementById("btn-copy-all");
  const btnPlanner = document.getElementById("btn-planner");
  const plannerSection = document.getElementById("planner-section");
  const plannerGrid = document.getElementById("planner-grid");
  const plannerToggle = document.getElementById("planner-toggle");

  // --- State ---
  let isLiveMode = true;
  let ticker = null;
  let lastCardsHtml = null;
  let lastPlannerHtml = null;
  let plannerVisible = plannerVisibleDefault;
  let activeSuggestion = -1; // keyboard navigation index cho dropdown

  // --- Initial Config Setup ---
  formatCheckbox.checked = (format === FORMAT_12H);

  // ===== Helpers =====

  // Mốc thời gian gốc theo baseTimezone: live = hiện tại, paused = theo slider.
  // (Dedup: trước đây logic này lặp 3 lần — updateDisplay/setBaseTimezone/copyTime.)
  function getBaseTime() {
    if (isLiveMode) return moment();
    const hours = Math.floor(timeSlider.value / 60);
    const minutes = timeSlider.value % 60;
    return moment.tz(baseTimezone).hours(hours).minutes(minutes).seconds(0).milliseconds(0);
  }

  function zoneMeta(tz) {
    return timezoneMetadata[tz] || {};
  }

  function flagOf(tz) {
    return timezoneMetadata[tz]?.flag || "📍";
  }

  function setLiveModeUI() {
    btnSyncTime.classList.toggle("d-none", isLiveMode);
    liveIndicator.classList.toggle("paused", !isLiveMode);
  }

  function startTicker() {
    if (ticker) return;
    ticker = setInterval(updateDisplay, 1000);
  }

  function stopTicker() {
    clearInterval(ticker);
    ticker = null;
  }

  // ===== Core Display =====

  function updateDisplay() {
    if (isLiveMode) {
      const now = moment().tz(baseTimezone);
      const sliderVal = now.hours() * 60 + now.minutes();
      if (timeSlider.value !== String(sliderVal)) timeSlider.value = sliderVal;
    }
    const baseTime = getBaseTime();
    renderCards(baseTime);
    renderPlanner(baseTime);
    updateSliderLabels(baseTime);
  }

  // ===== Time Cards =====

  function renderCards(baseTime) {
    const baseTimeInBaseTz = baseTime.clone().tz(baseTimezone);
    const showAmPm = (format === FORMAT_12H);
    const baseDateStr = baseTimeInBaseTz.format("YYYY-MM-DD");
    zoneCount.textContent = `${activeTimezones.length}/${MAX_CARDS}`;

    if (!activeTimezones.length) {
      lastCardsHtml = "";
      timezoneList.innerHTML = `
        <div class="empty-state" role="status">
          <span class="empty-state-icon">🌍</span>
          <p class="empty-state-title">No time zones yet</p>
          <p class="empty-state-hint">Use the search box above to add a city or timezone.</p>
        </div>`;
      return;
    }

    let html = "";
    activeTimezones.forEach((tz, idx) => {
      const isBase = (tz === baseTimezone);
      const isFirst = (idx === 0);
      const isLast = (idx === activeTimezones.length - 1);
      const cardTime = baseTime.clone().tz(tz);
      const timeFormatted = cardTime.format(showAmPm ? "hh:mm:ss" : "HH:mm:ss");
      const ampm = showAmPm ? cardTime.format("A") : "";
      const dateFormatted = cardTime.format("ddd, MMM D");

      // Offset diff so với base (hỗ trợ offset lẻ nửa giờ — 5h30, 9h30…)
      const diffMinutes = cardTime.utcOffset() - baseTimeInBaseTz.utcOffset();
      const offsetLabel = isBase ? "Base" : formatOffsetDiff(diffMinutes);
      const offsetBadge = `<span class="card-offset-badge">${offsetLabel}</span>`;

      // Ngày lệch so với base (+1d/-1d), xử lý cả DST/year boundary qua moment
      const diffDays = dayDiff(baseDateStr, cardTime.format("YYYY-MM-DD"));
      let relativeDayText = "";
      if (diffDays > 0) relativeDayText = `<span class="day-badge day-ahead">+${diffDays}d</span>`;
      else if (diffDays < 0) relativeDayText = `<span class="day-badge day-behind">${diffDays}d</span>`;

      const { city, region } = splitZone(tz);
      const meta = zoneMeta(tz);
      const countryDisplay = meta.country
        ? (region ? `${escapeHtml(meta.country)} (${escapeHtml(region)})` : escapeHtml(meta.country))
        : escapeHtml(region || "Global");
      const flag = escapeHtml(flagOf(tz));

      html += `
        <div class="timezone-card ${isBase ? "is-base" : ""}" data-timezone="${escapeHtml(tz)}" draggable="true" role="button" tabindex="0" aria-pressed="${isBase}" aria-label="${escapeHtml(city)}: ${escapeHtml(cardTime.format(format))}${isBase ? " (base)" : ""}. Click to set as reference zone.">
            <div class="card-left">
                <div class="card-title-row">
                    <span class="card-flag me-1" aria-hidden="true">${flag}</span>
                    <span class="card-city">${escapeHtml(city)}</span>
                    ${offsetBadge}
                </div>
                <span class="card-region">${countryDisplay}</span>
                <span class="card-date mt-1">
                    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="me-1" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    ${escapeHtml(dateFormatted)} ${relativeDayText}
                </span>
            </div>
            <div class="card-right">
                <div class="card-time-display">
                    <span class="card-time-num">${escapeHtml(timeFormatted)}</span>
                    ${ampm ? `<span class="card-ampm ${ampm.toLowerCase()}">${ampm}</span>` : ""}
                </div>
                <div class="card-actions">
                    <button class="action-btn move move-up" title="Move up" aria-label="Move ${escapeHtml(city)} up in the list"${isFirst ? " disabled" : ""}>
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 3 15"></polyline></svg>
                    </button>
                    <button class="action-btn move move-down" title="Move down" aria-label="Move ${escapeHtml(city)} down in the list"${isLast ? " disabled" : ""}>
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </button>
                    <button class="action-btn copy" title="Copy formatted time" aria-label="Copy time for ${escapeHtml(city)}">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                    <button class="action-btn delete" title="Remove timezone" aria-label="Remove ${escapeHtml(city)}">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                </div>
            </div>
        </div>
      `;
    });

    // Skip-if-unchanged: tránh phá DOM (mất text selection, giật slider)
    // khi kết quả render giống hệt lần trước (R2-4).
    if (html === lastCardsHtml) return;
    lastCardsHtml = html;
    timezoneList.innerHTML = html;
  }

  function updateSliderLabels(baseTime) {
    const baseTimeInBaseTz = baseTime.clone().tz(baseTimezone);
    const showAmPm = (format === FORMAT_12H);
    const timeFormatted = baseTimeInBaseTz.format(showAmPm ? "hh:mm A" : "HH:mm");
    const dateFormatted = baseTimeInBaseTz.format("dddd, MMM D");
    const { city } = splitZone(baseTimezone);
    const flag = flagOf(baseTimezone);
    sliderTimeLabel.textContent = timeFormatted;
    sliderDateLabel.textContent = `${flag} ${dateFormatted} (${city})`;
  }

  // ===== Meeting Planner (F2) =====
  // Lưới 12 giờ tới (từ giờ đang chọn ở base) × mỗi zone; ô tô màu
  // work/evening/night theo giờ địa phương của zone đó. Click 1 cell để set slider.
  function renderPlanner(baseTime) {
    if (!plannerSection || !plannerVisible) return;
    const baseTimeInBaseTz = baseTime.clone().tz(baseTimezone);
    const startHour = baseTimeInBaseTz.hours();
    const baseDateStr = baseTimeInBaseTz.format("YYYY-MM-DD");

    let html = `<div class="planner-row planner-header-row" role="row">
      <div class="planner-zone-label" role="columnheader">Zone</div>`;
    for (let i = 0; i < PLANNER_HOURS; i++) {
      const h = (startHour + i) % 24;
      const label = format === FORMAT_12H ? moment({ h }).format("h A") : String(h).padStart(2, "0");
      html += `<div class="planner-hour-label" role="columnheader">${i === 0 ? "Now" : escapeHtml(label)}</div>`;
    }
    html += `</div>`;

    activeTimezones.forEach(tz => {
      const isBase = (tz === baseTimezone);
      const { city } = splitZone(tz);
      html += `<div class="planner-row" role="row">
        <div class="planner-zone-label ${isBase ? "is-base" : ""}" role="rowheader" title="${escapeHtml(tz)}">${isBase ? "★ " : ""}${escapeHtml(splitZone(tz).city)}</div>`;
      for (let i = 0; i < PLANNER_HOURS; i++) {
        const cellTime = baseTime.clone().tz(tz).add(i, "hours");
        const hour = cellTime.hours();
        const cat = dayCategory(hour);
        const dayDelta = dayDiff(baseDateStr, cellTime.format("YYYY-MM-DD"));
        const dayMark = dayDelta > 0 ? `+${dayDelta}d` : (dayDelta < 0 ? `${dayDelta}d` : "");
        html += `<button class="planner-cell ${cat} ${i === 0 ? "is-now" : ""}" data-hour="${i}" data-timezone="${escapeHtml(tz)}"
          role="gridcell" title="${escapeHtml(city)} — ${escapeHtml(cellTime.format("ddd HH:mm"))}${dayMark ? " (" + dayMark + ")" : ""}"
          aria-label="${escapeHtml(city)} ${escapeHtml(cellTime.format("ha"))} ${cat}${dayMark ? " " + dayMark : ""}">${escapeHtml(String(hour).padStart(2, "0"))}</button>`;
      }
      html += `</div>`;
    });

    if (html === lastPlannerHtml) return;
    lastPlannerHtml = html;
    plannerGrid.innerHTML = html;
    plannerGrid.setAttribute("role", "grid");
    plannerGrid.setAttribute("aria-label", "Meeting planner: hour suitability per timezone");
  }

  function togglePlanner(force) {
    plannerVisible = typeof force === "boolean" ? force : !plannerVisible;
    plannerToggle.setAttribute("aria-expanded", String(plannerVisible));
    btnPlanner.setAttribute("aria-pressed", String(plannerVisible));
    save("planner_visible", plannerVisible);
    if (plannerVisible) {
      plannerSection.classList.remove("d-none");
      renderPlanner(getBaseTime());
    } else {
      plannerSection.classList.add("d-none");
      lastPlannerHtml = null;
    }
  }
  // ===== Base Timezone =====

  function setBaseTimezone(timezone) {
    if (baseTimezone === timezone) return;
    const oldBaseTimezone = baseTimezone;
    baseTimezone = timezone;
    save("baseTimezone", baseTimezone);

    // Sync slider để conversion giờ tùy chỉnh giữ nhất quán qua đổi base
    if (isLiveMode) {
      const baseTime = moment().tz(baseTimezone);
      timeSlider.value = baseTime.hours() * 60 + baseTime.minutes();
    } else {
      const prevHours = Math.floor(timeSlider.value / 60);
      const prevMinutes = timeSlider.value % 60;
      const oldBaseTime = moment.tz(oldBaseTimezone).hours(prevHours).minutes(prevMinutes).seconds(0);
      const newBaseTime = oldBaseTime.clone().tz(baseTimezone);
      timeSlider.value = newBaseTime.hours() * 60 + newBaseTime.minutes();
    }

    updateDisplay();
  } // ===== Remove Timezone =====

  function removeTimezone(timezone, cardElement) {
    cardElement.classList.add("fade-out");
    cardElement.addEventListener("animationend", () => {
      activeTimezones = activeTimezones.filter(tz => tz !== timezone);
      saveZones();

      if (baseTimezone === timezone) {
        // R2-5: fallback base an toàn — zone đầu còn lại, nếu rỗng thì UTC
        baseTimezone = activeTimezones[0] || "UTC";
        save("baseTimezone", baseTimezone);
      }
      lastCardsHtml = null; // force re-render (empty state có thể khác layout)
      updateDisplay();
    }, { once: true });
  }

  // ===== Clipboard =====

  function flashCopied(button, originalHTML) {
    button.classList.add("copied");
    const originalTitle = button.getAttribute("title");
    button.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    button.title = "Copied!";
    setTimeout(() => {
      button.classList.remove("copied");
      button.innerHTML = originalHTML;
      button.title = originalTitle;
    }, 1500);
  }

  function copyTime(timezone, button) {
    const cardTime = getBaseTime().clone().tz(timezone);
    const { city } = splitZone(timezone);
    const textToCopy = `${city}: ${cardTime.format(format)} (GMT${cardTime.format("Z")})`;
    navigator.clipboard.writeText(textToCopy)
      .then(() => flashCopied(button, button.innerHTML))
      .catch(err => console.error("Failed to copy time:", err));
  }

  // F3: Copy tóm tắt mọi zone ra clipboard 1 click
  function copyAllTimes() {
    if (!activeTimezones.length) return;
    const baseTime = getBaseTime();
    const lines = activeTimezones.map(tz => {
      const t = baseTime.clone().tz(tz);
      const { city } = splitZone(tz);
      const marker = tz === baseTimezone ? " [base]" : "";
      return `${city}${marker}: ${t.format(format)} (GMT${t.format("Z")})`;
    });
    const header = `Times (${baseTime.clone().tz(baseTimezone).format("YYYY-MM-DD")}):`;
    navigator.clipboard.writeText([header, ...lines].join("\n"))
      .then(() => {
        btnCopyAll.classList.add("copied");
        btnCopyAll.title = "Copied!";
        setTimeout(() => btnCopyAll.classList.remove("copied"), 1500);
      })
      .catch(err => console.error("Clipboard write failed:", err));
  }

  // ===== Live / Sync =====

  function syncLive() {
    isLiveMode = true;
    setLiveModeUI();
    startTicker();
    updateDisplay();
  }

  function pauseLive() {
    isLiveMode = false;
    stopTicker();
    setLiveModeUI();
  }

  // ===== Autocomplete & Search =====

  function getSuggestions(query) {
    if (!query) return popularTimezones;
    const cleanQuery = normalizeQuery(query);
    // R2-6: normalize cả "/" — "buenosaires" khớp "America/Argentina/Buenos_Aires"
    return allTimezoneNames.filter(tz => {
      const cleanTz = normalizeQuery(tz);
      const meta = zoneMeta(tz);
      const cleanCountry = meta.country ? normalizeQuery(meta.country) : "";
      return cleanTz.includes(cleanQuery) || cleanCountry.includes(cleanQuery);
    }).slice(0, 15);
  }

  function renderSearchAutocomplete(query) {
    const suggestions = getSuggestions(query);
    activeSuggestion = -1;

    if (suggestions.length === 0) {
      searchResults.innerHTML = `<div class="no-results">No countries or timezones found for "${escapeHtml(query)}"</div>`;
      searchResults.classList.add("show");
      timezoneSearch.setAttribute("aria-expanded", "true");
      return;
    }

    let html = "";
    suggestions.forEach(tz => {
      const { city, region } = splitZone(tz);
      const offset = moment.tz(tz).format("Z");
      const meta = zoneMeta(tz);
      const flag = flagOf(tz);
      const subText = meta.country ? `${meta.country} (${region})` : (region || "Global");
      const added = activeTimezones.includes(tz);
      html += `
        <div class="autocomplete-item" id="suggestion-${tz.replace(/[^a-zA-Z0-9]/g, "-")}" role="option" aria-selected="false" data-timezone="${escapeHtml(tz)}"${added ? ' data-added="true"' : ""}>
            <div class="d-flex flex-column">
                <span><span class="me-1" aria-hidden="true">${escapeHtml(flag)}</span><strong>${escapeHtml(city)}</strong>${added ? '<span class="added-badge">added</span>' : ""}</span>
                <span class="card-region">${escapeHtml(subText)}</span>
            </div>
            <span class="timezone-offset">GMT${offset}</span>
        </div>
      `;
    });

    searchResults.innerHTML = html;
    searchResults.classList.add("show");
    timezoneSearch.setAttribute("aria-expanded", "true");
  }

  function closeSearch() {
    searchResults.classList.remove("show");
    searchResults.innerHTML = "";
    activeSuggestion = -1;
    timezoneSearch.setAttribute("aria-expanded", "false");
    timezoneSearch.removeAttribute("aria-activedescendant");
  }

  function selectSuggestion(tz) {
    if (!moment.tz.zone(tz)) return;
    if (activeTimezones.includes(tz)) {
      // Đã có trong danh sách — chỉ đóng dropdown, không thêm trùng
      timezoneSearch.value = "";
      clearSearchBtn.classList.add("d-none");
      searchResults.classList.remove("show");
      return;
    }
    if (activeTimezones.length >= MAX_CARDS) {
      searchResults.innerHTML = `<div class="no-results">Maximum ${MAX_CARDS} timezones reached</div>`;
      searchResults.classList.add("show");
      return;
    }
    activeTimezones.push(tz);
    saveZones();
    lastCardsHtml = null;
    updateDisplay();

    // Animation cho card vừa thêm
    setTimeout(() => {
      const cards = timezoneList.querySelectorAll(".timezone-card");
      const lastCard = cards[cards.length - 1];
      if (lastCard && lastCard.dataset.timezone === tz) lastCard.classList.add("fade-in");
    }, 50);

    timezoneSearch.value = "";
    clearSearchBtn.classList.add("d-none");
    searchResults.classList.remove("show");
    searchResults.innerHTML = "";
    timezoneSearch.setAttribute("aria-expanded", "false");
  }

  // F4: điều khiển bàn phím cho dropdown (↑/↓/Enter/Esc)
  function moveSuggestion(delta) {
    const items = searchResults.querySelectorAll(".autocomplete-item");
    if (!items.length) return;
    activeSuggestion = (activeSuggestion + delta + items.length) % items.length;
    items.forEach((el, i) => {
      const isActive = i === activeSuggestion;
      el.classList.toggle("active", isActive);
      el.setAttribute("aria-selected", String(isActive));
      if (isActive) {
        el.scrollIntoView({ block: "nearest" });
        timezoneSearch.setAttribute("aria-activedescendant", el.id);
      }
    });
  }

  function applyActiveSuggestion() {
    if (activeSuggestion < 0) return false;
    const items = searchResults.querySelectorAll(".autocomplete-item");
    const item = items[activeSuggestion];
    if (!item) return false;
    selectSuggestion(item.dataset.timezone);
    return true;
  }

  // ===== Drag & Drop reorder (F1) =====

  let dragSourceTz = null;

  function handleDragStart(e) {
    const card = e.target.closest(".timezone-card");
    if (!card) return;
    dragSourceTz = card.dataset.timezone;
    card.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", dragSourceTz); } catch { /* IE compat không cần */ }
  }

  function handleDragOver(e) {
    const card = e.target.closest(".timezone-card");
    if (!card || !dragSourceTz || card.dataset.timezone === dragSourceTz) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    // Chỉ hiển thị indicator — KHÔNG re-render giữa chừng (re-render phá
    // node đang kéo → drag bị huỷ giữa đường). Thứ tự chốt ở "drop".
    timezoneList.querySelectorAll(".drag-over-top, .drag-over-bottom").forEach(el =>
      el.classList.remove("drag-over-top", "drag-over-bottom"));
    const rect = card.getBoundingClientRect();
    card.classList.add((e.clientY - rect.top) < rect.height / 2 ? "drag-over-top" : "drag-over-bottom");
  }

  function reorderZones(sourceTz, targetTz, before) {
    const fromIdx = activeTimezones.indexOf(sourceTz);
    const targetIdx = activeTimezones.indexOf(targetTz);
    if (fromIdx < 0 || targetIdx < 0) return;
    // Dịch target nếu kéo xuống dưới (remove trước khi insert làm lệch index)
    const adjusted = fromIdx < targetIdx && !before ? targetIdx - 1 : targetIdx;
    activeTimezones = moveItem(activeTimezones, fromIdx, adjusted);
    lastCardsHtml = null;
  }

  // Round 4: reorder bằng bàn phím (move-up/move-down buttons) — không phụ thuộc
  // HTML5 drag & drop, vốn hỏng trên một số Linux WM. Cũng chính là a11y path.
  function moveZone(timezone, delta) {
    const fromIdx = activeTimezones.indexOf(timezone);
    const toIdx = fromIdx + delta;
    if (fromIdx < 0 || toIdx < 0 || toIdx >= activeTimezones.length) return;
    activeTimezones = moveItem(activeTimezones, fromIdx, toIdx);
    saveZones();
    lastCardsHtml = null;
    updateDisplay();
  }

  function handleDragEnd() {
    dragSourceTz = null;
    timezoneList.querySelectorAll(".dragging, .drag-over-top, .drag-over-bottom")
      .forEach(el => el.classList.remove("dragging", "drag-over-top", "drag-over-bottom"));
  }
  // ===== Event Listeners =====

  // Card Event Delegation (Base select / Reorder / Copy / Delete)
  timezoneList.addEventListener("click", (e) => {
    const card = e.target.closest(".timezone-card");
    if (!card) return;
    const timezone = card.dataset.timezone;

    const deleteBtn = e.target.closest(".action-btn.delete");
    if (deleteBtn) {
      e.stopPropagation();
      removeTimezone(timezone, card);
      return;
    }

    const moveUpBtn = e.target.closest(".action-btn.move-up");
    if (moveUpBtn && !moveUpBtn.disabled) {
      e.stopPropagation();
      moveZone(timezone, -1);
      return;
    }

    const moveDownBtn = e.target.closest(".action-btn.move-down");
    if (moveDownBtn && !moveDownBtn.disabled) {
      e.stopPropagation();
      moveZone(timezone, 1);
      return;
    }

    const copyBtn = e.target.closest(".action-btn.copy");
    if (copyBtn) {
      e.stopPropagation();
      copyTime(timezone, copyBtn);
      return;
    }

    setBaseTimezone(timezone);
  });

  // Keyboard a11y cho card (Enter/Space = set base).
  // Nếu focus đang nằm trên button con (move/copy/delete) thì bỏ qua — để
  // button tự xử lý phím, tránh set base ngoài ý muốn.
  timezoneList.addEventListener("keydown", (e) => {
    if (e.target.closest(".card-actions")) return;
    const card = e.target.closest(".timezone-card");
    if (!card || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    setBaseTimezone(card.dataset.timezone);
  });

  // Slider drag: pause live, hiển thị nút Sync
  timeSlider.addEventListener("input", () => {
    pauseLive();
    updateDisplay();
  });

  liveIndicator.addEventListener("click", () => {
    if (!isLiveMode) syncLive();
  });
  btnSyncTime.addEventListener("click", syncLive);

  formatCheckbox.addEventListener("change", () => {
    format = formatCheckbox.checked ? FORMAT_12H : FORMAT_24H;
    save("format", format);
    updateDisplay();
  });

  // Planner + copy all
  btnPlanner.addEventListener("click", () => togglePlanner());
  plannerToggle.addEventListener("click", () => togglePlanner());
  btnCopyAll.addEventListener("click", copyAllTimes);

  // Click ô planner → set slider về giờ đó (theo base tz)
  plannerGrid.addEventListener("click", (e) => {
    const cell = e.target.closest(".planner-cell");
    if (!cell) return;
    const hourOffset = Number(cell.dataset.hour);
    if (!Number.isInteger(hourOffset)) return;
    const target = getBaseTime().clone().tz(baseTimezone).startOf("hour").add(hourOffset, "hours");
    timeSlider.value = target.hours() * 60 + target.minutes();
    pauseLive();
    updateDisplay();
  });

  // Search events
  timezoneSearch.addEventListener("input", (e) => {
    const query = e.target.value.trim();
    clearSearchBtn.classList.toggle("d-none", !query);
    renderSearchAutocomplete(query);
  });

  timezoneSearch.addEventListener("focus", () => {
    renderSearchAutocomplete(timezoneSearch.value.trim());
  });

  timezoneSearch.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveSuggestion(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveSuggestion(-1);
    } else if (e.key === "Enter") {
      if (applyActiveSuggestion()) e.preventDefault();
    } else if (e.key === "Escape") {
      closeSearch();
      timezoneSearch.blur();
    }
  });

  clearSearchBtn.addEventListener("click", () => {
    timezoneSearch.value = "";
    clearSearchBtn.classList.add("d-none");
    renderSearchAutocomplete("");
    timezoneSearch.focus();
  });

  // Close search suggestions on outer click (cũng reset aria-expanded/state)
  document.addEventListener("click", (e) => {
    if (!timezoneSearch.contains(e.target) && !searchResults.contains(e.target)) {
      closeSearch();
    }
  });

  searchResults.addEventListener("click", (e) => {
    const item = e.target.closest(".autocomplete-item");
    if (!item) return;
    selectSuggestion(item.dataset.timezone);
  });

  // Copy-all feedback state is handled inside copyAllTimes()

  // Drag reorder events (delegation trên container)
  timezoneList.addEventListener("dragstart", handleDragStart);
  timezoneList.addEventListener("dragover", handleDragOver);
  timezoneList.addEventListener("drop", (e) => {
    e.preventDefault();
    const card = e.target.closest(".timezone-card");
    if (card && dragSourceTz && card.dataset.timezone !== dragSourceTz) {
      const rect = card.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      reorderZones(dragSourceTz, card.dataset.timezone, before);
      saveZones();
      updateDisplay();
    }
    handleDragEnd();
  });
  timezoneList.addEventListener("dragend", handleDragEnd);

  // Init: sync slider + render lần đầu, ticker chỉ chạy khi live (R2-9)
  const initialBaseTime = moment().tz(baseTimezone);
  timeSlider.value = initialBaseTime.hours() * 60 + initialBaseTime.minutes();
  setLiveModeUI();
  togglePlanner(plannerVisible);
  updateDisplay();
  startTicker();
  } // end initApp
}); // end DOMContentLoaded
