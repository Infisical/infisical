import { createMongoAbility, subject } from "@casl/ability";
import { unpackRules } from "@casl/ability/extra";
import { Knex } from "knex";
import { v5 as uuidv5 } from "uuid";

import { AccessScope, ProjectMembershipRole, ProjectType, TableName } from "../schemas";

// Agent Vault access moves from bundle grants to roles. Admin and No Access are the only built-in roles, and a custom
// role grants exactly what it says. Until now every role but admin resolved to Member's rules in an Agent Vault project,
// so nobody's access changes when:
// 1. each project with Member or Viewer rows, or members holding a custom role, gets a custom role holding what Member
//    held; those rows move onto it, and anyone holding a custom role gets it as well, since Member's rules applied to
//    them and their own role's didn't;
// 2. each bundle with grants gets a custom role that can use it, given to everyone the bundle was granted to, and to a
//    group only for as long as its grant counted (bundleRoleWindowOf);
// 3. the grants, now carried by those roles, are deleted.
// The bundle's role is recorded on the bundle (grantRoleId), so the deprecated grant endpoints can keep working on it.
// A rolling deploy isn't bridged: until instances still on the previous release are replaced, they find no grants, so
// their non-admin sessions get no bundle, and a grant or revoke made through one of them isn't carried over.
//
// Everything is inlined, so later changes to the app's rule builders and constants can't change what this writes.

const GRANT_RESOURCE_TYPE = "agent-vault-access-bundle";
const RESOURCE_SCOPE = "resource";

// Member's rules when it was retired, packed the way roles store them, without read on bundles and skills: a Member
// saw only the bundles granted to them and the skills in those, which the bundle roles below now give.
const MEMBER_PERMISSIONS = [
  ["read,create,edit,revoke,create-with-inline-skills", "agent-vault-sessions"],
  ["read", "agent-vault-proxies"]
];
const MEMBER_ROLE_NAME = "Member";
const MEMBER_ROLE_SLUG = "member-role";
const MEMBER_ROLE_DESCRIPTION = "Start and manage their own sessions, and view proxies.";
// The Member role's id is derived from the project's, as agentVaultMemberRoleIdOf derives it at runtime, so the legacy
// `member` alias finds the role this makes whatever an admin later edits on it.
const MEMBER_ROLE_ID_NAMESPACE = "8f4f5a2e-61b4-4c2e-9d0e-3b7a1c9e5d42";
const memberRoleIdOf = (projectId: string) => uuidv5(projectId, MEMBER_ROLE_ID_NAMESPACE);

const BUNDLE_ROLE_DESCRIPTION_PREFIX = "Use the access bundle";
const MAX_SLUG_LENGTH = 64;

const uniqueSlug = (base: string, taken: Set<string>) => {
  let slug = base;
  for (let suffix = 2; taken.has(slug); suffix += 1) {
    const tail = `-${suffix}`;
    slug = `${base.slice(0, MAX_SLUG_LENGTH - tail.length)}${tail}`;
  }
  taken.add(slug);
  return slug;
};

const takenSlugsIn = async (knex: Knex, projectId: string) =>
  new Set(
    ((await knex(TableName.Role).where({ projectId }).select("slug")) as { slug: string }[]).map((row) => row.slug)
  );

// Built-in slugs that resolved to Member's rules in an Agent Vault project and grant nothing after this.
const MEMBER_LIKE_ROLES: string[] = [ProjectMembershipRole.Member, ProjectMembershipRole.Viewer];

type TWindowRow = {
  id: string;
  membershipId: string;
  isTemporary?: boolean | null;
  temporaryAccessEndTime?: Date | null;
};

// A permanent row, or else the temporary one that ends last.
const longestLasting = <T extends TWindowRow>(held: T[]) =>
  held.reduce((best, row) => {
    if (!best.isTemporary) return best;
    if (!row.isTemporary) return row;
    return (row.temporaryAccessEndTime?.getTime() ?? 0) > (best.temporaryAccessEndTime?.getTime() ?? 0) ? row : best;
  });

type TTimedRoleRow = TWindowRow & {
  temporaryMode?: string | null;
  temporaryRange?: string | null;
  temporaryAccessStartTime?: Date | null;
};

type TBundleRoleWindow = Omit<Partial<TTimedRoleRow>, "id" | "membershipId" | "isTemporary"> & {
  isTemporary?: boolean;
};

// A group's grant counted only while the group held a live role, so the group's bundle role lasts as long as the longest
// of those, and a group whose roles have all ended gets none (null). Any other grant counted for as long as it stood, so
// its role is permanent.
const bundleRoleWindowOf = async (
  knex: Knex,
  { membershipId, isGroup }: { membershipId: string; isGroup: boolean }
): Promise<TBundleRoleWindow | null> => {
  if (!isGroup) return {};
  const live = (await knex(TableName.MembershipRole)
    .where({ membershipId })
    .where((qb) => {
      void qb.where("isTemporary", false).orWhere("temporaryAccessEndTime", ">", new Date());
    })
    .select(
      "id",
      "membershipId",
      "isTemporary",
      "temporaryMode",
      "temporaryRange",
      "temporaryAccessStartTime",
      "temporaryAccessEndTime"
    )) as TTimedRoleRow[];
  if (!live.length) return null;
  const longest = longestLasting(live);
  if (!longest.isTemporary) return {};
  return {
    isTemporary: true,
    temporaryMode: longest.temporaryMode,
    temporaryRange: longest.temporaryRange,
    temporaryAccessStartTime: longest.temporaryAccessStartTime,
    temporaryAccessEndTime: longest.temporaryAccessEndTime
  };
};

const retireMember = async (knex: Knex) => {
  const rows = (await knex(TableName.MembershipRole)
    .join(TableName.Membership, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
    .join(TableName.Project, `${TableName.Project}.id`, `${TableName.Membership}.scopeProjectId`)
    .where(`${TableName.Membership}.scope`, AccessScope.Project)
    .where(`${TableName.Project}.type`, ProjectType.AgentVault)
    .whereIn(`${TableName.MembershipRole}.role`, [...MEMBER_LIKE_ROLES, ProjectMembershipRole.Custom])
    .select(
      `${TableName.Membership}.scopeProjectId as projectId`,
      knex.ref("id").withSchema(TableName.MembershipRole),
      `${TableName.MembershipRole}.membershipId`,
      `${TableName.MembershipRole}.role`,
      `${TableName.MembershipRole}.customRoleId`
    )) as { projectId: string; id: string; membershipId: string; role: string; customRoleId: string | null }[];

  // Roles this migration makes, which a second run must not count as roles that took no effect before.
  const bundleRoleIds = new Set(
    (
      (await knex(TableName.AgentVaultAccessBundle).whereNotNull("grantRoleId").select("grantRoleId")) as {
        grantRoleId: string;
      }[]
    ).map((row) => row.grantRoleId)
  );

  const projectIds = [...new Set(rows.map((row) => row.projectId))];
  for await (const projectId of projectIds) {
    let role = (await knex(TableName.Role)
      .where({ id: memberRoleIdOf(projectId) })
      .first("id")) as { id: string } | undefined;
    if (!role) {
      const slug = uniqueSlug(MEMBER_ROLE_SLUG, await takenSlugsIn(knex, projectId));
      // Cast: the generated insert type leaves out id, and this role's id is derived on purpose.
      [role] = (await knex(TableName.Role)
        .insert({
          id: memberRoleIdOf(projectId),
          name: MEMBER_ROLE_NAME,
          slug,
          description: MEMBER_ROLE_DESCRIPTION,
          permissions: JSON.stringify(MEMBER_PERMISSIONS),
          projectId
        } as never)
        .returning("id")) as { id: string }[];
    }
    const memberRoleId = role.id;

    // An update rather than a new row, so a time-limited Member role keeps its window.
    await knex(TableName.MembershipRole)
      .whereIn(`${TableName.MembershipRole}.role`, MEMBER_LIKE_ROLES)
      .whereIn(
        `${TableName.MembershipRole}.membershipId`,
        knex(TableName.Membership)
          .where(`${TableName.Membership}.scope`, AccessScope.Project)
          .where(`${TableName.Membership}.scopeProjectId`, projectId)
          .select(`${TableName.Membership}.id`)
      )
      .update({ role: ProjectMembershipRole.Custom, customRoleId: memberRoleId });

    // A custom role resolved to Member's rules here, and starts granting its own rules after this, so its rows move onto
    // the Member role in place too, keeping their windows. The custom roles stay, held by no one, for an admin to give out
    // knowing what they now grant.
    const legacyCustomRowIds = rows
      .filter(
        (row) =>
          row.projectId === projectId &&
          row.role === ProjectMembershipRole.Custom &&
          row.customRoleId &&
          row.customRoleId !== memberRoleId &&
          !bundleRoleIds.has(row.customRoleId)
      )
      .map((row) => row.id);
    if (legacyCustomRowIds.length) {
      await knex(TableName.MembershipRole).whereIn("id", legacyCustomRowIds).update({ customRoleId: memberRoleId });
    }

    // Member, viewer and custom rows all meant Member's rules, so each member keeps one Member row: the one that lasts
    // longest, which covers every window the others did.
    const memberRows = (await knex(TableName.MembershipRole)
      .where({ customRoleId: memberRoleId })
      .whereIn(
        "membershipId",
        knex(TableName.Membership)
          .where(`${TableName.Membership}.scope`, AccessScope.Project)
          .where(`${TableName.Membership}.scopeProjectId`, projectId)
          .select(`${TableName.Membership}.id`)
      )
      .select("id", "membershipId", "isTemporary", "temporaryAccessEndTime")) as TWindowRow[];
    const byMembership = new Map<string, TWindowRow[]>();
    memberRows.forEach((row) =>
      byMembership.set(row.membershipId, [...(byMembership.get(row.membershipId) ?? []), row])
    );
    const extraRowIds = [...byMembership.values()].flatMap((held) => {
      const kept = longestLasting(held);
      return held.filter((row) => row.id !== kept.id).map((row) => row.id);
    });
    if (extraRowIds.length) await knex(TableName.MembershipRole).whereIn("id", extraRowIds).delete();
  }
};

const grantsToRoles = async (knex: Knex) => {
  const grants = (await knex(TableName.Membership)
    .join(TableName.AgentVaultAccessBundle, function joinBundle() {
      this.on(
        knex.raw("??::text = ??", [`${TableName.AgentVaultAccessBundle}.id`, `${TableName.Membership}.scopeResourceId`])
      );
    })
    .where(`${TableName.Membership}.scope`, RESOURCE_SCOPE)
    .where(`${TableName.Membership}.scopeResourceType`, GRANT_RESOURCE_TYPE)
    .select(
      `${TableName.Membership}.actorUserId`,
      `${TableName.Membership}.actorIdentityId`,
      `${TableName.Membership}.actorGroupId`,
      `${TableName.Membership}.isActive`,
      knex.ref("id").withSchema(TableName.AgentVaultAccessBundle).as("accessBundleId"),
      knex.ref("name").withSchema(TableName.AgentVaultAccessBundle).as("accessBundleName"),
      knex.ref("projectId").withSchema(TableName.AgentVaultAccessBundle)
    )) as {
    actorUserId: string | null;
    actorIdentityId: string | null;
    actorGroupId: string | null;
    isActive: boolean;
    accessBundleId: string;
    accessBundleName: string;
    projectId: string;
  }[];

  const byBundle = new Map<string, typeof grants>();
  grants.forEach((grant) => byBundle.set(grant.accessBundleId, [...(byBundle.get(grant.accessBundleId) ?? []), grant]));

  const takenByProject = new Map<string, Set<string>>();
  for await (const [accessBundleId, bundleGrants] of byBundle) {
    const { projectId, accessBundleName } = bundleGrants[0];
    if (!takenByProject.has(projectId)) takenByProject.set(projectId, await takenSlugsIn(knex, projectId));
    const slug = uniqueSlug(
      `${accessBundleName.slice(0, MAX_SLUG_LENGTH - "-users".length)}-users`,
      takenByProject.get(projectId)!
    );
    const [role] = (await knex(TableName.Role)
      .insert({
        name: `${accessBundleName} users`,
        slug,
        description: `${BUNDLE_ROLE_DESCRIPTION_PREFIX} '${accessBundleName}'.`,
        permissions: JSON.stringify([["read,use", "agent-vault-access-bundles", { accessBundleId }]]),
        projectId
      })
      .returning("id")) as { id: string }[];
    await knex(TableName.AgentVaultAccessBundle).where({ id: accessBundleId }).update({ grantRoleId: role.id });

    for await (const grant of bundleGrants.filter((row) => row.isActive)) {
      const projectMembership = (await knex(TableName.Membership)
        .where(`${TableName.Membership}.scope`, AccessScope.Project)
        .where(`${TableName.Membership}.scopeProjectId`, projectId)
        .where((qb) => {
          if (grant.actorUserId) void qb.where(`${TableName.Membership}.actorUserId`, grant.actorUserId);
          else if (grant.actorIdentityId)
            void qb.where(`${TableName.Membership}.actorIdentityId`, grant.actorIdentityId);
          else void qb.where(`${TableName.Membership}.actorGroupId`, grant.actorGroupId);
        })
        .first("id")) as { id: string } | undefined;
      // A grant always needed a project membership, and leaving the project deletes the grants, so none should be
      // missing. One that is grants nothing, as before.
      const window = projectMembership
        ? await bundleRoleWindowOf(knex, { membershipId: projectMembership.id, isGroup: Boolean(grant.actorGroupId) })
        : null;
      if (projectMembership && window) {
        await knex(TableName.MembershipRole).insert({
          membershipId: projectMembership.id,
          role: ProjectMembershipRole.Custom,
          customRoleId: role.id,
          ...window
        });
      }
    }
  }

  await knex(TableName.Membership)
    .where(`${TableName.Membership}.scope`, RESOURCE_SCOPE)
    .where(`${TableName.Membership}.scopeResourceType`, GRANT_RESOURCE_TYPE)
    .delete();
};

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.AgentVaultAccessBundle, "grantRoleId"))) {
    await knex.schema.alterTable(TableName.AgentVaultAccessBundle, (t) => {
      t.uuid("grantRoleId").nullable();
      t.foreign("grantRoleId").references("id").inTable(TableName.Role).onDelete("SET NULL");
    });
  }

  await retireMember(knex);
  await grantsToRoles(knex);
}

// Whether a bundle's role still lets its holders use the bundle. An admin can edit the role after up(), and a grant can't
// give less than use, so a role that no longer allows it gives no grants back. One that can't be read gives none either.
// Denies go last, as buildProjectPermissionRules orders a role's rules, so a deny wins whatever order it was saved in.
const roleUsesBundle = (permissions: unknown, accessBundleId: string) => {
  try {
    const rules = unpackRules((permissions ?? []) as Parameters<typeof unpackRules>[0]).sort(
      (a, b) => Number(Boolean(a.inverted)) - Number(Boolean(b.inverted))
    );
    return createMongoAbility(rules as never).can("use", subject("agent-vault-access-bundles", { accessBundleId }));
  } catch {
    return false;
  }
};

// Best effort: grants come back from each bundle's role and the roles go, and every row on a Member role returns to the
// built-in role, Viewer rows and the rows moved off custom roles included, which the old rules read the same way.
// Anything else given to those roles since is lost with them. A membership whose only role was a bundle's gets Member,
// since a membership needs a role. The old rules read every role but admin as Member, so No Access and the custom roles
// left in place read as Member too.
export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.AgentVaultAccessBundle, "grantRoleId")) {
    // Any grant here was written after up() by an instance on the previous release. The roles say who has access now, so
    // the grants are made from them instead.
    await knex(TableName.Membership)
      .where(`${TableName.Membership}.scope`, RESOURCE_SCOPE)
      .where(`${TableName.Membership}.scopeResourceType`, GRANT_RESOURCE_TYPE)
      .delete();

    const bundles = (await knex(TableName.AgentVaultAccessBundle)
      .join(TableName.Project, `${TableName.Project}.id`, `${TableName.AgentVaultAccessBundle}.projectId`)
      .join(TableName.Role, `${TableName.Role}.id`, `${TableName.AgentVaultAccessBundle}.grantRoleId`)
      .select(
        knex.ref("id").withSchema(TableName.AgentVaultAccessBundle),
        knex.ref("projectId").withSchema(TableName.AgentVaultAccessBundle),
        knex.ref("grantRoleId").withSchema(TableName.AgentVaultAccessBundle),
        knex.ref("orgId").withSchema(TableName.Project),
        knex.ref("permissions").withSchema(TableName.Role).as("grantRolePermissions")
      )) as { id: string; projectId: string; grantRoleId: string; orgId: string; grantRolePermissions: unknown }[];

    const bundleRoleMembershipIds = new Set<string>();
    for await (const bundle of bundles) {
      // A grant can't carry a time limit, so a temporary assignment isn't restored: as a grant it would never end. That
      // holds for a group's too: its grant would count as long as any role the group holds, which can outlast the limit.
      const holders = roleUsesBundle(bundle.grantRolePermissions, bundle.id)
        ? ((await knex(TableName.MembershipRole)
            .join(TableName.Membership, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
            .where(`${TableName.MembershipRole}.customRoleId`, bundle.grantRoleId)
            .where(`${TableName.MembershipRole}.isTemporary`, false)
            .distinct(
              `${TableName.Membership}.actorUserId`,
              `${TableName.Membership}.actorIdentityId`,
              `${TableName.Membership}.actorGroupId`
            )) as { actorUserId: string | null; actorIdentityId: string | null; actorGroupId: string | null }[])
        : [];

      for await (const holder of holders) {
        const [grant] = (await knex(TableName.Membership)
          .insert({
            scope: RESOURCE_SCOPE,
            scopeOrgId: bundle.orgId,
            scopeProjectId: bundle.projectId,
            scopeResourceType: GRANT_RESOURCE_TYPE,
            scopeResourceId: bundle.id,
            actorUserId: holder.actorUserId,
            actorIdentityId: holder.actorIdentityId,
            actorGroupId: holder.actorGroupId,
            isActive: true
          })
          .returning("id")) as { id: string }[];
        await knex(TableName.MembershipRole).insert({ membershipId: grant.id, role: "consumer" });
      }

      (
        (await knex(TableName.MembershipRole).where({ customRoleId: bundle.grantRoleId }).select("membershipId")) as {
          membershipId: string;
        }[]
      ).forEach((row) => bundleRoleMembershipIds.add(row.membershipId));
      await knex(TableName.MembershipRole).where({ customRoleId: bundle.grantRoleId }).delete();
      await knex(TableName.Role).where({ id: bundle.grantRoleId }).delete();
    }

    if (bundleRoleMembershipIds.size) {
      const roleless = (await knex(TableName.Membership)
        .whereIn("id", [...bundleRoleMembershipIds])
        .whereNotExists(
          knex(TableName.MembershipRole)
            .whereRaw(`"${TableName.MembershipRole}"."membershipId" = "${TableName.Membership}"."id"`)
            .select("id")
        )
        .select("id")) as { id: string }[];
      if (roleless.length) {
        await knex(TableName.MembershipRole).insert(
          roleless.map((membership) => ({ membershipId: membership.id, role: ProjectMembershipRole.Member }))
        );
      }
    }

    await knex.schema.alterTable(TableName.AgentVaultAccessBundle, (t) => {
      t.dropForeign(["grantRoleId"]);
      t.dropColumn("grantRoleId");
    });
  }

  const agentVaultProjectIds = (
    (await knex(TableName.Project).where({ type: ProjectType.AgentVault }).select("id")) as { id: string }[]
  ).map((project) => project.id);
  const memberRoles = (await knex(TableName.Role)
    .whereIn("id", agentVaultProjectIds.map(memberRoleIdOf))
    .select("id")) as { id: string }[];
  if (!memberRoles.length) return;
  const roleIds = memberRoles.map((role) => role.id);
  await knex(TableName.MembershipRole)
    .whereIn("customRoleId", roleIds)
    .update({ role: ProjectMembershipRole.Member, customRoleId: null });
  await knex(TableName.Role).whereIn("id", roleIds).delete();
}
