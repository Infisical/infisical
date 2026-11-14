import { OrganizationKey } from "../models/organization-key";
import { TOrganizationKeyStore } from "../services/dependencies";
import { InMemoryPlatformRows, TInMemoryOrgRow } from "./in-memory-platform-rows";

export class InMemoryOrganizationKeyStore implements TOrganizationKeyStore {
  constructor(private readonly rows: InMemoryPlatformRows) {}

  async find(orgId: string) {
    if (this.rows.autoCreate && !this.rows.orgs.has(orgId)) this.rows.addOrg(orgId);
    const org = this.rows.orgs.get(orgId);
    if (!org) return null;
    return OrganizationKey.restore({
      orgId: org.id,
      kmsKeyId: org.kmsDefaultKeyId,
      encryptedDataKey: org.kmsEncryptedDataKey
    });
  }

  async claimKmsKey(key: OrganizationKey) {
    const { orgId, kmsKeyId } = key.toJSON();
    return this.claim(orgId, "kmsDefaultKeyId", kmsKeyId);
  }

  async claimDataKey(key: OrganizationKey) {
    const { orgId, encryptedDataKey } = key.toJSON();
    return this.claim(orgId, "kmsEncryptedDataKey", encryptedDataKey);
  }

  async referencesKey(kmsKeyId: string) {
    return [...this.rows.orgs.values()].some((org) => org.kmsDefaultKeyId === kmsKeyId);
  }

  private claim<K extends "kmsDefaultKeyId" | "kmsEncryptedDataKey">(
    orgId: string,
    column: K,
    value: TInMemoryOrgRow[K]
  ) {
    const org = this.rows.orgs.get(orgId);
    if (!org || value === null || org[column] !== null) return false;
    this.rows.orgs.set(orgId, { ...org, [column]: value });
    return true;
  }
}
