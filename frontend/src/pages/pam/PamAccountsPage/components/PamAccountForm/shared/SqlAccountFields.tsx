import { useEffect, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import { Field, FieldContent, FieldError, FieldLabel, UnstableInput } from "@app/components/v3";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";

export const SqlAccountFields = ({ isUpdate }: { isUpdate: boolean }) => {
  const { control } = useFormContext();
  const [showPassword, setShowPassword] = useState(false);
  const password = useWatch({ control, name: "credentials.password" });

  useEffect(() => {
    if (password === UNCHANGED_PASSWORD_SENTINEL) {
      setShowPassword(false);
    }
  }, [password]);

  return (
    <div className="grid grid-cols-2 gap-2">
      <Controller
        name="credentials.username"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Username</FieldLabel>
            <FieldContent>
              <UnstableInput
                {...field}
                isError={Boolean(error)}
                autoComplete="off"
                placeholder="user"
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="credentials.password"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Password</FieldLabel>
            <FieldContent>
              <UnstableInput
                {...field}
                placeholder="••••••"
                isError={Boolean(error)}
                autoComplete="new-password"
                type={showPassword ? "text" : "password"}
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
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </div>
  );
};
