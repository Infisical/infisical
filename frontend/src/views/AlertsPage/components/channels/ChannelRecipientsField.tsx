import { useMemo, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FilterableSelect
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  useGetOrganizationGroups,
  useGetOrgUsers,
  useGetWorkspaceUsers,
  useListWorkspaceGroups
} from "@app/hooks/api";
import { TAlertChannelForm, TAlertChannelRecipientForm } from "@app/hooks/api/alertChannels";
import { ALERT_PRINCIPAL_TYPE_LABELS, AlertPrincipalType } from "@app/hooks/api/alerts";

type RecipientOption = {
  principalType: AlertPrincipalType;
  principalId: string;
  label: string;
};

type PrincipalSource = {
  userOptions: RecipientOption[];
  groupOptions: RecipientOption[];
  labelLookup: Map<string, string>;
};

type MemberLike = {
  user?: { id: string; username?: string; firstName?: string; lastName?: string; email?: string };
};

const toUserOptions = (members: MemberLike[], lookup: Map<string, string>): RecipientOption[] =>
  members
    .filter((member) => member.user?.id)
    .map((member) => {
      const user = member.user!;
      const label =
        user.username ||
        [user.firstName, user.lastName].filter(Boolean).join(" ") ||
        user.email ||
        user.id;
      lookup.set(`${AlertPrincipalType.User}:${user.id}`, label);
      return { principalType: AlertPrincipalType.User, principalId: user.id, label };
    });

const toGroupOptions = (
  groups: { id: string; name: string }[],
  lookup: Map<string, string>
): RecipientOption[] =>
  groups.map((group) => {
    lookup.set(`${AlertPrincipalType.Group}:${group.id}`, group.name);
    return { principalType: AlertPrincipalType.Group, principalId: group.id, label: group.name };
  });

const RecipientsSelect = ({ userOptions, groupOptions, labelLookup }: PrincipalSource) => {
  const { control } = useFormContext<TAlertChannelForm>();
  const [inputValue, setInputValue] = useState("");

  const groupedOptions = useMemo(
    () => [
      { label: "Users", options: userOptions },
      { label: "Groups", options: groupOptions }
    ],
    [userOptions, groupOptions]
  );

  const toOption = (recipient: TAlertChannelRecipientForm): RecipientOption => {
    const resolved = labelLookup.get(`${recipient.principalType}:${recipient.principalId}`);
    return {
      principalType: recipient.principalType,
      principalId: recipient.principalId,
      label: resolved ?? recipient.label ?? recipient.principalId
    };
  };

  return (
    <Controller
      control={control}
      name="recipients"
      render={({ field, fieldState: { error } }) => {
        const value = ((field.value as TAlertChannelRecipientForm[] | undefined) ?? []).map(
          toOption
        );

        return (
          <Field>
            <FieldLabel>Recipients</FieldLabel>
            <FieldContent>
              <FilterableSelect
                isMulti
                closeMenuOnSelect={false}
                placeholder="Add users or groups..."
                options={inputValue.trim() ? groupedOptions : []}
                value={value}
                isError={Boolean(error)}
                inputValue={inputValue}
                onInputChange={(next) => setInputValue(next)}
                noOptionsMessage={() =>
                  inputValue.trim()
                    ? "No matching users or groups"
                    : "Type to search users or groups"
                }
                getOptionValue={(option: RecipientOption) =>
                  `${option.principalType}:${option.principalId}`
                }
                getOptionLabel={(option: RecipientOption) =>
                  `${option.label} (${ALERT_PRINCIPAL_TYPE_LABELS[option.principalType]})`
                }
                onChange={(newValue) => {
                  field.onChange(
                    (newValue as RecipientOption[]).map((option) => ({
                      principalType: option.principalType,
                      principalId: option.principalId,
                      label: option.label
                    }))
                  );
                }}
              />
              <FieldDescription>
                This channel delivers to these recipients. Add users or groups.
              </FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        );
      }}
    />
  );
};

const OrgRecipients = () => {
  const { currentOrg } = useOrganization();
  const { data: orgUsers = [] } = useGetOrgUsers(currentOrg.id);
  const { data: orgGroups = [] } = useGetOrganizationGroups(currentOrg.id);

  const source = useMemo<PrincipalSource>(() => {
    const labelLookup = new Map<string, string>();
    return {
      userOptions: toUserOptions(orgUsers, labelLookup),
      groupOptions: toGroupOptions(orgGroups, labelLookup),
      labelLookup
    };
  }, [orgUsers, orgGroups]);

  return <RecipientsSelect {...source} />;
};

const ProjectRecipients = ({ projectId }: { projectId: string }) => {
  const { data: projectUsers = [] } = useGetWorkspaceUsers(projectId, true);
  const { data: projectGroups = [] } = useListWorkspaceGroups(projectId);

  const source = useMemo<PrincipalSource>(() => {
    const labelLookup = new Map<string, string>();
    return {
      userOptions: toUserOptions(projectUsers, labelLookup),
      groupOptions: toGroupOptions(
        projectGroups.map((membership) => ({
          id: membership.group.id,
          name: membership.group.name
        })),
        labelLookup
      ),
      labelLookup
    };
  }, [projectUsers, projectGroups]);

  return <RecipientsSelect {...source} />;
};

export const ChannelRecipientsField = ({ projectId }: { projectId?: string }) => {
  return projectId ? <ProjectRecipients projectId={projectId} /> : <OrgRecipients />;
};
