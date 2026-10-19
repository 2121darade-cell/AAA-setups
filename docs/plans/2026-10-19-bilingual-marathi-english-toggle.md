# Comprehensive Bilingual (Marathi & English) UI System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable seamless, real-time language toggling between Marathi and English across the entire platform (headers, tabs, toolbars, chart controls, rules banners, dynamic Trade Setup cards, dynamic AAA Screener tables, and all interactive modals) without page reloads and without breaking any numerical calculations or chart rendering.

**Architecture:**
1. Unified Dictionary System (`assets/i18n.js`): Expand `I18N_TRANSLATIONS` to cover every text string across all 3 views and all modals in both Marathi (`mr`) and English (`en`).
2. Declarative Static Binding (`index.html`): Add `data-i18n`, `data-i18n-placeholder`, and `data-i18n-title` attributes to all static markup elements (headers, dropdown options, search bars, rule boxes, table headers, modal titles/labels).
3. Dynamic Module Translation Handlers:
   - In `TradeSetupModule` (`assets/trade_setup.js`): Refactor signal card templates, ATM banners, CC labels, status badges, empty states, and alert modals to consume `I18N.t(key)`; add `onLanguageChange()` to re-render existing signals immediately.
   - In `AAAScreenerModule` (`assets/aaa_screener.js`): Refactor table rows, type badges, status badges, action buttons, and empty state to consume `I18N.t(key)`; add `onLanguageChange()` to re-render existing table rows immediately.
   - In `AppState` (`assets/app.js`): Wire `marketStatusLabel`, `barCloseCountdown`, and watchlist labels to update dynamically upon language change.
4. Reactive Language Dispatcher: When clicking the top language buttons (`मराठी` or `ENG`), update `localStorage`, update DOM tags, notify all submodules, and dispatch a global `languageChanged` event.

**Tech Stack:** Vanilla JavaScript (ES6+), HTML5 data-attributes, LocalStorage, Apache ECharts.

---

### Task 1: Comprehensive Bilingual Dictionary in `assets/i18n.js`

**Files:**
- Modify: `assets/i18n.js:1-260`

**Step 1: Expand translation dictionary for Marathi and English**
- Add missing keys for:
  - Header & Status: `brand_sub`, `tj_connected`, `btn_watchlist`, `user_badge`
  - Chart Controls: `ind_volume`, `bar_close_prefix`, `zoom_in_title`, `zoom_out_title`, `pan_left_title`, `pan_right_title`, `reset_view_title`
  - Watchlist Sidebar: `wl_title`, `wl_btn_new`, `wl_opt_indices`, `wl_opt_all`, `wl_opt_mcx`, `wl_search_placeholder`, `wl_delete_btn`
  - Trade Setup: `ts_rules_title`, `ts_rules_sub`, `ts_tab_all`, `ts_tab_buy`, `ts_tab_sell`, `ts_tab_index`, `ts_tab_stocks`, `ts_search_placeholder`, `ts_audio_on`, `ts_audio_off`, `ts_notif_btn`, `ts_scan_btn`, `ts_scan_scanning`, `ts_demo_alert_btn`, `ts_empty_title`, `ts_empty_sub`, `ts_card_atm`, `ts_live_ltp`, `ts_signal_ohlc`, `ts_prior_trend`, `ts_lbl_entry`, `ts_lbl_sl`, `ts_lbl_t1`, `ts_lbl_t2`, `ts_lbl_risk`, `ts_lbl_cc`, `ts_btn_view_ha`, `ts_btn_load_main`, `ts_cc_1st_green`, `ts_cc_2nd_green`, `ts_cc_1st_red`, `ts_cc_2nd_red`, `ts_status_active`, `ts_status_t1`, `ts_status_t2`, `ts_status_sl`
  - AAA Screener: `aaa_buy_title`, `aaa_buy_r1`, `aaa_buy_r2`, `aaa_buy_r3`, `aaa_sell_title`, `aaa_sell_r1`, `aaa_sell_r2`, `aaa_sell_r3`, `aaa_stat_universe`, `aaa_stat_buy`, `aaa_stat_sell`, `aaa_stat_last_scan`, `aaa_tab_all`, `aaa_tab_buy`, `aaa_tab_sell`, `aaa_pattern_all`, `aaa_days_10`, `aaa_days_5`, `aaa_days_15`, `aaa_trend_3`, `aaa_trend_4`, `aaa_trend_5`, `aaa_search_placeholder`, `aaa_btn_scan`, `aaa_btn_scanning`, `aaa_th_symbol`, `aaa_th_type`, `aaa_th_pattern`, `aaa_th_trend`, `aaa_th_entry`, `aaa_th_sl`, `aaa_th_t1`, `aaa_th_t2`, `aaa_th_risk`, `aaa_th_action`, `aaa_btn_chart`, `aaa_btn_load`, `aaa_empty_title`, `aaa_empty_sub`
  - Modals: `auth_title`, `auth_sub`, `auth_lbl_name`, `auth_lbl_phone`, `auth_lbl_email`, `auth_btn_submit`, `auth_vip_link`, `vip_title`, `vip_lbl_code`, `vip_btn_unlock`, `admin_title`, `admin_lbl_pin`, `admin_btn_login`, `alert_title`, `alert_sub`, `alert_rec`, `alert_close`, `modal_create_wl_title`, `modal_create_wl_label`, `modal_create_wl_btn`, `modal_add_wl_title`, `modal_add_wl_label`, `modal_add_wl_btn`, `modal_add_wl_new_btn`

**Step 2: Update `applyTranslations()` & notification dispatcher**
- In `applyTranslations()`:
  - Update `[data-i18n]`, `[data-i18n-placeholder]`, `[data-i18n-title]`.
  - Call `window.TradeSetupModule?.onLanguageChange?.()`.
  - Call `window.AAAScreenerModule?.onLanguageChange?.()`.
  - Call `window.updateMarketStatusDisplay?.()`.
  - Call `window.renderWatchlistItems?.()`.
  - Dispatch `new CustomEvent('languageChanged', { detail: { lang: this.currentLang } })`.

---

### Task 2: Declarative Localization Attributes in `index.html`

**Files:**
- Modify: `index.html` (all sections)

**Step 1: Add localization tags to Header & Navigation**
- `brand_subtitle`: `data-i18n="brand_sub"`
- `header-stock-search`: `data-i18n-placeholder="search_placeholder"`
- `tjLoginBadgeText`: `data-i18n="tj_connected"`
- `toggle-sidebar-btn` text: `data-i18n="btn_watchlist"`

**Step 2: Add localization tags to Chart Controls & Watchlist**
- Timeframe buttons: `data-i18n="tf_1m"`, `data-i18n="tf_5m"`, etc.
- Indicator toggles: `data-i18n="ind_volume"`
- Zoom/pan buttons: `data-i18n-title="zoom_in_title"`, etc.
- Watchlist sidebar header: `data-i18n="wl_title"`, `data-i18n="wl_btn_new"`, `data-i18n-placeholder="wl_search_placeholder"`, `data-i18n="wl_delete_btn"`
- Watchlist dropdown options: `data-i18n="wl_opt_indices"`, `data-i18n="wl_opt_all"`, `data-i18n="wl_opt_mcx"`

**Step 3: Add localization tags to Trade Setup View**
- Rules banner title and subtitle: `data-i18n="ts_rules_title"`, `data-i18n="ts_rules_sub"`
- Filter tabs: `data-i18n="ts_tab_all"`, `data-i18n="ts_tab_buy"`, `data-i18n="ts_tab_sell"`, `data-i18n="ts_tab_index"`, `data-i18n="ts_tab_stocks"`
- Search input: `data-i18n-placeholder="ts_search_placeholder"`
- Buttons: `data-i18n="ts_audio_btn"`, `data-i18n="ts_notif_btn"`, `data-i18n="ts_scan_btn"`, `data-i18n="ts_demo_alert_btn"`

**Step 4: Add localization tags to AAA Screener View**
- Buy rule box: title `data-i18n="aaa_buy_title"`, rules `data-i18n="aaa_buy_r1"`, `data-i18n="aaa_buy_r2"`, `data-i18n="aaa_buy_r3"`
- Sell rule box: title `data-i18n="aaa_sell_title"`, rules `data-i18n="aaa_sell_r1"`, `data-i18n="aaa_sell_r2"`, `data-i18n="aaa_sell_r3"`
- Stat cards titles: `data-i18n="aaa_stat_universe"`, `data-i18n="aaa_stat_buy"`, `data-i18n="aaa_stat_sell"`, `data-i18n="aaa_stat_last_scan"`
- Segment buttons: `data-i18n="aaa_tab_all"`, `data-i18n="aaa_tab_buy"`, `data-i18n="aaa_tab_sell"`
- Filter dropdown options for Pattern, Days, and Trend
- Search input: `data-i18n-placeholder="aaa_search_placeholder"`
- Scan button: `data-i18n="aaa_btn_scan"`
- Table header `<th>` tags: `data-i18n="aaa_th_symbol"`, `data-i18n="aaa_th_type"`, etc.
- Empty state: `data-i18n="aaa_empty_title"`, `data-i18n="aaa_empty_sub"`

**Step 5: Add localization tags to All Modals**
- Auth modal, VIP modal, Admin modal, Signal alert modal, Chart preview modals, Watchlist modals.

---

### Task 3: Localize Dynamic Rendering in `assets/trade_setup.js`

**Files:**
- Modify: `assets/trade_setup.js:260-380` (renderSignals)
- Modify: `assets/trade_setup.js:380-425` (showSignalModal & viewChart)
- Modify: `assets/trade_setup.js:625-645` (btnScan text handling)
- Modify: `assets/trade_setup.js:735-755` (export onLanguageChange)

**Step 1: Localize signal card HTML generation**
- Use `I18N.t(...)` for:
  - Badge text (`ts_buy_badge` / `ts_sell_badge`)
  - Status text mapping (`ts_status_active`, `ts_status_t1`, `ts_status_t2`, `ts_status_sl`)
  - ATM banner label (`ts_card_atm`)
  - Live LTP label (`ts_live_ltp`)
  - Signal OHLC strip & prior trend label (`ts_signal_ohlc`, `ts_prior_trend`)
  - Confirmation candle label (`ts_cc_1st_green`, `ts_cc_2nd_green`, `ts_cc_1st_red`, `ts_cc_2nd_red`)
  - Grid labels (`ts_lbl_entry`, `ts_lbl_sl`, `ts_lbl_t1`, `ts_lbl_t2`, `ts_lbl_risk`, `ts_lbl_cc`)
  - Card buttons (`ts_btn_view_ha`, `ts_btn_load_main`)
  - Empty state title & description

**Step 2: Add `onLanguageChange` to `TradeSetupModule`**
- Re-run `filterAndRenderSignals()` so existing loaded cards immediately re-render in the selected language.

---

### Task 4: Localize Dynamic Rendering in `assets/aaa_screener.js`

**Files:**
- Modify: `assets/aaa_screener.js:280-365` (renderTable)
- Modify: `assets/aaa_screener.js:565-580` (scan button states)
- Modify: `assets/aaa_screener.js:620-632` (export onLanguageChange)

**Step 1: Localize table row HTML generation**
- Use `I18N.t(...)` for:
  - Type badges (`aaa_tab_buy`, `aaa_tab_sell`)
  - Status badges (`ts_status_active`, `ts_status_t1`, `ts_status_t2`, `ts_status_sl`)
  - Action buttons (`aaa_btn_chart`, `aaa_btn_load`)
  - Empty state title & description
  - Scan button text (`aaa_btn_scan`, `aaa_btn_scanning`)

**Step 2: Add `onLanguageChange` to `AAAScreenerModule`**
- Re-run `renderTable()` so existing loaded rows immediately re-render in the selected language.

---

### Task 5: Dynamic Labels in `assets/app.js`

**Files:**
- Modify: `assets/app.js:846-865` (`updateMarketStatusDisplay`)
- Modify: `assets/app.js:895-920` (`startCandleCountdown`)

**Step 1: Localize Market Status & Candle Countdown**
- `updateMarketStatusDisplay`: Use `I18N.t('market_live')` and `I18N.t('market_closed')`.
- `startCandleCountdown`: Use `I18N.t('bar_close_prefix')`.

---

### Task 6: Testing, Cache Invalidation & VPS Deployment

**Files:**
- Modify: `index.html` (bump query string to `?v=20261019_v3`)
- Modify: `sw.js` (bump service worker cache to `finanthropist-v15-bilingual`)

**Step 1: Local Verification**
- Toggle between `मराठी` and `ENG`:
  - Verify every element on the screen flips between Marathi and English.
  - Verify Trade Setup signal cards flip labels and button text.
  - Verify AAA Screener table flips headers, buttons, and badges.
  - Verify dropdown filters flip text.
  - Verify modals display in the selected language.
  - Verify charts and numerical values continue functioning perfectly.
  - Refresh the browser and verify the selected language persists.

**Step 2: VPS Deployment & Verification**
- SCP updated files to `root@srv1743322.hstgr.cloud:/opt/finanthropist-aaa/`.
- Restart `finanthropist-aaa.service`.
- Verify on live site `https://app.aiprosperity.in/aaa/`.
- Git commit and push to `origin/main`.
