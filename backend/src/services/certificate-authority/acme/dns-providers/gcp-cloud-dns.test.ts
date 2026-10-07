import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TGcpConnection } from "@app/services/app-connection/gcp/gcp-connection-types";

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn<(url: string, config?: unknown) => Promise<unknown>>(),
  postMock: vi.fn<(url: string, body?: unknown, config?: unknown) => Promise<unknown>>()
}));

vi.mock("@app/lib/config/request", () => ({
  request: { get: getMock, post: postMock }
}));
vi.mock("@app/services/app-connection/gcp/gcp-connection-fns", () => ({
  getGcpConnectionAuthToken: vi.fn().mockResolvedValue("gcp-token")
}));
vi.mock("@app/lib/delay", () => ({ delay: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

// eslint-disable-next-line import/first
import { TDnsRecordLockKeyStore } from "./dns-record-lock";
// eslint-disable-next-line import/first
import { gcpCloudDnsDeleteTxtRecord, gcpCloudDnsInsertTxtRecord, validateGcpCloudDnsZone } from "./gcp-cloud-dns";

const connection = { id: "connection-id" } as TGcpConnection;
const ZONE = "projects/my-project/managedZones/example-zone";
const ZONE_URL = `https://dns.googleapis.com/dns/v1/${ZONE}`;
const RECORD = "_acme-challenge.example.com";
const FQDN = `${RECORD}.`;

const axiosError = (status: number, message = `status ${status}`, extra: Record<string, unknown> = {}) =>
  new AxiosError("request failed", String(status), undefined, undefined, {
    status,
    statusText: "",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { error: { message, ...extra } }
  });

const existingRecordSet = (rrdatas: string[], ttl = 60) => ({ data: { name: FQDN, type: "TXT", ttl, rrdatas } });

describe("validateGcpCloudDnsZone", () => {
  it("accepts a managed zone resource name", () => {
    expect(() => validateGcpCloudDnsZone(ZONE)).not.toThrow();
  });

  it.each(["example-zone", "projects/my-project/managedZones/", "projects/My_Project/managedZones/zone", `${ZONE}/x`])(
    "rejects %s",
    (value) => {
      expect(() => validateGcpCloudDnsZone(value)).toThrow(/Invalid Google Cloud DNS zone/);
    }
  );
});

describe("gcpCloudDnsInsertTxtRecord", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset().mockResolvedValue({ data: {} });
  });

  it("creates the record set when none exists", async () => {
    getMock.mockRejectedValueOnce(axiosError(404));

    await gcpCloudDnsInsertTxtRecord(connection, ZONE, RECORD, '"token-a"');

    expect(getMock).toHaveBeenCalledWith(`${ZONE_URL}/rrsets/${encodeURIComponent(FQDN)}/TXT`, expect.anything());
    expect(postMock).toHaveBeenCalledWith(
      `${ZONE_URL}/changes`,
      { additions: [{ name: FQDN, type: "TXT", ttl: 60, rrdatas: ['"token-a"'] }] },
      expect.anything()
    );
  });

  it("appends to an existing record set so concurrent challenges on one name both survive", async () => {
    getMock.mockResolvedValueOnce(existingRecordSet(['"token-a"']));

    await gcpCloudDnsInsertTxtRecord(connection, ZONE, RECORD, '"token-b"');

    expect(postMock).toHaveBeenCalledWith(
      `${ZONE_URL}/changes`,
      {
        deletions: [{ name: FQDN, type: "TXT", ttl: 60, rrdatas: ['"token-a"'] }],
        additions: [{ name: FQDN, type: "TXT", ttl: 60, rrdatas: ['"token-a"', '"token-b"'] }]
      },
      expect.anything()
    );
  });

  it("keeps the TTL of a record set it did not create", async () => {
    getMock.mockResolvedValueOnce(existingRecordSet(['"customer-value"'], 3600));

    await gcpCloudDnsInsertTxtRecord(connection, ZONE, RECORD, '"token-a"');

    expect(postMock).toHaveBeenCalledWith(
      `${ZONE_URL}/changes`,
      {
        deletions: [{ name: FQDN, type: "TXT", ttl: 3600, rrdatas: ['"customer-value"'] }],
        additions: [{ name: FQDN, type: "TXT", ttl: 3600, rrdatas: ['"customer-value"', '"token-a"'] }]
      },
      expect.anything()
    );
  });

  it("holds a per-record lock while it updates the record set", async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const acquireLock = vi.fn().mockResolvedValue({ release });
    getMock.mockRejectedValueOnce(axiosError(404));

    await gcpCloudDnsInsertTxtRecord(connection, ZONE, RECORD, '"token-a"', {
      acquireLock
    } as unknown as TDnsRecordLockKeyStore);

    expect(acquireLock).toHaveBeenCalledWith(
      [`acme-dns-record-mutex-connection-id-${ZONE.toLowerCase()}-${FQDN}`],
      expect.any(Number),
      expect.anything()
    );
    const [, lockTtlMs, retry] = acquireLock.mock.calls[0] as [
      string[],
      number,
      { retryCount: number; retryDelay: number }
    ];
    expect(retry.retryCount * retry.retryDelay).toBeGreaterThanOrEqual(lockTtlMs);
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("fails without touching the record when another order holds the lock", async () => {
    const acquireLock = vi.fn().mockRejectedValue(new Error("lock busy"));

    await expect(
      gcpCloudDnsInsertTxtRecord(connection, ZONE, RECORD, '"token-a"', {
        acquireLock
      } as unknown as TDnsRecordLockKeyStore)
    ).rejects.toThrow("Another certificate order is still using it.");
    expect(getMock).not.toHaveBeenCalled();
    expect(postMock).not.toHaveBeenCalled();
  });

  it("serializes concurrent updates to the same record in one process", async () => {
    let releaseFirstRead: (value: unknown) => void = () => {};
    getMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirstRead = resolve;
          })
      )
      .mockResolvedValueOnce(existingRecordSet(['"token-a"']));

    const first = gcpCloudDnsInsertTxtRecord(connection, ZONE, RECORD, '"token-a"');
    const second = gcpCloudDnsInsertTxtRecord(connection, ZONE, RECORD, '"token-b"');
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    expect(getMock).toHaveBeenCalledTimes(1);

    releaseFirstRead(Promise.reject(axiosError(404)));
    await Promise.all([first, second]);

    expect(postMock).toHaveBeenCalledTimes(2);
    expect(postMock).toHaveBeenLastCalledWith(
      `${ZONE_URL}/changes`,
      expect.objectContaining({
        additions: [expect.objectContaining({ rrdatas: ['"token-a"', '"token-b"'] })]
      }),
      expect.anything()
    );
  });

  it("retries as a fresh create when the record set was deleted between read and write", async () => {
    getMock.mockResolvedValueOnce(existingRecordSet(['"token-a"'])).mockRejectedValueOnce(axiosError(404));
    postMock.mockRejectedValueOnce(axiosError(404)).mockResolvedValueOnce({ data: {} });

    await gcpCloudDnsInsertTxtRecord(connection, ZONE, RECORD, '"token-b"');

    expect(postMock).toHaveBeenCalledTimes(2);
    expect(postMock).toHaveBeenLastCalledWith(
      `${ZONE_URL}/changes`,
      { additions: [{ name: FQDN, type: "TXT", ttl: 60, rrdatas: ['"token-b"'] }] },
      expect.anything()
    );
  });

  it("does not retry a 404 on a plain create", async () => {
    getMock.mockRejectedValueOnce(axiosError(404));
    postMock.mockRejectedValueOnce(axiosError(404, "The managed zone does not exist."));

    await expect(gcpCloudDnsInsertTxtRecord(connection, ZONE, RECORD, '"token-a"')).rejects.toThrow(
      "Failed to update Google Cloud DNS TXT record '_acme-challenge.example.com.' in zone 'example-zone': The managed zone does not exist."
    );
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the value is already present", async () => {
    getMock.mockResolvedValueOnce(existingRecordSet(["token-a"]));

    await gcpCloudDnsInsertTxtRecord(connection, ZONE, RECORD, '"token-a"');

    expect(postMock).not.toHaveBeenCalled();
  });

  it("re-reads and retries when the record set changed underneath it", async () => {
    getMock.mockRejectedValueOnce(axiosError(404)).mockResolvedValueOnce(existingRecordSet(['"token-a"']));
    postMock.mockRejectedValueOnce(axiosError(409)).mockResolvedValueOnce({ data: {} });

    await gcpCloudDnsInsertTxtRecord(connection, ZONE, RECORD, '"token-b"');

    expect(postMock).toHaveBeenCalledTimes(2);
    expect(postMock).toHaveBeenLastCalledWith(
      `${ZONE_URL}/changes`,
      expect.objectContaining({
        additions: [expect.objectContaining({ rrdatas: ['"token-a"', '"token-b"'] })]
      }),
      expect.anything()
    );
  });

  it("tells the user which role to grant when the service account lacks access", async () => {
    getMock.mockRejectedValueOnce(axiosError(403));

    await expect(gcpCloudDnsInsertTxtRecord(connection, ZONE, RECORD, '"token-a"')).rejects.toThrow(
      "Grant it the DNS Administrator role (roles/dns.admin) on GCP project 'my-project'"
    );
    expect(postMock).not.toHaveBeenCalled();
  });

  it("tells the user to enable the API when Cloud DNS is disabled on the project", async () => {
    getMock.mockRejectedValueOnce(
      axiosError(403, "Cloud DNS API has not been used in project 123456 before or it is disabled.")
    );

    await expect(gcpCloudDnsInsertTxtRecord(connection, ZONE, RECORD, '"token-a"')).rejects.toThrow(
      "The Cloud DNS API is not enabled on GCP project 'my-project'"
    );
  });

  it("detects a disabled API from Google's error reason, whatever the message says", async () => {
    getMock.mockRejectedValueOnce(
      axiosError(403, "Cloud DNS API is disabled.", {
        details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "SERVICE_DISABLED" }]
      })
    );

    await expect(gcpCloudDnsInsertTxtRecord(connection, ZONE, RECORD, '"token-a"')).rejects.toThrow(
      "The Cloud DNS API is not enabled on GCP project 'my-project'"
    );
  });

  it("does not treat other disabled resources as a disabled API", async () => {
    getMock.mockRejectedValueOnce(axiosError(403, "The billing account for the project is disabled."));

    await expect(gcpCloudDnsInsertTxtRecord(connection, ZONE, RECORD, '"token-a"')).rejects.toThrow(
      "Grant it the DNS Administrator role"
    );
  });

  it("surfaces the provider message on other failures", async () => {
    getMock.mockRejectedValueOnce(axiosError(400));

    await expect(gcpCloudDnsInsertTxtRecord(connection, ZONE, RECORD, '"token-a"')).rejects.toThrow(
      "Failed to update Google Cloud DNS TXT record '_acme-challenge.example.com.' in zone 'example-zone': status 400"
    );
  });
});

describe("gcpCloudDnsDeleteTxtRecord", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset().mockResolvedValue({ data: {} });
  });

  it("removes only its own value when other values remain", async () => {
    getMock.mockResolvedValueOnce(existingRecordSet(['"token-a"', '"token-b"']));

    await gcpCloudDnsDeleteTxtRecord(connection, ZONE, RECORD, '"token-a"');

    expect(postMock).toHaveBeenCalledWith(
      `${ZONE_URL}/changes`,
      {
        deletions: [{ name: FQDN, type: "TXT", ttl: 60, rrdatas: ['"token-a"', '"token-b"'] }],
        additions: [{ name: FQDN, type: "TXT", ttl: 60, rrdatas: ['"token-b"'] }]
      },
      expect.anything()
    );
  });

  it("deletes the record set when its last value is removed", async () => {
    getMock.mockResolvedValueOnce(existingRecordSet(['"token-a"']));

    await gcpCloudDnsDeleteTxtRecord(connection, ZONE, RECORD, '"token-a"');

    expect(postMock).toHaveBeenCalledWith(
      `${ZONE_URL}/changes`,
      { deletions: [{ name: FQDN, type: "TXT", ttl: 60, rrdatas: ['"token-a"'] }] },
      expect.anything()
    );
  });

  it("re-reads and retries when another challenge removed its value first", async () => {
    getMock
      .mockResolvedValueOnce(existingRecordSet(['"token-a"', '"token-b"']))
      .mockResolvedValueOnce(existingRecordSet(['"token-a"']));
    postMock.mockRejectedValueOnce(axiosError(412)).mockResolvedValueOnce({ data: {} });

    await gcpCloudDnsDeleteTxtRecord(connection, ZONE, RECORD, '"token-a"');

    expect(postMock).toHaveBeenCalledTimes(2);
    expect(postMock).toHaveBeenLastCalledWith(
      `${ZONE_URL}/changes`,
      { deletions: [{ name: FQDN, type: "TXT", ttl: 60, rrdatas: ['"token-a"'] }] },
      expect.anything()
    );
  });

  it("is a no-op when the record set or value is already gone", async () => {
    getMock.mockRejectedValueOnce(axiosError(404)).mockResolvedValueOnce(existingRecordSet(['"token-b"']));

    await gcpCloudDnsDeleteTxtRecord(connection, ZONE, RECORD, '"token-a"');
    await gcpCloudDnsDeleteTxtRecord(connection, ZONE, RECORD, '"token-a"');

    expect(postMock).not.toHaveBeenCalled();
  });
});
