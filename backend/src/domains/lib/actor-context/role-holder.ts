import { RuleViolationError } from "@app/domains/lib/errors";
import { ActorType } from "@app/lib/auth/actor-types";
import { effectiveActorForProject, TPrincipal } from "@app/lib/auth/principal";

// Only users and identities hold roles.
export type TRoleHolder = { type: ActorType.USER | ActorType.IDENTITY; id: string };

// The principal itself, or the assumed actor when inside the project it assumed. Throws for any other principal type.
export const roleHolderOf = (principal: TPrincipal, { projectId }: { projectId?: string } = {}): TRoleHolder => {
  if (principal.type !== ActorType.USER && principal.type !== ActorType.IDENTITY) {
    throw new RuleViolationError({ message: "Invalid actor provided", name: "Get permission" });
  }
  if (!projectId) return { type: principal.type, id: principal.id };
  const { actorType, actorId } = effectiveActorForProject(principal, projectId);
  return { type: actorType, id: actorId };
};
