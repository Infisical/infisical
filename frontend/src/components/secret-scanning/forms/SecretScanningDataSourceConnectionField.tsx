import { Controller, useFormContext } from "react-hook-form";
import { SingleValue } from "react-select";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { AppConnectionOption } from "@app/components/app-connections";
import { FilterableSelect, FormControl } from "@app/components/v2";
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
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            tooltipText="App Connections can be created from the Organization Settings page."
            isError={Boolean(error)}
            errorText={error?.message}
            label={`${connectionName} Connection`}
            helperText={
              isUpdate ? (
                "Cannot be updated"
              ) : (
                <p>
                  Check out{" "}
                  <a
                    href={`https://infisical.com/docs/integrations/app-connections/${app}`}
                    target="_blank"
                    className="underline"
                    rel="noopener noreferrer"
                  >
                    our docs
                  </a>{" "}
                  to ensure your connection has the required permissions for secret scanning.
                </p>
              )
            }
          >
            <FilterableSelect
              value={value}
              onChange={(newValue) => {
                if ((newValue as SingleValue<{ id: string; name: string }>)?.id === "_create") {
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
              placeholder="Select connection..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
              components={{ Option: AppConnectionOption }}
            />
          </FormControl>
        )}
        control={control}
        name="connection"
      />
      {!isUpdate && !isPending && !availableConnections?.length && !canCreateConnection && (
        <p className="text-yellow -mt-2.5 mb-2.5 text-xs">
          <FontAwesomeIcon className="mr-1" size="xs" icon={faInfoCircle} />
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
