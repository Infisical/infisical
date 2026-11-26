import { TTransaction } from "@app/domains/lib/transactions";

import { TFolderGrantCache } from "../dependencies";

// Only the folder version bump runs on the caller's tx, so it commits or rolls back with the change it reports.
export type TSecretsPermissionTransaction = {
  invalidateFolderGrants(input: { projectIds: string[] }): Promise<void>;
};

export class SecretsPermissionTransaction implements TSecretsPermissionTransaction {
  constructor(
    private readonly folderGrantCache: TFolderGrantCache,
    private readonly tx: TTransaction
  ) {}

  invalidateFolderGrants({ projectIds }: { projectIds: string[] }): Promise<void> {
    return this.folderGrantCache.bumpFolderVersions({ projectIds, tx: this.tx });
  }
}
