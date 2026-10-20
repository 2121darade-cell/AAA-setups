"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PKT_INFO = exports.SEG_INFO = exports.PKT_TYPE = exports.STREAM_TYPE = void 0;
const Helper_1 = require("./Helper");
exports.STREAM_TYPE = {
    LEVEL_1: "L1",
    LEVEL_5: "L5",
    LEVEL_1S: "L1S",
    LEVEL_5S: "L5S",
    IV_UNDERLYING: "iv-underlying",
    MARKET_STATUS: "marketStatus",
    OHLC: "OHLC",
    GREEKS: "greeks",
    GREEKS_SNAPSHOT: "greeks-snapshot",
    PING: "PING",
    EVENT: "event"
};
exports.PKT_TYPE = {
    10: exports.STREAM_TYPE.LEVEL_1,
    11: exports.STREAM_TYPE.LEVEL_5,
    12: exports.STREAM_TYPE.OHLC,
    14: exports.STREAM_TYPE.MARKET_STATUS,
    15: exports.STREAM_TYPE.EVENT,
    16: exports.STREAM_TYPE.PING,
    17: exports.STREAM_TYPE.GREEKS,
    18: exports.STREAM_TYPE.IV_UNDERLYING,
};
exports.SEG_INFO = {
    1: { "exchSeg": "NSE", "precision": 2, "divisor": 100.0 },
    2: { "exchSeg": "BSE", "precision": 2, "divisor": 100.0 },
    3: { "exchSeg": "NFO", "precision": 2, "divisor": 100.0 },
    4: { "exchSeg": "BFO", "precision": 2, "divisor": 100.0 },
    5: { "exchSeg": "CDS", "precision": 4, "divisor": 10000000.0 },
    6: { "exchSeg": "BCD", "precision": 4, "divisor": 10000.0 },
    7: { "exchSeg": "MCD", "precision": 4, "divisor": 10000.0 },
    8: { "exchSeg": "MCX", "precision": 2, "divisor": 100.0 },
    9: { "exchSeg": "NCO", "precision": 2, "divisor": 10000.0 },
    10: { "exchSeg": "BCO", "precision": 2, "divisor": 10000.0 }
};
exports.DEFAULT_PKT_INFO = {
    PKT_SPEC: {
        10: {
            26: { type: "uint8", key: "exchSeg", len: 1 },
            27: { type: "int32", key: "token", len: 4 },
            28: { type: "uint8", key: "precision", len: 1 },
            29: { type: "int32", key: "ltp", len: 4, fmt: Helper_1.divideFunc },
            30: { type: "int32", key: "open", len: 4, fmt: Helper_1.divideFunc },
            31: { type: "int32", key: "high", len: 4, fmt: Helper_1.divideFunc },
            32: { type: "int32", key: "low", len: 4, fmt: Helper_1.divideFunc },
            33: { type: "int32", key: "close", len: 4, fmt: Helper_1.divideFunc },
            34: { type: "int32", key: "chng", len: 4, fmt: Helper_1.divideFunc },
            35: {
                type: "int32", key: "chngPer", len: 4, fmt: function (val) {
                    return (0, Helper_1.divideFunc)(val);
                }
            },
            36: { type: "int32", key: "atp", len: 4, fmt: Helper_1.divideFunc },
            37: { type: "int32", key: "yHigh", len: 4, fmt: Helper_1.divideFunc },
            38: { type: "int32", key: "yLow", len: 4, fmt: Helper_1.divideFunc },
            39: { type: "uint32", key: "ltq", len: 4 },
            40: { type: "uint32", key: "vol", len: 4 },
            41: {
                type: "double", key: "ttv", len: 8, fmt: function (val) {
                    return (0, Helper_1.divideFunc)(val, 2, 1);
                }
            },
            42: { type: "int32", key: "ucl", len: 4, fmt: Helper_1.divideFunc },
            43: { type: "int32", key: "lcl", len: 4, fmt: Helper_1.divideFunc },
            44: { type: "uint32", key: "OI", len: 4 },
            // 45: { type: "int32", key: "OIChngPer", len: 4, fmt: function (val: number) {
            //     return divideFunc(val); 
            // } },
            46: {
                type: "int32", key: "ltt", len: 4, fmt: function (val) {
                    return (0, Helper_1.dateFmt)(val);
                }
            },
            49: { type: "int32", key: "bidPrice", len: 4, fmt: Helper_1.divideFunc },
            50: { type: "uint32", key: "bidQty", len: 4 },
            51: { type: "uint32", key: "bidNo", len: 4 },
            52: { type: "int32", key: "askPrice", len: 4, fmt: Helper_1.divideFunc },
            53: { type: "uint32", key: "askQty", len: 4 },
            54: { type: "uint32", key: "askNo", len: 4 },
            55: { type: "uint8", key: "nDepth", len: 1 },
            56: { type: "uint16", key: "nLen", len: 2 },
            58: { type: "uint32", key: "prevOI", len: 4 },
            59: { type: "uint32", key: "dayHighOI", len: 4 },
            60: { type: "uint32", key: "dayLowOI", len: 4 },
            70: { type: "int32", key: "spotPrice", len: 4, fmt: Helper_1.divideFunc },
            71: { type: "int32", key: "dayClose", len: 4, fmt: Helper_1.divideFunc },
            74: { type: "int32", key: "vwap", len: 4, fmt: Helper_1.divideFunc },
        },
        11: {
            26: { type: "uint8", key: "exchSeg", len: 1 },
            27: { type: "int32", key: "token", len: 4 },
            28: { type: "uint8", key: "precision", len: 1 },
            47: { type: "uint32", key: "totBuyQty", len: 4 },
            48: { type: "uint32", key: "totSellQty", len: 4 },
            //BID
            49: { type: "int32", key: "price", len: 4, fmt: Helper_1.divideFunc },
            50: { type: "uint32", key: "qty", len: 4 },
            51: { type: "uint32", key: "no", len: 4 },
            //ASK
            52: { type: "int32", key: "price", len: 4, fmt: Helper_1.divideFunc },
            53: { type: "uint32", key: "qty", len: 4 },
            54: { type: "uint32", key: "no", len: 4 },
            55: { type: "uint8", key: "nDepth", len: 1, },
        },
        12: {
            26: { type: "uint8", key: "exchSeg", len: 1 },
            27: { type: "int32", key: "token", len: 4 },
            28: { type: "uint8", key: "precision", len: 1 },
            30: { type: "int32", key: "open", len: 4, fmt: Helper_1.divideFunc },
            31: { type: "int32", key: "high", len: 4, fmt: Helper_1.divideFunc },
            32: { type: "int32", key: "low", len: 4, fmt: Helper_1.divideFunc },
            33: { type: "int32", key: "close", len: 4, fmt: Helper_1.divideFunc },
            40: { type: "int32", key: "vol", len: 4 },
            46: {
                type: "int32", key: "time", len: 4, fmt: function (val) {
                    return (0, Helper_1.dateFmt)(val);
                }
            },
            74: { type: "int32", key: "vwap", len: 4, fmt: Helper_1.divideFunc },
            75: { type: "string", key: "type", len: 4 },
            76: { type: "uint32", key: "minuteOi", len: 4 }, // refers total oi
        },
        14: {
            26: { type: "uint8", key: "exchSeg", len: 1 },
            56: { type: "uint16", key: "nLen", len: 2 },
            57: { type: "uint8", key: "status", len: 1 },
        },
        15: {
            56: { type: "uint16", key: "nLen", len: 2 },
            61: { type: "string", key: "message", len: 100 },
        },
        16: {
            62: { type: "uint8", key: "pong", len: 1 },
        },
        17: {
            26: { type: "uint8", key: "exchSeg", len: 1 },
            27: { type: "int32", key: "token", len: 4 },
            63: { type: "double", key: "itm", len: 8 },
            64: { type: "double", key: "iv", len: 8 },
            65: { type: "double", key: "delta", len: 8 },
            66: { type: "double", key: "gamma", len: 8 },
            67: { type: "double", key: "theta", len: 8 },
            68: { type: "double", key: "rho", len: 8 },
            69: { type: "double", key: "vega", len: 8 },
            72: { type: "double", key: "highiv", len: 8 },
            73: { type: "double", key: "lowiv", len: 8 },
        },
        18: {
            26: { type: "uint8", key: "exchSeg", len: 1 },
            27: { type: "int32", key: "token", len: 4 },
            29: { type: "int32", key: "ltp", len: 4, fmt: Helper_1.divideFunc },
            64: { type: "double", key: "iv", len: 8 },
            72: { type: "double", key: "highIv", len: 8 },
            73: { type: "double", key: "lowIv", len: 8 },
        },
    },
    BID_ASK_OBJ_LEN: 3
};
