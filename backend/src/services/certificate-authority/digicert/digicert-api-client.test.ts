import { AxiosError, AxiosHeaders } from "axios";

import { createDigiCertApiClient } from "./digicert-api-client";
import { DigiCertDomainValidationStatus } from "./digicert-certificate-authority-enums";

const { requestPut, requestGet } = vi.hoisted(() => ({ requestPut: vi.fn(), requestGet: vi.fn() }));

vi.mock("@app/lib/config/request", () => ({ request: { put: requestPut, get: requestGet } }));
vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

const digicertError = (code: string) =>
  new AxiosError("Request failed with status code 400", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 400,
    statusText: "Bad Request",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { errors: [{ code, message: code }] }
  });

describe("DigiCert domain validation check", () => {
  const client = createDigiCertApiClient("key", "https://digicert.example/services/v2");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test.each(["invalid_persistent_dns", "mpic_corroboration_error"])(
    "treats %s as a record DigiCert can't see yet",
    async (code) => {
      requestPut.mockRejectedValueOnce(digicertError(code));
      await expect(client.validateDomainDcv(7)).resolves.toBe(DigiCertDomainValidationStatus.Pending);
    }
  );

  test("fails on any other DigiCert refusal", async () => {
    requestPut.mockRejectedValueOnce(digicertError("domain_not_found"));
    await expect(client.validateDomainDcv(7)).rejects.toThrow();
  });
});

describe("DigiCert domain listing", () => {
  const client = createDigiCertApiClient("key", "https://digicert.example/services/v2");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("stops paging on an empty page even when DigiCert reports more domains", async () => {
    requestGet
      .mockResolvedValueOnce({
        data: { domains: [{ id: 1, name: "example.com", organization: { id: 777 } }], page: { total: 5000 } }
      })
      .mockResolvedValueOnce({ data: { domains: [], page: { total: 5000 } } });

    await expect(client.listDomains(777)).resolves.toEqual([expect.objectContaining({ id: 1, name: "example.com" })]);
    expect(requestGet).toHaveBeenCalledTimes(2);
  });

  test("passes the abort signal to every page request", async () => {
    const abort = new AbortController();
    requestGet.mockResolvedValueOnce({ data: { domains: [], page: { total: 0 } } });

    await client.listDomains(777, abort.signal);

    expect(requestGet).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: abort.signal }));
  });

  test("refuses to treat a listing cut off at the page cap as complete", async () => {
    const fullPage = Array.from({ length: 1000 }, (_, index) => ({
      id: index,
      name: `d${index}.example.com`,
      organization: { id: 777 }
    }));
    requestGet.mockResolvedValue({ data: { domains: fullPage, page: { total: 50_000 } } });

    await expect(client.listDomains(777)).rejects.toThrow("too many to check for automatic validation");
  });
});
