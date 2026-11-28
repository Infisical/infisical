import * as dnsPacket from "dns-packet";

import { crypto } from "@app/lib/crypto/cryptography";

import { signDnsMessage, TsigError, TTsigKey, TTsigVerification, verifyDnsReply } from "./dns-update-tsig";
import {
  buildQueryMessage,
  buildTxtUpdateMessage,
  DnsRecordType,
  isDnsNameInZone,
  normalizeDnsName,
  scanDnsMessage
} from "./dns-update-wire";

// Sends one message and resolves with the reply. Implementations own the socket, framing and timeouts.
export type TDnsTransport = (message: Buffer) => Promise<Buffer>;

export enum DnsRcode {
  NoError = 0,
  FormErr = 1,
  ServFail = 2,
  NxDomain = 3,
  NotImp = 4,
  Refused = 5,
  NotAuth = 9,
  NotZone = 10
}

export enum DnsUpdateErrorReason {
  // the server answered with a non-zero RCODE that is not a TSIG rejection
  Rcode = "rcode",
  // the server rejected our signature (BADKEY, BADSIG, BADTIME, BADTRUNC)
  TsigRejected = "tsig-rejected",
  // a success reply was unsigned or its signature did not verify, so it cannot be trusted
  UntrustedReply = "untrusted-reply",
  MalformedReply = "malformed-reply"
}

export class DnsUpdateError extends Error {
  reason: DnsUpdateErrorReason;

  rcode?: number;

  tsigError?: number;

  serverTime?: number;

  constructor({
    reason,
    message,
    rcode,
    tsigError,
    serverTime
  }: {
    reason: DnsUpdateErrorReason;
    message: string;
    rcode?: number;
    tsigError?: number;
    serverTime?: number;
  }) {
    super(message);
    this.name = "DnsUpdateError";
    this.reason = reason;
    this.rcode = rcode;
    this.tsigError = tsigError;
    this.serverTime = serverTime;
  }
}

const RCODE_MASK = 0x000f;
const AUTHORITATIVE_FLAG = 0x0400;
const RESPONSE_FLAG = 0x8000;

type TExchangeResult = {
  rcode: number;
  authoritative: boolean;
  verification: TTsigVerification;
  packet: dnsPacket.Packet;
};

export const createDnsUpdateClient = ({
  transport,
  key,
  now = () => Math.floor(Date.now() / 1000)
}: {
  transport: TDnsTransport;
  key: TTsigKey;
  now?: () => number;
}) => {
  const exchange = async (
    buildMessage: (id: number) => Buffer,
    { sign = true }: { sign?: boolean } = {}
  ): Promise<TExchangeResult> => {
    const id = crypto.randomInt(0, 0x10000);
    const { message, mac } = sign
      ? signDnsMessage(buildMessage(id), key, now())
      : { message: buildMessage(id), mac: Buffer.alloc(0) };
    const reply = await transport(message);

    let layout: ReturnType<typeof scanDnsMessage>;
    let packet: dnsPacket.Packet;
    let verification: TTsigVerification;
    try {
      // Our scanner has to run first: dns-packet does not cap compression pointer chains
      layout = scanDnsMessage(reply);
      packet = dnsPacket.decode(reply);
      verification = sign
        ? verifyDnsReply(reply, { key, requestMac: mac, now: now(), layout })
        : { status: "unsigned" };
    } catch (error) {
      throw new DnsUpdateError({
        reason: DnsUpdateErrorReason.MalformedReply,
        message: `the DNS server sent a reply that could not be read: ${(error as Error).message}`
      });
    }

    // eslint-disable-next-line no-bitwise
    if (layout.id !== id || !(layout.flags & RESPONSE_FLAG)) {
      throw new DnsUpdateError({
        reason: DnsUpdateErrorReason.MalformedReply,
        message: "the DNS server sent a reply that does not match the request"
      });
    }

    if (verification.status === "rejected") {
      throw new DnsUpdateError({
        reason: DnsUpdateErrorReason.TsigRejected,
        message: `the DNS server rejected the TSIG signature (${TsigError[verification.error] ?? verification.error})`,
        tsigError: verification.error,
        serverTime: verification.serverTime
      });
    }

    return {
      // eslint-disable-next-line no-bitwise
      rcode: layout.flags & RCODE_MASK,
      // eslint-disable-next-line no-bitwise
      authoritative: Boolean(layout.flags & AUTHORITATIVE_FLAG),
      verification,
      packet
    };
  };

  const assertRcode = (result: TExchangeResult, accepted: DnsRcode[] = [DnsRcode.NoError]) => {
    if (!accepted.includes(result.rcode)) {
      throw new DnsUpdateError({
        reason: DnsUpdateErrorReason.Rcode,
        message: `the DNS server answered ${DnsRcode[result.rcode] ?? `RCODE ${result.rcode}`}`,
        rcode: result.rcode
      });
    }
  };

  const assertVerified = ({ verification }: TExchangeResult) => {
    if (verification.status === "unsigned") {
      throw new DnsUpdateError({
        reason: DnsUpdateErrorReason.UntrustedReply,
        message: "the DNS server's reply was not signed with the TSIG key"
      });
    }
    if (verification.status === "invalid") {
      throw new DnsUpdateError({
        reason: DnsUpdateErrorReason.UntrustedReply,
        message: `the DNS server's reply failed TSIG verification: ${verification.reason}`
      });
    }
  };

  // PowerDNS answers a signed question with a bad key with a bare, unsigned NOTAUTH. Asking the same question
  // unsigned tells that apart from a server that answers NOTAUTH whatever the key.
  const assertKeyNotRejected = async (result: TExchangeResult, buildMessage: (id: number) => Buffer) => {
    if (result.rcode !== DnsRcode.NotAuth || result.verification.status !== "unsigned") return;
    const unsigned = await exchange(buildMessage, { sign: false });
    if (unsigned.rcode !== DnsRcode.NotAuth) {
      throw new DnsUpdateError({
        reason: DnsUpdateErrorReason.TsigRejected,
        message: "the DNS server rejected the TSIG key"
      });
    }
  };

  const updateTxtRecord = async ({
    zone,
    name,
    value,
    ttl,
    action
  }: {
    zone: string;
    name: string;
    value: string;
    ttl: number;
    action: "add" | "delete";
  }) => {
    const result = await exchange((id) => buildTxtUpdateMessage({ id, zone, name, value, ttl, action }));
    assertRcode(result);
    assertVerified(result);
  };

  // RFC 2308: an authoritative answer about any name in a zone carries the zone's SOA, whose owner is the apex.
  // A CNAME at the name is reported instead: the update would be ignored there, and the SOA belongs to the target.
  const findZone = async (name: string): Promise<{ zone?: string; cnameTarget?: string }> => {
    const buildMessage = (id: number) => buildQueryMessage({ id, name, type: DnsRecordType.SOA });
    const result = await exchange(buildMessage);
    await assertKeyNotRejected(result, buildMessage);
    if (result.rcode === DnsRcode.Refused || result.rcode === DnsRcode.NotAuth) return {};
    assertRcode(result, [DnsRcode.NoError, DnsRcode.NxDomain]);
    assertVerified(result);
    if (!result.authoritative) return {};

    const normalizedName = normalizeDnsName(name);
    const cname = (result.packet.answers ?? []).find(
      (record): record is dnsPacket.StringAnswer =>
        record.type === "CNAME" && normalizeDnsName(record.name) === normalizedName
    );
    if (cname) return { cnameTarget: normalizeDnsName(cname.data) };

    const soa = [...(result.packet.answers ?? []), ...(result.packet.authorities ?? [])].find(
      (record) => record.type === "SOA"
    );
    if (!soa) return {};

    const zone = normalizeDnsName(soa.name);
    return isDnsNameInZone(name, zone) ? { zone } : {};
  };

  const queryTxtRecord = async (name: string) => {
    const result = await exchange((id) => buildQueryMessage({ id, name, type: DnsRecordType.TXT }));
    assertRcode(result, [DnsRcode.NoError, DnsRcode.NxDomain]);
    assertVerified(result);

    const normalizedName = normalizeDnsName(name);
    const records = (result.packet.answers ?? []).filter((record) => normalizeDnsName(record.name) === normalizedName);

    const values = records
      .filter((record): record is dnsPacket.TxtAnswer => record.type === "TXT")
      .map((record) => {
        const chunks = Array.isArray(record.data) ? record.data : [record.data];
        return chunks.map((chunk) => (Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk)).join("");
      });
    const cname = records.find((record): record is dnsPacket.StringAnswer => record.type === "CNAME");

    return { values, cnameTarget: cname ? normalizeDnsName(cname.data) : undefined };
  };

  // Any signed request makes the server check our key first. A verified reply proves the key; an unsigned reply
  // with no TSIG error only proves the server is reachable, because some servers do not sign replies for names
  // they are not authoritative for.
  const checkKey = async (): Promise<"verified" | "unverified"> => {
    const buildMessage = (id: number) => buildQueryMessage({ id, name: ".", type: DnsRecordType.SOA });
    const result = await exchange(buildMessage);
    await assertKeyNotRejected(result, buildMessage);
    if (result.verification.status === "invalid") {
      throw new DnsUpdateError({
        reason: DnsUpdateErrorReason.UntrustedReply,
        message: `the DNS server's reply failed TSIG verification: ${result.verification.reason}`
      });
    }
    return result.verification.status === "verified" ? "verified" : "unverified";
  };

  return { updateTxtRecord, findZone, queryTxtRecord, checkKey };
};

export type TDnsUpdateClient = ReturnType<typeof createDnsUpdateClient>;
