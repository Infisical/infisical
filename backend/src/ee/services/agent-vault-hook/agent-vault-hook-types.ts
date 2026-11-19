import { TGenericPermission } from "@app/lib/types";

import { TAgentVaultHookRule } from "./agent-vault-hook-fns";

export type TAgentVaultHookScoped = { projectId: string; ctx: TGenericPermission };

export type TCreateHookDTO = TAgentVaultHookScoped & {
  name: string;
  description?: string | null;
  url: string;
  secret: string;
  rules?: TAgentVaultHookRule[];
};

export type TListHooksDTO = TAgentVaultHookScoped & { search?: string; limit: number; offset: number };

export type THookByIdDTO = TAgentVaultHookScoped & { hookId: string };

// A field left out keeps its value; a secret left out keeps the stored one.
export type TUpdateHookDTO = THookByIdDTO & {
  name?: string;
  description?: string | null;
  url?: string;
  secret?: string;
  rules?: TAgentVaultHookRule[];
};

/** A saved hook as every read returns it: never its secret. */
export type TAgentVaultHook = {
  id: string;
  name: string;
  description: string | null;
  url: string;
  rules: TAgentVaultHookRule[];
  createdAt: Date;
  updatedAt: Date;
};

/** A session's hook as session reads return it. URL and rules only for callers who can read hooks. */
export type TAgentVaultSessionHookSummary = {
  id: string;
  // Null for a hook sent inline with the session.
  name: string | null;
  isInline: boolean;
  url?: string;
  rules?: TAgentVaultHookRule[];
};

/** A session's hook as resolve sends it to the proxy. */
export type TResolvedSessionHook = {
  id: string;
  name: string | null;
  url: string;
  secret: string;
  rules: TAgentVaultHookRule[];
};
