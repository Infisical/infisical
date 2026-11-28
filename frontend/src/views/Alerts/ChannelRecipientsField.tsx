import { useState } from "react";
import { LucideIcon, MailIcon, UserIcon, UsersIcon } from "lucide-react";

import { Combobox, Skeleton } from "@app/components/v3";
import { useOrganization } from "@app/context";
import { isValidEmail } from "@app/helpers/email";
import {
  useGetOrganizationGroups,
  useGetOrgUsers,
  useGetWorkspaceUsers,
  useListWorkspaceGroups
} from "@app/hooks/api";
import {
  ALERT_PROJECT_RECIPIENT_LABELS,
  AlertPrincipalType,
  TAlertChannelRecipient
} from "@app/hooks/api/alerts";

type RecipientOption = {
  principalType: AlertPrincipalType;
  principalId: string;
  label: string;
  groupLabel: "Project" | "Users" | "Groups" | "Emails";
  isLabelLoading?: boolean;
};

const projectOptions = (projectId: string): RecipientOption[] =>
  ([AlertPrincipalType.ProjectMembers, AlertPrincipalType.ProjectAdmins] as const).map(
    (principalType) => ({
      principalType,
      principalId: projectId,
      label: ALERT_PROJECT_RECIPIENT_LABELS[principalType],
      groupLabel: "Project"
    })
  );

const userLabel = (user: { firstName?: string; lastName?: string; username?: string }): string =>
  user.username || `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "Unknown user";

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

const RECIPIENT_ICONS: Partial<Record<AlertPrincipalType, LucideIcon>> = {
  [AlertPrincipalType.User]: UserIcon,
  [AlertPrincipalType.Email]: MailIcon
};

const formatOptionLabel = (option: RecipientOption) => {
  if (option.isLabelLoading) return <Skeleton className="h-3.5 w-28" />;
  const Icon = RECIPIENT_ICONS[option.principalType] ?? UsersIcon;
  return (
    <span className="flex items-center gap-2">
      <Icon className="size-3.5 text-muted" />
      {option.label}
    </span>
  );
};

type SelectProps = {
  value: TAlertChannelRecipient[];
  onChange: (recipients: TAlertChannelRecipient[]) => void;
  isError?: boolean;
  allowEmailAddresses?: boolean;
};

const RecipientSelect = ({
  options,
  labelledOptions,
  isLoading,
  value,
  onChange,
  isError,
  allowEmailAddresses
}: SelectProps & {
  options: RecipientOption[];
  labelledOptions?: RecipientOption[];
  isLoading?: boolean;
}) => {
  const [inputValue, setInputValue] = useState("");

  const byKey = new Map(
    (labelledOptions ?? options).map((o) => [`${o.principalType}-${o.principalId}`, o])
  );
  const email = inputValue.trim().toLowerCase();
  const canAddEmail =
    allowEmailAddresses &&
    isValidEmail(email) &&
    !value.some((recipient) => recipient.principalId === email);
  const emailOption: RecipientOption = {
    principalType: AlertPrincipalType.Email,
    principalId: email,
    label: email,
    groupLabel: "Emails"
  };

  const selected = value.map((recipient): RecipientOption => {
    const known = byKey.get(`${recipient.principalType}-${recipient.principalId}`);
    if (known) return known;
    // only user/group IDs need a lookup; emails already carry their display text
    const isLabelLoading =
      isLoading &&
      (recipient.principalType === AlertPrincipalType.User ||
        recipient.principalType === AlertPrincipalType.Group);
    return {
      principalType: recipient.principalType,
      principalId: recipient.principalId,
      label: isLabelLoading ? "Loading..." : recipient.principalId,
      groupLabel: recipient.principalType === AlertPrincipalType.Group ? "Groups" : "Users",
      isLabelLoading
    };
  });

  return (
    <Combobox
      multiple
      placeholder={
        allowEmailAddresses ? "Add users, groups, or emails..." : "Add users or groups..."
      }
      searchAriaLabel="Search recipients"
      options={canAddEmail ? [...options, emailOption] : options}
      onInputValueChange={setInputValue}
      value={selected}
      includeMissingSelectedOptions={false}
      isLoading={isLoading}
      isError={isError}
      getOptionGroup={(option) => option.groupLabel}
      getOptionValue={(option) => `${option.principalType}-${option.principalId}`}
      getOptionKeywords={(option) => [`${option.principalType}-${option.principalId}`]}
      getOptionLabel={(option) => option.label}
      renderOption={formatOptionLabel}
      renderValue={formatOptionLabel}
      onValueChange={(newValue) =>
        onChange(
          newValue.map((option) => ({
            principalType: option.principalType,
            principalId: option.principalId
          }))
        )
      }
    />
  );
};

export const canReceiveAlerts = (membership: { isActive: boolean; status: string }) =>
  membership.isActive && membership.status !== "invited";

const OrgRecipientSelect = ({ orgId, ...props }: SelectProps & { orgId: string }) => {
  const { data: users = [], isLoading: isUsersLoading } = useGetOrgUsers(orgId);
  const { data: groups = [], isLoading: isGroupsLoading } = useGetOrganizationGroups(orgId);

  const eligibleUsers = users.filter(canReceiveAlerts);

  return (
    <RecipientSelect
      options={buildOptions(eligibleUsers, groups)}
      labelledOptions={buildOptions(users, groups)}
      isLoading={isUsersLoading || isGroupsLoading}
      {...props}
    />
  );
};

const ProjectRecipientSelect = ({
  projectId,
  orgId,
  allowProjectRecipients,
  ...props
}: SelectProps & { projectId: string; orgId: string; allowProjectRecipients?: boolean }) => {
  const { data: users = [], isLoading: isUsersLoading } = useGetWorkspaceUsers(projectId, true);
  const { data: orgUsers = [] } = useGetOrgUsers(orgId);
  const { data: groups = [], isLoading: isGroupsLoading } = useListWorkspaceGroups(projectId);

  const blockedUserIds = new Set(
    orgUsers
      .filter((membership) => !canReceiveAlerts(membership))
      .map((membership) => membership.user.id)
  );
  const eligibleUsers = users.filter(
    (membership) => membership.user.isOrgMembershipActive && !blockedUserIds.has(membership.user.id)
  );

  const groupOptions = groups.map((membership) => membership.group);
  const projectWide = projectOptions(projectId);

  return (
    <RecipientSelect
      options={[
        ...(allowProjectRecipients ? projectWide : []),
        ...buildOptions(eligibleUsers, groupOptions)
      ]}
      labelledOptions={[...projectWide, ...buildOptions(users, groupOptions)]}
      isLoading={isUsersLoading || isGroupsLoading}
      {...props}
    />
  );
};

type Props = SelectProps & { projectId?: string; allowProjectRecipients?: boolean };

export const ChannelRecipientsField = ({ projectId, allowProjectRecipients, ...props }: Props) => {
  const { currentOrg } = useOrganization();

  return projectId ? (
    <ProjectRecipientSelect
      projectId={projectId}
      orgId={currentOrg.id}
      allowProjectRecipients={allowProjectRecipients}
      {...props}
    />
  ) : (
    <OrgRecipientSelect orgId={currentOrg.id} {...props} />
  );
};
