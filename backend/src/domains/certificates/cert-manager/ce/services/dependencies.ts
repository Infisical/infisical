import { TReadOptions } from "@app/domains/lib/data-access";

// No per-project split: the meter dedupes by quotaKey across the whole tree (see getActiveCertificateOrgBreakdown).
export type TOrgUnitCount = { orgId: string; count: number };

// One query feeds both active_certs and wildcard_certs so the two meters can't disagree.
export type TCertificateOrgUnitCount = TOrgUnitCount & { wildcard: number };

export type TPkiRootOrgUsage = {
  rootOrgId: string;
  cas: number;
  internalCas: number;
  activeCertificates: number;
  wildcardCertificates: number;
};

// No orgId = whole instance.
export type TCertificateUsageStore = {
  countInternalCas(orgId?: string, options?: TReadOptions): Promise<number>;
  countActiveCertificateQuotaKeys(orgId?: string, options?: TReadOptions): Promise<{ total: number; wildcard: number }>;
  isCertificateQuotaKeyActive(orgId: string | undefined, quotaKey: string, options?: TReadOptions): Promise<boolean>;
  getInternalCaOrgBreakdown(orgId?: string, options?: TReadOptions): Promise<TOrgUnitCount[]>;
  getActiveCertificateOrgBreakdown(orgId?: string, options?: TReadOptions): Promise<TCertificateOrgUnitCount[]>;
  getPkiUsageByRootOrg(options?: TReadOptions): Promise<TPkiRootOrgUsage[]>;
};
