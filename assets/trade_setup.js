// ============================================================================
// FINANTHROPIST EDUCARE - TRADE SETUP (STOCK STRATEGY ALERT SCANNER)
// 5-Minute Heikin Ashi Reversal & Confirmation Candle (CC) Strategy Engine
// ============================================================================

const TradeSetupModule = (function () {
  const state = {
    indices: [],
    signals: [],
    filteredSignals: [],
    activeFilter: 'ALL',
    searchQuery: '',
    audioEnabled: true,
    notificationsEnabled: false,
    refreshIntervalSeconds: 60,
    secondsRemaining: 60,
    timerId: null,
    countdownId: null,
    knownSignalIds: new Set(),
    currentModalSignal: null,
    chartData: null
  };

  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playAlertSound(type = 'BUY') {
    if (!state.audioEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      gain.connect(ctx.destination);
      osc.connect(gain);

      if (type === 'BUY') {
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.15);
        osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.30);
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.35, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
        osc.start(now);
        osc.stop(now + 0.65);
      } else {
        osc.frequency.setValueAtTime(783.99, now);
        osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.15);
        osc.frequency.exponentialRampToValueAtTime(523.25, now + 0.30);
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.35, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
        osc.start(now);
        osc.stop(now + 0.65);
      }
    } catch (err) {
      console.warn("Audio play error:", err);
    }
  }

  function triggerBrowserNotification(signal) {
    if (!state.notificationsEnabled || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    const isEn = window.I18N && window.I18N.getLang() === 'en';
    const titlePrefix = signal.Type === 'BUY'
      ? (isEn ? '🟢 BUY (Call): ' : '🟢 BUY (कॉल): ')
      : (isEn ? '🔴 SELL (Put): ' : '🔴 SELL (पुट): ');
    const title = titlePrefix + signal.Symbol + ' (' + signal.ATM + ')';
    const entryLbl = isEn ? 'Entry' : 'एन्ट्री';
    const options = {
      body: `${entryLbl}: ₹${signal.Entry} | SL: ₹${signal.StopLoss} | CC: ${signal.CCPosition}`,
      icon: './assets/logo.png',
      requireInteraction: false
    };
    try {
      const notif = new Notification(title, options);
      notif.onclick = function () {
        window.focus();
        showSignalModal(signal);
      };
    } catch (e) {
      console.warn("Notification error:", e);
    }
  }

  function convertToHeikinAshi(rawCandles) {
    if (!rawCandles || rawCandles.length === 0) return [];
    const ha = [];
    let prevHaOpen = rawCandles[0].open;
    let prevHaClose = rawCandles[0].close;

    for (let i = 0; i < rawCandles.length; i++) {
      const c = rawCandles[i];
      const rawHaClose = (c.open + c.high + c.low + c.close) / 4;
      const rawHaOpen = i === 0 ? (c.open + c.close) / 2 : (prevHaOpen + prevHaClose) / 2;
      const rawHaHigh = Math.max(c.high, rawHaOpen, rawHaClose);
      const rawHaLow = Math.min(c.low, rawHaOpen, rawHaClose);
      prevHaOpen = rawHaOpen;
      prevHaClose = rawHaClose;

      const haOpen = Number(rawHaOpen.toFixed(2));
      const haHigh = Number(rawHaHigh.toFixed(2));
      const haLow = Number(rawHaLow.toFixed(2));
      const haClose = Number(rawHaClose.toFixed(2));

      const isGreen = haClose > haOpen;
      const isRed = haClose < haOpen;
      const body = Number(Math.abs(haClose - haOpen).toFixed(2));
      const range = Math.max(Number((haHigh - haLow).toFixed(2)), 0.01);
      const lowerWick = Number((Math.min(haOpen, haClose) - haLow).toFixed(2));
      const upperWick = Number((haHigh - Math.max(haOpen, haClose)).toFixed(2));

      const noLowerWick = isGreen && (body / range) >= 0.20 && lowerWick <= body * 0.03;
      const noUpperWick = isRed && (body / range) >= 0.20 && upperWick <= body * 0.03;

      ha.push({
        Time: c.time || `Bar ${i + 1}`,
        Timestamp: c.timestamp || Date.now(),
        Open: c.open,
        High: c.high,
        Low: c.low,
        Close: c.close,
        HA_Open: haOpen,
        HA_High: haHigh,
        HA_Low: haLow,
        HA_Close: haClose,
        IsGreen: isGreen,
        NoLowerWick: noLowerWick,
        NoUpperWick: noUpperWick
      });
    }
    return ha;
  }

  function calculateATM(symbol, price) {
    const p = Number(price);
    const sym = symbol.toUpperCase().trim();
    let step = 50;
    if (sym.includes('BANKNIFTY') || sym === 'BANK NIFTY' || sym === '^NSEBANK') step = 100;
    else if (sym.includes('SENSEX') || sym === '^BSESN') step = 100;
    else if (sym.includes('FINNIFTY') || sym === 'FIN NIFTY' || sym.includes('MIDCP') || sym.includes('MIDCAP')) step = 50;
    else if (sym.includes('GOLD')) step = 100;
    else if (sym.includes('CRUDE')) step = 50;
    else if (p > 5000) step = 100;
    else if (p > 2000) step = 50;
    else if (p > 1000) step = 20;
    else if (p > 500) step = 10;
    else step = 5;

    const rounded = Math.round(p / step) * step;
    return {
      ce: `${rounded} CE`,
      pe: `${rounded} PE`,
      strike: rounded
    };
  }

  // Scan live 5-Minute Heikin Ashi signals directly from Tradejini CubePlus API
  function scanStrategy() {
    const isEn = window.I18N && window.I18N.getLang() === 'en';
    const container = document.getElementById('tsSignalsContainer');
    if (container && (!state.signals || state.signals.length === 0)) {
      container.innerHTML = `
        <div class="ts-empty-state">
          <div class="ts-empty-icon">⏳</div>
          <h3>${isEn ? 'Tradejini CubePlus Live 5-Minute Heikin Ashi Scanning...' : 'Tradejini CubePlus Live 5-Minute Heikin Ashi स्कॅनिंग चालू आहे...'}</h3>
          <p>${isEn ? 'Please wait — real-time setups are being verified from the live broker datafeed.' : 'कृपया प्रतीक्षा करा — थेट ब्रोकर डेटाफीडवरून रिअल-टाइम सेटअप तपासले जात आहेत.'}</p>
        </div>
      `;
    }

    fetch('./api/tradejini/trade-setup')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.s === 'ok') {
          if (Array.isArray(data.indices) && data.indices.length > 0) {
            state.indices = data.indices;
            renderIndices();
          }
          if (Array.isArray(data.signals)) {
            const hadKnown = state.knownSignalIds.size > 0;
            data.signals.forEach(sig => {
              if (!state.knownSignalIds.has(sig.Id)) {
                state.knownSignalIds.add(sig.Id);
                if (hadKnown && sig.Status === 'ACTIVE') {
                  playAlertSound(sig.Type);
                  triggerBrowserNotification(sig);
                }
              }
            });
            state.signals = data.signals;
            filterAndRenderSignals();
          }
        }
      })
      .catch(err => {
        console.warn('[TradeSetup] Live Tradejini scan error:', err);
      });
  }

  function renderIndices() {
    const el = document.getElementById('tsIndicesRibbon');
    if (!el) return;
    el.innerHTML = state.indices.map(idx => {
      const isUp = idx.Change >= 0;
      const col = isUp ? 'var(--color-buy)' : 'var(--color-sell)';
      const sign = isUp ? '+' : '';
      return `
        <div class="ts-index-card">
          <div class="ts-index-left">
            <div class="ts-index-name">${idx.Name}</div>
            <div class="ts-index-atm">ATM: ${idx.ATM}</div>
          </div>
          <div class="ts-index-right">
            <div class="ts-index-ltp" style="color:${col};">₹${idx.LTP.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
            <div class="ts-index-chg" style="color:${col};">${sign}${idx.Change} (${sign}${idx.ChangePercent}%)</div>
          </div>
        </div>
      `;
    }).join('');
  }

  function getStatusBadgeStyle(status) {
    if (status === 'TARGET_2_HIT') {
      return 'background:#dcfce7; color:#15803d; border:1px solid #86efac;';
    }
    if (status === 'TARGET_1_HIT') {
      return 'background:#ecfdf5; color:#047857; border:1px solid #6ee7b7;';
    }
    if (status === 'SL_HIT') {
      return 'background:#fef2f2; color:#b91c1c; border:1px solid #fca5a5;';
    }
    return 'background:#eff6ff; color:#1d4ed8; border:1px solid #93c5fd;';
  }

  function getLocalizedStatusText(sig) {
    if (!window.I18N) return sig.StatusText || '🟢 ट्रेड चालू (Active)';
    if (sig.Status === 'TARGET_2_HIT') return I18N.t('status_tgt2');
    if (sig.Status === 'TARGET_1_HIT') return I18N.t('status_tgt1');
    if (sig.Status === 'SL_HIT') return I18N.t('status_sl');
    return I18N.t('status_active');
  }

  function getLocalizedCC(cc) {
    if (!cc) return '';
    if (!window.I18N) return cc;
    const isEn = window.I18N.getLang() === 'en';
    if (cc.includes('१ ली हिरवी') || cc.includes('1st Green')) {
      return isEn ? I18N.t('ts_cc_1st_green') : '१ ली हिरवी HA कॅन्डल (Flat Bottom CC)';
    }
    if (cc.includes('२ री हिरवी') || cc.includes('2nd Green')) {
      return isEn ? I18N.t('ts_cc_2nd_green') : '२ री हिरवी HA कॅन्डल (1st Flat Bottom CC)';
    }
    if (cc.includes('१ ली लाल') || cc.includes('1st Red')) {
      return isEn ? I18N.t('ts_cc_1st_red') : '१ ली लाल HA कॅन्डल (Flat Top CC)';
    }
    if (cc.includes('२ री लाल') || cc.includes('2nd Red')) {
      return isEn ? I18N.t('ts_cc_2nd_red') : '२ री लाल HA कॅन्डल (1st Flat Top CC)';
    }
    return cc;
  }

  function filterAndRenderSignals() {
    let filtered = state.signals.slice();
    if (state.activeFilter === 'BUY') filtered = filtered.filter(s => s.Type === 'BUY');
    else if (state.activeFilter === 'SELL') filtered = filtered.filter(s => s.Type === 'SELL');
    else if (state.activeFilter === 'INDEX') filtered = filtered.filter(s => s.Category === 'INDEX');
    else if (state.activeFilter === 'STOCKS') filtered = filtered.filter(s => s.Category === 'STOCK' || s.Category === 'MCX');

    if (state.searchQuery) {
      filtered = filtered.filter(s => s.Symbol.toLowerCase().includes(state.searchQuery));
    }
    state.filteredSignals = filtered;

    // Update Counts
    const cAll = document.getElementById('tsCountAll');
    const cBuy = document.getElementById('tsCountBuy');
    const cSell = document.getElementById('tsCountSell');
    const cIdx = document.getElementById('tsCountIndex');
    const cStk = document.getElementById('tsCountStock');
    if (cAll) cAll.textContent = state.signals.length;
    if (cBuy) cBuy.textContent = state.signals.filter(s => s.Type === 'BUY').length;
    if (cSell) cSell.textContent = state.signals.filter(s => s.Type === 'SELL').length;
    if (cIdx) cIdx.textContent = state.signals.filter(s => s.Category === 'INDEX').length;
    if (cStk) cStk.textContent = state.signals.filter(s => s.Category !== 'INDEX').length;

    const container = document.getElementById('tsSignalsContainer');
    if (!container) return;

    if (filtered.length === 0) {
      const isEn = window.I18N && window.I18N.getLang() === 'en';
      container.innerHTML = `
        <div class="ts-empty-state">
          <div class="ts-empty-icon">🔍</div>
          <h3>${isEn ? (window.I18N.t('ts_empty_title')) : 'मागील ४० मिनिटांत कोणताही ५-मिनिट Heikin Ashi + RSI(7) सेटअप मिळालेला नाही'}</h3>
          <p>${isEn ? (window.I18N.t('ts_empty_sub')) : '३+ विरुद्ध HA कॅन्डल्स + <strong>RSI(7) &lt; 20 (BUY)</strong> किंवा <strong>RSI(7) &gt; 80 (SELL)</strong> + पहिली Flat-Wick कन्फर्मेशन कॅन्डल पूर्ण होताच नवीन सिग्नल येथे आपोआप दिसेल.'}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(sig => {
      const isBuy = sig.Type === 'BUY';
      const isEn = window.I18N && window.I18N.getLang() === 'en';
      const badgeClass = isBuy ? 'ts-pill-buy' : 'ts-pill-sell';
      const badgeText = isBuy 
        ? (window.I18N ? I18N.t('ts_buy_badge') : '🟢 BUY (कॉल सेटअप)') 
        : (window.I18N ? I18N.t('ts_sell_badge') : '🔴 SELL (पुट सेटअप)');
      const statusStyle = getStatusBadgeStyle(sig.Status || 'ACTIVE');
      const statusText = getLocalizedStatusText(sig);
      const haO = sig.HA_Open != null ? sig.HA_Open : sig.Entry;
      const haH = sig.HA_High != null ? sig.HA_High : sig.Entry;
      const haL = sig.HA_Low != null ? sig.HA_Low : sig.StopLoss;
      const haC = sig.HA_Close != null ? sig.HA_Close : sig.Entry;
      const priorTrend = isEn 
        ? (isBuy ? '3+ Red HA Candles' : '3+ Green HA Candles') 
        : (sig.PriorTrend || (isBuy ? '३+ लाल HA कॅन्डल्स' : '३+ हिरव्या HA कॅन्डल्स'));
      const rsiDisplay = sig.RSILabel || (sig.RSI != null ? `${sig.RSI} (${isBuy ? '< 20 Oversold' : '> 80 Overbought'})` : (isBuy ? '< 20 Oversold' : '> 80 Overbought'));
      const rsiBadgeStyle = isBuy
        ? 'background:#ecfdf5; color:#047857; border:1px solid #6ee7b7;'
        : 'background:#fef2f2; color:#b91c1c; border:1px solid #fca5a5;';
      const localizedCC = getLocalizedCC(sig.CCPosition);

      const tAtm = window.I18N ? I18N.t('ts_card_atm') : '🎯 शिफारस केलेला पर्याय (ATM Strike):';
      const tLtp = window.I18N ? I18N.t('ts_live_ltp') : 'चालू भाव (Live LTP):';
      const tOhlc = window.I18N ? I18N.t('ts_signal_ohlc') : '🕯️ Signal 5m HA OHLC:';
      const tPrior = window.I18N ? I18N.t('ts_prior_trend') : 'मागील ट्रेंड:';
      const tEntry = window.I18N ? I18N.t('ts_lbl_entry') : 'एन्ट्री (HA Close):';
      const tSl = window.I18N ? I18N.t('ts_lbl_sl') : 'स्टॉप लॉस';
      const tT1 = window.I18N ? I18N.t('ts_lbl_t1') : 'टार्गेट १ (1:1.5):';
      const tT2 = window.I18N ? I18N.t('ts_lbl_t2') : 'टार्गेट २ (1:2.5):';
      const tRisk = window.I18N ? I18N.t('ts_lbl_risk') : 'जोखीम (Risk):';
      const tCc = window.I18N ? I18N.t('ts_lbl_cc') : 'कन्फर्मेशन (CC):';
      const tBtnView = window.I18N ? I18N.t('ts_btn_view_ha') : '📊 हीकेन आशी चार्ट पहा';
      const tBtnLoad = window.I18N ? I18N.t('ts_btn_load_main') : '🚀 मुख्य टर्मिनलवर लोड करा';

      return `
        <div class="ts-signal-card ${isBuy ? 'buy-border' : 'sell-border'}" style="${sig.Status === 'SL_HIT' ? 'opacity:0.86;' : ''}">
          <div class="ts-card-header" style="flex-wrap:wrap; gap:6px;">
            <div class="ts-card-title-group">
              <span class="ts-pill ${badgeClass}">${badgeText}</span>
              <h3 class="ts-symbol-title">${sig.Symbol}</h3>
              <span class="ts-cat-badge">${sig.Category}</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span style="font-size:11px; font-weight:800; padding:3px 8px; border-radius:999px; ${rsiBadgeStyle}">
                ${isBuy ? '📉' : '📈'} RSI(7): ${rsiDisplay}
              </span>
              <span style="font-size:11px; font-weight:800; padding:3px 8px; border-radius:999px; ${statusStyle}">
                ${statusText}
              </span>
              <div class="ts-card-time">⏰ ${sig.Time}</div>
            </div>
          </div>

          <div class="ts-atm-banner" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div>
              <span>${tAtm}</span>
              <strong>${sig.ATM}</strong>
            </div>
            <div style="font-size:12px; font-weight:800; color:#0f172a; background:#ffffff; padding:3px 10px; border-radius:6px; border:1px solid #cbd5e1;">
              ${tLtp} <span style="color:${isBuy ? '#059669' : '#dc2626'};">₹${sig.LTP != null ? sig.LTP : sig.Entry}</span>
            </div>
          </div>

          <!-- Pure Heikin Ashi Signal Candle OHLC + RSI Strip -->
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:6px 10px; margin-bottom:10px; font-size:11px;">
            <span style="font-weight:700; color:#475569;">${tOhlc}</span>
            <span>O: <strong>₹${haO}</strong></span>
            <span>H: <strong style="color:#089981;">₹${haH}</strong></span>
            <span>L: <strong style="color:#f23645;">₹${haL}</strong></span>
            <span>C: <strong style="color:#1d4ed8;">₹${haC}</strong></span>
            <span style="background:#eef2ff; color:#3730a3; padding:2px 6px; border-radius:4px; font-weight:700;">${tPrior} ${priorTrend}</span>
          </div>

          <div class="ts-card-grid">
            <div class="ts-cell">
              <span class="ts-cell-label">${tEntry}</span>
              <strong class="ts-cell-val" style="color:var(--text-main);">₹${sig.Entry}</strong>
            </div>
            <div class="ts-cell">
              <span class="ts-cell-label">${tSl} (${isBuy ? 'HA Low' : 'HA High'}):</span>
              <strong class="ts-cell-val text-danger">₹${sig.StopLoss}</strong>
            </div>
            <div class="ts-cell">
              <span class="ts-cell-label">${tT1}</span>
              <strong class="ts-cell-val text-success">₹${sig.Target1}</strong>
            </div>
            <div class="ts-cell">
              <span class="ts-cell-label">${tT2}</span>
              <strong class="ts-cell-val text-success">₹${sig.Target2}</strong>
            </div>
            <div class="ts-cell">
              <span class="ts-cell-label">${tRisk}</span>
              <strong class="ts-cell-val">₹${sig.RiskPoints} pts</strong>
            </div>
            <div class="ts-cell">
              <span class="ts-cell-label">${tCc}</span>
              <strong class="ts-cell-val text-warning">${localizedCC}</strong>
            </div>
          </div>

          <div class="ts-card-actions">
            <button class="ts-btn-outline" onclick="TradeSetupModule.viewChart('${sig.Symbol}', '${sig.Id}')">
              ${tBtnView}
            </button>
            <button class="ts-btn-solid" onclick="TradeSetupModule.openInMainChart('${sig.Symbol}')">
              ${tBtnLoad}
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  function showSignalModal(sig) {
    state.currentModalSignal = sig;
    const modal = document.getElementById('tsAlertModal');
    if (!modal) return;
    const isEn = window.I18N && window.I18N.getLang() === 'en';
    document.getElementById('tsModalSymbol').textContent = sig.Symbol;
    document.getElementById('tsModalType').textContent = sig.Type === 'BUY' 
      ? (isEn ? '🟢 BUY Call Alert' : '🟢 BUY (कॉल) अलर्ट') 
      : (isEn ? '🔴 SELL Put Alert' : '🔴 SELL (पुट) अलर्ट');
    document.getElementById('tsModalATM').textContent = sig.ATM;
    document.getElementById('tsModalEntry').textContent = `₹${sig.Entry}`;
    document.getElementById('tsModalSL').textContent = `₹${sig.StopLoss}`;
    document.getElementById('tsModalTgt').textContent = `₹${sig.Target2}`;
    modal.classList.add('active');
  }

  function closeSignalModal() {
    const modal = document.getElementById('tsAlertModal');
    if (modal) modal.classList.remove('active');
  }

  function viewChart(sym, sigId) {
    let sig = sigId ? state.signals.find(s => s.Id === sigId) : null;
    if (!sig) sig = state.signals.find(s => s.Symbol === sym);
    if (!sig && state.filteredSignals) {
      sig = state.filteredSignals.find(s => s.Symbol === sym);
    }
    if (!sig) return;

    const showModal = () => {
      state.chartData = sig;
      const modal = document.getElementById('tsChartModal');
      if (!modal) return;
      const rsiInfo = sig.RSILabel || (sig.RSI != null ? sig.RSI : (sig.Type === 'BUY' ? '< 20' : '> 80'));
      document.getElementById('tsChartTitle').textContent = `${sig.Symbol} - 5M Heikin Ashi + RSI(7) Setup (${sig.StatusText || 'Active'})`;
      document.getElementById('tsChartSubtitle').textContent = `${sig.Type} | Time: ${sig.Time} | RSI(7): ${rsiInfo} | Entry (HA Close): ₹${sig.Entry} | SL (${sig.Type === 'BUY' ? 'HA Low' : 'HA High'}): ₹${sig.StopLoss} | Live LTP: ₹${sig.LTP || sig.Entry}`;
      modal.classList.add('active');
      setTimeout(() => drawHeikinAshiChart(sig), 80);
    };

    if (!sig.Candles || sig.Candles.length === 0) {
      fetch(`./api/tradejini/candles?symbol=${encodeURIComponent(sym)}&resolution=5`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.s === 'ok' && Array.isArray(data.candles) && data.candles.length > 0) {
            sig.Candles = convertToHeikinAshi(data.candles).slice(-24);
          }
          showModal();
        })
        .catch(() => showModal());
    } else {
      showModal();
    }
  }

  function closeChartModal() {
    const modal = document.getElementById('tsChartModal');
    if (modal) modal.classList.remove('active');
  }

  function drawHeikinAshiChart(sig) {
    const canvas = document.getElementById('tsHaCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const parent = canvas.parentElement;
    const width = Math.max(parent ? parent.clientWidth : 750, 400);
    const height = 380;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.clearRect(0, 0, width, height);

    const candles = sig.Candles || [];
    if (candles.length === 0) return;

    const margin = { top: 28, right: 80, bottom: 30, left: 20 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    let minP = Infinity, maxP = -Infinity;
    candles.forEach(c => {
      minP = Math.min(minP, c.HA_Low);
      maxP = Math.max(maxP, c.HA_High);
    });
    if (sig.Entry) { minP = Math.min(minP, sig.Entry); maxP = Math.max(maxP, sig.Entry); }
    if (sig.StopLoss) { minP = Math.min(minP, sig.StopLoss); maxP = Math.max(maxP, sig.StopLoss); }
    if (sig.Target1) { minP = Math.min(minP, sig.Target1); maxP = Math.max(maxP, sig.Target1); }
    if (sig.Target2) { minP = Math.min(minP, sig.Target2); maxP = Math.max(maxP, sig.Target2); }

    const pad = (maxP - minP) * 0.10 || 1;
    minP -= pad;
    maxP += pad;

    const getY = p => margin.top + plotH - ((p - minP) / (maxP - minP)) * plotH;

    // Gridlines
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    for (let s = 0; s <= 5; s++) {
      const p = minP + (maxP - minP) * (s / 5);
      const y = getY(p);
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(margin.left + plotW, y);
      ctx.stroke();
      ctx.fillText(p.toFixed(1), margin.left + plotW + 6, y + 4);
    }

    // Draw Candles
    const step = plotW / candles.length;
    const barW = Math.max(step * 0.65, 4);
    const sigIdx = typeof sig.SignalIndex === 'number' ? sig.SignalIndex : candles.length - 1;

    candles.forEach((c, i) => {
      const x = margin.left + i * step + step / 2;
      const isGreen = c.IsGreen;
      const col = isGreen ? '#089981' : '#f23645';

      // Highlight the Signal Confirmation Candle (CC)
      if (i === sigIdx) {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.14)';
        ctx.fillRect(margin.left + i * step, margin.top, step, plotH);
        ctx.fillStyle = '#b45309';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('★ CC', x, margin.top - 8);
      }

      const yO = getY(c.HA_Open);
      const yC = getY(c.HA_Close);
      const yH = getY(c.HA_High);
      const yL = getY(c.HA_Low);

      // Wicks
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, yH);
      ctx.lineTo(x, Math.min(yO, yC));
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x, Math.max(yO, yC));
      ctx.lineTo(x, yL);
      ctx.stroke();

      // Body
      ctx.fillStyle = col;
      const top = Math.min(yO, yC);
      const h = Math.max(Math.abs(yC - yO), 2);
      ctx.fillRect(x - barW / 2, top, barW, h);

      // Time axis
      if (i === sigIdx || i % 3 === 0 || i === candles.length - 1) {
        ctx.fillStyle = i === sigIdx ? '#b45309' : '#94a3b8';
        ctx.font = i === sigIdx ? 'bold 10px sans-serif' : '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(c.Time, x, height - margin.bottom + 16);
      }
    });

    // Draw Entry, SL, Target 1 & Target 2 lines
    ctx.textAlign = 'right';
    const isEn = window.I18N && window.I18N.getLang() === 'en';
    if (sig.Entry) {
      const yEnt = getY(sig.Entry);
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(margin.left, yEnt);
      ctx.lineTo(margin.left + plotW, yEnt);
      ctx.stroke();
      ctx.fillStyle = '#2563eb';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`${isEn ? 'Entry (HA Close)' : 'एन्ट्री (HA Close)'}: ₹${sig.Entry}`, margin.left + plotW - 8, yEnt - 6);
    }
    if (sig.StopLoss) {
      const ySl = getY(sig.StopLoss);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(margin.left, ySl);
      ctx.lineTo(margin.left + plotW, ySl);
      ctx.stroke();
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`${isEn ? 'Stop Loss' : 'स्टॉप लॉस'}: ₹${sig.StopLoss}`, margin.left + plotW - 8, ySl + 14);
    }
    if (sig.Target1) {
      const yT1 = getY(sig.Target1);
      ctx.strokeStyle = '#059669';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(margin.left, yT1);
      ctx.lineTo(margin.left + plotW, yT1);
      ctx.stroke();
      ctx.fillStyle = '#059669';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText(`T1: ₹${sig.Target1}`, margin.left + 90, yT1 - 4);
    }
    if (sig.Target2) {
      const yTgt = getY(sig.Target2);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(margin.left, yTgt);
      ctx.lineTo(margin.left + plotW, yTgt);
      ctx.stroke();
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`${isEn ? 'Target 2' : 'टार्गेट २'}: ₹${sig.Target2}`, margin.left + plotW - 8, yTgt - 6);
    }
    ctx.setLineDash([]);
  }

  function openInMainChart(symbol) {
    closeChartModal();
    if (window.switchView) {
      window.switchView('chart');
    }
    if (window.AppState) {
      window.AppState.chartType = 'heikinashi';
      window.AppState.currentTimeframe = '5';
      const btns = document.querySelectorAll('.chart-type-btn');
      btns.forEach(b => {
        if (b.getAttribute('data-type') === 'heikinashi') b.classList.add('active');
        else b.classList.remove('active');
      });
      const tfBtns = document.querySelectorAll('.tf-btn');
      tfBtns.forEach(b => {
        if (b.getAttribute('data-tf') === '5') b.classList.add('active');
        else b.classList.remove('active');
      });
    }
    if (window.selectStock) {
      window.selectStock(symbol);
    }

    // Scroll window and views-wrapper to top inside iframe
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    const vw = document.querySelector('.views-wrapper');
    if (vw) vw.scrollTo({ top: 0, left: 0, behavior: 'instant' });

    // Safe layout recalculation inside iframe
    if (window.AppState && window.AppState.chart) {
      window.AppState.chart.resize();
      setTimeout(() => {
        if (window.AppState && window.AppState.chart) window.AppState.chart.resize();
      }, 150);
    }
  }

  function init() {
    scanStrategy();

    // Event listeners
    const btnScan = document.getElementById('tsBtnScanNow');
    if (btnScan) {
      btnScan.addEventListener('click', () => {
        const isEn = window.I18N && window.I18N.getLang() === 'en';
        btnScan.innerHTML = `<span>⏳</span><span>${isEn ? 'Scanning...' : 'स्कॅनिंग चालू आहे...'}</span>`;
        btnScan.disabled = true;
        setTimeout(() => {
          scanStrategy();
          btnScan.innerHTML = `<span>⚡</span><span>${isEn ? 'Scan Now' : 'आत्ता स्कॅन करा'}</span>`;
          btnScan.disabled = false;
        }, 600);
      });
    }

    const btnDemo = document.getElementById('tsBtnTestAlert');
    if (btnDemo) {
      btnDemo.addEventListener('click', () => {
        if (state.signals && state.signals.length > 0) {
          const liveSig = state.signals[0];
          playAlertSound(liveSig.Type);
          triggerBrowserNotification(liveSig);
          showSignalModal(liveSig);
        } else {
          const niftyIdx = (state.indices && state.indices[0]) || { Name: 'NIFTY 50', LTP: 22703.30, ATM: '22700 CE' };
          const ltp = Number(niftyIdx.LTP || 22703.30);
          const isEn = window.I18N && window.I18N.getLang() === 'en';
          const demo = {
            Id: `LIVE_TEST_${Date.now()}`,
            Symbol: niftyIdx.Name || 'NIFTY 50',
            Type: 'BUY',
            Category: 'INDEX',
            Time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
            LTP: ltp,
            ATM: niftyIdx.ATM || `${Math.round(ltp / 50) * 50} CE`,
            Entry: ltp,
            StopLoss: Number((ltp - 30).toFixed(2)),
            Target1: Number((ltp + 45).toFixed(2)),
            Target2: Number((ltp + 75).toFixed(2)),
            RiskPoints: 30,
            CCPosition: isEn ? '1st Green HA Candle (Flat Bottom CC)' : '१ ली हिरवी HA कॅन्डल (Flat Bottom CC)'
          };
          playAlertSound('BUY');
          triggerBrowserNotification(demo);
          showSignalModal(demo);
        }
      });
    }

    const btnAudio = document.getElementById('tsBtnAudioToggle');
    if (btnAudio) {
      btnAudio.addEventListener('click', () => {
        state.audioEnabled = !state.audioEnabled;
        btnAudio.classList.toggle('active', state.audioEnabled);
        const isEn = window.I18N && window.I18N.getLang() === 'en';
        btnAudio.querySelector('.ts-audio-text').textContent = state.audioEnabled 
          ? (isEn ? 'Audio ON' : 'ध्वनी चालू') 
          : (isEn ? 'Audio OFF' : 'ध्वनी बंद');
        if (state.audioEnabled) playAlertSound('BUY');
      });
    }

    const btnNotif = document.getElementById('tsBtnNotifToggle');
    if (btnNotif) {
      btnNotif.addEventListener('click', async () => {
        const isEn = window.I18N && window.I18N.getLang() === 'en';
        if (!('Notification' in window)) {
          showToastNotification(isEn ? 'Your browser does not support desktop notifications.' : 'तुमचा ब्राऊझर डेस्कटॉप नोटिफिकेशन्स सपोर्ट करत नाही.', 'info');
          return;
        }
        if (Notification.permission !== 'granted') {
          const perm = await Notification.requestPermission();
          state.notificationsEnabled = (perm === 'granted');
        } else {
          state.notificationsEnabled = !state.notificationsEnabled;
        }
        btnNotif.classList.toggle('active', state.notificationsEnabled);
        btnNotif.querySelector('.ts-notif-text').textContent = state.notificationsEnabled 
          ? (isEn ? 'Alerts ON' : 'नोटिफिकेशन चालू') 
          : (isEn ? 'Alerts OFF' : 'नोटिफिकेशन बंद');
      });
    }

    const search = document.getElementById('tsInputSearch');
    if (search) {
      search.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.toLowerCase().trim();
        filterAndRenderSignals();
      });
    }

    // Filter tabs
    const tabs = document.querySelectorAll('.ts-tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.activeFilter = tab.getAttribute('data-filter');
        filterAndRenderSignals();
      });
    });

    // Auto-refresh timer
    setInterval(() => {
      scanStrategy();
    }, 60000);
  }

  function openModalSignalInMainChart() {
    if (state.chartData && state.chartData.Symbol) {
      openInMainChart(state.chartData.Symbol);
    }
  }

  function onLanguageChange() {
    filterAndRenderSignals();
    const isEn = window.I18N && window.I18N.getLang() === 'en';
    const btnScan = document.getElementById('tsBtnScanNow');
    if (btnScan) {
      btnScan.innerHTML = `<span>⚡</span><span>${isEn ? 'Scan Now' : 'आत्ता स्कॅन करा'}</span>`;
    }
    const btnAudio = document.getElementById('tsBtnAudioToggle');
    if (btnAudio) {
      const txt = btnAudio.querySelector('.ts-audio-text');
      if (txt) {
        txt.textContent = state.audioEnabled 
          ? (isEn ? 'Audio ON' : 'ध्वनी चालू') 
          : (isEn ? 'Audio OFF' : 'ध्वनी बंद');
      }
    }
    const btnNotif = document.getElementById('tsBtnNotifToggle');
    if (btnNotif) {
      const txt = btnNotif.querySelector('.ts-notif-text');
      if (txt) {
        txt.textContent = state.notificationsEnabled 
          ? (isEn ? 'Alerts ON' : 'नोटिफिकेशन चालू') 
          : (isEn ? 'Alerts OFF' : 'नोटिफिकेशन बंद');
      }
    }
  }

  return {
    init,
    scanStrategy,
    viewChart,
    closeChartModal,
    closeSignalModal,
    openInMainChart,
    openModalSignalInMainChart,
    onLanguageChange
  };
})();

if (typeof window !== "undefined") {
  window.TradeSetupModule = TradeSetupModule;
}
