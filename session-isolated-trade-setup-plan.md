# Implementation Plan: Session-Isolated Daily Trade Setup (09:15 – 15:30 IST)

## 1. Problem Statement & Root Cause
- **Current Behavior:** The Trade Setup scanner evaluates `startBar - 70` (70 five-minute candles back). Early in the day (e.g., 09:35 AM), only 4 candles have formed today. Going back 70 candles crosses into yesterday's session (`28 Oct`), returning 111 past signals alongside today's 13 signals (Total: 124 signals).
- **Required Behavior:** 
  1. Every trading day begins with a **100% blank slate** at 09:15 AM IST.
  2. **No signals from yesterday** or previous days must ever be shown in today's Trade Setup.
  3. Only candles between **09:15 AM and 15:30 PM of today's date** are eligible for signal generation.
  4. Signals must be ordered **chronologically** (newest first, with clear exact execution timestamps: 09:30, 09:25, 09:20, etc.).
  5. Today's signals remain active and visible all day, continuously tracking **Target 1**, **Target 2**, and **Stop Loss** against real-time market prices.

---

## 2. Proposed Architecture & Data Flow

```
                      [ Market Opens at 09:15 AM IST ]
                                     │
                     ┌───────────────┴───────────────┐
                     ▼                               ▼
       Check Current Date (IST)           If New Day Detected:
       e.g., 29 Oct 2026                  Reset Session Store -> 0 Signals
                     │                               │
                     └───────────────┬───────────────┘
                                     │
                                     ▼
                Scan Only Today's 5m Completed Candles
                     (09:15 IST <= Candle Time <= 15:30 IST)
                     (Candle Date == Today's Date)
                                     │
                                     ▼
                  Save to: data/sessions/session_YYYY-MM-DD.json
                     (Persists today's signals across reboots)
                                     │
                                     ▼
               Real-Time Live Quote Price Tracking Engine
             (Checks LTP vs Entry, SL, Tgt1, Tgt2 for today's signals)
                                     │
                                     ▼
                       UI Render: Reverse Chronological
                  (09:30 AM -> 09:25 AM -> 09:20 AM -> 09:15 AM)
```

---

## 3. Step-by-Step Implementation Tasks

### Task 1: Strict Session & Date Boundary Filter in Backend (`server.js`)
- In `getTradejiniTradeSetup()`:
  - Extract today's date string in IST: `const todayDateStr = formatIst(Date.now()).date;` (e.g., `"29 Oct 2026"`).
  - Filter `haCandles` to **only include bars whose `FullDate === todayDateStr`** and whose bar time is `>= "09:15"` and `<= "15:30"`.
  - Discard all bars prior to today's 09:15 AM open.
  - If today has fewer than 2 completed candles (e.g., at 09:18 AM), return an empty signals list `[]` with a message: *"Market opened at 09:15 AM. Waiting for sufficient 5m candles to form."*

### Task 2: Persistent Daily Session Manager (`data/sessions/session_YYYY-MM-DD.json`)
- Maintain a session state file per date:
  - Path: `data/sessions/session_${YYYYMMDD}.json`.
  - On server start or supervisor run, if `todaySessionDate !== currentDate`, initialize a brand new empty session.
  - When new signals trigger today, append them to the session file with their first detected timestamp.
  - Ensures that if the server or VPS restarts during the day, today's signals and their target achievements are preserved without re-scanning or showing old signals.

### Task 3: Continuous Intraday Status Tracking
- For every signal recorded today:
  - Continue checking live ticks (`liveQuotesMap` / WebSocket).
  - Track states:
    - 🟢 `ACTIVE` (Price between SL and Tgt 1)
    - 🎯 `TARGET_1_HIT` (High >= Tgt 1 for BUY; Low <= Tgt 1 for SELL)
    - 🏆 `TARGET_2_HIT` (High >= Tgt 2 for BUY; Low <= Tgt 2 for SELL)
    - 🛑 `SL_HIT` (Low <= SL for BUY; High >= SL for SELL)
  - Record the exact timestamp when Target or SL was achieved.

### Task 4: UI Chronological Timeline & Session Header (`assets/trade_setup.js`)
- Display a dedicated session badge at the top:
  `📅 Today's Session: 29 Oct 2026 | Active: X | Target Hit: Y | SL Hit: Z`.
- Sort signals in reverse chronological order (newest at the top, e.g., 09:30 AM, 09:25 AM, 09:20 AM).
- If 0 signals exist yet today (e.g., at 09:16 AM), display a clean empty state: *"Today's session started at 09:15 AM. No setups triggered yet."*

### Task 5: Testing & Production Deployment
- Verify locally that yesterday's 111 signals are completely eliminated and only today's 13 signals are returned.
- Deploy to VPS (`srv1743322.hstgr.cloud`) and restart `finanthropist-aaa.service`.
- Verify the live endpoint: `curl https://app.aiprosperity.in/aaa/api/tradejini/trade-setup`.

---

## 4. Verification Criteria
- [ ] At 09:15 AM on any day, total signals = `0` (blank slate).
- [ ] Zero signals from previous calendar days appear in the API or UI.
- [ ] All signals displayed belong strictly to today's date and between 09:15 AM and 15:30 PM.
- [ ] Signals are ordered chronologically by time.
- [ ] Real-time price line and status (Target 1 / Target 2 / SL) update dynamically.
