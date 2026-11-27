export type { TDnsTransport, TDnsUpdateClient } from "./dns-update-client";
export { createDnsUpdateClient, DnsRcode, DnsUpdateError, DnsUpdateErrorReason } from "./dns-update-client";
export type { TTsigKey } from "./dns-update-tsig";
export { TsigAlgorithm, TsigError } from "./dns-update-tsig";
export { isDnsNameInZone, isValidDnsName, MAX_DNS_MESSAGE_LENGTH, normalizeDnsName } from "./dns-update-wire";
