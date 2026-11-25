import { afterEach, describe, expect, it, vi } from "vitest";

import { crypto } from "@app/lib/crypto/cryptography";

import { createDnsUpdateClient, DnsUpdateErrorReason } from "./dns-update-client";
import { signDnsMessage, TsigAlgorithm, TsigError, verifyDnsReply } from "./dns-update-tsig";
import {
  buildQueryMessage,
  buildTxtUpdateMessage,
  DnsRecordType,
  encodeDnsName,
  encodeTxtRdata,
  isDnsNameInZone,
  isValidDnsName,
  readDnsName,
  scanDnsMessage,
  uint16
} from "./dns-update-wire";

// Requests were signed by this module, accepted by dnspython 2.7.0 (an independent implementation) and answered
// with replies dnspython signed with the same key at the same time.
const KEY = {
  name: "infisical-acme",
  algorithm: TsigAlgorithm.HmacSha256,
  secret: Buffer.from("c2VjcmV0LWtleS1mb3ItdGVzdHMtMTIzNDU2Nzg5MDEy", "base64")
};
const TIME_SIGNED = 1700000000;
const NAME = "_acme-challenge.api.corp.com";

const FIXTURES = {
  add: {
    id: 0x1a2b,
    request:
      "1a2b2800000100000001000104636f727003636f6d00000600010f5f61636d652d6368616c6c656e67650361706904636f727003636f6d00001000010000003c000706583766396b510e696e6669736963616c2d61636d650000fa00ff00000000003d0b686d61632d7368613235360000006553f100012c0020a52d9024cdebe624efb49d232e096154f70960b103e1ef757cffbbe9e2e199141a2b00000000",
    response:
      "1a2bac00000100000000000104636f727003636f6d00000600010e696e6669736963616c2d61636d650000fa00ff00000000003d0b686d61632d7368613235360000006553f100012c0020a708a6e97c5af1a5926c379a5a12657fcd8230e9c71aefe605bc7858fce3a3521a2b00000000"
  },
  del: {
    id: 0x1a2c,
    request:
      "1a2c2800000100000001000104636f727003636f6d00000600010f5f61636d652d6368616c6c656e67650361706904636f727003636f6d00001000fe00000000000706583766396b510e696e6669736963616c2d61636d650000fa00ff00000000003d0b686d61632d7368613235360000006553f100012c00205d56f19d841cd31b87c643df5ae58989f1059145b244a005a8b89c2f48ed41291a2c00000000",
    response:
      "1a2cac00000100000000000104636f727003636f6d00000600010e696e6669736963616c2d61636d650000fa00ff00000000003d0b686d61632d7368613235360000006553f100012c002094012ca5aff02af1d67fb931aa47335400caa8c46c8a73dcb94dfd43e45fa6f81a2c00000000"
  },
  soa: {
    id: 0x1a2d,
    request:
      "1a2d000000010000000000010f5f61636d652d6368616c6c656e67650361706904636f727003636f6d00000600010e696e6669736963616c2d61636d650000fa00ff00000000003d0b686d61632d7368613235360000006553f100012c0020cd27d0b4c30438633bdf21c80f192de358733e695c9af969a475e99eb5dc21711a2d00000000",
    response:
      "1a2d840000010000000100010f5f61636d652d6368616c6c656e67650361706904636f727003636f6d0000060001c0200006000100000e100022036e7331c0200561646d696ec0200000000100001c2000000e10001275000000012c0e696e6669736963616c2d61636d650000fa00ff00000000003d0b686d61632d7368613235360000006553f100012c002027fa1594b1ada5a01356475891abedcef782efcc0f32b13c52015e6d88582b901a2d00000000"
  },
  txt: {
    id: 0x1a2e,
    request:
      "1a2e000000010000000000010f5f61636d652d6368616c6c656e67650361706904636f727003636f6d00001000010e696e6669736963616c2d61636d650000fa00ff00000000003d0b686d61632d7368613235360000006553f100012c00209e50d6b064a50281ff325405a53bd82cd87ff054b2b071828040010efc0168091a2e00000000",
    response:
      "1a2e840000010002000000010f5f61636d652d6368616c6c656e67650361706904636f727003636f6d0000100001c00c001000010000003c000706583766396b51c00c001000010000003c0006056f746865720e696e6669736963616c2d61636d650000fa00ff00000000003d0b686d61632d7368613235360000006553f100012c00200989f5ec77ee841aa23e735851356362c338e0dfd3d06ea2439af74c2797fec01a2e00000000"
  },
  cname: {
    id: 0x1a2f,
    response:
      "1a2f840000010001000000010f5f61636d652d6368616c6c656e67650361706904636f727003636f6d0000100001c00c000500010000003c000b036170690461636d65c0200e696e6669736963616c2d61636d650000fa00ff00000000003d0b686d61632d7368613235360000006553f100012c0020312028f45f9201a1520467ad232bc2dbb869f72ff801bd1e5203296a009857521a2f00000000"
  },
  soaCname: {
    id: 0x1a31,
    response:
      "1a31840000010001000000010f5f61636d652d6368616c6c656e67650361706904636f727003636f6d0000060001c00c000500010000003c0013036170690961636d652d7a6f6e65036e6574000e696e6669736963616c2d61636d650000fa00ff00000000003d0b686d61632d7368613235360000006553f100012c00208513b3f734bf85df9260d7f8d5baed0e6dbbc4affbd3ff8f0c18e6e62c76192a1a3100000000"
  },
  refusedRoot: {
    id: 0x1a30,
    response:
      "1a308005000100000000000100000600010e696e6669736963616c2d61636d650000fa00ff00000000003d0b686d61632d7368613235360000006553f100012c00208fcc44b995f97d925d00af56fdc74f0a150c75ba6ff6823771bf7cb7b784e4081a3000000000"
  }
};

const hex = (value: string) => Buffer.from(value, "hex");

// The TSIG record is the last record in each fixture; dropping it and decrementing ARCOUNT leaves an unsigned reply.
const stripTsig = (reply: Buffer) => {
  const tsigStart = reply.indexOf(encodeDnsName(KEY.name), 12);
  const stripped = Buffer.from(reply.subarray(0, tsigStart));
  stripped.writeUInt16BE(reply.readUInt16BE(10) - 1, 10);
  return stripped;
};

// What a server sends when it rejects our signature: the request's sections echoed, an empty MAC and an error.
const buildRejectedReply = (request: Buffer, error: TsigError) => {
  const tsigStart = request.indexOf(encodeDnsName(KEY.name), 12);
  const reply = Buffer.concat([
    request.subarray(0, tsigStart),
    encodeDnsName(KEY.name),
    uint16(DnsRecordType.TSIG),
    uint16(255),
    Buffer.alloc(4),
    uint16(encodeDnsName(KEY.algorithm).length + 16),
    encodeDnsName(KEY.algorithm),
    Buffer.from([0, 0, 0x65, 0x53, 0xf1, 0]),
    uint16(300),
    uint16(0),
    uint16(request.readUInt16BE(0)),
    uint16(error),
    uint16(0)
  ]);
  reply.writeUInt16BE(0xa809, 2);
  return reply;
};

// A bare reply to any request: its sections echoed, no TSIG, flagged as a response with the given RCODE.
const bareReply = (request: Buffer, rcode: number) => {
  const tsigStart = request.indexOf(encodeDnsName(KEY.name), 12);
  const reply = Buffer.from(tsigStart === -1 ? request : request.subarray(0, tsigStart));
  // eslint-disable-next-line no-bitwise
  reply.writeUInt16BE(0x8000 | rcode, 2);
  reply.writeUInt16BE(0, 10);
  return reply;
};

const withRcode = (reply: Buffer, rcode: number) => {
  const copy = Buffer.from(reply);
  // eslint-disable-next-line no-bitwise
  copy.writeUInt16BE((copy.readUInt16BE(2) & 0xfff0) | rcode, 2);
  return copy;
};

const createClient = (id: number, reply: Buffer | ((request: Buffer) => Buffer)) => {
  vi.spyOn(crypto, "randomInt").mockReturnValue(id as unknown as void);
  const transport = vi.fn(async (request: Buffer) => (typeof reply === "function" ? reply(request) : reply));
  return { transport, client: createDnsUpdateClient({ transport, key: KEY, now: () => TIME_SIGNED }) };
};

describe("dns-update wire format", () => {
  it("builds signed add, delete and query messages byte for byte", () => {
    const sign = (message: Buffer) => signDnsMessage(message, KEY, TIME_SIGNED).message.toString("hex");

    expect(
      sign(buildTxtUpdateMessage({ id: 0x1a2b, zone: "corp.com", name: NAME, value: "X7f9kQ", ttl: 60, action: "add" }))
    ).toBe(FIXTURES.add.request);
    expect(
      sign(
        buildTxtUpdateMessage({ id: 0x1a2c, zone: "corp.com", name: NAME, value: "X7f9kQ", ttl: 60, action: "delete" })
      )
    ).toBe(FIXTURES.del.request);
    expect(sign(buildQueryMessage({ id: 0x1a2d, name: NAME, type: DnsRecordType.SOA }))).toBe(FIXTURES.soa.request);
  });

  it("matches zones label by label, ignoring case and a trailing dot", () => {
    expect(isDnsNameInZone("_acme-challenge.API.corp.com.", "corp.com")).toBe(true);
    expect(isDnsNameInZone("corp.com", "Corp.Com.")).toBe(true);
    expect(isDnsNameInZone("_acme-challenge.acorp.com", "corp.com")).toBe(false);
    expect(isDnsNameInZone("corp.com", "api.corp.com")).toBe(false);
  });

  it("rejects names that cannot be encoded", () => {
    expect(isValidDnsName("corp.com")).toBe(true);
    expect(isValidDnsName("key_1.example-zone.com")).toBe(true);
    expect(isValidDnsName("infisical-acme\r\nset injected 0 0 1")).toBe(false);
    expect(isValidDnsName("infisical acme")).toBe(false);
    expect(isValidDnsName("corp..com")).toBe(false);
    expect(isValidDnsName(`${"a".repeat(64)}.com`)).toBe(false);
    expect(isValidDnsName("bücher.de")).toBe(false);
    expect(isValidDnsName("")).toBe(false);
  });

  it("refuses names longer than 255 bytes, however they are compressed", () => {
    // 64-byte labels chained by pointers, each pointing back at the previous one
    const parts: number[] = [];
    const starts: number[] = [];
    for (let k = 0; k < 8; k += 1) {
      starts.push(parts.length);
      parts.push(63, ...new Array<number>(63).fill(0x61));
      if (k === 0) parts.push(0);
      // eslint-disable-next-line no-bitwise
      else parts.push(0xc0 | (starts[k - 1] >> 8), starts[k - 1] & 0xff);
    }
    expect(() => readDnsName(Buffer.from(parts), starts[7])).toThrow(/longer than 255 bytes/);
  });

  it("refuses name pointers that do not point backwards", () => {
    expect(() => readDnsName(Buffer.from([0xc0, 0x00]), 0)).toThrow(/does not point backwards/);
    expect(() => readDnsName(Buffer.from([0xc0, 0x02, 1, 0x61, 0]), 0)).toThrow(/does not point backwards/);
  });

  it("caps pointer chains at one hop per possible label", () => {
    // the root name at offset 0, then pointers that each point at the pointer before them
    const pointerChain = (hops: number) => {
      const parts = [0];
      for (let k = 0; k < hops; k += 1) {
        const target = k === 0 ? 0 : 1 + (k - 1) * 2;
        // eslint-disable-next-line no-bitwise
        parts.push(0xc0 | (target >> 8), target & 0xff);
      }
      return { buf: Buffer.from(parts), start: 1 + (hops - 1) * 2 };
    };

    const allowed = pointerChain(127);
    expect(readDnsName(allowed.buf, allowed.start).name).toBe("");
    const tooMany = pointerChain(128);
    expect(() => readDnsName(tooMany.buf, tooMany.start)).toThrow(/too many compression pointers/);
  });

  it("refuses a reply made of many questions that each walk a longer pointer chain", () => {
    // each question's name points at the previous question's name, so question k walks k pointers
    const questionCount = 8000;
    const questions = [0, 0, 16, 0, 1];
    for (let k = 1; k < questionCount; k += 1) {
      const target = k === 1 ? 12 : 17 + (k - 2) * 6;
      // eslint-disable-next-line no-bitwise
      questions.push(0xc0 | (target >> 8), target & 0xff, 0, 16, 0, 1);
    }
    const header = [0, 1, 0x80, 0, ...uint16(questionCount), 0, 0, 0, 0, 0, 0];

    expect(() => scanDnsMessage(Buffer.from([...header, ...questions]))).toThrow(/more than one question/);
  });

  it("caps pointer chains in record data that dns-packet would follow", () => {
    // an opaque record holding a pointer chain, then CNAMEs whose targets point at the end of it (one more hop)
    const buildReply = (hops: number, cnames: number) => {
      const chainStart = 12 + 11;
      const chain = [0];
      for (let k = 0; k < hops; k += 1) {
        const target = k === 0 ? chainStart : chainStart + 1 + (k - 1) * 2;
        // eslint-disable-next-line no-bitwise
        chain.push(0xc0 | (target >> 8), target & 0xff);
      }
      const chainEnd = chainStart + 1 + (hops - 1) * 2;
      const opaque = [0, 0, 10, 0, 1, 0, 0, 0, 0, ...uint16(chain.length), ...chain];
      const cnameRecords: number[] = [];
      for (let c = 0; c < cnames; c += 1) {
        // eslint-disable-next-line no-bitwise
        cnameRecords.push(0, 0, 5, 0, 1, 0, 0, 0, 0, 0, 2, 0xc0 | (chainEnd >> 8), chainEnd & 0xff);
      }
      const header = [0, 1, 0x80, 0, 0, 0, ...uint16(1 + cnames), 0, 0, 0, 0];
      return Buffer.from([...header, ...opaque, ...cnameRecords]);
    };

    expect(() => scanDnsMessage(buildReply(126, 50))).not.toThrow();
    expect(() => scanDnsMessage(buildReply(500, 50))).toThrow(/too many compression pointers/);
    expect(() => scanDnsMessage(buildReply(10, 100))).toThrow(/more than 100 records/);
  });

  it("splits TXT values longer than 255 bytes into several strings", () => {
    const rdata = encodeTxtRdata("a".repeat(300));
    expect(rdata.length).toBe(302);
    expect(rdata[0]).toBe(255);
    expect(rdata[256]).toBe(45);
  });
});

describe("dns-update TSIG verification", () => {
  const requestMac = (request: string) => {
    const message = hex(request);
    return message.subarray(message.length - 6 - 32, message.length - 6);
  };

  it("verifies replies signed by an independent implementation", () => {
    for (const fixture of [FIXTURES.add, FIXTURES.del, FIXTURES.soa, FIXTURES.txt]) {
      expect(
        verifyDnsReply(hex(fixture.response), { key: KEY, requestMac: requestMac(fixture.request), now: TIME_SIGNED })
      ).toEqual({ status: "verified" });
    }
  });

  it("refuses a reply with one changed byte", () => {
    const tampered = hex(FIXTURES.add.response);
    tampered[20] += 1;
    expect(
      verifyDnsReply(tampered, { key: KEY, requestMac: requestMac(FIXTURES.add.request), now: TIME_SIGNED }).status
    ).toBe("invalid");
  });

  it("refuses a reply when the secret differs", () => {
    expect(
      verifyDnsReply(hex(FIXTURES.add.response), {
        key: { ...KEY, secret: Buffer.from("another-secret") },
        requestMac: requestMac(FIXTURES.add.request),
        now: TIME_SIGNED
      }).status
    ).toBe("invalid");
  });

  it("refuses a reply signed outside the fudge window", () => {
    expect(
      verifyDnsReply(hex(FIXTURES.add.response), {
        key: KEY,
        requestMac: requestMac(FIXTURES.add.request),
        now: TIME_SIGNED + 301
      })
    ).toEqual({ status: "invalid", reason: "the reply's signature has expired" });
  });

  it("reports unsigned replies and server-side TSIG rejections", () => {
    expect(
      verifyDnsReply(stripTsig(hex(FIXTURES.add.response)), {
        key: KEY,
        requestMac: requestMac(FIXTURES.add.request),
        now: TIME_SIGNED
      })
    ).toEqual({ status: "unsigned" });
    expect(
      verifyDnsReply(buildRejectedReply(hex(FIXTURES.add.request), TsigError.BadSig), {
        key: KEY,
        requestMac: requestMac(FIXTURES.add.request),
        now: TIME_SIGNED
      })
    ).toEqual({ status: "rejected", error: TsigError.BadSig, serverTime: undefined });
  });
});

describe("dns-update client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds a TXT value with a verified reply", async () => {
    const { client, transport } = createClient(FIXTURES.add.id, hex(FIXTURES.add.response));
    await client.updateTxtRecord({ zone: "corp.com", name: NAME, value: "X7f9kQ", ttl: 60, action: "add" });
    expect(transport.mock.calls[0][0].toString("hex")).toBe(FIXTURES.add.request);
  });

  it("never treats an unsigned success as success", async () => {
    const { client } = createClient(FIXTURES.add.id, stripTsig(hex(FIXTURES.add.response)));
    await expect(
      client.updateTxtRecord({ zone: "corp.com", name: NAME, value: "X7f9kQ", ttl: 60, action: "add" })
    ).rejects.toMatchObject({ reason: DnsUpdateErrorReason.UntrustedReply });
  });

  it("surfaces the server's RCODE and TSIG errors", async () => {
    const refused = createClient(FIXTURES.add.id, withRcode(stripTsig(hex(FIXTURES.add.response)), 5));
    await expect(
      refused.client.updateTxtRecord({ zone: "corp.com", name: NAME, value: "X7f9kQ", ttl: 60, action: "add" })
    ).rejects.toMatchObject({ reason: DnsUpdateErrorReason.Rcode, rcode: 5 });

    const badKey = createClient(FIXTURES.add.id, (request) => buildRejectedReply(request, TsigError.BadKey));
    await expect(
      badKey.client.updateTxtRecord({ zone: "corp.com", name: NAME, value: "X7f9kQ", ttl: 60, action: "add" })
    ).rejects.toMatchObject({ reason: DnsUpdateErrorReason.TsigRejected, tsigError: TsigError.BadKey });
  });

  it("refuses a reply to a different message", async () => {
    const { client } = createClient(FIXTURES.add.id + 1, hex(FIXTURES.add.response));
    await expect(
      client.updateTxtRecord({ zone: "corp.com", name: NAME, value: "X7f9kQ", ttl: 60, action: "add" })
    ).rejects.toMatchObject({
      reason: DnsUpdateErrorReason.MalformedReply,
      message: "the DNS server sent a reply that does not match the request"
    });
  });

  it("finds the zone from the SOA in an authoritative reply", async () => {
    const { client, transport } = createClient(FIXTURES.soa.id, hex(FIXTURES.soa.response));
    await expect(client.findZone(NAME)).resolves.toEqual({ zone: "corp.com" });
    expect(transport.mock.calls[0][0].toString("hex")).toBe(FIXTURES.soa.request);
  });

  it("finds no zone when the server refuses", async () => {
    const { client } = createClient(FIXTURES.soa.id, withRcode(stripTsig(hex(FIXTURES.soa.response)), 5));
    await expect(client.findZone(NAME)).resolves.toEqual({});
  });

  it("reports a CNAME at the name instead of a zone", async () => {
    const { client } = createClient(FIXTURES.soaCname.id, hex(FIXTURES.soaCname.response));
    await expect(client.findZone(NAME)).resolves.toEqual({ cnameTarget: "api.acme-zone.net" });
  });

  // PowerDNS answers a bad key with a bare NOTAUTH; an unsigned retry tells that apart from a server that always does
  it("treats a bare NOTAUTH as a rejected key only when the unsigned question is answered normally", async () => {
    const rejected = createClient(FIXTURES.refusedRoot.id, (request) =>
      bareReply(request, request.readUInt16BE(10) ? 9 : 5)
    );
    await expect(rejected.client.checkKey()).rejects.toMatchObject({ reason: DnsUpdateErrorReason.TsigRejected });
    expect(rejected.transport).toHaveBeenCalledTimes(2);
    expect(rejected.transport.mock.calls[1][0].readUInt16BE(10)).toBe(0);

    const alwaysNotAuth = createClient(FIXTURES.refusedRoot.id, (request) => bareReply(request, 9));
    await expect(alwaysNotAuth.client.checkKey()).resolves.toBe("unverified");

    const zoneRejected = createClient(FIXTURES.soa.id, (request) =>
      bareReply(request, request.readUInt16BE(10) ? 9 : 3)
    );
    await expect(zoneRejected.client.findZone(NAME)).rejects.toMatchObject({
      reason: DnsUpdateErrorReason.TsigRejected
    });

    const zoneNotAuth = createClient(FIXTURES.soa.id, (request) => bareReply(request, 9));
    await expect(zoneNotAuth.client.findZone(NAME)).resolves.toEqual({});
  });

  it("reads back TXT values and CNAMEs", async () => {
    const txt = createClient(FIXTURES.txt.id, hex(FIXTURES.txt.response));
    await expect(txt.client.queryTxtRecord(NAME)).resolves.toEqual({
      values: ["X7f9kQ", "other"],
      cnameTarget: undefined
    });

    const cname = createClient(FIXTURES.cname.id, hex(FIXTURES.cname.response));
    await expect(cname.client.queryTxtRecord(NAME)).resolves.toEqual({
      values: [],
      cnameTarget: "api.acme.corp.com"
    });
  });

  it("checks the key with a signed query", async () => {
    const signed = createClient(FIXTURES.refusedRoot.id, hex(FIXTURES.refusedRoot.response));
    await expect(signed.client.checkKey()).resolves.toBe("verified");

    const unsigned = createClient(FIXTURES.refusedRoot.id, stripTsig(hex(FIXTURES.refusedRoot.response)));
    await expect(unsigned.client.checkKey()).resolves.toBe("unverified");

    const badSig = createClient(FIXTURES.refusedRoot.id, (request) => buildRejectedReply(request, TsigError.BadSig));
    await expect(badSig.client.checkKey()).rejects.toMatchObject({ tsigError: TsigError.BadSig });
  });
});
