import { DestinationPathField } from "./DestinationPathField";

export const LinuxServerPkiSyncFields = () => (
  <DestinationPathField
    label="Destination Directory"
    tooltip="The absolute path to the directory on the server where certificate files are written. The directory must already exist."
    placeholder="/etc/ssl/certs"
  />
);
