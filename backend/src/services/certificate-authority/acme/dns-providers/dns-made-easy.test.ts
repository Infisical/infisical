import { beforeEach, describe, expect, it, vi } from "vitest";

import { request } from "@app/lib/config/request";
import {
  getDNSMadeEasyZone,
  listDNSMadeEasyRecords
} from "@app/services/app-connection/dns-made-easy/dns-made-easy-connection-fns";
import { TDNSMadeEasyConnection } from "@app/services/app-connection/dns-made-easy/dns-made-easy-connection-types";

import {
  dnsMadeEasyDeleteTxtRecord,
  dnsMadeEasyInsertTxtRecord,
  getDNSMadeEasyRelativeRecordName
} from "./dns-made-easy";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@app/lib/config/request", () => ({
  request: { post: vi.fn(), delete: vi.fn() }
}));

vi.mock("@app/services/app-connection/dns-made-easy/dns-made-easy-connection-fns", () => ({
  getDNSMadeEasyUrl: vi.fn((path: string) => `https://api.example.test${path}`),
  getDNSMadeEasyZone: vi.fn(),
  listDNSMadeEasyRecords: vi.fn(),
  makeDNSMadeEasyAuthHeaders: vi.fn(() => ({}))
}));

describe("getDNSMadeEasyRelativeRecordName", () => {
  it("removes the zone suffix from an ACME challenge name for a subdomain", () => {
    expect(getDNSMadeEasyRelativeRecordName("example.com", "_acme-challenge.mail.example.com")).toBe(
      "_acme-challenge.mail"
    );
  });

  it("returns the bare challenge label for a certificate on the zone itself", () => {
    expect(getDNSMadeEasyRelativeRecordName("example.com", "_acme-challenge.example.com")).toBe("_acme-challenge");
  });

  it("is case-insensitive and ignores trailing dots", () => {
    expect(getDNSMadeEasyRelativeRecordName("Example.COM.", "_acme-challenge.Mail.example.com.")).toBe(
      "_acme-challenge.Mail"
    );
  });

  it("rejects names outside the hosted zone", () => {
    expect(() => getDNSMadeEasyRelativeRecordName("example.com", "_acme-challenge.mail.example.net")).toThrow(
      "outside the hosted zone"
    );
  });

  it("does not match a zone name that only appears as the end of another label", () => {
    expect(() => getDNSMadeEasyRelativeRecordName("example.com", "_acme-challenge.notexample.com")).toThrow(
      "outside the hosted zone"
    );
  });

  it("rejects an empty zone name", () => {
    expect(() => getDNSMadeEasyRelativeRecordName("", "_acme-challenge.example.com")).toThrow("zone name is empty");
  });
});

describe("DNS Made Easy challenge record writes", () => {
  const connection = {
    method: "api-key-secret",
    credentials: { apiKey: "key", secretKey: "secret" }
  } as unknown as TDNSMadeEasyConnection;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDNSMadeEasyZone).mockResolvedValue({ id: "123", name: "example.com" });
  });

  it("inserts the TXT record at the zone-relative name", async () => {
    await dnsMadeEasyInsertTxtRecord(connection, "123", "_acme-challenge.mail.example.com", '"token"');

    expect(vi.mocked(request).post).toHaveBeenCalledWith(
      expect.stringContaining("/V2.0/dns/managed/123/records"),
      expect.objectContaining({ type: "TXT", name: "_acme-challenge.mail", value: '"token"' }),
      expect.anything()
    );
  });

  it("rejects out-of-zone inserts before calling the records API", async () => {
    await expect(
      dnsMadeEasyInsertTxtRecord(connection, "123", "_acme-challenge.mail.example.net", '"token"')
    ).rejects.toThrow("outside the hosted zone");

    expect(vi.mocked(request).post).not.toHaveBeenCalled();
  });

  it("looks up and deletes the record by its zone-relative name", async () => {
    vi.mocked(listDNSMadeEasyRecords).mockResolvedValue([
      { id: 42, name: "_acme-challenge.mail", type: "TXT", value: '"token"' }
    ]);

    await dnsMadeEasyDeleteTxtRecord(connection, "123", "_acme-challenge.mail.example.com", '"token"');

    expect(vi.mocked(listDNSMadeEasyRecords)).toHaveBeenCalledWith(
      connection,
      expect.objectContaining({ zoneId: "123", name: "_acme-challenge.mail" })
    );
    expect(vi.mocked(request).delete).toHaveBeenCalledWith(expect.stringContaining("/records/42"), expect.anything());
  });
});
