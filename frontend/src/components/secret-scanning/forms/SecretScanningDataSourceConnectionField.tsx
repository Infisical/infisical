import { ComponentProps, useEffect, useRef, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { InfoIcon } from "lucide-react";

import { AppConnectionOptionContent } from "@app/components/app-connections";
import {
  Combobox,
  DiscardChangesAlertDialog,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionSub, useProject, useProjectPermission } from "@app/context";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP } from "@app/helpers/secretScanningV2";
import { useDiscardChangesGuard } from "@app/hooks";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections";
import { AppConnectionForm } from "@app/pages/organization/AppConnections/AppConnectionsPage/components/AppConnectionForm";

import { TSecretScanningDataSourceForm } from "./schemas";

type Props = {
  onChange?: VoidFunction;
  isUpdate?: boolean;
};

const PersistedConnectionForm = (props: ComponentProps<typeof AppConnectionForm>) => {
  const { getValues } = useFormContext<TSecretScanningDataSourceForm>();

  useEffect(() => {
    localStorage.setItem("secretScanningDataSourceFormData", JSON.stringify(getValues()));
  }, [getValues]);

  return <AppConnectionForm {...props} />;
};

export const SecretScanningDataSourceConnectionField = ({
  onChange: callback,
  isUpdate
}: Props) => {
  const { permission } = useProjectPermission();
  const { control, watch } = useFormContext<TSecretScanningDataSourceForm>();

  const [isConnectionDirty, setIsConnectionDirty] = useState(false);
  const cancelRef = useRef<VoidFunction>(() => {});
  const attemptRef = useRef(0);
  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({
      isDirty: isConnectionDirty,
      onDiscard: () => {
        attemptRef.current += 1;
        setIsConnectionDirty(false);
        localStorage.removeItem("secretScanningDataSourceFormData");
        cancelRef.current();
      }
    });

  const requestCancel = (cancel: VoidFunction) => {
    cancelRef.current = cancel;
    requestDiscard();
  };

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
  const creationLabel = `Create ${connectionName} Connection`;
  const attempt = attemptRef.current;

  return (
    <>
      <Controller
        render={({ field: { value, onChange, onBlur, name }, fieldState: { error } }) => (
          <Field className="mb-4" data-invalid={Boolean(error)} data-disabled={isUpdate}>
            <div className="flex items-center gap-1">
              <FieldLabel htmlFor="secret-scanning-data-source-connection">
                {connectionName} Connection
              </FieldLabel>
              <Tooltip hoverable delayDuration={50}>
                <TooltipTrigger asChild>
                  <IconButton
                    type="button"
                    variant="ghost-muted"
                    size="2xs"
                    aria-label="About app connections"
                  >
                    <InfoIcon />
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent sideOffset={5}>
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
                onChange(newValue);
                if (callback) callback();
              }}
              isLoading={isPending}
              options={availableConnections ?? []}
              creation={
                canCreateConnection && !isUpdate
                  ? {
                      mode: "dialog",
                      title: creationLabel,
                      description: "The new connection is selected once it is created.",
                      emptyLabel: creationLabel,
                      formatLabel: () => creationLabel,
                      isDuplicate: () => false,
                      onDismiss: requestCancel,
                      renderForm: ({ complete, cancel }) => (
                        <>
                          <PersistedConnectionForm
                            app={app}
                            projectId={currentProject.id}
                            projectType={currentProject.type}
                            onDirtyChange={setIsConnectionDirty}
                            onCancel={() => requestCancel(cancel)}
                            onComplete={(connection) => {
                              if (attempt !== attemptRef.current) return;
                              setIsConnectionDirty(false);
                              setIsDiscardDialogOpen(false);
                              localStorage.removeItem("secretScanningDataSourceFormData");
                              onChange(connection);
                              if (callback) callback();
                              complete();
                            }}
                          />
                          <DiscardChangesAlertDialog
                            open={isDiscardDialogOpen}
                            onOpenChange={setIsDiscardDialogOpen}
                            onDiscard={confirmDiscard}
                            title="Discard Connection Setup?"
                            description="Your progress configuring this connection will be lost."
                          />
                        </>
                      )
                    }
                  : undefined
              }
              isDisabled={isUpdate}
              isError={Boolean(error)}
              aria-describedby={`secret-scanning-data-source-connection-help${error ? " secret-scanning-data-source-connection-error" : ""}`}
              placeholder="Select connection..."
              searchAriaLabel={`Search ${connectionName} connections`}
              loadingMessage={`Loading ${connectionName} connections...`}
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
              renderOption={(option) => <AppConnectionOptionContent data={option} />}
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
    </>
  );
};
