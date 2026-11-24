import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@app/components/v3";
import { APP_CONNECTION_MAP, getAppConnectionProviderName } from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { useListAppConnections } from "@app/hooks/api/appConnections/queries";
import { PAM_RECORDING_CONNECTION_APPS } from "@app/hooks/api/pam/constants";

const NONE_VALUE = "__none__";

type Props = {
  value: string | null;
  onChange: (value: string | null) => void;
  isError?: boolean;
  includeNone?: boolean;
  apps?: AppConnection[];
};

export const RecordingConnectionPicker = ({
  value,
  onChange,
  isError,
  includeNone,
  apps = PAM_RECORDING_CONNECTION_APPS
}: Props) => {
  const { data: connections = [], isPending } = useListAppConnections();
  const recordingConnections = connections.filter(
    (connection) => apps.includes(connection.app) && !connection.projectId
  );
  const appNames = apps.map((app) => APP_CONNECTION_MAP[app].name).join(" or ");

  return (
    <Select
      value={value ?? ""}
      onValueChange={(next) => onChange(next === NONE_VALUE ? null : next)}
      disabled={isPending}
    >
      <SelectTrigger className="w-full" isError={isError}>
        <SelectValue placeholder="Select a connection..." />
      </SelectTrigger>
      <SelectContent position="popper">
        {includeNone && <SelectItem value={NONE_VALUE}>None</SelectItem>}
        {recordingConnections.length === 0 && (
          <div className="px-2 py-3 text-center text-xs text-muted">
            No {appNames} connections found. Create one from the App Connections page.
          </div>
        )}
        {recordingConnections.map((connection) => (
          <SelectItem key={connection.id} value={connection.id}>
            {connection.name}{" "}
            <span className="text-muted">({getAppConnectionProviderName(connection)})</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
