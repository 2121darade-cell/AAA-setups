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
exports.isOptions = exports.splitId = exports.splitResponse = exports.MakeGetHttpCall = exports.ab2str = exports.dateFmt = exports.divideFunc = void 0;
const Constant_1 = require("./Constant");
const axios_1 = __importDefault(require("axios"));
const divideFunc = (value, precision = 2, divisor = 100.0) => {
    return (value / divisor);
};
exports.divideFunc = divideFunc;
const dateFmt = (value) => {
    if (!value)
        return value;
    value = value * 1000;
    const date = new Date(value);
    const ddVal = date.getDate() < 10 ? `0${date.getDate()}` : date.getDate();
    const mmVal = (date.getMonth() + 1) < 10 ? `0${date.getMonth() + 1}` : date.getMonth() + 1;
    const yyyy = date.getFullYear();
    const hours = date.getHours() < 10 ? `0${date.getHours()}` : date.getHours();
    const min = date.getMinutes() < 10 ? `0${date.getMinutes()}` : date.getMinutes();
    const seconds = date.getSeconds() < 10 ? `0${date.getSeconds()}` : date.getSeconds();
    const time = `${hours}:${min}:${seconds}`;
    const fullDate = `${yyyy}-${mmVal}-${ddVal} ${time}`;
    return fullDate;
};
exports.dateFmt = dateFmt;
const ab2str = (buff) => {
    const result = String.fromCharCode(...Uint8Array.from(buff));
    return result.replace(/\0/g, "");
};
exports.ab2str = ab2str;
const MakeGetHttpCall = (url, headers) => __awaiter(void 0, void 0, void 0, function* () {
    const response = yield axios_1.default.get(url, {
        headers: headers,
        timeout: 20000
    });
    return response.data;
});
exports.MakeGetHttpCall = MakeGetHttpCall;
const splitResponse = (response, idSeparator, stringSeparator) => {
    return response.split(idSeparator).map((index) => {
        return index.split(stringSeparator);
    });
};
exports.splitResponse = splitResponse;
const splitId = (ids, idFormat) => {
    const idQuery = `${idFormat}~${ids}`;
    const queryResp = (0, exports.splitResponse)(idQuery, "~", "_");
    const [keys, ...values] = queryResp;
    const parsedSymArrayData = values.map((value) => {
        const unMapSymResp = keys.reduce((obj, key, inx) => {
            obj[key] = value[inx];
            return obj;
        }, {});
        return unMapSymResp;
    });
    return parsedSymArrayData[0];
};
exports.splitId = splitId;
const isOptions = (instrumentType) => {
    return Constant_1.OPTION_INSTRUMENT_TYPE.includes(instrumentType);
};
exports.isOptions = isOptions;
