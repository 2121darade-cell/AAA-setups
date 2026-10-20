interface OptionDataMap {
    undId: string;
    expiry: string;
}
export default class SymbolStore {
    private version;
    private host;
    undMap: Map<string, Map<string, string[]>>;
    optionMap: Map<string, OptionDataMap>;
    constructor(host: string);
    load(): Promise<void>;
    private getApiVersion;
    private fetchSymbolMasters;
    private parseKeys;
    private parseSymbolTableData;
    private getKey;
    private updateCache;
}
export {};
