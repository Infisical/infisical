import { Knex } from "knex";

import { pgAdvisoryLockHashText } from "@app/lib/crypto/hashtext";

// Frozen lock ids. Pods of the previous release take these exact ids, so changing the id or the hash (the generic
// data access locks use hashtextextended) would let an old and a new pod create the same key at once during a deploy.
export const KMS_LOCK_IDS = {
  rootKey: 2025,
  orgKey: (orgId: string) => pgAdvisoryLockHashText(`kms-org-key:${orgId}`),
  orgDataKey: (orgId: string) => pgAdvisoryLockHashText(`kms-org-data-key:${orgId}`),
  projectKey: (projectId: string) => pgAdvisoryLockHashText(`kms-project-key:${projectId}`),
  projectDataKey: (projectId: string) => pgAdvisoryLockHashText(`kms-project-data-key:${projectId}`)
};

// Held until the transaction that took it ends. Take them in this order: root key, org, project; key before data key.
export type TKmsCoreLocks = {
  rootKey(): Promise<void>;
  orgKey(orgId: string): Promise<void>;
  orgDataKey(orgId: string): Promise<void>;
  projectKey(projectId: string): Promise<void>;
  projectDataKey(projectId: string): Promise<void>;
};

export class PostgresKmsCoreLocks implements TKmsCoreLocks {
  constructor(private readonly trx: Knex) {}

  rootKey() {
    return this.acquire(KMS_LOCK_IDS.rootKey);
  }

  orgKey(orgId: string) {
    return this.acquire(KMS_LOCK_IDS.orgKey(orgId));
  }

  orgDataKey(orgId: string) {
    return this.acquire(KMS_LOCK_IDS.orgDataKey(orgId));
  }

  projectKey(projectId: string) {
    return this.acquire(KMS_LOCK_IDS.projectKey(projectId));
  }

  projectDataKey(projectId: string) {
    return this.acquire(KMS_LOCK_IDS.projectDataKey(projectId));
  }

  private async acquire(id: number) {
    await this.trx.raw("SELECT pg_advisory_xact_lock(?)", [id]);
  }
}

const refuseOutsideTransaction = (): Promise<void> =>
  Promise.reject(new Error("KMS Core locks are only available inside a transaction"));

// The locks of the data access a module uses outside a transaction. They would be released at once, so they refuse.
export const noKmsCoreLocks: TKmsCoreLocks = {
  rootKey: refuseOutsideTransaction,
  orgKey: refuseOutsideTransaction,
  orgDataKey: refuseOutsideTransaction,
  projectKey: refuseOutsideTransaction,
  projectDataKey: refuseOutsideTransaction
};
