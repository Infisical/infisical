/* eslint-disable jsx-a11y/label-has-associated-control */
import { PkiSyncExportFormat } from "@app/hooks/api/pkiSyncs";
import { TLinuxServerPkiSync } from "@app/hooks/api/pkiSyncs/types/linux-server-sync";

const GenericFieldLabel = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mb-4">
    <p className="text-sm font-medium text-mineshaft-300">{label}</p>
    <div className="text-sm text-mineshaft-300">{children}</div>
  </div>
);

type Props = {
  pkiSync: TLinuxServerPkiSync;
};

export const LinuxServerPkiSyncDestinationSection = ({ pkiSync }: Props) => {
  const exportFormat = pkiSync.syncOptions.exportFormat ?? PkiSyncExportFormat.Pem;

  return (
    <>
      <GenericFieldLabel label="Destination Directory">
        {pkiSync.destinationConfig.destinationPath}
      </GenericFieldLabel>
      <GenericFieldLabel label="Export Format">
        {exportFormat === PkiSyncExportFormat.Pkcs12 ? "PKCS#12 (.pfx)" : "PEM"}
      </GenericFieldLabel>
    </>
  );
};
