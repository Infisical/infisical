import { useMemo, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl, Tooltip } from "@app/components/v2";
import { CreatableSelect } from "@app/components/v2/CreatableSelect";
import { useDebounce } from "@app/hooks";
import {
  TVercelConnectionApp,
  useVercelConnectionListOrganizations
} from "@app/hooks/api/appConnections/vercel";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

const vercelEnvironments = [
  { name: "Development", slug: "development" },
  { name: "Preview", slug: "preview" },
  { name: "Production", slug: "production" }
];

export const VercelSyncFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Vercel }
  >();

  const [projectSearch, setProjectSearch] = useState("");
  const [debouncedProjectSearch] = useDebounce(projectSearch, 300);

  const connectionId = useWatch({ name: "connection.id", control });
  const currentApp = watch("destinationConfig.app");
  const currentEnv = watch("destinationConfig.env");

  const { data: projects, isLoading: isProjectsLoading } = useVercelConnectionListOrganizations(
    connectionId,
    debouncedProjectSearch,
    {
      enabled: Boolean(connectionId)
    }
  );

  const selectedProject = projects
    ?.find((project) => project.apps.some((app) => app.id === currentApp))
    ?.apps.find((app) => app.id === currentApp);

  const allApps =
    projects?.flatMap((project) =>
      project.apps.map((app) => ({ ...app, project: project.name, projectId: project.id }))
    ) || [];

  const environmentOptions = useMemo(() => {
    return vercelEnvironments
      .map((env) => ({
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

  const isPreviewEnvironment = currentEnv === "preview";

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.app", "");
          setValue("destinationConfig.appName", "");
          setValue("destinationConfig.env", "production");
          setValue("destinationConfig.branch", "");
        }}
      />

      <Controller
        name="destinationConfig.app"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Vercel App"
            helperText={
              <Tooltip
                className="max-w-md"
                content={
                  <div className="flex flex-col gap-2">
                    <span>
                      Ensure the project exists and the API token scope for this connection includes
                      the desired project.
                    </span>
                    <span>
                      Use the search bar to filter projects by name. By default only 10 projects are
                      shown, but you can search for more projects by name.
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
              isLoading={isProjectsLoading && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={allApps.find((app) => app.id === value) ?? null}
              onChange={(option) => {
                const appId = (option as SingleValue<TVercelConnectionApp>)?.id ?? null;
                onChange(appId);
                setValue("destinationConfig.branch", "");
                setValue(
                  "destinationConfig.teamId",
                  (option as SingleValue<TVercelConnectionApp>)?.projectId || ""
                );
                setValue(
                  "destinationConfig.appName",
                  (option as SingleValue<TVercelConnectionApp>)?.name || ""
                );
              }}
              onInputChange={(newValue) => setProjectSearch(newValue)}
              filterOption={null}
              options={allApps}
              placeholder="Select a project..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id.toString()}
              groupBy="project"
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
            label="Vercel App Environment"
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
                isLoading={isProjectsLoading && Boolean(connectionId) && Boolean(currentApp)}
                isDisabled={!connectionId || !currentApp}
                options={previewBranchOptions}
                menuPlacement="top"
                value={previewBranchOptions.find((branch) => branch.id === value) ?? null}
                onChange={(option) => onChange((option as SingleValue<{ id: string }>)?.id || "")}
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
                    previewBranchOptions.filter((branch) => branch.id === inputValue).length === 0
                  );
                }}
              />
            </FormControl>
          )}
        />
      )}
    </>
  );
};
