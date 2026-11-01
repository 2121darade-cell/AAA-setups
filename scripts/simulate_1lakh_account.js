// ============================================================================
// REALISTIC ₹1,00,000 (1 LAKH) MARGIN ACCOUNT SIMULATION
// Simulates chronological execution, concurrency limits, brokerage & taxes
// ============================================================================

const fs = require('fs');
const path = require('path');
const simEngine = require('../lib/simulation-engine.js');

const SESSIONS_DIR = path.join(__dirname, '..', 'data', 'sessions');

async function run1LakhSimulation() {
  const sessionPath = path.join(SESSIONS_DIR, 'session_29_Oct_2026.json');
  const raw = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  const allSignals = raw.signals || [];

  // Sort signals strictly chronologically by signal timestamp / time
  allSignals.sort((a, b) => {
    const tA = a.Timestamp || (new Date(`2026-10-29T${a.SignalBarTime}:00Z`).getTime());
    const tB = b.Timestamp || (new Date(`2026-10-29T${b.SignalBarTime}:00Z`).getTime());
    return tA - tB;
  });

  // Run 1-minute simulation for all signals first
  console.log(`Simulating ${allSignals.length} signals on 1-minute data...`);
  const simulatedTrades = [];

  for (const s of allSignals) {
    try {
      const sim = await simEngine.simulateTrade(s);
      if (sim.s === 'ok') {
        simulatedTrades.push({
          id: s.Id,
          symbol: s.Symbol,
          category: s.Category,
          type: s.Type,
          atm: s.ATM,
          signalTime: s.SignalBarTime,
          entryTs: sim.signalTs,
          exitTs: sim.completionTs,
          entryTimeStr: sim.signalTime,
          exitTimeStr: sim.completionTime,
          durationMins: sim.durationMinutes,
          fillPrice: sim.simulatedFillPrice,
          exitPrice: sim.exitPrice,
          outcome: sim.outcome,
          outcomeText: sim.outcomeText,
          pnlPoints: sim.pnlPoints,
          pnlPercent: sim.pnlPercent,
          rMultiple: sim.rMultiple,
          riskPoints: Math.abs(s.Entry - s.StopLoss)
        });
      }
    } catch (e) {}
  }

  console.log(`Successfully mapped ${simulatedTrades.length} trades with exact 1-minute timestamps.`);

  // --------------------------------------------------------------------------
  // SIMULATION STRATEGY 1: CONCURRENT PORTFOLIO (Max 3 Open Trades, 1.5% Risk)
  // Standard Professional Risk Management for ₹1,00,000 Capital
  // --------------------------------------------------------------------------
  function simulateAccount({ maxConcurrent = 3, riskPerTradePct = 1.5, initialCapital = 100000, filterCat = null }) {
    let cash = initialCapital;
    let peakCapital = initialCapital;
    let maxDrawdown = 0;
    let maxDrawdownPct = 0;

    const activePositions = []; // { trade, riskRupees, entryTs, exitTs }
    const tradeLog = [];
    const BROKERAGE_PER_TRADE = 50; // ₹20 Buy + ₹20 Sell + ₹10 STT/GST/Stamp

    // Filter by category if requested
    const eligibleTrades = filterCat ? simulatedTrades.filter(t => t.category === filterCat) : simulatedTrades;

    for (const t of eligibleTrades) {
      // 1. First, close any positions that completed BEFORE this trade's entry time
      for (let i = activePositions.length - 1; i >= 0; i--) {
        const pos = activePositions[i];
        if (pos.exitTs <= t.entryTs) {
          // Position closed before or at this minute!
          const realizedRupees = (pos.riskRupees * pos.trade.rMultiple) - BROKERAGE_PER_TRADE;
          cash += (pos.allocatedMargin + realizedRupees);
          
          if (cash > peakCapital) peakCapital = cash;
          const dd = peakCapital - cash;
          if (dd > maxDrawdown) {
            maxDrawdown = dd;
            maxDrawdownPct = (dd / peakCapital) * 100;
          }

          tradeLog.push({
            ...pos.trade,
            realizedRupees: Math.round(realizedRupees),
            accountBalance: Math.round(cash)
          });

          activePositions.splice(i, 1);
        }
      }

      // 2. Check if we have capacity for a new trade
      if (activePositions.length < maxConcurrent) {
        const riskRupees = (cash * (riskPerTradePct / 100));
        const marginPerTrade = Math.min(cash / (maxConcurrent - activePositions.length), 30000); // ~₹30k margin per slot

        if (cash >= marginPerTrade) {
          cash -= marginPerTrade; // Lock margin
          activePositions.push({
            trade: t,
            riskRupees,
            allocatedMargin: marginPerTrade,
            entryTs: t.entryTs,
            exitTs: t.exitTs
          });
        }
      }
    }

    // Close remaining positions at session close
    for (const pos of activePositions) {
      const realizedRupees = (pos.riskRupees * pos.trade.rMultiple) - BROKERAGE_PER_TRADE;
      cash += (pos.allocatedMargin + realizedRupees);
      if (cash > peakCapital) peakCapital = cash;
      const dd = peakCapital - cash;
      if (dd > maxDrawdown) {
        maxDrawdown = dd;
        maxDrawdownPct = (dd / peakCapital) * 100;
      }
      tradeLog.push({
        ...pos.trade,
        realizedRupees: Math.round(realizedRupees),
        accountBalance: Math.round(cash)
      });
    }

    const netProfitRupees = cash - initialCapital;
    const netReturnPct = (netProfitRupees / initialCapital) * 100;
    const wins = tradeLog.filter(t => t.realizedRupees > 0).length;
    const losses = tradeLog.filter(t => t.realizedRupees < 0).length;
    const winRate = tradeLog.length > 0 ? ((wins / tradeLog.length) * 100).toFixed(1) : 0;
    const totalBrokerage = tradeLog.length * BROKERAGE_PER_TRADE;

    return {
      initialCapital,
      finalCapital: Math.round(cash),
      netProfitRupees: Math.round(netProfitRupees),
      netReturnPct: Number(netReturnPct.toFixed(2)),
      totalTrades: tradeLog.length,
      wins,
      losses,
      winRate: Number(winRate),
      maxDrawdownRupees: Math.round(maxDrawdown),
      maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
      totalBrokerage,
      tradeLog
    };
  }

  console.log(`\n====================================================================`);
  console.log(`📊 SIMULATION 1: FULL PORTFOLIO (₹1,00,000 Capital, Max 3 Concurrent Trades)`);
  console.log(`   Risk: 1.5% (₹1,500) per trade | Brokerage: ₹50 round-trip`);
  console.log(`====================================================================`);
  const simAll = simulateAccount({ maxConcurrent: 3, riskPerTradePct: 1.5 });
  console.log(`Starting Capital      : ₹${simAll.initialCapital.toLocaleString('en-IN')}`);
  console.log(`Final Account Balance : ₹${simAll.finalCapital.toLocaleString('en-IN')}`);
  console.log(`Net Profit / Loss     : ${simAll.netProfitRupees >= 0 ? '+' : ''}₹${simAll.netProfitRupees.toLocaleString('en-IN')} (${simAll.netReturnPct >= 0 ? '+' : ''}${simAll.netReturnPct}%)`);
  console.log(`Total Trades Taken    : ${simAll.totalTrades} (Wins: ${simAll.wins}, Losses: ${simAll.losses}, Win Rate: ${simAll.winRate}%)`);
  console.log(`Max Account Drawdown  : -₹${simAll.maxDrawdownRupees.toLocaleString('en-IN')} (-${simAll.maxDrawdownPct}%)`);
  console.log(`Total Brokerage Paid  : ₹${simAll.totalBrokerage.toLocaleString('en-IN')}`);

  console.log(`\n====================================================================`);
  console.log(`📊 SIMULATION 2: INDEX-ONLY FOCUS (₹1,00,000 Capital, NIFTY / BANKNIFTY / FINNIFTY)`);
  console.log(`   Risk: 2.0% (₹2,000) per trade | Brokerage: ₹50 round-trip`);
  console.log(`====================================================================`);
  const simIndex = simulateAccount({ maxConcurrent: 2, riskPerTradePct: 2.0, filterCat: 'INDEX' });
  console.log(`Starting Capital      : ₹${simIndex.initialCapital.toLocaleString('en-IN')}`);
  console.log(`Final Account Balance : ₹${simIndex.finalCapital.toLocaleString('en-IN')}`);
  console.log(`Net Profit / Loss     : ${simIndex.netProfitRupees >= 0 ? '+' : ''}₹${simIndex.netProfitRupees.toLocaleString('en-IN')} (${simIndex.netReturnPct >= 0 ? '+' : ''}${simIndex.netReturnPct}%)`);
  console.log(`Total Trades Taken    : ${simIndex.totalTrades} (Wins: ${simIndex.wins}, Losses: ${simIndex.losses}, Win Rate: ${simIndex.winRate}%)`);
  console.log(`Max Account Drawdown  : -₹${simIndex.maxDrawdownRupees.toLocaleString('en-IN')} (-${simIndex.maxDrawdownPct}%)`);
  console.log(`Total Brokerage Paid  : ₹${simIndex.totalBrokerage.toLocaleString('en-IN')}`);

  console.log(`\nTrade-by-Trade Log for Index Account:`);
  console.table(simIndex.tradeLog.map(t => ({
    Symbol: t.symbol,
    Option: t.atm,
    Type: t.type,
    Signal: t.signalTime,
    Exit: t.exitTimeStr.slice(0, 5),
    Duration: `${t.durationMins}m`,
    Outcome: t.outcome,
    R: `${t.rMultiple}R`,
    'Net PnL (₹)': `${t.realizedRupees > 0 ? '+' : ''}₹${t.realizedRupees}`,
    'Balance (₹)': `₹${t.accountBalance.toLocaleString('en-IN')}`
  })));

  console.log(`\nSample Stock Trades taken in Simulation 1:`);
  console.table(simAll.tradeLog.slice(0, 10).map(t => ({
    Symbol: t.symbol,
    Option: t.atm,
    Type: t.type,
    Signal: t.signalTime,
    Exit: t.exitTimeStr.slice(0, 5),
    Outcome: t.outcome,
    R: `${t.rMultiple}R`,
    'Net PnL (₹)': `${t.realizedRupees > 0 ? '+' : ''}₹${t.realizedRupees}`,
    'Balance (₹)': `₹${t.accountBalance.toLocaleString('en-IN')}`
  })));
}

run1LakhSimulation();
