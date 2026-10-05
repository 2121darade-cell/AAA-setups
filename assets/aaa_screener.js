// ============================================================================
// FINANTHROPIST EDUCARE - AAA (NIFTY 200 CANDLESTICK TREND & REVERSAL SCREENER)
// Reversal Strategies: 4+ Consecutive Red/Green Trend -> Harami, Engulfing, Piercing, Morning/Evening Star
// ============================================================================

const AAAScreenerModule = (function () {
  let allSignals = [];
  let currentFilter = {
    type: 'ALL',
    pattern: '',
    lookback: '5',
    trendLength: '4',
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

  function detectPatternsForSymbol(symbol, stockInfo, dailyCandles, minTrendLength = 4, lookbackDays = 5) {
    const signals = [];
    if (!dailyCandles || dailyCandles.length < minTrendLength + 2) return signals;

    const startIdx = Math.max(minTrendLength + 1, dailyCandles.length - lookbackDays);

    for (let i = startIdx; i < dailyCandles.length; i++) {
      const cCurr = dailyCandles[i];
      const cPrev = dailyCandles[i - 1];

      // 1. BUY SIDE: 4+ Red candles -> Green Reversal
      if (isGreen(cCurr) && isRed(cPrev)) {
        const redTrend = countConsecutiveRed(dailyCandles, i - 1);
        if (redTrend >= minTrendLength) {
          const prevBody = body(cPrev);
          const currBody = body(cCurr);

          // Bullish Harami
          if (cCurr.open >= cPrev.close * 0.999 && cCurr.close <= cPrev.open * 1.001 && currBody < prevBody) {
            signals.push(createSignal('BUY', 'Bullish Harami', symbol, stockInfo, dailyCandles, i, redTrend));
            continue;
          }
          // Bullish Engulfing
          if (cCurr.open <= cPrev.close * 1.002 && cCurr.close >= cPrev.open * 0.998 && currBody > prevBody) {
            signals.push(createSignal('BUY', 'Bullish Engulfing', symbol, stockInfo, dailyCandles, i, redTrend));
            continue;
          }
          // Bullish Piercing Line
          if (cCurr.open < cPrev.close && cCurr.close > ((cPrev.open + cPrev.close) / 2) && cCurr.close < cPrev.open) {
            signals.push(createSignal('BUY', 'Piercing Line', symbol, stockInfo, dailyCandles, i, redTrend));
            continue;
          }
          // Generic Bullish Reversal
          signals.push(createSignal('BUY', 'Bullish Reversal', symbol, stockInfo, dailyCandles, i, redTrend));
        }
      }

      // 2. SELL SIDE: 4+ Green candles -> Red Reversal
      if (isRed(cCurr) && isGreen(cPrev)) {
        const greenTrend = countConsecutiveGreen(dailyCandles, i - 1);
        if (greenTrend >= minTrendLength) {
          const prevBody = body(cPrev);
          const currBody = body(cCurr);

          // Bearish Harami
          if (cCurr.open <= cPrev.close * 1.001 && cCurr.close >= cPrev.open * 0.999 && currBody < prevBody) {
            signals.push(createSignal('SELL', 'Bearish Harami', symbol, stockInfo, dailyCandles, i, greenTrend));
            continue;
          }
          // Bearish Engulfing
          if (cCurr.open >= cPrev.close * 0.998 && cCurr.close <= cPrev.open * 1.002 && currBody > prevBody) {
            signals.push(createSignal('SELL', 'Bearish Engulfing', symbol, stockInfo, dailyCandles, i, greenTrend));
            continue;
          }
          // Dark Cloud Cover
          if (cCurr.open > cPrev.close && cCurr.close < ((cPrev.open + cPrev.close) / 2) && cCurr.close > cPrev.open) {
            signals.push(createSignal('SELL', 'Dark Cloud Cover', symbol, stockInfo, dailyCandles, i, greenTrend));
            continue;
          }
          // Generic Bearish Reversal
          signals.push(createSignal('SELL', 'Bearish Reversal', symbol, stockInfo, dailyCandles, i, greenTrend));
        }
      }
    }

    return signals;
  }

  function createSignal(type, pattern, symbol, stockInfo, candles, idx, trendCount) {
    const cCurr = candles[idx];
    const cPrev = candles[idx - 1];

    let entry, stopLoss;
    if (type === 'BUY') {
      entry = cCurr.open;
      stopLoss = cPrev.low;
    } else {
      entry = cCurr.close;
      stopLoss = cPrev.high;
    }

    const risk = Number(Math.max(Math.abs(entry - stopLoss), entry * 0.005).toFixed(2));
    const target1 = type === 'BUY' ? Number((entry + risk * 1.5).toFixed(2)) : Number((entry - risk * 1.5).toFixed(2));
    const target2 = type === 'BUY' ? Number((entry + risk * 2.5).toFixed(2)) : Number((entry - risk * 2.5).toFixed(2));

    return {
      id: `${symbol}_${type}_${cCurr.date || idx}`,
      symbol: symbol,
      name: stockInfo.name || symbol,
      industry: stockInfo.industry || 'NSE Stock',
      type: type,
      pattern: pattern,
      trendLength: trendCount,
      date: cCurr.date || new Date().toLocaleDateString('en-IN'),
      entry: Number(entry.toFixed(2)),
      stopLoss: Number(stopLoss.toFixed(2)),
      target1: target1,
      target2: target2,
      risk: risk,
      ltp: cCurr.close,
      candles: candles.slice(Math.max(0, idx - 14), idx + 1)
    };
  }

  function runScreener() {
    const tbody = document.getElementById('aaaSignalsTableBody');
    const emptyState = document.getElementById('aaaEmptyState');
    if (tbody && (!allSignals || allSignals.length === 0)) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 35px; color: var(--accent); font-weight: 600;">
        <i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i> Scanning Tradejini 5-Minute Live Market Datafeed for AAA Setups...
      </td></tr>`;
      if (emptyState) emptyState.style.display = 'none';
    }

    // Direct Dynamic Fetch from Tradejini CubePlus Live Screener API
    fetch('/api/tradejini/screener')
      .then(res => res.ok ? res.json() : null)
      .then(tjData => {
        if (tjData && tjData.s === 'ok' && Array.isArray(tjData.rows)) {
          allSignals = tjData.rows;
          renderTable();

          const elTot = document.getElementById('aaaStatTotalStocks');
          const elBuy = document.getElementById('aaaStatBuySignals');
          const elSell = document.getElementById('aaaStatSellSignals');
          const elTime = document.getElementById('aaaStatLastScan');

          if (elTot) elTot.textContent = tjData.totalScanned || tjData.rows.length;
          if (elBuy) elBuy.textContent = tjData.rows.filter(s => s.type === 'BUY').length;
          if (elSell) elSell.textContent = tjData.rows.filter(s => s.type === 'SELL').length;
          if (elTime) elTime.textContent = tjData.updatedAt || new Date().toLocaleTimeString('en-IN');
        } else {
          renderTable();
        }
      })
      .catch(err => {
        console.warn('[AAA Screener] Live feed fetch notice:', err);
        renderTable();
      });
  }

  function renderTable() {
    let filtered = allSignals.slice();

    if (currentFilter.type === 'BUY') filtered = filtered.filter(s => s.type === 'BUY');
    else if (currentFilter.type === 'SELL') filtered = filtered.filter(s => s.type === 'SELL');

    if (currentFilter.pattern) {
      filtered = filtered.filter(s => s.pattern === currentFilter.pattern);
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

    tbody.innerHTML = filtered.map(s => {
      const isBuy = s.type === 'BUY';
      const typeBadge = isBuy ? '<span class="aaa-pill aaa-pill-buy">🟢 BUY</span>' : '<span class="aaa-pill aaa-pill-sell">🔴 SELL</span>';
      const trendBadge = isBuy
        ? `<span class="aaa-trend-badge down">📉 ${s.trendLength} Red</span>`
        : `<span class="aaa-trend-badge up">📈 ${s.trendLength} Green</span>`;

      return `
        <tr>
          <td>
            <div class="aaa-sym-title">${s.symbol}</div>
            <div class="aaa-sym-sub">${s.name}</div>
          </td>
          <td>${typeBadge}</td>
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
              🔍 चार्ट
            </button>
            <button class="aaa-action-btn-primary" onclick="AAAScreenerModule.openInMainPortal('${s.symbol}')">
              📊 लोड
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function openChartModal(sigId) {
    const s = allSignals.find(x => x.id === sigId);
    if (!s) return;
    currentChartData = s;
    const modal = document.getElementById('aaaChartModal');
    if (!modal) return;
    document.getElementById('aaaModalSymbol').textContent = `${s.symbol} - ${s.pattern} (${s.type})`;
    document.getElementById('aaaModalSubtitle').textContent = `एन्ट्री: ₹${s.entry} | SL: ₹${s.stopLoss} | Tgt 1: ₹${s.target1} | Tgt 2: ₹${s.target2}`;
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
    const height = 360;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.clearRect(0, 0, width, height);

    const candles = s.candles || [];
    if (candles.length === 0) return;

    const margin = { top: 20, right: 65, bottom: 30, left: 15 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    let minP = Infinity, maxP = -Infinity;
    candles.forEach(c => {
      minP = Math.min(minP, c.low);
      maxP = Math.max(maxP, c.high);
    });
    const pad = (maxP - minP) * 0.08 || 1;
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
    const barW = Math.max(step * 0.65, 4);

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
      if (i % 3 === 0 || i === candles.length - 1) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(c.date || `C${i}`, x, height - margin.bottom + 16);
      }
    });

    // Entry & SL Overlay lines
    ctx.textAlign = 'right';
    if (s.entry) {
      const yEnt = getY(s.entry);
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(margin.left, yEnt);
      ctx.lineTo(margin.left + plotW, yEnt);
      ctx.stroke();
      ctx.fillStyle = '#2563eb';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`एन्ट्री: ₹${s.entry}`, margin.left + plotW - 8, yEnt - 6);
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
      ctx.fillText(`SL: ₹${s.stopLoss}`, margin.left + plotW - 8, ySl + 14);
    }
  }

  function openInMainPortal(sym) {
    if (window.switchView) {
      window.switchView('chart');
    }
    if (window.selectStock) {
      window.selectStock(sym);
    }
  }

  function init() {
    runScreener();

    const btnScan = document.getElementById('aaaBtnScanNow');
    if (btnScan) {
      btnScan.addEventListener('click', () => {
        btnScan.disabled = true;
        btnScan.innerHTML = '<span>⏳</span><span>स्कॅन होत आहे...</span>';
        setTimeout(() => {
          runScreener();
          btnScan.disabled = false;
          btnScan.innerHTML = '<span>⚡</span><span>आता स्कॅन करा (Scan Now)</span>';
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

  return {
    init,
    runScreener,
    openChartModal,
    closeChartModal,
    openInMainPortal
  };
})();

if (typeof window !== "undefined") {
  window.AAAScreenerModule = AAAScreenerModule;
}
