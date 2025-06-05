import { useEffect } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { MultiValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { FilterableSelect, FormControl, Select, SelectItem, Tooltip } from "@app/components/v2";
import {
  TGitHubRadarConnectionRepository,
  useGitHubRadarConnectionListRepositories
} from "@app/hooks/api/appConnections/github-radar";
import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";

import { TSecretScanningDataSourceForm } from "../schemas";
import { SecretScanningDataSourceConnectionField } from "../SecretScanningDataSourceConnectionField";

enum ScanMethod {
  AllRepositories = "all-repositories",
  SelectRepositories = "select-repositories"
}

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
          defaultValue={["*"]}
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
                isDisabled={!connectionId}
                isMulti
                value={repositories?.filter((repository) => value.includes(repository.name))}
                onChange={(newValue) => {
                  onChange(
                    newValue
                      ? (newValue as MultiValue<TGitHubRadarConnectionRepository>).map(
                          (p) => p.name
                        )
                      : null
                  );
                }}
                options={repositories}
                placeholder="Select repositories..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.name}
              />
            </FormControl>
          )}
        />
      )}
    </>
  );
};
