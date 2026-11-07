import { useNavigate, useSearch } from "@tanstack/react-router";

import { Stack } from "@app/components/v4/ui/layout";
import { Loader } from "@app/components/v4/ui/loader";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Tabs } from "@app/components/v4/ui/tabs";
import {
  OrgPermissionActions,
  OrgPermissionGroupActions,
  OrgPermissionIdentityActions,
  OrgPermissionMemberActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { OrgAccessControlTabSections } from "@app/types/org";

import { AccessFrame } from "../../access/AccessFrame";
import { OrgGroupsTab } from "../../access/org/groups";
import { OrgIdentitiesTab } from "../../access/org/identities";
import { OrgMembersTab } from "../../access/org/members";
import { OrgRolesTab } from "../../access/org/roles";
import { useOrgPermission } from "../../access/permissions";
import { AccessRestricted } from "../../access/ui";

const tabs = [
  {
    value: OrgAccessControlTabSections.Member,
    label: "Users",
    requirement: "read Member",
    Body: OrgMembersTab
  },
  {
    value: OrgAccessControlTabSections.Identities,
    label: "Machine identities",
    requirement: "read Identity",
    Body: OrgIdentitiesTab
  },
  {
    value: OrgAccessControlTabSections.Groups,
    label: "Groups",
    requirement: "read Groups",
    Body: OrgGroupsTab
  },
  {
    value: OrgAccessControlTabSections.Roles,
    label: "Roles",
    requirement: "read Role",
    Body: OrgRolesTab
  }
];

export const AccessManagementPage = () => {
  const navigate = useNavigate({ from: "/v4/organizations/$orgId/access-management" });
  const { selectedTab } = useSearch({ from: "/v4/organizations/$orgId/access-management" });
  const { permission, isPending } = useOrgPermission();
  const readable: Record<string, boolean> = {
    [OrgAccessControlTabSections.Member]: permission.can(
      OrgPermissionMemberActions.Read,
      OrgPermissionSubjects.Member
    ),
    [OrgAccessControlTabSections.Identities]: permission.can(
      OrgPermissionIdentityActions.Read,
      OrgPermissionSubjects.Identity
    ),
    [OrgAccessControlTabSections.Groups]: permission.can(
      OrgPermissionGroupActions.Read,
      OrgPermissionSubjects.Groups
    ),
    [OrgAccessControlTabSections.Roles]: permission.can(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.Role
    )
  };
  if (isPending) return <Loader size="page" label="Loading access control" />;
  const allowed = tabs.filter((tab) => readable[tab.value]);
  const active = tabs.find((tab) => tab.value === selectedTab) ?? tabs[0];
  return (
    <AccessFrame>
      <Stack gap={24}>
        <PageHeader
          title="Organization access control"
          description="Control who can access this organization and what they can do."
          tabs={
            allowed.length > 0 && (
              <Tabs
                label="Organization access control sections"
                value={active.value}
                onChange={(value) => navigate({ search: { selectedTab: value } })}
                tabs={tabs.map((tab) => ({
                  value: tab.value,
                  label: tab.label,
                  disabled: !readable[tab.value]
                }))}
              />
            )
          }
        />
        {allowed.length && readable[active.value] ? (
          <active.Body />
        ) : (
          <AccessRestricted requirement={allowed.length ? active.requirement : undefined} />
        )}
      </Stack>
    </AccessFrame>
  );
};
