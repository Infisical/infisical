import { useMemo, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { faEdit, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
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
              {selectedCertificates.length === 0 ? (
                <EmptyState title="No certificates selected" icon={faPlus} />
              ) : (
                <div className="max-h-64 overflow-y-auto">
                  <TableContainer>
                    <Table>
                      <THead>
                        <Tr>
                          <Th className="w-2/5">Common Name</Th>
                          <Th className="w-2/5">Serial Number</Th>
                          <Th className="w-1/5">Remove</Th>
                        </Tr>
                      </THead>
                      <TBody>
                        {selectedCertificates.map((cert) => (
                          <Tr key={cert.id}>
                            <Td className="max-w-xs truncate">{cert.commonName}</Td>
                            <Td className="font-mono text-xs text-bunker-300">
                              {cert.serialNumber}
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
                        ))}
                      </TBody>
                    </Table>
                  </TableContainer>
                </div>
              )}
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
