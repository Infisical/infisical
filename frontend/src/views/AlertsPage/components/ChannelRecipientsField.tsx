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
  value,
  onChange,
  isError
}: SelectProps & { options: RecipientOption[] }) => {
  const byKey = new Map(options.map((o) => [`${o.principalType}-${o.principalId}`, o]));
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
      onChange={(newValue) =>
        onChange(
          (newValue as RecipientOption[]).map((option) => ({
            principalType: option.principalType,
            principalId: option.principalId
          }))
        )
      }
    />
  );
};

const OrgRecipientSelect = ({ orgId, ...props }: SelectProps & { orgId: string }) => {
  const { data: users = [] } = useGetOrgUsers(orgId);
  const { data: groups = [] } = useGetOrganizationGroups(orgId);

  const options: RecipientOption[] = [
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

  return <RecipientSelect options={options} {...props} />;
};

const ProjectRecipientSelect = ({ projectId, ...props }: SelectProps & { projectId: string }) => {
  const { data: users = [] } = useGetWorkspaceUsers(projectId);
  const { data: groups = [] } = useListWorkspaceGroups(projectId);

  const options: RecipientOption[] = [
    ...users.map((membership) => ({
      principalType: AlertPrincipalType.User,
      principalId: membership.user.id,
      label: userLabel(membership.user),
      groupLabel: "Users" as const
    })),
    ...groups.map((membership) => ({
      principalType: AlertPrincipalType.Group,
      principalId: membership.group.id,
      label: membership.group.name,
      groupLabel: "Groups" as const
    }))
  ];

  return <RecipientSelect options={options} {...props} />;
};

type Props = SelectProps & { projectId?: string };

export const ChannelRecipientsField = ({ projectId, ...props }: Props) => {
  const { currentOrg } = useOrganization();

  return projectId ? (
    <ProjectRecipientSelect projectId={projectId} {...props} />
  ) : (
    <OrgRecipientSelect orgId={currentOrg.id} {...props} />
  );
};
