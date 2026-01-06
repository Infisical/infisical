import { useEffect, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import { FormControl, Input } from "@app/components/v2";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";

export const UsernamePasswordFields = ({ isUpdate }: { isUpdate: boolean }) => {
  const { control } = useFormContext();
  const [showPassword, setShowPassword] = useState(false);
  const password = useWatch({ control, name: "credentials.password" });

  useEffect(() => {
    if (password === UNCHANGED_PASSWORD_SENTINEL) {
      setShowPassword(false);
    }
  }, [password]);

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
            isOptional
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
            isOptional
          >
            <Input
              {...field}
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              onFocus={() => {
                if (isUpdate && field.value === UNCHANGED_PASSWORD_SENTINEL) {
                  field.onChange("");
                }
                setShowPassword(true);
              }}
              onBlur={() => {
                if (isUpdate && field.value === "") {
                  field.onChange(UNCHANGED_PASSWORD_SENTINEL);
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
