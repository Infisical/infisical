import { Controller, useFormContext } from "react-hook-form";

import { TtlFormLabel } from "@app/components/features";
import { FormControl, Input } from "@app/components/v2";

import { TPolicyForm } from "../PolicySchema";

export const PolicyDetailsStep = () => {
  const { control } = useFormContext<TPolicyForm>();

  return (
    <div className="space-y-4">
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Policy Name"
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
            isError={Boolean(error)}
            errorText={error?.message}
            label={<TtlFormLabel label="Max Approval Request TTL" />}
            helperText="Maximum time-to-live for requests. Must be between 1 hour and 30 days. Leave empty for no limit."
          >
            <Input {...field} value={field.value ?? ""} placeholder="1h" />
          </FormControl>
        )}
      />
      <div className="border-t border-mineshaft-600 pt-4">
        <div className="mb-3">
          <p className="pb-0.5 text-sm font-medium text-mineshaft-200">
            PAM Account Access Duration TTL
          </p>
          <p className="text-xs text-mineshaft-400">
            Set minimum and maximum duration (in seconds) for pam account access
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Controller
            control={control}
            name="constraints.accessDuration.min"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label={<TtlFormLabel label="Minimum TTL" />}
                isError={Boolean(error)}
                errorText={error?.message}
                helperText="Must be between 30s and 7 days"
              >
                <Input {...field} />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="constraints.accessDuration.max"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label={<TtlFormLabel label="Maximum TTL" />}
                isError={Boolean(error)}
                errorText={error?.message}
                helperText="Must be between 30s and 7 days"
              >
                <Input {...field} />
              </FormControl>
            )}
          />
        </div>
      </div>
    </div>
  );
};
