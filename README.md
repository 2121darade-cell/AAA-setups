# Finanthropist Educare Pvt Ltd - Trading Terminal Portal

An institutional-grade, responsive Indian Stock Market & Index Trading Terminal powered by official TradingView advanced charting technology, built specifically for **Finanthropist Educare Pvt Ltd**.

---

## 🌟 Key Features

1. **Official Branding & Identity**:
   - High-resolution Finanthropist Educare Pvt Ltd logo and signature maroon/gold visual theme.
   - Dedicated Educational mission, disclaimer, and company profile modal.

2. **Full Indian Market Coverage (NSE & BSE)**:
   - **Indices**: NIFTY 50, BANK NIFTY, SENSEX, FIN NIFTY, MIDCAP NIFTY, NIFTY NEXT 50, INDIA VIX, NIFTY IT, NIFTY AUTO, NIFTY FMCG, NIFTY METAL, NIFTY PHARMA, NIFTY ENERGY, etc.
   - **Equities**: All NSE & BSE listed stocks (Reliance, TCS, HDFC Bank, ICICI Bank, Infosys, Tata Motors, SBI, Adani Ent, etc.) with real-time live data feeds directly from TradingView.
   - **Universal Symbol Search**: Search or type any NSE/BSE stock or contract symbol.

3. **Complete TradingView Pro Charting Engine**:
   - **All Timeframes**: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 1D, 1W, 1M.
   - **100+ Indicators**: RSI, MACD, EMA (20/50/200), SMA, Bollinger Bands, Supertrend, VWAP, Volume, Stochastic, ATR, etc.
   - **Drawing Tools**: Full sidebar toolbar with Trendlines, Horizontal Rays, Fibonacci Retracement, Rectangles, Text annotations, Brushes, and Measurement tools.
   - **Chart Styles**: Candlesticks, Heikin Ashi, Line, Area, Bars, Hollow Candles.

4. **Multi-Chart Grid Layout**:
   - **1-Chart**: Full-screen single chart focus.
   - **2-Chart Split**: Side-by-side comparison (e.g. NIFTY 50 on left + BANK NIFTY on right, or 15m trend + 5m entry view).
   - **4-Chart Grid**: Quad setup to track NIFTY, BANK NIFTY, FIN NIFTY, and SENSEX simultaneously.
   - Click any chart cell to make it active, then select stocks from the watchlist.

5. **Market Intelligence & Screener**:
   - **Live Ticker Tape**: Real-time streaming prices for major Indian benchmarks and blue-chip stocks.
   - **Indian Stock Screener**: Built-in screener modal for 1,500+ Indian stocks with filters for valuation, volume breakouts, top gainers, and 52-week highs/lows.
   - **Technical Analysis Gauge**: Dynamic summary gauge (Oscillators, Moving Averages, Strong Buy/Sell meter).

6. **Cross-Device & Mobile Accessibility (PWA)**:
   - Optimized for Desktops, Laptops, Tablets, and Smartphones.
   - Mobile bottom navigation bar for one-hand trading.
   - Installable as a Progressive Web App (PWA): on Android Chrome or iPhone Safari, tap **"Add to Home Screen"** to run it as a full-screen standalone application!

---

## 🚀 How to Run Locally

### Method 1: Double-Click (Windows)
Double-click `run_server.bat` in this directory. It starts the local server and automatically launches the terminal in your default web browser at `http://localhost:8080/`.

### Method 2: Direct File Opening
You can also directly double-click `index.html` to open it in Chrome, Edge, Safari, or Firefox without any server.

---

## 🌐 How to Host Online for FREE (Get a Shareable Public Web Link)

You can publish this portal online in less than 60 seconds with 100% free hosting:

### Option A: Netlify Drop (Easiest - 30 Seconds, No Coding)
1. Go to [https://app.netlify.com/drop](https://app.netlify.com/drop) in your browser.
2. Drag and drop the `finanthropist_trading_portal` folder into the upload box.
3. Your web link will be live instantly (e.g. `https://finanthropist-educare.netlify.app`)!
4. Anyone on any mobile phone, tablet, or computer can open this link anytime.

### Option B: Vercel (Recommended for Custom Domains)
1. Go to [https://vercel.com](https://vercel.com) and create a free account.
2. Click **"Add New Project"** and import this repository, or install Vercel CLI (`npm i -g vercel && vercel`).
3. Deploy to get an instant fast link like `https://finanthropist-terminal.vercel.app`.

### Option C: GitHub Pages
1. Push this folder to a GitHub repository (e.g. `finanthropist-terminal`).
2. In GitHub repository settings -> **Pages** -> Select `main` branch root folder and save.
3. Your portal will be accessible at `https://<your-username>.github.io/finanthropist-terminal/`.

---

## 📁 File Structure

```
finanthropist_trading_portal/
├── index.html              # Main terminal user interface
├── manifest.json           # PWA metadata for installation
├── sw.js                   # Service worker for offline caching
├── serve.ps1               # Local HTTP web server script
├── run_server.bat          # 1-click launcher for Windows
├── assets/
│   ├── logo.png            # Official Finanthropist Educare logo
│   ├── style.css           # Premium dark terminal stylesheet
│   └── app.js              # State manager & TradingView chart controller
└── README.md               # Documentation & deployment guide
```

---

&copy; Finanthropist Educare Pvt Ltd. All rights reserved. Strictly for educational and analytical purposes.
