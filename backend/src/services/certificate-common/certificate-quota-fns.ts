import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { isWildcardPattern } from "@app/services/certificate-policy/certificate-policy-fns";
import { TUsageCounterDALFactory } from "@app/services/license-client/usage/usage-counter-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { buildCertificateQuotaKey } from "./certificate-quota-key";

type TQuotaCounts = { total: number; wildcard: number };

export type TCertificateQuotaDeps = {
  projectDAL: Pick<TProjectDALFactory, "findById">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  usageCounterDAL: Pick<
    TUsageCounterDALFactory,
    "countActiveCertificateQuotaKeysByOrg" | "isCertificateQuotaKeyActiveInOrg" | "resolveRootOrgId"
  >;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry" | "deleteItem">;
};

const $getQuotaCounts = async (orgId: string, deps: TCertificateQuotaDeps): Promise<TQuotaCounts> => {
  const totalKey = KeyStorePrefixes.PkiCertificateQuotaCount(orgId);
  const wildcardKey = KeyStorePrefixes.PkiWildcardCertificateQuotaCount(orgId);

  const [cachedTotal, cachedWildcard] = await Promise.all([
    deps.keyStore.getItem(totalKey),
    deps.keyStore.getItem(wildcardKey)
  ]);
  if (cachedTotal !== null && cachedWildcard !== null) {
    const total = Number(cachedTotal);
    const wildcard = Number(cachedWildcard);
    if (Number.isFinite(total) && Number.isFinite(wildcard)) return { total, wildcard };
  }

  const counts = await deps.usageCounterDAL.countActiveCertificateQuotaKeysByOrg(orgId);
  const ttl = KeyStoreTtls.PkiCertificateQuotaCountInSeconds;
  await Promise.all([
    deps.keyStore.setItemWithExpiry(totalKey, ttl, String(counts.total)),
    deps.keyStore.setItemWithExpiry(wildcardKey, ttl, String(counts.wildcard))
  ]);

  return counts;
};

// Call once a certificate with a new quota key has actually been written. Drops the cached counts
// rather than incrementing them: incrementByWithExpiry re-sets the TTL on every call, so a steadily
// issuing org would roll the expiry forward indefinitely and never see a revocation or an expiry.
// Never throws, since a stale cache is cheaper than failing a certificate that was already granted.
export const recordNewCertificateQuotaKey = async (
  orgId: string,
  deps: Pick<TCertificateQuotaDeps, "keyStore">,
  isWildcard = false
): Promise<void> => {
  try {
    await deps.keyStore.deleteItem(KeyStorePrefixes.PkiCertificateQuotaCount(orgId));
    if (isWildcard) await deps.keyStore.deleteItem(KeyStorePrefixes.PkiWildcardCertificateQuotaCount(orgId));
  } catch (error) {
    logger.error(error, `Failed to reset certificate quota cache [orgId=${orgId}]`);
  }
};

// Nothing locks between this check and the insert, so the caps are commercial limits with bounded
// overshoot rather than hard boundaries.
export const assertCertificateQuota = async ({
  orgId,
  commonName,
  altNames,
  deps,
  isApprovedRequest = false
}: {
  orgId: string;
  commonName?: string | null;
  altNames?: string | null;
  deps: TCertificateQuotaDeps;
  isApprovedRequest?: boolean;
  // quotaOrgId is the tree root the cache is keyed on. Callers must pass it back to
  // recordNewCertificateQuotaKey rather than their own orgId.
}): Promise<{ quotaKey: string; isNewQuotaKey: boolean; quotaOrgId: string; isWildcard: boolean }> => {
  const quotaKey = buildCertificateQuotaKey({ commonName, altNames });
  const isWildcard = [commonName ?? "", ...(altNames ?? "").split(",")].some(isWildcardPattern);
  const plan = await deps.licenseService.getPlan(orgId);
  const unlimited = { quotaKey, isNewQuotaKey: false, quotaOrgId: orgId, isWildcard };

  const { maxCertificates, maxWildcardCertificates } = plan;
  const hasWildcardCap = isWildcard && typeof maxWildcardCertificates === "number";
  if (typeof maxCertificates !== "number" && !hasWildcardCap) return unlimited;

  // Correctness, not an optimization: reissuing names the org already holds cannot raise either count,
  // and this is what lets an org sitting at its cap keep renewing. Remove it and its certs expire.
  const isAlreadyActive = await deps.usageCounterDAL.isCertificateQuotaKeyActiveInOrg(orgId, quotaKey);
  const quotaOrgId = await deps.usageCounterDAL.resolveRootOrgId(orgId);
  if (isAlreadyActive) return { quotaKey, isNewQuotaKey: false, quotaOrgId, isWildcard };

  // 0 is how a plan says it has no wildcard support at all.
  if (isWildcard && maxWildcardCertificates === 0) {
    throw new BadRequestError({
      message: `Failed to issue certificate with a wildcard name due to plan restriction. Upgrade plan to issue wildcard certificates.`
    });
  }

  const counts = await $getQuotaCounts(quotaOrgId, deps);

  const refuse = (used: number, cap: number, subject: string) => {
    if (isApprovedRequest) {
      throw new BadRequestError({
        message: `This certificate request was approved, but your organization has since reached its plan limit of ${cap} ${subject} (${used} of ${cap} in use). Upgrade plan or revoke an unused certificate, then submit the request again.`
      });
    }
    throw new BadRequestError({
      message: `Failed to issue certificate due to plan limit reached (${used} of ${cap} ${subject}). Upgrade plan to issue more certificates.`
    });
  };

  // Before the total, so the refusal names the limit the caller actually hit.
  if (hasWildcardCap && counts.wildcard >= maxWildcardCertificates) {
    refuse(counts.wildcard, maxWildcardCertificates, "active wildcard certificates");
  }

  if (typeof maxCertificates === "number" && counts.total >= maxCertificates) {
    refuse(counts.total, maxCertificates, "active certificates");
  }

  return { quotaKey, isNewQuotaKey: true, quotaOrgId, isWildcard };
};

/** Same check for callers holding a projectId. Returns the orgId so usage can be recorded after the write. */
export const assertCertificateQuotaForProject = async ({
  projectId,
  commonName,
  altNames,
  deps,
  isApprovedRequest = false
}: {
  projectId: string;
  commonName?: string | null;
  altNames?: string | null;
  deps: TCertificateQuotaDeps;
  isApprovedRequest?: boolean;
}): Promise<{ quotaKey: string; isNewQuotaKey: boolean; quotaOrgId: string; isWildcard: boolean }> => {
  const project = await deps.projectDAL.findById(projectId);
  if (!project) throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });

  return assertCertificateQuota({ orgId: project.orgId, commonName, altNames, deps, isApprovedRequest });
};
