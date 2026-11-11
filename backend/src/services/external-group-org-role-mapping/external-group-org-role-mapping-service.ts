import { OrganizationActionScope, OrgMembershipRole } from "@app/db/schemas";
import { TActorContext } from "@app/domains/lib/actor-context";
import { assertRoleSetBoundary } from "@app/domains/platform/access-control/ce/module";
import { TLicenseDomain } from "@app/domains/platform/license/ce/module";
import {
  OrgPermissionActions,
  OrgPermissionMemberActions,
  OrgPermissionSubjects,
  TOrganizationsDomain
} from "@app/domains/platform/organizations/ce/module";
import { BadRequestError } from "@app/lib/errors";
import { constructGroupOrgMembershipRoleMappings } from "@app/services/external-group-org-role-mapping/external-group-org-role-mapping-fns";
import { TSyncExternalGroupOrgMembershipRoleMappingsDTO } from "@app/services/external-group-org-role-mapping/external-group-org-role-mapping-types";
import { roleNeedsPrivilegeBoundary } from "@app/services/membership/membership-fns";

import { TRoleDALFactory } from "../role/role-dal";
import { TExternalGroupOrgRoleMappingDALFactory } from "./external-group-org-role-mapping-dal";

type TExternalGroupOrgRoleMappingServiceFactoryDep = {
  externalGroupOrgRoleMappingDAL: TExternalGroupOrgRoleMappingDALFactory;
  organizationsDomain: Pick<TOrganizationsDomain, "getOrgPermission" | "getOrgPermissionByRoles">;
  licenseDomain: TLicenseDomain;
  roleDAL: TRoleDALFactory;
};

export type TExternalGroupOrgRoleMappingServiceFactory = ReturnType<typeof externalGroupOrgRoleMappingServiceFactory>;

export const externalGroupOrgRoleMappingServiceFactory = ({
  externalGroupOrgRoleMappingDAL,
  licenseDomain,
  organizationsDomain,
  roleDAL
}: TExternalGroupOrgRoleMappingServiceFactoryDep) => {
  const listExternalGroupOrgRoleMappings = async (actor: TActorContext) => {
    const permission = await organizationsDomain.getOrgPermission({
      actor,
      scope: OrganizationActionScope.ParentOrganization
    });

    // TODO: will need to change if we add support for ldap, oidc, etc.
    permission.assert({ action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Scim });

    const mappings = await externalGroupOrgRoleMappingDAL.find({
      orgId: actor.org.id
    });

    return mappings;
  };

  const updateExternalGroupOrgRoleMappings = async (
    dto: TSyncExternalGroupOrgMembershipRoleMappingsDTO,
    actor: TActorContext
  ) => {
    const permission = await organizationsDomain.getOrgPermission({
      actor,
      scope: OrganizationActionScope.ParentOrganization
    });

    // TODO: will need to change if we add support for ldap, oidc, etc.
    permission.assert({ action: OrgPermissionActions.Edit, subject: OrgPermissionSubjects.Scim });

    const seenGroupNames = new Set<string>();
    for (const { groupName } of dto.mappings) {
      if (seenGroupNames.has(groupName))
        throw new BadRequestError({
          message: `Group '${groupName}' is mapped more than once. Map each group to a single organization role.`
        });
      seenGroupNames.add(groupName);
    }

    const mappings = await constructGroupOrgMembershipRoleMappings({
      mappingsDTO: dto.mappings,
      roleDAL,
      licenseDomain,
      orgId: actor.org.id
    });

    const { shouldUseNewPrivilegeSystem } = actor.org;

    const currentMappings = await externalGroupOrgRoleMappingDAL.find(
      { orgId: actor.org.id },
      { tx: externalGroupOrgRoleMappingDAL.primaryNode() }
    );
    const currentByGroupName = new Map(currentMappings.map((mapping) => [mapping.groupName, mapping]));
    const nextByGroupName = new Map(mappings.map((mapping) => [mapping.groupName, mapping]));

    const isSameRole = (a: { role: string; roleId?: string | null }, b: { role: string; roleId?: string | null }) =>
      a.role === b.role && (a.roleId ?? null) === (b.roleId ?? null);

    const grantedMappings = dto.mappings.filter(({ groupName, roleSlug }, index) => {
      const current = currentByGroupName.get(groupName);
      return roleNeedsPrivilegeBoundary(roleSlug) && (!current || !isSameRole(current, mappings[index]));
    });

    const replacedMappings = currentMappings.filter((current) => {
      const next = nextByGroupName.get(current.groupName);
      return current.role !== OrgMembershipRole.NoAccess && (!next || !isSameRole(current, next));
    });

    const replacedCustomRoleIds = replacedMappings.flatMap(({ roleId }) => (roleId ? [roleId] : []));
    const replacedCustomRoleSlugById = new Map(
      replacedCustomRoleIds.length
        ? (await roleDAL.find({ orgId: actor.org.id, $in: { id: replacedCustomRoleIds } })).map((role) => [
            role.id,
            role.slug
          ])
        : []
    );

    const boundaryChecks = [
      ...replacedMappings.flatMap((mapping) => {
        // a mapping whose custom role no longer resolves grants nothing, so there is no boundary to hold
        const roleSlug =
          mapping.role === OrgMembershipRole.Custom
            ? mapping.roleId && replacedCustomRoleSlugById.get(mapping.roleId)
            : mapping.role;
        return roleSlug
          ? [
              {
                roleSlug,
                baseMessage: `Failed to change the role mapping for group '${mapping.groupName}', which maps to role '${roleSlug}'`
              }
            ]
          : [];
      }),
      ...grantedMappings.map(({ groupName, roleSlug }) => ({
        roleSlug,
        baseMessage: `Failed to map group '${groupName}' to role '${roleSlug}'`
      }))
    ];

    if (boundaryChecks.length) {
      const roleSlugsToCheck = [...new Set(boundaryChecks.map(({ roleSlug }) => roleSlug))];
      const rolePermissions = await organizationsDomain.getOrgPermissionByRoles({
        orgId: actor.org.id,
        roles: roleSlugsToCheck
      });

      for (const { roleSlug, baseMessage } of boundaryChecks) {
        assertRoleSetBoundary({
          shouldUseNewPrivilegeSystem,
          opActions: OrgPermissionMemberActions.GrantPrivileges,
          opSubject: OrgPermissionSubjects.Member,
          actorPermission: permission.toAbility(),
          targetPermissions: [rolePermissions[roleSlugsToCheck.indexOf(roleSlug)]].map((target) => ({
            permission: target.permission.toAbility(),
            role: target.role
          })),
          baseMessage
        });
      }
    }

    const data = await externalGroupOrgRoleMappingDAL.updateExternalGroupOrgRoleMappingForOrg(
      actor.org.id,
      mappings,
      currentMappings
    );

    return data;
  };

  return {
    updateExternalGroupOrgRoleMappings,
    listExternalGroupOrgRoleMappings
  };
};
