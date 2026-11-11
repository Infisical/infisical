import { generateKeyPairSync } from "node:crypto";
import dns, { LookupAddress } from "node:dns";
import { syncBuiltinESMExports } from "node:module";
import net, { AddressInfo } from "node:net";

import forge from "node-forge";

// Test harness for DNS rebinding. A rebinding name answers a public address when it is validated and an
// internal one when the client connects. Locally, 127.0.0.1 stands in for the public address and 127.0.0.2 for
// the internal one; a suite using this treats 127.0.0.1 as public by mocking isPrivateIp. A target server
// listens on each address with the same port, so the server that receives the TCP connection shows which
// answer the client actually used.
export const REBIND_HOST = "rebind.invalid";
export const PUBLIC_IP = "127.0.0.1";
export const INTERNAL_IP = "127.0.0.2";

// What the rebinding name resolves to for lookups made with the callback API (node:dns lookup), which is what
// net.connect and http.request use when they connect. Validation uses node:dns/promises, which a suite mocks
// separately.
export const connectTimeAnswer = { address: INTERNAL_IP };

const originalLookup = dns.lookup;

export const installConnectTimeDns = () => {
  const lookup = ((hostname: string, optionsOrCb: unknown, maybeCb?: unknown) => {
    if (hostname !== REBIND_HOST) {
      (originalLookup as (...args: unknown[]) => void)(hostname, optionsOrCb, maybeCb);
      return;
    }
    const callback = (typeof optionsOrCb === "function" ? optionsOrCb : maybeCb) as (
      err: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number
    ) => void;
    const opts = (typeof optionsOrCb === "function" ? {} : optionsOrCb) as { all?: boolean };
    const entry = { address: connectTimeAnswer.address, family: 4 };
    process.nextTick(() => (opts?.all ? callback(null, [entry]) : callback(null, entry.address, entry.family)));
  }) as typeof dns.lookup;

  // syncBuiltinESMExports pushes the patch to modules that imported lookup by name, not only to net and http
  dns.lookup = lookup;
  syncBuiltinESMExports();

  return () => {
    dns.lookup = originalLookup;
    syncBuiltinESMExports();
  };
};

export type TTargetPair = {
  port: number;
  hits: { public: number; internal: number };
  waitForHit: (target: "public" | "internal", timeoutMs?: number) => Promise<void>;
  close: () => Promise<void>;
};

// Starts one server per address on the same port. createServer gets a fresh server each time; the harness
// counts raw TCP connections on it, so it works for plain TCP, TLS and HTTP servers alike.
export const startTargetPair = async (createServer: () => net.Server): Promise<TTargetPair> => {
  const hits = { public: 0, internal: 0 };
  const waiters: Array<() => void> = [];

  const listen = (server: net.Server, host: string, port: number) =>
    new Promise<number>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => resolve((server.address() as AddressInfo).port));
    });

  const publicServer = createServer();
  const internalServer = createServer();
  const sockets = new Set<net.Socket>();
  const track = (server: net.Server, target: "public" | "internal") =>
    server.on("connection", (socket: net.Socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      hits[target] += 1;
      waiters.splice(0).forEach((wake) => wake());
    });
  track(publicServer, "public");
  track(internalServer, "internal");

  const port = await listen(publicServer, PUBLIC_IP, 0);
  await listen(internalServer, INTERNAL_IP, port);

  const waitForHit = (target: "public" | "internal", timeoutMs = 5000) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no connection reached the ${target} target`)), timeoutMs);
      const check = () => {
        if (hits[target] > 0) {
          clearTimeout(timer);
          resolve();
        } else {
          waiters.push(check);
        }
      };
      check();
    });

  const close = async () => {
    sockets.forEach((socket) => socket.destroy());
    await Promise.all(
      [publicServer, internalServer].map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          })
      )
    );
  };

  return { port, hits, waitForHit, close };
};

// Self-signed certificate for a name, generated at test time so no key material is committed
export const createSelfSignedCert = (hostname: string) => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });

  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(publicKey);
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 60 * 60 * 1000);
  cert.validity.notAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const attrs = [{ name: "commonName", value: hostname }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: "basicConstraints", cA: true },
    { name: "subjectAltName", altNames: [{ type: 2, value: hostname }] }
  ]);
  cert.sign(forge.pki.privateKeyFromPem(privateKey), forge.md.sha256.create());

  return { key: privateKey, cert: forge.pki.certificateToPem(cert) };
};
