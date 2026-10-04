import { Controller, useFormContext } from "react-hook-form";
import { InfoIcon } from "lucide-react";

import { AppConnectionOptionContent } from "@app/components/app-connections";
import {
  Button,
  Combobox,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionSub, useProject, useProjectPermission } from "@app/context";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP } from "@app/helpers/secretScanningV2";
import { usePopUp } from "@app/hooks";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections";
import { AddAppConnectionModal } from "@app/pages/organization/AppConnections/AppConnectionsPage/components";

import { TSecretScanningDataSourceForm } from "./schemas";

type Props = {
  onChange?: VoidFunction;
  isUpdate?: boolean;
};

export const SecretScanningDataSourceConnectionField = ({
  onChange: callback,
  isUpdate
}: Props) => {
  const { permission } = useProjectPermission();
  const { control, watch, setValue } = useFormContext<TSecretScanningDataSourceForm>();

  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp(["addConnection"] as const);

  const dataSourceType = watch("type");
  const app = SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP[dataSourceType];

  const { currentProject } = useProject();

  const { data: availableConnections, isPending } = useListAvailableAppConnections(
    app,
    currentProject.id
  );

  const connectionName = APP_CONNECTION_MAP[app].name;

  const canCreateConnection = permission.can(
    ProjectPermissionAppConnectionActions.Create,
    ProjectPermissionSub.AppConnections
  );

  return (
    <>
      <Controller
        render={({ field: { value, onChange, onBlur, name }, fieldState: { error } }) => (
          <Field className="mb-4" data-invalid={Boolean(error)} data-disabled={isUpdate}>
            <div className="flex items-center gap-1">
              <FieldLabel htmlFor="secret-scanning-data-source-connection">
                {connectionName} Connection
              </FieldLabel>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    aria-label="About app connections"
                  >
                    <InfoIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  App Connections can be created from the Organization Settings page.
                </TooltipContent>
              </Tooltip>
            </div>
            <Combobox<{ id: string; name: string; projectId?: string | null }>
              id="secret-scanning-data-source-connection"
              name={name}
              onBlur={onBlur}
              value={value}
              isClearable={false}
              onValueChange={(newValue) => {
                if (newValue.id === "_create") {
                  handlePopUpOpen("addConnection");
                  onChange(null);
                  // store for oauth callback connections
                  localStorage.setItem("secretScanningDataSourceFormData", JSON.stringify(watch()));
                  if (callback) callback();
                  return;
                }

                onChange(newValue);
                if (callback) callback();
              }}
              isLoading={isPending}
              options={[
                ...(canCreateConnection ? [{ id: "_create", name: "Create Connection" }] : []),
                ...(availableConnections ?? [])
              ]}
              isDisabled={isUpdate}
              isError={Boolean(error)}
              aria-describedby={`secret-scanning-data-source-connection-help${error ? " secret-scanning-data-source-connection-error" : ""}`}
              placeholder="Select connection..."
              searchAriaLabel={`Search ${connectionName} connections`}
              loadingMessage={`Loading ${connectionName} connections...`}
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
              renderOption={(option) => (
                <AppConnectionOptionContent
                  data={option}
                  isOnlyOption={option.id === "_create" && !availableConnections?.length}
                />
              )}
            />
            <FieldDescription id="secret-scanning-data-source-connection-help">
              {isUpdate ? (
                "Cannot be updated"
              ) : (
                <>
                  Check out{" "}
                  <a
                    href={`https://infisical.com/docs/integrations/app-connections/${app}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    our docs
                  </a>{" "}
                  to ensure your connection has the required permissions for secret scanning.
                </>
              )}
            </FieldDescription>
            <FieldError id="secret-scanning-data-source-connection-error">
              {error?.message}
            </FieldError>
          </Field>
        )}
        control={control}
        name="connection"
      />
      {!isUpdate && !isPending && !availableConnections?.length && !canCreateConnection && (
        <p className="-mt-2.5 mb-2.5 text-xs text-warning">
          <InfoIcon className="mr-1 inline size-3" />
          You do not have access to any {connectionName} Connections. Contact an admin to create
          one.
        </p>
      )}
      <AddAppConnectionModal
        isOpen={popUp.addConnection.isOpen}
        onOpenChange={(isOpen) => {
          // remove form storage, not oauth connection
          localStorage.removeItem("secretScanningDataSourceFormData");
          handlePopUpToggle("addConnection", isOpen);
        }}
        projectType={currentProject.type}
        projectId={currentProject.id}
        app={app}
        onComplete={(connection) => {
          if (connection) {
            setValue("connection", connection);
          }
        }}
      />
    </>
  );
};
