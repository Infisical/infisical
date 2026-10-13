import { useEffect } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { InfoIcon } from "lucide-react";

import {
  Combobox,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  IconButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useGitHubRadarConnectionListRepositories } from "@app/hooks/api/appConnections/github-radar";
import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";

import { TSecretScanningDataSourceForm } from "../schemas";
import { SecretScanningDataSourceConnectionField } from "../SecretScanningDataSourceConnectionField";

enum ScanMethod {
  AllRepositories = "all-repositories",
  SelectRepositories = "select-repositories"
}

const SCAN_METHOD_LABELS: Record<ScanMethod, string> = {
  [ScanMethod.AllRepositories]: "All Repositories",
  [ScanMethod.SelectRepositories]: "Select Repositories"
};

export const GitHubDataSourceConfigFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretScanningDataSourceForm & {
      type: SecretScanningDataSource.GitHub;
    }
  >();

  const connectionId = useWatch({ control, name: "connection.id" });
  const isUpdate = Boolean(watch("id"));

  const { data: repositories, isPending: areRepositoriesLoading } =
    useGitHubRadarConnectionListRepositories(connectionId, { enabled: Boolean(connectionId) });

  const includeRepos = watch("config.includeRepos");

  const scanMethod =
    !includeRepos || includeRepos[0] === "*"
      ? ScanMethod.AllRepositories
      : ScanMethod.SelectRepositories;

  useEffect(() => {
    if (!includeRepos) {
      setValue("config.includeRepos", ["*"]);
    }
  }, [includeRepos, setValue]);

  return (
    <>
      <SecretScanningDataSourceConnectionField
        isUpdate={isUpdate}
        onChange={() => {
          if (scanMethod === ScanMethod.SelectRepositories) {
            setValue("config.includeRepos", []);
          }
        }}
      />
      <Field className="mb-4" data-disabled={!connectionId}>
        <FieldLabel htmlFor="github-data-source-scan-method">Scan Repositories</FieldLabel>
        <Select
          value={scanMethod}
          onValueChange={(val) => {
            setValue("config.includeRepos", val === ScanMethod.AllRepositories ? ["*"] : []);
          }}
          disabled={!connectionId}
        >
          <SelectTrigger id="github-data-source-scan-method" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {Object.values(ScanMethod).map((method) => (
              <SelectItem value={method} key={method}>
                {SCAN_METHOD_LABELS[method]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {scanMethod === ScanMethod.SelectRepositories && (
        <Controller
          name="config.includeRepos"
          defaultValue={["*"]}
          control={control}
          render={({ field: { value, onChange, onBlur, name }, fieldState: { error } }) => (
            <Field className="mb-4" data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="github-data-source-include-repositories">
                Include Repositories
              </FieldLabel>
              <Combobox
                id="github-data-source-include-repositories"
                name={name}
                onBlur={onBlur}
                multiple
                isLoading={areRepositoriesLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                isError={Boolean(error)}
                value={repositories?.filter((repository) => value.includes(repository.name)) ?? []}
                onValueChange={(newValue) => onChange(newValue.map((p) => p.name))}
                options={repositories ?? []}
                placeholder="Select repositories..."
                searchAriaLabel="Search repositories"
                loadingMessage="Loading repositories..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.name}
                aria-describedby={`github-data-source-include-repositories-help${error ? " github-data-source-include-repositories-error" : ""}`}
              />
              <FieldDescription
                id="github-data-source-include-repositories-help"
                className="flex items-center gap-1"
              >
                Don&apos;t see the repository you&apos;re looking for?
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconButton
                      type="button"
                      variant="ghost-muted"
                      size="2xs"
                      aria-label="About missing repositories"
                    >
                      <InfoIcon />
                    </IconButton>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-md">
                    Ensure that your connection has the correct permissions.
                  </TooltipContent>
                </Tooltip>
              </FieldDescription>
              <FieldError id="github-data-source-include-repositories-error">
                {error?.message}
              </FieldError>
            </Field>
          )}
        />
      )}
    </>
  );
};
