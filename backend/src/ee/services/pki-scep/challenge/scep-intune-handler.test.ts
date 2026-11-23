import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { intuneDelegatedHandler } from "./scep-intune-handler";
import { TScepValidationHandlerDeps } from "./scep-validation-handler-types";

const sendSuccessNotification = vi.fn<(args: { notification: Record<string, unknown> }) => Promise<void>>();

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("@app/services/app-connection/app-connection-fns", () => ({
  decryptAppConnectionCredentials: vi.fn().mockResolvedValue({ tenantId: "tenant-a", clientId: "c", clientSecret: "s" })
}));
vi.mock("@app/services/app-connection/microsoft-intune", () => ({
  MicrosoftEntraTokenResource: { Graph: "graph", Intune: "intune" },
  getMicrosoftEntraToken: vi.fn().mockResolvedValue({ accessToken: "token", expiresAt: Date.now() + 3_600_000 }),
  discoverScepValidationServiceUri: vi.fn().mockResolvedValue("https://fef.example.manage.microsoft.com/Scep"),
  intuneSendSuccessNotification: (args: { notification: Record<string, unknown> }) => sendSuccessNotification(args),
  intuneSendFailureNotification: vi.fn(),
  intuneValidateScepRequest: vi.fn()
}));
vi.mock("@peculiar/x509", () => ({
  X509Certificate: vi.fn().mockImplementation(() => ({
    serialNumber: "aa",
    issuer: "CN=Test",
    notAfter: new Date("2099-01-01T00:00:00.000Z"),
    getThumbprint: vi.fn().mockResolvedValue(new ArrayBuffer(20))
  }))
}));

describe("intuneDelegatedHandler.reportIssued", () => {
  test("tags the issued certificate with the connection's org so the revocation sync can download it", async () => {
    const handler = intuneDelegatedHandler({
      appConnectionDAL: {
        findById: vi.fn().mockResolvedValue({
          id: "conn-1",
          app: AppConnection.MicrosoftIntune,
          orgId: "org-1",
          projectId: null,
          updatedAt: new Date(),
          encryptedCredentials: Buffer.from("x")
        })
      },
      keyStore: { getItem: vi.fn().mockResolvedValue(null), setItemWithExpiry: vi.fn().mockResolvedValue("OK") },
      kmsDataKeyService: {
        createCipherPairWithDataKey: vi.fn().mockResolvedValue({
          encryptor: () => ({ cipherTextBlob: Buffer.from("x") }),
          decryptor: () => Buffer.from("{}")
        })
      }
    } as unknown as TScepValidationHandlerDeps);

    await handler.reportIssued?.({
      transactionId: "tx-1",
      csrDer: Buffer.from("csr"),
      certificateDer: Buffer.from("cert"),
      validationConnectionId: "conn-1"
    });

    expect(sendSuccessNotification.mock.calls[0][0].notification).toEqual(
      expect.objectContaining({ caConfiguration: "org-1" })
    );
  });
});
