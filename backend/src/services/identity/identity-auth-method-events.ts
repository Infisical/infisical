import { Knex } from "knex";
import { z } from "zod";

import { IdentityAuthMethod } from "@app/db/schemas";
import { ActorType } from "@app/services/auth/auth-type";
import { TEventEmitter } from "@app/services/event-outbox/event-outbox-types";

export const IDENTITY_AUTHENTICATION_RESOURCE_TYPE = "identity.authentication";
export const IDENTITY_AUTH_METHOD_CHANGED_EVENT = "identity.authentication.auth-method-changed";

export enum IdentityAuthMethodChange {
  Added = "added",
  Updated = "updated",
  Removed = "removed",
  CredentialAdded = "credential-added",
  CredentialUpdated = "credential-updated",
  CredentialRevoked = "credential-revoked"
}

export const IdentityAuthMethodChangePayloadSchema = z.object({
  authMethod: z.nativeEnum(IdentityAuthMethod),
  change: z.nativeEnum(IdentityAuthMethodChange),
  actorType: z.nativeEnum(ActorType),
  actorId: z.string().optional(),
  changedAt: z.coerce.date(),
  credentialId: z.string().optional(),
  credentialName: z.string().optional()
});

export type TIdentityAuthMethodChangeInput = {
  membership: { identity: { id: string; projectId?: string | null }; scopeOrgId: string };
  authMethod: IdentityAuthMethod;
  change: IdentityAuthMethodChange;
  actor: ActorType;
  actorId?: string;
  credential?: { id: string; name?: string | null };
};

export const emitIdentityAuthMethodChanged = (
  eventEmitter: TEventEmitter,
  { membership, authMethod, change, actor, actorId, credential }: TIdentityAuthMethodChangeInput,
  tx: Knex
): Promise<void> =>
  eventEmitter.emit(
    {
      eventType: IDENTITY_AUTH_METHOD_CHANGED_EVENT,
      orgId: membership.scopeOrgId,
      projectId: membership.identity.projectId,
      payload: {
        resourceType: IDENTITY_AUTHENTICATION_RESOURCE_TYPE,
        resourceId: membership.identity.id,
        targetIds: [membership.identity.id],
        authMethod,
        change,
        actorType: actor,
        actorId,
        changedAt: new Date().toISOString(),
        ...(credential ? { credentialId: credential.id, credentialName: credential.name ?? undefined } : {})
      }
    },
    tx
  );
