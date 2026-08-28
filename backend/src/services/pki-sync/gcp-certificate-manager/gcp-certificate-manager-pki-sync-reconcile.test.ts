import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, vi } from "vitest";

import { gcpCertificateManagerPkiSyncFactory } from "./gcp-certificate-manager-pki-sync-fns";

const { clientMock, createClientMock, calls } = vi.hoisted(() => {
  const order: string[] = [];
  const client = {
    assertCertificateMapExists: vi.fn(),
    listCertificates: vi.fn(),
    listCertificateMapEntries: vi.fn(),
    getCertificateMapEntry: vi.fn(),
    createCertificateMapEntry: vi.fn(),
    updateCertificateMapEntryCertificates: vi.fn(),
    deleteCertificateMapEntry: vi.fn(),
    upsertCertificate: vi.fn(),
    deleteCertificate: vi.fn()
  };
  return { clientMock: client, createClientMock: vi.fn(() => client), calls: order };
});

vi.mock("./gcp-certificate-manager-pki-sync-auth-fns", () => ({
  getGcpAccessToken: vi.fn().mockResolvedValue("token")
}));

vi.mock("./gcp-certificate-manager-pki-sync-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./gcp-certificate-manager-pki-sync-client")>()),
  createGcpCertificateManagerClient: createClientMock
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const LEAF =
  "-----BEGIN CERTIFICATE-----\nMIIDFTCCAf2gAwIBAgIUEvrsmSKnzo8HANa2TOeNIcg5b7AwDQYJKoZIhvcNAQEL\nBQAwGjEYMBYGA1UEAwwPYXBwLmV4YW1wbGUuY29tMB4XDTI2MDgyNjIwMzcxOFoX\nDTI2MDgyODIwMzcxOFowGjEYMBYGA1UEAwwPYXBwLmV4YW1wbGUuY29tMIIBIjAN\nBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs/7FAanft8ZcQ/08/U86mRfsdX8Y\nmykUf9VYgO/26TG7dh5M6awS1mGybPiQ/ni887zulgUkYwYkRyxcSz3xQ9B5SSdG\nAcz2mX3mU95ZsqtE9YbAo7rLgoOb1tj9yOHDiLzlJ2wtkDm0SLDebFe/m0A5f0uP\nPCxknOHwcLXN8AFmr28LiPI9CSXHe3iynL7eluwV531E7ku1kVbxfxxmxmPOyQO9\nS0Gd94m6qFfZpSJmxGSkaUQWx1wtz2Y59tTIsglc2/p+cUajy9PSrSqtanUYIGdb\n9haYl5HwSf9NMPRq8+mjo5HSeavz2Bk438w/BGYLnrtdIx81KwuMXvZ+DwIDAQAB\no1MwUTAdBgNVHQ4EFgQUD1/0yZj6YtwdDH/Iyd611C9v34owHwYDVR0jBBgwFoAU\nD1/0yZj6YtwdDH/Iyd611C9v34owDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0B\nAQsFAAOCAQEAcK7qES2oaXKQc8xuFPzAb7Igb4UvPhPQhRiB2nX5dmTDrVm1lbM8\ncvg5Z38sXMbiQOLpBuhp38Q4F1DIBFrVYOt1wxHTRXYwHBrsG/Acfc6gA1sZcFEG\n+iVavLshStDDQPSL630uzpLnNfEqsdplg7NKajKvc2pazQKQjf9NA9BPp1MmGU1P\ndv33JB0AiCkySXJlSD5mPMorE0G4NA3qSfzC+89Hywo+fJzj4uASolZ7kIkNrEhs\nP3ov7gfOYfdkSns5mLUY8H6VhX4PUm/IT8LQ4DeCOS/qKxSaTJgywp3xr1q8n1xa\nN11/kEdbuLRx+bQ19ULTVFQ2vNEq8C9HYw==\n-----END CERTIFICATE-----";
const KEY =
  "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCz/sUBqd+3xlxD\n/Tz9TzqZF+x1fxibKRR/1ViA7/bpMbt2HkzprBLWYbJs+JD+eLzzvO6WBSRjBiRH\nLFxLPfFD0HlJJ0YBzPaZfeZT3lmyq0T1hsCjusuCg5vW2P3I4cOIvOUnbC2QObRI\nsN5sV7+bQDl/S488LGSc4fBwtc3wAWavbwuI8j0JJcd7eLKcvt6W7BXnfUTuS7WR\nVvF/HGbGY87JA71LQZ33ibqoV9mlImbEZKRpRBbHXC3PZjn21MiyCVzb+n5xRqPL\n09KtKq1qdRggZ1v2FpiXkfBJ/00w9Grz6aOjkdJ5q/PYGTjfzD8EZgueu10jHzUr\nC4xe9n4PAgMBAAECggEAU5ruFSS7lpgbeTUiZCKt/Dhhi/36BvAg5nPJhTJxBMYl\n5eqTHSLhKRT+FKGsb5bTZX+HbsV6rkhHB4wyXnyqGS63d2Q3n1R94rPZDXHFRjlJ\ncaYiyqpUJw5Mj5IA55L+CQB8jEAyNcCn3e/RkI99n3ZIfrkxEeko3roPvbqkqmqk\ns5GBXoyQHyPQChZxLuJygGvf6CcQzVgeUyYhB+F+0FqiAXpozX0V/E41AtAzIOe5\nuGzMgEaij8F2eFtFqGLEx9hFB7XbBpO3mxUduXk/hTcGhTnAWb91650OOrYFy8gB\nU0H2OT102CLxKr/iSiLcKZkQjVom6tOjQ6hxBYOBUQKBgQDci+b47ZY/sOzWS0Hz\n8aI36l9xS7bzrSHS3aV/1Hny7vJGdRXENE5JKA13YNE7zbdY78Qbq1bEE0JLqDpo\nOizx5+HvB64RsKdh2IGE7F+g26WCGj8z9tIP5AiIjUN4UK8wdnM2CCv1JPK/pSM4\n512WL7eg5cJKxNhp+zrSg2gsxwKBgQDQ7hG7VJeZtXhIVsj+7JwfSYWZ77Qtk70+\nSAuG/lT+REURPtN9DBpZLiS7XIo5jgciC9dD4e+wA66XJfiC8wEFyVAIO1OtG7oG\nMVhvn1kUqTIquPHs8sfnpXWGpz6qYij6t5AZVOTCC3wuNJ4CPasMD7/Maia1gADS\n+udmumAMeQKBgBlEHc3eyhu51SgnrwKXaBIn049TMT5xUzKpGdCvMtlV7oOL3lZ/\n94gCAqjueonzY1HZBgp1cpc77ZhlSWuvXn7IJeYQZyy3pDVdbFkiC0KOZ0OkZiE5\n4Y7YfPHH3TbnZ2qR51kFTqPi+7xg2swmFV6jUNIqADw4mOJrWa3MSB75AoGAQwYc\nahwZBhZRH+O3VxBQhTjwwxFCm9xpOTGjgQrV+TutbHrbHaJkUXecEP7+2LfXUfS6\neexhF/YWbCaiMmACU/jg08M0dLQQWSw7UpOr4BTnIw1xjrHTr1xE941vbPlQbB22\n/GlfeWB11dzLU6y00om63biv8km9+fDDixD+/wECgYBbp6wjgpXRnR7ybjB8iBZj\nY60XenGYWzrvktn8JUyOS0Ncw3rqobZNGgsg43urqKOmTFe5EM2k+jcm9vkeQcFd\n1SAYGGJYe7vKVhIN4uZ7F683dpuhzYWGCzFbuZaGtIPYPguF2QnK7rh1OColkkQc\n7jgp3wz7ElOrqIoa8tGEHw==\n-----END PRIVATE KEY-----";
const SYNC_ID = "11111111-1111-1111-1111-111111111111";
const CERT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CERT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PROJECT = "my-prod-project";
const MAP = "prod-map";

const resourceName = (id: string) => `projects/${PROJECT}/locations/global/certificates/${id}`;
const entryName = (map: string) =>
  `projects/${PROJECT}/locations/global/certificateMaps/${map}/certificateMapEntries/infisical-${SYNC_ID}`;

const pkiSync = (overrides: Record<string, unknown> = {}) =>
  ({
    id: SYNC_ID,
    destination: "gcp-certificate-manager",
    destinationConfig: {
      gcpProjectId: PROJECT,
      location: "global",
      scope: "default",
      certificateMapBinding: { certificateMap: MAP }
    },
    syncOptions: { preserveItemOnRenewal: true },
    ...overrides
  }) as never;

const gcpCertificate = (id: string, usedByEntry?: string) => ({
  name: resourceName(id),
  labels: { "managed-by": "infisical" },
  ...(usedByEntry ? { usedBy: [{ name: usedByEntry }] } : {})
});

const managedEntry = (map: string, certificates: string[]) => ({
  name: entryName(map),
  labels: { "managed-by": "infisical" },
  matcher: "PRIMARY",
  certificates
});

const googleError = (httpStatus: number, status: string, message: string) => {
  const error = new AxiosError(message);
  error.response = {
    status: httpStatus,
    statusText: status,
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
    data: { error: { code: httpStatus, status, message } }
  };
  return error;
};

let syncRecords: Array<{ id: string; certificateId: string; externalIdentifier: string }>;
let certificateRows: Record<string, { id: string; renewedByCertificateId?: string; renewedFromCertificateId?: string }>;
let removedRecordIds: string[][];

const certificateSyncDAL = {
  findByPkiSyncId: vi.fn(async () => syncRecords),
  findByPkiSyncAndCertificate: vi.fn(async (_syncId: string, certificateId: string) =>
    syncRecords.find((row) => row.certificateId === certificateId)
  ),
  addCertificates: vi.fn(async () => []),
  updateById: vi.fn(async () => undefined),
  removeCertificates: vi.fn(async (_syncId: string, ids: string[]) => {
    removedRecordIds.push(ids);
    return 0;
  }),
  updateSyncStatus: vi.fn(async () => undefined)
} as never;

const certificateDAL = {
  findById: vi.fn(async (id: string) => certificateRows[id])
} as never;

const buildFns = () => gcpCertificateManagerPkiSyncFactory({ certificateSyncDAL, certificateDAL });

const unboundSync = (syncOptions: Record<string, unknown>) =>
  pkiSync({
    destinationConfig: { gcpProjectId: PROJECT, location: "global", scope: "default" },
    syncOptions
  });

beforeEach(() => {
  calls.length = 0;
  syncRecords = [];
  certificateRows = {};
  removedRecordIds = [];
  Object.values(clientMock).forEach((fn) => fn.mockReset());
  clientMock.assertCertificateMapExists.mockResolvedValue(undefined);
  clientMock.listCertificates.mockResolvedValue(new Map());
  clientMock.listCertificateMapEntries.mockResolvedValue(new Map());
  clientMock.getCertificateMapEntry.mockResolvedValue(undefined);
  clientMock.upsertCertificate.mockResolvedValue(undefined);
  clientMock.createCertificateMapEntry.mockImplementation(async () => {
    calls.push("createEntry");
  });
  clientMock.updateCertificateMapEntryCertificates.mockImplementation(async () => {
    calls.push("updateEntry");
  });
  clientMock.deleteCertificateMapEntry.mockImplementation(async () => {
    calls.push("deleteEntry");
  });
  clientMock.deleteCertificate.mockImplementation(async () => {
    calls.push("deleteCertificate");
  });
});

describe("certificate map entry reconciliation", () => {
  test("keeps a certificate whose upload failed in the entry instead of dropping it from traffic", async () => {
    syncRecords = [
      { id: "rec-a", certificateId: CERT_A, externalIdentifier: resourceName("cert-a") },
      { id: "rec-b", certificateId: CERT_B, externalIdentifier: resourceName("cert-b") }
    ];
    certificateRows = { [CERT_A]: { id: CERT_A }, [CERT_B]: { id: CERT_B } };
    clientMock.listCertificates.mockResolvedValue(
      new Map([
        [resourceName("cert-a"), gcpCertificate("cert-a", entryName(MAP))],
        [resourceName("cert-b"), gcpCertificate("cert-b", entryName(MAP))]
      ])
    );
    clientMock.getCertificateMapEntry.mockResolvedValue(
      managedEntry(MAP, [resourceName("cert-a"), resourceName("cert-b")])
    );
    clientMock.upsertCertificate.mockImplementation(async ({ certificateId }: { certificateId: string }) => {
      if (certificateId === "cert-b") throw new Error("GCP rejected the certificate update");
    });

    const result = await buildFns().syncCertificates(pkiSync(), {
      "cert-a": { cert: LEAF, privateKey: KEY, certificateId: CERT_A },
      "cert-b": { cert: LEAF, privateKey: KEY, certificateId: CERT_B }
    } as never);

    expect(result.uploaded).toBe(1);
    expect(result.details?.failedUploads).toHaveLength(1);
    expect(clientMock.updateCertificateMapEntryCertificates).not.toHaveBeenCalled();
    expect(clientMock.deleteCertificateMapEntry).not.toHaveBeenCalled();
    expect(clientMock.deleteCertificate).not.toHaveBeenCalled();
  });

  test("never puts an upload target in the failure details, because a target holds the private key", async () => {
    certificateRows = { [CERT_A]: { id: CERT_A } };
    clientMock.upsertCertificate.mockRejectedValue(new Error("GCP rejected the certificate upload"));

    const result = await buildFns().syncCertificates(unboundSync({}), {
      "cert-a": { cert: LEAF, privateKey: KEY, certificateId: CERT_A }
    } as never);

    expect(result.details?.failedUploads).toHaveLength(1);
    expect(Object.keys(result.details!.failedUploads![0]).sort()).toEqual(["error", "name"]);
    expect(JSON.stringify(result)).not.toContain("BEGIN PRIVATE KEY");
  });

  test("keeps a skipped certificate in the entry", async () => {
    syncRecords = [
      { id: "rec-a", certificateId: CERT_A, externalIdentifier: resourceName("cert-a") },
      { id: "rec-b", certificateId: CERT_B, externalIdentifier: resourceName("cert-b") }
    ];
    certificateRows = { [CERT_A]: { id: CERT_A }, [CERT_B]: { id: CERT_B } };
    clientMock.listCertificates.mockResolvedValue(
      new Map([
        [resourceName("cert-a"), gcpCertificate("cert-a", entryName(MAP))],
        [resourceName("cert-b"), gcpCertificate("cert-b", entryName(MAP))]
      ])
    );
    clientMock.getCertificateMapEntry.mockResolvedValue(
      managedEntry(MAP, [resourceName("cert-a"), resourceName("cert-b")])
    );

    const result = await buildFns().syncCertificates(pkiSync(), {
      "cert-a": { cert: LEAF, privateKey: KEY, certificateId: CERT_A },
      "cert-b": { cert: LEAF, certificateId: CERT_B }
    } as never);

    expect(result.skipped).toBe(1);
    expect(clientMock.updateCertificateMapEntryCertificates).not.toHaveBeenCalled();
    expect(clientMock.deleteCertificate).not.toHaveBeenCalled();
  });

  test("does not delete certificates or reap entries when the entry could not be reconciled", async () => {
    syncRecords = [{ id: "rec-a", certificateId: CERT_A, externalIdentifier: resourceName("stale-cert") }];
    certificateRows = { [CERT_A]: { id: CERT_A } };
    clientMock.listCertificates.mockResolvedValue(
      new Map([[resourceName("stale-cert"), gcpCertificate("stale-cert", entryName("an-old-map"))]])
    );
    clientMock.getCertificateMapEntry.mockRejectedValue(new Error("boom"));

    const result = await buildFns().syncCertificates(pkiSync({ syncOptions: { preserveItemOnRenewal: false } }), {
      "cert-a": { cert: LEAF, privateKey: KEY, certificateId: CERT_A }
    } as never);

    expect(result.partialFailureMessage).toContain("certificate map entry could not be updated");
    expect(result.removed).toBe(0);
    expect(clientMock.deleteCertificate).not.toHaveBeenCalled();
    expect(clientMock.deleteCertificateMapEntry).not.toHaveBeenCalled();
  });

  test("blames the delete, not the update, when a hostname change cannot remove the old entry", async () => {
    certificateRows = { [CERT_A]: { id: CERT_A } };
    clientMock.getCertificateMapEntry.mockResolvedValue({
      ...managedEntry(MAP, [resourceName("cert-a")]),
      matcher: undefined,
      hostname: "old.example.com"
    });
    clientMock.deleteCertificateMapEntry.mockRejectedValue(
      googleError(403, "PERMISSION_DENIED", "caller lacks permission")
    );

    const result = await buildFns().syncCertificates(
      pkiSync({
        destinationConfig: {
          gcpProjectId: PROJECT,
          location: "global",
          scope: "default",
          certificateMapBinding: { certificateMap: MAP, hostname: "new.example.com" }
        }
      }),
      { "cert-a": { cert: LEAF, privateKey: KEY, certificateId: CERT_A } } as never
    );

    expect(result.partialFailureMessage).toContain("certificatemanager.certmapentries.delete");
    expect(result.partialFailureMessage).toContain("roles/certificatemanager.owner");
  });

  test("creates the entry in the new map before reaping the entry in the old one", async () => {
    syncRecords = [{ id: "rec-a", certificateId: CERT_A, externalIdentifier: resourceName("cert-a") }];
    certificateRows = { [CERT_A]: { id: CERT_A } };
    clientMock.listCertificates.mockResolvedValue(
      new Map([[resourceName("cert-a"), gcpCertificate("cert-a", entryName("previous-map"))]])
    );

    await buildFns().syncCertificates(pkiSync(), {
      "cert-a": { cert: LEAF, privateKey: KEY, certificateId: CERT_A }
    } as never);

    expect(calls).toEqual(["createEntry", "deleteEntry"]);
  });

  test("reports a failed cleanup of a previous binding instead of finishing green", async () => {
    certificateRows = { [CERT_A]: { id: CERT_A } };
    clientMock.listCertificates.mockResolvedValue(
      new Map([[resourceName("cert-a"), gcpCertificate("cert-a", entryName("previous-map"))]])
    );
    clientMock.deleteCertificateMapEntry.mockRejectedValue(
      googleError(403, "PERMISSION_DENIED", "caller lacks permission")
    );

    const result = await buildFns().syncCertificates(pkiSync(), {
      "cert-a": { cert: LEAF, privateKey: KEY, certificateId: CERT_A }
    } as never);

    expect(result.partialFailureMessage).toContain("previous-map");
    expect(result.partialFailureMessage).toContain("could not be removed");
  });

  test("refuses to drop a working entry when clearing the hostname would collide with another primary", async () => {
    certificateRows = { [CERT_A]: { id: CERT_A } };
    clientMock.getCertificateMapEntry.mockResolvedValue({
      ...managedEntry(MAP, [resourceName("cert-a")]),
      matcher: undefined,
      hostname: "old.example.com"
    });
    clientMock.listCertificateMapEntries.mockResolvedValue(
      new Map([["someone-elses-entry", { name: "someone-elses-entry", matcher: "PRIMARY", certificates: [] }]])
    );

    const result = await buildFns().syncCertificates(pkiSync(), {
      "cert-a": { cert: LEAF, privateKey: KEY, certificateId: CERT_A }
    } as never);

    expect(clientMock.deleteCertificateMapEntry).not.toHaveBeenCalled();
    expect(result.partialFailureMessage).toContain("already has a primary entry");
  });

  test("only lists the whole map when it is about to create a primary entry", async () => {
    certificateRows = { [CERT_A]: { id: CERT_A } };
    clientMock.getCertificateMapEntry.mockResolvedValue(managedEntry(MAP, [resourceName("cert-a")]));

    await buildFns().syncCertificates(pkiSync(), {
      "cert-a": { cert: LEAF, privateKey: KEY, certificateId: CERT_A }
    } as never);

    expect(clientMock.getCertificateMapEntry).toHaveBeenCalledTimes(1);
    expect(clientMock.listCertificateMapEntries).not.toHaveBeenCalled();
  });
});

describe("renewal that replaces the GCP resource", () => {
  const renewalRows = {
    [CERT_A]: { id: CERT_A },
    [CERT_B]: { id: CERT_B, renewedFromCertificateId: CERT_A }
  };

  test("keeps the old sync record until the old GCP certificate is actually deleted", async () => {
    syncRecords = [{ id: "rec-a", certificateId: CERT_A, externalIdentifier: resourceName("old-name") }];
    certificateRows = renewalRows;
    clientMock.listCertificates.mockResolvedValue(new Map([[resourceName("old-name"), gcpCertificate("old-name")]]));
    clientMock.deleteCertificate.mockRejectedValue(
      googleError(409, "FAILED_PRECONDITION", "can't delete certificate that is referenced by a CertificateMapEntry")
    );

    const result = await buildFns().syncCertificates(unboundSync({ preserveItemOnRenewal: false }), {
      "new-name": { cert: LEAF, privateKey: KEY, certificateId: CERT_B }
    } as never);

    expect(result.failedRemovals).toBe(1);
    expect(removedRecordIds.flat()).not.toContain(CERT_A);
  });

  test("clears the old sync record when GCP reports the certificate is already gone", async () => {
    syncRecords = [{ id: "rec-a", certificateId: CERT_A, externalIdentifier: resourceName("old-name") }];
    certificateRows = renewalRows;
    clientMock.listCertificates.mockResolvedValue(new Map([[resourceName("old-name"), gcpCertificate("old-name")]]));
    clientMock.deleteCertificate.mockRejectedValue(googleError(404, "NOT_FOUND", "certificate not found"));

    const result = await buildFns().syncCertificates(unboundSync({ preserveItemOnRenewal: false }), {
      "new-name": { cert: LEAF, privateKey: KEY, certificateId: CERT_B }
    } as never);

    expect(result.failedRemovals).toBe(0);
    expect(removedRecordIds.flat()).toContain(CERT_A);
  });

  test("drops the old sync record immediately when renewal reuses the same resource name", async () => {
    syncRecords = [{ id: "rec-a", certificateId: CERT_A, externalIdentifier: resourceName("reused-name") }];
    certificateRows = renewalRows;
    clientMock.listCertificates.mockResolvedValue(
      new Map([[resourceName("reused-name"), gcpCertificate("reused-name")]])
    );

    await buildFns().syncCertificates(unboundSync({ preserveItemOnRenewal: true }), {
      "reused-name": { cert: LEAF, privateKey: KEY, certificateId: CERT_B }
    } as never);

    expect(removedRecordIds.flat()).toContain(CERT_A);
    expect(clientMock.deleteCertificate).not.toHaveBeenCalled();
  });
});
