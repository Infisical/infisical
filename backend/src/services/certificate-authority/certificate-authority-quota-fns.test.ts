import { assertCertificateAuthorityQuota, TCertificateAuthorityQuotaDeps } from "./certificate-authority-quota-fns";

const buildDeps = ({
  maxCas,
  maxInternalCas,
  casUsed = 0,
  internalCasUsed = 0
}: {
  maxCas: number | null;
  maxInternalCas: number | null;
  casUsed?: number;
  internalCasUsed?: number;
}) =>
  ({
    projectDAL: { findById: async () => ({ id: "project-1", orgId: "org-1" }) },
    licenseService: { getPlan: async () => ({ maxCas, maxInternalCas }) },
    certificateAuthorityDAL: {
      countCasByOrgId: async () => casUsed,
      countInternalCasByOrgId: async () => internalCasUsed
    }
  }) as unknown as TCertificateAuthorityQuotaDeps;

const assertQuota = (deps: TCertificateAuthorityQuotaDeps, isInternal = true) =>
  assertCertificateAuthorityQuota({ projectId: "project-1", isInternal, deps });

describe("assertCertificateAuthorityQuota", () => {
  test("allows creation when neither cap is set", async () => {
    await expect(assertQuota(buildDeps({ maxCas: null, maxInternalCas: null, casUsed: 500 }))).resolves.toBeUndefined();
  });

  // A contract granting more internal CAs than total CAs is a License Server misconfiguration.
  test("raises the total cap to the internal cap when the internal grant is larger", async () => {
    await expect(
      assertQuota(buildDeps({ maxCas: 1, maxInternalCas: 25, casUsed: 5, internalCasUsed: 5 }))
    ).resolves.toBeUndefined();
  });

  test("reports the raised cap in the error rather than the misconfigured one", async () => {
    await expect(
      assertQuota(buildDeps({ maxCas: 1, maxInternalCas: 25, casUsed: 25, internalCasUsed: 0 }))
    ).rejects.toThrow("(25 of 25 certificate authorities)");
  });

  // The guard that keeps the free tier capped: null means the tier does not cap internal CAs
  // separately, not that they are unlimited.
  test("does not raise the total cap when the internal cap is null", async () => {
    await expect(assertQuota(buildDeps({ maxCas: 1, maxInternalCas: null, casUsed: 1 }))).rejects.toThrow(
      "(1 of 1 certificate authorities)"
    );
  });

  test("leaves the total cap alone when it already exceeds the internal cap", async () => {
    await expect(
      assertQuota(buildDeps({ maxCas: 10, maxInternalCas: 3, casUsed: 10, internalCasUsed: 0 }))
    ).rejects.toThrow("(10 of 10 certificate authorities)");
  });

  test("still enforces the internal cap once the total cap allows the create", async () => {
    await expect(
      assertQuota(buildDeps({ maxCas: 10, maxInternalCas: 3, casUsed: 3, internalCasUsed: 3 }))
    ).rejects.toThrow("(3 of 3 internal certificate authorities)");
  });

  test("skips the internal cap for a non-internal certificate authority", async () => {
    await expect(
      assertQuota(buildDeps({ maxCas: 10, maxInternalCas: 3, casUsed: 3, internalCasUsed: 3 }), false)
    ).resolves.toBeUndefined();
  });
});
