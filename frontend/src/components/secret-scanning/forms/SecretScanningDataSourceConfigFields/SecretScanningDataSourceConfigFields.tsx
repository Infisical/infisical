import { Controller, useFormContext, useWatch } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  Label,
  Toggle
} from "@app/components/v3";
import {
  doesDataSourceSupportDiscovery,
  RESOURCE_DESCRIPTION_HELPER,
  SECRET_SCANNING_DATA_SOURCE_MAP
} from "@app/helpers/secretScanningV2";
import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";

import { TSecretScanningDataSourceForm } from "../schemas";
import { BitbucketDataSourceConnectionFields } from "./BitbucketDataSourceConfigFields";
import { GitHubDataSourceConnectionFields } from "./GitHubDataSourceConfigFields";
import { GitLabDataSourceConnectionFields } from "./GitLabDataSourceConfigFields";

const CONNECTION_COMPONENT_MAP: Record<SecretScanningDataSource, React.FC> = {
  [SecretScanningDataSource.GitHub]: GitHubDataSourceConnectionFields,
  [SecretScanningDataSource.Bitbucket]: BitbucketDataSourceConnectionFields,
  [SecretScanningDataSource.GitLab]: GitLabDataSourceConnectionFields
};

export const SecretScanningDataSourceConnectionFields = () => {
  const { control } = useFormContext<TSecretScanningDataSourceForm>();
  const type = useWatch({ control, name: "type" });

  const Component = CONNECTION_COMPONENT_MAP[type];

  return (
    <FieldGroup>
      <Component />
    </FieldGroup>
  );
};

type TScanToggleName = "isHistoricalScanEnabled" | "isScanNewCommitsEnabled" | "isDiscoveryEnabled";

const ScanToggleField = ({
  name,
  label,
  description,
  isDisabled
}: {
  name: TScanToggleName;
  label: string;
  description: string;
  isDisabled?: boolean;
}) => {
  const { control } = useFormContext<TSecretScanningDataSourceForm>();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
        <Field data-invalid={Boolean(error)} data-disabled={isDisabled}>
          <Field orientation="horizontal">
            <FieldContent>
              <Label htmlFor={name}>{label}</Label>
              <FieldDescription id={`${name}-help`}>{description}</FieldDescription>
            </FieldContent>
            <Toggle
              ref={ref}
              name={name}
              id={name}
              variant="ss"
              checked={value && !isDisabled}
              onCheckedChange={onChange}
              onBlur={onBlur}
              disabled={isDisabled}
              aria-describedby={`${name}-help`}
            />
          </Field>
          <FieldError errors={[error]} />
        </Field>
      )}
    />
  );
};

export const SecretScanningDataSourceScanFields = () => {
  const { control } = useFormContext<TSecretScanningDataSourceForm>();
  const type = useWatch({ control, name: "type" });
  const config = useWatch({ control, name: "config" });

  const { name: platform } = SECRET_SCANNING_DATA_SOURCE_MAP[type];
  const { singularNoun, pluralNoun, pluralTitle } = RESOURCE_DESCRIPTION_HELPER[type];
  const supportsDiscovery = doesDataSourceSupportDiscovery({ type, config });

  return (
    <FieldGroup>
      <ScanToggleField
        name="isHistoricalScanEnabled"
        label="Trigger Historical Scan"
        description={`Scan recently added ${pluralNoun} for existing secrets as soon as they're enabled.`}
      />
      <ScanToggleField
        name="isScanNewCommitsEnabled"
        label="Scan New Commits"
        description={`Trigger a diff scan on every new commit, across new and existing ${pluralNoun}.`}
      />
      <ScanToggleField
        name="isDiscoveryEnabled"
        label={`Discover New ${pluralTitle}`}
        isDisabled={!supportsDiscovery}
        description={
          supportsDiscovery
            ? `Add every ${singularNoun} the connection can access to this data source, and any created in ${platform} later.`
            : "Select a group in the previous step to enable this. GitLab only reports new projects through group webhooks."
        }
      />
    </FieldGroup>
  );
};

export const SecretScanningDataSourceConfigFields = () => (
  <FieldGroup>
    <SecretScanningDataSourceConnectionFields />
    <SecretScanningDataSourceScanFields />
  </FieldGroup>
);
