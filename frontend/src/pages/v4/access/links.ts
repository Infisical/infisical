import { OrgAccessControlTabSections } from "@app/types/org";
import { ProjectAccessControlTabs } from "@app/types/project";

const org = (orgId: string) => `/v4/organizations/${orgId}`;
const project = (orgId: string, projectId: string) =>
  `${org(orgId)}/projects/secret-management/${projectId}`;

export const accessLinks = {
  org: (orgId: string, tab: OrgAccessControlTabSections = OrgAccessControlTabSections.Member) =>
    `${org(orgId)}/access-management?selectedTab=${tab}`,
  orgMember: (orgId: string, membershipId: string) => `${org(orgId)}/members/${membershipId}`,
  orgIdentity: (orgId: string, identityId: string) => `${org(orgId)}/identities/${identityId}`,
  orgGroup: (orgId: string, groupId: string) => `${org(orgId)}/groups/${groupId}`,
  orgRole: (orgId: string, roleId: string) => `${org(orgId)}/roles/${roleId}`,
  project: (
    orgId: string,
    projectId: string,
    tab: ProjectAccessControlTabs = ProjectAccessControlTabs.Member
  ) => `${project(orgId, projectId)}/access-management?selectedTab=${tab}`,
  projectMember: (orgId: string, projectId: string, membershipId: string) =>
    `${project(orgId, projectId)}/members/${membershipId}`,
  projectIdentity: (orgId: string, projectId: string, identityId: string) =>
    `${project(orgId, projectId)}/identities/${identityId}`,
  projectGroup: (orgId: string, projectId: string, groupId: string) =>
    `${project(orgId, projectId)}/groups/${groupId}`,
  projectRole: (orgId: string, projectId: string, roleSlug: string) =>
    `${project(orgId, projectId)}/roles/${encodeURIComponent(roleSlug)}`
};
