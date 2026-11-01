// ============================================================================
// REALISTIC ₹1,00,000 (1 LAKH) MARGIN ACCOUNT SIMULATION - OPTION BUYING
// Real Lot Sizes, Delta ~0.50, ₹50 Brokerage/Taxes per trade
// ============================================================================

const fs = require('fs');
const path = require('path');
const simEngine = require('../lib/simulation-engine.js');

const SESSIONS_DIR = path.join(__dirname, '..', 'data', 'sessions');

// Official NSE/BSE Lot Sizes
const LOT_SIZES = {
  'FIN NIFTY': 25,
  'BANK NIFTY': 15,
  'NIFTY 50': 25,
  'MIDCAP NIFTY': 50,
  'SENSEX': 10,
  'HDFCBANK': 550,
  'TATAMOTORS': 1425,
  'RELIANCE': 250,
  'SBIN': 750,
  'AXISBANK': 625,
  'LT': 150,
  'INFY': 400,
  'TCS': 175,
  'BHARTIARTL': 475,
  'SUNPHARMA': 350,
  'WIPRO': 1500,
  'BAJFINANCE': 125,
  'GOLD': 1,
  'CRUDEOIL': 100
};

async function simulateOptionAccount() {
  const sessionPath = path.join(SESSIONS_DIR, 'session_29_Oct_2026.json');
  const raw = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  const allSignals = raw.signals || [];

  // Sort chronologically
  allSignals.sort((a, b) => (a.Timestamp || 0) - (b.Timestamp || 0));

  // Map 1-minute simulated trades
  const trades = [];
  for (const s of allSignals) {
    try {
      const sim = await simEngine.simulateTrade(s);
      if (sim.s === 'ok') {
        const lotSize = LOT_SIZES[s.Symbol] || 100;
        trades.push({
          id: s.Id,
          symbol: s.Symbol,
          category: s.Category,
          type: s.Type,
          atm: s.ATM,
          time: s.SignalBarTime,
          entryTs: sim.signalTs,
          exitTs: sim.completionTs,
          exitTimeStr: sim.completionTime,
          duration: sim.durationMinutes,
          outcome: sim.outcome,
          pnlPoints: sim.pnlPoints,
          pnlPercent: sim.pnlPercent,
          rMultiple: sim.rMultiple,
          lotSize
        });
      }
    } catch (e) {}
  }

  // --------------------------------------------------------------------------
  // MODEL 1: Fixed Risk (₹1,500 Risk per Trade / 1.5% of ₹1 Lakh)
  // --------------------------------------------------------------------------
  console.log(`\n====================================================================`);
  console.log(`💼 ₹1,00,000 MARGIN ACCOUNT - FIXED RISK MODEL (1.5% / ₹1,500 per trade)`);
  console.log(`====================================================================`);

  let capital = 100000;
  let peak = 100000;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  const BROKERAGE = 50;

  const log1 = [];
  for (const t of trades) {
    // ₹1,500 risked * R-multiple achieved minus ₹50 brokerage
    const pnlRupees = Math.round((1500 * t.rMultiple) - BROKERAGE);
    capital += pnlRupees;

    if (capital > peak) peak = capital;
    const dd = peak - capital;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
      maxDrawdownPct = (dd / peak) * 100;
    }

    log1.push({
      symbol: t.symbol,
      atm: t.atm,
      type: t.type,
      time: t.time,
      exit: t.exitTimeStr.slice(0, 5),
      outcome: t.outcome,
      rMultiple: `${t.rMultiple}R`,
      pnlRupees,
      balance: Math.round(capital)
    });
  }

  const netGain1 = capital - 100000;
  const roi1 = (netGain1 / 100000) * 100;
  const wins1 = log1.filter(l => l.pnlRupees > 0).length;
  const losses1 = log1.filter(l => l.pnlRupees < 0).length;

  console.log(`Starting Balance      : ₹1,00,000`);
  console.log(`Final Account Balance : ₹${Math.round(capital).toLocaleString('en-IN')}`);
  console.log(`Net Rupee P&L         : ${netGain1 >= 0 ? '+' : ''}₹${Math.round(netGain1).toLocaleString('en-IN')} (${roi1 >= 0 ? '+' : ''}${roi1.toFixed(2)}% ROI)`);
  console.log(`Total Trades Taken    : ${log1.length} | Wins: ${wins1} (${((wins1/log1.length)*100).toFixed(1)}%) | Losses: ${losses1}`);
  console.log(`Peak Drawdown         : -₹${Math.round(maxDrawdown).toLocaleString('en-IN')} (-${maxDrawdownPct.toFixed(2)}%)`);
  console.log(`Total Brokerage Paid  : ₹${(log1.length * 50).toLocaleString('en-IN')}`);

  // --------------------------------------------------------------------------
  // MODEL 2: INDEX ONLY PORTFOLIO (1 Lot Options Buying on Indices)
  // --------------------------------------------------------------------------
  console.log(`\n====================================================================`);
  console.log(`🎯 ₹1,00,000 MARGIN ACCOUNT - INDEX OPTIONS (1 Lot Per Signal, Delta ~0.50)`);
  console.log(`====================================================================`);

  let indexCapital = 100000;
  let indexPeak = 100000;
  let indexMaxDD = 0;
  const indexTrades = trades.filter(t => t.category === 'INDEX');

  const log2 = [];
  for (const t of indexTrades) {
    // For ATM options: Option price moves ~0.50 * Index Points move (Delta = 0.50)
    // Option PnL = Index Pnl Points * 0.50 * Lot Size
    const optionPoints = t.pnlPoints * 0.50;
    const grossRupees = Math.round(optionPoints * t.lotSize);
    const netRupees = grossRupees - BROKERAGE;
    indexCapital += netRupees;

    if (indexCapital > indexPeak) indexPeak = indexCapital;
    const dd = indexPeak - indexCapital;
    if (dd > indexMaxDD) indexMaxDD = dd;

    log2.push({
      symbol: t.symbol,
      option: t.atm,
      type: t.type,
      time: t.time,
      exit: t.exitTimeStr.slice(0, 5),
      outcome: t.outcome,
      points: `${t.pnlPoints > 0 ? '+' : ''}${t.pnlPoints} pts`,
      lotSize: t.lotSize,
      pnlRupees: `${netRupees >= 0 ? '+' : ''}₹${netRupees.toLocaleString('en-IN')}`,
      balance: `₹${Math.round(indexCapital).toLocaleString('en-IN')}`
    });
  }

  const indexGain = indexCapital - 100000;
  const indexRoi = (indexGain / 100000) * 100;
  const indexWins = log2.filter(l => !l.pnlRupees.includes('-')).length;

  console.log(`Starting Balance      : ₹1,00,000`);
  console.log(`Final Account Balance : ₹${Math.round(indexCapital).toLocaleString('en-IN')}`);
  console.log(`Net Rupee P&L         : ${indexGain >= 0 ? '+' : ''}₹${Math.round(indexGain).toLocaleString('en-IN')} (${indexRoi >= 0 ? '+' : ''}${indexRoi.toFixed(2)}% ROI)`);
  console.log(`Total Trades Taken    : ${log2.length} | Wins: ${indexWins} | Losses: ${log2.length - indexWins}`);
  console.log(`Peak Drawdown         : -₹${Math.round(indexMaxDD).toLocaleString('en-IN')} (-${((indexMaxDD/indexPeak)*100).toFixed(2)}%)`);
  console.log(`Total Brokerage Paid  : ₹${(log2.length * 50).toLocaleString('en-IN')}\n`);

  console.table(log2);
}

simulateOptionAccount();
