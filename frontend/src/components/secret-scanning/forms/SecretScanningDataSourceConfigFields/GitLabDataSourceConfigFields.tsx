import { useEffect, useMemo, useState } from "react";
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

const SCAN_METHOD_LABELS: Record<ScanMethod, string> = {
  [ScanMethod.AllProjects]: "All Projects",
  [ScanMethod.SelectProjects]: "Select Projects"
};

const SCOPE_LABELS: Record<GitLabDataSourceScope, string> = {
  [GitLabDataSourceScope.Project]: "Project",
  [GitLabDataSourceScope.Group]: "Group"
};

const GITLAB_DATA_SOURCE_LIST_LIMIT = 20;

const getGitLabProjectOptionLabel = (project: TGitLabProject) => {
  const shortName = project.name.split("/").pop() || project.name;
  return `${shortName} · ${project.name}`;
};

const MissingOptionHelp = ({ id, subject }: { id: string; subject: "project" | "group" }) => (
  <FieldDescription id={id} className="flex items-center gap-1">
    Don&apos;t see the {subject} you&apos;re looking for?
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton
          type="button"
          variant="ghost-muted"
          size="2xs"
          aria-label={`About missing ${subject}s`}
        >
          <InfoIcon />
        </IconButton>
      </TooltipTrigger>
      <TooltipContent className="max-w-md">
        Ensure the {subject} exists in the connection&apos;s GitLab instance URL and the connection
        has access to it. Only the first results are shown, search by name to find more.
      </TooltipContent>
    </Tooltip>
  </FieldDescription>
);

const formatGitLabGroupOptionLabel = (group: TGitLabGroup) => (
  <div className="flex min-w-0 items-center gap-2">
    <span className="shrink-0">{group.name}</span>
    {group.fullPath !== group.name && (
      <span className="min-w-0 truncate text-muted">{group.fullPath}</span>
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
        <span className="min-w-0 truncate text-muted">{fullPathWithNamespace}</span>
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
          <Field className="mb-4" data-invalid={Boolean(error)} data-disabled={isUpdate}>
            <div className="flex items-center gap-1">
              <FieldLabel htmlFor="gitlab-data-source-scope">Scope</FieldLabel>
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton
                    type="button"
                    variant="ghost-muted"
                    size="2xs"
                    aria-label="About GitLab scopes"
                  >
                    <InfoIcon />
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  <div className="flex flex-col gap-3">
                    <p>Specify the GitLab scope scanning should be performed at:</p>
                    <ul className="flex list-disc flex-col gap-3 pl-4">
                      <li>
                        <span className="font-medium">Project</span>: Scan an individual GitLab
                        project.
                      </li>
                      <li>
                        <span className="font-medium">Group</span>: Scan one or more projects
                        belonging to a GitLab group.
                      </li>
                    </ul>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
            <Select
              value={value}
              onValueChange={(v) => {
                onChange(v);
                clearAllFields();
              }}
              disabled={isUpdate}
            >
              <SelectTrigger
                id="gitlab-data-source-scope"
                className="w-full"
                isError={Boolean(error)}
                aria-describedby={`gitlab-data-source-scope-help${error ? " gitlab-data-source-scope-error" : ""}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {Object.values(GitLabDataSourceScope).map((method) => (
                  <SelectItem value={method} key={method}>
                    {SCOPE_LABELS[method]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription id="gitlab-data-source-scope-help">
              {isUpdate ? "Cannot be updated" : undefined}
            </FieldDescription>
            <FieldError id="gitlab-data-source-scope-error">{error?.message}</FieldError>
          </Field>
        )}
      />
      {scope === GitLabDataSourceScope.Project ? (
        <Controller
          name="config.projectId"
          control={control}
          render={({ field: { value, onChange, onBlur, name }, fieldState: { error } }) => (
            <Field className="mb-4" data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="gitlab-data-source-project">Project</FieldLabel>
              <Combobox
                id="gitlab-data-source-project"
                name={name}
                onBlur={onBlur}
                isClearable={false}
                isLoading={isProjectsPending && Boolean(connectionId)}
                isDisabled={!connectionId}
                isError={Boolean(error)}
                value={
                  projectOptions.find((project) => value === Number.parseInt(project.id, 10)) ??
                  null
                }
                onValueChange={(project) => {
                  onChange(Number.parseInt(project.id, 10));
                  setValue("config.projectName", project.name);
                }}
                onSearchChange={setProjectSearch}
                options={projectOptions}
                placeholder="Search for a project..."
                searchAriaLabel="Search GitLab projects"
                loadingMessage="Loading projects..."
                getOptionLabel={getGitLabProjectOptionLabel}
                getOptionValue={(option) => option.name}
                renderOption={formatGitLabProjectOptionLabel}
                aria-describedby={`gitlab-data-source-project-help${error ? " gitlab-data-source-project-error" : ""}`}
              />
              <MissingOptionHelp id="gitlab-data-source-project-help" subject="project" />
              <FieldError id="gitlab-data-source-project-error">{error?.message}</FieldError>
            </Field>
          )}
        />
      ) : (
        <>
          <Controller
            name="config.groupId"
            control={control}
            render={({ field: { value, onChange, onBlur, name }, fieldState: { error } }) => (
              <Field className="mb-4" data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="gitlab-data-source-group">Group</FieldLabel>
                <Combobox
                  id="gitlab-data-source-group"
                  name={name}
                  onBlur={onBlur}
                  isClearable={false}
                  isLoading={isGroupsPending && Boolean(connectionId)}
                  isDisabled={!connectionId}
                  isError={Boolean(error)}
                  value={
                    groupOptions.find((group) => value === Number.parseInt(group.id, 10)) ?? null
                  }
                  onValueChange={(group) => {
                    onChange(Number.parseInt(group.id, 10));
                    setValue("config.groupName", group.fullName);
                    setValue("config.includeProjects", ["*"]);
                  }}
                  onSearchChange={setGroupSearch}
                  options={groupOptions}
                  placeholder="Search for a group..."
                  searchAriaLabel="Search GitLab groups"
                  loadingMessage="Loading groups..."
                  getOptionLabel={(option) => `${option.name} · ${option.fullPath}`}
                  getOptionValue={(option) => option.id}
                  renderOption={formatGitLabGroupOptionLabel}
                  aria-describedby={`gitlab-data-source-group-help${error ? " gitlab-data-source-group-error" : ""}`}
                />
                <MissingOptionHelp id="gitlab-data-source-group-help" subject="group" />
                <FieldError id="gitlab-data-source-group-error">{error?.message}</FieldError>
              </Field>
            )}
          />
          <Field className="mb-4" data-disabled={!connectionId}>
            <FieldLabel htmlFor="gitlab-data-source-scan-method">Scan Projects</FieldLabel>
            <Select
              value={scanMethod}
              onValueChange={(val) => {
                setValue("config.includeProjects", val === ScanMethod.AllProjects ? ["*"] : []);
              }}
              disabled={!connectionId}
            >
              <SelectTrigger id="gitlab-data-source-scan-method" className="w-full">
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
          {scanMethod === ScanMethod.SelectProjects && (
            <Controller
              name="config.includeProjects"
              defaultValue={["*"]}
              control={control}
              render={({ field: { value, onChange, onBlur, name }, fieldState: { error } }) => (
                <Field className="mb-4" data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="gitlab-data-source-include-projects">
                    Include Projects
                  </FieldLabel>
                  <Combobox
                    id="gitlab-data-source-include-projects"
                    name={name}
                    onBlur={onBlur}
                    multiple
                    isLoading={isProjectsPending && Boolean(connectionId)}
                    isDisabled={!connectionId || !groupName}
                    isError={Boolean(error)}
                    value={includeProjectOptions.filter((project) => value.includes(project.name))}
                    onValueChange={(newValue) => onChange(newValue.map((p) => p.name))}
                    onSearchChange={setProjectSearch}
                    options={includeProjectOptions}
                    placeholder="Search for projects..."
                    searchAriaLabel="Search GitLab projects"
                    loadingMessage="Loading projects..."
                    getOptionLabel={getGitLabProjectOptionLabel}
                    getOptionValue={(option) => option.name}
                    renderOption={formatGitLabProjectOptionLabel}
                    aria-describedby={`gitlab-data-source-include-projects-help${error ? " gitlab-data-source-include-projects-error" : ""}`}
                  />
                  <MissingOptionHelp
                    id="gitlab-data-source-include-projects-help"
                    subject="project"
                  />
                  <FieldError id="gitlab-data-source-include-projects-error">
                    {error?.message}
                  </FieldError>
                </Field>
              )}
            />
          )}
        </>
      )}
    </>
  );
};
