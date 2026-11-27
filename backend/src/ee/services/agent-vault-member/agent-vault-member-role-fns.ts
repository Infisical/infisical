import { Knex } from "knex";
import RE2 from "re2";
import { v5 as uuidv5 } from "uuid";

import { ProjectMembershipRole } from "@app/db/schemas";
import {
  AGENT_VAULT_SESSION_ACTOR_ACTIONS,
  ProjectPermissionGroupActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";
import { TGenericPermission } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TRoleDALFactory } from "@app/services/role/role-dal";

import { TAgentVaultActorName } from "../agent-vault/agent-vault-actor-name-fns";
import { AgentVaultMemberType } from "../agent-vault/agent-vault-enums";

// Agent Vault's built-in roles. Every other role is a custom role of the project.
export const AGENT_VAULT_BUILT_IN_ROLES: string[] = [ProjectMembershipRole.Admin, ProjectMembershipRole.NoAccess];

export const AGENT_VAULT_MAX_MEMBER_ROLES = 10;

// The role-assignment action on each kind of member, and the fields its conditions can match on, as Secrets Management's
// membership routes check them. The members API and the deprecated grant endpoints both give roles through it.
export const AGENT_VAULT_ROLE_ASSIGNMENT = {
  [AgentVaultMemberType.User]: {
    actions: [ProjectPermissionMemberActions.AssignRole, ProjectPermissionMemberActions.GrantPrivileges],
    subject: ProjectPermissionSub.Member,
    fields: (_id: string, name?: TAgentVaultActorName) => ({ userEmail: name?.email ?? undefined })
  },
  [AgentVaultMemberType.Group]: {
    actions: [ProjectPermissionGroupActions.AssignRole, ProjectPermissionGroupActions.GrantPrivileges],
    subject: ProjectPermissionSub.Groups,
    fields: (_id: string, name?: TAgentVaultActorName) => ({ groupName: name?.name })
  },
  [AgentVaultMemberType.MachineIdentity]: {
    actions: [ProjectPermissionIdentityActions.AssignRole, ProjectPermissionIdentityActions.GrantPrivileges],
    subject: ProjectPermissionSub.Identity,
    fields: (id: string) => ({ identityId: id })
  }
} as const;

export const isAgentVaultSelf = (actor: { type: AgentVaultMemberType; id: string }, ctx: TGenericPermission) =>
  (actor.type === AgentVaultMemberType.User && ctx.actor === ActorType.USER && actor.id === ctx.actorId) ||
  (actor.type === AgentVaultMemberType.MachineIdentity && ctx.actor === ActorType.IDENTITY && actor.id === ctx.actorId);

// `member` names the project's custom "Member" role, the one the role migration made, so older clients that add members
// as `member` keep working. Drop with the alias after 2027-01-04.
export const AGENT_VAULT_MEMBER_ROLE_ALIAS = ProjectMembershipRole.Member as string;
export const AGENT_VAULT_MEMBER_ROLE_SLUG = "member-role";

export const AGENT_VAULT_MEMBER_ROLE_DESCRIPTION = "Start and manage their own sessions, and view proxies and hooks.";

// The role migration gives the Member role an id derived from its project's, so the alias finds it whatever an admin
// renames, re-describes or narrows on it, and no other role can pass for it. The migration derives it with the same
// namespace.
const AGENT_VAULT_MEMBER_ROLE_ID_NAMESPACE = "8f4f5a2e-61b4-4c2e-9d0e-3b7a1c9e5d42";
export const agentVaultMemberRoleIdOf = (projectId: string) => uuidv5(projectId, AGENT_VAULT_MEMBER_ROLE_ID_NAMESPACE);

// The Member role the role migration made for a project that had Member rows. A project created since has none: Admin
// and No Access are the only built-in roles, so `member` is refused there like any role the project doesn't have.
export const findAgentVaultMemberRole = (roleDAL: Pick<TRoleDALFactory, "findById">, projectId: string, tx?: Knex) =>
  roleDAL.findById(agentVaultMemberRoleIdOf(projectId), tx);

// The rules in one Agent Vault role, each applied on every request that reads its holders' reach.
export const AGENT_VAULT_MAX_ROLE_RULES = 500;

// The ids one Agent Vault role names across all its rules. The API applies them in one pass, but the role editor shows a
// row per id, so a role past this can't be edited.
export const AGENT_VAULT_MAX_ROLE_IDS = 2000;

const idsInCondition = (condition: unknown): number => {
  if (typeof condition === "string") return 1;
  if (!condition || typeof condition !== "object") return 0;
  const { $eq, $in } = condition as { $eq?: unknown; $in?: unknown };
  return (typeof $eq === "string" ? 1 : 0) + (Array.isArray($in) ? $in.length : 0);
};

// Counts every id a role's rules name, whether the rules are packed (conditions third) or not.
export const countAgentVaultRoleIds = (rules: unknown[]) =>
  rules.reduce<number>((total, rule) => {
    const conditions: unknown = Array.isArray(rule)
      ? (rule as unknown[])[2]
      : (rule as { conditions?: unknown } | null)?.conditions;
    if (!conditions || typeof conditions !== "object") return total;
    return (
      total +
      Object.values(conditions as Record<string, unknown>).reduce<number>((sum, c) => sum + idsInCondition(c), 0)
    );
  }, 0);

const listOf = (value: unknown): string[] => {
  if (typeof value === "string") return value.split(",");
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
};

// Who started a session only tells sessions apart once they exist, so a rule that limits sessions by it can hold only
// read, edit and revoke. The other session actions act on no session yet, so they're checked without one and the
// condition would be ignored.
// Rules are packed (actions, subject, conditions) or not. Returns the actions such a rule can't hold.
export const sessionActionsOutsideActorCondition = (rules: unknown[]) => [
  ...new Set(
    rules.flatMap((rule) => {
      const [action, ruleSubject, conditions] = Array.isArray(rule)
        ? (rule as unknown[])
        : [
            (rule as { action?: unknown } | null)?.action,
            (rule as { subject?: unknown } | null)?.subject,
            (rule as { conditions?: unknown } | null)?.conditions
          ];
      if (!listOf(ruleSubject).includes(ProjectPermissionSub.AgentVaultSessions)) return [];
      if (!conditions || typeof conditions !== "object") return [];
      return listOf(action).filter((name) => !AGENT_VAULT_SESSION_ACTOR_ACTIONS.includes(name));
    })
  )
];

// A role's name is what members pick it by, so it can't pass for a built-in role or for another role that only differs by
// a character no one can see. RE2 sees a lone surrogate only as U+FFFD, so isWellFormed catches those.
// Also the characters that render blank without being spaces (braille blank, the Hangul fillers), which would let
// "Admin" plus one of them pass for Admin.
const AGENT_VAULT_ROLE_NAME_DISALLOWED_RE = new RE2(/[\p{Cc}\p{Cf}\p{Co}\p{Zl}\p{Zp}\u2800\u3164\u115F\u1160\uFFA0]/u);
const AGENT_VAULT_ROLE_NAME_SPACES_RE = new RE2(/\p{Zs}+/gu);
const AGENT_VAULT_BUILT_IN_ROLE_NAMES = ["admin", "no access", "no-access"];

export const normalizeAgentVaultRoleName = (name: string) => {
  // Any run of spaces of any kind is one plain space, so "No  Access" or a no-break space can't pass for No Access.
  const trimmed = name.replace(AGENT_VAULT_ROLE_NAME_SPACES_RE, " ").trim();
  if (!trimmed) throw new BadRequestError({ message: "Enter a name for the role." });
  if (!trimmed.isWellFormed() || AGENT_VAULT_ROLE_NAME_DISALLOWED_RE.test(trimmed)) {
    throw new BadRequestError({
      message:
        "A role name can't contain line breaks, tabs, or invisible characters such as zero-width spaces or text direction marks."
    });
  }
  if (AGENT_VAULT_BUILT_IN_ROLE_NAMES.includes(trimmed.toLowerCase())) {
    throw new BadRequestError({
      message: `'${trimmed}' is the name of a built-in role. Choose a different name.`
    });
  }
  return trimmed;
};

export const agentVaultNoSuchRoleMessage = (slug: string) =>
  `This project has no role '${slug}'. Use admin, no-access, or the slug of one of the project's roles.`;

export type TAgentVaultResolvedRole = { slug: string; role: string; customRoleId?: string };

// The limits on one member's roles, wherever an Agent Vault member's roles are set. No Access means no access, so it
// can't sit beside another role.
export const assertAgentVaultRoleSetLimits = (slugs: string[]) => {
  const unique = [...new Set(slugs)];
  if (!unique.length) throw new BadRequestError({ message: "Give each member at least one role." });
  if (unique.length > AGENT_VAULT_MAX_MEMBER_ROLES) {
    throw new BadRequestError({ message: `A member can have at most ${AGENT_VAULT_MAX_MEMBER_ROLES} roles.` });
  }
  if (unique.includes(ProjectMembershipRole.NoAccess) && unique.length > 1) {
    throw new BadRequestError({ message: "No Access can't be given together with another role." });
  }
};

// A change that keeps a member's access bundle roles beside the roles it names, as an older client's does, counts the
// kept ones toward the limit too, like a grant that gives one.
export const assertAgentVaultKeptRolesWithinLimit = (roleCount: number) => {
  if (roleCount > AGENT_VAULT_MAX_MEMBER_ROLES) {
    throw new BadRequestError({
      message: `A member can have at most ${AGENT_VAULT_MAX_MEMBER_ROLES} roles. With the access bundle roles they already hold, this change would give them more. Remove one of their access bundle roles first.`
    });
  }
};

// The membership_roles rows for a list of role slugs: built-in ones as they are, custom ones by their id.
export const resolveAgentVaultMemberRoles = async (
  roleDAL: Pick<TRoleDALFactory, "find" | "findById">,
  { projectId, slugs }: { projectId: string; slugs: string[] }
): Promise<TAgentVaultResolvedRole[]> => {
  assertAgentVaultRoleSetLimits(slugs);
  const unique = [...new Set(slugs)];

  const customSlugs = unique.filter(
    (slug) => !AGENT_VAULT_BUILT_IN_ROLES.includes(slug) && slug !== AGENT_VAULT_MEMBER_ROLE_ALIAS
  );
  const custom = customSlugs.length ? await roleDAL.find({ projectId, $in: { slug: customSlugs } }) : [];
  const missing = customSlugs.find((slug) => !custom.some((role) => role.slug === slug));
  if (missing) {
    throw new BadRequestError({ message: agentVaultNoSuchRoleMessage(missing) });
  }
  const memberRole = unique.includes(AGENT_VAULT_MEMBER_ROLE_ALIAS)
    ? await findAgentVaultMemberRole(roleDAL, projectId)
    : null;
  if (unique.includes(AGENT_VAULT_MEMBER_ROLE_ALIAS) && !memberRole) {
    throw new BadRequestError({ message: agentVaultNoSuchRoleMessage(AGENT_VAULT_MEMBER_ROLE_ALIAS) });
  }

  const resolved = unique.map((slug): TAgentVaultResolvedRole => {
    if (AGENT_VAULT_BUILT_IN_ROLES.includes(slug)) return { slug, role: slug };
    if (slug === AGENT_VAULT_MEMBER_ROLE_ALIAS) {
      return { slug: memberRole!.slug, role: ProjectMembershipRole.Custom, customRoleId: memberRole!.id };
    }
    return { slug, role: ProjectMembershipRole.Custom, customRoleId: custom.find((role) => role.slug === slug)!.id };
  });
  // `member` and the Member role's own slug name the same role.
  return resolved.filter((entry, index) => resolved.findIndex((other) => other.slug === entry.slug) === index);
};
