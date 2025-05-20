import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Controller, useFormContext } from "react-hook-form";

import { FilterableSelect, FormControl, Select, SelectItem, Tooltip } from "@app/components/v2";
import {
  TGitLabConnectionProject,
  useGitLabConnectListProjects
} from "@app/hooks/api/appConnections/gitlab";
import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";
import { useEffect } from "react";
import { MultiValue } from "react-select";
import { TSecretScanningDataSourceForm } from "../schemas";

enum ScanMethod {
  AllProjects = "all-projects",
  SelectProjects = "select-projects"
}

export const GitLabDataSourceConfigFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretScanningDataSourceForm & {
      type: SecretScanningDataSource.GitLab;
    }
  >();

  const connectionId = watch("connection.id");

  const { data: projects, isPending: isProjectsPending } = useGitLabConnectListProjects(
    connectionId,
    { enabled: Boolean(connectionId) }
  );

  const includeProjects = watch("config.includeProjects");

  const scanMethod =
    !includeProjects || includeProjects[0] === "*"
      ? ScanMethod.AllProjects
      : ScanMethod.SelectProjects;

  useEffect(() => {
    if (!includeProjects) {
      setValue("config.includeProjects", ["*"]);
    }
  }, [includeProjects]);

  return (
    <>
      <FormControl label="Scan Projects">
        <Select
          value={scanMethod}
          onValueChange={(val) => {
            setValue("config.includeProjects", val === ScanMethod.AllProjects ? ["*"] : []);
          }}
          className="w-full border border-mineshaft-500 capitalize"
          position="popper"
          dropdownContainerClassName="max-w-none"
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
      {scanMethod === ScanMethod.SelectProjects && (
        <Controller
          name="config.includeProjects"
          defaultValue={["*"]}
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              isError={Boolean(error)}
              errorText={error?.message}
              label="Include Projects"
              helperText={
                <Tooltip
                  className="max-w-md"
                  content={<>Ensure that your connection has the correct permissions.</>}
                >
                  <div>
                    <span>Don&#39;t see the project you&#39;re looking for?</span>{" "}
                    <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                  </div>
                </Tooltip>
              }
            >
              <FilterableSelect
                menuPlacement="top"
                isLoading={isProjectsPending && Boolean(connectionId)}
                isDisabled={!connectionId}
                isMulti
                value={projects?.find((project) => value.includes(project.name))}
                onChange={(newValue) => {
                  onChange(
                    newValue
                      ? (newValue as MultiValue<TGitLabConnectionProject>).map((p) => p.name)
                      : null
                  );
                }}
                options={projects}
                placeholder="Select projects..."
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
