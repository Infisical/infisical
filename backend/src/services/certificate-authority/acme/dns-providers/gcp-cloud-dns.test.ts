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
import { gcpCloudDnsDeleteTxtRecord, gcpCloudDnsInsertTxtRecord, validateGcpCloudDnsZone } from "./gcp-cloud-dns";

const connection = {} as TGcpConnection;
const ZONE = "projects/my-project/managedZones/example-zone";
const ZONE_URL = `https://dns.googleapis.com/dns/v1/${ZONE}`;
const RECORD = "_acme-challenge.example.com";
const FQDN = `${RECORD}.`;

const axiosError = (status: number) =>
  new AxiosError("request failed", String(status), undefined, undefined, {
    status,
    statusText: "",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { error: { message: `status ${status}` } }
  });

const existingRecordSet = (rrdatas: string[]) => ({ data: { name: FQDN, type: "TXT", ttl: 60, rrdatas } });

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

  it("surfaces the provider message on other failures", async () => {
    getMock.mockRejectedValueOnce(axiosError(400));

    await expect(gcpCloudDnsInsertTxtRecord(connection, ZONE, RECORD, '"token-a"')).rejects.toThrow(
      "Google Cloud DNS request failed: status 400"
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

  it("is a no-op when the record set or value is already gone", async () => {
    getMock.mockRejectedValueOnce(axiosError(404)).mockResolvedValueOnce(existingRecordSet(['"token-b"']));

    await gcpCloudDnsDeleteTxtRecord(connection, ZONE, RECORD, '"token-a"');
    await gcpCloudDnsDeleteTxtRecord(connection, ZONE, RECORD, '"token-a"');

    expect(postMock).not.toHaveBeenCalled();
  });
});
