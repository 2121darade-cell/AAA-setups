"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const Constant_1 = require("./Constant");
const BinaryParser_1 = __importDefault(require("./BinaryParser"));
const BinaryDefaultSpec_1 = require("./BinaryDefaultSpec");
const SymbolStore_1 = __importDefault(require("./SymbolStore"));
class NxtradStream {
    constructor(host, connCb, streamCb, symStore = true) {
        this.authToken = "";
        this.connected = false;
        this.connection = null;
        this.enableSymStore = false;
        this.l1CacheList = new Map();
        this.l1List = new Set();
        this.l1OptionsList = new Set();
        this.onMessageRecv = (resp) => __awaiter(this, void 0, void 0, function* () {
            const binaryInit = new BinaryParser_1.default();
            let buff = Buffer.from(resp, 'binary');
            const version = buff.readUInt8(4);
            if (version !== Constant_1.CONFIGS.CURRENT_VERSION)
                return;
            try {
                const compressionAlgo = buff.readUInt8(5);
                if (compressionAlgo === 100) {
                    let decompressedData = yield binaryInit.decompressZLib(buff.subarray(6));
                    this.processDecomData(binaryInit, decompressedData);
                }
                if (compressionAlgo === 0)
                    this.processDecomData(binaryInit, buff.subarray(6));
            }
            catch (e) {
                throw e;
            }
        });
        this.processDecomData = (binaryInit, decompressData) => {
            var _a, _b;
            const symbolResp = [];
            for (let inx = 0; inx < decompressData.byteLength;) {
                let { pktLen, jData } = binaryInit.decodePKT(decompressData.subarray(inx));
                if (!pktLen || pktLen <= 0) {
                    break;
                }
                inx += pktLen;
                if (jData) {
                    if (jData["msgType"] === BinaryDefaultSpec_1.STREAM_TYPE.LEVEL_1) {
                        if (this.enableSymStore && ((_a = this.symbolStore) === null || _a === void 0 ? void 0 : _a.optionMap.has(jData["symbol"]))) {
                            const optCache = (_b = this.symbolStore) === null || _b === void 0 ? void 0 : _b.optionMap.get(jData["symbol"]);
                            jData["undId"] = optCache === null || optCache === void 0 ? void 0 : optCache.undId;
                            jData["expiry"] = optCache === null || optCache === void 0 ? void 0 : optCache.expiry;
                        }
                        const cacheData = this.l1CacheList.get(jData["symbol"]);
                        if (cacheData) {
                            for (const obj in jData) {
                                cacheData[obj] = jData[obj];
                            }
                            jData = cacheData;
                        }
                        this.l1CacheList.set(jData["symbol"], jData);
                    }
                    if (this.isConsolidated) {
                        symbolResp.push(jData);
                    }
                    else {
                        this.onParseComplete(jData);
                    }
                }
            }
            if (this.isConsolidated && symbolResp.length > 0) {
                this.onParseComplete(symbolResp);
            }
        };
        this.sendReq = (req) => {
            if (this.connection && this.connection.readyState === ws_1.default.OPEN) {
                this.connection.send(`${JSON.stringify(req)}\n`);
                return true;
            }
            return false;
        };
        this.sendSubReq = (tokens, type) => {
            const req = { type: type, action: Constant_1.CONFIGS.SUBSCRIBE };
            const tokensArr = [];
            for (const token of tokens) {
                tokensArr.push({ t: token });
            }
            req.tokens = tokensArr;
            return this.sendReq(req);
        };
        this.host = host;
        this.path = "/v2.1/stream";
        this.version = "3.1";
        this.isConsolidated = false;
        this.streamCb = streamCb;
        this.connCb = connCb;
        this.enableSymStore = symStore;
    }
    connect(token) {
        return __awaiter(this, void 0, void 0, function* () {
            this.authToken = token;
            this.tryConnect();
        });
    }
    reconnect() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.authToken === "") {
                throw new Error("Token is empty");
            }
            if (this.connected) {
                console.log("Socket already connected");
                return;
            }
            console.log("Reconnecting...");
            this.tryConnect();
        });
    }
    tryConnect() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.enableSymStore) {
                const isLoaded = yield this.loadSymbolStore();
                if (!isLoaded) {
                    this.connCb(this, { s: Constant_1.STATUS.CLOSED, reason: Constant_1.MESSAGE.SYMBOL_CACHE_FAIL });
                    return;
                }
            }
            const url = `wss://${this.host}${this.path}?version=${this.version}&token=${this.authToken}`;
            this.connection = new ws_1.default(url);
            this.connection.onopen = this.onOpen.bind(this);
            this.connection.onclose = this.onClose.bind(this);
            this.connection.onmessage = this.onMessage.bind(this);
            this.connection.onerror = this.onError.bind(this);
        });
    }
    loadSymbolStore() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                this.symbolStore = new SymbolStore_1.default(this.host);
                yield this.symbolStore.load();
                return true;
            }
            catch (err) {
                return false;
            }
        });
    }
    onOpen(evt) {
        this.connected = true;
        this.connCb(this, { s: Constant_1.STATUS.CONNECTED });
    }
    onClose(evt) {
        this.connected = false;
        this.connCb(this, { s: Constant_1.STATUS.CLOSED, code: evt.code, reason: evt.reason });
    }
    onMessage(evt) {
        this.onMessageRecv(evt.data);
    }
    onError(evt) {
        this.connected = false;
        this.connCb(this, { s: Constant_1.STATUS.CLOSED, reason: evt.message });
    }
    sendUnSubRequest(type) {
        const req = { type: type, action: Constant_1.CONFIGS.UNSUBSCRIBE };
        return this.sendReq(req);
    }
    onParseComplete(message) {
        if (this.connected) {
            this.streamCb(this, Object.assign({}, message));
        }
    }
    isConnected() {
        return this.connected;
    }
    subscribeL1(tokens) {
        const newTokens = [...tokens, ...this.l1OptionsList];
        this.l1List = new Set(tokens);
        return this.sendSubReq(newTokens, BinaryDefaultSpec_1.STREAM_TYPE.LEVEL_1);
    }
    subscribeL1Snapshot(tokens) {
        return this.sendSubReq(tokens, BinaryDefaultSpec_1.STREAM_TYPE.LEVEL_1S);
    }
    subscribeL2(tokens) {
        return this.sendSubReq(tokens, BinaryDefaultSpec_1.STREAM_TYPE.LEVEL_5);
    }
    subscribeL2Snapshot(tokens) {
        return this.sendSubReq(tokens, BinaryDefaultSpec_1.STREAM_TYPE.LEVEL_5S);
    }
    sendPing() {
        const req = {};
        req.type = "PING";
        return this.sendReq(JSON.stringify(req));
    }
    subscribeGreeks(tokens) {
        return this.sendSubReq(tokens, BinaryDefaultSpec_1.STREAM_TYPE.GREEKS);
    }
    subscribeGreeksSnapShot(tokens) {
        return this.sendSubReq(tokens, BinaryDefaultSpec_1.STREAM_TYPE.GREEKS_SNAPSHOT);
    }
    subscribeOptionChain(undId, expiry) {
        if (this.symbolStore) {
            let newListToSub = [];
            const undData = this.symbolStore.undMap.get(undId);
            if (undData && undData.has(expiry)) {
                const tokens = undData.get(expiry);
                if (!tokens || (tokens && tokens.length <= 0)) {
                    this.connCb(this, { s: Constant_1.STATUS.CLOSED, reason: Constant_1.MESSAGE.OPTION_CHAIN });
                    return false;
                }
                tokens === null || tokens === void 0 ? void 0 : tokens.forEach((val) => {
                    this.l1OptionsList.add(val);
                });
                newListToSub = newListToSub.concat(...this.l1OptionsList);
                newListToSub = newListToSub.concat(...this.l1List);
                return this.sendSubReq(newListToSub, BinaryDefaultSpec_1.STREAM_TYPE.LEVEL_1);
                ;
            }
        }
        return false;
    }
    subscribeOHLC(tokens, interval) {
        const req = { type: BinaryDefaultSpec_1.STREAM_TYPE.OHLC, action: Constant_1.CONFIGS.SUBSCRIBE };
        const tokensArr = [];
        for (const token of tokens) {
            tokensArr.push({ t: token });
        }
        req.tokens = tokensArr;
        req.chartInterval = interval;
        return this.sendReq(req);
    }
    subscribeEvents(events) {
        const req = { type: BinaryDefaultSpec_1.STREAM_TYPE.EVENT, action: Constant_1.CONFIGS.SUBSCRIBE };
        req.events = events;
        return this.sendReq(req);
    }
    unsubscribeOptionChain(undId, expiry) {
        if (this.symbolStore) {
            let newList = [];
            const undData = this.symbolStore.undMap.get(undId);
            if (undData && undData.has(expiry)) {
                const tokens = undData.get(expiry);
                if (tokens && (tokens === null || tokens === void 0 ? void 0 : tokens.length) <= 0) {
                    this.connCb(this, { s: Constant_1.STATUS.ERROR, reason: Constant_1.MESSAGE.OPTION_CHAIN });
                    return false;
                }
                tokens === null || tokens === void 0 ? void 0 : tokens.forEach((val) => {
                    newList.push(val);
                    this.l1OptionsList.delete(val);
                });
            }
            if (newList.length <= 0) {
                this.connCb(this, { s: Constant_1.STATUS.ERROR, reason: Constant_1.MESSAGE.OPTION_CHAIN });
                return false;
            }
            newList = [];
            this.l1CacheList.clear();
            newList = newList.concat(...Array.from(this.l1List));
            newList = newList.concat(...Array.from(this.l1OptionsList));
            if (newList.length <= 0) {
                return this.sendUnSubRequest(BinaryDefaultSpec_1.STREAM_TYPE.LEVEL_1);
            }
            return this.sendSubReq(newList, BinaryDefaultSpec_1.STREAM_TYPE.LEVEL_1);
        }
        return false;
    }
    unSubscribeEvents() {
        const req = { type: BinaryDefaultSpec_1.STREAM_TYPE.EVENT, action: Constant_1.CONFIGS.UNSUBSCRIBE };
        return this.sendReq(JSON.stringify(req));
    }
    unSubscribeL1() {
        const req = { type: BinaryDefaultSpec_1.STREAM_TYPE.LEVEL_1, action: Constant_1.CONFIGS.UNSUBSCRIBE };
        this.l1List.clear();
        this.l1OptionsList.clear();
        this.l1CacheList.clear();
        return this.sendUnSubRequest(BinaryDefaultSpec_1.STREAM_TYPE.LEVEL_1);
    }
    unSubscribeL2() {
        return this.sendUnSubRequest(BinaryDefaultSpec_1.STREAM_TYPE.LEVEL_5);
    }
    unSubscribeGreeks() {
        return this.sendUnSubRequest(BinaryDefaultSpec_1.STREAM_TYPE.GREEKS);
    }
    unSubscribeOHLC() {
        return this.sendUnSubRequest(BinaryDefaultSpec_1.STREAM_TYPE.OHLC);
    }
    disconnect() {
        this.connection && this.connection.close();
        this.connected = false;
    }
}
exports.default = NxtradStream;
