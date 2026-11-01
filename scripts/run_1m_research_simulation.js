// ============================================================================
// RESEARCH SCRIPT: 1-MINUTE GRANULARITY SIMULATION
// Fetches real 1M candles from Dhan [T_signal - 10m] to [T_completed + 10m]
// Simulates trade execution, slippage, MAE/MFE, and exports 1M datasets
// ============================================================================

const fs = require('fs');
const path = require('path');
const simEngine = require('../lib/simulation-engine.js');
const dhan = require('../lib/dhan.js');

const SESSIONS_DIR = path.join(__dirname, '..', 'data', 'sessions');
const RESEARCH_DIR = path.join(__dirname, '..', 'data', 'research_1m');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sanitize(str) {
  return String(str || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function runResearch(targetDateStr = '29 Oct 2026', maxSignals = 30) {
  console.log(`\n====================================================================`);
  console.log(`🔬 STARTING 1-MINUTE TRADE SIMULATION RESEARCH FOR: ${targetDateStr}`);
  console.log(`====================================================================\n`);

  const safeDate = sanitize(targetDateStr);
  const sessionPath = path.join(SESSIONS_DIR, `session_${safeDate}.json`);
  if (!fs.existsSync(sessionPath)) {
    console.error(`Session file not found: ${sessionPath}`);
    return;
  }

  const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  const allSignals = sessionData.signals || [];
  console.log(`Loaded ${allSignals.length} total signals from session.`);

  // Prioritize Index signals and liquid large-caps
  const prioritized = allSignals.filter(s => 
    s.Symbol.includes('NIFTY') || s.Symbol.includes('SENSEX') || s.Symbol === 'GOLD' || s.Symbol === 'CRUDEOIL' ||
    ['HDFCBANK', 'RELIANCE', 'SBIN', 'ICICIBANK', 'AXISBANK', 'TCS', 'INFY', 'BHARTIARTL'].includes(s.Symbol)
  );

  const testBatch = prioritized.slice(0, maxSignals);
  console.log(`Running detailed 1-minute simulation on top ${testBatch.length} liquid signals...\n`);

  const outDir = path.join(RESEARCH_DIR, safeDate);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const results = [];

  for (let i = 0; i < testBatch.length; i++) {
    const sig = testBatch[i];
    process.stdout.write(`[${i + 1}/${testBatch.length}] Simulating ${sig.Symbol} (${sig.Type} @ ${sig.SignalBarTime} IST)... `);

    try {
      // Throttle to respect Dhan rate limits
      await sleep(350);

      const sim = await simEngine.simulateTrade(sig);

      if (sim.s !== 'ok') {
        console.log(`❌ Failed: ${sim.message}`);
        continue;
      }

      // Export 1-minute CSV dataset
      const csvData = simEngine.exportSimulationCsv(sim);
      const csvFileName = `${sanitize(sig.Symbol)}_${sanitize(sig.SignalBarTime)}_${sig.Type}.csv`;
      const csvPath = path.join(outDir, csvFileName);
      fs.writeFileSync(csvPath, csvData, 'utf8');

      console.log(`✅ ${sim.outcome} | Fill: ₹${sim.simulatedFillPrice} | Exit: ₹${sim.exitPrice} (${sim.completionTime}) | PnL: ${sim.pnlPoints > 0 ? '+' : ''}${sim.pnlPoints} pts (${sim.pnlPercent}%) | Bars: ${sim.candleCount}`);

      results.push({
        symbol: sig.Symbol,
        type: sig.Type,
        signalTime: sig.SignalBarTime,
        windowStart: sim.windowStart,
        completionTime: sim.completionTime,
        windowEnd: sim.windowEnd,
        durationMinutes: sim.durationMinutes,
        signalEntry: sig.Entry,
        simFillPrice: sim.simulatedFillPrice,
        slippagePoints: sim.slippagePoints,
        exitPrice: sim.exitPrice,
        outcome: sim.outcome,
        pnlPoints: sim.pnlPoints,
        pnlPercent: sim.pnlPercent,
        rMultiple: sim.rMultiple,
        mfePoints: sim.maxFavorablePoints,
        maePoints: sim.maxAdversePoints,
        candleCount: sim.candleCount,
        csvFile: csvPath
      });
    } catch (err) {
      console.log(`❌ Error: ${err.message}`);
    }
  }

  // Print Research Summary Table
  console.log(`\n====================================================================`);
  console.log(`📊 1-MINUTE EXECUTION SIMULATION RESEARCH SUMMARY (${results.length} TRADES)`);
  console.log(`====================================================================\n`);

  const wins = results.filter(r => r.pnlPoints > 0).length;
  const losses = results.filter(r => r.pnlPoints < 0).length;
  const winRate = results.length > 0 ? ((wins / results.length) * 100).toFixed(1) : 0;
  const avgDuration = results.length > 0 ? (results.reduce((a, b) => a + b.durationMinutes, 0) / results.length).toFixed(1) : 0;
  const totalPoints = results.reduce((a, b) => a + b.pnlPoints, 0).toFixed(2);

  console.log(`Total Simulated Trades : ${results.length}`);
  console.log(`Winning Trades         : ${wins} (${winRate}%)`);
  console.log(`Losing Trades          : ${losses}`);
  console.log(`Average Trade Duration : ${avgDuration} minutes`);
  console.log(`Total Net Points       : ${totalPoints} pts`);
  console.log(`1-Minute Datasets Saved: ${outDir}\n`);

  console.log(`Top Simulated Trades:`);
  console.table(results.slice(0, 15).map(r => ({
    Symbol: r.symbol,
    Type: r.type,
    Signal: r.signalTime,
    Exit: r.completionTime.slice(0, 5),
    Duration: `${r.durationMinutes}m`,
    Fill: r.simFillPrice,
    ExitP: r.exitPrice,
    PnL: `${r.pnlPoints > 0 ? '+' : ''}${r.pnlPoints}`,
    'PnL %': `${r.pnlPercent}%`,
    Outcome: r.outcome,
    Bars: r.candleCount
  })));

  return results;
}

const targetDate = process.argv[2] || '29 Oct 2026';
const count = parseInt(process.argv[3] || '20', 10);
runResearch(targetDate, count);
