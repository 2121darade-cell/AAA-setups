// ============================================================================
// AAA (DAILY 1D CANDLESTICK TREND & REVERSAL SCREENER)
// Daily (1D) Reversal Strategies Calculated Each Morning:
// Consecutive Red/Green Daily Trend -> Bearish Harami, Bullish Harami,
// Bearish Engulfing, Bullish Engulfing, Piercing Line, Dark Cloud Cover, Morning/Evening Star
// ============================================================================

const AAAScreenerModule = (function () {
  let allSignals = [];
  let availableDates = [];
  let selectedDate = '';
  let currentFilter = {
    type: 'ALL',
    pattern: '',
    lookback: '1',
    trendLength: '3',
    search: ''
  };
  let currentChartData = null;

  function isRed(c) { return c && c.close < c.open; }
  function isGreen(c) { return c && c.close > c.open; }
  function body(c) { return Math.abs(c.close - c.open); }

  function countConsecutiveRed(candles, fromIdx) {
    let count = 0;
    for (let k = fromIdx; k >= 0; k--) {
      if (isRed(candles[k])) count++;
      else break;
    }
    return count;
  }

  function countConsecutiveGreen(candles, fromIdx) {
    let count = 0;
    for (let k = fromIdx; k >= 0; k--) {
      if (isGreen(candles[k])) count++;
      else break;
    }
    return count;
  }

  function detectPatternsForSymbol(symbol, stockInfo, dailyCandles, minTrendLength = 3, lookbackDays = 10) {
    const signals = [];
    if (!dailyCandles || dailyCandles.length < minTrendLength + 2) return signals;

    const startIdx = Math.max(minTrendLength, dailyCandles.length - lookbackDays);

    for (let i = startIdx; i < dailyCandles.length; i++) {
      const cCurr = dailyCandles[i];
      const cPrev = dailyCandles[i - 1];
      const prevBody = body(cPrev);
      const currBody = body(cCurr);
      const prevRange = Math.max((cPrev.high || cPrev.open) - (cPrev.low || cPrev.close), 0.01);
      const currRange = Math.max((cCurr.high || cCurr.close) - (cCurr.low || cCurr.open), 0.01);
      if (prevBody <= 0 || currBody <= 0) continue;

      const isStrongMother = (prevBody / prevRange) >= 0.45;
      const isMeaningfulPrev = (prevBody / prevRange) >= 0.30;
      const isStrongCurr = (currBody / currRange) >= 0.50;

      // 1. BUY SIDE (Daily 1D): Downtrend -> Green Reversal
      if (isGreen(cCurr) && isRed(cPrev)) {
        const redTrend = countConsecutiveRed(dailyCandles, i - 1);
        if (redTrend >= minTrendLength && cPrev.close < dailyCandles[i - redTrend].close) {
          // Strict Bullish Harami (Standard Strategy Rule)
          if (
            isStrongMother &&
            cCurr.open >= cPrev.close &&
            cCurr.close <= cPrev.open &&
            cCurr.high <= cPrev.high &&
            cCurr.low >= cPrev.low &&
            currBody <= prevBody * 0.65 &&
            currBody >= prevBody * 0.10 &&
            (currBody / currRange) >= 0.12
          ) {
            signals.push(createSignal('BUY', 'Bullish Harami', symbol, stockInfo, dailyCandles, i, redTrend));
            continue;
          }
          // Strict Bullish Engulfing (Standard Strategy Rule)
          if (
            isMeaningfulPrev &&
            isStrongCurr &&
            cCurr.open <= cPrev.close &&
            cCurr.close >= cPrev.open &&
            cCurr.high >= cPrev.high &&
            cCurr.low <= cPrev.low &&
            currBody >= prevBody * 1.15
          ) {
            signals.push(createSignal('BUY', 'Bullish Engulfing', symbol, stockInfo, dailyCandles, i, redTrend));
            continue;
          }
          // Strict Bullish Piercing (Standard Strategy Rule)
          if (
            isStrongMother &&
            isStrongCurr &&
            cCurr.open < cPrev.close &&
            cCurr.close > ((cPrev.open + cPrev.close) / 2) &&
            cCurr.close < cPrev.open
          ) {
            signals.push(createSignal('BUY', 'Bullish Piercing', symbol, stockInfo, dailyCandles, i, redTrend));
            continue;
          }
        }
      }

      // 2. SELL SIDE (Daily 1D): Uptrend -> Red Reversal
      if (isRed(cCurr) && isGreen(cPrev)) {
        const greenTrend = countConsecutiveGreen(dailyCandles, i - 1);
        if (greenTrend >= minTrendLength && cPrev.close > dailyCandles[i - greenTrend].close) {
          // Strict Bearish Harami (Standard Strategy Rule)
          if (
            isStrongMother &&
            cCurr.open <= cPrev.close &&
            cCurr.close >= cPrev.open &&
            cCurr.high <= cPrev.high &&
            cCurr.low >= cPrev.low &&
            currBody <= prevBody * 0.65 &&
            currBody >= prevBody * 0.10 &&
            (currBody / currRange) >= 0.12
          ) {
            signals.push(createSignal('SELL', 'Bearish Harami', symbol, stockInfo, dailyCandles, i, greenTrend));
            continue;
          }
          // Strict Bearish Engulfing (Standard Strategy Rule)
          if (
            isMeaningfulPrev &&
            isStrongCurr &&
            cCurr.open >= cPrev.close &&
            cCurr.close <= cPrev.open &&
            cCurr.high >= cPrev.high &&
            cCurr.low <= cPrev.low &&
            currBody >= prevBody * 1.15
          ) {
            signals.push(createSignal('SELL', 'Bearish Engulfing', symbol, stockInfo, dailyCandles, i, greenTrend));
            continue;
          }
          // Strict Bearish Piercing (Standard Strategy Rule)
          if (
            isStrongMother &&
            isStrongCurr &&
            cCurr.open > cPrev.close &&
            cCurr.close < ((cPrev.open + cPrev.close) / 2) &&
            cCurr.close > cPrev.open
          ) {
            signals.push(createSignal('SELL', 'Bearish Piercing', symbol, stockInfo, dailyCandles, i, greenTrend));
            continue;
          }
        }
      }

      // 3. 3-CANDLE MORNING STAR & EVENING STAR (Standard Strategy Rule)
      if (i >= minTrendLength + 1) {
        const cFirst = dailyCandles[i - 2];
        const firstBody = body(cFirst);
        const firstRange = Math.max((cFirst.high || cFirst.open) - (cFirst.low || cFirst.close), 0.01);
        const starTop = Math.max(cPrev.open, cPrev.close);
        const starBottom = Math.min(cPrev.open, cPrev.close);
        const firstMid = (cFirst.open + cFirst.close) / 2;

        // Morning Star: Downtrend -> Strong Red 1st candle -> 2nd candle open & close below 1st close -> 3rd Green candle closes > 50% of 1st body
        if (isRed(cFirst) && (firstBody / firstRange) >= 0.45 && isGreen(cCurr) && (currBody / currRange) >= 0.45) {
          const redTrendStar = countConsecutiveRed(dailyCandles, i - 2);
          if (
            redTrendStar >= minTrendLength &&
            prevBody <= firstBody * 0.35 &&
            starTop <= cFirst.close &&
            starBottom < cFirst.close &&
            cPrev.low <= cFirst.low &&
            cPrev.low <= cCurr.low &&
            cCurr.close > firstMid
          ) {
            signals.push(createSignal('BUY', 'Morning Star', symbol, stockInfo, dailyCandles, i, redTrendStar));
            continue;
          }
        }

        // Evening Star: Uptrend -> Strong Green 1st candle -> 2nd candle open & close above 1st close -> 3rd Red candle closes < 50% of 1st body
        if (isGreen(cFirst) && (firstBody / firstRange) >= 0.45 && isRed(cCurr) && (currBody / currRange) >= 0.45) {
          const greenTrendStar = countConsecutiveGreen(dailyCandles, i - 2);
          if (
            greenTrendStar >= minTrendLength &&
            prevBody <= firstBody * 0.35 &&
            starBottom >= cFirst.close &&
            starTop > cFirst.close &&
            cPrev.high >= cFirst.high &&
            cPrev.high >= cCurr.high &&
            cCurr.close < firstMid
          ) {
            signals.push(createSignal('SELL', 'Evening Star', symbol, stockInfo, dailyCandles, i, greenTrendStar));
            continue;
          }
        }
      }
    }

    return signals;
  }

  function createSignal(type, pattern, symbol, stockInfo, candles, idx, trendCount) {
    const cCurr = candles[idx];
    const cPrev = candles[idx - 1];

    const entry = Number(cCurr.close.toFixed(2));
    const stopLoss = type === 'BUY'
      ? Number(Math.min(cPrev.low, cCurr.low).toFixed(2))
      : Number(Math.max(cPrev.high, cCurr.high).toFixed(2));

    const risk = Number(Math.max(Math.abs(entry - stopLoss), 0.05).toFixed(2));
    const target1 = type === 'BUY' ? Number((entry + risk * 1.5).toFixed(2)) : Number((entry - risk * 1.5).toFixed(2));
    const target2 = type === 'BUY' ? Number((entry + risk * 2.5).toFixed(2)) : Number((entry - risk * 2.5).toFixed(2));

    return {
      id: `${symbol}_${type}_${cCurr.date || idx}`,
      symbol: symbol,
      name: stockInfo.name || `${symbol} (Daily 1D)`,
      industry: stockInfo.industry || 'NSE Daily (1D)',
      type: type,
      pattern: pattern,
      trendLength: trendCount,
      date: cCurr.fullDate || cCurr.date || new Date().toLocaleDateString('en-IN'),
      entry: entry,
      stopLoss: stopLoss,
      target1: target1,
      target2: target2,
      risk: risk,
      ltp: candles[candles.length - 1].close,
      candles: candles.slice(Math.max(0, idx - 14), idx + 1)
    };
  }

  function loadAvailableDates() {
    const sel = document.getElementById('aaaDateSelect');
    if (!sel) return;

    fetch('./api/tradejini/screener/dates')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data || data.s !== 'ok' || !Array.isArray(data.dates)) return;
        availableDates = data.dates;
        const isEn = window.I18N && window.I18N.getLang() === 'en';

        let html = `<option value="" ${selectedDate === '' ? 'selected' : ''}>📅 ${isEn ? "Latest Closed Session" : "शेवटचा क्लोज"} (${data.today || 'Latest'})</option>`;

        data.dates.forEach(d => {
          if (d.isToday) return;
          const isSel = selectedDate === d.fileKey || selectedDate === d.date;
          const statText = isEn
            ? `${d.stats ? d.stats.total : 0} setups`
            : `${d.stats ? d.stats.total : 0} सेटअप्स`;
          html += `<option value="${d.fileKey}" ${isSel ? 'selected' : ''}>📅 ${d.date} (${statText})</option>`;
        });

        sel.innerHTML = html;
      })
      .catch(err => console.warn('[AAA Screener] Failed to load session dates:', err));
  }

  function updateDateLabel() {
    const lbl = document.getElementById('aaaSelectedDateLabel');
    if (!lbl) return;
    const isEn = window.I18N && window.I18N.getLang() === 'en';
    if (!selectedDate) {
      lbl.textContent = isEn ? 'Latest Close' : 'शेवटचा क्लोज';
    } else {
      lbl.textContent = selectedDate.replace(/_/g, ' ');
    }
  }

  function runScreener() {
    const tbody = document.getElementById('aaaSignalsTableBody');
    const emptyState = document.getElementById('aaaEmptyState');
    if (tbody && (!allSignals || allSignals.length === 0)) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 35px; color: var(--accent); font-weight: 600;">
        <i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i> Scanning Daily (1D) Timeframe Datafeed for AAA Setups (Bearish Harami, Bullish Harami, Engulfing)...
      </td></tr>`;
      if (emptyState) emptyState.style.display = 'none';
    }

    const daysParam = encodeURIComponent(currentFilter.lookback || 1);
    const minTrendParam = encodeURIComponent(currentFilter.trendLength || 3);
    const dateParam = selectedDate ? `&date=${encodeURIComponent(selectedDate)}` : '';

    // Direct Dynamic Fetch from Live/Historical Daily (1D) Screener API
    fetch(`./api/tradejini/screener?days=${daysParam}&minTrend=${minTrendParam}${dateParam}`)
      .then(res => res.ok ? res.json() : null)
      .then(tjData => {
        if (tjData && tjData.s === 'ok' && Array.isArray(tjData.rows)) {
          allSignals = tjData.rows;
          renderTable();
          subscribeSignals(allSignals);

          const elTot = document.getElementById('aaaStatTotalStocks');
          const elBuy = document.getElementById('aaaStatBuySignals');
          const elSell = document.getElementById('aaaStatSellSignals');
          const elTime = document.getElementById('aaaStatLastScan');

          if (elTot) elTot.textContent = tjData.totalScanned || tjData.rows.length;
          if (elBuy) elBuy.textContent = tjData.rows.filter(s => s.type === 'BUY').length;
          if (elSell) elSell.textContent = tjData.rows.filter(s => s.type === 'SELL').length;
          if (elTime) elTime.textContent = tjData.updatedAt || new Date().toLocaleTimeString('en-IN');

          if (tjData.sessionDate) {
            const dtEl = document.getElementById('aaaSessionDateText');
            if (dtEl) {
              const isEn = window.I18N && window.I18N.getLang() === 'en';
              if (tjData.isHistorical) {
                dtEl.innerHTML = isEn
                  ? `Historical Session: ${tjData.sessionDate} (Completed)`
                  : `ऐतिहासिक सत्र: ${tjData.sessionDate} (पूर्ण झाले)`;
              } else {
                dtEl.innerHTML = isEn
                  ? `Latest Completed Session (${tjData.sessionDate || 'Today'})`
                  : `शेवटचा पूर्ण क्लोज (${tjData.sessionDate || 'आज'})`;
              }
            }
          }
        } else {
          renderTable();
        }
      })
      .catch(err => {
        console.warn('[AAA Screener] Live feed fetch notice:', err);
        renderTable();
      });
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

  function subscribeSignals(signals) {
    if (!Array.isArray(signals) || signals.length === 0) return;
    const syms = Array.from(new Set(signals.map(s => (s.symbol || '').toUpperCase().trim()).filter(Boolean)));
    if (syms.length === 0) return;

    if (window.AppState && window.AppState.wsClient && window.AppState.wsClient.readyState === WebSocket.OPEN) {
      try {
        window.AppState.wsClient.send(JSON.stringify({ type: 'subscribe', symbols: syms }));
      } catch (e) {}
    }
    syms.forEach(sym => {
      fetch(`./api/tradejini/subscribe?symbol=${encodeURIComponent(sym)}`).catch(() => {});
    });
  }

  function getActiveSymbols() {
    return Array.from(new Set((allSignals || []).map(s => (s.symbol || '').toUpperCase().trim()).filter(Boolean)));
  }

  function renderTable() {
    let filtered = allSignals.slice();

    if (currentFilter.type === 'BUY') filtered = filtered.filter(s => s.type === 'BUY');
    else if (currentFilter.type === 'SELL') filtered = filtered.filter(s => s.type === 'SELL');

    if (currentFilter.pattern) {
      filtered = filtered.filter(s => s.pattern === currentFilter.pattern);
    }

    if (currentFilter.trendLength) {
      const minT = Number(currentFilter.trendLength) || 3;
      filtered = filtered.filter(s => Number(s.trendLength || 3) >= minT);
    }

    if (currentFilter.search) {
      filtered = filtered.filter(s =>
        s.symbol.toLowerCase().includes(currentFilter.search) ||
        s.name.toLowerCase().includes(currentFilter.search)
      );
    }

    const tbody = document.getElementById('aaaSignalsTableBody');
    const emptyState = document.getElementById('aaaEmptyState');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    // Deduplicate by symbol + pattern + type
    const seenMap = new Set();
    filtered = filtered.filter(s => {
      const k = `${s.symbol}_${s.type}_${s.pattern}`;
      if (seenMap.has(k)) return false;
      seenMap.add(k);
      return true;
    });

    tbody.innerHTML = filtered.map(s => {
      const isBuy = s.type === 'BUY';
      const isEn = window.I18N && window.I18N.getLang() === 'en';
      const typeBadge = isBuy ? '<span class="aaa-pill aaa-pill-buy">🟢 BUY (1D)</span>' : '<span class="aaa-pill aaa-pill-sell">🔴 SELL (1D)</span>';
      const trendBadge = isBuy
        ? `<span class="aaa-trend-badge down">📉 ${s.trendLength} Red Days</span>`
        : `<span class="aaa-trend-badge up">📈 ${s.trendLength} Green Days</span>`;

      const btnChartText = window.I18N ? I18N.t('aaa_btn_chart') : '🔍 1D चार्ट';
      const btnLoadText = window.I18N ? I18N.t('aaa_btn_load') : '📊 लोड (1D)';

      return `
        <tr>
          <td>
            <div class="aaa-sym-title">${s.symbol} <span class="aaa-ltp-badge aaa-ltp-${s.symbol}" id="aaa-ltp-${s.id}" style="font-size:11px; color:${isBuy ? '#059669' : '#dc2626'}; font-weight:700;">(LTP: ₹${s.ltp != null ? Number(s.ltp).toFixed(2) : s.entry})</span></div>
            <div class="aaa-sym-sub">${s.name} ${s.date ? '&bull; 📅 संदर्भ: <strong>' + s.date + '</strong>' : ''}</div>
          </td>
          <td>
            <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-start;">
              ${typeBadge}
              <span class="aaa-status-badge aaa-status-${s.symbol}" id="aaa-status-${s.id}" style="font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px; ${getStatusBadgeStyle(s.status)}">${s.statusText || s.status || 'ACTIVE'}</span>
            </div>
          </td>
          <td>
            <span class="aaa-pattern-tag">${s.pattern}</span>
          </td>
          <td>${trendBadge}</td>
          <td class="aaa-price">₹${s.entry}</td>
          <td class="aaa-price text-danger">₹${s.stopLoss}</td>
          <td class="aaa-price text-success">₹${s.target1}</td>
          <td class="aaa-price text-success">₹${s.target2}</td>
          <td class="aaa-price">₹${s.risk}</td>
          <td>
            <button class="aaa-action-btn" onclick="AAAScreenerModule.openChartModal('${s.id}')">
              ${btnChartText}
            </button>
            <button class="aaa-action-btn-primary" onclick="AAAScreenerModule.openInMainPortal('${s.symbol}')">
              ${btnLoadText}
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function updateModalSubtitle(s) {
    const isEn = window.I18N && window.I18N.getLang() === 'en';
    const entryLbl = isEn ? 'Entry' : 'एन्ट्री';
    const ltpLbl = isEn ? 'Live LTP' : 'चालू भाव (LTP)';
    const curLtp = s.ltp != null ? Number(s.ltp).toFixed(2) : s.entry;
    const isUp = (s.type === 'BUY' && Number(curLtp) >= s.entry) || (s.type === 'SELL' && Number(curLtp) <= s.entry);
    const ltpCol = isUp ? '#059669' : '#dc2626';

    const titleEl = document.getElementById('aaaModalSymbol');
    if (titleEl) {
      titleEl.innerHTML = `${s.symbol} - ${s.pattern} (${s.type}) <span style="font-size:12px; margin-left:8px; padding:2px 8px; border-radius:4px; ${getStatusBadgeStyle(s.status)}">${s.statusText || s.status || 'ACTIVE'}</span>`;
    }

    const subEl = document.getElementById('aaaModalSubtitle');
    if (subEl) {
      subEl.innerHTML = `${entryLbl}: ₹${s.entry} | SL: ₹${s.stopLoss} | Tgt 1: ₹${s.target1} | Tgt 2: ₹${s.target2} | <strong style="color:${ltpCol}; font-size:12px;">${ltpLbl}: ₹${curLtp}</strong>`;
    }
  }

  function openChartModal(sigId) {
    const s = allSignals.find(x => x.id === sigId);
    if (!s) return;
    currentChartData = s;
    const modal = document.getElementById('aaaChartModal');
    if (!modal) return;
    updateModalSubtitle(s);
    modal.classList.add('active');
    setTimeout(() => drawCandlestickModal(s), 50);
  }

  function closeChartModal() {
    const modal = document.getElementById('aaaChartModal');
    if (modal) modal.classList.remove('active');
  }

  function drawCandlestickModal(s) {
    const canvas = document.getElementById('aaaCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.parentElement.clientWidth || 750;
    const height = 380;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.clearRect(0, 0, width, height);

    const candles = s.candles || [];
    if (candles.length === 0) return;

    const margin = { top: 26, right: 80, bottom: 32, left: 15 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    let minP = Infinity, maxP = -Infinity;
    candles.forEach(c => {
      minP = Math.min(minP, c.low);
      maxP = Math.max(maxP, c.high);
    });
    if (s.entry) { minP = Math.min(minP, s.entry); maxP = Math.max(maxP, s.entry); }
    if (s.stopLoss) { minP = Math.min(minP, s.stopLoss); maxP = Math.max(maxP, s.stopLoss); }
    if (s.target1) { minP = Math.min(minP, s.target1); maxP = Math.max(maxP, s.target1); }
    if (s.target2) { minP = Math.min(minP, s.target2); maxP = Math.max(maxP, s.target2); }
    if (s.ltp && s.ltp > 0) { minP = Math.min(minP, s.ltp); maxP = Math.max(maxP, s.ltp); }

    const pad = (maxP - minP) * 0.10 || 1;
    minP -= pad;
    maxP += pad;

    const getY = p => margin.top + plotH - ((p - minP) / (maxP - minP)) * plotH;

    // Gridlines
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    for (let i = 0; i <= 5; i++) {
      const p = minP + (maxP - minP) * (i / 5);
      const y = getY(p);
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(margin.left + plotW, y);
      ctx.stroke();
      ctx.fillText(p.toFixed(1), margin.left + plotW + 6, y + 4);
    }

    const step = plotW / candles.length;
    const barW = Math.max(step * 0.62, 5);

    // Highlight Pattern Candles (2 or 3 candles ending at signalIdx)
    const patBars = Number(s.patternBars) || (String(s.pattern).includes('Star') ? 3 : 2);
    const sigOffset = Number(s.signalOffsetFromEnd) || 0;
    const sigIdx = Math.max(0, (candles.length - 1) - sigOffset);
    const patStartIdx = Math.max(0, sigIdx - patBars + 1);

    const boxX1 = margin.left + patStartIdx * step + 2;
    const boxX2 = margin.left + (sigIdx + 1) * step - 2;
    ctx.fillStyle = s.type === 'BUY' ? 'rgba(16, 185, 129, 0.09)' : 'rgba(239, 68, 68, 0.09)';
    ctx.strokeStyle = s.type === 'BUY' ? '#10b981' : '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.fillRect(boxX1, margin.top, boxX2 - boxX1, plotH);
    ctx.strokeRect(boxX1, margin.top, boxX2 - boxX1, plotH);
    ctx.setLineDash([]);

    ctx.fillStyle = s.type === 'BUY' ? '#047857' : '#b91c1c';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`★ ${s.pattern} (${candles[sigIdx] ? candles[sigIdx].date : '1D'})`, (boxX1 + boxX2) / 2, margin.top - 7);

    candles.forEach((c, i) => {
      const x = margin.left + i * step + step / 2;
      const green = c.close >= c.open;
      const col = green ? '#089981' : '#f23645';

      const yO = getY(c.open);
      const yC = getY(c.close);
      const yH = getY(c.high);
      const yL = getY(c.low);

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

      // Date Label
      if (i % 2 === 0 || i === candles.length - 1 || i === sigIdx) {
        ctx.fillStyle = i === sigIdx ? '#0f172a' : '#94a3b8';
        ctx.font = i === sigIdx ? 'bold 10px sans-serif' : '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(c.date || `C${i}`, x, height - margin.bottom + 16);
      }
    });

    // Entry, SL & Target Overlay lines
    ctx.textAlign = 'right';
    const isEn = window.I18N && window.I18N.getLang() === 'en';
    if (s.entry) {
      const yEnt = getY(s.entry);
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(margin.left, yEnt);
      ctx.lineTo(margin.left + plotW, yEnt);
      ctx.stroke();
      ctx.fillStyle = '#2563eb';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`${isEn ? 'Entry (Close)' : 'एन्ट्री (Close)'}: ₹${s.entry}`, margin.left + plotW - 8, yEnt - 6);
    }
    if (s.stopLoss) {
      const ySl = getY(s.stopLoss);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(margin.left, ySl);
      ctx.lineTo(margin.left + plotW, ySl);
      ctx.stroke();
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`SL: ₹${s.stopLoss}`, margin.left + plotW - 8, ySl + 14);
    }
    if (s.target1) {
      const yT1 = getY(s.target1);
      ctx.strokeStyle = '#059669';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(margin.left, yT1);
      ctx.lineTo(margin.left + plotW, yT1);
      ctx.stroke();
      ctx.fillStyle = '#059669';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`${isEn ? 'Target 1' : 'टार्गेट १'}: ₹${s.target1}`, margin.left + plotW - 8, yT1 - 5);
    }
    if (s.target2) {
      const yT2 = getY(s.target2);
      ctx.strokeStyle = '#047857';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(margin.left, yT2);
      ctx.lineTo(margin.left + plotW, yT2);
      ctx.stroke();
      ctx.fillStyle = '#047857';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`${isEn ? 'Target 2' : 'टार्गेट २'}: ₹${s.target2}`, margin.left + plotW - 8, yT2 - 5);
    }

    // Dynamic Live LTP Line & Pill
    if (s.ltp && s.ltp > 0) {
      const yLtp = getY(s.ltp);
      const isUp = (s.type === 'BUY' && s.ltp >= s.entry) || (s.type === 'SELL' && s.ltp <= s.entry);
      const ltpCol = isUp ? '#059669' : '#dc2626';

      ctx.save();
      ctx.strokeStyle = ltpCol;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(margin.left, yLtp);
      ctx.lineTo(margin.left + plotW, yLtp);
      ctx.stroke();

      const ltpText = `● LIVE LTP: ₹${Number(s.ltp).toFixed(2)}`;
      ctx.font = 'bold 11px sans-serif';
      const textWidth = ctx.measureText(ltpText).width;
      const bW = textWidth + 14;
      const bH = 18;
      const bX = margin.left + plotW - bW - 4;
      const bY = yLtp - bH / 2;

      ctx.fillStyle = ltpCol;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(bX, bY, bW, bH, 4);
      } else {
        ctx.rect(bX, bY, bW, bH);
      }
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ltpText, bX + bW / 2, yLtp);
      ctx.restore();
    }
    ctx.setLineDash([]);
  }

  function openInMainPortal(sym) {
    closeChartModal();
    if (window.switchView) {
      window.switchView('chart');
    }
    if (window.AppState) {
      window.AppState.chartType = 'candlestick';
      window.AppState.currentTimeframe = 'D';
      const typeBtns = document.querySelectorAll('.chart-type-btn');
      typeBtns.forEach(b => {
        if (b.getAttribute('data-type') === 'candlestick') b.classList.add('active');
        else b.classList.remove('active');
      });
      const tfBtns = document.querySelectorAll('.tf-btn');
      tfBtns.forEach(b => {
        if (b.getAttribute('data-tf') === 'D') b.classList.add('active');
        else b.classList.remove('active');
      });
    }
    if (window.selectStock) {
      window.selectStock(sym);
    }
  }

  function init() {
    loadAvailableDates();
    runScreener();

    const dateSelect = document.getElementById('aaaDateSelect');
    if (dateSelect) {
      dateSelect.addEventListener('change', (e) => {
        selectedDate = e.target.value;
        updateDateLabel();
        runScreener();
      });
    }

    const btnScan = document.getElementById('aaaBtnScanNow');
    if (btnScan) {
      btnScan.addEventListener('click', () => {
        const isEn = window.I18N && window.I18N.getLang() === 'en';
        btnScan.disabled = true;
        btnScan.innerHTML = `<span>⏳</span><span>${isEn ? 'Scanning...' : 'स्कॅन होत आहे...'}</span>`;
        setTimeout(() => {
          runScreener();
          btnScan.disabled = false;
          btnScan.innerHTML = `<span>⚡</span><span>${isEn ? 'Scan Now' : 'आता स्कॅन करा'}</span>`;
        }, 600);
      });
    }

    const typeBtns = document.querySelectorAll('.aaa-seg-btn');
    typeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        typeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter.type = btn.dataset.type;
        renderTable();
      });
    });

    const patFilter = document.getElementById('aaaPatternFilter');
    if (patFilter) {
      patFilter.addEventListener('change', (e) => {
        currentFilter.pattern = e.target.value;
        renderTable();
      });
    }

    const lookFilter = document.getElementById('aaaLookbackFilter');
    if (lookFilter) {
      lookFilter.addEventListener('change', (e) => {
        currentFilter.lookback = e.target.value;
        runScreener();
      });
    }

    const trendFilter = document.getElementById('aaaTrendFilter');
    if (trendFilter) {
      trendFilter.addEventListener('change', (e) => {
        currentFilter.trendLength = e.target.value;
        runScreener();
      });
    }

    const searchInput = document.getElementById('aaaSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        currentFilter.search = e.target.value.toLowerCase().trim();
        renderTable();
      });
    }
  }

  function onLanguageChange() {
    loadAvailableDates();
    updateDateLabel();
    renderTable();
    const isEn = window.I18N && window.I18N.getLang() === 'en';
    const btnScan = document.getElementById('aaaBtnScanNow');
    if (btnScan) {
      btnScan.innerHTML = `<span>⚡</span><span>${isEn ? 'Scan Now' : 'आता स्कॅन करा'}</span>`;
    }
  }

  function onTick(tick) {
    if (!tick || !tick.symbol || !tick.price) return;
    const sym = tick.symbol.toUpperCase().trim();
    const price = Number(tick.price);
    if (!price || isNaN(price)) return;

    let hasMatches = false;
    for (const s of allSignals) {
      if (s.symbol && s.symbol.toUpperCase().trim() === sym) {
        s.ltp = price;
        if (tick.changePercent != null) s.changePercent = tick.changePercent;

        // Dynamically re-evaluate target/SL status
        if (s.type === 'BUY') {
          if (s.stopLoss && price <= s.stopLoss) {
            s.status = 'SL_HIT';
            s.statusText = 'Stop Loss Hit';
          } else if (s.target2 && price >= s.target2) {
            s.status = 'TARGET_2_HIT';
            s.statusText = 'Target 2 Hit (1:2.5)';
          } else if (s.target1 && price >= s.target1) {
            s.status = 'TARGET_1_HIT';
            s.statusText = 'Target 1 Hit (1:1.5)';
          } else {
            s.status = 'ACTIVE';
            s.statusText = 'Active (Live)';
          }
        } else if (s.type === 'SELL') {
          if (s.stopLoss && price >= s.stopLoss) {
            s.status = 'SL_HIT';
            s.statusText = 'Stop Loss Hit';
          } else if (s.target2 && price <= s.target2) {
            s.status = 'TARGET_2_HIT';
            s.statusText = 'Target 2 Hit (1:2.5)';
          } else if (s.target1 && price <= s.target1) {
            s.status = 'TARGET_1_HIT';
            s.statusText = 'Target 1 Hit (1:1.5)';
          } else {
            s.status = 'ACTIVE';
            s.statusText = 'Active (Live)';
          }
        }
        hasMatches = true;

        // Update DOM elements for this symbol
        const ltpBadges = document.querySelectorAll(`.aaa-ltp-${sym}`);
        const isUp = (s.type === 'BUY' && price >= s.entry) || (s.type === 'SELL' && price <= s.entry);
        ltpBadges.forEach(el => {
          el.textContent = `(LTP: ₹${price.toFixed(2)})`;
          el.style.color = isUp ? '#059669' : '#dc2626';
          el.classList.remove('aaa-price-flash');
          void el.offsetWidth;
          el.classList.add('aaa-price-flash');
        });

        const statusBadges = document.querySelectorAll(`.aaa-status-${sym}`);
        statusBadges.forEach(el => {
          el.textContent = s.statusText || s.status;
          el.style.cssText = `font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px; ${getStatusBadgeStyle(s.status)}`;
        });
      }
    }

    // If modal is currently open and viewing this symbol, update modal subtitle and canvas
    if (currentChartData && currentChartData.symbol && currentChartData.symbol.toUpperCase().trim() === sym) {
      currentChartData.ltp = price;
      updateModalSubtitle(currentChartData);
      drawCandlestickModal(currentChartData);
    }
  }

  return {
    init,
    runScreener,
    openChartModal,
    closeChartModal,
    openInMainPortal,
    onLanguageChange,
    onTick,
    getActiveSymbols
  };
})();

if (typeof window !== "undefined") {
  window.AAAScreenerModule = AAAScreenerModule;
}
