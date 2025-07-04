import { useEffect } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { MultiValue, SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { FilterableSelect, FormControl, Select, SelectItem, Tooltip } from "@app/components/v2";
import {
  TBitbucketRepo,
  TBitbucketWorkspace,
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

export const BitbucketDataSourceConfigFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretScanningDataSourceForm & {
      type: SecretScanningDataSource.Bitbucket;
    }
  >();

  const connectionId = useWatch({ control, name: "connection.id" });
  const isUpdate = Boolean(watch("id"));

  const selectedWorkspaceSlug = useWatch({ control, name: "config.workspaceSlug" });

  const { data: workspaces, isPending: areWorkspacesLoading } =
    useBitbucketConnectionListWorkspaces(connectionId, { enabled: Boolean(connectionId) });

  const { data: repositories, isPending: areRepositoriesLoading } =
    useBitbucketConnectionListRepositories(connectionId, selectedWorkspaceSlug, {
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
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Workspace"
            helperText={
              <Tooltip
                className="max-w-md"
                content={<>Ensure that your connection has the correct permissions.</>}
              >
                <div>
                  <span>Don&#39;t see the workspaces you&#39;re looking for?</span>{" "}
                  <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                </div>
              </Tooltip>
            }
          >
            <FilterableSelect
              menuPlacement="top"
              isLoading={areWorkspacesLoading && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={value ? { slug: value } : null}
              onChange={(newValue) => {
                onChange((newValue as SingleValue<TBitbucketWorkspace>)?.slug);
                if (scanMethod === ScanMethod.SelectRepositories) {
                  setValue("config.includeRepos", []);
                }
              }}
              options={workspaces}
              placeholder="Select workspace..."
              getOptionLabel={(option) => option.slug}
              getOptionValue={(option) => option.slug}
            />
          </FormControl>
        )}
      />
      <FormControl label="Scan Repositories">
        <Select
          value={scanMethod}
          onValueChange={(val) => {
            setValue("config.includeRepos", val === ScanMethod.AllRepositories ? ["*"] : []);
          }}
          className="w-full border border-mineshaft-500 capitalize"
          position="popper"
          dropdownContainerClassName="max-w-none"
          isDisabled={!connectionId}
        >
          {Object.values(ScanMethod).map((method) => {
            return (
              <SelectItem className="capitalize" value={method} key={method}>
                {method.replace("-", " ")}
              </SelectItem>
            );
          })}
        </Select>
      </FormControl>
      {scanMethod === ScanMethod.SelectRepositories && (
        <Controller
          name="config.includeRepos"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              isError={Boolean(error)}
              errorText={error?.message}
              label="Include Repositories"
              helperText={
                <Tooltip
                  className="max-w-md"
                  content={<>Ensure that your connection has the correct permissions.</>}
                >
                  <div>
                    <span>Don&#39;t see the repository you&#39;re looking for?</span>{" "}
                    <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                  </div>
                </Tooltip>
              }
            >
              <FilterableSelect
                menuPlacement="top"
                isLoading={areRepositoriesLoading && Boolean(connectionId)}
                isDisabled={!connectionId || !selectedWorkspaceSlug}
                isMulti
                value={repositories?.filter((repository) =>
                  (value as string[]).includes(repository.full_name)
                )}
                onChange={(newValue) => {
                  onChange(
                    newValue ? (newValue as MultiValue<TBitbucketRepo>).map((p) => p.full_name) : []
                  );
                }}
                options={repositories}
                placeholder="Select repositories..."
                getOptionLabel={(option) => option.full_name}
                getOptionValue={(option) => option.full_name}
              />
            </FormControl>
          )}
        />
      )}
    </>
  );
};
