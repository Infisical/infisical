import { TKekHistoryEntryProps } from "../model/kek-history-entry";
import { TKmsKeyProps } from "../model/kms-key";
import { TKmsKeyVersionProps } from "../model/kms-key-version";
import { TLegacyEncryptionKeyProps } from "../model/legacy-encryption-key";
import { TRootKeyConfigProps } from "../model/root-key-config";

export type TInMemoryOrg = { id: string; kmsDefaultKeyId: string | null; kmsEncryptedDataKey: Buffer | null };

export type TInMemoryProject = {
  id: string;
  orgId: string;
  type?: string;
  deleteAfter?: Date | null;
  kmsSecretManagerKeyId: string | null;
  kmsSecretManagerEncryptedDataKey: Buffer | null;
  kmsCertificateKeyId: string | null;
};

type TTables = {
  kmsKeys: Map<string, TKmsKeyProps>;
  kmsKeyVersions: TKmsKeyVersionProps[];
  rootKeyConfigs: Map<string, TRootKeyConfigProps>;
  kekHistory: Map<string, TKekHistoryEntryProps>;
  legacyEncryptionKey: TLegacyEncryptionKeyProps | null;
  orgs: Map<string, TInMemoryOrg>;
  projects: Map<string, TInMemoryProject>;
};

// The tables of an in-memory KMS Core store. Rows are replaced, never changed in place, so a shallow copy of each
// table is a full snapshot.
export class InMemoryKmsCoreState {
  // For consumers' tests: an org or project the store has never seen is created on first read.
  autoCreateScopes = false;

  tables: TTables = {
    kmsKeys: new Map(),
    kmsKeyVersions: [],
    rootKeyConfigs: new Map(),
    kekHistory: new Map(),
    legacyEncryptionKey: null,
    orgs: new Map(),
    projects: new Map()
  };

  // The platform rows a test needs: organizations and projects belong to no domain yet.
  addOrg(id: string) {
    this.tables.orgs.set(id, { id, kmsDefaultKeyId: null, kmsEncryptedDataKey: null });
  }

  addProject(id: string, orgId: string) {
    if (!this.tables.orgs.has(orgId)) this.addOrg(orgId);
    this.tables.projects.set(id, {
      id,
      orgId,
      deleteAfter: null,
      kmsSecretManagerKeyId: null,
      kmsSecretManagerEncryptedDataKey: null,
      kmsCertificateKeyId: null
    });
  }

  snapshot(): unknown {
    const { tables } = this;
    return {
      kmsKeys: new Map(tables.kmsKeys),
      kmsKeyVersions: [...tables.kmsKeyVersions],
      rootKeyConfigs: new Map(tables.rootKeyConfigs),
      kekHistory: new Map(tables.kekHistory),
      legacyEncryptionKey: tables.legacyEncryptionKey,
      orgs: new Map(tables.orgs),
      projects: new Map(tables.projects)
    } satisfies TTables;
  }

  restore(snapshot: unknown) {
    this.tables = snapshot as TTables;
  }
}
