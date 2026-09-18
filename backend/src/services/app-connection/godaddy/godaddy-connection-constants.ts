export const buildGoDaddySsoKeyHeader = (apiKey: string, apiSecret: string) => `sso-key ${apiKey}:${apiSecret}`;
