import { Controller, useFormContext } from "react-hook-form";

import { FormControl, Input } from "@app/components/v2";

export const SqlAccountFields = ({ isUpdate }: { isUpdate: boolean }) => {
  const { control } = useFormContext();

  return (
    <div className="flex gap-2">
      <Controller
        name="credentials.username"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <FormControl
            className="flex-1"
            errorText={error?.message}
            isError={Boolean(error?.message)}
            label="Username"
          >
            <Input {...field} />
          </FormControl>
        )}
      />
      <Controller
        name="credentials.password"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <FormControl
            className="flex-1"
            errorText={error?.message}
            isError={Boolean(error?.message)}
            label="Password"
          >
            <Input
              {...field}
              type="password"
              onFocus={(e) => {
                if (isUpdate && field.value === "******") {
                  field.onChange("");
                }
                e.target.type = "text";
              }}
              onBlur={(e) => {
                if (isUpdate && field.value === "") {
                  field.onChange("******");
                }
                e.target.type = "password";
              }}
            />
          </FormControl>
        )}
      />
    </div>
  );
};
