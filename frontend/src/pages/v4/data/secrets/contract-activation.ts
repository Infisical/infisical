import type { V4QueryResult } from "../contract";

export type ActivationVariant = "control" | "card" | null;

export type SecretsActivationAdapter = {
  useSecretsActivationCheck: () => (orgId: string, userId: string) => Promise<boolean>;
  useActivationVariant: (enabled: boolean) => V4QueryResult<ActivationVariant>;
};
