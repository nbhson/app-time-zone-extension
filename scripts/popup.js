document.addEventListener("DOMContentLoaded", function () {
  // --- State Initialization ---
  let format = localStorage.getItem("format") || "DD-MMM-YYYY hh:mm:ss A"; // default to 12h
  
  // Curated timezone metadata mapping for flag emojis and country names
  const timezoneMetadata = {
    "Asia/Ho_Chi_Minh": { country: "Vietnam", flag: "🇻🇳" },
    "Asia/Kolkata": { country: "India", flag: "🇮🇳" },
    "Europe/Dublin": { country: "Ireland", flag: "🇮🇪" },
    "UTC": { country: "UTC", flag: "🌐" },
    "America/New_York": { country: "United States", flag: "🇺🇸" },
    "America/Chicago": { country: "United States", flag: "🇺🇸" },
    "America/Denver": { country: "United States", flag: "🇺🇸" },
    "America/Los_Angeles": { country: "United States", flag: "🇺🇸" },
    "Europe/London": { country: "United Kingdom", flag: "🇬🇧" },
    "Asia/Tokyo": { country: "Japan", flag: "🇯🇵" },
    "Australia/Sydney": { country: "Australia", flag: "🇦🇺" },
    "Australia/Melbourne": { country: "Australia", flag: "🇦🇺" },
    "Asia/Singapore": { country: "Singapore", flag: "🇸🇬" },
    "Europe/Paris": { country: "France", flag: "🇫🇷" },
    "Europe/Berlin": { country: "Germany", flag: "🇩🇪" },
    "Europe/Rome": { country: "Italy", flag: "🇮🇹" },
    "Europe/Madrid": { country: "Spain", flag: "🇪🇸" },
    "Asia/Shanghai": { country: "China", flag: "🇨🇳" },
    "Asia/Hong_Kong": { country: "Hong Kong", flag: "🇭🇰" },
    "Asia/Bangkok": { country: "Thailand", flag: "🇹🇭" },
    "Asia/Jakarta": { country: "Indonesia", flag: "🇮🇩" },
    "Asia/Seoul": { country: "South Korea", flag: "🇰🇷" },
    "Asia/Dubai": { country: "United Arab Emirates", flag: "🇦🇪" },
    "America/Toronto": { country: "Canada", flag: "🇨🇦" },
    "America/Vancouver": { country: "Canada", flag: "🇨🇦" },
    "America/Mexico_City": { country: "Mexico", flag: "🇲🇽" },
    "America/Sao_Paulo": { country: "Brazil", flag: "🇧🇷" },
    "Europe/Moscow": { country: "Russia", flag: "🇷🇺" },
    "Africa/Cairo": { country: "Egypt", flag: "🇪🇬" },
    "Africa/Johannesburg": { country: "South Africa", flag: "🇿🇦" },
    "Asia/Kuala_Lumpur": { country: "Malaysia", flag: "🇲🇾" },
    "Asia/Manila": { country: "Philippines", flag: "🇵🇭" },
    "Europe/Amsterdam": { country: "Netherlands", flag: "🇳🇱" },
    "Europe/Zurich": { country: "Switzerland", flag: "🇨🇭" },
    "Europe/Brussels": { country: "Belgium", flag: "🇧🇪" },
    "Europe/Vienna": { country: "Austria", flag: "🇦🇹" },
    "Europe/Stockholm": { country: "Sweden", flag: "🇸🇪" },
    "Europe/Oslo": { country: "Norway", flag: "🇳🇴" },
    "Europe/Copenhagen": { country: "Denmark", flag: "🇩🇰" },
    "Europe/Helsinki": { country: "Finland", flag: "🇫🇮" },
    "Asia/Taipei": { country: "Taiwan", flag: "🇹🇼" },
    "America/Argentina/Buenos_Aires": { country: "Argentina", flag: "🇦🇷" },
    "Pacific/Auckland": { country: "New Zealand", flag: "🇳🇿" },
    "Asia/Istanbul": { country: "Turkey", flag: "🇹🇷" },
    "Asia/Riyadh": { country: "Saudi Arabia", flag: "🇸🇦" },
    "Asia/Tel_Aviv": { country: "Israel", flag: "🇮🇱" },
    "Europe/Athens": { country: "Greece", flag: "🇬🇷" },
    "America/Bogota": { country: "Colombia", flag: "🇨🇴" },
    "America/Lima": { country: "Peru", flag: "🇵🇪" },
    "America/Santiago": { country: "Chile", flag: "🇨🇱" }
  };
  
  const CURRENT_VERSION = "1.2.1";
  let lastVersion = localStorage.getItem("app_version");
  if (lastVersion !== CURRENT_VERSION) {
    localStorage.removeItem("activeTimezones");
    localStorage.removeItem("baseTimezone");
    localStorage.setItem("app_version", CURRENT_VERSION);
  }

  let activeTimezones = [];
  try {
    activeTimezones = JSON.parse(localStorage.getItem("activeTimezones"));
  } catch (e) {
    activeTimezones = null;
  }

  // Define defaults to exactly: Vietnam, India, and Ireland
  const defaults = ["Asia/Ho_Chi_Minh", "Asia/Kolkata", "Europe/Dublin"];

  if (!activeTimezones) {
    activeTimezones = [...defaults];
    localStorage.setItem("activeTimezones", JSON.stringify(activeTimezones));
  }

  let baseTimezone = localStorage.getItem("baseTimezone");
  if (!baseTimezone) {
    const guessed = moment.tz.guess();
    baseTimezone = defaults.includes(guessed) ? guessed : "Asia/Ho_Chi_Minh";
    localStorage.setItem("baseTimezone", baseTimezone);
  }

  let prevBaseTimezone = baseTimezone;
  let isLiveMode = true;

  // Curated list of popular timezones shown on empty search focus
  const popularTimezones = [
    "Asia/Ho_Chi_Minh",
    "Asia/Kolkata",
    "Europe/Dublin",
    "UTC",
    "America/New_York",
    "Europe/London",
    "Asia/Tokyo",
    "Australia/Sydney",
    "Asia/Singapore",
    "Europe/Paris",
    "America/Los_Angeles",
    "Asia/Seoul"
  ];

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

  // --- Initial Config Setup ---
  formatCheckbox.checked = (format === "DD-MMM-YYYY hh:mm:ss A");

  // Sync initial slider value to current time
  const initialBaseTime = moment.tz(baseTimezone);
  timeSlider.value = initialBaseTime.hours() * 60 + initialBaseTime.minutes();

  // --- Core Display Update Loop ---
  function updateDisplay() {
    let baseTime;
    if (isLiveMode) {
      baseTime = moment();
      const baseTimeInBaseTz = baseTime.clone().tz(baseTimezone);
      timeSlider.value = baseTimeInBaseTz.hours() * 60 + baseTimeInBaseTz.minutes();
    } else {
      const hours = Math.floor(timeSlider.value / 60);
      const minutes = timeSlider.value % 60;
      baseTime = moment.tz(baseTimezone).hours(hours).minutes(minutes).seconds(0);
    }

    renderCards(baseTime);
    updateSliderLabels(baseTime);
  }

  // Run update display immediately and set a 1s ticker
  updateDisplay();
  const tickerInterval = setInterval(updateDisplay, 1000);

  // --- Render Timecards ---
  function renderCards(baseTime) {
    const baseTimeInBaseTz = baseTime.clone().tz(baseTimezone);
    const showAmPm = (format === "DD-MMM-YYYY hh:mm:ss A");
    
    let html = "";
    activeTimezones.forEach(tz => {
      const isBase = (tz === baseTimezone);
      const cardTime = baseTime.clone().tz(tz);
      
      const timeFormatted = cardTime.format(showAmPm ? "hh:mm:ss" : "HH:mm:ss");
      const ampm = showAmPm ? cardTime.format("A") : "";
      const dateFormatted = cardTime.format("ddd, MMM D");
      
      // Calculate offset difference compared to the base timezone
      const diffMinutes = cardTime.utcOffset() - baseTimeInBaseTz.utcOffset();
      const diffHours = diffMinutes / 60;
      
      let offsetBadge = "";
      if (isBase) {
        offsetBadge = `<span class="card-offset-badge">Base</span>`;
      } else {
        if (diffHours === 0) {
          offsetBadge = `<span class="card-offset-badge">Same time</span>`;
        } else {
          const sign = diffHours > 0 ? "+" : "";
          const formattedHours = Number(diffHours.toFixed(2)).toString();
          offsetBadge = `<span class="card-offset-badge">${sign}${formattedHours}h</span>`;
        }
      }
      
      // Calculate relative day compared to the base timezone date
      const baseDateStr = baseTimeInBaseTz.format("YYYY-MM-DD");
      const cardDateStr = cardTime.format("YYYY-MM-DD");
      let relativeDayText = "";
      
      const diffDays = moment(cardDateStr).diff(moment(baseDateStr), 'days');
      if (diffDays > 0) {
        relativeDayText = `<span class="badge text-bg-danger ms-1" style="font-size: 8px; padding: 2px 4px;">+${diffDays}d</span>`;
      } else if (diffDays < 0) {
        relativeDayText = `<span class="badge text-bg-success ms-1" style="font-size: 8px; padding: 2px 4px;">${diffDays}d</span>`;
      }
      
      const parts = tz.split('/');
      const city = parts[parts.length - 1].replace(/_/g, ' ');
      const region = parts.length > 1 ? parts.slice(0, -1).join(' / ') : '';
      
      const meta = timezoneMetadata[tz] || {};
      const flag = meta.flag || "📍";
      const countryDisplay = meta.country ? (region ? `${meta.country} (${region})` : meta.country) : (region || 'Global');
      
      const baseClass = isBase ? "is-base" : "";
      
      html += `
        <div class="timezone-card ${baseClass}" data-timezone="${tz}">
            <div class="card-left">
                <div class="card-title-row">
                    <span class="card-flag me-1">${flag}</span>
                    <span class="card-city">${city}</span>
                    ${offsetBadge}
                </div>
                <span class="card-region">${countryDisplay}</span>
                <span class="card-date mt-1">
                    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="me-1"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    ${dateFormatted} ${relativeDayText}
                </span>
            </div>
            <div class="card-right">
                <div class="card-time-display">
                    <span class="card-time-num">${timeFormatted}</span>
                    ${ampm ? `<span class="card-ampm ${ampm.toLowerCase()}">${ampm}</span>` : ''}
                </div>
                <div class="card-actions">
                    <button class="action-btn copy" title="Copy formatted time">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                    <button class="action-btn delete" title="Remove timezone">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                </div>
            </div>
        </div>
      `;
    });
    
    timezoneList.innerHTML = html;
  }

  // --- Update Top Slider Labels ---
  function updateSliderLabels(baseTime) {
    const baseTimeInBaseTz = baseTime.clone().tz(baseTimezone);
    const showAmPm = (format === "DD-MMM-YYYY hh:mm:ss A");
    
    const timeFormatted = baseTimeInBaseTz.format(showAmPm ? "hh:mm A" : "HH:mm");
    const dateFormatted = baseTimeInBaseTz.format("dddd, MMM D");
    const city = baseTimezone.split("/").pop().replace(/_/g, " ");
    const meta = timezoneMetadata[baseTimezone] || {};
    const flag = meta.flag || "📍";
    
    sliderTimeLabel.textContent = timeFormatted;
    sliderDateLabel.textContent = `${flag} ${dateFormatted} (${city})`;
  }

  // --- Set Base Timezone ---
  function setBaseTimezone(timezone) {
    if (baseTimezone === timezone) return;
    
    const oldBaseTimezone = baseTimezone;
    baseTimezone = timezone;
    localStorage.setItem("baseTimezone", baseTimezone);
    
    // Sync slider position so the custom time conversion stays consistent
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
  }

  // --- Remove Timezone ---
  function removeTimezone(timezone, cardElement) {
    cardElement.classList.add("fade-out");
    cardElement.addEventListener("animationend", () => {
      activeTimezones = activeTimezones.filter(tz => tz !== timezone);
      localStorage.setItem("activeTimezones", JSON.stringify(activeTimezones));
      
      if (baseTimezone === timezone) {
        baseTimezone = activeTimezones[0] || "UTC";
        localStorage.setItem("baseTimezone", baseTimezone);
      }
      
      updateDisplay();
    }, { once: true });
  }

  // --- Copy Time Details ---
  function copyTime(timezone, button) {
    let baseTime;
    if (isLiveMode) {
      baseTime = moment();
    } else {
      const hours = Math.floor(timeSlider.value / 60);
      const minutes = timeSlider.value % 60;
      baseTime = moment.tz(baseTimezone).hours(hours).minutes(minutes).seconds(0);
    }
    
    const cardTime = baseTime.clone().tz(timezone);
    const formattedTime = cardTime.format(format);
    const city = timezone.split("/").pop().replace(/_/g, " ");
    const offset = cardTime.format("Z");
    
    const textToCopy = `${city}: ${formattedTime} (GMT${offset})`;
    
    navigator.clipboard.writeText(textToCopy).then(() => {
      const originalHTML = button.innerHTML;
      button.classList.add("copied");
      button.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      button.title = "Copied!";
      
      setTimeout(() => {
        button.classList.remove("copied");
        button.innerHTML = originalHTML;
        button.title = "Copy to clipboard";
      }, 1500);
    }).catch(err => {
      console.error("Failed to copy time details: ", err);
    });
  }

  // --- Sync to Live Mode ---
  function syncLive() {
    isLiveMode = true;
    btnSyncTime.classList.add("d-none");
    liveIndicator.classList.remove("paused");
    updateDisplay();
  }

  // --- Autocomplete & Search ---
  function getSuggestions(query) {
    if (!query) {
      return popularTimezones;
    }
    const cleanQuery = query.toLowerCase().replace(/[\s_]/g, '');
    return allTimezoneNames.filter(tz => {
      const cleanTz = tz.toLowerCase().replace(/[\s_]/g, '');
      const meta = timezoneMetadata[tz] || {};
      const cleanCountry = meta.country ? meta.country.toLowerCase().replace(/[\s_]/g, '') : '';
      return cleanTz.includes(cleanQuery) || cleanCountry.includes(cleanQuery);
    }).slice(0, 15);
  }

  function renderSearchAutocomplete(query) {
    const suggestions = getSuggestions(query);
    if (suggestions.length === 0) {
      searchResults.innerHTML = `<div class="no-results">No countries or timezones found for "${query}"</div>`;
      searchResults.classList.add("show");
      return;
    }
    
    let html = "";
    suggestions.forEach(tz => {
      const parts = tz.split('/');
      const city = parts[parts.length - 1].replace(/_/g, ' ');
      const region = parts.length > 1 ? parts.slice(0, -1).join(' / ') : 'Global';
      const offset = moment.tz(tz).format("Z");
      
      const meta = timezoneMetadata[tz] || {};
      const flag = meta.flag || "📍";
      const subText = meta.country ? `${meta.country} (${region})` : region;
      
      html += `
        <div class="autocomplete-item" data-timezone="${tz}">
            <div class="d-flex flex-column">
                <span><span class="me-1">${flag}</span><strong>${city}</strong></span>
                <span class="card-region">${subText}</span>
            </div>
            <span class="timezone-offset">GMT${offset}</span>
        </div>
      `;
    });
    
    searchResults.innerHTML = html;
    searchResults.classList.add("show");
  }

  // --- Event Listeners ---

  // Card Event Delegation (Clicks for Base Select, Copy, and Delete)
  timezoneList.addEventListener("click", (e) => {
    const card = e.target.closest(".timezone-card");
    if (!card) return;
    
    const timezone = card.dataset.timezone;
    
    // Check if delete button was clicked
    const deleteBtn = e.target.closest(".action-btn.delete");
    if (deleteBtn) {
      e.stopPropagation();
      removeTimezone(timezone, card);
      return;
    }
    
    // Check if copy button was clicked
    const copyBtn = e.target.closest(".action-btn.copy");
    if (copyBtn) {
      e.stopPropagation();
      copyTime(timezone, copyBtn);
      return;
    }
    
    // Else, click on card changes the base reference
    setBaseTimezone(timezone);
  });

  // Slider Drag Interactions
  timeSlider.addEventListener("input", () => {
    isLiveMode = false;
    btnSyncTime.classList.remove("d-none");
    liveIndicator.classList.add("paused");
    updateDisplay();
  });

  // Sync / Pulse Clicks
  liveIndicator.addEventListener("click", () => {
    if (!isLiveMode) syncLive();
  });
  btnSyncTime.addEventListener("click", syncLive);

  // Format Switch toggle
  formatCheckbox.addEventListener("change", () => {
    format = formatCheckbox.checked ? "DD-MMM-YYYY hh:mm:ss A" : "DD-MMM-YYYY HH:mm:ss";
    localStorage.setItem("format", format);
    updateDisplay();
  });

  // Autocomplete Search Events
  timezoneSearch.addEventListener("input", (e) => {
    const query = e.target.value.trim();
    if (query) {
      clearSearchBtn.classList.remove("d-none");
    } else {
      clearSearchBtn.classList.add("d-none");
    }
    renderSearchAutocomplete(query);
  });

  timezoneSearch.addEventListener("focus", () => {
    renderSearchAutocomplete(timezoneSearch.value.trim());
  });

  clearSearchBtn.addEventListener("click", () => {
    timezoneSearch.value = "";
    clearSearchBtn.classList.add("d-none");
    renderSearchAutocomplete("");
    timezoneSearch.focus();
  });

  // Close search suggestions on outer click
  document.addEventListener("click", (e) => {
    if (!timezoneSearch.contains(e.target) && !searchResults.contains(e.target)) {
      searchResults.classList.remove("show");
    }
  });

  // Selecting a search suggestion
  searchResults.addEventListener("click", (e) => {
    const item = e.target.closest(".autocomplete-item");
    if (!item) return;
    
    const timezone = item.dataset.timezone;
    if (!activeTimezones.includes(timezone)) {
      activeTimezones.push(timezone);
      localStorage.setItem("activeTimezones", JSON.stringify(activeTimezones));
      updateDisplay();
      
      // Target the newly added card and add the slide/fade in animation
      setTimeout(() => {
        const cards = timezoneList.querySelectorAll(".timezone-card");
        const lastCard = cards[cards.length - 1];
        if (lastCard && lastCard.dataset.timezone === timezone) {
          lastCard.classList.add("fade-in");
        }
      }, 50);
    }
    
    timezoneSearch.value = "";
    clearSearchBtn.classList.add("d-none");
    searchResults.classList.remove("show");
    searchResults.innerHTML = "";
  });
});
