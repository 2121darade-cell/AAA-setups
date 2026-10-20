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
Object.defineProperty(exports, "__esModule", { value: true });
const Constant_1 = require("./Constant");
const Helper_1 = require("./Helper");
class SymbolStore {
    constructor(host) {
        this.version = 0;
        this.host = "";
        this.undMap = new Map(); //<undid,<expiry,option tokens>>
        this.optionMap = new Map();
        this.host = host;
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.host) {
                throw new Error("Host url is empty!");
            }
            const { storeConfig, apiVersion } = yield this.getApiVersion();
            if (this.version < apiVersion) {
                this.version = apiVersion;
                yield this.fetchSymbolMasters(storeConfig);
            }
        });
    }
    getApiVersion() {
        return __awaiter(this, void 0, void 0, function* () {
            const versionUrl = `https://${this.host}${Constant_1.SERVICE_URL.VERSION_CHECK_URL}?version=${this.version}`;
            const data = yield (0, Helper_1.MakeGetHttpCall)(versionUrl, {});
            if (data["s"] === "ok") {
                return { apiVersion: data["d"]["version"], storeConfig: data["d"]["symbolStore"] };
            }
            throw new Error("Symbolstore failed!");
        });
    }
    fetchSymbolMasters(storeConfigs) {
        return __awaiter(this, void 0, void 0, function* () {
            for (const config of storeConfigs) {
                const masterUrl = `https://${this.host}${Constant_1.SERVICE_URL.SYMBOL_DATA}/${config.name}`;
                const data = yield (0, Helper_1.MakeGetHttpCall)(masterUrl, {});
                this.parseSymbolTableData(data, config.idFormat);
            }
        });
    }
    parseKeys(keys, value) {
        return keys.reduce((obj, key, inx) => {
            obj[key] = value[inx];
            return obj;
        }, {});
    }
    parseSymbolTableData(symData, idFormat) {
        const symArrayData = (0, Helper_1.splitResponse)(symData, "\n", ",");
        const [keys, ...values] = symArrayData;
        values.forEach((value) => {
            const unMapSym = this.parseKeys(keys, value);
            const unMapSymId = (0, Helper_1.splitId)(unMapSym.id, idFormat);
            Object.assign(unMapSym, unMapSymId);
            this.updateCache(unMapSym);
        });
    }
    getKey(unMapSym) {
        return `${unMapSym.excToken}_${unMapSym.exchange}`;
    }
    updateCache(unMapSym) {
        if ((0, Helper_1.isOptions)(unMapSym.instrument)) {
            const { undId, expiry } = unMapSym;
            if (this.undMap.has(undId)) {
                const prevUndData = this.undMap.get(undId);
                if (prevUndData && prevUndData.has(expiry)) {
                    let prevOptions = prevUndData.get(expiry);
                    if (prevOptions) {
                        prevOptions.push(this.getKey(unMapSym));
                    }
                    else {
                        prevOptions = [this.getKey(unMapSym)];
                    }
                    prevUndData.set(expiry, prevOptions);
                }
                else {
                    prevUndData && prevUndData.set(expiry, [this.getKey(unMapSym)]);
                }
            }
            else {
                const expMap = new Map();
                expMap.set(expiry, [this.getKey(unMapSym)]);
                this.undMap.set(undId, expMap);
            }
            this.optionMap.set(this.getKey(unMapSym), { expiry: expiry, undId: undId });
        }
    }
}
exports.default = SymbolStore;
