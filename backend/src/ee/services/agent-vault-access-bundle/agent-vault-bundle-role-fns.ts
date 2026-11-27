import { packRules, unpackRules } from "@casl/ability/extra";
import { Knex } from "knex";

import { AccessScope, ProjectMembershipRole, TAgentVaultAccessBundles } from "@app/db/schemas";
import { isActiveRole } from "@app/ee/services/permission/permission-fns";
import {
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TRoleDALFactory } from "@app/services/role/role-dal";

import { AGENT_VAULT_MAX_MEMBER_ROLES } from "../agent-vault-member/agent-vault-member-role-fns";
import { TAgentVaultAccessBundleDALFactory } from "./agent-vault-access-bundle-dal";

/**
 * The deprecated grant endpoints work on a role. Each bundle can have one role that can use it, recorded on the bundle
 * (`grantRoleId`): the role migration made one for every bundle that had grants, and the grant endpoints make one the
 * first time they need it. Granting the bundle gives that role, revoking takes it away, and listing grantees lists who
 * holds it. Deleting the bundle deletes the role too, unless it was changed to grant something else. Drop these with
 * the endpoints after 2027-01-04.
 */

export type TBundleRoleActorColumn = "actorUserId" | "actorIdentityId" | "actorGroupId";
export type TBundleRoleActor = { actorColumn: TBundleRoleActorColumn; actorId: string };

const MAX_SLUG_LENGTH = 64;
const SLUG_SUFFIX = "-users";

export type TBundleRoleDeps = {
  roleDAL: Pick<TRoleDALFactory, "find" | "findById" | "create" | "updateById">;
  agentVaultAccessBundleDAL: Pick<TAgentVaultAccessBundleDALFactory, "updateById">;
  membershipDAL: Pick<TMembershipDALFactory, "find">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "find" | "insertMany" | "delete" | "findRolesByMembershipIds">;
};

export const bundleRoleNameOf = (bundleName: string) => `${bundleName} users`;

export const bundleRoleDescriptionOf = (bundleName: string) => `Use the access bundle '${bundleName}'.`;

// A slug can't hold two hyphens in a row, so a cut that ends on one drops it.
const cutSlug = (slug: string, length: number) => slug.slice(0, length).replace(/-+$/, "");

export const bundleRolePermissions = (accessBundleId: string) =>
  packRules([
    {
      action: [ProjectPermissionAgentVaultAccessBundleActions.Read, ProjectPermissionAgentVaultAccessBundleActions.Use],
      subject: ProjectPermissionSub.AgentVaultAccessBundles,
      conditions: { accessBundleId }
    }
  ]);

// The bundle's role, made now when it has none or it was deleted.
export const ensureBundleRole = async (
  { roleDAL, agentVaultAccessBundleDAL }: Pick<TBundleRoleDeps, "roleDAL" | "agentVaultAccessBundleDAL">,
  bundle: Pick<TAgentVaultAccessBundles, "id" | "name" | "projectId" | "grantRoleId">,
  tx: Knex
) => {
  if (bundle.grantRoleId) {
    const existing = await roleDAL.findById(bundle.grantRoleId, tx);
    if (existing) return existing;
  }

  const taken = new Set((await roleDAL.find({ projectId: bundle.projectId }, { tx })).map((role) => role.slug));
  const base = `${cutSlug(bundle.name, MAX_SLUG_LENGTH - SLUG_SUFFIX.length)}${SLUG_SUFFIX}`;
  let slug = base;
  for (let suffix = 2; taken.has(slug); suffix += 1) {
    const tail = `-${suffix}`;
    slug = `${cutSlug(base, MAX_SLUG_LENGTH - tail.length)}${tail}`;
  }

  const role = await roleDAL.create(
    {
      name: bundleRoleNameOf(bundle.name),
      slug,
      description: bundleRoleDescriptionOf(bundle.name),
      permissions: JSON.stringify(bundleRolePermissions(bundle.id)),
      projectId: bundle.projectId
    },
    tx
  );
  await agentVaultAccessBundleDAL.updateById(bundle.id, { grantRoleId: role.id }, tx);
  return role;
};

// The actors' project memberships, by actor. An actor with none is left out.
const projectMembershipsOf = async (
  { membershipDAL }: Pick<TBundleRoleDeps, "membershipDAL">,
  { projectId, actors }: { projectId: string; actors: TBundleRoleActor[] },
  tx: Knex
) => {
  const byActor = new Map<string, string>();
  const columns: TBundleRoleActorColumn[] = ["actorUserId", "actorIdentityId", "actorGroupId"];
  await Promise.all(
    columns.map(async (actorColumn) => {
      const ids = actors.filter((actor) => actor.actorColumn === actorColumn).map((actor) => actor.actorId);
      if (!ids.length) return;
      const rows = await membershipDAL.find(
        { scope: AccessScope.Project, scopeProjectId: projectId, $in: { [actorColumn]: ids } },
        { tx }
      );
      rows.forEach((row) => byActor.set(`${actorColumn}:${row[actorColumn]}`, row.id));
    })
  );
  return byActor;
};

const keyOf = ({ actorColumn, actorId }: TBundleRoleActor) => `${actorColumn}:${actorId}`;

// A membership needs a role, so each one left with no live role gets No Access. An ended time-limited role grants
// nothing, so it doesn't count.
const giveNoAccessWhereNoLiveRole = async (
  deps: Pick<TBundleRoleDeps, "membershipRoleDAL">,
  {
    membershipIds,
    rowsLeft
  }: {
    membershipIds: string[];
    rowsLeft: { membershipId: string; isTemporary?: boolean; temporaryAccessEndTime?: Date | null }[];
  },
  tx: Knex
) => {
  const emptied = membershipIds.filter(
    (membershipId) => !rowsLeft.some((row) => row.membershipId === membershipId && isActiveRole(row))
  );
  if (emptied.length) {
    await deps.membershipRoleDAL.insertMany(
      emptied.map((membershipId) => ({ membershipId, role: ProjectMembershipRole.NoAccess })),
      tx
    );
  }
};

// Gives the role to each actor that doesn't hold it yet, in place of No Access, which means no access and can't sit beside
// another role. An actor who already holds the most roles a member can is left out and returned in `full`, so the caller
// decides whether that stops the change. Callers check the actors are in the project first.
export const giveBundleRole = async (
  deps: Pick<TBundleRoleDeps, "membershipDAL" | "membershipRoleDAL">,
  { projectId, roleId, actors }: { projectId: string; roleId: string; actors: TBundleRoleActor[] },
  tx: Knex
) => {
  const membershipByActor = await projectMembershipsOf(deps, { projectId, actors }, tx);
  const membershipIds = [...new Set(membershipByActor.values())];
  // A role whose time limit has ended grants nothing, so it counts as not held, and giving the role replaces it.
  const rows = (
    membershipIds.length ? await deps.membershipRoleDAL.find({ $in: { membershipId: membershipIds } }, { tx }) : []
  ).filter(isActiveRole);
  const holding = new Set(rows.filter((row) => row.customRoleId === roleId).map((row) => row.membershipId));
  // No Access doesn't count: the bundle's role takes its place.
  const roleCountOf = (membershipId: string) =>
    new Set(
      rows
        .filter((row) => row.membershipId === membershipId && row.role !== ProjectMembershipRole.NoAccess)
        .map((row) => row.customRoleId ?? row.role)
    ).size;

  const added: TBundleRoleActor[] = [];
  const skipped: TBundleRoleActor[] = [];
  const full: TBundleRoleActor[] = [];
  actors.forEach((actor) => {
    const membershipId = membershipByActor.get(keyOf(actor));
    if (!membershipId || holding.has(membershipId)) skipped.push(actor);
    else if (roleCountOf(membershipId) >= AGENT_VAULT_MAX_MEMBER_ROLES) full.push(actor);
    else {
      added.push(actor);
      holding.add(membershipId);
    }
  });
  if (added.length) {
    const addedMembershipIds = added.map((actor) => membershipByActor.get(keyOf(actor))!);
    await deps.membershipRoleDAL.delete(
      { role: ProjectMembershipRole.NoAccess, $in: { membershipId: addedMembershipIds } },
      tx
    );
    await deps.membershipRoleDAL.delete({ customRoleId: roleId, $in: { membershipId: addedMembershipIds } }, tx);
    await deps.membershipRoleDAL.insertMany(
      addedMembershipIds.map((membershipId) => ({
        membershipId,
        role: ProjectMembershipRole.Custom,
        customRoleId: roleId
      })),
      tx
    );
  }
  return { added, skipped, full };
};

// Whether any of the actors holds Admin on their project membership.
export const anyActorHoldsAdmin = async (
  deps: Pick<TBundleRoleDeps, "membershipDAL" | "membershipRoleDAL">,
  { projectId, actors }: { projectId: string; actors: TBundleRoleActor[] },
  tx: Knex
) => {
  const membershipIds = [...new Set((await projectMembershipsOf(deps, { projectId, actors }, tx)).values())];
  if (!membershipIds.length) return false;
  const adminRows = await deps.membershipRoleDAL.find(
    { role: ProjectMembershipRole.Admin, $in: { membershipId: membershipIds } },
    { tx }
  );
  // An Admin role whose time limit has ended grants nothing.
  return adminRows.some(isActiveRole);
};

// Takes the role from each actor holding it, an ended row of it included. One left with no live role gets No Access.
export const takeBundleRole = async (
  deps: Pick<TBundleRoleDeps, "membershipDAL" | "membershipRoleDAL">,
  { projectId, roleId, actors }: { projectId: string; roleId: string; actors: TBundleRoleActor[] },
  tx: Knex
) => {
  const membershipByActor = await projectMembershipsOf(deps, { projectId, actors }, tx);
  const membershipIds = [...new Set(membershipByActor.values())];
  const rows = membershipIds.length
    ? await deps.membershipRoleDAL.find({ $in: { membershipId: membershipIds } }, { tx })
    : [];
  const holding = new Set(rows.filter((row) => row.customRoleId === roleId).map((row) => row.membershipId));

  const removed = actors.filter((actor) => holding.has(membershipByActor.get(keyOf(actor)) ?? ""));
  const skipped = actors.filter((actor) => !holding.has(membershipByActor.get(keyOf(actor)) ?? ""));
  const removedMembershipIds = [...new Set(removed.map((actor) => membershipByActor.get(keyOf(actor))!))];
  if (removedMembershipIds.length) {
    await deps.membershipRoleDAL.delete({ customRoleId: roleId, $in: { membershipId: removedMembershipIds } }, tx);
    await giveNoAccessWhereNoLiveRole(
      deps,
      { membershipIds: removedMembershipIds, rowsLeft: rows.filter((row) => row.customRoleId !== roleId) },
      tx
    );
  }
  return { removed, skipped };
};

// For a bundle being deleted: takes its role from everyone holding it. One left with no live role gets No Access.
export const takeBundleRoleFromEveryone = async (
  deps: Pick<TBundleRoleDeps, "membershipRoleDAL">,
  { roleId }: { roleId: string },
  tx: Knex
) => {
  const held = await deps.membershipRoleDAL.find({ customRoleId: roleId }, { tx });
  const membershipIds = [...new Set(held.map((row) => row.membershipId))];
  if (!membershipIds.length) return;
  await deps.membershipRoleDAL.delete({ customRoleId: roleId }, tx);
  const rowsLeft = await deps.membershipRoleDAL.find({ $in: { membershipId: membershipIds } }, { tx });
  await giveNoAccessWhereNoLiveRole(deps, { membershipIds, rowsLeft }, tx);
};

// One key per action a rule allows or denies. An id condition reads the same however it was written ({ id }, { $eq: id }
// or { $in: [id] }), so a role the editor saved again unchanged still matches the rules it was made with.
const ruleKeysOf = (permissions: unknown) =>
  new Set(
    unpackRules((permissions ?? []) as Parameters<typeof unpackRules>[0]).flatMap((rule) => {
      const conditions = Object.fromEntries(
        Object.entries((rule.conditions ?? {}) as Record<string, unknown>).map(([field, value]) => {
          if (typeof value === "string") return [field, [value]];
          const operators = (value ?? {}) as { $eq?: unknown; $in?: unknown };
          const isOnly = Object.keys(operators).length === 1;
          if (isOnly && typeof operators.$eq === "string") return [field, [operators.$eq]];
          if (isOnly && Array.isArray(operators.$in)) return [field, [...new Set(operators.$in)].sort()];
          return [field, value];
        })
      );
      return [rule.action]
        .flat()
        .map((action) =>
          JSON.stringify([
            action,
            [rule.subject].flat().sort(),
            Boolean(rule.inverted),
            conditions,
            rule.fields ?? null
          ])
        );
    })
  );

// Whether a role still holds exactly the rules ensureBundleRole gave it, so deleting it takes nothing an admin added.
export const hasOnlyBundleRoleRules = (permissions: unknown, accessBundleId: string) => {
  try {
    const keys = ruleKeysOf(permissions);
    const made = ruleKeysOf(bundleRolePermissions(accessBundleId));
    return keys.size === made.size && [...keys].every((key) => made.has(key));
  } catch {
    return false;
  }
};

// A bundle's role is named after the bundle when it's made. A rename carries over to its name and description while
// they still read as made, and never to its slug, which clients and other roles' conditions name it by.
export const renameBundleRole = async (
  { roleDAL }: Pick<TBundleRoleDeps, "roleDAL">,
  { roleId, previousName, name }: { roleId: string; previousName: string; name: string },
  tx: Knex
) => {
  const role = await roleDAL.findById(roleId, tx);
  if (!role) return;
  const renamed = {
    ...(role.name === bundleRoleNameOf(previousName) ? { name: bundleRoleNameOf(name) } : {}),
    ...(role.description === bundleRoleDescriptionOf(previousName)
      ? { description: bundleRoleDescriptionOf(name) }
      : {})
  };
  if (Object.keys(renamed).length) await roleDAL.updateById(role.id, renamed, tx);
};

// The live roles each actor holds in the project, custom ones by slug as the boundary check names them. An actor with no
// membership holds none.
export const heldRolesOf = async (
  deps: Pick<TBundleRoleDeps, "membershipDAL" | "membershipRoleDAL">,
  { projectId, actors }: { projectId: string; actors: TBundleRoleActor[] },
  tx: Knex
) => {
  const membershipByActor = await projectMembershipsOf(deps, { projectId, actors }, tx);
  const membershipIds = [...new Set(membershipByActor.values())];
  const rows = membershipIds.length ? await deps.membershipRoleDAL.findRolesByMembershipIds(membershipIds, tx) : [];
  return actors.map((actor) => {
    const membershipId = membershipByActor.get(keyOf(actor));
    const live = rows.filter((row) => row.membershipId === membershipId && isActiveRole(row));
    return { actor, roles: [...new Set(live.map((row) => row.customRoleSlug || row.role))].sort() };
  });
};
