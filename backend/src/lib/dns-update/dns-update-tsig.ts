import { crypto } from "@app/lib/crypto/cryptography";

import {
  DnsClass,
  DnsRecordType,
  DnsWireError,
  encodeDnsName,
  encodeResourceRecord,
  normalizeDnsName,
  readDnsName,
  scanDnsMessage,
  TDnsMessageLayout,
  uint16,
  uint32,
  uint48
} from "./dns-update-wire";

export enum TsigAlgorithm {
  HmacSha256 = "hmac-sha256",
  HmacSha384 = "hmac-sha384",
  HmacSha512 = "hmac-sha512",
  HmacSha224 = "hmac-sha224",
  HmacSha1 = "hmac-sha1"
}

// RFC 8945 §5.2.3 error codes carried in the TSIG record, not the header
export enum TsigError {
  BadSig = 16,
  BadKey = 17,
  BadTime = 18,
  BadTrunc = 22
}

const TSIG_HASH: Record<TsigAlgorithm, string> = {
  [TsigAlgorithm.HmacSha256]: "sha256",
  [TsigAlgorithm.HmacSha384]: "sha384",
  [TsigAlgorithm.HmacSha512]: "sha512",
  [TsigAlgorithm.HmacSha224]: "sha224",
  [TsigAlgorithm.HmacSha1]: "sha1"
};

export const TSIG_FUDGE_SECONDS = 300;

export type TTsigKey = {
  name: string;
  algorithm: TsigAlgorithm;
  secret: Buffer;
};

type TTsigFields = {
  algorithm: string;
  timeSigned: number;
  fudge: number;
  mac: Buffer;
  originalId: number;
  error: number;
  otherData: Buffer;
};

const hmac = (key: TTsigKey, data: Buffer) =>
  crypto.nativeCrypto.createHmac(TSIG_HASH[key.algorithm], key.secret).update(data).digest();

// RFC 8945 §4.3.3: the TSIG variables, with names in canonical (lowercase, uncompressed) form
const encodeTsigVariables = (keyName: string, fields: Omit<TTsigFields, "mac" | "originalId">) =>
  Buffer.concat([
    encodeDnsName(keyName),
    uint16(DnsClass.ANY),
    uint32(0),
    encodeDnsName(fields.algorithm),
    uint48(fields.timeSigned),
    uint16(fields.fudge),
    uint16(fields.error),
    uint16(fields.otherData.length),
    fields.otherData
  ]);

export const signDnsMessage = (message: Buffer, key: TTsigKey, timeSigned: number) => {
  const fields = {
    algorithm: key.algorithm,
    timeSigned,
    fudge: TSIG_FUDGE_SECONDS,
    error: 0,
    otherData: Buffer.alloc(0)
  };
  const mac = hmac(key, Buffer.concat([message, encodeTsigVariables(key.name, fields)]));

  const rdata = Buffer.concat([
    encodeDnsName(key.algorithm),
    uint48(timeSigned),
    uint16(TSIG_FUDGE_SECONDS),
    uint16(mac.length),
    mac,
    uint16(message.readUInt16BE(0)),
    uint16(0),
    uint16(0)
  ]);

  const signed = Buffer.concat([
    message,
    encodeResourceRecord({ name: key.name, type: DnsRecordType.TSIG, klass: DnsClass.ANY, ttl: 0, rdata })
  ]);
  signed.writeUInt16BE(message.readUInt16BE(10) + 1, 10);

  return { message: signed, mac };
};

const readTsigRecord = (reply: Buffer, start: number) => {
  const owner = readDnsName(reply, start);
  let offset = owner.next;
  if (reply.readUInt16BE(offset) !== DnsRecordType.TSIG) return undefined;
  offset += 10;

  const algorithm = readDnsName(reply, offset);
  offset = algorithm.next;
  const timeSigned = reply.readUIntBE(offset, 6);
  const fudge = reply.readUInt16BE(offset + 6);
  const macSize = reply.readUInt16BE(offset + 8);
  offset += 10;
  if (offset + macSize + 6 > reply.length) throw new DnsWireError("DNS reply has a truncated TSIG record");
  const mac = reply.subarray(offset, offset + macSize);
  offset += macSize;
  const originalId = reply.readUInt16BE(offset);
  const error = reply.readUInt16BE(offset + 2);
  const otherLength = reply.readUInt16BE(offset + 4);
  offset += 6;
  if (offset + otherLength > reply.length) throw new DnsWireError("DNS reply has a truncated TSIG record");
  const otherData = reply.subarray(offset, offset + otherLength);

  return {
    keyName: owner.name,
    fields: { algorithm: algorithm.name, timeSigned, fudge, mac, originalId, error, otherData }
  };
};

export type TTsigVerification =
  | { status: "verified" }
  | { status: "unsigned" }
  // the server rejected our request's signature; such replies are unsigned (RFC 8945 §5.3.2)
  | { status: "rejected"; error: number; serverTime?: number }
  | { status: "invalid"; reason: string };

export const verifyDnsReply = (
  reply: Buffer,
  {
    key,
    requestMac,
    now,
    layout = scanDnsMessage(reply)
  }: { key: TTsigKey; requestMac: Buffer; now: number; layout?: TDnsMessageLayout }
): TTsigVerification => {
  const tsig = layout.lastAdditionalStart === undefined ? undefined : readTsigRecord(reply, layout.lastAdditionalStart);
  if (!tsig || layout.lastAdditionalStart === undefined) return { status: "unsigned" };

  const { keyName, fields } = tsig;

  if (fields.error !== 0) {
    const serverTime =
      fields.error === TsigError.BadTime && fields.otherData.length === 6
        ? fields.otherData.readUIntBE(0, 6)
        : undefined;
    return { status: "rejected", error: fields.error, serverTime };
  }

  if (keyName !== normalizeDnsName(key.name) || fields.algorithm !== normalizeDnsName(key.algorithm)) {
    return { status: "invalid", reason: "the reply was signed with a different key" };
  }

  const stripped = Buffer.from(reply.subarray(0, layout.lastAdditionalStart));
  stripped.writeUInt16BE(fields.originalId, 0);
  stripped.writeUInt16BE(layout.additionalCount - 1, 10);

  const expected = hmac(
    key,
    Buffer.concat([uint16(requestMac.length), requestMac, stripped, encodeTsigVariables(key.name, fields)])
  );

  if (fields.mac.length !== expected.length || !crypto.nativeCrypto.timingSafeEqual(fields.mac, expected)) {
    return { status: "invalid", reason: "the reply's signature does not match the key" };
  }

  if (Math.abs(now - fields.timeSigned) > fields.fudge) {
    return { status: "invalid", reason: "the reply's signature has expired" };
  }

  return { status: "verified" };
};
