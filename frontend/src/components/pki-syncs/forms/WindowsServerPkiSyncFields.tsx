import { DestinationPathField } from "./DestinationPathField";

export const WindowsServerPkiSyncFields = () => (
  <DestinationPathField
    label="Destination Directory"
    tooltip="The absolute Windows path to the directory where certificate files are written (for example C:\certs). It is created if it does not exist."
    placeholder="C:\certs"
  />
);
