import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { PkiSyncExportFormat } from "@app/hooks/api/pkiSyncs";
import { TWindowsServerPkiSync } from "@app/hooks/api/pkiSyncs/types/windows-server-sync";

type Props = {
  pkiSync: TWindowsServerPkiSync;
};

export const WindowsServerPkiSyncDestinationSection = ({ pkiSync }: Props) => {
  const exportFormat = pkiSync.syncOptions.exportFormat ?? PkiSyncExportFormat.Pkcs12;

  return (
    <>
      {pkiSync.destinationConfig.host && (
        <Detail>
          <DetailLabel>Target Host</DetailLabel>
          <DetailValue>
            {pkiSync.destinationConfig.host}
            {pkiSync.destinationConfig.port ? `:${pkiSync.destinationConfig.port}` : ""}
          </DetailValue>
        </Detail>
      )}
      {pkiSync.destinationConfig.sslEnabled && (
        <Detail>
          <DetailLabel>WinRM Transport</DetailLabel>
          <DetailValue>HTTPS</DetailValue>
        </Detail>
      )}
      <Detail>
        <DetailLabel>Destination Directory</DetailLabel>
        <DetailValue>{pkiSync.destinationConfig.destinationPath}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Export Format</DetailLabel>
        <DetailValue>
          {exportFormat === PkiSyncExportFormat.Pkcs12 ? "PKCS#12 (.pfx)" : "PEM"}
        </DetailValue>
      </Detail>
    </>
  );
};
