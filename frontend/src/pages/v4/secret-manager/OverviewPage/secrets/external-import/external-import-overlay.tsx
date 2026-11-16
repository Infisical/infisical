import { DopplerImportDialog } from "./doppler-import-dialog";
import type { ExternalImportConnections, ExternalImportSource } from "./external-import";
import { VaultImportSheet } from "./vault-import-sheet";

export function ExternalImportOverlay({
  source,
  connections,
  projectId,
  environment,
  path,
  onClose
}: {
  source?: ExternalImportSource;
  connections: ExternalImportConnections;
  projectId: string;
  environment: { value: string; label: string };
  path: string;
  onClose: () => void;
}) {
  if (source === "vault")
    return (
      <VaultImportSheet
        connections={connections.vault}
        projectId={projectId}
        environment={environment}
        path={path}
        onClose={onClose}
      />
    );
  if (source === "doppler")
    return (
      <DopplerImportDialog
        connections={connections.doppler}
        projectId={projectId}
        environment={environment}
        path={path}
        onClose={onClose}
      />
    );
  return null;
}
