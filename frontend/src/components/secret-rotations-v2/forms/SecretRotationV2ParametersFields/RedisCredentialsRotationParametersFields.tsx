import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import { Field, FieldError, Input } from "@app/components/v3";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { PasswordRequirementsFields } from "./shared";

export const RedisCredentialsRotationParametersFields = () => {
  const { control } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.RedisCredentials;
    }
  >();

  return (
    <>
      <div>
        <Controller
          control={control}
          name="parameters.permissionScope"
          defaultValue=""
          render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabelWithTooltip
                htmlFor="redis-permission-scope"
                tooltipClassName="max-w-160 w-full"
                tooltip={
                  <div className="flex flex-col gap-4">
                    <p>
                      This is the access control permissions that will be set for the issued Redis
                      users. The format must be a valid Redis ACL pattern.
                    </p>
                    <p>
                      The default value is{" "}
                      <code className="rounded-sm bg-container px-1 py-0.5 font-mono font-medium text-foreground">
                        ~* +@all
                      </code>
                      . You can modify it to suit your needs.
                    </p>
                    <p>
                      For more information, please refer to the{" "}
                      <a
                        className="font-medium underline"
                        href="https://redis.io/docs/latest/operate/oss_and_stack/management/security/acl/"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Redis ACL documentation
                      </a>
                      .
                    </p>
                  </div>
                }
              >
                Permission Scope
              </FieldLabelWithTooltip>
              <Input
                ref={ref}
                id="redis-permission-scope"
                value={value}
                onBlur={onBlur}
                onChange={onChange}
                placeholder="~* +@read @write"
                isError={Boolean(error)}
              />
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
        />
      </div>

      <PasswordRequirementsFields />
    </>
  );
};
