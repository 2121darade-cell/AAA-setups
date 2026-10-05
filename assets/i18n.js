// ============================================================================
// FINANTHROPIST EDUCARE 2.0 - BILINGUAL I18N MODULE (मराठी & ENGLISH)
// ============================================================================

const I18N_TRANSLATIONS = {
  mr: {
    // Header & Brand
    brand_sub: "प्रायव्हेट लिमिटेड • रिअल-टाईम ट्रेडिंग सूट",
    nav_chart: "📊 चार्ट",
    nav_trade_setup: "🎯 ट्रेड सेटअप",
    nav_aaa: "⚡ AAA स्क्रिनर",
    search_placeholder: "🔍 स्टॉक्स / MCX सर्च करा...",
    market_live: "लाईव्ह मार्केट",
    market_closed: "मार्केट बंद",
    vip_active_badge: "व्हीआयपी",
    vip_unlocked_toast: "🔐 व्हीआयपी ॲक्सेस सक्रिय झाला! पोर्टल कायमस्वरूपी अनलॉक झाले आहे.",

    // Timeframes & Chart Controls
    tf_1m: "1m",
    tf_5m: "5m",
    tf_15m: "15m",
    tf_1h: "1h",
    tf_1d: "1D",
    candle_standard: "कॅन्डल्स",
    candle_heikin: "हेकिन आशी",
    candle_line: "लाईन",
    ind_ma20: "MA(20)",
    ind_rsi7: "RSI(7)",
    ind_volume: "Volume",
    zoom_in_title: "कॅन्डल्स मोठ्या करा (Zoom In)",
    zoom_out_title: "कॅन्डल्स लहान करा (Zoom Out)",
    pan_left_title: "मागील कॅन्डल्स पहा (Pan Left)",
    pan_right_title: "पुढील कॅन्डल्स पहा (Pan Right)",
    reset_view_title: "मूळ स्थिती (Reset View)",
    fullscreen_title: "फुलस्क्रीन (Fullscreen)",
    btn_add_watchlist: "+ वॉचलिस्ट",
    bar_close_prefix: "BAR CLOSE: ",

    // Watchlist Sidebar
    wl_title: "मार्केट वॉचलिस्ट (Watchlist)",
    wl_btn_new: "➕ नवीन लिस्ट",
    wl_opt_indices: "🏛️ प्रमुख इंडायसेस (Nifty, Bank, Sensex, Midcap, FinNifty)",
    wl_opt_all: "📊 सर्व ५०० स्टॉक्स (Default)",
    wl_opt_mcx: "🪙 MCX कमोडिटी",
    wl_search_placeholder: "🔍 स्टॉक / इंडेक्स शोधा (+ वर क्लिक करून जोडा)...",
    wl_delete_btn: "🗑️ डिलीट यादी",

    // Trade Setup View
    ts_rules_title: "५-मिनिट Heikin Ashi रिव्हर्सल & CC (Confirmation Candle) सेटअप",
    ts_rules_sub: "नियम: आधीचा लाल ट्रेंड + हिरवी रिव्हर्सल कॅन्डल विथ Flat Bottom (No Lower Wick) = 🟢 BUY कॉल सेटअप.<br>आधीचा हिरवा ट्रेंड + लाल रिव्हर्सल कॅन्डल विथ Flat Top (No Upper Wick) = 🔴 SELL पुट सेटअप.",
    ts_tab_all: "सर्व",
    ts_tab_buy: "🟢 BUY Call",
    ts_tab_sell: "🔴 SELL Put",
    ts_tab_index: "इंडायसेस",
    ts_tab_stocks: "स्टॉक्स व MCX",
    ts_search_placeholder: "🔍 शोधा (उदा. NIFTY, MAZDOCK, GOLD)...",
    ts_audio_on: "ध्वनी चालू",
    ts_audio_off: "ध्वनी बंद",
    ts_notif_btn: "नोटिफिकेशन",
    ts_scan_btn: "आत्ता स्कॅन करा",
    ts_demo_alert_btn: "🔔 डेमो ॲलर्ट",
    ts_empty_title: "सध्या कोणताही नवीन सेटअप मिळालेला नाही",
    ts_empty_sub: "५-मिनिट Heikin Ashi कॅन्डल पूर्ण होताच नवीन सिग्नल येथे आपोआप अलर्ट होतील.",
    ts_card_atm: "🎯 शिफारस केलेला पर्याय (ATM Strike):",
    ts_lbl_entry: "एन्ट्री भाव (Entry):",
    ts_lbl_sl: "स्टॉप लॉस (SL):",
    ts_lbl_t1: "टार्गेट १ (1:1.5):",
    ts_lbl_t2: "टार्गेट २ (1:2.5):",
    ts_lbl_risk: "जोखीम (Risk):",
    ts_lbl_cc: "कन्फर्मेशन (CC):",
    ts_btn_view_ha: "📊 हीकेन आशी चार्ट पहा",
    ts_btn_load_main: "🚀 मुख्य टर्मिनलवर लोड करा",
    ts_modal_chart_close: "बंद करा ✕",

    // AAA Screener View
    aaa_title: "AAA प्रो ट्रेड स्कॅनर (Candlestick Screener)",
    aaa_buy_title: "खरेदी नियम (BUY Rules)",
    aaa_buy_r1: "ट्रेंड: कमीत कमी ४ सलग Red कॅन्डल्स चा डाउनट्रेंड.",
    aaa_buy_r2: "पॅटर्न्स: Bullish Harami, Bullish Engulfing, Piercing Line, Morning Star.",
    aaa_buy_r3: "Entry: शेवटच्या Green कॅन्डलची Open Price | Stop Loss: मागील कॅन्डलचा Low.",
    aaa_sell_title: "विक्री नियम (SELL Rules)",
    aaa_sell_r1: "ट्रेंड: कमीत कमी ४ सलग Green कॅन्डल्स चा अपट्रेंड.",
    aaa_sell_r2: "पॅटर्न्स: Bearish Harami, Bearish Engulfing, Dark Cloud Cover, Evening Star.",
    aaa_sell_r3: "Entry: शेवटच्या Red कॅन्डलची Close Price | Stop Loss: मागील कॅन्डलचा High.",
    aaa_stat_universe: "एकूण स्टॉक्स (Universe)",
    aaa_stat_buy: "खरेदी सिग्नल्स (BUY)",
    aaa_stat_sell: "विक्री सिग्नल्स (SELL)",
    aaa_stat_rate: "अचूकता दर (Win Rate)",

    // Registration Modal
    auth_title: "नोंदणी व प्रवेश विनंती",
    auth_sub: "पोर्टल वापरण्यासाठी कृपया नाव व मोबाईल नंबर नोंदवून प्रवेश विनंती पाठवा.",
    auth_lbl_name: "विद्यार्थ्याचे पूर्ण नाव:",
    auth_lbl_phone: "मोबाईल नंबर (१० अंकी):",
    auth_btn_submit: "विनंती पाठवा (Submit)",
    auth_or_vip: "किंवा व्हीआयपी कोड वापरा:",
    auth_btn_vip: "अनलॉक करा"
  },

  en: {
    // Header & Brand
    brand_sub: "Pvt Ltd • Real-Time Trading Suite",
    nav_chart: "📊 Chart",
    nav_trade_setup: "🎯 Trade Setup",
    nav_aaa: "⚡ AAA Screener",
    search_placeholder: "🔍 Search Stocks / MCX...",
    market_live: "LIVE MARKET",
    market_closed: "MARKET CLOSED",
    vip_active_badge: "VIP",
    vip_unlocked_toast: "🔐 VIP Access Activated! Portal is permanently unlocked.",

    // Timeframes & Chart Controls
    tf_1m: "1m",
    tf_5m: "5m",
    tf_15m: "15m",
    tf_1h: "1h",
    tf_1d: "1D",
    candle_standard: "Candles",
    candle_heikin: "Heikin Ashi",
    candle_line: "Line",
    ind_ma20: "MA(20)",
    ind_rsi7: "RSI(7)",
    ind_volume: "Volume",
    zoom_in_title: "Zoom In (Make Candles Bigger)",
    zoom_out_title: "Zoom Out (Make Candles Smaller)",
    pan_left_title: "Pan Left (History)",
    pan_right_title: "Pan Right (Recent)",
    reset_view_title: "Reset View (Fit Candles)",
    fullscreen_title: "Toggle Fullscreen",
    btn_add_watchlist: "+ Watchlist",
    bar_close_prefix: "BAR CLOSE: ",

    // Watchlist Sidebar
    wl_title: "Market Watchlist",
    wl_btn_new: "➕ New List",
    wl_opt_indices: "🏛️ Major Indices (Nifty, Bank, Sensex, Midcap, FinNifty)",
    wl_opt_all: "📊 All 500 Stocks (Default)",
    wl_opt_mcx: "🪙 MCX Commodities",
    wl_search_placeholder: "🔍 Search stock / index (+ to add)...",
    wl_delete_btn: "🗑️ Delete List",

    // Trade Setup View
    ts_rules_title: "5-Minute Heikin Ashi Reversal & CC Strategy Setup",
    ts_rules_sub: "Rule: Prior red trend + green reversal candle with Flat Bottom (No Lower Wick) = 🟢 BUY Call Setup.<br>Prior green trend + red reversal candle with Flat Top (No Upper Wick) = 🔴 SELL Put Setup.",
    ts_tab_all: "All",
    ts_tab_buy: "🟢 BUY Call",
    ts_tab_sell: "🔴 SELL Put",
    ts_tab_index: "Indices",
    ts_tab_stocks: "Stocks & MCX",
    ts_search_placeholder: "🔍 Search (e.g. NIFTY, MAZDOCK, GOLD)...",
    ts_audio_on: "Audio ON",
    ts_audio_off: "Audio OFF",
    ts_notif_btn: "Notification",
    ts_scan_btn: "Scan Now",
    ts_demo_alert_btn: "🔔 Demo Alert",
    ts_empty_title: "No New Setup Detected Currently",
    ts_empty_sub: "New signals will appear automatically upon 5-minute candle close.",
    ts_card_atm: "🎯 Recommended Option (ATM Strike):",
    ts_lbl_entry: "Entry Price:",
    ts_lbl_sl: "Stop Loss (SL):",
    ts_lbl_t1: "Target 1 (1:1.5):",
    ts_lbl_t2: "Target 2 (1:2.5):",
    ts_lbl_risk: "Risk (Points):",
    ts_lbl_cc: "Confirmation (CC):",
    ts_btn_view_ha: "📊 View Heikin Ashi Chart",
    ts_btn_load_main: "🚀 Load On Main Terminal",
    ts_modal_chart_close: "Close ✕",

    // AAA Screener View
    aaa_title: "AAA Pro Trade Scanner (Candlestick Screener)",
    aaa_buy_title: "BUY Rules",
    aaa_buy_r1: "Trend: Downtrend with at least 4 consecutive Red candles.",
    aaa_buy_r2: "Patterns: Bullish Harami, Bullish Engulfing, Piercing Line, Morning Star.",
    aaa_buy_r3: "Entry: Open of last Green candle | Stop Loss: Low of previous candle.",
    aaa_sell_title: "SELL Rules",
    aaa_sell_r1: "Trend: Uptrend with at least 4 consecutive Green candles.",
    aaa_sell_r2: "Patterns: Bearish Harami, Bearish Engulfing, Dark Cloud Cover, Evening Star.",
    aaa_sell_r3: "Entry: Close of last Red candle | Stop Loss: High of previous candle.",
    aaa_stat_universe: "Universe Stocks",
    aaa_stat_buy: "BUY Signals",
    aaa_stat_sell: "SELL Signals",
    aaa_stat_rate: "Win Rate",

    // Registration Modal
    auth_title: "Registration & Access Request",
    auth_sub: "Please enter your name and mobile number to request access to the trading portal.",
    auth_lbl_name: "Student Full Name:",
    auth_lbl_phone: "Mobile Number (10 Digits):",
    auth_btn_submit: "Submit Request",
    auth_or_vip: "Or Enter VIP Code:",
    auth_btn_vip: "Unlock Portal"
  }
};

const I18N = {
  currentLang: localStorage.getItem('fin_portal_lang') || 'mr',

  t(key) {
    const dict = I18N_TRANSLATIONS[this.currentLang] || I18N_TRANSLATIONS['mr'];
    return dict[key] || key;
  },

  setLanguage(lang) {
    if (lang !== 'mr' && lang !== 'en') lang = 'mr';
    this.currentLang = lang;
    localStorage.setItem('fin_portal_lang', lang);
    this.applyTranslations();

    // Toggle active state on language buttons
    const btns = document.querySelectorAll('.lang-btn');
    btns.forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-lang') === lang);
    });
  },

  applyTranslations() {
    const dict = I18N_TRANSLATIONS[this.currentLang] || I18N_TRANSLATIONS['mr'];

    // 1. Elements with data-i18n (innerHTML or textContent)
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (dict[key]) {
        el.innerHTML = dict[key];
      }
    });

    // 2. Elements with data-i18n-placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (dict[key]) {
        el.setAttribute('placeholder', dict[key]);
      }
    });

    // 3. Elements with data-i18n-title
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (dict[key]) {
        el.setAttribute('title', dict[key]);
      }
    });

    // 4. Update dynamic components if initialized
    if (window.updateMarketStatusDisplay) {
      window.updateMarketStatusDisplay();
    }
  },

  init() {
    this.applyTranslations();
    const btns = document.querySelectorAll('.lang-btn');
    btns.forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-lang') === this.currentLang);
      b.addEventListener('click', () => {
        this.setLanguage(b.getAttribute('data-lang'));
      });
    });
  }
};

window.I18N = I18N;
