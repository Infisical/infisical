import { TGenericPermission } from "@app/lib/types";

import {
  TAgentVaultHookRuleInput,
  TAgentVaultHookRuleView,
  TAgentVaultHookServiceNarrowingUpdate,
  THookRuleNarrowing,
  TResolvedHookRule
} from "./agent-vault-hook-fns";

export type TAgentVaultHookScoped = { projectId: string; ctx: TGenericPermission };

export type TCreateHookDTO = TAgentVaultHookScoped & {
  name: string;
  description?: string | null;
  url: string;
  secret: string;
  rules?: TAgentVaultHookRuleInput[];
};

export type TListHooksDTO = TAgentVaultHookScoped & { search?: string; limit: number; offset: number };

export type THookByIdDTO = TAgentVaultHookScoped & { hookId: string };

export type TAddHookServiceDTO = THookByIdDTO & TAgentVaultHookRuleInput;

export type THookServiceByIdDTO = THookByIdDTO & { serviceId: string };

export type TUpdateHookServiceDTO = THookServiceByIdDTO & TAgentVaultHookServiceNarrowingUpdate;

export type TListServiceHooksDTO = TAgentVaultHookScoped & { serviceId: string };

/** A saved hook a service is in, as service reads return it, with that service's narrowing in it. */
export type TAgentVaultServiceHook = { id: string; name: string } & THookRuleNarrowing;

// A field left out keeps its value; a secret left out keeps the stored one.
export type TUpdateHookDTO = THookByIdDTO & {
  name?: string;
  description?: string | null;
  url?: string;
  secret?: string;
  rules?: TAgentVaultHookRuleInput[];
};

/** A saved hook as every read returns it: never its secret. */
export type TAgentVaultHook = {
  id: string;
  name: string;
  description: string | null;
  url: string;
  rules: TAgentVaultHookRuleView[];
  // Whether a hook with no rules checks every request. False for one left without rules after its services were
  // deleted or removed, which checks nothing.
  appliesToAllServices: boolean;
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
  rules?: TAgentVaultHookRuleView[];
  appliesToAllServices?: boolean;
};

/** A session's hook as resolve sends it to the proxy. */
export type TResolvedSessionHook = {
  id: string;
  name: string | null;
  url: string;
  secret: string;
  rules: TResolvedHookRule[];
};
