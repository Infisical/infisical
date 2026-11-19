import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultActorIdsDTO, TAgentVaultActorRef } from "@app/hooks/api/agentVault/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

export const actorIdsPayload = (actors: TAgentVaultActorRef[]): TAgentVaultActorIdsDTO => ({
  userIds: actors
    .filter((actor) => actor.type === AgentVaultMemberType.User)
    .map((actor) => actor.id),
  groupIds: actors
    .filter((actor) => actor.type === AgentVaultMemberType.Group)
    .map((actor) => actor.id),
  machineIdentityIds: actors
    .filter((actor) => actor.type === AgentVaultMemberType.MachineIdentity)
    .map((actor) => actor.id)
});

const NO_ACCESS: string = ProjectMembershipRole.NoAccess;
const ADMIN: string = ProjectMembershipRole.Admin;

/** What a member starts with when nobody picks a role for them. */
export const defaultAgentVaultRoles = () => [NO_ACCESS];

/**
 * The roles a picker holds after a change. No Access grants nothing, so the API refuses it beside another role: picking
 * it drops the rest, picking anything else drops it, and taking every role away leaves No Access.
 */
export const nextAgentVaultRoles = (previous: readonly string[], next: readonly string[]) => {
  const unique = [...new Set(next)];
  if (unique.includes(NO_ACCESS) && !previous.includes(NO_ACCESS)) return [NO_ACCESS];
  const granting = unique.filter((role) => role !== NO_ACCESS);
  return granting.length ? granting : defaultAgentVaultRoles();
};

export const isSameRoleSet = (a: readonly string[], b: readonly string[]) => {
  const inA = new Set(a);
  const inB = new Set(b);
  return inA.size === inB.size && [...inA].every((role) => inB.has(role));
};

export const AGENT_VAULT_ADMIN_CHANGE_BLOCKED = "Only an Admin can change an Admin.";

export const holdsAgentVaultAdmin = (roles: readonly string[]) => roles.includes(ADMIN);

/**
 * Why the viewer can't change this member, or undefined when they can. Only an Admin may change an Admin's roles or
 * membership; the API refuses everyone else, so the UI says so before they try.
 */
export const getAgentVaultAdminChangeBlockedReason = ({
  isViewerAdmin,
  memberRoles
}: {
  isViewerAdmin: boolean;
  memberRoles: readonly string[];
}) =>
  !isViewerAdmin && holdsAgentVaultAdmin(memberRoles)
    ? AGENT_VAULT_ADMIN_CHANGE_BLOCKED
    : undefined;

/** The roles the viewer may hand out: only an Admin may make someone an Admin. */
export const assignableAgentVaultRoles = <T extends { slug: string }>(
  options: readonly T[],
  isViewerAdmin: boolean
) => (isViewerAdmin ? [...options] : options.filter((option) => option.slug !== ADMIN));
