import RE2 from "re2";

// Encoding and scanning of the DNS wire format for RFC 2136 updates. dns-packet cannot encode class NONE, which
// deleting a single record needs, so outgoing messages are built here and dns-packet only decodes replies.

export const DNS_HEADER_LENGTH = 12;
export const MAX_DNS_MESSAGE_LENGTH = 65_535;

export enum DnsOpcode {
  Query = 0,
  Update = 5
}

export enum DnsRecordType {
  CNAME = 5,
  SOA = 6,
  TXT = 16,
  TSIG = 250
}

export enum DnsClass {
  IN = 1,
  NONE = 254,
  ANY = 255
}

const MAX_LABEL_LENGTH = 63;
const MAX_NAME_WIRE_LENGTH = 255;
const MAX_TXT_STRING_LENGTH = 255;
// Hostname-style labels only: anything else (spaces, CR/LF) would reach a non-DNS service raw if one is configured.
const LABEL_REGEX = new RE2("^[A-Za-z0-9_-]+$");

export class DnsWireError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DnsWireError";
  }
}

export const normalizeDnsName = (name: string) => {
  const lower = name.trim().toLowerCase();
  return lower.endsWith(".") ? lower.slice(0, -1) : lower;
};

export const encodeDnsName = (name: string): Buffer => {
  const normalized = normalizeDnsName(name);
  const labels = normalized ? normalized.split(".") : [];
  const parts: Buffer[] = [];

  for (const label of labels) {
    const bytes = Buffer.from(label, "ascii");
    if (bytes.length > MAX_LABEL_LENGTH || !LABEL_REGEX.test(label)) {
      throw new DnsWireError(`'${name}' is not a valid DNS name`);
    }
    parts.push(Buffer.from([bytes.length]), bytes);
  }
  parts.push(Buffer.from([0]));

  const encoded = Buffer.concat(parts);
  if (encoded.length > MAX_NAME_WIRE_LENGTH) {
    throw new DnsWireError(`'${name}' is longer than a DNS name can be`);
  }
  return encoded;
};

export const isValidDnsName = (name: string) => {
  try {
    encodeDnsName(name);
    return Boolean(normalizeDnsName(name));
  } catch {
    return false;
  }
};

// Label-wise suffix match: "a.corp.com" is in "corp.com", "acorp.com" is not.
export const isDnsNameInZone = (name: string, zone: string) => {
  const normalizedName = normalizeDnsName(name);
  const normalizedZone = normalizeDnsName(zone);
  if (!normalizedZone) return true;
  return normalizedName === normalizedZone || normalizedName.endsWith(`.${normalizedZone}`);
};

export const uint16 = (value: number) => {
  const buf = Buffer.alloc(2);
  buf.writeUInt16BE(value, 0);
  return buf;
};

export const uint32 = (value: number) => {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(value, 0);
  return buf;
};

export const uint48 = (value: number) => {
  const buf = Buffer.alloc(6);
  buf.writeUIntBE(value, 0, 6);
  return buf;
};

// The delete of a TXT value must carry exactly the bytes its add carried (RFC 2136 §2.5.4), so both use this.
export const encodeTxtRdata = (value: string): Buffer => {
  const bytes = Buffer.from(value, "utf8");
  if (!bytes.length) return Buffer.from([0]);
  const parts: Buffer[] = [];
  for (let offset = 0; offset < bytes.length; offset += MAX_TXT_STRING_LENGTH) {
    const chunk = bytes.subarray(offset, offset + MAX_TXT_STRING_LENGTH);
    parts.push(Buffer.from([chunk.length]), chunk);
  }
  return Buffer.concat(parts);
};

export const encodeResourceRecord = ({
  name,
  type,
  klass,
  ttl,
  rdata
}: {
  name: string;
  type: DnsRecordType;
  klass: DnsClass;
  ttl: number;
  rdata: Buffer;
}) => Buffer.concat([encodeDnsName(name), uint16(type), uint16(klass), uint32(ttl), uint16(rdata.length), rdata]);

const encodeHeader = ({
  id,
  opcode,
  questionCount,
  authorityCount = 0
}: {
  id: number;
  opcode: DnsOpcode;
  questionCount: number;
  authorityCount?: number;
}) =>
  Buffer.concat([
    uint16(id),
    // eslint-disable-next-line no-bitwise
    uint16(opcode << 11),
    uint16(questionCount),
    uint16(0),
    uint16(authorityCount),
    uint16(0)
  ]);

// In an UPDATE the question section is the zone section and the authority section is the update section.
export const buildTxtUpdateMessage = ({
  id,
  zone,
  name,
  value,
  ttl,
  action
}: {
  id: number;
  zone: string;
  name: string;
  value: string;
  ttl: number;
  action: "add" | "delete";
}) => {
  const record =
    action === "add"
      ? encodeResourceRecord({ name, type: DnsRecordType.TXT, klass: DnsClass.IN, ttl, rdata: encodeTxtRdata(value) })
      : encodeResourceRecord({
          name,
          type: DnsRecordType.TXT,
          klass: DnsClass.NONE,
          ttl: 0,
          rdata: encodeTxtRdata(value)
        });

  return Buffer.concat([
    encodeHeader({ id, opcode: DnsOpcode.Update, questionCount: 1, authorityCount: 1 }),
    encodeDnsName(zone),
    uint16(DnsRecordType.SOA),
    uint16(DnsClass.IN),
    record
  ]);
};

export const buildQueryMessage = ({ id, name, type }: { id: number; name: string; type: DnsRecordType }) =>
  Buffer.concat([
    encodeHeader({ id, opcode: DnsOpcode.Query, questionCount: 1 }),
    encodeDnsName(name),
    uint16(type),
    uint16(DnsClass.IN)
  ]);

const ensureAvailable = (buf: Buffer, offset: number, length: number) => {
  if (offset + length > buf.length) throw new DnsWireError("DNS message is truncated");
};

// Bounded by RFC 1035 rules a hostile server could otherwise break to make us expand huge names: a name is at most
// 255 bytes, and a compression pointer only points to an earlier position (which also rules out loops).
export const readDnsName = (buf: Buffer, start: number): { name: string; next: number } => {
  const labels: string[] = [];
  let offset = start;
  let next = -1;
  let wireLength = 1;

  for (;;) {
    ensureAvailable(buf, offset, 1);
    const length = buf[offset];

    if (length === 0) {
      if (next === -1) next = offset + 1;
      break;
    }

    // eslint-disable-next-line no-bitwise
    if ((length & 0xc0) === 0xc0) {
      ensureAvailable(buf, offset, 2);
      if (next === -1) next = offset + 2;
      // eslint-disable-next-line no-bitwise
      const target = buf.readUInt16BE(offset) & 0x3fff;
      if (target >= offset) throw new DnsWireError("DNS message has a name pointer that does not point backwards");
      offset = target;
    } else {
      // eslint-disable-next-line no-bitwise
      if (length & 0xc0) throw new DnsWireError("DNS message has an unsupported label type");
      wireLength += 1 + length;
      if (wireLength > MAX_NAME_WIRE_LENGTH) throw new DnsWireError("DNS message has a name longer than 255 bytes");
      ensureAvailable(buf, offset + 1, length);
      labels.push(buf.toString("ascii", offset + 1, offset + 1 + length));
      offset += 1 + length;
    }
  }

  return { name: normalizeDnsName(labels.join(".")), next };
};

export type TDnsMessageLayout = {
  id: number;
  flags: number;
  additionalCount: number;
  // start offset of the last record in the additional section, which is where a TSIG record must sit
  lastAdditionalStart?: number;
};

export const scanDnsMessage = (buf: Buffer): TDnsMessageLayout => {
  ensureAvailable(buf, 0, DNS_HEADER_LENGTH);
  const id = buf.readUInt16BE(0);
  const flags = buf.readUInt16BE(2);
  const questionCount = buf.readUInt16BE(4);
  const recordCount = buf.readUInt16BE(6) + buf.readUInt16BE(8);
  const additionalCount = buf.readUInt16BE(10);

  let offset = DNS_HEADER_LENGTH;
  for (let i = 0; i < questionCount; i += 1) {
    offset = readDnsName(buf, offset).next + 4;
  }

  let lastAdditionalStart: number | undefined;
  for (let i = 0; i < recordCount + additionalCount; i += 1) {
    if (i >= recordCount) lastAdditionalStart = offset;
    offset = readDnsName(buf, offset).next;
    ensureAvailable(buf, offset, 10);
    offset += 10 + buf.readUInt16BE(offset + 8);
    ensureAvailable(buf, offset, 0);
  }

  return { id, flags, additionalCount, lastAdditionalStart };
};
