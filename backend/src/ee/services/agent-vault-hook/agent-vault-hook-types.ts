import type { TActorContext } from "@app/domains/lib/actor-context";

import { AgentVaultServiceType } from "../agent-vault/agent-vault-enums";

export type TAgentVaultHookScoped = { projectId: string; ctx: TActorContext };

export type TCreateHookDTO = TAgentVaultHookScoped & {
  name: string;
  description?: string | null;
  url: string;
  secret: string;
};

export type TListHooksDTO = TAgentVaultHookScoped & { search?: string; limit: number; offset: number };

export type THookByIdDTO = TAgentVaultHookScoped & { hookId: string };

// A field left out keeps its value; a secret left out keeps the stored one.
export type TUpdateHookDTO = THookByIdDTO & {
  name?: string;
  description?: string | null;
  url?: string;
  secret?: string;
};

export type THookServiceRef = { id: string; name: string; type: AgentVaultServiceType; hostPattern: string | null };

/** A saved hook as every read returns it: never its secret. */
export type TAgentVaultHook = {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  url: string;
  // The project's services that use the hook, by name.
  usedBy: THookServiceRef[];
  createdAt: Date;
  updatedAt: Date;
};
