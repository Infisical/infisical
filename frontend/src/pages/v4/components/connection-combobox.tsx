import { Combobox, type ComboboxProps } from "@infisical/cipher/ui/combobox";

import type { AppConnection } from "@app/hooks/api/appConnections/enums";

import { providerMedia } from "./provider-label";

type SingleComboboxProps = Omit<
  Extract<ComboboxProps, { multiple?: false }>,
  "options" | "multiple"
>;

type Connection = { id: string; name: string; projectId?: string | null };

export const connectionOptions = (connections: readonly Connection[], app: AppConnection) =>
  connections.map((connection) => ({
    value: connection.id,
    label: connection.name,
    meta: connection.projectId ? undefined : "Organization",
    media: providerMedia("app-connection", app)
  }));

export const ConnectionCombobox = ({
  connections,
  app,
  ...props
}: SingleComboboxProps & {
  connections: readonly Connection[];
  app: AppConnection;
}) => <Combobox {...props} options={connectionOptions(connections, app)} />;
