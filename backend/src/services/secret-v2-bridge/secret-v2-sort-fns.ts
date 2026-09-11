import { OrderByDirection } from "@app/lib/types";
import { DashboardSecretsOrderBy } from "@app/services/secret/secret-types";

import { TSecretSortCandidate } from "./secret-v2-bridge-types";

type TSelectAuthorizedSecretSortPage = {
  candidates: TSecretSortCandidate[];
  canAccessSecret: (candidate: TSecretSortCandidate) => boolean;
  sortFolderIds: string[];
  orderBy: DashboardSecretsOrderBy.CreatedAt | DashboardSecretsOrderBy.UpdatedAt;
  orderDirection: OrderByDirection;
  offset?: number;
  limit?: number;
};

export const selectAuthorizedSecretSortPage = ({
  candidates,
  canAccessSecret,
  sortFolderIds,
  orderBy,
  orderDirection,
  offset = 0,
  limit
}: TSelectAuthorizedSecretSortPage) => {
  const authorizedCandidates = candidates.filter(canAccessSecret);
  const sortFolderIdSet = new Set(sortFolderIds);
  const sortValueByKey = new Map<string, number>();

  authorizedCandidates.forEach((candidate) => {
    if (!sortFolderIdSet.has(candidate.folderId)) return;

    const timestamp = new Date(candidate[orderBy]).getTime();
    const currentTimestamp = sortValueByKey.get(candidate.key);
    if (currentTimestamp === undefined || timestamp > currentTimestamp) {
      sortValueByKey.set(candidate.key, timestamp);
    }
  });

  const orderedKeys = [...new Set(authorizedCandidates.map((candidate) => candidate.key))].sort((left, right) => {
    const leftTimestamp = sortValueByKey.get(left);
    const rightTimestamp = sortValueByKey.get(right);

    if (leftTimestamp === undefined && rightTimestamp !== undefined) return 1;
    if (leftTimestamp !== undefined && rightTimestamp === undefined) return -1;

    if (leftTimestamp !== undefined && rightTimestamp !== undefined && leftTimestamp !== rightTimestamp) {
      return orderDirection === OrderByDirection.ASC ? leftTimestamp - rightTimestamp : rightTimestamp - leftTimestamp;
    }

    if (left === right) return 0;
    return left < right ? -1 : 1;
  });

  const pageStart = limit ? offset : 0;
  const pageKeys = limit ? orderedKeys.slice(pageStart, pageStart + limit) : orderedKeys;
  const pageKeySet = new Set(pageKeys);

  return {
    candidates: authorizedCandidates.filter((candidate) => pageKeySet.has(candidate.key)),
    orderedKeys: pageKeys,
    isLimitReached: Boolean(limit && orderedKeys.length > pageStart + limit)
  };
};
