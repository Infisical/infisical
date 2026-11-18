import {
  OrgPermissionMemberActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import {
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";

import { useOrgId, useOrgPermission, useProjectPermission } from "../../access/permissions";
import { useV4Adapter } from "../../data/adapters";
import { type TMemberEmails, toMemberEmails } from "./alert-model";

export const useAlertMembers = (projectId?: string): TMemberEmails => {
  const orgId = useOrgId();
  const { permission } = useOrgPermission();
  const canReadMembers = permission.can(
    OrgPermissionMemberActions.Read,
    OrgPermissionSubjects.Member
  );
  const orgUsers = useV4Adapter("certManagerSettings").useAlertOrgUsers(orgId, {
    enabled: canReadMembers
  });
  const { permission: projectPermission } = useProjectPermission(projectId ?? "");
  const canReadProjectMembers =
    !projectId ||
    projectPermission.can(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member);
  const projectUsers = useV4Adapter("access").useProjectUsers(projectId ?? "", true, undefined, {
    enabled: Boolean(projectId) && canReadProjectMembers
  });
  const projectUserIds = new Set(projectUsers.data?.map((membership) => membership.user.id));
  const recipients = projectId
    ? projectUsers.data &&
      orgUsers.data?.filter((membership) => projectUserIds.has(membership.user.id))
    : orgUsers.data;
  let unavailableReason: string | undefined;
  if (!projectId && !canReadMembers)
    unavailableReason = "You need permission to read organization members to choose recipients.";
  else if (!canReadMembers || !canReadProjectMembers)
    unavailableReason =
      "You need permission to read organization and project members to choose recipients.";
  else if (orgUsers.error || projectUsers.error)
    unavailableReason = `Couldn't load ${projectId ? "project" : "organization"} members. Close the editor and try again.`;
  return { ...toMemberEmails(recipients), unavailableReason };
};
