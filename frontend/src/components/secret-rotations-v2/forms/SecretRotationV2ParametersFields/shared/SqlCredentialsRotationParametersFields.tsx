import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FormControl, Input, Tab, TabList, TabPanel, Tabs, TextArea } from "@app/components/v2";
import { NoticeBannerV2 } from "@app/components/v2/NoticeBannerV2/NoticeBannerV2";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation, useSecretRotationV2Option } from "@app/hooks/api/secretRotationsV2";

import { DEFAULT_PASSWORD_REQUIREMENTS } from "../../schemas/shared";

enum ParameterTab {
  Statement = "statement",
  Advanced = "advance"
}

export const SqlCredentialsRotationParametersFields = () => {
  const { control, watch } = useFormContext<
    TSecretRotationV2Form & {
      type:
        | SecretRotation.PostgresCredentials
        | SecretRotation.MsSqlCredentials
        | SecretRotation.OracleDBCredentials;
    }
  >();
  const type = watch("type");

  const { rotationOption } = useSecretRotationV2Option(type);

  return (
    <Tabs defaultValue={ParameterTab.Statement}>
      <TabList className="border-b border-mineshaft-500">
        <Tab value={ParameterTab.Statement}>General</Tab>
        <Tab value={ParameterTab.Advanced}>Advanced</Tab>
      </TabList>
      <TabPanel value={ParameterTab.Statement}>
        <Controller
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              isError={Boolean(error)}
              errorText={error?.message}
              label="Database Username 1"
            >
              <Input
                value={value}
                onChange={onChange}
                placeholder={
                  rotationOption.connection === AppConnection.OracleDB
                    ? "INFISICAL_USER_1"
                    : "infisical_user_1"
                }
              />
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
              <Input
                value={value}
                onChange={onChange}
                placeholder={
                  rotationOption.connection === AppConnection.OracleDB
                    ? "INFISICAL_USER_2"
                    : "infisical_user_2"
                }
              />
            </FormControl>
          )}
          control={control}
          name="parameters.username2"
        />
        <NoticeBannerV2 title="Example Create User Statement">
          <p className="mb-3 text-sm text-mineshaft-300">
            Infisical requires two database users to be created for rotation.
          </p>
          <p className="mb-3 text-sm text-mineshaft-300">
            These users are intended to be solely managed by Infisical. Altering their login after
            rotation may cause unexpected failure.
          </p>
          <p className="mb-3 text-sm text-mineshaft-300">
            Below is an example statement for creating the required users. You may need to modify it
            to suit your needs.
          </p>
          <p className="mb-3 text-sm">
            <pre className="max-h-40 overflow-y-auto rounded-sm border border-mineshaft-700 bg-mineshaft-800 p-2 whitespace-pre-wrap text-mineshaft-300">
              {rotationOption!.template.createUserStatement}
            </pre>
          </p>
        </NoticeBannerV2>
      </TabPanel>
      <TabPanel value={ParameterTab.Advanced}>
        <Controller
          control={control}
          name="parameters.rotationStatement"
          defaultValue={rotationOption?.template?.rotationStatement}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Rotation Statement"
              isError={Boolean(error?.message)}
              errorText={error?.message}
              helperText="username, password and database are dynamically provisioned"
            >
              <TextArea
                {...field}
                reSize="none"
                rows={3}
                className="border-mineshaft-600 bg-mineshaft-900 text-sm"
              />
            </FormControl>
          )}
        />
        <div className="flex flex-col gap-3">
          <div className="w-full border-b border-mineshaft-600">
            <span className="text-sm text-mineshaft-300">Password Requirements</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-sm border border-mineshaft-600 bg-mineshaft-700 px-3 pt-3">
            <Controller
              control={control}
              name="parameters.passwordRequirements.length"
              defaultValue={
                // for oracle 48 would throw error
                type === SecretRotation.OracleDBCredentials
                  ? 30
                  : DEFAULT_PASSWORD_REQUIREMENTS.length
              }
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Password Length"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  tooltipText="The length of the password to generate"
                >
                  <Input
                    type="number"
                    min={1}
                    max={250}
                    size="sm"
                    {...field}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="parameters.passwordRequirements.required.digits"
              defaultValue={DEFAULT_PASSWORD_REQUIREMENTS.required.digits}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Digit Count"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  tooltipText="Minimum number of digits"
                >
                  <Input
                    type="number"
                    min={0}
                    size="sm"
                    {...field}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="parameters.passwordRequirements.required.lowercase"
              defaultValue={DEFAULT_PASSWORD_REQUIREMENTS.required.lowercase}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Lowercase Character Count"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  tooltipText="Minimum number of lowercase characters"
                >
                  <Input
                    type="number"
                    min={0}
                    size="sm"
                    {...field}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="parameters.passwordRequirements.required.uppercase"
              defaultValue={DEFAULT_PASSWORD_REQUIREMENTS.required.uppercase}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Uppercase Character Count"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  tooltipText="Minimum number of uppercase characters"
                >
                  <Input
                    type="number"
                    min={0}
                    size="sm"
                    {...field}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="parameters.passwordRequirements.required.symbols"
              defaultValue={DEFAULT_PASSWORD_REQUIREMENTS.required.symbols}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Symbol Count"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  tooltipText="Minimum number of symbols"
                >
                  <Input
                    type="number"
                    min={0}
                    size="sm"
                    {...field}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="parameters.passwordRequirements.allowedSymbols"
              defaultValue={DEFAULT_PASSWORD_REQUIREMENTS.allowedSymbols}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Allowed Symbols"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  tooltipText="Symbols to use in generated password"
                >
                  <Input
                    placeholder="-_.~!*"
                    size="sm"
                    {...field}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                </FormControl>
              )}
            />
          </div>
        </div>
      </TabPanel>
    </Tabs>
  );
};
