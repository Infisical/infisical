import { useEffect, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import { FormControl, Input, Switch } from "@app/components/v2";
import { KubernetesAuthMethod } from "@app/hooks/api/pam";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";

export const KubernetesRotateAccountFields = ({ isUpdate }: { isUpdate: boolean }) => {
  const { control, setValue, getValues } = useFormContext();
  const [showToken, setShowToken] = useState(false);

  const rotationServiceAccountName = useWatch({
    control,
    name: "rotationAccountCredentials.serviceAccountName"
  });
  const rotationServiceAccountToken = useWatch({
    control,
    name: "rotationAccountCredentials.serviceAccountToken"
  });

  const [enabled, setEnabled] = useState(false);
  const [wasRotationTokenSentinelInitially, setWasRotationTokenSentinelInitially] = useState(false);

  useEffect(() => {
    const initialRotationToken = getValues("rotationAccountCredentials.serviceAccountToken");
    if (initialRotationToken === UNCHANGED_PASSWORD_SENTINEL) {
      setWasRotationTokenSentinelInitially(true);
    }
  }, [getValues]);

  useEffect(() => {
    if (rotationServiceAccountToken === UNCHANGED_PASSWORD_SENTINEL) {
      setShowToken(false);
    }
  }, [rotationServiceAccountToken]);

  useEffect(() => {
    const isServiceAccountNamePopulated =
      rotationServiceAccountName && rotationServiceAccountName !== "";
    const isTokenPopulated =
      rotationServiceAccountToken &&
      rotationServiceAccountToken !== "" &&
      rotationServiceAccountToken !== UNCHANGED_PASSWORD_SENTINEL;

    if (isServiceAccountNamePopulated || isTokenPopulated) {
      setEnabled(true);
    }
  }, [rotationServiceAccountName, rotationServiceAccountToken]);

  return (
    <div className="flex flex-col gap-2">
      <Switch
        id="account-rotation"
        onCheckedChange={(value) => {
          setEnabled(value);
          if (value) {
            setValue(
              "rotationAccountCredentials.authMethod",
              KubernetesAuthMethod.ServiceAccountToken,
              {
                shouldDirty: true
              }
            );
            setValue("rotationAccountCredentials.serviceAccountName", "", {
              shouldDirty: true
            });
            setValue("rotationAccountCredentials.serviceAccountToken", "", {
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
              name="rotationAccountCredentials.serviceAccountName"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  className="mb-0 flex-1"
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="Service Account Name"
                >
                  <div className="relative">
                    <Input {...field} autoComplete="off" />
                  </div>
                </FormControl>
              )}
            />
            <Controller
              name="rotationAccountCredentials.serviceAccountToken"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  className="mb-0 flex-1"
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="Service Account Token"
                >
                  <div className="relative">
                    <Input
                      {...field}
                      type={showToken ? "text" : "password"}
                      autoComplete="new-password"
                      onFocus={() => {
                        if (isUpdate && field.value === UNCHANGED_PASSWORD_SENTINEL) {
                          field.onChange("");
                        }
                        setShowToken(true);
                      }}
                      onBlur={() => {
                        if (isUpdate && field.value === "" && wasRotationTokenSentinelInitially) {
                          field.onChange(UNCHANGED_PASSWORD_SENTINEL);
                        }
                        setShowToken(false);
                      }}
                    />
                  </div>
                </FormControl>
              )}
            />
          </div>

          <p className="mb-2 text-xs text-mineshaft-400">
            Credentials of the privileged service account which will be used for rotating other
            accounts under this resource
          </p>
        </>
      )}
    </div>
  );
};
