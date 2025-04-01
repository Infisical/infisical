import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FormControl, Input } from "@app/components/v2";
import { NoticeBannerV2 } from "@app/components/v2/NoticeBannerV2/NoticeBannerV2";
import { SecretRotation, useSecretRotationV2Option } from "@app/hooks/api/secretRotationsV2";

export const SqlRotationParametersFields = () => {
  const { control, watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.PostgresCredentials; // all sql rotations share these fields
    }
  >();

  const type = watch("type");

  const { rotationOption } = useSecretRotationV2Option(type);

  return (
    <>
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Database Username 1"
          >
            <Input value={value} onChange={onChange} placeholder="infiscal_user_1" />
          </FormControl>
        )}
        control={control}
        name="parameters.username1"
      />
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Database Username 2"
          >
            <Input value={value} onChange={onChange} placeholder="infiscal_user_2" />
          </FormControl>
        )}
        control={control}
        name="parameters.username2"
      />
      <NoticeBannerV2 title="Example Create User Statement">
        <p className="mb-3 text-sm text-mineshaft-300">
          Infisical requires two database users to be created for rotation. Below is an example
          statement for creating the required users. You may need to modify it to suit your needs.
        </p>
        <p className="text-sm">
          <pre className="whitespace-pre-wrap rounded border border-mineshaft-700 bg-mineshaft-800 p-2 text-mineshaft-300">
            {rotationOption!.template.createUserStatement}
          </pre>
        </p>
      </NoticeBannerV2>
    </>
  );
};
