import net from "node:net";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DnsRcode, DnsUpdateError, DnsUpdateErrorReason, TsigAlgorithm, TsigError } from "@app/lib/dns-update";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway-v2/types";

import { Rfc2136ConnectionMethod } from "./rfc2136-connection-enums";
import {
  executeWithRfc2136Client,
  getRfc2136ErrorMessage,
  RFC2136_REQUEST_TIMEOUT_MS,
  validateRfc2136ConnectionCredentials
} from "./rfc2136-connection-fns";
import { TRfc2136ConnectionConfig } from "./rfc2136-connection-types";

const state = vi.hoisted(() => ({ checkedHosts: [] as unknown[], proxyOptions: [] as unknown[], proxyPort: 0 }));

// Resolves every host to loopback, so the tests prove the client dials the checked address, not the hostname.
vi.mock("@app/ee/services/dynamic-secret/dynamic-secret-fns", () => ({
  verifyHostInputValidity: async (args: unknown) => {
    state.checkedHosts.push(args);
    return ["127.0.0.1"];
  }
}));
vi.mock("@app/lib/gateway-v2/gateway-v2", () => ({
  withGatewayV2Proxy: async (callback: (port: number) => Promise<unknown>, options: unknown) => {
    state.proxyOptions.push(options);
    return callback(state.proxyPort);
  }
}));
vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const GATEWAY_ID = "3c90c3cc-0d44-4b50-8888-8dd25736052a";

type TReplyMode = "echo-in-single-bytes" | "close" | "silent" | "trickle";

// A DNS-over-TCP server that answers each request with the request itself, flagged as a response and without its
// TSIG record: an unsigned NOERROR reply, which is what Knot sends for a name it does not host.
const startServer = async (mode: TReplyMode) => {
  const sockets: net.Socket[] = [];
  const server = net.createServer((socket) => {
    sockets.push(socket);
    let received = Buffer.alloc(0);
    socket.on("data", (chunk: Buffer) => {
      received = Buffer.concat([received, chunk]);
      if (received.length < 2 || received.length < 2 + received.readUInt16BE(0)) return;
      if (mode === "close") {
        socket.destroy();
        return;
      }
      if (mode === "silent") return;
      if (mode === "trickle") {
        // announces a long reply and sends only the first byte of it, so the socket is never idle-free of data
        socket.write(Buffer.from([0xff, 0xff, 0x00]));
        return;
      }

      const request = received.subarray(2, 2 + received.readUInt16BE(0));
      const keyNameStart = request.indexOf(Buffer.from("\x0einfisical-acme", "latin1"), 12);
      const reply = Buffer.from(request.subarray(0, keyNameStart));
      reply.writeUInt16BE(0x8000, 2);
      reply.writeUInt16BE(0, 10);
      const framed = Buffer.concat([Buffer.from([reply.length >> 8, reply.length & 0xff]), reply]); // eslint-disable-line no-bitwise
      framed.forEach((byte, index) => setTimeout(() => socket.write(Buffer.from([byte])), index));
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    port: (server.address() as net.AddressInfo).port,
    close: () =>
      new Promise<void>((resolve) => {
        sockets.forEach((socket) => socket.destroy());
        server.close(() => resolve());
      })
  };
};

const connection = (port: number, overrides: Partial<TRfc2136ConnectionConfig> = {}) =>
  ({
    app: "rfc2136",
    method: Rfc2136ConnectionMethod.TsigKey,
    orgId: "org-id",
    credentials: {
      host: "dns.example.invalid",
      port,
      tsigKeyName: "infisical-acme",
      tsigAlgorithm: TsigAlgorithm.HmacSha256,
      tsigSecret: "c2VjcmV0LWtleS1mb3ItdGVzdHMtMTIzNDU2Nzg5MDEy"
    },
    ...overrides
  }) as TRfc2136ConnectionConfig;

describe("executeWithRfc2136Client", () => {
  let server: Awaited<ReturnType<typeof startServer>> | undefined;

  beforeEach(() => {
    state.checkedHosts = [];
    state.proxyOptions = [];
  });

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("dials the address that passed the host check and reads a reply split across many packets", async () => {
    server = await startServer("echo-in-single-bytes");
    await expect(executeWithRfc2136Client(connection(server.port), {}, (client) => client.checkKey())).resolves.toBe(
      "unverified"
    );
    expect(state.checkedHosts).toEqual([{ host: "dns.example.invalid", isGateway: false, isDynamicSecret: false }]);
  });

  it("reports a server that closes the connection without answering", async () => {
    server = await startServer("close");
    await expect(validateRfc2136ConnectionCredentials(connection(server.port), {} as never)).rejects.toThrow(
      "the DNS server closed the connection without answering"
    );
  });

  it("stops waiting when the order is cancelled", async () => {
    server = await startServer("silent");
    const controller = new AbortController();
    const pending = executeWithRfc2136Client(
      connection(server.port),
      {},
      (client) => client.checkKey(),
      controller.signal
    );
    setTimeout(() => controller.abort(), 50);
    await expect(pending).rejects.toThrow("the request was cancelled");
  });

  it("sends every message of an operation through one Gateway proxy over TCP", async () => {
    server = await startServer("echo-in-single-bytes");
    state.proxyPort = server.port;
    const getPlatformConnectionDetailsByGatewayId = vi.fn(async () => ({ gatewayId: GATEWAY_ID }));

    await executeWithRfc2136Client(
      connection(53, { gatewayId: GATEWAY_ID }),
      { gatewayV2Service: { getPlatformConnectionDetailsByGatewayId } as never },
      async (client) => {
        await client.checkKey();
        await client.checkKey();
      }
    );

    expect(getPlatformConnectionDetailsByGatewayId).toHaveBeenCalledWith({
      gatewayId: GATEWAY_ID,
      targetHost: "127.0.0.1",
      targetPort: 53
    });
    expect(state.proxyOptions).toEqual([{ protocol: GatewayProxyProtocol.Tcp, gatewayId: GATEWAY_ID }]);
  });

  it("gives up at the deadline even while the server keeps sending data", async () => {
    server = await startServer("trickle");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const pending = executeWithRfc2136Client(connection(server.port), {}, (client) => client.checkKey());
      const assertion = expect(pending).rejects.toThrow("the DNS server did not answer in time");
      await vi.advanceTimersByTimeAsync(RFC2136_REQUEST_TIMEOUT_MS + 1);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("never falls back to a direct connection when the Gateway is missing", async () => {
    await expect(
      executeWithRfc2136Client(
        connection(53, { gatewayId: GATEWAY_ID }),
        { gatewayV2Service: { getPlatformConnectionDetailsByGatewayId: async () => undefined } as never },
        (client) => client.checkKey()
      )
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      executeWithRfc2136Client(connection(53, { gatewayId: GATEWAY_ID }), {}, (client) => client.checkKey())
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(state.checkedHosts).toEqual([{ host: "dns.example.invalid", isGateway: true, isDynamicSecret: false }]);
  });
});

describe("getRfc2136ErrorMessage", () => {
  const badSig = new DnsUpdateError({
    reason: DnsUpdateErrorReason.TsigRejected,
    message: "x",
    tsigError: TsigError.BadSig
  });
  const refused = new DnsUpdateError({ reason: DnsUpdateErrorReason.Rcode, message: "x", rcode: DnsRcode.Refused });
  const doubleEncoded = Buffer.from("c2VjcmV0LWtleS1mb3ItdGVzdHMtMTIzNDU2Nzg5MDEy").toString("base64");

  it("explains a key rejected without a TSIG error", () => {
    const bareRejection = new DnsUpdateError({ reason: DnsUpdateErrorReason.TsigRejected, message: "x" });
    expect(getRfc2136ErrorMessage(bareRejection)).toMatch(/rejected the TSIG key/);
    expect(getRfc2136ErrorMessage(bareRejection, doubleEncoded)).toMatch(/base64-encoded twice/);
  });

  it("adds the double-encoding hint only when the server rejected the key", () => {
    expect(getRfc2136ErrorMessage(badSig, doubleEncoded)).toMatch(/base64-encoded twice/);
    expect(getRfc2136ErrorMessage(refused, doubleEncoded)).toMatch(/base64-encoded twice/);
    expect(getRfc2136ErrorMessage(badSig, "c2VjcmV0LWtleS1mb3ItdGVzdHMtMTIzNDU2Nzg5MDEy")).not.toMatch(/twice/);
    expect(
      getRfc2136ErrorMessage(
        new DnsUpdateError({ reason: DnsUpdateErrorReason.Rcode, message: "x", rcode: DnsRcode.NotImp }),
        doubleEncoded
      )
    ).not.toMatch(/twice/);
  });
});
