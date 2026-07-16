import { useMemo, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";

import {
  CreatableSelect,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useGetOrganizationGroups, useGetOrgUsers } from "@app/hooks/api";
import {
  ALARM_PRINCIPAL_TYPE_LABELS,
  AlarmPrincipalType,
  TAlarmForm,
  TAlarmRecipientForm
} from "@app/hooks/api/alarms";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RecipientOption = {
  principalType: AlarmPrincipalType;
  principalId: string;
  label: string;
};

type Props = {
  index: number;
};

export const AlarmRecipientsField = ({ index }: Props) => {
  const { control } = useFormContext<TAlarmForm>();
  const { currentOrg } = useOrganization();
  const orgId = currentOrg.id;

  // Only reveal the (potentially large) option list once the user starts typing.
  const [inputValue, setInputValue] = useState("");

  const { data: orgUsers = [] } = useGetOrgUsers(orgId);
  const { data: orgGroups = [] } = useGetOrganizationGroups(orgId);

  const { userOptions, groupOptions, labelLookup } = useMemo(() => {
    const lookup = new Map<string, string>();

    const users: RecipientOption[] = orgUsers
      .filter((member) => member.user?.id)
      .map((member) => {
        const label =
          member.user.username ||
          [member.user.firstName, member.user.lastName].filter(Boolean).join(" ") ||
          member.user.email ||
          member.user.id;
        lookup.set(`${AlarmPrincipalType.User}:${member.user.id}`, label);
        return { principalType: AlarmPrincipalType.User, principalId: member.user.id, label };
      });

    const groups: RecipientOption[] = orgGroups.map((group) => {
      lookup.set(`${AlarmPrincipalType.Group}:${group.id}`, group.name);
      return { principalType: AlarmPrincipalType.Group, principalId: group.id, label: group.name };
    });

    return { userOptions: users, groupOptions: groups, labelLookup: lookup };
  }, [orgUsers, orgGroups]);

  const groupedOptions = useMemo(
    () => [
      { label: "Users", options: userOptions },
      { label: "Groups", options: groupOptions }
    ],
    [userOptions, groupOptions]
  );

  const toOption = (recipient: TAlarmRecipientForm): RecipientOption => {
    if (recipient.principalType === AlarmPrincipalType.Email) {
      return {
        principalType: AlarmPrincipalType.Email,
        principalId: recipient.principalId,
        label: recipient.principalId
      };
    }
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
      name={`channels.${index}.config.recipients`}
      render={({ field, fieldState: { error } }) => {
        const value = ((field.value as TAlarmRecipientForm[] | undefined) ?? []).map(toOption);

        return (
          <Field>
            <FieldLabel>Recipients</FieldLabel>
            <FieldContent>
              <CreatableSelect
                isMulti
                closeMenuOnSelect={false}
                placeholder="Add users, groups, or type an email..."
                // Hide the full list until the user types; keep it lightweight.
                options={inputValue.trim() ? groupedOptions : []}
                value={value}
                isError={Boolean(error)}
                inputValue={inputValue}
                onInputChange={(next) => setInputValue(next)}
                noOptionsMessage={() =>
                  inputValue.trim()
                    ? "No matches. Type a full email to add it."
                    : "Type to search users, groups, or an email"
                }
                getOptionValue={(option: RecipientOption) =>
                  `${option.principalType}:${option.principalId}`
                }
                getOptionLabel={(option: RecipientOption) =>
                  `${option.label} (${ALARM_PRINCIPAL_TYPE_LABELS[option.principalType]})`
                }
                isValidNewOption={(input) => EMAIL_REGEX.test(input.trim())}
                formatCreateLabel={(input) => `Add email "${input.trim()}"`}
                getNewOptionData={(input) =>
                  ({
                    principalType: AlarmPrincipalType.Email,
                    principalId: input.trim().toLowerCase(),
                    label: input.trim().toLowerCase()
                  }) as RecipientOption
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
                Email channels deliver to these recipients. Add org users, groups, or raw email
                addresses.
              </FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        );
      }}
    />
  );
};
