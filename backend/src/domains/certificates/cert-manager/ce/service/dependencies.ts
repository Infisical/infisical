// A metered PKI unit count for one org in the tree. Certificates carry no per-project attribution here
// because the meter dedupes by quotaKey across the whole tree (see getActiveCertificateOrgBreakdown).
export type TOrgUnitCount = { orgId: string; count: number };

// Active certificates for one org, with the wildcard subset that active_certs and wildcard_certs both
// read, so the two meters can never disagree about which certificates are live.
export type TCertificateOrgUnitCount = TOrgUnitCount & { wildcard: number };

export type TPkiRootOrgUsage = {
  rootOrgId: string;
  cas: number;
  internalCas: number;
  activeCertificates: number;
  wildcardCertificates: number;
};

// Implemented by data-access/usage-counter-data-access.ts. orgId omitted counts the whole instance.
export type TCertificateUsageDataAccess = {
  countInternalCas(orgId?: string): Promise<number>;
  countActiveCertificateQuotaKeys(orgId?: string): Promise<{ total: number; wildcard: number }>;
  isCertificateQuotaKeyActive(orgId: string | undefined, quotaKey: string): Promise<boolean>;
  getInternalCaOrgBreakdown(orgId?: string): Promise<TOrgUnitCount[]>;
  getActiveCertificateOrgBreakdown(orgId?: string): Promise<TCertificateOrgUnitCount[]>;
  getPkiUsageByRootOrg(): Promise<TPkiRootOrgUsage[]>;
};
