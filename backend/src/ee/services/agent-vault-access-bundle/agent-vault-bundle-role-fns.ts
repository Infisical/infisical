import { packRules } from "@casl/ability/extra";
import { Knex } from "knex";

import { AccessScope, ProjectMembershipRole, TAgentVaultAccessBundles } from "@app/db/schemas";
import {
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TRoleDALFactory } from "@app/services/role/role-dal";

import { TAgentVaultAccessBundleDALFactory } from "./agent-vault-access-bundle-dal";

/**
 * Access bundle grants were replaced by roles. Each bundle can have one role that can use it, recorded on the bundle
 * (`grantRoleId`): the migration made one for every bundle that had grants, and the deprecated grant endpoints make one
 * the first time they need it. Granting the bundle gives that role, revoking takes it away, and listing grantees lists
 * who holds it. Drop these with the endpoints after 2027-01-04.
 */

export type TBundleRoleActorColumn = "actorUserId" | "actorIdentityId" | "actorGroupId";
export type TBundleRoleActor = { actorColumn: TBundleRoleActorColumn; actorId: string };

const MAX_SLUG_LENGTH = 64;
const SLUG_SUFFIX = "-users";

export type TBundleRoleDeps = {
  roleDAL: Pick<TRoleDALFactory, "find" | "findById" | "create">;
  agentVaultAccessBundleDAL: Pick<TAgentVaultAccessBundleDALFactory, "updateById">;
  membershipDAL: Pick<TMembershipDALFactory, "find">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "find" | "insertMany" | "delete">;
};

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
  const base = `${bundle.name.slice(0, MAX_SLUG_LENGTH - SLUG_SUFFIX.length)}${SLUG_SUFFIX}`;
  let slug = base;
  for (let suffix = 2; taken.has(slug); suffix += 1) {
    const tail = `-${suffix}`;
    slug = `${base.slice(0, MAX_SLUG_LENGTH - tail.length)}${tail}`;
  }

  const role = await roleDAL.create(
    {
      name: `${bundle.name} users`,
      slug,
      description: `Use the access bundle '${bundle.name}'.`,
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

// Gives the role to each actor that doesn't hold it yet, in place of No Access, which means no access and can't sit beside
// another role. Callers check the actors are in the project first.
export const giveBundleRole = async (
  deps: Pick<TBundleRoleDeps, "membershipDAL" | "membershipRoleDAL">,
  { projectId, roleId, actors }: { projectId: string; roleId: string; actors: TBundleRoleActor[] },
  tx: Knex
) => {
  const membershipByActor = await projectMembershipsOf(deps, { projectId, actors }, tx);
  const membershipIds = [...new Set(membershipByActor.values())];
  const holding = new Set(
    membershipIds.length
      ? (await deps.membershipRoleDAL.find({ customRoleId: roleId, $in: { membershipId: membershipIds } }, { tx })).map(
          (row) => row.membershipId
        )
      : []
  );

  const added: TBundleRoleActor[] = [];
  const skipped: TBundleRoleActor[] = [];
  actors.forEach((actor) => {
    const membershipId = membershipByActor.get(keyOf(actor));
    if (!membershipId || holding.has(membershipId)) skipped.push(actor);
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
    await deps.membershipRoleDAL.insertMany(
      addedMembershipIds.map((membershipId) => ({
        membershipId,
        role: ProjectMembershipRole.Custom,
        customRoleId: roleId
      })),
      tx
    );
  }
  return { added, skipped };
};

// Takes the role from each actor holding it. One left with no role at all gets No Access, since a membership needs one.
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
    const emptied = removedMembershipIds.filter(
      (membershipId) => !rows.some((row) => row.membershipId === membershipId && row.customRoleId !== roleId)
    );
    if (emptied.length) {
      await deps.membershipRoleDAL.insertMany(
        emptied.map((membershipId) => ({ membershipId, role: ProjectMembershipRole.NoAccess })),
        tx
      );
    }
  }
  return { removed, skipped };
};
