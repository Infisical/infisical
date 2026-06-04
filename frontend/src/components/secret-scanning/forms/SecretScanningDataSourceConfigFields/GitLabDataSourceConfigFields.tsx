import { useEffect, useMemo, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { MultiValue, SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { FilterableSelect, FormControl, Select, SelectItem, Tooltip } from "@app/components/v2";
import { useDebounce } from "@app/hooks";
import {
  TGitLabGroup,
  TGitLabProject,
  useGitLabConnectionListGroups,
  useGitLabConnectionListProjects
} from "@app/hooks/api/appConnections/gitlab";
import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";
import { GitLabDataSourceScope } from "@app/hooks/api/secretScanningV2/types/gitlab-data-source";

import { TSecretScanningDataSourceForm } from "../schemas";
import { SecretScanningDataSourceConnectionField } from "../SecretScanningDataSourceConnectionField";

enum ScanMethod {
  AllProjects = "all-projects",
  SelectProjects = "select-projects"
}

const GITLAB_DATA_SOURCE_LIST_LIMIT = 20;

const formatGitLabGroupOptionLabel = (group: TGitLabGroup) => (
  <div className="flex min-w-0 items-center gap-2">
    <span className="shrink-0">{group.name}</span>
    {group.fullPath !== group.name && (
      <span className="min-w-0 truncate text-mineshaft-400">{group.fullPath}</span>
    )}
  </div>
);

const formatGitLabProjectOptionLabel = (project: TGitLabProject) => {
  const fullPathWithNamespace = project.name;
  const shortName = fullPathWithNamespace.split("/").pop() || fullPathWithNamespace;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0">{shortName}</span>
      {fullPathWithNamespace !== shortName && (
        <span className="min-w-0 truncate text-mineshaft-400">{fullPathWithNamespace}</span>
      )}
    </div>
  );
};

export const GitLabDataSourceConfigFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretScanningDataSourceForm & {
      type: SecretScanningDataSource.GitLab;
    }
  >();

  const connectionId = useWatch({ control, name: "connection.id" });
  const isUpdate = Boolean(watch("id"));

  const scope = watch("config.scope");
  const groupName = watch("config.groupName");
  const includeProjects = watch("config.includeProjects");
  const projectId = watch("config.projectId");
  const projectName = watch("config.projectName");
  const groupId = watch("config.groupId");

  const [projectSearch, setProjectSearch] = useState("");
  const [debouncedProjectSearch] = useDebounce(projectSearch, 300);
  const [groupSearch, setGroupSearch] = useState("");
  const [debouncedGroupSearch] = useDebounce(groupSearch, 300);

  const { data: projects, isPending: isProjectsPending } = useGitLabConnectionListProjects(
    connectionId,
    debouncedProjectSearch || undefined,
    GITLAB_DATA_SOURCE_LIST_LIMIT,
    { enabled: Boolean(connectionId) }
  );

  const { data: groups, isPending: isGroupsPending } = useGitLabConnectionListGroups(
    connectionId,
    debouncedGroupSearch || undefined,
    GITLAB_DATA_SOURCE_LIST_LIMIT,
    {
      enabled: Boolean(connectionId) && scope === GitLabDataSourceScope.Group
    }
  );

  const groupOptions = useMemo(() => {
    const results = groups ?? [];
    if (
      groupId &&
      groupName &&
      !results.some((group) => Number.parseInt(group.id, 10) === groupId)
    ) {
      return [
        { id: String(groupId), name: groupName, fullName: groupName, fullPath: groupName },
        ...results
      ];
    }
    return results;
  }, [groups, groupId, groupName]);

  const projectOptions = useMemo(() => {
    const results = projects ?? [];
    if (
      projectId &&
      projectName &&
      !results.some((project) => Number.parseInt(project.id, 10) === projectId)
    ) {
      return [{ id: String(projectId), name: projectName }, ...results];
    }
    return results;
  }, [projects, projectId, projectName]);

  const includeProjectOptions = useMemo(() => {
    const selectedGroupPath = (groups ?? []).find(
      (group) => Number.parseInt(group.id, 10) === groupId
    )?.fullPath;
    const filtered = (projects ?? []).filter(
      (project) => !selectedGroupPath || project.name.startsWith(`${selectedGroupPath}/`)
    );
    const missing = (includeProjects ?? [])
      .filter((name) => name !== "*" && !filtered.some((project) => project.name === name))
      .map((name) => ({ id: name, name }));
    return [...missing, ...filtered];
  }, [projects, groups, groupId, includeProjects]);

  const scanMethod =
    !includeProjects || includeProjects.includes("*")
      ? ScanMethod.AllProjects
      : ScanMethod.SelectProjects;

  useEffect(() => {
    if (!includeProjects) {
      setValue("config.includeProjects", ["*"]);
    }
  }, [includeProjects]);

  const clearAllFields = () => {
    setValue("config.includeProjects", []);
    setValue("config.projectName", "");
    setValue("config.groupName", "");
    // @ts-expect-error rhf doesn't like this but we need to reset
    setValue("config.projectId", undefined);
    // @ts-expect-error rhf doesn't like this but we need to reset
    setValue("config.groupId", undefined);
    setProjectSearch("");
    setGroupSearch("");
  };

  return (
    <>
      <SecretScanningDataSourceConnectionField isUpdate={isUpdate} onChange={clearAllFields} />
      <Controller
        name="config.scope"
        control={control}
        defaultValue={GitLabDataSourceScope.Project}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Scope"
            helperText={isUpdate ? "Cannot be updated" : undefined}
            tooltipText={
              <div className="flex flex-col gap-3">
                <p>Specify the GitLab scope scanning should be performed at:</p>
                <ul className="flex list-disc flex-col gap-3 pl-4">
                  <li>
                    <p className="text-mineshaft-300">
                      <span className="font-medium text-bunker-200">Project</span>: Scan an
                      individual GitLab project.
                    </p>
                  </li>
                  <li>
                    <p className="text-mineshaft-300">
                      <span className="font-medium text-bunker-200">Group</span>: Scan one or more
                      projects belonging to a GitLab group.
                    </p>
                  </li>
                </ul>
              </div>
            }
          >
            <Select
              value={value}
              onValueChange={(v) => {
                onChange(v);
                clearAllFields();
              }}
              className="w-full border border-mineshaft-500 capitalize"
              position="popper"
              isDisabled={isUpdate}
              dropdownContainerClassName="max-w-none"
            >
              {Object.values(GitLabDataSourceScope).map((method) => {
                return (
                  <SelectItem className="capitalize" value={method} key={method}>
                    {method}
                  </SelectItem>
                );
              })}
            </Select>
          </FormControl>
        )}
      />
      {scope === GitLabDataSourceScope.Project ? (
        <Controller
          name="config.projectId"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              isError={Boolean(error)}
              errorText={error?.message}
              label="Project"
              helperText={
                <Tooltip
                  className="max-w-md"
                  content={
                    <>
                      Ensure the project exists in the connection&apos;s GitLab instance URL and the
                      connection has access to it. Only the first results are shown, search by name
                      to find more.
                    </>
                  }
                >
                  <div>
                    <span>Don&#39;t see the project you&#39;re looking for?</span>{" "}
                    <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                  </div>
                </Tooltip>
              }
            >
              <FilterableSelect
                isLoading={isProjectsPending && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={projectOptions.find((project) => value === Number.parseInt(project.id, 10))}
                onChange={(newValue) => {
                  const project = newValue as SingleValue<TGitLabProject>;

                  onChange(project ? Number.parseInt(project.id, 10) : null);
                  setValue("config.projectName", project?.name ?? "");
                }}
                onInputChange={(newValue) => setProjectSearch(newValue)}
                filterOption={null}
                options={projectOptions}
                placeholder="Search for a project..."
                getOptionLabel={(option) => {
                  const shortName = option.name.split("/").pop() || option.name;
                  return `${shortName} · ${option.name}`;
                }}
                formatOptionLabel={formatGitLabProjectOptionLabel}
                getOptionValue={(option) => option.name}
              />
            </FormControl>
          )}
        />
      ) : (
        <>
          <Controller
            name="config.groupId"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                isError={Boolean(error)}
                errorText={error?.message}
                label="Group"
                helperText={
                  <Tooltip
                    className="max-w-md"
                    content={
                      <>
                        Ensure the group exists in the connection&apos;s GitLab instance URL and the
                        connection has access to it. Only the first results are shown, search by
                        name to find more.
                      </>
                    }
                  >
                    <div>
                      <span>Don&#39;t see the group you&#39;re looking for?</span>{" "}
                      <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                    </div>
                  </Tooltip>
                }
              >
                <FilterableSelect
                  isLoading={isGroupsPending && Boolean(connectionId)}
                  isDisabled={!connectionId}
                  value={groupOptions.find((group) => value === Number.parseInt(group.id, 10))}
                  onChange={(newValue) => {
                    const group = newValue as SingleValue<TGitLabGroup>;

                    onChange(group ? Number.parseInt(group.id, 10) : null);
                    setValue("config.groupName", group?.fullName ?? "");
                    setValue("config.includeProjects", ["*"]);
                  }}
                  onInputChange={(newValue) => setGroupSearch(newValue)}
                  filterOption={null}
                  options={groupOptions}
                  placeholder="Search for a group..."
                  getOptionLabel={(option) => `${option.name} · ${option.fullPath}`}
                  formatOptionLabel={formatGitLabGroupOptionLabel}
                  getOptionValue={(option) => option.id}
                />
              </FormControl>
            )}
          />
          <FormControl label="Scan Projects">
            <Select
              value={scanMethod}
              onValueChange={(val) => {
                setValue("config.includeProjects", val === ScanMethod.AllProjects ? ["*"] : []);
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
                      content={
                        <>
                          Ensure the project exists in the connection&apos;s GitLab instance URL and
                          the connection has access to it. Only the first results are shown, search
                          by name to find more.
                        </>
                      }
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
                    isDisabled={!connectionId || !groupName}
                    isMulti
                    value={includeProjectOptions.filter((project) => value.includes(project.name))}
                    onChange={(newValue) => {
                      onChange(
                        newValue
                          ? (newValue as MultiValue<TGitLabProject>).map((p) => p.name)
                          : null
                      );
                    }}
                    onInputChange={(newValue) => setProjectSearch(newValue)}
                    filterOption={null}
                    options={includeProjectOptions}
                    placeholder="Search for projects..."
                    getOptionLabel={(option) => {
                      const shortName = option.name.split("/").pop() || option.name;
                      return `${shortName} · ${option.name}`;
                    }}
                    formatOptionLabel={formatGitLabProjectOptionLabel}
                    getOptionValue={(option) => option.name}
                  />
                </FormControl>
              )}
            />
          )}
        </>
      )}
    </>
  );
};
