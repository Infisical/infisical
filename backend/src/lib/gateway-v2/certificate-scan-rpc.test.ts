import { callCertificateScan } from "./certificate-scan-rpc";
import { postGatewayRpc } from "./gateway-rpc";

vi.mock("./gateway-rpc", () => ({ postGatewayRpc: vi.fn() }));

const call = () =>
  callCertificateScan({
    port: 1,
    credentials: {} as Parameters<typeof callCertificateScan>[0]["credentials"],
    request: {
      searchFolderPaths: ["/etc/ssl"],
      skipFolderPaths: [],
      maxFolderDepth: 8,
      maxFileSizeBytes: 1024,
      filePaths: [],
      keystorePasswords: []
    }
  });

describe("callCertificateScan", () => {
  test("a gateway error keeps its kind and status and its text only as detail", async () => {
    vi.mocked(postGatewayRpc).mockResolvedValue({
      status: 502,
      text: JSON.stringify({ error: { message: "ssh: unable to authenticate", kind: "auth" } })
    });
    expect(await call()).toEqual({ ok: false, status: 502, kind: "auth", detail: "ssh: unable to authenticate" });
  });

  test("a result is returned as is", async () => {
    vi.mocked(postGatewayRpc).mockResolvedValue({ status: 200, text: JSON.stringify({ result: { files: [] } }) });
    expect(await call()).toEqual({ ok: true, result: { files: [] } });
  });
});
