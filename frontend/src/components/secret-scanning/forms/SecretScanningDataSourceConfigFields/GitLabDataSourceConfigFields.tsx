import { useMemo, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import {
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
  RadioGroup,
  RadioGroupItem
} from "@app/components/v3";
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

const GITLAB_DATA_SOURCE_LIST_LIMIT = 20;

const SEARCH_HELP =
  "Only the first results are shown. Search by name to find more. The connection must have access to it.";

const SCOPE_OPTIONS = [
  {
    scope: GitLabDataSourceScope.Project,
    title: "Project",
    description: "Scan a single GitLab project."
  },
  {
    scope: GitLabDataSourceScope.Group,
    title: "Group",
    description:
      "Scan projects in a GitLab group. Required to scan projects added to the group later."
  }
];

type TGitLabForm = TSecretScanningDataSourceForm & { type: SecretScanningDataSource.GitLab };

export const GitLabDataSourceConnectionFields = () => {
  const { control, setValue } = useFormContext<TGitLabForm>();

  const connectionId = useWatch({ control, name: "connection.id" });
  const isUpdate = Boolean(useWatch({ control, name: "id" }));
  const scope = useWatch({ control, name: "config.scope" });
  const groupId = useWatch({ control, name: "config.groupId" });
  const groupName = useWatch({ control, name: "config.groupName" });
  const projectId = useWatch({ control, name: "config.projectId" });
  const projectName = useWatch({ control, name: "config.projectName" });

  const [projectSearch, setProjectSearch] = useState("");
  const [debouncedProjectSearch] = useDebounce(projectSearch, 300);
  const [groupSearch, setGroupSearch] = useState("");
  const [debouncedGroupSearch] = useDebounce(groupSearch, 300);

  const { data: projects, isPending: isProjectsPending } = useGitLabConnectionListProjects(
    connectionId,
    debouncedProjectSearch || undefined,
    GITLAB_DATA_SOURCE_LIST_LIMIT,
    { enabled: Boolean(connectionId) && scope === GitLabDataSourceScope.Project }
  );

  const { data: groups, isPending: isGroupsPending } = useGitLabConnectionListGroups(
    connectionId,
    debouncedGroupSearch || undefined,
    GITLAB_DATA_SOURCE_LIST_LIMIT,
    { enabled: Boolean(connectionId) && scope === GitLabDataSourceScope.Group }
  );

  const groupOptions = useMemo(() => {
    const results = groups ?? [];
    if (groupId && groupName && !results.some((group) => Number(group.id) === groupId)) {
      return [
        { id: String(groupId), name: groupName, fullName: groupName, fullPath: groupName },
        ...results
      ];
    }
    return results;
  }, [groups, groupId, groupName]);

  const projectOptions = useMemo(() => {
    const results = projects ?? [];
    if (projectId && projectName && !results.some((project) => Number(project.id) === projectId)) {
      return [{ id: String(projectId), name: projectName }, ...results];
    }
    return results;
  }, [projects, projectId, projectName]);

  const clearConfig = () => {
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
      <SecretScanningDataSourceConnectionField isUpdate={isUpdate} onChange={clearConfig} />
      <Controller
        name="config.scope"
        control={control}
        render={({ field: { value, onChange } }) => (
          <FieldSet>
            <FieldLegend variant="label">Scope</FieldLegend>
            <RadioGroup
              value={value}
              onValueChange={(newScope) => {
                onChange(newScope);
                clearConfig();
                setValue("isDiscoveryEnabled", newScope === GitLabDataSourceScope.Group);
              }}
              disabled={isUpdate}
            >
              {SCOPE_OPTIONS.map((option) => (
                <FieldLabel
                  key={option.scope}
                  htmlFor={`secret-scanning-gitlab-scope-${option.scope}`}
                  variant="project"
                >
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldTitle>{option.title}</FieldTitle>
                      <FieldDescription>{option.description}</FieldDescription>
                    </FieldContent>
                    <RadioGroupItem
                      value={option.scope}
                      id={`secret-scanning-gitlab-scope-${option.scope}`}
                    />
                  </Field>
                </FieldLabel>
              ))}
            </RadioGroup>
            {isUpdate && <FieldDescription>Cannot be updated.</FieldDescription>}
          </FieldSet>
        )}
      />
      {scope === GitLabDataSourceScope.Project ? (
        <Controller
          name="config.projectId"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabel
                id="secret-scanning-gitlab-project-label"
                htmlFor="secret-scanning-gitlab-project"
              >
                Project
              </FieldLabel>
              <FieldContent>
                <Combobox<TGitLabProject>
                  id="secret-scanning-gitlab-project"
                  aria-labelledby="secret-scanning-gitlab-project-label"
                  aria-describedby="secret-scanning-gitlab-project-help"
                  isError={Boolean(error)}
                  isLoading={isProjectsPending && Boolean(connectionId)}
                  isDisabled={!connectionId || isUpdate}
                  isClearable={false}
                  value={projectOptions.find((project) => Number(project.id) === value) ?? null}
                  onValueChange={(project) => {
                    onChange(Number(project.id));
                    setValue("config.projectName", project.name);
                  }}
                  onInputValueChange={setProjectSearch}
                  shouldFilter={false}
                  options={projectOptions}
                  placeholder="Search for a project..."
                  searchAriaLabel="Search projects"
                  getOptionLabel={(option) => option.name}
                  getOptionValue={(option) => option.id}
                  emptyMessage={(inputValue) =>
                    inputValue ? "No projects found matching your search." : "No projects found."
                  }
                  modal
                />
                <FieldDescription id="secret-scanning-gitlab-project-help">
                  {SEARCH_HELP}
                </FieldDescription>
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
      ) : (
        <Controller
          name="config.groupId"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabel
                id="secret-scanning-gitlab-group-label"
                htmlFor="secret-scanning-gitlab-group"
              >
                Group
              </FieldLabel>
              <FieldContent>
                <Combobox<TGitLabGroup>
                  id="secret-scanning-gitlab-group"
                  aria-labelledby="secret-scanning-gitlab-group-label"
                  aria-describedby="secret-scanning-gitlab-group-help"
                  isError={Boolean(error)}
                  isLoading={isGroupsPending && Boolean(connectionId)}
                  isDisabled={!connectionId || isUpdate}
                  isClearable={false}
                  value={groupOptions.find((group) => Number(group.id) === value) ?? null}
                  onValueChange={(group) => {
                    onChange(Number(group.id));
                    setValue("config.groupName", group.fullName);
                    setValue("config.includeProjects", []);
                  }}
                  onInputValueChange={setGroupSearch}
                  shouldFilter={false}
                  options={groupOptions}
                  placeholder="Search for a group..."
                  searchAriaLabel="Search groups"
                  getOptionLabel={(option) => option.fullPath}
                  getOptionValue={(option) => option.id}
                  emptyMessage={(inputValue) =>
                    inputValue ? "No groups found matching your search." : "No groups found."
                  }
                  modal
                />
                <FieldDescription id="secret-scanning-gitlab-group-help">
                  {SEARCH_HELP}
                </FieldDescription>
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
      )}
    </>
  );
};
