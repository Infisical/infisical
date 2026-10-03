import { useState } from "react";
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
import { getPkiSyncConnectionApps, PKI_SYNC_CONNECTION_MAP } from "@app/helpers/pkiSyncs";
import { usePopUp } from "@app/hooks";
import { useListAvailableAppConnectionsForApps } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { AddAppConnectionModal } from "@app/pages/organization/AppConnections/AppConnectionsPage/components";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";

type Props = {
  onChange?: VoidFunction;
};

const LDAP_TARGET_FIELDS = [
  "host",
  "port",
  "sslEnabled",
  "sslRejectUnauthorized",
  "sslCertificate"
] as const;

export const PkiSyncConnectionField = ({ onChange: callback }: Props) => {
  const { permission } = useProjectPermission();
  const { control, watch, setValue } = useFormContext<TPkiSyncForm>();

  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp(["addConnection"] as const);
  const [appToCreate, setAppToCreate] = useState<AppConnection | null>(null);

  const destination = watch("destination");
  const app = PKI_SYNC_CONNECTION_MAP[destination];
  const apps = getPkiSyncConnectionApps(destination);

  const clearLdapTargetFields = (nextApp?: AppConnection) => {
    if (nextApp === AppConnection.LDAP) return;
    LDAP_TARGET_FIELDS.forEach((field) =>
      setValue(`destinationConfig.${field}` as never, undefined as never, { shouldDirty: true })
    );
  };

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

  const { connections: availableConnections, isPending } = useListAvailableAppConnectionsForApps(
    apps,
    currentProject.id
  );

  const connectionLabel =
    apps.length > 1 ? "Connection" : `${APP_CONNECTION_MAP[app].name} Connection`;

  const canCreateConnection = permission.can(
    ProjectPermissionAppConnectionActions.Create,
    ProjectPermissionSub.AppConnections
  );

  const appNames = apps.map((accepted) => APP_CONNECTION_MAP[accepted].name).join(" or ");

  return (
    <>
      <Controller
        control={control}
        name="connection"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>
              {connectionLabel}
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
                const selected = newValue as SingleValue<{
                  id: string;
                  name: string;
                  app?: AppConnection;
                }>;
                if (selected?.id?.startsWith("_create")) {
                  setAppToCreate(selected.app ?? app);
                  handlePopUpOpen("addConnection");
                  onChange(null);
                  const formData = { ...watch(), returnUrl: getPkiSyncReturnUrl() };
                  localStorage.setItem("pkiSyncFormData", JSON.stringify(formData));
                  if (callback) callback();
                  return;
                }

                onChange(newValue);
                clearLdapTargetFields((newValue as SingleValue<{ app?: AppConnection }>)?.app);
                if (callback) callback();
              }}
              isLoading={isPending}
              options={[
                ...(canCreateConnection
                  ? apps.map((creatable) => ({
                      id: `_create:${creatable}`,
                      name: `Create ${APP_CONNECTION_MAP[creatable].name} Connection`,
                      app: creatable
                    }))
                  : []),
                ...availableConnections
              ]}
              groupBy={apps.length > 1 ? "app" : null}
              getGroupHeaderLabel={(groupApp: AppConnection) => APP_CONNECTION_MAP[groupApp].name}
              placeholder="Select connection..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
              components={{ Option: AppConnectionOption }}
              isError={Boolean(error)}
            />
            {!isPending && !availableConnections.length && !canCreateConnection ? (
              <FieldDescription className="text-warning">
                You do not have access to any {appNames} Connections. Contact an admin to create
                one.
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
        app={appToCreate ?? app}
        onComplete={(connection) => {
          if (connection) {
            setValue("connection", connection);
            clearLdapTargetFields(connection.app);
          }
        }}
      />
    </>
  );
};
