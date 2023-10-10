import { isEqual } from "lodash";

import { BatchRiskUpdateItem, BulkOperationItem } from "./types";
import { GitRisks } from "../../ee/models";

export async function bulkWriteRiskData(
  batchRiskUpdate: BatchRiskUpdateItem[],
): Promise<void> {
  const bulkOperations: Array<BulkOperationItem | null> = await Promise.all(
    batchRiskUpdate.map(async ({ fingerprint, data }) => {
      const existingRisk = await GitRisks.findOne({ fingerprint }).lean();

      if (existingRisk && isEqual(existingRisk, data)) {
        // Data is the same, skip the update
        return null;
      }

      return {
        updateOne: {
          filter: { fingerprint },
          update: { $set: data },
          upsert: true,
        },
      };
    }),
  );

  // Filter out null values (skipped updates) before performing bulk write
  const filteredBulkOperations = bulkOperations.filter(
    (op): op is BulkOperationItem => op !== null,
  );

  if (filteredBulkOperations.length > 0) {
    await GitRisks.bulkWrite(filteredBulkOperations, { ordered: false });
  }
}
