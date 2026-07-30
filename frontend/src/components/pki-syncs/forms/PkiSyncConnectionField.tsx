import { Controller, useFormContext } from "react-hook-form";
import { SingleValue } from "react-select";
import { useRouterState } from "@tanstack/react-router";
import { Info } from "lucide-react";

import { AppConnectionOption } from "@app/components/app-connections";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionSub, useProject, useProjectPermission } from "@app/context";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { PKI_SYNC_CONNECTION_MAP } from "@app/helpers/pkiSyncs";
import { usePopUp } from "@app/hooks";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections";
import { AddAppConnectionModal } from "@app/pages/organization/AppConnections/AppConnectionsPage/components";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";

type Props = {
  onChange?: VoidFunction;
};

export const PkiSyncConnectionField = ({ onChange: callback }: Props) => {
  const { permission } = useProjectPermission();
  const { control, watch, setValue } = useFormContext<TPkiSyncForm>();

  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp(["addConnection"] as const);

  const destination = watch("destination");
  const app = PKI_SYNC_CONNECTION_MAP[destination];

  const { currentProject } = useProject();

  const {
    location: { pathname }
  } = useRouterState();

  const getPkiSyncReturnUrl = () => {
    if (pathname.includes("selectedTab=secret-syncs")) {
      return pathname.replace("selectedTab=secret-syncs", "selectedTab=pki-syncs");
    }
    if (!pathname.includes("selectedTab=")) {
      const separator = pathname.includes("?") ? "&" : "?";
      return `${pathname}${separator}selectedTab=pki-syncs`;
    }
    return pathname;
  };

  const { data: availableConnections, isPending } = useListAvailableAppConnections(
    app,
    currentProject.id
  );

  const connectionName = APP_CONNECTION_MAP[app].name;

  const canCreateConnection = permission.can(
    ProjectPermissionAppConnectionActions.Create,
    ProjectPermissionSub.AppConnections
  );

  const appName = APP_CONNECTION_MAP[PKI_SYNC_CONNECTION_MAP[destination]].name;

  return (
    <>
      <Controller
        control={control}
        name="connection"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>
              {connectionName} Connection
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  App Connections can be created from the Project Settings page.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FilterableSelect
              value={value}
              onChange={(newValue) => {
                if ((newValue as SingleValue<{ id: string; name: string }>)?.id === "_create") {
                  handlePopUpOpen("addConnection");
                  onChange(null);
                  const formData = { ...watch(), returnUrl: getPkiSyncReturnUrl() };
                  localStorage.setItem("pkiSyncFormData", JSON.stringify(formData));
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
              placeholder="Select connection..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
              components={{ Option: AppConnectionOption }}
              isError={Boolean(error)}
            />
            {!isPending && !availableConnections?.length && !canCreateConnection ? (
              <FieldDescription className="text-warning">
                You do not have access to any {appName} Connections. Contact an admin to create one.
              </FieldDescription>
            ) : (
              <FieldError errors={[error]} />
            )}
          </Field>
        )}
      />
      <AddAppConnectionModal
        isOpen={popUp.addConnection.isOpen}
        onOpenChange={(isOpen) => {
          localStorage.removeItem("pkiSyncFormData");
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
