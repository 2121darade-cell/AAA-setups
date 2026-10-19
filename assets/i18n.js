// ============================================================================
// FINANTHROPIST EDUCARE 2.0 - BILINGUAL I18N MODULE (मराठी & ENGLISH)
// Comprehensive Application Dictionary & Reactive Language Switcher
// ============================================================================

const I18N_TRANSLATIONS = {
  mr: {
    // Header & Brand
    brand_sub: "प्रायव्हेट लिमिटेड • रिअल-टाईम ट्रेडिंग सूट",
    nav_chart: "चार्ट",
    nav_trade_setup: "ट्रेड सेटअप",
    nav_aaa: "AAA स्क्रिनर",
    search_placeholder: "🔍 स्टॉक्स / MCX सर्च करा...",
    market_live: "LIVE OPEN",
    market_closed: "MARKET CLOSED",
    tj_connected: "TR2488 कनेक्टेड",
    btn_watchlist: "वॉचलिस्ट",
    btn_login: "लॉग इन",
    btn_logout: "लॉग आऊट",
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
    zoom_in_title: "झूम इन / कॅन्डल मोठी करा (Zoom In)",
    zoom_out_title: "झूम आऊट / कॅन्डल लहान करा (Zoom Out)",
    pan_left_title: "मागील कॅन्डल्स पहा (Pan Left)",
    pan_right_title: "पुढील कॅन्डल्स पहा (Pan Right)",
    reset_view_title: "मूळ स्थितीत आणा (Reset)",
    fullscreen_title: "फुलस्क्रीन करा",
    btn_add_watchlist: "+ वॉचलिस्ट",
    bar_close_prefix: "कॅन्डल बंद: ",

    // Watchlist Sidebar
    wl_title: "मार्केट वॉचलिस्ट (Watchlist)",
    wl_btn_new: "➕ नवीन लिस्ट",
    wl_opt_indices: "🏛️ प्रमुख इंडायसेस (Nifty, Bank, Sensex, Midcap, FinNifty)",
    wl_opt_all: "📊 सर्व ५०० स्टॉक्स (Default)",
    wl_opt_mcx: "🪙 MCX कमोडिटी (Gold, Silver, Crude Oil, Natural Gas)",
    wl_search_placeholder: "🔍 स्टॉक / इंडेक्स शोधा (+ वर क्लिक करून जोडा)...",
    wl_delete_btn: "🗑️ ही वॉचलिस्ट डिलीट करा",

    // Trade Setup View
    ts_rules_title: "५-मिनिट Heikin Ashi + RSI(7) (80/20) रिव्हर्सल & CC (Confirmation Candle) सेटअप",
    ts_rules_sub: "नियम: ३+ सलग लाल HA कॅन्डल्स + RSI(7) < 20 (Oversold) + पहिली Flat Bottom (HA Open = HA Low) हिरवी HA कॅन्डल = 🟢 BUY कॉल सेटअप (Entry: HA Close | SL: HA Low).<br>३+ सलग हिरव्या HA कॅन्डल्स + RSI(7) > 80 (Overbought) + पहिली Flat Top (HA Open = HA High) लाल HA कॅन्डल = 🔴 SELL पुट सेटअप (Entry: HA Close | SL: HA High).",
    ts_tab_all: "सर्व",
    ts_tab_buy: "🟢 BUY Call",
    ts_tab_sell: "🔴 SELL Put",
    ts_tab_index: "इंडायसेस",
    ts_tab_stocks: "स्टॉक्स व MCX",
    ts_search_placeholder: "🔍 शोधा (उदा. NIFTY, RELIANCE, GOLD)...",
    ts_audio_on: "🔊 ध्वनी चालू",
    ts_audio_off: "🔇 ध्वनी बंद",
    ts_notif_btn: "🔔 ॲलर्ट परवानगी",
    ts_scan_btn: "⚡ आत्ता स्कॅन करा",
    ts_scan_scanning: "⏳ स्कॅनिंग चालू आहे...",
    ts_demo_alert_btn: "🔔 डेमो ॲलर्ट",
    ts_empty_title: "मागील ४० मिनिटांत कोणताही ५-मिनिट Heikin Ashi + RSI(7) सेटअप मिळालेला नाही",
    ts_empty_sub: "३+ विरुद्ध HA कॅन्डल्स + RSI(7) < 20 (BUY) किंवा RSI(7) > 80 (SELL) + पहिली Flat-Wick कन्फर्मेशन कॅन्डल पूर्ण होताच नवीन सिग्नल येथे आपोआप दिसेल.",
    ts_card_atm: "🎯 शिफारस केलेला पर्याय (ATM Strike):",
    ts_live_ltp: "चालू भाव (Live LTP):",
    ts_signal_ohlc: "🕯️ Signal 5m HA OHLC:",
    ts_prior_trend: "मागील ट्रेंड:",
    ts_lbl_entry: "एन्ट्री (HA Close):",
    ts_lbl_sl: "स्टॉप लॉस",
    ts_lbl_t1: "टार्गेट १ (1:1.5):",
    ts_lbl_t2: "टार्गेट २ (1:2.5):",
    ts_lbl_risk: "जोखीम (Risk):",
    ts_lbl_cc: "कन्फर्मेशन (CC):",
    ts_btn_view_ha: "📊 हीकेन आशी चार्ट पहा",
    ts_btn_load_main: "🚀 मुख्य टर्मिनलवर लोड करा",
    ts_modal_chart_close: "बंद करा ✕",
    ts_buy_badge: "🟢 BUY (कॉल सेटअप)",
    ts_sell_badge: "🔴 SELL (पुट सेटअप)",
    ts_cc_1st_green: "१ ली हिरवी HA कॅन्डल (Flat Bottom CC)",
    ts_cc_2nd_green: "२ री हिरवी HA कॅन्डल (1st Flat Bottom CC)",
    ts_cc_1st_red: "१ ली लाल HA कॅन्डल (Flat Top CC)",
    ts_cc_2nd_red: "२ री लाल HA कॅन्डल (1st Flat Top CC)",
    status_active: "🟢 ट्रेड चालू (Active)",
    status_tgt1: "✅ टार्गेट १ हिट",
    status_tgt2: "🎯 टार्गेट २ हिट",
    status_sl: "❌ स्टॉप लॉस हिट",

    // AAA Screener View
    aaa_title: "AAA प्रो ट्रेड स्कॅनर (Daily 1D Candlestick Screener)",
    aaa_buy_title: "खरेदी नियम (BUY Rules - Daily 1D)",
    aaa_buy_r1: "<strong>ट्रेंड:</strong> Daily (1D) चार्टवर <strong>Downtrend</strong> (सलग Red कॅन्डल्स / Swing Low).",
    aaa_buy_r2: "<strong>पॅटर्न्स:</strong> Bullish Harami, Bullish Engulfing, Bullish Piercing, Morning Star.",
    aaa_buy_r3: "<strong>Entry (Buy):</strong> रिव्हर्सल Green कॅन्डलची <strong>Close Price</strong> | <strong>SL:</strong> पॅटर्नचा <strong>Lowest Low</strong> (Mother/Candle Low).",
    aaa_sell_title: "विक्री नियम (SELL Rules - Daily 1D)",
    aaa_sell_r1: "<strong>ट्रेंड:</strong> Daily (1D) चार्टवर <strong>Uptrend</strong> (सलग Green कॅन्डल्स / Swing High).",
    aaa_sell_r2: "<strong>पॅटर्न्स:</strong> Bearish Harami, Bearish Engulfing, Bearish Piercing, Evening Star.",
    aaa_sell_r3: "<strong>Entry (Sell):</strong> रिव्हर्सल Red कॅन्डलची <strong>Close Price</strong> | <strong>SL:</strong> पॅटर्नचा <strong>Highest High</strong> (Mother/Candle High).",
    aaa_stat_universe: "एकूण स्टॉक्स (Universe)",
    aaa_stat_buy: "खरेदी सिग्नल्स (BUY)",
    aaa_stat_sell: "विक्री सिग्नल्स (SELL)",
    aaa_stat_last_scan: "शेवटचे स्कॅन (Last Scan)",
    aaa_tab_all: "सर्व सिग्नल्स",
    aaa_tab_buy: "🟢 BUY",
    aaa_tab_sell: "🔴 SELL",
    aaa_opt_pat_all: "सर्व पॅटर्न्स (All Daily 1D Patterns)",
    aaa_opt_days_10: "मागील १० दिवस (10 Daily Bars)",
    aaa_opt_days_5: "मागील ५ दिवस (5 Daily Bars)",
    aaa_opt_days_15: "मागील १५ दिवस (15 Daily Bars)",
    aaa_opt_trend_3: "३+ Daily कॅन्डल्स ट्रेंड",
    aaa_opt_trend_4: "४+ Daily कॅन्डल्स ट्रेंड (Standard)",
    aaa_opt_trend_5: "५+ Daily कॅन्डल्स ट्रेंड (Strong)",
    aaa_search_placeholder: "🔍 स्टॉक शोधा...",
    aaa_btn_scan: "⚡ आता स्कॅन करा",
    aaa_btn_scanning: "⏳ स्कॅन होत आहे...",
    aaa_th_symbol: "स्टॉक सिम्बॉल",
    aaa_th_type: "प्रकार",
    aaa_th_pattern: "कॅन्डलस्टिक पॅटर्न",
    aaa_th_trend: "ट्रेंड स्ट्रेंग्थ",
    aaa_th_entry: "एन्ट्री (Entry)",
    aaa_th_sl: "स्टॉप लॉस (SL)",
    aaa_th_t1: "टार्गेट १ (1:1.5)",
    aaa_th_t2: "टार्गेट २ (1:2.5)",
    aaa_th_risk: "जोखीम (Risk)",
    aaa_th_action: "कृती",
    aaa_empty_title: "सध्याच्या फिल्टर्सनुसार कोणताही सिग्नल मिळालेला नाही",
    aaa_empty_sub: "कृपया वरील फिल्टर्स बदलून पुन्हा तपासा किंवा स्कॅन करा.",
    aaa_btn_chart: "🔍 1D चार्ट",
    aaa_btn_load: "📊 लोड (1D)",

    // Modals & Authentication (Tradejini Onboarding)
    auth_modal_title: "पोर्टल ॲक्सेस (Tradejini Login & Onboarding)",
    auth_modal_desc: "Finanthropist Educare च्या अधिकृत ट्रेडिंग प्लॅटफॉर्मवर आपले स्वागत आहे.",
    auth_tab_login: "🔑 लॉग इन करा",
    auth_tab_register: "📝 Tradejini नवीन नोंदणी",
    auth_login_helper: "तुमच्या Tradejini क्लायंट आयडी किंवा नोंदणीकृत मोबाईल नंबरने लॉग इन करा.",
    auth_lbl_login_id: "Tradejini Client ID किंवा मोबाईल नंबर:",
    auth_ph_login_id: "उदा. TR1234 किंवा 9822012345",
    auth_lbl_password: "पासवर्ड (Password) *",
    auth_ph_password: "तुमचा पासवर्ड टाका",
    auth_btn_quick_login: "लॉग इन करा (Log In)",
    auth_reg_helper: "फक्त अधिकृत Tradejini खातेधारकच या प्लॅटफॉर्मचा वापर करू शकतात.",
    auth_lbl_name: "पूर्ण नाव (Full Name) *",
    auth_ph_name: "उदा. राहुल शर्मा",
    auth_lbl_phone: "मोबाईल नंबर (Mobile Number) *",
    auth_ph_phone: "उदा. 9822012345",
    auth_lbl_email: "ईमेल आयडी (Email ID) *",
    auth_ph_email: "उदा. rahul@gmail.com",
    auth_lbl_reg_password: "पासवर्ड तयार करा (Set Password) *",
    auth_ph_reg_password: "किमान ४ अक्षरी पासवर्ड",
    auth_lbl_tj_id: "तुमचा Tradejini क्लायंट आयडी (Tradejini Client ID) *",
    auth_ph_tj_id: "उदा. TR2488 / TJ1234...",
    auth_no_tj_title: "तुमच्याकडे Tradejini खाते नाही का?",
    auth_no_tj_desc: "कृपया नवीन Tradejini डिमॅट व ट्रेडिंग खाते उघडण्यासाठी खालील क्रमांकांवर संपर्क साधा किंवा व्हॉट्सॲप करा:",
    auth_help_num1: "+91 98220 00000 (Finanthropist Support)",
    auth_help_num2: "+91 93599 98294 (Account Opening Desk)",
    auth_help_whatsapp: "💬 Tradejini खाते उघडण्यासाठी WhatsApp करा",
    auth_btn_submit: "नोंदणी पूर्ण करा व ॲक्सेस विनंती पाठवा (Submit for Approval)",
    auth_switch_to_reg: "नवीन युझर आहात का? येथे नोंदणी करा",
    auth_switch_to_login: "आधीच नोंदणी केली आहे का? लॉग इन करा",
    auth_vip_link: "🔑 व्हीआयपी अप्रूव्हल कोड आहे का?",
    user_profile_title: "युझर प्रोफाईल",
    user_status_approved: "🟢 अधिकृत ॲक्सेस (Approved)",
    pending_modal_title: "तुमची विनंती ॲडमिन मंजुरीसाठी पाठवली आहे!",
    pending_modal_desc: "फक्त अधिकृत Tradejini खातेधारकच या सॉफ्टवेअरचा वापर करू शकतात. ॲडमिनद्वारे तुमचा Tradejini क्लायंट आयडी पडताळल्यानंतर त्वरित ॲक्सेस दिला जाईल. मंजुरी मिळताच हे पेज आपोआप उघडेल.",
    pending_lbl_name: "नाव:",
    pending_lbl_phone: "मोबाईल:",
    pending_lbl_tj_id: "Tradejini ID:",
    pending_lbl_status: "स्थिती:",
    pending_status_val: "🟡 PENDING ADMIN APPROVAL",
    pending_poll_note: "स्टेटस दर ३ सेकंदांनी आपोआप तपासले जात आहे...",
    pending_vip_hint: "तुम्हाला ॲडमिनकडून १-क्लिक व्हीआयपी की मिळाली असल्यास येथे टाका:",
    pending_vip_ph: "VIP Unlock Key टाका...",
    pending_vip_btn: "अनलॉक करा",
    vip_modal_title: "व्हीआयपी ॲक्सेस कोड टाका",
    vip_modal_lbl: "ॲप्रूव्हल कोड (Approval Code):",
    vip_modal_btn: "अनलॉक करा (Unlock)",
    admin_modal_title: "Admin Control Panel",
    admin_modal_lbl: "Enter Admin Security PIN:",
    admin_modal_btn: "Unlock Dashboard",
    alert_modal_title: "🚨 नवीन ट्रेड सिग्नल आला आहे!",
    alert_modal_sub: "५-मिनिट Heikin Ashi + RSI(7) रिव्हर्सल & CC स्ट्रॅटेजी",
    alert_lbl_rec: "शिफारस:",
    alert_lbl_entry: "एन्ट्री भाव:",
    alert_lbl_sl: "स्टॉप लॉस:",
    alert_lbl_tgt: "टार्गेट:",
    alert_btn_close: "समजले (Close)",
    modal_create_wl_title: "नवीन वॉचलिस्ट तयार करा",
    modal_create_wl_lbl: "वॉचलिस्टचे नाव द्या:",
    modal_create_wl_btn: "तयार करा (Create)",
    modal_add_wl_title: "वॉचलिस्टमध्ये जोडा",
    modal_add_wl_lbl: "कोणत्या वॉचलिस्टमध्ये जोडायचे?",
    modal_add_wl_btn: "जोडा (Add Stock)",
    modal_add_wl_new_btn: "➕ नवीन यादी"
  },

  en: {
    // Header & Brand
    brand_sub: "Pvt Ltd • Real-Time Trading Suite",
    nav_chart: "Chart",
    nav_trade_setup: "Trade Setup",
    nav_aaa: "AAA Screener",
    search_placeholder: "🔍 Search Stocks / MCX...",
    market_live: "LIVE OPEN",
    market_closed: "MARKET CLOSED",
    tj_connected: "TR2488 Connected",
    btn_watchlist: "Watchlist",
    btn_login: "Login",
    btn_logout: "Logout",
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
    pan_left_title: "Pan Left (View Previous Candles)",
    pan_right_title: "Pan Right (View Next Candles)",
    reset_view_title: "Reset View (Fit Candles)",
    fullscreen_title: "Toggle Fullscreen",
    btn_add_watchlist: "+ Watchlist",
    bar_close_prefix: "BAR CLOSE: ",

    // Watchlist Sidebar
    wl_title: "Market Watchlist",
    wl_btn_new: "➕ New List",
    wl_opt_indices: "🏛️ Major Indices (Nifty, Bank, Sensex, Midcap, FinNifty)",
    wl_opt_all: "📊 All 500 Stocks (Default)",
    wl_opt_mcx: "🪙 MCX Commodities (Gold, Silver, Crude Oil, Natural Gas)",
    wl_search_placeholder: "🔍 Search stock / index (+ to add)...",
    wl_delete_btn: "🗑️ Delete This Watchlist",

    // Trade Setup View
    ts_rules_title: "5-Minute Heikin Ashi + RSI(7) (80/20) Reversal & CC (Confirmation Candle) Setup",
    ts_rules_sub: "Rules: 3+ consecutive Red HA candles + RSI(7) < 20 (Oversold) + 1st Flat Bottom (HA Open = HA Low) Green HA candle = 🟢 BUY Call Setup (Entry: HA Close | SL: HA Low).<br>3+ consecutive Green HA candles + RSI(7) > 80 (Overbought) + 1st Flat Top (HA Open = HA High) Red HA candle = 🔴 SELL Put Setup (Entry: HA Close | SL: HA High).",
    ts_tab_all: "All",
    ts_tab_buy: "🟢 BUY Call",
    ts_tab_sell: "🔴 SELL Put",
    ts_tab_index: "Indices",
    ts_tab_stocks: "Stocks & MCX",
    ts_search_placeholder: "🔍 Search (e.g. NIFTY, RELIANCE, GOLD)...",
    ts_audio_on: "🔊 Audio ON",
    ts_audio_off: "🔇 Audio OFF",
    ts_notif_btn: "🔔 Enable Alerts",
    ts_scan_btn: "⚡ Scan Now",
    ts_scan_scanning: "⏳ Scanning in progress...",
    ts_demo_alert_btn: "🔔 Demo Alert",
    ts_empty_title: "No 5-minute Heikin Ashi + RSI(7) setup detected in the last 40 minutes",
    ts_empty_sub: "New signals will appear automatically when 3+ opposite HA candles + RSI(7) < 20 (BUY) or RSI(7) > 80 (SELL) + 1st Flat-Wick confirmation candle completes.",
    ts_card_atm: "🎯 Recommended Option (ATM Strike):",
    ts_live_ltp: "Live LTP:",
    ts_signal_ohlc: "🕯️ Signal 5m HA OHLC:",
    ts_prior_trend: "Prior Trend:",
    ts_lbl_entry: "Entry (HA Close):",
    ts_lbl_sl: "Stop Loss",
    ts_lbl_t1: "Target 1 (1:1.5):",
    ts_lbl_t2: "Target 2 (1:2.5):",
    ts_lbl_risk: "Risk (Points):",
    ts_lbl_cc: "Confirmation (CC):",
    ts_btn_view_ha: "📊 View Heikin Ashi Chart",
    ts_btn_load_main: "🚀 Load On Main Terminal",
    ts_modal_chart_close: "Close ✕",
    ts_buy_badge: "🟢 BUY (Call Setup)",
    ts_sell_badge: "🔴 SELL (Put Setup)",
    ts_cc_1st_green: "1st Green HA Candle (Flat Bottom CC)",
    ts_cc_2nd_green: "2nd Green HA Candle (1st Flat Bottom CC)",
    ts_cc_1st_red: "1st Red HA Candle (Flat Top CC)",
    ts_cc_2nd_red: "2nd Red HA Candle (1st Flat Top CC)",
    status_active: "🟢 Active Trade",
    status_tgt1: "✅ Target 1 Hit",
    status_tgt2: "🎯 Target 2 Hit",
    status_sl: "❌ Stop Loss Hit",

    // AAA Screener View
    aaa_title: "AAA Pro Trade Scanner (Daily 1D Candlestick Screener)",
    aaa_buy_title: "BUY Rules (Daily 1D)",
    aaa_buy_r1: "<strong>Trend:</strong> Daily (1D) chart <strong>Downtrend</strong> (Consecutive Red candles / Swing Low).",
    aaa_buy_r2: "<strong>Patterns:</strong> Bullish Harami, Bullish Engulfing, Bullish Piercing, Morning Star.",
    aaa_buy_r3: "<strong>Entry (Buy):</strong> Reversal Green candle <strong>Close Price</strong> | <strong>SL:</strong> Pattern <strong>Lowest Low</strong> (Mother/Candle Low).",
    aaa_sell_title: "SELL Rules (Daily 1D)",
    aaa_sell_r1: "<strong>Trend:</strong> Daily (1D) chart <strong>Uptrend</strong> (Consecutive Green candles / Swing High).",
    aaa_sell_r2: "<strong>Patterns:</strong> Bearish Harami, Bearish Engulfing, Bearish Piercing, Evening Star.",
    aaa_sell_r3: "<strong>Entry (Sell):</strong> Reversal Red candle <strong>Close Price</strong> | <strong>SL:</strong> Pattern <strong>Highest High</strong> (Mother/Candle High).",
    aaa_stat_universe: "Total Universe Stocks",
    aaa_stat_buy: "BUY Signals",
    aaa_stat_sell: "SELL Signals",
    aaa_stat_last_scan: "Last Scan",
    aaa_tab_all: "All Signals",
    aaa_tab_buy: "🟢 BUY",
    aaa_tab_sell: "🔴 SELL",
    aaa_opt_pat_all: "All Daily Patterns (1D)",
    aaa_opt_days_10: "Past 10 Days (10 Daily Bars)",
    aaa_opt_days_5: "Past 5 Days (5 Daily Bars)",
    aaa_opt_days_15: "Past 15 Days (15 Daily Bars)",
    aaa_opt_trend_3: "3+ Daily Trend Bars",
    aaa_opt_trend_4: "4+ Daily Trend Bars (Standard)",
    aaa_opt_trend_5: "5+ Daily Trend Bars (Strong)",
    aaa_search_placeholder: "🔍 Search stock...",
    aaa_btn_scan: "⚡ Scan Now",
    aaa_btn_scanning: "⏳ Scanning...",
    aaa_th_symbol: "Stock Symbol",
    aaa_th_type: "Type",
    aaa_th_pattern: "Candlestick Pattern",
    aaa_th_trend: "Trend Strength",
    aaa_th_entry: "Entry",
    aaa_th_sl: "Stop Loss (SL)",
    aaa_th_t1: "Target 1 (1:1.5)",
    aaa_th_t2: "Target 2 (1:2.5)",
    aaa_th_risk: "Risk",
    aaa_th_action: "Actions",
    aaa_empty_title: "No signals found matching the current filters",
    aaa_empty_sub: "Please adjust the filters above or scan again.",
    aaa_btn_chart: "🔍 1D Chart",
    aaa_btn_load: "📊 Load (1D)",

    // Modals & Authentication (Tradejini Onboarding)
    auth_modal_title: "Portal Access (Tradejini Login & Onboarding)",
    auth_modal_desc: "Welcome to Finanthropist Educare's official trading platform.",
    auth_tab_login: "🔑 Log In",
    auth_tab_register: "📝 Tradejini Onboarding",
    auth_login_helper: "Log in using your Tradejini Client ID or registered mobile number.",
    auth_lbl_login_id: "Tradejini Client ID or Mobile Number:",
    auth_ph_login_id: "e.g. TR1234 or 9822012345",
    auth_lbl_password: "Password *",
    auth_ph_password: "Enter your password",
    auth_btn_quick_login: "Log In (Access Terminal)",
    auth_reg_helper: "Access to AAA Setup is exclusively reserved for verified Tradejini account holders.",
    auth_lbl_name: "Full Name *",
    auth_ph_name: "e.g. Rahul Sharma",
    auth_lbl_phone: "Mobile Number (10 Digits) *",
    auth_ph_phone: "e.g. 9822012345",
    auth_lbl_email: "Email ID *",
    auth_ph_email: "e.g. rahul@gmail.com",
    auth_lbl_reg_password: "Set Password *",
    auth_ph_reg_password: "Min 4 characters",
    auth_lbl_tj_id: "Your Tradejini Client ID *",
    auth_ph_tj_id: "e.g. TR2488 / TJ1234...",
    auth_no_tj_title: "Don't have a Tradejini Account?",
    auth_no_tj_desc: "Please contact our support desk below or reach out on WhatsApp to open your Tradejini Demat & Trading account:",
    auth_help_num1: "+91 98220 00000 (Finanthropist Support)",
    auth_help_num2: "+91 93599 98294 (Account Opening Desk)",
    auth_help_whatsapp: "💬 Open Tradejini Account on WhatsApp",
    auth_btn_submit: "Submit for Admin Approval",
    auth_switch_to_reg: "New user? Create an account (Register)",
    auth_switch_to_login: "Already registered? Log in here",
    auth_vip_link: "🔑 Have a VIP Approval Code?",
    user_profile_title: "User Profile",
    user_status_approved: "🟢 Approved Access",
    pending_modal_title: "Your Request is Awaiting Admin Approval!",
    pending_modal_desc: "Only verified Tradejini account holders are permitted to access this software. Once the admin verifies and approves your Tradejini Client ID, full access will be granted instantly.",
    pending_lbl_name: "Name:",
    pending_lbl_phone: "Mobile:",
    pending_lbl_tj_id: "Tradejini ID:",
    pending_lbl_status: "Status:",
    pending_status_val: "🟡 PENDING ADMIN APPROVAL",
    pending_poll_note: "Status is auto-polling every 3 seconds...",
    pending_vip_hint: "If you have an instant VIP unlock key from admin, enter below:",
    pending_vip_ph: "Enter VIP Unlock Key...",
    pending_vip_btn: "Unlock",
    vip_modal_title: "Enter VIP Access Code",
    vip_modal_lbl: "Approval Code:",
    vip_modal_btn: "Unlock (Access)",
    admin_modal_title: "Admin Control Panel",
    admin_modal_lbl: "Enter Admin Security PIN:",
    admin_modal_btn: "Unlock Dashboard",
    alert_modal_title: "🚨 New Trade Signal Detected!",
    alert_modal_sub: "5-Minute Heikin Ashi + RSI(7) Reversal & CC Strategy",
    alert_lbl_rec: "Recommendation:",
    alert_lbl_entry: "Entry Price:",
    alert_lbl_sl: "Stop Loss:",
    alert_lbl_tgt: "Target:",
    alert_btn_close: "Got It (Close)",
    modal_create_wl_title: "Create New Watchlist",
    modal_create_wl_lbl: "Watchlist Name:",
    modal_create_wl_btn: "Create List",
    modal_add_wl_title: "Add Stock to Watchlist",
    modal_add_wl_lbl: "Select Destination Watchlist:",
    modal_add_wl_btn: "Add Stock",
    modal_add_wl_new_btn: "➕ New List"
  }
};

const I18N = {
  currentLang: localStorage.getItem('fin_portal_lang') || 'mr',

  t(key) {
    const dict = I18N_TRANSLATIONS[this.currentLang] || I18N_TRANSLATIONS['mr'];
    return (dict && dict[key] != null) ? dict[key] : key;
  },

  getLang() {
    return this.currentLang;
  },

  setLanguage(lang) {
    if (lang !== 'mr' && lang !== 'en') lang = 'mr';
    this.currentLang = lang;
    try {
      localStorage.setItem('fin_portal_lang', lang);
    } catch (e) {}

    // Update document language attribute
    document.documentElement.lang = lang;

    // Toggle active state on language buttons
    const btns = document.querySelectorAll('.lang-btn');
    btns.forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-lang') === lang);
    });

    this.applyTranslations();

    // Notify Submodules
    if (window.TradeSetupModule && typeof window.TradeSetupModule.onLanguageChange === 'function') {
      try { window.TradeSetupModule.onLanguageChange(); } catch (e) { console.warn('[I18N] TS Module update:', e); }
    }
    if (window.AAAScreenerModule && typeof window.AAAScreenerModule.onLanguageChange === 'function') {
      try { window.AAAScreenerModule.onLanguageChange(); } catch (e) { console.warn('[I18N] AAA Module update:', e); }
    }
    if (typeof window.updateMarketStatusDisplay === 'function') {
      try { window.updateMarketStatusDisplay(); } catch (e) {}
    }
    if (typeof window.renderWatchlistItems === 'function') {
      try { window.renderWatchlistItems(); } catch (e) {}
    }

    // Dispatch global event for any decoupled listeners
    try {
      window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
    } catch (e) {}
  },

  applyTranslations() {
    const dict = I18N_TRANSLATIONS[this.currentLang] || I18N_TRANSLATIONS['mr'];

    // 1. Elements with data-i18n (innerHTML or textContent)
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (dict[key] != null) {
        el.innerHTML = dict[key];
      }
    });

    // 2. Elements with data-i18n-placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (dict[key] != null) {
        el.setAttribute('placeholder', dict[key]);
      }
    });

    // 3. Elements with data-i18n-title
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (dict[key] != null) {
        el.setAttribute('title', dict[key]);
      }
    });
  },

  init() {
    // Restore saved language
    const saved = localStorage.getItem('fin_portal_lang');
    if (saved === 'en' || saved === 'mr') {
      this.currentLang = saved;
    } else {
      this.currentLang = 'mr';
    }

    document.documentElement.lang = this.currentLang;

    // Apply active class to buttons
    const btns = document.querySelectorAll('.lang-btn');
    btns.forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-lang') === this.currentLang);
      b.onclick = (e) => {
        e.preventDefault();
        const l = b.getAttribute('data-lang');
        this.setLanguage(l);
      };
    });

    this.applyTranslations();
  }
};

window.I18N = I18N;
window.I18N_TRANSLATIONS = I18N_TRANSLATIONS;

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => I18N.init());
  } else {
    I18N.init();
  }
}
