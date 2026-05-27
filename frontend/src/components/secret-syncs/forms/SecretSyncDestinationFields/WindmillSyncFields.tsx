import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { Info } from "lucide-react";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.workspace", "");
        }}
      />

      <Controller
        name="destinationConfig.workspace"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Workspace
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  Ensure the workspace exists in the connection&apos;s Windmill instance URL.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <FilterableSelect
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
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      <Controller
        name="destinationConfig.path"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Path
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
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
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <Input
                value={value}
                onChange={onChange}
                placeholder="f/folder-name/"
                isError={Boolean(error)}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
