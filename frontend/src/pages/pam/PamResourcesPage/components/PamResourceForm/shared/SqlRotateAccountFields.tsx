import { useEffect, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import { FormControl, Input, Switch } from "@app/components/v2";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";

export const SqlRotateAccountFields = ({ isUpdate }: { isUpdate: boolean }) => {
  const { control, setValue, getValues } = useFormContext();
  const [showPassword, setShowPassword] = useState(false);
  const password = useWatch({ control, name: "credentials.password" });

  const rotationUsername = useWatch({ control, name: "rotationAccountCredentials.username" });
  const rotationPassword = useWatch({ control, name: "rotationAccountCredentials.password" });

  const [enabled, setEnabled] = useState(false);
  const [wasRotationPasswordSentinelInitially, setWasRotationPasswordSentinelInitially] =
    useState(false);

  useEffect(() => {
    const initialRotationPass = getValues("rotationAccountCredentials.password");
    if (initialRotationPass === UNCHANGED_PASSWORD_SENTINEL) {
      setWasRotationPasswordSentinelInitially(true);
    }
  }, [getValues]);

  useEffect(() => {
    if (password === UNCHANGED_PASSWORD_SENTINEL) {
      setShowPassword(false);
    }
  }, [password]);

  useEffect(() => {
    const isUsernamePopulated = rotationUsername && rotationUsername !== "";
    const isPasswordPopulated =
      rotationPassword &&
      rotationPassword !== "" &&
      rotationPassword !== UNCHANGED_PASSWORD_SENTINEL;

    if (isUsernamePopulated || isPasswordPopulated) {
      setEnabled(true);
    }
  }, [rotationUsername, rotationPassword]);

  return (
    <div className="flex flex-col gap-2">
      <Switch
        id="account-rotation"
        onCheckedChange={(value) => {
          setEnabled(value);
          if (value) {
            setValue("rotationAccountCredentials.username", "", {
              shouldDirty: true
            });
            setValue("rotationAccountCredentials.password", "", {
              shouldDirty: true
            });
          } else {
            setValue("rotationAccountCredentials", null, {
              shouldDirty: true
            });
          }
        }}
        isChecked={enabled}
        containerClassName="flex-row-reverse w-fit"
        className="ml-0"
      >
        <p className="ml-2">Credential Rotation</p>
      </Switch>

      {enabled && (
        <>
          <div className="flex gap-2">
            <Controller
              name="rotationAccountCredentials.username"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  className="mb-0 flex-1"
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="Username"
                >
                  <div className="relative">
                    <Input {...field} autoComplete="off" />
                  </div>
                </FormControl>
              )}
            />
            <Controller
              name="rotationAccountCredentials.password"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  className="mb-0 flex-1"
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="Password"
                >
                  <div className="relative">
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
                        if (
                          isUpdate &&
                          field.value === "" &&
                          wasRotationPasswordSentinelInitially
                        ) {
                          field.onChange(UNCHANGED_PASSWORD_SENTINEL);
                        }
                        setShowPassword(false);
                      }}
                    />
                  </div>
                </FormControl>
              )}
            />
          </div>

          <p className="mb-2 text-xs text-mineshaft-400">
            Credentials of the privileged account which will be used for rotating other accounts
            under this resource
          </p>
        </>
      )}
    </div>
  );
};
