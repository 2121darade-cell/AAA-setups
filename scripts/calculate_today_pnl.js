// ============================================================================
// CALCULATE REAL 1-MINUTE EXECUTION P&L FOR TODAY'S TRADE SETUP SIGNALS
// ============================================================================

const fs = require('fs');
const path = require('path');
const simEngine = require('../lib/simulation-engine.js');

const SESSIONS_DIR = path.join(__dirname, '..', 'data', 'sessions');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function calculateTodayPnL() {
  const sessionPath = path.join(SESSIONS_DIR, 'session_29_Oct_2026.json');
  if (!fs.existsSync(sessionPath)) {
    console.error('Session file not found!');
    return;
  }

  const raw = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  const signals = raw.signals || [];
  console.log(`Loaded ${signals.length} signals from 29 Oct 2026 session.`);

  // 1. Pre-warm unique symbols politely
  const uniqueSymbols = Array.from(new Set(signals.map(s => s.Symbol)));
  console.log(`Found ${uniqueSymbols.length} unique symbols. Warming 1-minute cache...`);

  for (let i = 0; i < uniqueSymbols.length; i++) {
    const sym = uniqueSymbols[i];
    const res = await simEngine.fetch1mSessionCandles(sym, '29 Oct 2026');
    if (res.source && res.source.includes('Fresh')) {
      await sleep(400); // polite pause only if fresh call made
    }
  }
  console.log(`Cache warming complete! Running 1-minute simulations...\n`);

  // 2. Run simulation across all signals
  const results = [];
  let skipped = 0;

  for (let i = 0; i < signals.length; i++) {
    const s = signals[i];
    try {
      const sim = await simEngine.simulateTrade(s);
      if (sim.s === 'ok') {
        results.push({
          id: s.Id,
          symbol: s.Symbol,
          category: s.Category,
          type: s.Type,
          atm: s.ATM,
          time: s.SignalBarTime,
          fill: sim.simulatedFillPrice,
          exit: sim.exitPrice,
          exitTime: sim.completionTime,
          duration: sim.durationMinutes,
          outcome: sim.outcome,
          pnlPoints: sim.pnlPoints,
          pnlPercent: sim.pnlPercent,
          rMultiple: sim.rMultiple,
          riskPoints: Math.abs(s.Entry - s.StopLoss)
        });
      } else {
        skipped++;
      }
    } catch (e) {
      skipped++;
    }
  }

  console.log(`\n====================================================================`);
  console.log(`🏆 OVERALL REALIZED P&L SUMMARY (1-MINUTE EXECUTION GROUND TRUTH)`);
  console.log(`====================================================================`);

  const winners = results.filter(r => r.pnlPoints > 0);
  const losers = results.filter(r => r.pnlPoints < 0);
  const breakeven = results.filter(r => r.pnlPoints === 0);

  const totalTrades = results.length;
  const winCount = winners.length;
  const lossCount = losers.length;
  const winRate = ((winCount / totalTrades) * 100).toFixed(1);

  // Sum of R-Multiples (normalized risk units: e.g. +1.5R, +2.5R, -1.0R)
  const totalR = results.reduce((acc, r) => acc + r.rMultiple, 0).toFixed(2);
  const totalGrossGainR = winners.reduce((acc, r) => acc + r.rMultiple, 0);
  const totalGrossLossR = Math.abs(losers.reduce((acc, r) => acc + r.rMultiple, 0));
  const profitFactor = totalGrossLossR > 0 ? (totalGrossGainR / totalGrossLossR).toFixed(2) : 'Infinity';

  // Average trade return %
  const avgPercent = (results.reduce((acc, r) => acc + r.pnlPercent, 0) / totalTrades).toFixed(2);

  console.log(`Total Simulated Trades : ${totalTrades} (Skipped: ${skipped})`);
  console.log(`Winning Trades         : ${winCount} (${winRate}%)`);
  console.log(`Losing Trades          : ${lossCount} (${((lossCount / totalTrades) * 100).toFixed(1)}%)`);
  console.log(`Breakeven Trades       : ${breakeven.length}`);
  console.log(`--------------------------------------------------------------------`);
  console.log(`NET RESULT             : ${totalR > 0 ? '🟢 WE MADE MONEY' : '🔴 WE LOST MONEY'}`);
  console.log(`Net Risk Units (R-Sum) : ${totalR > 0 ? '+' : ''}${totalR} R`);
  console.log(`Profit Factor          : ${profitFactor}`);
  console.log(`Average Return / Trade : ${avgPercent > 0 ? '+' : ''}${avgPercent}%`);
  console.log(`--------------------------------------------------------------------`);

  // Category Breakdown
  const categories = ['INDEX', 'STOCK', 'MCX'];
  console.log(`\nBREAKDOWN BY ASSET CLASS:`);
  for (const cat of categories) {
    const subset = results.filter(r => r.category === cat);
    if (subset.length === 0) continue;
    const catWins = subset.filter(r => r.pnlPoints > 0).length;
    const catLosses = subset.filter(r => r.pnlPoints < 0).length;
    const catWinRate = ((catWins / subset.length) * 100).toFixed(1);
    const catR = subset.reduce((acc, r) => acc + r.rMultiple, 0).toFixed(2);
    const catAvgPct = (subset.reduce((acc, r) => acc + r.pnlPercent, 0) / subset.length).toFixed(2);
    const verdict = catR > 0 ? '🟢 PROFIT' : '🔴 LOSS';
    console.log(`• ${cat.padEnd(6)} : ${subset.length} trades | Wins: ${catWins} (${catWinRate}%) | Net: ${catR > 0 ? '+' : ''}${catR} R (${verdict}) | Avg: ${catAvgPct > 0 ? '+' : ''}${catAvgPct}%`);
  }

  // Outcome Breakdown
  const byOutcome = {};
  results.forEach(r => byOutcome[r.outcome] = (byOutcome[r.outcome] || 0) + 1);
  console.log(`\nOUTCOME BREAKDOWN:`, byOutcome);

  // Print Top 5 Biggest Winners & Losers in R
  console.log(`\nTOP 5 WINNING TRADES:`);
  const topWinners = [...winners].sort((a, b) => b.rMultiple - a.rMultiple).slice(0, 5);
  topWinners.forEach((w, idx) => {
    console.log(`  ${idx + 1}. ${w.symbol} (${w.atm}) ${w.type} @ ${w.time} ➔ ${w.outcome} | PnL: +${w.pnlPoints} pts (+${w.pnlPercent}%) | +${w.rMultiple}R`);
  });

  console.log(`\nTOP 5 LOSING TRADES:`);
  const topLosers = [...losers].sort((a, b) => a.rMultiple - b.rMultiple).slice(0, 5);
  topLosers.forEach((l, idx) => {
    console.log(`  ${idx + 1}. ${l.symbol} (${l.atm}) ${l.type} @ ${l.time} ➔ ${l.outcome} | PnL: ${l.pnlPoints} pts (${l.pnlPercent}%) | ${l.rMultiple}R`);
  });
}

calculateTodayPnL();
