import { useMemo } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { MultiValue } from "react-select";

import { TtlFormLabel } from "@app/components/features";
import { FilterableSelect, FormControl, Input, Switch } from "@app/components/v2";
import { useProject } from "@app/context";
import { getMemberLabel } from "@app/helpers/members";
import { useGetWorkspaceUsers, useListWorkspaceGroups } from "@app/hooks/api";
import { BypasserType, EnforcementLevel } from "@app/hooks/api/approvalPolicies";

import { TPolicyForm } from "../PolicySchema";

export const PolicyDetailsStep = () => {
  const { control, watch } = useFormContext<TPolicyForm>();

  const { currentProject } = useProject();
  const projectId = currentProject?.id || "";
  const { data: members = [] } = useGetWorkspaceUsers(projectId);
  const { data: groups = [] } = useListWorkspaceGroups(projectId);

  const enforcementLevel = watch("enforcementLevel");
  const userBypassers = watch("userBypassers") || [];
  const groupBypassers = watch("groupBypassers") || [];
  const bypasserCount = userBypassers.length + groupBypassers.length;
  const isSoft = enforcementLevel === EnforcementLevel.Soft;

  const userBypasserOptions = useMemo(
    () =>
      members.map((member) => ({
        id: member.user.id,
        type: BypasserType.User as const
      })),
    [members]
  );

  const groupBypasserOptions = useMemo(
    () => groups?.map(({ group }) => ({ id: group.id, type: BypasserType.Group as const })) ?? [],
    [groups]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex w-full gap-4">
        <Controller
          control={control}
          name="name"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Policy Name"
              className="mb-0 flex-1"
              isRequired
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Input {...field} placeholder="Enter policy name" />
            </FormControl>
          )}
        />

        <Controller
          control={control}
          name="constraints.accessDuration.max"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label={<TtlFormLabel label="Max. Access Duration" />}
              className="mb-0"
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Input {...field} />
            </FormControl>
          )}
        />
      </div>

      <Controller
        control={control}
        name="conditions.0.resourceNames"
        render={({ field: resourceField, fieldState: { error } }) => (
          <FormControl
            className="mb-0"
            label="Resource Names"
            isError={Boolean(error)}
            errorText={error?.message}
            helperText="Comma-separated list of resource names this policy applies to. Glob patterns supported: * matches any characters except / (e.g., prod-* matches prod-db), ** matches across nested levels (e.g., prod/** matches prod/db/main)."
          >
            <Input
              value={resourceField.value?.join(",") ?? ""}
              onChange={(e) => {
                const { value } = e.target;
                resourceField.onChange(value ? value.split(",").map((name) => name.trim()) : []);
              }}
              placeholder="e.g., prod-*, staging-db, *"
            />
          </FormControl>
        )}
      />

      <Controller
        control={control}
        name="conditions.0.accountNames"
        render={({ field: accountField, fieldState: { error } }) => (
          <FormControl
            className="mb-0"
            label="Account Names"
            isError={Boolean(error)}
            errorText={error?.message}
            helperText="Supports glob patterns. Use * to match within a single level (e.g., admin-* matches admin-ro but not admin/ro). Use ** to match across all depths (e.g., admin/** matches admin/ro/dev)."
          >
            <Input
              value={accountField.value?.join(",") ?? ""}
              onChange={(e) => {
                const { value } = e.target;
                accountField.onChange(value ? value.split(",").map((name) => name.trim()) : []);
              }}
              placeholder="e.g., admin-*, readonly, *"
            />
          </FormControl>
        )}
      />

      <Controller
        control={control}
        name="enforcementLevel"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            label="Bypass Approvals"
            isError={Boolean(error)}
            errorText={error?.message}
            className="mb-0"
          >
            <Switch
              id="bypass-approvals"
              thumbClassName="bg-mineshaft-800"
              isChecked={value === EnforcementLevel.Soft}
              onCheckedChange={(v) => onChange(v ? EnforcementLevel.Soft : EnforcementLevel.Hard)}
            >
              Allow certain users to bypass policy in break-glass situations
            </Switch>
          </FormControl>
        )}
      />

      {isSoft && (
        <>
          <div className="flex gap-2">
            <Controller
              control={control}
              name="userBypassers"
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  label="User Bypassers"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  className="mb-0 w-1/2"
                >
                  <FilterableSelect
                    isMulti
                    placeholder="Select members..."
                    options={userBypasserOptions}
                    getOptionValue={(option) => option.id}
                    getOptionLabel={(option) => {
                      const member = members?.find((m) => m.user.id === option.id);
                      if (!member) return option.id;
                      return getMemberLabel(member);
                    }}
                    value={value || []}
                    onChange={(selected) => {
                      onChange(
                        (selected as MultiValue<{ type: BypasserType.User; id: string }>) || []
                      );
                    }}
                  />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="groupBypassers"
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  label="Group Bypassers"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  className="mb-0 w-1/2"
                >
                  <FilterableSelect
                    isMulti
                    placeholder="Select groups..."
                    options={groupBypasserOptions}
                    getOptionValue={(option) => option.id}
                    getOptionLabel={(option) =>
                      groups?.find(({ group }) => group.id === option.id)?.group.name ?? option.id
                    }
                    value={value || []}
                    onChange={(selected) => {
                      onChange(
                        (selected as MultiValue<{ type: BypasserType.Group; id: string }>) || []
                      );
                    }}
                  />
                </FormControl>
              )}
            />
          </div>

          {bypasserCount <= 0 && (
            <div className="mt-1 flex rounded-r border-l-2 border-l-red-500 bg-mineshaft-300/5 px-4 py-2.5 text-sm text-bunker-300">
              Not selecting specific users or groups will allow anyone to bypass this policy.
            </div>
          )}
        </>
      )}
    </div>
  );
};
