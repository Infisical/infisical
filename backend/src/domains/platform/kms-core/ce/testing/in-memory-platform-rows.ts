export type TInMemoryOrgRow = { id: string; kmsDefaultKeyId: string | null; kmsEncryptedDataKey: Buffer | null };

export type TInMemoryProjectRow = {
  id: string;
  orgId: string;
  type?: string;
  deleteAfter?: Date | null;
  kmsSecretManagerKeyId: string | null;
  kmsSecretManagerEncryptedDataKey: Buffer | null;
  kmsCertificateKeyId: string | null;
};

// The organizations and projects rows the in-memory stores read: those tables belong to no domain yet. Rows are
// replaced, never changed in place, so a shallow copy of each map is a full snapshot.
export class InMemoryPlatformRows {
  // For consumers' tests: an org or project the stores have never seen is created on first read.
  autoCreate = false;

  orgs = new Map<string, TInMemoryOrgRow>();

  projects = new Map<string, TInMemoryProjectRow>();

  addOrg(id: string) {
    this.orgs.set(id, { id, kmsDefaultKeyId: null, kmsEncryptedDataKey: null });
  }

  addProject(id: string, orgId: string, overrides: Partial<TInMemoryProjectRow> = {}) {
    if (!this.orgs.has(orgId)) this.addOrg(orgId);
    this.projects.set(id, {
      id,
      orgId,
      deleteAfter: null,
      kmsSecretManagerKeyId: null,
      kmsSecretManagerEncryptedDataKey: null,
      kmsCertificateKeyId: null,
      ...overrides
    });
  }

  snapshot(): unknown {
    return { orgs: new Map(this.orgs), projects: new Map(this.projects) };
  }

  restore(snapshot: unknown) {
    const rows = snapshot as { orgs: Map<string, TInMemoryOrgRow>; projects: Map<string, TInMemoryProjectRow> };
    this.orgs = rows.orgs;
    this.projects = rows.projects;
  }
}
