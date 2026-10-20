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
const BinaryDefaultSpec_1 = require("./BinaryDefaultSpec");
const BinaryDefaultSpec_2 = require("./BinaryDefaultSpec");
const Constant_1 = require("./Constant");
const node_zlib_1 = __importDefault(require("node:zlib"));
const Helper_1 = require("./Helper");
class BinaryParser {
    constructor() {
        this.decompressZLib = (zlibData) => __awaiter(this, void 0, void 0, function* () {
            return node_zlib_1.default.inflateSync(zlibData);
        });
        this.decodePKT = (pktBuff) => {
            const pktLen = pktBuff.readUint16LE(0);
            const pktType = pktBuff.readUint8(2);
            const specMatrix = BinaryDefaultSpec_1.DEFAULT_PKT_INFO.PKT_SPEC[pktType];
            if (!specMatrix) {
                console.error(`Unknown PktType ${pktType}`);
                return pktLen;
            }
            const packetType = BinaryDefaultSpec_1.PKT_TYPE[pktType];
            let jData = {};
            if (packetType === BinaryDefaultSpec_2.STREAM_TYPE.LEVEL_1) {
                jData = this.decodeL1PKT(specMatrix, pktLen, pktBuff);
            }
            else if (packetType === BinaryDefaultSpec_2.STREAM_TYPE.LEVEL_5) {
                jData = this.decodeL2PKT(specMatrix, pktLen, pktBuff);
            }
            else if (packetType === BinaryDefaultSpec_2.STREAM_TYPE.OHLC) {
                jData = this.decodeOhlcPKT(specMatrix, pktLen, pktBuff);
            }
            else if (packetType === BinaryDefaultSpec_2.STREAM_TYPE.MARKET_STATUS) {
                jData = this.decodeMarketStatus(specMatrix, pktLen, pktBuff);
            }
            else if (packetType === BinaryDefaultSpec_2.STREAM_TYPE.EVENT) {
                jData = this.decodeMessage(specMatrix, pktLen, pktBuff);
            }
            else if (packetType === BinaryDefaultSpec_2.STREAM_TYPE.PING) {
                jData = this.decodeStatus(specMatrix, pktLen, pktBuff);
            }
            else if (packetType === BinaryDefaultSpec_2.STREAM_TYPE.GREEKS) {
                jData = this.decodeGreeks(specMatrix, pktLen, pktBuff);
            }
            jData["msgType"] = packetType;
            return { pktLen, jData };
        };
        this.formatFunc = (rawData, precision, divisor) => {
            const jData = {};
            for (const key in rawData) {
                if (rawData[key]) {
                    const [spec, value] = rawData[key];
                    jData[spec.key] = spec.fmt ? spec.fmt(value, precision, divisor) : value;
                }
            }
            return jData;
        };
        this.decodeL1PKT = (specMatrix, pktLen, pktBuff) => {
            const rawData = {};
            let segInfo = {
                precision: 2,
                divisor: 100.0
            };
            for (let indx = 3; indx < pktLen;) {
                const pktKey = pktBuff.readUint8(indx);
                indx += 1;
                const spec = specMatrix[pktKey];
                if (!spec) {
                    console.error(`Unknown Pkt spec breaking ${pktKey}`);
                    return rawData;
                }
                const framed = this.frameFromSpec(spec, pktBuff.subarray(indx, (indx + spec.len)));
                if (spec.key === "exchSeg") {
                    segInfo = BinaryDefaultSpec_1.SEG_INFO[framed];
                    rawData[spec.key] = [spec, segInfo.exchSeg];
                }
                else {
                    rawData[spec.key] = [spec, framed];
                }
                indx += spec.len;
            }
            let jData = {};
            jData = this.formatFunc(rawData, segInfo.precision, segInfo.divisor);
            jData["precision"] = segInfo.precision;
            jData["symbol"] = `${jData["token"]}_${jData["exchSeg"]}`;
            return jData;
        };
        this.decodeL2PKT = (specMatrix, pktLen, pktBuff) => {
            let segInfo = {
                precision: 2,
                divisor: 100.0
            };
            let noLevel = 0;
            const bids = [];
            const asks = [];
            let list = null;
            let lObj = {};
            const rawData = {};
            for (let indx = 3; indx < pktLen;) {
                const pktKey = pktBuff.readUint8(indx);
                indx += 1;
                const spec = specMatrix[pktKey];
                if (!spec) {
                    console.error(`Unknown Pkt spec breaking ${pktKey}`);
                    return null;
                }
                const framed = this.frameFromSpec(spec, pktBuff.subarray(indx, (indx + spec.len)));
                if (spec.key === "nDepth") {
                    noLevel = framed;
                    list = bids;
                }
                else if (spec.key === "exchSeg") {
                    segInfo = BinaryDefaultSpec_1.SEG_INFO[framed];
                    rawData[spec.key] = [spec, segInfo.exchSeg];
                }
                else {
                    if (list !== null) {
                        if (spec.fmt) {
                            lObj[spec.key] = spec.fmt(framed, segInfo.divisor);
                        }
                        else {
                            lObj[spec.key] = framed;
                        }
                    }
                    else {
                        rawData[spec.key] = [spec, framed];
                    }
                }
                if (!segInfo)
                    return null;
                if (list !== null) {
                    if (Object.keys(lObj).length === Constant_1.CONFIGS.BID_ASK_OBJ_LEN) {
                        list.push(lObj);
                        lObj = {};
                    }
                    if (noLevel === list.length) {
                        list = asks;
                    }
                }
                indx += spec.len;
            }
            const jData = this.formatFunc(rawData, segInfo.precision, segInfo.divisor);
            jData["bid"] = bids;
            jData["ask"] = asks;
            jData["precision"] = segInfo.precision;
            jData["symbol"] = `${jData["token"]}_${jData["exchSeg"]}`;
            return jData;
        };
    }
    frameFromSpec(spec, buff) {
        if (spec.type === "string") {
            return (0, Helper_1.ab2str)(buff);
        }
        else if (spec.type === "uint8") {
            return buff.readUInt8();
        }
        else if (spec.type === "uint16") {
            return buff.readUInt16LE();
        }
        else if (spec.type === "uint32") {
            return buff.readUInt32LE();
        }
        else if (spec.type === "int32") {
            return buff.readInt32LE();
        }
        else if (spec.type === "double") {
            return buff.readDoubleLE();
        }
        else if (spec.type === "float") {
            return buff.readFloatLE();
        }
        return "";
    }
    decodeOhlcPKT(specMatrix, pktLen, pktBuff) {
        const rawData = {};
        let segInfo = {
            precision: 2,
            divisor: 100.0
        };
        for (let indx = 3; indx < pktLen;) {
            const pktKey = pktBuff.readUint8(indx);
            indx += 1;
            const spec = specMatrix[pktKey];
            if (!spec) {
                console.error(`Unknown Pkt spec breaking ${pktKey}`);
                return rawData;
            }
            const framed = this.frameFromSpec(spec, pktBuff.subarray(indx, (indx + spec.len)));
            if (spec.key === "exchSeg") {
                segInfo = BinaryDefaultSpec_1.SEG_INFO[framed];
                rawData[spec.key] = [spec, segInfo.exchSeg];
            }
            else {
                rawData[spec.key] = [spec, framed];
            }
            indx += spec.len;
        }
        let jData = {};
        jData = this.formatFunc(rawData, segInfo.precision, segInfo.divisor);
        jData["precision"] = segInfo.precision;
        jData["symbol"] = `${jData["token"]}_${jData["exchSeg"]}`;
        return jData;
    }
    decodeMarketStatus(specMatrix, pktLen, pktBuff) {
        let segInfo = {
            precision: 2,
            divisor: 100.0
        };
        const jData = {};
        let lObj = {};
        let list = null;
        for (let indx = 3; indx < pktLen;) {
            const pktKey = pktBuff.readUint8(indx);
            indx += 1;
            const spec = specMatrix[pktKey];
            if (!spec) {
                console.error(`Unknown Pkt spec breaking ${pktKey}`);
                return null;
            }
            const framed = this.frameFromSpec(spec, pktBuff.subarray(indx, (indx + spec.len)));
            if (spec.key == "nLen") {
                list = [];
            }
            else {
                lObj[spec.key] = framed;
                if (spec.key === "exchSeg") {
                    segInfo = BinaryDefaultSpec_1.SEG_INFO[framed];
                    lObj[spec.key] = segInfo.exchSeg;
                }
            }
            if (list != null) {
                if (Object.keys(lObj).length === Constant_1.CONFIGS.MARKET_STATUS_OBJ_LEN) {
                    list.push(lObj);
                    lObj = {};
                }
            }
            indx += spec.len;
        }
        jData["status"] = list;
        return jData;
    }
    decodeMessage(specMatrix, pktLen, pktBuff) {
        const jData = {};
        for (let indx = 3; indx < pktLen;) {
            const pktKey = pktBuff.readUint8(indx);
            indx += 1;
            const spec = specMatrix[pktKey];
            if (!spec) {
                console.error(`Unknown Pkt spec breaking ${pktKey}`);
                return null;
            }
            const framed = this.frameFromSpec(spec, pktBuff.subarray(indx, (indx + spec.len)));
            if (spec.key === "nLen") {
                specMatrix[61].len = framed;
            }
            else {
                jData[spec.key] = framed;
            }
            indx += spec.len;
        }
        return jData;
    }
    decodeStatus(specMatrix, pktLen, pktBuff) {
        const jData = {};
        for (let indx = 3; indx < pktLen;) {
            const pktKey = pktBuff.readUint8(indx);
            indx += 1;
            const spec = specMatrix[pktKey];
            if (!spec) {
                console.error(`Unknown Pkt spec breaking ${pktKey}`);
                return null;
            }
            const framed = this.frameFromSpec(spec, pktBuff.subarray(indx, (indx + spec.len)));
            jData[spec.Key] = framed;
            indx += spec.len;
        }
        return jData;
    }
    decodeGreeks(specMatrix, pktLen, pktBuff) {
        let segInfo = {
            precision: 2,
            divisor: 100.0
        };
        const jData = {};
        for (let indx = 3; indx < pktLen;) {
            const pktKey = pktBuff.readUint8(indx);
            indx += 1;
            const spec = specMatrix[pktKey];
            if (!spec) {
                console.error(`Unknown Pkt spec breaking ${pktKey}`);
                return null;
            }
            const framed = this.frameFromSpec(spec, pktBuff.subarray(indx, (indx + spec.len)));
            if (spec.key === "exchSeg") {
                segInfo = BinaryDefaultSpec_1.SEG_INFO[framed];
                jData[spec.key] = segInfo.exchSeg;
            }
            else {
                jData[spec.key] = framed;
            }
            indx += spec.len;
        }
        jData["symbol"] = `${jData["token"]}_${jData["exchSeg"]}`;
        return jData;
    }
}
exports.default = BinaryParser;
