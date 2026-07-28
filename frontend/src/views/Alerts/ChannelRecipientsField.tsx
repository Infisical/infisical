import { useEffect, useRef, useState } from "react";
import { UserIcon, UsersIcon } from "lucide-react";

import { FilterableSelect } from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  useGetOrganizationGroups,
  useGetOrgUsers,
  useGetWorkspaceUsers,
  useListWorkspaceGroups
} from "@app/hooks/api";
import { AlertPrincipalType, TAlertChannelRecipient } from "@app/hooks/api/alerts";

type RecipientOption = {
  principalType: AlertPrincipalType;
  principalId: string;
  label: string;
  groupLabel: "Users" | "Groups";
};

const userLabel = (user: {
  firstName?: string;
  lastName?: string;
  username?: string;
  email?: string;
}): string => {
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return user.email || user.username || name || "Unknown user";
};

const buildOptions = (
  users: { user: { id: string; firstName?: string; lastName?: string; username?: string } }[],
  groups: { id: string; name: string }[]
): RecipientOption[] => [
  ...users.map((membership) => ({
    principalType: AlertPrincipalType.User,
    principalId: membership.user.id,
    label: userLabel(membership.user),
    groupLabel: "Users" as const
  })),
  ...groups.map((group) => ({
    principalType: AlertPrincipalType.Group,
    principalId: group.id,
    label: group.name,
    groupLabel: "Groups" as const
  }))
];

const formatOptionLabel = (option: RecipientOption) => (
  <span className="flex items-center gap-2">
    {option.principalType === AlertPrincipalType.Group ? (
      <UsersIcon className="size-3.5 text-muted" />
    ) : (
      <UserIcon className="size-3.5 text-muted" />
    )}
    {option.label}
  </span>
);

type SelectProps = {
  value: TAlertChannelRecipient[];
  onChange: (recipients: TAlertChannelRecipient[]) => void;
  isError?: boolean;
};

const RecipientSelect = ({
  options,
  labelledOptions,
  value,
  onChange,
  isError
}: SelectProps & { options: RecipientOption[]; labelledOptions?: RecipientOption[] }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [menuPortalTarget, setMenuPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setMenuPortalTarget(containerRef.current?.closest<HTMLElement>('[role="dialog"]') ?? null);
  }, []);

  const byKey = new Map(
    (labelledOptions ?? options).map((o) => [`${o.principalType}-${o.principalId}`, o])
  );
  const selected = value.map(
    (recipient): RecipientOption =>
      byKey.get(`${recipient.principalType}-${recipient.principalId}`) ?? {
        principalType: recipient.principalType,
        principalId: recipient.principalId,
        label: recipient.principalId,
        groupLabel: recipient.principalType === AlertPrincipalType.Group ? "Groups" : "Users"
      }
  );

  return (
    <div ref={containerRef}>
      <FilterableSelect<RecipientOption>
        isMulti
        placeholder="Select users or groups..."
        options={options}
        value={selected}
        isError={isError}
        groupBy="groupLabel"
        getGroupHeaderLabel={(groupValue) => groupValue}
        getOptionValue={(option) => `${option.principalType}-${option.principalId}`}
        getOptionLabel={(option) => option.label}
        formatOptionLabel={formatOptionLabel}
        menuPortalTarget={menuPortalTarget ?? undefined}
        menuPosition="fixed"
        menuPlacement="auto"
        onChange={(newValue) =>
          onChange(
            (newValue as RecipientOption[]).map((option) => ({
              principalType: option.principalType,
              principalId: option.principalId
            }))
          )
        }
      />
    </div>
  );
};

const canReceiveAlerts = (membership: { isActive: boolean; status: string }) =>
  membership.isActive && membership.status !== "invited";

const OrgRecipientSelect = ({ orgId, ...props }: SelectProps & { orgId: string }) => {
  const { data: users = [] } = useGetOrgUsers(orgId);
  const { data: groups = [] } = useGetOrganizationGroups(orgId);

  const eligibleUsers = users.filter(canReceiveAlerts);

  return (
    <RecipientSelect
      options={buildOptions(eligibleUsers, groups)}
      labelledOptions={buildOptions(users, groups)}
      {...props}
    />
  );
};

const ProjectRecipientSelect = ({
  projectId,
  orgId,
  ...props
}: SelectProps & { projectId: string; orgId: string }) => {
  const { data: users = [] } = useGetWorkspaceUsers(projectId);
  const { data: orgUsers = [] } = useGetOrgUsers(orgId);
  const { data: groups = [] } = useListWorkspaceGroups(projectId);

  const blockedUserIds = new Set(
    orgUsers
      .filter((membership) => !canReceiveAlerts(membership))
      .map((membership) => membership.user.id)
  );
  const eligibleUsers = users.filter(
    (membership) => membership.user.isOrgMembershipActive && !blockedUserIds.has(membership.user.id)
  );

  const groupOptions = groups.map((membership) => membership.group);

  return (
    <RecipientSelect
      options={buildOptions(eligibleUsers, groupOptions)}
      labelledOptions={buildOptions(users, groupOptions)}
      {...props}
    />
  );
};

type Props = SelectProps & { projectId?: string };

export const ChannelRecipientsField = ({ projectId, ...props }: Props) => {
  const { currentOrg } = useOrganization();

  return projectId ? (
    <ProjectRecipientSelect projectId={projectId} orgId={currentOrg.id} {...props} />
  ) : (
    <OrgRecipientSelect orgId={currentOrg.id} {...props} />
  );
};
