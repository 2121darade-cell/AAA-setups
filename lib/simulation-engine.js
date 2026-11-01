// ============================================================================
// 1-MINUTE GRANULARITY TRADE SIMULATION ENGINE
// Precision 1M Intraday Candle Slicer, Execution Simulation & Replay Engine
// Window: [T_signal - 10 min] to [T_completed + 10 min]
// ============================================================================

const fs = require('fs');
const path = require('path');
const dhan = require('./dhan.js');

const CANDLES_1M_DIR = path.join(__dirname, '..', 'data', 'candles_1m');
if (!fs.existsSync(CANDLES_1M_DIR)) {
  try {
    fs.mkdirSync(CANDLES_1M_DIR, { recursive: true });
  } catch (e) {}
}

function round2(val) {
  if (val == null || isNaN(val)) return 0;
  return Math.round(Number(val) * 100) / 100;
}

function round4(val) {
  if (val == null || isNaN(val)) return 0;
  return Math.round(Number(val) * 10000) / 10000;
}

function sanitizeKey(str) {
  return String(str || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Normalizes date string into YYYY-MM-DD and DD_Mon_YYYY
 */
function normalizeDate(dateInput) {
  if (!dateInput) {
    const nowIst = dhan.formatIst(Date.now());
    return { fullDate: nowIst.fullDate, fileKey: sanitizeKey(nowIst.fullDate) };
  }
  const clean = String(dateInput).trim();
  // If numeric timestamp
  if (/^\d{10,13}$/.test(clean)) {
    const ist = dhan.formatIst(Number(clean));
    return { fullDate: ist.fullDate, fileKey: sanitizeKey(ist.fullDate) };
  }
  return { fullDate: clean, fileKey: sanitizeKey(clean) };
}

/**
 * Fetch and locally cache 1-minute candles for a specific symbol and date.
 * Single API call to Dhan /charts/intraday delivers full session 1m bars.
 */
async function fetch1mSessionCandles(symbol, targetDateInput) {
  const norm = normalizeDate(targetDateInput);
  const dateDir = path.join(CANDLES_1M_DIR, norm.fileKey);
  if (!fs.existsSync(dateDir)) {
    try { fs.mkdirSync(dateDir, { recursive: true }); } catch (e) {}
  }

  const cacheFile = path.join(dateDir, `${sanitizeKey(symbol)}.json`);

  // 1. Check local cache first (0ms latency, zero Dhan rate limit)
  if (fs.existsSync(cacheFile)) {
    try {
      const cachedData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (Array.isArray(cachedData.candles) && cachedData.candles.length > 0) {
        return {
          s: 'ok',
          symbol,
          date: norm.fullDate,
          count: cachedData.candles.length,
          candles: cachedData.candles,
          source: 'Local 1M Cache'
        };
      }
    } catch (e) {
      console.warn(`[Simulation 1M] Failed reading cache for ${symbol} on ${norm.fullDate}:`, e.message);
    }
  }

  // 2. Fetch from DhanHQ API
  try {
    const rawData = await dhan.getIntradayCandles(symbol, '1', 3);
    if (!rawData || rawData.s !== 'ok' || !Array.isArray(rawData.candles) || rawData.candles.length === 0) {
      return {
        s: 'error',
        symbol,
        date: norm.fullDate,
        message: `No 1-minute candle data returned from DhanHQ for ${symbol}`,
        candles: []
      };
    }

    // Filter strictly for the target session date
    const sessionCandles = rawData.candles.filter(c => {
      if (c.fullDate && c.fullDate === norm.fullDate) return true;
      // Match by IST date from timestamp
      const cIst = dhan.formatIst(c.timestamp);
      return cIst.fullDate === norm.fullDate;
    });

    if (sessionCandles.length > 0) {
      // Save to disk cache for future instant access
      try {
        fs.writeFileSync(cacheFile, JSON.stringify({
          symbol,
          date: norm.fullDate,
          updatedAt: new Date().toISOString(),
          candles: sessionCandles
        }, null, 2), 'utf8');
      } catch (e) {}

      return {
        s: 'ok',
        symbol,
        date: norm.fullDate,
        count: sessionCandles.length,
        candles: sessionCandles,
        source: 'DhanHQ v2 1m (Fresh Cached)'
      };
    }

    return {
      s: 'error',
      symbol,
      date: norm.fullDate,
      message: `No matching 1-minute candles for date: ${norm.fullDate}`,
      candles: []
    };
  } catch (err) {
    console.error(`[Simulation 1M] Error fetching ${symbol} candles:`, err.message);
    return {
      s: 'error',
      symbol,
      date: norm.fullDate,
      message: err.message,
      candles: []
    };
  }
}

/**
 * Execute High-Precision 1-Minute Trade Simulation
 * Window: [T_signal - 10 min] to [T_completed + 10 min]
 *
 * @param {Object} signal - Trade Setup signal object
 * @param {Object} options - Simulation parameters (trailSl, slippageModel, etc.)
 */
async function simulateTrade(signal, options = {}) {
  if (!signal || !signal.Symbol || !signal.Entry) {
    throw new Error('Invalid signal object: Symbol and Entry are required');
  }

  const sym = signal.Symbol;
  const isBuy = (signal.Type || 'BUY').toUpperCase() === 'BUY';
  const entryPrice = Number(signal.Entry);
  const stopLoss = Number(signal.StopLoss);
  const target1 = Number(signal.Target1);
  const target2 = Number(signal.Target2 || (entryPrice + (entryPrice - stopLoss) * 2.5));
  const riskPoints = Number(signal.RiskPoints || Math.abs(entryPrice - stopLoss));

  // Determine signal date & timestamp
  let signalTs = Number(signal.Timestamp) || 0;
  let signalDateStr = '';
  if (signalTs > 0) {
    signalDateStr = dhan.formatIst(signalTs).fullDate;
  } else if (signal.Time) {
    const parts = signal.Time.split(' ');
    if (parts.length >= 3) {
      signalDateStr = `${parts[0]} ${parts[1]} ${parts[2]}`;
    }
  }

  if (!signalDateStr) {
    signalDateStr = dhan.formatIst(Date.now()).fullDate;
  }

  // 1. Fetch full 1-minute session candles for the instrument
  const candleResult = await fetch1mSessionCandles(sym, signalDateStr);
  if (candleResult.s !== 'ok' || !candleResult.candles || candleResult.candles.length === 0) {
    return {
      s: 'error',
      signalId: signal.Id,
      symbol: sym,
      message: candleResult.message || `No 1-minute candle data available for ${sym} on ${signalDateStr}`
    };
  }

  const candles = candleResult.candles;

  // If signal timestamp wasn't accurate, match by SignalBarTime (e.g. "09:30")
  let sigIdx = -1;
  if (signalTs > 0) {
    sigIdx = candles.findIndex(c => Math.abs(c.timestamp - signalTs) < 45000); // within 45s
  }
  if (sigIdx === -1 && signal.SignalBarTime) {
    const targetHhmm = signal.SignalBarTime.trim().slice(0, 5);
    sigIdx = candles.findIndex(c => c.date === targetHhmm);
  }
  if (sigIdx === -1 && signal.Time) {
    const timeMatch = signal.Time.match(/(\d{2}:\d{2})/);
    if (timeMatch) {
      sigIdx = candles.findIndex(c => c.date === timeMatch[1]);
    }
  }

  // Default to candle index 0 if not found, or error
  if (sigIdx === -1) {
    return {
      s: 'error',
      signalId: signal.Id,
      symbol: sym,
      message: `Could not locate signal timestamp (${signal.SignalBarTime || signal.Time}) in 1-minute series`
    };
  }

  const sigCandle = candles[sigIdx];
  signalTs = sigCandle.timestamp;

  // 2. Realistic Simulated Fill Price:
  // Option A (Realistic): Open of the next 1-minute candle (sigIdx + 1)
  // Option B (Theoretical): Close of the signal candle
  const nextBar = (sigIdx + 1 < candles.length) ? candles[sigIdx + 1] : sigCandle;
  const theoreticalEntryPrice = sigCandle.close;
  const simulatedFillPrice = nextBar ? nextBar.open : theoreticalEntryPrice;
  const slippagePoints = round2(simulatedFillPrice - theoreticalEntryPrice);

  // 3. Step through 1-minute bars from entry minute onwards
  let currentSl = stopLoss;
  let t1HitMinute = null;
  let t1HitPrice = null;
  let t2HitMinute = null;
  let t2HitPrice = null;
  let slHitMinute = null;
  let slHitPrice = null;
  let squareOffMinute = null;
  let squareOffPrice = null;

  let completionIdx = -1;
  let outcome = 'ACTIVE';
  let exitPrice = simulatedFillPrice;

  // Excursion tracking (MAE: Max Adverse Excursion, MFE: Max Favorable Excursion)
  let maxAdversePoints = 0; // Drawdown while active (always <= 0)
  let maxFavorablePoints = 0; // Peak profit while active (always >= 0)

  const timeline = [];

  const startTradeIdx = sigIdx + 1;
  const maxSessionTime = (sym === 'GOLD' || sym === 'CRUDEOIL') ? '23:30' : '15:15';

  for (let k = startTradeIdx; k < candles.length; k++) {
    const ck = candles[k];
    const barTime = ck.date; // "HH:MM"
    const high = ck.high;
    const low = ck.low;
    const close = ck.close;

    // Track excursions on this minute
    let minuteFav = 0;
    let minuteAdv = 0;
    if (isBuy) {
      minuteFav = high - simulatedFillPrice;
      minuteAdv = low - simulatedFillPrice;
    } else {
      minuteFav = simulatedFillPrice - low;
      minuteAdv = simulatedFillPrice - high;
    }

    if (minuteFav > maxFavorablePoints) maxFavorablePoints = minuteFav;
    if (minuteAdv < maxAdversePoints) maxAdversePoints = minuteAdv;

    let eventOnBar = null;

    if (isBuy) {
      // Conservative Check: If both SL and Target are within High-Low range of the SAME minute candle,
      // conservative simulation treats SL as hit first.
      const touchesSl = low <= currentSl;
      const touchesT1 = high >= target1;
      const touchesT2 = high >= target2;

      if (touchesSl && touchesT1) {
        // Double breach in same minute -> Conservative rule: Stop Loss Hit first
        slHitMinute = ck;
        slHitPrice = currentSl;
        outcome = 'SL_HIT';
        exitPrice = currentSl;
        completionIdx = k;
        eventOnBar = `🛑 Stop Loss Hit @ ₹${currentSl} (conservative intra-minute breach)`;
        timeline.push({ time: ck.time, timestamp: ck.timestamp, ohlc: [ck.open, ck.high, ck.low, ck.close], event: eventOnBar });
        break;
      }

      if (touchesSl) {
        slHitMinute = ck;
        slHitPrice = currentSl;
        outcome = 'SL_HIT';
        exitPrice = currentSl;
        completionIdx = k;
        eventOnBar = `🛑 Stop Loss Hit @ ₹${currentSl}`;
        timeline.push({ time: ck.time, timestamp: ck.timestamp, ohlc: [ck.open, ck.high, ck.low, ck.close], event: eventOnBar });
        break;
      }

      if (touchesT2) {
        if (!t1HitMinute) {
          t1HitMinute = ck;
          t1HitPrice = target1;
        }
        t2HitMinute = ck;
        t2HitPrice = target2;
        outcome = 'TARGET_2_HIT';
        exitPrice = target2;
        completionIdx = k;
        eventOnBar = `🎯 Target 2 Hit (1:2.5) @ ₹${target2}`;
        timeline.push({ time: ck.time, timestamp: ck.timestamp, ohlc: [ck.open, ck.high, ck.low, ck.close], event: eventOnBar });
        break;
      }

      if (touchesT1 && !t1HitMinute) {
        t1HitMinute = ck;
        t1HitPrice = target1;
        eventOnBar = `✅ Target 1 Hit (1:1.5) @ ₹${target1}`;

        // If trailing SL option enabled: move SL to breakeven (entry price)
        if (options.trailSl) {
          currentSl = simulatedFillPrice;
          eventOnBar += ` | Trailing SL moved to Cost (₹${currentSl})`;
        }
      }
    } else {
      // SELL Trade
      const touchesSl = high >= currentSl;
      const touchesT1 = low <= target1;
      const touchesT2 = low <= target2;

      if (touchesSl && touchesT1) {
        slHitMinute = ck;
        slHitPrice = currentSl;
        outcome = 'SL_HIT';
        exitPrice = currentSl;
        completionIdx = k;
        eventOnBar = `🛑 Stop Loss Hit @ ₹${currentSl} (conservative intra-minute breach)`;
        timeline.push({ time: ck.time, timestamp: ck.timestamp, ohlc: [ck.open, ck.high, ck.low, ck.close], event: eventOnBar });
        break;
      }

      if (touchesSl) {
        slHitMinute = ck;
        slHitPrice = currentSl;
        outcome = 'SL_HIT';
        exitPrice = currentSl;
        completionIdx = k;
        eventOnBar = `🛑 Stop Loss Hit @ ₹${currentSl}`;
        timeline.push({ time: ck.time, timestamp: ck.timestamp, ohlc: [ck.open, ck.high, ck.low, ck.close], event: eventOnBar });
        break;
      }

      if (touchesT2) {
        if (!t1HitMinute) {
          t1HitMinute = ck;
          t1HitPrice = target1;
        }
        t2HitMinute = ck;
        t2HitPrice = target2;
        outcome = 'TARGET_2_HIT';
        exitPrice = target2;
        completionIdx = k;
        eventOnBar = `🎯 Target 2 Hit (1:2.5) @ ₹${target2}`;
        timeline.push({ time: ck.time, timestamp: ck.timestamp, ohlc: [ck.open, ck.high, ck.low, ck.close], event: eventOnBar });
        break;
      }

      if (touchesT1 && !t1HitMinute) {
        t1HitMinute = ck;
        t1HitPrice = target1;
        eventOnBar = `✅ Target 1 Hit (1:1.5) @ ₹${target1}`;

        if (options.trailSl) {
          currentSl = simulatedFillPrice;
          eventOnBar += ` | Trailing SL moved to Cost (₹${currentSl})`;
        }
      }
    }

    // Session square-off time check (15:15 IST)
    if (barTime >= maxSessionTime) {
      squareOffMinute = ck;
      squareOffPrice = ck.close;
      completionIdx = k;
      exitPrice = ck.close;
      outcome = t1HitMinute ? 'TARGET_1_HIT' : 'SESSION_SQUARE_OFF';
      eventOnBar = `⏱️ Session Square-Off @ ₹${exitPrice}`;
      timeline.push({ time: ck.time, timestamp: ck.timestamp, ohlc: [ck.open, ck.high, ck.low, ck.close], event: eventOnBar });
      break;
    }

    if (eventOnBar) {
      timeline.push({ time: ck.time, timestamp: ck.timestamp, ohlc: [ck.open, ck.high, ck.low, ck.close], event: eventOnBar });
    }
  }

  // If trade didn't hit SL or Target 2 by end of candles
  if (completionIdx === -1) {
    completionIdx = candles.length - 1;
    exitPrice = candles[completionIdx].close;
    if (t1HitMinute) {
      outcome = 'TARGET_1_HIT';
    } else {
      outcome = 'ACTIVE';
    }
  }

  const completionCandle = candles[completionIdx];
  const completionTs = completionCandle.timestamp;

  // 4. Calculate Sliced 1-Minute Window:
  // Pre-Trade: 10 minutes before signal timestamp
  // Post-Trade: 10 minutes after trade completion timestamp
  const tenMinsMs = 10 * 60 * 1000;
  const windowStartTs = signalTs - tenMinsMs;
  const windowEndTs = completionTs + tenMinsMs;

  const slicedCandles = candles.filter(c => c.timestamp >= windowStartTs && c.timestamp <= windowEndTs);

  // Decorate each candle in the slice with simulation context
  const enriched1mCandles = slicedCandles.map(c => {
    let zone = 'PRE_TRADE';
    if (c.timestamp >= signalTs && c.timestamp <= completionTs) {
      zone = 'IN_TRADE';
    } else if (c.timestamp > completionTs) {
      zone = 'POST_TRADE';
    }

    const isEntryCandle = (c.timestamp === signalTs);
    const isExitCandle = (c.timestamp === completionTs);

    // Compute running P&L for candles in trade
    let runningPoints = 0;
    let runningPercent = 0;
    if (zone === 'IN_TRADE') {
      runningPoints = isBuy ? (c.close - simulatedFillPrice) : (simulatedFillPrice - c.close);
      runningPercent = (runningPoints / simulatedFillPrice) * 100;
    }

    return {
      timestamp: c.timestamp,
      date: c.date,
      time: c.time,
      fullDate: c.fullDate,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      zone,
      isEntryCandle,
      isExitCandle,
      runningPoints: round2(runningPoints),
      runningPercent: round2(runningPercent)
    };
  });

  // Calculate final trade performance metrics
  const pnlPoints = isBuy ? round2(exitPrice - simulatedFillPrice) : round2(simulatedFillPrice - exitPrice);
  const pnlPercent = round2((pnlPoints / simulatedFillPrice) * 100);
  const rMultiple = round2(pnlPoints / Math.max(riskPoints, 0.01));
  const durationMinutes = Math.max(1, Math.round((completionTs - signalTs) / 60000));

  const outcomeLabels = {
    TARGET_2_HIT: '🎯 टार्गेट २ पूर्ण (Target 2 Hit)',
    TARGET_1_HIT: '✅ टार्गेट १ पूर्ण (Target 1 Hit)',
    SL_HIT: '🛑 स्टॉप लॉस हिट (SL Hit)',
    SESSION_SQUARE_OFF: '⏱️ सत्र समाप्ती (Session Square-Off)',
    ACTIVE: '🟢 ट्रेड चालू (Active)'
  };

  const simResult = {
    s: 'ok',
    signalId: signal.Id,
    symbol: sym,
    type: signal.Type || 'BUY',
    timeframe: '1m Granularity Simulation',
    date: signalDateStr,
    windowStart: dhan.formatIst(windowStartTs).hhmm + ' IST (-10m Pre)',
    signalTime: sigCandle.time,
    completionTime: completionCandle.time + ' (+10m Post Captured)',
    windowEnd: dhan.formatIst(windowEndTs).hhmm + ' IST',
    windowStartTs,
    signalTs,
    completionTs,
    windowEndTs,
    durationMinutes,
    theoreticalEntryPrice: round2(theoreticalEntryPrice),
    simulatedFillPrice: round2(simulatedFillPrice),
    slippagePoints,
    stopLoss: round2(stopLoss),
    target1: round2(target1),
    target2: round2(target2),
    exitPrice: round2(exitPrice),
    outcome,
    outcomeText: outcomeLabels[outcome] || outcome,
    pnlPoints,
    pnlPercent,
    rMultiple,
    maxFavorablePoints: round2(maxFavorablePoints),
    maxFavorablePercent: round2((maxFavorablePoints / simulatedFillPrice) * 100),
    maxAdversePoints: round2(maxAdversePoints),
    maxAdversePercent: round2((maxAdversePoints / simulatedFillPrice) * 100),
    t1HitTime: t1HitMinute ? t1HitMinute.time : null,
    t2HitTime: t2HitMinute ? t2HitMinute.time : null,
    slHitTime: slHitMinute ? slHitMinute.time : null,
    candleCount: enriched1mCandles.length,
    candles1m: enriched1mCandles,
    timeline
  };

  return simResult;
}

/**
 * Generate Downloadable CSV from 1-Minute Simulation Result
 */
function exportSimulationCsv(sim) {
  if (!sim || !Array.isArray(sim.candles1m)) {
    return 'Timestamp,Date,Time,Open,High,Low,Close,Volume,Zone,RunningPoints,RunningPercent\n';
  }

  const lines = [];
  lines.push(`# 1-MINUTE TRADE SIMULATION REPORT`);
  lines.push(`# Signal ID: ${sim.signalId}`);
  lines.push(`# Symbol: ${sim.symbol} | Type: ${sim.type} | Date: ${sim.date}`);
  lines.push(`# Fill Price: ₹${sim.simulatedFillPrice} | Exit Price: ₹${sim.exitPrice} | Outcome: ${sim.outcome}`);
  lines.push(`# PnL: ${sim.pnlPoints > 0 ? '+' : ''}${sim.pnlPoints} pts (${sim.pnlPercent}%) | R: ${sim.rMultiple}R | Duration: ${sim.durationMinutes} mins`);
  lines.push(`# Peak MFE: +${sim.maxFavorablePoints} pts | Peak MAE: ${sim.maxAdversePoints} pts`);
  lines.push(`# Window: ${sim.windowStart} -> ${sim.windowEnd} (${sim.candleCount} 1-minute bars)`);
  lines.push('');
  lines.push('Timestamp,Date,Time,Zone,Open,High,Low,Close,Volume,RunningPoints,RunningPercent,Marker');

  for (const c of sim.candles1m) {
    let marker = '';
    if (c.isEntryCandle) marker = 'ENTRY_SIGNAL';
    if (c.isExitCandle) marker = `EXIT_${sim.outcome}`;
    lines.push([
      c.timestamp,
      c.fullDate,
      c.date,
      c.zone,
      c.open,
      c.high,
      c.low,
      c.close,
      c.volume,
      c.runningPoints,
      c.runningPercent,
      marker
    ].join(','));
  }

  return lines.join('\n');
}

module.exports = {
  fetch1mSessionCandles,
  simulateTrade,
  exportSimulationCsv
};
