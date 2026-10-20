import NxtradStream from "./NxtradStream";
export type CallBackFunction = (t: NxtradStream, a: any) => void;
export type ConnCallBackFunction = (t: NxtradStream, a: StatusMessage) => void;
export interface StatusMessage {
    s: string;
    code?: number;
    reason?: string;
}
export interface ReqToken {
    t: string;
}
export interface segInfoType {
    exchSeg?: string;
    precision: number;
    divisor: number;
}
