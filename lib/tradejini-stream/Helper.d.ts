/// <reference types="node" />
/// <reference types="node" />
export declare const divideFunc: (value: number, precision?: number, divisor?: number) => number;
export declare const dateFmt: (value: number) => string | number;
export declare const ab2str: (buff: Buffer) => string;
export declare const MakeGetHttpCall: (url: string, headers: Record<string, any>) => Promise<any>;
export declare const splitResponse: (response: string, idSeparator: string, stringSeparator: string) => Array<Array<string>>;
export declare const splitId: (ids: string, idFormat: string) => {
    [key: string]: string;
};
export declare const isOptions: (instrumentType: string) => boolean;
