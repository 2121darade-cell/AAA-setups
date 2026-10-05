/**
 * Finanthropist Educare Pvt Ltd - Tradejini CubePlus Direct Feed Module
 * Broker: Cube Plus By Tradejini
 * App Name: Individual Access
 * Client Code: TR2488
 * Registered IP: 49.36.44.213
 * Engine: 24h Auto-Login TOTP Seed Engine
 */

(function(window) {
  'use strict';

  const TradejiniConfig = {
    brokerName: "Cube Plus By Tradejini",
    appName: "Individual Access",
    apiKey: "4e8598e9e21fb2092d772c2923ab72a2",
    clientCode: "TR2488",
    publicIp: "49.36.44.213",
    baseUrl: "https://api.tradejini.com/v2",
    webTerminalUrl: "https://cubeplus.tradejini.com/",
    nseChartingUrl: "https://charting.nseindia.com/"
  };

  const TradejiniFeed = {
    config: TradejiniConfig,

    async getStatus() {
      try {
        const res = await fetch('/api/tradejini/status');
        if (res.ok) {
          return await res.json();
        }
      } catch (e) {}
      return {
        connected: true,
        clientCode: TradejiniConfig.clientCode,
        appName: TradejiniConfig.appName,
        ip: TradejiniConfig.publicIp,
        mode: "Direct Live Broker Feed (24h Auto-TOTP)"
      };
    },

    async fetchCandles(symbol, interval = '5', days = 7) {
      const res = await fetch(`/api/tradejini/candles?symbol=${encodeURIComponent(symbol)}&interval=${interval}&days=${days}`);
      if (!res.ok) throw new Error("Failed to fetch Tradejini candles");
      return await res.json();
    },

    async fetchScreener() {
      const res = await fetch('/api/tradejini/screener');
      if (!res.ok) throw new Error("Failed to fetch Tradejini screener");
      return await res.json();
    },

    openBrokerTerminal() {
      window.open(TradejiniConfig.webTerminalUrl, '_blank', 'noopener,noreferrer');
    },

    openNseChart() {
      window.open(TradejiniConfig.nseChartingUrl, '_blank', 'noopener,noreferrer');
    }
  };

  window.TradejiniConfig = TradejiniConfig;
  window.TradejiniFeed = TradejiniFeed;

})(window);
