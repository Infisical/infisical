import { ForbiddenError } from "@casl/ability";

import { OrganizationActionScope, OrgMembershipRole } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import {
  OrgPermissionActions,
  OrgPermissionMemberActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { assertRoleSetBoundary } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError } from "@app/lib/errors";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { OrgServiceActor } from "@app/lib/types";
import { constructGroupOrgMembershipRoleMappings } from "@app/services/external-group-org-role-mapping/external-group-org-role-mapping-fns";
import { TSyncExternalGroupOrgMembershipRoleMappingsDTO } from "@app/services/external-group-org-role-mapping/external-group-org-role-mapping-types";
import { roleNeedsPrivilegeBoundary } from "@app/services/membership/membership-fns";

import { TOrgDALFactory } from "../org/org-dal";
import { TRoleDALFactory } from "../role/role-dal";
import { TExternalGroupOrgRoleMappingDALFactory } from "./external-group-org-role-mapping-dal";

type TExternalGroupOrgRoleMappingServiceFactoryDep = {
  externalGroupOrgRoleMappingDAL: TExternalGroupOrgRoleMappingDALFactory;
  permissionService: TPermissionServiceFactory;
  licenseService: TLicenseServiceFactory;
  roleDAL: TRoleDALFactory;
  orgDAL: Pick<TOrgDALFactory, "findById">;
};

export type TExternalGroupOrgRoleMappingServiceFactory = ReturnType<typeof externalGroupOrgRoleMappingServiceFactory>;

export const externalGroupOrgRoleMappingServiceFactory = ({
  externalGroupOrgRoleMappingDAL,
  licenseService,
  permissionService,
  roleDAL,
  orgDAL
}: TExternalGroupOrgRoleMappingServiceFactoryDep) => {
  const listExternalGroupOrgRoleMappings = async (actor: OrgServiceActor) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.ParentOrganization
    });

    // TODO: will need to change if we add support for ldap, oidc, etc.
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Scim);

    const mappings = await externalGroupOrgRoleMappingDAL.find({
      orgId: actor.orgId
    });

    return mappings;
  };

  const updateExternalGroupOrgRoleMappings = async (
    dto: TSyncExternalGroupOrgMembershipRoleMappingsDTO,
    actor: OrgServiceActor
  ) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.ParentOrganization
    });

    // TODO: will need to change if we add support for ldap, oidc, etc.
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Scim);

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
      licenseService,
      orgId: actor.orgId
    });

    const { shouldUseNewPrivilegeSystem } = await requestMemoize(requestMemoKeys.orgFindById(actor.orgId), () =>
      orgDAL.findById(actor.orgId)
    );

    const currentMappings = await externalGroupOrgRoleMappingDAL.find({ orgId: actor.orgId });
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
        ? (await roleDAL.find({ orgId: actor.orgId, $in: { id: replacedCustomRoleIds } })).map((role) => [
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
      const rolePermissions = await permissionService.getOrgPermissionByRoles(roleSlugsToCheck, actor.orgId);

      for (const { roleSlug, baseMessage } of boundaryChecks) {
        assertRoleSetBoundary({
          shouldUseNewPrivilegeSystem,
          opActions: OrgPermissionMemberActions.GrantPrivileges,
          opSubject: OrgPermissionSubjects.Member,
          actorPermission: permission,
          targetPermissions: [rolePermissions[roleSlugsToCheck.indexOf(roleSlug)]],
          baseMessage
        });
      }
    }

    const data = await externalGroupOrgRoleMappingDAL.updateExternalGroupOrgRoleMappingForOrg(actor.orgId, mappings);

    return data;
  };

  return {
    updateExternalGroupOrgRoleMappings,
    listExternalGroupOrgRoleMappings
  };
};
