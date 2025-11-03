import { useFormContext } from "react-hook-form";

import {
  GenericFieldLabel,
  Table,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { useProject } from "@app/context";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { useListWorkspaceCertificates } from "@app/hooks/api/projects";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";

export const PkiSyncReviewFields = () => {
  const { watch } = useFormContext<TPkiSyncForm>();
  const { currentProject } = useProject();

  const { data } = useListWorkspaceCertificates({
    projectId: currentProject?.id || "",
    offset: 0,
    limit: 100
  });

  const certificates = data?.certificates || [];

  const getSelectedCertificates = (certificateIds?: string[]) => {
    if (!certificateIds || certificateIds.length === 0) return [];
    return certificates.filter((cert) => certificateIds.includes(cert.id));
  };

  const {
    name,
    description,
    connection,
    certificateIds,
    syncOptions,
    destination,
    destinationConfig,
    isAutoSyncEnabled
  } = watch();

  const destinationName = PKI_SYNC_MAP[destination].name;
  const selectedCertificates = getSelectedCertificates(certificateIds);

  return (
    <div className="mb-4 flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-mineshaft-600">
          <span className="text-sm text-mineshaft-300">Certificates</span>
        </div>
        <div className="w-full">
          {selectedCertificates.length === 0 ? (
            <span className="text-bunker-400">No certificates selected</span>
          ) : (
            <TableContainer>
              <Table>
                <THead>
                  <Tr>
                    <Th className="w-1/2">SAN / CN</Th>
                    <Th className="w-1/4">Serial Number</Th>
                    <Th className="w-1/4">Expires At</Th>
                  </Tr>
                </THead>
                <TBody>
                  {selectedCertificates.map((cert) => {
                    let originalDisplayName = "—";
                    if (cert.altNames && cert.altNames.trim()) {
                      originalDisplayName = cert.altNames.trim();
                    } else if (cert.commonName && cert.commonName.trim()) {
                      originalDisplayName = cert.commonName.trim();
                    }

                    let displayName = originalDisplayName;
                    let isTruncated = false;
                    if (originalDisplayName.length > 34) {
                      displayName = `${originalDisplayName.substring(0, 34)}...`;
                      isTruncated = true;
                    }

                    const truncatedSerial =
                      cert.serialNumber.length > 8
                        ? `${cert.serialNumber.slice(0, 4)}...${cert.serialNumber.slice(-4)}`
                        : cert.serialNumber;

                    return (
                      <Tr key={cert.id}>
                        <Td className="max-w-0">
                          {isTruncated ? (
                            <Tooltip content={originalDisplayName} className="max-w-lg">
                              <div className="truncate">{displayName}</div>
                            </Tooltip>
                          ) : (
                            <div className="truncate">{displayName}</div>
                          )}
                        </Td>
                        <Td className="max-w-0">
                          <div
                            className="font-mono text-xs text-bunker-300"
                            title={cert.serialNumber}
                          >
                            {truncatedSerial}
                          </div>
                        </Td>
                        <Td className="max-w-0">
                          <span className="text-sm text-bunker-300">
                            {new Date(cert.notAfter).toLocaleDateString()}
                          </span>
                        </Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
            </TableContainer>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-mineshaft-600">
          <span className="text-sm text-mineshaft-300">Destination</span>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <GenericFieldLabel label="Connection">{connection?.name}</GenericFieldLabel>
          <GenericFieldLabel label="Service">{destinationName}</GenericFieldLabel>
          {destinationConfig && "vaultBaseUrl" in destinationConfig && (
            <GenericFieldLabel label="Vault URL">
              {destinationConfig.vaultBaseUrl}
            </GenericFieldLabel>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-mineshaft-600">
          <span className="text-sm text-mineshaft-300">Sync Options</span>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <GenericFieldLabel label="Auto-Sync">
            <div className="mt-1">
              <Badge variant={isAutoSyncEnabled ? "success" : "danger"}>
                {isAutoSyncEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
          </GenericFieldLabel>
          {/* Hidden for now - Import certificates functionality disabled
          {syncOptions?.canImportCertificates !== undefined && (
            <GenericFieldLabel label="Import Certificates">
              <Badge variant={syncOptions.canImportCertificates ? "success" : "danger"}>
                {syncOptions.canImportCertificates ? "Enabled" : "Disabled"}
              </Badge>
            </GenericFieldLabel>
          )}
          */}
          {syncOptions?.canRemoveCertificates !== undefined && (
            <GenericFieldLabel label="Remove Certificates">
              <div className="mt-1">
                <Badge variant={syncOptions.canRemoveCertificates ? "success" : "danger"}>
                  {syncOptions.canRemoveCertificates ? "Enabled" : "Disabled"}
                </Badge>
              </div>
            </GenericFieldLabel>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-mineshaft-600">
          <span className="text-sm text-mineshaft-300">Details</span>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <GenericFieldLabel label="Name">{name}</GenericFieldLabel>
          <GenericFieldLabel label="Description">{description}</GenericFieldLabel>
        </div>
      </div>
    </div>
  );
};
