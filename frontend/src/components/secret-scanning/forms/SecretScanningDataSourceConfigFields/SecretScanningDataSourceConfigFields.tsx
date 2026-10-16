import { Controller, useFormContext } from "react-hook-form";

import { Field, FieldDescription, FieldError, FieldLabel, Toggle } from "@app/components/v3";
import { RESOURCE_DESCRIPTION_HELPER } from "@app/helpers/secretScanningV2";
import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";

import { TSecretScanningDataSourceForm } from "../schemas";
import { BitbucketDataSourceConfigFields } from "./BitbucketDataSourceConfigFields";
import { GitHubDataSourceConfigFields } from "./GitHubDataSourceConfigFields";
import { GitLabDataSourceConfigFields } from "./GitLabDataSourceConfigFields";

const COMPONENT_MAP: Record<SecretScanningDataSource, React.FC> = {
  [SecretScanningDataSource.GitHub]: GitHubDataSourceConfigFields,
  [SecretScanningDataSource.Bitbucket]: BitbucketDataSourceConfigFields,
  [SecretScanningDataSource.GitLab]: GitLabDataSourceConfigFields
};

export const SecretScanningDataSourceConfigFields = () => {
  const { watch, control } = useFormContext<TSecretScanningDataSourceForm>();

  const type = watch("type");

  const Component = COMPONENT_MAP[type];
  const autoScanDescription = RESOURCE_DESCRIPTION_HELPER[type];

  return (
    <>
      <p className="mb-4 text-sm text-label-secondary">Connect and configure your Data Source.</p>
      <Component />
      <Controller
        control={control}
        name="isAutoScanEnabled"
        render={({ field: { value, onChange, onBlur, ref, name }, fieldState: { error } }) => {
          return (
            <Field className="mb-4" data-invalid={Boolean(error)}>
              <div className="flex items-center gap-3">
                <Toggle
                  ref={ref}
                  name={name}
                  id="auto-scan-enabled"
                  variant="success"
                  onCheckedChange={onChange}
                  onBlur={onBlur}
                  checked={value}
                  aria-invalid={Boolean(error)}
                  aria-describedby={`auto-scan-enabled-help${error ? " auto-scan-enabled-error" : ""}`}
                />
                <FieldLabel htmlFor="auto-scan-enabled">
                  Auto-Scan {value ? "Enabled" : "Disabled"}
                </FieldLabel>
              </div>
              <FieldDescription id="auto-scan-enabled-help">
                {value
                  ? `Scans will automatically be triggered when a ${autoScanDescription.verb} occurs to ${autoScanDescription.pluralNoun} associated with this data source.`
                  : "Manually trigger scans to detect secret leaks."}
              </FieldDescription>
              <FieldError id="auto-scan-enabled-error">{error?.message}</FieldError>
            </Field>
          );
        }}
      />
    </>
  );
};
