import { DataKeyOwner } from "./data-key-owner";

export type TOrganizationKeyRecord = {
  orgId: string;
  // organizations.kmsDefaultKeyId: the KMS key that encrypts the data key.
  kmsKeyId: string | null;
  // organizations.kmsEncryptedDataKey.
  encryptedDataKey: Buffer | null;
};

export class OrganizationKey extends DataKeyOwner {
  private constructor(orgId: string, kmsKeyId: string | null, dataKey: Buffer | null) {
    super("organization", orgId, orgId, kmsKeyId, dataKey);
  }

  static restore(record: TOrganizationKeyRecord): OrganizationKey {
    return new OrganizationKey(record.orgId, record.kmsKeyId, record.encryptedDataKey);
  }

  toJSON(): TOrganizationKeyRecord {
    return { orgId: this.orgId, kmsKeyId: this.kmsKeyId, encryptedDataKey: this.dataKey };
  }
}
