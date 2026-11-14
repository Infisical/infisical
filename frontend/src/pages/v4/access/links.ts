import { OrgAccessControlTabSections } from "@app/types/org";
import { ProjectAccessControlTabs } from "@app/types/project";

import { orgHref } from "../links";
import { productOf, projectBase } from "../shell/navigation";
import { ORG_SCOPED_ACCESS_PRODUCTS, type ProjectScope } from "./project/scope";

const org = (orgId: string) => orgHref(orgId);
const project = ({ orgId, projectId, projectType }: ProjectScope) =>
  ORG_SCOPED_ACCESS_PRODUCTS.has(projectType)
    ? `${org(orgId)}/${productOf(projectType).slug}`
    : `${org(orgId)}${projectBase(projectType, projectId)}`;

export const accessLinks = {
  org: (orgId: string, tab: OrgAccessControlTabSections = OrgAccessControlTabSections.Member) =>
    `${org(orgId)}/access-management?selectedTab=${tab}`,
  orgMember: (orgId: string, membershipId: string) => `${org(orgId)}/members/${membershipId}`,
  orgIdentity: (orgId: string, identityId: string) => `${org(orgId)}/identities/${identityId}`,
  orgGroup: (orgId: string, groupId: string) => `${org(orgId)}/groups/${groupId}`,
  orgRole: (orgId: string, roleId: string) => `${org(orgId)}/roles/${roleId}`,
  project: (scope: ProjectScope, tab: ProjectAccessControlTabs = ProjectAccessControlTabs.Member) =>
    `${project(scope)}/access-management?selectedTab=${tab}`,
  projectMember: (scope: ProjectScope, membershipId: string) =>
    `${project(scope)}/members/${membershipId}`,
  projectIdentity: (scope: ProjectScope, identityId: string) =>
    `${project(scope)}/identities/${identityId}`,
  projectGroup: (scope: ProjectScope, groupId: string) => `${project(scope)}/groups/${groupId}`,
  projectRole: (scope: ProjectScope, roleSlug: string) =>
    `${project(scope)}/roles/${encodeURIComponent(roleSlug)}`
};
