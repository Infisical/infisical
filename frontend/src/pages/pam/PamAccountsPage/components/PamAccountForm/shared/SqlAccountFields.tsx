import { Controller, useFormContext } from "react-hook-form";

import { FormControl, Input } from "@app/components/v2";
import { useState } from "react";

export const SqlAccountFields = ({ isUpdate }: { isUpdate: boolean }) => {
  const { control } = useFormContext();
  const [showPassword, setShowPassword] = useState(false);

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
            <Input {...field} autoComplete="off" />
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
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              onFocus={() => {
                if (isUpdate && field.value === "******") {
                  field.onChange("");
                }
                setShowPassword(true);
              }}
              onBlur={() => {
                if (isUpdate && field.value === "") {
                  field.onChange("******");
                }
                setShowPassword(false);
              }}
            />
          </FormControl>
        )}
      />
    </div>
  );
};
