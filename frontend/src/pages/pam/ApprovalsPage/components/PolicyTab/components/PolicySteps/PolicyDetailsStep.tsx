import { Controller, useFormContext } from "react-hook-form";

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
        name="maxRequestTtlSeconds"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Max Request TTL (seconds)"
            isError={Boolean(error)}
            errorText={error?.message}
            helperText="Maximum time-to-live for requests. Must be between 1 hour (3600s) and 30 days (2592000s). Leave empty for no limit."
          >
            <Input
              {...field}
              type="number"
              value={field.value ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                field.onChange(val === "" ? null : parseInt(val, 10));
              }}
              placeholder="e.g., 86400 (24 hours)"
            />
          </FormControl>
        )}
      />
      <div className="border-t border-mineshaft-600 pt-4">
        <div className="mb-3">
          <p className="pb-0.5 text-sm font-medium text-mineshaft-200">
            Request Duration Constraints
          </p>
          <p className="text-xs text-mineshaft-400">
            Set minimum and maximum duration (in hours) for access requests
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Controller
            control={control}
            name="constraints.requestDurationHours.min"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Minimum Hours"
                isError={Boolean(error)}
                errorText={error?.message}
                helperText="0-168 hours"
              >
                <Input
                  {...field}
                  type="number"
                  min={0}
                  max={168}
                  onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="constraints.requestDurationHours.max"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Maximum Hours"
                isError={Boolean(error)}
                errorText={error?.message}
                helperText="1-168 hours (7 days)"
              >
                <Input
                  {...field}
                  type="number"
                  min={1}
                  max={168}
                  onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                />
              </FormControl>
            )}
          />
        </div>
      </div>
    </div>
  );
};
