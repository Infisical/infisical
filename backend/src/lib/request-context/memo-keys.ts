import { ActionProjectType, OrganizationActionScope } from "@app/db/schemas";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";

/**
 * Builders for {@link requestMemoize} string keys. Centralizes formats so call sites
 * cannot drift (e.g. `project:findById` vs `project:findbyId`).
 */
export const requestMemoKeys = {
  orgPermission: ({
    orgId,
    actor,
    actorId,
    actorAuthMethod,
    scope
  }: {
    orgId: string;
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    scope?: OrganizationActionScope | null;
  }) => `permission:org:${orgId}:${actor}:${actorId}:${actorAuthMethod}:${scope ?? "any"}`,

  projectPermission: ({
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actionProjectType
  }: {
    projectId: string;
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actionProjectType: ActionProjectType;
  }) => `permission:project:${projectId}:${actor}:${actorId}:${actorAuthMethod}:${actionProjectType}`,

  projectFindById: (projectId: string) => `project:findById:${projectId}`,

  userFindById: (userId: string) => `user:findById:${userId}`,

  identityFindById: (identityId: string) => `identity:findById:${identityId}`
};
