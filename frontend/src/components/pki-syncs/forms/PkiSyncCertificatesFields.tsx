import { useMemo, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { faCertificate, faEdit, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Button,
  EmptyState,
  FormControl,
  Table,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { useProject } from "@app/context";
import { CertStatus } from "@app/hooks/api";
import { useListWorkspaceCertificates } from "@app/hooks/api/projects";

import { CertificateManagementModal } from "../CertificateManagementModal";
import { TPkiSyncForm } from "./schemas/pki-sync-schema";

export const PkiSyncCertificatesFields = () => {
  const { control, watch, setValue } = useFormContext<TPkiSyncForm>();
  const { currentProject } = useProject();
  const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);

  const certificateIds = watch("certificateIds") || [];

  const { data, isLoading } = useListWorkspaceCertificates({
    projectId: currentProject?.id || "",
    offset: 0,
    limit: 100,
    forPkiSync: true
  });

  const certificates = data?.certificates || [];

  const activeCertificates = useMemo(
    () => certificates.filter((cert) => cert.status === CertStatus.ACTIVE),
    [certificates]
  );

  const selectedCertificates = useMemo(
    () => activeCertificates.filter((cert) => certificateIds.includes(cert.id)),
    [activeCertificates, certificateIds]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-bunker-300">Loading certificates...</div>
      </div>
    );
  }

  return (
    <>
      <p className="mb-4 text-sm text-bunker-300">
        Select certificates to sync with this integration. Only active certificates can be synced.
        You can modify this selection after creating the sync.
      </p>

      <Controller
        control={control}
        name="certificateIds"
        render={({ field: { value = [], onChange }, fieldState: { error } }) => (
          <FormControl isError={Boolean(error)} errorText={error?.message}>
            <div className="space-y-4">
              <Button
                variant="outline_bg"
                leftIcon={<FontAwesomeIcon icon={faEdit} />}
                onClick={() => setIsSelectionModalOpen(true)}
              >
                Add Certificates
              </Button>
              <div className="max-h-64 overflow-y-auto">
                <TableContainer>
                  <Table>
                    <THead>
                      <Tr>
                        <Th className="w-1/3">SAN / CN</Th>
                        <Th className="w-1/4">Serial Number</Th>
                        <Th className="w-1/6">Issued At</Th>
                        <Th className="w-1/6">Expires At</Th>
                        <Th className="w-12">Remove</Th>
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

                        const isExpired = new Date(cert.notAfter) < new Date();

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
                                {new Date(cert.notBefore).toLocaleDateString()}
                              </span>
                            </Td>
                            <Td className="max-w-0">
                              <span
                                className={`text-sm ${isExpired ? "text-red-400" : "text-bunker-300"}`}
                              >
                                {new Date(cert.notAfter).toLocaleDateString()}
                              </span>
                            </Td>
                            <Td>
                              <Button
                                size="xs"
                                variant="plain"
                                colorSchema="secondary"
                                className="pl-5"
                                aria-label="Remove certificate"
                                onClick={() => {
                                  const newIds = value.filter((id: string) => id !== cert.id);
                                  onChange(newIds);
                                }}
                              >
                                <FontAwesomeIcon icon={faTrash} />
                              </Button>
                            </Td>
                          </Tr>
                        );
                      })}
                    </TBody>
                  </Table>
                  {selectedCertificates.length === 0 && (
                    <EmptyState title="No certificates selected" icon={faCertificate} />
                  )}
                </TableContainer>
              </div>
            </div>
          </FormControl>
        )}
      />

      <CertificateManagementModal
        isOpen={isSelectionModalOpen}
        onClose={() => setIsSelectionModalOpen(false)}
        selectedCertificateIds={certificateIds}
        onCertificateSelectionChange={(newCertificateIds) => {
          setValue("certificateIds", newCertificateIds);
        }}
        title="Select Certificates for Sync"
        subtitle="Choose which certificates you want to include in this sync. You can modify this selection after creating the sync."
        saveButtonText="Update Selection"
      />
    </>
  );
};
