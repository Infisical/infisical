import { useEffect, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import { FormControl, Input, Select, SelectItem, TextArea } from "@app/components/v2";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";
import { SSHAuthMethod } from "@app/hooks/api/pam/types/ssh-resource";

export const SshAccountFields = ({ isUpdate }: { isUpdate: boolean }) => {
  const { control, setValue } = useFormContext();
  const [showPassword, setShowPassword] = useState(false);

  const authMethod =
    useWatch({ control, name: "credentials.authMethod" }) || SSHAuthMethod.Password;
  const password = useWatch({ control, name: "credentials.password" });

  useEffect(() => {
    if (password === UNCHANGED_PASSWORD_SENTINEL) {
      setShowPassword(false);
    }
  }, [password]);

  return (
    <div className="mb-4 rounded-sm border border-mineshaft-600 bg-mineshaft-700/70 p-3">
      <Controller
        name="credentials.authMethod"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            className="mb-3"
            isError={Boolean(error?.message)}
            errorText={error?.message}
            label="Authentication Method"
          >
            <Select
              value={value || SSHAuthMethod.Password}
              onValueChange={(newAuthMethod) => {
                onChange(newAuthMethod);
                // Clear out credentials from other auth methods
                setValue("credentials.password", undefined, { shouldDirty: true });
                setValue("credentials.privateKey", undefined, { shouldDirty: true });
              }}
              className="w-full border border-mineshaft-500"
            >
              <SelectItem value={SSHAuthMethod.Password}>Password</SelectItem>
              <SelectItem value={SSHAuthMethod.PublicKey}>SSH Key</SelectItem>
              <SelectItem value={SSHAuthMethod.Certificate}>Certificate</SelectItem>
            </Select>
          </FormControl>
        )}
      />

      <Controller
        name="credentials.username"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <FormControl
            className="mb-3"
            errorText={error?.message}
            isError={Boolean(error?.message)}
            label="Username"
          >
            <Input {...field} autoComplete="off" />
          </FormControl>
        )}
      />

      {authMethod === SSHAuthMethod.Password && (
        <Controller
          name="credentials.password"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              className="mb-0"
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
      )}

      {authMethod === SSHAuthMethod.PublicKey && (
        <Controller
          name="credentials.privateKey"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              className="mb-0"
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Private Key"
            >
              <TextArea
                {...field}
                className="min-h-32 resize-y font-mono text-xs"
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                onFocus={() => {
                  if (isUpdate && field.value === UNCHANGED_PASSWORD_SENTINEL) {
                    field.onChange("");
                  }
                }}
                onBlur={() => {
                  if (isUpdate && field.value === "") {
                    field.onChange(UNCHANGED_PASSWORD_SENTINEL);
                  }
                }}
              />
            </FormControl>
          )}
        />
      )}

      {authMethod === SSHAuthMethod.Certificate && (
        <p className="mb-0 text-xs text-mineshaft-400">
          Certificate-based authentication will use the certificate configured on the SSH resource.
        </p>
      )}
    </div>
  );
};
