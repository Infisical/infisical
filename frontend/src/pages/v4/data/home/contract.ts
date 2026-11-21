import type { V4QueryResult } from "../contract";

export type HomeDay = { date: string; value: number };

export type HomeSecretReads = { total: number; days: HomeDay[] };

export type HomeSetup = {
  hasProject: boolean;
  hasSecrets: boolean;
  /** Null when the org can't report secret reads. */
  hasReads: boolean | null;
  members: number;
};

export type HomeAdapter = {
  /** Null when the org has no secret reads endpoint available, such as without audit log analytics. */
  useSecretReads: (orgId: string, enabled?: boolean) => V4QueryResult<HomeSecretReads | null>;
  /** Pass enabled false when the checklist can't show, so its queries don't run. */
  useSetup: (orgId: string, enabled?: boolean) => V4QueryResult<HomeSetup>;
};
