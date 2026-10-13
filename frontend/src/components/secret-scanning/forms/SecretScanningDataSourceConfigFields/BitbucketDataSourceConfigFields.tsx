import { useEffect, useState } from "react";
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
import { useDebounce } from "@app/hooks";
import {
  useBitbucketConnectionListRepositories,
  useBitbucketConnectionListWorkspaces
} from "@app/hooks/api/appConnections/bitbucket";
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

const MissingOptionHelp = ({ id, subject }: { id: string; subject: string }) => (
  <FieldDescription id={id} className="flex items-center gap-1">
    Don&apos;t see the {subject} you&apos;re looking for?
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton
          type="button"
          variant="ghost-muted"
          size="2xs"
          aria-label={`About missing ${subject}`}
        >
          <InfoIcon />
        </IconButton>
      </TooltipTrigger>
      <TooltipContent className="max-w-md">
        Ensure that your connection has the correct permissions.
      </TooltipContent>
    </Tooltip>
  </FieldDescription>
);

export const BitbucketDataSourceConfigFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretScanningDataSourceForm & {
      type: SecretScanningDataSource.Bitbucket;
    }
  >();

  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [debouncedWorkspaceSearch] = useDebounce(workspaceSearch, 300);

  const connectionId = useWatch({ control, name: "connection.id" });
  const isUpdate = Boolean(watch("id"));

  const selectedWorkspaceSlug = useWatch({ control, name: "config.workspaceSlug" });

  const { data: workspaces, isPending: areWorkspacesLoading } =
    useBitbucketConnectionListWorkspaces(connectionId, debouncedWorkspaceSearch || undefined, {
      enabled: Boolean(connectionId)
    });

  const { data: repositories, isPending: areRepositoriesLoading } =
    useBitbucketConnectionListRepositories(connectionId, selectedWorkspaceSlug, undefined, {
      enabled: Boolean(connectionId) && Boolean(selectedWorkspaceSlug)
    });

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
            setValue("config.workspaceSlug", "");
            setValue("config.includeRepos", []);
          }
        }}
      />
      <Controller
        name="config.workspaceSlug"
        control={control}
        render={({ field: { value, onChange, onBlur, name }, fieldState: { error } }) => (
          <Field className="mb-4" data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="bitbucket-data-source-workspace">Workspace</FieldLabel>
            <Combobox
              id="bitbucket-data-source-workspace"
              name={name}
              onBlur={onBlur}
              isClearable={false}
              isLoading={areWorkspacesLoading && Boolean(connectionId)}
              isDisabled={!connectionId}
              isError={Boolean(error)}
              value={value ? { slug: value } : null}
              onValueChange={(newValue) => {
                onChange(newValue.slug);
                if (scanMethod === ScanMethod.SelectRepositories) {
                  setValue("config.includeRepos", []);
                }
              }}
              onSearchChange={setWorkspaceSearch}
              options={workspaces ?? []}
              placeholder="Search for a workspace..."
              searchAriaLabel="Search workspaces"
              loadingMessage="Loading workspaces..."
              getOptionLabel={(option) => option.slug}
              getOptionValue={(option) => option.slug}
              emptyMessage={(inputValue) =>
                inputValue ? "No workspaces found matching your search." : "No workspaces found."
              }
              aria-describedby={`bitbucket-data-source-workspace-help${error ? " bitbucket-data-source-workspace-error" : ""}`}
            />
            <MissingOptionHelp id="bitbucket-data-source-workspace-help" subject="workspaces" />
            <FieldError id="bitbucket-data-source-workspace-error">{error?.message}</FieldError>
          </Field>
        )}
      />
      <Field className="mb-4" data-disabled={!connectionId}>
        <FieldLabel htmlFor="bitbucket-data-source-scan-method">Scan Repositories</FieldLabel>
        <Select
          value={scanMethod}
          onValueChange={(val) => {
            setValue("config.includeRepos", val === ScanMethod.AllRepositories ? ["*"] : []);
          }}
          disabled={!connectionId}
        >
          <SelectTrigger id="bitbucket-data-source-scan-method" className="w-full">
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
          control={control}
          render={({ field: { value, onChange, onBlur, name }, fieldState: { error } }) => (
            <Field className="mb-4" data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="bitbucket-data-source-include-repositories">
                Include Repositories
              </FieldLabel>
              <Combobox
                id="bitbucket-data-source-include-repositories"
                name={name}
                onBlur={onBlur}
                multiple
                isLoading={areRepositoriesLoading && Boolean(connectionId)}
                isDisabled={!connectionId || !selectedWorkspaceSlug}
                isError={Boolean(error)}
                value={
                  repositories?.filter((repository) =>
                    (value as string[]).includes(repository.full_name)
                  ) ?? []
                }
                onValueChange={(newValue) => onChange(newValue.map((p) => p.full_name))}
                options={repositories ?? []}
                placeholder="Select repositories..."
                searchAriaLabel="Search repositories"
                loadingMessage="Loading repositories..."
                getOptionLabel={(option) => option.full_name}
                getOptionValue={(option) => option.full_name}
                aria-describedby={`bitbucket-data-source-include-repositories-help${error ? " bitbucket-data-source-include-repositories-error" : ""}`}
              />
              <MissingOptionHelp
                id="bitbucket-data-source-include-repositories-help"
                subject="repository"
              />
              <FieldError id="bitbucket-data-source-include-repositories-error">
                {error?.message}
              </FieldError>
            </Field>
          )}
        />
      )}
    </>
  );
};
