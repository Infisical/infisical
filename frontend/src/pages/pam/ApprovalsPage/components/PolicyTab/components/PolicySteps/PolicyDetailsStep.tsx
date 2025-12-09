import { useEffect } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { TtlFormLabel } from "@app/components/features";
import { FormControl, Input } from "@app/components/v2";

import { TPolicyForm } from "../PolicySchema";

export const PolicyDetailsStep = () => {
  const {
    control,
    formState: { errors }
  } = useFormContext<TPolicyForm>();

  useEffect(() => {
    console.log("YOOOO");
    console.log(errors);
  }, [errors]);

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
        name="conditions.0.accountPaths"
        render={({ field: pathField, fieldState: { error } }) => (
          <FormControl
            isRequired
            label="Account Paths"
            isError={Boolean(error)}
            errorText={error?.message}
            helperText="Policy matches any of these comma-separated account paths"
          >
            <Input
              value={pathField.value.join(",")}
              onChange={(e) => {
                pathField.onChange(e.target.value.split(",").map((path) => path.trim()));
              }}
              placeholder="e.g., /admin/**, /users/john, /**"
            />
          </FormControl>
        )}
      />
    </div>
  );
};
