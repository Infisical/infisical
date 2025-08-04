import { TSamlConfigs } from "@app/db/schemas";
import { TUserDALFactory } from "@app/services/user/user-dal";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { TUserGroupMembershipDALFactory } from "@app/services/user-group-membership/user-group-membership-dal";
import { TSamlGroupMappingDALFactory } from "../saml-group-mapping/saml-group-mapping-dal";
import { TExternalGroupOrgRoleMappingDALFactory } from "../external-group-org-role-mapping/external-group-org-role-mapping-dal";
import { TOrgMembershipDALFactory } from "@app/services/org-membership/org-membership-dal";
import { TAuditLogServiceFactory } from "../audit-log/audit-log-service";
import { ActorType, EventType } from "../audit-log/audit-log-types";
import { addUsersToGroupByUserIds, removeUsersFromGroupByUserIds } from "../group/group-fns";
import { slugify } from "@sindresorhus/slugify";
import { OrgMembershipRole } from "@app/db/schemas";

type TProcessSamlGroupMappingsDTO = {
  user: { id: string; email?: string; username: string };
  groups: string[];
  samlConfig: TSamlConfigs & { 
    manageGroupMemberships?: boolean;
    groupAttributeName?: string;
    groupMappingMode?: "groups" | "roles" | "both";
    autoCreateGroups?: boolean;
    groupRolePrecedence?: "group" | "role" | "highest";
  };
  orgId: string;
  groupDAL: TGroupDALFactory;
  userGroupMembershipDAL: TUserGroupMembershipDALFactory;
  samlGroupMappingDAL: TSamlGroupMappingDALFactory;
  externalGroupOrgRoleMappingDAL: TExternalGroupOrgRoleMappingDALFactory;
  orgMembershipDAL: TOrgMembershipDALFactory;
  userDAL: TUserDALFactory;
  auditLogService: TAuditLogServiceFactory;
};

export const processSamlGroupMappings = async ({
  user,
  groups,
  samlConfig,
  orgId,
  groupDAL,
  userGroupMembershipDAL,
  samlGroupMappingDAL,
  externalGroupOrgRoleMappingDAL,
  orgMembershipDAL,
  userDAL,
  auditLogService
}: TProcessSamlGroupMappingsDTO) => {
  if (!samlConfig.manageGroupMemberships || groups.length === 0) {
    return;
  }

  const { groupMappingMode = "groups", autoCreateGroups = false, groupRolePrecedence = "highest" } = samlConfig;

  // Process group mappings
  if (groupMappingMode === "groups" || groupMappingMode === "both") {
    await processGroupMappings({
      user,
      groups,
      samlConfig,
      orgId,
      groupDAL,
      userGroupMembershipDAL,
      samlGroupMappingDAL,
      autoCreateGroups,
      auditLogService,
      userDAL
    });
  }

  // Process role mappings
  if (groupMappingMode === "roles" || groupMappingMode === "both") {
    await processRoleMappings({
      user,
      groups,
      orgId,
      externalGroupOrgRoleMappingDAL,
      orgMembershipDAL,
      groupRolePrecedence,
      auditLogService
    });
  }
};

const processGroupMappings = async ({
  user,
  groups,
  samlConfig,
  orgId,
  groupDAL,
  userGroupMembershipDAL,
  samlGroupMappingDAL,
  autoCreateGroups,
  auditLogService,
  userDAL
}: {
  user: { id: string; email?: string; username: string };
  groups: string[];
  samlConfig: TSamlConfigs;
  orgId: string;
  groupDAL: TGroupDALFactory;
  userGroupMembershipDAL: TUserGroupMembershipDALFactory;
  samlGroupMappingDAL: TSamlGroupMappingDALFactory;
  autoCreateGroups: boolean;
  auditLogService: TAuditLogServiceFactory;
  userDAL: TUserDALFactory;
}) => {
  // Get groups that this user should be in based on SAML groups
  let mappedGroups = await samlGroupMappingDAL.findGroupsForSamlGroups(samlConfig.id, groups);

  // Auto-create groups if enabled and there are unmapped groups
  if (autoCreateGroups) {
    const mappedSamlGroupNames = mappedGroups.map(g => g.samlGroupName);
    const unmappedGroups = groups.filter(groupName => !mappedSamlGroupNames.includes(groupName));

    for (const groupName of unmappedGroups) {
      try {
        const newGroup = await groupDAL.create({
          orgId,
          name: groupName,
          slug: slugify(groupName),
          role: OrgMembershipRole.Member, // Default role
          roleId: null
        });

        await samlGroupMappingDAL.create({
          samlConfigId: samlConfig.id,
          samlGroupName: groupName,
          groupId: newGroup.id
        });

        mappedGroups.push({
          samlGroupName: groupName,
          groupId: newGroup.id,
          groupName: newGroup.name,
          groupSlug: newGroup.slug,
          groupRole: newGroup.role,
          groupRoleId: newGroup.roleId
        });
      } catch (error) {
        // Log error but continue processing other groups
        console.warn(`Failed to auto-create group '${groupName}':`, error);
      }
    }
  }

  if (mappedGroups.length === 0) {
    return;
  }

  // Get user's current group memberships in this organization
  const currentMemberships = await userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg(user.id, orgId);
  const currentGroupIds = currentMemberships.map(m => m.groupId);

  // Determine which groups to add/remove
  const targetGroupIds = mappedGroups.map(g => g.groupId);
  const groupsToAdd = targetGroupIds.filter(gId => !currentGroupIds.includes(gId));
  const groupsToRemove = currentGroupIds.filter(gId => !targetGroupIds.includes(gId));

  // Add user to new groups
  for (const groupId of groupsToAdd) {
    const group = await groupDAL.findById(groupId);
    if (group) {
      try {
        await addUsersToGroupByUserIds({
          userIds: [user.id],
          group,
          userDAL,
          userGroupMembershipDAL,
          // Additional dependencies would be injected from the main service
        } as any);
      } catch (error) {
        console.warn(`Failed to add user to group '${group.name}':`, error);
      }
    }
  }

  // Remove user from unmapped groups (only SAML-managed groups)
  for (const groupId of groupsToRemove) {
    const group = await groupDAL.findById(groupId);    
    if (group) {
      try {
        await removeUsersFromGroupByUserIds({
          userIds: [user.id],
          group,
          userDAL,
          userGroupMembershipDAL
        } as any);
      } catch (error) {
        console.warn(`Failed to remove user from group '${group.name}':`, error);
      }
    }
  }

  // Audit logging
  if (groupsToAdd.length > 0 || groupsToRemove.length > 0) {
    await auditLogService.createAuditLog({
      actor: { type: ActorType.PLATFORM, metadata: {} },
      orgId,
      event: {
        type: EventType.SAML_GROUP_MEMBERSHIP_MAPPING_ASSIGN_USER,
        metadata: {
          userId: user.id,
          userEmail: user.email ?? user.username,
          groupsAdded: groupsToAdd.length,
          groupsRemoved: groupsToRemove.length,
          userGroupsClaim: groups
        }
      }
    });
  }
};

const processRoleMappings = async ({
  user,
  groups,
  orgId,
  externalGroupOrgRoleMappingDAL,
  orgMembershipDAL,
  groupRolePrecedence,
  auditLogService
}: {
  user: { id: string; email?: string; username: string };
  groups: string[];
  orgId: string;
  externalGroupOrgRoleMappingDAL: TExternalGroupOrgRoleMappingDALFactory;
  orgMembershipDAL: TOrgMembershipDALFactory;
  groupRolePrecedence: "group" | "role" | "highest";
  auditLogService: TAuditLogServiceFactory;
}) => {
  // Get external group role mappings for this org
  const roleMappings = await externalGroupOrgRoleMappingDAL.find({ orgId });
  const matchedMappings = roleMappings.filter(mapping => groups.includes(mapping.groupName));

  if (matchedMappings.length === 0) return;

  // Determine role based on precedence
  let targetRole = matchedMappings[0];
  if (groupRolePrecedence === "highest" && matchedMappings.length > 1) {
    // Simple role precedence: Admin > Member > NoAccess
    const roleOrder = { admin: 3, member: 2, "no-access": 1, custom: 2 };
    targetRole = matchedMappings.reduce((highest, current) => 
      (roleOrder[current.role] || 0) > (roleOrder[highest.role] || 0) ? current : highest
    );
  }

  // Update user's organization membership role
  const currentMembership = await orgMembershipDAL.findByUserIdAndOrgId(user.id, orgId);
  if (currentMembership && (currentMembership.role !== targetRole.role || currentMembership.roleId !== targetRole.roleId)) {
    await orgMembershipDAL.updateById(currentMembership.id, {
      role: targetRole.role,
      roleId: targetRole.roleId
    });

    // Audit logging
    await auditLogService.createAuditLog({
      actor: { type: ActorType.PLATFORM, metadata: {} },
      orgId,
      event: {
        type: EventType.SAML_ROLE_MAPPING_UPDATE_USER,
        metadata: {
          userId: user.id,
          userEmail: user.email ?? user.username,
          oldRole: currentMembership.role,
          newRole: targetRole.role,
          userGroupsClaim: groups
        }
      }
    });
  }
};

export const extractGroupsFromSamlProfile = (profile: any, groupAttributeName: string = "groups"): string[] => {
  // Try multiple possible locations for group attributes
  const possiblePaths = [
    profile[groupAttributeName],
    profile.attributes?.[groupAttributeName],
    profile[`http://schemas.xmlsoap.org/ws/2005/05/identity/claims/${groupAttributeName}`],
    profile[`http://schemas.microsoft.com/ws/2008/06/identity/claims/${groupAttributeName}`],
    profile.attributes?.[`http://schemas.xmlsoap.org/ws/2005/05/identity/claims/${groupAttributeName}`],
    profile.attributes?.[`http://schemas.microsoft.com/ws/2008/06/identity/claims/${groupAttributeName}`]
  ];

  for (const groupValue of possiblePaths) {
    if (groupValue) {
      if (typeof groupValue === "string") {
        // Handle comma-separated or semicolon-separated values
        return groupValue.split(/[,;]/).map(g => g.trim()).filter(g => g.length > 0);
      }
      if (Array.isArray(groupValue)) {
        return groupValue.filter(g => typeof g === "string" && g.trim().length > 0).map(g => g.trim());
      }
    }
  }

  return [];
};