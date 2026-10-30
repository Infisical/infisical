import { beforeEach, vi } from "vitest";

import { createGcpCertificateManagerClient } from "./gcp-certificate-manager-pki-sync-client";
import { GcpCertificateManagerScope } from "./gcp-certificate-manager-pki-sync-enums";

type TCapturedCall = [string, Record<string, unknown>, { params: Record<string, string> }];

const { requestMock } = vi.hoisted(() => ({
  requestMock: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock("@app/lib/config/request", () => ({ request: requestMock }));

const lastCall = (mock: { mock: { calls: unknown[][] } }): TCapturedCall =>
  mock.mock.calls[0] as unknown as TCapturedCall;

const done = { data: { name: "projects/p/locations/global/operations/op-1", done: true } };

const buildClient = () =>
  createGcpCertificateManagerClient({
    accessToken: "token",
    gcpProjectId: "my-prod-project",
    location: "global",
    syncId: "sync-1"
  });

const upsertArgs = {
  certificateId: "infisical-abc",
  pemCertificate: "-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----",
  pemPrivateKey: "-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----",
  labels: { "managed-by": "infisical" },
  scope: GcpCertificateManagerScope.EdgeCache
};

beforeEach(() => {
  requestMock.get.mockReset();
  requestMock.post.mockReset().mockResolvedValue(done);
  requestMock.patch.mockReset().mockResolvedValue(done);
  requestMock.delete.mockReset().mockResolvedValue(done);
});

describe("GCP certificate create payload", () => {
  test("translates the configured scope into the value GCP expects on create", async () => {
    await buildClient().upsertCertificate({ ...upsertArgs, shouldPatch: false });

    expect(requestMock.post).toHaveBeenCalledTimes(1);
    const [, body, config] = lastCall(requestMock.post);
    expect(body.scope).toBe("EDGE_CACHE");
    expect((body.selfManaged as { pemCertificate: string }).pemCertificate).toContain("BEGIN CERTIFICATE");
    expect(config.params.certificateId).toBe("infisical-abc");
  });

  test("never sends scope on update, because GCP treats it as immutable", async () => {
    await buildClient().upsertCertificate({ ...upsertArgs, shouldPatch: true });

    expect(requestMock.patch).toHaveBeenCalledTimes(1);
    const [, body, config] = lastCall(requestMock.patch);
    expect(body.scope).toBeUndefined();
    expect(config.params.updateMask).toBe("self_managed,labels,description");
    expect(config.params.updateMask).not.toContain("scope");
  });
});

describe("GCP certificate map entry payload", () => {
  test("uses the PRIMARY matcher when no hostname is configured", async () => {
    await buildClient().createCertificateMapEntry({
      certificateMap: "prod-map",
      entryId: "infisical-sync-1",
      certificateResourceNames: ["projects/my-prod-project/locations/global/certificates/infisical-abc"],
      labels: {}
    });

    const [, body] = lastCall(requestMock.post);
    expect(body.matcher).toBe("PRIMARY");
    expect(body.hostname).toBeUndefined();
  });

  test("sends every certificate the entry should reference", async () => {
    // GCP allows up to four per entry, which is how one hostname serves an RSA and an ECDSA cert.
    const certificates = [
      "projects/my-prod-project/locations/global/certificates/infisical-rsa",
      "projects/my-prod-project/locations/global/certificates/infisical-ecdsa"
    ];

    await buildClient().createCertificateMapEntry({
      certificateMap: "prod-map",
      entryId: "infisical-sync-1",
      certificateResourceNames: certificates,
      hostname: "app.example.com",
      labels: {}
    });

    const [, body] = lastCall(requestMock.post);
    expect(body.certificates).toEqual(certificates);
  });

  test("patches the full certificate list, so removing one keeps the others", async () => {
    const remaining = ["projects/my-prod-project/locations/global/certificates/infisical-ecdsa"];

    await buildClient().updateCertificateMapEntryCertificates({
      certificateMap: "prod-map",
      entryId: "infisical-sync-1",
      certificateResourceNames: remaining,
      labels: {}
    });

    const [, body, config] = lastCall(requestMock.patch);
    expect(body.certificates).toEqual(remaining);
    expect(config.params.updateMask).toBe("certificates,labels");
  });

  test("uses the hostname when one is configured", async () => {
    await buildClient().createCertificateMapEntry({
      certificateMap: "prod-map",
      entryId: "infisical-sync-1",
      certificateResourceNames: ["projects/my-prod-project/locations/global/certificates/infisical-abc"],
      hostname: "app.example.com",
      labels: {}
    });

    const [, body] = lastCall(requestMock.post);
    expect(body.hostname).toBe("app.example.com");
    expect(body.matcher).toBeUndefined();
  });
});
