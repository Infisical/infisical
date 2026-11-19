import { memberDisplayName } from "@app/components/agent-vault/MemberName";
import {
  actorIdsPayload,
  getAgentVaultAdminChangeBlockedReason,
  nextAgentVaultRoles
} from "@app/helpers/agentVaultMembers";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import {
  TAddAgentVaultProductMembersDTO,
  TAgentVaultActorRef,
  TAgentVaultProductActor,
  TAgentVaultProductMember,
  TUpdateAgentVaultMemberRolesDTO
} from "@app/hooks/api/agentVault/types";

export const SELF_ROLE_CHANGE_BLOCKED = "You can't change your own roles.";

export const ASSIGN_GROUP_LABEL: Record<AgentVaultMemberType, string> = {
  [AgentVaultMemberType.User]: "Users",
  [AgentVaultMemberType.MachineIdentity]: "Machine Identities",
  [AgentVaultMemberType.Group]: "Groups"
};

const TYPE_ORDER = [
  AgentVaultMemberType.User,
  AgentVaultMemberType.MachineIdentity,
  AgentVaultMemberType.Group
];

export type TAssignOption = TAgentVaultActorRef & {
  key: string;
  name: string;
  email: string | null;
  /** The member's roles now, or null for someone who isn't in the project yet. */
  currentRoles: string[] | null;
  disabledReason?: string;
};

const toOption = (
  actor: TAgentVaultProductActor,
  currentRoles: string[] | null,
  disabledReason?: string
): TAssignOption => ({
  type: actor.type,
  id: actor.id,
  key: `${actor.type}:${actor.id}`,
  name: memberDisplayName(actor),
  email: actor.type === AgentVaultMemberType.User ? actor.email || actor.username : null,
  currentRoles,
  disabledReason
});

const matchesSearch = (option: TAssignOption, search: string) => {
  const needle = search.trim().toLowerCase();
  return (
    !needle ||
    option.name.toLowerCase().includes(needle) ||
    Boolean(option.email?.toLowerCase().includes(needle))
  );
};

/**
 * Who can be given the role: project members who don't hold it yet, filtered here, and people, machine identities and
 * groups not in the project yet, which the server has already searched. Users first, then machine identities, then
 * groups, each with members ahead of newcomers.
 */
export const buildAgentVaultAssignOptions = ({
  roleSlug,
  members,
  available,
  isViewerAdmin,
  viewerUserId,
  search
}: {
  roleSlug: string;
  members: readonly TAgentVaultProductMember[];
  available: readonly TAgentVaultProductActor[];
  isViewerAdmin: boolean;
  viewerUserId?: string;
  search: string;
}) => {
  const memberKeys = new Set(members.map((member) => `${member.type}:${member.id}`));

  const fromMembers = members
    .filter((member) => !member.roles.includes(roleSlug))
    .map((member) =>
      toOption(
        member,
        member.roles,
        member.type === AgentVaultMemberType.User && member.id === viewerUserId
          ? SELF_ROLE_CHANGE_BLOCKED
          : getAgentVaultAdminChangeBlockedReason({ isViewerAdmin, memberRoles: member.roles })
      )
    )
    .filter((option) => matchesSearch(option, search));

  const fromOrg = available
    .filter((actor) => !memberKeys.has(`${actor.type}:${actor.id}`))
    .map((actor) => toOption(actor, null));

  return [...fromMembers, ...fromOrg].sort(
    (a, b) =>
      TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) ||
      Number(a.currentRoles === null) - Number(b.currentRoles === null) ||
      a.name.localeCompare(b.name)
  );
};

// The members API names at most this many users, machine identities and groups in one request.
export const AGENT_VAULT_MAX_ACTORS_PER_REQUEST = 100;

const inBatches = <T>(items: readonly T[]) =>
  Array.from({ length: Math.ceil(items.length / AGENT_VAULT_MAX_ACTORS_PER_REQUEST) }, (_, index) =>
    items.slice(
      index * AGENT_VAULT_MAX_ACTORS_PER_REQUEST,
      (index + 1) * AGENT_VAULT_MAX_ACTORS_PER_REQUEST
    )
  );

/**
 * The calls that give everyone picked the role. Newcomers join with just this role. Members keep the roles they hold,
 * minus No Access; an update sets one role set for every actor it names, so members are batched by the set they end up
 * with. No call names more actors than the API takes at once.
 */
export const planAgentVaultRoleAssignment = (
  roleSlug: string,
  selected: readonly TAssignOption[]
): { adds: TAddAgentVaultProductMembersDTO[]; updates: TUpdateAgentVaultMemberRolesDTO[] } => {
  const newcomers = selected.filter((option) => option.currentRoles === null);

  const bySet = new Map<string, { roles: string[]; actors: TAgentVaultActorRef[] }>();
  selected.forEach((option) => {
    if (option.currentRoles === null) return;
    const roles = nextAgentVaultRoles(option.currentRoles, [...option.currentRoles, roleSlug]);
    const setKey = [...roles].sort().join(",");
    const batch = bySet.get(setKey) ?? { roles, actors: [] };
    batch.actors.push({ type: option.type, id: option.id });
    bySet.set(setKey, batch);
  });

  return {
    adds: inBatches(newcomers).map((batch) => ({ ...actorIdsPayload(batch), roles: [roleSlug] })),
    updates: [...bySet.values()].flatMap(({ roles, actors }) =>
      inBatches(actors).map((batch) => ({ ...actorIdsPayload(batch), roles }))
    )
  };
};
