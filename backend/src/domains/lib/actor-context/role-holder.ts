import { RuleViolationError } from "@app/domains/lib/errors";
import { ActorType } from "@app/lib/auth/actor-types";
import { effectiveActorForProject, TPrincipal } from "@app/lib/auth/principal";

// A user or identity: the only principals that hold roles.
export type TRoleHolder = { type: ActorType.USER | ActorType.IDENTITY; id: string };

// Whose roles decide what the principal may do: the principal itself, or, inside the project it assumed, the actor it
// assumed there. Refuses every other principal.
export const roleHolderOf = (principal: TPrincipal, { projectId }: { projectId?: string } = {}): TRoleHolder => {
  if (principal.type !== ActorType.USER && principal.type !== ActorType.IDENTITY) {
    throw new RuleViolationError({ message: "Invalid actor provided", name: "Get permission" });
  }
  if (!projectId) return { type: principal.type, id: principal.id };
  const { actorType, actorId } = effectiveActorForProject(principal, projectId);
  return { type: actorType, id: actorId };
};
