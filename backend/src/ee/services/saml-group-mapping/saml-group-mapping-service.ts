import { ForbiddenError } from "@casl/ability";

import { ActorType, EventType } from "@app/ee/services/audit-log/audit-log-types";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";

import { TSamlGroupMappingDALFactory } from "./saml-group-mapping-dal";
import { TSamlGroupMappingServiceFactory } from "./saml-group-mapping-types";

type TSamlGroupMappingServiceFactoryDep = {
  samlGroupMappingDAL: TSamlGroupMappingDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

export const samlGroupMappingServiceFactory = ({
  samlGroupMappingDAL,
  permissionService
}: TSamlGroupMappingServiceFactoryDep): TSamlGroupMappingServiceFactory => {
  const getSamlGroupMappings = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    samlConfigId
  }: TSamlGroupMappingServiceFactory["getSamlGroupMappings"]) => {
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod
    );
    
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Sso
    );

    const mappings = await samlGroupMappingDAL.findBySamlConfigId(samlConfigId);
    return mappings;
  };

  const updateSamlGroupMappings = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    samlConfigId,
    mappings
  }: TSamlGroupMappingServiceFactory["updateSamlGroupMappings"]) => {
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod
    );
    
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      ProjectPermissionSub.Sso
    );

    // Validate mappings
    if (mappings.some(m => !m.samlGroupName?.trim())) {
      throw new BadRequestError({
        message: "All SAML group names must be provided and non-empty"
      });
    }

    // Check for duplicate SAML group names
    const groupNameCounts = groupBy(mappings, "samlGroupName");
    const duplicates = Object.keys(groupNameCounts).filter(name => groupNameCounts[name].length > 1);
    if (duplicates.length > 0) {
      throw new BadRequestError({
        message: `Duplicate SAML group names found: ${duplicates.join(", ")}`
      });
    }

    const updatedMappings = await samlGroupMappingDAL.upsertMappings(samlConfigId, mappings);
    
    return { mappings: updatedMappings };
  };

  return {
    getSamlGroupMappings,
    updateSamlGroupMappings
  };
};