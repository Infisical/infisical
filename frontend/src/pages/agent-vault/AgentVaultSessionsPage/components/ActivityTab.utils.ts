import { activityRecordKey } from "@app/hooks/api/agentVault/activityDecrypt";
import { TAgentVaultActivityRecord } from "@app/hooks/api/agentVault/types";

export const findRowShift = (
  before: TAgentVaultActivityRecord[],
  after: TAgentVaultActivityRecord[],
  index: number
): number | null => {
  const row = before[index];
  if (!row) return null;
  const key = activityRecordKey(row);
  const moved = after.findIndex((record) => activityRecordKey(record) === key);
  return moved < 0 ? null : moved - index;
};

const CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const chunkIdTime = (chunkId: string) =>
  new Date(
    [...chunkId.slice(0, 10).toUpperCase()].reduce(
      (ms, char) => ms * 32 + CROCKFORD_BASE32.indexOf(char),
      0
    )
  );
