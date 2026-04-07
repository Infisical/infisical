import { useMemo, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { MultiValue, SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl, Tooltip } from "@app/components/v2";
import { CreatableSelect } from "@app/components/v2/CreatableSelect";
import { useDebounce } from "@app/hooks";
import {
  TVercelConnectionOrganization,
  useVercelConnectionListOrganizations
} from "@app/hooks/api/appConnections/vercel";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { VercelSyncScope } from "@app/hooks/api/secretSyncs/types/vercel-sync";

import { TSecretSyncForm } from "../schemas";

const vercelEnvironments = [
  { name: "Development", slug: "development" },
  { name: "Preview", slug: "preview" },
  { name: "Production", slug: "production" }
] as const;

export const VercelSyncFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Vercel }
  >();

  const [projectSearch, setProjectSearch] = useState("");
  const [debouncedProjectSearch] = useDebounce(projectSearch, 300);

  const connectionId = useWatch({ name: "connection.id", control });
  const currentApp = watch("destinationConfig.app");
  const currentEnv = watch("destinationConfig.env");
  const scope = watch("destinationConfig.scope");

  const { data: teams, isLoading: isTeamsLoading } = useVercelConnectionListOrganizations(
    connectionId,
    debouncedProjectSearch,
    {
      enabled: Boolean(connectionId)
    }
  );

  const selectedProject = teams
    ?.find((team) => team.apps.some((app) => app.id === currentApp))
    ?.apps.find((app) => app.id === currentApp);

  const allApps =
    teams?.flatMap((team) =>
      team.apps.map((project) => ({ ...project, teamName: team.name, teamId: team.id }))
    ) || [];

  const environmentOptions = useMemo(() => {
    return vercelEnvironments
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
  }, [currentApp]);

  const previewBranchOptions =
    selectedProject?.previewBranches?.map((branch) => ({
      id: branch,
      name: branch
    })) || [];

  const scopeOptions = Object.values(VercelSyncScope).map((s) => ({
    value: s,
    label: s.replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase())
  }));

  const isPreviewEnvironment = currentEnv === "preview";
  const isTeamScope = scope === VercelSyncScope.Team;

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.app", "");
          setValue("destinationConfig.appName", "");
          setValue("destinationConfig.env", "production");
          setValue("destinationConfig.branch", "");
          setValue("destinationConfig.teamId", "");
          setValue("destinationConfig.scope", VercelSyncScope.Project);
        }}
      />

      <Controller
        name="destinationConfig.scope"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl isError={Boolean(error)} errorText={error?.message} label="Scope">
            <FilterableSelect
              isLoading={isTeamsLoading}
              isDisabled={!connectionId}
              value={scopeOptions.find((opt) => opt.value === value) ?? null}
              onChange={(option) => {
                const newScope =
                  (option as SingleValue<(typeof scopeOptions)[number]>)?.value ?? null;
                onChange(newScope);

                if (newScope === VercelSyncScope.Team) {
                  setValue("destinationConfig.teamId", "");
                  setValue("destinationConfig.targetEnvironments", []);
                  setValue("destinationConfig.targetProjects", undefined);
                } else {
                  setValue("destinationConfig.app", "");
                  setValue("destinationConfig.appName", "");
                  setValue("destinationConfig.env", "production");
                  setValue("destinationConfig.branch", "");
                  setValue("destinationConfig.teamId", "");
                }
              }}
              options={scopeOptions}
              placeholder="Select a scope..."
              getOptionLabel={(opt) => opt.label}
              getOptionValue={(opt) => opt.value}
            />
          </FormControl>
        )}
      />

      {isTeamScope && (
        <>
          <Controller
            name="destinationConfig.teamId"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl isError={Boolean(error)} errorText={error?.message} label="Team">
                <FilterableSelect
                  value={teams?.find((team) => team.id === value) ?? null}
                  onChange={(option) =>
                    onChange((option as SingleValue<TVercelConnectionOrganization>)?.id ?? null)
                  }
                  options={teams}
                  placeholder="Select a team..."
                  getOptionLabel={(option) => option.name}
                  getOptionValue={(option) => option.id}
                />
              </FormControl>
            )}
          />

          <Controller
            name="destinationConfig.targetEnvironments"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                isError={Boolean(error)}
                errorText={error?.message}
                label="Target Environments"
              >
                <FilterableSelect
                  isMulti
                  value={vercelEnvironments.filter((env) => (value || []).includes(env.slug))}
                  onChange={(option) =>
                    onChange(
                      (option as MultiValue<(typeof vercelEnvironments)[number]>).map((o) => o.slug)
                    )
                  }
                  options={vercelEnvironments}
                  placeholder="Select target environments..."
                  getOptionLabel={(option) => option.name}
                  getOptionValue={(option) => option.slug}
                />
              </FormControl>
            )}
          />

          <Controller
            name="destinationConfig.targetProjects"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                isOptional
                isError={Boolean(error)}
                errorText={error?.message}
                label="Target Projects"
              >
                <FilterableSelect
                  isMulti
                  value={allApps.filter((app) => (value || []).includes(app.id))}
                  onChange={(option) =>
                    onChange((option as MultiValue<(typeof allApps)[number]>).map((o) => o.id))
                  }
                  options={allApps}
                  placeholder="Select target projects..."
                  getOptionLabel={(option) => option.name}
                  getOptionValue={(option) => option.id}
                />
              </FormControl>
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
              <FormControl
                isError={Boolean(error)}
                errorText={error?.message}
                label="Vercel Project"
                helperText={
                  <Tooltip
                    className="max-w-md"
                    content={
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
                  noOptionsMessage={({ inputValue }) => {
                    return inputValue
                      ? "No projects found matching your search."
                      : "No projects found.";
                  }}
                  isLoading={isTeamsLoading && Boolean(connectionId)}
                  isDisabled={!connectionId}
                  value={allApps.find((app) => app.id === value) ?? null}
                  onChange={(option) => {
                    const selected = option as SingleValue<(typeof allApps)[number]>;
                    onChange(selected?.id ?? null);
                    setValue("destinationConfig.branch", "");
                    setValue("destinationConfig.teamId", selected?.teamId || "");
                    setValue("destinationConfig.appName", selected?.name || "");
                  }}
                  onInputChange={(newValue) => setProjectSearch(newValue)}
                  filterOption={null}
                  options={allApps}
                  placeholder="Search for a project..."
                  getOptionLabel={(option) => option.name}
                  getOptionValue={(option) => option.id.toString()}
                  groupBy="teamName"
                />
              </FormControl>
            )}
          />

          <Controller
            name="destinationConfig.env"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                isError={Boolean(error)}
                errorText={error?.message}
                label="Vercel Project Environment"
              >
                <FilterableSelect
                  menuPlacement="top"
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
                  onChange={(option) => {
                    const envKey = (option as any)?.key ?? null;
                    onChange(envKey);

                    setValue("destinationConfig.branch", "");
                  }}
                  options={environmentOptions}
                  placeholder="Select an environment..."
                  getOptionLabel={(option) => option.name || option.key || ""}
                  getOptionValue={(option) => option.key || ""}
                />
              </FormControl>
            )}
          />

          {isPreviewEnvironment && (
            <Controller
              name="destinationConfig.branch"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  isError={Boolean(error)}
                  errorText={error?.message}
                  label="Vercel Preview Branch (Optional)"
                >
                  <CreatableSelect
                    className="w-full"
                    placeholder="Select a branch..."
                    isLoading={isTeamsLoading && Boolean(connectionId) && Boolean(currentApp)}
                    isDisabled={!connectionId || !currentApp}
                    options={previewBranchOptions}
                    menuPlacement="top"
                    value={previewBranchOptions.find((branch) => branch.id === value) ?? null}
                    onChange={(option) =>
                      onChange((option as SingleValue<{ id: string }>)?.id || "")
                    }
                    onCreateOption={(option) => {
                      onChange(option);
                      if (!option || option.trim() === "") return;
                      previewBranchOptions.push({ id: option, name: option });
                    }}
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    getNewOptionData={(inputValue, _optionLabel) => {
                      return {
                        id: inputValue,
                        name: `${inputValue} - press Enter`
                      };
                    }}
                    getOptionLabel={(option) => option.name}
                    getOptionValue={(option) => option?.id || ""}
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    isValidNewOption={(inputValue, _value, _options, _accessors) => {
                      return (
                        inputValue.trim().length > 0 &&
                        previewBranchOptions.filter((branch) => branch.id === inputValue).length ===
                          0
                      );
                    }}
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
