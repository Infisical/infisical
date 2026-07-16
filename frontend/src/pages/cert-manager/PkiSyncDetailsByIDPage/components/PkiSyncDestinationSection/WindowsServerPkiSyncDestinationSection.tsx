/* eslint-disable jsx-a11y/label-has-associated-control */
import { PkiSyncExportFormat } from "@app/hooks/api/pkiSyncs";
import { TWindowsServerPkiSync } from "@app/hooks/api/pkiSyncs/types/windows-server-sync";

const GenericFieldLabel = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mb-4">
    <p className="text-sm font-medium text-mineshaft-300">{label}</p>
    <div className="text-sm text-mineshaft-300">{children}</div>
  </div>
);

type Props = {
  pkiSync: TWindowsServerPkiSync;
};

export const WindowsServerPkiSyncDestinationSection = ({ pkiSync }: Props) => {
  const exportFormat = pkiSync.syncOptions.exportFormat ?? PkiSyncExportFormat.Pkcs12;

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
