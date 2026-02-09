import { Controller, useFormContext } from "react-hook-form";

import { TtlFormLabel } from "@app/components/features";
import { FormControl, Input } from "@app/components/v2";

import { TPolicyForm } from "../PolicySchema";

export const PolicyDetailsStep = () => {
  const { control, formState } = useFormContext<TPolicyForm>();

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
            errorText={error?.message ?? (formState.errors.conditions as any)?.[0]?.message}
            helperText="Match accounts on resources with these names (supports glob patterns)"
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
            helperText="Match accounts with these names (supports glob patterns)"
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
    </div>
  );
};
