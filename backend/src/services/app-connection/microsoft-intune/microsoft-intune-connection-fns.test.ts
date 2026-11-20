import { safeRequest } from "@app/lib/validator";

import { intuneDownloadRevocationRequests } from "./microsoft-intune-connection-fns";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("@app/lib/validator", () => ({ safeRequest: { post: vi.fn() } }));

const mockedPost = vi.mocked(safeRequest.post);
const respondWith = (data: unknown) =>
  mockedPost.mockResolvedValue({ data } as Awaited<ReturnType<typeof safeRequest.post>>);

const download = () =>
  intuneDownloadRevocationRequests({
    intuneAccessToken: "token",
    serviceUri: "https://fef.example.manage.microsoft.com/PkiConnectorFEService",
    caConfiguration: "org-1"
  });

describe("intuneDownloadRevocationRequests", () => {
  beforeEach(() => mockedPost.mockReset());

  test("filters the download by the org's caConfiguration", async () => {
    respondWith({ value: [] });

    await download();

    expect(mockedPost.mock.calls[0][1]).toEqual({ downloadParameters: { maxRequests: 500, issuerName: "org-1" } });
  });

  test("skips malformed requests and keeps the rest", async () => {
    respondWith({
      value: [
        { requestContext: "ctx-1", serialNumber: null, issuerName: "CN=Test" },
        { requestContext: "ctx-2", serialNumber: "aa", issuerName: "CN=Test" }
      ]
    });

    await expect(download()).resolves.toEqual([{ requestContext: "ctx-2", serialNumber: "aa", issuerName: "CN=Test" }]);
  });

  test("treats an empty body as an empty queue", async () => {
    respondWith("");

    await expect(download()).resolves.toEqual([]);
  });

  test("fails instead of reporting an empty queue when the response has no request list", async () => {
    respondWith({ value: null });

    await expect(download()).rejects.toThrow("unexpected format");
  });
});
