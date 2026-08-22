import net from "node:net";
import tls from "node:tls";

import forge from "node-forge";

import { GatewayProxyProtocol } from "@app/lib/gateway/types";

import { setupRelayServer } from "./gateway-v2";

const tracker = vi.hoisted(() => ({
  channelOpened: vi.fn(),
  channelClosed: vi.fn(),
  markSuspect: vi.fn()
}));

vi.mock("@app/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ isDevelopmentMode: true })
}));

vi.mock("./gateway-load-tracker", () => ({
  getGatewayLoadTracker: () => tracker
}));

// Real relays are addressed by hostname and always reach the gateway on 8443, so the production
// implementation resolves the host and never sees a port. The fake relay needs an ephemeral one.
vi.mock("@app/ee/services/dynamic-secret/dynamic-secret-fns", () => ({
  verifyHostInputValidity: ({ host }: { host: string }) => Promise.resolve([host.split(":")[0]])
}));

const GATEWAY_ID = "11111111-1111-1111-1111-111111111111";

const freePort = async () =>
  new Promise<number>((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close();
        reject(new Error("no port"));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });

// One keypair reused by every certificate: the test only needs a chain that validates, and forge's
// RSA generation is slow enough that three of them dominates the runtime of the whole file.
const keys = forge.pki.rsa.generateKeyPair(2048);

type TAltName = { type: number; value?: string; ip?: string };

const issue = ({ subject, isCa, altNames }: { subject: string; isCa?: boolean; altNames?: TAltName[] }) => {
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 3_600_000);
  const attrs = [{ name: "commonName", value: subject }];
  cert.setSubject(attrs);
  cert.setIssuer([{ name: "commonName", value: "test-ca" }]);
  const extensions: Record<string, unknown>[] = [{ name: "basicConstraints", cA: Boolean(isCa) }];
  if (altNames) extensions.push({ name: "subjectAltName", altNames });
  cert.setExtensions(extensions);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return forge.pki.certificateToPem(cert);
};

const keyPem = forge.pki.privateKeyToPem(keys.privateKey);
const caPem = issue({ subject: "test-ca", isCa: true });

type TFakeRelay = {
  relayHost: string;
  tunnelsOpened: () => number;
  tunnelsClosed: () => number;
  close: () => Promise<void>;
};

/**
 * Stands in for the relay plus the gateway behind it: an outer TLS listener whose accepted socket
 * carries a second, inner TLS server. That nesting is the part under test, because a tunnel is only
 * "open" from the gateway's point of view once the inner handshake completes.
 */
const startFakeRelay = async (): Promise<TFakeRelay> => {
  const port = await freePort();
  const relayHost = `127.0.0.1:${port}`;
  const serverCert = issue({
    subject: "relay",
    altNames: [
      { type: 2, value: relayHost },
      { type: 2, value: "127.0.0.1" },
      { type: 7, ip: "127.0.0.1" }
    ]
  });

  let opened = 0;
  let closed = 0;
  const live = new Set<tls.TLSSocket>();

  const server = tls.createServer(
    { key: keyPem, cert: serverCert, ca: caPem, requestCert: true, rejectUnauthorized: false },
    (outer) => {
      live.add(outer);
      outer.on("close", () => live.delete(outer));
      const inner = new tls.TLSSocket(outer, {
        isServer: true,
        key: keyPem,
        cert: serverCert,
        ca: caPem,
        requestCert: true,
        rejectUnauthorized: false,
        ALPNProtocols: ["infisical-tcp-proxy"]
      });
      inner.on("secure", () => {
        opened += 1;
      });
      // Echo, so a claimed tunnel can be shown to still carry traffic.
      inner.on("data", (chunk: Buffer) => inner.write(chunk));
      inner.on("error", () => {});
      inner.on("close", () => {
        closed += 1;
      });
      outer.on("error", () => {});
    }
  );

  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  return {
    relayHost,
    tunnelsOpened: () => opened,
    tunnelsClosed: () => closed,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of live) socket.destroy();
        live.clear();
        server.close(() => resolve());
      })
  };
};

const clientCertPem = issue({ subject: "client" });

const argsFor = (relayHost: string) => ({
  gatewayId: GATEWAY_ID,
  protocol: GatewayProxyProtocol.Tcp,
  relayHost,
  gateway: { clientCertificate: clientCertPem, clientPrivateKey: keyPem, serverCertificateChain: caPem },
  relay: { clientCertificate: clientCertPem, clientPrivateKey: keyPem, serverCertificateChain: caPem }
});

const connectAndEcho = (port: number) =>
  new Promise<string>((resolve, reject) => {
    const socket: net.Socket = net.connect({ host: "127.0.0.1", port }, () => socket.write("ping"));
    socket.on("data", (chunk) => {
      resolve(chunk.toString());
      socket.end();
    });
    socket.on("error", reject);
    socket.setTimeout(5000, () => {
      socket.destroy();
      reject(new Error("echo timed out"));
    });
  });

const waitFor = async (predicate: () => boolean) => {
  for (let i = 0; i < 100; i += 1) {
    if (predicate()) return;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  }
  throw new Error("condition never became true");
};

// Teardown is driven by socket "close" events, so a test that ends the moment its assertion passes
// can leak a release into the next test's counters.
const drainChannels = (count: number) => waitFor(() => tracker.channelClosed.mock.calls.length === count);

describe("setupRelayServer", () => {
  beforeEach(() => {
    tracker.channelOpened.mockClear();
    tracker.channelClosed.mockClear();
    tracker.markSuspect.mockClear();
  });

  describe("against an unreachable gateway", () => {
    // Nothing is listening here, so any dial fails.
    const args = {
      gatewayId: GATEWAY_ID,
      protocol: GatewayProxyProtocol.Tcp,
      relayHost: "127.0.0.1:1",
      gateway: { clientCertificate: "c", clientPrivateKey: "k", serverCertificateChain: "chain" },
      relay: { clientCertificate: "c", clientPrivateKey: "k", serverCertificateChain: "chain" }
    };

    test("resolves when not eager, because the dial is deferred to the first client", async () => {
      const server = await setupRelayServer(args);
      expect(server.port).toBeGreaterThan(0);
      expect(server.hasEstablishedChannel()).toBe(false);
      await server.cleanup();
    });

    test("rejects when eager, which is what gives pool failover something to catch", async () => {
      await expect(setupRelayServer({ ...args, eager: true })).rejects.toThrow();
    });

    test("reports the failure as a transport error, so it is safe to retry elsewhere", async () => {
      await expect(setupRelayServer({ ...args, eager: true })).rejects.toMatchObject({
        name: "BadRequest",
        gatewayId: GATEWAY_ID
      });
    });

    test("counts no channel for a tunnel that never opened", async () => {
      await expect(setupRelayServer({ ...args, eager: true })).rejects.toThrow();
      expect(tracker.channelOpened).not.toHaveBeenCalled();
      expect(tracker.markSuspect).toHaveBeenCalledWith(GATEWAY_ID);
    });
  });

  describe("against a reachable gateway", () => {
    let relay: TFakeRelay;

    beforeEach(async () => {
      relay = await startFakeRelay();
    });

    afterEach(async () => {
      await relay.close();
    });

    test("does not touch the gateway until a client connects when not eager", async () => {
      const server = await setupRelayServer(argsFor(relay.relayHost));
      expect(relay.tunnelsOpened()).toBe(0);
      expect(server.hasEstablishedChannel()).toBe(false);
      await server.cleanup();
    });

    test("opens the tunnel during setup when eager", async () => {
      const server = await setupRelayServer({ ...argsFor(relay.relayHost), eager: true, longLived: true });
      await waitFor(() => relay.tunnelsOpened() === 1);
      expect(server.hasEstablishedChannel()).toBe(true);
      expect(tracker.channelOpened).toHaveBeenCalledTimes(1);

      await server.cleanup();
      await drainChannels(1);
    });

    test("hands the tunnel it already opened to the first client instead of dialing again", async () => {
      const server = await setupRelayServer({ ...argsFor(relay.relayHost), eager: true, longLived: true });
      await waitFor(() => relay.tunnelsOpened() === 1);

      // The reused tunnel has to still carry traffic; a probe-and-drop would fail here.
      await expect(connectAndEcho(server.port)).resolves.toBe("ping");
      expect(relay.tunnelsOpened()).toBe(1);
      expect(tracker.channelOpened).toHaveBeenCalledTimes(1);

      await server.cleanup();
      await drainChannels(1);
    });

    test("dials a fresh tunnel for the second client", async () => {
      const server = await setupRelayServer({ ...argsFor(relay.relayHost), eager: true, longLived: true });

      await expect(connectAndEcho(server.port)).resolves.toBe("ping");
      await expect(connectAndEcho(server.port)).resolves.toBe("ping");

      await waitFor(() => relay.tunnelsOpened() === 2);
      expect(tracker.channelOpened).toHaveBeenCalledTimes(2);

      await server.cleanup();
      await drainChannels(2);
    });

    test("releases the tunnel and its channel count when no client ever claims it", async () => {
      const server = await setupRelayServer({ ...argsFor(relay.relayHost), eager: true, longLived: true });
      await waitFor(() => relay.tunnelsOpened() === 1);

      await server.cleanup();

      await waitFor(() => relay.tunnelsClosed() === 1);
      await drainChannels(1);
    });

    test("releases the channel count once when a claimed tunnel closes", async () => {
      const server = await setupRelayServer({ ...argsFor(relay.relayHost), eager: true, longLived: true });
      await expect(connectAndEcho(server.port)).resolves.toBe("ping");
      await server.cleanup();

      await drainChannels(1);
    });
  });
});
