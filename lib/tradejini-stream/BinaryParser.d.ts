/// <reference types="node" />
/// <reference types="node" />
export default class BinaryParser {
    decompressZLib: (zlibData: Buffer) => Promise<Buffer>;
    decodePKT: (pktBuff: Buffer) => number | {
        pktLen: number;
        jData: any;
    };
    private frameFromSpec;
    private formatFunc;
    private decodeL1PKT;
    decodeL2PKT: (specMatrix: any, pktLen: number, pktBuff: Buffer) => any;
    private decodeOhlcPKT;
    private decodeMarketStatus;
    private decodeMessage;
    private decodeStatus;
    private decodeGreeks;
}
