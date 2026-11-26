import { Combobox, type ComboboxProps } from "@infisical/cipher/ui/combobox";

type SingleComboboxProps = Omit<
  Extract<ComboboxProps, { multiple?: false }>,
  "options" | "multiple"
>;

type Connection = { id: string; name: string; projectId?: string | null };

export const connectionOptions = (connections: readonly Connection[]) =>
  connections.map((connection) => ({
    value: connection.id,
    label: connection.name,
    meta: connection.projectId ? undefined : "Organization"
  }));

export const ConnectionCombobox = ({
  connections,
  ...props
}: SingleComboboxProps & {
  connections: readonly Connection[];
}) => <Combobox {...props} options={connectionOptions(connections)} />;
