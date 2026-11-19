import { Controller, useFormContext } from "react-hook-form";
import { useRouterState } from "@tanstack/react-router";
import { Info } from "lucide-react";

import {
  AppConnectionOptionContent,
  useAppConnectionCreation
} from "@app/components/app-connections";
import {
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
import { getPkiSyncConnectionApps, PKI_SYNC_CONNECTION_MAP } from "@app/helpers/pkiSyncs";
import {
  TAvailableAppConnection,
  useListAvailableAppConnectionsForApps
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { ApplicationTab } from "@app/pages/cert-manager/ApplicationDetailsByIDPage/application-tabs";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";

type Props = {
  onChange?: VoidFunction;
};

type TConnectionOption = Partial<TAvailableAppConnection> &
  Pick<TAvailableAppConnection, "id" | "name"> & { app?: AppConnection };

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
    if (pathname.includes("/cert-manager/applications/")) {
      return `${pathname}?selectedTab=${ApplicationTab.Syncs}`;
    }
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

  const creation = useAppConnectionCreation<TConnectionOption>({
    apps,
    onCreated: (connection) => {
      setValue("connection", connection, { shouldDirty: true });
      clearLdapTargetFields(connection.app);
      if (callback) callback();
    },
    onOpen: () =>
      localStorage.setItem(
        "pkiSyncFormData",
        JSON.stringify({ ...watch(), returnUrl: getPkiSyncReturnUrl() })
      ),
    onClose: () => localStorage.removeItem("pkiSyncFormData")
  });

  return (
    <Controller
      control={control}
      name="connection"
      render={({ field: { value, onChange, ref }, fieldState: { error } }) => (
        <Field className="mb-4">
          <FieldLabel htmlFor="pki-sync-connection">
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
          <Combobox<TConnectionOption>
            id="pki-sync-connection"
            ref={ref}
            value={availableConnections.find((option) => option.id === value?.id) ?? value ?? null}
            onValueChange={(newValue) => {
              onChange(newValue);
              clearLdapTargetFields(newValue.app);
              if (callback) callback();
            }}
            isClearable={false}
            isLoading={isPending}
            options={availableConnections}
            getOptionGroup={
              apps.length > 1 ? (option) => APP_CONNECTION_MAP[option.app ?? app].name : undefined
            }
            getOptionKeywords={(option) => [option.id]}
            placeholder="Select connection..."
            getOptionLabel={(option) => option.name}
            getOptionValue={(option) => option.id}
            renderOption={(option) => <AppConnectionOptionContent data={option} />}
            creation={creation}
            isError={Boolean(error)}
          />
          {!isPending && !availableConnections.length && !canCreateConnection ? (
            <FieldDescription className="text-warning">
              You do not have access to any {appNames} Connections. Contact an admin to create one.
            </FieldDescription>
          ) : (
            <FieldError errors={[error]} />
          )}
        </Field>
      )}
    />
  );
};
