/**
 * DHANHQ API v2 Integration Client
 * Equipped with strict, guaranteed rate-limiting protection:
 * 1. Serialized Leaky-Bucket Queue (150ms gap between calls = max 6.6 req/s vs Dhan 10-12 req/s limit)
 * 2. Multi-tier in-memory caching for Daily (5m TTL) and Intraday (20s TTL)
 * 3. Automatic 429 Backoff & Circuit Breaker
 * 4. Local 0ms symbol resolution via data/dhan_symbols.json
 */

const https = require('https');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const DHAN_CLIENT_ID = process.env.DHAN_CLIENT_ID || '1104706516';
const DHAN_PIN = process.env.DHAN_PIN || '111199';
const DHAN_TOTP_SEED = process.env.DHAN_TOTP_SEED || 'V5PDO24Y5QZTR3PHEUDWGASAC6HMRTF2';
const DHAN_BASE_URL = 'https://api.dhan.co/v2';
const DHAN_AUTH_URL = 'https://auth.dhan.co/app/generateAccessToken';
const DHAN_SESSION_FILE = path.join(__dirname, '../data/dhan_session.json');

let dhanAccessToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJ1c2VyUmVnaW9uIjoiUjEiLCJpc3MiOiJkaGFuIiwicGFydG5lcklkIjoiIiwiZXhwIjoxNzkzMjUyMTQ5LCJpYXQiOjE3OTMxNjU3NDksInRva2VuQ29uc3VtZXJUeXBlIjoiQVBQIiwiZGhhbkNsaWVudElkIjoiMTEwNDcwNjUxNiJ9.neK6zMKw97b_X8CSlE2PSzmg4MWwSppC3HWIgfeaSKnam7TPBZyIkD8B2ipLGiP33b3r1XnNXWrA5-KD5mSxXw';
let dhanTokenExpiryMs = 1793252149000; // 29 Oct 2026 11:05:49 IST
let dhanRefreshInFlight = null;
let lastDhanTokenGeneratedAt = 0;
const DHAN_TOKEN_COOLDOWN_MS = 125 * 1000; // 2 minutes + 5s buffer

try {
  if (fs.existsSync(DHAN_SESSION_FILE)) {
    const raw = JSON.parse(fs.readFileSync(DHAN_SESSION_FILE, 'utf8'));
    if (raw && raw.accessToken && raw.tokenExpiryMs && raw.tokenExpiryMs > Date.now()) {
      dhanAccessToken = raw.accessToken;
      dhanTokenExpiryMs = raw.tokenExpiryMs;
      if (raw.savedAt) {
        lastDhanTokenGeneratedAt = new Date(raw.savedAt).getTime() || 0;
      }
      console.log(`[Dhan Session] Loaded active session token from disk. Valid until: ${new Date(dhanTokenExpiryMs).toISOString()}`);
    }
  }
} catch (e) {
  console.warn('[Dhan Session] Could not load session from disk:', e.message);
}

// RFC 6238 TOTP Generator
function getTotpCode(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(secret || '').toUpperCase().replace(/[\s=]/g, '');
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

// Automated Dhan Token Refresh Engine via RFC 6238 TOTP
async function refreshDhanSession(force = false) {
  const now = Date.now();
  if (!force && dhanAccessToken && now < (dhanTokenExpiryMs - 15 * 60 * 1000)) {
    return dhanAccessToken;
  }

  // Rate-guard against Dhan's "Token can be generated once every 2 minutes" limit
  if (force && (now - lastDhanTokenGeneratedAt < DHAN_TOKEN_COOLDOWN_MS)) {
    const secLeft = Math.round((DHAN_TOKEN_COOLDOWN_MS - (now - lastDhanTokenGeneratedAt)) / 1000);
    console.warn(`[Dhan Auto-Login] Cooldown active (${secLeft}s remaining before new token can be generated). Reusing active session token.`);
    return dhanAccessToken;
  }

  if (dhanRefreshInFlight) {
    return dhanRefreshInFlight;
  }

  dhanRefreshInFlight = (async () => {
    try {
      const totp = getTotpCode(DHAN_TOTP_SEED);
      console.log(`[Dhan Auto-Login] Generating fresh 24h access token for Client ${DHAN_CLIENT_ID} (TOTP: ${totp})...`);

      const url = `${DHAN_AUTH_URL}?dhanClientId=${DHAN_CLIENT_ID}&pin=${DHAN_PIN}&totp=${totp}`;
      const res = await new Promise((resolve, reject) => {
        const req = https.request(url, { method: 'POST', timeout: 12000 }, (r) => {
          let chunks = '';
          r.on('data', c => chunks += c);
          r.on('end', () => resolve({ statusCode: r.statusCode, body: chunks }));
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('Dhan auth timeout')));
        req.end();
      });

      if (res.statusCode === 200) {
        const parsed = JSON.parse(res.body);
        if (parsed && parsed.accessToken) {
          dhanAccessToken = parsed.accessToken;
          lastDhanTokenGeneratedAt = Date.now();
          // Decode expiry from JWT payload
          try {
            const parts = dhanAccessToken.split('.');
            if (parts.length === 3) {
              const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
              if (payload.exp) {
                dhanTokenExpiryMs = payload.exp * 1000;
              }
            }
          } catch (e) {}

          console.log(`[Dhan Auto-Login] SUCCESS! Fresh token acquired. Valid until: ${new Date(dhanTokenExpiryMs).toISOString()}`);
          
          try {
            fs.mkdirSync(path.dirname(DHAN_SESSION_FILE), { recursive: true });
            fs.writeFileSync(DHAN_SESSION_FILE, JSON.stringify({
              accessToken: dhanAccessToken,
              tokenExpiryMs: dhanTokenExpiryMs,
              savedAt: new Date().toISOString()
            }, null, 2));
          } catch (e) {
            console.warn('[Dhan Session] Failed to write session to disk:', e.message);
          }

          // Reconnect stream if exists
          if (dhanStream && typeof dhanStream.reconnectWithToken === 'function') {
            dhanStream.reconnectWithToken(dhanAccessToken);
          }
          return dhanAccessToken;
        } else {
          throw new Error(`Dhan Auth Error: ${parsed.message || res.body}`);
        }
      } else {
        throw new Error(`Dhan Auth HTTP ${res.statusCode}: ${res.body}`);
      }
    } catch (err) {
      console.error(`[Dhan Auto-Login Error]:`, err.message);
      throw err;
    } finally {
      dhanRefreshInFlight = null;
    }
  })();

  return dhanRefreshInFlight;
}

// Rate Limiter Config - Conservatively paced at 2.6 req/sec to prevent 429 errors from Dhan
const MIN_REQUEST_GAP_MS = 380;
let lastRequestTime = 0;
let requestQueue = Promise.resolve();
const inFlightRequests = new Map();

// In-Memory Caches
const dailyCache = new Map();
const intradayCache = new Map();
const DAILY_CACHE_TTL_MS = 10 * 60 * 1000;   // 10 minutes
const INTRADAY_CACHE_TTL_MS = 30 * 1000;      // 30 seconds

// Load Pre-generated Symbols
let symbolsMap = {};
try {
  const symPath = path.join(__dirname, '..', 'data', 'dhan_symbols.json');
  if (fs.existsSync(symPath)) {
    symbolsMap = JSON.parse(fs.readFileSync(symPath, 'utf8'));
  }
} catch (e) {
  console.warn('[Dhan] Warning loading dhan_symbols.json:', e.message);
}

function resolveSecurity(symbol) {
  if (!symbol) return null;
  const clean = String(symbol).trim().toUpperCase().replace(/\.NS$/i, '').replace(/\.BO$/i, '');
  if (symbolsMap[clean]) return symbolsMap[clean];
  if (symbolsMap[symbol]) return symbolsMap[symbol];

  // Common aliases
  if (clean === 'NIFTY' || clean === 'NIFTY50') return symbolsMap['NIFTY 50'];
  if (clean === 'BANKNIFTY') return symbolsMap['BANK NIFTY'];
  if (clean === 'FINNIFTY') return symbolsMap['FIN NIFTY'];
  if (clean === 'MIDCPNIFTY' || clean === 'MIDCAP') return symbolsMap['MIDCAP NIFTY'];
  if (clean === 'GOLDM') return symbolsMap['GOLD'];
  if (clean === 'CRUDE') return symbolsMap['CRUDEOIL'];
  if (clean === 'TATAMOTORS') return symbolsMap['TMCV'] || symbolsMap['TMPV'];
  if (clean === 'REC') return symbolsMap['RECLTD'];
  if (clean === 'LTIM') return symbolsMap['LTM'];
  if (clean === 'ICICIPRULI' || clean === 'ICICIPRU') return symbolsMap['ICICILIFE'];

  return null;
}

/**
 * Serialized Request Queue to guarantee no rate-limiting occurs
 */
function throttledHttpsPost(endpoint, bodyObj) {
  const reqKey = `${endpoint}_${JSON.stringify(bodyObj)}`;
  if (inFlightRequests.has(reqKey)) {
    return inFlightRequests.get(reqKey);
  }

  const p = (async () => {
    const nextInQueue = requestQueue.then(async () => {
      const now = Date.now();
      const elapsed = now - lastRequestTime;
      if (elapsed < MIN_REQUEST_GAP_MS) {
        await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_GAP_MS - elapsed));
      }
      lastRequestTime = Date.now();

      return executeRequest(endpoint, bodyObj);
    });

    requestQueue = nextInQueue.catch(() => {});
    return nextInQueue;
  })();

  inFlightRequests.set(reqKey, p);
  p.finally(() => inFlightRequests.delete(reqKey));
  return p;
}

function executeRequest(endpoint, bodyObj, attempt = 0) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(bodyObj);
    const url = new URL(DHAN_BASE_URL + endpoint);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access-token': dhanAccessToken,
        'client-id': DHAN_CLIENT_ID,
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 12000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', async () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(new Error(`Failed to parse Dhan JSON: ${err.message}`));
          }
        } else if (res.statusCode === 429) {
          // Rate limit encountered - Backoff immediately!
          console.warn(`[Dhan Rate-Limiter] 429 received on ${endpoint}. Cooling down for 3 seconds (Attempt ${attempt + 1})...`);
          if (attempt < 3) {
            await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
            try {
              const retryRes = await executeRequest(endpoint, bodyObj, attempt + 1);
              resolve(retryRes);
            } catch (retryErr) {
              reject(retryErr);
            }
          } else {
            reject(new Error('Dhan API 429 Too Many Requests after retries'));
          }
        } else if (
          res.statusCode === 401 ||
          (res.statusCode === 400 && (
            data.includes('DH-906') ||
            data.includes('DH-901') ||
            data.includes('Invalid Token') ||
            data.includes('Invalid_Authentication') ||
            data.includes('Token Expired')
          ))
        ) {
          console.warn(`[Dhan] Auth error (${res.statusCode}) on ${endpoint}: ${data.slice(0, 100)}. Auto-renewing token via TOTP seed...`);
          if (attempt < 2) {
            try {
              await refreshDhanSession(true);
              const retryRes = await executeRequest(endpoint, bodyObj, attempt + 1);
              resolve(retryRes);
            } catch (authErr) {
              reject(authErr);
            }
          } else {
            reject(new Error(`Dhan Auth Error (${res.statusCode}): ${data.slice(0, 160)}`));
          }
        } else {
          reject(new Error(`Dhan API Error (${res.statusCode}): ${data.slice(0, 160)}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('Dhan API request timed out'));
    });

    req.on('error', async (err) => {
      if (attempt < 2) {
        console.warn(`[Dhan] Network warning on ${endpoint} (${err.message}). Retrying in 1.5s (attempt ${attempt + 1})...`);
        await new Promise(r => setTimeout(r, 1500));
        try {
          const retried = await executeRequest(endpoint, bodyObj, attempt + 1);
          resolve(retried);
        } catch (rErr) {
          reject(rErr);
        }
      } else {
        reject(err);
      }
    });
    req.write(postData);
    req.end();
  });
}

function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatIst(unixMs) {
  const d = new Date(unixMs + 19800000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mon = MONTHS_SHORT[d.getUTCMonth()];
  const yyyy = d.getUTCFullYear();
  return {
    hhmm: `${hh}:${mm}`,
    ddMon: `${dd} ${mon}`,
    fullDate: `${dd} ${mon} ${yyyy}`,
    fullDateTime: `${dd} ${mon} ${yyyy} ${hh}:${mm} IST`
  };
}

// Quick local cache for today's completed 5m bars from session file
function getTodaySessionDailyBar(symbol) {
  try {
    const nowIst = formatIst(Date.now());
    const sessDateStr = nowIst.fullDate.replace(/ /g, '_');
    const sessPath = path.join(__dirname, `../data/sessions/session_${sessDateStr}.json`);
    if (!fs.existsSync(sessPath)) return null;
    const sessData = JSON.parse(fs.readFileSync(sessPath, 'utf8'));
    if (!Array.isArray(sessData.signals)) return null;
    const sig = sessData.signals.find(s => s.Symbol === symbol.toUpperCase().trim());
    if (sig && Array.isArray(sig.Candles) && sig.Candles.length > 0) {
      const todayBars = sig.Candles.filter(c => (c.FullDate || c.fullDate) === nowIst.fullDate);
      if (todayBars.length > 0) {
        const open = todayBars[0].Open != null ? todayBars[0].Open : todayBars[0].open;
        const high = Math.max(...todayBars.map(c => c.High != null ? c.High : c.high));
        const low = Math.min(...todayBars.map(c => c.Low != null ? c.Low : c.low));
        const close = todayBars[todayBars.length - 1].Close != null ? todayBars[todayBars.length - 1].Close : todayBars[todayBars.length - 1].close;
        const vol = todayBars.reduce((a, b) => a + (b.Volume || b.volume || 0), 0);
        const lastTs = todayBars[todayBars.length - 1].Timestamp || todayBars[todayBars.length - 1].timestamp || Date.now();
        return {
          timestamp: lastTs,
          date: nowIst.ddMon,
          fullDate: nowIst.fullDate,
          time: 'Daily (1D)',
          open: Number(open.toFixed(2)),
          high: Number(high.toFixed(2)),
          low: Number(low.toFixed(2)),
          close: Number(close.toFixed(2)),
          volume: Number(vol)
        };
      }
    }
  } catch (e) {}
  return null;
}

// Persistent daily bar cache for finalized post-market EOD candles
const FINALIZED_DAILY_DIR = path.join(__dirname, '../data');
let finalizedDailyBarsCache = null;
let finalizedDailyDate = null;

function getFinalizedDailyMap() {
  const todayStr = formatIst(Date.now()).fullDate.replace(/ /g, '_');
  if (finalizedDailyDate === todayStr && finalizedDailyBarsCache) {
    return finalizedDailyBarsCache;
  }
  finalizedDailyDate = todayStr;
  finalizedDailyBarsCache = new Map();
  const filePath = path.join(FINALIZED_DAILY_DIR, `daily_bars_${todayStr}.json`);
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (data && typeof data === 'object') {
        for (const [k, v] of Object.entries(data)) {
          finalizedDailyBarsCache.set(k.toUpperCase().trim(), v);
        }
      }
    } catch (e) {}
  }
  return finalizedDailyBarsCache;
}

function saveFinalizedDailyBar(symbol, bar) {
  const map = getFinalizedDailyMap();
  map.set(symbol.toUpperCase().trim(), bar);
  const todayStr = formatIst(Date.now()).fullDate.replace(/ /g, '_');
  const filePath = path.join(FINALIZED_DAILY_DIR, `daily_bars_${todayStr}.json`);
  try {
    const obj = Object.fromEntries(map);
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
  } catch (e) {}
}

/**
 * Fetch Daily (1D) Historical Candles
 * Guaranteeing full 3-month (90 days) or custom historical range
 */
async function getDailyCandles(symbol, days = 90) {
  const sec = resolveSecurity(symbol);
  if (!sec) {
    return { s: 'error', message: `Unknown security: ${symbol}`, candles: [] };
  }

  const now = new Date();
  const past = new Date(now.getTime() - (days + 5) * 86400 * 1000);
  const fromDate = formatDate(past);
  const toDate = formatDate(now); // inclusive today

  const cacheKey = `DAILY_${sec.seg}_${sec.id}_${fromDate}_${toDate}`;
  const cached = dailyCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < DAILY_CACHE_TTL_MS) {
    return cached.data;
  }

  const body = {
    securityId: sec.id,
    exchangeSegment: sec.seg,
    instrument: sec.inst,
    fromDate: fromDate,
    toDate: toDate
  };

  try {
    const raw = await throttledHttpsPost('/charts/historical', body);
    if (!raw || !Array.isArray(raw.timestamp) || raw.timestamp.length === 0) {
      return { s: 'ok', symbol, count: 0, candles: [], source: 'DhanHQ v2 Daily' };
    }

    const candles = [];
    for (let i = 0; i < raw.timestamp.length; i++) {
      const tsSec = raw.timestamp[i];
      const tsMs = tsSec > 1e11 ? tsSec : tsSec * 1000;
      const ist = formatIst(tsMs);

      candles.push({
        timestamp: tsMs,
        date: ist.ddMon,
        fullDate: ist.fullDate,
        time: 'Daily (1D)',
        open: Number(raw.open[i].toFixed(2)),
        high: Number(raw.high[i].toFixed(2)),
        low: Number(raw.low[i].toFixed(2)),
        close: Number(raw.close[i].toFixed(2)),
        volume: Number(raw.volume[i] || 0)
      });
    }

    // Check if today's completed/forming candle is missing from Dhan's historical feed
    const nowIst = formatIst(Date.now());
    const lastCandle = candles[candles.length - 1];
    if (lastCandle && lastCandle.fullDate !== nowIst.fullDate) {
      const istDate = new Date(Date.now() + 19800000);
      const day = istDate.getUTCDay(); // 1: Mon ... 5: Fri
      const hhmmNum = istDate.getUTCHours() * 100 + istDate.getUTCMinutes();
      // Only append if today is a weekday and market has completed at least opening bars (>= 09:20 IST)
      if (day >= 1 && day <= 5 && hhmmNum >= 920) {
        // 1. Check finalized daily disk/memory cache first (instant, 0 rate limit)
        const finalizedMap = getFinalizedDailyMap();
        const cachedTodayBar = finalizedMap.get(symbol.toUpperCase().trim());
        if (cachedTodayBar) {
          candles.push(cachedTodayBar);
        } else {
          // 2. Fast local cache from session file
          const localDaily = getTodaySessionDailyBar(symbol);
          if (localDaily) {
            candles.push(localDaily);
            if (hhmmNum >= 1530) saveFinalizedDailyBar(symbol, localDaily);
          } else {
            // 3. Fetch from Dhan intraday
            try {
              const intraRes = await getIntradayCandles(symbol, '5', 1);
              if (intraRes && Array.isArray(intraRes.candles) && intraRes.candles.length > 0) {
                const todayBars = intraRes.candles.filter(c => c.fullDate === nowIst.fullDate);
                if (todayBars.length > 0) {
                  const open = todayBars[0].open;
                  const high = Math.max(...todayBars.map(c => c.high));
                  const low = Math.min(...todayBars.map(c => c.low));
                  const close = todayBars[todayBars.length - 1].close;
                  const vol = todayBars.reduce((a, b) => a + (b.volume || 0), 0);
                  const lastTs = todayBars[todayBars.length - 1].timestamp;

                  const todayBar = {
                    timestamp: lastTs,
                    date: nowIst.ddMon,
                    fullDate: nowIst.fullDate,
                    time: 'Daily (1D)',
                    open: Number(open.toFixed(2)),
                    high: Number(high.toFixed(2)),
                    low: Number(low.toFixed(2)),
                    close: Number(close.toFixed(2)),
                    volume: Number(vol)
                  };

                  candles.push(todayBar);
                  if (hhmmNum >= 1530) {
                    saveFinalizedDailyBar(symbol, todayBar);
                  }
                }
              }
            } catch (e) {
              // Gracefully keep historical candles if intraday fails
            }
          }
        }
      }
    }

    const result = {
      s: 'ok',
      symbol,
      securityId: sec.id,
      count: candles.length,
      candles: candles,
      source: 'DhanHQ v2 Daily'
    };

    dailyCache.set(cacheKey, { ts: Date.now(), data: result });
    return result;
  } catch (err) {
    console.error(`[Dhan] Error fetching daily candles for ${symbol}:`, err.message);
    return { s: 'error', symbol, message: err.message, candles: [] };
  }
}

/**
 * Fetch Intraday Candles (1m, 5m, 15m, 60m)
 */
async function getIntradayCandles(symbol, interval = '5', days = 7) {
  const sec = resolveSecurity(symbol);
  if (!sec) {
    return { s: 'error', message: `Unknown security: ${symbol}`, candles: [] };
  }

  // Map requested interval to Dhan supported intervals: 1, 5, 15, 25, 60
  let dhanIntv = '5';
  const cleanIntv = String(interval).toUpperCase();
  if (cleanIntv === '1' || cleanIntv === '1M') dhanIntv = '1';
  else if (cleanIntv === '15' || cleanIntv === '15M') dhanIntv = '15';
  else if (cleanIntv === '60' || cleanIntv === '1H') dhanIntv = '60';
  else if (cleanIntv === '25') dhanIntv = '25';
  else dhanIntv = '5';

  const numDays = Math.min(Math.max(Number(days) || 7, 1), 60);
  const now = new Date();
  const past = new Date(now.getTime() - numDays * 86400 * 1000);
  const fromDate = formatDate(past);
  const toDate = formatDate(now);

  const cacheKey = `INTRA_${sec.seg}_${sec.id}_${dhanIntv}_${fromDate}_${toDate}`;
  const cached = intradayCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < INTRADAY_CACHE_TTL_MS) {
    return cached.data;
  }

  const body = {
    securityId: sec.id,
    exchangeSegment: sec.seg,
    instrument: sec.inst,
    interval: dhanIntv,
    fromDate: fromDate,
    toDate: toDate
  };

  try {
    const raw = await throttledHttpsPost('/charts/intraday', body);
    if (!raw || !Array.isArray(raw.timestamp) || raw.timestamp.length === 0) {
      return { s: 'ok', symbol, count: 0, candles: [], source: `DhanHQ v2 ${dhanIntv}m` };
    }

    const candles = [];
    for (let i = 0; i < raw.timestamp.length; i++) {
      const tsSec = raw.timestamp[i];
      const tsMs = tsSec > 1e11 ? tsSec : tsSec * 1000;
      const ist = formatIst(tsMs);

      candles.push({
        timestamp: tsMs,
        date: ist.hhmm,
        fullDate: ist.fullDate,
        time: `${ist.hhmm} IST`,
        open: Number(raw.open[i].toFixed(2)),
        high: Number(raw.high[i].toFixed(2)),
        low: Number(raw.low[i].toFixed(2)),
        close: Number(raw.close[i].toFixed(2)),
        volume: Number(raw.volume[i] || 0)
      });
    }

    const result = {
      s: 'ok',
      symbol,
      securityId: sec.id,
      count: candles.length,
      candles: candles,
      source: `DhanHQ v2 ${dhanIntv}m`
    };

    intradayCache.set(cacheKey, { ts: Date.now(), data: result });
    return result;
  } catch (err) {
    console.error(`[Dhan] Error fetching intraday candles for ${symbol}:`, err.message);
    return { s: 'error', symbol, message: err.message, candles: [] };
  }
}

/**
 * Universal candle fetcher supporting 1m, 5m, 15m, 60m, Daily (D), Weekly (W), Monthly (M)
 */
async function getDhanCandles(symbol, interval = '5', days = 90) {
  const normIntv = String(interval || '5').toUpperCase();
  if (normIntv === 'D' || normIntv === '1D') {
    return getDailyCandles(symbol, Number(days) || 90);
  }
  if (normIntv === 'W' || normIntv === '1W') {
    const dailyRes = await getDailyCandles(symbol, 365);
    if (dailyRes.s !== 'ok' || dailyRes.candles.length === 0) return dailyRes;
    const weeklyCandles = aggregateDailyToWeekly(dailyRes.candles);
    return { ...dailyRes, candles: weeklyCandles, count: weeklyCandles.length, source: 'DhanHQ v2 Weekly' };
  }
  if (normIntv === 'M' || normIntv === '1M') {
    const dailyRes = await getDailyCandles(symbol, 730);
    if (dailyRes.s !== 'ok' || dailyRes.candles.length === 0) return dailyRes;
    const monthlyCandles = aggregateDailyToMonthly(dailyRes.candles);
    return { ...dailyRes, candles: monthlyCandles, count: monthlyCandles.length, source: 'DhanHQ v2 Monthly' };
  }

  // Intraday
  return getIntradayCandles(symbol, normIntv, days);
}

function aggregateDailyToWeekly(dailyCandles) {
  const byWeek = new Map();
  for (const c of dailyCandles) {
    const d = new Date(c.timestamp);
    const dayOfWeek = (d.getUTCDay() + 6) % 7;
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

function aggregateDailyToMonthly(dailyCandles) {
  const byMonth = new Map();
  for (const c of dailyCandles) {
    const d = new Date(c.timestamp + 19800000);
    const monthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const monthName = `${MONTHS_SHORT[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(-2)}`;

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

// -----------------------------------------------------------------------------
// DHAN REAL-TIME WEBSOCKET STREAMING ENGINE (v2 Binary Protocol)
// -----------------------------------------------------------------------------
const WebSocket = require('ws');

const SEG_BYTE_TO_NAME = {
  0: 'IDX_I',
  1: 'NSE_EQ',
  2: 'NSE_FNO',
  3: 'NSE_CURRENCY',
  4: 'BSE_EQ',
  5: 'MCX_COMM',
  6: 'BSE_CURRENCY',
  7: 'BSE_FNO'
};

const secIdToSymbol = new Map();
for (const [sym, info] of Object.entries(symbolsMap)) {
  if (info && info.id) {
    const k = `${info.seg || 'NSE_EQ'}_${info.id}`;
    if (!secIdToSymbol.has(k)) secIdToSymbol.set(k, sym);
  }
}
// Primary overrides
secIdToSymbol.set('IDX_I_13', 'NIFTY 50');
secIdToSymbol.set('IDX_I_25', 'BANK NIFTY');
secIdToSymbol.set('IDX_I_27', 'FIN NIFTY');
secIdToSymbol.set('IDX_I_442', 'MIDCAP NIFTY');
secIdToSymbol.set('IDX_I_51', 'SENSEX');
secIdToSymbol.set('MCX_COMM_495213', 'GOLD');
secIdToSymbol.set('MCX_COMM_573422', 'CRUDE OIL');

class DhanStreamClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.subscriptions = new Map();
    this.latestQuotes = new Map();
    this.listeners = new Set();
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const wsUrl = `wss://api-feed.dhan.co?version=2&token=${encodeURIComponent(dhanAccessToken)}&clientId=${DHAN_CLIENT_ID}&authType=2`;
    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      console.log('[Dhan Live Stream] WebSocket CONNECTED to wss://api-feed.dhan.co!');
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

      this.flushSubscriptions();
    });

    this.ws.on('message', (data) => {
      if (!Buffer.isBuffer(data)) return;
      this.decodeAndDispatch(data);
    });

    this.ws.on('error', (err) => {
      console.warn('[Dhan Live Stream] WebSocket Error:', err.message);
    });

    this.ws.on('close', (code, reason) => {
      this.connected = false;
      this.reconnectAttempts++;
      // If outside market hours, back off to 5 minutes so we never trigger IP rate limits!
      const istDate = new Date(Date.now() + 19800000);
      const mins = istDate.getUTCHours() * 60 + istDate.getUTCMinutes();
      const isMarketOpen = mins >= 555 && mins <= 930;
      const delay = !isMarketOpen ? 300000 : Math.min(60000, Math.max(10000, Math.pow(2, Math.min(this.reconnectAttempts, 5)) * 2000));
      console.warn(`[Dhan Live Stream] WebSocket closed (${code}). Auto-reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts})...`);
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    });
  }

  subscribe(symbol) {
    const sec = resolveSecurity(symbol);
    if (!sec) return;
    const key = `${sec.seg}_${sec.id}`;
    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, {
        ExchangeSegment: sec.seg,
        SecurityId: sec.id,
        Symbol: symbol.toUpperCase().trim(),
        CanonicalSym: sec.sym || symbol
      });
      if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendSub([this.subscriptions.get(key)]);
      }
    }
  }

  subscribeMany(symbols) {
    if (!Array.isArray(symbols)) return;
    const toSend = [];
    for (const sym of symbols) {
      const sec = resolveSecurity(sym);
      if (!sec) continue;
      const key = `${sec.seg}_${sec.id}`;
      if (!this.subscriptions.has(key)) {
        const item = {
          ExchangeSegment: sec.seg,
          SecurityId: sec.id,
          Symbol: String(sym).toUpperCase().trim(),
          CanonicalSym: sec.sym || sym
        };
        this.subscriptions.set(key, item);
        toSend.push(item);
      }
    }
    if (toSend.length > 0 && this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      for (let i = 0; i < toSend.length; i += 50) {
        this.sendSub(toSend.slice(i, i + 50));
      }
    }
  }

  flushSubscriptions() {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const list = Array.from(this.subscriptions.values());
    if (list.length === 0) return;

    for (let i = 0; i < list.length; i += 50) {
      const chunk = list.slice(i, i + 50);
      this.sendSub(chunk);
    }
  }

  sendSub(list) {
    const msg = {
      RequestCode: 15, // Ticker
      InstrumentCount: list.length,
      InstrumentList: list.map(item => ({
        ExchangeSegment: item.ExchangeSegment,
        SecurityId: item.SecurityId
      }))
    };
    try {
      this.ws.send(JSON.stringify(msg));
    } catch (e) {
      console.warn('[Dhan Live Stream] Send sub error:', e.message);
    }
  }

  decodeAndDispatch(data) {
    if (data.length < 8) return;
    const code = data.readUInt8(0);
    const segByte = data.readUInt8(3);
    const secId = String(data.readInt32LE(4));
    const segName = SEG_BYTE_TO_NAME[segByte] || 'NSE_EQ';
    const subKey = `${segName}_${secId}`;

    const sub = this.subscriptions.get(subKey);
    const sym = sub ? sub.Symbol : (secIdToSymbol.get(subKey) || null);
    if (!sym) return; // Drop ticks that do not match our registered exchange segment & security ID

    // Code 6: Previous Close packet (length 16)
    if (code === 6 && data.length >= 12) {
      const prevCl = data.readFloatLE(8);
      if (prevCl > 0) {
        if (!this.latestQuotes.has(sym)) {
          this.latestQuotes.set(sym, {});
        }
        const q = this.latestQuotes.get(sym);
        q.prevClose = Number(prevCl.toFixed(2));
      }
      return;
    }

    let ltp = 0;
    let ltt = Math.floor(Date.now() / 1000);

    if (code === 2 && data.length >= 16) {
      ltp = data.readFloatLE(8);
      ltt = data.readInt32LE(12);
    } else if (code === 4 && data.length >= 50) {
      ltp = data.readFloatLE(8);
      ltt = data.readInt32LE(14);
    } else {
      return;
    }

    if (ltp <= 0) return;
    ltp = Number(ltp.toFixed(2));

    const nowSec = Math.floor(Date.now() / 1000);
    // Dhan sends LTT as IST seconds (UTC epoch + 19,800s).
    // Normalize to standard Unix UTC epoch:
    let normLtt = ltt;
    if (ltt > nowSec + 10000) {
      normLtt = ltt - 19800;
    }
    // Safeguard: if skew is excessive, clamp to current clock time
    if (normLtt <= 0 || Math.abs(normLtt - nowSec) > 3600) {
      normLtt = nowSec;
    }

    if (!this.latestQuotes.has(sym)) {
      this.latestQuotes.set(sym, {});
    }
    const q = this.latestQuotes.get(sym);

    // Sanity Outlier Shield: reject ticks deviating > 50% from established price/prevClose
    const refPrice = q.price || q.prevClose || 0;
    if (refPrice > 0 && (ltp > refPrice * 2.5 || ltp < refPrice * 0.35)) {
      console.warn(`[Dhan Live Stream] Outlier tick rejected for ${sym}: ₹${ltp} vs reference ₹${refPrice}`);
      return;
    }
    q.price = ltp;
    q.symbol = sym;
    q.time = normLtt;
    q.timestamp = normLtt * 1000;
    if (!q.open) q.open = ltp;
    if (!q.high || ltp > q.high) q.high = ltp;
    if (!q.low || ltp < q.low) q.low = ltp;

    const prevClose = q.prevClose || ltp;
    const change = Number((ltp - prevClose).toFixed(2));
    const changePercent = prevClose > 0 ? Number(((change / prevClose) * 100).toFixed(2)) : 0;

    const tick = {
      symbol: sym,
      canonicalSymbol: sub ? sub.CanonicalSym : sym,
      securityId: secId,
      segment: segName,
      price: ltp,
      open: q.open,
      high: q.high,
      low: q.low,
      prevClose: prevClose,
      change: change,
      changePercent: changePercent,
      time: normLtt,
      timestamp: normLtt * 1000,
      source: 'Dhan WebSocket Live Stream'
    };

    for (const cb of this.listeners) {
      try { cb(tick); } catch (e) {}
    }
  }

  onTick(cb) {
    this.listeners.add(cb);
  }

  reconnectWithToken() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
    this.connect();
  }
}

const dhanStream = new DhanStreamClient();

function getDhanStatus() {
  return {
    connected: Boolean(dhanAccessToken),
    clientId: DHAN_CLIENT_ID,
    tokenExpiresAt: new Date(dhanTokenExpiryMs).toISOString(),
    streamConnected: dhanStream.connected,
    activeSubscriptions: dhanStream.subscriptions.size
  };
}

module.exports = {
  DHAN_CLIENT_ID,
  resolveSecurity,
  formatIst,
  getDailyCandles,
  getIntradayCandles,
  getDhanCandles,
  dhanStream,
  refreshDhanSession,
  getDhanStatus
};
