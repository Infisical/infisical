import { Controller, useFormContext } from "react-hook-form";

import { TtlFormLabel } from "@app/components/features";
import { Checkbox, FormControl, Input } from "@app/components/v2";

import { TCodeSigningPolicyForm } from "../CodeSigningPolicySchema";

export const CodeSigningPolicyDetailsStep = () => {
  const {
    control,
    formState: { errors }
  } = useFormContext<TCodeSigningPolicyForm>();

  const constraintsError = errors.constraints?.root?.message;

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
          name="maxRequestTtl"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label={<TtlFormLabel label="Max. Request TTL" />}
              className="mb-0"
              isError={Boolean(error)}
              errorText={error?.message}
              helperText="Maximum time a request can be pending (optional)"
            >
              <Input
                {...field}
                value={field.value || ""}
                placeholder="e.g., 7d"
                onChange={(e) => {
                  if (!e.target.value || e.target.value === "") {
                    field.onChange(null);
                    return;
                  }
                  field.onChange(e.target.value);
                }}
              />
            </FormControl>
          )}
        />
      </div>

      <Controller
        control={control}
        name="constraints.maxWindowDuration"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Max Window Duration"
            isError={Boolean(error)}
            errorText={error?.message}
            helperText="Maximum signing window duration (e.g., 1h, 1d)"
          >
            <Input
              {...field}
              value={field.value ?? ""}
              placeholder="e.g., 1h"
              onChange={(e) => field.onChange(e.target.value)}
            />
          </FormControl>
        )}
      />

      <Controller
        control={control}
        name="constraints.maxSignings"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Max Signings"
            isError={Boolean(error)}
            errorText={error?.message}
            helperText="Maximum number of signings per approved request"
          >
            <Input
              {...field}
              value={field.value ?? ""}
              placeholder="e.g., 10"
              onChange={(e) => field.onChange(e.target.value)}
            />
          </FormControl>
        )}
      />

      {constraintsError && <p className="text-xs text-red">{constraintsError}</p>}

      <Controller
        control={control}
        name="bypassForMachineIdentities"
        render={({ field: { value, onChange } }) => (
          <div className="mt-2 items-center">
            <Checkbox
              id="csBypassForMachineIdentities"
              isChecked={value}
              onCheckedChange={onChange}
              checkIndicatorBg="text-primary"
            >
              <span className="text-sm text-mineshaft-200">
                Bypass approval for machine identities
              </span>
              <p className="text-xs text-mineshaft-400">
                When enabled, machine identities can sign without requiring approval
              </p>
            </Checkbox>
          </div>
        )}
      />
    </div>
  );
};
