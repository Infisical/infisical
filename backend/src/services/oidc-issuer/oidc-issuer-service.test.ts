import { createLocalJWKSet, jwtVerify } from "jose";

import { EntityNotFoundError } from "@app/domains/lib/errors";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { signingService } from "@app/lib/crypto/sign/signing";
import { AsymmetricKeyAlgorithm, SigningAlgorithm } from "@app/lib/crypto/sign/types";
import { ActorType } from "@app/services/auth/auth-type";

import { publicKeyToJwk } from "./oidc-issuer-fns";
import { oidcIssuerServiceFactory } from "./oidc-issuer-service";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ SITE_URL: "https://app.test" }) }));

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

describe("signDynamicSecretToken", () => {
  const ORG_ID = "22222222-2222-2222-2222-222222222222";
  const ISSUER = `https://app.test/api/v1/oidc-issuer/organizations/${ORG_ID}`;

  const setup = async () => {
    const { generateAsymmetricPrivateKey, getPublicKeyFromPrivateKey, sign } = signingService(
      AsymmetricKeyAlgorithm.RSA_4096
    );
    const privateKey = await generateAsymmetricPrivateKey();
    const publicKey = await getPublicKeyFromPrivateKey(privateKey);
    const kmsKeyService = {
      findKeys: async () => [
        { id: "previous", name: "oidc-issuer-1", createdAt: new Date() },
        { id: "current", name: "oidc-issuer-2", createdAt: new Date() }
      ],
      getPublicKey: async () => publicKey,
      signWithKmsKey:
        async () =>
        async ({ data }: { data: Buffer }) => ({
          signature: await sign(data, privateKey, SigningAlgorithm.RSASSA_PKCS1_V1_5_SHA_256, false)
        })
    };
    const createAuditLog = vi.fn(async () => undefined);
    const service = oidcIssuerServiceFactory({
      kmsKeyService: kmsKeyService as never,
      keyStore: {} as never,
      auditLogService: { createAuditLog } as never
    });
    const jwks = createLocalJWKSet({ keys: [await publicKeyToJwk(publicKey)] });
    return { service, createAuditLog, jwks };
  };

  test("signs for the dynamic secret with the org's issuer and audits it", async () => {
    const { service, createAuditLog, jwks } = await setup();

    const token = await service.signDynamicSecretToken({
      dynamicSecret: { id: "ds-1", name: "namespace-ingress" },
      orgId: ORG_ID,
      projectId: "project-1",
      audience: "https://federation.namespaceapis.com"
    });

    const { payload } = await jwtVerify(token, jwks, {
      issuer: ISSUER,
      audience: "https://federation.namespaceapis.com",
      algorithms: ["RS256"]
    });
    expect(payload.sub).toBe("dynamic-secret:ds-1");
    expect(createAuditLog).toHaveBeenCalledWith({
      orgId: ORG_ID,
      projectId: "project-1",
      actor: { type: ActorType.PLATFORM, metadata: {} },
      event: {
        type: EventType.ISSUE_OIDC_TOKEN,
        metadata: {
          dynamicSecretId: "ds-1",
          dynamicSecretName: "namespace-ingress",
          audience: "https://federation.namespaceapis.com"
        }
      }
    });
  });
});
