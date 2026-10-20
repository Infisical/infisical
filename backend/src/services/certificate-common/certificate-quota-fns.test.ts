import { InstanceType } from "@app/ee/services/license/license-types";

import { assertCertificateQuota, TCertificateQuotaDeps } from "./certificate-quota-fns";
import { buildCertificateQuotaKey } from "./certificate-quota-key";
import { PKI_INSTANCE_QUOTA_SCOPE } from "./certificate-quota-scope";

const buildDeps = ({
  instanceType,
  maxCertificates = null,
  maxWildcardCertificates = null,
  total = 0,
  wildcard = 0,
  activeKeys = [],
  calls
}: {
  instanceType: InstanceType;
  maxCertificates?: number | null;
  maxWildcardCertificates?: number | null;
  total?: number;
  wildcard?: number;
  activeKeys?: string[];
  calls: { counted: (string | undefined)[]; activeChecked: (string | undefined)[] };
}) =>
  ({
    projectDAL: { findById: async () => ({ id: "project-1", orgId: "sub-org" }) },
    licenseService: {
      getPlan: async () => ({ maxCertificates, maxWildcardCertificates }),
      getInstanceType: () => instanceType
    },
    usageCounterDAL: {
      resolveRootOrgId: async () => "root-org",
      countActiveCertificateQuotaKeysByOrg: async (orgId?: string) => {
        calls.counted.push(orgId);
        return { total, wildcard };
      },
      isCertificateQuotaKeyActiveInOrg: async (orgId: string | undefined, quotaKey: string) => {
        calls.activeChecked.push(orgId);
        return activeKeys.includes(quotaKey);
      }
    },
    keyStore: { getItem: async () => null, setItemWithExpiry: async () => "OK", deleteItem: async () => 1 }
  }) as unknown as TCertificateQuotaDeps;

const newCalls = () => ({ counted: [] as (string | undefined)[], activeChecked: [] as (string | undefined)[] });

describe("assertCertificateQuota scope", () => {
  test.each([InstanceType.EnterpriseOnPrem, InstanceType.EnterpriseOnPremOffline])(
    "counts every organization on the instance under a self-hosted license (%s)",
    async (instanceType) => {
      const calls = newCalls();
      await expect(
        assertCertificateQuota({
          orgId: "sub-org",
          commonName: "a.example.test",
          deps: buildDeps({ instanceType, maxCertificates: 5, total: 5, calls })
        })
      ).rejects.toThrow("(5 of 5 active certificates across this instance)");
      expect(calls).toEqual({ counted: [undefined], activeChecked: [undefined] });
    }
  );

  test("keys the instance-wide cache on the instance scope", async () => {
    const calls = newCalls();
    const result = await assertCertificateQuota({
      orgId: "sub-org",
      commonName: "a.example.test",
      deps: buildDeps({ instanceType: InstanceType.EnterpriseOnPremOffline, maxCertificates: 5, total: 1, calls })
    });
    expect(result).toMatchObject({ isNewQuotaKey: true, quotaOrgId: PKI_INSTANCE_QUOTA_SCOPE });
  });

  // A name another organization already holds is not a new unit of the shared count, so it must not
  // be refused at the cap.
  test("lets a name already active anywhere on the instance through at the cap", async () => {
    const calls = newCalls();
    const result = await assertCertificateQuota({
      orgId: "sub-org",
      commonName: "a.example.test",
      deps: buildDeps({
        instanceType: InstanceType.EnterpriseOnPremOffline,
        maxCertificates: 5,
        total: 5,
        activeKeys: [buildCertificateQuotaKey({ commonName: "a.example.test" })],
        calls
      })
    });
    expect(result.isNewQuotaKey).toBe(false);
    expect(calls.activeChecked).toEqual([undefined]);
  });

  test("names the instance in the refusal of an approved request", async () => {
    const calls = newCalls();
    await expect(
      assertCertificateQuota({
        orgId: "sub-org",
        commonName: "*.example.test",
        isApprovedRequest: true,
        deps: buildDeps({ instanceType: InstanceType.EnterpriseOnPrem, maxWildcardCertificates: 2, wildcard: 2, calls })
      })
    ).rejects.toThrow("this instance has since reached its plan limit of 2 active wildcard certificates");
  });

  test.each([InstanceType.Cloud, InstanceType.OnPrem])(
    "counts the root organization's tree on %s",
    async (instanceType) => {
      const calls = newCalls();
      const result = await assertCertificateQuota({
        orgId: "sub-org",
        commonName: "a.example.test",
        deps: buildDeps({ instanceType, maxCertificates: 5, total: 1, calls })
      });
      expect(result.quotaOrgId).toBe("root-org");
      expect(calls).toEqual({ counted: ["root-org"], activeChecked: ["sub-org"] });
    }
  );
});
