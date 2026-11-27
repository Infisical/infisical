import { AxiosError, AxiosHeaders } from "axios";

import { createDigiCertApiClient } from "./digicert-api-client";
import { DigiCertDomainValidationStatus } from "./digicert-certificate-authority-enums";

const { requestPut } = vi.hoisted(() => ({ requestPut: vi.fn() }));

vi.mock("@app/lib/config/request", () => ({ request: { put: requestPut } }));
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
