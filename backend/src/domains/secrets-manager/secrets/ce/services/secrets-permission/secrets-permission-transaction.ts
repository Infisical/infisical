import { TTransaction } from "@app/domains/lib/transactions";

import { TFolderGrantCache } from "../dependencies";

// What may run on a caller's transaction: only the folder version bump, so it commits or rolls back with the
// folder grant or folder tree change it reports.
export type TSecretsPermissionTransaction = {
  // Makes every cached folder grant of these projects revalidate.
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
