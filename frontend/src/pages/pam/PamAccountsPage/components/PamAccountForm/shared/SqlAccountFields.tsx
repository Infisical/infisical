import { useEffect, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { z } from "zod";

import { Checkbox, FormControl, Input, Tooltip } from "@app/components/v2";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";

import { genericAccountFieldsSchema } from "../GenericAccountFields";
import { rotateAccountFieldsSchema } from "../RotateAccountFields";
import { BaseSqlAccountSchema } from "./sql-account-schemas";

export const baseSqlAccountFieldsSchema = genericAccountFieldsSchema
  .extend(rotateAccountFieldsSchema.shape)
  .extend({
    credentials: BaseSqlAccountSchema.extend({
      readOnlyMode: z.boolean().default(false)
    })
  });

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
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex gap-2">
        <Controller
          name="credentials.username"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              className="mb-0 flex-1"
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
              className="mb-0 flex-1"
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Password"
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
      <Controller
        control={control}
        name="credentials.readOnlyMode"
        defaultValue={false}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl isError={Boolean(error)} errorText={error?.message} className="mb-0">
            <Checkbox id="read-only-mode" isChecked={value} onCheckedChange={onChange}>
              Read Only Mode
              <Tooltip content="Only allow read operations on the database">
                <FontAwesomeIcon icon={faQuestionCircle} size="sm" className="ml-1" />
              </Tooltip>
            </Checkbox>
          </FormControl>
        )}
      />
    </div>
  );
};
