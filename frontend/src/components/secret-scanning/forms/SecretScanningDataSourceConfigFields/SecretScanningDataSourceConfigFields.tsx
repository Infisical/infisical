import { Controller, useFormContext } from "react-hook-form";

import { FormControl, Switch } from "@app/components/v2";
import { RESOURCE_DESCRIPTION_HELPER } from "@app/helpers/secretScanningV2";
import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";

import { TSecretScanningDataSourceForm } from "../schemas";
import { BitbucketDataSourceConfigFields } from "./BitbucketDataSourceConfigFields";
import { GitHubDataSourceConfigFields } from "./GitHubDataSourceConfigFields";

const COMPONENT_MAP: Record<SecretScanningDataSource, React.FC> = {
  [SecretScanningDataSource.GitHub]: GitHubDataSourceConfigFields,
  [SecretScanningDataSource.Bitbucket]: BitbucketDataSourceConfigFields
};

export const SecretScanningDataSourceConfigFields = () => {
  const { watch, control } = useFormContext<TSecretScanningDataSourceForm>();

  const type = watch("type");

  const Component = COMPONENT_MAP[type];
  const autoScanDescription = RESOURCE_DESCRIPTION_HELPER[type];

  return (
    <>
      <p className="mb-4 text-sm text-bunker-300">Connect and configure your Data Source.</p>
      <Component />
      <Controller
        control={control}
        name="isAutoScanEnabled"
        render={({ field: { value, onChange }, fieldState: { error } }) => {
          return (
            <FormControl
              helperText={
                value
                  ? `Scans will automatically be triggered when a ${autoScanDescription.verb} occurs to ${autoScanDescription.pluralNoun} associated with this data source.`
                  : "Manually trigger scans to detect secret leaks."
              }
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Switch
                className="bg-mineshaft-400/80 shadow-inner data-[state=checked]:bg-green/80"
                id="auto-scan-enabled"
                thumbClassName="bg-mineshaft-800"
                onCheckedChange={onChange}
                isChecked={value}
              >
                <p className="w-[9.6rem]">Auto-Scan {value ? "Enabled" : "Disabled"}</p>
              </Switch>
            </FormControl>
          );
        }}
      />
    </>
  );
};
