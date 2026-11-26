import { AddressInfo } from "node:net";
import tls from "node:tls";

import * as x509 from "@peculiar/x509";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { crypto } from "@app/lib/crypto";

import {
  computeCertificateChannelBinding,
  computeGssChannelBindingHash,
  computeTlsServerEndPointHash,
  getInstanceTlsEndpoint,
  learnServerChannelBindings
} from "./microsoft-autoenrollment-channel-binding-fns";

const siteUrl = vi.hoisted(() => ({ value: "https://app.example.com" as string | undefined }));

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ SITE_URL: siteUrl.value }) }));

vi.mock("@app/lib/logger", () => ({ logger: { warn: vi.fn() } }));

const { resolveDomain } = vi.hoisted(() => ({ resolveDomain: vi.fn() }));

vi.mock("@app/ee/services/pki-discovery/pki-discovery-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/ee/services/pki-discovery/pki-discovery-fns")>()),
  resolveDomain
}));

const ECDSA_SHA256_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIBijCCAS+gAwIBAgIUQ3VOx0CWF3m50Hn19gw7IZrd3N0wCgYIKoZIzj0EAwIw
GjEYMBYGA1UEAwwPYXBwLmV4YW1wbGUuY29tMB4XDTI2MTExNzIxNDM1NFoXDTM2
MTExNDIxNDM1NFowGjEYMBYGA1UEAwwPYXBwLmV4YW1wbGUuY29tMFkwEwYHKoZI
zj0CAQYIKoZIzj0DAQcDQgAEiKOcpgB4ib1ghbSCYrE3IU95+UHv7ELmVQGMq6LF
qNjRpSwdNKvodF1EYWwEWDVabZX4nfJXIo2wklpMXFt7CKNTMFEwHQYDVR0OBBYE
FPhtxTjZ0vOXYyVpXJpSX6cJx8goMB8GA1UdIwQYMBaAFPhtxTjZ0vOXYyVpXJpS
X6cJx8goMA8GA1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDSQAwRgIhANMCWH1x
tF8j8Fa1J1eg5iiwBJ5ZuCKzVsh/yBNF2u4LAiEA4m9sDImzEVKwLoZ/DEij2rtV
P2xfVPHyXTw6AexOttk=
-----END CERTIFICATE-----`;

const ECDSA_SHA384_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIBijCCAS+gAwIBAgIUFhu2UCKBMziAeuG3Y/vq3QKafRQwCgYIKoZIzj0EAwMw
GjEYMBYGA1UEAwwPYXBwLmV4YW1wbGUuY29tMB4XDTI2MTExNzIxNDM1NFoXDTM2
MTExNDIxNDM1NFowGjEYMBYGA1UEAwwPYXBwLmV4YW1wbGUuY29tMFkwEwYHKoZI
zj0CAQYIKoZIzj0DAQcDQgAEiKOcpgB4ib1ghbSCYrE3IU95+UHv7ELmVQGMq6LF
qNjRpSwdNKvodF1EYWwEWDVabZX4nfJXIo2wklpMXFt7CKNTMFEwHQYDVR0OBBYE
FPhtxTjZ0vOXYyVpXJpSX6cJx8goMB8GA1UdIwQYMBaAFPhtxTjZ0vOXYyVpXJpS
X6cJx8goMA8GA1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0EAwMDSQAwRgIhAMkHHRMu
lJlcDZVxtVDiRyvhtb6IvMY02uPG7P5FTQYXAiEAvkWbxKtylLPVbaX9ICImpVw7
YKukD+kTiVbsV5+VjI8=
-----END CERTIFICATE-----`;

const ECDSA_SHA1_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIBhzCCAS6gAwIBAgIUDpE/js48dX1Fj25p4iMEWlT1EsgwCQYHKoZIzj0EATAa
MRgwFgYDVQQDDA9hcHAuZXhhbXBsZS5jb20wHhcNMjYxMTE3MjE0MzU0WhcNMzYx
MTE0MjE0MzU0WjAaMRgwFgYDVQQDDA9hcHAuZXhhbXBsZS5jb20wWTATBgcqhkjO
PQIBBggqhkjOPQMBBwNCAASIo5ymAHiJvWCFtIJisTchT3n5Qe/sQuZVAYyrosWo
2NGlLB00q+h0XURhbARYNVptlfid8lcijbCSWkxcW3sIo1MwUTAdBgNVHQ4EFgQU
+G3FONnS85djJWlcmlJfpwnHyCgwHwYDVR0jBBgwFoAU+G3FONnS85djJWlcmlJf
pwnHyCgwDwYDVR0TAQH/BAUwAwEB/zAJBgcqhkjOPQQBA0gAMEUCIQCYwa4qICsl
lbm+exXt2GeeTB8O90dYJUDqHhXnexWERQIgWnZBmyLZqL0bYd8qfZqtgcctdNe8
p+0DXfhC1yXf77w=
-----END CERTIFICATE-----`;

const toDer = (pem: string) => new crypto.nativeCrypto.X509Certificate(pem).raw;

const createSelfSignedPair = async (
  algorithm: EcKeyGenParams | RsaHashedKeyGenParams,
  altName: x509.JsonGeneralName = { type: "ip", value: "127.0.0.1" }
) => {
  const keys = await globalThis.crypto.subtle.generateKey(algorithm, true, ["sign", "verify"]);
  const certificate = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "01",
    name: "CN=app.example.com",
    notBefore: new Date(),
    notAfter: new Date(Date.now() + 24 * 60 * 60 * 1000),
    signingAlgorithm: "namedCurve" in algorithm ? { name: "ECDSA", hash: "SHA-256" } : algorithm,
    keys,
    extensions: [new x509.SubjectAlternativeNameExtension([altName])]
  });
  const privateKey = Buffer.from(await globalThis.crypto.subtle.exportKey("pkcs8", keys.privateKey));
  return {
    certificate: certificate.toString("pem"),
    key: x509.PemConverter.encode(new Uint8Array(privateKey).buffer, "PRIVATE KEY")
  };
};

describe("Microsoft Autoenrollment channel binding", () => {
  beforeEach(() => {
    siteUrl.value = "https://app.example.com";
  });

  test("lays out the GSS channel bindings struct with empty addresses before hashing it with MD5", () => {
    const applicationData = Buffer.concat([Buffer.from("tls-server-end-point:", "ascii"), Buffer.alloc(32)]);

    expect(computeGssChannelBindingHash(applicationData).toString("hex")).toBe("c9ec5cb29e8f57f7ee6429cde733efeb");
  });

  test.each([
    [
      "SHA-256",
      ECDSA_SHA256_CERTIFICATE,
      "7f78ae21fa0e2e8b6e8bac3bdefcdba55aee19336a1305c6ac0d7535633a37b6",
      "74ea4be4872452c0da2d69d46c8a7e03"
    ],
    [
      "SHA-384",
      ECDSA_SHA384_CERTIFICATE,
      "65eb9926835210879c22049d6ee5736a3b563220e888cbdf49af2a63cef8a4e390cf5302ec1271e7eaa58e1b8c13b6d3",
      "8b7c309f265ef177aa903260978752cb"
    ],
    [
      "SHA-1, which is replaced by SHA-256",
      ECDSA_SHA1_CERTIFICATE,
      "0c0df0c0e176bb66675ed65e5dccb91bf0d64326e944e83fa8fbf51623f4176f",
      "f1cf107d62f3d2b4523b15615c990acf"
    ]
  ])("hashes a certificate signed with %s for tls-server-end-point", (_, certificate, endPointHash, channelBinding) => {
    expect(computeTlsServerEndPointHash(toDer(certificate)).toString("hex")).toBe(endPointHash);
    expect(computeCertificateChannelBinding(toDer(certificate)).toString("hex")).toBe(channelBinding);
  });

  test.each([
    ["https://app.example.com", { host: "app.example.com", port: 443 }],
    ["https://App.Example.com:8443/", { host: "app.example.com", port: 8443 }],
    ["https://[::1]:9443", { host: "::1", port: 9443 }],
    ["http://localhost:8080", null],
    [undefined, null]
  ])("reads the TLS endpoint of SITE_URL %s", (url, endpoint) => {
    siteUrl.value = url;

    expect(getInstanceTlsEndpoint()).toEqual(endpoint);
  });

  describe("learnServerChannelBindings", () => {
    let server: tls.Server;
    let ecdsa: { certificate: string; key: string };
    let rsa: { certificate: string; key: string };

    beforeAll(async () => {
      x509.cryptoProvider.set(globalThis.crypto);
      ecdsa = await createSelfSignedPair({ name: "ECDSA", namedCurve: "P-256" });
      rsa = await createSelfSignedPair({
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1])
      });
      server = tls.createServer({ cert: [ecdsa.certificate, rsa.certificate], key: [ecdsa.key, rsa.key] }, (socket) =>
        socket.end()
      );
      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", resolve);
      });
    });

    afterAll(async () => {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    });

    test("resolves the host name with the system resolver only, never public DNS", async () => {
      const { port } = server.address() as AddressInfo;

      await learnServerChannelBindings({ host: "localhost", port });

      expect(resolveDomain).not.toHaveBeenCalled();
    });

    test("reads both the ECDSA and the RSA certificate a server holds", async () => {
      const { port } = server.address() as AddressInfo;

      const bindings = await learnServerChannelBindings({ host: "127.0.0.1", port });

      expect(bindings.sort()).toEqual(
        [
          computeCertificateChannelBinding(toDer(ecdsa.certificate))?.toString("hex"),
          computeCertificateChannelBinding(toDer(rsa.certificate))?.toString("hex")
        ].sort()
      );
    });

    test("ignores a certificate that is not issued for the instance host, so a spoofed address cannot teach it", async () => {
      const other = await createSelfSignedPair(
        { name: "ECDSA", namedCurve: "P-256" },
        { type: "dns", value: "attacker.example.net" }
      );
      const otherServer = tls.createServer({ cert: other.certificate, key: other.key }, (socket) => socket.end());
      await new Promise<void>((resolve) => {
        otherServer.listen(0, "127.0.0.1", resolve);
      });
      const { port } = otherServer.address() as AddressInfo;

      const bindings = await learnServerChannelBindings({ host: "127.0.0.1", port });

      await new Promise((resolve) => {
        otherServer.close(resolve);
      });
      expect(bindings).toEqual([]);
    });

    test("returns no bindings when nothing answers", async () => {
      const closedServer = tls.createServer();
      await new Promise<void>((resolve) => {
        closedServer.listen(0, "127.0.0.1", resolve);
      });
      const { port } = closedServer.address() as AddressInfo;
      await new Promise((resolve) => {
        closedServer.close(resolve);
      });

      expect(await learnServerChannelBindings({ host: "127.0.0.1", port })).toEqual([]);
    });
  });
});
