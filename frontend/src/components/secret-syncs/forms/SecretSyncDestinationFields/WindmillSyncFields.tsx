import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl, Input, Tooltip } from "@app/components/v2";
import {
  TWindmillWorkspace,
  useWindmillConnectionListWorkspaces
} from "@app/hooks/api/appConnections/windmill";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const WindmillSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Windmill }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: workspaces, isLoading: isWorkspacesLoading } = useWindmillConnectionListWorkspaces(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.workspace", "");
        }}
      />

      <Controller
        name="destinationConfig.workspace"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Workspace"
            helperText={
              <Tooltip
                className="max-w-md"
                content="Ensure the workspace exists in the connection's Windmill instance URL."
              >
                <div>
                  <span>Don&#39;t see the workspace you&#39;re looking for?</span>{" "}
                  <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                </div>
              </Tooltip>
            }
          >
            <FilterableSelect
              menuPlacement="top"
              isLoading={isWorkspacesLoading && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={workspaces?.find((workspace) => workspace.name === value) ?? null}
              onChange={(option) =>
                onChange((option as SingleValue<TWindmillWorkspace>)?.name ?? null)
              }
              options={workspaces}
              placeholder="Select a workspace..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.name}
            />
          </FormControl>
        )}
      />
      <Controller
        name="destinationConfig.path"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            tooltipClassName="max-w-sm"
            tooltipText={
              <>
                The workspace path where secrets should be synced to. Path must follow Windmill{" "}
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="https://www.windmill.dev/docs/core_concepts/roles_and_permissions#path"
                >
                  <span className="cursor-pointer underline decoration-primary underline-offset-2 hover:text-mineshaft-200">
                    owner path convention
                  </span>
                  .
                </a>
              </>
            }
            isError={Boolean(error)}
            errorText={error?.message}
            label="Path"
          >
            <Input value={value} onChange={onChange} placeholder="f/folder-name/" />
          </FormControl>
        )}
      />
    </>
  );
};
