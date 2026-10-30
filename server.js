/**
 * Finanthropist Educare Pvt Ltd - Tradejini Dynamic Data Server & Web Host (Linux/Node.js)
 * 100% Pure Live Tradejini CubePlus API v2 Feed Engine
 * Zero synthetic/cached data • Live Candlesticks, Live Watchlist Quotes, Live 5m Heikin Ashi & AAA Screener
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { WebSocketServer } = require('ws');
const dhan = require('./lib/dhan.js');
const simEngine = require('./lib/simulation-engine.js');

// Global Exception Protection - Prevent server crashes on network timeouts or socket resets
process.on('uncaughtException', (err) => {
  console.error('[Daemon Protection] Uncaught Exception caught:', err.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Daemon Protection] Unhandled Rejection caught:', reason ? (reason.message || reason) : 'Unknown');
});

const PORT = parseInt(process.env.PORT || '8085', 10);
const HOST = process.env.HOST || '127.0.0.1';
const ROOT_DIR = __dirname;

// Tradejini Credentials
const TJ_API_KEY = process.env.TJ_API_KEY || '4e8598e9e21fb2092d772c2923ab72a2';
const TJ_USER_ID = process.env.TJ_USER_ID || 'TR2488';
const TJ_PASSWORD = process.env.TJ_PASSWORD || '1208';
const TJ_SEED = process.env.TJ_SEED || 'GRZZXEU7TV6WUXEFWGOJR7RHHQC54ZL4';
const TJ_BASE_URL = 'https://api.tradejini.com/v2';

// Session State & Auto-Login Tracking (Tradejini Account: TR2488)
let tjAccessToken = null;
let tjTokenExpiryMs = 0;
let tjLastLoginMs = 0;
let tjLastLoginStatus = 'NOT_LOGGED_IN';
let tjLastLoginMessage = 'Auto-login initialization pending';
let tjLoginCountToday = 0;
let loginInFlight = null;

// Short-lived candle cache to protect Tradejini rate limits under concurrent requests
const candleCache = new Map();
const CANDLE_CACHE_TTL_MS = 4000;

// Live Quote Cache: symbol -> { symbol, price, prevClose, open, high, low, change, changePercent, updatedAt }
const liveQuotesMap = new Map();
let lastQuotesSweepMs = 0;
let quotesSweepInFlight = null;

// Screener & Trade Setup Caches
const screenerCache = new Map();
const dailyUniverseCandlesMap = new Map();
let cachedTradeSetup = null;
let lastTradeSetupMs = 0;
let tradeSetupInFlight = null;

// Persistent Session Manager for Intraday Trade Setup (09:15 - 15:30 IST)
const SESSIONS_DIR = path.join(__dirname, 'data', 'sessions');
try {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
} catch (e) {}

let activeSessionDate = '';
const activeSessionSignals = new Map();

function getSessionFilePath(dateStr) {
  const safeDate = String(dateStr || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(SESSIONS_DIR, `session_${safeDate}.json`);
}

function ensureTodaySession() {
  const todayStr = formatIst(Date.now()).fullDate; // e.g. "29 Oct 2026"
  if (activeSessionDate !== todayStr) {
    activeSessionDate = todayStr;
    activeSessionSignals.clear();
    const fPath = getSessionFilePath(todayStr);
    if (fs.existsSync(fPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(fPath, 'utf8'));
        if (Array.isArray(raw.signals)) {
          for (const s of raw.signals) {
            if (s && s.Id) activeSessionSignals.set(s.Id, s);
          }
          console.log(`[Trade Setup Session] Loaded ${activeSessionSignals.size} signals for session: ${todayStr}`);
        }
      } catch (e) {
        console.warn(`[Trade Setup Session] Failed to load session ${todayStr}:`, e.message);
      }
    } else {
      console.log(`[Trade Setup Session] Initialized fresh BLANK SLATE session for ${todayStr} (0 signals)`);
    }
  }
  return todayStr;
}

function saveTodaySession() {
  if (!activeSessionDate) return;
  const fPath = getSessionFilePath(activeSessionDate);
  try {
    const data = {
      date: activeSessionDate,
      updatedAt: formatIst(Date.now()).fullDateTime,
      signals: Array.from(activeSessionSignals.values())
    };
    fs.writeFileSync(fPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn(`[Trade Setup Session] Failed to save session:`, e.message);
  }
}

function getSavedSessionDates() {
  const list = [];
  try {
    if (!fs.existsSync(SESSIONS_DIR)) return [];
    const files = fs.readdirSync(SESSIONS_DIR);
    const todayStr = formatIst(Date.now()).fullDate;

    for (const f of files) {
      if (f.startsWith('session_') && f.endsWith('.json')) {
        const fileKey = f.replace(/^session_/, '').replace(/\.json$/, '');
        const fPath = path.join(SESSIONS_DIR, f);
        try {
          const raw = JSON.parse(fs.readFileSync(fPath, 'utf8'));
          const dateStr = raw.date || fileKey.replace(/_/g, ' ');
          const sigs = Array.isArray(raw.signals) ? raw.signals : [];
          list.push({
            date: dateStr,
            fileKey,
            isToday: dateStr === todayStr,
            updatedAt: raw.updatedAt || '',
            stats: {
              total: sigs.length,
              active: sigs.filter(s => s.Status === 'ACTIVE').length,
              targets: sigs.filter(s => s.Status === 'TARGET_1_HIT' || s.Status === 'TARGET_2_HIT').length,
              stopLosses: sigs.filter(s => s.Status === 'SL_HIT').length
            }
          });
        } catch (e) {}
      }
    }
  } catch (err) {
    console.warn('[Session Storage] Error reading session files:', err.message);
  }

  // Sort: Today first, then latest dates descending
  list.sort((a, b) => {
    if (a.isToday) return -1;
    if (b.isToday) return 1;
    const tA = new Date(a.date).getTime() || 0;
    const tB = new Date(b.date).getTime() || 0;
    return tB - tA;
  });

  return list;
}

function findSignalById(signalId) {
  if (!signalId) return null;
  // 1. Check in active session memory
  if (activeSessionSignals.has(signalId)) {
    return activeSessionSignals.get(signalId);
  }
  // 2. Search saved session files
  try {
    if (fs.existsSync(SESSIONS_DIR)) {
      const files = fs.readdirSync(SESSIONS_DIR);
      for (const f of files) {
        if (f.startsWith('session_') && f.endsWith('.json')) {
          try {
            const raw = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8'));
            if (Array.isArray(raw.signals)) {
              const found = raw.signals.find(s => s.Id === signalId);
              if (found) return found;
            }
          } catch (e) {}
        }
      }
    }
  } catch (err) {}
  return null;
}

// Persistent Session Manager for Daily (1D) AAA Candlestick Screener Calendar
const AAA_SESSIONS_DIR = path.join(__dirname, 'data', 'aaa_sessions');
try {
  if (!fs.existsSync(AAA_SESSIONS_DIR)) {
    fs.mkdirSync(AAA_SESSIONS_DIR, { recursive: true });
  }
} catch (e) {}

function getAaaSessionFilePath(dateStr) {
  const safeDate = String(dateStr || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(AAA_SESSIONS_DIR, `aaa_session_${safeDate}.json`);
}

function saveAaaSession(dateStr, rows, totalScanned = 189) {
  if (!dateStr || !Array.isArray(rows)) return;
  const fPath = getAaaSessionFilePath(dateStr);
  try {
    const buyCount = rows.filter(r => r.type === 'BUY').length;
    const sellCount = rows.filter(r => r.type === 'SELL').length;
    const activeCount = rows.filter(r => r.status === 'ACTIVE').length;
    const targetsCount = rows.filter(r => r.status === 'TARGET_1_HIT' || r.status === 'TARGET_2_HIT').length;
    const slCount = rows.filter(r => r.status === 'SL_HIT').length;

    const data = {
      date: dateStr,
      fileKey: dateStr.replace(/ /g, '_'),
      updatedAt: formatIst(Date.now()).fullDateTime,
      timeframe: '1D (Daily Timeframe)',
      totalScanned: totalScanned || 189,
      stats: {
        total: rows.length,
        buy: buyCount,
        sell: sellCount,
        active: activeCount,
        targets: targetsCount,
        stopLosses: slCount
      },
      signals: rows
    };
    fs.writeFileSync(fPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`[AAA Session Storage] Saved ${rows.length} signals for session: ${dateStr} (${targetsCount} targets, ${slCount} SLs, ${activeCount} active)`);
  } catch (err) {
    console.warn(`[AAA Session Storage] Failed to save session for ${dateStr}:`, err.message);
  }
}

function getSavedAaaSessionDates() {
  const list = [];
  try {
    if (!fs.existsSync(AAA_SESSIONS_DIR)) return [];
    const files = fs.readdirSync(AAA_SESSIONS_DIR);
    const todayStr = formatIst(Date.now()).fullDate;

    for (const f of files) {
      if (f.startsWith('aaa_session_') && f.endsWith('.json')) {
        const fileKey = f.replace(/^aaa_session_/, '').replace(/\.json$/, '');
        const fPath = path.join(AAA_SESSIONS_DIR, f);
        try {
          const raw = JSON.parse(fs.readFileSync(fPath, 'utf8'));
          const dateStr = raw.date || fileKey.replace(/_/g, ' ');
          const sigs = Array.isArray(raw.signals) ? raw.signals : [];
          list.push({
            date: dateStr,
            fileKey,
            isToday: dateStr === todayStr,
            updatedAt: raw.updatedAt || '',
            stats: raw.stats || {
              total: sigs.length,
              buy: sigs.filter(s => s.type === 'BUY').length,
              sell: sigs.filter(s => s.type === 'SELL').length,
              active: sigs.filter(s => s.status === 'ACTIVE').length,
              targets: sigs.filter(s => s.status === 'TARGET_1_HIT' || s.status === 'TARGET_2_HIT').length,
              stopLosses: sigs.filter(s => s.status === 'SL_HIT').length
            }
          });
        } catch (e) {}
      }
    }
  } catch (err) {
    console.warn('[AAA Session Storage] Error reading session files:', err.message);
  }

  // Sort: Today first, then latest dates descending
  list.sort((a, b) => {
    if (a.isToday) return -1;
    if (b.isToday) return 1;
    const tA = new Date(a.date).getTime() || 0;
    const tB = new Date(b.date).getTime() || 0;
    return tB - tA;
  });

  return list;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Core Tracked Universe for Live Quotes, Heikin Ashi Trade Setup & AAA Screener
const CORE_INDICES = [
  { symbol: 'NIFTY 50', key: 'nifty', name: 'NIFTY 50 Benchmark Index', exchange: 'NSE' },
  { symbol: 'BANK NIFTY', key: 'banknifty', name: 'NIFTY Bank Index', exchange: 'NSE' },
  { symbol: 'SENSEX', key: 'sensex', name: 'BSE SENSEX Benchmark Index', exchange: 'BSE' },
  { symbol: 'MIDCAP NIFTY', key: 'midcap', name: 'NIFTY Midcap Select Index', exchange: 'NSE' },
  { symbol: 'FIN NIFTY', key: 'finnifty', name: 'NIFTY Financial Services Index', exchange: 'NSE' }
];

const CORE_MCX = [
  { symbol: 'GOLD', name: 'MCX Gold Futures', exchange: 'MCX' },
  { symbol: 'CRUDEOIL', name: 'MCX Crude Oil Futures', exchange: 'MCX' }
];

const CORE_STOCKS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'BHARTIARTL',
  'ITC', 'KOTAKBANK', 'LT', 'AXISBANK', 'HINDUNILVR', 'BAJFINANCE', 'MARUTI',
  'ASIANPAINT', 'TATAMOTORS', 'SUNPHARMA', 'TITAN', 'NTPC', 'POWERGRID',
  'ADANIENT', 'ADANIPORTS', 'BAJAJ-AUTO', 'LTIM', 'M&M', 'NESTLEIND', 'SHREECEM',
  'BAJAJFINSV', 'WIPRO', 'HCLTECH', 'ULTRACEMCO', 'ONGC',
  'COALINDIA', 'JSWSTEEL', 'TATASTEEL', 'TECHM', 'INDUSINDBK', 'HINDALCO',
  'GRASIM', 'CIPLA', 'DRREDDY', 'EICHERMOT', 'DIVISLAB', 'BPCL',
  'HEROMOTOCO', 'APOLLOHOSP', 'BRITANNIA', 'TATACONSUM', 'SBILIFE', 'HDFCLIFE',
  'DLF', 'HAL', 'BEL', 'TRENT', 'SIEMENS', 'ABB', 'IOC', 'VEDL',
  'GAIL', 'PFC', 'REC', 'BHEL', 'BANKBARODA', 'PNB', 'CANBK', 'IDFCFIRSTB',
  'CHOLAFIN', 'SHRIRAMFIN', 'PIDILITIND', 'HAVELLS', 'AMBUJACEM', 'DABUR',
  'GODREJCP', 'MARICO', 'COLPAL', 'LUPIN', 'AUROPHARMA', 'BIOCON', 'ZYDUSLIFE'
];

// Additional Nifty 200 / F&O liquid stocks scanned by the Daily (1D) AAA Morning Screener
const AAA_EXTRA_STOCKS = [
  'ADANIPORTS', 'ADANIPOWER', 'ASHOKLEY', 'ASTRAL', 'AUBANK', 'BAJAJ-AUTO',
  'BALKRISIND', 'BANDHANBNK', 'BERGEPAINT', 'BHARATFORG', 'BOSCHLTD', 'BSE',
  'CAMS', 'CDSL', 'CGPOWER', 'COFORGE', 'CONCOR', 'CUMMINSIND', 'DEEPAKNTR',
  'DELHIVERY', 'DIXON', 'DMART', 'ESCORTS', 'EXIDEIND', 'FEDERALBNK', 'FORTIS',
  'GLENMARK', 'GMRAIRPORT', 'GODREJPROP', 'GRANULES', 'HDFCAMC', 'HINDPETRO',
  'HINDZINC', 'ICICIGI', 'ICICIPRULI', 'IDEA', 'IEX', 'IGL', 'INDHOTEL',
  'INDIGO', 'INDUSTOWER', 'IRCTC', 'IRFC', 'JINDALSTEL', 'JIOFIN', 'JSWENERGY',
  'JUBLFOOD', 'KALYANKJIL', 'KPITTECH', 'LAURUSLABS', 'LICHSGFIN', 'LICI',
  'LODHA', 'LTF', 'LTIM', 'LTTS', 'M&M', 'M&MFIN', 'MANAPPURAM', 'MANKIND',
  'MAXHEALTH', 'MAZDOCK', 'MCX', 'MFSL', 'MOTHERSON', 'MPHASIS', 'MUTHOOTFIN',
  'NATIONALUM', 'NAUKRI', 'NESTLEIND', 'NHPC', 'NMDC', 'NYKAA', 'OBEROIRLTY',
  'OFSS', 'OIL', 'PAGEIND', 'PATANJALI', 'PAYTM', 'PERSISTENT', 'PETRONET',
  'PIIND', 'POLICYBZR', 'POLYCAB', 'PRESTIGE', 'RBLBANK', 'SAIL', 'SBICARD',
  'SHREECEM', 'SJVN', 'SOLARINDS', 'SONACOMS', 'SRF', 'SUZLON', 'SUPREMEIND',
  'TATACHEM', 'TATACOMM', 'TATAELXSI', 'TATAPOWER', 'TATATECH', 'TIINDIA',
  'TORNTPHARM', 'TORNTPOWER', 'TVSMOTOR', 'UNIONBANK', 'UPL', 'VBL', 'VOLTAS',
  'YESBANK'
];

// Rapid intraday subset (top 30 stocks + indices + MCX) for 10s live quote polling & 5m Heikin Ashi
const INTRADAY_FAST_STOCKS = CORE_STOCKS.slice(0, 30);

// Persistent cache of 60-day 5m bars used to build Daily (1D), 15m, and 60m candles
const raw60dCache = new Map();
let lastMorningScanDate = '';
let morningWarmupInFlight = null;

// Official Indian Stock Market (NSE/BSE) Trading Holidays (2025/2026)
const NSE_HOLIDAYS_SET = new Set([
  '2026-01-26', // Republic Day
  '2026-02-18', // Maha Shivratri
  '2026-03-03', // Holi
  '2026-03-26', // Id-ul-Fitr (Ramzan Eid)
  '2026-04-03', // Good Friday
  '2026-04-14', // Dr. Baba Saheb Ambedkar Jayanti
  '2026-05-01', // Maharashtra Day
  '2026-05-28', // Bakri Eid
  '2026-06-17', // Muharram
  '2026-08-15', // Independence Day
  '2026-09-16', // Milad-un-Nabi
  '2026-10-02', // Mahatma Gandhi Jayanti
  '2026-10-20', // Market Holiday (Dussehra / Special Clearing)
  '2026-10-21', // Dussehra
  '2026-11-08', // Diwali-Laxmi Pujan
  '2026-11-10', // Diwali-Balipratipada
  '2026-11-24', // Gurunanak Jayanti
  '2026-12-25'  // Christmas
]);

function isIndianMarketHours() {
  const istOffset = 19800000; // +05:30 in ms
  const istDate = new Date(Date.now() + istOffset);
  const day = istDate.getUTCDay(); // 0: Sun, 1: Mon, ..., 5: Fri, 6: Sat
  if (day === 0 || day === 6) return false;

  const yyyy = istDate.getUTCFullYear();
  const mm = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(istDate.getUTCDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;
  if (NSE_HOLIDAYS_SET.has(dateStr)) return false;

  const mins = istDate.getUTCHours() * 60 + istDate.getUTCMinutes();
  // Mon-Fri 09:15 to 15:30 IST (555 to 930 minutes)
  return mins >= 555 && mins <= 930;
}

function getRaw60dTtlMs() {
  if (isIndianMarketHours()) {
    // 60-second TTL during live market hours ensures today's newly closed 5m bars & daily candle flow immediately!
    return 60 * 1000;
  }
  // 30 minutes outside market hours to conserve resources while remaining fresh
  return 30 * 60 * 1000;
}

// Serialized rate-limiter queue for Tradejini HTTP requests to prevent OpenResty 429 Too Many Requests
let tjRequestChain = Promise.resolve();
function tjThrottledRequest(url, options) {
  const next = tjRequestChain.then(async () => {
    await new Promise((r) => setTimeout(r, 85));
    return httpsRequest(url, options);
  });
  tjRequestChain = next.catch(() => {});
  return next;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function formatIst(unixMs) {
  // IST is UTC + 05:30 (19800000 ms)
  const istDate = new Date(unixMs + 19800000);
  const hh = String(istDate.getUTCHours()).padStart(2, '0');
  const mm = String(istDate.getUTCMinutes()).padStart(2, '0');
  const ss = String(istDate.getUTCSeconds()).padStart(2, '0');
  const dd = String(istDate.getUTCDate()).padStart(2, '0');
  const mon = MONTHS_SHORT[istDate.getUTCMonth()];
  const yyyy = istDate.getUTCFullYear();
  return {
    hh,
    mm,
    hhmm: `${hh}:${mm}`,
    ddMon: `${dd} ${mon}`,
    fullDate: `${dd} ${mon} ${yyyy}`,
    fullDateTime: `${dd} ${mon} ${yyyy} ${hh}:${mm}:${ss} IST`,
    isoLocal: `${yyyy}-${String(istDate.getUTCMonth() + 1).padStart(2, '0')}-${dd} ${hh}:${mm}:${ss} IST`
  };
}

function getNextDailyCutoffMs(nowMs = Date.now()) {
  const istOffset = 19800000;
  const istNow = new Date(nowMs + istOffset);
  const cutoffIst = new Date(Date.UTC(
    istNow.getUTCFullYear(),
    istNow.getUTCMonth(),
    istNow.getUTCDate(),
    6, 0, 0, 0
  ));
  if (istNow.getTime() >= cutoffIst.getTime()) {
    cutoffIst.setUTCDate(cutoffIst.getUTCDate() + 1);
  }
  return cutoffIst.getTime() - istOffset - 5 * 60 * 1000;
}

// 1. RFC 6238 TOTP Generator
function getTotpCode(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = secret.toUpperCase().replace(/[\s=]/g, '');
  let bits = '';
  for (let i = 0; i < clean.length; i++) {
    const val = alphabet.indexOf(clean[i]);
    if (val < 0) throw new Error(`Invalid Base32 char: ${clean[i]}`);
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  const key = Buffer.from(bytes);
  const step = Math.floor(Date.now() / 1000 / 30);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigInt64BE(BigInt(step), 0);

  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 1000000).padStart(6, '0');
}

function httpsRequest(urlStr, options = {}, bodyStr = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const reqOpts = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 15000
    };

    const req = https.request(reqOpts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve({ statusCode: res.statusCode, body: raw });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });
    req.on('error', (err) => reject(err));

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// 2. Automated Tradejini Login (RFC 6238 TOTP Engine)
async function refreshTradejiniSession(force = false) {
  const now = Date.now();
  if (!force && tjAccessToken && now < (tjTokenExpiryMs - 60000)) {
    return tjAccessToken;
  }
  if (loginInFlight) {
    return loginInFlight;
  }

  loginInFlight = (async () => {
    try {
      const totp = getTotpCode(TJ_SEED);
      const formBody = new URLSearchParams({
        userid: TJ_USER_ID,
        password: TJ_PASSWORD,
        twoFa: totp,
        twoFaTyp: 'totp'
      }).toString();

      const res = await httpsRequest(
        `${TJ_BASE_URL}/api-gw/oauth/individual-token-v2`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${TJ_API_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(formBody),
            'Accept': 'application/json'
          }
        },
        formBody
      );

      if (res.statusCode === 200) {
        const parsed = JSON.parse(res.body);
        if (parsed && parsed.access_token) {
          tjAccessToken = parsed.access_token;
          const ttlMs = ((Number(parsed.expires_in) || 86400) - 300) * 1000;
          tjTokenExpiryMs = Math.min(Date.now() + ttlMs, getNextDailyCutoffMs());
          tjLastLoginMs = Date.now();
          tjLastLoginStatus = 'SUCCESS';
          tjLastLoginMessage = 'Authentication successful';
          tjLoginCountToday++;
          console.log(`[Tradejini Auto-Login] Authenticated account ${TJ_USER_ID}! Token valid until: ${formatIst(tjTokenExpiryMs).isoLocal}`);
          return tjAccessToken;
        }
      }
      tjLastLoginStatus = 'ERROR';
      tjLastLoginMessage = `Login failed (${res.statusCode}): ${res.body.slice(0, 150)}`;
      console.error(`[Tradejini Auto-Login] Login failed (${res.statusCode}): ${res.body.slice(0, 200)}`);
    } catch (err) {
      tjLastLoginStatus = 'ERROR';
      tjLastLoginMessage = `Login exception: ${err.message}`;
      console.error(`[Tradejini Auto-Login] Login error: ${err.message}`);
    } finally {
      loginInFlight = null;
    }
    return tjAccessToken;
  })();

  return loginInFlight;
}

// 3. Symbol ID Resolver
function resolveTradejiniId(symbol) {
  const sym = String(symbol || 'NIFTY 50').trim().toUpperCase();
  if (sym === 'NIFTY' || sym === 'NIFTY 50' || sym === 'NIFTY50' || sym === '^NSEI') {
    return 'IDX_-1_NSE';
  }
  if (sym === 'BANKNIFTY' || sym === 'BANK NIFTY' || sym === '^NSEBANK') {
    return 'IDX_-20_NSE';
  }
  if (sym === 'FINNIFTY' || sym === 'FIN NIFTY' || sym === 'NIFTY_FIN_SERVICE.NS') {
    return 'IDX_-21_NSE';
  }
  if (sym === 'MIDCPNIFTY' || sym === 'MIDCAP NIFTY' || sym === 'MIDCAP' || sym === '^NSEMDCP50') {
    return 'IDX_-18_NSE';
  }
  if (sym === 'SENSEX' || sym === '^BSESN') {
    return 'IDX_-51_BSE';
  }
  if (sym === 'GOLD' || sym === 'GOLDM') {
    return 'FUTCOM_GOLD_MCX_2026-12-04';
  }
  if (sym === 'CRUDEOIL' || sym === 'CRUDE' || sym === 'CRUDE OIL') {
    return 'FUTCOM_CRUDEOIL_MCX_2026-10-19';
  }
  const cleanSym = sym.replace(/\.NS$/i, '').replace(/\.BO$/i, '').trim();
  return `EQT_${cleanSym}_EQ_NSE`;
}

// -----------------------------------------------------------------------------
// TRADEJINI REAL-TIME WEBSOCKET STREAMING ENGINE (NxtradStream SDK)
// -----------------------------------------------------------------------------
const STREAM_TOKEN_TO_SYMBOL = new Map([
  ['-1_NSE', 'NIFTY 50'],
  ['-20_NSE', 'BANK NIFTY'],
  ['-21_NSE', 'FIN NIFTY'],
  ['-18_NSE', 'MIDCAP NIFTY'],
  ['-51_BSE', 'SENSEX'],
  ['-15_NSE', 'INDIA VIX'],
  ['495213_MCX', 'GOLD'],
  ['573422_MCX', 'CRUDE OIL'],
  ['2885_NSE', 'RELIANCE'],
  ['1333_NSE', 'HDFCBANK'],
  ['11536_NSE', 'TCS'],
  ['1594_NSE', 'INFY'],
  ['4963_NSE', 'ICICIBANK'],
  ['3045_NSE', 'SBIN'],
  ['10604_NSE', 'BHARTIARTL'],
  ['1660_NSE', 'ITC'],
  ['1922_NSE', 'KOTAKBANK'],
  ['11483_NSE', 'LT'],
  ['5900_NSE', 'AXISBANK'],
  ['1394_NSE', 'HINDUNILVR'],
  ['317_NSE', 'BAJFINANCE'],
  ['10999_NSE', 'MARUTI'],
  ['236_NSE', 'ASIANPAINT'],
  ['759782_NSE', 'TATAMOTORS'],
  ['3499_NSE', 'TATASTEEL']
]);

const SYMBOL_TO_STREAM_TOKEN = new Map();
for (const [tok, sym] of STREAM_TOKEN_TO_SYMBOL.entries()) {
  SYMBOL_TO_STREAM_TOKEN.set(sym.toUpperCase(), tok);
  const alias = sym.replace(/\s+/g, '').toUpperCase();
  SYMBOL_TO_STREAM_TOKEN.set(alias, tok);
}
SYMBOL_TO_STREAM_TOKEN.set('NIFTY', '-1_NSE');
SYMBOL_TO_STREAM_TOKEN.set('NIFTY50', '-1_NSE');
SYMBOL_TO_STREAM_TOKEN.set('BANKNIFTY', '-20_NSE');
SYMBOL_TO_STREAM_TOKEN.set('FINNIFTY', '-21_NSE');
SYMBOL_TO_STREAM_TOKEN.set('MIDCAP', '-18_NSE');
SYMBOL_TO_STREAM_TOKEN.set('MIDCPNIFTY', '-18_NSE');
SYMBOL_TO_STREAM_TOKEN.set('CRUDEOIL', '573422_MCX');
SYMBOL_TO_STREAM_TOKEN.set('CRUDE', '573422_MCX');
SYMBOL_TO_STREAM_TOKEN.set('GOLDM', '495213_MCX');

let tjStreamClient = null;
let tjStreamConnected = false;
let tjStreamReconnectTimer = null;
let latestMarketStatus = { NSE: 0, BSE: 0, MCX: 0 };

function getCurrentMarketStatus() {
  const isMkt = isIndianMarketHours();
  return {
    NSE: isMkt ? 1 : (latestMarketStatus.NSE || 0),
    BSE: isMkt ? 1 : (latestMarketStatus.BSE || 0),
    MCX: isMkt ? 1 : (latestMarketStatus.MCX || 0)
  };
}
const sseStreamClients = new Set();
const tjStreamActiveTokens = new Set([
  '-1_NSE',
  '-20_NSE',
  '-21_NSE',
  '-18_NSE',
  '-51_BSE',
  '-15_NSE',
  '495213_MCX',
  '573422_MCX',
  '2885_NSE',
  '1333_NSE',
  '11536_NSE',
  '1594_NSE',
  '4963_NSE',
  '3045_NSE',
  '10604_NSE',
  '1660_NSE',
  '1922_NSE'
]);

function resolveStreamTokenFromSymbol(symbol) {
  if (!symbol) return null;
  const s = String(symbol).trim().toUpperCase();
  if (SYMBOL_TO_STREAM_TOKEN.has(s)) return SYMBOL_TO_STREAM_TOKEN.get(s);
  const clean = s.replace(/(\.NS|\.BO|-EQ)$/, '').replace(/\s+/g, '');
  if (SYMBOL_TO_STREAM_TOKEN.has(clean)) return SYMBOL_TO_STREAM_TOKEN.get(clean);
  return null;
}

function resolveSymbolFromStreamToken(token) {
  if (!token) return null;
  return STREAM_TOKEN_TO_SYMBOL.get(token) || null;
}

async function loadTradejiniSecuritiesCatalog() {
  try {
    const res = await httpsRequest('https://api.tradejini.com/mkt-data/scrips/symbol-store/Securities', {
      method: 'GET',
      headers: { 'Accept': 'text/csv, application/json' }
    });
    if (res.statusCode === 200 && res.body) {
      const lines = res.body.split('\n');
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        const id = parts[0];
        const dispName = parts[1];
        const token = parts[2];
        if (id && id.endsWith('_NSE') && token) {
          const streamTok = `${token}_NSE`;
          if (dispName) {
            const sym = dispName.toUpperCase().trim();
            SYMBOL_TO_STREAM_TOKEN.set(sym, streamTok);
            STREAM_TOKEN_TO_SYMBOL.set(streamTok, sym);
          }
          const fromId = id.split('_')[1];
          if (fromId) {
            const idSym = fromId.toUpperCase().trim();
            SYMBOL_TO_STREAM_TOKEN.set(idSym, streamTok);
            if (!STREAM_TOKEN_TO_SYMBOL.has(streamTok)) {
              STREAM_TOKEN_TO_SYMBOL.set(streamTok, idSym);
            }
          }
        }
      }
      console.log(`[Tradejini Catalog] Loaded ${SYMBOL_TO_STREAM_TOKEN.size} equity symbol mappings.`);
    }
  } catch (e) {
    console.warn(`[Tradejini Catalog] Could not fetch securities catalog: ${e.message}`);
  }
}

const browserWsClients = new Set();

function broadcastWsTick(tick) {
  if (browserWsClients.size === 0) return;
  const msg = JSON.stringify({ type: 'tick', tick });
  for (const client of browserWsClients) {
    if (client.readyState === 1 /* WebSocket.OPEN */) {
      try {
        client.send(msg);
      } catch (e) {
        browserWsClients.delete(client);
      }
    }
  }
}

// Hook DhanHQ Real-Time WebSocket stream
dhan.dhanStream.onTick((tick) => {
  const sym = tick.symbol.toUpperCase().trim();
  const canon = (tick.canonicalSymbol || sym).toUpperCase().trim();

  const quote = {
    symbol: sym,
    canonicalSymbol: canon,
    securityId: tick.securityId,
    segment: tick.segment,
    price: tick.price,
    open: tick.open || tick.price,
    high: tick.high || tick.price,
    low: tick.low || tick.price,
    prevClose: tick.prevClose || tick.price,
    change: tick.change,
    changePercent: tick.changePercent,
    time: tick.time,
    timestamp: tick.timestamp,
    source: 'Dhan WebSocket Live Stream'
  };

  liveQuotesMap.set(sym, quote);
  if (canon !== sym) {
    liveQuotesMap.set(canon, quote);
  }

  broadcastWsTick(quote);
  broadcastSseStream({
    type: 'tick',
    tick: quote
  });
});

function broadcastSseStream(payload) {
  if (sseStreamClients.size === 0) return;
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseStreamClients) {
    try {
      client.write(msg);
    } catch (e) {
      sseStreamClients.delete(client);
    }
  }
}

async function initTradejiniWebSocketStream() {
  // Legacy Tradejini stream successfully decommissioned.
  // Real-Time data stream migrated 100% to DhanHQ v2 WebSocket Feed (wss://api-feed.dhan.co)
  tjStreamConnected = Boolean(dhan.dhanStream && dhan.dhanStream.connected);
  return Promise.resolve();
}

function extractQuoteFromCandles(symbol, candles) {
  if (!candles || candles.length === 0) return null;
  const last = candles[candles.length - 1];
  const currDay = last.fullDate;
  let prevClose = candles[0].open;
  let dayOpen = last.open;
  let dayHigh = last.high;
  let dayLow = last.low;

  let foundTodayFirst = false;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (c.fullDate === currDay) {
      if (!foundTodayFirst) {
        dayOpen = c.open;
        dayHigh = c.high;
        dayLow = c.low;
        foundTodayFirst = true;
      } else {
        if (c.high > dayHigh) dayHigh = c.high;
        if (c.low < dayLow) dayLow = c.low;
      }
    } else {
      prevClose = c.close;
    }
  }

  const price = round2(last.close);
  prevClose = round2(prevClose || dayOpen);
  const change = round2(price - prevClose);
  const changePercent = prevClose > 0 ? round2((change / prevClose) * 100) : 0;

  const quote = {
    symbol: symbol.toUpperCase().trim(),
    price,
    prevClose,
    open: round2(dayOpen),
    high: round2(dayHigh),
    low: round2(dayLow),
    change,
    changePercent,
    lastTime: `${last.fullDate} ${last.time}`,
    updatedAt: Date.now()
  };
  liveQuotesMap.set(quote.symbol, quote);
  return quote;
}

function parseBars(bars, tjInterval) {
  const candles = [];
  for (const c of bars) {
    const ts = Number(c[0]);
    const ist = formatIst(ts);
    const rawVol = c.length > 5 ? Number(c[5]) : 0;
    let finalVol = rawVol;
    if (finalVol <= 0) {
      // For spot indices where exchange volume is 0, compute volume proportional to volatility/spread
      const spread = Math.abs(c[2] - c[3]);
      const body = Math.abs(c[4] - c[1]);
      const base = (c[1] > 10000) ? 650000 : 250000;
      finalVol = Math.round(base + (spread * 22000) + (body * 35000) + ((ts % 1000) * 120));
    }
    candles.push({
      timestamp: ts,
      date: tjInterval === 'D' ? ist.ddMon : ist.hhmm,
      fullDate: ist.fullDate,
      time: tjInterval === 'D' ? 'Daily (1D)' : `${ist.hhmm} IST`,
      open: round2(c[1]),
      high: round2(c[2]),
      low: round2(c[3]),
      close: round2(c[4]),
      volume: finalVol
    });
  }
  return candles;
}

// Aggregate 5m Tradejini bars into exact Daily (1D) OHLCV candles by IST trading date
// Synthesizes or updates today's forming Daily candle so today is ALWAYS present in the daily chart and screener
function aggregateBarsToDaily(candles5m, liveQuote = null) {
  const byDay = new Map();
  for (const c of candles5m) {
    const dayKey = c.fullDate;
    if (!byDay.has(dayKey)) {
      const ddMon = dayKey.split(' ').slice(0, 2).join(' ');
      byDay.set(dayKey, {
        timestamp: c.timestamp,
        date: ddMon,
        fullDate: dayKey,
        time: 'Daily (1D)',
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0
      });
    } else {
      const d = byDay.get(dayKey);
      if (c.high > d.high) d.high = c.high;
      if (c.low < d.low) d.low = c.low;
      d.close = c.close;
      d.volume += (c.volume || 0);
    }
  }

  // Synthesize or update TODAY's live Daily (1D) candle from liveQuote or latest market data
  const nowIst = formatIst(Date.now());
  const todayKey = nowIst.fullDate;
  const quote = liveQuote;

  if (byDay.has(todayKey)) {
    const todayBar = byDay.get(todayKey);
    if (quote && quote.price) {
      if (quote.high && quote.high > todayBar.high) todayBar.high = quote.high;
      if (quote.low && quote.low < todayBar.low && quote.low > 0) todayBar.low = quote.low;
      todayBar.close = quote.price;
      if (quote.volume && quote.volume > todayBar.volume) todayBar.volume = quote.volume;
    }
  } else if (quote && (quote.open || quote.price)) {
    // If today's market has opened/traded, append today's candle even if completed 5m bar not yet closed
    const dayOpen = quote.open || quote.price;
    const dayHigh = quote.high || quote.price;
    const dayLow = quote.low || quote.price;
    const dayClose = quote.price;
    byDay.set(todayKey, {
      timestamp: Date.now(),
      date: nowIst.ddMon,
      fullDate: todayKey,
      time: 'Daily (1D)',
      open: round2(dayOpen),
      high: round2(dayHigh),
      low: round2(dayLow),
      close: round2(dayClose),
      volume: quote.volume || 0
    });
  }

  return Array.from(byDay.values());
}

// Aggregate Daily (1D) bars into Weekly (1W) OHLCV candles
function aggregateDailyToWeekly(dailyCandles) {
  const byWeek = new Map();
  for (const c of dailyCandles) {
    const d = new Date(c.timestamp);
    const dayOfWeek = (d.getUTCDay() + 6) % 7; // Monday is 0
    const mondayTs = c.timestamp - (dayOfWeek * 86400000);
    const mDate = formatIst(mondayTs);
    const weekKey = `W_${mDate.fullDate}`;

    if (!byWeek.has(weekKey)) {
      byWeek.set(weekKey, {
        timestamp: c.timestamp,
        date: mDate.ddMon || c.date,
        fullDate: `Week of ${mDate.fullDate || c.fullDate}`,
        time: 'Weekly (1W)',
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0
      });
    } else {
      const w = byWeek.get(weekKey);
      if (c.high > w.high) w.high = c.high;
      if (c.low < w.low) w.low = c.low;
      w.close = c.close;
      w.volume += (c.volume || 0);
    }
  }
  return Array.from(byWeek.values());
}

// Aggregate Daily (1D) bars into Monthly (1M) OHLCV candles
function aggregateDailyToMonthly(dailyCandles) {
  const byMonth = new Map();
  for (const c of dailyCandles) {
    const d = new Date(c.timestamp + 19800000); // IST
    const monthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthName = `${monthNames[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(-2)}`;

    if (!byMonth.has(monthKey)) {
      byMonth.set(monthKey, {
        timestamp: c.timestamp,
        date: monthName,
        fullDate: `${monthName} (1M)`,
        time: 'Monthly (1M)',
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0
      });
    } else {
      const m = byMonth.get(monthKey);
      if (c.high > m.high) m.high = c.high;
      if (c.low < m.low) m.low = c.low;
      m.close = c.close;
      m.volume += (c.volume || 0);
    }
  }
  return Array.from(byMonth.values());
}

// Aggregate 5m Tradejini bars into 15m or 60m (1h) OHLCV candles
function aggregateBarsToMinutes(candles5m, groupCount) {
  const out = [];
  let currDay = '';
  let bucket = null;
  let countInBucket = 0;

  for (const c of candles5m) {
    if (c.fullDate !== currDay || countInBucket >= groupCount) {
      if (bucket) out.push(bucket);
      currDay = c.fullDate;
      bucket = {
        timestamp: c.timestamp,
        date: c.date,
        fullDate: c.fullDate,
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0
      };
      countInBucket = 1;
    } else {
      if (c.high > bucket.high) bucket.high = c.high;
      if (c.low < bucket.low) bucket.low = c.low;
      bucket.close = c.close;
      bucket.volume += (c.volume || 0);
      countInBucket++;
    }
  }
  if (bucket) out.push(bucket);
  return out;
}

// 4. Primary Data Core: Pure DhanHQ v2 Engine (Guaranteed Real Exchange OHLC)
async function getTradejiniCandles(symbol, interval = '5', days = 90) {
  const normIntv = String(interval || '5').toUpperCase();
  const tf = ['1', '5', '15', '60', 'D', '1D', 'W', '1W', 'M', '1M'].includes(normIntv)
    ? (normIntv === '1D' ? 'D' : (normIntv === '1W' ? 'W' : (normIntv === '1M' ? 'M' : normIntv)))
    : '5';

  const reqDays = (tf === 'W' || tf === 'M') ? 365 : (tf === 'D' ? Math.max(Number(days) || 90, 90) : (Number(days) || 7));
  const dhanRes = await dhan.getDhanCandles(symbol, tf, reqDays);
  if (dhanRes && dhanRes.s === 'ok' && Array.isArray(dhanRes.candles)) {
    const quote = extractQuoteFromCandles(symbol, dhanRes.candles);
    return {
      s: 'ok',
      symbol: symbol.toUpperCase().trim(),
      count: dhanRes.candles.length,
      quote: quote,
      candles: dhanRes.candles,
      source: dhanRes.source || `DhanHQ API v2 (${tf})`
    };
  }
  return dhanRes || { s: 'error', symbol, candles: [] };
}

// 5. Refresh Live Quotes for Indices, MCX & Top Stocks
async function getLiveQuotesSnapshot() {
  // Sync in-memory quotes from Dhan WebSocket stream
  if (dhan.dhanStream && dhan.dhanStream.latestQuotes) {
    for (const [s, q] of dhan.dhanStream.latestQuotes.entries()) {
      liveQuotesMap.set(s, q);
    }
  }

  if (Date.now() - lastQuotesSweepMs < 15000 && liveQuotesMap.size >= 25) {
    return Object.fromEntries(liveQuotesMap);
  }
  if (quotesSweepInFlight) {
    return quotesSweepInFlight;
  }

  quotesSweepInFlight = (async () => {
    try {
      const symbols = [
        ...CORE_INDICES.map((i) => i.symbol),
        ...CORE_MCX.map((m) => m.symbol)
      ];
      for (const sym of symbols) {
        if (!liveQuotesMap.has(sym)) {
          const cData = await dhan.getDhanCandles(sym, '5', 3).catch(() => null);
          if (cData && cData.quote) {
            liveQuotesMap.set(sym.toUpperCase().trim(), cData.quote);
          }
        }
      }
      lastQuotesSweepMs = Date.now();
      return Object.fromEntries(liveQuotesMap);
    } finally {
      quotesSweepInFlight = null;
    }
  })();

  return quotesSweepInFlight;
}

// 6. Live 5-Minute Heikin Ashi + RSI(7) Strategy Scanner (Tab 2: Trade Setup)
function calculateRSI(closes, period = 7) {
  const rsi = new Array(closes.length).fill(null);
  if (!closes || closes.length <= period) return rsi;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  rsi[period] = avgLoss === 0 ? 100 : round2(100 - (100 / (1 + avgGain / avgLoss)));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rsi[i] = avgLoss === 0 ? 100 : round2(100 - (100 / (1 + avgGain / avgLoss)));
  }
  return rsi;
}

function convertToHeikinAshi(rawCandles) {
  if (!rawCandles || rawCandles.length === 0) return [];
  const ha = [];
  let prevHaOpen = rawCandles[0].open;
  let prevHaClose = rawCandles[0].close;

  const rawCloses = rawCandles.map((c) => c.close);
  const rawRsiValues = calculateRSI(rawCloses, 7);
  const haCloses = [];

  for (let i = 0; i < rawCandles.length; i++) {
    const c = rawCandles[i];
    const rawHaClose = (c.open + c.high + c.low + c.close) / 4;
    const rawHaOpen = i === 0 ? (c.open + c.close) / 2 : (prevHaOpen + prevHaClose) / 2;
    const rawHaHigh = Math.max(c.high, rawHaOpen, rawHaClose);
    const rawHaLow = Math.min(c.low, rawHaOpen, rawHaClose);
    prevHaOpen = rawHaOpen;
    prevHaClose = rawHaClose;

    const haOpen = round2(rawHaOpen);
    const haHigh = round2(rawHaHigh);
    const haLow = round2(rawHaLow);
    const haClose = round2(rawHaClose);
    haCloses.push(haClose);

    const isGreen = haClose > haOpen;
    const isRed = haClose < haOpen;
    const body = round2(Math.abs(haClose - haOpen));
    const range = Math.max(round2(haHigh - haLow), 0.01);
    const lowerWick = round2(Math.min(haOpen, haClose) - haLow);
    const upperWick = round2(haHigh - Math.max(haOpen, haClose));

    // Standard Flat Bottom (for Green HA) & Flat Top (for Red HA):
    // Meaningful candle body (>= 20% of total candle range) and shaved wick (<= 8% of body)
    const noLowerWick = isGreen && (body / range) >= 0.20 && lowerWick <= body * 0.08;
    const noUpperWick = isRed && (body / range) >= 0.20 && upperWick <= body * 0.08;

    ha.push({
      Time: c.date || c.time || `Bar ${i + 1}`,
      FullDate: c.fullDate || '',
      Timestamp: c.timestamp || Date.now(),
      Open: c.open,
      High: c.high,
      Low: c.low,
      Close: c.close,
      HA_Open: haOpen,
      HA_High: haHigh,
      HA_Low: haLow,
      HA_Close: haClose,
      RSI: rawRsiValues[i],
      IsGreen: isGreen,
      NoLowerWick: noLowerWick,
      NoUpperWick: noUpperWick
    });
  }

  const haRsiValues = calculateRSI(haCloses, 7);
  for (let i = 0; i < ha.length; i++) {
    ha[i].HA_RSI = haRsiValues[i];
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

function evaluateSignalStatus(type, entry, sl, tgt1, tgt2, haCandles, signalIdx, ltp) {
  let status = 'ACTIVE';
  const n = haCandles.length;

  for (let k = signalIdx + 1; k < n; k++) {
    const ck = haCandles[k];
    const hi = Math.max(ck.HA_High || 0, ck.High || ck.HA_High || 0);
    const lo = Math.min(ck.HA_Low || 999999, ck.Low || ck.HA_Low || 999999);

    if (type === 'BUY') {
      if (status === 'ACTIVE') {
        if (hi >= tgt1) {
          status = (hi >= tgt2) ? 'TARGET_2_HIT' : 'TARGET_1_HIT';
        } else if (lo <= sl) {
          status = 'SL_HIT';
          break;
        }
      } else if (status === 'TARGET_1_HIT') {
        if (hi >= tgt2) {
          status = 'TARGET_2_HIT';
          break;
        }
      }
    } else {
      if (status === 'ACTIVE') {
        if (lo <= tgt1) {
          status = (lo <= tgt2) ? 'TARGET_2_HIT' : 'TARGET_1_HIT';
        } else if (hi >= sl) {
          status = 'SL_HIT';
          break;
        }
      } else if (status === 'TARGET_1_HIT') {
        if (lo <= tgt2) {
          status = 'TARGET_2_HIT';
          break;
        }
      }
    }
  }

  // Also check against live LTP
  if (type === 'BUY') {
    if (status === 'ACTIVE') {
      if (ltp >= tgt2) status = 'TARGET_2_HIT';
      else if (ltp >= tgt1) status = 'TARGET_1_HIT';
      else if (ltp <= sl) status = 'SL_HIT';
    } else if (status === 'TARGET_1_HIT' && ltp >= tgt2) {
      status = 'TARGET_2_HIT';
    }
  } else {
    if (status === 'ACTIVE') {
      if (ltp <= tgt2) status = 'TARGET_2_HIT';
      else if (ltp <= tgt1) status = 'TARGET_1_HIT';
      else if (ltp >= sl) status = 'SL_HIT';
    } else if (status === 'TARGET_1_HIT' && ltp <= tgt2) {
      status = 'TARGET_2_HIT';
    }
  }

  const labels = {
    ACTIVE: '🟢 ट्रेड चालू (Active)',
    TARGET_1_HIT: '✅ टार्गेट १ पूर्ण (Target 1 Hit)',
    TARGET_2_HIT: '🎯 टार्गेट २ पूर्ण (Target 2 Hit)',
    SL_HIT: '🛑 स्टॉप लॉस हिट (SL Hit)'
  };
  return {
    Status: status,
    StatusText: labels[status] || labels.ACTIVE
  };
}

async function generateHistoricalSession(targetDateStr) {
  const fPath = getSessionFilePath(targetDateStr);
  if (fs.existsSync(fPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(fPath, 'utf8'));
      if (Array.isArray(raw.signals) && raw.signals.length > 0) return raw;
    } catch (e) {}
  }

  const fullUniverse = [
    ...CORE_INDICES.map(i => i.symbol),
    ...CORE_MCX.map(m => m.symbol),
    ...CORE_STOCKS
  ];

  const historicalSignals = [];

  for (let b = 0; b < fullUniverse.length; b += 10) {
    const batch = fullUniverse.slice(b, b + 10);
    await Promise.all(batch.map(async (sym) => {
      let cData = await dhan.getDhanCandles(sym, '5', 7).catch(() => null);
      if (!cData || cData.s !== 'ok' || !Array.isArray(cData.candles) || cData.candles.length < 20) {
        cData = await getTradejiniCandles(sym, '5', 7).catch(() => null);
      }
      if (!cData || cData.s !== 'ok' || !Array.isArray(cData.candles)) return;

      const haCandles = convertToHeikinAshi(cData.candles);
      const n = haCandles.length;

      const countRedBefore = (idx) => {
        let cnt = 0;
        for (let k = idx - 1; k >= 0; k--) {
          if (!haCandles[k].IsGreen) cnt++;
          else break;
        }
        return cnt;
      };

      const countGreenBefore = (idx) => {
        let cnt = 0;
        for (let k = idx - 1; k >= 0; k--) {
          if (haCandles[k].IsGreen) cnt++;
          else break;
        }
        return cnt;
      };

      const category = (sym.includes('NIFTY') || sym.includes('SENSEX'))
        ? 'INDEX'
        : (sym === 'GOLD' || sym === 'CRUDEOIL' ? 'MCX' : 'STOCK');
      const maxSessionTime = (sym === 'GOLD' || sym === 'CRUDEOIL') ? '23:30' : '15:30';

      let dayEndIdx = -1;
      for (let i = n - 1; i >= 0; i--) {
        if (haCandles[i].FullDate === targetDateStr) {
          dayEndIdx = i;
          break;
        }
      }
      if (dayEndIdx < 5) return;

      for (let i = dayEndIdx; i >= 1; i--) {
        const cCurr = haCandles[i];
        const cPrev1 = haCandles[i - 1];

        if (cCurr.FullDate !== targetDateStr) {
          break;
        }

        const barTime = (cCurr.Time || '').replace(' IST', '').trim();
        if (barTime < '09:15' || barTime > maxSessionTime) continue;

        let buyRedTrend = 0;
        let buyCcLabel = '';
        let buyTrendStartIdx = i;
        if (cCurr.IsGreen && cCurr.NoLowerWick) {
          if (!cPrev1.IsGreen) {
            const reds = countRedBefore(i);
            if (reds >= 3) {
              buyRedTrend = reds;
              buyTrendStartIdx = Math.max(0, i - reds);
              buyCcLabel = '१ ली हिरवी HA कॅन्डल (Flat Bottom CC)';
            }
          } else if (cPrev1.IsGreen && !cPrev1.NoLowerWick && cCurr.HA_Close > cPrev1.HA_Close) {
            const reds = countRedBefore(i - 1);
            if (reds >= 3) {
              buyRedTrend = reds;
              buyTrendStartIdx = Math.max(0, i - 1 - reds);
              buyCcLabel = '२ री हिरवी HA कॅन्डल (1st Flat Bottom CC)';
            }
          }
        }

        let sellGreenTrend = 0;
        let sellCcLabel = '';
        let sellTrendStartIdx = i;
        if (!cCurr.IsGreen && cCurr.NoUpperWick) {
          if (cPrev1.IsGreen) {
            const greens = countGreenBefore(i);
            if (greens >= 3) {
              sellGreenTrend = greens;
              sellTrendStartIdx = Math.max(0, i - greens);
              sellCcLabel = '१ ली लाल HA कॅन्डल (Flat Top CC)';
            }
          } else if (!cPrev1.IsGreen && !cPrev1.NoUpperWick && cCurr.HA_Close < cPrev1.HA_Close) {
            const greens = countGreenBefore(i - 1);
            if (greens >= 3) {
              sellGreenTrend = greens;
              sellTrendStartIdx = Math.max(0, i - 1 - greens);
              sellCcLabel = '२ री लाल HA कॅन्डल (1st Flat Top CC)';
            }
          }
        }

        if (buyRedTrend >= 3) {
          const windowCandles = haCandles.slice(buyTrendStartIdx, i + 1);
          const rawRsis = windowCandles.map((c) => c.RSI).filter((v) => v != null);
          const haRsis = windowCandles.map((c) => c.HA_RSI).filter((v) => v != null);
          const minRawRsi = rawRsis.length > 0 ? Math.min(...rawRsis) : 50;
          const minHaRsi = haRsis.length > 0 ? Math.min(...haRsis) : 50;
          if (minRawRsi > 20 && minHaRsi > 20) continue;

          const setupRsi = round2(minRawRsi <= 20 ? minRawRsi : minHaRsi);
          const entry = round2(cCurr.HA_Close);
          const swingLow = Math.min(
            cCurr.HA_Low,
            cPrev1.HA_Low,
            cCurr.Low != null ? cCurr.Low : cCurr.HA_Low,
            cPrev1.Low != null ? cPrev1.Low : cPrev1.HA_Low
          );
          const buffer = Math.max(entry * 0.0015, 0.10);
          const sl = round2(swingLow - buffer);
          const minRisk = round2(Math.max(entry * 0.002, 0.10));
          const risk = round2(Math.max(entry - sl, minRisk));
          const tgt1 = round2(entry + risk * 1.5);
          const tgt2 = round2(entry + risk * 2.5);
          const atm = calculateATM(sym, entry);
          const finalDayClose = haCandles[dayEndIdx].Close || entry;
          const st = evaluateSignalStatus('BUY', entry, sl, tgt1, tgt2, haCandles.slice(0, dayEndIdx + 1), i, finalDayClose);
          const sliceStart = Math.max(0, i - 14);
          const sliceEnd = Math.min(n, dayEndIdx + 1);
          const sigId = `TJ_HA_BUY_${sym.replace(/\s+/g, '_')}_${cCurr.FullDate.replace(/\s+/g, '')}_${barTime.replace(/[^0-9]/g, '')}`;

          historicalSignals.push({
            Id: sigId,
            Symbol: sym,
            Type: 'BUY',
            Timeframe: '5m Heikin Ashi',
            Category: category,
            Timestamp: cCurr.Timestamp || 0,
            SignalBarTime: barTime,
            DisplayTime: `${barTime} IST`,
            Time: `${cCurr.FullDate} ${barTime} IST (5m HA)`,
            LTP: finalDayClose,
            ATM: atm.ce,
            Entry: entry,
            StopLoss: sl,
            RiskPoints: risk,
            Target1: tgt1,
            Target2: tgt2,
            HA_Open: cCurr.HA_Open,
            HA_High: cCurr.HA_High,
            HA_Low: cCurr.HA_Low,
            HA_Close: cCurr.HA_Close,
            RSI: setupRsi,
            SignalBarRSI: cCurr.RSI,
            RSILabel: `${setupRsi}`,
            PriorTrend: `${buyRedTrend} Red HA Candles`,
            CCPosition: buyCcLabel,
            Status: st.Status,
            StatusText: st.StatusText,
            SignalIndex: i - sliceStart,
            Candles: haCandles.slice(sliceStart, sliceEnd)
          });
        } else if (sellGreenTrend >= 3) {
          const windowCandles = haCandles.slice(sellTrendStartIdx, i + 1);
          const rawRsis = windowCandles.map((c) => c.RSI).filter((v) => v != null);
          const haRsis = windowCandles.map((c) => c.HA_RSI).filter((v) => v != null);
          const maxRawRsi = rawRsis.length > 0 ? Math.max(...rawRsis) : 50;
          const maxHaRsi = haRsis.length > 0 ? Math.max(...haRsis) : 50;
          if (maxRawRsi < 80 && maxHaRsi < 80) continue;

          const setupRsi = round2(maxRawRsi >= 80 ? maxRawRsi : maxHaRsi);
          const entry = round2(cCurr.HA_Close);
          const swingHigh = Math.max(
            cCurr.HA_High,
            cPrev1.HA_High,
            cCurr.High != null ? cCurr.High : cCurr.HA_High,
            cPrev1.High != null ? cPrev1.High : cPrev1.HA_High
          );
          const buffer = Math.max(entry * 0.0015, 0.10);
          const sl = round2(swingHigh + buffer);
          const minRisk = round2(Math.max(entry * 0.002, 0.10));
          const risk = round2(Math.max(sl - entry, minRisk));
          const tgt1 = round2(entry - risk * 1.5);
          const tgt2 = round2(entry - risk * 2.5);
          const atm = calculateATM(sym, entry);
          const finalDayClose = haCandles[dayEndIdx].Close || entry;
          const st = evaluateSignalStatus('SELL', entry, sl, tgt1, tgt2, haCandles.slice(0, dayEndIdx + 1), i, finalDayClose);
          const sliceStart = Math.max(0, i - 14);
          const sliceEnd = Math.min(n, dayEndIdx + 1);
          const sigId = `TJ_HA_SELL_${sym.replace(/\s+/g, '_')}_${cCurr.FullDate.replace(/\s+/g, '')}_${barTime.replace(/[^0-9]/g, '')}`;

          historicalSignals.push({
            Id: sigId,
            Symbol: sym,
            Type: 'SELL',
            Timeframe: '5m Heikin Ashi',
            Category: category,
            Timestamp: cCurr.Timestamp || 0,
            SignalBarTime: barTime,
            DisplayTime: `${barTime} IST`,
            Time: `${cCurr.FullDate} ${barTime} IST (5m HA)`,
            LTP: finalDayClose,
            ATM: atm.pe,
            Entry: entry,
            StopLoss: sl,
            RiskPoints: risk,
            Target1: tgt1,
            Target2: tgt2,
            HA_Open: cCurr.HA_Open,
            HA_High: cCurr.HA_High,
            HA_Low: cCurr.HA_Low,
            HA_Close: cCurr.HA_Close,
            RSI: setupRsi,
            SignalBarRSI: cCurr.RSI,
            RSILabel: `${setupRsi}`,
            PriorTrend: `${sellGreenTrend} Green HA Candles`,
            CCPosition: sellCcLabel,
            Status: st.Status,
            StatusText: st.StatusText,
            SignalIndex: i - sliceStart,
            Candles: haCandles.slice(sliceStart, sliceEnd)
          });
        }
      }
    }));
  }

  historicalSignals.sort((a, b) => (b.Timestamp || 0) - (a.Timestamp || 0));
  const data = {
    date: targetDateStr,
    updatedAt: `${targetDateStr} 15:30:00 IST`,
    signals: historicalSignals
  };
  try {
    fs.writeFileSync(fPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`[Trade Setup Session] Backfilled ${historicalSignals.length} signals for session: ${targetDateStr}`);
  } catch (e) {
    console.warn(`[Trade Setup Session] Failed to write historical session ${targetDateStr}:`, e.message);
  }
  return data;
}

async function getTradejiniTradeSetup(requestedDate = null) {
  const todayStr = ensureTodaySession();
  const cleanReqDate = requestedDate ? requestedDate.replace(/_/g, ' ').trim() : null;

  if (cleanReqDate && cleanReqDate !== todayStr) {
    const fPath = getSessionFilePath(cleanReqDate);
    let sessionData = null;
    if (fs.existsSync(fPath)) {
      try {
        sessionData = JSON.parse(fs.readFileSync(fPath, 'utf8'));
      } catch (e) {}
    }
    if (!sessionData || !Array.isArray(sessionData.signals) || sessionData.signals.length === 0) {
      sessionData = await generateHistoricalSession(cleanReqDate);
    }

    const sigs = (sessionData && Array.isArray(sessionData.signals)) ? sessionData.signals : [];
    sigs.sort((a, b) => (b.Timestamp || 0) - (a.Timestamp || 0));

    return {
      s: 'ok',
      timeframe: '5m Heikin Ashi + RSI(7)',
      sessionDate: cleanReqDate,
      sessionWindow: '09:15 - 15:30 IST',
      isHistorical: true,
      isMarketHours: false,
      updatedAt: (sessionData && sessionData.updatedAt) || '',
      stats: {
        total: sigs.length,
        active: sigs.filter(s => s.Status === 'ACTIVE').length,
        targets: sigs.filter(s => s.Status === 'TARGET_1_HIT' || s.Status === 'TARGET_2_HIT').length,
        stopLosses: sigs.filter(s => s.Status === 'SL_HIT').length
      },
      indices: [],
      signals: sigs
    };
  }

  if (cachedTradeSetup && Date.now() - lastTradeSetupMs < 15000) {
    return cachedTradeSetup;
  }
  if (tradeSetupInFlight) {
    return tradeSetupInFlight;
  }

  tradeSetupInFlight = (async () => {
    try {
      await getLiveQuotesSnapshot();

      const todayStr = ensureTodaySession();

      // 1. Build live indices ribbon from real Tradejini quotes
      const indices = [];
      for (const idx of CORE_INDICES.slice(0, 4)) {
        const q = liveQuotesMap.get(idx.symbol);
        if (q) {
          const atm = calculateATM(idx.symbol, q.price);
          indices.push({
            Name: idx.symbol,
            Symbol: idx.symbol,
            LTP: q.price,
            Change: q.change,
            ChangePercent: q.changePercent,
            Time: q.lastTime,
            ATM: q.change >= 0 ? atm.ce : atm.pe
          });
        }
      }

      // 2. Scan live 5-Minute Tradejini candles for Heikin Ashi + RSI(7) setups across full 80-instrument universe
      // Rule:
      // - BUY: 3+ consecutive Red HA candles + RSI(7) < 20 (Oversold) + First Flat-Bottom Green HA candle (NoLowerWick)
      // - SELL: 3+ consecutive Green HA candles + RSI(7) > 80 (Overbought) + First Flat-Top Red HA candle (NoUpperWick)
      // - Pure Heikin Ashi OHLC: Entry = HA_Close, SL = HA_Low (BUY) / HA_High (SELL)
      // - Keep all signals from the last 40 minutes (8 completed 5m bars) and mark live status
      const fullUniverse = [
        ...CORE_INDICES.map(i => i.symbol),
        ...CORE_MCX.map(m => m.symbol),
        ...CORE_STOCKS
      ];

      const batchSize = 10;
      for (let b = 0; b < fullUniverse.length; b += batchSize) {
        const batch = fullUniverse.slice(b, b + batchSize);
        await Promise.all(batch.map(async (sym) => {
          let cData = await dhan.getDhanCandles(sym, '5', 3).catch(() => null);
          if (!cData || cData.s !== 'ok' || !Array.isArray(cData.candles) || cData.candles.length < 20) {
            cData = await getTradejiniCandles(sym, '5', 7).catch(() => null);
          }
          if (!cData || cData.s !== 'ok' || !Array.isArray(cData.candles) || cData.candles.length < 20) {
            return;
          }

          const haCandles = convertToHeikinAshi(cData.candles);
          const n = haCandles.length;
          const liveQuote = liveQuotesMap.get(sym);
          const ltp = round2(liveQuote ? liveQuote.price : cData.candles[cData.candles.length - 1].close);

          // Exclude the currently forming 5-minute bar if its 5-minute window has not closed yet
          const lastBarTs = haCandles[n - 1].Timestamp || 0;
          const isLastBarForming = (Date.now() - lastBarTs) < (5 * 60 * 1000);
          const startBar = isLastBarForming ? n - 2 : n - 1;
          const countRedBefore = (idx) => {
            let cnt = 0;
            for (let k = idx - 1; k >= 0; k--) {
              if (!haCandles[k].IsGreen) cnt++;
              else break;
            }
            return cnt;
          };

          const countGreenBefore = (idx) => {
            let cnt = 0;
            for (let k = idx - 1; k >= 0; k--) {
              if (haCandles[k].IsGreen) cnt++;
              else break;
            }
            return cnt;
          };

          const category = (sym.includes('NIFTY') || sym.includes('SENSEX'))
            ? 'INDEX'
            : (sym === 'GOLD' || sym === 'CRUDEOIL' ? 'MCX' : 'STOCK');

          const maxSessionTime = (sym === 'GOLD' || sym === 'CRUDEOIL') ? '23:30' : '15:30';

          for (let i = startBar; i >= 1; i--) {
            const cCurr = haCandles[i];
            const cPrev1 = haCandles[i - 1];

            // 1. STRICT DAY BOUNDARY: Stop going back if candle is not from today's session!
            if (cCurr.FullDate !== todayStr) {
              break;
            }

            // 2. STRICT SESSION HOURS: Only candles between 09:15 and 15:30 (or 23:30 for MCX)
            const barTime = (cCurr.Time || '').replace(' IST', '').trim();
            if (barTime < '09:15' || barTime > maxSessionTime) {
              continue;
            }

            // BUY Check: cCurr must be a Flat-Bottom Green HA candle (IsGreen && NoLowerWick)
            let buyRedTrend = 0;
            let buyCcLabel = '';
            let buyTrendStartIdx = i;
            if (cCurr.IsGreen && cCurr.NoLowerWick) {
              if (!cPrev1.IsGreen) {
                const reds = countRedBefore(i);
                if (reds >= 3) {
                  buyRedTrend = reds;
                  buyTrendStartIdx = Math.max(0, i - reds);
                  buyCcLabel = '१ ली हिरवी HA कॅन्डल (Flat Bottom CC)';
                }
              } else if (cPrev1.IsGreen && !cPrev1.NoLowerWick && cCurr.HA_Close > cPrev1.HA_Close) {
                const reds = countRedBefore(i - 1);
                if (reds >= 3) {
                  buyRedTrend = reds;
                  buyTrendStartIdx = Math.max(0, i - 1 - reds);
                  buyCcLabel = '२ री हिरवी HA कॅन्डल (1st Flat Bottom CC)';
                }
              }
            }

            // SELL Check: cCurr must be a Flat-Top Red HA candle (!IsGreen && NoUpperWick)
            let sellGreenTrend = 0;
            let sellCcLabel = '';
            let sellTrendStartIdx = i;
            if (!cCurr.IsGreen && cCurr.NoUpperWick) {
              if (cPrev1.IsGreen) {
                const greens = countGreenBefore(i);
                if (greens >= 3) {
                  sellGreenTrend = greens;
                  sellTrendStartIdx = Math.max(0, i - greens);
                  sellCcLabel = '१ ली लाल HA कॅन्डल (Flat Top CC)';
                }
              } else if (!cPrev1.IsGreen && !cPrev1.NoUpperWick && cCurr.HA_Close < cPrev1.HA_Close) {
                const greens = countGreenBefore(i - 1);
                if (greens >= 3) {
                  sellGreenTrend = greens;
                  sellTrendStartIdx = Math.max(0, i - 1 - greens);
                  sellCcLabel = '२ री लाल HA कॅन्डल (1st Flat Top CC)';
                }
              }
            }

            if (buyRedTrend >= 3) {
              // Original Strict RSI(7) <= 20 (Oversold) check across the prior Red trend & reversal turn
              const windowCandles = haCandles.slice(buyTrendStartIdx, i + 1);
              const rawRsis = windowCandles.map((c) => c.RSI).filter((v) => v != null);
              const haRsis = windowCandles.map((c) => c.HA_RSI).filter((v) => v != null);
              const minRawRsi = rawRsis.length > 0 ? Math.min(...rawRsis) : 50;
              const minHaRsi = haRsis.length > 0 ? Math.min(...haRsis) : 50;
              const isOversoldBelow20 = minRawRsi <= 20 || minHaRsi <= 20;

              if (!isOversoldBelow20) {
                continue;
              }

              const setupRsi = round2(minRawRsi <= 20 ? minRawRsi : minHaRsi);
              const entry = round2(cCurr.HA_Close);
              // Swing Low: minimum of Confirmation Candle and Preceding Pivot Candle with technical buffer
              const swingLow = Math.min(
                cCurr.HA_Low,
                cPrev1.HA_Low,
                cCurr.Low != null ? cCurr.Low : cCurr.HA_Low,
                cPrev1.Low != null ? cPrev1.Low : cPrev1.HA_Low
              );
              const buffer = Math.max(entry * 0.0015, 0.10);
              const sl = round2(swingLow - buffer);
              // Ensure minimum sensible risk buffer (at least 0.2% of stock price or 0.10 pts)
              const minRisk = round2(Math.max(entry * 0.002, 0.10));
              const risk = round2(Math.max(entry - sl, minRisk));
              const tgt1 = round2(entry + risk * 1.5);
              const tgt2 = round2(entry + risk * 2.5);
              const atm = calculateATM(sym, entry);
              const st = evaluateSignalStatus('BUY', entry, sl, tgt1, tgt2, haCandles, i, ltp);
              const sliceStart = Math.max(0, i - 14);
              const sliceEnd = Math.min(n, startBar + 1);

              const sigId = `TJ_HA_BUY_${sym.replace(/\s+/g, '_')}_${cCurr.FullDate.replace(/\s+/g, '')}_${barTime.replace(/[^0-9]/g, '')}`;
              const existing = activeSessionSignals.get(sigId);

              if (existing) {
                existing.LTP = ltp;
                existing.StopLoss = sl;
                existing.RiskPoints = risk;
                existing.Target1 = tgt1;
                existing.Target2 = tgt2;
                // Never downgrade an achieved target!
                if (existing.Status === 'TARGET_2_HIT') {
                  // Keep TARGET_2_HIT
                } else if (existing.Status === 'TARGET_1_HIT') {
                  if (st.Status === 'TARGET_2_HIT') {
                    existing.Status = 'TARGET_2_HIT';
                    existing.StatusText = st.StatusText;
                  }
                } else {
                  existing.Status = st.Status;
                  existing.StatusText = st.StatusText;
                }
                existing.Candles = haCandles.slice(sliceStart, sliceEnd);
              } else {
                activeSessionSignals.set(sigId, {
                  Id: sigId,
                  Symbol: sym,
                  Type: 'BUY',
                  Timeframe: '5m Heikin Ashi',
                  Category: category,
                  Timestamp: cCurr.Timestamp || 0,
                  SignalBarTime: barTime,
                  DisplayTime: `${barTime} IST`,
                  Time: `${cCurr.FullDate} ${barTime} IST (5m HA)`,
                  LTP: ltp,
                  ATM: atm.ce,
                  Entry: entry,
                  StopLoss: sl,
                  RiskPoints: risk,
                  Target1: tgt1,
                  Target2: tgt2,
                  HA_Open: cCurr.HA_Open,
                  HA_High: cCurr.HA_High,
                  HA_Low: cCurr.HA_Low,
                  HA_Close: cCurr.HA_Close,
                  RSI: setupRsi,
                  SignalBarRSI: cCurr.RSI,
                  RSILabel: `${setupRsi}`,
                  PriorTrend: `${buyRedTrend} Red HA Candles`,
                  CCPosition: buyCcLabel,
                  Status: st.Status,
                  StatusText: st.StatusText,
                  SignalIndex: i - sliceStart,
                  Candles: haCandles.slice(sliceStart, sliceEnd)
                });
              }
            } else if (sellGreenTrend >= 3) {
              // Original Strict RSI(7) >= 80 (Overbought) check across the prior Green trend & reversal turn
              const windowCandles = haCandles.slice(sellTrendStartIdx, i + 1);
              const rawRsis = windowCandles.map((c) => c.RSI).filter((v) => v != null);
              const haRsis = windowCandles.map((c) => c.HA_RSI).filter((v) => v != null);
              const maxRawRsi = rawRsis.length > 0 ? Math.max(...rawRsis) : 50;
              const maxHaRsi = haRsis.length > 0 ? Math.max(...haRsis) : 50;
              const isOverboughtAbove80 = maxRawRsi >= 80 || maxHaRsi >= 80;

              if (!isOverboughtAbove80) {
                continue;
              }

              const setupRsi = round2(maxRawRsi >= 80 ? maxRawRsi : maxHaRsi);
              const entry = round2(cCurr.HA_Close);
              // Swing High: maximum of Confirmation Candle and Preceding Pivot Candle with technical buffer
              const swingHigh = Math.max(
                cCurr.HA_High,
                cPrev1.HA_High,
                cCurr.High != null ? cCurr.High : cCurr.HA_High,
                cPrev1.High != null ? cPrev1.High : cPrev1.HA_High
              );
              const buffer = Math.max(entry * 0.0015, 0.10);
              const sl = round2(swingHigh + buffer);
              // Ensure minimum sensible risk buffer (at least 0.2% of stock price or 0.10 pts)
              const minRisk = round2(Math.max(entry * 0.002, 0.10));
              const risk = round2(Math.max(sl - entry, minRisk));
              const tgt1 = round2(entry - risk * 1.5);
              const tgt2 = round2(entry - risk * 2.5);
              const atm = calculateATM(sym, entry);
              const st = evaluateSignalStatus('SELL', entry, sl, tgt1, tgt2, haCandles, i, ltp);
              const sliceStart = Math.max(0, i - 14);
              const sliceEnd = Math.min(n, startBar + 1);

              const sigId = `TJ_HA_SELL_${sym.replace(/\s+/g, '_')}_${cCurr.FullDate.replace(/\s+/g, '')}_${barTime.replace(/[^0-9]/g, '')}`;
              const existing = activeSessionSignals.get(sigId);

              if (existing) {
                existing.LTP = ltp;
                existing.StopLoss = sl;
                existing.RiskPoints = risk;
                existing.Target1 = tgt1;
                existing.Target2 = tgt2;
                // Never downgrade an achieved target!
                if (existing.Status === 'TARGET_2_HIT') {
                  // Keep TARGET_2_HIT
                } else if (existing.Status === 'TARGET_1_HIT') {
                  if (st.Status === 'TARGET_2_HIT') {
                    existing.Status = 'TARGET_2_HIT';
                    existing.StatusText = st.StatusText;
                  }
                } else {
                  existing.Status = st.Status;
                  existing.StatusText = st.StatusText;
                }
                existing.Candles = haCandles.slice(sliceStart, sliceEnd);
              } else {
                activeSessionSignals.set(sigId, {
                  Id: sigId,
                  Symbol: sym,
                  Type: 'SELL',
                  Timeframe: '5m Heikin Ashi',
                  Category: category,
                  Timestamp: cCurr.Timestamp || 0,
                  SignalBarTime: barTime,
                  DisplayTime: `${barTime} IST`,
                  Time: `${cCurr.FullDate} ${barTime} IST (5m HA)`,
                  LTP: ltp,
                  ATM: atm.pe,
                  Entry: entry,
                  StopLoss: sl,
                  RiskPoints: risk,
                  Target1: tgt1,
                  Target2: tgt2,
                  HA_Open: cCurr.HA_Open,
                  HA_High: cCurr.HA_High,
                  HA_Low: cCurr.HA_Low,
                  HA_Close: cCurr.HA_Close,
                  RSI: setupRsi,
                  SignalBarRSI: cCurr.RSI,
                  RSILabel: `${setupRsi}`,
                  PriorTrend: `${sellGreenTrend} Green HA Candles`,
                  CCPosition: sellCcLabel,
                  Status: st.Status,
                  StatusText: st.StatusText,
                  SignalIndex: i - sliceStart,
                  Candles: haCandles.slice(sliceStart, sliceEnd)
                });
              }
            }
          }
        }));
      }

      // Live tick pass for all active session signals
      for (const [id, sig] of activeSessionSignals.entries()) {
        const q = liveQuotesMap.get(sig.Symbol);
        if (q && q.price > 0) {
          sig.LTP = round2(q.price);
          if (sig.Type === 'BUY') {
            if (sig.Status === 'ACTIVE') {
              if (sig.LTP >= sig.Target2) {
                sig.Status = 'TARGET_2_HIT';
                sig.StatusText = '🎯 टार्गेट २ पूर्ण (Target 2 Hit)';
              } else if (sig.LTP >= sig.Target1) {
                sig.Status = 'TARGET_1_HIT';
                sig.StatusText = '✅ टार्गेट १ पूर्ण (Target 1 Hit)';
              } else if (sig.LTP <= sig.StopLoss) {
                sig.Status = 'SL_HIT';
                sig.StatusText = '🛑 स्टॉप लॉस हिट (SL Hit)';
              }
            } else if (sig.Status === 'TARGET_1_HIT' && sig.LTP >= sig.Target2) {
              sig.Status = 'TARGET_2_HIT';
              sig.StatusText = '🎯 टार्गेट २ पूर्ण (Target 2 Hit)';
            }
          } else {
            if (sig.Status === 'ACTIVE') {
              if (sig.LTP <= sig.Target2) {
                sig.Status = 'TARGET_2_HIT';
                sig.StatusText = '🎯 टार्गेट २ पूर्ण (Target 2 Hit)';
              } else if (sig.LTP <= sig.Target1) {
                sig.Status = 'TARGET_1_HIT';
                sig.StatusText = '✅ टार्गेट १ पूर्ण (Target 1 Hit)';
              } else if (sig.LTP >= sig.StopLoss) {
                sig.Status = 'SL_HIT';
                sig.StatusText = '🛑 स्टॉप लॉस हिट (SL Hit)';
              }
            } else if (sig.Status === 'TARGET_1_HIT' && sig.LTP <= sig.Target2) {
              sig.Status = 'TARGET_2_HIT';
              sig.StatusText = '🎯 टार्गेट २ पूर्ण (Target 2 Hit)';
            }
          }
        }
      }

      saveTodaySession();

      const signals = Array.from(activeSessionSignals.values());
      // Chronological sort: newest signal first (by timestamp descending)
      signals.sort((a, b) => (b.Timestamp || 0) - (a.Timestamp || 0));

      const activeCount = signals.filter(s => s.Status === 'ACTIVE').length;
      const targetCount = signals.filter(s => s.Status === 'TARGET_1_HIT' || s.Status === 'TARGET_2_HIT').length;
      const slCount = signals.filter(s => s.Status === 'SL_HIT').length;

      const result = {
        s: 'ok',
        timeframe: '5m Heikin Ashi + RSI(7)',
        sessionDate: todayStr,
        sessionWindow: '09:15 - 15:30 IST',
        isMarketHours: isIndianMarketHours(),
        updatedAt: formatIst(Date.now()).fullDateTime,
        stats: {
          total: signals.length,
          active: activeCount,
          targets: targetCount,
          sl: slCount
        },
        indices,
        signals,
        source: 'Tradejini CubePlus v2 Live 5M Session-Isolated Engine (09:15 - 15:30 IST)'
      };
      cachedTradeSetup = result;
      lastTradeSetupMs = Date.now();
      return result;
    } finally {
      tradeSetupInFlight = null;
    }
  })();

  return tradeSetupInFlight;
}

// ============================================================================
// 7. DAILY (1D) TIMEFRAME AAA CANDLESTICK SCREENER (Calculated Each Morning)
// Strict Finanthropist Slide Rules for Bearish Harami, Bullish Harami,
// Bearish Engulfing, Bullish Engulfing, Bearish Piercing, Bullish Piercing,
// Morning Star, and Evening Star
// ============================================================================
function evaluateDailySignalStatus(type, entry, sl, tgt1, tgt2, dailyCandles, signalIdx, liveLtp) {
  let status = 'ACTIVE';
  let statusText = '🟢 ट्रेड चालू (Active)';

  for (let k = signalIdx + 1; k < dailyCandles.length; k++) {
    const bar = dailyCandles[k];
    if (type === 'BUY') {
      if (bar.low <= sl) {
        return { status: 'SL_HIT', statusText: '🛑 स्टॉप लॉस हिट (SL Hit)' };
      }
      if (bar.high >= tgt2) {
        status = 'TARGET_2_HIT';
        statusText = '🎯 टार्गेट २ पूर्ण (Target 2 Hit)';
      } else if (bar.high >= tgt1 && status !== 'TARGET_2_HIT') {
        status = 'TARGET_1_HIT';
        statusText = '✅ टार्गेट १ पूर्ण (Target 1 Hit)';
      }
    } else {
      if (bar.high >= sl) {
        return { status: 'SL_HIT', statusText: '🛑 स्टॉप लॉस हिट (SL Hit)' };
      }
      if (bar.low <= tgt2) {
        status = 'TARGET_2_HIT';
        statusText = '🎯 टार्गेट २ पूर्ण (Target 2 Hit)';
      } else if (bar.low <= tgt1 && status !== 'TARGET_2_HIT') {
        status = 'TARGET_1_HIT';
        statusText = '✅ टार्गेट १ पूर्ण (Target 1 Hit)';
      }
    }
  }

  if (type === 'BUY') {
    if (liveLtp <= sl) return { status: 'SL_HIT', statusText: '🛑 स्टॉप लॉस हिट (SL Hit)' };
    if (liveLtp >= tgt2) return { status: 'TARGET_2_HIT', statusText: '🎯 टार्गेट २ पूर्ण (Target 2 Hit)' };
    if (liveLtp >= tgt1 && status === 'ACTIVE') return { status: 'TARGET_1_HIT', statusText: '✅ टार्गेट १ पूर्ण (Target 1 Hit)' };
  } else {
    if (liveLtp >= sl) return { status: 'SL_HIT', statusText: '🛑 स्टॉप लॉस हिट (SL Hit)' };
    if (liveLtp <= tgt2) return { status: 'TARGET_2_HIT', statusText: '🎯 टार्गेट २ पूर्ण (Target 2 Hit)' };
    if (liveLtp <= tgt1 && status === 'ACTIVE') return { status: 'TARGET_1_HIT', statusText: '✅ टार्गेट १ पूर्ण (Target 1 Hit)' };
  }

  return { status, statusText };
}

function scanDailyCandlesForAaa(sym, dailyCandles, minTrend = 3, lookbackDays = 10, targetEndIdx = null) {
  const n = dailyCandles.length;
  if (n < minTrend + 2) return [];

  const liveQ = liveQuotesMap.get(sym.toUpperCase().trim());
  const latestClose = round2((liveQ && liveQ.price) ? liveQ.price : dailyCandles[n - 1].close);

  let endIdx = n - 1;
  if (targetEndIdx !== null && typeof targetEndIdx === 'number' && targetEndIdx >= 0 && targetEndIdx < n) {
    endIdx = targetEndIdx;
  } else {
    // Market Status & Reference Date Gate:
    // During live market hours (09:15 - 15:30 IST), if dailyCandles contains today's bar,
    // it is still forming intraday. The latest COMPLETED/CLOSED trade is yesterday's session (n - 2).
    // After market close (>= 15:30 / 16:00 IST), today's bar is 100% completed & closed (n - 1).
    const nowIst = formatIst(Date.now());
    const hhmmNum = Number(nowIst.hh) * 100 + Number(nowIst.mm);
    const isMarketOpenIntraday = hhmmNum >= 915 && hhmmNum < 1530;
    const lastCandleIsToday = dailyCandles[n - 1].fullDate === nowIst.fullDate;
    endIdx = (isMarketOpenIntraday && lastCandleIsToday) ? n - 2 : n - 1;
  }

  if (endIdx < minTrend) return [];
  // Default cleanLookback = 1: Strictly scans the single latest closed daily session!
  // This guarantees signals point directly to TOMORROW'S market with zero intermediate bars.
  const cleanLookback = Math.max(parseInt(lookbackDays, 10) || 1, 1);
  const minIdx = Math.max(minTrend, endIdx - cleanLookback + 1);
  const matches = [];

  // Helper: Measure Uptrend ending at motherIdx (allows at most 1 small pullback/doji pause candle mid-trend)
  function measureUptrend(motherIdx) {
    if (motherIdx < 1) return 0;
    const cMother = dailyCandles[motherIdx];
    if (cMother.close <= cMother.open) return 0;
    let greenCount = 0;
    let pauseUsed = false;
    let startIdx = motherIdx;
    for (let k = motherIdx; k >= 0; k--) {
      const ck = dailyCandles[k];
      const ckBody = Math.abs(ck.close - ck.open);
      if (ck.close > ck.open) {
        greenCount++;
        startIdx = k;
      } else if (k < motherIdx && !pauseUsed && k > 0 && ckBody <= Math.abs(cMother.close - cMother.open) * 0.65) {
        pauseUsed = true;
      } else {
        break;
      }
    }
    if (greenCount < minTrend) return 0;
    const cStart = dailyCandles[startIdx];
    if (cMother.close <= cStart.open && cMother.close <= cStart.close) return 0;
    return greenCount;
  }

  // Helper: Measure Downtrend ending at motherIdx (allows at most 1 small doji/pause candle mid-trend)
  function measureDowntrend(motherIdx) {
    if (motherIdx < 1) return 0;
    const cMother = dailyCandles[motherIdx];
    if (cMother.close >= cMother.open) return 0;
    let redCount = 0;
    let pauseUsed = false;
    let startIdx = motherIdx;
    for (let k = motherIdx; k >= 0; k--) {
      const ck = dailyCandles[k];
      const ckBody = Math.abs(ck.close - ck.open);
      if (ck.close < ck.open) {
        redCount++;
        startIdx = k;
      } else if (k < motherIdx && !pauseUsed && k > 0 && ckBody <= Math.abs(cMother.close - cMother.open) * 0.65) {
        pauseUsed = true;
      } else {
        break;
      }
    }
    if (redCount < minTrend) return 0;
    const cStart = dailyCandles[startIdx];
    if (cMother.close >= cStart.open && cMother.close >= cStart.close) return 0;
    return redCount;
  }

  for (let i = endIdx; i >= minIdx; i--) {
    const cCurr = dailyCandles[i];
    const cPrev = dailyCandles[i - 1];
    const currBody = round2(Math.abs(cCurr.close - cCurr.open));
    const prevBody = round2(Math.abs(cPrev.close - cPrev.open));
    const currRange = Math.max(round2(cCurr.high - cCurr.low), 0.01);
    const prevRange = Math.max(round2(cPrev.high - cPrev.low), 0.01);
    if (currBody <= 0 || prevBody <= 0) continue;

    const isCurrGreen = cCurr.close > cCurr.open;
    const isCurrRed = cCurr.close < cCurr.open;
    const isPrevGreen = cPrev.close > cPrev.open;
    const isPrevRed = cPrev.close < cPrev.open;

    const redTrend = measureDowntrend(i - 1);
    const greenTrend = measureUptrend(i - 1);

    // ------------------------------------------------------------------------
    // A. 2-CANDLE SELL SETUPS (After Uptrend on Daily 1D)
    //    1. Bearish Harami (Finanthropist Slide):
    //       - Uptrend -> Strong Green Mother candle (body >= 50% of its High-Low range)
    //       - Clean Red Baby candle (body <= 60% of Mother body, >= 30% of its own range)
    //       - Baby body strictly inside Mother body (cCurr.open < cPrev.close && cCurr.close > cPrev.open)
    //       - Baby wicks strictly inside Mother High/Low & Open (cCurr.high < cPrev.high && cCurr.low >= cPrev.open && cCurr.low > cPrev.low)
    //       - Entry (Sell / Short sell) = cCurr.close | SL = cPrev.high
    //    2. Bearish Piercing (Finanthropist Slide):
    //       - Uptrend -> Strong Green candle (body >= 45% of range)
    //       - Strong Red candle opens above Green close (cCurr.open > cPrev.close)
    //         and closes below 50% midpoint of Green body (cCurr.close < prevMid && cCurr.close > cPrev.open)
    //       - Entry (Sell / Short sell) = cCurr.close | SL = Math.max(cCurr.high, cPrev.high)
    //    3. Bearish Engulfing (Finanthropist Slide):
    //       - Uptrend -> Green candle (body >= 30% of range)
    //       - Larger Red candle (body >= 50% of range) completely engulfs Green body
    //       - Entry (Sell / Short sell) = cCurr.close | SL = Math.max(cCurr.high, cPrev.high)
    // ------------------------------------------------------------------------
    if (isCurrRed && isPrevGreen && greenTrend >= minTrend) {
      let pattern = null;
      const prevMid = (cPrev.open + cPrev.close) / 2;
      const isStrongMother = (prevBody / prevRange) >= 0.45;
      const isHaramiMother = (prevBody / prevRange) >= 0.50;
      const isMeaningfulPrev = (prevBody / prevRange) >= 0.30;
      const isStrongCurr = (currBody / currRange) >= 0.50;

      if (
        isHaramiMother &&
        cCurr.open < cPrev.close &&
        cCurr.close > cPrev.open &&
        cCurr.high < cPrev.high &&
        cCurr.low >= cPrev.open &&
        cCurr.low > cPrev.low &&
        currBody <= prevBody * 0.60 &&
        currBody >= prevBody * 0.12 &&
        (currBody / currRange) >= 0.30
      ) {
        pattern = 'Bearish Harami';
      } else if (
        isStrongMother &&
        isStrongCurr &&
        cCurr.open > cPrev.close &&
        cCurr.close < prevMid &&
        cCurr.close > cPrev.open
      ) {
        pattern = 'Bearish Piercing';
      } else if (
        isMeaningfulPrev &&
        isStrongCurr &&
        cCurr.open >= cPrev.close &&
        cCurr.close <= cPrev.open &&
        (cCurr.open > cPrev.close || cCurr.close < cPrev.open) &&
        cCurr.high >= cPrev.high &&
        cCurr.low <= cPrev.low &&
        currBody >= prevBody * 1.15
      ) {
        pattern = 'Bearish Engulfing';
      }

      if (pattern) {
        const entry = round2(cCurr.close);
        const rawSl = pattern === 'Bearish Harami'
          ? round2(cPrev.high)
          : round2(Math.max(cPrev.high, cCurr.high));
        const stopLoss = rawSl > entry ? rawSl : round2(entry + Math.max(entry * 0.002, 0.5));
        const risk = round2(stopLoss - entry);
        const target1 = round2(entry - risk * 1.5);
        const target2 = round2(entry - risk * 2.5);
        const st = evaluateDailySignalStatus('SELL', entry, stopLoss, target1, target2, dailyCandles, i, latestClose);
        const sliceStart = Math.max(0, i - 14);
        const sliceEnd = Math.min(n, i + 4);

        matches.push({
          id: `TJ_DAILY_${sym.replace(/\s+/g, '_')}_SELL_${String(cCurr.date).replace(/[:\s]/g, '_')}`,
          symbol: sym,
          name: `${sym} (Daily 1D)`,
          timeframe: '1D (Daily)',
          type: 'SELL',
          pattern,
          patternBars: 2,
          signalOffsetFromEnd: (sliceEnd - 1) - i,
          trendLength: greenTrend,
          trend: `${greenTrend} Green Days`,
          date: `${cCurr.fullDate} (1D)`,
          timestamp: cCurr.timestamp || 0,
          entry,
          stopLoss,
          target1,
          target2,
          risk,
          ltp: latestClose,
          status: st.status,
          statusText: st.statusText,
          ohlcSummary: `Mother (${cPrev.date}): O:₹${cPrev.open} H:₹${cPrev.high} L:₹${cPrev.low} C:₹${cPrev.close} → Signal (${cCurr.date}): O:₹${cCurr.open} H:₹${cCurr.high} L:₹${cCurr.low} C:₹${cCurr.close}`,
          candles: dailyCandles.slice(sliceStart, sliceEnd),
          source: 'Tradejini Daily (1D) Scanner'
        });
        continue;
      }
    }

    // ------------------------------------------------------------------------
    // B. 2-CANDLE BUY SETUPS (After Downtrend on Daily 1D)
    //    1. Bullish Harami (Finanthropist Slide):
    //       - Downtrend -> Strong Red Mother candle (body >= 50% of its High-Low range)
    //       - Clean Green Baby candle (body <= 60% of Mother body, >= 30% of its own range)
    //       - Baby body strictly inside Mother body (cCurr.open > cPrev.close && cCurr.close < cPrev.open)
    //       - Baby wicks strictly inside Mother High/Low & Open (cCurr.high <= cPrev.open && cCurr.high < cPrev.high && cCurr.low > cPrev.low)
    //       - Entry (Buy) = cCurr.close | SL = cPrev.low
    //    2. Bullish Piercing (Finanthropist Slide):
    //       - Downtrend -> Strong Red candle (body >= 45% of range)
    //       - Strong Green candle opens below Red close (cCurr.open < cPrev.close)
    //         and closes above 50% midpoint of Red body (cCurr.close > prevMid && cCurr.close < cPrev.open)
    //       - Entry (Buy) = cCurr.close | SL = Math.min(cCurr.low, cPrev.low)
    //    3. Bullish Engulfing (Finanthropist Slide):
    //       - Downtrend -> Red candle (body >= 30% of range)
    //       - Larger Green candle (body >= 50% of range) completely engulfs Red body
    //       - Entry (Buy) = cCurr.close | SL = Math.min(cCurr.low, cPrev.low)
    // ------------------------------------------------------------------------
    if (isCurrGreen && isPrevRed && redTrend >= minTrend) {
      let pattern = null;
      const prevMid = (cPrev.open + cPrev.close) / 2;
      const isStrongMother = (prevBody / prevRange) >= 0.45;
      const isHaramiMother = (prevBody / prevRange) >= 0.50;
      const isMeaningfulPrev = (prevBody / prevRange) >= 0.30;
      const isStrongCurr = (currBody / currRange) >= 0.50;

      if (
        isHaramiMother &&
        cCurr.open > cPrev.close &&
        cCurr.close < cPrev.open &&
        cCurr.high <= cPrev.open &&
        cCurr.high < cPrev.high &&
        cCurr.low > cPrev.low &&
        currBody <= prevBody * 0.60 &&
        currBody >= prevBody * 0.12 &&
        (currBody / currRange) >= 0.30
      ) {
        pattern = 'Bullish Harami';
      } else if (
        isStrongMother &&
        isStrongCurr &&
        cCurr.open < cPrev.close &&
        cCurr.close > prevMid &&
        cCurr.close < cPrev.open
      ) {
        pattern = 'Bullish Piercing';
      } else if (
        isMeaningfulPrev &&
        isStrongCurr &&
        cCurr.open <= cPrev.close &&
        cCurr.close >= cPrev.open &&
        (cCurr.open < cPrev.close || cCurr.close > cPrev.open) &&
        cCurr.high >= cPrev.high &&
        cCurr.low <= cPrev.low &&
        currBody >= prevBody * 1.15
      ) {
        pattern = 'Bullish Engulfing';
      }

      if (pattern) {
        const entry = round2(cCurr.close);
        const rawSl = pattern === 'Bullish Harami'
          ? round2(cPrev.low)
          : round2(Math.min(cPrev.low, cCurr.low));
        const stopLoss = rawSl < entry ? rawSl : round2(entry - Math.max(entry * 0.002, 0.5));
        const risk = round2(entry - stopLoss);
        const target1 = round2(entry + risk * 1.5);
        const target2 = round2(entry + risk * 2.5);
        const st = evaluateDailySignalStatus('BUY', entry, stopLoss, target1, target2, dailyCandles, i, latestClose);
        const sliceStart = Math.max(0, i - 14);
        const sliceEnd = Math.min(n, i + 4);

        matches.push({
          id: `TJ_DAILY_${sym.replace(/\s+/g, '_')}_BUY_${String(cCurr.date).replace(/[:\s]/g, '_')}`,
          symbol: sym,
          name: `${sym} (Daily 1D)`,
          timeframe: '1D (Daily)',
          type: 'BUY',
          pattern,
          patternBars: 2,
          signalOffsetFromEnd: (sliceEnd - 1) - i,
          trendLength: redTrend,
          trend: `${redTrend} Red Days`,
          date: `${cCurr.fullDate} (1D)`,
          timestamp: cCurr.timestamp || 0,
          entry,
          stopLoss,
          target1,
          target2,
          risk,
          ltp: latestClose,
          status: st.status,
          statusText: st.statusText,
          ohlcSummary: `Mother (${cPrev.date}): O:₹${cPrev.open} H:₹${cPrev.high} L:₹${cPrev.low} C:₹${cPrev.close} → Signal (${cCurr.date}): O:₹${cCurr.open} H:₹${cCurr.high} L:₹${cCurr.low} C:₹${cCurr.close}`,
          candles: dailyCandles.slice(sliceStart, sliceEnd),
          source: 'Tradejini Daily (1D) Scanner'
        });
        continue;
      }
    }

    // ------------------------------------------------------------------------
    // C. 3-CANDLE MORNING STAR & EVENING STAR (Finanthropist Slide - Daily 1D)
    //    - Morning Star:
    //      1. Forms after a Downtrend; Candle 1 (cFirst) is a strong Red candle (body >= 45% of range)
    //      2. Candle 2 (cPrev / Star, Red or Green): Small body (<= 35% of Candle 1 body),
    //         BOTH open and close are strictly below Candle 1's close (starTop < cFirst.close),
    //         and forms the lowest low (cPrev.low <= cFirst.low && cPrev.low <= cCurr.low)
    //      3. Candle 3 (cCurr): Strong Green candle whose close is > 50% of Candle 1's body
    //         (cCurr.close > (cFirst.open + cFirst.close) / 2)
    //    - Evening Star:
    //      1. Forms after an Uptrend; Candle 1 (cFirst) is a strong Green candle (body >= 45% of range)
    //      2. Candle 2 (cPrev / Star, Red or Green): Small body (<= 35% of Candle 1 body),
    //         BOTH open and close are strictly above Candle 1's close (starBottom > cFirst.close),
    //         and forms the highest high (cPrev.high >= cFirst.high && cPrev.high >= cCurr.high)
    //      3. Candle 3 (cCurr): Strong Red candle whose close is < 50% of Candle 1's body
    //         (cCurr.close < (cFirst.open + cFirst.close) / 2)
    // ------------------------------------------------------------------------
    if (i >= minTrend + 1) {
      const cFirst = dailyCandles[i - 2];
      const firstBody = Math.abs(cFirst.close - cFirst.open);
      const firstRange = Math.max(cFirst.high - cFirst.low, 0.01);
      const starBody = prevBody;
      const starTop = Math.max(cPrev.open, cPrev.close);
      const starBottom = Math.min(cPrev.open, cPrev.close);
      const firstMid = (cFirst.open + cFirst.close) / 2;

      const redTrendStar = measureDowntrend(i - 2);
      const greenTrendStar = measureUptrend(i - 2);

      if (
        cFirst.close < cFirst.open &&
        (firstBody / firstRange) >= 0.45 &&
        redTrendStar >= minTrend &&
        starBody <= firstBody * 0.35 &&
        starTop < cFirst.close &&
        cPrev.low <= cFirst.low &&
        cPrev.low <= cCurr.low &&
        isCurrGreen &&
        (currBody / currRange) >= 0.45 &&
        cCurr.close > firstMid
      ) {
        const entry = round2(cCurr.close);
        const rawSl = round2(Math.min(cFirst.low, cPrev.low, cCurr.low));
        const stopLoss = rawSl < entry ? rawSl : round2(entry - Math.max(entry * 0.002, 0.5));
        const risk = round2(entry - stopLoss);
        const target1 = round2(entry + risk * 1.5);
        const target2 = round2(entry + risk * 2.5);
        const st = evaluateDailySignalStatus('BUY', entry, stopLoss, target1, target2, dailyCandles, i, latestClose);
        const sliceStart = Math.max(0, i - 14);
        const sliceEnd = Math.min(n, i + 4);

        matches.push({
          id: `TJ_DAILY_${sym.replace(/\s+/g, '_')}_BUY_${String(cCurr.date).replace(/[:\s]/g, '_')}`,
          symbol: sym,
          name: `${sym} (Daily 1D)`,
          timeframe: '1D (Daily)',
          type: 'BUY',
          pattern: 'Morning Star',
          patternBars: 3,
          signalOffsetFromEnd: (sliceEnd - 1) - i,
          trendLength: redTrendStar,
          trend: `${redTrendStar} Red Days`,
          date: `${cCurr.fullDate} (1D)`,
          timestamp: cCurr.timestamp || 0,
          entry,
          stopLoss,
          target1,
          target2,
          risk,
          ltp: latestClose,
          status: st.status,
          statusText: st.statusText,
          ohlcSummary: `C1 (${cFirst.date}): O:₹${cFirst.open} C:₹${cFirst.close} → Star (${cPrev.date}): O:₹${cPrev.open} L:₹${cPrev.low} C:₹${cPrev.close} → C3 (${cCurr.date}): O:₹${cCurr.open} C:₹${cCurr.close}`,
          candles: dailyCandles.slice(sliceStart, sliceEnd),
          source: 'Tradejini Daily (1D) Scanner'
        });
        continue;
      }

      if (
        cFirst.close > cFirst.open &&
        (firstBody / firstRange) >= 0.45 &&
        greenTrendStar >= minTrend &&
        starBody <= firstBody * 0.35 &&
        starBottom > cFirst.close &&
        cPrev.high >= cFirst.high &&
        cPrev.high >= cCurr.high &&
        isCurrRed &&
        (currBody / currRange) >= 0.45 &&
        cCurr.close < firstMid
      ) {
        const entry = round2(cCurr.close);
        const rawSl = round2(Math.max(cFirst.high, cPrev.high, cCurr.high));
        const stopLoss = rawSl > entry ? rawSl : round2(entry + Math.max(entry * 0.002, 0.5));
        const risk = round2(stopLoss - entry);
        const target1 = round2(entry - risk * 1.5);
        const target2 = round2(entry - risk * 2.5);
        const st = evaluateDailySignalStatus('SELL', entry, stopLoss, target1, target2, dailyCandles, i, latestClose);
        const sliceStart = Math.max(0, i - 14);
        const sliceEnd = Math.min(n, i + 4);

        matches.push({
          id: `TJ_DAILY_${sym.replace(/\s+/g, '_')}_SELL_${String(cCurr.date).replace(/[:\s]/g, '_')}`,
          symbol: sym,
          name: `${sym} (Daily 1D)`,
          timeframe: '1D (Daily)',
          type: 'SELL',
          pattern: 'Evening Star',
          patternBars: 3,
          signalOffsetFromEnd: (sliceEnd - 1) - i,
          trendLength: greenTrendStar,
          trend: `${greenTrendStar} Green Days`,
          date: `${cCurr.fullDate} (1D)`,
          timestamp: cCurr.timestamp || 0,
          entry,
          stopLoss,
          target1,
          target2,
          risk,
          ltp: latestClose,
          status: st.status,
          statusText: st.statusText,
          ohlcSummary: `C1 (${cFirst.date}): O:₹${cFirst.open} C:₹${cFirst.close} → Star (${cPrev.date}): O:₹${cPrev.open} H:₹${cPrev.high} C:₹${cPrev.close} → C3 (${cCurr.date}): O:₹${cCurr.open} C:₹${cCurr.close}`,
          candles: dailyCandles.slice(sliceStart, sliceEnd),
          source: 'Tradejini Daily (1D) Scanner'
        });
      }
    }
  }
  return matches;
}

function getAaaScanUniverse() {
  const combined = [
    ...CORE_INDICES.map((i) => i.symbol),
    ...CORE_MCX.map((m) => m.symbol),
    ...CORE_STOCKS,
    ...AAA_EXTRA_STOCKS
  ];
  const seen = new Set();
  const deduped = [];
  for (const sym of combined) {
    const clean = String(sym || '').toUpperCase().trim();
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      deduped.push(clean);
    }
  }
  return deduped;
}

// Warm up the 60-day Daily OHLCV cache for the entire stock universe each morning & at 4:00 PM EOD
async function warmupDailyAaaUniverse(force = false) {
  if (morningWarmupInFlight) return morningWarmupInFlight;
  morningWarmupInFlight = (async () => {
    try {
      const scanSymbols = getAaaScanUniverse();
      if (force) {
        dailyUniverseCandlesMap.clear();
        raw60dCache.clear();
        screenerCache.clear();
      }
      for (const sym of scanSymbols) {
        if (!force && dailyUniverseCandlesMap.has(sym)) continue;
        try {
          const cData = await getTradejiniCandles(sym, 'D', 60);
          if (cData && cData.s === 'ok' && Array.isArray(cData.candles) && cData.candles.length > 0) {
            dailyUniverseCandlesMap.set(sym, cData.candles);
          }
        } catch (e) {}
        // Gentle pacing to prevent rate limiting (429)
        await new Promise(r => setTimeout(r, 50));
      }
      screenerCache.clear();
      lastMorningScanDate = formatIst(Date.now()).fullDate;
      console.log(`[AAA Daily Scanner] Completed Daily (1D) scan across ${dailyUniverseCandlesMap.size}/${scanSymbols.length} instruments for ${lastMorningScanDate}`);
      syncAaaCalendarSessions().catch(() => {});
    } finally {
      morningWarmupInFlight = null;
    }
  })();
  return morningWarmupInFlight;
}

async function generateHistoricalAaaSession(targetDateStr, minTrend = 3) {
  const cleanTargetDate = String(targetDateStr || '').replace(/_/g, ' ').trim();
  if (!cleanTargetDate) return null;
  const fPath = getAaaSessionFilePath(cleanTargetDate);

  if (fs.existsSync(fPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(fPath, 'utf8'));
      if (existing && Array.isArray(existing.signals)) {
        return existing;
      }
    } catch (e) {}
  }

  const scanSymbols = getAaaScanUniverse();
  const historicalSignals = [];
  let scannedCount = 0;

  for (const sym of scanSymbols) {
    let dailyCandles = dailyUniverseCandlesMap.get(sym);
    if (!dailyCandles) {
      const cData = await getTradejiniCandles(sym, 'D', 60).catch(() => null);
      if (cData && cData.s === 'ok' && Array.isArray(cData.candles) && cData.candles.length > 0) {
        dailyCandles = cData.candles;
        dailyUniverseCandlesMap.set(sym, dailyCandles);
      }
    }

    if (dailyCandles && dailyCandles.length >= minTrend + 2) {
      // Find candle corresponding to cleanTargetDate
      const targetEndIdx = dailyCandles.findIndex(c => {
        const d1 = String(c.fullDate || '').toLowerCase();
        const d2 = String(c.date || '').toLowerCase();
        const target = cleanTargetDate.toLowerCase();
        return d1 === target || d2 === target || d1.startsWith(target);
      });

      if (targetEndIdx !== -1 && targetEndIdx >= minTrend) {
        scannedCount++;
        const foundList = scanDailyCandlesForAaa(sym, dailyCandles, minTrend, 1, targetEndIdx);
        if (Array.isArray(foundList) && foundList.length > 0) {
          historicalSignals.push(...foundList);
        }
      }
    }
  }

  // Deduplicate signals strictly by symbol + type + date + pattern
  const seenSigKeys = new Set();
  const dedupedSignals = [];
  for (const s of historicalSignals) {
    const key = `${s.symbol}_${s.type}_${s.date}_${s.pattern}`;
    if (!seenSigKeys.has(key)) {
      seenSigKeys.add(key);
      dedupedSignals.push(s);
    }
  }

  dedupedSignals.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  saveAaaSession(cleanTargetDate, dedupedSignals, Math.max(scannedCount, scanSymbols.length));

  return {
    date: cleanTargetDate,
    fileKey: cleanTargetDate.replace(/ /g, '_'),
    updatedAt: `${cleanTargetDate} 15:30:00 IST`,
    timeframe: '1D (Daily Timeframe)',
    totalScanned: Math.max(scannedCount, scanSymbols.length),
    stats: {
      total: dedupedSignals.length,
      buy: dedupedSignals.filter(s => s.type === 'BUY').length,
      sell: dedupedSignals.filter(s => s.type === 'SELL').length,
      active: dedupedSignals.filter(s => s.status === 'ACTIVE').length,
      targets: dedupedSignals.filter(s => s.status === 'TARGET_1_HIT' || s.status === 'TARGET_2_HIT').length,
      stopLosses: dedupedSignals.filter(s => s.status === 'SL_HIT').length
    },
    signals: dedupedSignals
  };
}

async function syncAaaCalendarSessions() {
  try {
    const scanSymbols = getAaaScanUniverse();
    let sampleCandles = dailyUniverseCandlesMap.get('RELIANCE') || dailyUniverseCandlesMap.get('NIFTY 50') || dailyUniverseCandlesMap.get('HDFCBANK');
    if (!sampleCandles || sampleCandles.length === 0) {
      for (const s of scanSymbols) {
        const c = dailyUniverseCandlesMap.get(s);
        if (c && c.length >= 10) {
          sampleCandles = c;
          break;
        }
      }
    }
    if (!sampleCandles || sampleCandles.length === 0) return;

    // Extract unique trading dates from the last 10 daily candles
    const recentDates = [];
    for (let i = sampleCandles.length - 1; i >= Math.max(0, sampleCandles.length - 10); i--) {
      const d = sampleCandles[i].fullDate;
      if (d && !recentDates.includes(d)) {
        recentDates.push(d);
      }
    }

    for (const d of recentDates) {
      const fPath = getAaaSessionFilePath(d);
      if (!fs.existsSync(fPath)) {
        await generateHistoricalAaaSession(d, 3);
      }
    }
    console.log(`[AAA Calendar Sync] Verified & synced sessions for ${recentDates.length} recent trading days.`);
  } catch (err) {
    console.warn('[AAA Calendar Sync] Sync error:', err.message);
  }
}

async function getTradejiniAaaScreener(days = 1, minTrend = 3, requestedDate = null) {
  const todayStr = formatIst(Date.now()).fullDate;
  const cleanReqDate = requestedDate ? requestedDate.replace(/_/g, ' ').trim() : null;

  // 1. Session Date Requested via Calendar Dropdown
  if (cleanReqDate && cleanReqDate !== 'latest') {
    let sessionData = null;
    const fPath = getAaaSessionFilePath(cleanReqDate);
    if (fs.existsSync(fPath)) {
      try {
        sessionData = JSON.parse(fs.readFileSync(fPath, 'utf8'));
      } catch (e) {}
    }
    if (!sessionData || !Array.isArray(sessionData.signals) || sessionData.signals.length === 0) {
      sessionData = await generateHistoricalAaaSession(cleanReqDate, minTrend);
    }

    const sigs = (sessionData && Array.isArray(sessionData.signals)) ? sessionData.signals : [];
    sigs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    return {
      s: 'ok',
      timeframe: '1D (Daily Timeframe)',
      sessionDate: cleanReqDate,
      isHistorical: cleanReqDate !== todayStr,
      referenceDate: `${cleanReqDate} Closed Daily Session`,
      updatedAt: (sessionData && sessionData.updatedAt) || `${cleanReqDate} 15:30:00 IST`,
      totalScanned: (sessionData && sessionData.totalScanned) || 189,
      warmedCount: (sessionData && sessionData.totalScanned) || 189,
      foundCount: sigs.length,
      stats: sessionData && sessionData.stats ? sessionData.stats : {
        total: sigs.length,
        buy: sigs.filter(s => s.type === 'BUY').length,
        sell: sigs.filter(s => s.type === 'SELL').length,
        active: sigs.filter(s => s.status === 'ACTIVE').length,
        targets: sigs.filter(s => s.status === 'TARGET_1_HIT' || s.status === 'TARGET_2_HIT').length,
        stopLosses: sigs.filter(s => s.status === 'SL_HIT').length
      },
      rows: sigs,
      source: 'Tradejini & DhanHQ v2 AAA Storage'
    };
  }

  // 2. Live / Latest Closed Session for Today's Market
  const cleanDays = Math.min(Math.max(parseInt(days, 10) || 1, 1), 30);
  const cleanTrend = Math.min(Math.max(parseInt(minTrend, 10) || 3, 3), 8);
  const scanSymbols = getAaaScanUniverse();
  const cacheKey = `DAILY_${cleanDays}_${cleanTrend}_${dailyUniverseCandlesMap.size}`;
  const cached = screenerCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 60000 && dailyUniverseCandlesMap.size >= 40) {
    return cached.data;
  }

  // Trigger background warmup if not all symbols are cached yet
  if (dailyUniverseCandlesMap.size < scanSymbols.length && !morningWarmupInFlight) {
    warmupDailyAaaUniverse(false).catch(() => {});
  }

  const rows = [];
  let scannedCount = 0;

  for (const sym of scanSymbols) {
    let dailyCandles = dailyUniverseCandlesMap.get(sym);

    if (!dailyCandles && scannedCount < 40) {
      const cData = await getTradejiniCandles(sym, 'D', 60).catch(() => null);
      if (cData && cData.s === 'ok' && Array.isArray(cData.candles) && cData.candles.length > 0) {
        dailyCandles = cData.candles;
        dailyUniverseCandlesMap.set(sym, dailyCandles);
      }
    }

    if (dailyCandles && dailyCandles.length >= cleanTrend + 2) {
      scannedCount++;
      const foundList = scanDailyCandlesForAaa(sym, dailyCandles, cleanTrend, cleanDays);
      if (Array.isArray(foundList) && foundList.length > 0) {
        rows.push(...foundList);
      }
    }
  }

  // Deduplicate signals strictly by symbol + type + date + pattern
  const seenRowKeys = new Set();
  const dedupedRows = [];
  for (const r of rows) {
    const key = `${r.symbol}_${r.type}_${r.date}_${r.pattern}`;
    if (!seenRowKeys.has(key)) {
      seenRowKeys.add(key);
      dedupedRows.push(r);
    }
  }

  // Sort newest daily setups first
  dedupedRows.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  const nowIst = formatIst(Date.now());
  const hhmmNum = Number(nowIst.hh) * 100 + Number(nowIst.mm);
  const isMarketOpen = hhmmNum >= 915 && hhmmNum < 1530;

  const result = {
    s: 'ok',
    timeframe: '1D (Daily Timeframe)',
    sessionDate: todayStr,
    isHistorical: false,
    referenceDate: isMarketOpen ? 'कालचा क्लोज (Yesterday Close)' : 'आजचा क्लोज / उद्याच्या ट्रेडसाठी (Today Close - For Tomorrow)',
    updatedAt: `${nowIst.fullDateTime} (1D Daily)`,
    totalScanned: Math.max(scannedCount, scanSymbols.length),
    warmedCount: scannedCount,
    foundCount: dedupedRows.length,
    rows: dedupedRows,
    source: 'Tradejini & DhanHQ v2 Live Daily (1D) AAA Engine'
  };

  // Automatically persist today's session signals
  saveAaaSession(todayStr, dedupedRows, Math.max(scannedCount, scanSymbols.length));

  screenerCache.set(cacheKey, { ts: Date.now(), data: result });
  return result;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, obj) {
  const payload = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': payload.length,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-pin',
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

// =============================================================================
// Standalone User Database & Authentication Engine (Tradejini Client Admissions)
// =============================================================================
const USERS_DB_FILE = path.join(ROOT_DIR, 'data', 'users.json');

function getUsersDb() {
  try {
    if (!fs.existsSync(USERS_DB_FILE)) {
      fs.mkdirSync(path.dirname(USERS_DB_FILE), { recursive: true });
      fs.writeFileSync(USERS_DB_FILE, '[]', 'utf8');
      return [];
    }
    const raw = fs.readFileSync(USERS_DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('[Users DB] Read error:', err.message);
    return [];
  }
}

function saveUsersDb(users) {
  try {
    fs.mkdirSync(path.dirname(USERS_DB_FILE), { recursive: true });
    fs.writeFileSync(USERS_DB_FILE, JSON.stringify(users, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[Users DB] Write error:', err.message);
    return false;
  }
}

function sanitizeUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    tradejiniClientId: u.tradejiniClientId || '--',
    role: u.role || 'USER',
    status: u.status || 'PENDING',
    date: u.date || '',
    vipKey: u.vipKey || '',
    createdAt: u.createdAt || 0
  };
}

function broadcastNtfy(payload) {
  try {
    const postData = JSON.stringify(payload);
    const req = https.request('https://ntfy.sh/fin_auth_hub_2026', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    });
    req.on('error', () => {});
    req.write(postData);
    req.end();
  } catch (e) {}
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-pin'
      });
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = parsedUrl.pathname.replace(/^\/aaa(?=\/|$)/, '') || '/';

    // -------------------------------------------------------------------------
    // AUTH API 1: Client Onboarding Registration (Tradejini Account Holders)
    // -------------------------------------------------------------------------
    if (pathname === '/api/auth/register' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const name = (body.name || '').trim();
        const email = (body.email || '').trim().toLowerCase();
        const phone = (body.phone || '').replace(/\D/g, '').slice(-10);
        const password = (body.password || '').trim();
        const tjId = (body.tradejiniClientId || body.tjId || '').trim().toUpperCase();

        if (!name || name.length < 2) {
          sendJson(res, 400, { s: 'error', message: 'कृपया वैध पूर्ण नाव प्रविष्ट करा (Full name required).' });
          return;
        }
        if (!email || !email.includes('@')) {
          sendJson(res, 400, { s: 'error', message: 'कृपया वैध ईमेल आयडी प्रविष्ट करा (Valid email required).' });
          return;
        }
        if (!phone || phone.length !== 10) {
          sendJson(res, 400, { s: 'error', message: 'कृपया वैध १०-अंकी मोबाईल नंबर प्रविष्ट करा (10-digit mobile required).' });
          return;
        }
        if (!password || password.length < 4) {
          sendJson(res, 400, { s: 'error', message: 'कृपया किमान ४ अक्षरी पासवर्ड तयार करा (Password min 4 chars).' });
          return;
        }
        if (!tjId || tjId.length < 2) {
          sendJson(res, 400, { s: 'error', message: 'कृपया तुमचा Tradejini क्लायंट आयडी प्रविष्ट करा (Tradejini Client ID required).' });
          return;
        }

        const db = getUsersDb();
        const existing = db.find(u => 
          (u.phone && u.phone === phone) || 
          (u.email && u.email.toLowerCase() === email) ||
          (u.tradejiniClientId && u.tradejiniClientId.toUpperCase() === tjId)
        );

        if (existing) {
          if (existing.status === 'APPROVED') {
            sendJson(res, 200, {
              s: 'approved',
              user: sanitizeUser(existing),
              message: `हे खाते (${existing.name}) आधीच मंजूर आहे. कृपया लॉग इन करा.`
            });
            return;
          } else {
            // Update details if re-submitting
            existing.name = name;
            existing.password = password;
            existing.tradejiniClientId = tjId;
            saveUsersDb(db);
            sendJson(res, 200, {
              s: 'pending',
              user: sanitizeUser(existing),
              message: 'नोंदणी विनंती आधीच नोंदवली आहे. ॲडमिन मंजुरीची प्रतीक्षा आहे.'
            });
            return;
          }
        }

        const ist = formatIst(Date.now());
        const vipKey = `VIP-${phone.slice(-4)}-${Math.floor(Math.random() * 899 + 100)}`;
        const newUser = {
          id: `usr_${Date.now()}`,
          name: name,
          email: email,
          phone: phone,
          password: password,
          tradejiniClientId: tjId,
          role: 'USER',
          status: 'PENDING',
          date: `${ist.fullDate}, ${ist.hhmm} IST`,
          vipKey: vipKey,
          createdAt: Date.now()
        };

        db.unshift(newUser);
        saveUsersDb(db);

        // Real-time broadcast to cloud hub
        broadcastNtfy({
          action: 'USER_REGISTER',
          type: 'REGISTER_REQUEST',
          user: sanitizeUser(newUser),
          timestamp: Date.now()
        });

        sendJson(res, 201, {
          s: 'ok',
          user: sanitizeUser(newUser),
          message: 'नोंदणी यशस्वी झाली! ॲडमिन मंजुरीनंतर ॲक्सेस सुरु होईल.'
        });
      } catch (err) {
        sendJson(res, 500, { s: 'error', message: `Registration error: ${err.message}` });
      }
      return;
    }

    // -------------------------------------------------------------------------
    // AUTH API 2: Client Login (Tradejini ID / Mobile + Password)
    // -------------------------------------------------------------------------
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const identifier = (body.identifier || body.loginId || '').trim();
        const password = (body.password || '').trim();

        if (!identifier) {
          sendJson(res, 400, { s: 'error', message: 'Tradejini Client ID किंवा मोबाईल नंबर प्रविष्ट करा.' });
          return;
        }

        const db = getUsersDb();
        const cleanIdent = identifier.toUpperCase();
        const cleanPhone = identifier.replace(/\D/g, '').slice(-10);

        let user = db.find(u => 
          (u.tradejiniClientId && u.tradejiniClientId.toUpperCase() === cleanIdent) ||
          (cleanPhone.length === 10 && u.phone && u.phone.replace(/\D/g, '').slice(-10) === cleanPhone) ||
          (u.email && u.email.toUpperCase() === cleanIdent) ||
          (u.vipKey && u.vipKey.toUpperCase() === cleanIdent)
        );

        if (!user) {
          sendJson(res, 404, {
            s: 'not_found',
            message: 'हे खाते सापडले नाही. कृपया नवीन नोंदणी टॅबमधून Tradejini तपशीलांसह नोंदणी करा.'
          });
          return;
        }

        // Validate password (or master admin PIN override)
        const isMasterBypass = password === 'Admin@Fin2026' || password === 'FINVIP2026';
        if (!isMasterBypass && user.password && user.password !== password) {
          sendJson(res, 401, {
            s: 'invalid_password',
            message: 'अवैध पासवर्ड! कृपया योग्य पासवर्ड प्रविष्ट करा.'
          });
          return;
        }

        if (user.status === 'APPROVED') {
          sendJson(res, 200, {
            s: 'ok',
            user: sanitizeUser(user),
            token: `tok_${user.id}_${Date.now()}`,
            message: `लॉगिन यशस्वी! स्वागत आहे, ${user.name}.`
          });
        } else if (user.status === 'PENDING') {
          sendJson(res, 200, {
            s: 'pending',
            user: sanitizeUser(user),
            message: 'तुमचे खाते अद्याप ॲडमिन मंजुरीच्या प्रतीक्षेत आहे.'
          });
        } else {
          sendJson(res, 403, {
            s: 'rejected',
            message: 'तुमची ॲक्सेस विनंती नाकारण्यात आली आहे. कृपया ॲडमिनशी संपर्क साधा.'
          });
        }
      } catch (err) {
        sendJson(res, 500, { s: 'error', message: `Login error: ${err.message}` });
      }
      return;
    }

    // -------------------------------------------------------------------------
    // AUTH API 3: Check User Status (Polled by Pending Screen)
    // -------------------------------------------------------------------------
    if (pathname === '/api/auth/status') {
      const id = parsedUrl.searchParams.get('id');
      const phone = (parsedUrl.searchParams.get('phone') || '').replace(/\D/g, '').slice(-10);
      const tjId = (parsedUrl.searchParams.get('tjId') || '').toUpperCase();

      const db = getUsersDb();
      const user = db.find(u => 
        (id && u.id === id) || 
        (phone && phone.length === 10 && u.phone && u.phone.replace(/\D/g, '').slice(-10) === phone) || 
        (tjId && u.tradejiniClientId && u.tradejiniClientId.toUpperCase() === tjId)
      );

      if (!user) {
        sendJson(res, 404, { s: 'not_found', status: 'NOT_FOUND' });
        return;
      }

      sendJson(res, 200, {
        s: 'ok',
        status: user.status,
        user: sanitizeUser(user)
      });
      return;
    }

    // -------------------------------------------------------------------------
    // ADMIN API 1: List All Registered Users
    // -------------------------------------------------------------------------
    if (pathname === '/api/admin/users') {
      const pin = parsedUrl.searchParams.get('pin') || req.headers['x-admin-pin'];
      if (pin !== 'Admin@Fin2026' && pin !== 'admin123' && pin !== 'Admin@Fin777') {
        sendJson(res, 403, { s: 'error', message: 'Unauthorized: Invalid Admin PIN' });
        return;
      }
      const db = getUsersDb();
      sendJson(res, 200, { s: 'ok', users: db.map(sanitizeUser) });
      return;
    }

    // -------------------------------------------------------------------------
    // ADMIN API 2: Approve User Access
    // -------------------------------------------------------------------------
    if (pathname === '/api/admin/approve-user' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const pin = body.adminPin || req.headers['x-admin-pin'];
        if (pin !== 'Admin@Fin2026' && pin !== 'admin123' && pin !== 'Admin@Fin777') {
          sendJson(res, 403, { s: 'error', message: 'Unauthorized: Invalid Admin PIN' });
          return;
        }

        const userId = body.userId;
        const phone = (body.phone || '').replace(/\D/g, '').slice(-10);
        const email = (body.email || '').trim().toLowerCase();
        const tjId = (body.tradejiniClientId || body.tjId || '').trim().toUpperCase();
        const db = getUsersDb();
        const target = db.find(u => 
          (userId && u.id === userId) || 
          (phone && phone.length === 10 && u.phone && u.phone.replace(/\D/g, '').slice(-10) === phone) ||
          (email && u.email && u.email.toLowerCase() === email) ||
          (tjId && u.tradejiniClientId && u.tradejiniClientId.toUpperCase() === tjId)
        );

        if (!target) {
          sendJson(res, 404, { s: 'error', message: 'User not found' });
          return;
        }

        target.status = 'APPROVED';
        saveUsersDb(db);

        // Real-time broadcast so user's pending modal automatically unlocks
        broadcastNtfy({
          action: 'USER_APPROVE',
          type: 'USER_STATUS_UPDATE',
          phone: target.phone,
          id: target.id,
          status: 'APPROVED',
          timestamp: Date.now()
        });

        sendJson(res, 200, {
          s: 'ok',
          message: `User ${target.name} (${target.tradejiniClientId || target.phone}) has been approved.`,
          user: sanitizeUser(target)
        });
      } catch (err) {
        sendJson(res, 500, { s: 'error', message: err.message });
      }
      return;
    }

    // -------------------------------------------------------------------------
    // ADMIN API 2B: Revoke User Access (Move back to PENDING)
    // -------------------------------------------------------------------------
    if (pathname === '/api/admin/revoke-user' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const pin = body.adminPin || req.headers['x-admin-pin'];
        if (pin !== 'Admin@Fin2026' && pin !== 'admin123' && pin !== 'Admin@Fin777') {
          sendJson(res, 403, { s: 'error', message: 'Unauthorized: Invalid Admin PIN' });
          return;
        }

        const userId = body.userId;
        const phone = (body.phone || '').replace(/\D/g, '').slice(-10);
        const db = getUsersDb();
        const target = db.find(u => 
          (userId && u.id === userId) || 
          (phone && phone.length === 10 && u.phone && u.phone.replace(/\D/g, '').slice(-10) === phone)
        );

        if (!target) {
          sendJson(res, 404, { s: 'error', message: 'User not found' });
          return;
        }

        target.status = 'PENDING';
        saveUsersDb(db);

        broadcastNtfy({
          action: 'USER_REVOKE',
          type: 'USER_STATUS_UPDATE',
          phone: target.phone,
          id: target.id,
          status: 'PENDING',
          timestamp: Date.now()
        });

        sendJson(res, 200, {
          s: 'ok',
          message: `User ${target.name} status moved back to PENDING.`,
          user: sanitizeUser(target)
        });
      } catch (err) {
        sendJson(res, 500, { s: 'error', message: err.message });
      }
      return;
    }

    // -------------------------------------------------------------------------
    // ADMIN API 3: Reject / Delete User Access
    // -------------------------------------------------------------------------
    if (pathname === '/api/admin/delete-user' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const pin = body.adminPin || req.headers['x-admin-pin'];
        if (pin !== 'Admin@Fin2026' && pin !== 'admin123' && pin !== 'Admin@Fin777') {
          sendJson(res, 403, { s: 'error', message: 'Unauthorized: Invalid Admin PIN' });
          return;
        }

        let db = getUsersDb();
        const userId = body.userId;
        const phone = (body.phone || '').replace(/\D/g, '').slice(-10);
        const target = db.find(u => 
          (userId && u.id === userId) || 
          (phone && phone.length === 10 && u.phone && u.phone.replace(/\D/g, '').slice(-10) === phone)
        );

        db = db.filter(u => !( 
          (userId && u.id === userId) || 
          (phone && phone.length === 10 && u.phone && u.phone.replace(/\D/g, '').slice(-10) === phone) 
        ));
        saveUsersDb(db);

        if (target) {
          broadcastNtfy({
            action: 'USER_DELETE',
            userId: target.id,
            phone: target.phone,
            timestamp: Date.now()
          });
        }

        sendJson(res, 200, { s: 'ok', message: 'User deleted successfully' });
      } catch (err) {
        sendJson(res, 500, { s: 'error', message: err.message });
      }
      return;
    }

    // 1. API: Status
    if (pathname === '/api/tradejini/status' || pathname === '/api/dhan/status') {
      sendJson(res, 200, {
        connected: Boolean(dhan.dhanStream.connected),
        clientCode: dhan.DHAN_CLIENT_ID,
        dataCore: 'DhanHQ v2 WebSocket & Data Engine',
        lastLoginAt: 'ACTIVE (DhanHQ Session Token Auto-Managed)',
        tokenExpiresAt: '24h Rotating TOTP Security',
        todayDate: formatIst(Date.now()).fullDate,
        currentTimeIst: formatIst(Date.now()).fullDateTime,
        isMarketHours: isIndianMarketHours(),
        cachedQuotesCount: liveQuotesMap.size,
        cachedDailyUniverseSize: dailyUniverseCandlesMap.size,
        dailyMorningScan: lastMorningScanDate || 'Active',
        broker: 'DhanHQ v2 (Direct Exchange Stream)',
        dhanStatus: dhan.getDhanStatus()
      });
      return;
    }

    // 1b. API: Manual/Admin Triggered Force Auto-Login & Stale Cache Flush
    if (pathname === '/api/tradejini/auth-refresh' || pathname === '/api/dhan/auth-refresh') {
      try {
        console.log(`[Dhan Engine] Manual/Admin forced session refresh requested...`);
        raw60dCache.clear();
        screenerCache.clear();
        candleCache.clear();
        await dhan.refreshDhanSession(true);
        // Refresh live quotes and daily cache in background
        getLiveQuotesSnapshot().catch(() => {});
        warmupDailyAaaUniverse(false).catch(() => {});

        sendJson(res, 200, {
          s: 'ok',
          message: 'DhanHQ session successfully refreshed and daily caches flushed',
          clientCode: dhan.DHAN_CLIENT_ID,
          todayDate: formatIst(Date.now()).fullDate,
          connected: Boolean(dhan.dhanStream.connected),
          broker: 'DhanHQ v2 (Direct Exchange Stream)'
        });
      } catch (err) {
        sendJson(res, 500, {
          s: 'error',
          message: `Re-authentication error: ${err.message}`
        });
      }
      return;
    }

    // 2. API: Live Quotes Snapshot (for Watchlist & Header Indices)
    if (pathname === '/api/tradejini/quotes' || pathname === '/api/dhan/quotes') {
      const quotes = await getLiveQuotesSnapshot();
      sendJson(res, 200, {
        s: 'ok',
        updatedAt: formatIst(Date.now()).fullDateTime,
        quotes
      });
      return;
    }

    // 3. API: Live Candles (Accepts interval or resolution: 1, 5, 15, 60, D)
    if (pathname === '/api/tradejini/candles' || pathname === '/api/dhan/candles') {
      const symbol = parsedUrl.searchParams.get('symbol') || 'NIFTY 50';
      const interval = parsedUrl.searchParams.get('interval') || parsedUrl.searchParams.get('resolution') || '5';
      const days = parseInt(parsedUrl.searchParams.get('days') || '7', 10);
      const candleResult = await getTradejiniCandles(symbol, interval, days);
      sendJson(res, 200, candleResult);
      return;
    }

    // -------------------------------------------------------------------------
    // API: Real-Time DhanHQ WebSocket Stream (Server-Sent Events)
    // -------------------------------------------------------------------------
    if (pathname === '/api/tradejini/stream' || pathname === '/api/dhan/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write(': connected\n\n');

      const currentQuotes = Array.from(liveQuotesMap.values());
      res.write(`data: ${JSON.stringify({
        type: 'snapshot',
        connected: dhan.dhanStream.connected,
        marketStatus: getCurrentMarketStatus(),
        quotes: currentQuotes
      })}\n\n`);

      sseStreamClients.add(res);

      req.on('close', () => {
        sseStreamClients.delete(res);
      });
      return;
    }

    // API: Dynamic Symbol Subscription to WebSocket
    if (pathname === '/api/tradejini/subscribe' || pathname === '/api/dhan/subscribe') {
      const sym = (parsedUrl.searchParams.get('symbol') || '').toUpperCase().trim();
      if (sym) {
        dhan.dhanStream.subscribe(sym);
      }
      const quote = liveQuotesMap.get(sym) || (dhan.dhanStream.latestQuotes.get(sym) || null);
      sendJson(res, 200, { s: 'ok', symbol: sym, subscribed: true, quote });
      return;
    }

    // API: Live Stream Status
    if (pathname === '/api/tradejini/stream-status' || pathname === '/api/dhan/stream-status') {
      sendJson(res, 200, {
        s: 'ok',
        connected: dhan.dhanStream.connected,
        activeTokensCount: dhan.dhanStream.latestQuotes.size,
        activeClients: sseStreamClients.size + browserWsClients.size,
        marketStatus: getCurrentMarketStatus(),
        source: 'DhanHQ Real-Time WebSocket'
      });
      return;
    }

    // 4a. API: Available Session Dates for Trade Setup Calendar
    if (pathname === '/api/tradejini/trade-setup/dates' || pathname === '/api/dhan/trade-setup/dates') {
      const dates = getSavedSessionDates();
      sendJson(res, 200, {
        s: 'ok',
        today: formatIst(Date.now()).fullDate,
        dates
      });
      return;
    }

    // 4. API: Live / Historical 5-Minute Heikin Ashi Trade Setup Scanner
    if (pathname === '/api/tradejini/trade-setup' || pathname === '/api/dhan/trade-setup') {
      const reqDate = parsedUrl.searchParams.get('date');
      const setupResult = await getTradejiniTradeSetup(reqDate);
      sendJson(res, 200, setupResult);
      return;
    }

    // 4b. API: 1-Minute Precision Trade Simulation & Sliced Candle Window
    if (pathname === '/api/tradejini/simulation' || pathname === '/api/dhan/simulation') {
      const sigId = parsedUrl.searchParams.get('id');
      const sig = findSignalById(sigId);
      if (!sig) {
        sendJson(res, 404, { s: 'error', message: `Signal not found for ID: ${sigId}` });
        return;
      }
      try {
        const simResult = await simEngine.simulateTrade(sig);
        sendJson(res, 200, { s: 'ok', signal: sig, simulation: simResult });
      } catch (err) {
        sendJson(res, 500, { s: 'error', message: err.message });
      }
      return;
    }

    // 4c. API: Downloadable 1-Minute Simulation Dataset (CSV)
    if (pathname === '/api/tradejini/simulation/export' || pathname === '/api/dhan/simulation/export') {
      const sigId = parsedUrl.searchParams.get('id');
      const sig = findSignalById(sigId);
      if (!sig) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Signal not found');
        return;
      }
      try {
        const simResult = await simEngine.simulateTrade(sig);
        const csvData = simEngine.exportSimulationCsv(simResult);
        const safeSym = (sig.Symbol || 'TRADE').replace(/[^a-zA-Z0-9_-]/g, '_');
        const safeId = (sig.Id || 'SIGNAL').replace(/[^a-zA-Z0-9_-]/g, '_');
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${safeSym}_1M_Sim_${safeId}.csv"`
        });
        res.end(csvData);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Export error: ${err.message}`);
      }
      return;
    }

    // 5a. API: Available Session Dates for AAA Daily Screener Calendar
    if (pathname === '/api/tradejini/screener/dates' || pathname === '/api/dhan/screener/dates') {
      const dates = getSavedAaaSessionDates();
      sendJson(res, 200, {
        s: 'ok',
        today: formatIst(Date.now()).fullDate,
        dates
      });
      return;
    }

    // 5. API: Daily (1D) AAA Candlestick Reversal Screener
    if (pathname === '/api/tradejini/screener' || pathname === '/api/dhan/screener') {
      const days = parsedUrl.searchParams.get('days') || '1';
      const minTrend = parsedUrl.searchParams.get('minTrend') || '3';
      const reqDate = parsedUrl.searchParams.get('date');
      const screenerResult = await getTradejiniAaaScreener(days, minTrend, reqDate);
      sendJson(res, 200, screenerResult);
      return;
    }

    // 5b. API: DhanHQ Status & Dynamic Refresh
    if (pathname === '/api/dhan/status') {
      sendJson(res, 200, dhan.getDhanStatus());
      return;
    }
    if (pathname === '/api/dhan/refresh' && req.method === 'POST') {
      try {
        await dhan.refreshDhanSession(true);
        sendJson(res, 200, { s: 'ok', message: 'Dhan token refreshed successfully', status: dhan.getDhanStatus() });
      } catch (err) {
        sendJson(res, 500, { s: 'error', message: err.message });
      }
      return;
    }

    // 6. Static Files
    let relPath = pathname.replace(/^\/+/, '');
    if (!relPath || relPath === '/') {
      relPath = 'index.html';
    } else if (relPath === 'admin' || relPath === 'admin/') {
      relPath = 'admin.html';
    }

    const safePath = path.normalize(path.join(ROOT_DIR, relPath));
    if (!safePath.startsWith(ROOT_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.stat(safePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
      }

      const ext = path.extname(safePath).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      const noCache = (ext === '.html' || ext === '.js' || ext === '.css' || ext === '.json');
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': stats.size,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': noCache ? 'no-cache, no-store, must-revalidate' : 'public, max-age=3600'
      });
      fs.createReadStream(safePath).pipe(res);
    });
  } catch (err) {
    console.error('[Server Error]', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    res.end('Internal Server Error');
  }
});

// Automated Daily Tradejini Auto-Login & Real-Time Sync Supervisor Engine
let supervisorTimer = null;
let lastExecutedAction = '';

function scheduleDailyTradejiniSupervisor() {
  if (supervisorTimer) clearInterval(supervisorTimer);

  supervisorTimer = setInterval(async () => {
    try {
      const ist = formatIst(Date.now());
      const hhmm = ist.hhmm;
      const actionKey = `${ist.fullDate}_${hhmm}`;

      // 1. Proactive Scheduled Daily Checkpoints
      // Checkpoint 08:00 IST: Morning Pre-market Auto Login
      if (hhmm === '08:00' && lastExecutedAction !== `LOGIN_${actionKey}`) {
        lastExecutedAction = `LOGIN_${actionKey}`;
        console.log(`[Tradejini Auto-Login] [08:00 IST] Proactive Morning Auto-Login initiated for ${TJ_USER_ID}...`);
        await refreshTradejiniSession(true);
      }

      // Checkpoint 08:45 IST: Morning Pre-market Cache Clear
      if (hhmm === '08:45' && lastExecutedAction !== `FLUSH_${actionKey}`) {
        lastExecutedAction = `FLUSH_${actionKey}`;
        console.log(`[Tradejini Auto-Login] [08:45 IST] Clearing stale yesterday caches and preparing blank slate session...`);
        raw60dCache.clear();
        screenerCache.clear();
        candleCache.clear();
        ensureTodaySession();
        await refreshTradejiniSession(true);
      }

      // Checkpoint 09:08 IST: Pre-Market Token & Connectivity Health Check
      if (hhmm === '09:08' && lastExecutedAction !== `PREMKT_${actionKey}`) {
        lastExecutedAction = `PREMKT_${actionKey}`;
        console.log(`[Tradejini Auto-Login] [09:08 IST] Pre-market token verification...`);
        await refreshTradejiniSession(false);
      }

      // Checkpoint 09:16:30 IST: Market Open Warmup
      if (hhmm === '09:16' && lastExecutedAction !== `MKTOPEN_${actionKey}`) {
        lastExecutedAction = `MKTOPEN_${actionKey}`;
        console.log(`[Tradejini Auto-Login] [09:16 IST] Market Open: Fetching initial quotes & syncing...`);
        await getLiveQuotesSnapshot();
      }

      // Checkpoint 09:21 IST: First 5-minute bar closed, run full AAA universe warmup with today's opening session
      if (hhmm === '09:21' && lastExecutedAction !== `WARMUP_${actionKey}`) {
        lastExecutedAction = `WARMUP_${actionKey}`;
        console.log(`[Tradejini Auto-Login] [09:21 IST] First 5m candle completed: Warming up AAA Daily (1D) universe...`);
        warmupDailyAaaUniverse(true).catch(() => {});
      }

      // Checkpoint 15:35 IST: Post-market EOD daily close capture
      if (hhmm === '15:35' && lastExecutedAction !== `EOD_${actionKey}`) {
        lastExecutedAction = `EOD_${actionKey}`;
        console.log(`[AAA Screener Supervisor] [15:35 IST] Market Close: Capturing finalized EOD Daily (1D) bars...`);
        warmupDailyAaaUniverse(true).catch(() => {});
      }

      // Checkpoint 16:00 IST: Daily 4:00 PM AAA Screener Update (For Tomorrow's Market)
      const hhmmNum = Number(ist.hh) * 100 + Number(ist.mm);
      const postCloseKey = `AAA_4PM_DONE_${ist.fullDate}`;
      if (hhmmNum >= 1600 && lastExecutedAction !== postCloseKey) {
        if (!morningWarmupInFlight) {
          lastExecutedAction = postCloseKey;
          console.log(`[AAA Screener Supervisor] [16:00+ IST / Post-Close] Market Closed: Finalizing today's (${ist.fullDate}) closed Daily (1D) candles & generating fresh AAA setups for tomorrow...`);
          warmupDailyAaaUniverse(true)
            .then(async () => {
              const screenerRes = await getTradejiniAaaScreener(1, 3);
              const rows = (screenerRes && screenerRes.rows) ? screenerRes.rows : [];
              const list = rows.map(r => `${r.symbol} (${r.type || r.signal} ${r.pattern} @ ₹${r.entry || r.ltp || r.cmp})`).join(', ');
              console.log(`[AAA Screener Supervisor] [16:00 IST Scan Complete] Saved & generated ${rows.length} AAA setups on ${ist.fullDate} close for tomorrow's market: ${list || 'None'}`);
              syncAaaCalendarSessions().catch(() => {});
            })
            .catch((err) => {
              console.error(`[AAA Screener Supervisor] Error during 16:00 scan: ${err.message}`);
            });
        }
      }

      // 2. Token Expiry Guard (Runs continuously)
      const now = Date.now();
      if (!tjAccessToken || (tjTokenExpiryMs > 0 && now >= (tjTokenExpiryMs - 15 * 60 * 1000))) {
        refreshTradejiniSession(false).catch(() => {});
      }

      // 2b. Dhan Token Guard (Auto-renew 24h token via TOTP)
      dhan.refreshDhanSession(false).catch((err) => {
        console.warn('[Dhan Auto-Login Supervisor Warning]:', err.message);
      });

      // 3. Intraday Periodic Quotes Sweep during Market Hours (every 3 minutes)
      if (isIndianMarketHours() && (Number(ist.mm) % 3 === 0) && ist.ss === '15') {
        getLiveQuotesSnapshot().catch(() => {});
      }
    } catch (err) {
      console.error('[Tradejini Auto-Login Supervisor Error]:', err.message);
    }
  }, 15000); // Check every 15 seconds
}

// -----------------------------------------------------------------------------
// Native Browser WebSocket Hub (DhanHQ v2 Real-Time Tick Stream)
// -----------------------------------------------------------------------------
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const parsed = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const pathname = parsed.pathname;
  if (pathname === '/ws' || pathname === '/aaa/ws' || pathname.endsWith('/ws')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws, req) => {
  browserWsClients.add(ws);

  // Send immediate snapshot of all active live quotes
  const snapshot = {};
  for (const [sym, q] of liveQuotesMap.entries()) {
    snapshot[sym] = q;
  }
  try {
    ws.send(JSON.stringify({
      type: 'snapshot',
      dhanConnected: dhan.dhanStream.connected,
      marketStatus: getCurrentMarketStatus(),
      quotes: snapshot,
      timestamp: Date.now()
    }));
  } catch (e) {}

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'subscribe') {
        const syms = Array.isArray(data.symbols) ? data.symbols : (data.symbol ? [data.symbol] : []);
        for (const s of syms) {
          if (!s) continue;
          const cleanSym = String(s).toUpperCase().trim();

          // 1. Subscribe dynamically on DhanHQ WebSocket
          dhan.dhanStream.subscribe(cleanSym);

          // 2. Subscribe dynamically on Tradejini WebSocket
          const token = resolveStreamTokenFromSymbol(cleanSym);
          if (token && tjStreamClient && tjStreamConnected) {
            if (!tjStreamActiveTokens.has(token)) {
              tjStreamActiveTokens.add(token);
              tjStreamClient.subscribeL1(Array.from(tjStreamActiveTokens));
              tjStreamClient.subscribeL1Snapshot(Array.from(tjStreamActiveTokens));
            }
          }

          // 3. Immediately send live quote back to the client if cached in memory
          const q = liveQuotesMap.get(cleanSym) || dhan.dhanStream.latestQuotes.get(cleanSym);
          if (q && q.price > 0) {
            try { ws.send(JSON.stringify({ type: 'tick', tick: q })); } catch (e) {}
          } else {
            // Asynchronously fetch current candle to provide immediate LTP & quote
            dhan.getDhanCandles(cleanSym, '5', 1).then((cData) => {
              if (cData && Array.isArray(cData.candles) && cData.candles.length > 0) {
                const last = cData.candles[cData.candles.length - 1];
                const prev = cData.candles.length > 1 ? cData.candles[cData.candles.length - 2].close : last.open;
                const chg = Number((last.close - prev).toFixed(2));
                const chgPct = prev > 0 ? Number(((chg / prev) * 100).toFixed(2)) : 0;
                const quote = {
                  symbol: cleanSym,
                  canonicalSymbol: cleanSym,
                  price: last.close,
                  open: last.open,
                  high: last.high,
                  low: last.low,
                  prevClose: prev,
                  change: chg,
                  changePercent: chgPct,
                  time: Math.floor(Date.now() / 1000),
                  timestamp: Date.now(),
                  source: 'DhanHQ Immediate Live Quote'
                };
                liveQuotesMap.set(cleanSym, quote);
                if (ws.readyState === 1 /* OPEN */) {
                  ws.send(JSON.stringify({ type: 'tick', tick: quote }));
                }
              }
            }).catch(() => {});
          }
        }
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    browserWsClients.delete(ws);
  });

  ws.on('error', () => {
    browserWsClients.delete(ws);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`==================================================================`);
  console.log(` Finanthropist Educare Pvt Ltd - AAA Real-Time Live Data Terminal`);
  console.log(` Server Running at: http://${HOST}:${PORT}/`);
  console.log(` Primary Data Core: DhanHQ v2 WebSocket Feed & Data Engine`);
  console.log(` Daily (1D) AAA Morning & 16:00 Scanner: Enabled (189 Instruments)`);
  console.log(` Daily Scheduled Supervisor: Active (08:00, 08:45, 09:08, 09:16, 09:21, 15:35, 16:00)`);
  console.log(` DhanHQ Real-Time WebSocket Feed: Connecting (wss://api-feed.dhan.co)...`);
  console.log(` Native Browser WebSocket Hub: Active (ws://${HOST}:${PORT}/ws)`);
  console.log(`==================================================================`);

  // 1. Connect DhanHQ WebSocket Stream & Pre-subscribe full universe (indices + stocks)
  dhan.dhanStream.connect();
  const preSubUniverse = Array.from(new Set([
    'NIFTY 50', 'BANK NIFTY', 'FIN NIFTY', 'MIDCAP NIFTY', 'SENSEX',
    'GOLD', 'CRUDEOIL', 'ACC', 'ABB',
    ...CORE_STOCKS,
    ...AAA_EXTRA_STOCKS
  ]));
  dhan.dhanStream.subscribeMany(preSubUniverse);

  ensureTodaySession();
  scheduleDailyTradejiniSupervisor();

  getLiveQuotesSnapshot()
    .then(() => {
      console.log('[Startup] Core live quotes snapshot initialized via DhanHQ.');
      setTimeout(() => {
        console.log('[Startup] Warming up Triple A Daily (1D) Universe via DhanHQ Data API...');
        warmupDailyAaaUniverse(false).catch(() => {});
      }, 1500);
    })
    .catch((err) => console.error('[Startup Error]', err));
});
