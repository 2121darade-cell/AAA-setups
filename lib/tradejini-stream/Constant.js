"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPTION_INSTRUMENT_TYPE = exports.INSTRUMENT_TYPE = exports.SERVICE_URL = exports.CONFIGS = exports.MESSAGE = exports.STATUS = void 0;
exports.STATUS = {
    CLOSED: "closed",
    CONNECTED: "connected",
    ERROR: "error"
};
exports.MESSAGE = {
    OPTION_CHAIN: "OptionChain not available",
    SYMBOL_CACHE_FAIL: "Symbol Cache, Please try again"
};
exports.CONFIGS = {
    CURRENT_VERSION: 1,
    ZLIB_TYPE: 100,
    BID_ASK_OBJ_LEN: 3,
    OHLC_OBJ_LEN: 6,
    MARKET_STATUS_OBJ_LEN: 2,
    HUNDRED: 100,
    DIV_HUNDRED: 100.0,
    N_LEN: "nLen",
    SUBSCRIBE: "sub",
    EVENT: "event",
    UNSUBSCRIBE: "unsub",
    UN_AUTH: "Unauthorized Access",
    STRING_TYPE: "string",
    EXCH_SEG: "exchSeg",
    NDEPTH: "nDepth"
};
exports.SERVICE_URL = {
    VERSION_CHECK_URL: "/mkt-data/scrips/symbol-store",
    SYMBOL_DATA: "/mkt-data/scrips/symbol-store"
};
exports.INSTRUMENT_TYPE = {
    EQT: "EQT",
    FUTSTK: "FUTSTK",
    OPTSTK: "OPTSTK",
    FUTIDX: "FUTIDX",
    OPTIDX: "OPTIDX",
    FUTCUR: "FUTCUR",
    OPTCUR: "OPTCUR",
    FUTIRT: "FUTIRT",
    FUTIRD: "FUTIRD",
    OPTIRD: "OPTIRD",
    FUTCOM: "FUTCOM",
    OPTCOM: "OPTCOM",
    FUTAGR: "FUTAGR",
    FUTBLN: "FUTBLN",
    FUTENR: "FUTENR",
    AUCSO: "AUCSO",
    OPTBLN: "OPTBLN",
    OPTFUT: "OPTFUT",
    FUTIRC: "FUTIRC",
    OPTIRC: "OPTIRC",
    FUTBAS: "FUTBAS",
    OPTBAS: "OPTBAS",
    UNDCOM: "UNDCOM",
    FUTMET: "FUTMET",
    OPTENR: "OPTENR",
};
exports.OPTION_INSTRUMENT_TYPE = [
    exports.INSTRUMENT_TYPE.OPTSTK,
    exports.INSTRUMENT_TYPE.OPTIDX,
    exports.INSTRUMENT_TYPE.OPTCUR,
    exports.INSTRUMENT_TYPE.OPTIRD,
    exports.INSTRUMENT_TYPE.OPTCOM,
    exports.INSTRUMENT_TYPE.OPTBLN,
    exports.INSTRUMENT_TYPE.OPTFUT,
];
