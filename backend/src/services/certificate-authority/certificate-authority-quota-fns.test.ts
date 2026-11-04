import { InstanceType } from "@app/ee/services/license/license-types";

import { assertCertificateAuthorityQuota, TCertificateAuthorityQuotaDeps } from "./certificate-authority-quota-fns";

const buildDeps = ({
  maxCas,
  maxInternalCas,
  casUsed = 0,
  internalCasUsed = 0,
  instanceType = InstanceType.OnPrem,
  countedOrgIds = []
}: {
  maxCas: number | null;
  maxInternalCas: number | null;
  casUsed?: number;
  internalCasUsed?: number;
  instanceType?: InstanceType;
  countedOrgIds?: (string | null)[];
}) =>
  ({
    projectDAL: { findById: async () => ({ id: "project-1", orgId: "org-1" }) },
    licenseService: { getPlan: async () => ({ maxCas, maxInternalCas }), getInstanceType: () => instanceType },
    certificateAuthorityDAL: {
      countCasByOrgId: async (orgId: string | null) => {
        countedOrgIds.push(orgId);
        return casUsed;
      },
      countInternalCasByOrgId: async (orgId: string | null) => {
        countedOrgIds.push(orgId);
        return internalCasUsed;
      }
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

  test.each([InstanceType.EnterpriseOnPrem, InstanceType.EnterpriseOnPremOffline])(
    "counts the whole instance under a self-hosted license (%s)",
    async (instanceType) => {
      const countedOrgIds: (string | null)[] = [];
      await expect(
        assertQuota(buildDeps({ maxCas: 10, maxInternalCas: 3, internalCasUsed: 3, instanceType, countedOrgIds }))
      ).rejects.toThrow("(3 of 3 internal certificate authorities across this instance)");
      expect(countedOrgIds).toEqual([null, null]);
    }
  );

  test.each([InstanceType.Cloud, InstanceType.OnPrem])("counts the organization tree on %s", async (instanceType) => {
    const countedOrgIds: (string | null)[] = [];
    await expect(
      assertQuota(buildDeps({ maxCas: 1, maxInternalCas: null, casUsed: 1, instanceType, countedOrgIds }))
    ).rejects.toThrow("(1 of 1 certificate authorities)");
    expect(countedOrgIds).toEqual(["org-1"]);
  });
});
