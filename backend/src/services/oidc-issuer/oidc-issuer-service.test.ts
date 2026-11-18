import { EntityNotFoundError } from "@app/domains/lib/errors";
import { signingService } from "@app/lib/crypto/sign/signing";
import { AsymmetricKeyAlgorithm } from "@app/lib/crypto/sign/types";

import { oidcIssuerServiceFactory } from "./oidc-issuer-service";

describe("getJwks", () => {
  test("skips a key that KMS Core reports deleted mid-build", async () => {
    const { generateAsymmetricPrivateKey, getPublicKeyFromPrivateKey } = signingService(
      AsymmetricKeyAlgorithm.RSA_4096
    );
    const publicKey = await getPublicKeyFromPrivateKey(await generateAsymmetricPrivateKey());
    const kmsKeyService = {
      findKeys: async () => [
        { id: "gone", name: "oidc-issuer-1", createdAt: new Date() },
        { id: "live", name: "oidc-issuer-2", createdAt: new Date() }
      ],
      getPublicKey: async ({ kmsId }: { kmsId: string }) => {
        if (kmsId === "gone") throw new EntityNotFoundError({ message: "KMS key not found" });
        return publicKey;
      }
    };
    const service = oidcIssuerServiceFactory({
      kmsKeyService: kmsKeyService as never,
      keyStore: { getItem: async () => null, setItemWithExpiry: async () => "OK" } as never,
      auditLogService: {} as never
    });

    const jwks = await service.getJwks("org-1");

    expect(jwks.keys).toHaveLength(1);
  });
});
