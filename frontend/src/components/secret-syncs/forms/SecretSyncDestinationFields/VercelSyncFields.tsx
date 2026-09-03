import { useMemo, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { Info, TriangleAlert } from "lucide-react";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Combobox,
  CreatableSelect,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useDebounce } from "@app/hooks";
import {
  TVercelConnectionApp,
  TVercelConnectionOrganization,
  useVercelConnectionListOrganizations
} from "@app/hooks/api/appConnections/vercel";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import {
  VercelEnvironmentType,
  VercelSyncScope
} from "@app/hooks/api/secretSyncs/types/vercel-sync";

import { TSecretSyncForm } from "../schemas";

const standardVercelEnvironments = [
  { name: "Development", slug: "development" },
  { name: "Preview", slug: "preview" },
  { name: "Production", slug: "production" }
] as const;

const teamVercelEnvironments = [...standardVercelEnvironments] as const;

const formatScopeLabel = (scope: VercelSyncScope) =>
  scope.replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const VercelSyncFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Vercel }
  >();

  const [projectSearch, setProjectSearch] = useState("");
  const [debouncedProjectSearch] = useDebounce(projectSearch, 300);

  const connectionId = useWatch({ name: "connection.id", control });
  const currentApp = watch("destinationConfig.app");
  const currentAppName = watch("destinationConfig.appName");
  const currentEnv = watch("destinationConfig.env");
  const scope = watch("destinationConfig.scope");
  const teamId = watch("destinationConfig.teamId");
  const teamName = watch("destinationConfig.teamName");
  const targetEnvironments = watch("destinationConfig.targetEnvironments");

  const isProjectDevTargeted =
    scope !== VercelSyncScope.Team && currentEnv === VercelEnvironmentType.Development;
  const isTeamDevTargeted =
    scope === VercelSyncScope.Team &&
    Boolean(targetEnvironments?.includes(VercelEnvironmentType.Development));

  const { data: teams, isLoading: isTeamsLoading } = useVercelConnectionListOrganizations(
    connectionId,
    debouncedProjectSearch,
    {
      enabled: Boolean(connectionId)
    }
  );

  const allApps = useMemo(
    () =>
      teams?.flatMap((team) =>
        team.apps.map((project) => ({ ...project, teamName: team.name, teamId: team.id }))
      ) ?? [],
    [teams]
  );

  const selectedProject = allApps.find((app) => app.id === currentApp);

  const availableApps = useMemo(() => {
    if (scope !== VercelSyncScope.Team) return allApps;

    return allApps.filter((app) => app.teamId === teamId);
  }, [allApps, scope, teamId]);

  const teamOptions = useMemo(() => {
    const options = teams ?? [];
    if (teamId && teamName && !options.some((team) => team.id === teamId)) {
      return [{ id: teamId, name: teamName, slug: teamName, apps: [] }, ...options];
    }
    return options;
  }, [teamId, teamName, teams]);

  const projectOptions = useMemo(() => {
    if (
      currentApp &&
      currentAppName &&
      !availableApps.some((project) => project.id === currentApp)
    ) {
      const selectedFallback: TVercelConnectionApp & { teamId: string; teamName: string } = {
        id: currentApp,
        projectId: currentApp,
        name: currentAppName,
        teamId,
        teamName: teamName || "Selected Team"
      };
      return [selectedFallback, ...availableApps];
    }
    return availableApps;
  }, [availableApps, currentApp, currentAppName, teamId, teamName]);

  const environmentOptions = useMemo(() => {
    return standardVercelEnvironments
      .map((env): { key: string; type: string; name: string } => ({
        key: env.slug,
        type: env.slug,
        name: env.name
      }))
      .concat(
        selectedProject?.envs?.map((env) => ({
          key: env.id,
          type: env.type,
          name: env.slug
        })) || []
      );
  }, [selectedProject]);

  const previewBranchOptions = useMemo(
    () =>
      selectedProject?.previewBranches?.map((branch) => ({
        id: branch,
        name: branch
      })) ?? [],
    [selectedProject]
  );

  const isPreviewEnvironment = currentEnv === "preview";
  const isTeamScope = scope === VercelSyncScope.Team;

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.app", "");
          setValue("destinationConfig.appName", "");
          setValue("destinationConfig.env", "production");
          setValue("destinationConfig.branch", "");
          setValue("destinationConfig.teamId", "");
          setValue("destinationConfig.teamName", "");
          setValue("destinationConfig.scope", VercelSyncScope.Project);
          setValue("destinationConfig.sensitive", false);
        }}
      />

      <Controller
        name="destinationConfig.scope"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Scope</FieldLabel>
            <FieldContent>
              <Select
                value={value}
                onValueChange={(newScope) => {
                  onChange(newScope);

                  if (newScope === VercelSyncScope.Team) {
                    setValue("destinationConfig.teamId", "");
                    setValue("destinationConfig.targetEnvironments", []);
                    setValue("destinationConfig.applyToAllCustomEnvironments", false);
                    setValue("destinationConfig.targetProjects", undefined);
                    setValue("destinationConfig.teamName", "");
                  } else {
                    setValue("destinationConfig.app", "");
                    setValue("destinationConfig.appName", "");
                    setValue("destinationConfig.env", "production");
                    setValue("destinationConfig.branch", "");
                    setValue("destinationConfig.teamId", "");
                  }
                  setValue("destinationConfig.sensitive", false);
                }}
                disabled={!connectionId}
              >
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a scope..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(VercelSyncScope).map((s) => (
                    <SelectItem value={s} key={s}>
                      {formatScopeLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      {isTeamScope && (
        <>
          <Controller
            name="destinationConfig.teamId"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Team</FieldLabel>
                <FieldContent>
                  <Combobox
                    isError={Boolean(error)}
                    value={teamOptions.find((team) => team.id === value) ?? null}
                    onValueChange={(option: TVercelConnectionOrganization) => {
                      onChange(option.id);
                      setValue("destinationConfig.teamName", option.name);
                    }}
                    options={teamOptions}
                    placeholder="Select a team..."
                    getOptionLabel={(option) => option.name}
                    getOptionValue={(option) => option.id}
                    modal
                  />
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            name="destinationConfig.targetEnvironments"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Target Environments</FieldLabel>
                <FieldContent>
                  <Combobox
                    isError={Boolean(error)}
                    multiple
                    value={teamVercelEnvironments.filter((env) => (value || []).includes(env.slug))}
                    onValueChange={(options) => onChange(options.map((option) => option.slug))}
                    options={teamVercelEnvironments}
                    placeholder="Select target environments..."
                    getOptionLabel={(option) => option.name}
                    getOptionValue={(option) => option.slug}
                    modal
                  />
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            name="destinationConfig.targetProjects"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Target Projects (Optional)</FieldLabel>
                <FieldContent>
                  <Combobox
                    isError={Boolean(error)}
                    multiple
                    value={availableApps.filter((app) => (value || []).includes(app.id))}
                    onValueChange={(options) => onChange(options.map((option) => option.id))}
                    options={availableApps}
                    placeholder="Select target projects..."
                    getOptionLabel={(option) => option.name}
                    getOptionValue={(option) => option.id}
                    modal
                  />
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            name="destinationConfig.applyToAllCustomEnvironments"
            control={control}
            render={({ field: { value, onChange } }) => (
              <Field orientation="horizontal">
                <FieldContent>
                  <Label htmlFor="vercel-sync-all-custom-environments">
                    Apply to All Custom Environments
                  </Label>
                  <FieldDescription>
                    Shared environment variables will be applied to all custom environments in the
                    Vercel team.
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="vercel-sync-all-custom-environments"
                  variant="project"
                  checked={Boolean(value)}
                  onCheckedChange={onChange}
                />
              </Field>
            )}
          />
        </>
      )}

      {!isTeamScope && (
        <>
          <Controller
            name="destinationConfig.app"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field>
                <FieldLabel>
                  Vercel Project
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-md">
                      <div className="flex flex-col gap-2">
                        <span>
                          Ensure the project exists and the API token scope for this connection
                          includes the desired project.
                        </span>
                        <span>
                          Use the search bar to filter projects by name. By default only 10 projects
                          are shown, but you can search for more projects by name.
                        </span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </FieldLabel>
                <FieldContent>
                  <Combobox
                    isError={Boolean(error)}
                    emptyMessage={(inputValue) => {
                      return inputValue
                        ? "No projects found matching your search."
                        : "No projects found.";
                    }}
                    isLoading={isTeamsLoading && Boolean(connectionId)}
                    isDisabled={!connectionId}
                    value={projectOptions.find((app) => app.id === value) ?? null}
                    onValueChange={(selected) => {
                      onChange(selected.id);
                      setValue("destinationConfig.branch", "");
                      setValue("destinationConfig.teamId", selected.teamId);
                      setValue("destinationConfig.teamName", selected.teamName);
                      setValue("destinationConfig.appName", selected.name);
                    }}
                    onInputValueChange={setProjectSearch}
                    shouldFilter={false}
                    options={projectOptions}
                    placeholder="Search for a project..."
                    getOptionLabel={(option) => option.name}
                    getOptionValue={(option) => option.id.toString()}
                    getOptionGroup={(option) => option.teamName}
                    modal
                  />
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            name="destinationConfig.env"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Vercel Project Environment</FieldLabel>
                <FieldContent>
                  <Combobox
                    isError={Boolean(error)}
                    isDisabled={!connectionId || !currentApp}
                    value={
                      value
                        ? {
                            key: environmentOptions.find((env) => env.key === value)?.key,
                            type: environmentOptions.find((env) => env.key === value)?.type,
                            name: environmentOptions.find((env) => env.key === value)?.name
                          }
                        : null
                    }
                    onValueChange={(option) => {
                      const envKey = option.key;
                      onChange(envKey);

                      setValue("destinationConfig.branch", "");

                      if (envKey === VercelEnvironmentType.Development) {
                        setValue("destinationConfig.sensitive", false);
                      }
                    }}
                    options={environmentOptions}
                    placeholder="Select an environment..."
                    getOptionLabel={(option) => option.name || option.key || ""}
                    getOptionValue={(option) => option.key || ""}
                    modal
                  />
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />

          {isPreviewEnvironment && (
            <Controller
              name="destinationConfig.branch"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>Vercel Preview Branch (Optional)</FieldLabel>
                  <FieldContent>
                    <CreatableSelect
                      isError={Boolean(error)}
                      className="w-full"
                      placeholder="Select a branch..."
                      isLoading={isTeamsLoading && Boolean(connectionId) && Boolean(currentApp)}
                      isDisabled={!connectionId || !currentApp}
                      options={previewBranchOptions}
                      value={
                        value
                          ? (previewBranchOptions.find((branch) => branch.id === value) ?? {
                              id: value,
                              name: value
                            })
                          : null
                      }
                      onChange={(option) =>
                        onChange((option as SingleValue<{ id: string }>)?.id || "")
                      }
                      onCreateOption={onChange}
                      getNewOptionData={(inputValue) => ({
                        id: inputValue,
                        name: `${inputValue} - press Enter`
                      })}
                      getOptionLabel={(option) => option.name}
                      getOptionValue={(option) => option.id}
                      isValidNewOption={(inputValue) =>
                        inputValue.trim().length > 0 &&
                        !previewBranchOptions.some((branch) => branch.id === inputValue)
                      }
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />
          )}
        </>
      )}

      <Controller
        name="destinationConfig.sensitive"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => {
          const showTeamDevWarning = isTeamDevTargeted && Boolean(value);

          return (
            <>
              <Field orientation="horizontal">
                <FieldContent>
                  <Label htmlFor="vercel-sync-sensitive">Mark Secrets as Sensitive in Vercel</Label>
                  <FieldDescription>
                    When enabled, secrets will be created in Vercel as Sensitive. Sensitive
                    environment variables cannot be read back via the Vercel API after creation.
                  </FieldDescription>
                  <FieldError errors={[error]} />
                </FieldContent>
                <Switch
                  id="vercel-sync-sensitive"
                  variant="project"
                  checked={Boolean(value) && !isProjectDevTargeted}
                  disabled={isProjectDevTargeted}
                  onCheckedChange={(checked) => {
                    if (isProjectDevTargeted) return;
                    onChange(checked);
                  }}
                />
              </Field>
              {(isProjectDevTargeted || showTeamDevWarning) && (
                <Alert variant="warning">
                  <TriangleAlert />
                  <AlertTitle>Sensitive not supported for Development</AlertTitle>
                  <AlertDescription>
                    Marking secrets as sensitive in Vercel is not supported for development
                    environments.
                    {showTeamDevWarning &&
                      " Sensitive secrets will only be applied to your other selected environments."}
                  </AlertDescription>
                </Alert>
              )}
            </>
          );
        }}
      />
    </FieldGroup>
  );
};
