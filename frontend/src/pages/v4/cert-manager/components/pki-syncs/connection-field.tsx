import { useState } from "react";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";

import {
  ProjectPermissionAppConnectionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { getPkiSyncConnectionApps, PKI_SYNC_CONNECTION_MAP } from "@app/helpers/pkiSyncs";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { PkiSync as TPkiSyncDestination } from "@app/hooks/api/pkiSyncs/enums";

import { useProjectPermission } from "../../../access/permissions";
import {
  type CreatedConnection,
  useConnectionCreation
} from "../../../components/connection-creation";
import { providerMedia } from "../../../components/provider-label";
import { useV4Adapter } from "../../../data/adapters";
import { startConnectionRedirect } from "../../../data/integrations/connection-redirect";
import { useDraftField, useDraftValue, usePkiSyncDraft } from "./fields";
import { PKI_SYNC_DRAFT_STORAGE_KEY, usePkiSyncScope } from "./shared";

const LDAP_TARGET_FIELDS = [
  "host",
  "port",
  "sslEnabled",
  "sslRejectUnauthorized",
  "sslCertificate"
];

export function PkiSyncConnectionField({ onChange }: { onChange?: () => void }) {
  const { values, setValue } = usePkiSyncDraft();
  const field = useDraftField<{ id: string; name: string; app: AppConnection } | undefined>(
    "connection"
  );
  const { projectId, returnTo } = usePkiSyncScope();
  const { permission, isPending: permissionPending } = useProjectPermission(projectId);
  const destination = useDraftValue<TPkiSyncDestination>("destination");
  const app = PKI_SYNC_CONNECTION_MAP[destination];
  const apps = getPkiSyncConnectionApps(destination);
  const { connections, isPending } = useV4Adapter("pkiSyncs").useAvailableConnections(
    apps,
    projectId
  );
  const [created, setCreated] = useState<CreatedConnection[]>([]);

  const clearLdapTargetFields = (nextApp?: AppConnection) => {
    if (nextApp === AppConnection.LDAP) return;
    LDAP_TARGET_FIELDS.forEach((key) => setValue(`destinationConfig.${key}`, undefined));
  };

  const creation = useConnectionCreation(
    app,
    projectId,
    (connection) => {
      setCreated((current) => [...current, connection]);
      setValue("connection", connection);
      clearLdapTargetFields(connection.app);
      onChange?.();
    },
    returnTo
      ? {
          returnTo,
          projectId,
          start: (href, pending) => {
            sessionStorage.setItem(PKI_SYNC_DRAFT_STORAGE_KEY, JSON.stringify(values));
            startConnectionRedirect(href, pending);
          }
        }
      : undefined
  );

  const options = [
    ...connections,
    ...created.filter((entry) => !connections.some((connection) => connection.id === entry.id))
  ];
  const appNames = apps.map((accepted) => APP_CONNECTION_MAP[accepted].name).join(" or ");
  const label = apps.length > 1 ? "Connection" : `${APP_CONNECTION_MAP[app].name} connection`;
  const canCreate =
    permissionPending ||
    permission.can(
      ProjectPermissionAppConnectionActions.Create,
      ProjectPermissionSub.AppConnections
    );

  return (
    <Field
      label={label}
      help="App connections can also be created from Cert Manager settings."
      description={
        !isPending && !options.length && !canCreate
          ? `You don't have access to any ${appNames} connections. Ask an admin to create one.`
          : undefined
      }
      error={field.error}
    >
      <Combobox
        label={label}
        value={field.value?.id ?? ""}
        loading={isPending}
        placeholder="Select a connection"
        emptyText={`No ${appNames} connections yet.`}
        invalid={Boolean(field.error)}
        options={options.map((connection) => ({
          value: connection.id,
          label: connection.name,
          media: providerMedia("app-connection", connection.app),
          group: apps.length > 1 ? APP_CONNECTION_MAP[connection.app].name : undefined
        }))}
        creation={creation}
        onValueChange={(id) => {
          if (id === field.value?.id) return;
          const next = options.find((connection) => connection.id === id);
          if (!next) return;
          field.onChange({ id: next.id, name: next.name, app: next.app });
          clearLdapTargetFields(next.app);
          onChange?.();
        }}
      />
    </Field>
  );
}
