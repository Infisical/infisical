import type { V4Mutation } from "../contract";

export type SecretsUpgradeAdapter = {
  useIsProjectAdmin: (projectId: string) => boolean;
  useMigrateProjectToV3: V4Mutation<{ projectId: string }, object>;
};
