/* eslint-disable @typescript-eslint/no-explicit-any */
import https from "node:https";
import type { AddressInfo } from "node:net";

import forge from "node-forge";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getSharedHttpsAgent } from "./safe-request";

// Like `safe-request.socket.test.ts`, this drives real sockets against a loopback
// server rather than mocking the transport, because the properties under test are
// connect-time ones: that a pooled agent actually reuses its TLS connection, and
// that evicting one closes the socket it was holding. A dropped keepAlive agent is
// kept reachable by its own idle sockets' listeners, so "the cache forgot it" and
// "the fd is released" are different claims and only the socket can tell them apart.
const { configState } = vi.hoisted(() => ({
  configState: {
    isDevelopmentMode: false,
    ALLOW_INTERNAL_IP_CONNECTIONS: true,
    SAFE_REQUEST_FORCE_DIRECT_EGRESS: false,
    SITE_URL: "https://infisical.example",
    REDIS_URL: "redis://internal-redis:6379",
    DB_HOST: "internal-db"
  }
}));

vi.mock("@app/lib/config/env", () => ({ getConfig: () => configState }));
vi.mock("@app/ee/services/dynamic-secret/dynamic-secret-fns", () => ({
  verifyHostInputValidity: vi.fn(async () => undefined)
}));
vi.mock("@app/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

const selfSignedCert = () => {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 60 * 60_000);
  const attrs = [{ name: "commonName", value: "localhost" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([{ name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }] }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { key: forge.pki.privateKeyToPem(keys.privateKey), cert: forge.pki.certificateToPem(cert) };
};

const post = (agent: https.Agent, port: number) =>
  new Promise<number>((resolve, reject) => {
    const req = https.request(
      { host: "127.0.0.1", port, path: "/apis/authentication.k8s.io/v1/tokenreviews", method: "POST", agent },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode ?? 0));
      }
    );
    req.on("error", reject);
    req.end("{}");
  });

const openConnections = (server: https.Server) =>
  new Promise<number>((resolve, reject) => {
    server.getConnections((err, count) => (err ? reject(err) : resolve(count)));
  });

describe("shared https agent pool (real sockets)", () => {
  let server: https.Server;
  let port: number;
  let handledRequests = 0;

  beforeAll(async () => {
    const { key, cert } = selfSignedCert();
    server = https.createServer({ key, cert }, (req, res) => {
      handledRequests += 1;
      // Mirror the 401 the fleet was actually getting back from TokenReview.
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ kind: "Status", code: 401 }));
    });
    // Keep idle connections open the way a real API server / LB does, so a leaked
    // socket stays visibly leaked instead of being tidied up by the server.
    server.keepAliveTimeout = 120_000;
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    port = (server.address() as AddressInfo).port;
  }, 30_000);

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("serves many TokenReviews over a single connection when the host and CA are unchanged", async () => {
    const before = handledRequests;
    const agent = getSharedHttpsAgent({ rejectUnauthorized: false, servername: "reuse.test" });

    for (let i = 0; i < 25; i += 1) {
      // Sequential on purpose: concurrent requests legitimately open parallel
      // sockets, which would not distinguish pooling from per-request agents.
      // eslint-disable-next-line no-await-in-loop
      expect(await post(agent, port)).toBe(401);
    }

    expect(handledRequests - before).toBe(25);
    expect(await openConnections(server)).toBe(1);

    agent.destroy();
  });

  it("holds exactly one idle socket open between calls, and releases it on destroy", async () => {
    const agent = getSharedHttpsAgent({ rejectUnauthorized: false, servername: "idle.test" });
    await post(agent, port);

    expect(await openConnections(server)).toBe(1);

    agent.destroy();
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    expect(await openConnections(server)).toBe(0);
  });

  it("closes the sockets of agents the pool evicts, instead of stranding them for the process lifetime", async () => {
    const victim = getSharedHttpsAgent({ rejectUnauthorized: false, servername: "victim.test" });
    await post(victim, port);
    expect(await openConnections(server)).toBe(1);

    // Push past AGENT_CACHE_MAX so the victim is evicted as least recently used.
    for (let i = 0; i < 250; i += 1) {
      getSharedHttpsAgent({ rejectUnauthorized: false, servername: `pressure-${i}.test` });
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    expect(await openConnections(server)).toBe(0);
  });
});
