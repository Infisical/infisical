import { AccessScope, ActionProjectType, ProjectMembershipRole } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { AgentVaultIdentities } from "@app/services/license-client";
import { TUsageMeteringServiceFactory } from "@app/services/license-client/usage";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectAccessRequestDALFactory } from "@app/services/project/project-access-request-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";
import { TUserAliasDALFactory } from "@app/services/user-alias/user-alias-dal";
import { resolveUsersBySsoExternalId } from "@app/services/user-alias/user-alias-fns";

import { TAgentVaultActorContext } from "../agent-vault/agent-vault-actor-types";

type TAgentVaultMembershipServiceFactoryDep = {
  membershipDAL: Pick<TMembershipDALFactory, "create" | "find" | "transaction">;
  identityDAL: Pick<TIdentityDALFactory, "find">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create">;
  projectAccessRequestDAL: Pick<TProjectAccessRequestDALFactory, "delete">;
  userDAL: Pick<TUserDALFactory, "find">;
  userAliasDAL: Pick<TUserAliasDALFactory, "findBySsoExternalIds">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  usageMeteringService: Pick<TUsageMeteringServiceFactory, "emitForProject">;
};

export type TAgentVaultMembershipServiceFactory = ReturnType<typeof agentVaultMembershipServiceFactory>;

export type TListAgentVaultProductIdentitiesDTO = {
  projectId: string;
  ctx: TAgentVaultActorContext;
};

export type TAddAgentVaultProductUserMembersDTO = {
  projectId: string;
  userIds: string[];
  emails: string[];
  role: ProjectMembershipRole.Admin | ProjectMembershipRole.Member;
  ctx: TAgentVaultActorContext;
};

// Anything but admin resolves to the member set (§1.3), so these two are the only slugs worth writing.
const VALID_PRODUCT_ROLES: string[] = [ProjectMembershipRole.Admin, ProjectMembershipRole.Member];

// Mirrors PAM's product-membership service for the one path that bypasses Access Control: the signup
// invite, which grants the org's implicit Agent Vault project by email before the invitee has logged in.
export const agentVaultMembershipServiceFactory = ({
  membershipDAL,
  identityDAL,
  membershipRoleDAL,
  projectAccessRequestDAL,
  userDAL,
  userAliasDAL,
  orgDAL,
  permissionService,
  usageMeteringService
}: TAgentVaultMembershipServiceFactoryDep) => {
  const checkProductAdmin = async (projectId: string, ctx: TAgentVaultActorContext) => {
    const { hasRole } = await permissionService.getProjectPermission({
      actor: ctx.actor,
      actorId: ctx.actorId,
      projectId,
      actorAuthMethod: ctx.actorAuthMethod,
      actorOrgId: ctx.actorOrgId,
      actionProjectType: ActionProjectType.AgentVault
    });
    if (!hasRole(ProjectMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only Agent Vault admins can perform this action" });
    }
  };

  const addProductUserMembers = async ({
    projectId,
    userIds,
    emails,
    role,
    ctx
  }: TAddAgentVaultProductUserMembersDTO) => {
    await checkProductAdmin(projectId, ctx);

    if (!VALID_PRODUCT_ROLES.includes(role)) {
      throw new BadRequestError({
        message: `Invalid product role '${role}'. Expected: ${VALID_PRODUCT_ROLES.join(", ")}`
      });
    }

    const usersByEmail = emails.length ? await userDAL.find({ $in: { username: emails } }) : [];
    const userByEmail = new Map(usersByEmail.map((u) => [u.username, u]));

    // The invite this request accompanies resolves IdP identifiers through SSO aliases, so this half has
    // to as well, or it rejects a user the other half just added.
    const unmatched = emails.filter((e) => !userByEmail.has(e));
    if (unmatched.length) {
      const org = await orgDAL.findById(ctx.actorOrgId);
      const { resolved, ambiguousIdentifiers } = await resolveUsersBySsoExternalId({
        identifiers: unmatched,
        orgId: ctx.actorOrgId,
        rootOrgId: org?.rootOrgId,
        userAliasDAL,
        userDAL
      });

      if (ambiguousIdentifiers.length) {
        throw new BadRequestError({
          message: `Identifier(s) ${ambiguousIdentifiers
            .map((el) => `'${el}'`)
            .join(
              ", "
            )} match more than one SSO account in this organization. Use the user's email address instead, or contact support to resolve the duplicate.`
        });
      }

      resolved.forEach((user, identifier) => userByEmail.set(identifier, user));
    }

    const unresolved = emails.filter((e) => !userByEmail.has(e));

    const candidates: { userId: string; label: string }[] = [];
    const seen = new Set<string>();
    for (const id of userIds) {
      if (!seen.has(id)) {
        seen.add(id);
        candidates.push({ userId: id, label: id });
      }
    }
    for (const email of emails) {
      const user = userByEmail.get(email);
      if (user && !seen.has(user.id)) {
        seen.add(user.id);
        candidates.push({ userId: user.id, label: email });
      }
    }

    const existing = await membershipDAL.find({ scope: AccessScope.Project, scopeProjectId: projectId });
    const alreadyAttached = new Set(existing.map((m) => m.actorUserId).filter((v): v is string => Boolean(v)));
    const skipped: string[] = [];

    const orgMemberships = candidates.length
      ? await membershipDAL.find({
          scope: AccessScope.Organization,
          scopeOrgId: ctx.actorOrgId,
          isActive: true,
          $in: { actorUserId: candidates.map((c) => c.userId) }
        })
      : [];
    const orgMemberIds = new Set(orgMemberships.map((m) => m.actorUserId));

    const toCreate = candidates.filter((c) => {
      if (!orgMemberIds.has(c.userId)) {
        unresolved.push(c.label);
        return false;
      }
      if (alreadyAttached.has(c.userId)) {
        skipped.push(c.label);
        return false;
      }
      return true;
    });

    if (unresolved.length) {
      const rejected = unresolved.map((el) => `'${el}'`).join(", ");
      throw new BadRequestError({
        message: `Cannot add ${rejected} to Agent Vault because they are not an active member of this organization. Invite them to the organization first.`
      });
    }

    const memberships = await membershipDAL.transaction(async (tx) => {
      const results: { membershipId: string; userId: string; role: string; createdAt: Date }[] = [];
      for (const { userId } of toCreate) {
        // eslint-disable-next-line no-await-in-loop
        const membership = await membershipDAL.create(
          {
            scope: AccessScope.Project,
            scopeOrgId: ctx.actorOrgId,
            scopeProjectId: projectId,
            actorUserId: userId,
            isActive: true
          },
          tx
        );
        // eslint-disable-next-line no-await-in-loop
        const membershipRole = await membershipRoleDAL.create({ membershipId: membership.id, role }, tx);
        // eslint-disable-next-line no-await-in-loop
        await projectAccessRequestDAL.delete({ projectId, requesterUserId: userId }, tx);
        results.push({
          membershipId: membership.id,
          userId,
          role: membershipRole.role,
          createdAt: membership.createdAt
        });
      }
      return results;
    });

    if (memberships.length > 0) {
      usageMeteringService.emitForProject(projectId, AgentVaultIdentities.key);
    }

    return { memberships, skipped };
  };

  // The whole set rather than a page: the grant picker filters client-side, so a page would make
  // search unable to find an identity it never fetched. Mirrors PAM's product membership listing.
  const listProductIdentities = async ({ projectId, ctx }: TListAgentVaultProductIdentitiesDTO) => {
    await permissionService.getProjectPermission({
      actor: ctx.actor,
      actorId: ctx.actorId,
      projectId,
      actorAuthMethod: ctx.actorAuthMethod,
      actorOrgId: ctx.actorOrgId,
      actionProjectType: ActionProjectType.AgentVault
    });

    const memberships = await membershipDAL.find({ scope: AccessScope.Project, scopeProjectId: projectId });
    const identityIds = memberships.map((m) => m.actorIdentityId).filter((id): id is string => Boolean(id));
    if (!identityIds.length) return [];

    const identities = await identityDAL.find({ $in: { id: identityIds } });
    return identities
      .map((identity) => ({ id: identity.id, name: identity.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  return { addProductUserMembers, listProductIdentities };
};
