import { TStoreLocks } from "@app/domains/lib/store-locks";

import { TKmsCoreLocks } from "../data-access/kms-core-locks";

// The same lock names as Postgres, held by the in-memory runner's per-key mutexes.
export class InMemoryKmsCoreLocks implements TKmsCoreLocks {
  constructor(private readonly locks: TStoreLocks) {}

  rootKey() {
    return this.locks.acquire("kms-root-key");
  }

  orgKey(orgId: string) {
    return this.locks.acquire(`kms-org-key:${orgId}`);
  }

  orgDataKey(orgId: string) {
    return this.locks.acquire(`kms-org-data-key:${orgId}`);
  }

  projectKey(projectId: string) {
    return this.locks.acquire(`kms-project-key:${projectId}`);
  }

  projectDataKey(projectId: string) {
    return this.locks.acquire(`kms-project-data-key:${projectId}`);
  }
}
